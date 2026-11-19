import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSiteUrl } from "@/lib/seo";

// ═══ Task 3-g — sitemap اختصاصی هر فروشگاه: /shop/{slug}/sitemap.xml ═══
// صفحهٔ اصلی + بلاگ + کالاها + مقاله‌های منتشرشده با lastModified واقعی —
// استقرار Google-indexing برای سایت‌های ساخته‌شده با سایت‌ساز.
//
// چرا route handler و نه sitemap.ts؟ در Next.js 16 تابع پیش‌فرضِ
// app/shop/[slug]/sitemap.ts (بدون generateSitemaps) بدون آرگومان صدا
// زده می‌شود (params در دسترس نیست → خطای ۵۰۰)؛ route handler با
// ctx.params هم در Turbopack و هم در build استاندارد کار می‌کند.
// robots.ts دامنهٔ /shop/ را مسدود نمی‌کند (Allow: /).

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // SSR کامل — بدون کش استاتیک

/** گریزاندن XML — امنیت خروجی */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface SitemapEntry {
  loc: string;
  lastmod: Date;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;

    // فروشگاه ناشناس/غیرفعال → sitemap خالی (نه خطا — گوگل URL مرده نگه نمی‌دارد)
    // FIX(SEO-3c): فروشگاه «معلق» هم باید sitemap خالی بدهد — صفحاتش ۵۰۳
    // می‌شوند (middleware) و خروجی sitemap نباید پر از URL مرده باشد؛
    // robots.txt هم فقط فروشگاه‌های غیرمعلق را معرفی می‌کند (هم‌راستاسازی).
    // FIX(SEO/GEO — ریسک حذف از ایندکس): کوئری فروشگاه دیگر خطای DB را نمی‌بلعد؛
    // خطای موقت به 503 (بیرونی‌ترین catch) می‌رود تا گوگل بعداً دوباره بیاید،
    // نه sitemap خالیِ 200 (که مثل «حذف همهٔ URLها» تفسیر می‌شود).
    const storefront = await db.storefront
      .findUnique({
        where: { slug },
        select: { id: true, slug: true, tenantId: true, updatedAt: true, isActive: true, status: true },
      })
      .catch(() => {
        throw new Error("DB_ERROR_STOREFRONT_SITEMAP");
      });

    if (!storefront || !storefront.isActive || storefront.status === "suspended") {
      const empty =
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';
      return new NextResponse(empty, {
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      });
    }

    const base = (await getSiteUrl()).replace(/\/+$/, "");
    const shopBase = `${base}/shop/${encodeURIComponent(storefront.slug)}`;

    const entries: SitemapEntry[] = [
      { loc: shopBase, lastmod: storefront.updatedAt, changefreq: "weekly", priority: 1 },
      { loc: `${shopBase}/blog`, lastmod: storefront.updatedAt, changefreq: "weekly", priority: 0.8 },
    ];

    // مقاله‌های منتشرشدهٔ بلاگ (Task 3-g)
    try {
      const posts = await db.storefrontPost.findMany({
        where: { storefrontId: storefront.id, status: "PUBLISHED" },
        orderBy: [{ publishedAt: "desc" }],
        take: 500,
        select: { slug: true, updatedAt: true },
      });
      for (const p of posts) {
        entries.push({
          loc: `${shopBase}/blog/${encodeURIComponent(p.slug)}`,
          lastmod: p.updatedAt,
          changefreq: "monthly",
          priority: 0.7,
        });
      }
    } catch {
      /* جدول در دسترس نبود — ادامه با کالاها */
    }

    // کالاهای عمومی فروشگاه (همان شرط getStorefrontProducts: حذف‌شده‌ها خارج)
    // FIX(SEO-3c باگ ۸): کالاهای مخفی‌شده توسط مالک (showInStore=false) از
    // sitemap نشت می‌کردند — صفحهٔ تک‌کالا برایشان 404 می‌دهد ولی URLشان در
    // sitemap می‌ماند → خطای «Submitted URL not found (404)» در سرچ‌کنسول.
    // دو حالت مجاز: «بدون متا» یا «showInStore=true» (همان منطق صفحهٔ کالا).
    try {
      const products = await db.product.findMany({
        where: {
          tenantId: storefront.tenantId,
          deletedAt: null,
          OR: [
            { storefrontMeta: null },
            { storefrontMeta: { showInStore: true } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { id: true, updatedAt: true },
      });
      for (const p of products) {
        entries.push({
          loc: `${shopBase}/p/${encodeURIComponent(p.id)}`,
          lastmod: p.updatedAt,
          changefreq: "weekly",
          priority: 0.6,
        });
      }
    } catch {
      /* بهترین تلاش */
    }

    const body =
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      entries
        .map(
          (e) =>
            `  <url><loc>${xmlEscape(e.loc)}</loc><lastmod>${e.lastmod.toISOString()}</lastmod>` +
            `<changefreq>${e.changefreq}</changefreq><priority>${e.priority.toFixed(1)}</priority></url>`
        )
        .join("\n") +
      "\n</urlset>";

    return new NextResponse(body, {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  } catch (error) {
    console.error("[storefront sitemap] error:", error instanceof Error ? error.message : error);
    // FIX(SEO/GEO — ریسک حذف از ایندکس): خطای DB/رندر → 503 (retryLater) به‌جای
    // sitemap خالی با کد 200 — گوگل 503 را «موقت» می‌گیرد و نقشهٔ قبلی را نگه
    // می‌دارد؛ sitemap خالیِ 200 یعنی «هیچ URLی معتبر نیست».
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
      { status: 503, headers: { "Content-Type": "application/xml; charset=utf-8", "Retry-After": "600" } }
    );
  }
}
