import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import { gunzipSync } from "zlib";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { cacheDeleteByPrefix } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/platform/blog/restore — بازگردانی بانک مقالات از پشتیبان bundled (R14-B)
 * ----------------------------------------------------------------------------
 * بیمهٔ استقرار: اگر DB تازهٔ سرور لایو خالی بود (مثلاً prisma db push جداول
 * خالی ساخته)، مقالات پشتیبان (db/blog-backup.json.gz — خروجی
 * scripts/export-blog-backup.ts) با یک کلیک از پنل سوپرادمین برمی‌گردند.
 *
 * body: { force?: boolean }
 *  - count > 0 و force=false (پیش‌فرض) → skip: { success, skipped: true, count }
 *    (ضد دوبرابر کردن — هیچ ردیفی نوشته نمی‌شود)
 *  - count === 0 یا force=true → خواندن gzip + gunzip + upsert هر مقاله با
 *    کلید slug (idempotent: اجرای دوباره هیچ تکراری نمی‌سازد؛ id جدید
 *    تولید می‌شود تا با ردیف‌های موجود تداخل cuid نداشته باشد)
 *
 * پاسخ: { success, skipped, count|restored, created, updated, backupCount }
 */

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

/** خواندن و رموشدن پشتیبان gzipped — همان مسیر/فرمت export-blog-backup.ts */
function readBackupFile(): { posts: BackupPost[]; exportedAt: string } {
  const candidates = [
    join(process.cwd(), "db", "blog-backup.json.gz"),
  ];
  const found = candidates.find((p) => {
    try {
      return existsSync(p) && statSync(p).isFile() && statSync(p).size > 0;
    } catch {
      return false;
    }
  });
  if (!found) {
    throw new Error("BACKUP_NOT_FOUND");
  }
  const raw = gunzipSync(readFileSync(found)).toString("utf8");
  const parsed = JSON.parse(raw) as { posts?: BackupPost[]; exportedAt?: string; count?: number };
  if (!Array.isArray(parsed.posts) || parsed.posts.length === 0) {
    throw new Error("BACKUP_EMPTY");
  }
  return { posts: parsed.posts, exportedAt: parsed.exportedAt || "" };
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const body = (await req.json().catch(() => ({}))) as { force?: boolean };
    const force = body.force === true;

    const currentCount = await db.blogPost.count();

    // مسیر skip — بانک پر است و درخواست force نیست → هیچ نوشتنی انجام نشود
    if (currentCount > 0 && !force) {
      return NextResponse.json({
        success: true,
        skipped: true,
        count: currentCount,
        message: `بانک مقالات ${currentCount} ردیف دارد — بازگردانی لازم نیست (برای بازنویسی، force را بفرستید).`,
      });
    }

    // خواندن پشتیبان
    let backup: { posts: BackupPost[]; exportedAt: string };
    try {
      backup = readBackupFile();
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "BACKUP_NOT_FOUND") {
        return NextResponse.json(
          {
            success: false,
            error:
              "فایل پشتیبان بانک مقالات (db/blog-backup.json.gz) یافت نشد — ابتدا scripts/export-blog-backup.ts را اجرا و فایل را همراه سورس منتشر کنید.",
          },
          { status: 404 }
        );
      }
      if (code === "BACKUP_EMPTY") {
        return NextResponse.json(
          { success: false, error: "فایل پشتیبان خالی است — پشتیبان معتبری وجود ندارد." },
          { status: 422 }
        );
      }
      return NextResponse.json(
        { success: false, error: "خواندن/رموشدن فایل پشتیبان ناموفق بود — فایل خراب است." },
        { status: 500 }
      );
    }

    // slugهای موجود → گزارش created vs updated
    const existingSlugs = new Set(
      (await db.blogPost.findMany({ select: { slug: true } })).map((r) => r.slug)
    );

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const post of backup.posts) {
      if (!post?.slug || !post?.title || !post?.content) {
        failed++;
        continue;
      }
      const data = {
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt ?? null,
        content: post.content,
        coverImage: post.coverImage ?? null,
        category: post.category || "ACCOUNTING",
        tags: post.tags ?? null,
        status: post.status || "DRAFT",
        publishedAt: toNullOrDate(post.publishedAt),
        readingTime: post.readingTime ?? 5,
        scheduledPublishAt: toNullOrDate(post.scheduledPublishAt),
        scheduleOrder: post.scheduleOrder ?? null,
        metaTitle: post.metaTitle ?? null,
        metaDescription: post.metaDescription ?? null,
        focusKeyword: post.focusKeyword ?? null,
        ogImage: post.ogImage ?? null,
        canonicalUrl: post.canonicalUrl ?? null,
        authorId: post.authorId ?? null,
      };
      try {
        await db.blogPost.upsert({
          where: { slug: post.slug },
          // id عمداً در create نیست — cuid جدید؛ slug مبنای idempotency است
          create: {
            ...data,
            createdAt: toNullOrDate(post.createdAt) ?? new Date(),
            updatedAt: toNullOrDate(post.updatedAt) ?? new Date(),
          },
          update: data,
        });
        if (existingSlugs.has(post.slug)) updated++;
        else created++;
      } catch (err) {
        failed++;
        if (errors.length < 5) {
          errors.push(`${post.slug}: ${err instanceof Error ? err.message : "خطا"}`);
        }
      }
    }

    // کش بلاگ عمومی را باطل کن تا مقالات بازگردانده‌شده فوراً دیده شوند
    try {
      cacheDeleteByPrefix("blog:");
    } catch {
      /* کش اختیاری است */
    }

    await db.platformAuditLog
      .create({
        data: {
          superAdminId: auth.admin.id,
          action: "BLOG_BACKUP_RESTORE",
          entity: "BlogPost",
          entityId: null,
          details: JSON.stringify({
            created,
            updated,
            failed,
            backupCount: backup.posts.length,
            force,
          }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      })
      .catch(() => {
        /* audit نباید عملیات را متوقف کند */
      });

    if (failed > 0 && created + updated === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `بازگردانی کامل شکست خورد (${failed} ردیف خطا) — ${errors.join(" | ")}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      skipped: false,
      restored: created + updated,
      created,
      updated,
      failed,
      backupCount: backup.posts.length,
      backupExportedAt: backup.exportedAt || null,
      count: await db.blogPost.count(),
      message:
        failed > 0
          ? `بازگردانی انجام شد: ${created} مقالهٔ جدید + ${updated} به‌روزرسانی — ${failed} ردیف خطا داشت.`
          : `${created} مقاله از پشتیبان بازگردانی شد${updated > 0 ? ` و ${updated} مقالهٔ موجود به‌روزرسانی شد` : ""}.`,
    });
  } catch (error) {
    console.error("Blog restore error:", error);
    return NextResponse.json(
      { success: false, error: "خطای غیرمنتظره در بازگردانی بانک مقالات" },
      { status: 500 }
    );
  }
}
