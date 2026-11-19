// ============================================================================
// lib/blog-auto-restore.ts — بیمهٔ خودکار بانک مقالات بلاگ (R15-B)
// ----------------------------------------------------------------------------
// مشکل مالک (سه راند پیاپی): «مدیریت وبلاگ خالی است — هیچ وبلاگی، حتی
// پیش‌نویس نیست». ریشه: روی استقرارِ تازه (DB خالی یا DB با WAL جدانشده)
// جدول BlogPost خالی است. راه‌حل‌های قبلی (دکمهٔ بازگردانی دستی) کافی
// نبود چون کاربر باید پیدایش می‌کرد.
//
// این ماژول در «بوت سرور» (instrumentation.ts) صدا زده می‌شود: اگر جدول
// مقالات خالی بود و فایل پشتیبان bundled (db/blog-backup.json.gz) موجود
// بود، همهٔ مقالات به‌صورت خودکار upsert می‌شوند (کلید idempotency = slug).
// نتیجه: هیچ استقراری هرگز پنل بلاگ خالی ندارد — حتی DB تازه.
//
// ایمنی:
//  - فقط وقتی count === 0 می‌نویسد (دادهٔ واقعی هرگز دیده نمی‌شود)
//  - خطا هرگز بوت را نمی‌شکند (try/catch کامل)
//  - قفل فایل ساده برای جلوگیری از اجرای موازی در dev (HMR)
// ============================================================================

import { join } from "path";
import { gunzipSync } from "zlib";
import { readFileSync, existsSync, statSync, writeFileSync, unlinkSync } from "fs";

interface BackupPost {
  slug: string;
  title: string;
  excerpt?: string | null;
  content: string;
  coverImage?: string | null;
  category: string;
  tags?: string | null;
  status?: string;
  publishedAt?: string | null;
  readingTime?: number;
  scheduledPublishAt?: string | null;
  scheduleOrder?: number | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  focusKeyword?: string | null;
  ogImage?: string | null;
  canonicalUrl?: string | null;
  authorId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

function toNullOrDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

let restorePromise: Promise<{ restored: number; skipped: boolean; error?: string }> | null = null;

/**
 * اجرای یک‌بار به‌ازای پروسه (idempotent درون‌پروسه‌ای).
 * خروجی برای لاگ/گزارش: { restored, skipped, error? }
 */
export function blogAutoRestore(): Promise<{ restored: number; skipped: boolean; error?: string }> {
  if (!restorePromise) {
    restorePromise = doRestore().catch((e: unknown) => ({
      restored: 0,
      skipped: true,
      error: e instanceof Error ? e.message : String(e),
    }));
  }
  return restorePromise;
}

async function doRestore(): Promise<{ restored: number; skipped: boolean; error?: string }> {
  const lockPath = join(process.cwd(), "db", ".blog-autorestore.lock");

  // قفل پروسه‌ای — در dev (چند worker) از import موازی جلوگیری می‌کند
  try {
    if (existsSync(lockPath)) {
      const age = Date.now() - statSync(lockPath).mtimeMs;
      // قفل تازهٔ پروسهٔ زندهٔ دیگر → صرفاً skip (همان کار را انجام می‌دهد)
      if (age < 60_000) return { restored: 0, skipped: true };
    }
    writeFileSync(lockPath, String(Date.now()));
  } catch {
    /* fs فقط‌خواندنی — ادامه بدون قفل */
  }

  try {
    // دیتابیس مستقل (نه import مسیر اپ — ضد چرخه در زمان بوت)
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient({ log: ["error"] });

    let count = 0;
    try {
      count = await db.blogPost.count();
    } catch {
      // جدول هنوز ساخته نشده (prisma db push اجرا نشده) — هیچ کاری نکن
      return { restored: 0, skipped: true, error: "BlogPost table missing" };
    }

    // بانک پر است — هیچ نوشتنی لازم نیست (دادهٔ واقعی دست نمی‌خورد)
    if (count > 0) {
      return { restored: 0, skipped: true };
    }

    // خواندن پشتیبان bundled
    const backupPath = join(process.cwd(), "db", "blog-backup.json.gz");
    if (!existsSync(backupPath) || statSync(backupPath).size === 0) {
      return { restored: 0, skipped: true, error: "backup file missing" };
    }
    const raw = gunzipSync(readFileSync(backupPath)).toString("utf8");
    const parsed = JSON.parse(raw) as { posts?: BackupPost[]; count?: number };
    if (!Array.isArray(parsed.posts) || parsed.posts.length === 0) {
      return { restored: 0, skipped: true, error: "backup empty" };
    }

    // Upsert بر اساس slug — همان منطق /api/platform/blog/restore
    let created = 0;
    let failed = 0;
    for (const post of parsed.posts) {
      if (!post?.slug || !post?.title || !post?.content) {
        failed++;
        continue;
      }
      try {
        await db.blogPost.upsert({
          where: { slug: post.slug },
          create: {
            slug: post.slug,
            title: post.title,
            excerpt: post.excerpt ?? null,
            content: post.content,
            coverImage: post.coverImage ?? null,
            category: post.category || "عمومی",
            tags: post.tags ?? null,
            status: post.status || "PUBLISHED",
            publishedAt: toNullOrDate(post.publishedAt),
            readingTime: Number(post.readingTime) || 7,
            scheduledPublishAt: toNullOrDate(post.scheduledPublishAt),
            scheduleOrder:
              post.scheduleOrder === null || post.scheduleOrder === undefined
                ? null
                : Number(post.scheduleOrder),
            metaTitle: post.metaTitle ?? null,
            metaDescription: post.metaDescription ?? null,
            focusKeyword: post.focusKeyword ?? null,
            ogImage: post.ogImage ?? null,
            canonicalUrl: post.canonicalUrl ?? null,
            createdAt: toNullOrDate(post.createdAt) ?? new Date(),
            updatedAt: new Date(),
          },
          update: {
            // در حالت count===0 این شاخه اجرا نمی‌شود — برای اطمینان خالی است
          },
        });
        created++;
      } catch {
        failed++;
      }
    }

    console.info(
      `[blog-auto-restore] بانک مقالات خالی بود — ${created} مقاله از پشتیبان bundled بازگردانی شد` +
        (failed > 0 ? ` (${failed} ردیف خطا)` : "")
    );
    return { restored: created, skipped: false };
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
  }
}
