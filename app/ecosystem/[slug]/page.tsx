import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { nobatimeTools, getToolBySlug } from "@/lib/nobatime-ecosystem-data";
import { generateBreadcrumbSchema, SITE_URL, safeJsonLd } from "@/lib/seo";
import { ToolPageContent } from "./tool-page-content";

export function generateStaticParams() {
 return nobatimeTools.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({
 params,
}: {
 params: Promise<{ slug: string }>;
}): Promise<Metadata> {
 const { slug } = await params;
 const tool = getToolBySlug(slug);
 if (!tool) {
 // SEO(A2): متادیتای 404 صریح (قبلاً {} بود و عنوان پیش‌فرض سراسری می‌گرفت)
 return {
 title: "ابزار یافت نشد",
 description: "ابزار موردنظر در اکوسیستم افق پلاس پیدا نشد.",
 robots: { index: false, follow: false },
 };
 }

 // SEO(A2): توضیح غنی‌شده (توضیح ابزار ~۹۰ نویسه بود) → ۱۴۰-۱۶۰ نویسه + CTA
 const description = `${tool.description} — متصل به حسابداری و سامانه مودیان؛ ۷ روز رایگان تست کنید.`;
 const url = `${SITE_URL}/ecosystem/${tool.slug}`;

 return {
 // نکته سئو: عنوان کوتاه بدون برند — قالب layout یک‌بار «| هوش» اضافه می‌کند
 title: `${tool.name} | ${tool.tagline}`,
 description,
 keywords: tool.keywords,
 alternates: {
 canonical: url,
 },
 openGraph: {
 title: `${tool.name} — ${tool.tagline}`,
 description,
 url,
 siteName: "افق پلاس", // REBRAND(R14-A)
 type: "website",
 locale: "fa_IR",
 images: [
 {
 url: "/og-ofoghplus-v4.png",
 width: 1200,
 height: 630,
 alt: `${tool.name} — ${tool.tagline}`,
 type: "image/png",
 },
 ],
 },
 twitter: {
 card: "summary_large_image",
 site: "@ofoghplus",
 creator: "@ofoghplus",
 title: `${tool.name} — ${tool.tagline}`,
 description,
 images: ["/og-ofoghplus-v4.png"],
 },
 // SEO(A2): robots صریح index/follow (قبلاً فقط از layout ارث می‌برد)
 robots: {
 index: true,
 follow: true,
 googleBot: {
 index: true,
 follow: true,
 "max-image-preview": "large",
 "max-snippet": -1,
 },
 },
 };
}

export default async function ToolPage({
 params,
}: {
 params: Promise<{ slug: string }>;
}) {
 const { slug } = await params;
 const tool = getToolBySlug(slug);
 if (!tool) notFound();

 // SEO(A2): BreadcrumbList — ایمن با safeJsonLd (ضد </script>escape)
 const breadcrumbSchema = generateBreadcrumbSchema([
 { name: "خانه", url: SITE_URL },
 { name: "اکوسیستم", url: `${SITE_URL}/ecosystem` },
 { name: tool.name, url: `${SITE_URL}/ecosystem/${tool.slug}` },
 ]);

 return (
 <>
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbSchema) }}
 />
 <ToolPageContent tool={tool} />
 </>
 );
}
