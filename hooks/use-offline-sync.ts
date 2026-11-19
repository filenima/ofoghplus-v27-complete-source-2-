"use client";

/**
 * use-offline-sync — وضعیت آنلاین + صف همگام‌سازی آفلاین (v20-F1)
 * ============================================================================
 * API (مصرف‌شده در OfflineBanner و app-providers):
 *   const { isOnline, serverOffline, pendingCount, failedCount, authExpired,
 *           syncing, lastSyncResult, syncNow } = useOfflineSync(token);
 *
 * - isOnline      — navigator.onLine + شنیدن online/offline
 * - serverOffline — مرورگر آنلاین است اما سرور جواب نمی‌دهد (پینگ /api/health
 *                   هر ۲۰ ثانیه؛ سرویس‌ورکر در آفلاین ۵۰۳ صریح می‌دهد)
 * - pendingCount  — تعداد درخواست‌های در صف آفلاین (IndexedDB از طریق idb)
 *                   + بلافاصله روی رویدادهای hoosh:mutation-queued / hoosh:sync-flush
 * - failedCount   — v20-F1: تعداد آیتم‌های «همگام‌نشده» = آیتم‌های صف با شکست
 *                   قطعی (۴xx) + آیتم‌های منتقل‌شده به لیست مرده (deadletter).
 *                   بنر آفلاین آن را به‌صورت «N آیتم همگام نشده» نشان می‌دهد.
 * - authExpired   — v20-F1: بازپخش به ۴۰۱ خورد → توکن منقضی است؛ آیتم‌ها همه در
 *                   صف می‌مانند و UI «برای همگام‌سازی دوباره وارد شوید» می‌گوید.
 *                   با اولین flush موفق بعد از ورود دوباره پاک می‌شود.
 * - syncNow()     — ارسال مجدد صف + بازگشت نتیجهٔ { ok, sent, failed, authExpired }
 *                   (با گارد singleton — چند mount همزمان فقط یک تخلیه انجام می‌دهند)
 * - lastSyncResult — آخرین نتیجهٔ همگام‌سازی
 *
 * پروتکل SW (sw.js v3):
 *   - پیام FORCE_SYNC از سرویس‌ورکر (sync tag hoosh-bg-sync) → همین‌جا تخلیه می‌شود
 *   - پس از تخلیه، SYNC_FLUSH_RESULT به SW برمی‌گردد → SW پیام BG_SYNC_DONE را
 *     broadcast می‌کند → sw-register توست «همگام‌سازی آفلاین انجام شد» می‌دهد
 *   - رویداد hoosh:sync-state — همگام‌سازی وضعیت failedCount/authExpired بین
 *     چند mount همزمان از همین هوک
 *
 * صف (v20-F1 — بدون از دست رفتن داده):
 *   - بازپخش با fetch «وصله‌نشده» (getOrigFetch از offline-fetch) انجام می‌شود؛
 *     اگر با fetch وصله‌شده می‌رفت و وسط تخلیه اینترنت قطع می‌شد، همان آیتم
 *     دوباره صف می‌شد (حلقهٔ بی‌پایان).
 *   - هر آیتم کلید Idempotency-Key یکتا دارد که هنگام بازپخش هم ارسال می‌شود.
 *   - ۴xx (به‌جز ۴۰۱) → آیتم حذف «نمی‌شود»؛ failCount++ و پس از ۵ شکست به
 *     لیست مرده (deadletter) با آخرین خطا منتقل می‌شود.
 *   - ۴۰۱ → همهٔ آیتم‌ها می‌مانند؛ پرچم authExpired ست می‌شود.
 *   - ۴۰۹ (تعارض قطعی/اجرای قبلی با همان کلید) → حذف از صف + رد در deadletter.
 *   - ۵xx / خطای شبکه → آیتم می‌ماند و بعداً دوباره تلاش می‌شود.
 *   - بعد از بازپخش موفق موتاسیون فاکتور (POST/PUT /api/invoices) وقتی هیچ
 *     موتاسیون فاکتوری در صف نمانده: echoهای آفلاین پاک و آینهٔ invoices با
 *     یک GET تازه به‌روز می‌شود.
 * installOfflineFetch در app-providers فعال می‌شود.
 */

import * as React from "react";
import { openDB, type IDBPDatabase } from "idb";
// v20-F1: بازپخش صف باید از زیر interceptor آفلاین برود — نه window.fetch وصله‌شده
import { getOrigFetch } from "@/lib/offline-fetch";
import { clearPendingInvoices, mirrorSuccessfulGet } from "@/lib/offline-db";

const DB_NAME = "hoosh-offline";
const STORE = "outbox";
const STORE_DEAD = "deadletter"; // v20-F1: آیتم‌های ۵ بار شکست‌خورده یا تعارض‌دار
const DB_VERSION = 2;
const HEALTH_INTERVAL = 20 * 1000; // پینگ سلامت سرور هر ۲۰ ثانیه (فقط وقتی آنلاین)
const MAX_ITEM_FAILURES = 5; // بعد از ۵ شکست قطعی (۴xx) → deadletter
const RETRY_BACKOFF_MS = 30 * 1000; // حداقل فاصلهٔ دو تلاشِ جریمه‌شوندهٔ پیاپی

export interface OutboxItem {
  id?: number;
  url: string;
  method: string;
  body: string | null;
  contentType: string | null;
  /** v20-F1 — کلید ایدمپوتنت تولیدشده هنگام صف‌شدن؛ هنگام بازپخش ارسال می‌شود */
  idempotencyKey?: string | null;
  createdAt: number;
  attempts: number; // کل تلاش‌های بازپخش
  /** v20-F1 — تعداد شکست‌های قطعی ۴xx (پس از رسیدن به MAX_ITEM_FAILURES → deadletter) */
  failCount?: number;
  lastError?: string | null;
  lastAttemptAt?: number;
}

/** v20-F1 — رد پای آیتم‌های حذف‌شده از صف (حذف بی‌ردپا ممنوع است) */
export interface DeadLetterItem {
  id?: number;
  url: string;
  method: string;
  body: string | null;
  contentType: string | null;
  idempotencyKey?: string | null;
  createdAt: number;
  droppedAt: number;
  attempts: number;
  lastError: string | null;
}

export interface SyncResult {
  ok: boolean;
  sent: number;
  failed: number;
  /** v20-F1 — بازپخش به ۴۰۱ خورد؛ کاربر باید دوباره وارد شود */
  authExpired?: boolean;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        }
        // v20-F1 — نسخهٔ ۲: لیست مرده برای آیتم‌های شکست‌خوردهٔ قطعی
        if (!db.objectStoreNames.contains(STORE_DEAD)) {
          db.createObjectStore(STORE_DEAD, { keyPath: "id", autoIncrement: true });
        }
      },
    }).catch(() => null as unknown as IDBPDatabase);
  }
  return dbPromise;
}

export async function enqueueRequest(
  item: Omit<OutboxItem, "id" | "createdAt" | "attempts">
) {
  try {
    const db = await getDB();
    if (!db) return;
    await db.add(STORE, {
      failCount: 0,
      lastError: null,
      lastAttemptAt: 0,
      ...item,
      createdAt: Date.now(),
      attempts: 0,
    });
  } catch {
    /* ignore */
  }
}

/** R24-5 — شمارش صف قدیمی (hoosh-offline) برای بج وضعیت کل سیستم آفلاین */
export async function countLegacyPending(): Promise<number> {
  return countPending();
}

async function countPending(): Promise<number> {
  try {
    const db = await getDB();
    if (!db) return 0;
    return await db.count(STORE);
  } catch {
    return 0;
  }
}

/** v20-F1 — تعداد آیتم‌های همگام‌نشده: صفِ درحال‌شکست (۴xx) + deadletter */
async function countFailed(): Promise<number> {
  try {
    const db = await getDB();
    if (!db) return 0;
    const items = (await db.getAll(STORE)) as OutboxItem[];
    const failing = items.filter((i) => (i.failCount ?? 0) > 0).length;
    const dead = await db.count(STORE_DEAD);
    return failing + dead;
  } catch {
    return 0;
  }
}

/** v20-F1 — لیست آیتم‌های مرده (برای UI/دیباگ آینده) */
export async function listDeadLetter(): Promise<DeadLetterItem[]> {
  try {
    const db = await getDB();
    if (!db) return [];
    return ((await db.getAll(STORE_DEAD)) || []) as DeadLetterItem[];
  } catch {
    return [];
  }
}

/** v20-F1 — پاک‌سازی دستی deadletter (وقتی کاربر تکلیف آیتم‌ها را روشن کرد) */
export async function clearDeadLetter(): Promise<void> {
  try {
    const db = await getDB();
    if (!db) return;
    await db.clear(STORE_DEAD);
  } catch {
    /* ignore */
  }
}

/** انتقال آیتم به لیست مرده — هیچ‌وقت جریان تخلیه را نمی‌شکند */
async function moveToDeadLetter(
  db: IDBPDatabase,
  item: OutboxItem,
  reason: string
): Promise<void> {
  try {
    await db.add(STORE_DEAD, {
      url: item.url,
      method: item.method,
      body: item.body,
      contentType: item.contentType,
      idempotencyKey: item.idempotencyKey ?? null,
      createdAt: item.createdAt,
      droppedAt: Date.now(),
      attempts: item.attempts ?? 0,
      lastError: reason,
    } satisfies DeadLetterItem);
  } catch {
    /* ignore */
  }
}

/** مسیر pathname از url صف (نسبی یا مطلق) */
function pathOf(url: string): string {
  try {
    if (/^https?:\/\//i.test(url)) return new URL(url).pathname;
    return url.split("?")[0];
  } catch {
    return url;
  }
}

/** آیا آیتم یک موتاسیون فاکتور است؟ (POST/PUT /api/invoices یا /api/invoices/[id]) */
function isInvoiceMutation(item: OutboxItem): boolean {
  return (
    (item.method === "POST" || item.method === "PUT") &&
    /^\/api\/invoices(\/|$)/.test(pathOf(item.url))
  );
}

/** توکن احراز هویت فعلی از localStorage — در هر دو نقش (کاربر/ادمین) */
function readLocalToken(): string | null {
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

/* ─── تخلیهٔ صف: singleton سراسری — چند mount همزمان فقط یک تخلیه می‌کنند ─── */
let flushInFlight: Promise<SyncResult> | null = null;

async function flushQueueOnce(token: string | null): Promise<SyncResult> {
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    const result: SyncResult = { ok: true, sent: 0, failed: 0 };
    // توکن را «در لحظهٔ تخلیه» بخوان — mount سراسری (صفحات عمومی) هم
    // بازپخش احراز‌شده انجام دهد و ۴۰۱/حذف اشتباهی از صف رخ ندهد
    const effectiveToken = token || readLocalToken();
    // v20-F1 — بازپخش با fetch وصله‌نشده: اگر window.fetch وصله‌شده بود و وسط
    // تخلیه اینترنت قطع می‌شد، interceptor همان آیتم را دوباره صف می‌کرد
    // (حلقهٔ بی‌پایان / رشد صف). origFetch از زیر interceptor رد می‌شود.
    const replayFetch = getOrigFetch();
    let saw401 = false;
    let invoiceMutated = false;
    try {
      const db = await getDB();
      if (!db) return result;
      const items = (await db.getAll(STORE)) as OutboxItem[];
      for (const item of items) {
        // نشست منقضی → بقیهٔ آیتم‌ها را بی‌فایده امتحان نکن؛ همه در صف می‌مانند
        if (saw401) {
          result.failed++;
          continue;
        }
        // عقب‌گرد: آیتمِ شکست‌خوردهٔ ۴xx در ۳۰ ثانیهٔ اخیر دوباره جریمه نمی‌شود
        // (رویدادهای sync پشت‌سرهم — online + FORCE_SYNC + تایمر — نباید
        // failCount را به‌طور غیرواقعی بالا ببرند)
        if (
          (item.failCount ?? 0) > 0 &&
          item.lastAttemptAt &&
          Date.now() - item.lastAttemptAt < RETRY_BACKOFF_MS
        ) {
          result.failed++;
          continue;
        }
        try {
          const res = await replayFetch(item.url, {
            method: item.method,
            headers: {
              ...(item.contentType ? { "Content-Type": item.contentType } : {}),
              ...(effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {}),
              // v20-F1 — همان کلید ایدمپوتنتِ لحظهٔ صف‌شدن؛ سرور می‌تواند
              // اجرای دوبارهٔ یک عملیات تکراری را تشخیص دهد
              ...(item.idempotencyKey ? { "Idempotency-Key": item.idempotencyKey } : {}),
            },
            body: item.body,
          });

          if (res.ok) {
            // موفق — حذف از صف
            if (item.id !== undefined) await db.delete(STORE, item.id);
            result.sent++;
            if (isInvoiceMutation(item)) invoiceMutated = true;
            continue;
          }

          if (res.status === 401) {
            // نشست منقضی — آیتم می‌ماند (بدون جریمه)؛ ادامهٔ حلقه بی‌فایده است.
            // UI از طریق authExpired پیام «دوباره وارد شوید» نشان می‌دهد.
            saw401 = true;
            result.failed++;
            result.ok = false;
            continue;
          }

          if (res.status === 409) {
            // تعارض قطعی سرور (مثلاً همین عملیات قبلاً با همین کلید ایدمپوتنت
            // اجرا شده) → حذف از صف + رد در deadletter (حذف بی‌ردپا ممنوع)
            if (item.id !== undefined) await db.delete(STORE, item.id);
            await moveToDeadLetter(db, item, "HTTP 409 — تعارض با سرور");
            result.failed++;
            continue;
          }

          if (res.status >= 400 && res.status < 500) {
            // ۴xx قطعی: قبلاً بی‌صدا حذف می‌شد (از دست رفتن داده!) — حالا
            // می‌ماند، شمرده می‌شود و فقط بعد از ۵ شکست به deadletter می‌رود
            const failCount = (item.failCount ?? 0) + 1;
            if (failCount >= MAX_ITEM_FAILURES) {
              if (item.id !== undefined) await db.delete(STORE, item.id);
              await moveToDeadLetter(
                db,
                item,
                `HTTP ${res.status} — پس از ${failCount} تلاش`
              );
            } else if (item.id !== undefined) {
              await db.put(STORE, {
                ...item,
                attempts: (item.attempts ?? 0) + 1,
                failCount,
                lastError: `HTTP ${res.status}`,
                lastAttemptAt: Date.now(),
              } satisfies OutboxItem);
            }
            result.failed++;
            continue;
          }

          // ۵xx — خطای موقت سرور؛ بعداً دوباره (بدون جریمهٔ قطعی)
          if (item.id !== undefined) {
            await db.put(STORE, {
              ...item,
              attempts: (item.attempts ?? 0) + 1,
              lastError: `HTTP ${res.status}`,
              lastAttemptAt: Date.now(),
            } satisfies OutboxItem);
          }
          result.failed++;
          result.ok = false;
        } catch {
          // خطای شبکه — هنوز آنلاین نیستیم؛ آیتم دست‌نخورده در صف می‌ماند
          result.failed++;
          result.ok = false;
        }
      }

      // ─── v20-F1: بازپخش موفق فاکتور → پاک‌کردن echoهای آفلاین + آینهٔ تازه ───
      // فقط وقتی «هیچ» موتاسیون فاکتوری در صف نمانده باشد؛ وگرنه echo
      // فاکتورِ هنوز-صف‌شده هم زودتر از موعد پاک می‌شد.
      if (invoiceMutated) {
        try {
          const remaining = ((await db.getAll(STORE)) as OutboxItem[]).some(
            isInvoiceMutation
          );
          if (!remaining) {
            await clearPendingInvoices();
            // GET تازه با fetch وصله‌نشده + توکن → آینهٔ invoices به‌روز می‌شود
            // (fire-and-forget — جریان تخلیه را متوقف نمی‌کند)
            void (async () => {
              try {
                const res = await replayFetch("/api/invoices?take=50", {
                  headers: effectiveToken
                    ? { Authorization: `Bearer ${effectiveToken}` }
                    : {},
                });
                if (res.ok) {
                  const json = await res.json();
                  mirrorSuccessfulGet("/api/invoices?take=50", json);
                }
              } catch {
                /* آفلاین شدیم دوباره — بعداً در مرور بعدی آینه تازه می‌شود */
              }
            })();
          }
        } catch {
          /* ignore */
        }
      }

      return { ...result, authExpired: saw401 };
    } catch {
      return { ...result, authExpired: saw401 };
    }
  })();

  try {
    return await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

export function useOfflineSync(token: string | null) {
  const [isOnline, setIsOnline] = React.useState(true);
  const [serverOffline, setServerOffline] = React.useState(false);
  const [pendingCount, setPendingCount] = React.useState(0);
  // v20-F1 — وضعیت همگام‌سازی ناموفق و نشست منقضی
  const [failedCount, setFailedCount] = React.useState(0);
  const [authExpired, setAuthExpired] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [lastSyncResult, setLastSyncResult] = React.useState<SyncResult | null>(null);
  const tokenRef = React.useRef(token);
  tokenRef.current = token;

  // وضعیت آنلاین مرورگر
  React.useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // پینگ دوره‌ای سلامت سرور (فقط وقتی مرورگر آنلاین است) — هر ۲۰ ثانیه.
  // سرویس‌ورکر در آفلاین ۵۰۳ با serverDown:true می‌دهد → حالت server-down واقعی.
  React.useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      if (!navigator.onLine) {
        if (!cancelled) setServerOffline(false);
        return;
      }
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!cancelled) setServerOffline(!res.ok);
      } catch {
        if (!cancelled) setServerOffline(true);
      }
    };
    void ping();
    const iv = setInterval(ping, HEALTH_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  // شمارش صف و آیتم‌های ناموفق — ۳۰ ثانیه یک‌بار + آنلاین‌شدن + رویدادهای صف
  // (hoosh:mutation-queued → جدید صف شد؛ hoosh:sync-flush → تخلیه تمام شد)
  React.useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const [n, f] = await Promise.all([countPending(), countFailed()]);
      if (!cancelled) {
        setPendingCount(n);
        setFailedCount(f);
      }
    };
    void refresh();
    const iv = setInterval(refresh, 30_000);
    window.addEventListener("online", refresh);
    window.addEventListener("hoosh:mutation-queued", refresh);
    window.addEventListener("hoosh:sync-flush", refresh);
    return () => {
      cancelled = true;
      clearInterval(iv);
      window.removeEventListener("online", refresh);
      window.removeEventListener("hoosh:mutation-queued", refresh);
      window.removeEventListener("hoosh:sync-flush", refresh);
    };
  }, []);

  // v20-F1 — همگام‌سازی وضعیت (failedCount/authExpired) بین چند mount از هوک:
  // تخلیهٔ واقعی فقط در یکی انجام می‌شود (singleton) اما نتیجه را برای همه
  // broadcast می‌کنیم تا OfflineBanner و بقیهٔ مصرف‌کننده‌ها تازه شوند.
  React.useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent<{ authExpired?: boolean; failedCount?: number }>)
        .detail || {};
      if (typeof d.authExpired === "boolean") setAuthExpired(d.authExpired);
      if (typeof d.failedCount === "number") setFailedCount(d.failedCount);
    };
    window.addEventListener("hoosh:sync-state", onState);
    return () => window.removeEventListener("hoosh:sync-state", onState);
  }, []);

  const syncNow = React.useCallback(async (): Promise<SyncResult> => {
    setSyncing(true);
    try {
      const result = await flushQueueOnce(tokenRef.current);
      setLastSyncResult(result);
      const [n, f] = await Promise.all([countPending(), countFailed()]);
      setPendingCount(n);
      const expired = result.authExpired === true;
      // v20-F1 — وضعیت جدید: تعداد همگام‌نشده + نشست منقضی (برای همهٔ mountها)
      setFailedCount(f);
      setAuthExpired(expired);
      try {
        window.dispatchEvent(
          new CustomEvent("hoosh:sync-state", {
            detail: { authExpired: expired, failedCount: f },
          })
        );
      } catch {}
      // v35 — اطلاع‌رسانی به UIها: صف تخلیه شد، داده را تازه کنید
      if (typeof window !== "undefined" && result.sent > 0) {
        try {
          window.dispatchEvent(new CustomEvent("hoosh:sync-flush", { detail: result }));
          // کش API سرویس‌ورکر را هم باطل کن تا دادهٔ تازه بیاید
          if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage("hoosh-clear-api-cache");
          }
        } catch {}
      }
      // پروتکل SW v3 — نتیجهٔ تخلیه را به سرویس‌ورکر بده تا BG_SYNC_DONE را
      // broadcast کند (توست «همگام‌سازی آفلاین انجام شد» در sw-register)
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        try {
          navigator.serviceWorker.controller.postMessage({
            type: "SYNC_FLUSH_RESULT",
            sent: result.sent,
            failed: result.failed,
          });
        } catch {}
      }
      return result;
    } finally {
      setSyncing(false);
    }
  }, []);

  // همگام‌سازی خودکار هنگام بازگشت آنلاین
  const wasOnline = React.useRef(isOnline);
  React.useEffect(() => {
    if (wasOnline.current === false && isOnline) {
      void syncNow();
    }
    wasOnline.current = isOnline;
  }, [isOnline, syncNow]);

  // پیام FORCE_SYNC از سرویس‌ورکر (Background Sync tag «hoosh-bg-sync») →
  // این mount صف را تخلیه می‌کند (singleton مانع تخلیهٔ تکراری می‌شود)
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "FORCE_SYNC") {
        void syncNow();
      }
    };
    navigator.serviceWorker.addEventListener("message", onSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onSwMessage);
    };
  }, [syncNow]);

  return {
    isOnline,
    serverOffline,
    pendingCount,
    failedCount,
    authExpired,
    syncing,
    lastSyncResult,
    syncNow,
  };
}

export default useOfflineSync;
