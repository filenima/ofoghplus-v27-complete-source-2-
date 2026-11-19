import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
 cities,
 industryInfos,
 bankNames,
 getCityIndustryBankCombos,
 getCityBySlug,
 getIndustryInfoBySlug,
 getBankBySlug,
} from "@/lib/city-industry-data";
import { getIndustryBySlug } from "@/lib/industry-data";
import { generateCityIndustryLongform } from "@/lib/seo-longform";
import {
 generateBreadcrumbSchema,
 generateFaqSchema,
 getSiteUrl,
 safeJsonLd,
 BUSINESS_PHONE,
 type FaqItem,
} from "@/lib/seo";
// Agent3-Local: اسکیمای ProfessionalService + makesOffer شهر×صنعت×بانک
import { generateCityProfessionalServiceSchema, getLocalSeoSameAs } from "@/lib/seo/local-schema";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import {
 Card,
 CardHeader,
 CardTitle,
 CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
 Accordion,
 AccordionItem,
 AccordionTrigger,
 AccordionContent,
} from "@/components/ui/accordion";
import {
 Building2,
 Factory,
 Landmark,
 Sparkles,
 ChevronLeft,
 CheckCircle2,
 ArrowRight,
} from "lucide-react";

// ============ Dynamic Rendering ============
// این صفحه به‌صورت پویا رندر می‌شود (نه استاتیک) تا از فشار حافظه‌ی build جلوگیری شود
// با ۲۰ شهر × ۷ صنعت × ۱۲ بانک = ۱۶۸۰ ترکیب، پیش‌رندر استاتیک بسیار سنگین است
export const dynamic = "force-dynamic";

// ============ Metadata ============
export async function generateMetadata({
 params,
}: {
 params: Promise<{ city: string; industry: string; bank: string }>;
}): Promise<Metadata> {
 const { city, industry, bank } = await params;
 const brand = await getBrandName();
 const cityData = getCityBySlug(city);
 const industryData = getIndustryInfoBySlug(industry);
 const bankData = getBankBySlug(bank);

 if (!cityData ||!industryData ||!bankData) {
 return {
 title: interpolateBrand("صفحه یافت نشد", brand), // FIX(v37): برندینگ دوگانه حذف شد — layout خودش اضافه می‌کند
 description: "صفحه موردنظر پیدا نشد.",
 };
 }

 // FIX(v20-S): نویسه‌های عربی (ی/ک عربی) → فارسی + برند داینامیک — نام برند قدیمی
 // (هوش‌حساب قدیم) با interpolateBrand جایگزین نمی‌شود (مرز حرف);
 // برند مستقیم از getBrandName تزریق می‌شود.
 const title = `نرم‌افزار حسابداری ${industryData.name} در ${cityData.name} با ${bankData.name}`; // FIX(v37): برند از عنوان حذف — قالب layout «%s | برند» می‌سازد
 const description = `${brand}، نرم‌افزار حسابداری ابری هوشمند برای ${industryData.name} در ${cityData.name} با اتصال به ${bankData.name}. سامانه مودیان، انبار، فروش، حقوق دستمزد و هوش مصنوعی.`;
 const siteUrl = await getSiteUrl(); // v20-S: canonical پویا (وایت‌لیبل) به‌جای SITE_URL استاتیک
 const url = `${siteUrl}/cities/${city}/industries/${industry}/banks/${bank}`;
 const ogImage = `${siteUrl}/api/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}&type=local`;

 return {
 title,
 description,
 keywords: [
  `حسابداری ${industryData.name}`,
  `نرم‌افزار حسابداری ${cityData.name}`,
  `${bankData.name} حسابداری`,
  `${industryData.name} ${cityData.name}`,
  brand, // FIX(v20-S): برند قدیمی عربی‌نویس → برند داینامیک
  "سامانه مودیان",
  "حسابداری ابری",
  industryData.name,
  cityData.name,
  bankData.name,
 ],
 authors: [{ name: brand }],
 alternates: {
 canonical: url,
 },
 openGraph: {
 title,
 description,
 url,
 siteName: brand,
 images: [
 {
 url: ogImage,
 width: 1200,
 height: 630,
 alt: title,
 },
 ],
 locale: "fa_IR",
 type: "website",
 },
 twitter: {
 card: "summary_large_image",
 title,
 description,
 images: [ogImage],
 creator: "@ofoghplus", // FIX(Task 6-c): هندل قدیمی برند (@hoshhesab) → هندل فعلی مطابق layout
 },
 robots: {
 // FIX(v42-seo): ۲٬۴۰۰ صفحهٔ بانکی با بدنهٔ چرخشی صنعت (فقط بلوک بانک
 // متفاوت) ریسک scaled-content-abuse/doorway داشتند — ایندکس خاموش،
 // لینک‌سازی داخلی حفظ (follow). ترکیب‌های پرتقاضا بعداً محتوای واقعی می‌گیرند.
 index: false,
 follow: true,
 googleBot: {
 index: false,
 follow: true,
 "max-image-preview": "large",
 "max-snippet": -1,
 },
 },
 // FIX(Task 6-c — Local SEO): سیگنال جغرافیایی متا برای پرس‌وجوهای محلی
 other: {
 "geo.region": "IR",
 "geo.placename": cityData.name,
 },
 };
}

// ============ Page Component ============
export default async function CityIndustryBankPage({
 params,
}: {
 params: Promise<{ city: string; industry: string; bank: string }>;
}) {
 const { city, industry, bank } = await params;
 const cityData = getCityBySlug(city);
 const industryData = getIndustryInfoBySlug(industry);
 const bankData = getBankBySlug(bank);

 if (!cityData ||!industryData ||!bankData) {
 notFound();
 }

 const brand = await getBrandName();
 const siteUrl = await getSiteUrl(); // v20-S: canonical پویا (وایت‌لیبل)

 // Task 23-I: محتوای بلند غنی برای ترکیب شهر+صنف+بانک (≥۲۰۰۰ کلمه)
 // بخش‌های متفاوت با seed بانک → صفحات بانکی مختلف محتوای تکراری ندارند
 const industryFull = getIndustryBySlug(industry);
 const longform = industryFull
 ? generateCityIndustryLongform(industryFull, {
 slug: `${cityData.slug}:${bankData.slug}`,
 name: cityData.name,
 province: cityData.province,
 })
 : [];
 const bankSectionHtml = `
 <h2>بانکداری ${bankData.name} برای ${industryData.name} در ${cityData.name} — چه چیزی در هوش خودکار می‌شود؟</h2>
 <p>حساب‌های ${bankData.name} شما در ماژول خزانه‌داری هوش تعریف می‌شوند و از همان لحظه، هر تراکنش بانکی به سند حسابداری وصل است: وصول فاکتور مشتری، پرداخت به تأمین‌کننده، انتقال بین حساب‌ها و چک‌های صیادی. برای ${industryData.name} در ${cityData.name} این یعنی پایانِ «ثبت دوبارهٔ همان داده» در اکسل و یک برنامهٔ بانکی جداگانه.</p>
 <table><thead><tr><th>عملیات بانکی در ${bankData.name}</th><th>اثر خودکار در هوش</th></tr></thead><tbody>
 <tr><td>واریز مشتری (کارت به کارت/شبا)</td><td>دریافت روی فاکتور + سند خزانه + کاهش مطالبات</td></tr>
 <tr><td>پرداخت تأمین‌کننده</td><td>سند پرداخت + ثبت در کارت حساب + سقف اعتباری به‌روز</td></tr>
 <tr><td>کسر کارمزد/کارمزد شبا</td><td>هزینهٔ کارمزد خودکار با کدینگ بانکی</td></tr>
 <tr><td>چک صیادی ${bankData.name}</td><td>ثبت اسناد دریافتنی/پرداختنی + یادآوری سررسید</td></tr>
 <tr><td>بهرهٔ حساب/وام</td><td>سند بهرهٔ دریافتی/پرداختی در پایان دوره</td></tr>
 </tbody></table>
 <p>مغایرت‌گیری ماهانه با <a href="/blog/bank-reconciliation-tutorial">راهنمای کامل مغایرت بانکی</a> در هوش چند دقیقه‌ای است: صورت‌حساب ${bankData.name} در مقابل دفتر خزانه قرار می‌گیرد و اقلام در جریان (چک‌های وصول‌نشده، کارمزدها) خودکار شناسایی می‌شوند. برای اصول خزانه‌داری هم <a href="/blog/bank-integration-reconciliation-guide">مدیریت تنخواه و بانک</a> را ببینید.</p>
 `;

 const pageUrl = `${siteUrl}/cities/${city}/industries/${industry}/banks/${bank}`;

 // ساخت JSON-LD schemas
 const breadcrumbSchema = generateBreadcrumbSchema([
 { name: "خانه", url: siteUrl },
 // FIX(Task 6-c): سطح «شهرها» به مسیر اضافه شد — سازگار با صفحات شهر/صنعت
 { name: "شهرها", url: `${siteUrl}/cities` },
 { name: cityData.name, url: `${siteUrl}/cities/${city}` },
 { name: industryData.name, url: `${siteUrl}/cities/${city}/industries/${industry}` },
 { name: bankData.name, url: pageUrl },
 ]);

 // FIX(Task 6-c — Local SEO): Service با areaServed = همان شهر — سیگنال Local
 // Pack برای پرس‌وجوهای «حسابداری {صنعت} + {شهر} + {بانک}»؛ provider به
 // LocalBusiness سراسری اشاره می‌کند (بدون @id تکراری).
 const cityServiceSchema = {
 "@context": "https://schema.org",
 "@type": "Service",
 "@id": `${pageUrl}#service`,
 name: `نرم‌افزار حسابداری ${industryData.name} در ${cityData.name} با اتصال به ${bankData.name}`,
 serviceType: "Accounting software",
 description: `نرم‌افزار حسابداری ابری برای ${industryData.name} در ${cityData.name} با مغایرت‌گیری بانکی ${bankData.name}، اتصال به سامانه مودیان، انبار، فروش و حقوق و دستمزد`,
 provider: { "@id": `${siteUrl}/#localbusiness` },
 areaServed: [
 { "@type": "City", name: cityData.name },
 { "@type": "AdministrativeArea", name: `استان ${cityData.province}` },
 ],
 availableChannel: {
 "@type": "ServiceChannel",
 serviceUrl: pageUrl,
 servicePhone: BUSINESS_PHONE,
 availableLanguage: ["fa"],
 },
 };

 // نکته سئو: SoftwareApplication + LocalBusiness به‌صورت سراسری از طریق
 // StructuredData در app/layout.tsx تزریق می‌شوند — اینجا فقط BreadcrumbList
 // و FAQPage اضافه می‌شوند تا از تداخل @id جلوگیری شود.

 // FIX(v20-S): بازنویسی کامل با نویسه‌های فارسی (ی/ک) + برند داینامیک.
 // دورهٔ آزمایشی واقعی ۷ روز است (منبع: lib/plans.ts — TRIAL_DAYS).
 const faqItems: FaqItem[] = [
 {
 question: `آیا ${brand} برای ${industryData.name} در ${cityData.name} مناسب است؟`,
 answer: `بله، ${brand} با ۱۶ ماژول تخصصی شامل حسابداری، انبار، فروش، حقوق دستمزد، سامانه مودیان و هوش مصنوعی، به طور کامل برای ${industryData.name} در ${cityData.name} مناسب است. پشتیبانی محلی و آموزش اختصاصی نیز ارائه می‌شود.`,
 },
 {
 question: `اتصال ${brand} به ${bankData.name} چگونه است؟`,
 answer: `${brand} از طریق درگاه پرداخت و مغایرت‌گیری بانکی به ${bankData.name} متصل می‌شود. تراکنش‌های بانکی به صورت خودکار در دفتر کل ثبت و مغایرت‌گیری می‌شوند. پشتیبانی از چک صیادی ${bankData.name} نیز موجود است.`,
 },
 {
 question: `آیا سامانه مودیان برای ${industryData.name} در ${cityData.name} پشتیبانی می‌شود؟`,
 answer: `بله، ${brand} به صورت رسمی به سامانه مودیان سازمان دارایی متصل است. صدور، ارسال و مغایرت‌گیری صورتحساب الکترونیکی برای ${industryData.name} در ${cityData.name} به صورت خودکار انجام می‌شود.`,
 },
 {
 question: `هوش مصنوعی در حسابداری ${industryData.name} چه کمکی می‌کند؟`,
 answer: `هوش مصنوعی ${brand} شامل OCR فاکتور، چت‌بات حسابداری، پیش‌بینی جریان نقدی، تشخیص تقلب و دسته‌بندی هوشمند هزینه‌هاست. برای ${industryData.name} در ${cityData.name}، این امکانات زمان صرف‌شده برای کارهای تکراری را تا ۷۰ درصد کاهش می‌دهد.`,
 },
 {
 question: `قیمت نرم‌افزار حسابداری برای ${industryData.name} چقدر است؟`,
 answer: `${brand} ۷ روز رایگان قابل آزمایش است. پس از آن پلن‌های سالانه با قیمت رقابتی ارائه می‌شود. برای ${industryData.name} در ${cityData.name} پلن مناسب با توجه به حجم کسب‌وکار شما انتخاب می‌شود.`,
 },
 ];
 // v20-S: @id صفحه‌محور برای FAQPage (به‌جای @id تکراری ریشه)
 const faqSchema = generateFaqSchema(faqItems, pageUrl);

 // Agent3-Local SEO: ProfessionalService شهر + makesOffer ارجاع‌دار به صنعت
 // و بانکِ همین صفحه — name=برند، areaServed=شهر+استان، inLanguage=fa،
 // telephone/sameAs منبع واحد؛ @id صفحه‌محور بدون تداخل با layout.
 const cityOrgSchema = generateCityProfessionalServiceSchema({
  brand, siteUrl, pageUrl, city: cityData,
  industry: industryData,
  bank: bankData,
  sameAs: await getLocalSeoSameAs(brand),
 });

 const features = [
 "حسابداری کامل دفتر کل و معین",
 "اتصال رسمی به سامانه مودیان",
 `مغایرت‌گیری بانکی با ${bankData.name}`,
 "مدیریت انبار و کاردکس",
 "خرید و فروش و فاکتور",
 "حقوق و دستمزد",
 "هوش مصنوعی و OCR",
 `پشتیبانی محلی در ${cityData.name}`,
 ];

 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 {/* Header */}
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link
 href="/"
 className="inline-flex items-center gap-2"
 prefetch={false}
 >
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
 <Sparkles className="h-3.5 w-3.5" />
 </span>
 <span className="text-sm font-bold">{brand}</span>
 </Link>
 <Link
 href="/"
 className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
 prefetch={false}
 >
 صفحه اصلی
 <ArrowRight className="h-4 w-4" />
 </Link>
 </div>
 </header>

 <main className="flex-1">
 <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
 {/* Breadcrumb */}
 <nav
 aria-label="مسیر"
 className="mb-6 flex items-center gap-1 text-xs text-muted-foreground"
 >
 <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">
 خانه
 </Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{cityData.name}</span>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{industryData.name}</span>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{bankData.name}</span>
 </nav>

 {/* Title Section */}
 <div className="mb-8">
 <div className="mb-4 flex flex-wrap items-center gap-2">
 <Badge variant="secondary" className="text-xs">
 <Building2 className="h-3 w-3" />
 {cityData.name}
 </Badge>
 <Badge variant="outline" className="text-xs">
 <Factory className="h-3 w-3" />
 {industryData.name}
 </Badge>
 <Badge variant="outline" className="text-xs">
 <Landmark className="h-3 w-3" />
 {bankData.name}
 </Badge>
 </div>
 <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
 نرم‌افزار حسابداری {industryData.name} در {cityData.name} با {bankData.name}
 </h1>
 <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
 {`${brand}، جامع‌ترین نرم‌افزار حسابداری ابری هوشمند برای ${industryData.name} در ${cityData.name} با اتصال کامل به ${bankData.name}، سامانه مودیان، انبار، فروش، حقوق دستمزد و هوش مصنوعی.`}
 </p>
 </div>

 {/* Features Card */}
 <Card className="mb-8">
 <CardHeader>
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Sparkles className="h-4 w-4" />
 </div>
 <CardTitle className="text-base font-bold">
 {`امکانات ${brand} برای ${industryData.name} در ${cityData.name}`}
 </CardTitle>
 </div>
 </CardHeader>
 <CardContent>
 <ul className="grid gap-2 sm:grid-cols-2">
 {features.map((feature) => (
 <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
 <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
 {feature}
 </li>
 ))}
 </ul>
 </CardContent>
 </Card>

 {/* Bank Integration Card */}
 <Card className="mb-8">
 <CardHeader>
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
 <Landmark className="h-4 w-4" />
 </div>
 <CardTitle className="text-base font-bold">
 اتصال به {bankData.name}
 </CardTitle>
 </div>
 </CardHeader>
 <CardContent>
 <p className="text-sm leading-relaxed text-muted-foreground">
 {`${brand} از طریق درگاه پرداخت و مغایرت‌گیری بانکی به ${bankData.name} متصل می‌شود. تراکنش‌های بانکی به صورت خودکار در دفتر کل ثبت و با صورت‌حساب بانک مغایرت داده می‌شوند. پشتیبانی از چک صیادی ${bankData.name}، تنخواه و وام نیز موجود است. برای ${industryData.name} در ${cityData.name}، تمام عملیات بانکی در یک داشبورد واحد قابل مدیریت است.`}
 </p>
 </CardContent>
 </Card>

 {/* ===== Task 23-I: بخش اختصاصی بانک ===== */}
 <div
 className="blog-content mb-8 text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9"
 dangerouslySetInnerHTML={{ __html: interpolateBrand(bankSectionHtml, brand) }}
 />

 {/* ===== Task 23-I: محتوای بلند غنی صنعت + شهر (≥۲۰۰۰ کلمه) ===== */}
 {longform.length > 0 && (
 <article className="mb-8 space-y-10">
 {longform.map((section, si) => (
 <section key={si} aria-labelledby={`cb-sec-${si}`}>
 <h2 id={`cb-sec-${si}`} className="mb-4 text-xl font-extrabold leading-snug text-foreground sm:text-2xl">
 {interpolateBrand(section.heading, brand)}
 </h2>
 <div className="space-y-3">
 {section.paragraphs?.map((p, pi) => (
 <p key={pi} className="text-sm leading-8 text-foreground/80 sm:text-base sm:leading-9">
 {interpolateBrand(p, brand)}
 </p>
 ))}
 </div>
 {section.bullets && (
 <ul className="mt-4 space-y-2.5 rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
 {section.bullets.map((b, bi) => (
 <li key={bi} className="text-sm leading-7 text-foreground/80 sm:text-[15px]">
 {interpolateBrand(b, brand)}
 </li>
 ))}
 </ul>
 )}
 {section.html && (
 <div
 className="blog-content mt-4 text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9"
 dangerouslySetInnerHTML={{ __html: interpolateBrand(section.html, brand) }}
 />
 )}
 </section>
 ))}
 </article>
 )}

 {/* FAQ */}
 <Card className="mb-8">
 <CardHeader>
 <CardTitle className="text-lg font-bold">
 سوالات متداول
 </CardTitle>
 </CardHeader>
 <CardContent>
 <Accordion type="single" collapsible className="w-full">
 {faqItems.map((faq, index) => (
 <AccordionItem key={index} value={`faq-${index}`}>
 <AccordionTrigger className="text-right text-sm font-medium leading-relaxed sm:text-base">
 {faq.question}
 </AccordionTrigger>
 <AccordionContent className="text-sm leading-relaxed text-muted-foreground sm:text-base">
 {faq.answer}
 </AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </CardContent>
 </Card>

 {/* CTA */}
 <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
 <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-bold text-foreground">
 {`شروع رایگان ${brand} برای ${industryData.name} در ${cityData.name}`}
 </p>
 <p className="mt-1 text-xs text-muted-foreground">
 ۷ روز آزمایش رایگان — بدون نیاز به کارت اعتباری
 </p>
 </div>
 {/* FIX(Task 6-c): لینک داخلی صریح به قیمت — قبلاً فقط «/» بود */}
 <div className="flex flex-wrap items-center gap-2">
 <Link
 href="/pricing"
 prefetch={false}
 className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-background px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
 >
 قیمت و پلن‌ها
 </Link>
 <Link
 href={`/cities/${city}/industries/${industry}`}
 prefetch={false}
 className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-background px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
 >
 {industryData.name} در {cityData.name}
 </Link>
 <Link
 href="/"
 prefetch={false}
 className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
 >
 شروع رایگان
 <ChevronLeft className="h-3.5 w-3.5" />
 </Link>
 </div>
 </div>
 </div>

 {/* Other cities in this industry */}
 <div className="mt-10 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">
 {industryData.name} در سایر شهرها
 </h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {cities
.filter((c) => c.slug!== cityData.slug)
.slice(0, 8)
.map((c) => (
 <Link
 key={c.slug}
 href={`/cities/${c.slug}/industries/${industry}/banks/${bank}`}
 prefetch={false}
 className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5"
 >
 <Building2 className="h-3.5 w-3.5 text-primary" />
 {c.name}
 </Link>
 ))}
 </div>
 </div>

 {/* Other banks for this city+industry */}
 <div className="mt-8 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">
 {industryData.name} در {cityData.name} با سایر بانک‌ها
 </h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {bankNames
.filter((b) => b.slug!== bankData.slug)
.slice(0, 8)
.map((b) => (
 <Link
 key={b.slug}
 href={`/cities/${city}/industries/${industry}/banks/${b.slug}`}
 prefetch={false}
 className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5"
 >
 <Landmark className="h-3.5 w-3.5 text-primary" />
 {b.name}
 </Link>
 ))}
 </div>
 </div>
 </div>
 </main>

 {/* Footer */}
 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>{`${brand} — تمامی حقوق محفوظ است.`}</p>
 <div className="flex items-center gap-3">
 <Link
 href="/"
 prefetch={false}
 className="font-medium text-primary transition-colors hover:text-primary/80"
 >
 صفحه اصلی
 </Link>
 <Link
 href="/features"
 prefetch={false}
 className="transition-colors hover:text-foreground"
 >
 امکانات
 </Link>
 </div>
 </div>
 </footer>

 {/* JSON-LD -- FAQPage (v20-S: safeJsonLd ضد XSS) */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: safeJsonLd(faqSchema) }}
 />
 {/* JSON-LD -- BreadcrumbList */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbSchema) }}
 />
 {/* FIX(Task 6-c — Local SEO): Service با areaServed شهر — سیگنال Local Pack */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: safeJsonLd(cityServiceSchema) }}
 />
 {/* Agent3-Local: ProfessionalService شهر×صنعت×بانک + makesOffer */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: safeJsonLd(cityOrgSchema) }}
 />
 </div>
 );
}
