/**
 * ============ lib/offline/idb.ts ============
 * R24-5 — پوشش تایپ‌دارِ IndexedDB «بدون وابستگی خارجی» (دست‌نویس)
 * ============================================================================
 * پایگاه دادهٔ 'ofogh-offline' نسخهٔ ۱ با موجودیت‌ها:
 *  - 'outbox'         : صف موتاسیون‌های آفلاین (keyPath id autoIncrement)
 *  - 'invoices'       : پیش‌نویس فاکتورهای آفلاین (keyPath localId)
 *  - 'products-cache' : کش آفلاین کالاها (کلید ثابت 'default')
 *  - 'parties-cache'  : کش آفلاین طرف‌حساب‌ها (کلید ثابت 'default')
 *  - 'meta'           : متادیتا — last-sync و پرچم‌ها (کلید رشته‌ای)
 *
 * اصول:
 *  - همهٔ عملیاتها async — هیچ‌وقت main thread را بلاک نمی‌کنند (IDB ذاتاً async است)
 *  - هر عملیات try/catch دارد: خرابی IDB هرگز جریان اصلی اپ را نمی‌شکند
 *  - آیتم outbox فقط با تایید 2xx سرور حذف می‌شود (حذف بی‌تایید ممنوع)
 *  - singleton اتصال — بازکردن مکرر DB پرهزینه است
 *
 * منطق خالص (ترتیب صف، دسته‌بندی پاسخ، شماره‌گذاری) در lib/offline/pure.ts
 * است تا بدون مرورگر قابل unit-test باشد.
 */

import type { OutboxItem, OfflineInvoiceDraft } from "./pure";
import { sortOutbox } from "./pure";

const DB_NAME = "ofogh-offline";
const DB_VERSION = 1;

export const STORE_OUTBOX = "outbox";
export const STORE_INVOICES = "invoices";
export const STORE_PRODUCTS = "products-cache";
export const STORE_PARTIES = "parties-cache";
export const STORE_META = "meta";

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** بازکردن (یک‌بار در عمر اپ) اتصال IDB — در محیط بدون indexedDB مقدار null */
function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
            db.createObjectStore(STORE_OUTBOX, { keyPath: "id", autoIncrement: true });
          }
          if (!db.objectStoreNames.contains(STORE_INVOICES)) {
            db.createObjectStore(STORE_INVOICES, { keyPath: "localId" });
          }
          if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
            db.createObjectStore(STORE_PRODUCTS);
          }
          if (!db.objectStoreNames.contains(STORE_PARTIES)) {
            db.createObjectStore(STORE_PARTIES);
          }
          if (!db.objectStoreNames.contains(STORE_META)) {
            db.createObjectStore(STORE_META);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

/** اجرای یک تراکنش خواندن/نوشتن روی یک store — Promise ساده حول IDBRequest */
function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | null> {
  return openDB().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const t = db.transaction(store, mode);
          const req = run(t.objectStore(store));
          if (!req) return resolve(null);
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(null);
          t.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

/* ══════════════ عملیات عمومی: put/get/getAll/delete/clear ══════════════ */

export async function idbPut<T>(store: string, value: T, key?: IDBValidKey): Promise<void> {
  if (key !== undefined) {
    await tx(store, "readwrite", (s) => s.put(value as unknown as never, key));
  } else {
    await tx(store, "readwrite", (s) => s.put(value as unknown as never));
  }
}

export async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | null> {
  return (await tx<T>(store, "readonly", (s) => s.get(key))) ?? null;
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  const rows = await tx<T[]>(store, "readonly", (s) => s.getAll());
  return Array.isArray(rows) ? rows : [];
}

export async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  await tx(store, "readwrite", (s) => s.delete(key));
}

export async function idbClear(store: string): Promise<void> {
  await tx(store, "readwrite", (s) => s.clear());
}

export async function idbCount(store: string): Promise<number> {
  const n = await tx<number>(store, "readonly", (s) => s.count());
  return typeof n === "number" ? n : 0;
}

/* ══════════════ outbox — صف موتاسیون‌های آفلاین ══════════════ */

/** افزودن آیتم به صف — id توسط autoIncrement تولید می‌شود */
export async function addToOutbox(item: OutboxItem): Promise<OutboxItem | null> {
  const saved = await tx<IDBValidKey>(STORE_OUTBOX, "readwrite", (s) => s.add(item));
  return saved == null ? null : { ...item, id: Number(saved) };
}

/**
 * کل صف به‌ترتیب بازپخش (FIFO پایدار: createdAt → seq → id).
 * آیتم‌ها حذف «نمی‌شوند» — موتور sync بعد از تایید 2xx با markSynced حذف می‌کند.
 */
export async function takeOutboxAll(): Promise<OutboxItem[]> {
  const rows = await idbGetAll<OutboxItem>(STORE_OUTBOX);
  return sortOutbox(rows);
}

/** حذف آیتم از صف — فقط پس از تایید موفقیت (2xx) یا انتقال به بررسی دستی */
export async function markSynced(id: number): Promise<void> {
  await idbDelete(STORE_OUTBOX, id);
}

/** بازنویسی آیتم (تلاش مجدد / جریمهٔ backoff) */
export async function updateOutboxItem(item: OutboxItem): Promise<void> {
  if (item.id === undefined) return;
  await idbPut(STORE_OUTBOX, item);
}

/** تعداد آیتم‌های در صف */
export async function countOutbox(): Promise<number> {
  return idbCount(STORE_OUTBOX);
}

/* ══════════════ invoices — پیش‌نویس فاکتورهای آفلاین ══════════════ */

export async function putDraft(draft: OfflineInvoiceDraft): Promise<void> {
  await idbPut(STORE_INVOICES, draft);
}

export async function getDraft(localId: string): Promise<OfflineInvoiceDraft | null> {
  return idbGet<OfflineInvoiceDraft>(STORE_INVOICES, localId);
}

export async function getAllDrafts(): Promise<OfflineInvoiceDraft[]> {
  return idbGetAll<OfflineInvoiceDraft>(STORE_INVOICES);
}

export async function deleteDraft(localId: string): Promise<void> {
  await idbDelete(STORE_INVOICES, localId);
}

/* ══════════════ meta — متادیتا (last-sync و پرچم‌ها) ══════════════ */

export async function setMeta(key: string, value: unknown): Promise<void> {
  await idbPut(STORE_META, { key, value, at: Date.now() }, key);
}

export async function getMeta<T>(key: string): Promise<T | null> {
  const row = await idbGet<{ key: string; value: T }>(STORE_META, key);
  return row ? row.value : null;
}

/* ══════════════ کش کاتالوگ (کالا/طرف‌حساب) برای فرم آفلاین ══════════════ */

export interface CatalogCacheEntry<T> {
  rows: T[];
  savedAt: number;
}

const CATALOG_LIMIT = 500; // سقف منطقی — جلوگیری از تورم IDB روی دستگاه ضعیف

/** ذخیرهٔ لیست کالا/طرف‌حساب (کلید ثابت 'default' — همیشه آخرین snapshot) */
export async function putCatalog<T>(store: string, rows: T[]): Promise<void> {
  if (!Array.isArray(rows)) return;
  await idbPut<CatalogCacheEntry<T>>(
    store,
    { rows: rows.slice(0, CATALOG_LIMIT), savedAt: Date.now() },
    "default"
  );
}

export async function getCatalog<T>(store: string): Promise<CatalogCacheEntry<T> | null> {
  return idbGet<CatalogCacheEntry<T>>(store, "default");
}
