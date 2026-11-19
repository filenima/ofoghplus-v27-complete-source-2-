/* ============================================================
 * app/api/import/analyze/route.ts — تحلیل فایل درون‌ریزی (Task 6)
 * ============================================================
 * POST /api/import/analyze  (Content-Type: multipart/form-data)
 *
 * فیلدهای فرم:
 *   file      (File, الزامی) — xlsx / xls / xlsm / ods / csv / tsv / txt / json
 *   sheet     (نام شیت یا شمارهٔ ۱-مبنا) — اختیاری، فقط فرمت‌های اکسل
 *   headerRow (عدد ۱-مبنا)   — اختیاری؛ ردیف هدر اجباری (پیش‌فرض: تشخیص خودکار)
 *
 * خروجی JSON (بدون هیچ نوشتن در دیتابیس):
 *   success, file {name,sizeBytes,format,encoding,delimiter,delimiterLabel},
 *   sheets [{name,rowCount}], selectedSheet, headerRow,
 *   rawPreview [{row,cells}], headers, sampleRows, columnSamples,
 *   totalRows, headerInjected, junkRemoved, totalsRemoved,
 *   detectedTarget, targetScores,
 *   suggestions { products|parties|accounts|journalEntries|stock:
 *                 [{index, field, confidence(exact|fuzzy|inferred|none), reason}] },
 *   inferredCounts, dateFormat
 *
 * نکته: پیشنهاد نگاشت برای «هر ۵ هدف» هم‌زمان برمی‌گردد تا تغییر نوع هدف
 * در ویزارد بدون آپلود مجدد فایل کار کند.
 * ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/user-auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { assertFileSize, ImportFileError } from "@/lib/import-formats";
import { analyzeImportFile } from "@/lib/import-analyze";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    /* ---------- احراز هویت (قبل از هر کاری) ---------- */
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;

    /* ---------- Rate limit (per-IP) ---------- */
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`import-analyze:${ip}`, 120, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." },
        { status: 429 }
      );
    }

    /* ---------- فرم مولتی‌پارت ---------- */
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: "فرم مولتی‌پارت نامعتبر است" },
        { status: 400 }
      );
    }
    const fileEntry = form.get("file");
    if (!(fileEntry instanceof File) || fileEntry.size === 0) {
      return NextResponse.json(
        { success: false, error: "فایلی ارسال نشده است — فیلد «file» در فرم الزامی است" },
        { status: 400 }
      );
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await fileEntry.arrayBuffer());
    } catch {
      return NextResponse.json(
        { success: false, error: "خواندن محتوای فایل ناموفق بود" },
        { status: 400 }
      );
    }
    try {
      assertFileSize(bytes);
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : "حجم فایل بیش از حد مجاز است" },
        { status: 400 }
      );
    }

    const sheetEntry = form.get("sheet");
    const sheet = typeof sheetEntry === "string" && sheetEntry.trim() !== "" ? sheetEntry.trim() : undefined;
    const headerRowEntry = form.get("headerRow");
    let headerRow: number | undefined;
    if (typeof headerRowEntry === "string" && /^\d+$/.test(headerRowEntry.trim())) {
      const n = Number(headerRowEntry.trim());
      if (n >= 1 && n <= 1000) headerRow = n;
    }

    /* ---------- تحلیل ---------- */
    try {
      const result = analyzeImportFile(bytes, fileEntry.name, { sheet, headerRow });
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof ImportFileError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 400 });
      }
      throw err;
    }
  } catch (error) {
    console.error("Import analyze error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در تحلیل فایل — ساختار فایل را بررسی کنید و دوباره تلاش کنید" },
      { status: 500 }
    );
  }
}
