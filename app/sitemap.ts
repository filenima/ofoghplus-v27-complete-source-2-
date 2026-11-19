import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { nobatimeTools } from "@/lib/nobatime-ecosystem-data";
import { industries } from "@/lib/industry-data";
import { banks } from "@/lib/bank-data";
import { taxTypes } from "@/lib/tax-data";
import { cities, industryInfos } from "@/lib/city-industry-data";
import { caseStudies } from "@/lib/case-study-data";
import { seoPages } from "@/lib/seo-pages-data";
import { tutorials } from "@/lib/tutorial-data";
import { competitorAnalysis } from "@/lib/competitor-deep-analysis";
import { getSiteUrl } from "@/lib/seo";
// Trick #14 (راند ۱۲): ۳ مقالهٔ ستون نسخهٔ انگلیسی دارند → sitemap + hreflang
import { ENGLISH_PILLAR_SLUGS } from "@/lib/seo/english-pillars";

// FIX(v42-seo): تازه‌سازی ساعتی — بدون این، در build فریز می‌شود و
// مقالات جدید تا build بعدی وارد sitemap نمی‌شوند
export const revalidate = 3600;

export const runtime = "nodejs";

/**
 * /sitemap.xml — نقشه‌ی سایت برای موتورهای جستجو
 *
 * شامل صفحات اصلی، بلاگ ایندکس، صفحات اکوسیستم و هر مقاله‌ی منتشرشده.
 * شامل صفحات SEO: صنایع (+FAQ)، بانک‌ها، مالیات، شهرها (+ترکیب شهر×صنعت)،
 * مقایسه، نمونه‌های موفق، آموزش‌ها و صفحات تخصصی.
 *
 * نکته سئو: lastModified صفحات غیر-بلاگ از new Date() به RELEASE_DATE ثابت
 * تغییر کرد — تاریخ «همیشه امروز» سیگنال نامعتبر برای گوگل است و باعث
 * نوسان lastmod در هر بار تولید sitemap می‌شود. تاریخ واقعی ویرایش محتوا
 * باید در همین ثابت به‌روزرسانی شود.
 */
// v37 (۲۴ اکتبر ۲۰۲۶): تاریخ واقعی انتشار راند فعلی — lastmod معتبر برای گوگل
const RELEASE_DATE = new Date("2026-10-24");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
 // Task 7-ج: دامنه از تنظیمات برندینگ سوپرادمین (وایت‌لیبل) — نه هاردکد.
 // کش ۵ دقیقه‌ای → ارزان؛ پس از تغییر دامنه در پنل، sitemap خودکار به‌روز می‌شود.
 const SITE_URL = await getSiteUrl();

 // صفحات ثابت
 const staticPages: MetadataRoute.Sitemap = [
 {
 url: SITE_URL,
 lastModified: RELEASE_DATE,
 changeFrequency: "daily",
 priority: 1.0,
 },
 {
 url: `${SITE_URL}/blog`,
 lastModified: RELEASE_DATE,
 changeFrequency: "daily",
 priority: 0.9,
 // FIX(SEO-3e — hreflang سمت فارسی هاب): صفحهٔ /blog در HTML خودش
 // hreflang دوسویه با /en/blog دارد (app/en/blog/page.tsx) ولی ورودی
 // sitemap آن alternates نداشت — طبق راهنمای گوگل هر دو عضو خوشهٔ hreflang
 // باید در sitemap هم به هم ارجاع بدهند (خودشان + نسخهٔ مقابل).
 alternates: {
 languages: {
 fa: `${SITE_URL}/blog`,
 en: `${SITE_URL}/en/blog`,
 "x-default": `${SITE_URL}/blog`,
 },
 },
 },
 {
 url: `${SITE_URL}/pricing`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/features`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/ecosystem`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 // صفحات لیست SEO
 {
 url: `${SITE_URL}/industries`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/banks`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/taxes`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/calculators`,
 lastModified: RELEASE_DATE,
 changeFrequency: "daily",
 priority: 0.9,
 },
 {
 url: `${SITE_URL}/moadian-invoice`,
 lastModified: RELEASE_DATE,
 changeFrequency: "daily",
 priority: 0.9,
 },
 {
 // v23 — سنجش سلامت مالی (لیدمگنت ابزار رایگان)
 url: `${SITE_URL}/financial-health`,
 lastModified: RELEASE_DATE,
 changeFrequency: "daily",
 priority: 0.9,
 },
 {
 // v24 — ماشین‌حساب بازگشت سرمایه ROI (لیدمگنت ابزار رایگان)
 url: `${SITE_URL}/roi-calculator`,
 lastModified: RELEASE_DATE,
 changeFrequency: "daily",
 priority: 0.9,
 },
 {
 // v25 — مقایسهٔ پلن‌ها (لیدمگنت تصمیم خرید)
 url: `${SITE_URL}/compare-plans`,
 lastModified: RELEASE_DATE,
 changeFrequency: "daily",
 priority: 0.9,
 },
 {
 // v27 — دایرکتوری ویجت‌های قابل embed برای شرکا
 url: `${SITE_URL}/widgets`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 // v29 — برنامهٔ شراکت (لیدمگنت جذب شرکا)
 url: `${SITE_URL}/partners`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/glossary`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/cities`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 // R24-7 (Agent 2 — Local SEO): هاب محل استقرار + NAP + نقشه
 url: `${SITE_URL}/locations`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly",
 priority: 0.7,
 },
 {
 // R24-7 (Agent 2 — Local SEO): صفحه تماس با ContactPage schema
 url: `${SITE_URL}/contact`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly",
 priority: 0.7,
 },
 {
 url: `${SITE_URL}/compare`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 // v34-5 (#15) — هاب پادکست و ویدیوهای کوتاه (مشتق از مقالات پیلار)
 url: `${SITE_URL}/podcasts`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 // E-E-A-T(v38) — تیم تحریریه (سیگنال YMYL برای گوگل)
 url: `${SITE_URL}/authors`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly",
 priority: 0.7,
 },
 {
 // GEO(v38) — اتاق خبر (Digital PR؛ ارجاع رسانه‌ای)
 url: `${SITE_URL}/press`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.7,
 },
 {
 // GEO(v38) — گزارش‌های رایگان (لیدمگنت نرم بدون ایمیل)
 url: `${SITE_URL}/downloads`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/case-studies`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.7,
 },
 {
 url: `${SITE_URL}/tutorials`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.7,
 },
 {
 url: `${SITE_URL}/seo`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.7,
 },
 {
 // R15-G (T2): مستندات API عمومی — صفحهٔ ایندکس‌پذیر توسعه‌دهندگان
 url: `${SITE_URL}/api-docs`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly",
 priority: 0.5,
 },
 ];

 // صفحات ابزارهای اکوسیستم (پویا از nobatimeTools)
 const ecosystemPages: MetadataRoute.Sitemap = nobatimeTools.map((tool) => ({
 url: `${SITE_URL}/ecosystem/${tool.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly" as const,
 priority: 0.7,
 }));

 // صفحات صنایع
 const industryPages: MetadataRoute.Sitemap = industries.map((ind) => ({
 url: `${SITE_URL}/industries/${ind.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.7,
 }));

 // صفحات پرسش‌های متداول هر صنعت (/industries/{slug}/faq)
 const industryFaqPages: MetadataRoute.Sitemap = industries.map((ind) => ({
 url: `${SITE_URL}/industries/${ind.slug}/faq`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.6,
 }));

 // صفحات بانکی
 const bankPages: MetadataRoute.Sitemap = banks.map((bank) => ({
 url: `${SITE_URL}/banks/${bank.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.7,
 }));

 // صفحات مالیاتی
 const taxPages: MetadataRoute.Sitemap = taxTypes.map((tax) => ({
 url: `${SITE_URL}/taxes/${tax.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.7,
 }));

 // صفحات شهری
 const cityPages: MetadataRoute.Sitemap = cities.map((city) => ({
 url: `${SITE_URL}/cities/${city.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.7,
 }));

 // صفحات ترکیب شهر × صنعت (/cities/{city}/industries/{industry})
 const cityIndustryPages: MetadataRoute.Sitemap = cities.flatMap((city) =>
 industryInfos.map((ind) => ({
 url: `${SITE_URL}/cities/${city.slug}/industries/${ind.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.5,
 }))
 );

 // FIX(v42-seo): صفحات شهر×صنعت×بانک (۲٬۴۰۰ URL) از sitemap حذف شدند —
 // بدنهٔ مشترکِ چرخشی صنعت + بلوک قالبی بانک، الگوی scaled content abuse
 // بود (ریسک soft-404/doorway). صفحات noindex,follow شدند و لینک داخلی
 // حفظ می‌شود؛ sitemap از ~۲٬۸۰۳ به ~۴۰۳ URL سبک و پرکیفیت شد.
 const cityIndustryBankPages: MetadataRoute.Sitemap = [];

 // صفحات مقایسه رقبا
 const comparePages: MetadataRoute.Sitemap = competitorAnalysis.map((comp) => ({
 url: `${SITE_URL}/compare/${comp.id}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.6,
 }));

 // صفحات نمونه‌های موفق
 const caseStudyPages: MetadataRoute.Sitemap = caseStudies.map((cs) => ({
 url: `${SITE_URL}/case-studies/${cs.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.6,
 }));

 // صفحات آموزشی
 const tutorialPages: MetadataRoute.Sitemap = tutorials.map((tut) => ({
 url: `${SITE_URL}/tutorials/${tut.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.6,
 }));

 // صفحات تخصصی SEO
 const seoPagesSitemap: MetadataRoute.Sitemap = seoPages.map((sp) => ({
 url: `${SITE_URL}/seo/${sp.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.6,
 }));

 // مقالات منتشرشده بلاگ — lastModified واقعی از updatedAt دیتابیس
 let blogPages: MetadataRoute.Sitemap = [];
 const englishSlugSet = new Set(ENGLISH_PILLAR_SLUGS);
 // updatedAt مقاله‌های فارسیِ ستون — منبع تازگی نسخهٔ انگلیسی (ترجمهٔ همان متن)
 const englishSourceDates = new Map<string, Date>();
 try {
 const posts = await db.blogPost.findMany({
 where: { status: "PUBLISHED" },
 select: { slug: true, updatedAt: true },
 orderBy: { publishedAt: "desc" },
 });
 blogPages = posts.map((post) => {
 const entry: MetadataRoute.Sitemap[number] = {
 url: `${SITE_URL}/blog/${post.slug}`,
 lastModified: post.updatedAt,
 changeFrequency: "weekly" as const,
 priority: 0.7,
 };
 // hreflang دوسویه برای ۳ مقالهٔ ستونی — همان نگاشت app/blog/[slug]
 if (englishSlugSet.has(post.slug)) {
 entry.alternates = {
 languages: {
 fa: `${SITE_URL}/blog/${post.slug}`,
 en: `${SITE_URL}/en/blog/${post.slug}`,
 "x-default": `${SITE_URL}/blog/${post.slug}`,
 },
 };
 englishSourceDates.set(post.slug, post.updatedAt);
 }
 return entry;
 });
 } catch {
 // اگر دیتابیس در دسترس نبود، فقط صفحات ثابت را برگردان
 }

 // Trick #14 (راند ۱۲): خلاصه‌های انگلیسی ۳ مقالهٔ ستون — hreflang دوسویه
 // در sitemap (xhtml:link alternate). اولویت/تازگی هم‌تراز مقالات بلاگ:
 // priority 0.7 + weekly؛ lastModified = updatedAt نسخهٔ فارسی (منبع ترجمه).
 // R14-J3: هاب انگلیسی /en/blog (ایندکس‌پذیر، ۲۰۰) قبلاً در sitemap نبود —
 // گوگل فقط از لینک‌های ۳ مقالهٔ ستون می‌توانست آن را کشف کند؛ حالا صریح است.
 const englishBlogHub: MetadataRoute.Sitemap = [
 {
 url: `${SITE_URL}/en/blog`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly" as const,
 priority: 0.6,
 // FIX(SEO-3e — hreflang سمت انگلیسی هاب): جفت کامل ورودی فارسی /blog
 // بالا؛ HTML صفحه (/en/blog) همین خوشه را منتشر می‌کند — sitemap حالا
 // هم‌راستاست (fa / en / x-default به نسخهٔ فارسی به‌عنوان مرجع).
 alternates: {
 languages: {
 fa: `${SITE_URL}/blog`,
 en: `${SITE_URL}/en/blog`,
 "x-default": `${SITE_URL}/blog`,
 },
 },
 },
 ];
 const englishBlogPages: MetadataRoute.Sitemap = ENGLISH_PILLAR_SLUGS.map((slug) => ({
 url: `${SITE_URL}/en/blog/${slug}`,
 lastModified: englishSourceDates.get(slug) ?? RELEASE_DATE,
 changeFrequency: "weekly" as const,
 priority: 0.7,
 alternates: {
 languages: {
 fa: `${SITE_URL}/blog/${slug}`,
 en: `${SITE_URL}/en/blog/${slug}`,
 "x-default": `${SITE_URL}/blog/${slug}`,
 },
 },
 }));

 // R15-G (T2): صفحات عمومی فروشگاه‌ها (/shop/{slug}) — مدل Storefront از R15-C.
 // فقط فروشگاه‌های فعال (isActive) که صفحهٔ عمومی ایندکس‌پذیر دارند؛
 // غیرفعال‌ها 404/noindex هستند و نباید URL مرده در sitemap بیاوریم.
 // lastModified واقعی از updatedAt رکورد storefront.
 let storefrontPages: MetadataRoute.Sitemap = [];
 // Task 3-g: هاب بلاگ فروشگاه‌هایی که حداقل یک مقالهٔ منتشرشده دارند —
 // URL تک‌مقاله‌ها از sitemap اختصاصی هر فروشگاه (/shop/{slug}/sitemap.xml) می‌آید.
 let storefrontBlogHubs: MetadataRoute.Sitemap = [];
 try {
 // FIX(SEO-3c): status=suspended هم کنار isActive فیلتر شود — صفحات فروشگاه
 // معلق ۵۰۳ می‌شوند و URL مرده در sitemap یعنی خطای سرچ‌کنسول؛ robots.ts هم
 // فقط فروشگاه‌های غیرمعلق را معرفی می‌کند (هم‌راستاسازی سه‌گانه).
 const storefronts = await db.storefront.findMany({
 where: { isActive: true, status: { not: "suspended" } },
 select: { slug: true, updatedAt: true },
 orderBy: { updatedAt: "desc" },
 });
 storefrontPages = storefronts.map((sf) => ({
 // R26-TS: encodeURIComponent دفاعی — اسلاگ فروشگاه ورودی آزادِ کاربر است
 // (components/modules/storefront.tsx فقط trim/toLowerCase می‌کند)؛ اسلاگ
 // غیر ASCII (فارسی) بدون انکود در <loc> پروتکل sitemap را نقض می‌کند.
 // برای اسلاگ‌های ASCII فعلی (demo-shop و...) هیچ تغییری ایجاد نمی‌کند.
 url: `${SITE_URL}/shop/${encodeURIComponent(sf.slug)}`,
 lastModified: sf.updatedAt,
 changeFrequency: "weekly" as const,
 priority: 0.6,
 }));
 // فقط فروشگاه‌های صاحب مقاله — groupBy روی StorefrontPost منتشرشده
 const shopsWithPosts = await db.storefrontPost.groupBy({
 by: ["storefrontId"],
 where: { status: "PUBLISHED" },
 _count: { _all: true },
 });
 const idsWithPosts = new Set(shopsWithPosts.map((g) => g.storefrontId));
 if (idsWithPosts.size > 0) {
 const blogShops = await db.storefront.findMany({
 // FIX(SEO-3c): همان فیلتر تعلیق بالا — هاب بلاگ فروشگاه معلق هم ۵۰۳ است
 where: { isActive: true, status: { not: "suspended" }, id: { in: [...idsWithPosts] } },
 select: { slug: true, updatedAt: true },
 });
 storefrontBlogHubs = blogShops.map((sf) => ({
 url: `${SITE_URL}/shop/${encodeURIComponent(sf.slug)}/blog`,
 lastModified: sf.updatedAt,
 changeFrequency: "weekly" as const,
 priority: 0.5,
 }));
 }
 } catch {
 // اگر مدل/جدول در دسترس نبود، بی‌خیال — صفحات ایستا کافی‌اند
 }

 return [
...staticPages,
...ecosystemPages,
...industryPages,
...industryFaqPages,
...bankPages,
...taxPages,
...cityPages,
...cityIndustryPages,
...cityIndustryBankPages,
...comparePages,
...caseStudyPages,
...tutorialPages,
...seoPagesSitemap,
...blogPages,
...englishBlogHub,
...englishBlogPages,
...storefrontPages,
...storefrontBlogHubs,
 ];
}
