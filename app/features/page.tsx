import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { landingFeatures } from "@/lib/landing-config";
import {
 generateBreadcrumbSchema,
 generateFaqSchema,
 generateArticleSchema,
 getSiteUrl,
 type FaqItem,
} from "@/lib/seo";
import { toPersianDigits } from "@/lib/persian";
import { HubArticle } from "@/lib/hub-article";
import { featuresArticleHtml, featuresFaqs } from "@/lib/hub-content/features";
import { hubNavLinks } from "@/lib/hub-content/shared";
import {
 Card,
 CardHeader,
 CardTitle,
 CardDescription,
 CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ChevronLeft, Sparkles } from "lucide-react";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
// R24-7 (Agent 4 — AEO): بلوک «پاسخ کوتاه» بعد از H1 برای موتورهای پاسخ‌گو
import { QuickAnswer } from "@/components/seo/quick-answer";

// ============ Metadata ============
// R14-K1 (سئو): برند از عنوان حذف شد — قالب layout «| افق پلاس» اضافه می‌کند
// (قبلاً برند دوبار در عنوان می‌آمد). عنوان نهایی: ۵۵ نویسه.
const PAGE_TITLE = "امکانات نرم‌افزار حسابداری آنلاین | ۱۶ ماژول";
const PAGE_DESCRIPTION =
 "راهنمای جامع امکانات نرم‌افزار حسابداری: حسابداری آنلاین، انبار، مودیان، حقوق و دستمزد و هوش مصنوعی — ۱۶ ماژول یکپارچه؛ ۷ روز رایگان تست کنید.";
export async function generateMetadata(): Promise<Metadata> {
 const brand = await getBrandName();
 const siteUrl = await getSiteUrl(); // v20-S: canonical پویا (وایت‌لیبل) به‌جای SITE_URL استاتیک
 const ogImage = `${siteUrl}/api/og?title=${encodeURIComponent(
 interpolateBrand("امکانات هوش", brand)
 )}&description=${encodeURIComponent(
 interpolateBrand("۱۶ ماژول تخصصی حسابداری هوشمند", brand)
 )}&type=features`;
 return {
 title: interpolateBrand(PAGE_TITLE, brand),
 description: interpolateBrand(PAGE_DESCRIPTION, brand),
 keywords: [
 "نرم افزار حسابداری آنلاین",
 "امکانات نرم افزار حسابداری",
 "سامانه مودیان",
 "هوش مصنوعی حسابداری",
 "مدیریت انبار",
 "حقوق و دستمزد",
 "ارزش افزوده",
 "CRM حسابداری",
 "نرم افزار حسابداری ایرانی",
 "هوش",
 ].map((k) => interpolateBrand(k, brand)),
 authors: [{ name: interpolateBrand("هوش", brand) }],
 alternates: {
 canonical: `${siteUrl}/features`,
 },
 openGraph: {
 title: interpolateBrand(PAGE_TITLE, brand),
 description: interpolateBrand(PAGE_DESCRIPTION, brand),
 url: `${siteUrl}/features`,
 siteName: interpolateBrand("هوش", brand),
 images: [
 {
 url: ogImage,
 width: 1200,
 height: 630,
 alt: interpolateBrand("امکانات هوش — ۱۶ ماژول تخصصی", brand),
 },
 ],
 locale: "fa_IR",
 type: "website",
 },
 twitter: {
 card: "summary_large_image",
 site: "@ofoghplus",
 title: interpolateBrand(PAGE_TITLE, brand),
 description: interpolateBrand(PAGE_DESCRIPTION, brand),
 images: [ogImage],
 // FIX(SEO 6-b): هندل قدیمی برند (@hoshhesab) → هندل فعلی
 creator: "@ofoghplus",
 },
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

// ============ Page Component ============
export default async function FeaturesPage() {
 const brand = await getBrandName();
 // v20-S: دامنهٔ پویا برای JSON-LD (قبلاً SITE_URL استاتیک در سطح ماژول)
 const siteUrl = await getSiteUrl();

 // ============ JSON-LD Schemas ============
 // نکته سئو: SoftwareApplication به‌صورت سراسری از طریق StructuredData در
 // app/layout.tsx تزریق می‌شود. اینجا BreadcrumbList و FAQPage و Article اضافه می‌شوند.

 const breadcrumbSchema = generateBreadcrumbSchema([
 { name: "خانه", url: siteUrl },
 { name: "امکانات", url: `${siteUrl}/features` },
 ]);

 const articleSchema = generateArticleSchema({
 title: "امکانات نرم‌افزار حسابداری آنلاین هوش — بررسی تفصیلی ۱۶ ماژول",
 description: PAGE_DESCRIPTION,
 url: `${siteUrl}/features`,
 image: "/images/hero-dashboard.avif",
 datePublished: "2025-09-10T08:00:00+03:30",
 dateModified: "2026-01-20T08:00:00+03:30",
 section: "امکانات",
 keywords: ["نرم‌افزار حسابداری آنلاین", "امکانات نرم‌افزار حسابداری", "هوش"],
 canonicalUrl: `${siteUrl}/features`,
 });

 const faqSchema = generateFaqSchema(featuresFaqs as FaqItem[], `${siteUrl}/features`); // v20-S: @id صفحه‌محور
 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 {/* Header */}
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link
 href="/"
 className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
 prefetch={false}
 >
 <ArrowRight className="h-4 w-4" />
 بازگشت به صفحه اصلی
 </Link>
 <Link
 href="/"
 className="inline-flex items-center gap-2"
 prefetch={false}
 >
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
 <Sparkles className="h-3.5 w-3.5" />
 </span>
 <span className="text-sm font-bold">{interpolateBrand("هوش", brand)}</span>
 </Link>
 </div>
 </header>

 <main className="flex-1">
 {/* Hero */}
 <section className="border-b border-border bg-gradient-to-b from-primary/5 to-background">
 <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
 {/* Breadcrumb */}
 <nav
 aria-label="مسیر"
 className="mb-6 flex items-center gap-1 text-xs text-muted-foreground"
 >
 <Link
 href="/"
 prefetch={false}
 className="transition-colors hover:text-foreground"
 >
 خانه
 </Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">امکانات</span>
 </nav>

 <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl mb-6">
 <Image src="/images/hero-dashboard.avif" alt={interpolateBrand("امکانات هوش — نرم‌افزار حسابداری هوشمند", brand)} fill className="object-cover" priority sizes="(max-width: 768px) 100vw, 800px" />
 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
 <div className="absolute bottom-0 inset-x-0 p-5 text-white">
 <h1 className="text-2xl font-extrabold drop-shadow-lg sm:text-3xl">{interpolateBrand("امکانات نرم‌افزار حسابداری آنلاین هوش", brand)}</h1>
 <p className="mt-1 text-sm opacity-90 drop-shadow-md sm:text-base">جامع‌ترین نرم‌افزار حسابداری آنلاین ایرانی با {toPersianDigits(16)} ماژول تخصصی — از حسابداری دوطرفه تا هوش مصنوعی، سامانه مودیان و مدیریت تولیدی</p>
 </div>
 </div>
 {/* R24-7 (Agent 4 — AEO): پاسخ کوتاه — نقل‌قول‌پذیر برای AI Overviews */}
 <div className="mx-auto max-w-3xl">
 <QuickAnswer
 question={interpolateBrand("هوش چه امکاناتی دارد؟", brand)}
 answer={interpolateBrand(
 "هوش نرم‌افزار حسابداری ابری ایرانی با ۱۶ ماژول یکپارچه است: حسابداری دوطرفه، انبار و کاردکس، خرید و فروش و صورتحساب، اتصال رسمی به سامانه مودیان، حقوق و دستمزد، مالیات و ارزش افزوده، خزانه‌داری و چک صیادی، CRM، فروشگاه آنلاین، هوش مصنوعی (OCR فاکتور و دستیار مالی) و اپ موبایل. همهٔ ماژول‌ها در ۷ روز آزمایش رایگان باز هستند.",
 brand
 )}
 />
 </div>
 </div>
 </section>

 {/* Features Grid */}
 <section className="py-12 sm:py-16">
 <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
 <h2 className="mb-6 text-2xl font-bold text-foreground">{interpolateBrand("ماژول‌های هوش در یک نگاه", brand)}</h2>
 <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
 {landingFeatures.map((feature) => {
 const Icon = feature.icon;
 return (
 <Card
 key={feature.id}
 className={`group relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5 ${
 feature.highlight
? "border-primary/30 bg-primary/[0.02]"
: ""
 }`}
 >
 {feature.highlight && (
 <div className="absolute left-0 top-0 h-full w-1 bg-primary" />
 )}
 <CardHeader className="pb-2">
 <div className="flex items-start justify-between gap-2">
 <div
 className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
 feature.highlight
? "bg-primary text-primary-foreground"
: "bg-primary/10 text-primary"
 }`}
 >
 <Icon className="h-5 w-5" />
 </div>
 {feature.highlight && (
 <Badge
 variant="default"
 className="shrink-0 text-[10px]"
 >
 محبوب
 </Badge>
 )}
 </div>
 <CardTitle className="mt-3 text-base font-bold">
 {feature.title}
 </CardTitle>
 </CardHeader>
 <CardContent className="pt-0">
 <CardDescription className="leading-relaxed">
 {feature.description}
 </CardDescription>
 </CardContent>
 </Card>
 );
 })}
 </div>
 </div>
 </section>

 {/* Feature Showcase — تصاویر ماژول‌ها — R14-F: cv-auto (رندر تنبل زیر تاخور) */}
 <section className="cv-auto border-y border-border bg-muted/30 py-12 sm:py-16">
 <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
 <h2 className="text-2xl font-bold text-foreground text-center sm:text-3xl">
 نگاهی از نزدیک به ماژول‌ها
 </h2>
 <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground text-center sm:text-base">
 هر ماژول با دقت برای نیازهای کسب‌وکارهای ایرانی طراحی شده است
 </p>

 <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
 {[
 { src: "/images/invoice-management.avif", title: "مدیریت فاکتور و خرید و فروش", desc: "صدور، پیگیری و مدیریت خودکار فاکتورها" },
 { src: "/images/inventory-warehouse.avif", title: "انبار هوشمند", desc: "مدیریت موجودی، هشدار کمبود و بهینه‌سازی سفارش" },
 { src: "/images/payroll-hr.avif", title: "حقوق و دستمزد", desc: "محاسبه حقوق، بیمه و مالیات بر درآمد دستمزدی" },
 { src: "/images/moadian-tax.avif", title: "سامانه مودیان", desc: "ارسال خودکار اطلاعات مالی به سامانه مودیان مالیاتی" },
 { src: "/images/ai-assistant.avif", title: "دستیار هوش مصنوعی", desc: "خوانش فاکتور از عکس، دسته‌بندی خودکار و پیش‌بینی جریان نقدی" },
 { src: "/images/crm-customers.avif", title: "مدیریت مشتریان (CRM)", desc: "پروفایل مشتری، تاریخچه تعاملات و پیگیری فروش" },
 ].map((item) => (
 <div key={item.src} className="group overflow-hidden rounded-xl border border-border/50 bg-card transition-all hover:shadow-lg hover:shadow-primary/5">
 <div className="relative aspect-[16/10] w-full overflow-hidden">
 <Image src={item.src} alt={item.title} fill className="object-cover transition-transform duration-500 group-hover:scale-105" sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw" />
 <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
 </div>
 <div className="p-4">
 <h3 className="text-base font-bold text-foreground">{item.title}</h3>
 <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
 </div>
 </div>
 ))}
 </div>
 </div>
 </section>

 {/* ===== محتوای بلند سئو: ۴۰۰۰+ کلمه + فهرست مطالب + FAQ + CTA ===== */}
 <section className="cv-auto py-12 sm:py-16">
 <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
 <HubArticle html={featuresArticleHtml} faqs={featuresFaqs} faqTitle={interpolateBrand("پرسش‌های متداول دربارهٔ امکانات نرم‌افزار حسابداری هوش", brand)} />
 </div>
 </section>

 {/* Hub nav — لینک‌سازی داخلی به سایر صفحات هاب */}
 <section className="cv-auto border-t border-border bg-muted/30 py-10">
 <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
 <h2 className="text-base font-bold text-foreground">{interpolateBrand("ادامهٔ مسیر شما در هوش", brand)}</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {hubNavLinks("features").map((l) => (
 <Link
 key={l.href}
 href={l.href}
 prefetch={false}
 className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5"
 >
 {interpolateBrand(l.title, brand)}
 </Link>
 ))}
 </div>
 </div>
 </section>
 </main>

 {/* Footer */}
 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>{interpolateBrand("هوش — تمامی حقوق محفوظ است.", brand)}</p>
 <div className="flex items-center gap-3">
 <Link
 href="/"
 prefetch={false}
 className="font-medium text-primary transition-colors hover:text-primary/80"
 >
 صفحه اصلی
 </Link>
 <Link
 href="/blog"
 prefetch={false}
 className="transition-colors hover:text-foreground"
 >
 بلاگ
 </Link>
 <Link
 href="/pricing"
 prefetch={false}
 className="transition-colors hover:text-foreground"
 >
 قیمت‌گذاری
 </Link>
 </div>
 </div>
 </footer>

 {/* JSON-LD — BreadcrumbList */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
 />
 {/* JSON-LD — FAQPage */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(faqSchema), brand) }}
 />
 {/* JSON-LD — Article */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(articleSchema), brand) }}
 />
 </div>
 );
}
