import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getStorefrontBySlug, getStorefrontProducts, decryptCardNumber, getTenantName } from "@/lib/storefront-auth";
import { formatCardNumberForDisplay, type StorefrontProductDTO } from "@/lib/storefront";
import { getSiteUrl, safeJsonLd } from "@/lib/seo";
import { ShopPage } from "@/components/storefront/shop-page";
import { getBusinessType } from "@/lib/storefront-wizard";
import { parseBlocksDoc, type SfBlock } from "@/lib/storefront-blocks";

// افق پلاس (R15-C) — صفحه‌ی عمومی فروشگاه آنلاین هر کسب‌وکار: /shop/[slug]
// Server Component: SEO کامل (generateMetadata + JSON-LD Store/LocalBusiness) و
// داده اولیه SSR برای مشتری؛ کامپوننت کلاینت فقط تعامل را اضافه می‌کند.

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * R15-G (T2/ایندکس): آدرس پایهٔ canonical از تنظیمات برندینگ (getSiteUrl —
 * همان منبع واحد sitemap/robots/llms.txt). قبلاً از هدر درخواست ساخته می‌شد که
 * در استقرار دودامنه (ofoghplus.ir + hoosh.nobatime.ir) یعنی canonical روی
 * هر هاست متفاوت و تقسیم سیگنال ایندکس؛ در سندباکس هم canonical به
 * localhost:3000 اشاره می‌کرد. حالا canonical همیشه دامنهٔ اصلی برند است.
 */
async function resolveBaseUrl(): Promise<string> {
  return (await getSiteUrl()).replace(/\/+$/, "");
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  // FIX(SEO/GEO — ریسک حذف از ایندکس): خطای موقت DB نباید «فروشگاه یافت نشد»
  // (200 + noindex) بسازد — noindex روی 200 یعنی حذف از ایندکس؛ خطا → 5xx می‌ماند.
  const storefront = await getStorefrontBySlug(slug);
  if (!storefront || !storefront.isActive) {
    notFound();
  }
  // Task 3-d — فروشگاه معلق: noindex + عنوان تعلیق (middleware معمولاً ۵۰۳ می‌دهد؛
  // این مسیر fallback برای وقتی است که کش ۳۰ثانیه‌ای middleware هنوز تازه است)
  if (storefront.status === "suspended") {
    return {
      title: "فروشگاه موقتاً تعلیق شده است",
      robots: { index: false, follow: false },
    };
  }

  const base = await resolveBaseUrl();
  const canonical = `${base}/shop/${storefront.slug}`;
  const title = storefront.seoTitle?.trim() || `${storefront.title} | فروشگاه آنلاین`;
  const description =
    storefront.seoDescription?.trim() ||
    storefront.description?.trim() ||
    `خرید آنلاین از ${storefront.title} — ارسال سفارش با یک کلیک و پرداخت امن کارت‌به‌کارت.`;
  // FIX(SEO S4): og:image از ژنراتور داینامیک /api/og — قبلاً هیچ og:image‌ای
  // برای صفحات فروشگاه‌ها منتشر نمی‌شد (پیش‌نمایش بی‌تصویر در شبکه‌های اجتماعی).
  const ogImage = `${base}/api/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description.slice(0, 90))}&type=shop`;

  return {
    title,
    description,
    alternates: { canonical },
    // هر فروشگاه عمومی و ایندکس‌پذیر است (robots: index,follow)
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "fa_IR",
      siteName: storefront.title,
      url: canonical,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function StorefrontShopPage({ params }: PageProps) {
  const { slug } = await params;
  const storefront = await getStorefrontBySlug(slug);
  if (!storefront || !storefront.isActive) {
    notFound();
  }

  // Task 3-d — تعلیق سوپرادمینی: سایت عمومی آفلاین (middleware کد ۵۰۳ می‌دهد؛
  // این رندر fallback مستقیم از DB است تا حتی در پنجرهٔ کش هم محتوا نیاید)
  if (storefront.status === "suspended") {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <p className="text-5xl mb-4" aria-hidden>⏸️</p>
          <h1 className="text-lg font-bold mb-3">این فروشگاه موقتاً تعلیق شده است</h1>
          <p className="text-sm text-muted-foreground leading-7">
            {storefront.title} — در حال حاضر این سایت در دسترس نیست.
            <br />
            لطفاً بعداً مراجعه کنید یا با پشتیبانی تماس بگیرید.
          </p>
        </div>
      </main>
    );
  }

  // شمارش بازدید — fire-and-forget (بدون بلاک رندر)
  void db.storefront
    .update({ where: { id: storefront.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {
      /* آمار بازدید بهترین تلاش است */
    });

  const products = await getStorefrontProducts(storefront.tenantId);
  const tenantName = await getTenantName(storefront.tenantId);
  const base = await resolveBaseUrl();
  const canonical = `${base}/shop/${storefront.slug}`;

  // R16 — نرخ ارز برای نمایش چندارزی + بنر هوشمند بر اساس نوع کسب‌وکار
  let usdRateToman: number | null = null;
  let cnyRateToman: number | null = null;
  try {
    const rates = await db.exchangeRateHistory.findMany({
      where: { fromCurrency: { in: ["USD", "CNY"] }, toCurrency: "IRR" },
      orderBy: { recordedAt: "desc" },
      take: 20,
    });
    const usd = rates.find((r) => r.fromCurrency === "USD");
    const cny = rates.find((r) => r.fromCurrency === "CNY");
    // rate به ریال است → تقسیم بر ۱۰ = تومان
    if (usd && Number(usd.rate) > 0) usdRateToman = Math.trunc(Number(usd.rate) / 10);
    if (cny && Number(cny.rate) > 0) cnyRateToman = Math.trunc(Number(cny.rate) / 10);
  } catch {
    /* مکمل است — صفحه بدون نرخ هم کار می‌کند */
  }

  // بنر: عکس اختصاصی مالک اگر گذاشته باشد؛ وگرنه بنر سینمایی نوع کسب‌وکار
  let bannerSrc: string | null = null;
  try {
    const content = storefront.content ? JSON.parse(storefront.content) : null;
    if (content?.banner?.image && typeof content.banner.image === "string") {
      bannerSrc = content.banner.image;
    }
  } catch {
    /* ignore */
  }
  if (!bannerSrc) {
    const cfg = getBusinessType(storefront.businessType);
    bannerSrc = cfg ? `/banners/${cfg.banner}.avif` : "/banners/general.avif";
  }

  const shop = {
    slug: storefront.slug,
    title: storefront.title,
    description: storefront.description,
    template: storefront.template,
    accentColor: storefront.accentColor,
    phone: storefront.phone,
    address: storefront.address,
    city: storefront.city,
    lat: storefront.lat,
    lng: storefront.lng,
    socialInstagram: storefront.socialInstagram,
    socialTelegram: storefront.socialTelegram,
    socialWhatsapp: storefront.socialWhatsapp,
    cardNumber: formatCardNumberForDisplay(decryptCardNumber(storefront.cardNumberEnc)),
    cardHolderName: storefront.cardHolderName,
    cardImage: storefront.cardImage,
    tenantName,
    // R16
    businessType: storefront.businessType,
    announcement: storefront.announcement,
    ticketEnabled: storefront.ticketEnabled,
    discountActive: !!(storefront.discountCode && storefront.discountPercent),
    discountPercent: storefront.discountCode && storefront.discountPercent ? storefront.discountPercent : null,
    content: storefront.content ? safeParseJson(storefront.content) : null,
    // Task 1-c — فقط وجود درگاه افشا می‌شود (merchantId برای عمومی نمی‌آید)
    hasGateway: !!storefront.gatewayMerchantId,
  };

  // JSON-LD — LocalBusiness + Store (زیرنوع LocalBusiness) با geo و آدرس
  // FIX(v20-S): @id صفحه‌محور + image (لوگو/بنر فروشگاه) + sameAs (شبکه‌های اجتماعی)
  const sameAs = [
    storefront.socialInstagram,
    storefront.socialTelegram,
    storefront.socialWhatsapp,
  ].filter((u): u is string => !!u && /^https?:\/\//.test(u));
  const storeImages = [storefront.logoImage || null, bannerSrc || null]
    .filter((u): u is string => !!u)
    .map((u) => (u.startsWith("http") ? u : `${base}${u}`));
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "Store"],
    "@id": `${canonical}#store`,
    name: storefront.title,
    url: canonical,
    description:
      storefront.seoDescription?.trim() ||
      storefront.description?.trim() ||
      `فروشگاه آنلاین ${storefront.title}`,
  };
  if (storeImages.length > 0) jsonLd.image = storeImages;
  if (sameAs.length > 0) jsonLd.sameAs = sameAs;
  if (storefront.phone) jsonLd.telephone = storefront.phone;
  if (storefront.address || storefront.city) {
    jsonLd.address = {
      "@type": "PostalAddress",
      ...(storefront.address ? { streetAddress: storefront.address } : {}),
      ...(storefront.city ? { addressLocality: storefront.city } : {}),
      addressCountry: "IR",
    };
  }
  if (typeof storefront.lat === "number" && typeof storefront.lng === "number") {
    jsonLd.geo = {
      "@type": "GeoCoordinates",
      latitude: storefront.lat,
      longitude: storefront.lng,
    };
  }
  // FIX(3-b-s2): محصولات از LocalBusiness جدا شدند — itemListElement پراپرتی
  // معتبری روی LocalBusiness/Store نیست (اسکیما.org) → اسکیمای ItemList مستقل.
  // FIX(SEO-3c باگ ۷): هر Product حالا url صفحهٔ اختصاصی خودش (/shop/{slug}/p/{id})
  // دارد — قبلاً ItemList کالاها را بدون هیچ لینکی منتشر می‌کرد؛ گوگل نه از
  // JSON-LD و نه از UI (کلیک‌ها window.location هستند نه <a>) مسیر تک‌کالا را
  // کشف نمی‌کرد. url + itemprop ساده‌ترین سیگنال کشف/اینترلینک است.
  const itemListLd: Record<string, unknown> | null =
    products.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `محصولات ${storefront.title}`,
          numberOfItems: Math.min(products.length, 20),
          itemListElement: products.slice(0, 20).map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "Product",
              name: p.name,
              url: `${base}/shop/${encodeURIComponent(storefront.slug)}/p/${encodeURIComponent(p.id)}`,
              ...(p.description ? { description: p.description } : {}),
              ...(p.imageUrl ? { image: p.imageUrl } : {}),
              offers: {
                "@type": "Offer",
                // v20-S: قیمت به ریال — priceCurrency همان IRR است؛ قبلاً تومان
                // (priceRial/10) با IRR ناسازگار بود و قیمت ۱۰ برابر کوچک نمایش می‌یافت
                price: String(p.priceRial),
                priceCurrency: "IRR",
                availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
                url: `${base}/shop/${encodeURIComponent(storefront.slug)}/p/${encodeURIComponent(p.id)}`,
              },
            },
          })),
        }
      : null;

  const serializedProducts: StorefrontProductDTO[] = products;

  // R24-4 — بلوک‌های منتشرشدهٔ ویرایشگر بلوکی (اگر مالک با ویرایشگر بلوکی صفحه چیده باشد)
  const blocksDoc = parseBlocksDoc(storefront.blocksJson);
  const publishedBlocks: SfBlock[] | null = blocksDoc && blocksDoc.blocks.length > 0 ? blocksDoc.blocks : null;

  // R15-G (T2/ایندکس): BreadcrumbList — مسیر ناوبری برای گوگل (rich result)
  // و پیوند ساخت‌یافته با صفحهٔ اصلی برند.
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "خانه", item: base || "/" },
      { "@type": "ListItem", position: 2, name: storefront.title, item: canonical },
    ],
  };

  return (
    <main className="min-h-screen bg-background">
      {/* FIX(3-a-h2): safeJsonLd — نام کالا/عنوان مالک‌ویرایش با </script> نمی‌تواند از بلوک JSON-LD خارج شود (XSS ذخیره‌شده) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      {/* FIX(3-b-s2): فهرست محصولات به‌صورت ItemList مستقل — پراپرتی معتبر schema.org */}
      {itemListLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(itemListLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }}
      />
      <ShopPage
        slug={slug}
        initialShop={shop}
        initialProducts={serializedProducts}
        bannerSrc={bannerSrc}
        usdRateToman={usdRateToman}
        cnyRateToman={cnyRateToman}
        blocks={publishedBlocks}
      />
    </main>
  );
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
