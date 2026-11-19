import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getStorefrontBySlug, getStorefrontProducts, applyProductDiscount } from "@/lib/storefront-auth";
import { rialToTomanLabel, type StorefrontProductDTO } from "@/lib/storefront";
import { toPersianDigits } from "@/lib/persian";
import { getSiteUrl, safeJsonLd } from "@/lib/seo";
import { getBusinessType } from "@/lib/storefront-wizard";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { ProductReviews } from "@/components/storefront/product-reviews";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { CinematicBanner } from "@/components/storefront/cinematic-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  ChevronLeft,
  MessageCircle,
  Package,
  Phone,
  ShieldCheck,
  Star,
  Store,
  Truck,
  Weight,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// Task 1-b — صفحهٔ تک‌محصول فروشگاه: /shop/[slug]/p/[pid]
// ═══════════════════════════════════════════════════════════════
// SSR کامل + JSON-LD Product + Breadcrumb + کالاهای مرتبط + CTA چسبان موبایل.
// دکمهٔ سفارش → صفحهٔ فروشگاه (جریان سبد خرید/ثبت سفارش همان‌جاست — یک منبع حقیقت)
//
// Task 4 — بازسازی کامل:
//  • pid هم id خام است هم اسلاگ لاتین کالا (URL سئوپسند)
//  • توضیحات HTML ویرایشگر غنی، پاک‌سازی‌شده رندر می‌شود (قبلاً تگ‌ها دیده می‌شد)
//  • گالری تصاویر تعاملی (قبلاً اصلاً نمایش داده نمی‌شد)
//  • تخفیف اختصاصی کالا + سئوی متای اختصاصی + برچسب‌ها + وزن/ارسال
//  • FIX JSON-LD: price به ریال با IRR (قبلاً تومان با IRR — ۱۰ برابر خطا) + availability واقعی

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string; pid: string }>;
}

async function loadContext(slug: string, pid: string) {
  // FIX(SEO/GEO — ریسک حذف از ایندکس): قبلاً getStorefrontBySlug با
  // .catch(() => null) خطای موقت دیتابیس (SQLite busy/timeout) را می‌بلعید و
  // کالای «موجود» به صفحهٔ 200 + noindexِ «کالا یافت نشد» تبدیل می‌شد. گوگل
  // noindex روی 200 را جدی می‌گیرد و URL را از ایندکس حذف می‌کند؛ خطای 5xx
  // اما «بعداً دوباره بیا» تفسیر می‌شود. حالا خطای DB پرتاب می‌شود (500) و
  // فقط «واقعاً نبودن» به not-found می‌رود.
  const storefront = await getStorefrontBySlug(slug);
  if (!storefront || !storefront.isActive) return null;

  // محصولِ همین tenant — شامل حذف‌شده‌ها نیست.
  // Task 4: ابتدا با id (cuid) می‌گیریم؛ اگر نبود با اسلاگ لاتین.
  const baseSelect = {
    id: true,
    name: true,
    description: true,
    imageUrl: true,
    categoryId: true,
    barcode: true,
    sku: true,
    slug: true,
    salePrice: true,
    createdAt: true,
    category: { select: { name: true } },
    storefrontMeta: {
      select: {
        discountPercent: true,
        seoTitle: true,
        seoDescription: true,
        galleryJson: true,
        tagsJson: true,
        weightGrams: true,
        shippingNote: true,
        showInStore: true,
      },
    },
  } as const;

  let product = await db.product.findFirst({
    where: { id: pid, tenantId: storefront.tenantId, deletedAt: null },
    select: baseSelect,
  });
  if (!product) {
    product = await db.product.findFirst({
      where: { slug: pid, tenantId: storefront.tenantId, deletedAt: null },
      select: baseSelect,
    });
  }
  if (!product) return null;
  // کالای مخفی‌شده توسط مالک (showInStore=false) نباید از مسیر مستقیم عمومی شود —
  // همان منطق getStorefrontProducts/priceOrderItemsServerSide (نشت محتوای منتشرنشده)
  if (product.storefrontMeta?.showInStore === false) return null;
  return { storefront, product };
}

/** تجزیهٔ امن JSON آرایه‌ای */
function parseJsonArray(raw: string | null | undefined, max: number): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string").slice(0, max);
  } catch {
    /* ignore */
  }
  return [];
}

/** متن ساده از HTML (برای متا دیسکریپشن) */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, pid } = await params;
  const ctx = await loadContext(slug, pid);
  // FIX(SEO — soft-404 با کد ۲۰۰): قبلاً fallback «کالا یافت نشد» + noindex برمی‌گشت؛
  // چون کامپوننت صفحه بعد از استریم شدن head با notFound() می‌کرد، وضعیت HTTP
  // همان ۲۰۰ می‌ماند (soft-404). notFound() در خودِ generateMetadata قبل از
  // استریم اجرا می‌شود و کد ۴۰۴ واقعی می‌دهد → حذف سریع‌تر و تمیزتر از ایندکس.
  if (!ctx) notFound();

  const { storefront, product } = ctx;
  const base = (await getSiteUrl()).replace(/\/+$/, "");
  // canonical با شناسهٔ پایدار (id) — اسلاگ قابل تغییر است و canonical نباید بشکند
  const canonical = `${base}/shop/${storefront.slug}/p/${product.id}`;
  const { discountPercent, displayPriceRial } = applyProductDiscount(
    product.salePrice,
    product.storefrontMeta?.discountPercent ?? null
  );
  const priceToman = rialToTomanLabel(discountPercent ? displayPriceRial : product.salePrice ?? 0);
  const title = product.storefrontMeta?.seoTitle?.trim() || `${product.name} | ${storefront.title}`;
  const description =
    (product.storefrontMeta?.seoDescription?.trim() || htmlToPlainText(product.description ?? "").slice(0, 155)) ||
    `خرید ${product.name} از ${storefront.title} — ${priceToman} — سفارش آنلاین و پرداخت امن.`;
  // FIX(SEO-3c باگ ۹): کالای بدون تصویر هیچ og:image‌ای نداشت → پیش‌نمایش بی‌تصویر
  // در تلگرام/واتس‌اپ/توئیتر. حالا مثل صفحهٔ فروشگاه و مقالهٔ بلاگ فروشگاه،
  // تصویر داینامیک /api/og (نام کالا + قیمت) جایگزین می‌شود.
  const ogImage = product.imageUrl
    ? product.imageUrl.startsWith("http")
      ? product.imageUrl
      : `${base}${product.imageUrl}`
    : `${base}/api/og?title=${encodeURIComponent(product.name)}&description=${encodeURIComponent(description.slice(0, 90))}&type=shop`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "fa_IR",
      siteName: storefront.title,
      url: canonical,
      // FIX(SEO-3c باگ ۹): تصویر همیشه حاضر — کالا یا ژنراتور داینامیک
      images: [{ url: ogImage, width: 1200, height: 630, alt: product.name }],
    },
    // FIX(SEO-3c باگ ۹): کارت توییتر هم مثل صفحهٔ فروشگاه — summary_large_image
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function StorefrontProductPage({ params }: PageProps) {
  const { slug, pid } = await params;
  const ctx = await loadContext(slug, pid);
  if (!ctx) notFound();

  const { storefront, product } = ctx;
  const base = (await getSiteUrl()).replace(/\/+$/, "");
  const storeUrl = `/shop/${storefront.slug}`;
  const canonical = `${base}/shop/${storefront.slug}/p/${product.id}`;
  const biz = getBusinessType(storefront.businessType);
  const categoryName = product.category?.name ?? null;

  // نرخ ارز (همان الگوی صفحهٔ فروشگاه)
  let usdRateToman: number | null = null;
  try {
    const usd = await db.exchangeRateHistory.findFirst({
      where: { fromCurrency: "USD", toCurrency: "IRR" },
      orderBy: { recordedAt: "desc" },
    });
    if (usd && Number(usd.rate) > 0) usdRateToman = Math.trunc(Number(usd.rate) / 10);
  } catch {
    /* مکمل */
  }

  // Task 4 — داده‌های فروشگاهی کالا
  const meta = product.storefrontMeta ?? null;
  const { discountPercent, displayPriceRial } = applyProductDiscount(product.salePrice, meta?.discountPercent ?? null);
  const gallery = parseJsonArray(meta?.galleryJson ?? null, 24);
  const tags = parseJsonArray(meta?.tagsJson ?? null, 15);
  const effectivePriceRial = discountPercent ? displayPriceRial : (product.salePrice?.toString() ?? "0");
  const usdPrice = usdRateToman && effectivePriceRial !== "0" ? Number(effectivePriceRial) / 10 / usdRateToman : null;

  // موجودی واقعی برای availability (همان منطق getStorefrontProducts)
  const stockRow = await db.stockItem
    .aggregate({ where: { tenantId: storefront.tenantId, productId: product.id }, _sum: { quantity: true } })
    .catch(() => null);
  const stockKnown = !!stockRow;
  const stockQty = stockRow?._sum.quantity ?? 0;
  const inStock = !stockKnown || stockQty > 0;

  // کالاهای مرتبط — همان دسته، حداکثر ۸
  const allProducts = await getStorefrontProducts(storefront.tenantId);
  const related: StorefrontProductDTO[] = categoryName
    ? allProducts.filter((p) => p.id !== product.id && p.category === categoryName).slice(0, 8)
    : [];

  const priceToman = product.salePrice ? rialToTomanLabel(effectivePriceRial) : null;

  // v20-D — نظرات تأییدشدهٔ همین کالا (برای بخش نظرات + JSON-LD AggregateRating)
  const [reviewsAgg, sampleReviews] = await Promise.all([
    db.storefrontReview.aggregate({
      where: { storefrontId: storefront.id, productId: product.id, status: "APPROVED" },
      _count: { _all: true },
      _avg: { rating: true },
    }),
    db.storefrontReview.findMany({
      where: { storefrontId: storefront.id, productId: product.id, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { rating: true, comment: true, authorName: true, createdAt: true },
    }),
  ]);
  const reviewsCount = reviewsAgg._count._all;
  const reviewsAvg = reviewsAgg._avg.rating != null ? Math.round(reviewsAgg._avg.rating * 10) / 10 : 0;

  // JSON-LD Product
  const productLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    ...(product.slug ? { url: canonical } : {}),
    ...(product.description ? { description: htmlToPlainText(product.description).slice(0, 500) } : {}),
    // FIX(SEO-3c باگ ۱۰): «image» برای نتیجهٔ غنی Product لازم است — قبلاً کالای
    // بدون تصویرِ اصلی اصلاً image نمی‌گرفت. حالا: تصویر کالا + گالری؛ اگر هیچ‌کدام
    // نبود، تصویر داینامیک /api/og (همان og:image متا) — حداقل یک تصویر همیشه هست.
    ...(() => {
      const imgs = [product.imageUrl, ...gallery].filter((u): u is string => !!u);
      if (imgs.length > 0) return { image: imgs.slice(0, 8) };
      return {
        image: [
          `${base}/api/og?title=${encodeURIComponent(product.name)}&type=shop`,
        ],
      };
    })(),
    // FIX(3-b-s2): «barcode» پراپرتی معتبر schema.org نیست → mpn (رشتهٔ آزاد)؛
    // gtin13 فقط وقتی ۱۳ رقم باشد معتبر است، وگرنه حذف.
    ...(product.barcode
      ? /^\d{13}$/.test(product.barcode)
        ? { gtin13: product.barcode }
        : { mpn: product.barcode }
      : {}),
    brand: { "@type": "Brand", name: storefront.title },
    // v20-D — امتیاز تجمیعی فقط وقتی حداقل یک نظر تأییدشده وجود دارد (الزام schema.org)
    ...(reviewsCount >= 1
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: reviewsAvg,
            reviewCount: reviewsCount,
            bestRating: 5,
            worstRating: 1,
          },
          review: sampleReviews.map((r) => ({
            "@type": "Review",
            author: { "@type": "Person", name: r.authorName },
            datePublished: r.createdAt.toISOString().slice(0, 10),
            description: htmlToPlainText(r.comment).slice(0, 500),
            reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
          })),
        }
      : {}),
    offers: {
      "@type": "Offer",
      url: canonical,
      // Task 4-FIX — قیمت به ریال با IRR (قبلاً تومان با IRR ثبت می‌شد = ۱۰ برابر خطا)
      price: effectivePriceRial,
      priceCurrency: "IRR",
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: storefront.title },
    },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "خانه", item: base || "/" },
      { "@type": "ListItem", position: 2, name: storefront.title, item: `${base}/shop/${storefront.slug}` },
      ...(categoryName
        ? [{ "@type": "ListItem", position: 3, name: categoryName, item: `${base}/shop/${storefront.slug}?cat=${encodeURIComponent(categoryName)}` }]
        : []),
      { "@type": "ListItem", position: categoryName ? 4 : 3, name: product.name, item: canonical },
    ],
  };

  return (
    <main className="min-h-screen bg-background" dir="rtl">
      {/* FIX(3-a-h2): safeJsonLd — نام کالا مالک‌ویرایش نمی‌تواند از بلوک JSON-LD خارج شود */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(productLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />

      {/* هدر مینیمال فروشگاه */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href={storeUrl} prefetch={false} className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground transition-colors hover:text-primary">
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            <Store className="h-4 w-4" aria-hidden="true" />
            {storefront.title}
          </Link>
          {storefront.announcement ? (
            <span className="hidden truncate text-xs text-muted-foreground sm:block">· {storefront.announcement}</span>
          ) : null}
          {storefront.phone ? (
            <a
              href={`tel:${storefront.phone}`}
              className="ms-auto inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">تماس با فروشگاه</span>
              <span className="sm:hidden">تماس</span>
            </a>
          ) : null}
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 sm:pb-12">
        {/* مسیر */}
        <nav aria-label="مسیر" className="mb-5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link href={storeUrl} prefetch={false} className="transition-colors hover:text-foreground">فروشگاه</Link>
          {categoryName ? (
            <>
              <ChevronLeft className="h-3 w-3" aria-hidden="true" />
              <Link href={`${storeUrl}?cat=${encodeURIComponent(categoryName)}`} prefetch={false} className="transition-colors hover:text-foreground">{categoryName}</Link>
            </>
          ) : null}
          <ChevronLeft className="h-3 w-3" aria-hidden="true" />
          <span className="text-foreground">{product.name}</span>
        </nav>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
          {/* Task 4 — گالری تعاملی تصاویر (تصویر اصلی + گالری) */}
          <div className="space-y-4">
            {product.imageUrl || gallery.length > 0 ? (
              <ProductGallery mainImage={product.imageUrl} gallery={gallery} alt={product.name} />
            ) : (
              <CinematicBanner
                businessType={storefront.businessType}
                title={product.name}
                subtitle={storefront.title}
                badge={categoryName ?? biz?.label ?? null}
                className="aspect-square max-h-none w-full sm:aspect-square"
              />
            )}
          </div>

          {/* مشخصات و خرید */}
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {categoryName ? (
                  <Badge variant="secondary" className="text-[11px]">{categoryName}</Badge>
                ) : null}
                {inStock ? (
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[11px] text-emerald-700">
                    {stockKnown ? `موجودی: ${toPersianDigits(stockQty)}` : "موجود"}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-[11px]">ناموجود</Badge>
                )}
                {reviewsCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                    {toPersianDigits(reviewsAvg)} از ۵ ({toPersianDigits(reviewsCount)} نظر)
                  </span>
                ) : null}
              </div>
              <h1 className="text-2xl font-black leading-snug text-foreground sm:text-3xl">{product.name}</h1>
              {product.description ? (
                // Task 4-FIX — توضیحات کالا HTML ویرایشگر غنی است؛ پاک‌سازی شده رندر می‌شود
                // (قبلاً متن خام با whitespace-pre-line رندر می‌شد و تگ‌ها دیده می‌شد)
                <div
                  className="prose prose-sm max-w-none text-sm leading-7 text-muted-foreground [&_a]:text-primary [&_a]:underline [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-foreground [&_img]:my-3 [&_img]:rounded-xl [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5 [&_blockquote]:border-s-2 [&_blockquote]:border-muted-foreground/25 [&_blockquote]:rounded-e-lg [&_blockquote]:bg-muted/40 [&_blockquote]:py-2 [&_blockquote]:ps-3 [&_table]:w-full [&_table]:text-xs [&_th]:border [&_th]:bg-muted/50 [&_th]:p-2 [&_td]:border [&_td]:p-2"
                  dir="rtl"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.description) }}
                />
              ) : (
                <p className="text-sm leading-7 text-muted-foreground">
                  {product.name} از فروشگاه {storefront.title} — سفارش آنلاین با پرداخت امن و تحویل سریع.
                </p>
              )}
              {tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((t) => (
                    <span key={t} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      #{t}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
                {priceToman ? (
                  <>
                    <span className="text-3xl font-black text-primary">{priceToman}</span>
                    {discountPercent ? (
                      <span className="flex flex-col items-start gap-1">
                        <span className="text-sm font-medium text-muted-foreground line-through">
                          {rialToTomanLabel(product.salePrice)}
                        </span>
                        <Badge className="rounded-full bg-teal-600 text-[11px] text-white">
                          {toPersianDigits(discountPercent)}٪ تخفیف
                        </Badge>
                      </span>
                    ) : null}
                    {usdPrice ? (
                      <span className="text-xs font-medium text-muted-foreground" dir="ltr">
                        ≈ ${usdPrice.toFixed(0)}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                    برای قیمت با فروشگاه تماس بگیرید
                  </span>
                )}
              </div>
              {storefront.discountCode && storefront.discountPercent ? (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                  با کد تخفیف «{storefront.discountCode}» از صفحهٔ فروشگاه، {toPersianDigits(storefront.discountPercent)}٪ ارزان‌تر بخرید
                </p>
              ) : null}
            </div>

            {/* Task 4 — اطلاعات ارسال اختصاصی کالا */}
            {meta?.shippingNote || meta?.weightGrams ? (
              <div className="flex flex-wrap gap-2">
                {meta?.weightGrams ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-3 py-2 text-[11px] font-medium text-muted-foreground">
                    <Weight className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    وزن بسته‌بندی: {toPersianDigits(meta.weightGrams)} گرم
                  </span>
                ) : null}
                {meta?.shippingNote ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-3 py-2 text-[11px] font-medium text-muted-foreground">
                    <Truck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    {meta.shippingNote}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border bg-card p-3">
                <ShieldCheck className="mx-auto h-5 w-5 text-emerald-600" aria-hidden="true" />
                <p className="mt-1.5 text-[10px] font-medium text-muted-foreground">پرداخت امن</p>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <Truck className="mx-auto h-5 w-5 text-primary" aria-hidden="true" />
                <p className="mt-1.5 text-[10px] font-medium text-muted-foreground">ارسال سریع</p>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <Package className={`mx-auto h-5 w-5 ${inStock ? "text-amber-600" : "text-red-500"}`} aria-hidden="true" />
                <p className="mt-1.5 text-[10px] font-medium text-muted-foreground">{inStock ? "موجود در انبار" : "ناموجود"}</p>
              </div>
            </div>

            {/* دکمه‌های سفارش — دسکتاپ */}
            <div className="hidden gap-3 sm:flex">
              <Button asChild size="lg" className="flex-1 text-base font-extrabold">
                <Link href={`${storeUrl}?focus=${encodeURIComponent(product.id)}`} prefetch={false}>
                  <Package className="h-4 w-4" aria-hidden="true" />
                  سفارش این کالا
                </Link>
              </Button>
              {storefront.socialWhatsapp ? (
                <Button asChild size="lg" variant="outline" className="font-bold">
                  <a href={`https://wa.me/${storefront.socialWhatsapp.replace(/^0/, "98").replace(/\D/g, "")}?text=${encodeURIComponent(`سلام، دربارهٔ «${product.name}» سوال دارم.`)}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    واتساپ
                  </a>
                </Button>
              ) : null}
            </div>

            {/* مشخصات فنی */}
            <div className="rounded-2xl border bg-card p-4">
              <h2 className="mb-3 text-sm font-extrabold text-foreground">مشخصات</h2>
              <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <dt className="text-muted-foreground">دسته‌بندی</dt>
                  <dd className="font-semibold text-foreground">{categoryName ?? "—"}</dd>
                </div>
                {product.barcode ? (
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                    <dt className="text-muted-foreground">بارکد</dt>
                    <dd className="font-mono font-semibold text-foreground" dir="ltr">{product.barcode}</dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <dt className="text-muted-foreground">کد کالا</dt>
                  <dd className="font-mono font-semibold text-foreground" dir="ltr">{product.sku}</dd>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <dt className="text-muted-foreground">فروشگاه</dt>
                  <dd className="font-semibold text-foreground">{storefront.title}</dd>
                </div>
                {storefront.city ? (
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                    <dt className="text-muted-foreground">شهر</dt>
                    <dd className="font-semibold text-foreground">{storefront.city}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>
        </div>

        {/* کالاهای مرتبط */}
        {related.length > 0 ? (
          <section aria-labelledby="related" className="mt-12">
            <h2 id="related" className="mb-4 text-lg font-extrabold text-foreground">کالاهای مرتبط</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {related.map((rp) => {
                const rpDiscount = rp.discountPercent && rp.discountPercent > 0 ? rp.discountPercent : 0;
                const rpPrice = rpDiscount > 0 ? rp.displayPriceRial ?? rp.priceRial : rp.priceRial;
                return (
                  <Link
                    key={rp.id}
                    href={`/shop/${storefront.slug}/p/${rp.slug || rp.id}`}
                    prefetch={false}
                    className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    {rp.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={rp.imageUrl} alt={rp.name} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                    ) : (
                      <CinematicBanner
                        businessType={storefront.businessType}
                        title={rp.name}
                        className="h-24 w-full rounded-none"
                      />
                    )}
                    <div className="flex flex-1 flex-col gap-1 p-3">
                      <p className="line-clamp-2 text-xs font-bold leading-relaxed text-foreground group-hover:text-primary">{rp.name}</p>
                      <p className="mt-auto flex items-baseline gap-1.5">
                        <span className="text-xs font-extrabold text-primary">{rialToTomanLabel(rpPrice)}</span>
                        {rpDiscount > 0 ? (
                          <span className="text-[10px] text-muted-foreground line-through">{rialToTomanLabel(rp.priceRial)}</span>
                        ) : null}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}
        {/* امتیاز و نظرات مشتریان (v20-D) — بعد از کالاهای مرتبط، قبل از فوتر */}
        <ProductReviews slug={storefront.slug} productId={product.id} productName={product.name} />
      </div>

      {/* CTA چسبان — فقط موبایل */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-foreground">{product.name}</p>
            <p className="text-sm font-black text-primary">{priceToman ?? "تماس بگیرید"}</p>
          </div>
          <Button asChild size="lg" className="shrink-0 font-extrabold">
            <Link href={`${storeUrl}?focus=${encodeURIComponent(product.id)}`} prefetch={false}>سفارش</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
