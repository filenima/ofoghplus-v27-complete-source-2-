// ============================================================================
// instrumentation.ts — قلاب بوت Next.js 16 (R15 → 1-e)
// ----------------------------------------------------------------------------
// در هر شروعِ سرور (dev / production) یک‌بار اجرا می‌شود. کارهای بوت:
//  ۱) FIX(1-e — ریشهٔ «بلاگ خالی»): خودشفابخشی مسیر دیتابیس — اگر
//     DATABASE_URL به دیتابیس خالی/ناموجود اشاره کند و دیتابیس واقعی پروژه
//     (db/custom.db با ۴۰۰+ مقاله) موجود باشد، مسیر به‌صورت خودکار به همان
//     دیتابیس «مطلق» اصلاح می‌شود + هشدار فارسی درشت. این دقیقاً همان
//     سناریویی است که در استقرار کاربر لیست بلاگ/صف انتشار را خالی نشان
//     می‌داد (مسیر نسبی/مطلقِ ماشین قبل → دیتابیس اسکلت).
//  ۲) بیمهٔ بانک مقالات بلاگ: اگر جدول BlogPost خالی بود و فایل پشتیبان
//     bundled (db/blog-backup.json.gz) موجود بود، همهٔ مقالات خودکار
//     بازگردانی می‌شوند — پنل «مدیریت وبلاگ» دیگر هیچ‌وقت خالی نیست، حتی
//     روی استقرارِ تازه با DB خالی (درخواست سه‌راندی مالک).
// ============================================================================

export async function register() {
  // فقط runtime Node (نه edge) — Prisma/SQLite اینجاست
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // ─── ۱) شفابخشی مسیر دیتابیس (قبل از بازگردانی — تا بازگردانی در DB درست بنشیند) ───
  try {
    const { ensureDatabaseUrl } = await import("@/lib/db-selfcheck");
    const res = await ensureDatabaseUrl();
    if (res.fixed) {
      console.info(
        `[instrumentation][db-selfcheck] مسیر دیتابیس اصلاح شد: ${res.originalUrl} → ${res.finalUrl} (${res.projectCount} مقاله)`
      );
    } else if (process.env.NODE_ENV === "development") {
      console.info(
        `[instrumentation][db-selfcheck] ${res.reason} (${res.originalCount < 0 ? "خطا/جدول غایب" : `${res.originalCount} مقاله`})`
      );
    }
  } catch (e) {
    // هرگز بوت را نشکن — بررسی اختیاری است
    console.warn(
      "[instrumentation][db-selfcheck] failed (non-blocking):",
      e instanceof Error ? e.message : String(e)
    );
  }

  // ─── ۲) بیمهٔ بازگردانی مقالات بلاگ ───
  try {
    const { blogAutoRestore } = await import("@/lib/blog-auto-restore");
    const result = await blogAutoRestore();
    if (!result.skipped) {
      console.info(`[instrumentation] blog auto-restore: ${result.restored} مقاله`);
    } else if (result.error && process.env.NODE_ENV === "development") {
      // در dev لاگ کوتاه؛ در production سکوت (بوت نباید نویز بدهد)
      console.info(`[instrumentation] blog auto-restore skipped (${result.error})`);
    }
  } catch (e) {
    // هرگز بوت را نشکن — بیمه اختیاری است
    console.warn(
      "[instrumentation] blog auto-restore failed (non-blocking):",
      e instanceof Error ? e.message : String(e)
    );
  }
}
