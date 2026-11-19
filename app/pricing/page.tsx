import type { Metadata } from "next";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import Link from "next/link";
import { CreditCard, ShieldCheck, Unlock, Sparkles, Star, Quote, MoveHorizontal, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PricingPlans } from "@/components/seo/pricing-plans";
// v35.5 (پیشنهاد ۷ + نقشهٔ راه ۲-۲): نوار آمار زنده + ماشین‌حساب هزینه
import { LiveStatsBar } from "@/components/seo/live-stats-bar";
import { PlanQuiz } from "@/components/seo/plan-quiz";
// v35.6 [استایل]: FAQ آکاردئونی
import { FaqAccordion } from "@/components/seo/faq-accordion";
import { CostCalculator } from "@/components/seo/cost-calculator";
// R24-7 (Agent 4 — AEO): بلوک «پاسخ کوتاه» بعد از H1 برای موتورهای پاسخ‌گو
import { QuickAnswer } from "@/components/seo/quick-answer";
// FIX(9-a): قیمت‌های مؤثر (ویرایش‌شدهٔ سوپرادمین) — منبع واحد سرور-ساید
import { getEffectivePlans, type Plan } from "@/lib/plans";
import { db } from "@/lib/db";
import {
 generateBreadcrumbSchema,
 generateFaqSchema,
 getSiteUrl,
 type FaqItem,
} from "@/lib/seo";
import { JsonLd } from "@/components/seo/structured-data";

/**
 * /pricing — صفحه قیمت نرم‌افزار حسابداری هوش
 * =====================================================
 * سرور-رندرشده (SSR کامل) — داده پلن‌ها از lib/plans.ts
 * (منبع واحد قیمت‌گذاری) خوانده می‌شود.
 *
 * FIX(B18 — v36):
 *  ۱) قیمت‌ها هاردکد نبودند در متن‌ها — حالا از getEffectivePlans()
 *     ساخته می‌شوند (generateMetadata + FAQ داخل صفحه).
 *  ۲) JSON-LD Product دوبله حذف شد — schema سراسری در app/layout.tsx
 *     (StructuredData → generateProductSchema) کافی است؛ تکرار Product در
 *     گوگل «duplicate structured data» محسوب می‌شود.
 */

const PAGE_TITLE = "قیمت نرم‌افزار حسابداری | پلن‌ها و تعرفه‌ها";

// FIX(B18 — v36): توضیح متا با قیمت‌های مؤثر ساخته می‌شود (نه هاردکد)
// R14-K1 (سئو): طول توضیح به ۱۲۰-۱۶۰ نویسه محدود شد (قبلاً ۲۲۷ نویسه بود و
// گوگل می‌بریدش) — قیمت‌ها + CTA کوتاه؛ اگر پلن‌ها زیاد شدند، نسخهٔ کوتاه‌تر.
function buildPageDescription(plans: Plan[], brandName: string): string {
 const priced = plans.filter((p) => p.priceToman > 0);
 const parts = priced.map((p) => `${p.name} ${p.priceToman.toLocaleString("fa-IR")}`);
 const priceList = parts.length > 0 ? parts.join("، ") + " تومان در سال" : "پلن‌های متناسب با هر کسب‌وکار";
 const B = (t: string) => interpolateBrand(t, brandName);
 let desc = B(`قیمت نرم‌افزار حسابداری هوش — ${priceList}. ۷ روز آزمایش رایگان و مهاجرت رایگان از هلو/سپیدار.`);
 if ([...desc].length > 158) {
 desc = B(`قیمت نرم‌افزار حسابداری هوش — ${priceList}. ۷ روز آزمایش رایگان؛ اقساط ۱ تا ۶ ماهه.`);
 }
 return desc;
}

// FIX(B18 — v36): metadata → generateMetadata تا قیمت‌های مؤثر در توضیح بیایند
export async function generateMetadata(): Promise<Metadata> {
 const plans = (await getEffectivePlans()).filter((p) => !p.hidden);
 const brandName = await getBrandName();
 const siteUrl = await getSiteUrl(); // v20-S: canonical پویا (وایت‌لیبل) به‌جای SITE_URL استاتیک
 const description = buildPageDescription(plans, brandName);
 return {
 title: PAGE_TITLE,
 description,
 keywords: [
 "قیمت نرم افزار حسابداری",
 "تعرفه نرم افزار حسابداری",
 interpolateBrand("قیمت هوش", brandName),
 "خرید نرم افزار حسابداری",
 "پلن حسابداری ابری",
 "هزینه نرم افزار حسابداری",
 "خرید اقساطی نرم افزار حسابداری",
 ],
 alternates: {
 canonical: `${siteUrl}/pricing`,
 },
 openGraph: {
 title: interpolateBrand("قیمت نرم‌افزار حسابداری هوش | پلن‌ها و تعرفه‌ها", brandName),
 description,
 url: `${siteUrl}/pricing`,
 siteName: brandName,
 images: [
 {
 url: "/og-ofoghplus-v4.png",
 width: 1200,
 height: 630,
 alt: interpolateBrand("قیمت نرم‌افزار حسابداری هوش — پلن‌ها و تعرفه‌ها", brandName),
 type: "image/png",
 },
 ],
 locale: "fa_IR",
 type: "website",
 },
 twitter: {
 card: "summary_large_image",
 site: "@ofoghplus",
 creator: "@ofoghplus",
 title: interpolateBrand("قیمت نرم‌افزار حسابداری هوش | پلن‌ها و تعرفه‌ها", brandName),
 description,
 images: ["/og-ofoghplus-v4.png"],
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

// ============ JSON-LD ============
// FIX(v20-S): breadcrumb با دامنهٔ پویا داخل کامپوننت ساخته می‌شود (قبلاً SITE_URL
// استاتیک در سطح ماژول بود و زیر وایت‌لیبل @id اشتباه می‌داد).

// FIX(B18 — v36): buildProductSchema حذف شد — Product schema سراسری در
// app/layout.tsx (StructuredData → generateProductSchema) تزریق می‌شود و
// تکرار آن در این صفحه «duplicate structured data» است. FAQ schema با
// پاسخ‌های داینامیک (قیمت‌های مؤثر) داخل خود صفحه ساخته می‌شود.

// FIX(B18 — v36): FAQ با قیمت‌های مؤثر ساخته می‌شود (تابع) — پاسخ «قیمت
// چقدر است» از دل plans می‌آید، نه هاردکد. تابع داخل کامپوننت صدا زده می‌شود.
function buildPricingFaqs(plans: Plan[], brandName: string): FaqItem[] {
 const byId = (id: string) => plans.find((p) => p.id === id);
 const basic = byId("basic");
 const pro = byId("pro");
 const enterprise = byId("enterprise");
 const fa = (n?: number) => (n ?? 0).toLocaleString("fa-IR");
 const priceAnswer =
 basic && pro && enterprise
 ? `پلن پایه ${fa(basic.priceToman)} تومان، پلن حرفه‌ای ${fa(pro.priceToman)} تومان و پلن سازمانی ${fa(enterprise.priceToman)} تومان در سال است. با پرداخت یکجا ۳٪ تخفیف می‌گیرید و می‌توانید مبلغ را در ۱ تا ۶ قسط پرداخت کنید. هزینه راه‌اندازی یا هزینه پنهان وجود ندارد.`
 : `پلن‌های متناسب با هر اندازه کسب‌وکار — از پلن پایه تا سازمانی. با پرداخت یکجا ۳٪ تخفیف و امکان پرداخت اقساطی ۱ تا ۶ ماهه. هزینه راه‌اندازی یا هزینه پنهان وجود ندارد.`;
 return [
 {
 // FIX(v20-S): برند «هوش» → برند داینامیک (افق پلاس) — قبلاً hard-code بود
 question: interpolateBrand("قیمت نرم‌افزار حسابداری هوش چقدر است؟", brandName),
 answer: priceAnswer,
 },
 {
 question: "آیا آزمایش رایگان دارید؟",
 answer:
 "بله، تمام پلن‌ها شامل ۷ روز آزمایش رایگان با تمام امکانات و بدون نیاز به کارت بانکی هستند. در پایان دوره می‌توانید پلن خود را انتخاب کنید یا حساب را غیرفعال کنید.",
 },
 {
 question: "روش پرداخت و امکان عودت وجه چگونه است؟",
 answer:
 "پرداخت از طریق درگاه بانکی آنلاین (شاپرک) به‌صورت یکجا (با ۳٪ تخفیف) یا در ۱ تا ۶ قسط انجام می‌شود و برای سازمان‌ها امکان صدور فاکتور رسمی و انتقال بانکی وجود دارد. چون دوره آزمایش ۷ روزه رایگان است، می‌توانید پیش از خرید تمام امکانات را ارزیابی کنید؛ در صورت مشکل فنی حل‌نشده، مبلغ با روزشمار عودت داده می‌شود.",
 },
 {
 question: "اگر از نرم‌افزار دیگری مهاجرت کنم چه می‌شود؟",
 answer:
 "تیم ما انتقال داده‌ها از هلو، سپیدار، پارسیان و سایر نرم‌افزارها را انجام می‌دهد؛ شامل طرف‌حساب‌ها، کالاها، موجودی انبار و اسناد مالی. ارتقا بین پلن‌ها نیز در هر زمان با خرید پلن جدید ممکن است.",
 },
 ];
}

// ============ مقایسه پلن‌ها (SSR) ============

// FIX(9-a): سطر «قیمت سالانه» حذف شد — داخل component از قیمت مؤثر ساخته می‌شود
const COMPARISON_ROWS: { label: string; values: (string | boolean)[] }[] = [
 { label: "تعداد کاربران", values: ["۱", "۲", "نامحدود"] },
 { label: "تعداد انبار", values: ["۲", "۳", "نامحدود"] },
 { label: "فاکتور ماهانه", values: ["نامحدود", "نامحدود", "نامحدود"] },
 { label: "اتصال به سامانه مودیان", values: [true, true, true] },
 { label: "هسته حسابداری + انبار + خرید و فروش", values: [true, true, true] },
 { label: "خزانه‌داری و چک صیادی", values: [true, true, true] },
 { label: "ارزش افزوده و مالیات", values: [true, true, true] },
 { label: "حقوق و دستمزد", values: [false, true, true] },
 { label: "CRM + پیامک", values: [false, true, true] },
 { label: "هوش مصنوعی (OCR + چت‌بات + پیش‌بینی)", values: [false, true, true] },
 { label: "هوش مصنوعی پیشرفته (ML + تشخیص تقلب)", values: [false, false, true] },
 { label: "اتصال ووکامرس / دیجی‌کالا", values: [false, true, true] },
 { label: "اپ موبایل و PWA", values: [true, true, true] },
 { label: "API کامل + Webhook", values: [false, true, true] },
 { label: "چند شرکتی (Multi-company)", values: [false, false, true] },
 { label: "SSO و Audit پیشرفته", values: [false, false, true] },
 { label: "پشتیبانی", values: ["ایمیلی", "تلفنی اولویت‌دار", "اختصاصی ۲۴/۷"] },
];

const TRUST_BADGES = [
 { icon: CreditCard, title: "پرداخت امن", desc: "درگاه شاپرک و رمزنگاری SSL" },
 { icon: Unlock, title: "بدون قرارداد", desc: "هر زمان لغو کنید" },
 { icon: ShieldCheck, title: "بدون هزینه پنهان", desc: "به‌روزرسانی رایگان" },
];

export default async function PricingPage() {
 // REBRAND(v37): برند داینامیک برای متن‌های قابل‌مشاهده
 const brand = await getBrandName();
 // FIX(9-a): پلن‌های مؤثر — قیمت/ویژگی ویرایش‌شدهٔ سوپرادمین (fallback استاتیک)
 const plans = (await getEffectivePlans()).filter((p) => !p.hidden);
 // v20-S: دامنهٔ پویا برای canonical/JSON-LD (وایت‌لیبل)
 const siteUrl = await getSiteUrl();
 const breadcrumbSchema = generateBreadcrumbSchema([
 { name: "خانه", url: siteUrl },
 { name: "قیمت‌گذاری", url: `${siteUrl}/pricing` },
 ]);
 // FIX(B18 — v36): FAQ و schema آن با قیمت‌های مؤثر ساخته می‌شوند
 // FIX(crash — v36): pricingFaqs تعریف و در UI (خط ~460) استفاده می‌شود —
 // قبلاً فقط schema ساخته می‌شد و ReferenceError کل سرور dev را می‌کشت.
 const pricingFaqs = buildPricingFaqs(plans, brand);
 const faqSchema = generateFaqSchema(pricingFaqs, `${siteUrl}/pricing`); // v20-S: @id صفحه‌محور
 // FIX(9-a): سطر قیمت جدول مقایسه از قیمت مؤثر ساخته می‌شود (نه هاردکد)
 const comparisonRows = [
 {
 label: "قیمت سالانه",
 values: plans.map((p) =>
 p.priceToman > 0 ? `${p.priceToman.toLocaleString("fa-IR")} تومان` : "رایگان"
 ),
 },
 ...COMPARISON_ROWS,
 ];
 // نظرات تاییدشده برای بخش social proof — سقف ۳ نظر برتر (featured اول)
 let testimonials: { id: string; name: string; role: string | null; company: string | null; rating: number; content: string }[] = [];
 let avgRating = 5;
 let testimonialCount = 0;
 try {
 const [items, agg] = await Promise.all([
 db.siteTestimonial.findMany({
 where: { status: "APPROVED" },
 orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
 take: 3,
 select: { id: true, name: true, role: true, company: true, rating: true, content: true },
 }),
 db.siteTestimonial.aggregate({
 where: { status: "APPROVED" },
 _avg: { rating: true },
 _count: { _all: true },
 }),
 ]);
 testimonials = items;
 avgRating = Math.round((agg._avg.rating?? 5) * 10) / 10;
 testimonialCount = agg._count._all;
 } catch {
 // دیتابیس در دسترس نیست — بخش نظرات حذف می‌شود (SSR همچنان کار می‌کند)
 }
 return (
 <div className="flex min-h-screen flex-col bg-background text-foreground" dir="rtl">
 {/* FIX(B18 — v36): Product schema دوبله حذف شد — سراسری از layout تزریق می‌شود */}
 <JsonLd data={faqSchema} />
 <JsonLd data={breadcrumbSchema} />

 <main className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
 {/* Hero — v35.5: پس‌زمینهٔ تزئینی گرادیانی + بافت نقطه‌ای */}
 <section className="relative overflow-hidden py-16 text-center sm:py-20">
 <div
 className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full"
 aria-hidden="true"
 >
 <div className="absolute left-1/2 top-0 h-72 w-[36rem] max-w-full -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl dark:bg-emerald-500/10" />
 <div className="absolute right-[15%] top-10 h-40 w-40 rounded-full bg-amber-300/10 blur-2xl dark:bg-amber-400/10" />
 <div
 className="absolute inset-0 opacity-40 dark:opacity-20"
 style={{
 backgroundImage:
 "radial-gradient(circle, currentColor 1px, transparent 1px)",
 backgroundSize: "22px 22px",
 color: "rgb(16 185 129 / 0.07)",
 maskImage:
 "radial-gradient(ellipse 60% 60% at 50% 30%, black 30%, transparent 75%)",
 WebkitMaskImage:
 "radial-gradient(ellipse 60% 60% at 50% 30%, black 30%, transparent 75%)",
 }}
 />
 </div>
 <Badge className="mb-4 bg-primary/10 text-primary" variant="secondary">
 <Sparkles className="ml-1 h-3 w-3" />
 قیمت‌گذاری شفاف
 </Badge>
 <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
 {interpolateBrand("قیمت نرم‌افزار حسابداری هوش", brand)}
 </h1>
 {/* R24-7 (Agent 4 — AEO): پاسخ کوتاه ۴۰-۶۰ کلمه‌ای — نقل‌قول‌پذیر برای AI Overviews */}
 <div className="mx-auto mt-5 max-w-2xl">
 <QuickAnswer
 question={interpolateBrand("قیمت نرم‌افزار حسابداری هوش چقدر است؟", brand)}
 answer={interpolateBrand(
 "قیمت نرم‌افزار حسابداری هوش سالانه است: پلن پایه ۹٫۷۵ میلیون، حرفه‌ای ۱۴٫۹ میلیون و سازمانی ۳۹٫۹ میلیون تومان. تمام پلن‌ها شامل ۷ روز آزمایش رایگان بدون کارت بانکی، اتصال به سامانه مودیان، به‌روزرسانی رایگان و مهاجرت رایگان از هلو و سپیدار هستند؛ پرداخت یکجا ۳٪ تخفیف یا اقساط ۱ تا ۶ ماهه دارد.",
 brand
 )}
 />
 </div>
 <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
 هزینه ورود پایین، بدون هزینه پنهان — از فروشگاه کوچک تا شرکت بزرگ،
 پلنی متناسب با هر اندازه کسب‌وکار. تمام پلن‌ها ابری هستند و شامل
 به‌روزرسانی رایگان، بکاپ خودکار و ۷ روز آزمایش رایگان می‌شوند.
 </p>
 </section>

 {/* v35.5 (پیشنهاد ۷): نوار آمار زندهٔ پلتفرم */}
 <LiveStatsBar />

 {/* Trust badges */}
 <section aria-label="مزایای خرید" className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
 {TRUST_BADGES.map((b) => {
 const Icon = b.icon;
 return (
 <Card key={b.title} className="card-hover flex items-center gap-3 p-4">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-sm font-semibold leading-tight text-foreground">{b.title}</p>
 <p className="mt-0.5 text-xs leading-tight text-muted-foreground">{b.desc}</p>
 </div>
 </Card>
 );
 })}
 </section>

 {/* پلن‌ها (کلاینت با رندر اولیه سرور) */}
 <PricingPlans plans={plans} />

 {/* v35.5 (نقشهٔ راه ۲-۲ + قاب‌بندی پیشنهاد ۶): ماشین‌حساب هزینهٔ نرم‌افزار */}
 <CostCalculator
 plans={plans.map((p) => ({
 id: p.id,
 name: p.name,
 priceToman: p.priceToman,
 maxUsers: p.maxUsers,
 maxWarehouses: p.maxWarehouses,
 maxInvoices: p.maxInvoices,
 popular: p.popular,
 }))}
 />

 {/* v35.6 (نقشهٔ راه ۲-۴): کوییز ۵سوالی «کدام پلن برای من؟» */}
 <PlanQuiz
 plans={plans.map((p) => ({
 id: p.id,
 name: p.name,
 priceToman: p.priceToman,
 popular: p.popular,
 }))}
 />

 {/* نظرات واقعی مشتریان — social proof از دیتابیس (فقط تاییدشده‌ها) — R14-F: cv-auto */}
 {testimonials.length > 0 && (
 <section className="cv-auto mt-20" aria-label={interpolateBrand("نظر مشتریان هوش", brand)}>
 <div className="mb-8 text-center">
 <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
 {interpolateBrand("مشتریان هوش چه می‌گویند؟", brand)}
 </h2>
 <div className="mt-3 flex items-center justify-center gap-1" aria-label={`میانگین امتیاز ${avgRating} از ۵`}>
 {Array.from({ length: 5 }).map((_, i) => (
 <Star
 key={i}
 className={`h-4 w-4 ${i < Math.round(avgRating)? "fill-amber-400 text-amber-400": "text-muted-foreground/40"}`}
 aria-hidden="true"
 />
 ))}
 <span className="ms-2 text-sm text-muted-foreground">
 میانگین {avgRating.toLocaleString("fa-IR")} از ۵ از زبان {testimonialCount.toLocaleString("fa-IR")} مشتری
 </span>
 </div>
 </div>
 <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
 {testimonials.map((t) => (
 <Card key={t.id} className="relative flex flex-col p-6">
 <Quote className="absolute end-4 top-4 h-6 w-6 text-primary/15" aria-hidden="true" />
 <div className="flex items-center gap-1" aria-label={`امتیاز ${t.rating} از ۵`}>
 {Array.from({ length: t.rating }).map((_, i) => (
 <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
 ))}
 </div>
 <p className="mt-3 flex-1 text-sm leading-relaxed text-foreground/90">
 «{t.content}»
 </p>
 <div className="mt-4 flex items-center gap-3 border-t border-border/60 pt-4">
 <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary" aria-hidden="true">
 {t.name.slice(0, 1)}
 </div>
 <div className="min-w-0">
 <p className="text-sm font-semibold text-foreground">{t.name}</p>
 {t.role && (
 <p className="text-xs text-muted-foreground truncate">
 {t.role}
 {t.company? ` — ${t.company}`: ""}
 </p>
 )}
 </div>
 </div>
 </Card>
 ))}
 </div>
 </section>
 )}

 {/* جدول مقایسه (SSR کامل) — R14-F: cv-auto (جدول عریض = layout سنگین) */}
 <section className="cv-auto mt-20" aria-label="مقایسه کامل پلن‌ها">
 <div className="mb-8 text-center">
 <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
 مقایسه کامل پلن‌ها
 </h2>
 <p className="mt-2 text-sm text-muted-foreground">
 جدول کامل قابلیت‌ها برای انتخاب آگاهانه
 </p>
 </div>
 {/* v35.6 [استایل]: راهنمای اسکرول افقی جدول در موبایل */}
 <p className="mb-2 flex items-center justify-center gap-1 text-[11px] text-muted-foreground sm:hidden">
 <MoveHorizontal className="h-3.5 w-3.5 animate-pulse text-primary/70" aria-hidden="true" />
 جدول مقایسه افقی اسکرول می‌شود
 </p>
 <Card className="relative overflow-x-auto rounded-xl border-border/60 shadow-sm">
 <table className="w-full min-w-[640px] text-sm">
 <thead>
 <tr className="border-b bg-muted/40 text-right">
 <th className="p-3 font-semibold text-foreground">قابلیت</th>
 {plans.map((p) => (
 <th
 key={p.id}
 className={`p-3 text-center font-semibold ${
 p.popular
 ? "bg-primary/[0.07] text-primary"
 : "text-foreground"
 }`}
 >
 {p.name}
 {p.popular && (
 <span className="mr-1 text-xs font-normal">(محبوب‌ترین)</span>
 )}
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {comparisonRows.map((row) => (
 <tr
 key={row.label}
 className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30"
 >
 <td className="p-3 text-foreground">{row.label}</td>
 {row.values.map((v, i) => {
 const isPopularCol = plans[i]?.popular === true;
 return (
 <td
 key={i}
 className={`p-3 text-center ${
 isPopularCol ? "bg-primary/[0.04]" : ""
 }`}
 >
 {typeof v === "boolean"? (
 v? (
 <span aria-label="دارد" className="font-bold text-emerald-600">
 <svg
 viewBox="0 0 20 20"
 fill="currentColor"
 className="inline-block h-4 w-4 align-middle"
 aria-hidden="true"
 >
 <path
 fillRule="evenodd"
 d="M16.704 5.29a1 1 0 0 1 .006 1.415l-7.2 7.3a1 1 0 0 1-1.427.005L3.29 9.2a1 1 0 1 1 1.42-1.408l2.078 2.096 6.5-6.59a1 1 0 0 1 1.415-.006z"
 clipRule="evenodd"
 />
 </svg>
 <span className="sr-only">دارد</span>
 </span>
 ): (
 <span aria-label="ندارد" className="text-muted-foreground/50">
 —
 <span className="sr-only">ندارد</span>
 </span>
 )
 ): (
 <span className="text-muted-foreground">{v}</span>
 )}
 </td>
 );
 })}
 </tr>
 ))}
 </tbody>
 </table>
 </Card>
 </section>

 {/* FAQ — v35.6 [استایل]: آکاردئونی با اولین آیتم باز — R14-F: cv-auto */}
 <section className="cv-auto mt-20" aria-label="پرسش‌های متداول قیمت‌گذاری">
 <div className="mb-8 text-center">
 <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
 پرسش‌های متداول درباره قیمت
 </h2>
 <p className="mt-2 text-sm text-muted-foreground">
 روی هر پرسش بزنید تا پاسخ باز شود
 </p>
 </div>
 <div className="mx-auto max-w-3xl">
 <FaqAccordion items={pricingFaqs} />

 {/* R28-7 (فاز ۱ سند R25 — جملهٔ مالکیت داده): خنثی‌کنندهٔ ترس «گم‌شدن
 حساب» — ادعا واقعی است: خروجی Excel/CSV در ماژول «ورود/خروجی داده»
 با یک کلیک موجود است؛ بدون قفل داده. */}
 <div
 className="mt-6 flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3.5 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/[0.08] dark:text-emerald-100"
 aria-label="مالکیت داده‌های شما"
 >
 <span
 className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
 aria-hidden="true"
 >
 <Download className="h-5 w-5" />
 </span>
 <p className="text-xs leading-relaxed sm:text-[13px]">
 <strong className="font-bold">داده‌های شما مال شماست</strong> — خروجی
 Excel/CSV با یک کلیک، بدون قفل؛ حتی پس از پایان اشتراک.
 </p>
 </div>
 </div>
 </section>

 {/* CTA — v35.5: کارت نهایی با گرادیان چندلایه + بافت نقطه‌ای + درخشش گوشه — R14-F: cv-auto */}
 <section className="cv-auto relative mt-20 overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-l from-emerald-500/10 via-primary/5 to-violet-600/10 p-8 text-center shadow-sm sm:p-12">
 <div
 className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl"
 aria-hidden="true"
 />
 <div
 className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-violet-400/15 blur-3xl"
 aria-hidden="true"
 />
 <div
 className="pointer-events-none absolute inset-0 opacity-30 dark:opacity-15"
 style={{
 backgroundImage:
 "radial-gradient(circle, currentColor 1px, transparent 1px)",
 backgroundSize: "20px 20px",
 color: "rgb(16 185 129 / 0.1)",
 }}
 aria-hidden="true"
 />
 <div className="relative">
 <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
 هنوز مطمئن نیستید؟ ۷ روز رایگان امتحان کنید
 </h2>
 <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
 بدون نیاز به کارت بانکی، با تمام امکانات پلن حرفه‌ای. برای مشاوره رایگان
 انتخاب پلن با شماره ۰۷۱-۳۲۶۲۲۴۹۳ تماس بگیرید.
 </p>
 <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
 {/* R28-7 (فاز ۱): کپشن «بدون کارت بانکی» دقیقاً زیر دکمهٔ تریال —
 حذف ریسک در نقطهٔ کلیک (آزمون A/B شمارهٔ ۱ سند R17) */}
 <div className="flex flex-col items-center gap-1.5">
 <Link
 href="/"
 className="inline-flex items-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5"
 >
 شروع آزمایش رایگان ۷ روزه
 </Link>
 <span className="text-[11px] text-muted-foreground">
 بدون کارت بانکی · بدون تعهد
 </span>
 </div>
 <Link
 href="/features"
 className="inline-flex items-center rounded-lg border border-border bg-card/60 px-6 py-3 text-sm font-semibold text-foreground backdrop-blur transition-colors hover:bg-muted"
 >
 مشاهده امکانات کامل
 </Link>
 </div>
 <p className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
 <span>۷ روز ضمانت بازگشت</span>
 <span aria-hidden="true">•</span>
 <span>مهاجرت رایگان از نرم‌افزار قبلی</span>
 <span aria-hidden="true">•</span>
 <span>قیمت خرید شما برای همیشه قفل می‌شود</span>
 </p>
 </div>
 </section>
 </main>

 {/* FIX(v34-6 → v35.5): فوتر حداقلی — از داخل <main> بیرون آمد تا
 معنایی و all-width باشد + sticky-footer استاندارد (min-h-screen flex flex-col) */}
 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>{brand} — تمامی حقوق محفوظ است.</p>
 <Link href="/" prefetch={false} className="font-medium text-primary transition-colors hover:text-primary/80">صفحه اصلی</Link>
 </div>
 </footer>
 </div>
 );
}
