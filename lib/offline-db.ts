// ─── v20: آینهٔ آفلاین داده‌ها در IndexedDB ───
// چرا: «کاربر یک‌بار سایت را باز کرده باشد، بدون اینترنت هم همه‌چیز کار کند».
//  - putMirror/getMirror: آخرین پاسخ موفق GET برای موجودیت‌های حیاتی ذخیره می‌شود
//  - addPendingInvoice: فاکتور ثبت‌شدهٔ آفلاین به‌صورت echo محلی در لیست دیده می‌شود
//  - mirrorSuccessfulGet: نقشهٔ URL → موجودیت و ذخیرهٔ خودکار (از offline-fetch صدا زده می‌شود)
// پشتیبان: idb (نصب‌شده). sessionStorage قبلی با بستن PWA می‌مرد؛ IDB ماندگار است.

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "ofogh-offline-mirror";
const DB_VERSION = 2;
const STORE_MIRRORS = "mirrors"; // key = entity, value = { rows, savedAt }
const STORE_PENDING = "pending-invoices"; // echo فاکتورهای آفلاین
const STORE_API = "api-responses"; // R26 — آینهٔ ساختاریافتهٔ GETهای /api — کلید = مسیر+کوئری

export type MirrorEntity = "invoices" | "products" | "parties" | "dashboard";

export interface MirrorEntry<T = unknown> {
  rows: T[];
  savedAt: number; // Date.now()
}

export interface PendingInvoiceEcho {
  tempId: string; // شناسهٔ محلی (برای حذف پس از sync)
  number: string;
  partyName?: string;
  total: number;
  date: string;
  type?: string;
  status?: string;
  __pending?: true;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE_MIRRORS)) d.createObjectStore(STORE_MIRRORS);
        if (!d.objectStoreNames.contains(STORE_PENDING)) d.createObjectStore(STORE_PENDING, { keyPath: "tempId" });
        // R26 — آینهٔ ساختاریافتهٔ پاسخ‌های GET /api (سرویس‌ورکر هم همین store را می‌نویسد)
        if (!d.objectStoreNames.contains(STORE_API)) d.createObjectStore(STORE_API);
      },
    });
  }
  return dbPromise;
}

// ─── آینهٔ لیست‌ها ───

export async function putMirror(entity: MirrorEntity, rows: unknown[]): Promise<void> {
  const d = db();
  if (!d || !Array.isArray(rows)) return;
  try {
    const conn = await d;
    // سقف منطقی برای جلوگیری از تورم IDB در دستگاه‌های ضعیف
    await conn.put(STORE_MIRRORS, { rows: rows.slice(0, 300), savedAt: Date.now() }, entity);
  } catch {
    // آفلاین-میرور هرگز نباید جریان اصلی را بشکند
  }
}

export async function getMirror<T = unknown>(entity: MirrorEntity): Promise<MirrorEntry<T> | null> {
  const d = db();
  if (!d) return null;
  try {
    const conn = await d;
    const entry = (await conn.get(STORE_MIRRORS, entity)) as MirrorEntry<T> | undefined;
    return entry ?? null;
  } catch {
    return null;
  }
}

// ─── R26: آینهٔ ساختاریافتهٔ پاسخ‌های GET /api — کلید = مسیر+کوئری ───
// «همه‌چیز باید آفلاین کار کند»: هر GET موفق JSON علاوه بر Cache API
// سرویس‌ورکر، به‌صورت ساختاریافته (JSON زنده، قابل پیمایش) در IndexedDB هم
// ذخیره می‌شود — سرویس‌ورکر همین store را پر می‌کند؛ سمت کلاینت apiFetch
// در حالت آفلاین مستقیم از همین‌جا می‌خواند (بدون رفت‌وبرگشت به Cache API).

export interface ApiCacheEntry {
  /** مسیر+کوئری نرمال‌شده — مثل /api/products?limit=200 */
  url: string;
  /** بدنهٔ JSON پارس‌شده (شیء/آرایهٔ زنده) */
  body: unknown;
  contentType: string | null;
  status: number;
  savedAt: number; // Date.now()
}

/** کلید نرمال: حذف مبدا — فقط مسیر+کوئری همان-مبدا */
export function apiCacheKey(url: string): string | null {
  try {
    if (!url) return null;
    let u = url;
    if (/^https?:\/\//i.test(u)) {
      const parsed = new URL(u);
      if (typeof window === "undefined" || parsed.origin !== window.location.origin) return null; // فقط همان-مبدا
      u = parsed.pathname + parsed.search;
    }
    if (!u.startsWith("/api/")) return null;
    return u;
  } catch {
    return null;
  }
}

export async function putApiResponse(url: string, body: unknown, init?: { contentType?: string | null; status?: number }): Promise<void> {
  const key = apiCacheKey(url);
  if (!key || body === undefined) return;
  const d = db();
  if (!d) return;
  try {
    const conn = await d;
    await conn.put(STORE_API, {
      url: key,
      body,
      contentType: init?.contentType ?? "application/json",
      status: init?.status ?? 200,
      savedAt: Date.now(),
    } satisfies ApiCacheEntry, key);
  } catch {
    // آینهٔ آفلاین هرگز جریان اصلی را نمی‌شکند
  }
}

export async function getApiResponse<T = unknown>(url: string): Promise<ApiCacheEntry | null> {
  const key = apiCacheKey(url);
  if (!key) return null;
  const d = db();
  if (!d) return null;
  try {
    const conn = await d;
    const entry = (await conn.get(STORE_API, key)) as (ApiCacheEntry & { body?: T }) | undefined;
    return entry ?? null;
  } catch {
    return null;
  }
}

// ─── echo فاکتورهای آفلاین ───

export async function addPendingInvoice(echo: PendingInvoiceEcho): Promise<void> {
  const d = db();
  if (!d) return;
  try {
    const conn = await d;
    await conn.put(STORE_PENDING, { ...echo, __pending: true });
  } catch {
    /* noop */
  }
}

export async function listPendingInvoices(): Promise<PendingInvoiceEcho[]> {
  const d = db();
  if (!d) return [];
  try {
    const conn = await d;
    return ((await conn.getAll(STORE_PENDING)) || []) as PendingInvoiceEcho[];
  } catch {
    return [];
  }
}

export async function removePendingInvoice(tempId: string): Promise<void> {
  const d = db();
  if (!d) return;
  try {
    const conn = await d;
    await conn.delete(STORE_PENDING, tempId);
  } catch {
    /* noop */
  }
}

export async function clearPendingInvoices(): Promise<void> {
  const d = db();
  if (!d) return;
  try {
    const conn = await d;
    await conn.clear(STORE_PENDING);
  } catch {
    /* noop */
  }
}

// ─── نقشهٔ URL → موجودیت + ذخیرهٔ خودکار ───
// الگوها را محافظه‌کار نگه می‌داریم: فقط لیست‌های اصلی، بدون جزئیات تک‌مورد
const URL_MAP: Array<{ pattern: RegExp; entity: MirrorEntity; pick: (data: unknown) => unknown[] | null }> = [
  {
    pattern: /^\/api\/invoices(\?|$)/,
    entity: "invoices",
    pick: (data) => (Array.isArray((data as { invoices?: unknown[] })?.invoices) ? (data as { invoices: unknown[] }).invoices : null),
  },
  {
    pattern: /^\/api\/products(\?|$)/,
    entity: "products",
    pick: (data) => (Array.isArray((data as { products?: unknown[] })?.products) ? (data as { products: unknown[] }).products : null),
  },
  {
    pattern: /^\/api\/parties(\?|$)/,
    entity: "parties",
    pick: (data) => (Array.isArray((data as { parties?: unknown[] })?.parties) ? (data as { parties: unknown[] }).parties : null),
  },
];

/**
 * پس از هر GET موفق فراخوانی می‌شود (از offline-fetch).
 * اگر URL با الگوی موجودیت حیاتی بخورد، پاسخ در آینه ذخیره می‌شود.
 */
export function mirrorSuccessfulGet(url: string, data: unknown): void {
  try {
    if (typeof url !== "string" || data == null) return;
    const u = url.split("?")[0];
    for (const m of URL_MAP) {
      if (m.pattern.test(u)) {
        const rows = m.pick(data);
        // v20-F1: آرایهٔ خالی هم معتبر است — اگر سرور «هیچ» ردیف دارد، آینهٔ
        // قدیمی (ردیف‌های حذف‌شده) نباید باقی بماند. پاسخ‌های فیک آفلاین SW
        // (data:null/empty) هرگز شکل {invoices:[…]} ندارند → اینجا نمی‌رسند.
        if (Array.isArray(rows)) {
          void putMirror(m.entity, rows);
        }
        return;
      }
    }
  } catch {
    /* noop */
  }
}

/**
 * ادغام آینه + echoهای در انتظار برای نمایش لیست در حالت آفلاین.
 * echoها همیشه صدر لیست می‌آیند.
 */
export async function getOfflineList<T = unknown>(entity: MirrorEntity): Promise<T[]> {
  const [mirror, pending] = await Promise.all([getMirror<T>(entity), listPendingInvoices()]);
  const echoRows = (entity === "invoices" ? (pending as unknown as T[]) : []) as T[];
  const rows = mirror?.rows ?? [];
  return [...echoRows, ...rows];
}
