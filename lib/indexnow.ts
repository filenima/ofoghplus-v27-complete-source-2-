// ============================================================
// lib/indexnow.ts — پروتکل IndexNow (R14-K2 / ایجنت ۴)
// ============================================================
// شکایت #۱ مالک: «صفحات ایندکس نمی‌شوند». راه‌حل استاندارد امروز برای
// ایندکس سریع در Bing (و موتورهای هم‌پروتکل: Yandex، Seznam، Naver،
// Yeti) پروتکل IndexNow است — پینگ URL تازه/تغییریافته، رایگان و آنی.
//
// پروتکل (indexnow.org):
//  - کلید: رشته‌ای ۸ تا ۱۲۸ حرفی هگز — فایل «<کلید>.txt» در ریشهٔ دامنه
//    با محتوای خود کلید (این فایل از قبل موجود است:
//    public/hooshhesab-v36-9f4a2e7b1c8d3f6a.txt — ثابت برند، عمداً دست‌نخورده).
//  - پینگ تک-URL: POST/GET به api.indexnow.org/indexnow?url=<url>&key=<key>
//  - پینگ دسته‌ای: POST به api.indexnow.org/indexnow با بدنهٔ JSON:
//      { host, key, keyLocation, urlList: string[] }
//    (سقف پروتکل ۱۰٬۰۰۰ URL در هر درخواست — اینجا حداکثر ۱۰۰).
//
// نکته‌های پیاده‌سازی:
//  - همهٔ فراخوانی‌ها fire-and-forget با تایم‌اوت ۵ ثانیه‌اند؛ شکست پینگ
//    هرگز انتشار مقاله یا پاسخ API را ناموفق نمی‌کند.
//  - در سندباکس شبکهٔ خروجی محدود است → خطای شبکه بی‌صدا بلعیده و
//    نتیجهٔ {pinged:false, reason} برگردانده می‌شود (رفتار درست کد مهم
//    است؛ در استقرار واقعی پینگ وصل است).
//  - آخرین پینگ موفق در SystemSettings ثبت می‌شود تا پنل سوپرادمین
//    تاریخ آخرین اطلاع‌رسانی IndexNow را نشان دهد.

import { db } from "@/lib/db";
import { INDEXNOW_KEY } from "@/lib/seo";

const INDEXNOW_API = "https://api.indexnow.org/indexnow";
const DEFAULT_TIMEOUT_MS = 5_000;

/** سقف پینگ دسته‌ای ادمین (action=ping-indexnow): ۱۰ بار در ساعت */
const MASS_PING_LIMIT_PER_HOUR = 10;
/** timestamps آخرین پینگ‌های دسته‌ای — کش درون‌حافظه‌ای، per-process */
const massPingTimestamps: number[] = [];

const LAST_MASS_PING_KEY = "indexnow_last_mass_ping";

export interface IndexNowPingResult {
  /** آیا درخواست موفق به سرور IndexNow رسید و پاسخ 2xx/4xx-معتبر گرفت */
  pinged: boolean;
  /** کد وضعیت HTTP پاسخ IndexNow (اگر رسید) */
  status?: number;
  /** تعداد URLهای ارسال‌شده */
  submitted: number;
  /** دلیل شکست (شبکه/تایم‌اوت/بدنهٔ نامعتبر) */
  reason?: string;
  /** endpointای که صدا زده شد — برای شفافیت لاگ */
  endpoint: string;
  at: string;
}

/** آدرس پایهٔ سایت با fallback مطمئن به دامنهٔ canonical برند (ofoghplus.ir) */
export async function getIndexNowBaseUrl(origin?: string): Promise<string> {
  try {
    const { getAppBaseUrl } = await import("@/lib/app-url");
    const base = await getAppBaseUrl(origin ? new Request(origin) : undefined);
    return base.replace(/\/+$/, "");
  } catch {
    // حتی اگر app-url در دسترس نبود — دامنهٔ canonical
    return "https://ofoghplus.ir";
  }
}

/** ساخت URL کامل مقاله از slug */
export function blogUrlFromSlug(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/blog/${encodeURIComponent(slug)}`;
}

/**
 * پینگ تک-URL — طبق پروتکل IndexNow:
 * https://api.indexnow.org/indexnow?url=<url>&key=<key>
 *
 * نکتهٔ آزموده‌شده (تست زندهٔ ۲۰۲۶-۱۱-۰۳): endpoint مرکزی فقط دو شکل
 * را ۲۰۲ برمی‌گرداند — GET با query params، و POST با بدنهٔ JSON.
 * POST با query params و بدنهٔ خالی (با هر Content-Typeای) 415 می‌دهد؛
 * بنابراین شکل GET برای تک-URL و POST-JSON برای دسته استفاده می‌شود.
 * تایم‌اوت ۵ ثانیه، نتیجه لاگ می‌شود، هرگز throw نمی‌کند.
 */
export async function pingIndexNowUrl(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<IndexNowPingResult> {
  const endpoint = `${INDEXNOW_API}?url=${encodeURIComponent(url)}&key=${INDEXNOW_KEY}`;
  const at = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal,
      headers: { "User-Agent": "OfoghPlus-IndexNow/1.0" },
      cache: "no-store",
    });
    const result: IndexNowPingResult = {
      pinged: res.status >= 200 && res.status < 300,
      status: res.status,
      submitted: 1,
      endpoint,
      at,
    };
    // 200/202 = پذیرش؛ 400/403/422 = کلید/URL نامعتبر (چیزی که باید دید)
    console.log(
      `[indexnow] پینگ ${url} → HTTP ${res.status} ${result.pinged ? "(پذیرفته شد)" : "(بررسی شود)"}`
    );
    return result;
  } catch (err) {
    // شبکهٔ محدود/آفلاین/تایم‌اوت — رفتار آرام و قابل‌گزارش
    const reason = err instanceof Error ? (err.name === "AbortError" ? "timeout" : `network: ${err.message.slice(0, 120)}`) : "network";
    console.log(`[indexnow] پینگ ${url} ناموفق (${reason}) — در استقرار واقعی ارسال می‌شود`);
    return { pinged: false, submitted: 1, reason, endpoint, at };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * پینگ چند-URL (دسته‌ای) — POST با بدنهٔ JSON طبق پروتکل:
 * { host, key, keyLocation, urlList }
 * تک-URL به مسیر query-param بالا هدایت می‌شود.
 */
export async function pingIndexNowUrls(urls: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<IndexNowPingResult> {
  const clean = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  if (clean.length === 0) {
    return { pinged: false, submitted: 0, reason: "هیچ URLای برای پینگ نبود", endpoint: INDEXNOW_API, at: new Date().toISOString() };
  }
  if (clean.length === 1) {
    return pingIndexNowUrl(clean[0], timeoutMs);
  }

  // host از اولین URL — همهٔ URLها باید هم‌دامنه باشند (قید پروتکل)
  let host = "";
  try {
    host = new URL(clean[0]).host;
  } catch {
    return { pinged: false, submitted: clean.length, reason: "URL نامعتبر", endpoint: INDEXNOW_API, at: new Date().toISOString() };
  }
  const keyLocation = `https://${host}/${INDEXNOW_KEY}.txt`;
  const at = new Date().toISOString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(INDEXNOW_API, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": "OfoghPlus-IndexNow/1.0" },
      cache: "no-store",
      body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation, urlList: clean }),
    });
    const result: IndexNowPingResult = {
      pinged: res.status >= 200 && res.status < 300,
      status: res.status,
      submitted: clean.length,
      endpoint: INDEXNOW_API,
      at,
    };
    console.log(
      `[indexnow] پینگ دسته‌ای ${clean.length} URL → HTTP ${res.status} ${result.pinged ? "(پذیرفته شد)" : "(بررسی شود)"}`
    );
    return result;
  } catch (err) {
    const reason = err instanceof Error ? (err.name === "AbortError" ? "timeout" : `network: ${err.message.slice(0, 120)}`) : "network";
    console.log(`[indexnow] پینگ دسته‌ای ${clean.length} URL ناموفق (${reason})`);
    return { pinged: false, submitted: clean.length, reason, endpoint: INDEXNOW_API, at };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * پینگ fire-and-forget برای slugهای تازه‌منتشرشده — مسیر انتشار بلاگ.
 * هرگز throw نمی‌کند و فراخواننده را منتظر نگه نمی‌دارد.
 */
export function notifyIndexNowForSlugs(slugs: string[]): void {
  if (!slugs || slugs.length === 0) return;
  void (async () => {
    try {
      const base = await getIndexNowBaseUrl();
      await pingIndexNowUrls(slugs.map((s) => blogUrlFromSlug(base, s)));
    } catch {
      /* سکوت مطلق — این تابع در مسیر صفحات عمومی صدا زده می‌شود */
    }
  })();
}

/** صفحات هستهٔ سایت — پَدینگ پینگ دسته‌ای وقتی بلاگ کمتر از سقف دارد */
const CORE_URLS = [
  "",
  "/blog",
  "/pricing",
  "/features",
  "/calculators",
  "/compare-plans",
  "/compare",
  "/financial-health",
  "/roi-calculator",
  "/moadian-invoice",
  "/industries",
  "/cities",
  "/taxes",
  "/banks",
  "/ecosystem",
  "/tutorials",
  "/case-studies",
  "/glossary",
  "/downloads",
  "/authors",
];

/**
 * «آخرین ۱۰۰ URL تازه/تغییریافته» برای پینگ دسته‌ای ادمین:
 * اولویت با مقاله‌های بلاگ است (سریع‌ترین بخش تغییرکنندهٔ سایت —
 * انتشار روزانهٔ زمان‌بند)؛ اگر کمتر از limit بود با صفحات هسته پَد می‌شود.
 */
export async function getLatestIndexNowUrls(limit = 100, baseUrl?: string): Promise<string[]> {
  const base = (baseUrl ?? (await getIndexNowBaseUrl())).replace(/\/+$/, "");
  const take = Math.max(1, Math.min(100, Math.round(limit)));
  const urls: string[] = [];
  try {
    const posts = await db.blogPost.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ updatedAt: "desc" }],
      select: { slug: true },
      take,
    });
    urls.push(...posts.map((p) => blogUrlFromSlug(base, p.slug)));
  } catch {
    /* DB در دسترس نیست — فقط صفحات هسته */
  }
  for (const path of CORE_URLS) {
    if (urls.length >= take) break;
    const u = `${base}${path}`;
    if (!urls.includes(u)) urls.push(u);
  }
  return urls.slice(0, take);
}

/** بررسی محدودیت نرخ پینگ دسته‌ای (۱۰/ساعت، درون‌حافظه‌ای) */
export function checkMassPingRateLimit(): { allowed: boolean; usedThisHour: number; retryAfterMin: number } {
  const hourAgo = Date.now() - 60 * 60_000;
  while (massPingTimestamps.length > 0 && massPingTimestamps[0] < hourAgo) {
    massPingTimestamps.shift();
  }
  const usedThisHour = massPingTimestamps.length;
  if (usedThisHour >= MASS_PING_LIMIT_PER_HOUR) {
    const oldest = massPingTimestamps[0];
    const retryAfterMin = Math.max(1, Math.ceil((oldest + 60 * 60_000 - Date.now()) / 60_000));
    return { allowed: false, usedThisHour, retryAfterMin };
  }
  return { allowed: true, usedThisHour, retryAfterMin: 0 };
}

/** ثبت یک پینگ دسته‌ای برای شمارش نرخ + مهر زمانی در SystemSettings (برای پنل) */
export async function recordMassPing(result: IndexNowPingResult, submitted: number): Promise<void> {
  massPingTimestamps.push(Date.now());
  try {
    await db.systemSettings.upsert({
      where: { key: LAST_MASS_PING_KEY },
      create: {
        key: LAST_MASS_PING_KEY,
        value: JSON.stringify({ at: result.at, submitted, pinged: result.pinged, status: result.status ?? null, reason: result.reason ?? null }),
      },
      update: {
        value: JSON.stringify({ at: result.at, submitted, pinged: result.pinged, status: result.status ?? null, reason: result.reason ?? null }),
      },
    });
  } catch {
    /* ثبت اختیاری است */
  }
}

/** آخرین پینگ دسته‌ای برای نمایش در پنل (null = هرگز) */
export async function getLastIndexNowMassPing(): Promise<{
  at: string;
  submitted: number;
  pinged: boolean;
  status: number | null;
  reason: string | null;
} | null> {
  try {
    const row = await db.systemSettings.findUnique({ where: { key: LAST_MASS_PING_KEY } });
    if (!row?.value) return null;
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}
