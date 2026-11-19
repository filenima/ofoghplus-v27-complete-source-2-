import { db } from "@/lib/db";
import { getSiteUrl } from "@/lib/seo";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
// Task 6-d (GEO): دادهٔ صنایع — بخش راهنمای تخصصی طلافروشی برای پرسش‌های
 // «نرم‌افزار حسابداری طلافروشی» / «مالیات فاکتور طلا» (قابل نقل‌قول)
import { industries } from "@/lib/industry-data";
// GEO (Agent 4): منبع واحد واقعیت‌های برند + FAQ + قیمت زندهٔ پلن‌ها
import { FACTS, BRAND_FAQS, renderFaqLines, factsBrand, faToman } from "@/lib/seo/geo-facts";
import { getEffectivePlans } from "@/lib/plans";

export const runtime = "nodejs";
// Task 7-د (۲): فایل llms-full.txt — متن سادهٔ ۵ مقالهٔ پیلار برای موتورهای
// پاسخ‌گویی هوش مصنوعی (AI Overviews / GEO). استاتیک با بازاعتبارسنجی روزانه.
export const dynamic = "force-static";
export const revalidate = 86400;

/** تبدیل HTML محتوای مقاله به متن سادهٔ خوانا برای LLM ها */
function htmlToPlainText(html: string): string {
 return html
  // شکستن خط در تگ‌های بلوکی
  .replace(/<\s*(br|\/p|\/h[1-6]|\/li|\/tr|\/table|\/blockquote|\/div)[^>]*>/gi, "\n")
  // حذف بقیهٔ تگ‌ها
  .replace(/<[^>]+>/g, " ")
  // نویسه‌های سازمانی
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  // فشرده‌سازی فاصله‌ها و حفظ ساختار پاراگراف
  .replace(/[ \t]+/g, " ")
  .replace(/\n[ \t]+/g, "\n")
  .replace(/[ \t]+\n/g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();
}

// GET /llms-full.txt — متن کامل ۵ مقالهٔ پیلار (بدون HTML)
export async function GET() {
 const [siteUrl, brand] = await Promise.all([getSiteUrl(), getBrandName()]);

 const posts = await db.blogPost.findMany({
  where: { status: "PUBLISHED" },
  select: {
   slug: true,
   title: true,
   excerpt: true,
   content: true,
   publishedAt: true,
   updatedAt: true, // v20-S: تاریخ آخرین به‌روزرسانی کنار هر خلاصه
   readingTime: true,
   category: true,
  },
 });

 if (posts.length === 0) {
  return new Response("هنوز مقاله‌ای منتشر نشده است.", {
   headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
 }

 // رتبه‌بندی «مهم‌ترین پیلار» بر اساس publishedAt + readingTime:
 // جامعیت (زمان مطالعه؛ پیلار = راهنمای بلند ۳۰+ دقیقه‌ای) و تازگی (سال اخیر)
 const now = Date.now();
 const scored = posts
  .map((p) => {
   const daysOld = p.publishedAt
    ? Math.max(0, (now - new Date(p.publishedAt).getTime()) / 86_400_000)
    : 365;
   const recency = Math.max(0, 1 - daysOld / 365); // ۰ تا ۱
   const comprehensiveness = Math.min(1, (p.readingTime || 0) / 30); // ۳۰ دقیقه = پیلار کامل
   return { p, score: comprehensiveness * 0.65 + recency * 0.35 };
  })
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);

 const parts: string[] = [];
 // FIX(v37→v38): درون‌یابی برند «هوش» بی‌اثر است (برند = قدیمی)؛
 // نام کامل «هوش‌حساب» فقط وقتی از برند کوتاه فرق دارد.
 parts.push(
  `# ${brand}${
   brand === "هوش" ? " (هوش‌حساب)" : brand === "افق پلاس" ? " (OfoghPlus)" : ""
  } — مقالات پیلار و راهنمای صنعت طلافروشی`
 );
 parts.push("");
 parts.push(
  `> این فایل متن کامل ${scored.length} مقالهٔ راهنمای کلیدی ${brand} را به‌صورت متن ساده (بدون HTML) برای موتورهای پاسخ‌گویی و خلاصه‌سازی هوش مصنوعی ارائه می‌کند. برای فهرست کامل ساختار سایت، llms.txt را ببینید.`
 );
 parts.push("");
 parts.push(`منبع: ${siteUrl}`);
 parts.push(`نقشهٔ سایت: ${siteUrl}/sitemap.xml`);
 parts.push(`فهرست راهنما: ${siteUrl}/llms.txt`);
 parts.push("");

 // ─── GEO (Agent 4): برگهٔ واقعیت‌های برند (Fact Sheet) ───
 // ساختاریافته برای استخراج مستقیم توسط موتورهای پاسخ‌گو (ChatGPT /
 // Perplexity / AI Overviews): برند، ماژول‌ها، قیمت زنده، صنایع، مودیان،
 // آفلاین، فروشگاه‌ساز، اتصال بانکی، امنیت، تمایزها و صفحات کلیدی.
 // منبع واحد: lib/seo/geo-facts.ts — قیمت‌ها زنده از getEffectivePlans.
 const plans = (await getEffectivePlans()).filter((p) => !p.hidden && p.priceToman > 0);
 const priceList =
  plans.map((p) => `${p.name} ${faToman(p.priceToman)}`).join("، ") ||
  "پلن‌های سالانه با قیمت رقابتی";

 parts.push("=".repeat(72));
 parts.push(`# برگهٔ واقعیت‌ها (Fact Sheet) — ${brand}${brand === FACTS.brand.fa ? ` (${FACTS.brand.en})` : ""}`);
 parts.push("");
 parts.push(`- وب‌سایت: ${siteUrl}`);
 parts.push(`- دسته‌بندی: ${FACTS.brand.category}`);
 if (FACTS.brand.foundedYearShamsi) parts.push(`- سال تأسیس: ${FACTS.brand.foundedYearShamsi}`);
 parts.push(`- مدل ارائه: ${factsBrand(FACTS.brand.deliveryModel, brand)}`);
 parts.push(`- دفتر مرکزی: ${factsBrand(FACTS.brand.hq, brand)}`);
 parts.push(`- پشتیبانی: ${factsBrand(FACTS.brand.support, brand)}`);
 parts.push(`- قیمت پلن‌ها (سالانه): ${priceList} — ${factsBrand(FACTS.pricing.freeTrial, brand)}`);
 parts.push(`- پلن رایگان همیشگی: ${factsBrand(FACTS.pricing.freeForeverPlan, brand)}`);
 parts.push(`- روش‌های پرداخت: ${factsBrand(FACTS.pricing.paymentMethods, brand)}`);
 parts.push(
  `- صنایع پشتیبانی‌شده (${FACTS.industries.length.toLocaleString("fa-IR")} صنعت): ${FACTS.industries.join("، ")}`
 );
 parts.push(`- کاربران هدف: ${factsBrand(FACTS.targetUsers, brand)}`);
 parts.push("");
 parts.push(`## ماژول‌ها (${FACTS.modules.length.toLocaleString("fa-IR")} ماژول یکپارچه)`);
 parts.push("");
 for (const m of FACTS.modules) {
  parts.push(`- **${m.label}:** ${factsBrand(m.description, brand)}`);
 }
 parts.push("");
 parts.push(`## ${factsBrand(FACTS.goldModule.title, brand)}`);
 parts.push("");
 parts.push(`- نرخ لحظه‌ای طلا: ${factsBrand(FACTS.goldModule.goldPriceApi, brand)}`);
 parts.push(`- مالیات فاکتور طلا: ${factsBrand(FACTS.goldModule.invoiceTax, brand)}`);
 parts.push(`- موجودی وزنی: ${factsBrand(FACTS.goldModule.weightInventory, brand)}`);
 parts.push(`- بازخرید و معاوضه: ${factsBrand(FACTS.goldModule.buyback, brand)}`);
 parts.push(`- سامانه مودیان: ${factsBrand(FACTS.goldModule.moadian, brand)}`);
 parts.push("");
 parts.push("## قابلیت‌های کلیدی");
 parts.push("");
 // نکتهٔ نگارشی: مقادیر مودیان/آفلاین در geo-facts با «بله؛» شروع می‌شوند
 // (چراکه پاسخ پرسش‌اند)؛ در فهرست قابلیت‌ها این «بله» اضافه است و حذف می‌شود.
 const stripYes = (t: string) => t.replace(/^بله؛\s*/u, "");
 parts.push(`- سامانه مودیان: ${stripYes(factsBrand(FACTS.moadian, brand))}`);
 parts.push(`- نسخهٔ آفلاین: ${stripYes(factsBrand(FACTS.offline, brand))}`);
 parts.push(`- فروشگاه آنلاین‌ساز: ${stripYes(factsBrand(FACTS.shopBuilder, brand))}`);
 parts.push(`- اتصال بانکی: ${factsBrand(FACTS.bankIntegration, brand)}`);
 parts.push(`- هوش مصنوعی: ${factsBrand(FACTS.ai, brand)}`);
 parts.push(`- امنیت: ${factsBrand(FACTS.security, brand)}`);
 parts.push(`- مهاجرت داده: ${factsBrand(FACTS.migration, brand)}`);
 parts.push("");
 parts.push("## تمایزهای کلیدی");
 parts.push("");
 for (const d of FACTS.differentiators) parts.push(`- ${factsBrand(d, brand)}`);
 parts.push("");
 parts.push("## صفحات کلیدی قابل‌ارجاع");
 parts.push("");
 for (const kp of FACTS.keyPages) {
  parts.push(`- ${siteUrl}${kp.path} — ${factsBrand(kp.description, brand)}`);
 }
 parts.push("");

 // ─── GEO (Agent 4): پرسش‌های متداول برند (~۱۶ پرسش پرتکرار) ───
 parts.push(`# پرسش‌های متداول برند (پاسخ کوتاه — ${BRAND_FAQS.length.toLocaleString("fa-IR")} پرسش)`);
 parts.push("");
 parts.push(...renderFaqLines(BRAND_FAQS, brand, priceList));
 parts.push("");

 // ─── Task 6-d (GEO): راهنمای صنعت طلافروشی — محتوای قابل‌نقل‌قول برای
 // پرسش‌های پرتکرار موتورهای مولد (ChatGPT/Perplexity/AI Overviews) ───
 const goldIndustry = industries.find((i) => i.slug === "gold-shop");
 if (goldIndustry) {
  parts.push("=".repeat(72));
  parts.push(`# راهنمای صنعت: ${interpolateBrand(goldIndustry.name, brand)} — نرم‌افزار حسابداری طلافروشی`);
  parts.push("");
  parts.push(`- URL: ${siteUrl}/industries/gold-shop`);
  parts.push(`- خلاصه: ${interpolateBrand(goldIndustry.description, brand)}`);
  parts.push(`- ماژول‌های پیشنهادی: ${goldIndustry.recommendedModules.map((m) => interpolateBrand(m, brand)).join("، ")}`);
  parts.push("");
  parts.push("### پرسش‌های متداول حسابداری طلافروشی (پاسخ کوتاه)");
  parts.push("");
  for (const f of goldIndustry.faqs) {
   parts.push(`- **${interpolateBrand(f.question, brand)}** — ${interpolateBrand(f.answer, brand)}`);
  }
  parts.push("");
  // پوشش entity: فهرست همهٔ صنایع (۱۱ صنعت) برای پرسش‌های «برای صنعت X»
  parts.push(
   `صنایع پوشش‌داده‌شده (۱۱ صنعت): ${industries
    .map((i) => interpolateBrand(i.name, brand))
    .join("، ")} — راهنمای هر صنعت: ${siteUrl}/industries`
  );
  parts.push("");
 }

 for (const { p } of scored) {
  const url = `${siteUrl}/blog/${p.slug}`;
  const title = interpolateBrand(p.title, brand);
  const summary = interpolateBrand(p.excerpt || "", brand);
  const body = interpolateBrand(htmlToPlainText(p.content), brand);

  parts.push("=".repeat(72));
  parts.push(`# ${title}`);
  parts.push("");
  parts.push(`- URL: ${url}`);
  if (summary) parts.push(`- خلاصه: ${summary}`);
  parts.push(`- زمان مطالعه: ${p.readingTime || 5} دقیقه`);
  parts.push(`- تاریخ انتشار: ${p.publishedAt ? new Date(p.publishedAt).toISOString().slice(0, 10) : "-"}`);
  parts.push("");
  parts.push(body);
  parts.push("");
 }

 // ─── R14-K1 (GEO): خلاصهٔ سایر مقالات — چانک‌های نقل‌قول‌پذیر ───
 // بهترین‌_practice برای موتورهای پاسخ‌گویی: علاوه بر متن کامل پیلارها، خلاصهٔ
 // کوتاه (۲-۳ جمله) سایر مقالات هم در همین فایل باشد تا AI بتواند مستقیم
 // نقل‌قول کند — نه فقط عنوان. v20-S: سقف ۲۵ مقاله برداشته شد — همهٔ
 // مقالات منتشرشده (~۸۰+) می‌آیند؛ حجم هنوز کنترل‌شده است (خلاصه‌ها ~۳۰۰
 // نویسه ≈ ۲۵-۳۵KB؛ متن کامل فقط همان ۵ پیلار می‌ماند).
 const summarized = posts
  .filter((p) => !scored.some((s) => s.p.slug === p.slug))
  .sort(
   (a, b) =>
    (b.publishedAt ? new Date(b.publishedAt).getTime() : 0) -
    (a.publishedAt ? new Date(a.publishedAt).getTime() : 0)
  );

 if (summarized.length > 0) {
  parts.push("=".repeat(72));
  parts.push(`# خلاصهٔ سایر مقالات منتشرشده (${brand})`);
  parts.push("");
  parts.push(
   `> ${summarized.length} مقالهٔ تازه‌تر از بلاگ ${brand} — هر کدام با خلاصهٔ کوتاه قابل نقل‌قول. متن کامل هر مقاله در URL آن.`
  );
  parts.push("");
  for (const p of summarized) {
   const url = `${siteUrl}/blog/${p.slug}`;
   const title = interpolateBrand(p.title, brand);
   const summary = interpolateBrand(p.excerpt || "", brand)
    .replace(/\s+/g, " ")
    .trim();
   parts.push(`## ${title}`);
   parts.push(`- URL: ${url}`);
   if (summary) parts.push(`- خلاصه: ${summary.slice(0, 220)}`);
   parts.push(
    `- تاریخ انتشار: ${p.publishedAt ? new Date(p.publishedAt).toISOString().slice(0, 10) : "-"}`
   );
   // v20-S: سیگنال تازگی برای AI — آخرین به‌روزرسانی هر مقاله
   parts.push(
    `- آخرین به‌روزرسانی: ${p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0, 10) : "-"}`
   );
   parts.push("");
  }
 }

 return new Response(parts.join("\n"), {
  headers: {
   "Content-Type": "text/plain; charset=utf-8",
   "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200",
  },
 });
}
