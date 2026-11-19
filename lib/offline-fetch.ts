"use client";

/**
 * ============ lib/offline-fetch.ts ============
 * نصب interceptor سراسری fetch برای کارکرد ۱۰۰٪ آفلاین (درخواست مالک).
 * ============================================================================
 * - درخواست‌های تغییردهنده (POST/PUT/PATCH/DELETE به /api/*) که «فقط به دلیل
 *   قطع اینترنت» شکست می‌خورند: به صف آفلاین (IndexedDB از use-offline-sync)
 *   افزوده می‌شوند و یک پاسخ موفق آرام برمی‌گردند — بدون نمایش «خطای آفلاین».
 *   خطاهای HTTP (۴xx/۵xx) هرگز صف نمی‌شوند — پاسخ واقعی به UI می‌رسد.
 * - هنگام صف‌شدن، «کلید ایدمپوتنت» یکتا (crypto.randomUUID) تولید و همراه
 *   آیتم ذخیره می‌شود؛ موتور همگام‌سازی همان کلید را هنگام بازپخش در هدر
 *   Idempotency-Key می‌فرستد تا اجرای دوبارهٔ ناخواستهٔ یک عملیات سمت سرور
 *   قابل تشخیص/جلوگیری باشد.
 * - پس از هر GET موفقِ زندهٔ /api/* با بدنهٔ JSON، mirrorSuccessfulGet صدا
 *   زده می‌شود (fire-and-forget) — آینهٔ آفلاین IndexedDB خودبه‌خود هنگام
 *   مرور کاربر پر می‌شود (فاکتورها/کالاها/طرف‌حساب‌ها).
 * - پس از هر موتاسیون موفق آنلاین، کش API سرویس‌ورکر پاک می‌شود تا دادهٔ
 *   تازه بیاید.
 * - بعد از همگام‌سازی صف (بازگشت آنلاین)، رویداد hoosh:sync-flush dispatch
 *   می‌شود تا UIها داده را تازه کنند.
 * - مستثنی از صف (هرگز صف نمی‌شوند و خطا شفاف به UI می‌رسد):
 *   ▸ احراز هویت/پرداخت/گیت‌وی
 *   ▸ همهٔ /api/ai/* — دستیار هوش مصنوعی «موتور پاسخ آفلاین» خودش را دارد؛
 *     اگر اینجا پاسخ فیک queued می‌دادیم چت خراب می‌شد (پیام باید به موتور
 *     آفلاین برود نه صف)
 *   ▸ نرخ ارز آنلاین (/api/currency/fetch-tgju، /api/exchange-rate/fetch*) —
 *     دادهٔ زندهٔ اشخاص ثالث است؛ صف‌کردنش بی‌معنا و گمراه‌کننده است
 *   ▸ آپلود فایل (/api/files/upload، /api/platform/ads/upload) — فایل باینری
 *     قابل بازپخش از صف نیست؛ UI پیام شفاف «نیاز به اتصال» می‌دهد
 *   ▸ درخواست‌های abort شده (AbortError) — کاربر/کد عمداً لغو کرده است؛
 *     نباید بعداً بی‌اجازه اجرا شود
 *   ▸ بدنهٔ غیرمتنی (FormData/ArrayBuffer/…) — قابل ذخیره در صف نیست
 */

import { enqueueRequest } from "@/hooks/use-offline-sync";
import { mirrorSuccessfulGet } from "@/lib/offline-db";

declare global {
  interface Window {
    __hooshOfflineFetchInstalled?: boolean;
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** این الگوها هرگز وارد صف آفلاین نمی‌شوند */
const NEVER_QUEUE_RE =
  /\/api\/(auth|payment|gateway|files\/upload|platform\/ads\/upload|ai\/|currency\/fetch-tgju|exchange-rate\/fetch)/;

/* ─── fetch اصلی (پیش از وصله) ───
 * موتور همگام‌سازی صف (flushQueueOnce در use-offline-sync) باید بازپخش را با
 * همین تابع انجام دهد، نه window.fetch وصله‌شده — وگرنه اگر هنگام تخلیهٔ صف
 * اینترنت دوباره قطع شود، همان آیتم دوباره صف می‌شود (حلقهٔ بی‌نهایت / رشد صف).
 * مرجع «قبل از وصله» در installOfflineFetch اسیر می‌شود؛ اگر هنوز نصب نشده
 * باشد window.fetch خودش نسخهٔ دست‌نخورده است. */
let origFetchRef: typeof globalThis.fetch | null = null;

/** fetch بدون interceptor آفلاین — برای بازپخش صف (تضمین‌شده پیش از وصله) */
export function getOrigFetch(): typeof globalThis.fetch {
  if (origFetchRef) return origFetchRef;
  if (typeof window !== "undefined" && typeof window.fetch === "function") {
    return window.fetch.bind(window);
  }
  return globalThis.fetch.bind(globalThis);
}

/**
 * نام‌نویسی مستقیم مرجع fetch اصلی (برای مصرف‌کننده‌هایی که می‌خواهند مطمئن
 * شوند همان نمونهٔ اسیرشده را دارند). اگر installOfflineFetch هنوز اجرا نشده
 * باشد، همین الان اسیر می‌کند — یعنی همیشه «پیش از وصله».
 */
export function captureOrigFetch(): typeof globalThis.fetch {
  if (!origFetchRef && typeof window !== "undefined" && typeof window.fetch === "function") {
    // اگر در همین لحظه fetch قبلاً وصله شده باشد (نصب دوباره)، آن را دور می‌ریزیم
    // چون __hooshOfflineFetchInstalled تضمین می‌کند وصله فقط یک‌بار نصب می‌شود،
    // این حالت عملاً رخ نمی‌دهد؛ محافظ صرفاً برای اطمینان است.
    if (!window.__hooshOfflineFetchInstalled) {
      origFetchRef = window.fetch.bind(window);
    }
  }
  return getOrigFetch();
}

/** استخراج مسیر نسبی /api/... از هر شکل ورودی fetch — برای آینهٔ آفلاین */
function apiPathOf(url: string): string | null {
  try {
    let u = url;
    if (/^https?:\/\//i.test(u)) {
      const parsed = new URL(u);
      u = parsed.pathname + parsed.search;
    } else if (u.startsWith("//")) {
      return null; // پروتکل‌نسبی — امن نیست
    }
    // حذف مبداِ absolute همان-origin (مثل https://127.0.0.1:3000/api/…)
    if (u.startsWith("/api/")) return u;
    return null;
  } catch {
    return null;
  }
}

export function installOfflineFetch() {
  if (typeof window === "undefined") return;
  if (window.__hooshOfflineFetchInstalled) return;
  window.__hooshOfflineFetchInstalled = true;

  // اسیرکردن fetch اصلی «قبل از» هر تغییری — replay صف همیشه با این می‌رود
  origFetchRef = window.fetch.bind(window);
  const origFetch = origFetchRef;

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method || (typeof input !== "string" && !(input instanceof URL) && input.method) || "GET").toUpperCase();
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
    const isApi = typeof url === "string" && url.includes("/api/");

    try {
      const res = await origFetch(input as RequestInfo, init);

      // ─── v20-F1: آینهٔ خودکار داده — هر GET زندهٔ موفقِ /api/* با JSON ───
      // پاسخ‌های کش‌شدهٔ سرویس‌ورکر (X-Hoosh-Offline: 1) عمداً آینه نمی‌شوند؛
      // آینه فقط «آخرین پاسخ زندهٔ موفق» است (fire-and-forget، بی‌خطا).
      if (res.ok && method === "GET" && typeof url === "string") {
        const apiPath = apiPathOf(url);
        if (apiPath) {
          try {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json") && res.headers.get("X-Hoosh-Offline") !== "1") {
              const copy = res.clone();
              void copy
                .json()
                .then((json: unknown) => {
                  mirrorSuccessfulGet(apiPath, json);
                })
                .catch(() => {
                  /* بدنهٔ JSON نبود — بی‌صدا */
                });
            }
          } catch {
            /* clone ممکن نیست — بی‌صدا */
          }
        }
      }

      // موتاسیون موفق → کش API را باطل کن (پیام به SW)
      if (res.ok && isApi && MUTATING.has(method) && "serviceWorker" in navigator && navigator.serviceWorker.controller) {
        try {
          navigator.serviceWorker.controller.postMessage("hoosh-clear-api-cache");
        } catch {}
      }
      return res;
    } catch (err) {
      // فقط «خطای شبکه» (آفلاین/DNS/…) صف می‌شوند — خطاهای HTTP (۴xx/۵xx)
      // از res بالا برمی‌گردند و شفاف به UI می‌رسند و هرگز صف نمی‌شوند.
      // درخواست‌های لغوشده (AbortError) هم صف نمی‌شوند: لغو عمدی است و نباید
      // بعداً بی‌اجازه اجرا شود.
      const isAbort =
        err instanceof DOMException ? err.name === "AbortError" : (err as { name?: string })?.name === "AbortError";
      if (isAbort || !isApi || !MUTATING.has(method)) throw err;

      const urlStr = String(url);

      // AI / ارز / آپلود / پرداخت → صف ممنوع (موتور آفلاین خودشان کار می‌کنند)
      if (NEVER_QUEUE_RE.test(urlStr)) throw err;

      // بدنهٔ قابل ذخیره فقط string (JSON) — FormData/باینری صف نمی‌شود
      let body: string | null = null;
      if (init?.body) {
        if (typeof init.body === "string") body = init.body;
        else if (init?.body instanceof Blob) {
          try { body = await init.body.text(); } catch {}
        } else {
          // FormData / ArrayBuffer / URLSearchParams و… — قابل بازپخش نیست
          throw err;
        }
      }

      // صف نکن: بدنهٔ خیلی بزرگ
      if (body && body.length > 2_000_000) throw err;

      // Content-Type — پشتیبانی از Headers/آرایه علاوه بر شیء ساده
      let contentType: string | null = null;
      if (init?.headers) {
        const h = init.headers;
        if (h instanceof Headers) {
          contentType = h.get("Content-Type");
        } else if (Array.isArray(h)) {
          const rec = Object.fromEntries(h as string[][]);
          contentType = rec["Content-Type"] || rec["content-type"] || null;
        } else if (typeof h === "object") {
          const rec = h as Record<string, string>;
          contentType = rec["Content-Type"] || rec["content-type"] || null;
        }
      }
      if (!contentType) contentType = "application/json";

      // ─── v20-F1: کلید ایدمپوتنت یکتا برای این عملیات ───
      // همراه آیتم ذخیره می‌شود و هنگام بازپخش در هدر Idempotency-Key
      // می‌رود تا اگر درخواست اول به سرور رسیده ولی جوابش گم شده بود،
      // اجرای دوباره سمت سرور قابل تشخیص باشد.
      const idempotencyKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `hoosh-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

      await enqueueRequest({ url: urlStr, method, body, contentType, idempotencyKey });

      // اطلاع به UI — OfflineBanner شمارندهٔ pending را همین لحظه تازه می‌کند
      try {
        window.dispatchEvent(new CustomEvent("hoosh:mutation-queued", { detail: { url: urlStr, method } }));
      } catch {}

      // پاسخ آرام — کامپوننت success می‌بیند و UI ادامه می‌یابد.
      // queued:true نشانهٔ «صف شد» است (مثلاً invoice-form روی آن echo محلی می‌سازد).
      return new Response(
        JSON.stringify({
          success: true,
          offline: true,
          queued: true,
          data: {},
          idempotencyKey,
          message: "اتصال قطع است — عملیات ذخیره شد و پس از اتصال به اینترنت خودکار اجرا می‌شود.",
        }),
        { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }
  }) as typeof fetch;
}
