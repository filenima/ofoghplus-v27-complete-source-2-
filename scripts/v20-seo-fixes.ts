// ============================================================================
// scripts/v20-seo-fixes.ts — فیکس‌های داده‌ای سئو (v20-S / ممیزی دو-ایجنته)
// ----------------------------------------------------------------------------
// الف) انتشار ۲ پیش‌نویسی که ده‌ها لینک داخلی به آن‌ها اشاره می‌کنند:
//     chart-of-accounts-guide + accrual-vs-cash-accounting
// ب) تزریق بلوک «سوالات متداول» به مقالات منتشرشده‌ای که FAQ ندارند
//     (۲ سوال از عنوان/کلیدواژهٔ مقاله + ۳ سوال عمومیِ مرتبط و واقعی)
// ج) رفع هم‌نوع‌یابی (cannibalization): کانونیکال ۴ مقاله به پیلار خوشه
// د) پاکسازی فروشگاه دمو (demo-shop): عنوان/سئو + رشته‌های «تست QA»/«هوش»
//
// اجرا (idempotent — اجرای مجدد بی‌ضرر است و فقط گزارش می‌دهد):
//   cd /home/z/my-project && DATABASE_URL="file:/home/z/my-project/db/custom.db" \
//     bun scripts/v20-seo-fixes.ts
// ============================================================================

import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

// ─── تعیین مسیر مطلق دیتابیس پروژه (ضد-hijack متغیر محیطی سندباکس) ───
// (همان الگوی scripts/add-r17-blogs.ts)
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATABASE_URL = `file:${join(PROJECT_ROOT, "db", "custom.db")}`;
const db = new PrismaClient({ log: ["error", "warn"] });

const BRAND = "افق پلاس";
const SITE = "https://ofoghplus.ir"; // PRIMARY_DOMAIN (lib/domains.ts)

// ═════════════════ (الف) انتشار ۲ پیش‌نویس با لینک داخلی ═════════════════

const DRAFTS_TO_PUBLISH = [
  "chart-of-accounts-guide",
  "accrual-vs-cash-accounting",
] as const;

async function publishLinkedDrafts(): Promise<void> {
  console.log("\n── (الف) انتشار پیش‌نویس‌های دارای لینک داخلی ──");
  for (const slug of DRAFTS_TO_PUBLISH) {
    const post = await db.blogPost.findUnique({
      where: { slug },
      select: { slug: true, status: true, title: true, content: true, publishedAt: true },
    });
    if (!post) {
      console.log(`  [X] یافت نشد: ${slug}`);
      continue;
    }
    const wordCount = post.content
      .replace(/<[^>]+>/g, " ")
      .split(/\s+/)
      .filter(Boolean).length;
    if (post.status === "PUBLISHED") {
      console.log(`  • ${slug}: قبلاً منتشر شده (publishedAt=${post.publishedAt?.toISOString()}) — رد شد`);
      continue;
    }
    await db.blogPost.update({
      where: { slug },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    console.log(`  [OK] منتشر شد: ${slug} (${wordCount.toLocaleString("fa-IR")} کلمه) — «${post.title.slice(0, 60)}»`);
  }
}

// ═════════════════ (ب) تزریق FAQ به مقالات بدون «سوالات متداول» ═════════════════

const FAQ_PATTERN = /سوالات\s*متداول|سؤالات\s*متداول|پرسش‌?های\s*متداول|سوالات\s*پرتکرار/;

/** ۵ پرسش/پاسخ: ۲ مشتق از عنوان/کلیدواژهٔ مقاله + ۳ عمومیِ واقعی و مرتبط */
function buildFaqBlock(title: string, focusKeyword: string | null): string {
  const kw = (focusKeyword || "").trim() || title.replace(/[؟?].*$/, "").trim();
  const q = (question: string, answer: string) => `<h3>${question}</h3>\n<p>${answer}</p>`;
  return [
    `<h2>سوالات متداول</h2>`,
    q(
      `${kw} چیست و چرا برای کسب‌وکار من مهم است؟`,
      `${kw} یکی از مبانی ثبت و تحلیل مالی سالم است؛ بدون آن، تصمیم‌گیری بر پایهٔ گزارش‌های ناقص انجام می‌شود. در این مقاله نکات کاربردی همین موضوع را گام‌به‌گام بررسی کرده‌ایم و می‌توانید همان روز در نرم‌افزار حسابداری ${BRAND} اجرایشان کنید.`
    ),
    q(
      `برای شروع ${kw} از کجا شروع کنم؟`,
      `ابتدا وضعیت فعلی خود را مستند کنید و سپس مطابق چک‌لیست همین مقاله، موارد را یکی‌یکی اصلاح کنید. برای ثبت و پیگیری، نسخهٔ رایگان ${BRAND} همهٔ ۱۶ ماژول را برای ۷ روز در دسترس می‌گذارد.`
    ),
    q(
      `قیمت نرم‌افزار حسابداری ${BRAND} چقدر است؟`,
      `پلن پایه ۹,۷۵۰,۰۰۰، پلن حرفه‌ای ۱۴,۹۰۰,۰۰۰ و پلن سازمانی ۳۹,۹۰۰,۰۰۰ تومان در سال است. پرداخت یکجا با ۳٪ تخفیف یا اقساط ۱ تا ۶ ماهه امکان‌پذیر است و هزینهٔ راه‌اندازی یا هزینهٔ پنهانی وجود ندارد.`
    ),
    q(
      `آیا ${BRAND} به سامانه مودیان متصل است؟`,
      `بله، ${BRAND} به‌صورت رسمی به سامانه مودیان مالیاتی متصل است. صدور، ارسال و پیگیری صورتحساب الکترونیکی نوع الف، ب و ج به‌صورت خودکار انجام می‌شود و کارپوشه نیز فعال است.`
    ),
    q(
      `دورهٔ آزمایشی ${BRAND} چگونه است؟`,
      `۷ روز رایگان با دسترسی کامل به همهٔ ماژول‌ها و بدون نیاز به کارت بانکی است. در پایان دوره می‌توانید پلن مناسب کسب‌وکار خود را انتخاب کنید یا حساب را غیرفعال بگذارید.`
    ),
  ].join("\n\n");
}

async function injectFaqs(): Promise<void> {
  console.log("\n── (ب) تزریق «سوالات متداول» به مقالات فاقد FAQ ──");
  const published = await db.blogPost.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true, title: true, focusKeyword: true, content: true },
  });
  const missing = published.filter((p) => !FAQ_PATTERN.test(p.content));
  if (missing.length === 0) {
    console.log(`  • همهٔ ${published.length.toLocaleString("fa-IR")} مقالهٔ منتشرشده FAQ دارند — چیزی تزریق نشد`);
    return;
  }
  for (const post of missing) {
    const block = buildFaqBlock(post.title, post.focusKeyword);
    // Prisma برای String فیلد append ندارد — الحاق دستی در سطح اسکریپت
    await db.blogPost.update({
      where: { slug: post.slug },
      data: { content: `${post.content}\n\n${block}` },
    });
    console.log(`  [OK] FAQ تزریق شد: ${post.slug}`);
  }
  console.log(`  ─ مجموع: ${missing.length} مقاله به‌روزرسانی شد`);
}

// ═════════════════ (ج) کانونیکال ۴ مقالهٔ هم‌نوع به پیلار خوشه ═════════════════

const CANONICAL_MAP: Array<[string, string]> = [
  ["how-to-choose-accounting-software-for-your-business", "choose-accounting-software-15-criteria"],
  ["comparing-iranian-accounting-software-hosh-vs-competitors", "choose-accounting-software-15-criteria"],
  ["cloud-accounting-software-what-is-1404", "cloud-accounting-complete-guide"],
  ["how-cloud-accounting-transforms-your-business", "cloud-accounting-complete-guide"],
];

async function setCanonicals(): Promise<void> {
  console.log("\n── (ج) کانونیکال‌سازی مقالات هم‌نوع (cannibalization) ──");
  // فیلد canonicalUrl در مدل BlogPost وجود دارد (prisma/schema.prisma)
  for (const [slug, pillarSlug] of CANONICAL_MAP) {
    const [post, pillar] = await Promise.all([
      db.blogPost.findUnique({ where: { slug }, select: { slug: true, status: true, canonicalUrl: true } }),
      db.blogPost.findUnique({ where: { slug: pillarSlug }, select: { slug: true, status: true } }),
    ]);
    if (!post) {
      console.log(`  [X] مقاله یافت نشد: ${slug}`);
      continue;
    }
    if (!pillar || pillar.status !== "PUBLISHED") {
      console.log(`  [X] پیلار منتشرشده نیست (${pillarSlug}) — کانونیکال ${slug} تنظیم نشد`);
      continue;
    }
    const canonicalUrl = `${SITE}/blog/${pillarSlug}`;
    if (post.canonicalUrl === canonicalUrl) {
      console.log(`  • ${slug}: از قبل ${canonicalUrl} — رد شد`);
      continue;
    }
    await db.blogPost.update({ where: { slug }, data: { canonicalUrl } });
    console.log(`  [OK] ${slug} → ${canonicalUrl}`);
  }
}

// ═════════════════ (د) پاکسازی فروشگاه دمو (demo-shop) ═════════════════

async function cleanupDemoShop(): Promise<void> {
  console.log("\n── (د) پاکسازی فروشگاه دمو ──");
  const shop = await db.storefront.findUnique({ where: { slug: "demo-shop" } });
  if (!shop) {
    console.log("  [X] فروشگاه demo-shop یافت نشد");
    return;
  }

  const data: Record<string, string> = {};
  const NEW_TITLE = "فروشگاه نمونه افق پلاس";
  const NEW_SEO_TITLE =
    "خرید آنلاین از فروشگاه نمونه افق پلاس — پیش‌نمایش فروشگاه متصل به حسابداری";
  const NEW_SEO_DESC =
    "پیش‌نمایش فروشگاه آنلاین افق پلاس؛ کالاها مستقیم از نرم‌افزار حسابداری خوانده می‌شوند و سفارش با پرداخت امن کارت‌به‌کارت، خودکار در گردش حساب ثبت می‌شود.";
  const NEW_DESC =
    "فروشگاه نمونه برای پیش‌نمایش فروشگاه آنلاین متصل به حسابداری افق پلاس — سفارش، پرداخت امن و ثبت خودکار در گردش حساب.";

  if (shop.title !== NEW_TITLE) data.title = NEW_TITLE;
  if ((shop.seoTitle || "") !== NEW_SEO_TITLE) data.seoTitle = NEW_SEO_TITLE;
  if ((shop.seoDescription || "") !== NEW_SEO_DESC) data.seoDescription = NEW_SEO_DESC;
  if ((shop.description || "") !== NEW_DESC) data.description = NEW_DESC;

  // رشته‌های «تست QA» یا «هوش» مستقل در JSON محتوا (اگر وجود داشته باشد)
  if (shop.content) {
    let content = shop.content;
    const before = content;
    content = content
      .replace(/تست\s*QA/g, "فروشگاه نمونه")
      // «هوش» مستقل — نه «هوش مصنوعی»/«هوشمند» (مرز حروف فارسی)
      .replace(/(^|[^\u0600-\u06FF\u200C])هوش(?=$|[^\u0600-\u06FF\u200C])/g, `$1${BRAND}`);
    if (content !== before) {
      // اعتبارسنجی JSON قبل از ذخیره — اگر خراب شد، ذخیره نکن
      try {
        JSON.parse(content);
        data.content = content;
        console.log("  [OK] رشته‌های «تست QA»/«هوش» در content JSON اصلاح شد");
      } catch {
        console.log("  [X] JSON پس از جایگزینی نامعتبر شد — content دست‌نخورده ماند");
      }
    }
  }

  if (Object.keys(data).length === 0) {
    console.log("  • فروشگاه دمو از قبل پاک است — چیزی تغییر نکرد");
    return;
  }
  await db.storefront.update({ where: { slug: "demo-shop" }, data });
  console.log(`  [OK] به‌روزرسانی شد: ${Object.keys(data).join("، ")}`);
  console.log(`    title: «${data.title || shop.title}»`);
  console.log(`    seoTitle: «${data.seoTitle || shop.seoTitle}»`);
}

// ═════════════════ اجرا ═════════════════

(async () => {
  console.log(`v20-seo-fixes — ${new Date().toISOString()}`);
  console.log(`DB: ${process.env.DATABASE_URL}`);
  await publishLinkedDrafts();
  await injectFaqs();
  await setCanonicals();
  await cleanupDemoShop();

  // خلاصهٔ نهایی
  const [published, drafts] = await Promise.all([
    db.blogPost.count({ where: { status: "PUBLISHED" } }),
    db.blogPost.count({ where: { status: "DRAFT" } }),
  ]);
  console.log("\n═══ خلاصه ═══");
  console.log(`  مقالات منتشرشده: ${published} | پیش‌نویس باقی: ${drafts}`);
  await db.$disconnect();
})().catch(async (err) => {
  console.error("خطای اسکریپت:", err);
  await db.$disconnect();
  process.exit(1);
});
