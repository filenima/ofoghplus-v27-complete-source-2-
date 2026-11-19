import type { MetadataRoute } from "next";
import { DEFAULT_BRANDING, getBrandingSettings } from "@/lib/system-settings";
import { db } from "@/lib/db";

// FIX(v42-seo): تازه‌سازی ساعتی — بدون این، در build فریز می‌شود و
// مقالات جدید تا build بعدی وارد sitemap نمی‌شوند
export const revalidate = 3600;

/**
 * /robots.txt — دستورالعمل‌های خزش موتورهای جستجو + موتورهای هوش مصنوعی (GEO)
 *
 * نکته: این فایل در مسیر `app/robots.ts` قرار دارد و Next.js به‌صورت خودکار
 * مسیر `/robots.txt` را به آن نگاشت می‌کند. اگر فایل استاتیک `public/robots.txt`
 * هم وجود داشته باشد، فایل داینامیک اینجا اولویت دارد.
 *
 * v35 (GEO): ربات‌های هوش مصنوعی به‌صورت صریح و مجاز معرفی می‌شوند تا در
 * پاسخ‌های AI (ChatGPT/Claude/Perplexity/Gemini) نام برند دقیق نقل شود:
 *   GPTBot, OAI-SearchBot (OpenAI) · ClaudeBot, Claude-Web (Anthropic)
 *   PerplexityBot · Google-Extended (Gemini) · CCBot (Common Crawl)
 *   Amazonbot · Applebot-Extended · cohere-ai
 * v20-S (AI-SEO): Bytespider (ByteDance) · Meta-ExternalAgent (Meta AI)
 *   DuckAssistBot (DuckDuckGo) · YouBot (You.com) · omgili · AI2Bot
 *   (Allen Institute) · Diffbot اضافه شدند.
 *
 * FIX(SEO-3c باگ ۶ — کشف sitemap فروشگاه‌ها): sitemap اختصاصی هر فروشگاه
 * (/shop/{slug}/sitemap.xml — شامل کالاها و مقاله‌های مستأجر) در هیچ‌جا معرفی
 * نشده بود؛ گوگل فقط URLهای سطح یک فروشگاه را از sitemap اصلی می‌دید و
 * صفحات تک‌کالا/مقالهٔ مستأجر عملاً «یتیم» بودند. حالا robots.txt نقشهٔ
 * سایت هر فروشگاهِ فعال را صریحاً معرفی می‌کند (پروتکل: چند خط Sitemap مجاز).
 * سقف ۲۰۰ فروشگاه برای حفظ اندازهٔ سالم robots.txt.
 */
const MAX_SHOP_SITEMAPS = 200;

export default async function robots(): Promise<MetadataRoute.Robots> {
  // دامنه از تنظیمات برندینگ سوپرادمین (وایت‌لیبل) — پس از تغییر دامنه،
  // sitemap و host همین‌جا هم به‌روز می‌شوند.
  let domain = DEFAULT_BRANDING.domain;
  try {
    domain = (await getBrandingSettings()).domain || DEFAULT_BRANDING.domain;
  } catch {
    // fallback به دامنه‌ی پیش‌فرض
  }
  const siteUrl = `https://${domain}`;

  // sitemapهای فروشگاه‌های فعال — معرفی صریح برای کشف کالاها/مقاله‌های مستأجر
  const sitemaps: string[] = [`${siteUrl}/sitemap.xml`];
  try {
    const shops = await db.storefront.findMany({
      where: { isActive: true, status: { not: "suspended" } },
      select: { slug: true },
      orderBy: { updatedAt: "desc" },
      take: MAX_SHOP_SITEMAPS,
    });
    for (const sf of shops) {
      sitemaps.push(
        `${siteUrl}/shop/${encodeURIComponent(sf.slug)}/sitemap.xml`
      );
    }
  } catch {
    // DB در دسترس نبود — فقط sitemap اصلی معرفی می‌شود
  }

  // مسیرهای خصوصی — برای همهٔ خزنده‌ها ممنوع
  const disallowPrivate = ["/api/", "/portal/", "/uploads/", "/embed/", "/reset-password", "/superadmin"];

  // FIX(v42-seo): og:image داینامیک مقالات/شهرها زیر /api/og است — بدون Allow،
  // گوگل‌بات تصویر شیرینگ Discover/نتایج را fetch نمی‌کرد
  const allowPublicApi = ["/api/og"];

  // v20-S: استثناهای عمومیِ /uploads/ — خط‌های Allow باید «قبل از» Disallow: /uploads/
  // بیایند (در robots.txt، Allow طولانی‌ترِ مقدم بر Disallow کوتاه‌تر برنده است):
  //   /uploads/storefront/ → بنر/لوگوی عمومی فروشگاه‌ها (og:image و JSON-LD)
  //   /uploads/logo-      → لوگوهای برندینگ آپلودی (زنجیرهٔ لوگو)
  const allowPublicUploads = ["/uploads/storefront/", "/uploads/logo-"];

  return {
    rules: [
      {
        // همهٔ خزنده‌ها — دسترسی کامل به محتوای عمومی
        userAgent: "*",
        allow: ["/", "/logo.png", ...allowPublicUploads, ...allowPublicApi],
        disallow: disallowPrivate,
      },
      {
        // ─── R24-7 (Agent 1): خزنده‌های تجاریِ پرسرعت — crawl-delay ───
        // Bytespider (ByteDance) و Diffbot داده‌کاوی سنگین می‌کنند و برای
        // پاسخ‌های AI مصرف نیستند؛ محدودیت ۱۰ ثانیه‌ای بار سرور را کنترل
        // می‌کند. موتورهای پاسخ‌گوی واقعی (GPTBot/Claude/Perplexity/...)
        // در گروه پایین بدون محدودیت باقی‌اند.
        userAgent: ["Bytespider", "Diffbot"],
        allow: ["/", "/logo.png", ...allowPublicUploads, ...allowPublicApi],
        disallow: disallowPrivate,
        crawlDelay: 10,
      },
      {
        // ─── ربات‌های هوش مصنوعی (GEO — Generative Engine Optimization) ───
        // به‌صورت صریح مجاز اعلام می‌شوند؛ محتوای بلاگ برای نقل‌قول آزاد است (llms.txt)
        userAgent: [
          "GPTBot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "ClaudeBot",
          "Claude-Web",
          "Claude-SearchBot",
          // R26-TS: «anthropic-ai» — توکن UA قدیمی/مکمل Anthropic که برخی
          // دیتاست‌ها و ابزارها هنوز می‌فرستند؛ صریحاً مجاز (GEO).
          "anthropic-ai",
          "PerplexityBot",
          "Perplexity-User",
          "Google-Extended",
          "CCBot",
          "Amazonbot",
          "Applebot-Extended",
          "cohere-ai",
          // v20-S (AI-SEO): ربات‌های مولد جدید — نقل‌قول برند در پاسخ‌های AI
          "Meta-ExternalAgent", // Meta AI
          "DuckAssistBot", // DuckDuckGo AI answers
          "YouBot", // You.com
          "omgili", // omgili aggregator
          "AI2Bot", // Allen Institute for AI
          // R24-7: Bytespider/Diffbot به گروه اختصاصی crawl-delay منتقل شدند
        ],
        allow: ["/", "/logo.png", ...allowPublicUploads, ...allowPublicApi],
        disallow: disallowPrivate,
      },
    ],
    // FIX(SEO-3c باگ ۶): آرایهٔ sitemap — نقشهٔ اصلی + نقشهٔ هر فروشگاه فعال
    sitemap: sitemaps,
    host: siteUrl,
  };
}
