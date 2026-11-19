import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getStorefrontBySlug } from "@/lib/storefront-auth";
import { getSiteUrl, safeJsonLd } from "@/lib/seo";
import { toPersianDigits, formatJalaliDayLabel } from "@/lib/persian";
import { htmlToPlainText } from "@/lib/storefront-posts";
import { StorefrontBlogHeader } from "@/components/storefront/blog-chrome";
import { ChevronLeft, FileText, Newspaper } from "lucide-react";

// ═══ Task 3-g — بلاگ عمومی فروشگاه: /shop/{slug}/blog ═══
// فهرست مقاله‌های منتشرشدهٔ مالک — SSR کامل (force-dynamic مثل سایر
// صفحات فروشگاه) برای خزش گوگل؛ canonical + Blog/Breadcrumb JSON-LD.

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function loadStorefront(slug: string) {
  // FIX(SEO/GEO — ریسک حذف از ایندکس): خطای موقت DB پرتاب می‌شود (5xx) و دیگر
  // به «فروشگاه یافت نشد» (200 + noindex) تبدیل نمی‌شود — مثل سایر صفحات فروشگاه.
  const storefront = await getStorefrontBySlug(slug);
  if (!storefront || !storefront.isActive) return null;
  return storefront;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const storefront = await loadStorefront(slug);
  if (!storefront) {
    // FIX(SEO — soft-404 تمیز): notFound در generateMetadata → مرز not-found استاندارد
    notFound();
  }

  const base = (await getSiteUrl()).replace(/\/+$/, "");
  const canonical = `${base}/shop/${storefront.slug}/blog`;
  const title = `وبلاگ ${storefront.title} | مقالات و راهنماها`;
  const description =
    storefront.seoDescription?.trim() ||
    `مقالات، راهنمای خرید و اخبار ${storefront.title} — جدیدترین مطالب تخصصی فروشگاه را اینجا بخوانید.`;
  const ogImage = `${base}/api/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description.slice(0, 90))}&type=blog`;

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
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
  };
}

export default async function StorefrontBlogPage({ params }: PageProps) {
  const { slug } = await params;
  const storefront = await loadStorefront(slug);
  if (!storefront) notFound();

  const posts = await db.storefrontPost.findMany({
    where: { storefrontId: storefront.id, status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      content: true,
      coverImage: true,
      publishedAt: true,
      createdAt: true,
      viewCount: true,
    },
  });

  const base = (await getSiteUrl()).replace(/\/+$/, "");
  const storeUrl = `/shop/${storefront.slug}`;
  const blogUrl = `${base}/shop/${storefront.slug}/blog`;

  // JSON-LD — Blog + BreadcrumbList (غنی‌نتایج گوگل)
  const blogLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${blogUrl}#blog`,
    name: `وبلاگ ${storefront.title}`,
    url: blogUrl,
    description: `مقالات و راهنماهای ${storefront.title}`,
    publisher: { "@type": "Organization", name: storefront.title },
    blogPost: posts.slice(0, 20).map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${blogUrl}/${encodeURIComponent(p.slug)}`,
      datePublished: (p.publishedAt ?? p.createdAt).toISOString(),
      ...(p.coverImage ? { image: p.coverImage.startsWith("http") ? p.coverImage : `${base}${p.coverImage}` } : {}),
    })),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "خانه", item: base || "/" },
      { "@type": "ListItem", position: 2, name: storefront.title, item: `${base}/shop/${storefront.slug}` },
      { "@type": "ListItem", position: 3, name: "وبلاگ", item: blogUrl },
    ],
  };

  return (
    <main className="min-h-screen bg-background" dir="rtl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(blogLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />

      <StorefrontBlogHeader
        shopSlug={storefront.slug}
        shopTitle={storefront.title}
        announcement={storefront.announcement}
        phone={storefront.phone}
      />

      <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 sm:pb-16">
        {/* مسیر */}
        <nav aria-label="مسیر" className="mb-5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link href={storeUrl} prefetch={false} className="transition-colors hover:text-foreground">
            فروشگاه
          </Link>
          <ChevronLeft className="h-3 w-3" aria-hidden="true" />
          <span className="text-foreground">وبلاگ</span>
        </nav>

        <div className="mb-7">
          <h1 className="flex items-center gap-2 text-2xl font-black leading-snug text-foreground sm:text-3xl">
            <Newspaper className="h-7 w-7 text-primary" aria-hidden="true" />
            وبلاگ {storefront.title}
          </h1>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            {posts.length > 0
              ? `${toPersianDigits(posts.length)} مقالهٔ منتشرشده — مطالب تخصصی، راهنمای خرید و اخبار فروشگاه`
              : "مقالات، راهنمای خرید و اخبار فروشگاه"}
          </p>
        </div>

        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
            <p className="mt-3 text-sm font-bold">هنوز مقاله‌ای منتشر نشده است</p>
            <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
              به‌زودی مطالب تخصصی و راهنماهای خرید اینجا منتشر می‌شود.
            </p>
            <Link
              href={storeUrl}
              prefetch={false}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition-colors hover:border-primary/50 hover:text-primary"
            >
              بازگشت به فروشگاه
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {posts.map((p) => {
              const href = `${storeUrl}/blog/${encodeURIComponent(p.slug)}`;
              const excerpt =
                p.excerpt?.trim() || htmlToPlainText(p.content).slice(0, 160) || "ادامهٔ مقاله را در وبلاگ فروشگاه بخوانید…";
              return (
                <article key={p.id} className="group overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md">
                  <Link href={href} prefetch={false} className="block">
                    <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
                      {p.coverImage ? (
                        <img
                          src={p.coverImage}
                          alt={p.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 via-muted to-muted">
                          <FileText className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 p-4">
                      <h2 className="line-clamp-2 text-base font-bold leading-7 text-foreground transition-colors group-hover:text-primary">
                        {p.title}
                      </h2>
                      <p className="line-clamp-3 text-xs leading-6 text-muted-foreground">{excerpt}</p>
                      <div className="flex items-center gap-3 pt-1 text-[11px] text-muted-foreground">
                        <span>{formatJalaliDayLabel(p.publishedAt ?? p.createdAt)}</span>
                        <span>· {toPersianDigits(p.viewCount)} بازدید</span>
                      </div>
                    </div>
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
