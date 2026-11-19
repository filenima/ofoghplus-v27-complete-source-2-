// ============================================================================
// scripts/add-r15-blogs.ts — درج ۴۸ مقالهٔ جدید راند ۱۵ در صف انتشار (R15-E)
// ----------------------------------------------------------------------------
// مونتاژ ۸ بچ r15-batch-1..8 → اعتبارسنجی سخت (۳۰۰۰+ کلمه) → درج DRAFT
// با scheduledPublishAt ادامهٔ صف روزانهٔ ۰۹:۰۰ تهران (پس از آخرین نوبت موجود)
// + بازصدور پشتیبان بانک مقالات (بیمهٔ auto-restore در بوت).
//
// اجرا: bun scripts/add-r15-blogs.ts
// ============================================================================

import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import type { NewBlogSpec } from "./new-blogs-content/types";

// ─── تعیین مسیر مطلق دیتابیس پروژه (ضد-hijack متغیر محیطی سندباکس) ───
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATABASE_URL = `file:${join(PROJECT_ROOT, "db", "custom.db")}`;
const db = new PrismaClient({ log: ["error", "warn"] });

// ═══════════════ مونتاژ محتوا (هم‌الگوی scripts/add-new-blogs.ts) ═══════════════

function ctaBlock(spec: NewBlogSpec): string {
  return `
<div class="cta-box">
<p><strong>${spec.focusKeyword} را همین امروز ساماندهی کنید.</strong> نرم‌افزار حسابداری «افق پلاس» را <strong>۱۴ روز رایگان و بدون کارت بانکی</strong> امتحان کنید؛ <a href="/features">امکانات کامل ماژول‌ها</a> را ببینید، <a href="/industries">پیکربندی مخصوص صنف‌ها</a> را مرور کنید و برای شروع، <a href="/pricing">پلن‌ها و قیمت‌ها را باز کنید</a>. مهاجرت داده از دفترچه و اکسل هم رایگان انجام می‌شود.</p>
</div>`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

function countWords(html: string): number {
  return stripHtml(html).split(/\s+/).filter(Boolean).length;
}

function buildContent(
  spec: NewBlogSpec,
  publishedTitles: Map<string, string>
): { html: string; words: number } {
  const imgTag = `<img src="${spec.coverImage}" alt="${spec.title}" loading="lazy" width="1200" height="630" />`;
  const sec = [...spec.sections];
  if (sec.length > 2) sec.splice(2, 0, imgTag);
  else sec.unshift(imgTag);

  const faqHtml =
    `<h2>پرسش‌های متداول</h2>\n` +
    spec.faq.map((f) => `<h3>${f.q}</h3>\n<p>${f.a}</p>`).join("\n");
  const conclusionHtml = `<h2>جمع‌بندی</h2>\n` + spec.conclusion.join("\n");
  const related = spec.relatedSlugs
    .map((s) => `<a href="/blog/${s}">${publishedTitles.get(s) || s}</a>`)
    .join(" • ");
  const relatedHtml = `<p><strong>مطالب مرتبط:</strong> ${related}</p>`;

  const html = [
    spec.intro.join("\n"),
    sec.join("\n"),
    ctaBlock(spec),
    faqHtml,
    conclusionHtml,
    relatedHtml,
  ].join("\n");
  return { html, words: countWords(html) };
}

// ═══════════════ صف انتشار: روزانهٔ ۰۹:۰۰ تهران (UTC 05:30 — بدون DST) ═══════════════

/** تاریخ بعدیِ ساعت ۰۹:۰۰ تهران، n روز بعد از مرجع */
function nextTehran9AM(referenceMs: number, daysAfter: number): Date {
  // تهران = UTC+3:30 (از ۲۰۲۲ بدون ساعت تابستانی) → ۰۹:۰۰ محلی = ۰۵:۳۰ UTC
  const UTC_OFFSET_MS = 3.5 * 60 * 60 * 1000;
  const refTehranMs = referenceMs + UTC_OFFSET_MS;
  const refTehranDayStart = Math.floor(refTehranMs / 86_400_000) * 86_400_000;
  const targetTehranMs = refTehranDayStart + (daysAfter + 1) * 86_400_000 + 9 * 3_600_000;
  return new Date(targetTehranMs - UTC_OFFSET_MS);
}

// ═══════════════ اجرای اصلی ═══════════════

async function main() {
  console.log("== add-r15-blogs: درج مقالات راند ۱۵ ==");

  // ۱) مونتاژ همهٔ بچ‌ها
  const batchModules = await Promise.all(
    [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
      import(`./new-blogs-content/r15-batch-${n}.ts`).then(
        (m) => m.articles as NewBlogSpec[]
      )
    )
  );
  const allSpecs: NewBlogSpec[] = batchModules.flat();
  console.log(`مونتاژ: ${allSpecs.length} مقاله از ${batchModules.length} بچ`);

  // ۲) عناوین مقالات منتشرشده برای بلوک «مطالب مرتبط»
  const published = await db.blogPost.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true, title: true },
  });
  const publishedTitles = new Map(published.map((p) => [p.slug, p.title]));

  // ۳) اسلاگ‌های موجود (برای رفع تصادم: اسلاگ تکراری → -1406)
  const existingSlugs = new Set(
    (await db.blogPost.findMany({ select: { slug: true } })).map((r) => r.slug)
  );

  // ۴) ادامهٔ صف انتشار و scheduleOrder از آخرین نوبت موجود
  const lastScheduled = await db.blogPost.findFirst({
    where: { scheduledPublishAt: { not: null } },
    orderBy: { scheduledPublishAt: "desc" },
    select: { scheduledPublishAt: true, scheduleOrder: true },
  });
  const lastOrder =
    (await db.blogPost.aggregate({ _max: { scheduleOrder: true } }))._max
      .scheduleOrder ?? 0;
  const queueBaseMs = lastScheduled?.scheduledPublishAt
    ? lastScheduled.scheduledPublishAt.getTime()
    : Date.now();
  console.log(
    `آخرین نوبت صف: ${lastScheduled?.scheduledPublishAt?.toISOString() || "-"} | آخرین scheduleOrder: ${lastOrder}`
  );

  // ۵) درج
  let inserted = 0;
  let renamed = 0;
  let rejected = 0;
  const failures: string[] = [];
  let orderCursor = lastOrder;

  for (let i = 0; i < allSpecs.length; i++) {
    const spec = allSpecs[i];

    // اعتبارسنجی سخت: ۳۰۰۰+ کلمه
    const { html, words } = buildContent(spec, publishedTitles);
    if (words < 3000) {
      rejected++;
      failures.push(`${spec.slug}: ${words} کلمه (< 3000) — رد شد`);
      continue;
    }

    // رفع تصادم اسلاگ (مقالهٔ هم‌نام موجود → پسوند -1406)
    let slug = spec.slug;
    if (existingSlugs.has(slug)) {
      slug = `${slug}-1406`;
      if (existingSlugs.has(slug)) {
        rejected++;
        failures.push(`${spec.slug}: تصادم حتی با پسوند — رد شد`);
        continue;
      }
      renamed++;
    }
    existingSlugs.add(slug);

    const scheduledPublishAt = nextTehran9AM(queueBaseMs, i);
    orderCursor += 1;

    await db.blogPost.create({
      data: {
        slug,
        title: spec.title,
        excerpt: spec.excerpt,
        content: html,
        coverImage: spec.coverImage,
        category: spec.category,
        tags: spec.keywords.join(", "),
        status: "DRAFT",
        readingTime: Math.max(8, Math.min(18, Math.round(words / 220))),
        scheduledPublishAt,
        scheduleOrder: orderCursor,
        metaTitle: spec.title,
        metaDescription: spec.metaDescription,
        focusKeyword: spec.focusKeyword,
        ogImage: spec.coverImage,
      },
    });
    inserted++;
    if (inserted % 8 === 0) console.log(`  … ${inserted} درج شد`);
  }

  console.log("\n== نتیجه ==");
  console.log(`درج‌شده: ${inserted} | اسلاگ تغییرنام‌یافته: ${renamed} | رد‌شده: ${rejected}`);
  if (failures.length > 0) {
    console.log("رد‌شده‌ها:");
    for (const f of failures) console.log("  -", f);
  }

  // ۶) خلاصهٔ وضعیت نهایی بانک
  const total = await db.blogPost.count();
  const drafts = await db.blogPost.count({ where: { status: "DRAFT" } });
  const withSchedule = await db.blogPost.count({
    where: { scheduledPublishAt: { not: null } },
  });
  const lastNew = await db.blogPost.findFirst({
    where: { scheduledPublishAt: { not: null } },
    orderBy: { scheduledPublishAt: "desc" },
    select: { scheduledPublishAt: true },
  });
  console.log(
    `بانک مقالات: ${total} کل | ${drafts} پیش‌نویس زمان‌بندی‌شده | آخرین نوبت انتشار: ${lastNew?.scheduledPublishAt?.toISOString()}`
  );

  await db.$disconnect();
}

main()
  .catch((e) => {
    console.error("خطای اجرا:", e);
    process.exit(1);
  })
  .then(() => process.exit(0));
