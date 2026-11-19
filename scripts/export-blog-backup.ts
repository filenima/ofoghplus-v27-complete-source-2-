// ============================================================================
// scripts/export-blog-backup.ts — پشتیبان bundled بانک مقالات بلاگ (R14-B)
// ----------------------------------------------------------------------------
// مشکل مالک: روی سرور لایو، پنل «مدیریت بلاگ» سوپرادمین خالی بود — DB تازهٔ
// استقرار (prisma db push) هیچ مقاله‌ای نداشت. این اسکریپت «بیمهٔ» بانک
// مقالات است: همهٔ ردیف‌های BlogPost را به یک فایل JSON فشرده در
// db/blog-backup.json.gz می‌نویسد که همراه سورس منتشر می‌شود؛ API بازگردانی
// (POST /api/platform/blog/restore) با یک کلیک از همان فایل، مقالات را
// upsert می‌کند (کلید idempotency = slug).
//
// اجرا (هر بار پس از تغییر/افزایش معنادار بانک مقالات):
//   bun scripts/export-blog-backup.ts
//
// خروجی:
//   db/blog-backup.json.gz  —  { version, exportedAt, count, posts: [...] }
//   (همهٔ ستون‌های BlogPost؛ id داخلی صرفاً برای مرجع — در بازگردانی
//    id جدید تولید می‌شود و slug مبنای یکتایی است)
//
// بعد از نوشتن، round-trip تایید می‌شود: فایل gunzip + parse + شمارش؛
// اگر هر مرحله شکست بخورد exit code = 1.
// ============================================================================

import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { gzipSync } from "zlib";
import { writeFileSync, readFileSync, existsSync, statSync } from "fs";
import { PrismaClient } from "@prisma/client";

// ─── تعیین مسیر مطلق دیتابیس پروژه (ضد-hijack متغیر محیطی سندباکس) ───
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORCED_DB_URL = `file:${join(PROJECT_ROOT, "db", "custom.db")}`;
process.env.DATABASE_URL = FORCED_DB_URL;

const prisma = new PrismaClient({ log: ["error", "warn"] });
const OUT_PATH = join(PROJECT_ROOT, "db", "blog-backup.json.gz");

interface BackupPost {
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  category: string;
  tags: string | null;
  status: string;
  publishedAt: string | null;
  readingTime: number;
  scheduledPublishAt: string | null;
  scheduleOrder: number | null;
  metaTitle: string | null;
  metaDescription: string | null;
  focusKeyword: string | null;
  ogImage: string | null;
  canonicalUrl: string | null;
  authorId: string | null;
  createdAt: string;
  updatedAt: string;
}

async function main() {
  console.log("== export-blog-backup: پشتیبان بانک مقالات ==");
  console.log("DB:", FORCED_DB_URL);

  const rows = await prisma.blogPost.findMany({
    orderBy: { createdAt: "asc" },
  });
  console.log(`کل مقالات: ${rows.length}`);

  if (rows.length === 0) {
    console.error("✗ بانک مقالات خالی است — پشتیبان جدیدی نوشته نشد (فایل قبلی حفظ شد).");
    process.exitCode = 1;
    return;
  }

  const posts: BackupPost[] = rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    content: r.content,
    coverImage: r.coverImage,
    category: r.category,
    tags: r.tags,
    status: r.status,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    readingTime: r.readingTime,
    scheduledPublishAt: r.scheduledPublishAt ? r.scheduledPublishAt.toISOString() : null,
    scheduleOrder: r.scheduleOrder,
    metaTitle: r.metaTitle,
    metaDescription: r.metaDescription,
    focusKeyword: r.focusKeyword,
    ogImage: r.ogImage,
    canonicalUrl: r.canonicalUrl,
    authorId: r.authorId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  // یکتایی slug (کلید idempotency بازگردانی)
  const slugs = new Set(posts.map((p) => p.slug));
  if (slugs.size !== posts.length) {
    console.error(`✗ slug تکراری در بانک (${posts.length - slugs.size} مورد) — ابتدا رفع شود.`);
    process.exitCode = 1;
    return;
  }

  const byStatus = posts.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  const payload = JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    count: posts.length,
    posts,
  });

  const gz = gzipSync(Buffer.from(payload, "utf8"), { level: 9 });
  writeFileSync(OUT_PATH, gz);

  const kb = (statSync(OUT_PATH).size / 1024).toFixed(1);
  console.log(`✓ نوشته شد: ${OUT_PATH} (${kb} KB — بدون فشرده‌سازی ${(payload.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`   وضعیت‌ها: ${JSON.stringify(byStatus)}`);

  // ─── Round-trip verification — همان مسیری که API بازگردانی می‌رود ───
  if (!existsSync(OUT_PATH)) {
    console.error("✗ فایل پشتیبان بعد از نوشتن پیدا نشد!");
    process.exitCode = 1;
    return;
  }
  const { gunzipSync } = await import("zlib");
  const raw = gunzipSync(readFileSync(OUT_PATH)).toString("utf8");
  const parsed = JSON.parse(raw) as { count: number; posts: BackupPost[] };
  if (parsed.count !== posts.length || parsed.posts.length !== posts.length) {
    console.error(`✗ round-trip ناموفق: count=${parsed.count} posts=${parsed.posts.length} expected=${posts.length}`);
    process.exitCode = 1;
    return;
  }
  const sample = parsed.posts[Math.floor(parsed.posts.length / 2)];
  if (!sample?.slug || typeof sample.content !== "string" || sample.content.length < 50) {
    console.error("✗ round-trip ناموفق: رکورد نمونه خراب است.");
    process.exitCode = 1;
    return;
  }
  console.log(`✓ round-trip تایید شد: ${parsed.posts.length} مقاله، نمونهٔ «${sample.slug}» (${(sample.content.length / 1024).toFixed(0)}KB محتوا)`);
}

main()
  .catch((err) => {
    console.error("خطا در تهیهٔ پشتیبان بلاگ:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
