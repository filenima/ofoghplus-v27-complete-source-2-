/* ============================================================
 * lib/import-formats.ts — پارسر سمت سرور همهٔ فرمت‌های درون‌ریزی (Task 1-d)
 * ============================================================
 * فقط در سرور استفاده می‌شود (app/api/import) چون xlsx را static import
 * می‌کند. منطق متنی (انکودینگ/جداکننده/هدر/جانک/قیمت شکسته) از
 * lib/import-parser (client-safe) وام گرفته می‌شود تا خروجی سرور و
 * کلاینت بیت‌به‌بیت یکسان باشد.
 *
 * فرمت‌های پشتیبانی‌شده:
 *  - .xlsx / .xlsm (SheetJS — چند-شیت: انتخاب شیت با نام/شماره، پیش‌فرض پرردیف‌تر)
 *  - .xls        (اکسل قدیمی BIFF/OLE2 — SheetJS)
 *  - .xlsb       (اکسل Binary Workbook — SheetJS)
 *  - .ods        (OpenDocument/LibreOffice — SheetJS؛ فایل zip است و از
 *                 magic bytes هم به‌صورت خودکار شناسایی می‌شود)
 *  - .csv          (UTF-8، UTF-8-BOM، UTF-16LE/BE، Windows-1256 فارسی)
 *  - .tsv          (Tab — با تشخیص خودکار جداکننده)
 *  - .txt          (جداکننده خودکار: Tab / کاما / سمی‌کالن / پایپ)
 *  - .json         (آرایه‌ای از آبجکت‌ها یا { data: [...] })
 *
 * تشخیص نوع واقعی از «محتوای» فایل (magic bytes) — نه فقط پسوند:
 *  - PK\x03\x04 → ظرف ZIP (xlsx/xlsm/xlsb/ods — SheetJS خودش تشخیص می‌دهد)
 *  - D0 CF 11 E0 → XLS قدیمی (BIFF/OLE2)
 *  - BOM های یونیکد → متن
 * ============================================================ */

import * as XLSX from "xlsx";
// R28-8 — جدول کدپیج‌های SheetJS (cpexcel): برای XLS قدیمی (BIFF5/BIFF8 با
// رشته‌های ۱-بایتی) متن فارسیِ cp1256 فقط با ثبت این جدول درست دیکد می‌شود.
// بدون آن، SheetJS رشته‌های غیر-یونیکد XLS را با فرض لاتین می‌خواند (موجیبک).
import * as cptable from "xlsx/dist/cpexcel.full.mjs";
import {
  decodeBuffer,
  detectDelimiter,
  parseCsvMatrix,
  parseMatrixSmart,
} from "@/lib/import-parser";

try {
  XLSX.set_cptable(cptable);
} catch {
  /* ثبت جدول کدپیج ناموفق — XLS های یونیکد (BIFF8+) همچنان درست خوانده می‌شوند */
}

export type ImportFileFormat =
  | "xlsx"
  | "xls"
  | "xlsm"
  | "xlsb"
  | "ods"
  | "csv"
  | "tsv"
  | "txt"
  | "json";

/** سقف حجم فایل درون‌ریزی (درخواست‌های مولتی‌پارت) — ۱۵ مگابایت */
export const MAX_IMPORT_FILE_BYTES = 15 * 1024 * 1024;

/** سقف کل ردیف‌های هر فایل (هم‌راستا با سقف کلاینت) */
export const MAX_IMPORT_FILE_ROWS = 100_000;

export interface ParsedImportFile {
  format: ImportFileFormat;
  /** انکودینگ تشخیص‌داده‌شده (فقط متنی — برای xlsx/json خالی) */
  encoding: string;
  /** جداکننده تشخیص‌داده‌شده (فقط متنی) */
  delimiter: string;
  /** همهٔ شیت‌های فایل اکسل (خالی برای سایر فرمت‌ها) */
  sheets: string[];
  /** شیت انتخاب‌شده (خالی برای سایر فرمت‌ها) */
  selectedSheet: string;
  /** هدرهای نهایی (بعد از تشخیص هدر/تزریق «ستون ۱..N») */
  headers: string[];
  /** ردیف‌های داده به‌صورت آرایه (هم‌طول با headers — pad شده) */
  rows: string[][];
  /** هدر عمومی تزریق شد (فایل بدون هدر بود) */
  headerInjected: boolean;
  /** ردیف‌های مزاحم حذف‌شده */
  junkRemoved: number;
  /** سطرهای جمع کل حذف‌شده */
  totalsRemoved: number;
  /** تعداد کل ردیف‌های داده */
  totalRows: number;
  /** R28-8: ردیف سرستونِ به‌کار-رفته (۱-مبنا در کل شیت/فایل؛ ۰ = بدون هدر/تزریق عمومی) */
  headerRowUsed: number;
  /** R28-8: کل ردیف‌های خام (برای بازهٔ استپر «ردیف سرستون» در UI) */
  rawRowCount: number;
}

/** خطای پارس با پیام فارسی قابل نمایش */
export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFileError";
  }
}

/* ---------- تشخیص فرمت واقعی از محتوا + پسوند ---------- */

function hasZipSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
}

function hasOleSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1
  );
}

/** فرمت‌های صفحه‌گسترده‌ای که با SheetJS خوانده می‌شوند (همه چند-شیت) */
const SHEETJS_FORMATS: readonly ImportFileFormat[] = ["xlsx", "xls", "xlsm", "xlsb", "ods"];

/** فرمت واقعی فایل: اول پسوندهای صریح (ods/xlsm/xlsb — همه zip هستند و
 * magic bytes آنها را از xlsx جدا نمی‌کند)، بعد magic bytes، بعد پسوند.
 * پیش‌فرض: csv (متن جداشده). */
export function detectImportFormat(bytes: Uint8Array, fileName: string): ImportFileFormat {
  const lower = fileName.toLowerCase();
  // ODS/XLSM/XLSB همگی ظرف ZIP دارند — پسوند صریح بر magic bytes اولویت دارد
  if (lower.endsWith(".ods")) return "ods";
  if (lower.endsWith(".xlsm")) return "xlsm";
  if (lower.endsWith(".xlsb")) return "xlsb";
  if (hasZipSignature(bytes)) return "xlsx";
  if (hasOleSignature(bytes)) return "xls";
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".xls")) return "xls";
  if (lower.endsWith(".tsv")) return "tsv";
  if (lower.endsWith(".txt")) return "txt";
  if (lower.endsWith(".json")) return "json";
  return "csv";
}

/* ---------- ردیف‌های آبجکتی → ماتریسی (برای JSON) ---------- */

function jsonToMatrix(parsed: unknown): { matrix: string[][]; note: string } {
  let arr: unknown[] | null = null;
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (parsed && typeof parsed === "object") {
    const data = (parsed as Record<string, unknown>).data;
    if (Array.isArray(data)) arr = data;
  }
  if (!arr || arr.length === 0) {
    throw new ImportFileError("ساختار JSON پشتیبانی نمی‌شود — باید آرایه‌ای از رکوردها (یا { data: [...] }) باشد");
  }
  // کلیدها به‌ترتیب ظهور اولین رکوردها (ترتیب ستون‌ها حفظ می‌شود)
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const item of arr.slice(0, 50)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    for (const k of Object.keys(item as Record<string, unknown>)) {
      if (!seen.has(k)) {
        seen.add(k);
        headers.push(k);
      }
    }
  }
  if (headers.length === 0) {
    throw new ImportFileError("رکوردهای JSON شیء (آبجکت) نیستند — هر رکورد باید مجموعه‌ای از کلید:مقدار باشد");
  }
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  const matrix: string[][] = [headers];
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    matrix.push(headers.map((h) => cell(rec[h])));
  }
  return { matrix, note: "JSON" };
}

/* ---------- پارسر اصلی ---------- */

/**
 * پارس کامل فایل درون‌ریزی در سمت سرور.
 * @param bytes  محتوای فایل
 * @param fileName نام فایل (برای تشخیص پسوندی و پیام خطا)
 * @param sheet  شیت انتخابی (نام یا شماره ۱-مبنا) — فقط فرمت‌های اکسل/ODS
 * @param opts.headerRow ردیف سرستون اجباری (۱-مبنا در کل شیت؛ ۰/undefined = تشخیص خودکار)
 */
export function parseImportFile(
  bytes: Uint8Array,
  fileName: string,
  sheet?: string,
  opts?: { headerRow?: number }
): ParsedImportFile {
  if (!bytes || bytes.length === 0) {
    throw new ImportFileError("فایل خالی است");
  }
  const format = detectImportFormat(bytes, fileName);

  /* ---------- XLSX / XLS / XLSM / XLSB / ODS (SheetJS) ---------- */
  if (SHEETJS_FORMATS.includes(format)) {
    let workbook: XLSX.WorkBook;
    try {
      // R28-8 — کدپیج «اجباری» حذف شد: SheetJS با کدپیج خودِ فایل (رکورد
      // CODEPAGE — مثل cp1256 برای XLS فارسی) و جدول cpexcel ثبت‌شده بالا،
      // رشته‌ها را درست دیکد می‌کند. type:'array' + dense:false (پیش‌فرض).
      workbook = XLSX.read(bytes, { type: "array", dense: false });
    } catch {
      throw new ImportFileError(
        "فایل صفحه‌گسترده قابل خواندن نیست (XLSX/XLS/XLSM/XLSB/ODS) — فایل را در اکسل یا LibreOffice باز کنید و با نوع xlsx/csv دوباره ذخیره کنید"
      );
    }
    const sheetNames = workbook.SheetNames ?? [];
    if (sheetNames.length === 0) {
      throw new ImportFileError("فایل اکسل هیچ شیتی ندارد");
    }

    // انتخاب شیت: پارامتر صریح (نام یا شمارهٔ ۱-مبنا) یا پرردیف‌ترین شیت
    let selectedSheet: string;
    if (sheet && sheet.trim() !== "") {
      const wanted = sheet.trim();
      const byName = sheetNames.find((s) => s === wanted);
      const byIndex = /^\d+$/.test(wanted) ? sheetNames[Number(wanted) - 1] : undefined;
      const found = byName ?? byIndex;
      if (!found) {
        throw new ImportFileError(
          `شیت «${wanted.slice(0, 30)}» در فایل پیدا نشد — شیت‌های موجود: ${sheetNames.slice(0, 8).join("، ")}`
        );
      }
      selectedSheet = found;
    } else {
      selectedSheet = sheetNames[0];
      let bestCount = -1;
      for (const name of sheetNames) {
        const sh = workbook.Sheets[name];
        if (!sh) continue;
        // شمارش ردیف‌ها با !ref (سریع — بدون تبدیل کامل)
        const ref = sh["!ref"] as string | undefined;
        if (!ref) continue;
        const range = XLSX.utils.decode_range(ref);
        const count = range.e.r - range.s.r + 1;
        if (count > bestCount) {
          bestCount = count;
          selectedSheet = name;
        }
      }
    }

    const ws = workbook.Sheets[selectedSheet];
    if (!ws) {
      throw new ImportFileError(`شیت «${selectedSheet.slice(0, 30)}» قابل خواندن نیست`);
    }
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    }) as unknown[][];
    // FIX(v42-OOM): سقف سخت ردیف اکسل — جلوگیری از RAM explosion
    if (matrix.length > 150_000) {
      throw new ImportFileError(
        `شیت «${selectedSheet.slice(0, 30)}» بیش از ۱۵۰٬۰۰۰ ردیف دارد — فایل را بخش‌بندی کنید`
      );
    }
    if (!matrix || matrix.length === 0) {
      throw new ImportFileError(
        `شیت «${selectedSheet.slice(0, 30)}» هیچ داده‌ای ندارد (شیت‌های فایل: ${sheetNames.slice(0, 6).join("، ")})`
      );
    }
    // قیمت‌های اکسل تک‌سلولی هستند → reassemble=false
    const smart = parseMatrixSmart(matrix as unknown as string[][], {
      delimiter: ",",
      reassemble: false,
      headerRowIndex: opts?.headerRow,
    });
    if (smart.rows.length === 0) {
      throw new ImportFileError(
        `شیت «${selectedSheet.slice(0, 30)}» بعد از پاک‌سازی هیچ ردیف داده‌ای ندارد — شیت دیگری را انتخاب کنید (${sheetNames.join("، ")})`
      );
    }
    return {
      format,
      encoding: "",
      delimiter: "",
      sheets: sheetNames,
      selectedSheet,
      headers: smart.headers,
      rows: smart.rows.map((r) => smart.headers.map((h) => r[h] ?? "")),
      headerInjected: smart.headerInjected,
      junkRemoved: smart.junkRemoved,
      totalsRemoved: smart.totalsRemoved,
      totalRows: smart.rows.length,
      headerRowUsed: smart.headerRowUsed,
      rawRowCount: smart.rawRowCount,
    };
  }

  /* ---------- JSON ---------- */
  if (format === "json") {
    const { text, encoding } = decodeBuffer(bytes);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ImportFileError("فایل JSON نامعتبر است");
    }
    const { matrix } = jsonToMatrix(parsed);
    const smart = parseMatrixSmart(matrix, { delimiter: ",", encoding, reassemble: false, headerRowIndex: opts?.headerRow });
    if (smart.rows.length === 0) {
      throw new ImportFileError("فایل JSON هیچ ردیف داده‌ای ندارد");
    }
    return {
      format: "json",
      encoding,
      delimiter: "",
      sheets: [],
      selectedSheet: "",
      headers: smart.headers,
      rows: smart.rows.map((r) => smart.headers.map((h) => r[h] ?? "")),
      headerInjected: smart.headerInjected,
      junkRemoved: smart.junkRemoved,
      totalsRemoved: smart.totalsRemoved,
      totalRows: smart.rows.length,
      headerRowUsed: smart.headerRowUsed,
      rawRowCount: smart.rawRowCount,
    };
  }

  /* ---------- CSV / TSV / TXT (متن جداشده) ---------- */
  const { text, encoding } = decodeBuffer(bytes);
  const delimiter = detectDelimiter(text);
  const matrix = parseCsvMatrix(text, delimiter);
  if (matrix.length === 0) {
    const delimLabel =
      delimiter === "," ? "کاما" : delimiter === ";" ? "سمی‌کالن" : delimiter === "\t" ? "Tab" : "|";
    throw new ImportFileError(
      `فایل بعد از دیکد خالی ماند (انکودینگ: ${encoding}، جداکننده: ${delimLabel}) — فایل را با CSV UTF-8 دوباره ذخیره کنید`
    );
  }
  const smart = parseMatrixSmart(matrix, { delimiter, encoding, reassemble: true, headerRowIndex: opts?.headerRow });
  if (smart.rows.length === 0) {
    const delimLabel =
      delimiter === "," ? "کاما" : delimiter === ";" ? "سمی‌کالن" : delimiter === "\t" ? "Tab" : "|";
    const parts = [`${smart.headerInjected ? "سطر اول داده فرض شد" : "سطر اول هدر فرض شد"} (انکودینگ ${encoding}، جداکننده ${delimLabel})`];
    if (smart.junkRemoved > 0) parts.push(`${smart.junkRemoved} سطر مزاحم حذف شد`);
    if (smart.totalsRemoved > 0) parts.push(`${smart.totalsRemoved} سطر جمع حذف شد`);
    parts.push("چند ردیف میانی فایل را بررسی کنید — جداکنندهٔ غیرمعمول یا ستون‌بندی متفاوت");
    throw new ImportFileError(`هیچ ردیف داده‌ای باقی نماند — ${parts.join("؛ ")}`);
  }
  return {
    format,
    encoding,
    delimiter,
    sheets: [],
    selectedSheet: "",
    headers: smart.headers,
    rows: smart.rows.map((r) => smart.headers.map((h) => r[h] ?? "")),
    headerInjected: smart.headerInjected,
    junkRemoved: smart.junkRemoved,
    totalsRemoved: smart.totalsRemoved,
    totalRows: smart.rows.length,
    headerRowUsed: smart.headerRowUsed,
    rawRowCount: smart.rawRowCount,
  };
}

/* ---------- ابزارهای کمکی برای preview ---------- */

/**
 * نمونهٔ مقادیر هر ستون: اولین N مقدار غیرخالی (برای نمایش در گرید نگاشت).
 */
export function columnSamples(rows: string[][], colIndex: number, count = 5): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const v = (row[colIndex] ?? "").trim();
    if (v !== "") {
      out.push(v.length > 60 ? `${v.slice(0, 57)}…` : v);
      if (out.length >= count) break;
    }
  }
  return out;
}

/**
 * تشخیص قالب تاریخ غالب در ستون‌های متنی: جلالی / میلادی / مخلوط / نامشخص.
 * برای نمایش «قالب تاریخ تشخیص‌داده‌شده» در پیش‌نمایش.
 */
export function detectDateFormat(rows: string[][], colIndexes: number[]): "jalali" | "gregorian" | "mixed" | "none" {
  const jalaliRe = /^1[2-6]\d{2}[-/.]\d{1,2}[-/.]\d{1,2}$/;
  const gregorianRe = /^(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}$/;
  const normalize = (s: string) =>
    s
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .trim();
  let jalali = 0;
  let gregorian = 0;
  const sample = rows.slice(0, 300);
  for (const row of sample) {
    for (const c of colIndexes) {
      const v = normalize(row[c] ?? "");
      if (!v) continue;
      if (jalaliRe.test(v)) jalali++;
      else if (gregorianRe.test(v)) gregorian++;
    }
  }
  if (jalali > 0 && gregorian > 0) return "mixed";
  if (jalali > 0) return "jalali";
  if (gregorian > 0) return "gregorian";
  return "none";
}

/** تبدیل ردیف‌های ماتریسی به آبجکتی برای استنتاج نگاشت (inferMappingFromData) */
export function matrixToRecordRows(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.map((row) => {
    const rec: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) rec[headers[i]] = row[i] ?? "";
    return rec;
  });
}

/** سقف بررسی حجم فایل — خطای فارسی یکسان برای همهٔ مسیرها */
export function assertFileSize(bytes: Uint8Array): void {
  if (bytes.length > MAX_IMPORT_FILE_BYTES) {
    throw new ImportFileError(
      `حجم فایل بیش از حد مجاز است (${(bytes.length / 1024 / 1024).toFixed(1)} مگابایت — سقف ۱۵ مگابایت). فایل را بخش‌بندی کنید`
    );
  }
}

/** سقف ردیف — خطای فارسی */
export function assertRowLimit(totalRows: number): void {
  if (totalRows > MAX_IMPORT_FILE_ROWS) {
    throw new ImportFileError(
      `فایل ${totalRows.toLocaleString("en-US")} ردیف دارد — سقف مجاز ۱۰۰,۰۰۰ ردیف است. فایل را بخش‌بندی کنید`
    );
  }
}
