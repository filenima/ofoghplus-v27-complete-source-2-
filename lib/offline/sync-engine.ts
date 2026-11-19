/**
 * ============ lib/offline/sync-engine.ts ============
 * R24-5 — موتور همگام‌سازی صف آفلاین (بازپخش outbox)
 * ============================================================================
 * محرک‌ها:
 *  - رویداد 'online' مرورگر
 *  - پیام FORCE_SYNC سرویس‌ورکر (Background Sync tag «ofogh-invoice-sync»
 *    و تگ قدیمی «hoosh-bg-sync» — هر دو به همین موتور و موتور قدیمی می‌رسند)
 *  - فراخوانی دستی syncOutbox() (کلیک روی بج وضعیت)
 *
 * سیاست‌ها (data-safety):
 *  - آیتم outbox فقط با پاسخ 2xx سرور حذف می‌شود («هرگز بدون تایید حذف نکن»)
 *  - 2xx → پیش‌نویس 'synced' + serverId/serverNumber + رویداد موفقیت
 *  - 409 → پیش‌نویس 'conflict' برای بررسی دستی (payload محلی حفظ می‌شود)؛
 *    آیتم از صف خارج می‌شود چون تلاش دوباره قطعاً 409 می‌دهد — دادهٔ
 *    کاربر در پیش‌نویس محلی «زنده» است و با retryOfflineInvoice دوباره صف می‌شود
 *  - 401 → نشست منقضی؛ همهٔ آیتم‌ها در صف می‌مانند تا ورود دوباره
 *  - 4xx دیگر → پیش‌نویس 'failed' با متن خطا برای بررسی دستی
 *  - 5xx / خطای شبکه → آیتم در صف می‌ماند + backoff
 *
 * بازپخش با fetch «وصله‌نشده» (getOrigFetch از lib/offline-fetch) انجام
 * می‌شود تا اگر وسط تخلیه اینترنت قطع شد، interceptor همان آیتم را دوباره
 * صف نکند (حلقهٔ بی‌نهایت).
 */

import { getOrigFetch } from "@/lib/offline-fetch";
import type { OfflineInvoiceDraft, OutboxItem } from "./pure";
import { applyLastWriteWins, classifySyncStatus, isEligibleForRetry } from "./pure";
import {
  markSynced as markOutboxSynced,
  takeOutboxAll,
  updateOutboxItem,
} from "./idb";
import { OUTBOX_CHANGED_EVENT, updateDraftStatus } from "./invoice-offline";

const BACKOFF_MS = 30 * 1000; // حداقل فاصلهٔ دو تلاش جریمه‌شوندهٔ پیاپی

export interface SyncEngineResult {
  ok: boolean;
  sent: number; // 2xx
  conflicts: number; // 409
  failed: number; // 4xx قطعی + 5xx/شبکه که در صف ماندند
  /** R26 — نوشتن‌های منسوخ‌شده با Last-Write-Wins (هم‌URL، قدیمی‌تر) */
  superseded: number;
  authExpired: boolean;
}

/* ─── رویدادهای سراسری برای UI (بج/بنر/لیست‌ها) ─── */

export const OFFLINE_EVENTS = {
  outboxChanged: OUTBOX_CHANGED_EVENT,
  syncDone: "ofogh:sync-done",
  syncStart: "ofogh:sync-start",
} as const;

function dispatch(name: string, detail?: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    /* ignore */
  }
}

/* ─── توکن احراز هویت (همان کلیدهای auth-fetch/use-offline-sync) ─── */

function readToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return (
      localStorage.getItem("hoshhesab_user_token") ||
      localStorage.getItem("hoshhesab_admin_token") ||
      null
    );
  } catch {
    return null;
  }
}

/** استخراج پیام فارسی خطا از بدنهٔ پاسخ سرور (اگر JSON باشد) */
async function readErrorMessage(res: Response): Promise<string> {
  try {
    const json = await res.clone().json();
    return String(json?.error || json?.message || `HTTP ${res.status}`);
  } catch {
    return `HTTP ${res.status}`;
  }
}

/* ─── singleton تخلیهٔ صف — چند فراخوان همزمان فقط یک تخلیه می‌کنند ─── */

let flushInFlight: Promise<SyncEngineResult> | null = null;

export async function syncOutbox(): Promise<SyncEngineResult> {
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async (): Promise<SyncEngineResult> => {
    const result: SyncEngineResult = { ok: true, sent: 0, conflicts: 0, failed: 0, superseded: 0, authExpired: false };
    if (typeof navigator !== "undefined" && !navigator.onLine) return result;

    const token = readToken();
    const replayFetch = getOrigFetch();
    let items: OutboxItem[] = await takeOutboxAll();
    if (items.length === 0) return result;

    // R26 — Last-Write-Wins بین نوشتن‌های صف‌شده روی «یک منبع» (PUT/PATCH/DELETE
    // هم‌URL بدون draftLocalId): فقط جدیدترین بازپخش می‌شود؛ قدیمی‌ها منسوخ‌اند
    // و بی‌صدا از صف خارج می‌شوند تا روی دادهٔ تازه‌تر بازنویسی نکنند.
    try {
      const lww = applyLastWriteWins(items);
      if (lww.superseded.length > 0) {
        result.superseded = lww.superseded.length;
        for (const old of lww.superseded) {
          if (old.id !== undefined) await markOutboxSynced(old.id);
        }
        items = lww.replay;
      }
    } catch {
      /* LWW شکست خورد — بازپخش کامل صف، بدون حذف چیزی */
    }
    if (items.length === 0) {
      dispatch(OFFLINE_EVENTS.syncDone, { ...result });
      dispatch(OFFLINE_EVENTS.outboxChanged);
      return result;
    }

    dispatch(OFFLINE_EVENTS.syncStart, { count: items.length });

    let saw401 = false;
    let serverInvoiceTouched = false;

    for (const item of items) {
      if (saw401) {
        result.failed++;
        continue;
      }
      if (!isEligibleForRetry(item, Date.now(), BACKOFF_MS)) {
        result.failed++;
        continue;
      }

      try {
        const res = await replayFetch(item.url, {
          method: item.method,
          headers: {
            ...(item.contentType ? { "Content-Type": item.contentType } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "Idempotency-Key": item.idempotencyKey,
          },
          body: item.body,
        });

        const outcome = classifySyncStatus(res.status);

        if (outcome === "success") {
          // تایید سرور → حذف از صف + پیش‌نویس synced (شمارهٔ واقعی)
          if (item.id !== undefined) await markOutboxSynced(item.id);
          result.sent++;
          serverInvoiceTouched = true;
          if (item.draftLocalId) {
            let serverId: string | null = null;
            let serverNumber: string | null = null;
            try {
              const json = await res.clone().json();
              serverId = json?.data?.id ? String(json.data.id) : null;
              serverNumber = json?.data?.number ? String(json.data.number) : null;
            } catch {
              /* بدنهٔ JSON نبود — بدون شناسهٔ سرور هم synced درست است */
            }
            await updateDraftStatus(item.draftLocalId, {
              status: "synced",
              syncedAt: Date.now(),
              serverId,
              serverNumber,
              error: null,
            });
          }
          continue;
        }

        if (outcome === "auth") {
          // نشست منقضی — آیتم می‌ماند؛ ادامهٔ حلقه بی‌فایده است
          saw401 = true;
          result.failed++;
          result.ok = false;
          continue;
        }

        if (outcome === "conflict") {
          // 409 — تعارض قطعی: آیتم از صف خارج، پیش‌نویس 'conflict' برای
          // بررسی دستی (دادهٔ کاربر هرگز بی‌صدا حذف نمی‌شود)
          if (item.id !== undefined) await markOutboxSynced(item.id);
          result.conflicts++;
          if (item.draftLocalId) {
            await updateDraftStatus(item.draftLocalId, {
              status: "conflict",
              error: await readErrorMessage(res),
            });
          }
          continue;
        }

        if (outcome === "client-error") {
          // 4xx قطعی دیگر — پیش‌نویس 'failed' با متن خطا؛ آیتم از صف خارج
          const message = await readErrorMessage(res);
          if (item.id !== undefined) await markOutboxSynced(item.id);
          result.failed++;
          if (item.draftLocalId) {
            await updateDraftStatus(item.draftLocalId, { status: "failed", error: message });
          }
          continue;
        }

        // 5xx / موقت — در صف می‌ماند + جریمهٔ backoff
        if (item.id !== undefined) {
          await updateOutboxItem({
            ...item,
            attempts: (item.attempts ?? 0) + 1,
            lastError: `HTTP ${res.status}`,
            lastAttemptAt: Date.now(),
          });
        }
        result.failed++;
        result.ok = false;
      } catch {
        // خطای شبکه — هنوز آنلاین نیستیم؛ آیتم دست‌نخورده در صف می‌ماند
        result.failed++;
        result.ok = false;
      }
    }

    // اطلاع‌رسانی به UIها (بج، بنر، لیست فاکتورها)
    dispatch(OFFLINE_EVENTS.syncDone, { ...result });
    dispatch(OFFLINE_EVENTS.outboxChanged);

    if (serverInvoiceTouched) {
      // لیست فاکتورها/داشبورد خودشان را تازه کنند + کش API سرویس‌ورکر باطل شود
      try {
        window.dispatchEvent(new CustomEvent("hoshhesab:invoices-changed"));
        window.dispatchEvent(new CustomEvent("hoosh:sync-flush", { detail: { sent: result.sent } }));
        if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage("hoosh-clear-api-cache");
        }
      } catch {
        /* ignore */
      }
    }

    // R26 — یک توست واحدِ «همگام‌سازی آفلاین انجام شد»: هر بار که «چیزی»
    // واقعاً به سرور رسید (فاکتور یا هر موتاسیون دیگری از apiFetch) نتیجه
    // به SW برمی‌گردد تا sw-register توست بدهد. آیتم‌های ناموفق در صف می‌مانند.
    if (result.sent > 0 && "serviceWorker" in navigator && navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: "SYNC_FLUSH_RESULT",
          sent: result.sent,
          failed: result.failed + result.conflicts,
        });
      } catch {
        /* ignore */
      }
    }

    return { ...result, authExpired: saw401 };
  })();

  try {
    return await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

/* ─── ثبت Background Sync — تا مرورگر خودش هنگام بازگشت شبکه بیدارش کند ─── */

export async function registerInvoiceBgSync(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const withSync = reg as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    if (withSync.sync) {
      await withSync.sync.register("ofogh-invoice-sync");
    }
  } catch {
    /* مرورگر بدون Background Sync (Firefox/Safari) — flush با رویداد online */
  }
}

/** راه‌اندازی موتور — یک‌بار در عمر اپ (app-providers) خوانده می‌شود */
export function installSyncEngine(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onOnline = () => {
    void syncOutbox();
    void registerInvoiceBgSync();
  };
  window.addEventListener("online", onOnline);

  // پیام FORCE_SYNC از SW (هر دو تگ bg-sync) → تخلیهٔ صف
  const onSwMessage = (event: MessageEvent) => {
    if (event.data?.type === "FORCE_SYNC") void syncOutbox();
  };
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", onSwMessage);
  }

  // بعد از صف‌شدن آیتم جدید، اگر همین حالا آنلاینیم (مثلاً شبکهٔ ناپایدار)
  // بلافاصله تلاش کن + Background Sync را رزرو کن
  const onQueued = () => {
    void registerInvoiceBgSync();
    if (navigator.onLine) void syncOutbox();
  };
  window.addEventListener(OFFLINE_EVENTS.outboxChanged, onQueued);

  // تلاش اولیه در باز شدن صفحه (صف مانده از دفعهٔ قبل)
  if (navigator.onLine) void syncOutbox();

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener(OFFLINE_EVENTS.outboxChanged, onQueued);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.removeEventListener("message", onSwMessage);
    }
  };
}

export type { OfflineInvoiceDraft };
