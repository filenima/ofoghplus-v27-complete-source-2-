/**
 * ============ lib/offline/invoice-offline.ts ============
 * R24-5 — ثبت فاکتور در حالت آفلاین + کش آفلاین کاتالوگ (کالا/طرف‌حساب)
 * ============================================================================
 * جریان «فاکتور زدن بدون اینترنت» (درخواست مالک):
 *  ۱) کاربر آفلاین دکمهٔ ثبت را می‌زند → فرم (navigator.onLine === false)
 *     مسیر createInvoiceOffline را می‌رود — بدون حتی یک تلاش شبکه.
 *  ۲) پیش‌نویس با شمارهٔ محلی «OFF- + timestamp» و وضعیت 'offline-draft'
 *     در IndexedDB ذخیره می‌شود + موتاسیون POST /api/invoices در 'outbox'.
 *  ۳) لیست فاکتورها پیش‌نویس را با نشان «در صف همگام‌سازی» صدر لیست نشان می‌دهد.
 *  ۴) با بازگشت اینترنت، sync-engine صف را به‌ترتیب بازپخش می‌کند؛
 *     2xx → پیش‌نویس synced (شمارهٔ واقعی سرور)؛ 409 → 'conflict' برای
 *     بررسی دستی؛ هیچ‌وقت دادهٔ کاربر بی‌تایید سرور حذف نمی‌شود.
 *
 * کش کاتالوگ: پس از هر fetch موفق فرم فاکتور، کالاها/طرف‌حساب‌ها در
 * 'products-cache'/'parties-cache' ذخیره می‌شوند تا فرمِ آفلاین هم
 * انتخاب کالا/طرف‌حساب داشته باشد.
 */

import type { OfflineInvoiceDraft, OutboxItem } from "./pure";
import { buildOfflineInvoiceNumber, makeOutboxItem } from "./pure";
import {
  STORE_PARTIES,
  STORE_PRODUCTS,
  addToOutbox,
  countOutbox,
  deleteDraft,
  getAllDrafts,
  getCatalog,
  getDraft,
  getMeta,
  putCatalog,
  putDraft,
  setMeta,
} from "./idb";

/** رویداد «صف تغییر کرد» — بج وضعیت و موتور sync گوش می‌دهند */
export const OUTBOX_CHANGED_EVENT = "ofogh:outbox-changed";

function notifyOutboxChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(OUTBOX_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

/* ══════════════ ثبت فاکتور آفلاین ══════════════ */

/** نتیجهٔ ثبت آفلاین — به فرم برمی‌گردد تا توست درست را نشان دهد */
export interface OfflineInvoiceResult {
  ok: boolean;
  /** شمارهٔ محلی فاکتور — OFF-… */
  number: string;
  localId: string;
  error?: string;
}

function localUid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `loc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * ثبت فاکتور به‌صورت آفلاین — بدون هیچ تماس شبکه:
 *  - پیش‌نویس با شمارهٔ محلی OFF-<timestamp> و status 'offline-draft'
 *  - موتاسیون POST /api/invoices در صف outbox (با کلید ایدمپوتنت)
 * payload دقیقاً همان چیزی است که به سرور آنلاین POST می‌شد — بازپخش
 * بعدی هیچ تغییری در داده ندارد.
 */
export async function createInvoiceOffline(
  payload: Record<string, unknown>,
  display: { partyName?: string | null; totalIrr?: number; date?: string; type?: string } = {}
): Promise<OfflineInvoiceResult> {
  try {
    const now = Date.now();
    const localId = localUid();
    const number = buildOfflineInvoiceNumber(now);

    const draft: OfflineInvoiceDraft = {
      localId,
      number,
      status: "offline-draft",
      payload,
      partyName: display.partyName ?? null,
      totalIrr: Math.round(display.totalIrr ?? 0),
      date: display.date || new Date().toISOString().slice(0, 10),
      type: String(display.type ?? (payload.type as string) ?? "SALE"),
      createdAt: now,
      syncedAt: null,
      serverId: null,
      serverNumber: null,
      error: null,
    };

    // ۱) پیش‌نویس محلی — منبع حقیقت تا تایید سرور
    await putDraft(draft);

    // ۲) موتاسیون در صف بازپخش
    await addToOutbox(
      makeOutboxItem({
        url: "/api/invoices",
        method: "POST",
        body: payload,
        contentType: "application/json",
        draftLocalId: localId,
        at: now,
      })
    );

    // ۳) اطلاع‌رسانی فوری به بج وضعیت و موتور sync (بدون حلقه — dispatch
    // فقط رویداد می‌فرستد؛ شنوندهٔ sync-engine با گارد singleton از
    // بازپخش تکراری جلوگیری می‌کند)
    notifyOutboxChanged();

    return { ok: true, number, localId };
  } catch (err) {
    return {
      ok: false,
      number: "",
      localId: "",
      error: err instanceof Error ? err.message : "خطا در ذخیرهٔ آفلاین فاکتور",
    };
  }
}

/* ══════════════ پیش‌نویس‌ها — خواندن/وضعیت ══════════════ */

/** همهٔ پیش‌نویس‌های فعال (synced های تازه هم می‌آیند تا UI تازه شود) */
export async function listOfflineInvoices(): Promise<OfflineInvoiceDraft[]> {
  return getAllDrafts();
}

/** پیش‌نویس‌های در انتظار/مشکل‌دار — برای شمارندهٔ بج و لیست آفلاین */
export async function listUnsyncedDrafts(): Promise<OfflineInvoiceDraft[]> {
  const all = await getAllDrafts();
  return all.filter((d) => d.status !== "synced");
}

export async function getOfflineInvoice(localId: string): Promise<OfflineInvoiceDraft | null> {
  return getDraft(localId);
}

/** به‌روزرسانی وضعیت پیش‌نویس (توسط sync-engine) */
export async function updateDraftStatus(
  localId: string,
  patch: Partial<Pick<OfflineInvoiceDraft, "status" | "serverId" | "serverNumber" | "syncedAt" | "error">>
): Promise<void> {
  const draft = await getDraft(localId);
  if (!draft) return;
  await putDraft({ ...draft, ...patch });
}

/**
 * حذف دستی پیش‌نویس توسط کاربر (بازبینی تعارض) — تنها مسیر حذف
 * دادهٔ محلی غیر از تایید 2xx سرور.
 */
export async function dismissOfflineInvoice(localId: string): Promise<void> {
  await deleteDraft(localId);
}

/**
 * تلاش مجدد دستی یک پیش‌نویسِ تعارض/ناموفق: دوباره در صف می‌رود
 * (payload دست‌نخورده) و وضعیت به 'offline-draft' برمی‌گردد.
 */
export async function retryOfflineInvoice(localId: string): Promise<boolean> {
  const draft = await getDraft(localId);
  if (!draft || draft.status === "synced") return false;
  await addToOutbox(
    makeOutboxItem({
      url: "/api/invoices",
      method: "POST",
      body: draft.payload,
      contentType: "application/json",
      draftLocalId: localId,
    })
  );
  await updateDraftStatus(localId, { status: "offline-draft", error: null });
  notifyOutboxChanged();
  return true;
}

/** پاکسازی پیش‌نویس‌های synced قدیمی‌تر از ۷ روز (نگهداری تاریخچهٔ کوتاه) */
export async function purgeSyncedDrafts(olderThanMs = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  const all = await getAllDrafts();
  const cutoff = Date.now() - olderThanMs;
  for (const d of all) {
    if (d.status === "synced" && (d.syncedAt ?? d.createdAt) < cutoff) {
      await deleteDraft(d.localId);
    }
  }
}

/* ══════════════ شمارندهٔ کلی (برای بج و offline.html) ══════════════ */

export interface OfflineCounts {
  outbox: number;
  draftsPending: number;
  conflicts: number;
}

export async function getOfflineCounts(): Promise<OfflineCounts> {
  const [outbox, drafts] = await Promise.all([countOutbox(), getAllDrafts()]);
  return {
    outbox,
    draftsPending: drafts.filter((d) => d.status === "offline-draft" || d.status === "syncing").length,
    conflicts: drafts.filter((d) => d.status === "conflict" || d.status === "failed").length,
  };
}

/* ══════════════ کش کاتالوگ — کالا/طرف‌حساب برای فرم آفلاین ══════════════ */

/** ذخیرهٔ کاتالوگ پس از fetch موفق آنلاین — fire-and-forget امن */
export async function cacheProducts(rows: unknown[]): Promise<void> {
  await putCatalog(STORE_PRODUCTS, rows);
}

export async function cacheParties(rows: unknown[]): Promise<void> {
  await putCatalog(STORE_PARTIES, rows);
}

/** خواندن کش کاتالوگ (ممکن است null باشد — اولین بازدید قبل از آنلاین) */
export async function getCachedProducts<T = unknown>(): Promise<T[]> {
  const entry = await getCatalog<T>(STORE_PRODUCTS);
  return entry?.rows ?? [];
}

export async function getCachedParties<T = unknown>(): Promise<T[]> {
  const entry = await getCatalog<T>(STORE_PARTIES);
  return entry?.rows ?? [];
}

/* ══════════════ پیش‌ذخیرهٔ اولیه (پس از نصب/ورود — درخواست R24-5) ══════════════ */

/**
 * precache اولیهٔ داده‌ها: یک GET از کالاها و طرف‌حساب‌ها می‌زند تا
 * کش سرویس‌ورکر + کش IDB برای اولین استفادهٔ آفلاین پر شود.
 * با پرچم meta حداکثر یک‌بار در هر ۱۲ ساعت اجرا می‌شود (نسخهٔ SW از
 * سمت فراخوان ناپایدار است — TTL پایدارتر از کلید نسخه است).
 */
const PRECACHE_TTL_MS = 12 * 60 * 60 * 1000;

export async function precacheInitialData(
  fetchFn: typeof fetch,
  token: string | null,
  _label?: string
): Promise<void> {
  const flag = "precache-done";
  try {
    const done = await getMeta<{ at: number }>(flag);
    if (done && Date.now() - done.at < PRECACHE_TTL_MS) return;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const jobs = ["/api/products?limit=200", "/api/parties?limit=200"].map(async (url) => {
      try {
        const res = await fetchFn(url, { headers, cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!json?.success) return;
        if (Array.isArray(json.data)) {
          if (url.startsWith("/api/products")) await cacheProducts(json.data);
          if (url.startsWith("/api/parties")) await cacheParties(json.data);
        }
      } catch {
        /* آفلاین — دفعهٔ بعد دوباره تلاش می‌شود */
      }
    });
    await Promise.all(jobs);
    await setMeta(flag, { at: Date.now() });
  } catch {
    /* هرگز جریان اصلی را نشکند */
  }
}

/** آیا مرورگر الان آفلاین است؟ (helper واحد برای فرم‌ها) */
export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
