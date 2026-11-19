// ============================================================================
// lib/db-selfcheck.ts — خودشفابخشی مسیر دیتابیس در بوت (تسک 1-e)
// ----------------------------------------------------------------------------
// ریشهٔ باگ «بلاگ خالی در استقرار»: نسخهٔ منتقل‌شدهٔ پروژه با DATABASE_URL ای
// بالا می‌آمد که به دیتابیس اسکلت/خالی اشاره می‌کرد (مسیر نسبی که Prisma
// runtime آن را نسبت به پوشهٔ client تولیدشده resolve می‌کند، یا مسیر مطلقِ
// ماشین قبلی) → همهٔ کوئری‌های BlogPost صفر/خطا → پنل بلاگ و صف انتشار خالی.
//
// این ماژول در instrumentation.ts (قبل از هر درخواستی) اجرا می‌شود:
//  ۱) DATABASE_URL را «همان‌طور که Prisma می‌بیند» با یک شمارش سبک BlogPost
//     می‌سنجد (آزمون تجربی — مستقل از قواعد resolve مسیرهای نسبی).
//  ۲) اگر ناسالم بود (فایل نبود/جدول نبود/۰ مقاله) و دیتابیس واقعی پروژه
//     (db/custom.db هنگام walk-up از cwd) مقاله داشت:
//       → هشدار فارسی درشت در لاگ + اصلاح process.env.DATABASE_URL به مسیر
//         «مطلق» دیتابیس پروژه + پاک‌سازی کلاینت کش‌شدهٔ سراسری.
//  ۳) هرگز به URLهای غیر file: (postgres/mysql/…) دست نمی‌زند و اگر دیتابیس
//     env سالم بود هیچ کاری نمی‌کند.
// ============================================================================

import { existsSync, statSync } from "fs";
import { dirname, isAbsolute, join, resolve } from "path";

export interface DbSelfCheckResult {
  /** دیتابیس فعال پس از بررسی سالم است (مقاله دارد یا اصلاح شد) */
  ok: boolean;
  /** مسیر env اصلاح شد */
  fixed: boolean;
  /** DATABASE_URL اولیه */
  originalUrl: string;
  /** DATABASE_URL نهایی (پس از اصلاح احتمالی) */
  finalUrl: string;
  /** تعداد BlogPost روی URL اولیه — ۱- یعنی خطا/جدول غایب */
  originalCount: number;
  /** تعداد BlogPost روی دیتابیس پروژه — ۱- یعنی خطا/ندارد */
  projectCount: number;
  /** مسیر مطلق دیتابیس پروژه (اگر پیدا شد) */
  projectDbPath: string | null;
  /** دلیل (برای لاگ) */
  reason: string;
}

/** آیا URL یک فایل SQLite محلی است؟ (postgres/mysql/… هرگز دست نمی‌خورند) */
function isSqliteFileUrl(url: string): boolean {
  return /^file:/i.test(url);
}

/**
 * دیتابیس پروژه را پیدا می‌کند: از هر نقطهٔ شروع، حداکثر ۶ سطح بالا می‌رود
 * و اولین `db/custom.db` با حجم معقول (>۱۰۰KB — فایل خالی/خراد نه) را
 * برمی‌گرداند. برای next dev و next start پوشهٔ شروع = ریشهٔ پروژه؛ برای
 * خروجی standalone (cwd = .next/standalone) walk-up خودش ریشه را پیدا می‌کند.
 */
export function findProjectDb(startDirs: string[]): string | null {
  for (const start of startDirs) {
    let dir = resolve(start);
    for (let i = 0; i < 6; i++) {
      const candidate = join(dir, "db", "custom.db");
      if (existsSync(candidate)) {
        try {
          if (statSync(candidate).size > 100 * 1024) return candidate;
        } catch {
          /* stat خطا خورد — بعدی */
        }
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

/**
 * شمارش سبک BlogPost روی یک URL با کلاینت موقت.
 *  ۱- = خطا (فایل باز نمی‌شود/جدول وجود ندارد)؛ ۰ = خالی؛ n = سالم
 * URL همیشه همان رشته‌ای است که Prisma می‌بیند — resolve عیناً مثل کلاینت
 * واقعی انجام می‌شود، پس نتیجهٔ آزمون با رفتار اپ یکسان است.
 */
export async function countBlogPosts(url: string): Promise<number> {
  let client: { blogPost: { count(): Promise<number> }; $disconnect(): Promise<unknown> } | null =
    null;
  try {
    const { PrismaClient } = await import("@prisma/client");
    client = new PrismaClient({ datasourceUrl: url }) as unknown as {
      blogPost: { count(): Promise<number> };
      $disconnect(): Promise<unknown>;
    };
    return await client.blogPost.count();
  } catch {
    return -1;
  } finally {
    if (client) {
      try {
        await client.$disconnect();
      } catch {
        /* best-effort */
      }
    }
  }
}

/** کلاینت Prisma کش‌شدهٔ سراسری (اگر پیش از اصلاح ساخته شده) را می‌بندد */
async function resetCachedPrismaClient(): Promise<void> {
  const g = globalThis as unknown as {
    prisma?: { $disconnect?: () => Promise<unknown> };
  };
  if (g.prisma) {
    try {
      await g.prisma.$disconnect?.();
    } catch {
      /* best-effort */
    }
    delete g.prisma;
  }
}

/** هشدار فارسی درشت — در لاگ سرور غیرقابل overlooking است */
function bigPersianWarning(lines: string[]): void {
  const bar = "⚠️".repeat(24);
  console.error(`\n${bar}\n${lines.map((l) => `  ${l}`).join("\n")}\n${bar}\n`);
}

/**
 * بررسی/اصلاح DATABASE_URL — باید قبل از اولین import ماژول‌های دیتابیس
 * (در instrumentation.register) صدا زده شود.
 */
export async function ensureDatabaseUrl(): Promise<DbSelfCheckResult> {
  const originalUrl = (process.env.DATABASE_URL || "").trim();

  // ۱) URL غیر-file (postgres و…) — هرگز دست نمی‌زنیم
  if (originalUrl && !isSqliteFileUrl(originalUrl)) {
    return {
      ok: true,
      fixed: false,
      originalUrl,
      finalUrl: originalUrl,
      originalCount: -2, // خارج از دامنهٔ SQLite
      projectCount: -2,
      projectDbPath: null,
      reason: "non-sqlite URL — دست نمی‌خورد",
    };
  }

  // ۲) دیتابیس پروژه را پیدا کن (برای fallback و مقایسه)
  const startDirs = [process.cwd()];
  const projectDbPath = findProjectDb(startDirs);

  // ۳) DATABASE_URL تنظیم نشده → اگر دیتابیس پروژه هست، همان را مطلق بگذار
  if (!originalUrl) {
    if (projectDbPath) {
      process.env.DATABASE_URL = `file:${projectDbPath}`;
      console.info(
        `[db-selfcheck] DATABASE_URL نبود — به دیتابیس پروژه تنظیم شد: ${projectDbPath}`
      );
      return {
        ok: true,
        fixed: true,
        originalUrl: "(unset)",
        finalUrl: process.env.DATABASE_URL,
        originalCount: -1,
        projectCount: -1,
        projectDbPath,
        reason: "DATABASE_URL نبود — مسیر پروژه تنظیم شد",
      };
    }
    return {
      ok: false,
      fixed: false,
      originalUrl: "(unset)",
      finalUrl: "",
      originalCount: -1,
      projectCount: -1,
      projectDbPath: null,
      reason: "DATABASE_URL نبود و db/custom.db هم پیدا نشد",
    };
  }

  // ۴) آزمون تجربی همان URL — سالم است؟
  const originalCount = await countBlogPosts(originalUrl);
  if (originalCount > 0) {
    // سالم — هیچ تغییری لازم نیست
    return {
      ok: true,
      fixed: false,
      originalUrl,
      finalUrl: originalUrl,
      originalCount,
      projectCount: -2,
      projectDbPath,
      reason: "سالم",
    };
  }

  // ۵) ناسالم (خطا/جدول غایب/۰ مقاله) — دیتابیس پروژه را آزمایش کن
  // ALLOW_EMPTY_DATABASE=1 → قصد صریحِ «DB خالی می‌خواهم» — فقط هشدار، بدون اصلاح
  if (process.env.ALLOW_EMPTY_DATABASE === "1") {
    console.warn(
      `[db-selfcheck] DATABASE_URL «${originalUrl}» خالی/ناموجود است اما ALLOW_EMPTY_DATABASE=1 است — اصلاح خودکار انجام نشد.`
    );
    return {
      ok: false,
      fixed: false,
      originalUrl,
      finalUrl: originalUrl,
      originalCount,
      projectCount: -2,
      projectDbPath,
      reason: "ALLOW_EMPTY_DATABASE=1 — اصلاح خودکار غیرفعال شد",
    };
  }
  let projectCount = -1;
  if (projectDbPath) {
    projectCount = await countBlogPosts(`file:${projectDbPath}`);
  }

  if (projectDbPath && projectCount > 0) {
    // آیا عملاً همان فایل است؟ (مثلاً مسیر نسبی که درست resolve شده ولی
    // WAL/جدول ندارد — بند نادر) اگر absolute path یکی است، فقط هشدار بده.
    const rawPath = originalUrl.replace(/^file:/i, "");
    const sameFile =
      isAbsolute(rawPath) && resolve(rawPath) === resolve(projectDbPath);

    if (!sameFile) {
      const previousUrl = originalUrl;
      process.env.DATABASE_URL = `file:${projectDbPath}`;
      await resetCachedPrismaClient();
      bigPersianWarning([
        "[شفافیت خودکار دیتابیس — تسک 1-e]",
        `DATABASE_URL فعلی «${previousUrl}» مقاله‌ای ندارد (نتیجه: ${
          originalCount < 0 ? "باز نشد / جدول BlogPost غایب" : "۰ مقاله"
        }).`,
        `دیتابیس واقعی پروژه با ${projectCount} مقاله در «${projectDbPath}» پیدا شد`,
        "و DATABASE_URL به‌صورت خودکار به همین مسیر مطلق اصلاح شد.",
        "اگر عمداً دیتابیس خالی/جدید می‌خواستید، متغیر ALLOW_EMPTY_DATABASE=1 را تنظیم کنید",
        "یا DATABASE_URL را در .env به مسیر مطلق صحیح همان دیتابیس بگذارید.",
      ]);
      return {
        ok: true,
        fixed: true,
        originalUrl: previousUrl,
        finalUrl: process.env.DATABASE_URL,
        originalCount,
        projectCount,
        projectDbPath,
        reason: "دیتابیس env خالی/خراب بود — به دیتابیس پر پروژه اصلاح شد",
      };
    }

    // همان فایل است ولی ۰ مقاله — بازگردانی پشتیبان (blogAutoRestore) ادامه می‌دهد
    return {
      ok: false,
      fixed: false,
      originalUrl,
      finalUrl: originalUrl,
      originalCount,
      projectCount,
      projectDbPath,
      reason: "همان فایل پروژه است اما خالی — بازگردانی پشتیبان ادامه می‌دهد",
    };
  }

  // ۶) هیچ دیتابیس سالمی پیدا نشد — هشدار؛ بازگردانی پشتیبان در ادامهٔ بوت
  bigPersianWarning([
    "[هشدار دیتابیس — تسک 1-e]",
    `DATABASE_URL «${originalUrl}» مقاله‌ای ندارد (نتیجه: ${
      originalCount < 0 ? "باز نشد / جدول غایب" : "۰ مقاله"
    })`,
    projectDbPath
      ? `دیتابیس پروژه «${projectDbPath}» هم مقاله ندارد — بازگردانی پشتیبان تلاش می‌کند.`
      : "db/custom.db پروژه هم پیدا نشد — مسیر DATABASE_URL را در .env بررسی کنید.",
  ]);
  return {
    ok: false,
    fixed: false,
    originalUrl,
    finalUrl: originalUrl,
    originalCount,
    projectCount,
    projectDbPath,
    reason: "هیچ دیتابیس پرِ SQLite پیدا نشد",
  };
}
