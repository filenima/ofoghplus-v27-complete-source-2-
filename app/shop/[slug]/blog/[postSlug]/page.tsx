import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getStorefrontBySlug } from "@/lib/storefront-auth";
import { getSiteUrl, safeJsonLd, calculateReadingTime } from "@/lib/seo";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { toPersianDigits, formatJalaliDayLabel } from "@/lib/persian";
import { htmlToPlainText } from "@/lib/storefront-posts";
import { StorefrontBlogHeader } from "@/components/storefront/blog-chrome";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, Clock, Eye, FileText } from "lucide-react";

// ═══ Task 3-g — صفحهٔ تک‌مقالهٔ بلاگ فروشگاه: /shop/{slug}/blog/{postSlug} ═══
// SSR کامل + SEO (canonical/OG با تصویر شاخص) + Article JSON-LD
// (headline/datePublished/author=نام فروشگاه/image) + Breadcrumb.
// محتوا HTML ویرایشگر مالک است و با sanitizeHtml (دفاع عمقی) رندر می‌شود.

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string; postSlug: string }>;
}

/** پارامتر مسیر ممکن است انکودشده باشد (اسلاگ فارسی) — دو حالت چک می‌شود */
function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

async function loadContext(slug: string, postSlug: string) {
  // FIX(SEO/GEO — ریسک حذف از ایندکس): خطای موقت DB پرتاب می‌شود (5xx) و دیگر
  // به «مقاله یافت نشد» (200 + noindex) تبدیل نمی‌شود — مثل سایر صفحات فروشگاه.
  const storefront = await getStorefrontBySlug(slug);
  if (!storefront || !storefront.isActive) return null;

  // اول با مقدار خام پارامتر، سپس با نسخهٔ decode‌شده (اسلاگ فارسی)
  const candidates = [...new Set([postSlug, decodeSafe(postSlug)])].filter(Boolean);
  const post = await db.storefrontPost.findFirst({
    where: { storefrontId: storefront.id, status: "PUBLISHED", slug: { in: candidates } },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      content: true,
      coverImage: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      viewCount: true,
    },
  });
  if (!post) return null;
  return { storefront, post };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, postSlug } = await params;
  const ctx = await loadContext(slug, postSlug);
  // FIX(SEO — soft-404 تمیز): notFound در generateMetadata → مرز not-found استاندارد
  // (قبلاً عنوان «مقاله یافت نشد» + noindex با کد ۲۰۰ برمی‌گشت)
  if (!ctx) notFound();

  const { storefront, post } = ctx;
  const base = (await getSiteUrl()).replace(/\/+$/, "");
  const canonical = `${base}/shop/${storefront.slug}/blog/${post.slug}`;
  const title = `${post.title} | وبلاگ ${storefront.title}`;
  const description =
    post.excerpt?.trim() ||
    htmlToPlainText(post.content).slice(0, 155) ||
    `مقالهٔ ${post.title} از وبلاگ ${storefront.title}`;

  // تصویر شاخص — کاور مالک؛ بدون کاور، ژنراتور OG داینامیک
  const ogImage = post.coverImage
    ? post.coverImage.startsWith("http")
      ? post.coverImage
      : `${base}${post.coverImage}`
    : `${base}/api/og?title=${encodeURIComponent(post.title)}&description=${encodeURIComponent(description.slice(0, 90))}&type=blog`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      type: "article",
      locale: "fa_IR",
      siteName: storefront.title,
      url: canonical,
      publishedTime: (post.publishedAt ?? post.createdAt).toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      images: [{ url: ogImage, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function StorefrontBlogPostPage({ params }: PageProps) {
  const { slug, postSlug } = await params;
  const ctx = await loadContext(slug, postSlug);
  if (!ctx) notFound();

  const { storefront, post } = ctx;
  const base = (await getSiteUrl()).replace(/\/+$/, "");
  const storeUrl = `/shop/${storefront.slug}`;
  const blogUrl = `${storeUrl}/blog`;
  const canonical = `${base}/shop/${storefront.slug}/blog/${post.slug}`;

  // شمارش بازدید — fire-and-forget (بدون بلاک رندر)
  void db.storefrontPost
    .update({ where: { id: post.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {
      /* آمار بازدید بهترین تلاش است */
    });

  const publishedAt = post.publishedAt ?? post.createdAt;
  const readingMinutes = calculateReadingTime(htmlToPlainText(post.content)) || 1;
  const coverUrl = post.coverImage
    ? post.coverImage.startsWith("http")
      ? post.coverImage
      : `${base}${post.coverImage}`
    : null;

  // JSON-LD — Article (نویسنده = نام فروشگاه) + BreadcrumbList
  const articleLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${canonical}#article`,
    headline: post.title,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    datePublished: publishedAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: { "@type": "Organization", name: storefront.title, url: `${base}/shop/${storefront.slug}` },
    publisher: { "@type": "Organization", name: storefront.title, url: `${base}/shop/${storefront.slug}` },
    inLanguage: "fa-IR",
    ...(coverUrl ? { image: [coverUrl] } : {}),
    ...(storefront.phone ? { telephone: storefront.phone } : {}),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "خانه", item: base || "/" },
      { "@type": "ListItem", position: 2, name: storefront.title, item: `${base}/shop/${storefront.slug}` },
      { "@type": "ListItem", position: 3, name: "وبلاگ", item: `${base}/shop/${storefront.slug}/blog` },
      { "@type": "ListItem", position: 4, name: post.title, item: canonical },
    ],
  };

  // مقاله‌های مرتبط — ۳ مقالهٔ بعدی همین بلاگ
  const related = await db.storefrontPost.findMany({
    where: { storefrontId: storefront.id, status: "PUBLISHED", id: { not: post.id } },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 3,
    select: { id: true, title: true, slug: true, coverImage: true, excerpt: true, publishedAt: true, createdAt: true },
  }).catch(() => []);

  return (
    <main className="min-h-screen bg-background" dir="rtl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />

      <StorefrontBlogHeader
        shopSlug={storefront.slug}
        shopTitle={storefront.title}
        announcement={storefront.announcement}
        phone={storefront.phone}
      />

      <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 sm:px-6 sm:pb-16">
        {/* مسیر */}
        <nav aria-label="مسیر" className="mb-5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link href={storeUrl} prefetch={false} className="transition-colors hover:text-foreground">
            فروشگاه
          </Link>
          <ChevronLeft className="h-3 w-3" aria-hidden="true" />
          <Link href={blogUrl} prefetch={false} className="transition-colors hover:text-foreground">
            وبلاگ
          </Link>
          <ChevronLeft className="h-3 w-3" aria-hidden="true" />
          <span className="line-clamp-1 text-foreground">{post.title}</span>
        </nav>

        <article>
          {/* سربرگ مقاله */}
          <header className="space-y-3">
            <h1 className="text-2xl font-black leading-relaxed text-foreground sm:text-3xl">{post.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {formatJalaliDayLabel(publishedAt)}
              </span>
              <span>زمان مطالعه: {toPersianDigits(readingMinutes)} دقیقه</span>
              <span className="inline-flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                {toPersianDigits(post.viewCount)} بازدید
              </span>
              <Badge variant="secondary" className="text-[11px]">نویسنده: {storefront.title}</Badge>
            </div>
          </header>

          {/* تصویر شاخص */}
          {post.coverImage ? (
            <div className="mt-5 overflow-hidden rounded-2xl border">
              <img
                src={post.coverImage}
                alt={post.title}
                className="aspect-[16/9] w-full object-cover"
                fetchPriority="high"
              />
            </div>
          ) : null}

          {/* خلاصه */}
          {post.excerpt?.trim() ? (
            <p className="mt-5 rounded-xl bg-muted/60 px-4 py-3 text-sm font-medium leading-7 text-muted-foreground">
              {post.excerpt}
            </p>
          ) : null}

          {/* محتوای مقاله — HTML پاک‌سازی‌شدهٔ ویرایشگر مالک */}
          <div
            className="prose prose-sm mt-6 max-w-none text-[15px] leading-8 text-foreground/90 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-s-2 [&_blockquote]:border-muted-foreground/25 [&_blockquote]:rounded-e-lg [&_blockquote]:bg-muted/40 [&_blockquote]:py-2 [&_blockquote]:ps-3 [&_figcaption]:text-xs [&_figcaption]:text-muted-foreground [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-foreground [&_img]:my-4 [&_img]:rounded-xl [&_ol]:list-decimal [&_ol]:ps-5 [&_p]:leading-8 [&_table]:w-full [&_table]:text-xs [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:bg-muted/50 [&_th]:p-2 [&_ul]:list-disc [&_ul]:ps-5"
            dir="rtl"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }}
          />
        </article>

        <Separator className="my-8" />

        {/* CTA بازگشت به فروشگاه */}
        <div className="rounded-2xl border bg-gradient-to-l from-primary/5 to-transparent p-5">
          <p className="text-sm font-bold text-foreground">از فروشگاه {storefront.title} خرید کنید</p>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            سفارش آنلاین با پرداخت امن و تحویل سریع — همین حالا محصولات را ببینید.
          </p>
          <Link
            href={storeUrl}
            prefetch={false}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            رفتن به فروشگاه
          </Link>
        </div>

        {/* مقاله‌های مرتبط */}
        {related.length > 0 ? (
          <section className="mt-10" aria-label="مقاله‌های مرتبط">
            <h2 className="mb-4 text-base font-black text-foreground">مقاله‌های دیگر وبلاگ</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`${blogUrl}/${encodeURIComponent(r.slug)}`}
                  prefetch={false}
                  className="group overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md"
                >
                  <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
                    {r.coverImage ? (
                      <img
                        src={r.coverImage}
                        alt={r.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 via-muted to-muted">
                        <FileText className="h-7 w-7 text-muted-foreground/40" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="line-clamp-2 text-xs font-bold leading-6 text-foreground group-hover:text-primary">
                      {r.title}
                    </h3>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatJalaliDayLabel(r.publishedAt ?? r.createdAt)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
