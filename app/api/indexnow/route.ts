import { NextRequest, NextResponse } from "next/server";
import {
  pingIndexNowUrls,
  getIndexNowBaseUrl,
  blogUrlFromSlug,
  getLatestIndexNowUrls,
  type IndexNowPingResult,
} from "@/lib/indexnow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// POST /api/indexnow — تریگر دستی پینگ IndexNow (R14-K2 / ایجنت ۴)
// ============================================================
// شکایت مالک: «صفحات ایندکس نمی‌شوند» → فوری‌ترین مسیر: اطلاع‌رسانی
// مستقیم URLها به پروتکل IndexNow (Bing/Yandex/Seznam) — رایگان و آنی.
//
// احراز هویت: مثل کرون انتشار — هدر CRON_SECRET (اگر تنظیم شده) یا
// باز در development (بدون سِرcret). این مسیر فقط «اطلاع‌رسانی» است و
// هیچ داده‌ای نمی‌نویسد؛ کلید IndexNow اساساً عمومی است (فایل کلید در
// ریشهٔ دامنه سرو می‌شود) — ولی سِرcret انتشار را فعال نگه می‌داریم تا
// پینگ‌های بی‌مورد (اسپم به Bing) ممکن نشود.
//
// بدنه (JSON — هر دو اختیاری، یکی لازم):
//   { urls: string[] }    — URLهای مطلق (هم‌دامنه)
//   { slugs: string[] }   — slug مقالات بلاگ → /blog/<slug> روی دامنهٔ برند
//   { latest: number }    — n URL آخر (بلاگ + صفحات هسته؛ سقف ۱۰۰)
//
// پاسخ: { success, data: { ping: IndexNowPingResult, urls } }
// در شبکهٔ محدود (سندباکس): { pinged:false, reason:"network/timeout" }
// — کد در استقرار واقعی بدون تغییر کار می‌کند.

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      req.headers.get("x-cron-secret") ||
      new URL(req.url).searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const { urls, slugs, latest } = (body || {}) as {
    urls?: unknown;
    slugs?: unknown;
    latest?: unknown;
  };

  const base = await getIndexNowBaseUrl(req.url);
  let targetUrls: string[] = [];

  if (Array.isArray(urls)) {
    // URLهای مطلقِ داده‌شده — فقط هم‌دامنهٔ برند پذیرفته می‌شوند
    const allowedHosts = new Set([new URL(base).host, "ofoghplus.ir", "www.ofoghplus.ir"]);
    targetUrls = (urls as unknown[])
      .filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u))
      .filter((u) => {
        try {
          return allowedHosts.has(new URL(u).host);
        } catch {
          return false;
        }
      })
      .slice(0, 100);
  } else if (Array.isArray(slugs)) {
    targetUrls = (slugs as unknown[])
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .slice(0, 100)
      .map((s) => blogUrlFromSlug(base, s));
  } else if (typeof latest === "number" && Number.isFinite(latest) && latest > 0) {
    targetUrls = await getLatestIndexNowUrls(Math.min(100, Math.floor(latest)), base);
  }

  if (targetUrls.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "بدنهٔ نامعتبر — یکی از urls / slugs / latest را بفرستید (حداکثر ۱۰۰ آیتم)",
      },
      { status: 400 }
    );
  }

  // پینگ واقعی — تایم‌اوت ۵ ثانیه، هرگز throw نمی‌کند
  let ping: IndexNowPingResult;
  try {
    ping = await pingIndexNowUrls(targetUrls);
  } catch {
    ping = {
      pinged: false,
      submitted: targetUrls.length,
      reason: "خطای غیرمنتظره",
      endpoint: "https://api.indexnow.org/indexnow",
      at: new Date().toISOString(),
    };
  }

  return NextResponse.json({
    success: true,
    data: {
      ping,
      urls: targetUrls,
      note: ping.pinged
        ? "پینگ IndexNow ارسال شد"
        : "پینگ ارسال نشد (شبکه/تایم‌اوت) — در استقرار واقعی با دامنهٔ عمومی کار می‌کند",
    },
  });
}

export const POST = handle;
