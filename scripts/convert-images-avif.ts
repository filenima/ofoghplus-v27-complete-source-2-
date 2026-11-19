// ============================================================
// scripts/convert-images-avif.ts — تبدیل تصاویر سایت به AVIF (R14-F)
// ============================================================
// برای هر فایل .webp/.jpg/.jpeg/.png داخل public/images یک نسخهٔ .avif
// می‌سازد (sharp: quality 50, effort 4 — تعادل کیفیت/سرعت/حجم).
//
// مراحل (به‌ترتیب، هر مرحله فقط بعد از موفقیت مرحلهٔ قبل):
//   ۱) تبدیل → public/images/<name>.avif
//   ۲) به‌روزرسانی ارجاع‌های کد (app/ components/ lib/ scripts/)
//      — الگوی «/images/<name>.webp» → «/images/<name>.avif»
//   ۳) به‌روزرسانی دیتابیس (BlogPost.content/coverImage + CmsPageVersion.content)
//      — ابتدا snapshot پشتیبان با VACUUM INTO در backups/
//   ۴) حذف فایل اصلی (فقط بعد از موفقیت ۱+۲+۳) تا نسخهٔ تکراری نماند
//
// چیزی که تبدیل/حذف «نمی‌شود»:
//   - public/og-image.png و icon-*.png و favicon/ apple-touch-icon
//     (کرالرهای اجتماعی PNG/JPG می‌خواهند؛ آیکون‌های PWA طبق spec باید PNG باشند)
//   - public/uploads/* (محتوای Runtime کاربران — خارج از scope)
//   - فایل‌های svg (لوگوها — وکتور، بهینه از قبل)
//
// اجرا:  bun scripts/convert-images-avif.ts
// فلگ‌ها:
//   --no-delete   → فایل‌های اصلی را حذف نکن (فقط تبدیل + رفرنس)
//   --no-db       → دیتابیس را به‌روز نکن
//   --no-refs     → ارجاع‌های کد را به‌روز نکن
// Idempotent — اجرای دوباره بی‌ضرر است (فایل avif موجود skip می‌شود).

import sharp from "sharp";
import { readdir, stat, writeFile, unlink, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IMAGES_DIR = path.join(ROOT, "public", "images");
const DB_PATH = path.join(ROOT, "db", "custom.db");
const BACKUP_DIR = path.join(ROOT, "backups");

const QUALITY = 50; // مأموریت: تعادل خوب حجم/کیفیت
const EFFORT = 4; // مأموریت: سریع و بهینه

// پوشه‌هایی که ارجاع تصویر دارند (پروژهٔ app-router با src بیرون از src/)
const REF_DIRS = ["app", "components", "lib", "scripts"];
const REF_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".html", ".md"];

// فلگ‌ها
const flags = new Set(process.argv.slice(2));
const NO_DELETE = flags.has("--no-delete");
const NO_DB = flags.has("--no-db") || !existsSync(DB_PATH);
const NO_REFS = flags.has("--no-refs");

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

/** فایل‌های قابل تبدیل داخل public/images — svg و فایل‌های محافظت‌شده کنار گذاشته می‌شوند */
async function collectConvertible(): Promise<
  { file: string; ext: string }[]
> {
  const all = await readdir(IMAGES_DIR);
  return all
    .filter((f) => /\.(webp|jpe?g|png)$/i.test(f))
    // محافظت‌شده: og-image و آیکون‌ها (آیکون PWA طبق spec باید PNG بماند)
    .filter((f) => !/^og-image\./i.test(f) && !/^icon-\d+/.test(f) && !/^favicon/i.test(f))
    .sort()
    .map((f) => ({ file: f, ext: path.extname(f).toLowerCase() }));
}

/** یک فایل را به avif تبدیل می‌کند؛ اگر avif تازه‌تر از مبدأ هست skip */
async function convertOne(file: string): Promise<{ before: number; after: number }> {
  const src = path.join(IMAGES_DIR, file);
  const dst = path.join(IMAGES_DIR, file.replace(/\.(webp|jpe?g|png)$/i, ".avif"));
  const before = (await stat(src)).size;
  if (existsSync(dst)) {
    // idempotent — اگر از قبل با همین مبدأ ساخته شده، skip
    if ((await stat(dst)).mtimeMs >= (await stat(src)).mtimeMs) {
      return { before, after: (await stat(dst)).size };
    }
  }
  const buffer = await sharp(src).avif({ quality: QUALITY, effort: EFFORT }).toBuffer();
  await writeFile(dst, buffer);
  return { before, after: buffer.byteLength };
}

/** جایگزینی ارجاع‌های کد: /images/<name>.<ext> → /images/<name>.avif */
async function updateRefs(
  conversions: { file: string; from: string; to: string }[]
): Promise<number> {
  let totalReplacements = 0;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSyncSafe(dir)) {
      const p = path.join(dir, entry);
      const st = statSyncSafe(p);
      if (!st) continue;
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === ".next" || entry === "backups") continue;
        walk(p);
      } else if (REF_EXTS.includes(path.extname(entry).toLowerCase())) {
        files.push(p);
      }
    }
  };
  for (const d of REF_DIRS) {
    const abs = path.join(ROOT, d);
    if (existsSync(abs)) walk(abs);
  }

  for (const f of files) {
    let content: string;
    try {
      content = await readFile(f, "utf8");
    } catch {
      continue;
    }
    let next = content;
    let fileHits = 0;
    for (const c of conversions) {
      const parts = next.split(c.from);
      if (parts.length > 1) {
        fileHits += parts.length - 1;
        next = parts.join(c.to);
      }
    }
    if (fileHits > 0) {
      await writeFile(f, next);
      totalReplacements += fileHits;
      console.log(`  ↻ ${path.relative(ROOT, f)} — ${fileHits} ارجاع`);
    }
  }
  return totalReplacements;
}

// helpers safe sync (برای پیمایش ساده)
import { readdirSync, statSync } from "node:fs";
function readdirSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
function statSyncSafe(p: string) {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

/** به‌روزرسانی دیتابیس با snapshot پشتیبان (VACUUM INTO — snapshot سازگار WAL) */
async function updateDb(
  conversions: { from: string; to: string }[]
): Promise<void> {
  const { Database } = await import("bun:sqlite");
  const db = new Database(DB_PATH);
  db.exec("PRAGMA busy_timeout = 15000");

  // پشتیبان سازگار (حتی با WAL فعال)
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = path.join(BACKUP_DIR, `hoosh-backup-${ts}-before-avif.db`);
  db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  console.log(`  ✔ پشتیبان دیتابیس: ${path.relative(ROOT, backupPath)}`);

  let total = 0;
  for (const c of conversions) {
    const safeFrom = c.from.replace(/'/g, "''");
    const safeTo = c.to.replace(/'/g, "''");
    for (const [table, col] of [
      ["BlogPost", "content"],
      ["BlogPost", "coverImage"],
      ["CmsPageVersion", "content"],
    ] as const) {
      const res = db
        .query(
          `UPDATE "${table}" SET "${col}" = replace("${col}", '${safeFrom}', '${safeTo}') WHERE "${col}" LIKE '%${safeFrom}%'`
        )
        .run();
      total += res.changes;
    }
  }
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  console.log(`  ✔ دیتابیس به‌روز شد — ${total} رکورد ویرایش شد`);
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   تبدیل تصاویر به AVIF — quality 50 / effort 4 (R14-F)   ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const files = await collectConvertible();
  if (files.length === 0) {
    console.log("هیچ فایل قابل تبدیل در public/images نیست.");
    return;
  }

  // ---------- مرحلهٔ ۱: تبدیل ----------
  console.log(`[۱/۴] تبدیل ${files.length} فایل…`);
  const rows: { file: string; before: number; after: number }[] = [];
  const done: { file: string; from: string; to: string }[] = [];
  let failed = 0;
  for (const { file } of files) {
    try {
      const { before, after } = await convertOne(file);
      rows.push({ file, before, after });
      done.push({
        file,
        from: `/images/${file}`,
        to: `/images/${file.replace(/\.(webp|jpe?g|png)$/i, ".avif")}`,
      });
    } catch (err) {
      failed += 1;
      console.error(`  ✖ خطا در ${file}:`, err instanceof Error ? err.message : err);
    }
  }

  // جدول نتیجه
  const nameW = Math.max(...rows.map((r) => r.file.length), 12);
  console.log(`\n┌${"─".repeat(nameW + 44)}┐`);
  console.log(`│ ${"فایل".padEnd(nameW)} │ ${"قبل".padStart(10)} │ ${"بعد(avif)".padStart(10)} │ ${"صرفه".padStart(7)} │`);
  console.log(`├${"─".repeat(nameW + 44)}┤`);
  for (const r of rows) {
    const saving = Math.round(((r.before - r.after) / r.before) * 100);
    console.log(
      `│ ${r.file.padEnd(nameW)} │ ${fmtBytes(r.before).padStart(10)} │ ${fmtBytes(r.after).padStart(10)} │ ${String(saving).padStart(6)}٪ │`
    );
  }
  const totalBefore = rows.reduce((s, r) => s + r.before, 0);
  const totalAfter = rows.reduce((s, r) => s + r.after, 0);
  const totalSaving = totalBefore > 0 ? Math.round(((totalBefore - totalAfter) / totalBefore) * 100) : 0;
  console.log(`├${"─".repeat(nameW + 44)}┤`);
  console.log(
    `│ ${"جمع".padEnd(nameW)} │ ${fmtBytes(totalBefore).padStart(10)} │ ${fmtBytes(totalAfter).padStart(10)} │ ${String(totalSaving).padStart(6)}٪ │`
  );
  console.log(`└${"─".repeat(nameW + 44)}┘\n`);

  if (failed > 0 || done.length === 0) {
    console.log(`توقف — ${failed} خطا؛ مراحل بعدی اجرا نشد.`);
    process.exit(1);
  }

  // ---------- مرحلهٔ ۲: ارجاع‌های کد ----------
  if (!NO_REFS) {
    console.log("[۲/۴] به‌روزرسانی ارجاع‌های کد (app/ components/ lib/ scripts/)…");
    const n = await updateRefs(done);
    console.log(`  ✔ ${n} ارجاع به‌روز شد\n`);
  } else {
    console.log("[۲/۴] رد شد (--no-refs)\n");
  }

  // ---------- مرحلهٔ ۳: دیتابیس ----------
  if (!NO_DB) {
    console.log("[۳/۴] به‌روزرسانی دیتابیس (BlogPost + CmsPageVersion)…");
    await updateDb(done);
    console.log("");
  } else {
    console.log("[۳/۴] رد شد (--no-db)\n");
  }

  // ---------- مرحلهٔ ۴: حذف اصل ----------
  if (NO_DELETE) {
    console.log("[۴/۴] حذف فایل‌های اصلی رد شد (--no-delete)");
  } else {
    console.log("[۴/۴] حذف فایل‌های اصلی (webp/jpg/png)…");
    let removed = 0;
    for (const { file } of done) {
      // فقط وقتی حذف کن که avif موجود و سالم (حجم > 0) باشد
      const dst = path.join(IMAGES_DIR, file.replace(/\.(webp|jpe?g|png)$/i, ".avif"));
      if (existsSync(dst) && (await stat(dst)).size > 0) {
        await unlink(path.join(IMAGES_DIR, file));
        removed += 1;
      }
    }
    console.log(`  ✔ ${removed} فایل اصلی حذف شد\n`);
  }

  console.log(
    `✅ پایان: ${done.length} تصویر AVIF ساخته شد — جمع: ${fmtBytes(totalBefore)} → ${fmtBytes(totalAfter)} (${totalSaving}٪ صرفه‌جویی)`
  );
}

main().catch((err) => {
  console.error("خطای کلی:", err);
  process.exit(1);
});
