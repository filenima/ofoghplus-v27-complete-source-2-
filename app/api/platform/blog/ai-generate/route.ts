import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { db } from "@/lib/db";
import { at9am, getPublishIntervalDays } from "@/lib/blog-scheduler";
import { countWords, stripCJK, ensureSeoStructure } from "@/lib/seo/article-core";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * POST /api/platform/blog/ai-generate — مقاله‌ساز بلند سئوشده (R14-B)
 * ----------------------------------------------------------------------------
 * Body: { topic: string,
 *         tone?: "formal"|"friendly"|"professional"|"casual"|"persuasive",
 *         length?: "short"|"medium"|"long",
 *         keywords?: string[], category?: string,
 *         saveDraft?: boolean,   // پیش‌فرض true — پیش‌نویس ذخیره + صف انتشار
 *         postId?: string }      // تولید مجدد روی همان پیش‌نویس (بدون نسخهٔ دوم)
 *
 * R14-B — ارتقای مقاله‌ساز:
 *  a) مقالهٔ بلند (۳۰۰۰+ کلمه در حالت long): مقدمهٔ قلاب‌دار، ۸-۱۲ بخش H2،
 *     ۲-۴ جدول مقایسه، ۵-۷ پرسش متداول، لینک‌های داخلی (/blog، /pricing،
 *     /features)، نتیجه‌گیری با CTA، فارسی، ارقام فارسی، متا سئو. خروجی HTML.
 *  b) اعتبارسنجی: اگر تعداد کلمات زیر حداقل باشد، یک دور «تکمیل/گسترش»
 *     دوباره از LLM خواسته می‌شود و ادامه به مقاله الصاق می‌شود.
 *  c) پس از ذخیره به‌عنوان پیش‌نویس، نوبت انتشار = انتهای صف (آخرین نوبتِ
 *     آینده + یک بازه) — همان الگوی addToQueue زمان‌بند؛ مقالهٔ تازه بلافاصله
 *     وارد صف انتشار می‌شود.
 *  d) پاسخ شامل تعداد کلمات + خلاصهٔ اعتبارسنجی + وضعیت صف است.
 *
 * اگر LLM کاملاً در دسترس نباشد، قالب fallback (HTML) برگردانده می‌شود تا
 * سوپرادمین هرگز با پاسخ خالی مواجه نشود (در آن حالت پیش‌نویسی ذخیره نمی‌شود).
 */

const LLM_TIMEOUT_MS = 5 * 60 * 1000;

// طول‌ها → (هدف کلمات، حداقل قبل از دور گسترش)
const LENGTH_SPEC: Record<string, { target: number; min: number }> = {
  short: { target: 1300, min: 800 },
  medium: { target: 2100, min: 1500 },
  long: { target: 3200, min: 2500 },
};

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s\u0600-\u06FF]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// R15-G (T3) + R15-ORCH FIX: slug انگلیسیِ خوانا برای مقالات تولیدی.
// مشکل مالک: «صفحات ساخته‌شده بشدت افتضاح» — ریشهٔ اصلی همین‌جا بود: آوانگاری
// «حرف‌به‌حرف» فارسی اسلاگ‌های ناخوانای «mdirit-nghdingi-ksbvkarhai» می‌ساخت.
// راه‌حل: فرهنگ لغت «واژه‌به‌واژه» حسابداری/مالی (خوانا و سئو-پسند) + در صورت
// نبود واژهٔ شناخته‌شده، شناسهٔ کوتاه منظم (نه آوانگاری حرف‌به‌حرف).
const FA_TOPIC_WORDS: Record<string, string> = {
 "مالیات": "tax", "مالیاتی": "tax", "مودیان": "moadian", "ارزش": "value",
 "افزوده": "added", "صورتحساب": "invoice", "فاکتور": "invoice", "صورت": "statement",
 "حساب": "account", "حسابداری": "accounting", "حسابدار": "accountant",
 "انبار": "inventory", "موجودی": "stock", "کالا": "goods", "کالای": "goods",
 "خرید": "purchase", "فروش": "sales", "درآمد": "revenue", "هزینه": "expenses",
 "سود": "profit", "زیان": "loss", "نقدینگی": "liquidity", "نقدی": "cash",
 "جریان": "flow", "بانک": "bank", "بانکی": "banking", "چک": "check",
 "سفته": "promissory", "تنخواه": "petty-cash", "دستمزد": "wage", "حقوق": "payroll",
 "کارمند": "employee", "پرسنل": "staff", "دستمزدها": "wages", "اوراق": "securities",
 "سهام": "shares", "بورس": "stock-market", "سرمایه": "capital", "بدهی": "debt",
 "بدهی‌ها": "debts", "مطالبات": "receivables", "پرداختنی": "payable",
 "دریافتنی": "receivable", "تراز": "balance", "ترازنامه": "balance-sheet",
 "دفتر": "ledger", "اسناد": "vouchers", "سند": "voucher", "کدینگ": "chart-of-accounts",
 "سال": "fiscal-year", "مالی": "financial", "گزارش": "report", "گزارش‌گیری": "reporting",
 "تجزیه": "analysis", "تحلیل": "analysis", "بازرسی": "audit", "رسیدگی": "assessment",
 "اعتراض": "objection", "جریمه": "penalty", "ددلاین": "deadline", "مهلت": "deadline",
 "کسب‌وکار": "business", "کسب": "business", "وکار": "business", "مغازه": "shop",
 "فروشگاه": "store", "عمده": "wholesale", "خرده": "retail", "پیمانکار": "contractor",
 "پیمانکاری": "contracting", "کارخانه": "factory", "تولید": "production",
 "خدمات": "services", "خدماتی": "services", "مشاوره": "consulting",
 "نرم‌افزار": "software", "نرم": "software", "افزار": "software", "اپلیکیشن": "app",
 "کلاد": "cloud", "ابری": "cloud", "آفلاین": "offline", "آنلاین": "online",
 "داده": "data", "داده‌ها": "data", "پشتیبان": "backup", "امنیت": "security",
 "تورم": "inflation", "اقتصاد": "economy", "قیمت": "pricing", "قیمت‌گذاری": "pricing",
 "بودجه": "budget", "پیش‌بینی": "forecast", "پیش‌بینی‌سازی": "forecasting",
 "راهنمای": "guide", "راهنما": "guide", "آموزش": "tutorial", "چک‌لیست": "checklist",
 "مقایسه": "comparison", "انتخاب": "selection", "هزینه‌ها": "costs", "هزینهٔ": "cost",
 "مدیریت": "management", "کنترل": "control", "برنامه": "plan", "برنامه‌ریزی": "planning",
 "زمان": "time", "سالانه": "annual", "ماهانه": "monthly", "روزانه": "daily",
 "استارتاپ": "startup", "کوچک": "small", "متوسط": "medium", "بزرگ": "enterprise",
 "ایران": "iran", "ایرانی": "iranian", "توری": "torn", "بحران": "crisis",
 "رشد": "growth", "شروع": "start", "راه": "way", "راه‌اندازی": "setup",
 "اتصال": "integration", "درگاه": "gateway", "پرداخت": "payment", "شارژ": "topup",
 "کیف": "wallet", "پول": "money", "وام": "loan", "قرض": "loan", "بانکداری": "banking",
 "دیجیتال": "digital", "هوشمند": "smart", "هوش": "ai", "مصنوعی": "intelligence",
};

/**
 * FIX(1-e): کاور پیش‌فرض بر اساس دستهٔ مقاله — قبلاً coverImage هرگز ست نمی‌شد
 * و پیش‌نویس‌های مقاله‌ساز در لیست/صف انتشار بدون تصویر می‌ماندند (تسک ۱-e).
 * همه از /images موجود و تاییدشده (همان کاورهای مقالات منتشرشده فعلی).
 */
const CATEGORY_COVER: Record<string, string> = {
  ACCOUNTING: "/images/hero-accounting.avif",
  TAX: "/images/hero-taxes.avif",
  PAYROLL: "/images/payroll-hr.avif",
  TUTORIAL: "/images/hero-dashboard.avif",
  EDUCATION: "/images/hero-dashboard.avif",
  NEWS: "/images/ai-assistant.avif",
  MODIAN: "/images/moadian-tax.avif",
  COMPARISON: "/images/hero-accounting.avif",
};
const DEFAULT_COVER = "/images/hero-dashboard.avif";
function coverForCategory(category: string): string {
  return CATEGORY_COVER[category] || DEFAULT_COVER;
}

/** استخراج واژه‌های فارسیِ موضوع → معادل انگلیسی خوانا (واژه‌به‌واژه) */
function topicToEnglishSlug(text: string): string {
 const words = text
  .replace(/[«»()\[\]:؛،.!؟?"'٬،]/g, " ")
  .split(/[\s\u200c]+/)
  .filter(Boolean);
 const en: string[] = [];
 for (const w of words) {
  const mapped = FA_TOPIC_WORDS[w] ?? FA_TOPIC_WORDS[w.replace(/‌$/, "")];
  if (mapped && !en.includes(mapped)) en.push(mapped);
 }
 return en.slice(0, 6).join("-");
}

/**
 * زنجیرهٔ slug (R15 اصلاح‌شده): SLUG پیشنهادی LLM → slugify(عنوان لاتین) →
 * واژه‌نگار موضوع (انگلیسی خوانا) → شناسهٔ کوتاه منظم.
 * آوانگاری حرف‌به‌حرف حذف شد — اسلاگ‌های ناخوانا می‌ساخت.
 */
function buildArticleSlug(args: {
 suggested: string;
 title: string;
 topic: string;
}): string {
 const fromSuggested = slugify(args.suggested);
 if (fromSuggested && fromSuggested.length >= 3) return fromSuggested;
 const fromTitle = slugify(args.title);
 if (fromTitle && fromTitle.length >= 3) return fromTitle;
 const fromTopicWords = topicToEnglishSlug(`${args.title} ${args.topic}`);
 if (fromTopicWords && fromTopicWords.length >= 3) {
  return fromTopicWords.endsWith("-guide") ? fromTopicWords : `${fromTopicWords}-guide`;
 }
 return "";
}

/** ارقام لاتین → فارسی فقط در گره‌های متنی (تگ‌ها/URLها دست‌نخورده) */
function persianizeDigitsInText(html: string): string {
  const parts = html.split(/(<[^>]+>)/);
  return parts
    .map((p) =>
      p.startsWith("<")
        ? p
        : p.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)])
    )
    .join("");
}

/** پاک‌سازی مشترک: حذف کاراکترهای CJK + فارسی‌سازی ارقام متن */
function clean(html: string): string {
  return persianizeDigitsInText(stripCJK(html));
}

interface ValidationSummary {
  words: number;
  h2: number;
  tables: number;
  faq: number;
  internalLinks: number;
  ctas: number;
  latinDigitsInText: number;
  cjkChars: number;
  ok: boolean;
  problems: string[];
}

function validateArticleHtml(html: string): ValidationSummary {
  const words = countWords(html);
  const h2 = (html.match(/<h2[\s>]/g) || []).length;
  const tables = (html.match(/<table[\s>]/g) || []).length;
  const faq = (html.match(/<h3[^>]*>[^<]*؟/g) || []).length;
  const internalLinks = (html.match(/href="\/(blog|pricing|features)/g) || []).length;
  const ctas = (html.match(/href="\/pricing"/g) || []).length;
  const textOnly = html.replace(/<[^>]+>/g, " ").replace(/\/[a-z0-9\-\/\.]+/gi, " ");
  const latinDigitsInText = (textOnly.match(/[0-9]/g) || []).length;
  const cjkChars = (html.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;

  const problems: string[] = [];
  if (words < 2500) problems.push(`کلمات ${words} < ۲۵۰۰`);
  if (h2 < 8) problems.push(`بخش‌های H2: ${h2} < ۸`);
  if (tables < 2) problems.push(`جدول‌ها: ${tables} < ۲`);
  if (faq < 5) problems.push(`پرسش‌های متداول: ${faq} < ۵`);
  if (internalLinks < 3) problems.push("لینک‌های داخلی کافی نیست");
  if (latinDigitsInText > 5) problems.push(`ارقام لاتین در متن: ${latinDigitsInText}`);
  if (cjkChars > 0) problems.push(`کاراکتر چینی/CJK: ${cjkChars}`);

  return {
    words,
    h2,
    tables,
    faq,
    internalLinks,
    ctas,
    latinDigitsInText,
    cjkChars,
    ok: problems.length === 0,
    problems,
  };
}

/** فراخوانی LLM با تایم‌اوت — fences کد بریده می‌شوند */
async function callLLM(system: string, user: string, timeoutMs = LLM_TIMEOUT_MS): Promise<string> {
  const zai = await ZAI.create();
  const completion = await Promise.race([
    zai.chat.completions.create({
      messages: [
        { role: "assistant", content: system },
        { role: "user", content: user },
      ],
      thinking: { type: "disabled" },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("LLM timeout")), timeoutMs)
    ),
  ]);
  const content: string | undefined = completion.choices?.[0]?.message?.content;
  if (!content || content.trim().length === 0) throw new Error("empty LLM response");
  return content
    .replace(/^\s*```(?:html|json|markdown)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

// ─────────────────────────── پرامپت مقالهٔ بلند ───────────────────────────

const PRODUCT_FACTS = `فکت‌های واقعی محصول «افق پلاس» — فقط از این‌ها استفاده کن و چیزی از خودت اضافه نکن:
- نرم‌افزار حسابداری ابری ایرانی با ۱۶ ماژول یکپارچه
- پلن‌ها: پایه ۹,۷۵۰,۰۰۰ تومان/سال — حرفه‌ای ۱۳,۹۰۰,۰۰۰ تومان/سال — سازمانی ۳۴,۹۰۰,۰۰۰ تومان/سال
- تریال ۷ روزه رایگان بدون نیاز به کارت بانکی
- اتصال یکپارچه به سامانه مودیان (صورتحساب الف/ب/ج + کارپوشه)
- OCR فاکتور با دقت ۹۸٪ — هوش مصنوعی: دستیار مالی، پیش‌بینی جریان نقدی، تشخیص ناهنجاری
- انبار چندگانه با کاردکس، حقوق و دستمزد با قوانین ۱۴۰۴، اتصال ووکامرس/دیجی‌کالا/باسلام
- تلفن پشتیبانی: ۰۷۱-۳۲۶۲۲۴۹۳`;

function buildLongPrompt(args: {
  topic: string;
  tone: string;
  targetWords: number;
  h2Count: string;
  keywords: string[];
  category: string;
}): string {
  const kw =
    args.keywords.length > 0
      ? `\nکلمات کلیدی که باید به‌طور طبیعی در سرفصل‌ها و محتوا بیایند: ${args.keywords.join("، ")}`
      : "";
  return `یک مقالهٔ وبلاگ فارسی «بلند و سئوشده» با موضوع «${args.topic}» برای نرم‌افزار حسابداری افق پلاس بنویس.

لحن: ${args.tone}
دسته‌بندی: ${args.category}${kw}
هدف: حدود ${args.targetWords} کلمه محتوای واقعی (حداقل ${Math.round(args.targetWords * 0.85)} کلمه).

فرمت خروجی (دقیقاً همین ترتیب):
- خط اول: عنوان جذاب مقاله (متن ساده، بدون # و بدون تگ)
- خط دوم خالی
- سپس HTML کامل بدنهٔ مقاله (بدون تگ‌های html/head/body و بدون markdown)

ساختار الزامی بدنهٔ HTML:
۱. مقدمهٔ قلاب‌دار: پاراگراف ۱۰۰-۱۵۰ کلمه‌ای که با صحنهٔ واقعی کسب‌وکار ایرانی شروع می‌شود (درد واقعی، ساعت، مکان) و ارزش اصلی مقاله را وعده می‌دهد.
۲. ${args.h2Count} بخش اصلی با <h2> شماره‌دار (مثل <h2>۱. چرا …</h2>) — ترتیب منطقی از ساده به پیشرفته؛ هر بخش ۲۵۰+ کلمه محتوای داده‌محور با مثال عددی تومانی و سناریو واقعی.
۳. حداقل ۲ و حداکثر ۴ جدول مقایسه <table> کامل با <thead> و <tbody> و ۴+ ردیف دادهٔ واقعی (قیمت‌ها، پلن‌ها، مقایسهٔ گزینه‌ها، فرمول‌ها).
۴. بخش الزامی «سوالات متداول» با <h2>سوالات متداول</h2> و دقیقاً ۵ تا ۷ پرسش <h3>…؟</h3> + پاسخ <p> مستقل ۴۰-۶۰ کلمه‌ای (قابل‌نقل در نتایج گوگل و پاسخ‌های هوش مصنوعی) — بدون این بخش مقاله رد می‌شود.
۵. نتیجه‌گیری با CTA: دعوت به «شروع رایگان ۷ روزه افق پلاس» با لینک <a href="/pricing">.

لینک‌های داخلی مجاز (فقط این‌ها — با انکرتکست فارسی توصیفی، حداقل ۳ لینک در متن):
- /blog → بلاگ افق پلاس
- /pricing → صفحهٔ قیمت و شروع رایگان
- /features → صفحهٔ امکانات نرم‌افزار

${PRODUCT_FACTS}

قواعد:
- فقط زبان فارسی روان؛ هیچ کلمه یا کاراکتر چینی ممنوع.
- همهٔ اعداد قابل‌مشاهده با ارقام فارسی (۰۱۲۳۴۵۶۷۸۹).
- مثال‌های عددی با تومان واقعی و سازگاری ریاضی درونی (جمع ستون‌ها را خودت چک کن).
- حداقل ۲ آمار نقل‌کردنی با عبارت «طبق بررسی افق پلاس از ۴۰۰ کسب‌وکار ایرانی».
- خروجی فقط HTML خام — بدون بلوک کد markdown (سه‌علامت گرَو)، بدون هیچ علامت گرَو.

و در انتهای خروجی، این ۵ خط متا (هر کدام یک خط کامل — بدون حذف هیچ‌کدام):
META_TITLE: عنوان متا ۵۰-۶۰ کاراکتری حاوی کلیدواژهٔ اصلی
META_DESCRIPTION: توضیحات متا ۱۲۰-۱۵۰ کاراکتری جذاب
FOCUS: کلیدواژهٔ کانونی اصلی
SLUG: نامک انگلیسی کوتاه kebab-case (مثال: instagram-shop-accounting-guide)
TAGS: ۴ تا ۶ برچسب فارسی جدا شده با کاما`;
}

function buildExpandPrompt(args: {
  topic: string;
  currentHtml: string;
  needWords: number;
  missingFaq: boolean;
  missingTables: boolean;
}): string {
  // فقط دم مقاله برای ادامهٔ هم‌راستا — کل HTML نمی‌فرستیم
  const tail = args.currentHtml.slice(-4000);
  const requirements: string[] = [
    `- حدود ${args.needWords} کلمهٔ محتوای تازه اضافه کن (بخش‌های <h2> شماره‌دار تازه — شماره‌ها از آخرین شمارهٔ موجود ادامه یابد — هر بخش ۲۵۰+ کلمه با مثال عددی تومانی).`,
  ];
  if (args.missingTables) {
    requirements.push(
      "- حداقل ۲ <table> مقایسهٔ کامل با <thead>/<tbody> و ۴+ ردیف دادهٔ واقعی اضافه کن."
    );
  }
  if (args.missingFaq) {
    requirements.push(
      "- در انتهای ادامه، بخش الزامی <h2>سوالات متداول</h2> با ۵ تا ۷ پرسش <h3>…؟</h3> + پاسخ <p> مستقل ۴۰-۶۰ کلمه‌ای بساز."
    );
  }
  return `مقالهٔ فارسی «${args.topic}» ناقص است. ادامه و تکمیل مقاله را بنویس.

انتهای فعلی مقاله (برای ادامهٔ هم‌راستا — تکرار نکن):
...
${tail}

الزامات ادامه:
${requirements.join("\n")}
- اعداد فارسی؛ لینک داخلی طبیعی به /blog یا /pricing یا /features در صورت تناسب.
- فقط HTML ادامه — بدون تکرار مقدمه/بخش‌های موجود، بدون markdown و بدون علامت گرَو.

فقط HTML ادامهٔ مقاله.`;
}

// ─────────────────────────── پارس خروجی ───────────────────────────

function parseGeneratedContent(
  raw: string,
  topic: string
): {
  title: string;
  html: string;
  metaTitle: string;
  metaDescription: string;
  focusKeyword: string;
  suggestedSlug: string;
  suggestedTags: string[];
} {
  let metaTitle = "";
  let metaDescription = "";
  let focusKeyword = "";
  let suggestedSlug = "";
  let suggestedTags: string[] = [];
  const bodyLines: string[] = [];

  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (/^(META_TITLE|عنوان متا)\s*[:：]/i.test(t)) {
      metaTitle = t.split(/[:：]/).slice(1).join(":").trim().slice(0, 70);
    } else if (/^(META_DESCRIPTION|توضیحات متا)\s*[:：]/i.test(t)) {
      metaDescription = t.split(/[:：]/).slice(1).join(":").trim().slice(0, 165);
    } else if (/^(FOCUS|کلیدواژه)\s*[:：]/i.test(t)) {
      focusKeyword = t.split(/[:：]/).slice(1).join(":").trim().slice(0, 80);
    } else if (/^(SLUG|نامک)\s*[:：]/i.test(t)) {
      suggestedSlug = slugify(t.split(/[:：]/).slice(1).join(":").trim());
    } else if (/^(TAGS|برچسب)\s*[:：]/i.test(t)) {
      suggestedTags = t
        .split(/[:：]/)
        .slice(1)
        .join(":")
        .split(/[,،]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8);
    } else {
      bodyLines.push(line);
    }
  }

  // عنوان = اولین خط غیرخالی (متن ساده یا <h1>)
  let title = topic;
  let startIdx = 0;
  for (let i = 0; i < bodyLines.length; i++) {
    const t = bodyLines[i].trim();
    if (t) {
      const h1 = t.match(/^<h1[^>]*>([\s\S]*?)<\/h1>$/i);
      title = (h1 ? h1[1] : t)
        .replace(/^#+\s*/, "")
        .replace(/^\*\*/, "")
        .replace(/\*\*$/, "")
        .trim()
        .slice(0, 100);
      startIdx = i + 1;
      break;
    }
  }

  let html = bodyLines.slice(startIdx).join("\n").trim();
  // h1 تکراری از بدنه حذف می‌شود (عنوان جداگانه رندر می‌شود)
  html = html.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/i, "");

  if (!metaTitle) metaTitle = title.slice(0, 60);
  if (!focusKeyword) focusKeyword = topic.split(/\s+/).slice(0, 4).join(" ");
  if (suggestedTags.length === 0) {
    suggestedTags = [topic.slice(0, 30), "افق پلاس", "حسابداری"].slice(0, 5);
  }

  return { title, html, metaTitle, metaDescription, focusKeyword, suggestedSlug, suggestedTags };
}

function extractExcerpt(html: string): string {
  const firstPara = html.match(/<p[^>]*>[\s\S]*?<\/p>/);
  const text = firstPara
    ? firstPara[0].replace(/<[^>]+>/g, "").trim()
    : html.replace(/<[^>]+>/g, " ").trim();
  return text.slice(0, 220);
}

// ─────────────────────────── صف انتشار ───────────────────────────

/** نوبت انتهای صف — همان الگوی addToQueue در scheduler route */
async function computeQueueSlot(): Promise<{
  slot: Date;
  position: number;
  intervalDays: number;
}> {
  const intervalDays = await getPublishIntervalDays();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const last = await db.blogPost.findFirst({
    where: { status: "DRAFT", scheduledPublishAt: { not: null } },
    orderBy: { scheduledPublishAt: "desc" },
    select: { scheduledPublishAt: true },
  });
  const now = new Date();
  const hasFuture =
    last?.scheduledPublishAt != null &&
    new Date(last.scheduledPublishAt as unknown as string) > now;
  const slot = hasFuture
    ? new Date(
        at9am(new Date(last!.scheduledPublishAt as unknown as string)).getTime() +
          intervalDays * DAY_MS
      )
    : at9am(new Date(now.getTime() + DAY_MS));
  const maxOrder = await db.blogPost.findFirst({
    where: { status: "DRAFT", scheduleOrder: { not: null } },
    orderBy: { scheduleOrder: "desc" },
    select: { scheduleOrder: true },
  });
  return { slot, position: (maxOrder?.scheduleOrder ?? 0) + 1, intervalDays };
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base || `article-${Date.now()}`;
  let n = 2;
  for (let i = 0; i < 20; i++) {
    const exists = await db.blogPost
      .findUnique({ where: { slug: candidate } })
      .catch(() => null);
    if (!exists) return candidate;
    candidate = `${base}-${n++}`;
  }
  return `${base}-${Date.now()}`;
}

// ─────────────────────────── fallback (HTML) ───────────────────────────

function generateFallback(topic: string, _category: string): string {
  return `${topic} — راهنمای کامل

<p>در دنیای پرشتاب کسب‌وکار امروز، ${topic} یکی از چالش‌های اساسی برای سازمان‌های ایرانی است. در این مقاله به بررسی جامع آن می‌پردازیم.</p>

<h2>۱. چرا ${topic} مهم است؟</h2>
<p>مدیریت صحیح ${topic} می‌تواند بهره‌وری سازمان را افزایش دهد و هزینه‌ها را کاهش دهد. بسیاری از کسب‌وکارها به‌دلیل عدم آشنایی با ابزارهای مناسب، در این حوزه با مشکل مواجه می‌شوند. برای مطالعهٔ بیشتر، <a href="/blog">بلاگ افق پلاس</a> را ببینید.</p>

<h2>۲. راهکار افق پلاس برای ${topic}</h2>
<p>پلتفرم افق پلاس با ارائه‌ی ابزارهای هوشمند، ${topic} را به‌صورت خودکار مدیریت می‌کند. این راهکار شامل گزارش‌گیری لحظه‌ای، هشدارهای هوشمند و اتصال به سامانه‌ی مودیان است. <a href="/features">امکانات نرم‌افزار</a> را مقایسه کنید.</p>

<h2>۳. نکات کلیدی پیاده‌سازی</h2>
<ul>
<li>شناخت نیاز کسب‌وکار</li>
<li>انتخاب ابزار مناسب</li>
<li>آموزش تیم</li>
<li>پایش مداوم</li>
</ul>

<h2>سوالات متداول</h2>
<h3>${topic} چیست؟</h3>
<p>${topic} یکی از موضوعات کلیدی حسابداری کسب‌وکارهای ایرانی است که مدیریت درست آن به صرفه‌جویی زمانی و مالی قابل‌توجهی می‌رسد.</p>
<h3>افق پلاس چگونه در این زمینه کمک می‌کند؟</h3>
<p>افق پلاس با ۱۶ ماژول یکپارچه و هوش مصنوعی داخلی، فرایندهای مرتبط را خودکار و گزارش‌پذیر می‌کند.</p>
<h3>قیمت نرم‌افزار افق پلاس چقدر است؟</h3>
<p>پلن پایه ۹,۷۵۰,۰۰۰ تومان در سال است؛ جزئیات کامل در <a href="/pricing">صفحهٔ قیمت</a>.</p>
<h3>آیا تریال رایگان دارد؟</h3>
<p>بله — ۷ روز رایگان و بدون نیاز به کارت بانکی.</p>
<h3>پشتیبانی چگونه است؟</h3>
<p>تیم پشتیبانی افق پلاس از طریق تلفن ۰۷۱-۳۲۶۲۲۴۹۳ پاسخ‌گو است.</p>

<h2>نتیجه‌گیری</h2>
<p>برای بهره‌مند شدن از قابلیت‌های افق پلاس در حوزه‌ی ${topic}، همین امروز <a href="/pricing">۷ روز رایگان</a> استفاده کنید.</p>

META_TITLE: ${topic} | راهنمای کامل افق پلاس
META_DESCRIPTION: در این مقاله درباره‌ی ${topic} و راهکار افق پلاس برای مدیریت هوشمند آن توضیح می‌دهیم. برای کسب‌وکارهای ایرانی مناسب است.
FOCUS: ${topic}
TAGS: ${topic}، افق پلاس، حسابداری، مدیریت هوشمند`;
}

// ─────────────────────────── Route ───────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const {
      topic,
      tone = "professional",
      length = "long",
      keywords = [],
      category = "ACCOUNTING",
      saveDraft = true,
      postId,
    } = body as {
      topic?: string;
      tone?: "formal" | "friendly" | "professional" | "casual" | "persuasive";
      length?: "short" | "medium" | "long";
      keywords?: string[];
      category?: string;
      saveDraft?: boolean;
      postId?: string;
    };

    if (!topic || !topic.trim()) {
      return NextResponse.json(
        { success: false, error: "موضوع (topic) الزامی است" },
        { status: 400 }
      );
    }

    const TONE_LABELS: Record<string, string> = {
      formal: "رسمی",
      friendly: "صمیمی",
      professional: "حرفه‌ای",
      casual: "غیررسمی",
      persuasive: "ترغیبی",
    };
    const spec = LENGTH_SPEC[length] || LENGTH_SPEC.long;
    const h2Count = length === "long" ? "۸ تا ۱۲" : length === "medium" ? "۶ تا ۸" : "۴ تا ۶";

    const system =
      "تو نویسندهٔ ارشد محتوای تخصصی حسابداری و مالیات ایران برای وبلاگ «افق پلاس» هستی. مقاله‌های تو در گوگل فارسی رتبهٔ اول می‌گیرند و در پاسخ‌های هوش مصنوعی نقل می‌شوند. خروجی همیشه فارسی روان با ساختار HTML استاندارد است.";

    // ── دور ۱: تولید کامل ──
    let raw = "";
    let warning: string | undefined;
    let usedFallback = false;
    try {
      raw = await callLLM(
        system,
        buildLongPrompt({
          topic: topic.trim(),
          tone: TONE_LABELS[tone] || tone,
          targetWords: spec.target,
          h2Count,
          keywords,
          category,
        })
      );
    } catch (err) {
      console.error("[ai-blog-generate] LLM error:", err);
      warning = "LLM در دسترس نبود — از قالب آماده استفاده شد";
      raw = generateFallback(topic.trim(), category);
      usedFallback = true;
    }

    // ── پارس + پاک‌سازی (CJK + ارقام فارسی در متن) ──
    const parsed = parseGeneratedContent(raw, topic.trim());
    let html = clean(parsed.html);
    const title = clean(parsed.title).trim().slice(0, 100) || topic.trim();
    const metaTitle = stripCJK(parsed.metaTitle).slice(0, 70);
    const focusKeyword = stripCJK(parsed.focusKeyword);
    const suggestedTags = parsed.suggestedTags
      .map((t) => stripCJK(t))
      .filter(Boolean)
      .slice(0, 6);
    const excerpt = extractExcerpt(html);
    // metaDescription خالی → خلاصهٔ مقاله (هرگز متای خالی ذخیره نمی‌شود)
    const metaDescription =
      stripCJK(parsed.metaDescription).slice(0, 165) || excerpt.slice(0, 160);

    let validation = validateArticleHtml(html);
    let retryUsed = false;

    // ── دور ۲ (b): کوتاهی یا نقص ساختاری → یک دور «تکمیل/گسترش» ──
    if (
      !usedFallback &&
      (validation.words < spec.min || validation.faq < 5 || validation.tables < 2)
    ) {
      retryUsed = true;
      try {
        const continuation = await callLLM(
          system,
          buildExpandPrompt({
            topic: topic.trim(),
            currentHtml: html,
            needWords: Math.max(400, 3200 - validation.words),
            missingFaq: validation.faq < 5,
            missingTables: validation.tables < 2,
          })
        );
        const extra = clean(continuation);
        if (countWords(extra) > 120) {
          // ادامه قبل از «سوالات متداول» الصاق می‌شود تا ساختار سئو حفظ بماند
          const faqIdx = html.search(/<h2[^>]*>[^<]*(سوالات متداول|سؤالات متداول)/);
          html =
            faqIdx > -1
              ? html.slice(0, faqIdx) + extra + "\n" + html.slice(faqIdx)
              : html + "\n" + extra;
          validation = validateArticleHtml(html);
        }
      } catch (err) {
        console.error("[ai-blog-generate] expand retry error:", err);
        warning = "دور گسترش مقاله ناموفق بود — محتوا با طول فعلی برگردانده شد";
      }
    }

    // ── R15-G (T3): تضمین قطعی ساختار سئو — خروجی LLM قطعی نیست (تست زنده:
    // مقالهٔ ۳۳۵۵ کلمه‌ای بدون هیچ FAQ و با ۱ جدول). حتی بعد از دور گسترش،
    // اگر FAQ/جدول/لینک داخلی کم باشد، بلوک‌های استاندارد فارسی اضافه می‌شود
    // تا اسکیمای FAQPage و اعتبارسنجی همیشه برقرار باشد. ──
    const structureFixed =
      !usedFallback && (validation.faq < 5 || validation.tables < 2 || validation.internalLinks < 3);
    if (structureFixed) {
      html = ensureSeoStructure(html, topic.trim());
      validation = validateArticleHtml(html);
    }

    const wordCount = validation.words;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    // ── (c): ذخیرهٔ پیش‌نویس + ورود خودکار به صف انتشار ──
    let savedAsDraft = false;
    let savedPostId: string | undefined;
    let savedSlug: string | undefined;
    let savedCoverImage: string | undefined;
    let scheduledPublishAt: string | null = null;
    let queuePosition: number | null = null;

    if (saveDraft && !usedFallback) {
      try {
        const target = postId
          ? await db.blogPost.findUnique({ where: { id: postId } })
          : null;

        if (target && target.status === "DRAFT") {
          // تولید مجدد روی همان پیش‌نویس — slug و نوبت موجود حفظ می‌شود
          let slotData: { slot: Date; position: number } | null = null;
          if (!target.scheduledPublishAt) {
            const s = await computeQueueSlot();
            slotData = { slot: s.slot, position: s.position };
          }
          await db.blogPost.update({
            where: { id: target.id },
            data: {
              title,
              excerpt,
              content: html,
              category,
              tags: JSON.stringify(suggestedTags),
              readingTime,
              metaTitle,
              metaDescription,
              focusKeyword,
              // FIX(1-e): کاور — اگر پیش‌نویس قبلاً کاور داشت حفظ می‌شود، وگرنه
              // کاور متناسب با دسته می‌گیرد (قبلاً هرگز ست نمی‌شد)
              ...(target.coverImage ? {} : { coverImage: coverForCategory(category) }),
              ...(slotData
                ? { scheduledPublishAt: slotData.slot, scheduleOrder: slotData.position }
                : {}),
            },
          });
          savedAsDraft = true;
          savedPostId = target.id;
          savedSlug = target.slug;
          savedCoverImage = target.coverImage || coverForCategory(category);
          const slot = slotData ? slotData.slot : target.scheduledPublishAt;
          scheduledPublishAt = slot ? new Date(slot).toISOString() : null;
          queuePosition = slotData ? slotData.position : target.scheduleOrder ?? null;
        } else {
          // اولویت slug: نامک پیشنهادی LLM → slugify(عنوان) → آوانگاری عنوان/موضوع
          // (R15-G: دیگر هرگز «article-<timestamp>» نمی‌سازد) → fallback زمان‌دار
          const baseSlug =
            buildArticleSlug({
              suggested: parsed.suggestedSlug,
              title,
              topic: topic.trim(),
            }) || `article-${Date.now()}`;
          const finalSlug = await uniqueSlug(baseSlug);
          const { slot, position } = await computeQueueSlot();
          const post = await db.blogPost.create({
            data: {
              slug: finalSlug,
              title,
              excerpt,
              content: html,
              // FIX(1-e): کاور متناسب با دسته — الزام تسک: پیش‌نویس باید کاور داشته باشد
              coverImage: coverForCategory(category),
              category,
              tags: JSON.stringify(suggestedTags),
              status: "DRAFT",
              readingTime,
              metaTitle,
              metaDescription,
              focusKeyword,
              scheduledPublishAt: slot,
              scheduleOrder: position,
              authorId: auth.admin.id,
            },
          });
          savedAsDraft = true;
          savedPostId = post.id;
          savedSlug = finalSlug;
          savedCoverImage = coverForCategory(category);
          scheduledPublishAt = slot.toISOString();
          queuePosition = position;
        }
      } catch (err) {
        console.error("[ai-blog-generate] save draft error:", err);
        warning = "محتوا تولید شد اما ذخیرهٔ پیش‌نویس ناموفق بود — دستی ذخیره کنید";
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        title,
        excerpt,
        content: html,
        metaTitle,
        metaDescription,
        focusKeyword,
        tags: suggestedTags,
        readingTime,
        // FIX(1-e): کاور تخصیص‌یافته — ویرایشگر بلافاصله نمایشش می‌دهد
        coverImage: savedCoverImage || coverForCategory(category),
        // (d) — خلاصهٔ اعتبارسنجی + تعداد کلمات + وضعیت صف
        wordCount,
        validation,
        retryUsed,
        structureFixed,
        savedAsDraft,
        postId: savedPostId,
        slug: savedSlug,
        scheduledPublishAt,
        queuePosition,
      },
      warning,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ai-blog-generate] error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در تولید محتوای AI" },
      { status: 500 }
    );
  }
}
