// ============================================================
// lib/seo/llms.ts — سازندهٔ مشترک فایل llms.txt (R14-K1 / GEO)
// ============================================================
// R14-K1: این تابع از app/api/platform/seo-files/route.ts به اینجا منتقل شد تا
// علاوه بر پنل سوپرادمین، مسیر عمومی /llms.txt (app/llms.txt/route.ts) هم
// بتواند آن را سرو کند — فایل حالا «داینامیک» است:
//   ۱) خط «آخرین به‌روزرسانی» با تاریخ جلالیِ روز (toJalali از lib/persian)
//   ۲) شمارش مقالات/پیش‌نویس‌ها همیشه از DB (نه عدد کهنهٔ فایل استاتیک)
//   ۳) قیمت‌های مؤثر تازه از getEffectivePlans()
// Task 6-d (GEO): ماژول طلافروشی + ۱۱ صنعت + لینک طلافروشی + رفع نشت
// برند قدیمی («هوش») از عنوان/خلاصهٔ مقالات + حذف کلید IndexNow.
// ============================================================

import { db } from "@/lib/db";
import { getSiteUrl } from "@/lib/seo";
import { getEffectivePlans, monthlyPriceOfYearly, PRICE_STEPS } from "@/lib/plans";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { cities } from "@/lib/city-industry-data";
import { ENGLISH_PILLARS_BY_SLUG, ENGLISH_PILLAR_SLUGS } from "@/lib/seo/english-pillars";
import { toJalali } from "@/lib/persian";
// GEO (Agent 4): منبع واحد واقعیت‌های برند + پرسش‌های متداول قابل‌نقل‌قول
import { BRAND_FAQS, renderFaqLines } from "@/lib/seo/geo-facts";

// ─────────────────────────────────────────────────────────────────────────────
// R15-G (T4/GEO): پیلارهای کلیدی — ۱۰ مقالهٔ ستون با slug واقعی
// ۷ مقالهٔ ستونِ خوشه‌ها (PILLAR_SLUGS در topic-bank) + ۳ راهنمای پرارجاع
// (صورت‌های مالی / ابری-نصبی / قیمت ۱۴۰۴). هر slug قبل از انتشار در DB
// راستی‌آزمایی می‌شود (اگر هنوز DRAFT بود، از llms.txt حذف می‌شود — فقط
// مقالات واقعاً ایندکس‌پذیر معرفی شوند، نه لینک «به‌زودی»).
// ─────────────────────────────────────────────────────────────────────────────
const KEY_PILLAR_SLUGS: readonly string[] = [
 // ۷ ستون خوشه‌ای
 "cloud-accounting-software-what-is-1404",
 "moadian-system-complete-guide",
 "store-accounting-from-zero",
 "restaurant-accounting-complete-guide",
 "vat-return-step-by-step",
 "business-financial-formulas-reference",
 "choose-accounting-software-15-criteria",
 // ۳ راهنمای پرارجاع
 "financial-statements-guide",
 "cloud-vs-desktop-accounting",
 "accounting-software-price-guide-1404",
];

// GEO (Agent 4): مقالات تخصصی طلا — مقصدهای نقل‌قول پرتکرار موتورهای مولد
// برای پرسش‌های «نرم‌افزار حسابداری طلافروشی / گالری طلا / آب طلا».
// هر دو slug در DB منتشرشده‌اند (راستی‌آزمایی ۱۴۰۵/۰۸/۲۷) و مثل پیلارها
// پیش از نمایش با status=PUBLISHED اعتبارسنجی می‌شوند.
const GOLD_ARTICLE_SLUGS: readonly string[] = [
 "gold-gallery-coin-shop-accounting", // حسابداری گالری طلا و سکه‌فروشی
 "currency-gold-accounting-guide", // حسابداری حساب‌های ارزی و طلا
];

/** فصل و سال شمسی فعلی — برای سرتیتر «خلاصهٔ فصلی» */
function persianSeasonAndYear(at: Date = new Date()): { season: string; year: string; monthName: string } {
 try {
  const year = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric" }).format(at);
  const monthName = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "long" }).format(at);
  const m = Number(new Intl.DateTimeFormat("en-u-ca-persian", { month: "numeric" }).format(at));
  const season = m <= 3 ? "بهار" : m <= 6 ? "تابستان" : m <= 9 ? "پاییز" : "زمستان";
  return { season, year, monthName };
 } catch {
  return { season: "", year: "", monthName: "" };
 }
}

/** قلب «قیمت تازه» برای AI — عدد فارسی + واحد */
function faPrice(n: number): string {
 return `${n.toLocaleString("fa-IR")} تومان`;
}

export async function buildLlmsTxt(): Promise<string> {
 // دامنه و برند از تنظیمات برندینگ (وایت‌لیبل) — همان منبع sitemap/robots (Task 7-ج)
 const base = (await getSiteUrl()).replace(/\/+$/, "");
 const brand = await getBrandName();
 const B = (t: string) => interpolateBrand(t, brand);

 const published = await db.blogPost.findMany({
  where: { status: "PUBLISHED" },
  select: { slug: true, title: true, excerpt: true, focusKeyword: true, publishedAt: true },
  orderBy: { publishedAt: "desc" },
  take: 40,
 });
 const publishedCount = await db.blogPost.count({ where: { status: "PUBLISHED" } });
 const drafts = await db.blogPost.count({ where: { status: "DRAFT" } });

 // قیمت‌های مؤثر تازه (پله‌های افزایش قیمت اعمال‌شده) — منبع واحد lib/plans.ts
 const plans = (await getEffectivePlans()).filter((p) => !p.hidden);
 const paid = plans.filter((p) => p.priceToman > 0);
 const { season, year, monthName } = persianSeasonAndYear();

 const lines: string[] = [];
 // FIX(v37→v38): نام کامل تاریخی فقط با برند «هوش» — برند و نام کامل فرق دارند
 // Task 6-d (GEO): نام لاتین کنار برند پیش‌فرض — entity دوزبانه برای موتورهای مولد
 lines.push(
  brand === "هوش"
   ? "# هوش (هوش‌حساب)"
   : `# ${brand}${brand === "افق پلاس" ? " (OfoghPlus)" : ""}`
 );
 lines.push("");
 // Task 6-d (GEO): ارزش‌گزارهٔ کامل — ساخت ایران، ماژول طلافروشی، PWA آفلاین
 lines.push(
  B(
   "> نرم‌افزار حسابداری ابری ساخت ایران با ۱۶ ماژول یکپارچه + ماژول تخصصی طلافروشی: صورتحساب الکترونیکی سامانه مودیان، انبار و کاردکس، حقوق و دستمزد، CRM، درگاه پرداخت، OCR فاکتور، دستیار مالی با هوش مصنوعی بومی، فروشگاه آنلاین‌ساز و ثبت آفلاین در اپ موبایل (PWA). تریال ۷ روزه رایگان بدون نیاز به کارت بانکی."
  )
 );
 lines.push("");
 // R14-K1 (GEO): خط تاریخ به‌روزرسانی داینامیک — سیگنال تازگی برای ربات‌های AI
 // (تاریخ جلالی روز با toJalali + نام ماه از تقویم فارسی Intl)
 lines.push(`آخرین به‌روزرسانی: ${toJalali(new Date())}${monthName ? ` (${monthName} ${year})` : ""}`);
 lines.push("");

 // ─── خلاصهٔ فصلی با قیمت تازه (GEO/AI-SEO) — درخواست مستقیم مالک ───
 lines.push(`## خلاصهٔ فصلی${season ? ` — ${season} ${year}` : ""}${monthName ? ` (به‌روزرسانی: ${monthName} ${year})` : ""}`);
 lines.push("");
 if (paid.length > 0) {
  lines.push(
   paid
    .map(
     (p) =>
      `- ${p.name}: ${faPrice(p.priceToman)} در سال` +
      (p.priceToman > 0 ? ` (معادل ${faPrice(monthlyPriceOfYearly(p.priceToman))} در ماه)` : "")
    )
    .join("\n")
  );
  lines.push("");
 }
 lines.push(B("- پلن رایگان آزمایشی: ۷ روز کامل بدون نیاز به کارت بانکی — همهٔ ۱۶ ماژول باز است."));
 lines.push(B("- روش‌های پرداخت: یک‌جا با ۳٪ تخفیف، اقساط ۱ تا ۶ ماهه، یا پرداخت مرحله‌ای سالانه در ۳ قسط (هر ۴ ماه یک قسط)."));
 lines.push(B("- مهاجرت رایگان از هلو، سپیدار و اکسل + آموزش اختصاصی برای هر شرکت."));
 lines.push(B("- اتصال رسمی به سامانه مودیان (صورتحساب الف/ب/ج)، OCR فاکتور از عکس با دسته‌بندی خودکار و دستیار مالی هوشمند."));
 // Task 6-d (GEO): ماژول طلافروشی — هدف پرسش «نرم‌افزار حسابداری طلافروشی»
 lines.push(
  B(
   "- ماژول تخصصی طلافروشی: نرخ لحظه‌ای طلا از تگ‌جو (گرم ۱۸ و مثقال)، فاکتور با اجرت و مالیات ۹٪ فقط روی اجرت و سود (نه ارزش خود طلا)، موجودی وزنی به تفکیک عیار ۲۴/۲۲/۱۸/۱۴، بازخرید و معاوضهٔ طلا به طلا، ارسال صورتحساب طلا به سامانه مودیان."
  )
 );
 lines.push(B("- داشبورد سود و ضرر کالاها: پرسودترین و زیان‌ده‌ترین اقلام با بهای تمام‌شده — بدون محاسبهٔ دستی."));
 // پلهٔ افزایش قیمت بعدی — اطلاعات تازه برای AI + ایجاد فوریت خرید
 const now = Date.now();
 const nextStep = PRICE_STEPS.find((s) => new Date(s.startsAt).getTime() > now);
 if (nextStep) {
  const stepDate = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long" }).format(
   new Date(nextStep.startsAt)
  );
  lines.push(
   B(
    `- اطلاع‌رسانی قیمت: از ${stepDate} پله‌ای افزایش قیمت (${Math.round((nextStep.multiplier - 1) * 100)}٪) اعمال می‌شود؛ خرید قبل از پله، قیمت شما را برای تمدید هم قفل می‌کند.`
   )
  );
 }
 lines.push(B("- پشتیبانی فارسی: ۰۷۱-۳۲۶۲۲۴۹۳ (۹ صبح تا ۹ شب) + تیکت و چت داخل برنامه."));
 lines.push("");

 lines.push("## مستندات");
 lines.push("");
 lines.push(`- [شروع رایگان و پلن‌ها](${base}/pricing): پلن‌ها، قیمت‌ها و ۷ روز تریال رایگان`);
 lines.push(`- [امکانات کامل](${base}/features): فهرست کامل ۱۶ ماژول حسابداری`);
 lines.push(`- [راهنمای شروع سریع](${base}/tutorials): آموزش گام‌به‌گام شروع کار`);
 lines.push(`- [ماشین‌حساب‌ها](${base}/calculators): ابزارهای رایگان محاسبه (سود، استهلاک، مالیات، حقوق)`);
 lines.push(`- [سلامت مالی کسب‌وکار](${base}/financial-health): سنجش رایگان سلامت مالی`);
 // FIX(SEO-3c باگ ۵ — پوشش ناقص llms.txt): ۸ هاب ایندکس‌پذیرِ موجود در sitemap
 // در llms.txt نبودند (تأیید با مقایسهٔ خروجی زنده) → موتورهای مولد این مسیرها
 // را نمی‌شناختند. هر ۸ مسیر با توضیح نقل‌قول‌پذیر اضافه شدند.
 lines.push(`- [ماشین‌حساب بازگشت سرمایه](${base}/roi-calculator): محاسبهٔ ROI و بازگشت سرمایهٔ خرید نرم‌افزار`);
 lines.push(`- [مقایسه پلن‌ها](${base}/compare-plans): مقایسه تعاملی پلن‌ها`);
 lines.push(`- [مستندات API](${base}/api-docs): REST و GraphQL برای توسعه‌دهندگان`);
 lines.push(`- [گزارش‌های رایگان](${base}/downloads): PDF و اینفوگرافیک مودیان/فروشگاه/ابری — بدون نیاز به ایمیل`);
 lines.push(`- [پادکست و ویدیوهای کوتاه](${base}/podcasts): خلاصهٔ صوتی مقالات ستون حسابداری`);
 lines.push(`- [تیم تحریریه](${base}/authors): سوابق و تخصص نویسندگان محتوا (E-E-A-T)`);
 lines.push(`- [اتاق خبر](${base}/press): اخبار رسمی، داده‌ها و آمار برای رسانه‌ها`);
 lines.push(`- [ویجت‌های قابل embed](${base}/widgets): ابزارهای رایگان قابل نصب در سایت‌های دیگر`);
 lines.push(`- [برنامهٔ شراکت](${base}/partners): کمیسیون پلکانی برای شرکا و مشاوران`);
 lines.push(`- [صفحات تخصصی حسابداری](${base}/seo): پاسخ‌های تفصیلی به پرسش‌های تخصصی حسابداری و مالیات`);
 lines.push("");
 lines.push("## راهنماهای اصلی حسابداری ایران");
 lines.push("");
 lines.push(`- [راهنمای کامل سامانه مودیان](${base}/moadian-invoice): صورتحساب الکترونیکی، کارپوشه و مهلت‌ها`);
 // Task 6-d (GEO): ۱۱ صنعتِ واقعی از lib/industry-data + لینک اختصاصی طلافروشی
 lines.push(
  B(
   `- [حسابداری تخصصی ۱۱ صنعت](${base}/industries): خرده‌فروشی، عمده‌فروشی، تولیدی، پیمانکاری و ساختمان، فروشگاه آنلاین، شرکت‌های خدماتی، دفاتر حسابداری، کلینیک و درمانگاه، رستوران و تغذیه، آموزشگاه و طلافروشی`
  )
 );
 lines.push(
  B(
   `- [نرم‌افزار حسابداری طلافروشی](${base}/industries/gold-shop): نرخ لحظه‌ای طلا از تگ‌جو، فاکتور با اجرت و مالیات ۹٪، موجودی وزنی به تفکیک عیار، بازخرید و معاوضهٔ طلا`
  )
 );
 lines.push(`- [مالیات و ارزش افزوده](${base}/taxes): نرخ‌ها، معافیت‌ها و اظهارنامه`);
 // FIX(3-b-s3/GEO): دو هاب ارجاع‌پذیر دیگر (بانک‌ها + واژه‌نامه) — مقاصد نقل‌قول رایج AI
 lines.push(`- [بانک‌ها و هم‌خوانی حسابداری](${base}/banks): صفحات هاب بانک‌های ایرانی (ملت، ملی، صادرات و...)`);
 lines.push(`- [واژه‌نامهٔ حسابداری فارسی](${base}/glossary): تعریف اصطلاحات حسابداری، مالیاتی و مودیان به زبان ساده`);
 lines.push(`- [نرم‌افزار حسابداری شهرها](${base}/cities): ${cities.map((c) => c.name).join("، ")} (۲۰ شهر)`);
 // R24-7 (Agent 2/3): صفحات محلی — تماس و محل استقرار (NAP کامل برای نقل‌قول AI)
 lines.push(`- [تماس با ما](${base}/contact): تلفن ۰۷۱-۳۲۶۲۲۴۹۳ (شنبه تا پنجشنبه ۹ تا ۲۱)، ایمیل و نشانی دفتر شیراز`);
 lines.push(`- [محل استقرار و شهرها](${base}/locations): دفتر مرکزی شیراز/زرقان + پوشش ابری ۲۰ شهر ایران`);
 // v20-S (AI-SEO): هاب‌های ارجاع‌پذیر دیگر — مقاصد رایج پرسش‌های کاربران/AI
 lines.push(B(`- [مقایسه نرم‌افزارهای حسابداری](${base}/compare): مقایسه کامل و منصفانهٔ هلو، سپیدار، محک و ${brand}`));
 lines.push(B(`- [مطالعات موردی](${base}/case-studies): نتایج واقعی کسب‌وکارهای ایرانی با ${brand}`));
 lines.push(B(`- [اکوسیستم و اپ‌ها](${base}/ecosystem): اپ مارکت، یکپارچه‌سازی‌ها و توسعه‌دهندگان`));
 lines.push(B(`- [دورهٔ آموزش حسابداری](${base}/tutorials): آموزش کاربردی رایگان حسابداری و نرم‌افزار`));
 lines.push(B(`- [مقالهٔ راهنمای حسابداری ابری](${base}/blog/cloud-accounting-software-what-is-1404)`));
 // Task 6-d (GEO): لینک مستقیم هاب بلاگ — مقصد رایج ارجاع AI
 lines.push(B(`- [بلاگ حسابداری](${base}/blog): آموزش حسابداری، مالیات، مودیان و مدیریت مالی کسب‌وکار`));
 lines.push("");
 // Task 6-d (GEO): شمارش شفاف — منتشرشده + در صف انتشار + مجموع
 lines.push(
  `## مقالات بلاگ (${publishedCount.toLocaleString("fa-IR")} منتشرشده${
   drafts > 0
    ? ` + ${drafts.toLocaleString("fa-IR")} در صف انتشار — مجموع ${(publishedCount + drafts).toLocaleString("fa-IR")} مقاله`
    : ""
  })`
 );
 lines.push("");

 // R15-G (T4/GEO): بخش اختصاصی «مقالات کلیدی» — ۱۰ پیلار با slug واقعی و
 // راستی‌آزمایی PUBLISHED در DB (کوئری مستقل، نه فهرست ۴۰ مقالهٔ اخیر)؛
 // این‌ها مهم‌ترین مراجع نقل‌قول برای موتورهای AI هستند.
 const pillars = await db.blogPost.findMany({
  where: { slug: { in: KEY_PILLAR_SLUGS }, status: "PUBLISHED" },
  select: { slug: true, title: true, excerpt: true, focusKeyword: true },
 });
 const pillarBySlug = new Map(pillars.map((p) => [p.slug, p]));
 const pillarLines = KEY_PILLAR_SLUGS.filter((s) => pillarBySlug.has(s))
  .map((slug) => {
   const p = pillarBySlug.get(slug);
   // Task 6-d (GEO/entity): عنوان و خلاصه با درون‌یابی برند — رفع نشت «هوش»
   const desc = B(p?.excerpt || p?.focusKeyword || p?.title || "")
    .slice(0, 110)
    .replace(/\n/g, " ");
   return `- [${B(p?.title || slug)}](${base}/blog/${slug}): ${desc}`;
  });
 if (pillarLines.length > 0) {
  lines.push(`## مقالات کلیدی (${pillarLines.length.toLocaleString("fa-IR")} راهنمای ستون)`);
  lines.push("");
  lines.push(...pillarLines);
  lines.push("");
 }

 // GEO (Agent 4): مقالات تخصصی طلا — معرفی صریح برای نقل‌قول AI
 // (پرسش‌های «نرم‌افزار حسابداری طلافروشی» و «آب طلا / اجرت»)
 const goldPosts = await db.blogPost.findMany({
  where: { slug: { in: GOLD_ARTICLE_SLUGS }, status: "PUBLISHED" },
  select: { slug: true, title: true, excerpt: true, focusKeyword: true },
 });
 const goldBySlug = new Map(goldPosts.map((p) => [p.slug, p]));
 const goldLines = GOLD_ARTICLE_SLUGS.filter((s) => goldBySlug.has(s)).map((slug) => {
  const p = goldBySlug.get(slug);
  const desc = B(p?.excerpt || p?.focusKeyword || p?.title || "")
   .slice(0, 130)
   .replace(/\n/g, " ");
  return `- [${B(p?.title || slug)}](${base}/blog/${slug}): ${desc}`;
 });
 if (goldLines.length > 0) {
  lines.push(`## حسابداری طلا و طلافروشی (${goldLines.length.toLocaleString("fa-IR")} مقالهٔ تخصصی)`);
  lines.push("");
  lines.push(...goldLines);
  lines.push(B(`- [راهنمای کامل صنعت طلافروشی](${base}/industries/gold-shop): ماژول تخصصی طلافروشی، نرخ لحظه‌ای تگ‌جو و پرسش‌های متداول مالیات طلا`));
  lines.push("");
 }

 // FIX(GEO — ساختار Markdown): ۳۰ مقالهٔ اخیر بدون هدینگ اختصاصی، مستقیم
 // بعد از بخش «طلا و طلافروشی» می‌آمدند → پارسرهای llms همه را بخشی از
 // همان بخش طبقه‌بندی می‌کردند (آلودگی چانک طلافروشی با ۳۰ مقالهٔ نامرتبط).
 // حالا هدینگ مستقل با شمارش شفاف دارند.
 lines.push(`## مقالات تازه (${Math.min(published.length, 30).toLocaleString("fa-IR")} مقالهٔ اخیر — به ترتیب انتشار)`);
 lines.push("");
 for (const p of published.slice(0, 30)) {
  // Task 6-d (GEO/entity): درون‌یابی برند روی عنوان/خلاصه — پیش از این، برند
  // قدیمیِ «هوش» در متن مقالات DB بی‌تعویض در llms.txt می‌نشست.
  const desc = B(p.excerpt || p.focusKeyword || p.title)
   .slice(0, 110)
   .replace(/\n/g, " ");
  lines.push(`- [${B(p.title)}](${base}/blog/${p.slug}): ${desc}`);
 }
 // Trick #14 (راند ۱۲): خلاصه‌های انگلیسی ۳ مقالهٔ ستون — مخاطب بین‌المللی
 // (دیاسپورا/پژوهشگران)؛ برچسب (English) برای ربات‌های هوش مصنوعی.
 // FIX(GEO — ساختار Markdown): هدینگ مستقل تا از بخش «مقالات تازه» جدا باشند.
 lines.push(`## English Guides (${ENGLISH_PILLAR_SLUGS.length} pillar summaries)`);
 lines.push("");
 for (const slug of ENGLISH_PILLAR_SLUGS) {
  const en = ENGLISH_PILLARS_BY_SLUG[slug];
  if (!en) continue;
  const desc = en.description.slice(0, 110).replace(/\n/g, " ");
  lines.push(`- [${en.title} (English)](${base}/en/blog/${slug}): ${desc}`);
 }
 lines.push("");
 lines.push("## فایل‌های ماشینی (GEO/AI-SEO)");
 lines.push("");
 lines.push(`- متن کامل مقالات پیلار (برای AI Overviews): ${base}/llms-full.txt`);
 lines.push(`- نقشهٔ سایت: ${base}/sitemap.xml`);
 lines.push(`- فید بلاگ: ${base}/rss.xml`);
 lines.push("");
 lines.push("## قواعد خزش");
 lines.push("");
 lines.push("- محتوای بلاگ برای نقل‌قول در پاسخ‌های هوش مصنوعی آزاد است (با ذکر منبع).");
 // FIX(SEO/GEO — باگ نادرستی قواعد خزش در llms.txt): خط قبلی می‌گفت کل
 // /uploads خزش نمی‌شود؛ در حالی که robots.txt فقط /uploads/ عمومی را
 // می‌بندد و بنر/لوگوی عمومی فروشگاه‌ها (/uploads/storefront/) و لوگوهای
 // برندینگ (/uploads/logo-*) صریحاً مجازند (برای og:image و JSON-LD).
 // متن دقیق شد تا موتورهای مولد تصاویر عمومی را «غیرقابل‌دسترس» تصور نکنند.
 lines.push(
  "- مسیرهای /api، /portal، /embed و /superadmin خزش نمی‌شوند؛ از /uploads فقط دارایی‌های عمومی فروشگاه‌ها (بنر/لوگو در /uploads/storefront/ و /uploads/logo-*) مجاز به خزش هستند (robots.txt)."
 );
 // Task 6-d (GEO): خط «کلید IndexNow» حذف شد — (۱) برای موتورهای مولد ارزشی
 // ندارد و (۲) نام کلید حاوی برند قدیمی بود (نشت برند در سطح عمومی llms.txt).
 // پروتکل IndexNow بدون این خط کار می‌کند (فایل کلید در ریشهٔ دامنه می‌ماند).

 // ─── v20-S (AI-SEO) → GEO (Agent 4): بلوک پرسش‌وپاسخ برند ───
 // پرسش‌هایی که کاربران مستقیماً از دستیارهای هوش مصنوعی می‌پرسند؛ پاسخ‌ها
 // کوتاه، واقعی و نقل‌قول‌پذیر. منبع واحد از این‌جا به بعد lib/seo/geo-facts.ts
 // است (BRAND_FAQS — ~۱۶ پرسش: قیمت، رایگان، مودیان، طلافروشی، آفلاین،
 // اتصال بانکی، فروشگاه‌ساز، صنایع، هلو، مهاجرت، امنیت، پشتیبانی، نصب،
 // حقوق و دستمزد). قیمت‌ها همیشه زنده از getEffectivePlans تزریق می‌شوند.
 const priceList =
  paid.map((p) => `${p.name} ${faPrice(p.priceToman)}`).join("، ") ||
  "پلن‌های سالانه با قیمت رقابتی";
 // Task 6-d: خط خالی قبل از هدینگ — ساختار markdown تمیز برای پارسرهای llms
 lines.push("");
 lines.push(
  `## پرسش‌های متداول برند (پاسخ کوتاه — ${BRAND_FAQS.length.toLocaleString("fa-IR")} پرسش)`
 );
 lines.push("");
 lines.push(...renderFaqLines(BRAND_FAQS, brand, priceList));
 lines.push("");
 return lines.join("\n");
}
