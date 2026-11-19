import type { Metadata } from "next";
import Link from "next/link";
import { industries, getIndustryBySlug } from "@/lib/industry-data";
import { generateBreadcrumbSchema, generateFaqSchema, SITE_URL, type FaqItem } from "@/lib/seo";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ArrowRight, ChevronLeft, Sparkles, CheckCircle2, HelpCircle, XCircle, TrendingUp, Receipt, Scale, Undo2, ArrowLeftRight, Plug, Gem } from "lucide-react";

// ============================================================
// صفحهٔ صنعت طلافروشی — مسیر استاتیک که بر [slug] اولویت دارد
// (ماژول واقعی طلا: /api/gold/* + lib/gold.ts — محتوا بر اساس
// منطق واقعی محصول: نرخ تگ‌جو، مالیات ۹٪ روی اجرت+سود، وزن خالص)
// ============================================================

const SLUG = "gold-shop";

export async function generateMetadata(): Promise<Metadata> {
 const industry = getIndustryBySlug(SLUG)!;
 const brand = await getBrandName();
 // عنوان مطلق — چون برند («افق پلاس») خودش در متن عنوان آمده، از قالب
 // layout («| افق پلاس») استفاده نمی‌کنیم تا برند دوبار نیاید.
 const title = `نرم‌افزار حسابداری طلافروشی | قیمت لحظه‌ای طلا، فاکتور با اجرت و مالیات — ${brand}`;
 const description = `نرم‌افزار حسابداری طلافروشی با نرخ لحظه‌ای طلا از تگ‌جو، فاکتور با اجرت و مالیات ۹٪، موجودی وزنی به تفکیک عیار، بازخرید و معاوضه طلا — ۷ روز رایگان تست کنید.`;
 const url = `${SITE_URL}/industries/${SLUG}`;
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(title)}&type=industry`;

 return {
 title: { absolute: title },
 description,
 keywords: [
 "نرم افزار حسابداری طلافروشی",
 "حسابداری طلافروشی",
 "نرم افزار طلافروشی",
 "فاکتور طلا با اجرت و مالیات",
 "قیمت لحظه ای طلا",
 "مالیات فاکتور طلا",
 "موجودی وزنی طلا",
 "بازخرید طلا",
 "معاوضه طلا",
 "حسابداری طلا و جواهر",
 "سامانه مودیان طلافروشی",
 "هوشداري طلافروشي",
 ].map((k) => interpolateBrand(k, brand)),
 alternates: { canonical: url },
 openGraph: { title, description, url, type: "website", locale: "fa_IR", siteName: brand, images: [{ url: ogImage, width: 1200, height: 630, alt: title }] },
 twitter: { card: "summary_large_image", site: "@ofoghplus", creator: "@ofoghplus", title, description, images: [ogImage] },
 robots: { index: true, follow: true },
 };
}

export default async function GoldShopIndustryPage() {
 const industry = getIndustryBySlug(SLUG)!;
 const brand = await getBrandName();

 const pageUrl = `${SITE_URL}/industries/${SLUG}`;
 const faqSchema = generateFaqSchema(industry.faqs.map((f): FaqItem => ({ question: f.question, answer: f.answer })), pageUrl);
 const breadcrumbSchema = generateBreadcrumbSchema([
 { name: "خانه", url: SITE_URL },
 { name: "صنایع", url: `${SITE_URL}/industries` },
 { name: industry.name, url: pageUrl },
 ]);

 // دردهای اصلی طلافروشان — همان چیزی که هر روز مغازه را می‌سوزاند
 const painPoints = [
 {
 pain: "محاسبهٔ اجرت و مالیات با ماشین‌حساب",
 fix: "فاکتور طلا با اجرت (ریالی یا درصدی)، سود و مالیات ۹٪ خودکار — فقط روی اجرت و سود، نه ارزش طلا",
 },
 {
 pain: "ضررِ نوسان قیمت روزانهٔ طلا",
 fix: "نرخ لحظه‌ای گرم ۱۸ و ۲۴ و مثقال از تگ‌جو؛ ارزش موجودی و بهای تمام‌شده همیشه با نرخ روز",
 },
 {
 pain: "موجودی وزنی و کاردکس دستی",
 fix: "انبار وزنی به تفکیک عیار (۲۴/۲۲/۱۸/۱۴) با وزن خالص و کسر وزن سنگ",
 },
 ];

 // ویژگی‌های ماژول طلافروشی — منطق واقعی lib/gold.ts
 const features = [
 {
 icon: TrendingUp,
 title: "قیمت لحظه‌ای طلا از تگ‌جو",
 desc: "همگام‌سازی خودکار نرخ گرم ۱۸ و مثقال از تگ‌جو؛ محاسبهٔ گرم ۲۴، تاریخچهٔ نرخ برای مقایسهٔ خرید/فروش و ثبت دستی نرخ در صورت نیاز.",
 },
 {
 icon: Receipt,
 title: "فاکتور طلا با اجرت و مالیات ۹٪",
 desc: "محاسبهٔ خودکار ارزش طلا، اجرت (ریال در گرم یا درصد)، سود فروشنده و مالیات بر ارزش افزودهٔ ۹٪ فقط روی اجرت و سود — مطابق رویهٔ فاکتور طلا.",
 },
 {
 icon: Scale,
 title: "موجودی وزنی به تفکیک عیار",
 desc: "ثبت وزن کل و وزن سنگ برای هر قلم، محاسبهٔ وزن خالص، گزارش وزنی موجودی به تفکیک عیار ۲۴، ۲۲، ۱۸ و ۱۴ و ارزش‌گذاری لحظه‌ای با نرخ روز.",
 },
 {
 icon: Undo2,
 title: "خرید مجدد (بازخرید)",
 desc: "فاکتور بازخرید با محاسبهٔ ارزش طلای دریافتی بر اساس عیار و نرخ روز، کسر کارمزد از مبلغ پرداختی — بدون مالیات و سود، با سند حسابداری خودکار.",
 },
 {
 icon: ArrowLeftRight,
 title: "معاوضهٔ طلا به طلا",
 desc: "ارزش طلای دریافتی از مشتری خودکار از فاکتور فروش جدید کسر می‌شود؛ فقط مابه‌التفاوت همراه اجرت و مالیات از مشتری دریافت می‌گردد.",
 },
 {
 icon: Plug,
 title: "اتصال API سیستم طلافروشی",
 desc: "API مستندسازی‌شدهٔ ماژول طلا برای اتصال به سایت فروش، اپ یا نرم‌افزار فعلی مغازه — نرخ لحظه‌ای، فاکتور و موجودی وزنی قابل همگام‌سازی است.",
 },
 ];

 const benefits = [
 "فاکتور طلا در ۳۰ ثانیه — بدون ماشین‌حساب و بدون خطای اجرت",
 "مالیات ۹٪ همیشه روی مبنای درست (اجرت + سود) محاسبه می‌شود",
 "ارزش موجودی ویترین با نرخ لحظه‌ای — بدون اکسل روزانه",
 "بازخرید و معاوضه با سند خودکار و کاردکس وزنی دقیق",
 "اتصال کامل به سامانه مودیان با الگوی صورتحساب طلا",
 "گزارش سود واقعی جدا از نوسان قیمت طلا",
 ];

 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link href="/industries" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}>
 <ArrowRight className="h-4 w-4" />
 صنایع
 </Link>
 <Link href="/" className="inline-flex items-center gap-2" prefetch={false}>
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Sparkles className="h-3.5 w-3.5" /></span>
 <span className="text-sm font-bold">{brand}</span>
 </Link>
 </div>
 </header>

 <main className="flex-1">
 <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
 <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
 <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">خانه</Link>
 <ChevronLeft className="h-3 w-3" />
 <Link href="/industries" prefetch={false} className="transition-colors hover:text-foreground">صنایع</Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{industry.name}</span>
 </nav>

 <div className="mb-8">
 <div className="mb-4 flex items-center gap-3">
 <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
 <Gem className="h-6 w-6" />
 </div>
 <Badge variant="secondary" className="text-xs">{industry.name}</Badge>
 </div>
 <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
 {interpolateBrand(`نرم‌افزار حسابداری ${industry.name} — هوش`, brand)}
 </h1>
 <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{industry.description}</p>
 </div>

 {/* ===== دردهای طلافروش و راه‌حل ===== */}
 <Card className="mb-8">
 <CardHeader>
 <CardTitle className="text-base font-bold">هر روز طلافروشی بدون نرم‌افزار تخصصی چه دردی دارد؟</CardTitle>
 </CardHeader>
 <CardContent>
 <ul className="space-y-4">
 {painPoints.map((p) => (
 <li key={p.pain} className="rounded-xl border border-border bg-muted/30 p-4">
 <div className="flex items-start gap-2 text-sm font-medium text-foreground">
 <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
 {p.pain}
 </div>
 <div className="mt-2 flex items-start gap-2 pr-6 text-sm leading-relaxed text-muted-foreground">
 <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
 {interpolateBrand(`در هوش: ${p.fix}`, brand)}
 </div>
 </li>
 ))}
 </ul>
 </CardContent>
 </Card>

 {/* ===== ویژگی‌های ماژول طلافروشی ===== */}
 <h2 className="mb-4 text-xl font-extrabold leading-snug text-foreground sm:text-2xl">ماژول طلافروشی {brand} چه می‌کند؟</h2>
 <div className="mb-10 grid gap-4 sm:grid-cols-2">
 {features.map((f) => {
 const Icon = f.icon;
 return (
 <Card key={f.title} className="transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
 <CardHeader>
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
 <Icon className="h-5 w-5" />
 </div>
 <CardTitle className="text-base font-bold">{f.title}</CardTitle>
 </div>
 </CardHeader>
 <CardContent>
 <p className="text-sm leading-relaxed text-muted-foreground">{interpolateBrand(f.desc, brand)}</p>
 </CardContent>
 </Card>
 );
 })}
 </div>

 {/* ===== نمونه فاکتور طلا با اعداد واقعی ===== */}
 <Card className="mb-8">
 <CardHeader>
 <CardTitle className="text-base font-bold">نمونهٔ محاسبهٔ فاکتور طلا — انگشتر ۱۸ عیار، ۵ گرم</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b border-border">
 <th className="pb-3 pr-3 text-right font-medium text-muted-foreground">جزء فاکتور</th>
 <th className="pb-3 text-left font-medium text-muted-foreground">مبلغ (ریال)</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 <tr>
 <td className="py-2.5 pr-3">ارزش طلا — ۵ گرم × نرخ گرم ۱۸ (۹۰٬۰۰۰٬۰۰۰)</td>
 <td className="py-2.5 text-left font-medium">۴۵۰٬۰۰۰٬۰۰۰</td>
 </tr>
 <tr>
 <td className="py-2.5 pr-3">اجرت ساخت — ۱۰٪ ارزش طلا</td>
 <td className="py-2.5 text-left">۴۵٬۰۰۰٬۰۰۰</td>
 </tr>
 <tr>
 <td className="py-2.5 pr-3">سود فروشنده — ۷٪</td>
 <td className="py-2.5 text-left">۳۱٬۵۰۰٬۰۰۰</td>
 </tr>
 <tr>
 <td className="py-2.5 pr-3">مالیات بر ارزش افزوده — ۹٪ فقط روی اجرت + سود</td>
 <td className="py-2.5 text-left">۶٬۸۸۵٬۰۰۰</td>
 </tr>
 <tr className="bg-muted/40">
 <td className="py-3 pr-3 font-bold text-foreground">قابل پرداخت مشتری</td>
 <td className="py-3 text-left font-bold text-primary">۵۳۳٬۳۸۵٬۰۰۰</td>
 </tr>
 </tbody>
 </table>
 </div>
 <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
 {interpolateBrand("همین محاسبه برای بازخرید معکوس می‌شود: پرداخت به مشتری = ارزش طلا با نرخ روز منهای کارمزد؛ بدون مالیات و سود. هوش هر دو حالت را با سند حسابداری خودکار ثبت می‌کند.", brand)}
 </p>
 </CardContent>
 </Card>

 {/* ===== مزایا ===== */}
 <Card className="mb-8">
 <CardHeader>
 <CardTitle className="text-base font-bold">{interpolateBrand(`مزایای هوش برای ${industry.name}`, brand)}</CardTitle>
 </CardHeader>
 <CardContent>
 <ul className="grid gap-2 sm:grid-cols-2">
 {benefits.map((b) => (
 <li key={b} className="flex items-start gap-2 text-sm text-foreground">
 <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
 {interpolateBrand(b, brand)}
 </li>
 ))}
 </ul>
 </CardContent>
 </Card>

 {/* ===== محتوای تخصصی طلا ===== */}
 <article className="mb-8 space-y-10">
 <section aria-labelledby="sec-gold-1">
 <h2 id="sec-gold-1" className="mb-4 text-xl font-extrabold leading-snug text-foreground sm:text-2xl">
 حسابداری طلافروشی با حسابداری فروشگاه معمولی چه فرقی دارد؟
 </h2>
 <div className="space-y-3">
 <p className="text-sm leading-8 text-foreground/80 sm:text-base sm:leading-9">
 {interpolateBrand("در فروشگاه معمولی، کالا با «تعداد» و «قیمت ثابت» مدیریت می‌شود؛ در طلافروشی، کالا با «وزن» و «عیار» مدیریت می‌شود و قیمت آن هر روز — و بعضی ساعت‌ها — عوض می‌شود. به همین دلیل نرم‌افزار حسابداری عمومی برای طلافروشی کافی نیست: وقتی نرخ طلا بالا می‌رود، ارزش ویترین شما بالا می‌رود اما سود شما نه! سود واقعی طلافروش فقط از اجرت ساخت و سود فروشنده می‌آید و باید دقیق از نوسان قیمت جدا شود.", brand)}
 </p>
 <p className="text-sm leading-8 text-foreground/80 sm:text-base sm:leading-9">
 {interpolateBrand("هوش این تفکیک را در قلب ماژول طلافروشی دارد: ارزش طلا، اجرت، سود و مالیات در هر فاکتور جدا محاسبه و ثبت می‌شوند؛ بهای تمام‌شدهٔ هر قلم بر اساس وزن خالص و نرخ خرید است و گزارش سود واقعی ماهانه (جدا از نوسان نرخ) به شما نشان می‌دهد مغازه واقعاً چقدر سود کرده است.", brand)}
 </p>
 </div>
 </section>

 <section aria-labelledby="sec-gold-2">
 <h2 id="sec-gold-2" className="mb-4 text-xl font-extrabold leading-snug text-foreground sm:text-2xl">
 مالیات و مودیان طلافروشی — قانون و راه‌حل
 </h2>
 <div className="space-y-3">
 <p className="text-sm leading-8 text-foreground/80 sm:text-base sm:leading-9">
 {interpolateBrand("بر اساس رویهٔ جاری، در فروش طلا و جواهر، مالیات بر ارزش افزوده با نرخ ۹٪ فقط روی اجرت ساخت و سود فروشنده اعمال می‌شود؛ ارزش ریالی خود طلا مشمول مالیات نیست. اشتباه در این تفکیک یعنی یا مالیات اضافه از مشتری گرفته می‌شود یا کمتر به سازمان دارایی پرداخت می‌شود — هر دو برای کسب‌وکار ریسک دارند.", brand)}
 </p>
 <p className="text-sm leading-8 text-foreground/80 sm:text-base sm:leading-9">
 {interpolateBrand("همچنین طلافروشان مکلف به صدور صورتحساب الکترونیکی در سامانه مودیان هستند؛ الگوی صورتحساب طلا الزامات خاص خود را دارد. در هوش فاکتور طلا هم‌زمان با چاپ برای مشتری، به‌صورت خودکار به سامانه مودیان ارسال و مغایرت‌گیری می‌شود و اظهارنامهٔ فصلی ارزش افزوده از روی همین فاکتورها ساخته می‌شود.", brand)}
 </p>
 </div>
 </section>

 <section aria-labelledby="sec-gold-3">
 <h2 id="sec-gold-3" className="mb-4 text-xl font-extrabold leading-snug text-foreground sm:text-2xl">
 موجودی وزنی، معاوضه و بازخرید — جایی که اکسل کم می‌آورد
 </h2>
 <div className="space-y-3">
 <p className="text-sm leading-8 text-foreground/80 sm:text-base sm:leading-9">
 {interpolateBrand("هر قلم در انبار طلا با عیار (۲۴، ۲۲، ۱۸ یا ۱۴)، وزن کل و وزن سنگ ثبت می‌شود؛ وزن خالص طلا خودکار محاسبه می‌شود و کاردکس وزنی نشان می‌دهد در هر لحظه چند گرم طلا در هر عیار در ویترین یا گاوصندوق دارید. وقتی مشتری طلای قدیمی می‌آورد، ارزش آن با نرخ روز و عیار محاسبه، از فاکتور خرید جدید کسر می‌شود و در بازخرید، کارمزد از مبلغ پرداختی کم می‌شود — همه با سند و بدون دخالت دستی.", brand)}
 </p>
 </div>
 </section>
 </article>

 {/* ===== FAQ ===== */}
 <Card className="mb-8">
 <CardHeader>
 <div className="flex items-center justify-between">
 <CardTitle className="text-base font-bold">سوالات متداول طلافروشی</CardTitle>
 <Link href={`/industries/${SLUG}/faq`} prefetch={false}>
 <Button variant="ghost" size="sm" className="gap-1 text-xs">
 <HelpCircle className="h-3.5 w-3.5" />
 همه سوالات
 </Button>
 </Link>
 </div>
 </CardHeader>
 <CardContent>
 <Accordion type="single" collapsible className="w-full">
 {industry.faqs.map((faq, idx) => (
 <AccordionItem key={idx} value={`faq-${idx}`}>
 <AccordionTrigger className="text-right text-sm font-medium leading-relaxed sm:text-base">{interpolateBrand(faq.question, brand)}</AccordionTrigger>
 <AccordionContent className="text-sm leading-relaxed text-muted-foreground sm:text-base">{interpolateBrand(faq.answer, brand)}</AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </CardContent>
 </Card>

 {/* ===== CTA ===== */}
 <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
 <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-bold text-foreground">{interpolateBrand(`شروع رایگان هوش برای ${industry.name}`, brand)}</p>
 <p className="mt-1 text-xs text-muted-foreground">۷ روز آزمایش رایگان — ماژول طلا، نرخ تگ‌جو و مودیان بدون نیاز به کارت اعتباری</p>
 </div>
 <Link href="/pricing" prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
 شروع رایگان
 <ChevronLeft className="h-3.5 w-3.5" />
 </Link>
 </div>
 </div>

 {/* ===== سایر صنایع ===== */}
 <div className="mt-10 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">سایر صنایع</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {industries.filter((ind) => ind.slug !== SLUG).map((ind) => {
 const IndIcon = ind.icon;
 return (
 <Link key={ind.slug} href={`/industries/${ind.slug}`} prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5">
 <IndIcon className="h-3.5 w-3.5 text-primary" />
 {ind.name}
 </Link>
 );
 })}
 </div>
 </div>
 </div>
 </main>

 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>{brand} — تمامی حقوق محفوظ است.</p>
 <div className="flex items-center gap-3">
 <Link href="/" prefetch={false} className="font-medium text-primary transition-colors hover:text-primary/80">صفحه اصلی</Link>
 <Link href="/features" prefetch={false} className="transition-colors hover:text-foreground">امکانات</Link>
 <Link href="/pricing" prefetch={false} className="transition-colors hover:text-foreground">قیمت‌گذاری</Link>
 </div>
 </div>
 </footer>

 {/* نکتهٔ سئو: SoftwareApplication به‌صورت سراسری از StructuredData در layout
 تزریق می‌شود — نسخهٔ محلی دوم ریسک rich-snippet-spam دارد. */}
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(faqSchema), brand) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
 </div>
 );
}
