/* ============================================================
 * lib/import-analyze.ts — موتور تحلیل فایل درون‌ریزی (Task 6)
 * ============================================================
 * سمت سرور (app/api/import/analyze + execute) — بدون وابستگی به کلاینت.
 *
 * مأموریت: «هر ستونی که درست تشخیص داده نشه، کاربر بتونه دستی انتخاب
 * کنه اون ستون برای چیه» — این ماژول فایل را می‌خواند و برای «هر ۵ نوع
 * هدف» (کالا / طرف‌حساب / حساب / سند حسابداری / موجودی انبار) پیشنهاد
 * نگاشت ستون‌ها را با سطح اطمینان تولید می‌کند تا UI ویزارد ۴ مرحله‌ای
 * آن را نمایش دهد و کاربر بتواند هر ستون را دستی اصلاح کند.
 *
 * قابلیت‌ها (فراتر از lib/import-formats):
 *  - فرمت‌ها: xlsx / xls / xlsm / ods (SheetJS — همه zip/OLE) /
 *    csv / tsv / txt (جداکننده خودکار) / json
 *  - انتخاب «ردیف هدر» توسط کاربر (headerRow) — فایل‌های دارای
 *    چند سطر عنوان بالای جدول
 *  - فهرست شیت‌ها با تعداد ردیف هر شیت (انتخاب هوشمند پرردیف‌ترین)
 *  - پیش‌نمایش ردیف‌های خام ابتدایی (برای انتخاب ردیف هدر در UI)
 *  - پیشنهاد نگاشت برای هر ۵ هدف به‌صورت هم‌زمان (تغییر نوع هدف در UI
 *    بدون آپلود مجدد فایل کار می‌کند)
 *  - تشخیص نوع هدف (detectedTarget) + امتیاز هر هدف
 *  - فیلدهای هدف «موجودی انبار» (stock) — تعریف محلی با همان الگوی
 *    IMPORT_FIELD_DEFS (بدون دست‌کاری ImportEntityKind تا نقشه‌های
 *    Record<ImportEntityKind,...> در کلاینت شکسته نشوند)
 * ============================================================ */

import * as XLSX from "xlsx";
import {
  decodeBuffer,
  detectDelimiter,
  parseCsvMatrix,
  looksLikeHeaderRow,
  isJunkRow,
  matrixToTable,
  isTotalsRow,
  nameHeaderKeys,
  autoDetectMapping,
  inferMappingFromData,
  suggestFieldForHeader,
  headerField,
  normalizeHeaderKey,
  HEADER_SEMANTICS,
  IMPORT_FIELD_DEFS,
  MAPPING_IGNORE,
  profileColumns,
  type ImportEntityKind,
} from "@/lib/import-parser";
import { ImportFileError, columnSamples, type ParsedImportFile } from "@/lib/import-formats";

/* ============================================================
 * انواع عمومی
 * ============================================================ */

/** انواع هدف ویزارد جدید — «journal» در قرارداد API یعنی journalEntries */
export type AnalyzeTarget =
  | "products"
  | "parties"
  | "accounts"
  | "journalEntries"
  | "stock";

export const ANALYZE_TARGETS: readonly AnalyzeTarget[] = [
  "products",
  "parties",
  "accounts",
  "journalEntries",
  "stock",
];

/** نام هدف پذیرفته‌شده در API → نوع هدف استاندارد */
export function normalizeAnalyzeTarget(raw: string): AnalyzeTarget | null {
  const t = raw.trim();
  if (t === "journal") return "journalEntries"; // قرارداد تسک: journal
  if ((ANALYZE_TARGETS as readonly string[]).includes(t)) return t as AnalyzeTarget;
  return null;
}

export type AnalyzeFormat = "xlsx" | "xls" | "xlsm" | "ods" | "csv" | "tsv" | "txt" | "json";

/** سطح اطمینان پیشنهاد — هم‌راستا با ImportColumnMapper */
export type SuggestionConfidence = "exact" | "fuzzy" | "inferred" | "none";

export interface ColumnSuggestion {
  /** ایندکس ستون (۰-مبنا — هم‌راستا با headers) */
  index: number;
  /** فیلد هدف یا "ignore" */
  field: string;
  confidence: SuggestionConfidence;
  reason: string;
}

/* ============================================================
 * فیلدهای هدف «موجودی انبار» (stock) — تعریف محلی
 * ============================================================
 * الگوی FieldDef در lib/import-parser (client-safe) تکرار شده چون
 * ImportEntityKind تغییر نمی‌کند (نقشه‌های Record<...> کلاینت).
 * کلیدها قرارداد /api/import/execute هستند. */

export interface StockFieldDef {
  key: string;
  label: string;
  required?: boolean;
  /** توضیح کوتاه برای نمایش در ویزارد */
  hint?: string;
  aliases: string[];
}

export const STOCK_FIELD_DEFS: StockFieldDef[] = [
  {
    key: "productSku",
    label: "کد کالا",
    hint: "کد کالای موجود در سیستم (اگر نام کالا را نگاشت نکنید، الزامی است)",
    aliases: [
      "کد کالا", "کد", "شناسه کالا", "شماره کالا", "کد جنس", "کد محصول", "کد کالا/خدمت",
      "کد کالای موجود", "sku", "code", "item code", "itemcode", "product code",
      "productcode", "part number", "partnumber", "part no", "partno", "item no", "itemno",
    ],
  },
  {
    key: "productName",
    label: "نام کالا",
    hint: "نام کالای موجود در سیستم (اگر کد کالا را نگاشت نکنید، الزامی است)",
    aliases: [
      "نام کالا", "شرح کالا", "نام جنس", "شرح جنس", "نام محصول", "کالا", "جنس",
      "کالا/خدمت", "عنوان", "name", "item name", "itemname", "product name",
      "productname", "goods name", "description",
    ],
  },
  {
    key: "warehouse",
    label: "انبار",
    hint: "خالی باشد، انبار پیش‌فرض سیستم استفاده می‌شود",
    aliases: [
      "انبار", "نام انبار", "انبار مورد نظر", "کد انبار", "شعبه", "محل نگهداری",
      "warehouse", "warehouse name", "store", "location", "depot",
    ],
  },
  {
    key: "quantity",
    label: "تعداد / موجودی",
    required: true,
    hint: "موجودی جدید کالا در انبار (عدد — اعشار مجاز است)",
    aliases: [
      "موجودی", "موجودي", "تعداد", "کمیت", "مقدار", "موجودی انبار", "موجودی کل",
      "موجودی فعلی", "تعداد موجود", "مانده کالا", "موجودی جدید", "تعداد واقعی",
      "quantity", "qty", "stock", "on hand", "onhand", "count", "inventory",
    ],
  },
  {
    key: "unitCost",
    label: "بهای هر واحد (ریال)",
    hint: "بهای تمام‌شده برای ثبت حرکت ورود موجودی",
    aliases: [
      "بهای تمام شده", "بهای تمام‌شده", "بهای خرید", "قیمت خرید", "فی خرید", "نرخ خرید",
      "بهای واحد", "قیمت واحد خرید", "unit cost", "unitcost", "cost", "cost price",
      "purchase price", "purchaseprice",
    ],
  },
];

/** کلیدهای مجاز نگاشت stock (قرارداد execute) */
export const STOCKABLE_FIELDS: readonly string[] = STOCK_FIELD_DEFS.map((f) => f.key);

/* ============================================================
 * تشخیص فرمت واقعی (magic bytes + پسوند) — با پشتیبانی xlsm/ods
 * ============================================================ */

function hasZipSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  );
}

function hasOleSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  );
}

export function detectAnalyzeFormat(bytes: Uint8Array, fileName: string): AnalyzeFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".ods") || lower.endsWith(".fods")) return "ods";
  if (lower.endsWith(".xlsm")) return "xlsm";
  if (hasZipSignature(bytes)) return "xlsx";
  if (hasOleSignature(bytes)) return "xls";
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".xls")) return "xls";
  if (lower.endsWith(".tsv")) return "tsv";
  if (lower.endsWith(".txt")) return "txt";
  if (lower.endsWith(".json")) return "json";
  return "csv";
}

/* ============================================================
 * خواندن ماتریس خام از هر فرمت
 * ============================================================ */

/** شمارش ردیف‌های هر شیت با !ref (سریع — بدون تبدیل کامل) */
function sheetRowCount(ws: XLSX.WorkSheet): number {
  const ref = ws["!ref"] as string | undefined;
  if (!ref) return 0;
  try {
    const range = XLSX.utils.decode_range(ref);
    return range.e.r - range.s.r + 1;
  } catch {
    return 0;
  }
}

function sheetToMatrix(ws: XLSX.WorkSheet): string[][] {
  // blankrows: true — ردیف‌های خالی حافظهٔ شیت حفظ می‌شوند تا «شمارهٔ ردیف مطلق»
  // (برای انتخاب ردیف هدر در UI) با آنچه کاربر در اکسل می‌بیند یکی باشد.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  }) as unknown[][];
  return matrix.map((row) => (row ?? []).map((c) => (c === null || c === undefined ? "" : String(c))));
}

/** JSON → ماتریس (آرایه‌ای از آبجکت‌ها یا { data: [...] }) */
function jsonToMatrix(parsed: unknown): string[][] {
  let arr: unknown[] | null = null;
  if (Array.isArray(parsed)) arr = parsed;
  else if (parsed && typeof parsed === "object") {
    const data = (parsed as Record<string, unknown>).data;
    if (Array.isArray(data)) arr = data;
  }
  if (!arr) {
    throw new ImportFileError(
      "ساختار JSON پشتیبانی نمی‌شود — باید آرایه‌ای از رکوردها (یا { data: [...] }) باشد"
    );
  }
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
  return matrix;
}

export interface RawWorkbook {
  format: AnalyzeFormat;
  encoding: string;
  delimiter: string;
  sheets: { name: string; rowCount: number }[];
  selectedSheet: string;
  matrix: string[][];
}

/**
 * خواندن ماتریس خام فایل (بدون هیچ حذف/تشخیص هدر):
 *  - انتخاب شیت: پارامتر صریح (نام یا شمارهٔ ۱-مبنا) یا پرردیف‌ترین شیت
 *  - متن: دیکد خودکار (UTF-8 / BOM / UTF-16 / Windows-1256) + جداکننده خودکار
 */
export function readRawWorkbook(
  bytes: Uint8Array,
  fileName: string,
  sheet?: string
): RawWorkbook {
  if (!bytes || bytes.length === 0) {
    throw new ImportFileError("فایل خالی است");
  }
  const format = detectAnalyzeFormat(bytes, fileName);

  /* ---------- XLSX / XLS / XLSM / ODS (SheetJS) ---------- */
  if (format === "xlsx" || format === "xls" || format === "xlsm" || format === "ods") {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(bytes, { type: "array", codepage: 65001 });
    } catch {
      if (format === "ods") {
        throw new ImportFileError(
          "فایل ODS قابل خواندن نیست — فایل را در LibreOffice/Excel باز کنید و با نوع ODS یا XLSX دوباره ذخیره کنید"
        );
      }
      throw new ImportFileError(
        "فایل اکسل قابل خواندن نیست — فایل را در اکسل باز کنید و با نوع xlsx/csv دوباره ذخیره کنید"
      );
    }
    const sheetNames = workbook.SheetNames ?? [];
    if (sheetNames.length === 0) {
      throw new ImportFileError("فایل اکسل هیچ شیتی ندارد");
    }
    const sheets = sheetNames.map((name) => ({
      name,
      rowCount: workbook.Sheets[name] ? sheetRowCount(workbook.Sheets[name]) : 0,
    }));

    // انتخاب شیت: پارامتر صریح (نام یا شمارهٔ ۱-مبنا) یا پرردیف‌ترین
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
      for (const s of sheets) {
        if (s.rowCount > bestCount) {
          bestCount = s.rowCount;
          selectedSheet = s.name;
        }
      }
    }
    const ws = workbook.Sheets[selectedSheet];
    if (!ws) {
      throw new ImportFileError(`شیت «${selectedSheet.slice(0, 30)}» قابل خواندن نیست`);
    }
    const matrix = sheetToMatrix(ws);
    if (matrix.length === 0) {
      throw new ImportFileError(
        `شیت «${selectedSheet.slice(0, 30)}» هیچ داده‌ای ندارد (شیت‌های فایل: ${sheetNames.slice(0, 6).join("، ")})`
      );
    }
    return { format, encoding: "", delimiter: "", sheets, selectedSheet, matrix };
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
    const matrix = jsonToMatrix(parsed);
    if (matrix.length <= 1) {
      throw new ImportFileError("فایل JSON هیچ ردیف داده‌ای ندارد");
    }
    return { format, encoding, delimiter: "", sheets: [], selectedSheet: "", matrix };
  }

  /* ---------- CSV / TSV / TXT (متن جداشده) ---------- */
  const { text, encoding } = decodeBuffer(bytes);
  const delimiter = detectDelimiter(text);
  const matrix = parseCsvMatrix(text, delimiter);
  if (matrix.length === 0) {
    throw new ImportFileError(
      `فایل بعد از دیکد خالی ماند (انکودینگ: ${encoding}) — فایل را با CSV UTF-8 دوباره ذخیره کنید`
    );
  }
  return { format, encoding, delimiter, sheets: [], selectedSheet: "", matrix };
}

/* ============================================================
 * استخراج جدول (هدر + داده) با پشتیبانی «ردیف هدر» صریح
 * ============================================================ */

export interface ExtractedTable {
  headers: string[];
  /** ردیف‌های داده هم‌تراز با headers */
  rows: string[][];
  /** ردیف هدر (۱-مبنا — مطلق در شیت/فایل؛ با احتساب ردیف‌های خالی ابتدایی) */
  headerRow: number;
  /** هدر عمومی «ستون ۱..N» تزریق شد (فایل بدون هدر) */
  headerInjected: boolean;
  junkRemoved: number;
  totalsRemoved: number;
}

/**
 * ماتریس خام → جدول تمیز:
 *  ۱) حذف ردیف‌های کاملاً خالیِ ابتدایی (ردیف هدر مطلق حفظ می‌شود)
 *  ۲) ردیف هدر: پارامتر صریح (forceHeaderRow — ۱-مبنا) یا تشخیص خودکار
 *  ۳) حذف ردیف‌های مزاحم (جداکننده/تکرار هدر/خالی)
 *  ۴) بازچینش قیمت‌های شکسته (فقط متن جداشده — reassemble)
 *  ۵) حذف سطر جمع کل فوتر
 */
export function extractTable(
  matrix: string[][],
  opts?: { forceHeaderRow?: number; reassemble?: boolean; delimiter?: string; encoding?: string }
): ExtractedTable {
  const reassemble = opts?.reassemble ?? false;
  if (!matrix || matrix.length === 0) {
    return {
      headers: [],
      rows: [],
      headerRow: 1,
      headerInjected: false,
      junkRemoved: 0,
      totalsRemoved: 0,
    };
  }

  // ۱) حذف ردیف‌های کاملاً خالی ابتدایی
  let start = 0;
  while (start < matrix.length && !(matrix[start] ?? []).some((c) => (c ?? "").trim() !== "")) {
    start++;
  }
  if (start >= matrix.length) {
    return {
      headers: [],
      rows: [],
      headerRow: 1,
      headerInjected: false,
      junkRemoved: 0,
      totalsRemoved: 0,
    };
  }

  // ۲) ردیف هدر: صریح یا خودکار
  let headerRowIdx: number; // ۰-مبنا مطلق
  let headerRow: string[] | null;
  let dataRows: string[][];
  let leadingTitleRows = 0; // FIX(v42-import-1): سطرهای عنوان ابتدایی
  const force = opts?.forceHeaderRow;
  if (force !== undefined && Number.isInteger(force) && force >= 1 && force <= matrix.length) {
    headerRowIdx = force - 1;
    headerRow = matrix[headerRowIdx] ?? [];
    dataRows = matrix.slice(headerRowIdx + 1);
    // اگر سطر اجباری خودش کاملاً خالی بود → مثل بی‌هدر
    if (!headerRow.some((c) => (c ?? "").trim() !== "")) {
      headerRow = null;
      dataRows = matrix.slice(headerRowIdx); // داده از خود این سطر
    }
  } else {
    const body = matrix.slice(start);
    /* FIX(v42-import-1): ردیف‌های «عنوان گزارش» ابتدای فایل نادیده گرفته
     * می‌شدند (مثل «گزارش كالاها - تاريخ 1403/05/12» یا «تهيه كننده: ...»)
     * و سطر اولِ باقی‌مانده به‌عنوان هدر انتخاب می‌شد → هدر = عنوان گزارش!
     * راه‌حل: پیش از تشخیص هدر، تا ۵ سطر ابتداییِ «کم‌پر» (نسبت سلول‌های
     * پرشان به عرض جدول، بسیار کمتر از میانگین ردیف‌های بعدی است و هدر هم
     * نیست) به‌عنوان سطر عنوان رد می‌شوند. */
    const width = Math.max(...body.slice(0, 40).map((r) => r?.length ?? 0), 1);
    const fillRatio = (r: string[] | undefined): number => {
      if (!r || r.length === 0) return 0;
      const nonEmpty = r.filter((c) => (c ?? "").trim() !== "").length;
      return nonEmpty / Math.max(width, r.length);
    };
    const rest = body.slice(1, 31);
    const restFill = rest.length
      ? rest.reduce((s, r) => s + fillRatio(r), 0) / rest.length
      : 1;
    let titleSkipped = 0;
    /** آیا این سطر «هدر واقعی» است؟ (تطابق دیکشنری هدرها — سطر عنوان گزارش
     *  معمولاً هیچ تطبیق دقیق ندارد؛ هدر واقعی حتی ناقص، حداقل یکی دارد) */
    const headerDictHits = (cells: string[] | undefined): number => {
      const nonEmpty = (cells ?? []).map((c) => (c ?? "").trim()).filter((c) => c !== "");
      if (nonEmpty.length === 0) return 0;
      return nonEmpty.filter((c) => normalizeHeaderKey(c) in HEADER_SEMANTICS).length;
    };
    while (
      titleSkipped < 5 &&
      titleSkipped + 1 < body.length &&
      fillRatio(body[titleSkipped]) <= 0.45 &&
      restFill - fillRatio(body[titleSkipped]) >= 0.25 &&
      headerDictHits(body[titleSkipped]) === 0
    ) {
      titleSkipped++;
    }
    const effStart = titleSkipped;
    const hasHeader = looksLikeHeaderRow(body[effStart] ?? [], body.slice(effStart + 1));
    if (hasHeader) {
      headerRowIdx = start + effStart;
      headerRow = body[effStart];
      dataRows = body.slice(effStart + 1);
      leadingTitleRows = effStart; // سطرهای عنوان — جزو مزاحم شمرده می‌شوند
    } else {
      headerRowIdx = start + effStart;
      headerRow = null;
      dataRows = body.slice(effStart);
      leadingTitleRows = effStart;
    }
  }

  // ۳) حذف ردیف‌های مزاحم
  let junkRemoved = leadingTitleRows;
  const keptRows: string[][] = [];
  for (const row of dataRows) {
    if (isJunkRow(row ?? [])) {
      junkRemoved++;
      continue;
    }
    keptRows.push(row ?? []);
  }

  // هدر عمومی در نبود هدر واقعی
  const maxWidth = Math.max(headerRow?.length ?? 0, ...keptRows.map((r) => r.length), 1);
  const finalHeader =
    headerRow && headerRow.some((c) => (c ?? "").trim() !== "")
      ? headerRow
      : Array.from({ length: maxWidth }, (_, i) => `ستون ${i + 1}`);

  // ۴) بازچینش + نرمال‌سازی هدرهای تکراری/خالی
  const table = matrixToTable([finalHeader, ...keptRows], {
    delimiter: opts?.delimiter,
    encoding: opts?.encoding,
    reassemble,
  });

  // ۵) حذف سطر جمع کل
  let totalsRemoved = 0;
  const nameKeys = nameHeaderKeys(table.headers);
  const cleanRows: Record<string, string>[] = [];
  for (const r of table.rows) {
    if (nameKeys.length > 0 && isTotalsRow(r, nameKeys)) {
      totalsRemoved++;
      continue;
    }
    cleanRows.push(r);
  }

  return {
    headers: table.headers,
    rows: cleanRows.map((r) => table.headers.map((h) => r[h] ?? "")),
    headerRow: headerRowIdx + 1,
    headerInjected: !(headerRow && headerRow.some((c) => (c ?? "").trim() !== "")),
    junkRemoved,
    totalsRemoved,
  };
}

/* ============================================================
 * پیشنهاد نگاشت برای هر هدف
 * ============================================================ */

/** هدف ویزارد → ImportEntityKind کتابخانهٔ مشترک (stock جداگانه هندل می‌شود) */
const UI_KIND_BY_TARGET: Record<Exclude<AnalyzeTarget, "stock">, ImportEntityKind> = {
  products: "products",
  parties: "customers",
  accounts: "accounts",
  journalEntries: "journalEntries",
};

/** پیشنهاد ستون‌به‌ستون برای ۴ هدف کتابخانه‌ای (همان منطق buildColumnSuggestions مسیر موجود) */
function suggestForLibKind(
  headers: string[],
  rows: string[][],
  kind: ImportEntityKind
): { suggestions: ColumnSuggestion[]; inferredCount: number } {
  const autoMap = autoDetectMapping(headers, kind); // field → header
  const headerToField = new Map<string, { field: string; inferred: boolean }>();
  for (const [field, header] of Object.entries(autoMap)) {
    if (header && !headerToField.has(header)) {
      headerToField.set(header, { field, inferred: false });
    }
  }
  // استنتاج از الگوی داده‌ها (نمونهٔ ۳۰۰ ردیف — سبک)
  const recordRows = rows.slice(0, 300).map((row) => {
    const rec: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) rec[headers[i]] = row[i] ?? "";
    return rec;
  });
  const inference = inferMappingFromData(headers, recordRows, kind, autoMap);
  for (const [field, header] of Object.entries(inference.mapping)) {
    if (!headerToField.has(header)) {
      headerToField.set(header, { field, inferred: true });
    }
  }

  const suggestions: ColumnSuggestion[] = headers.map((header, index) => {
    const assigned = headerToField.get(header);
    if (assigned) {
      const direct = suggestFieldForHeader(header, kind);
      const confidence: SuggestionConfidence = assigned.inferred
        ? "inferred"
        : direct?.field === assigned.field && direct.confidence === "exact"
          ? "exact"
          : "fuzzy";
      const reason = assigned.inferred
        ? inference.reasons[assigned.field] ?? "استنتاج از الگوی مقادیر ستون"
        : `تطبیق هدر با «${IMPORT_FIELD_DEFS[kind].find((f) => f.key === assigned.field)?.label ?? assigned.field}»`;
      return { index, field: assigned.field, confidence, reason };
    }
    const sem = headerField(header);
    if (sem === "ignore" || sem === "rowNo") {
      return {
        index,
        field: MAPPING_IGNORE,
        confidence: "exact",
        reason: "ستون کمکی/بی‌اثر — نادیده گرفته می‌شود",
      };
    }
    return {
      index,
      field: MAPPING_IGNORE,
      confidence: "none",
      reason: "هدر شناخته نشد — از لیست، فیلد مناسب را انتخاب کنید یا نادیده بگیرید",
    };
  });
  return { suggestions, inferredCount: Object.keys(inference.mapping).length };
}

/** تطبیق هدر با aliasهای فیلد stock (دقیق → شامل با بلندترین تطبیق) */
function stockFieldForHeader(header: string): { field: string; confidence: "exact" | "fuzzy"; alias: string } | null {
  const norm = normalizeHeaderKey(header);
  if (!norm) return null;
  // پاس ۱: تطابق دقیق
  for (const f of STOCK_FIELD_DEFS) {
    for (const alias of f.aliases) {
      if (normalizeHeaderKey(alias) === norm) {
        return { field: f.key, confidence: "exact", alias };
      }
    }
  }
  // پاس ۲: تطابق شامل — «بلندترین alias منطبق» برنده می‌شود تا «موجودی انبار
  // اصلی» به quantity (alias بلندتر «موجودی») برسد نه warehouse (alias کوتاه «انبار»)
  let best: { field: string; alias: string; naLen: number } | null = null;
  for (const f of STOCK_FIELD_DEFS) {
    for (const alias of f.aliases) {
      const na = normalizeHeaderKey(alias);
      if (na.length < 3) continue;
      if (norm.includes(na) || na.includes(norm)) {
        if (!best || na.length > best.naLen) {
          best = { field: f.key, alias, naLen: na.length };
        }
      }
    }
  }
  if (best) return { field: best.field, confidence: "fuzzy", alias: best.alias };
  return null;
}

/** پیشنهاد ستون‌به‌ستون برای هدف «موجودی انبار» (alias + استنتاج محتوایی) */
function suggestForStock(headers: string[], rows: string[][]): { suggestions: ColumnSuggestion[]; inferredCount: number } {
  const used = new Set<string>(); // هدرهای مصرف‌شده
  const perColumn: ColumnSuggestion[] = headers.map((header, index) => {
    const match = stockFieldForHeader(header);
    if (match) {
      used.add(header);
      return {
        index,
        field: match.field,
        confidence: match.confidence,
        reason: `تطبیق هدر با «${STOCK_FIELD_DEFS.find((f) => f.key === match.field)?.label}»`,
      };
    }
    const sem = headerField(header);
    if (sem === "ignore" || sem === "rowNo") {
      used.add(header);
      return { index, field: MAPPING_IGNORE, confidence: "exact", reason: "ستون کمکی/بی‌اثر — نادیده گرفته می‌شود" };
    }
    return { index, field: MAPPING_IGNORE, confidence: "none", reason: "هدر شناخته نشد — فیلد مناسب را انتخاب کنید" };
  });

  // استنتاج محتوایی (fallback) — فقط ستون‌های آزاد
  if (rows.length >= 3 && used.size < headers.length) {
    const recordRows = rows.slice(0, 200).map((row) => {
      const rec: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) rec[headers[i]] = row[i] ?? "";
      return rec;
    });
    const profiles = profileColumns(headers, recordRows);
    const free = profiles.filter((p) => !used.has(p.header) && p.filledRatio > 0.15);
    const take = (field: string, header: string, reason: string) => {
      const idx = headers.indexOf(header);
      if (idx >= 0) {
        perColumn[idx] = { index: idx, field, confidence: "inferred", reason };
        used.add(header);
      }
      const i = free.findIndex((p) => p.header === header);
      if (i >= 0) free.splice(i, 1);
    };
    const has = (f: string) => perColumn.some((c) => c.field === f);

    // نام کالا: متن فارسی طولانی با کاردینالیتی بالا
    if (!has("productName")) {
      const nameCol = free
        .filter((p) => p.persianRatio >= 0.5 && p.avgLen >= 3 && p.numericRatio < 0.5)
        .sort((a, b) => b.avgLen * b.persianRatio - a.avgLen * a.persianRatio)[0];
      if (nameCol) take("productName", nameCol.header, "ستون با متن فارسیِ طولانی");
    }
    // تعداد: عددی (کوچک/متوسط) با پرشدن بالا
    if (!has("quantity")) {
      const qtyCol = free
        .filter((p) => p.numericRatio >= 0.8 && p.bigNumericRatio < 0.6 && p.filledRatio >= 0.3)
        .sort((a, b) => a.avgNumeric - b.avgNumeric)[0];
      if (qtyCol) take("quantity", qtyCol.header, "ستون عددی (کمیت/تعداد)");
    }
    // انبار: متن کم‌کاردینالیتی
    if (!has("warehouse")) {
      const whCol = free
        .filter((p) => p.persianRatio >= 0.6 && p.distinct >= 1 && p.distinctRatio <= 0.5 && p.avgLen <= 30)
        .sort((a, b) => a.distinctRatio - b.distinctRatio)[0];
      if (whCol) take("warehouse", whCol.header, "مقادیر تکرارشوندهٔ محدود (نام انبار)");
    }
    // بهای واحد: عددی بزرگ
    if (!has("unitCost")) {
      const costCol = free
        .filter((p) => p.numericRatio >= 0.7 && p.avgNumeric >= 1000)
        .sort((a, b) => b.avgNumeric - a.avgNumeric)[0];
      if (costCol) take("unitCost", costCol.header, "اعداد بزرگ (بهای تمام‌شده)");
    }
  }

  const inferredCount = perColumn.filter((c) => c.confidence === "inferred").length;
  return { suggestions: perColumn, inferredCount };
}

/** پیشنهاد نگاشت برای یک هدف */
export function suggestForTarget(
  headers: string[],
  rows: string[][],
  target: AnalyzeTarget
): { suggestions: ColumnSuggestion[]; inferredCount: number } {
  if (target === "stock") return suggestForStock(headers, rows);
  return suggestForLibKind(headers, rows, UI_KIND_BY_TARGET[target]);
}

/* ============================================================
 * تشخیص نوع هدف (detectedTarget)
 * ============================================================ */

/** امتیاز هدف «موجودی انبار» از روی هدرها — وزنهٔ «انبار» بالاتر است چون
 *  فایل کالا ستون انبار ندارد. قانون تکمیلی: ستون «انبار» + نبودِ ستون
 *  قیمت = فایل موجودی انبار (فایل کالا همیشه قیمت دارد) */
export function stockTargetScore(headers: string[]): number {
  let score = 0;
  let hasWarehouseExact = false;
  for (const h of headers) {
    const match = stockFieldForHeader(h);
    if (!match) continue;
    const weight = match.field === "warehouse" ? 4 : match.field === "quantity" ? 3 : 2;
    score += match.confidence === "exact" ? weight : Math.max(1, weight - 1);
    if (match.field === "warehouse" && match.confidence === "exact") hasWarehouseExact = true;
  }
  // قانون تشخیصی: ستون انبار صریح + هیچ ستون قیمتی → فایل موجودی انبار است
  if (hasWarehouseExact) {
    const hasPriceCol = headers.some((h) => /price|قیمت|في|فی|نرخ/.test(normalizeHeaderKey(h)));
    if (!hasPriceCol) score += 20;
  }
  return score;
}

export interface TargetGuess {
  target: AnalyzeTarget | null;
  scores: Record<AnalyzeTarget, number>;
}

/** حدس نوع هدف فایل از روی هدرها (بین ۵ هدف ویزارد) */
export function guessAnalyzeTarget(headers: string[]): TargetGuess {
  // امتیاز ۴ هدف کتابخانه‌ای از guessEntityFromHeaders (کلاینت‌سیف) — اینجا
  // معادل سرور همان تابع را با autoDetectMapping بازسازی می‌کنیم
  const scores: Record<AnalyzeTarget, number> = {
    products: 0,
    parties: 0,
    accounts: 0,
    journalEntries: 0,
    stock: stockTargetScore(headers),
  };
  const normHeaders = headers.map((h) => normalizeHeaderKey(h));
  const kinds: { target: Exclude<AnalyzeTarget, "stock">; kind: ImportEntityKind }[] = [
    { target: "products", kind: "products" },
    { target: "parties", kind: "customers" },
    { target: "accounts", kind: "accounts" },
    { target: "journalEntries", kind: "journalEntries" },
  ];
  for (const { target, kind } of kinds) {
    let s = 0;
    for (const field of IMPORT_FIELD_DEFS[kind]) {
      const weight = field.required ? 3 : 1;
      for (const alias of field.aliases) {
        const na = normalizeHeaderKey(alias);
        if (!na) continue;
        if (normHeaders.some((h) => h === na)) {
          s += weight * 2; // تطابق دقیق
          break;
        }
      }
    }
    for (const field of IMPORT_FIELD_DEFS[kind]) {
      if (field.hidden) continue;
      const weight = field.required ? 2 : 1;
      for (const alias of field.aliases) {
        const na = normalizeHeaderKey(alias);
        if (na.length <= 2) continue;
        if (normHeaders.some((h) => h.includes(na))) {
          s += weight;
          break;
        }
      }
    }
    scores[target] = s;
  }

  let best: AnalyzeTarget | null = null;
  let bestScore = 0;
  let runnerUp = 0;
  for (const t of ANALYZE_TARGETS) {
    if (scores[t] > bestScore) {
      runnerUp = bestScore;
      best = t;
      bestScore = scores[t];
    } else if (scores[t] > runnerUp) {
      runnerUp = scores[t];
    }
  }
  // آستانهٔ محافظه‌کارانهٔ ۱.۳ برابر — هدرهای حسابداری فارسی بین موجودیت‌ها
  // مشترک‌اند (کد/نام/مانده)؛ چون ویزارد پیشنهاد همهٔ اهداف را هم‌زمان دارد و
  // کاربر می‌تواند هدف را عوض کند، تشخیص فقط «پیش‌انتخاب» است نه قفل
  if (best && bestScore >= 4 && bestScore >= runnerUp * 1.3) return { target: best, scores };
  return { target: null, scores };
}

/* ============================================================
 * تحلیل کامل فایل (analyze) — خروجی API
 * ============================================================ */

export interface AnalyzeResult {
  file: {
    name: string;
    sizeBytes: number;
    format: AnalyzeFormat;
    encoding: string;
    delimiter: string;
    /** برچسب فارسی جداکننده (برای نمایش) */
    delimiterLabel: string;
  };
  /** شیت‌های فایل اکسل با تعداد ردیف (خالی برای سایر فرمت‌ها) */
  sheets: { name: string; rowCount: number }[];
  selectedSheet: string;
  /** ردیف هدر (۱-مبنا) — تشخیص‌داده‌شده یا اجباری از پارامتر */
  headerRow: number;
  /** ردیف‌های خام ابتدایی برای انتخاب ردیف هدر در UI */
  rawPreview: { row: number; cells: string[] }[];
  /** هدرهای نهایی (پاک‌شده/یکتاشده) */
  headers: string[];
  /** ۵ ردیف اولِ داده (هم‌تراز با headers) */
  sampleRows: string[][];
  /** نمونهٔ مقادیر هر ستون (اولین ۵ مقدار غیرخالی) */
  columnSamples: string[][];
  totalRows: number;
  headerInjected: boolean;
  junkRemoved: number;
  totalsRemoved: number;
  /** حدس نوع هدف (null = نامشخص) */
  detectedTarget: AnalyzeTarget | null;
  targetScores: Record<AnalyzeTarget, number>;
  /** پیشنهاد نگاشت برای هر ۵ هدف (تغییر هدف در UI بدون آپلود مجدد) */
  suggestions: Record<AnalyzeTarget, ColumnSuggestion[]>;
  inferredCounts: Record<AnalyzeTarget, number>;
  /** قالب تاریخ غالب ستون‌های تاریخ‌دار */
  dateFormat: "jalali" | "gregorian" | "mixed" | "none";
}

const DELIMITER_LABELS: Record<string, string> = {
  ",": "کاما ( , )",
  ";": "سمی‌کالن ( ; )",
  "\t": "Tab",
  "|": "خط عمودی ( | )",
};

export interface AnalyzeOptions {
  sheet?: string;
  /** ردیف هدر اجباری (۱-مبنا) — ندادید = تشخیص خودکار */
  headerRow?: number;
  /** حداکثر ردیف خام پیش‌نمایش (پیش‌فرض ۸) */
  rawPreviewCount?: number;
}

/** تحلیل کامل فایل درون‌ریزی — موتور مشترک analyze/execute */
export function analyzeImportFile(
  bytes: Uint8Array,
  fileName: string,
  opts: AnalyzeOptions = {}
): AnalyzeResult {
  const raw = readRawWorkbook(bytes, fileName, opts.sheet);
  const reassemble = raw.format === "csv" || raw.format === "tsv" || raw.format === "txt";
  const table = extractTable(raw.matrix, {
    forceHeaderRow: opts.headerRow,
    reassemble,
    delimiter: raw.delimiter,
    encoding: raw.encoding,
  });

  const rawPreviewCount = opts.rawPreviewCount ?? 8;
  const rawPreview = raw.matrix.slice(0, rawPreviewCount).map((cells, i) => ({
    row: i + 1,
    cells: (cells ?? []).map((c) => {
      const s = String(c ?? "").trim();
      return s.length > 40 ? `${s.slice(0, 37)}…` : s;
    }),
  }));

  const sampleRows = table.rows.slice(0, 5);
  const samples = table.headers.map((_, i) => columnSamples(table.rows, i, 5));

  const guess = guessAnalyzeTarget(table.headers);
  const suggestions = {} as Record<AnalyzeTarget, ColumnSuggestion[]>;
  const inferredCounts = {} as Record<AnalyzeTarget, number>;
  for (const t of ANALYZE_TARGETS) {
    const s = suggestForTarget(table.headers, table.rows, t);
    suggestions[t] = s.suggestions;
    inferredCounts[t] = s.inferredCount;
  }

  // قالب تاریخ غالب (برای نمایش در پیش‌نمایش)
  const jalaliRe = /^1[2-6]\d{2}[-/.]\d{1,2}[-/.]\d{1,2}$/;
  const gregorianRe = /^(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}$/;
  const normalize = (s: string) =>
    s
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .trim();
  let jalali = 0;
  let gregorian = 0;
  for (const row of table.rows.slice(0, 300)) {
    for (const c of row) {
      const v = normalize(c ?? "");
      if (!v) continue;
      if (jalaliRe.test(v)) jalali++;
      else if (gregorianRe.test(v)) gregorian++;
    }
  }
  const dateFormat: AnalyzeResult["dateFormat"] =
    jalali > 0 && gregorian > 0 ? "mixed" : jalali > 0 ? "jalali" : gregorian > 0 ? "gregorian" : "none";

  return {
    file: {
      name: fileName,
      sizeBytes: bytes.length,
      format: raw.format,
      encoding: raw.encoding,
      delimiter: raw.delimiter,
      delimiterLabel: raw.delimiter ? (DELIMITER_LABELS[raw.delimiter] ?? raw.delimiter) : "",
    },
    sheets: raw.sheets,
    selectedSheet: raw.selectedSheet,
    headerRow: table.headerRow,
    rawPreview,
    headers: table.headers,
    sampleRows,
    columnSamples: samples,
    totalRows: table.rows.length,
    headerInjected: table.headerInjected,
    junkRemoved: table.junkRemoved,
    totalsRemoved: table.totalsRemoved,
    detectedTarget: guess.target,
    targetScores: guess.scores,
    suggestions,
    inferredCounts,
    dateFormat,
  };
}

/** پارس جدول برای اجرای درون‌ریزی (execute) — همان خط لوله تحلیل */
export function parseImportTableForExecute(
  bytes: Uint8Array,
  fileName: string,
  opts: { sheet?: string; headerRow?: number } = {}
): { headers: string[]; rows: string[][]; totalRows: number; format: AnalyzeFormat } {
  const raw = readRawWorkbook(bytes, fileName, opts.sheet);
  const reassemble = raw.format === "csv" || raw.format === "tsv" || raw.format === "txt";
  const table = extractTable(raw.matrix, {
    forceHeaderRow: opts.headerRow,
    reassemble,
    delimiter: raw.delimiter,
    encoding: raw.encoding,
  });
  return {
    headers: table.headers,
    rows: table.rows,
    totalRows: table.rows.length,
    format: raw.format,
  };
}

/** نوع ParsedImportFile برای سازگاری با import-formats (re-export) */
export type { ParsedImportFile };
