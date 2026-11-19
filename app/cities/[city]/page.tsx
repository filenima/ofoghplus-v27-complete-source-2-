import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cities, industryInfos, getCityBySlug } from "@/lib/city-industry-data";
import { getBrandName, interpolateBrand, interpolateFaqs } from "@/lib/brand-interpolate";
import { generateBreadcrumbSchema, generateFaqSchema, getSiteUrl, type FaqItem } from "@/lib/seo";
// Agent3-Local: اسکیمای ProfessionalService ویژهٔ هر شهر (lib/seo/local-schema.ts)
import { generateCityProfessionalServiceSchema, getLocalSeoSameAs } from "@/lib/seo/local-schema";
import { JsonLd } from "@/components/seo/structured-data";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ArrowRight, ChevronLeft, Sparkles, Building2, Factory, CheckCircle2, HelpCircle } from "lucide-react";

export function generateStaticParams() {
 return cities.map((c) => ({ city: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
 const { city } = await params;
 const cityData = getCityBySlug(city);
 if (!cityData) return { title: "شهر یافت نشد", description: "شهر موردنظر پیدا نشد." };
 // نکته سئو: عنوان بدون برند — قالب layout یک‌بار «| هوش» اضافه می‌کند
 const title = `نرم‌افزار حسابداری در ${cityData.name}`;
 const brand = await getBrandName();
 // FIX(Task 6-c): توضیح متا «یونیک» به ازای هر شهر — قبلاً قالب برای همهٔ شهرها
 // یکسان بود و فقط نام شهر فرق می‌کرد؛ حالا صنایع غالب هر شهر (از
 // city-industry-data) داخل توضیح می‌آید تا تمایز محتوایی در SERP بیشتر شود.
 const topIndustriesText = cityData.topIndustries?.slice(0, 2).join(" و ");
 const description = interpolateBrand(
  `نرم‌افزار حسابداری ابری هوش در ${cityData.name}${topIndustriesText ? ` — مناسب ${topIndustriesText}` : ""}؛ پشتیبانی محلی، آموزش اختصاصی و اتصال به سامانه مودیان (استان ${cityData.province})`,
  brand
 );
 const siteUrl = await getSiteUrl(); // v20-S: canonical پویا (وایت‌لیبل) به‌جای SITE_URL استاتیک
 const url = `${siteUrl}/cities/${cityData.slug}`;
 const ogImage = `${siteUrl}/api/og?title=${encodeURIComponent(title)}&type=city`;
 return {
 title, description,
 // FIX(v20-S): نویسه‌های عربی ی/ک → فارسی + برند قدیمی جایگزین‌نشدنی → برند داینامیک
 keywords: [`حسابداری ${cityData.name}`, `نرم‌افزار حسابداری ${cityData.name}`, cityData.name, brand],
 alternates: { canonical: url },
 openGraph: { title, description, url, type: "website", locale: "fa_IR", siteName: interpolateBrand("هوش", brand), images: [{ url: ogImage, width: 1200, height: 630, alt: title }] },
 twitter: { card: "summary_large_image", title, description, images: [ogImage] },
 robots: { index: true, follow: true },
 // FIX(Task 6-c — Local SEO): سیگنال جغرافیایی متا برای پرس‌وجوهای محلی —
 // geo.region کشور + geo.placename نام شهر (کلاود SaaS است؛ مختصات فیزیکی
 // فقط در /locations برای دفتر مرکزی معنا دارد)
 other: {
  "geo.region": "IR",
  "geo.placename": cityData.name,
 },
 };
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
 const { city } = await params;
 const cityData = getCityBySlug(city);
 if (!cityData) notFound();
 const brand = await getBrandName();
 const siteUrl = await getSiteUrl(); // v20-S: دامنه پویا برای JSON-LD

 const pageUrl = `${siteUrl}/cities/${cityData.slug}`;
 // نکته سئو: SoftwareApplication + LocalBusiness به‌صورت سراسری از طریق
 // StructuredData در app/layout.tsx تزریق می‌شوند — اینجا فقط BreadcrumbList
 // اضافه می‌شود تا از تداخل @id و discard شدن هر دو توسط گوگل جلوگیری شود.
 const breadcrumbSchema = generateBreadcrumbSchema([{ name: "خانه", url: siteUrl }, { name: "شهرها", url: `${siteUrl}/cities` }, { name: cityData.name, url: pageUrl }]);

 // R24-7 (Agent 2 — Local SEO): Service با areaServed = همان شهر — سیگنال
 // Local Pack برای پرس‌وجوهای «حسابداری + شهر»؛ provider به LocalBusiness
 // سراسری اشاره می‌کند (بدون @id تکراری که باعث discard می‌شود).
 const cityServiceSchema = {
  "@context": "https://schema.org",
  "@type": "Service",
  "@id": `${pageUrl}#service`,
  name: interpolateBrand(`نرم‌افزار حسابداری ابری هوش در ${cityData.name}`, brand),
  serviceType: "Accounting software",
  description: interpolateBrand(`نرم‌افزار حسابداری ابری با پشتیبانی محلی، آموزش اختصاصی و اتصال به سامانه مودیان برای کسب‌وکارهای ${cityData.name}`, brand),
  provider: { "@id": `${siteUrl}/#localbusiness` },
  areaServed: [
   { "@type": "City", name: cityData.name },
   { "@type": "AdministrativeArea", name: `استان ${cityData.province}` },
  ],
  availableChannel: {
   "@type": "ServiceChannel",
   serviceUrl: pageUrl,
   servicePhone: "071-32622493",
   availableLanguage: ["fa"],
  },
 };

 // R14-K1 (سئو/GEO): FAQPage اختصاصی شهر — پرسش‌های واقعی کاربران همان شهر با
 // پاسخ‌های مستقل و نقل‌قول‌پذیر (برای نتایج غنی گوگل + پاسخ‌های AI). متن با
 // برند قدیمی «هوش» نوشته شده و interpolateBrand آن را به برند فعلی می‌برد.
 const cityFaqs: FaqItem[] = interpolateFaqs(
  [
   {
    question: `نرم‌افزار حسابداری در ${cityData.name} چگونه پشتیبانی می‌شود؟`,
    answer: `هوش کاملاً ابری است و نیازی به نصب یا سرور محلی در ${cityData.name} ندارد؛ پشتیبانی تلفنی ۰۷۱-۳۲۶۲۲۴۹۳ (۹ صبح تا ۹ شب)، تیکت و چت داخل برنامه در دسترس است و مهاجرت داده از هلو، سپیدار و اکسل رایگان انجام می‌شود.`,
   },
   {
    question: `آیا اتصال به سامانه مودیان از ${cityData.name} امکان‌پذیر است؟`,
    answer: `بله؛ صورتحساب الکترونیکی نوع الف، ب و ج مستقیماً از هوش به سامانه مودیان سازمان امور مالیاتی ارسال می‌شود و کارپوشه نیز فعال است — برای کسب‌وکارهای ${cityData.name} همانند سایر شهرها، بدون تفاوت فنی.`,
   },
   {
    question: `قیمت و دورهٔ آزمایشی نرم‌افزار حسابداری چقدر است؟`,
    answer: `تریال ۷ روزهٔ رایگان بدون نیاز به کارت بانکی در دسترس است و همهٔ ۱۶ ماژول باز است. پلن‌ها سالانه‌اند و می‌توان یکجا با ۳٪ تخفیف یا در قالب اقساط ۱ تا ۶ ماهه پرداخت کرد.`,
   },
  ],
  brand
 );
 const faqSchema = generateFaqSchema(cityFaqs, pageUrl); // v20-S: @id صفحه‌محور

 // Agent3-Local SEO: موجودیت ProfessionalService ویژهٔ همین شهر — name=برند،
 // areaServed=شهر+استان، inLanguage=fa، telephone و sameAs منبع واحد؛
 // @id صفحه‌محور + parentOrganization → LocalBusiness سراسری (بدون تداخل @id).
 const cityOrgSchema = generateCityProfessionalServiceSchema({
  brand, siteUrl, pageUrl, city: cityData,
  sameAs: await getLocalSeoSameAs(brand),
 });

 const features = [
 "حسابداری کامل دفتر کل و معین",
 "اتصال رسمی به سامانه مودیان",
 "مدیریت انبار و کاردکس",
 "خرید و فروش و فاکتور",
 "حقوق و دستمزد",
 "هوش مصنوعی و OCR",
 `پشتیبانی محلی در ${cityData.name}`,
 ];

 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link href="/cities" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}><ArrowRight className="h-4 w-4" /> شهرها</Link>
 <Link href="/" className="inline-flex items-center gap-2" prefetch={false}>
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Sparkles className="h-3.5 w-3.5" /></span>
 <span className="text-sm font-bold">{interpolateBrand("هوش", brand)}</span>
 </Link>
 </div>
 </header>
 <main className="flex-1">
 <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
 <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
 <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">خانه</Link>
 <ChevronLeft className="h-3 w-3" />
 <Link href="/cities" prefetch={false} className="transition-colors hover:text-foreground">شهرها</Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{cityData.name}</span>
 </nav>
 <div className="mb-8">
 <div className="mb-4 flex items-center gap-3">
 <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-6 w-6" /></div>
 <Badge variant="secondary" className="text-xs">استان {cityData.province}</Badge>
 </div>
 <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">{interpolateBrand(`نرم‌افزار حسابداری هوش در ${cityData.name}`, brand)}</h1>
 <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">پشتیبانی محلی، آموزش اختصاصی و اتصال کامل به سامانه مودیان — در {cityData.name}</p>
 </div>

 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">{interpolateBrand(`امکانات هوش در ${cityData.name}`, brand)}</CardTitle></CardHeader>
 <CardContent>
 <ul className="grid gap-2 sm:grid-cols-2">
 {features.map((f) => (
 <li key={f} className="flex items-start gap-2 text-sm text-foreground"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{f}</li>
 ))}
 </ul>
 </CardContent>
 </Card>

 <Card className="mb-8">
 <CardHeader><CardTitle className="text-base font-bold">{cityData.name} — صنایع پشتیبانی‌شده</CardTitle></CardHeader>
 <CardContent>
 <div className="flex flex-wrap gap-2">
 {industryInfos.map((ind) => (
 <Link key={ind.slug} href={`/cities/${cityData.slug}/industries/${ind.slug}`} prefetch={false}>
 <Badge variant="outline" className="cursor-pointer text-xs transition-colors hover:bg-primary/5">
 <Factory className="h-3 w-3" />{ind.name}
 </Badge>
 </Link>
 ))}
 </div>
 </CardContent>
 </Card>

 {/* محتوای بلند سئو — ۱۵۰۰+ کلمه */}
 {cityData.longform && (
 <article
 className="blog-content mb-8 text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9"
 dangerouslySetInnerHTML={{ __html: interpolateBrand(cityData.longform, brand) }}
 />
 )}

 {/* R15-G (T1/ایندکس): سوالات متداول «قابل‌مشاهده» — محتوای FAQPage
 JSON-LD باید در صفحه دیده شود (راهنمای گوگل برای نتایج غنی FAQ؛
 اسکیمای بدون محتوای مرئی ریسک اسپم/حذف دارد). قبلاً فقط JSON-LD
 بدون رندر مرئی بود. */}
 <section className="mb-8" aria-labelledby="city-faq-heading">
 <Card>
 <CardHeader>
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><HelpCircle className="h-4 w-4" /></div>
 <CardTitle id="city-faq-heading" className="text-base font-bold">سوالات متداول نرم‌افزار حسابداری در {cityData.name}</CardTitle>
 </div>
 </CardHeader>
 <CardContent>
 <Accordion type="single" collapsible className="w-full">
 {cityFaqs.map((faq, index) => (
 <AccordionItem key={index} value={`city-faq-${index}`}>
 <AccordionTrigger className="text-right text-sm font-medium leading-relaxed sm:text-base">{faq.question}</AccordionTrigger>
 <AccordionContent className="text-sm leading-relaxed text-muted-foreground sm:text-base">{faq.answer}</AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </CardContent>
 </Card>
 </section>

 <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
 <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-bold text-foreground">{interpolateBrand(`شروع رایگان هوش در ${cityData.name}`, brand)}</p>
 <p className="mt-1 text-xs text-muted-foreground">۷ روز آزمایش رایگان — پشتیبانی محلی در {cityData.name}</p>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 {/* R24-7 (Agent 2): لینک داخلی صریح به قیمت و امکانات — قبلاً فقط «/» بود */}
 <Link href="/pricing" prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-background px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10">قیمت و پلن‌ها</Link>
 <Link href="/features" prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-background px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10">امکانات کامل</Link>
 <Link href="/" prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">شروع رایگان <ChevronLeft className="h-3.5 w-3.5" /></Link>
 </div>
 </div>
 </div>

 {/* R24-7 (Agent 2): لینک داخلی محلی — تماس و محل استقرار */}
 <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
 <Link href="/contact" prefetch={false} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5">تماس با ما — ۰۷۱-۳۲۶۲۲۴۹۳</Link>
 <Link href="/locations" prefetch={false} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5">محل استقرار و شهرها</Link>
 </div>

 <div className="mt-10 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">سایر شهرها</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {cities.filter((c) => c.slug!== cityData.slug).map((c) => (
 <Link key={c.slug} href={`/cities/${c.slug}`} prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5">
 <Building2 className="h-3.5 w-3.5 text-primary" />{c.name}
 </Link>
 ))}
 </div>
 </div>
 </div>
 </main>
 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>{interpolateBrand("هوش — تمامی حقوق محفوظ است.", brand)}</p>
 <Link href="/" prefetch={false} className="font-medium text-primary transition-colors hover:text-primary/80">صفحه اصلی</Link>
 </div>
 </footer>
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
 {/* R14-K1 (سئو): FAQPage اختصاصی هر شهر — نتایج غنی + GEO */}
 <JsonLd data={faqSchema} />
 {/* R24-7 (Agent 2): Service با areaServed شهر — سیگنال Local Pack */}
 <JsonLd data={cityServiceSchema} />
 {/* Agent3-Local: ProfessionalService شهر — موجودیت محلی + NAP + sameAs */}
 <JsonLd data={cityOrgSchema} />
 </div>
 );
}
