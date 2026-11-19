import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/auth";
import { invalidateDashboardCache } from "@/lib/cache";
import { requireUser } from "@/lib/user-auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { jalaliToGregorian, toEnglishDigits, toPersianDigits, gregorianToJalali } from "@/lib/persian";
import {
  matchAccount,
  findCounterAccount,
  findFallbackAccount,
  normalizeFa,
  type AccountLite,
} from "@/lib/smart-account-mapper";

export const runtime = "nodejs";

/**
 * ============ سند هوشمند (Task R14-C) ============
 * POST /api/accounting/smart-doc — multipart/form-data
 *   فیلدها: mode ("preview" | "commit")، options (JSON رشته‌ای)، files (تا ۱۰ فایل)
 *
 * چرخهٔ کار:
 *  ۱) حسابدار فایل‌های اکسل/CSV (صورتحساب بانک، لیست فروش/خرید/هزینه، دفتر کل،
 *     خروجی هلو/سپیدار) را یکجا آپلود می‌کند.
 *  ۲) سرور هر فایل را می‌خواند: نوع سند (bank/ledger/sales/purchase/expense/holoo)
 *     و نقش ستون‌ها را خودکار تشخیص می‌دهد (تطبیق فازی هدرهای فارسی/عربی).
 *  ۳) هر ردیف با قواعد کلیدواژه‌ای lib/smart-account-mapper.ts به حساب کدینگ
 *     نگاشت می‌شود؛ ردیف‌های تک‌مبلغی (صورتحساب بانکی) به‌صورت زوج متقابل با
 *     حساب بانک/صندوق تراز می‌شوند.
 *  ۴) preview → کارت پیش‌نمایش (نوع سند، ستون‌ها، تراز، هشدارها، نگاشت حساب‌ها)
 *     commit → یک JournalEntry به‌ازای هر فایل با status=DRAFT (بازبینی در
 *     هستهٔ حسابداری) + شمارهٔ اتمیک DocumentSequence.
 *
 * قرارداد واحد پول: مبالغ فایل به «تومان» فرض می‌شوند (قابل تغییر با
 * options.amountUnit) و مثل POST /api/accounting/journal-entries با ×۱۰ به
 * ریال (BigInt) ذخیره می‌شوند.
 *
 * سقف‌ها: ۱۰ فایل × ۵MB، ۵٬۰۰۰ ردیف در هر فایل، rate-limit ۲۰ درخواست/دقیقه.
 */

const MAX_FILES = 10;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ROWS_PER_FILE = 5000;
const MAX_SAMPLE_ROWS = 10;
const ALLOWED_EXT = [".xlsx", ".xls", ".csv"];

// ============ انواع ============

type ColumnRole =
  | "date"
  | "description"
  | "debit"
  | "credit"
  | "amount"
  | "reference"
  | "account"
  | "balance";

type DocType = "bank" | "ledger" | "sales" | "purchase" | "expense" | "holoo" | "generic";

const DOC_TYPE_LABEL: Record<DocType, string> = {
  bank: "صورتحساب بانکی",
  ledger: "دفتر کل / سند",
  sales: "لیست فروش",
  purchase: "لیست خرید",
  expense: "لیست هزینه‌ها",
  holoo: "خروجی هلو/سپیدار",
  generic: "جدول عمومی",
};

export interface SmartDocOptions {
  defaultDescription?: string;
  amountUnit?: "toman" | "rial";
  fallbackAccountId?: string;
  counterAccountId?: string;
  files?: Record<
    string,
    {
      columnOverrides?: Record<string, string | number | null>;
      counterAccountId?: string;
      fallbackAccountId?: string;
      accountOverrides?: Record<string, string>;
    }
  >;
}

interface ParsedRowInput {
  date: Date | null;
  dateRaw: string;
  description: string;
  debitToman: number | null; // مقدار ستون بدهکار (مثبت)
  creditToman: number | null; // مقدار ستون بستانکار (مثبت)
  amountToman: number | null; // مقدار ستون مبلغ (علامت‌دار)
  reference: string;
  accountName: string;
}

interface BuiltLine {
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  ruleId: string | null;
  ruleLabel: string | null;
  debitToman: number;
  creditToman: number;
  description: string;
  isCounter: boolean;
}

interface FileAnalysis {
  fileName: string;
  fileSize: number;
  sheetName: string;
  docType: DocType;
  headers: string[];
  detectedColumns: Partial<Record<ColumnRole, string>>;
  rows: Array<ParsedRowInput & { rowNo: number }>;
  rowCount: number;
  skippedRows: number;
  warnings: string[];
  error?: string;
}

interface FilePreview {
  fileName: string;
  fileSize: number;
  sheetName: string;
  docType: DocType;
  docTypeLabel: string;
  headers: string[];
  detectedColumns: Partial<Record<ColumnRole, string>>;
  rowCount: number;
  skippedRows: number;
  unmappedCount: number;
  totalDebitToman: number;
  totalCreditToman: number;
  balanced: boolean;
  warnings: string[];
  sampleRows: Array<{
    rowNo: number;
    dateJalali: string;
    description: string;
    debitToman: number;
    creditToman: number;
    accountName: string | null;
    accountCode: string | null;
    ruleLabel: string | null;
    mapped: boolean;
  }>;
  accountBreakdown: Array<{
    ruleId: string | null;
    ruleLabel: string | null;
    accountId: string | null;
    accountCode: string | null;
    accountName: string | null;
    count: number;
    totalToman: number;
  }>;
  suggestedCounterAccountId: string | null;
  counterAccountName: string | null;
  entryDateISO: string | null;
  lineCount: number;
  error?: string;
}

// ============ نرمال‌سازی هدر (الگوی موجود import/route.ts) ============

function normalizeHeader(h: unknown): string {
  return toEnglishDigits(String(h ?? ""))
    .replace(/\uFEFF/g, "")
    .replace(/[\u200c\u200f\u200e\u0640]/g, "")
    .replace(/[_]/g, " ")
    .replace(/\u064a/g, "\u06cc")
    .replace(/\u0643/g, "\u06a9")
    .replace(/[\u0623\u0625\u0622]/g, "\u0627")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ============ نقش ستون‌ها — نگاشت فازی (الگوی HEADER_MAP موجود + گسترش) ============

const ROLE_HEADER_MAP: Array<{ role: ColumnRole; keys: string[] }> = [
  {
    role: "date",
    keys: [
      "تاریخ", "تاريخ", "زمان", "تاریخ تراکنش", "تاریخ سند", "تاریخ عملیات",
      "تاریخ فاکتور", "تاریخ ثبت", "تاریخ صدور", "تاریخ برگه", "تاریخ میلادی",
      "تاریخ شمسی", "date", "transaction date", "doc date", "invoice date",
    ],
  },
  {
    role: "description",
    keys: [
      "شرح", "شرح سند", "شرح تراکنش", "شرح عملیات", "شرح حساب", "شرح کالا",
      "توضیحات", "بیان", "ملاحظات", "یادداشت", "شرح آرتیکل", "عنوان",
      "description", "particulars", "details", "narration", "memo", "remark",
    ],
  },
  {
    role: "debit",
    keys: [
      "بدهکار", "بدهكار", "برداشت", "برداشت از حساب", "withdrawal", "withdraw",
      "debit", "debtor", "bedehkar",
    ],
  },
  {
    role: "credit",
    keys: [
      "بستانکار", "بستانكار", "واریز", "واریز به حساب", "deposit", "credit",
      "creditor", "bestankar",
    ],
  },
  {
    role: "amount",
    keys: [
      "مبلغ", "مبلغ تراکنش", "مبلغ کل", "مبلغ فاکتور", "جمع کل", "جمع مبلغ",
      "مبلغ نهایی", "قیمت کل", "مبلغ عملیات", "amount", "total", "sum",
      "value",
    ],
  },
  {
    role: "reference",
    keys: [
      "شماره پیگیری", "پیگیری", "شماره مرجع", "شماره سند", "شماره فاکتور",
      "شماره ارجاع", "شماره", "شماره تراکنش", "trace", "reference", "ref",
      "doc no", "document no", "invoice no",
    ],
  },
  {
    role: "account",
    keys: [
      "کد حساب", "حساب", "نام حساب", "حساب معین", "کد حساب معین", "لودجر",
      "account", "account name", "ledger", "account code", "کد معین",
    ],
  },
  {
    role: "balance",
    keys: ["مانده", "مانده حساب", "balance", "remaining"],
  },
];

/** تشخیص نقش هر هدر — اولین تطبیق دقیق، سپس شامل */
function detectColumns(headers: string[]): Partial<Record<ColumnRole, number>> {
  const normalized = headers.map((h) => normalizeHeader(h));
  const result: Partial<Record<ColumnRole, number>> = {};
  for (const { role, keys } of ROLE_HEADER_MAP) {
    // ۱) تطبیق دقیق (اولویت) — «کد حساب» بر «حساب» مقدم است
    for (let i = 0; i < normalized.length; i++) {
      if (normalized[i] === "" || result[role] !== undefined) continue;
      const compact = normalized[i].replace(/\s+/g, "");
      if (
        keys.some((k) => {
          const nk = normalizeHeader(k).replace(/\s+/g, "");
          return nk && compact === nk;
        })
      ) {
        result[role] = i;
      }
    }
    // ۲) تطبیق شامل
    if (result[role] === undefined) {
      for (let i = 0; i < normalized.length; i++) {
        if (normalized[i] === "") continue;
        const compact = normalized[i].replace(/\s+/g, "");
        if (
          compact.length >= 3 &&
          keys.some((k) => {
            const nk = normalizeHeader(k).replace(/\s+/g, "");
            return nk.length >= 3 && (compact.includes(nk) || nk.includes(compact));
          })
        ) {
          // ستونِ قبلاً اختصاص‌یافته به نقش دیگر را نگیر
          const taken = Object.values(result).includes(i);
          if (!taken) {
            result[role] = i;
            break;
          }
        }
      }
    }
  }
  return result;
}

// ============ تشخیص نوع سند ============

function detectDocType(
  headers: string[],
  fileName: string,
  colMap: Partial<Record<ColumnRole, number>>
): DocType {
  const headerText = headers.map((h) => normalizeHeader(h)).join(" ");
  const fileText = normalizeHeader(fileName);
  const hasDebit = colMap.debit !== undefined || /بدهکار|بدهكار|برداشت/.test(headerText);
  const hasCredit = colMap.credit !== undefined || /بستانکار|بستانكار|واریز/.test(headerText);
  const hasBalance = colMap.balance !== undefined || /مانده/.test(headerText);
  const hasAccount = colMap.account !== undefined || /کد حساب|حساب معین/.test(headerText);
  const hasAmount = colMap.amount !== undefined;

  // هلو/سپیدار: هدرهای خاص با ي/ك عربی (بعد از نرمال‌سازی یکسان می‌شوند)
  const holooSignals = ["رديف", "گروه اصلي", "گروه فرعي"].filter((k) =>
    headerText.includes(normalizeHeader(k))
  ).length;
  if (holooSignals >= 2 && hasDebit && hasCredit) return "holoo";

  // صورتحساب بانکی: بدهکار/بستانکار یا واریز/برداشت + مانده/پیگیری یا نام فایل
  const bankFile = /صورتحساب|بانک|بانك|bank|statement/.test(fileText);
  const bankSignals = /شماره پیگیری|پیگیری|شعبه|شبا|شماره حساب|شماره کارت/.test(headerText);
  if ((hasDebit || hasCredit) && (hasBalance || bankSignals || bankFile)) {
    return "bank";
  }
  if ((hasDebit && hasCredit) || (hasAmount && hasDebit) || (hasAmount && hasCredit)) {
    if (hasAccount) return "ledger";
  }
  if (/خرید/.test(headerText) || /خرید/.test(fileText)) return "purchase";
  if (/فروش/.test(headerText) || /فروش/.test(fileText)) return "sales";
  if (/هزینه|خرج/.test(headerText) || /هزینه|expense/.test(fileText)) return "expense";
  if (hasAmount) return "generic";
  if (hasDebit && hasCredit) return "ledger";
  return "generic";
}

// ============ پارس تاریخ منعطف (گسترش الگوی bank-statement) ============

function parseFlexibleDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // سریال اکسل — ۲۰۰۰۰..۸۰۰۰۰ ≈ ۱۹۵۴..۲۰۱۹+ (۲۵۵۶۹ = ۱۹۷۰-۰۱-۰۱)
    if (raw > 20000 && raw < 80000) {
      const ms = Math.round((raw - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
    }
    return null;
  }
  const s = toEnglishDigits(String(raw).trim()).replace(/[-.]/g, "/").trim();
  if (!s) return null;
  const datePart = s.split(/\s+|T/)[0] || "";
  const m = datePart.match(/^(\d{1,4})\/(\d{1,2})(?:\/(\d{1,4}))?$/);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = m[3] !== undefined ? Number(m[3]) : null;
  const mk = (y: number, mo: number, d: number): Date | null => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, mo - 1, d, 12, 0, 0); // ظهر — جلوگیری از شیفت UTC
    return Number.isNaN(dt.getTime()) ? null : dt;
  };
  if (c === null) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // سال اول (YYYY/MM/DD) — میلادی یا شمسی
  if (a > 1600) return mk(a, b, c);
  if (a >= 1200 && a <= 1600) {
    if (b < 1 || b > 12 || c < 1 || c > 31) return null;
    const [gy, gm, gd] = jalaliToGregorian(a, b, c);
    return mk(gy, gm, gd);
  }
  // سال آخر (DD/MM/YYYY) — میلادی یا شمسی
  if (c > 1600) return mk(c, b, a);
  if (c >= 1200 && c <= 1600) {
    if (b < 1 || b > 12 || a < 1 || a > 31) return null;
    const [gy, gm, gd] = jalaliToGregorian(c, b, a);
    return mk(gy, gm, gd);
  }
  return null;
}

// ============ پارس مبلغ (الگوی bank-statement + جداکننده‌های یونیکد) ============

function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = toEnglishDigits(String(raw))
    .replace(/[٬،\s\u00A0\u200C\u200E\u200F]/g, "")
    .replace(/[٫/]/g, ".")
    .replace(/[^\d.\-]/g, "");
  if (!s || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ============ خواندن فایل → ماتریس ردیف‌ها ============

function readSheetMatrix(
  buf: ArrayBuffer
): { sheetName: string; rows: unknown[][] } | { error: string } {
  try {
    const wb = XLSX.read(buf, { type: "array", codepage: 65001, cellDates: true });
    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      return { error: "فایل هیچ شیتی ندارد" };
    }
    // شیتِ با بیشترین ردیف (الگوی موجود data-import-export)
    let best: { sheetName: string; rows: unknown[][] } | null = null;
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const m = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: true,
        defval: "",
        blankrows: false,
      });
      const rowCount = Array.isArray(m) ? m.length : 0;
      if (rowCount > (best?.rows.length ?? 0)) {
        best = { sheetName, rows: m };
      }
    }
    if (!best || best.rows.length === 0) {
      return { error: "فایل خالی است یا ردیف قابل خواندن ندارد" };
    }
    return best;
  } catch {
    return {
      error:
        "فایل قابل خواندن نیست — فایل را در اکسل باز کنید و با نوع xlsx/csv ذخیره کنید",
    };
  }
}

/** یافتن ردیف هدر در ۸ ردیف اول — ردیفی با بیشترین هدرهای شناخته‌شده */
function findHeaderRow(rows: unknown[][]): number {
  let bestIdx = 0;
  let bestScore = -1;
  const limit = Math.min(rows.length, 8);
  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] ?? []).map((c) => normalizeHeader(c));
    let score = 0;
    for (const { keys } of ROLE_HEADER_MAP) {
      if (cells.some((c) => c && keys.some((k) => normalizeHeader(k) === c))) score += 2;
      else if (
        cells.some((c) => c.length >= 3 && keys.some((k) => c.includes(normalizeHeader(k))))
      )
        score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  // اگر هیچ هدر شناخته‌شده‌ای نبود، ردیف اول
  return bestScore >= 2 ? bestIdx : 0;
}

// ============ تحلیل یک فایل ============

function analyzeFile(
  fileName: string,
  fileSize: number,
  buf: ArrayBuffer,
  fileOptions: NonNullable<SmartDocOptions["files"]>[string]
): FileAnalysis {
  const sheet = readSheetMatrix(buf);
  if ("error" in sheet) {
    return {
      fileName,
      fileSize,
      sheetName: "",
      docType: "generic",
      headers: [],
      detectedColumns: {},
      rows: [],
      rowCount: 0,
      skippedRows: 0,
      warnings: [sheet.error],
      error: sheet.error,
    };
  }

  const headerIdx = findHeaderRow(sheet.rows);
  const headerRow = sheet.rows[headerIdx] ?? [];
  const headers = headerRow.map((h) => String(h ?? "").trim());
  const dataRows = sheet.rows.slice(headerIdx + 1).slice(0, MAX_ROWS_PER_FILE);

  // ستون‌ها: خودکار + override کاربر (نام هدر یا اندیس)
  const colMap = detectColumns(headers);
  const overrides = fileOptions.columnOverrides ?? {};
  for (const [role, value] of Object.entries(overrides)) {
    const r = role as ColumnRole;
    if (value === null || value === "" || value === "none") {
      delete colMap[r];
      continue;
    }
    let idx = -1;
    if (typeof value === "number" && Number.isInteger(value)) {
      idx = value;
    } else {
      const wanted = normalizeHeader(String(value));
      idx = headers.findIndex((h) => normalizeHeader(h) === wanted);
    }
    if (idx >= 0 && idx < headers.length) colMap[r] = idx;
    else delete colMap[r];
  }

  const docType = detectDocType(headers, fileName, colMap);
  const warnings: string[] = [];
  const rows: Array<ParsedRowInput & { rowNo: number }> = [];
  let skipped = 0;
  let invalidDates = 0;
  let missingAmounts = 0;

  const get = (cells: unknown[], role: ColumnRole): unknown => {
    const idx = colMap[role];
    if (idx === undefined || idx >= cells.length) return "";
    return cells[idx];
  };

  dataRows.forEach((rawRow, i) => {
    const cells = Array.isArray(rawRow) ? rawRow : [];
    const rowNo = headerIdx + 2 + i; // شمارهٔ ردیف واقعی فایل

    // ردیف کاملاً خالی → رد
    const nonEmpty = cells.some((c) => c !== "" && c !== null && c !== undefined);
    if (!nonEmpty) {
      skipped++;
      return;
    }

    const dateVal = get(cells, "date");
    const dateRaw = dateVal instanceof Date ? "" : String(dateVal ?? "").trim();
    let date: Date | null = null;
    if (dateVal instanceof Date) date = dateVal;
    else date = parseFlexibleDate(dateVal);
    if (!date) {
      invalidDates++;
      date = new Date(); // تاریخ امروز + هشدار بعداً
    }

    const description = String(get(cells, "description") ?? "").trim().slice(0, 300);
    const debitRaw = parseAmount(get(cells, "debit"));
    const creditRaw = parseAmount(get(cells, "credit"));
    const amountRaw = parseAmount(get(cells, "amount"));
    const reference = String(get(cells, "reference") ?? "").trim().slice(0, 80);
    const accountName = String(get(cells, "account") ?? "").trim().slice(0, 200);

    const debitToman = debitRaw !== null && debitRaw !== 0 ? Math.abs(debitRaw) : null;
    const creditToman = creditRaw !== null && creditRaw !== 0 ? Math.abs(creditRaw) : null;
    const hasMoney =
      debitToman !== null ||
      creditToman !== null ||
      (amountRaw !== null && amountRaw !== 0);
    if (!hasMoney) {
      missingAmounts++;
      skipped++;
      return;
    }

    rows.push({
      rowNo,
      date,
      dateRaw,
      description,
      debitToman,
      creditToman,
      amountToman: amountRaw,
      reference,
      accountName,
    });
  });

  if (invalidDates > 0) {
    warnings.push(
      `${toPersianDigits(invalidDates)} ردیف تاریخ نامعتبر دارد — از تاریخ امروز استفاده شد`
    );
  }
  if (missingAmounts > 0) {
    warnings.push(`مبالغ ناقص: ${toPersianDigits(missingAmounts)} ردیف رد شد`);
  }
  if (colMap.date === undefined) {
    warnings.push("ستون تاریخ شناسایی نشد — برای همهٔ ردیف‌ها از تاریخ امروز استفاده شد");
  }
  if (colMap.description === undefined) {
    warnings.push("ستون شرح شناسایی نشد — شرح پیش‌فرض اعمال می‌شود");
  }
  if (sheet.rows.length - 1 > MAX_ROWS_PER_FILE) {
    warnings.push(
      `فایل بیش از ${toPersianDigits(MAX_ROWS_PER_FILE)} ردیف دارد — فقط ${toPersianDigits(MAX_ROWS_PER_FILE)} ردیف اول پردازش شد`
    );
  }

  return {
    fileName,
    fileSize,
    sheetName: sheet.sheetName,
    docType,
    headers,
    detectedColumns: Object.fromEntries(
      Object.entries(colMap).map(([role, idx]) => [role, headers[idx as number] ?? String(idx)])
    ) as Partial<Record<ColumnRole, string>>,
    rows,
    rowCount: rows.length,
    skippedRows: skipped,
    warnings,
  };
}

// ============ ساخت خطوط سند از ردیف‌ها (تراز‌سازی هوشمند) ============

interface BuildContext {
  accounts: AccountLite[];
  accountOverrides: Record<string, string>;
  fallbackAccount: AccountLite | null;
  counterAccount: AccountLite | null;
  defaultDescription: string;
}

/** جستجوی حساب صریح از ستون «حساب» — تطبیق کد یا نام */
function findAccountByText(text: string, accounts: AccountLite[]): AccountLite | null {
  const t = normalizeFa(text);
  if (!t) return null;
  const compact = t.replace(/\s+/g, "");
  if (!compact) return null;
  for (const a of accounts) {
    if (normalizeFa(a.code) === compact) return a;
  }
  for (const a of accounts) {
    if (normalizeFa(a.name).replace(/\s+/g, "") === compact) return a;
  }
  // R14-J1 FIX(BUG-08): تطبیق زیررشته‌ای امتیازی — «بانک» هم در «… — صندوق» و هم
  // «… — بانک» هست و قبلاً اولین نتیجه (صندوق ۱۱۰۱) برمی‌گشت و ردیفِ بانک به
  // حساب صندوق می‌رفت (سند بی‌معنی: صندوق بدهکار/بستانکار خودش). حالا:
  // ۱) نامی که «به» متن ختم می‌شود (مثل «— بانک») اولویت دارد؛ ۲) بعد دیگر
  // contains ها به‌ترتیب کد.
  let containsMatch: AccountLite | null = null;
  for (const a of accounts) {
    const n = normalizeFa(a.name).replace(/\s+/g, "");
    if (n.includes(compact)) {
      if (n.endsWith(compact)) return a;
      if (!containsMatch) containsMatch = a;
    }
  }
  return containsMatch;
}

function buildLines(analysis: FileAnalysis, ctx: BuildContext): BuiltLine[] {
  const lines: BuiltLine[] = [];
  const accounts = ctx.accounts;
  const fallback = ctx.fallbackAccount;

  for (const row of analysis.rows) {
    const desc =
      row.description ||
      (row.reference ? `تراکنش ${row.reference}` : ctx.defaultDescription);

    // حساب مقصد: ستون حساب صریح → نگاشت کلیدواژه‌ای شرح → fallback
    let target: {
      accountId: string | null;
      accountCode: string | null;
      accountName: string | null;
      ruleId: string | null;
      ruleLabel: string | null;
    };
    if (row.accountName) {
      const explicit = findAccountByText(row.accountName, accounts);
      if (explicit) {
        target = {
          accountId: explicit.id,
          accountCode: explicit.code,
          accountName: explicit.name,
          ruleId: null,
          ruleLabel: "حساب صریح فایل",
        };
      } else {
        const m = matchAccount(
          `${row.accountName} ${desc}`,
          accounts,
          ctx.accountOverrides
        );
        target = {
          accountId: m.accountId ?? fallback?.id ?? null,
          accountCode: m.accountCode ?? fallback?.code ?? null,
          accountName: m.accountName ?? fallback?.name ?? null,
          ruleId: m.ruleId,
          ruleLabel: m.ruleLabel,
        };
      }
    } else {
      const m = matchAccount(desc, accounts, ctx.accountOverrides);
      target = {
        accountId: m.accountId ?? fallback?.id ?? null,
        accountCode: m.accountCode ?? fallback?.code ?? null,
        accountName: m.accountName ?? fallback?.name ?? null,
        ruleId: m.ruleId,
        ruleLabel: m.ruleLabel,
      };
    }

    const counter = ctx.counterAccount;
    const mkCounterLine = (debit: number, credit: number): BuiltLine => ({
      accountId: counter?.id ?? fallback?.id ?? null,
      accountCode: counter?.code ?? fallback?.code ?? null,
      accountName: counter?.name ?? fallback?.name ?? null,
      ruleId: null,
      ruleLabel: null,
      debitToman: debit,
      creditToman: credit,
      description: desc,
      isCounter: true,
    });
    const mkTargetLine = (debit: number, credit: number): BuiltLine => ({
      accountId: target.accountId,
      accountCode: target.accountCode,
      accountName: target.accountName,
      ruleId: target.ruleId,
      ruleLabel: target.ruleLabel,
      debitToman: debit,
      creditToman: credit,
      description: desc,
      isCounter: false,
    });

    // ---------- صورتحساب بانکی: هر ردیف یک گردش، زوج متقابل با بانک ----------
    if (analysis.docType === "bank") {
      const amount =
        row.debitToman ??
        (row.creditToman !== null ? row.creditToman : null) ??
        Math.abs(row.amountToman ?? 0);
      if (amount > 0) {
        // بدهکارِ صورتحساب = برداشت → بستانکار بانک / بدهکار حساب مقصد
        const isWithdrawal =
          row.debitToman !== null ||
          (row.amountToman !== null && row.amountToman < 0) ||
          (!row.debitToman &&
            !row.creditToman &&
            /برداشت|پرداخت|خرج|کارمزد/.test(normalizeFa(desc)));
        if (isWithdrawal) {
          lines.push(mkCounterLine(0, amount)); // بستانکار بانک
          lines.push(mkTargetLine(amount, 0)); // بدهکار حساب مقصد (هزینه/پرداختنی)
        } else {
          lines.push(mkCounterLine(amount, 0)); // بدهکار بانک
          lines.push(mkTargetLine(0, amount)); // بستانکار حساب مقصد (درآمد/دریافتنی)
        }
      }
      continue;
    }

    // ---------- دفتر کل: ردیف‌های دولتیه (بدهکار + بستانکار مجزا) ----------
    if (row.debitToman !== null || row.creditToman !== null) {
      if (row.debitToman !== null && row.debitToman > 0) {
        lines.push(mkTargetLine(row.debitToman, 0));
      }
      if (row.creditToman !== null && row.creditToman > 0) {
        lines.push(mkTargetLine(0, row.creditToman));
      }
      continue;
    }

    // ---------- تک‌مبلغی: فروش/خرید/هزینه/عمومی — زوج متقابل تراز ----------
    const amount = Math.abs(row.amountToman ?? 0);
    if (amount <= 0) continue;
    const negative = (row.amountToman ?? 0) < 0;
    switch (analysis.docType) {
      case "sales":
        // فروش: بدهکار تنخواه/بانک/دریافتنی — بستانکار فروش
        lines.push(mkCounterLine(amount, 0));
        lines.push(mkTargetLine(0, amount));
        break;
      case "purchase":
      case "expense":
        // خرید/هزینه: بدهکار حساب مقصد — بستانکار تنخواه/بانک/پرداختنی
        lines.push(mkTargetLine(amount, 0));
        lines.push(mkCounterLine(0, amount));
        break;
      default:
        if (negative) {
          lines.push(mkTargetLine(0, amount));
          lines.push(mkCounterLine(amount, 0));
        } else {
          lines.push(mkTargetLine(amount, 0));
          lines.push(mkCounterLine(0, amount));
        }
    }
  }

  return lines;
}

// ============ کدینگ پیش‌فرض ایرانی (R14-C) ============
// اگر tenant حسابی نداشته باشد، این کدینگِ عملیاتی را یک‌بار می‌سازیم.
// نام حساب‌ها با کلیدواژه‌های lib/smart-account-mapper.ts هم‌راستاست تا
// نگاشت خودکار ردیف‌های اکسل به حساب‌ها از همان اول کار کند.
const DEFAULT_COA: Array<{
  group: { code: string; name: string; type: string; nature: string };
  accounts: Array<{ code: string; name: string; nature: string }>;
}> = [
  {
    group: { code: "1", name: "دارایی‌ها", type: "BALANCE_SHEET", nature: "DEBIT" },
    accounts: [
      { code: "1101", name: "موجودی نقد و بانک — صندوق", nature: "DEBIT" },
      { code: "1102", name: "موجودی نقد و بانک — بانک", nature: "DEBIT" },
      { code: "1103", name: "بدهکاران تجاری (مطالبات)", nature: "DEBIT" },
      { code: "1104", name: "موجودی مواد و کالا", nature: "DEBIT" },
      { code: "1105", name: "هزینه‌های پیش‌پرداخت", nature: "DEBIT" },
      { code: "1201", name: "دارایی‌های ثابت مشهود", nature: "DEBIT" },
    ],
  },
  {
    group: { code: "2", name: "بدهی‌ها", type: "BALANCE_SHEET", nature: "CREDIT" },
    accounts: [
      { code: "2101", name: "بستانکاران تجاری (بدهی‌ها)", nature: "CREDIT" },
      { code: "2102", name: "حقوق پرداختنی پرسنل", nature: "CREDIT" },
      { code: "2103", name: "مالیات و عوارض پرداختنی", nature: "CREDIT" },
    ],
  },
  {
    group: { code: "3", name: "حقوق مالکانه", type: "BALANCE_SHEET", nature: "CREDIT" },
    accounts: [
      { code: "3101", name: "سرمایه", nature: "CREDIT" },
    ],
  },
  {
    group: { code: "4", name: "درآمدها", type: "PROFIT_LOSS", nature: "CREDIT" },
    accounts: [
      { code: "4101", name: "فروش و درآمد عملیات", nature: "CREDIT" },
      { code: "4102", name: "سایر درآمدها", nature: "CREDIT" },
      { code: "4103", name: "تخفیفات فروش", nature: "DEBIT" },
    ],
  },
  {
    group: { code: "5", name: "هزینه‌ها", type: "PROFIT_LOSS", nature: "DEBIT" },
    accounts: [
      { code: "5101", name: "بهای تمام‌شده خرید و کالا", nature: "DEBIT" },
      { code: "5102", name: "حقوق و دستمزد پرسنل", nature: "DEBIT" },
      { code: "5103", name: "اجاره", nature: "DEBIT" },
      { code: "5104", name: "آب و برق و گاز و تلفن", nature: "DEBIT" },
      { code: "5105", name: "کارمزد و کمیسیون بانکی", nature: "DEBIT" },
      { code: "5106", name: "مالیات و ارزش افزوده هزینه‌ای", nature: "DEBIT" },
      { code: "5107", name: "سایر هزینه‌های عمومی", nature: "DEBIT" },
    ],
  },
];

/** کدینگ پیش‌فرض را برای tenant می‌سازد (اگر خالی باشد). خروجی: تعداد حساب ایجادشده */
async function ensureDefaultPersianCoa(tenantId: string): Promise<number> {
  const existing = await db.account.count({ where: { tenantId } });
  if (existing > 0) return 0;
  let created = 0;
  for (let i = 0; i < DEFAULT_COA.length; i++) {
    const def = DEFAULT_COA[i];
    const group = await db.accountGroup.create({
      data: {
        tenantId,
        code: def.group.code,
        name: def.group.name,
        type: def.group.type,
        nature: def.group.nature,
        order: i + 1,
      },
    });
    for (const acc of def.accounts) {
      await db.account.create({
        data: {
          tenantId,
          code: acc.code,
          name: acc.name,
          groupId: group.id,
          nature: acc.nature,
          balanceType: "DETAIL",
        },
      });
      created++;
    }
  }
  return created;
}

// ============ POST اصلی ============

export async function POST(req: NextRequest) {
  try {
    // ---------- احراز هویت (الگوی import/route.ts) ----------
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { userId, tenantId } = auth.user;

    // ---------- rate limit ----------
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`smart-doc:${ip}`, 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." },
        { status: 429 }
      );
    }

    // ---------- خواندن multipart ----------
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: "درخواست باید multipart/form-data باشد" },
        { status: 400 }
      );
    }

    const mode = String(form.get("mode") ?? "preview");
    if (mode !== "preview" && mode !== "commit") {
      return NextResponse.json(
        { success: false, error: "mode باید preview یا commit باشد" },
        { status: 400 }
      );
    }

    let options: SmartDocOptions = {};
    const optionsRaw = form.get("options");
    if (typeof optionsRaw === "string" && optionsRaw.trim()) {
      try {
        options = JSON.parse(optionsRaw) as SmartDocOptions;
      } catch {
        return NextResponse.json(
          { success: false, error: "ساختار options نامعتبر است" },
          { status: 400 }
        );
      }
    }

    // ---------- فایل‌ها ----------
    const fileEntries = form.getAll("files").filter((f): f is File => f instanceof File);
    if (fileEntries.length === 0) {
      return NextResponse.json(
        { success: false, error: "هیچ فایلی ارسال نشده است" },
        { status: 400 }
      );
    }
    if (fileEntries.length > MAX_FILES) {
      return NextResponse.json(
        {
          success: false,
          error: `حداکثر ${toPersianDigits(MAX_FILES)} فایل در هر درخواست — فایل‌ها را گروهی ارسال کنید`,
        },
        { status: 400 }
      );
    }
    for (const f of fileEntries) {
      const lower = f.name.toLowerCase();
      if (!ALLOWED_EXT.some((ext) => lower.endsWith(ext))) {
        return NextResponse.json(
          {
            success: false,
            error: `فرمت فایل «${f.name}» پشتیبانی نمی‌شود — فقط xlsx/xls/csv`,
          },
          { status: 400 }
        );
      }
      if (f.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          {
            success: false,
            error: `حجم فایل «${f.name}» بیش از ${toPersianDigits(5)} مگابایت است`,
          },
          { status: 400 }
        );
      }
    }

    // ---------- کدینگ حساب‌های tenant ----------
    const [accountRows, groupRows] = await Promise.all([
      db.account.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, code: true, name: true, nature: true, groupId: true },
        orderBy: { code: "asc" },
      }),
      db.accountGroup.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);
    const groupNameById = new Map(groupRows.map((g) => [g.id, g.name]));
    const accounts: AccountLite[] = accountRows.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      nature: a.nature,
      groupName: groupNameById.get(a.groupId),
    }));

    if (accounts.length === 0) {
      // R14-C: کدینگ خالی → به‌جای خطا، کدینگ استاندارد ایرانی را خودکار می‌سازیم
      // تا حسابدارِ تازه‌وارد بلافاصله بتواند اکسلش را سند کند.
      const seeded = await ensureDefaultPersianCoa(tenantId);
      if (seeded > 0) {
        const [accountRows2, groupRows2] = await Promise.all([
          db.account.findMany({
            where: { tenantId, deletedAt: null },
            select: { id: true, code: true, name: true, nature: true, groupId: true },
            orderBy: { code: "asc" },
          }),
          db.accountGroup.findMany({
            where: { tenantId, deletedAt: null },
            select: { id: true, name: true },
          }),
        ]);
        const groupNameById2 = new Map(groupRows2.map((g) => [g.id, g.name]));
        accounts.push(
          ...accountRows2.map((a) => ({
            id: a.id,
            code: a.code,
            name: a.name,
            nature: a.nature,
            groupName: groupNameById2.get(a.groupId),
          }))
        );
      }
      if (accounts.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              "ایجاد کدینگ پیش‌فرض ناموفق بود — لطفاً ابتدا در «هسته حسابداری» حساب‌ها را تعریف کنید",
          },
          { status: 400 }
        );
      }
    }

    const autoFallback = findFallbackAccount(accounts);
    const defaultFallback =
      accounts.find((a) => a.id === options.fallbackAccountId) ?? autoFallback;

    const amountUnit = options.amountUnit === "rial" ? "rial" : "toman";
    const defaultDescription =
      (options.defaultDescription ?? "").trim() || "سند هوشمند — ایمپورت فایل";

    // ---------- تحلیل هر فایل ----------
    const analyses: FileAnalysis[] = [];
    for (const f of fileEntries) {
      const buf = await f.arrayBuffer();
      const fileOptions = options.files?.[f.name] ?? {};
      analyses.push(analyzeFile(f.name, f.size, buf, fileOptions));
    }

    // ---------- ساخت خطوط + پیش‌نمایش ----------
    const previews: FilePreview[] = [];
    const builtPerFile: Array<{ analysis: FileAnalysis; lines: BuiltLine[] }> = [];

    for (const analysis of analyses) {
      if (analysis.error) {
        previews.push({
          fileName: analysis.fileName,
          fileSize: analysis.fileSize,
          sheetName: "",
          docType: analysis.docType,
          docTypeLabel: DOC_TYPE_LABEL[analysis.docType],
          headers: [],
          detectedColumns: {},
          rowCount: 0,
          skippedRows: analysis.skippedRows,
          unmappedCount: 0,
          totalDebitToman: 0,
          totalCreditToman: 0,
          balanced: false,
          warnings: analysis.warnings,
          sampleRows: [],
          accountBreakdown: [],
          suggestedCounterAccountId: null,
          counterAccountName: null,
          entryDateISO: null,
          lineCount: 0,
          error: analysis.error,
        });
        builtPerFile.push({ analysis, lines: [] });
        continue;
      }

      const fileOptions = options.files?.[analysis.fileName] ?? {};
      const accountOverrides = fileOptions.accountOverrides ?? {};
      const fallbackAccount =
        accounts.find((a) => a.id === fileOptions.fallbackAccountId) ?? defaultFallback;

      // حساب متقابل: انتخاب کاربر → تشخیص خودکار (بانک/صندوق)
      const counterFromUser =
        accounts.find((a) => a.id === fileOptions.counterAccountId) ??
        accounts.find((a) => a.id === options.counterAccountId);
      const autoCounter = counterFromUser
        ? { account: counterFromUser }
        : findCounterAccount(accounts, analysis.fileName);
      const counterAccount = autoCounter.account ?? null;
      const needsCounter =
        analysis.docType === "bank" ||
        analysis.docType === "sales" ||
        analysis.docType === "purchase" ||
        analysis.docType === "expense" ||
        analysis.rows.some((r) => r.debitToman === null && r.creditToman === null);

      const ctx: BuildContext = {
        accounts,
        accountOverrides,
        fallbackAccount,
        counterAccount,
        defaultDescription,
      };
      const lines = buildLines(analysis, ctx);
      builtPerFile.push({ analysis, lines });

      const totalDebit = lines.reduce((s, l) => s + l.debitToman, 0);
      const totalCredit = lines.reduce((s, l) => s + l.creditToman, 0);
      const balanced = totalDebit === totalCredit && totalDebit > 0;

      const warnings = [...analysis.warnings];
      if (needsCounter && counterAccount === null) {
        warnings.push(
          "حساب بانک/صندوق در کدینگ یافت نشد — ردیف‌های متقابل به حساب موقت می‌روند"
        );
      }
      if (!balanced) {
        warnings.push(
          `تراز نیست — بدهکار ${toPersianDigits(totalDebit.toLocaleString("en-US"))} / بستانکار ${toPersianDigits(totalCredit.toLocaleString("en-US"))} تومان؛ این فایل ثبت نمی‌شود مگر با بازبینی`
        );
      }
      const unmapped = lines.filter((l) => !l.isCounter && !l.accountId).length;
      if (unmapped > 0) {
        warnings.push(
          `${toPersianDigits(unmapped)} قلم حساب شناسایی‌نشده دارد — در «تنظیم نگاشت حساب‌ها» تعیین کنید`
        );
      }

      // تاریخ ردیف‌ها به‌ازای خطوط (متقابل + مقصد) برای نمونه‌ها
      const dateByLineIdx = new Map<string, string>();
      let lineCursor = 0;
      for (const row of analysis.rows) {
        const [jy, jm, jd] = gregorianToJalali(
          row.date.getFullYear(),
          row.date.getMonth() + 1,
          row.date.getDate()
        );
        const jalali = `${toPersianDigits(jy)}/${toPersianDigits(String(jm).padStart(2, "0"))}/${toPersianDigits(String(jd).padStart(2, "0"))}`;
        const perRowCount = analysis.docType === "ledger" ? 1 : 2;
        for (let k = 0; k < perRowCount; k++) {
          dateByLineIdx.set(String(lineCursor), jalali);
          lineCursor++;
        }
      }

      const sampleRows = lines.slice(0, MAX_SAMPLE_ROWS).map((l, i) => ({
        rowNo: i + 1,
        dateJalali: dateByLineIdx.get(String(i)) ?? "",
        description: l.description,
        debitToman: l.debitToman,
        creditToman: l.creditToman,
        accountName: l.accountName,
        accountCode: l.accountCode,
        ruleLabel: l.isCounter ? "حساب متقابل (بانک/صندوق)" : l.ruleLabel,
        mapped: Boolean(l.accountId),
      }));

      // تجزیه بر اساس حساب (فقط خطوط مقصد — متقابل‌ها مشخص‌اند)
      const breakdownMap = new Map<string, FilePreview["accountBreakdown"][number]>();
      for (const l of lines) {
        if (l.isCounter) continue;
        const key = `${l.ruleId ?? "none"}:${l.accountId ?? "none"}`;
        const cur =
          breakdownMap.get(key) ??
          {
            ruleId: l.ruleId,
            ruleLabel: l.ruleLabel,
            accountId: l.accountId,
            accountCode: l.accountCode,
            accountName: l.accountName,
            count: 0,
            totalToman: 0,
          };
        cur.count += 1;
        cur.totalToman += Math.max(l.debitToman, l.creditToman);
        breakdownMap.set(key, cur);
      }
      const accountBreakdown = [...breakdownMap.values()].sort(
        (a, b) => b.totalToman - a.totalToman
      );

      // تاریخ سند = تاریخ شایع‌ترین ردیف
      const dateCounter = new Map<string, number>();
      for (const r of analysis.rows) {
        const k = toLocalISO(r.date);
        dateCounter.set(k, (dateCounter.get(k) ?? 0) + 1);
      }
      const commonDate =
        [...dateCounter.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      previews.push({
        fileName: analysis.fileName,
        fileSize: analysis.fileSize,
        sheetName: analysis.sheetName,
        docType: analysis.docType,
        docTypeLabel: DOC_TYPE_LABEL[analysis.docType],
        headers: analysis.headers,
        detectedColumns: analysis.detectedColumns,
        rowCount: analysis.rowCount,
        skippedRows: analysis.skippedRows,
        unmappedCount: unmapped,
        totalDebitToman: totalDebit,
        totalCreditToman: totalCredit,
        balanced,
        warnings,
        sampleRows,
        accountBreakdown,
        suggestedCounterAccountId: counterAccount?.id ?? null,
        counterAccountName: counterAccount?.name ?? null,
        entryDateISO: commonDate,
        lineCount: lines.length,
      });
    }

    // ---------- preview: پاسخ و پایان ----------
    if (mode === "preview") {
      return NextResponse.json({
        success: true,
        mode: "preview",
        amountUnit,
        fallbackAccountId: defaultFallback?.id ?? null,
        accounts: accounts.map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          nature: a.nature,
          groupName: a.groupName ?? null,
        })),
        files: previews,
      });
    }

    // ---------- commit: ساخت JournalEntry به‌ازای هر فایل تراز ----------
    const fiscalYear = await db.fiscalYear.findFirst({
      where: { tenantId, isCurrent: true },
    });

    const { nextDocumentNumber } = await import("@/lib/document-sequence");

    const created: Array<{
      fileName: string;
      entryId: string;
      number: number;
      lineCount: number;
      dateISO: string;
      description: string;
    }> = [];
    const skippedFiles: Array<{ fileName: string; reason: string }> = [];
    const unitFactor = amountUnit === "rial" ? 1 : 10; // تومان → ریال

    for (let i = 0; i < builtPerFile.length; i++) {
      const { analysis, lines } = builtPerFile[i];
      const preview = previews[i];

      if (analysis.error || lines.length === 0) {
        skippedFiles.push({
          fileName: analysis.fileName,
          reason: analysis.error ?? "ردیف قابل پردازشی ندارد",
        });
        continue;
      }
      if (!preview.balanced) {
        skippedFiles.push({
          fileName: analysis.fileName,
          reason: "سند تراز نیست — جمع بدهکار و بستانکار برابر نیست",
        });
        continue;
      }
      const unmapped = lines.filter((l) => !l.accountId);
      if (unmapped.length > 0) {
        skippedFiles.push({
          fileName: analysis.fileName,
          reason: `${toPersianDigits(unmapped.length)} قلم حساب نگاشت‌نشده دارد — ابتدا نگاشت حساب‌ها را کامل کنید`,
        });
        continue;
      }

      // شمارهٔ اتمیک سند (الگوی journal-entries — DocumentSequence)
      const { seq: nextNumber } = await nextDocumentNumber("JOURNAL", tenantId);

      const entryDate = preview.entryDateISO
        ? new Date(`${preview.entryDateISO}T12:00:00`)
        : new Date();
      const entryDescription = (
        options.defaultDescription?.trim() || `سند هوشمند — ${analysis.fileName}`
      ).slice(0, 300);

      // فشرده‌سازی خطوط: حساب‌های یکسان جمع می‌شوند (سند تمیزتر)
      const compactMap = new Map<
        string,
        { accountId: string; debit: number; credit: number; description: string }
      >();
      for (const l of lines) {
        if (!l.accountId) continue;
        const cur = compactMap.get(l.accountId);
        if (cur) {
          cur.debit += l.debitToman;
          cur.credit += l.creditToman;
        } else {
          compactMap.set(l.accountId, {
            accountId: l.accountId,
            debit: l.debitToman,
            credit: l.creditToman,
            description: l.description.slice(0, 300),
          });
        }
      }
      const compactLines = [...compactMap.values()].map((l) => ({
        ...l,
        debit: Math.round(l.debit * unitFactor),
        credit: Math.round(l.credit * unitFactor),
      }));
      // ترازِ نهایی بعد از فشرده‌سازی/گرد کردن — ایمنی
      const cd = compactLines.reduce((s, l) => s + l.debit, 0);
      const cc = compactLines.reduce((s, l) => s + l.credit, 0);
      if (cd !== cc) {
        skippedFiles.push({
          fileName: analysis.fileName,
          reason: "خطای تراز داخلی بعد از فشرده‌سازی خطوط",
        });
        continue;
      }

      const entry = await db.journalEntry.create({
        data: {
          tenantId,
          number: nextNumber,
          date: Number.isNaN(entryDate.getTime()) ? new Date() : entryDate,
          type: "JOURNAL",
          description: entryDescription,
          status: "DRAFT", // در انتظار بازبینی در هسته حسابداری
          fiscalYearId: fiscalYear?.id ?? null,
          createdBy: userId ?? null,
          lines: {
            create: compactLines.map((l) => ({
              tenantId,
              accountId: l.accountId,
              debit: BigInt(l.debit), // ریال (BigInt — قرارداد JournalLine)
              credit: BigInt(l.credit),
              description: l.description,
            })),
          },
        },
      });

      created.push({
        fileName: analysis.fileName,
        entryId: entry.id,
        number: entry.number,
        lineCount: compactLines.length,
        dateISO: toLocalISO(entry.date),
        description: entry.description,
      });
    }

    if (created.length > 0) {
      await auditLog({
        tenantId,
        userId,
        action: "SMART_DOC_COMMIT",
        entity: "JournalEntry",
        entityId: created[0].entryId,
        changes: {
          files: created.length,
          skipped: skippedFiles.length,
          entries: created.map((c) => ({ number: c.number, file: c.fileName })),
        },
        req,
      });
      invalidateDashboardCache(tenantId);
    }

    const totalLines = created.reduce((s, c) => s + c.lineCount, 0);
    return NextResponse.json({
      success: true,
      mode: "commit",
      created,
      skipped: skippedFiles,
      message:
        created.length === 0
          ? "هیچ سندی ثبت نشد"
          : `${toPersianDigits(created.length)} سند پیش‌نویس با ${toPersianDigits(totalLines.toLocaleString("en-US"))} قلم ثبت شد — پس از بررسی در «هسته حسابداری»، سند را قطعی کنید`,
    });
  } catch (error) {
    console.error("smart-doc error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در پردازش سند هوشمند" },
      { status: 500 }
    );
  }
}

/** کمک‌کننده: ISO محلی بدون شیفت UTC */
function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ============ GET — راهنمای سریع قرارداد API ============
export async function GET() {
  return NextResponse.json({
    success: true,
    endpoint: "/api/accounting/smart-doc",
    method: "POST (multipart/form-data)",
    fields: {
      mode: "preview | commit",
      files: `تا ${toPersianDigits(MAX_FILES)} فایل xlsx/xls/csv هرکدام حداکثر ۵ مگابایت`,
      options: JSON.stringify({
        defaultDescription: "سند هوشمند — ایمپورت فایل",
        amountUnit: "toman | rial (پیش‌فرض toman)",
        fallbackAccountId: "شناسهٔ حساب موقت برای قلم‌های شناسایی‌نشده",
        counterAccountId: "شناسهٔ حساب بانک/صندوق متقابل",
        files: {
          "example.xlsx": {
            columnOverrides: { date: "تاریخ", debit: "برداشت", credit: "واریز" },
            accountOverrides: { payroll: "accountId", rent: "accountId" },
            fallbackAccountId: "accountId",
            counterAccountId: "accountId",
          },
        },
      }),
    },
    flow: "۱) preview → ۲) بازبینی/اصلاح ستون‌ها و نگاشت حساب‌ها → ۳) commit",
  });
}
