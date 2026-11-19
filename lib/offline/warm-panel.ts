/**
 * ============ lib/offline/warm-panel.ts ============
 * R26 — «اولین ورود = دانلود کامل پنل» (درخواست مالک)
 * ============================================================================
 * «بار اول که کاربر آنلاین ثبت‌نام/ورود کند و وارد پنل شود، همهٔ اجزای پنل
 * دانلود شود تا با قطع اینترنت هیچ‌چیز نشکند».
 *
 * بعد از ورود موفق (توکن موجود + آنلاین + صفحه idle)، در اولویتِ پایین:
 *  ۱) APIهای حیاتی پنل به‌ترتیب fetch می‌شوند (ترتیبی، با مکث کوتاه — نه
 *     موازی، تا لپ‌تاپ ضعیف اسپیک حافظه نکند):
 *       داشبورد، کالاها، طرف‌حساب‌ها، فاکتورهای اخیر، فرم‌دادهٔ حسابداری
 *       (سرفصل‌ها/انبارها)، انبارها، دسته‌بندی کالاها
 *     هر پاسخ موفق: کش SW (SWR) + آینهٔ ساختاریافتهٔ IndexedDB (api-responses)
 *     + کش کاتالوگ فرم فاکتور (products-cache/parties-cache) پر می‌شود.
 *  ۲) HTML ماژول‌های کلیدی (?module=…) fetch و از داخلش چانک‌های
 *     /_next/static/chunks/… استخراج و ترتیبی preload می‌شوند (سقف مشخص)
 *     تا باز کردن ماژول در حالت آفلاین، چانک از کش بیاید.
 *  ۳) پرچم انجام در meta (IDB) با TTL ۱۲ ساعت — تکرار نشود تا نیم‌روز.
 *  ۴) رویداد PANEL_WARM_DONE_EVENT → بج کوچک «نسخهٔ آفلاین آماده شد ✓».
 *
 * همه‌چیز best-effort و بی‌صدا: خطا/آفلاین شدن وسط کار = تلاش دفعهٔ بعد.
 */

import { getAuthToken } from "@/lib/auth-fetch";
import { putApiResponse } from "@/lib/offline-db";
import { getMeta, setMeta } from "./idb";
import { cacheParties, cacheProducts } from "./invoice-offline";

/** رویداد پایان موفق warm — بج «نسخهٔ آفلاین آماده شد ✓» گوش می‌دهد */
export const PANEL_WARM_DONE_EVENT = "ofogh:panel-warm-done";

const WARM_FLAG = "panel-warm-done";
const WARM_TTL_MS = 12 * 60 * 60 * 1000; // حداکثر یک‌بار در ۱۲ ساعت

/** APIهای حیاتی پنل — ترتیب مهم است (داشبورد اول، بعد کاتالوگ‌ها) */
const WARM_APIS: string[] = [
  "/api/dashboard",
  "/api/products?limit=200",
  "/api/parties?limit=200",
  "/api/invoices?limit=50",
  "/api/accounting/form-data",
  "/api/warehouses",
  "/api/products/categories",
];

/** ماژول‌های پرکاربرد — HTMLشان برای استخراج چانک‌ها fetch می‌شود */
const WARM_MODULES: string[] = [
  "/",
  "/?module=invoices",
  "/?module=quick-invoice-list",
  "/?module=crm",
  "/?module=inventory",
  "/?module=core",
  "/?module=reports-builder",
];

const CHUNK_RE = /(?:\/_next\/)?static\/chunks\/[A-Za-z0-9_[\].\-/%]{6,}/g;
const MAX_CHUNKS = 220; // سقف — جلوگیری از تورم کش/حافظه روی دستگاه ضعیف
const GAP_MS = 60; // مکث بین fetchهای ترتیبی
const API_GAP_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** requestIdleCallback با fallback — اجرای اولویت‌پایین */
function whenIdle(fn: () => void): void {
  try {
    const ric = (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (typeof ric === "function") {
      ric(fn, { timeout: 4000 });
      return;
    }
  } catch {
    /* ignore */
  }
  setTimeout(fn, 1200);
}

/** نرمال‌سازی مسیر چانک استخراج‌شده از HTML (\\u002F و \\/ و انکود) */
function normalizeChunkPath(raw: string): string | null {
  try {
    let u = raw.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
    if (u.startsWith("//")) u = u.slice(1);
    if (!u.startsWith("/")) u = "/" + u;
    if (!u.startsWith("/_next")) u = "/_next" + u;
    if (u.includes("[") || u.includes("]")) {
      u = u.replace(/\[/g, "%5B").replace(/\]/g, "%5D");
    }
    // فقط همان-مبدا و فقط استاتیک — هیچ کوئری‌استرینگ/مبدا خارجی
    if (!u.startsWith("/_next/static/")) return null;
    return encodeURI(u);
  } catch {
    return null;
  }
}

let warmInFlight = false;

/**
 * اجرای warm پنل — بی‌صدا، یک‌بار در هر TTL، فقط آنلاین + با توکن.
 * از ماژول ثبت SW (بعد از ورود/فعال شدن SW) صدا زده می‌شود.
 */
export async function warmPanelForOffline(): Promise<void> {
  if (typeof window === "undefined") return;
  if (warmInFlight) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const token = getAuthToken();
  if (!token) return; // هنوز وارد نشده — بعد از ورود دوباره صدا می‌خوریم

  try {
    const done = await getMeta<{ at: number }>(WARM_FLAG);
    if (done && Date.now() - done.at < WARM_TTL_MS) return;
  } catch {
    /* IDB ناخوانا — ادامه بده */
  }

  warmInFlight = true;
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    let apiOk = 0;

    /* ─── ۱) APIهای حیاتی — ترتیبی با مکث ─── */
    for (const url of WARM_APIS) {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      try {
        const res = await window.fetch(url, { headers, cache: "no-store" });
        if (!res.ok) continue;
        const json = await res.json().catch(() => null);
        if (!json || json?.success === false) continue;
        // آینهٔ ساختاریافتهٔ IDB (سمت کلاینت — SW هم موازی می‌نویسد؛ overwrite بی‌ضرر)
        void putApiResponse(url, json, { contentType: "application/json", status: res.status });
        // کاتالوگ فرم فاکتور آفلاین
        if (Array.isArray(json?.data)) {
          if (url.startsWith("/api/products?")) void cacheProducts(json.data);
          if (url.startsWith("/api/parties?")) void cacheParties(json.data);
        }
        apiOk++;
      } catch {
        /* آفلاین شد / خطای گذرا — ادامه با بقیه */
      }
      await sleep(API_GAP_MS);
    }
    if (apiOk === 0) return; // سرور در دسترس نیست — دفعهٔ بعد

    /* ─── ۲) چانک‌های ماژول‌های کلیدی — استخراج از HTML + preload ترتیبی ─── */
    const chunks = new Set<string>();
    for (const page of WARM_MODULES) {
      if (typeof navigator !== "undefined" && !navigator.onLine) break;
      if (chunks.size >= MAX_CHUNKS) break;
      try {
        const res = await window.fetch(page, {
          headers: { Accept: "text/html" },
          cache: "no-store",
        });
        if (!res.ok) continue;
        const html = await res.text();
        const matches = html.match(CHUNK_RE) || [];
        for (const m of matches) {
          if (chunks.size >= MAX_CHUNKS) break;
          const c = normalizeChunkPath(m);
          if (c) chunks.add(c);
        }
      } catch {
        /* صفحه در دسترس نیست — بقیه را امتحان کن */
      }
      await sleep(GAP_MS);
    }

    let chunkOk = 0;
    for (const chunk of chunks) {
      if (typeof navigator !== "undefined" && !navigator.onLine) break;
      try {
        // fetch ساده — SW با استراتژی cache-first در STATIC_CACHE ذخیره می‌کند
        const res = await window.fetch(chunk, { cache: "no-store" });
        if (res.ok) chunkOk++;
      } catch {
        /* چانک شکست خورد — مهم نیست */
      }
      await sleep(GAP_MS);
    }

    /* ─── ۳) پرچم + رویداد ─── */
    try {
      await setMeta(WARM_FLAG, { at: Date.now(), apiOk, chunkOk });
    } catch {
      /* ignore */
    }
    try {
      window.dispatchEvent(
        new CustomEvent(PANEL_WARM_DONE_EVENT, { detail: { apiOk, chunkOk } })
      );
    } catch {
      /* ignore */
    }
  } finally {
    warmInFlight = false;
  }
}

/** نسخهٔ idle — برای فراخوانی بعد از load/login بدون رقابت با رندر اولیه */
export function warmPanelWhenIdle(): void {
  if (typeof window === "undefined") return;
  whenIdle(() => void warmPanelForOffline());
}
