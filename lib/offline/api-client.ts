/**
 * ============ lib/offline/api-client.ts ============
 * R26 — `apiFetch` — fetch «همیشه‌موفق» برای کارکرد ۱۰۰٪ آفلاین پنل
 * ============================================================================
 * درخواست مالک: «با قطع اینترنت هیچ‌چیز نشکند — فاکتور، حسابداری، همه‌چیز».
 *
 * رفتار:
 *  ▸ آنلاین → fetch عادی (با توکن احراز هویت مثل authFetch). پاسخ GET موفقِ
 *    JSON به‌صورت fire-and-forget در آینهٔ ساختاریافتهٔ IndexedDB
 *    (`api-responses`، کلید = مسیر+کوئری) ذخیره می‌شود — سرویس‌ورکر هم همین
 *    store را می‌نویسد (دوبار نوشتن روی یک کلید = overwrite بی‌ضرر).
 *  ▸ آفلاین + GET → اول آینهٔ ساختاریافتهٔ IndexedDB (بدون رفت‌وبرگشت شبکه)؛
 *    اگر نبود، fetch به سرویس‌ورکر (SWR از Cache API سرو می‌کند)؛ اگر آن هم
 *    نبود، پاسخ آرامِ خالی — هیچ‌وقت throw نمی‌کند.
 *  ▸ آفلاین + موتاسیون (POST/PUT/PATCH/DELETE) → نوشتن در صف outbox
 *    (IndexedDB `ofogh-offline`) با `clientRequestId` یکتا + بازگرداندن
 *    پاسخ synthetic موفق:
 *        { success: true, ok: true, offline: true, clientRequestId, data: {} }
 *    تا UI همان لحظه جریان خود را ادامه دهد. با رویداد 'online'،
 *    sync-engine صف را به‌ترتیب بازپخش می‌کند (Last-Write-Wins برای
 *    PUT/PATCH/DELETE هم‌URL — applyLastWriteWins در pure.ts).
 *
 * مستثنی‌ها (هرگز صف نمی‌شوند؛ خطا شفاف به UI می‌رسد):
 *  ▸ احراز هویت/پرداخت/گیت‌وی ▸ /api/ai/* ▸ آپلود فایل ▸ نرخ ارز زندهٔ ثالث
 *  ▸ بدنهٔ غیرمتنی (FormData/ArrayBuffer/…) ▸ درخواست‌های abort شده
 *
 * پذیرش تدریجی (adoption):
 *  - جریان فاکتور آفلاین از قبل کامل است (createInvoiceOffline + همین outbox).
 *  - برای ماژول‌های دیگر کافی است `authFetch("/api/x", init)` را با
 *    `apiFetch("/api/x", init)` جایگزین کنید — امضای Response سازگار است
 *    (`res.ok`، `res.json()`، `res.status`). پاسخ synthetic کد 200 دارد و
 *    `json().offline === true` + `json().clientRequestId` برای تشخیص محلی.
 *  - توجه: اگر جایی از interceptor سراسری (lib/offline-fetch.ts) هم رد می‌شود،
 *    در حالت آفلاین apiFetch هرگز به fetch نمی‌رسد → صف‌شدن دوباره ممکن نیست.
 */

import { getAuthToken } from "@/lib/auth-fetch";
import { getApiResponse, putApiResponse } from "@/lib/offline-db";
import { makeOutboxItem, type OutboxItem } from "./pure";
import { addToOutbox } from "./idb";
import { OUTBOX_CHANGED_EVENT } from "./invoice-offline";
import { registerInvoiceBgSync } from "./sync-engine";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** این الگوها هرگز وارد صف آفلاین نمی‌شوند (خطای واقعی به UI می‌رسد) */
const NEVER_QUEUE_RE =
  /\/api\/(auth|payment|gateway|files\/upload|platform\/ads\/upload|ai\/|currency\/fetch-tgju|exchange-rate\/fetch)/;

/** پاسخ synthetic — هم‌شکل Response واقعی تا مصرف‌کننده تغییر نکند */
function syntheticJson(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export interface ApiFetchInit extends RequestInit {
  /**
   * شناسهٔ اختیاری برای پیوند پاسخ آفلاین با عملیات محلی (idempotency)؛
   * اگر داده نشود، خودکار (crypto.randomUUID) تولید می‌شود.
   */
  clientRequestId?: string;
}

/**
 * fetch همیشه‌موفق — جایگزین drop-in برای authFetch در جریان‌هایی که باید
 * آفلاین هم کار کنند. جزئیات رفتار در بالای فایل.
 */
export async function apiFetch(input: string | URL, init: ApiFetchInit = {}): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  const method = (init.method || "GET").toUpperCase();
  const isApi = url.includes("/api/");

  /* ─── آنلاین: fetch عادی + آینهٔ ساختاریافتهٔ GET ─── */
  if (!isBrowserOffline()) {
    const headers = new Headers(init.headers || {});
    const token = getAuthToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const res = await fetch(input, { ...init, headers });

    if (res.ok && method === "GET" && isApi) {
      try {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json") && res.headers.get("X-Hoosh-Offline") !== "1") {
          const copy = res.clone();
          void copy
            .json()
            .then((json: unknown) => {
              void putApiResponse(url, json, { contentType: ct, status: res.status });
            })
            .catch(() => undefined);
        }
      } catch {
        /* clone/parse ممکن نیست — بی‌صدا */
      }
    }
    return res;
  }

  /* ─── آفلاین ─── */
  if (!isApi) {
    // خارج از /api (استاتیک/صفحه) → بگذار fetch/SW تصمیم بگیرد
    return fetch(input, init);
  }

  // GET → آینهٔ IDB → سرویس‌ورکر (Cache API) → پاسخ آرام خالی
  if (method === "GET") {
    const entry = await getApiResponse(url);
    if (entry && entry.body !== undefined && entry.body !== null) {
      return syntheticJson(entry.body, entry.status || 200, {
        "X-Ofogh-Offline-Idb": "1",
        "Cache-Control": "no-store",
      });
    }
    try {
      return await fetch(input, init); // SW با SWR از Cache API سرو می‌کند
    } catch {
      return syntheticJson({ success: true, offline: true, data: null, empty: true }, 200, {
        "X-Hoosh-Offline": "1",
      });
    }
  }

  // موتاسیون → صف outbox + پاسخ synthetic موفق
  if (!MUTATING.has(method)) {
    return fetch(input, init);
  }
  if (NEVER_QUEUE_RE.test(url)) {
    return fetch(input, init); // شفاف شکست بخورد (auth/payment/ai/…)
  }

  // بدنهٔ قابل ذخیره فقط string/JSON — باینری/FormData صف نمی‌شود
  let bodyStr: string | null = null;
  let contentType: string | null = "application/json";
  if (init.body != null) {
    if (typeof init.body === "string") {
      bodyStr = init.body;
    } else if (init.body instanceof Blob) {
      try {
        bodyStr = await init.body.text();
      } catch {
        return fetch(input, init);
      }
    } else {
      // FormData / ArrayBuffer / URLSearchParams / ReadableStream → قابل بازپخش نیست
      return fetch(input, init);
    }
  }
  if (init.headers) {
    try {
      const h = init.headers instanceof Headers ? init.headers : new Headers(init.headers as HeadersInit);
      contentType = h.get("Content-Type") || contentType;
    } catch {
      /* هدر ساده — همان پیش‌فرض JSON */
    }
  }

  const clientRequestId =
    init.clientRequestId ||
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `ofogh-req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

  let item: OutboxItem | null = null;
  try {
    item = await addToOutbox(
      makeOutboxItem({
        url,
        method: method as OutboxItem["method"],
        body: bodyStr,
        contentType,
        clientRequestId,
      })
    );
  } catch {
    // IDB در دسترس نیست (حالت نادر) → رفتار شفاف، بدون پاسخ جعلی
    return fetch(input, init);
  }
  if (!item) {
    return fetch(input, init);
  }

  // اطلاع به بج وضعیت و موتور sync + رزرو Background Sync
  try {
    window.dispatchEvent(new CustomEvent(OUTBOX_CHANGED_EVENT, { detail: { url, method } }));
  } catch {
    /* ignore */
  }
  void registerInvoiceBgSync();

  return syntheticJson({
    success: true,
    ok: true,
    offline: true,
    clientRequestId,
    data: {},
  });
}

export default apiFetch;
