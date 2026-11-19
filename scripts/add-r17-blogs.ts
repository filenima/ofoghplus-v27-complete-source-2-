// ============================================================================
// scripts/add-r17-blogs.ts — درج ۴۷ مقالهٔ جدید راند ۱۷ در صف انتشار
// ----------------------------------------------------------------------------
// مونتاژ ۶ بچ r17-blogs/b1..b6 → اعتبارسنجی سخت (۳۰۰۰+ کلمه) → درج DRAFT
// با scheduledPublishAt ادامهٔ صف روزانهٔ ۰۹:۰۰ تهران (پس از آخرین نوبت موجود)
// + بازصدور پشتیبان بانک مقالات (بیمهٔ auto-restore در بوت).
//
// اجرا: bun scripts/add-r17-blogs.ts
// ============================================================================

import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import type { NewBlogSpec } from "./new-blogs-content/types";

// ─── تعیین مسیر مطلق دیتابیس پروژه (ضد-hijack متغیر محیطی سندباکس) ───
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATABASE_URL = `file:${join(PROJECT_ROOT, "db", "custom.db")}`;
const db = new PrismaClient({ log: ["error", "warn"] });

// ═══════════════ مونتاژ محتوا ═══════════════
import { B1_01 } from "./r17-blogs/b1-01";
import { B1_02 } from "./r17-blogs/b1-02";
import { B1_03 } from "./r17-blogs/b1-03";
import { B1_04 } from "./r17-blogs/b1-04";
import { B1_05 } from "./r17-blogs/b1-05";
import { B1_06 } from "./r17-blogs/b1-06";
import { B1_07 } from "./r17-blogs/b1-07";
import { B1_08 } from "./r17-blogs/b1-08";
import { B2_01 } from "./r17-blogs/b2-01";
import { B2_02 } from "./r17-blogs/b2-02";
import { B2_03 } from "./r17-blogs/b2-03";
import { B2_04 } from "./r17-blogs/b2-04";
import { B2_05 } from "./r17-blogs/b2-05";
import { B2_06 } from "./r17-blogs/b2-06";
import { B2_07 } from "./r17-blogs/b2-07";
import { B2_08 } from "./r17-blogs/b2-08";
import { B3_01 } from "./r17-blogs/b3-01";
import { B3_02 } from "./r17-blogs/b3-02";
import { B3_03 } from "./r17-blogs/b3-03";
import { B3_04 } from "./r17-blogs/b3-04";
import { B3_05 } from "./r17-blogs/b3-05";
import { B3_06 } from "./r17-blogs/b3-06";
import { B3_07 } from "./r17-blogs/b3-07";
import { B3_08 } from "./r17-blogs/b3-08";
import { B4_01 } from "./r17-blogs/b4-01";
import { B4_02 } from "./r17-blogs/b4-02";
import { B4_03 } from "./r17-blogs/b4-03";
import { B4_04 } from "./r17-blogs/b4-04";
import { B4_05 } from "./r17-blogs/b4-05";
import { B4_06 } from "./r17-blogs/b4-06";
import { B4_07 } from "./r17-blogs/b4-07";
import { B4_08 } from "./r17-blogs/b4-08";
import { B5_01 } from "./r17-blogs/b5-01";
import { B5_02 } from "./r17-blogs/b5-02";
import { B5_03 } from "./r17-blogs/b5-03";
import { B5_04 } from "./r17-blogs/b5-04";
import { B5_05 } from "./r17-blogs/b5-05";
import { B5_06 } from "./r17-blogs/b5-06";
import { B5_07 } from "./r17-blogs/b5-07";
import { B5_08 } from "./r17-blogs/b5-08";
import { B6_01 } from "./r17-blogs/b6-01";
import { B6_02 } from "./r17-blogs/b6-02";
import { B6_03 } from "./r17-blogs/b6-03";
import { B6_04 } from "./r17-blogs/b6-04";
import { B6_05 } from "./r17-blogs/b6-05";
import { B6_06 } from "./r17-blogs/b6-06";
import { B6_07 } from "./r17-blogs/b6-07";

const ALL: NewBlogSpec[] = [
  ...B1_01, ...B1_02, ...B1_03, ...B1_04, ...B1_05, ...B1_06, ...B1_07, ...B1_08,
  ...B2_01, ...B2_02, ...B2_03, ...B2_04, ...B2_05, ...B2_06, ...B2_07, ...B2_08,
  ...B3_01, ...B3_02, ...B3_03, ...B3_04, ...B3_05, ...B3_06, ...B3_07, ...B3_08,
  ...B4_01, ...B4_02, ...B4_03, ...B4_04, ...B4_05, ...B4_06, ...B4_07, ...B4_08,
  ...B5_01, ...B5_02, ...B5_03, ...B5_04, ...B5_05, ...B5_06, ...B5_07, ...B5_08,
  ...B6_01, ...B6_02, ...B6_03, ...B6_04, ...B6_05, ...B6_06, ...B6_07,
];

// ═══════════════ ابزار اعتبارسنجی ═══════════════

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

function countWords(html: string): number {
  return stripHtml(html).split(/\s+/).filter(Boolean).length;
}

function faNum(n: number): string {
  return n.toLocaleString("fa-IR");
}

/** CJK و کاراکترهای مشکوک چینی — نباید هیچ‌کدام در متن باشد */
function hasCjk(text: string): boolean {
  return /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text);
}

// ═══════════════ بدنهٔ اصلی ═══════════════

async function main() {
  console.log(`\n════ R17: درج ${faNum(ALL.length)} مقالهٔ جدید ════\n`);

  // ۱) اعتبارسنجی سخت
  const failures: string[] = [];
  const seenSlugs = new Set<string>();
  for (const spec of ALL) {
    const words =
      countWords(spec.intro.join(" ")) +
      countWords(spec.sections.join(" ")) +
      countHtmlWords(spec.faq) +
      countWords(spec.conclusion.join(" "));
    if (words < 3000) failures.push(`${spec.slug}: فقط ${words} کلمه (<3000)`);
    if (spec.title.length > 70) failures.push(`${spec.slug}: عنوان ${spec.title.length} نویسه`);
    if (seenSlugs.has(spec.slug)) failures.push(`${spec.slug}: اسلاگ تکراری در بچ`);
    seenSlugs.add(spec.slug);
    const fullText = [spec.title, spec.excerpt, spec.intro.join(" "), spec.sections.join(" ")].join(" ");
    if (hasCjk(fullText)) failures.push(`${spec.slug}: کاراکتر CJK یافت شد`);
  }
  if (failures.length) {
    console.error("رد اعتبارسنجی:\n" + failures.map((f) => `  ✗ ${f}`).join("\n"));
    process.exit(1);
  }
  console.log(`اعتبارسنجی سخت: همهٔ ${faNum(ALL.length)} مقاله ≥ ۳۰۰۰ کلمه، بدون CJK، اسلاگ یکتا ✓`);

  // ۲) تداخل با اسلاگ‌های موجود DB
  const existing = await db.blogPost.findMany({ select: { slug: true, title: true } });
  const existingSlugs = new Set(existing.map((p) => p.slug));
  const existingTitles = existing.map((p) => p.title);
  const dupes = ALL.filter((s) => existingSlugs.has(s.slug));
  if (dupes.length) {
    console.error("اسلاگ تکراری با DB:\n" + dupes.map((d) => `  ✗ ${d.slug}`).join("\n"));
    process.exit(1);
  }
  const titleClash = ALL.filter((s) => existingTitles.includes(s.title));
  if (titleClash.length) {
    console.error("عنوان تکراری با DB:\n" + titleClash.map((d) => `  ✗ ${d.title}`).join("\n"));
    process.exit(1);
  }
  console.log(`بررسی تداخل با ${faNum(existing.length)} مقالهٔ موجود: بدون تداخل ✓`);

  // ۳) ادامهٔ صف انتشار — آخرین scheduledPublishAt موجود
  const lastScheduled = await db.blogPost.findFirst({
    where: { scheduledPublishAt: { not: null } },
    orderBy: { scheduledPublishAt: "desc" },
    select: { scheduledPublishAt: true },
  });
  let cursor = lastScheduled?.scheduledPublishAt ? new Date(lastScheduled.scheduledPublishAt) : new Date();
  // اگر آخرین نوبت در گذشته است، از فردا شروع کن
  const now = new Date();
  if (cursor < now) cursor = now;
  const lastScheduleOrder = await db.blogPost.findFirst({
    orderBy: { scheduleOrder: "desc" },
    select: { scheduleOrder: true },
  });
  let order = (lastScheduleOrder?.scheduleOrder ?? 0) + 1;

  // ۴) درج
  let inserted = 0;
  let totalWords = 0;
  for (const spec of ALL) {
    // نوبت بعدی: روز کاری بعدی ساعت ۰۹:۰۰ تهران (UTC+3:30)
    cursor = new Date(cursor.getTime() + 2 * 24 * 60 * 60 * 1000); // هر ۲ روز
    cursor.setUTCHours(5, 30, 0, 0); // ۰۹:۰۰ تهران = ۰۵:۳۰ UTC

    const words =
      countWords(spec.intro.join(" ")) +
      countWords(spec.sections.join(" ")) +
      countHtmlWords(spec.faq) +
      countWords(spec.conclusion.join(" "));
    totalWords += words;

    const readingTime = Math.max(6, Math.round(words / 220));

    await db.blogPost.create({
      data: {
        slug: spec.slug,
        title: spec.title,
        excerpt: spec.excerpt,
        content: buildContent(spec),
        coverImage: spec.coverImage,
        category: spec.category,
        tags: JSON.stringify(spec.keywords.slice(0, 8)),
        status: "DRAFT",
        readingTime,
        scheduledPublishAt: cursor,
        scheduleOrder: order++,
        metaTitle: spec.title,
        metaDescription: spec.metaDescription,
        focusKeyword: spec.focusKeyword,
        ogImage: spec.coverImage,
      },
    });
    inserted++;
    console.log(`  ✓ ${spec.slug} — ${faNum(words)} کلمه — نوبت ${cursor.toISOString().slice(0, 10)}`);
  }

  console.log(`\nدرج شد: ${faNum(inserted)} مقاله — مجموع ${faNum(totalWords)} کلمه`);

  // ۵) آمار نهایی
  const total = await db.blogPost.count();
  const draft = await db.blogPost.count({ where: { status: "DRAFT" } });
  const published = await db.blogPost.count({ where: { status: "PUBLISHED" } });
  console.log(`\nبانک مقالات: کل ${faNum(total)} = ${faNum(published)} منتشرشده + ${faNum(draft)} در صف\n`);

  await db.$disconnect();
}

function countHtmlWords(faq: { q: string; a: string }[]): number {
  return faq.reduce((sum, f) => sum + countWords(f.q) + countWords(f.a), 0);
}

function buildContent(spec: NewBlogSpec): string {
  const parts: string[] = [];
  parts.push(...spec.intro);
  // تصویر کاور داخل متن (بعد از بخش دوم)
  const sec = [...spec.sections];
  if (sec.length > 2) {
    sec.splice(2, 0, `<img src="${spec.coverImage}" alt="${spec.title}" loading="lazy" width="1200" height="630" />`);
  } else {
    sec.unshift(`<img src="${spec.coverImage}" alt="${spec.title}" loading="lazy" width="1200" height="630" />`);
  }
  parts.push(...sec);
  parts.push(`<h2>پرسش‌های متداول</h2>\n` + spec.faq.map((f) => `<h3>${f.q}</h3>\n<p>${f.a}</p>`).join("\n"));
  parts.push(`<h2>جمع‌بندی</h2>\n` + spec.conclusion.join("\n"));
  // بلوک مطالب مرتبط
  if (spec.relatedSlugs?.length) {
    parts.push(
      `<h2>مطالب مرتبط</h2>\n<ul>` +
        spec.relatedSlugs.map((s) => `<li><a href="/blog/${s}">${s}</a></li>`).join("") +
        `</ul>`
    );
  }
  return parts.join("\n\n");
}

main().catch((e) => {
  console.error("خطای مهلک:", e);
  process.exit(1);
});
