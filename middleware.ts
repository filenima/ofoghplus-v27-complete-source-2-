import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════════
// Task 1-c — middleware دامنهٔ اختصاصی فروشگاه‌ها
// ═══════════════════════════════════════════════════════════════════
// اگر درخواست با دامنهٔ اختصاصیِ (متصل و تأییدشدهٔ) یک فروشگاه بیاید،
// به همان صفحهٔ فروشگاه روی مسیر استاندارد /shop/[slug] بازنویسی (rewrite)
// می‌شود — URL کاربر همان دامنهٔ خودش می‌ماند (بدون ریدایرکت).
//
// پیش‌نیاز استقرار (VPS): DNS wildcard یا رکوردهای دامنه‌های مشتریان به سرور +
// سرور (Caddy/nginx) همهٔ Hostها را به همین اپ بدهد.
//
// نکتهٔ پرفورمنس: فقط وقتی Host با دامنهٔ اصلی برابر «نبود» کوئری می‌زنیم —
// روی دامنهٔ اصلی هزینه‌ای اضافه نمی‌شود. ۵ دقیقه کش درون‌حافظه‌ای برای
// دامنه‌های تأییدشده (تا هر درخواست DB نزند) — برچسب no-store برای صفحات
// داینامیک حفظ می‌شود.
// ═══════════════════════════════════════════════════════════════════

export const config = {
  // فقط صفحات عمومی؛ api/static/_next دست‌نخورده می‌مانند
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sw.js|manifest.webmanifest|banners|uploads|downloads|indexnow-).*)"],
};

// FIX(R24-8): این middleware مستقیماً Prisma (SQLite) را برای تشخیص دامنهٔ
// اختصاصی فروشگاه‌ها کوئری می‌زند — در Edge Runtime نه Prisma کار می‌کند
// (engine باینری Node) و نه ماژول‌های node (path/fs/module) مجازند.
// Next.js 16 میدل‌ور Node.js را پشتیبانی می‌کند → اجرای صحیح + بدون خطای
// «A Node.js module is loaded which is not supported in the Edge Runtime».
export const runtime = "nodejs";

const DOMAIN_CACHE_TTL_MS = 5 * 60 * 1000;
const domainCache = new Map<string, { slug: string; at: number; suspended?: boolean }>();

// ─── Task 3-d: تعلیق فروشگاه توسط سوپرادمین ───
// وضعیت تعلیق هر اسلاگ ۳۰ ثانیه کش می‌شود (یک کوئری در دقیقه برای هر اسلاگ).
const SUSPENDED_CACHE_TTL_MS = 30 * 1000;
const suspendedCache = new Map<string, { suspended: boolean; at: number }>();

/** فرار HTML — عنوان فروشگاه دادهٔ مالک است و نباید در صفحهٔ تعلیق تزریق شود */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** صفحهٔ فارسی تعلیق (۵۰۳) — سایت عمومیِ فروشگاهِ معلق */
function suspendedPage(title: string | null): NextResponse {
  const name = title ? `${escapeHtml(title)} — ` : "";
  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>فروشگاه موقتاً تعلیق شده است</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f5f4;color:#1c1917;font-family:Tahoma,Vazirmatn,sans-serif;text-align:center;padding:24px;}
  .box{max-width:420px;}
  .icon{font-size:44px;margin-bottom:12px;}
  h1{font-size:18px;margin:0 0 10px;}
  p{font-size:13px;color:#57534e;line-height:2;margin:0;}
</style>
</head>
<body>
<div class="box">
  <div class="icon">⏸️</div>
  <h1>این فروشگاه موقتاً تعلیق شده است</h1>
  <p>${name}در حال حاضر این سایت در دسترس نیست.<br>لطفاً بعداً مراجعه کنید یا با پشتیبانی تماس بگیرید.</p>
</div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/** بررسی تعلیق اسلاگ با کش ۳۰ثانیه‌ای (خطای DB → آخرین مقدار کش‌شده) */
async function isSuspended(slug: string): Promise<boolean> {
  const cached = suspendedCache.get(slug);
  if (cached && Date.now() - cached.at < SUSPENDED_CACHE_TTL_MS) return cached.suspended;
  try {
    const row = await db.storefront.findUnique({
      where: { slug },
      select: { status: true },
    });
    const suspended = row?.status === "suspended";
    suspendedCache.set(slug, { suspended, at: Date.now() });
    return suspended;
  } catch {
    return cached?.suspended ?? false;
  }
}

function normalizeHost(host: string | null): string {
  if (!host) return "";
  return host.trim().toLowerCase().split(":")[0];
}

export async function middleware(req: NextRequest) {
  try {
    // ─── Task 3-d: صفحهٔ عمومی /shop/[slug] — فروشگاهِ معلق ۵۰۳ می‌گیرد ───
    // (این بررسی قبل از هر چیز انجام می‌شود؛ دامنهٔ اصلی و زیردامنه‌ها شامل‌اند)
    const shopMatch = /^\/shop\/([^\/]+)(?:\/|$)/.exec(req.nextUrl.pathname);
    if (shopMatch) {
      const slug = decodeURIComponent(shopMatch[1]);
      if (await isSuspended(slug)) {
        return suspendedPage(null);
      }
    }

    const host = normalizeHost(req.headers.get("host"));
    // بدون host یا IP مستقیم → کاری نکن
    if (!host || /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host === "localhost") {
      return NextResponse.next();
    }

    // دامنهٔ اصلی برند و زیردامنه‌های پلتفرم → کاری نکن (با تنظیمات برندینگ)
    let mainHosts: Set<string>;
    try {
      const { getBrandingSettings, PRE_REBRAND_DEFAULTS } = await import("@/lib/system-settings");
      const brand = await getBrandingSettings();
      mainHosts = new Set(
        [brand.domain, PRE_REBRAND_DEFAULTS.domain]
          .filter(Boolean)
          .map((u) => normalizeHost(String(u).replace(/^https?:\/\//, "").split("/")[0]))
          .filter((h) => h && h !== "")
      );
    } catch {
      mainHosts = new Set(["ofoghplus.ir"]);
    }
    mainHosts.add("localhost");
    mainHosts.add("127.0.0.1");
    if (mainHosts.has(host)) return NextResponse.next();

    // آیا زیردامنهٔ پلتفرم است؟ (مثل anything.ofoghplus.ir — خودِ /shop مدیریتش می‌کند)
    for (const mh of mainHosts) {
      if (host.endsWith("." + mh)) return NextResponse.next();
    }

    // کش ۵ دقیقه‌ای
    // FIX(r26-double-slash): اسلاگ خالی (دامنهٔ ناشناخته) نباید rewrite شود —
    // قبلاً `/shop/${""}${pathname}` یعنی /shop//pricing تولید می‌شد (308 + soft-404)
    const cached = domainCache.get(host);
    if (cached && Date.now() - cached.at < DOMAIN_CACHE_TTL_MS) {
      // Task 3-d — دامنهٔ فروشگاهِ معلق هم ۵۰۳ می‌گیرد (کش تعلیق ۳۰ثانیه‌ای)
      if (cached.slug && (await isSuspended(cached.slug))) {
        return suspendedPage(null);
      }
      if (!cached.slug) return NextResponse.next();
      return NextResponse.rewrite(new URL(`/shop/${cached.slug}${req.nextUrl.pathname === "/" ? "" : req.nextUrl.pathname}${req.nextUrl.search}`, req.url));
    }

    // دامنهٔ اختصاصیِ متصل و فعال؟
    const store = await db.storefront.findFirst({
      where: { customDomain: host, isActive: true },
      select: { slug: true, status: true, title: true },
    });
    if (!store) {
      // دامنهٔ ناشناخته — هیچ تداخلی با سایت اصلی ندارد؛ عبور
      // FIX(v42-leak): کش دامنه‌های ناشناخته سقف دارد — قبلاً هر Host تصادفی
      // یک entry دائمی می‌ساخت (رشد بی‌نهایت Map در حافظهٔ سرور ۴GB)
      if (domainCache.size > 512) {
        const now = Date.now();
        for (const [k, v] of domainCache) {
          if (now - v.at >= DOMAIN_CACHE_TTL_MS) domainCache.delete(k);
        }
        if (domainCache.size > 512) domainCache.clear();
      }
      domainCache.set(host, { slug: "", at: Date.now() });
      return NextResponse.next();
    }

    // Task 3-d — فروشگاه معلق: دامنهٔ اختصاصی هم آفلاین می‌شود (۵۰۳)
    if (store.status === "suspended") {
      domainCache.set(host, { slug: store.slug, at: Date.now(), suspended: true });
      return suspendedPage(store.title);
    }

    domainCache.set(host, { slug: store.slug, at: Date.now() });

    // صفحهٔ اصلی دامنه → صفحهٔ فروشگاه؛ بقیهٔ مسیرها (مثل /p/[pid]) با همان slug
    const target = new URL(
      `/shop/${store.slug}${req.nextUrl.pathname === "/" ? "" : req.nextUrl.pathname}${req.nextUrl.search}`,
      req.url
    );
    return NextResponse.rewrite(target);
  } catch {
    // هر خطایی — شفاف عبور بده؛ سایت اصلی نباید قفل شود
    return NextResponse.next();
  }
}
