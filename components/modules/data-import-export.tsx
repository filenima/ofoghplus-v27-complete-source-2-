"use client";

/* ============================================================
 * components/modules/data-import-export.tsx — Task 6
 * ویزارد ۴ مرحله‌ای درون‌ریزی پیشرفته + صادرکرد + تاریخچه
 * ============================================================
 * مراحل ویزارد:
 *   ۱) آپلود فایل — کشیدن‌ورهاکردن، همهٔ فرمت‌ها
 *      (XLSX / XLS / XLSM / ODS / CSV / TSV / TXT / JSON)
 *   ۲) انتخاب شیت و هدر — شیت‌های اکسل، «ردیف هدر» دستی، پیش‌نمایش زنده
 *   ۳) نگاشت ستون‌ها — برای «هر فیلد هدف» یک دراپ‌داون از ستون‌های فایل؛
 *      پیشنهاد خودکار با بج «خودکار»، فیلد الزامیِ نگاشت‌نشده قرمز،
 *      پیش‌نمایش نتیجهٔ نگاشت، «به یاد سپردن نگاشت» برای دفعات بعد
 *   ۴) اجرا و نتیجه — پیش‌اجرای آزمایشی (dryRun) بدون ذخیره، اجرای واقعی،
 *      نوار پیشرفت، داشبورد نتیجه (ایجاد/به‌روزرسانی/رد/خطا)، جدول خطاها
 *      با شماره ردیف و «دریافت گزارش خطاها (CSV)»
 *
 * API:
 *   POST /api/import/analyze — پارس + پیشنهاد نگاشت برای هر ۵ هدف
 *   POST /api/import/execute — اجرای واقعی/آزمایشی با نگاشت {فیلد: ستون}
 * ============================================================ */

import * as React from "react";
import {
  Upload,
  Download,
  FileSpreadsheet,
  FileJson,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Package,
  Users,
  Landmark,
  BookOpen,
  Boxes,
  Loader2,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Wand2,
  Save,
  Trash2,
  Info,
  FileDown,
  RotateCcw,
  Sparkles,
  Database,
  Table2,
  ChevronDown,
  CircleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toPersianDigits, toJalali } from "@/lib/persian";
import { authFetch, getAuthToken } from "@/lib/auth-fetch";
import { useToast } from "@/hooks/use-toast";
/* خروجی اکسل + قالب نمونه — بستهٔ xlsx (سمت کلاینت) */
import * as XLSX from "xlsx";
/* تعریف فیلدها/aliasها — منبع یگانه (کلاینت/سرور) */
import { IMPORT_FIELD_DEFS } from "@/lib/import-parser";
/* فیلدهای هدف «موجودی انبار» + انواع مشترک تحلیل */
import { STOCK_FIELD_DEFS, type AnalyzeTarget } from "@/lib/import-analyze";

/* ============================================================
 * انواع
 * ============================================================ */

type ImportEntity = AnalyzeTarget; // products | parties | accounts | journalEntries | stock
type ExportFormat = "csv" | "csv-excel" | "json" | "xlsx";
type StepId = 1 | 2 | 3 | 4;

interface AnalyzeColumnSuggestion {
  index: number;
  field: string;
  confidence: "exact" | "fuzzy" | "inferred" | "none";
  reason: string;
}

interface AnalyzeData {
  file: { name: string; sizeBytes: number; format: string; encoding: string; delimiter: string; delimiterLabel: string };
  sheets: { name: string; rowCount: number }[];
  selectedSheet: string;
  headerRow: number;
  rawPreview: { row: number; cells: string[] }[];
  headers: string[];
  sampleRows: string[][];
  columnSamples: string[][];
  totalRows: number;
  headerInjected: boolean;
  junkRemoved: number;
  totalsRemoved: number;
  detectedTarget: AnalyzeTarget | null;
  targetScores: Record<string, number>;
  suggestions: Record<string, AnalyzeColumnSuggestion[]>;
  inferredCounts: Record<string, number>;
  dateFormat: string;
}

interface ExecuteResult {
  success: boolean;
  error?: string;
  mode?: "validate" | "import";
  totalRows?: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
  skippedRows: { row: number; message: string }[];
}

interface ImportHistoryEntry {
  id: string;
  entity: ImportEntity;
  fileName: string;
  totalRows: number;
  successRows: number;
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
  errorRows: number;
  date: string;
  status: "success" | "partial" | "failed";
}

/* ============================================================
 * متادیتای اهداف — ۵ نوع درون‌ریزی ویزارد
 * ============================================================ */

const TARGET_META: Record<ImportEntity, { label: string; icon: React.ElementType; description: string }> = {
  products: {
    label: "کالاها و خدمات",
    icon: Package,
    description: "نام، قیمت‌ها، بارکد، دسته‌بندی، موجودی اولیه",
  },
  parties: {
    label: "مشتریان و تأمین‌کنندگان",
    icon: Users,
    description: "نام، موبایل، کد ملی، آدرس، مانده اولیه",
  },
  accounts: {
    label: "حساب‌ها (کدینگ)",
    icon: Landmark,
    description: "ساختار کل/معین/تفصیلی با طبیعت و مانده",
  },
  journalEntries: {
    label: "اسناد حسابداری",
    icon: BookOpen,
    description: "هر ردیف = آرتیکل سند (بدهکار/بستانکار)",
  },
  stock: {
    label: "موجودی انبار",
    icon: Boxes,
    description: "تنظیم موجودی کالاهای موجود در انبار",
  },
};

interface FieldDefUI {
  key: string;
  label: string;
  required?: boolean;
  hidden?: boolean;
  hint?: string;
}

/** فیلدهای قابل نگاشت هر هدف — منبع یگانه: lib/import-parser + lib/import-analyze */
function fieldDefs(entity: ImportEntity): FieldDefUI[] {
  if (entity === "stock") return STOCK_FIELD_DEFS;
  const libDefs =
    IMPORT_FIELD_DEFS[entity === "parties" ? "customers" : entity] ?? [];
  return libDefs as FieldDefUI[];
}

/** گروه‌بندی نمایشی فیلدها (فیلدهای hidden → «فیلدهای پیشرفته») */
const FIELD_GROUPS: Record<ImportEntity, { label: string; fields: string[] }[]> = {
  products: [
    { label: "نام و مشخصات", fields: ["name", "sku", "barcode", "unit", "description"] },
    { label: "قیمت‌ها", fields: ["salePrice", "purchasePrice", "wholesalePrice", "usdPrice"] },
    { label: "موجودی و حدود", fields: ["stock", "minStock", "maxStock"] },
    { label: "دسته‌بندی", fields: ["category"] },
    { label: "فروشگاه و مودیان", fields: ["goodsCode", "imageUrl"] },
    { label: "فیلدهای پیشرفته", fields: ["purchasePriceAvg", "purchasePriceLast", "categoryMain", "categorySub"] },
  ],
  parties: [
    { label: "نام و هویت", fields: ["name", "code", "type"] },
    { label: "اطلاعات تماس", fields: ["phone", "mobile", "email"] },
    { label: "مالیاتی و هویتی", fields: ["nationalId", "economicCode", "taxId"] },
    { label: "آدرس", fields: ["address", "city", "province", "postalCode"] },
    { label: "مالی", fields: ["creditLimit", "openingBalance"] },
  ],
  accounts: [
    { label: "شناسه حساب", fields: ["code", "name", "parentCode"] },
    { label: "ساختار کدینگ", fields: ["group", "nature", "level"] },
    { label: "مانده و شرح", fields: ["balance", "description"] },
  ],
  journalEntries: [
    { label: "شناسنامه سند", fields: ["docNumber", "date", "type", "docDescription"] },
    { label: "ردیف‌های سند", fields: ["accountCode", "debit", "credit", "description"] },
  ],
  stock: [
    { label: "شناسایی کالا", fields: ["productSku", "productName"] },
    { label: "موجودی", fields: ["warehouse", "quantity", "unitCost"] },
  ],
};

/** فیلدهای الزامی هر هدف (برای فعال‌شدن دکمهٔ ادامه) */
function requiredFields(entity: ImportEntity): string[] {
  switch (entity) {
    case "products":
      return ["name"];
    case "parties":
      return ["name"];
    case "accounts":
      return ["code", "name"];
    case "journalEntries":
      return ["docNumber", "accountCode"];
    case "stock":
      return ["quantity"];
  }
}

/* ============================================================
 * قالب‌های نمونه (دانلود فایل نمونه) — هدرها = اولین alias هر فیلد
 * ============================================================ */

const TEMPLATE_SAMPLES: Record<ImportEntity, string[][]> = {
  products: [
    ["شیر پرچرب ۱ لیتری", "P-1001", "5901234567890", "بطری", "35000", "28000", "32000", "120", "لبنیات", "2810101000", "شیر پرچرب پاستوریزه"],
    ["ماست موسیر ۵۰۰ گرمی", "P-1002", "", "عدد", "45000", "36000", "41000", "80", "لبنیات", "", ""],
    ["پنیر لیقوان ۴۰۰ گرمی", "P-1003", "5901234567906", "بسته", "98000", "79000", "89000", "45", "لبنیات", "", "پنیر سنتی"],
  ],
  parties: [
    ["فروشگاه رضا محمدی", "C-1001", "مشتری", "09121234567", "02188776655", "0079845612", "411358795641", "reza@example.com", "تهران", "تهران", "1234567890", "تهران، خیابان ولیعصر، پلاک ۱۲"],
    ["تأمین‌کننده پخش البرز", "S-2001", "تأمین‌کننده", "09351112233", "02632224455", "1087459326", "411112223334", "", "البرز", "کرج", "4567891234", "کرج، بلوار طالقانی، واحد ۵"],
  ],
  accounts: [
    ["1101", "صندوق", "دارایی‌های جاری", "بدهکار", "کل", "", "50000000", "صندوق‌های سازمان"],
    ["110101", "صندوق ریالی", "دارایی‌های جاری", "بدهکار", "معین", "1101", "50000000", ""],
    ["11010101", "صندوق شعبه مرکزی", "دارایی‌های جاری", "بدهکار", "تفصیلی", "110101", "50000000", ""],
  ],
  journalEntries: [
    ["1", "1403/05/12", "سند حسابداری", "110101", "50000000", "0", "افتتاحیه صندوق", "سند افتتاحیه"],
    ["1", "1403/05/12", "سند حسابداری", "410101", "0", "50000000", "افتتاحیه سرمایه", "سند افتتاحیه"],
    ["2", "1403/05/15", "رسید", "110101", "0", "12500000", "واریز نقدی به صندوق", "رسید نقدی"],
  ],
  stock: [
    ["P-1001", "شیر پرچرب ۱ لیتری", "انبار اصلی", "120", "28000"],
    ["P-1002", "ماست موسیر ۵۰۰ گرمی", "", "80", "36000"],
    ["P-1003", "پنیر لیقوان ۴۰۰ گرمی", "انبار اصلی", "45", "79000"],
  ],
};

/* ============================================================
 * ابزارهای عمومی
 * ============================================================ */

const FORMAT_BADGES = ["XLSX", "XLS", "XLSM", "ODS", "CSV", "TSV", "TXT", "JSON"];
const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".ods", ".csv", ".tsv", ".txt", ".json"];
const MAX_FILE_MB = 10; // سقف حجم فایل ویزارد — سرور تا ۱۵MB را می‌پذیرد

const CONFIDENCE_META: Record<string, { label: string; className: string }> = {
  exact: {
    label: "خودکار (تطبیق دقیق)",
    className: "border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200",
  },
  fuzzy: {
    label: "خودکار (تقریبی)",
    className: "border-amber-300/70 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200",
  },
  inferred: {
    label: "تشخیص هوشمند",
    className: "border-primary/40 bg-primary/10 text-primary",
  },
  none: {
    label: "ناشناخته",
    className: "border-border bg-muted text-muted-foreground",
  },
};

/** آپلود با پیشرفت واقعی (XHR — fetch پیشرفت آپلود ندارد) */
function xhrUploadForm(
  url: string,
  form: FormData,
  onProgress: (pct: number) => void
): Promise<{ status: number; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = 600_000; // ۱۰ دقیقه — فایل‌های بزرگ
    const token = getAuthToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let json: Record<string, unknown> = {};
      try {
        json = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        /* بدنهٔ غیر JSON */
      }
      resolve({ status: xhr.status, json });
    };
    xhr.onerror = () => reject(new Error("ارتباط با سرور برقرار نشد"));
    xhr.ontimeout = () => reject(new Error("پاسخ سرور بیش از حد طول کشید — فایل کوچک‌تر کنید یا بعداً تلاش کنید"));
    xhr.send(form);
  });
}

function downloadBlob(content: string, mime: string, fileName: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** ماندگاری نگاشت — localStorage («نگاشت را برای این نوع به یاد بسپر») */
const mappingStorageKey = (entity: ImportEntity) => `ofogh.importWizard.mapping.${entity}`;

function loadStoredMapping(entity: ImportEntity): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(mappingStorageKey(entity));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { byHeader?: Record<string, string> };
    if (!parsed || typeof parsed !== "object" || !parsed.byHeader) return null;
    return parsed.byHeader;
  } catch {
    return null;
  }
}

function saveStoredMapping(entity: ImportEntity, byHeader: Record<string, string>): void {
  try {
    localStorage.setItem(mappingStorageKey(entity), JSON.stringify({ byHeader, savedAt: Date.now() }));
  } catch {
    /* localStorage در دسترس نیست — بی‌صدا رد شود */
  }
}

function clearStoredMapping(entity: ImportEntity): void {
  try {
    localStorage.removeItem(mappingStorageKey(entity));
  } catch {
    /* ignore */
  }
}

/* ============================================================
 * بخش صادرکرد — بارگذاری دادهٔ واقعی (الگوی اثبات‌شدهٔ قبلی)
 * ============================================================ */

async function fetchApiRows(url: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await authFetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    if (json && Array.isArray(json.data)) return json.data as Record<string, unknown>[];
    if (Array.isArray(json)) return json as Record<string, unknown>[];
    return [];
  } catch {
    return [];
  }
}

async function fetchExportRows(entity: ImportEntity): Promise<Record<string, unknown>[]> {
  if (entity === "products") {
    const rows = await fetchApiRows("/api/products?limit=5000");
    return rows.map((p) => ({
      "نام کالا": p.name ?? "",
      "کد کالا": p.sku ?? "",
      "بارکد": p.barcode ?? "",
      "واحد شمارش": p.unit ?? "",
      "قیمت فروش (ریال)": Number(p.salePrice ?? 0),
      "قیمت خرید (ریال)": Number(p.purchasePrice ?? 0),
      "قیمت عمده (ریال)": Number(p.wholesalePrice ?? 0),
      "دسته‌بندی": typeof p.category === "string" ? p.category : "",
      "توضیحات": p.description ?? "",
    }));
  }
  if (entity === "parties") {
    const rows = await fetchApiRows("/api/parties?limit=5000");
    return rows.map((p) => ({
      "نام": p.name ?? "",
      "کد": p.code ?? "",
      "نوع": p.type ?? "",
      "موبایل": p.mobile ?? "",
      "تلفن": p.phone ?? "",
      "کد ملی": p.nationalId ?? "",
      "کد اقتصادی": p.economicCode ?? "",
      "ایمیل": p.email ?? "",
      "استان": p.province ?? "",
      "شهر": p.city ?? "",
      "کد پستی": p.postalCode ?? "",
      "آدرس": p.address ?? "",
    }));
  }
  if (entity === "accounts") {
    const tree = await fetchApiRows("/api/accounting/chart-of-accounts");
    const LEVEL_FA: Record<string, string> = { group: "کل", account: "معین", subaccount: "تفصیلی" };
    const NATURE_FA: Record<string, string> = { debit: "بدهکار", credit: "بستانکار" };
    const out: Record<string, unknown>[] = [];
    const walk = (nodes: Record<string, unknown>[], parentCode: string) => {
      for (const n of nodes) {
        out.push({
          "کد حساب": n.code ?? "",
          "نام حساب": n.name ?? "",
          "گروه حساب": typeof n.group === "string" ? n.group : "",
          "طبیعت": NATURE_FA[String(n.nature ?? "")] ?? String(n.nature ?? ""),
          "سطح": LEVEL_FA[String(n.level ?? "")] ?? String(n.level ?? ""),
          "کد حساب والد": parentCode,
        });
        if (Array.isArray(n.children) && (n.children as Record<string, unknown>[]).length > 0) {
          walk(n.children as Record<string, unknown>[], String(n.code ?? ""));
        }
      }
    };
    walk(tree, "");
    return out;
  }
  if (entity === "journalEntries") {
    const rows = await fetchApiRows("/api/accounting/journal-entries?limit=500");
    return rows.map((e) => {
      const dateRaw = typeof e.date === "string" ? new Date(e.date) : null;
      const lines = Array.isArray(e.lines) ? (e.lines as Record<string, unknown>[]) : [];
      return {
        "شماره سند": e.number ?? "",
        "تاریخ": dateRaw && !Number.isNaN(dateRaw.getTime()) ? toJalali(dateRaw) : "—",
        "نوع سند": e.type ?? "",
        "شرح سند": e.description ?? "",
        "بدهکار (ریال)": Number(e.debit ?? 0),
        "بستانکار (ریال)": Number(e.credit ?? 0),
        "تعداد ردیف": lines.length,
        "کدهای حساب": lines.map((l) => String(l.accountCode ?? "")).join("، "),
      };
    });
  }
  // stock — کالاها + جمع موجودی هر انبار
  const rows = await fetchApiRows("/api/products?limit=5000");
  return rows.map((p) => {
    const stocks = Array.isArray(p.stockItems) ? (p.stockItems as Record<string, unknown>[]) : [];
    const total = stocks.reduce((s, it) => s + Number(it.quantity ?? 0), 0);
    return {
      "کد کالا": p.sku ?? "",
      "نام کالا": p.name ?? "",
      "موجودی کل": total,
      "واحد شمارش": p.unit ?? "",
    };
  });
}

function rowsToCsv(rows: Record<string, unknown>[], delimiter: string): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return /["\n\r,;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.map(esc).join(delimiter),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(delimiter)),
  ];
  return "\uFEFF" + lines.join("\r\n"); // BOM برای نمایش صحیح فارسی در Excel
}

/* ============================================================
 * کامپوننت اصلی
 * ============================================================ */

export function DataImportExport() {
  const { toast } = useToast();

  /* ---------- تب جاری و هدف ---------- */
  const [target, setTarget] = React.useState<ImportEntity>("products");
  const [exportEntity, setExportEntity] = React.useState<ImportEntity>("products");
  const [exportFormat, setExportFormat] = React.useState<ExportFormat>("xlsx");
  const [exporting, setExporting] = React.useState(false);

  /* ---------- ویزارد: وضعیت مراحل ---------- */
  const [step, setStep] = React.useState<StepId>(1);
  const [file, setFile] = React.useState<File | null>(null);
  const [analysis, setAnalysis] = React.useState<AnalyzeData | null>(null);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [sheet, setSheet] = React.useState<string>("");
  const [headerRow, setHeaderRow] = React.useState<number | undefined>(undefined);

  /* ---------- نگاشت: فیلد → ایندکس ستون ---------- */
  const [mapping, setMapping] = React.useState<Record<string, number>>({});
  /** فیلدهایی که کاربر دستی تغییر داده (بج «دستی») */
  const [manualFields, setManualFields] = React.useState<Set<string>>(new Set());
  /** فیلدهایی که از نگاشت ذخیره‌شدهٔ قبلی پر شده‌اند (بج «ذخیره‌شده») */
  const [restoredFields, setRestoredFields] = React.useState<Set<string>>(new Set());
  const [rememberMapping, setRememberMapping] = React.useState(true);

  /* ---------- اجرا ---------- */
  const [dryRun, setDryRun] = React.useState(true);
  const [updateExisting, setUpdateExisting] = React.useState(false);
  const [autoSku, setAutoSku] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [uploadPct, setUploadPct] = React.useState(0);
  const [serverProcessing, setServerProcessing] = React.useState(false);
  const [result, setResult] = React.useState<ExecuteResult | null>(null);
  const [runWasDryRun, setRunWasDryRun] = React.useState(false);

  /* ---------- تاریخچه ---------- */
  const [history, setHistory] = React.useState<ImportHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = React.useState(false);

  /* ---------- دراپ‌زون ---------- */
  const handleFilePick = async (picked: File) => {
    const lower = picked.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((e) => lower.endsWith(e))) {
      toast({
        title: "فرمت فایل پشتیبانی نمی‌شود",
        description: `فرمت‌های مجاز: ${FORMAT_BADGES.join("، ")} — فایل را با یکی از این فرمت‌ها ذخیره کنید`,
        variant: "destructive",
      });
      return;
    }
    if (picked.size > MAX_FILE_MB * 1024 * 1024) {
      toast({
        title: "حجم فایل بیش از حد مجاز است",
        description: `حداکثر ${toPersianDigits(MAX_FILE_MB)} مگابایت — فایل را بخش‌بندی کنید`,
        variant: "destructive",
      });
      return;
    }
    setFile(picked);
    setResult(null);
    setSheet("");
    setHeaderRow(undefined);
    await runAnalyze(picked, "", undefined, target);
  };

  /** مقداردهی اولیهٔ نگاشت از تحلیل (ذخیره‌شدهٔ قبلی > پیشنهاد خودکار) */
  const initMapping = (data: AnalyzeData, ent: ImportEntity) => {
    const stored = loadStoredMapping(ent);
    const next: Record<string, number> = {};
    const restored = new Set<string>();
    const suggestions = data.suggestions[ent] ?? [];
    // ستون → فیلد (برای بازیابی ذخیره‌شده بر اساس نام هدر)
    const fieldByHeader = new Map<string, string>();
    for (const s of suggestions) {
      if (s.field && s.field !== "ignore") {
        fieldByHeader.set(data.headers[s.index], s.field);
      }
    }
    for (const s of suggestions) {
      if (!s.field || s.field === "ignore") continue;
      const headerName = data.headers[s.index];
      const saved = stored?.[headerName];
      if (saved && fieldDefs(ent).some((f) => f.key === saved)) {
        // نگاشت ذخیره‌شدهٔ کاربر برای همین هدر → فیلد ذخیره‌شده
        if (next[saved] === undefined) {
          next[saved] = s.index;
          restored.add(saved);
        }
      } else if (next[s.field] === undefined) {
        next[s.field] = s.index;
      }
    }
    setMapping(next);
    setManualFields(new Set());
    setRestoredFields(restored);
  };

  /* ---------- تحلیل فایل (analyze) ---------- */
  const runAnalyze = React.useCallback(
    async (f: File, sheetName: string, hRow: number | undefined, ent: ImportEntity) => {
      setAnalyzing(true);
      setAnalysis(null);
      setResult(null);
      try {
        const form = new FormData();
        form.append("file", f);
        if (sheetName) form.append("sheet", sheetName);
        if (hRow !== undefined) form.append("headerRow", String(hRow));
        const { status, json } = await xhrUploadForm("/api/import/analyze", form, () => {
          /* پیشرفت تحلیل مهم نیست — سریع است */
        });
        if (status !== 200 || json.success !== true) {
          throw new Error(String(json.error ?? "تحلیل فایل ناموفق بود"));
        }
        const data = json as unknown as AnalyzeData & { success: boolean };
        setAnalysis(data);
        setSheet(data.selectedSheet || "");
        setHeaderRow(data.headerRow);

        // اگر نوع هدف تشخیص‌داده‌شده با انتخاب کاربر فرق دارد → اطلاع‌رسانی
        if (data.detectedTarget && data.detectedTarget !== ent) {
          toast({
            title: `محتوای فایل شبیه «${TARGET_META[data.detectedTarget].label}» است`,
            description: `نوع درون‌ریزی روی «${TARGET_META[ent].label}» تنظیم شده — در صورت نیاز در مرحلهٔ نگاشت تغییرش دهید`,
            duration: 6000,
          });
        }

        // مقداردهی اولیهٔ نگاشت: ذخیره‌شدهٔ قبلی > پیشنهاد خودکار
        initMapping(data, ent);
        setStep(2);
        const sug = data.suggestions[ent] ?? [];
        const mappedCount = sug.filter((s) => s.field && s.field !== "ignore").length;
        toast({
          title: "فایل بررسی شد",
          description:
            `${toPersianDigits(data.totalRows)} ردیف داده • ${toPersianDigits(mappedCount)} از ${toPersianDigits(
              data.headers.length
            )} ستون برای «${TARGET_META[ent].label}» تشخیص داده شد`,
        });
      } catch (err) {
        setFile(null);
        setStep(1);
        toast({
          title: "خطا در خواندن فایل",
          description: err instanceof Error ? err.message : "فایل قابل خواندن نیست.",
          variant: "destructive",
          duration: 10000,
        });
      } finally {
        setAnalyzing(false);
      }
    },
    [toast, initMapping]
  );

  /* تغییر هدف: نگاشت از پیشنهادهای همان هدف (بدون آپلود مجدد!) */
  const handleTargetChange = (next: ImportEntity) => {
    if (next === target) return;
    setTarget(next);
    setResult(null);
    if (analysis) initMapping(analysis, next);
  };

  /* تغییر شیت / ردیف هدر → تحلیل مجدد همان فایل */
  const handleSheetChange = async (next: string) => {
    if (!file || next === sheet) return;
    setSheet(next);
    await runAnalyze(file, next, headerRow, target);
  };
  const handleHeaderRowChange = async (next: number) => {
    if (!file || next === headerRow) return;
    setHeaderRow(next);
    await runAnalyze(file, sheet, next, target);
  };

  /* ---------- نگاشت ---------- */
  const mappedColumns = new Map<number, string>(); // columnIndex → field
  for (const [field, idx] of Object.entries(mapping)) {
    if (idx !== undefined && idx >= 0) mappedColumns.set(idx, field);
  }

  const handleFieldColumnChange = (field: string, colIdx: number | -1) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (colIdx < 0) {
        delete next[field];
      } else {
        // ستونِ مشغول به فیلد دیگری است → آن فیلد آزاد شود
        const owner = [...Object.entries(next)].find(([, i]) => i === colIdx);
        if (owner && owner[0] !== field) {
          delete next[owner[0]];
          toast({
            title: "ستون جای‌به‌جا شد",
            description: `ستون «${analysis?.headers[colIdx] ?? ""}» از «${fieldLabelOf(target, owner[0])}» گرفته شد و به این فیلد اختصاص یافت`,
          });
        }
        next[field] = colIdx;
      }
      return next;
    });
    setManualFields((prev) => new Set(prev).add(field));
    setRestoredFields((prev) => {
      const s = new Set(prev);
      s.delete(field);
      return s;
    });
  };

  const resetMappingToAuto = () => {
    if (analysis) initMapping(analysis, target);
    toast({ title: "پیشنهادهای خودکار بازگردانی شد" });
  };

  const clearAllMapping = () => {
    setMapping({});
    setManualFields(new Set());
    setRestoredFields(new Set());
  };

  function fieldLabelOf(ent: ImportEntity, key: string): string {
    return fieldDefs(ent).find((f) => f.key === key)?.label ?? key;
  }

  /** فیلدهای الزامیِ نگاشت‌نشده */
  const missingRequired = requiredFields(target).filter((k) => mapping[k] === undefined);
  /** stock: کد یا نام کالا — حداقل یکی */
  const stockMissingProduct =
    target === "stock" && mapping.productSku === undefined && mapping.productName === undefined;
  const canProceedToRun = missingRequired.length === 0 && !stockMissingProduct;

  /* ---------- اجرای درون‌ریزی (execute) ---------- */
  const runImport = async (asDryRun: boolean) => {
    if (!file || !analysis) return;
    setRunning(true);
    setUploadPct(0);
    setServerProcessing(false);
    setResult(null);
    setRunWasDryRun(asDryRun);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("targetType", target);
      const mappingPayload: Record<string, number> = {};
      for (const [field, idx] of Object.entries(mapping)) {
        if (idx !== undefined && idx >= 0) mappingPayload[field] = idx;
      }
      form.append("mapping", JSON.stringify(mappingPayload));
      form.append("dryRun", asDryRun ? "true" : "false");
      form.append("updateExisting", updateExisting ? "true" : "false");
      form.append("autoSku", autoSku ? "true" : "false");
      if (sheet) form.append("sheet", sheet);
      if (headerRow !== undefined) form.append("headerRow", String(headerRow));

      const { status, json } = await xhrUploadForm("/api/import/execute", form, (pct) => {
        setUploadPct(pct);
        if (pct >= 100) setServerProcessing(true);
      });
      setServerProcessing(false);
      if (status !== 200 || json.success !== true) {
        throw new Error(String(json.error ?? "اجرای درون‌ریزی ناموفق بود"));
      }
      const res = json as unknown as ExecuteResult & { success: boolean };
      setResult(res);

      // ذخیرهٔ نگاشت موفق (فقط اجرای واقعی)
      if (!asDryRun && rememberMapping) {
        const byHeader: Record<string, string> = {};
        for (const [field, idx] of Object.entries(mapping)) {
          if (idx !== undefined && idx >= 0 && analysis.headers[idx]) {
            byHeader[analysis.headers[idx]] = field;
          }
        }
        saveStoredMapping(target, byHeader);
      }

      const successCount = res.created + res.updated;
      toast({
        title: asDryRun ? "پیش‌اجرای آزمایشی انجام شد" : "درون‌ریزی انجام شد",
        description:
          `${toPersianDigits(successCount)} ردیف ${asDryRun ? "آمادهٔ ثبت" : "ثبت شد"} • ${toPersianDigits(
            res.skipped
          )} رد شد • ${toPersianDigits(res.errors.length)} خطا` +
          (asDryRun ? " — برای ثبت واقعی، «اجرای واقعی درون‌ریزی» را بزنید" : ""),
        variant: res.errors.length > 0 && successCount === 0 ? "destructive" : "default",
        duration: 8000,
      });
      if (!asDryRun) void loadHistory();
    } catch (err) {
      toast({
        title: "خطا در اجرای درون‌ریزی",
        description: err instanceof Error ? err.message : "اجرای درون‌ریزی ناموفق بود",
        variant: "destructive",
        duration: 10000,
      });
    } finally {
      setRunning(false);
      setServerProcessing(false);
    }
  };

  /* ---------- گزارش خطاها (CSV) ---------- */
  const downloadErrorReport = () => {
    if (!result) return;
    const lines: string[][] = [["ردیف فایل", "نوع", "پیام"]];
    for (const e of result.errors) lines.push([String(e.row), "خطا", e.message]);
    for (const s of result.skippedRows) lines.push([String(s.row), "ردشده", s.message]);
    const esc = (s: string) => (/["\n\r,;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const csv = "\uFEFF" + lines.map((l) => l.map(esc).join(",")).join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(csv, "text/csv;charset=utf-8", `گزارش-خطای-درون‌ریزی-${target}-${stamp}.csv`);
  };

  /* ---------- قالب نمونه ---------- */
  const downloadTemplate = () => {
    const defs = fieldDefs(target).filter((f) => !f.hidden);
    const headers = defs.map((f) => {
      const libAliases = (IMPORT_FIELD_DEFS as Record<string, { key: string; aliases?: string[] }[]>)[
        target === "parties" ? "customers" : target
      ];
      const alias = libAliases?.find((d) => d.key === f.key)?.aliases?.[0];
      const stockAlias = STOCK_FIELD_DEFS.find((d) => d.key === f.key)?.aliases?.[0];
      return alias ?? stockAlias ?? f.label;
    });
    const samples = TEMPLATE_SAMPLES[target];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...samples]);
    ws["!cols"] = headers.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, TARGET_META[target].label.slice(0, 28));
    XLSX.writeFile(wb, `قالب-${target}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({
      title: "فایل نمونه دانلود شد",
      description:
        "ستون‌ها را همان‌طور که هستند پر کنید — هدرهای فارسی نرم‌افزارهای حسابداری (هلو/سپیدار/محک) هم خودکار تشخیص داده می‌شوند",
    });
  };

  /* ---------- صادرکرد ---------- */
  const handleExport = async (formatOverride?: ExportFormat) => {
    const fmt = formatOverride ?? exportFormat;
    const entityLabel = TARGET_META[exportEntity].label;
    setExporting(true);
    try {
      const rows = await fetchExportRows(exportEntity);
      if (rows.length === 0) {
        toast({
          title: "داده‌ای برای صادرکردن وجود ندارد",
          description: `هیچ ${entityLabel}ای در سیستم ثبت نشده است.`,
          variant: "destructive",
        });
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      if (fmt === "json") {
        downloadBlob(JSON.stringify(rows, null, 2), "application/json", `افق‌پلاس_${entityLabel}_${stamp}.json`);
      } else if (fmt === "xlsx") {
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 22 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, entityLabel.slice(0, 28));
        XLSX.writeFile(wb, `افق‌پلاس_${entityLabel}_${stamp}.xlsx`);
      } else {
        const delimiter = fmt === "csv-excel" ? ";" : ",";
        downloadBlob(rowsToCsv(rows, delimiter), "text/csv;charset=utf-8", `افق‌پلاس_${entityLabel}_${stamp}.csv`);
      }
      toast({
        title: "خروجی آماده شد",
        description: `${toPersianDigits(rows.length)} رکورد واقعی از پایگاه داده صادر شد.`,
      });
    } catch {
      toast({
        title: "خطا در صادرکرد",
        description: "دریافت داده از سرور ناموفی بود. دوباره تلاش کنید.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  /* ---------- تاریخچه ---------- */
  const loadHistory = React.useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await authFetch("/api/import", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.success && Array.isArray(json.data)) {
          const mapped: ImportHistoryEntry[] = json.data.map((h: Record<string, unknown>) => {
            const createdRows = Number(h.createdRows ?? 0);
            const updatedRows = Number(h.updatedRows ?? 0);
            return {
              id: String(h.id ?? Math.random()),
              entity: normalizeHistoryEntity(String(h.entity)),
              fileName: String(h.fileName ?? ""),
              totalRows: Number(h.totalRows ?? 0),
              createdRows,
              updatedRows,
              skippedRows: Number(h.skippedRows ?? 0),
              successRows: Number(h.successRows ?? createdRows + updatedRows),
              errorRows: Number(h.errorRows ?? 0),
              date: String(h.date ?? new Date().toISOString()),
              status: (h.status ?? "success") as "success" | "partial" | "failed",
            };
          });
          setHistory(mapped);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const statusIcon = (status: ImportHistoryEntry["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
      case "partial":
        return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
      case "failed":
        return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    }
  };

  /* ---------- بازنشانی ویزارد ---------- */
  const resetWizard = () => {
    setStep(1);
    setFile(null);
    setAnalysis(null);
    setMapping({});
    setManualFields(new Set());
    setRestoredFields(new Set());
    setResult(null);
    setSheet("");
    setHeaderRow(undefined);
    setUploadPct(0);
    setServerProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ============================================================
   * رندر
   * ============================================================ */

  const steps: { id: StepId; label: string; icon: React.ElementType }[] = [
    { id: 1, label: "آپلود فایل", icon: Upload },
    { id: 2, label: "شیت و هدر", icon: Table2 },
    { id: 3, label: "نگاشت ستون‌ها", icon: Wand2 },
    { id: 4, label: "اجرا و نتیجه", icon: Database },
  ];

  const formatFa = (f: string) =>
    f === "xlsx" || f === "xlsm"
      ? "اکسل (XLSX)"
      : f === "xls"
        ? "اکسل قدیمی (XLS)"
        : f === "ods"
          ? "اکسل متن‌باز (ODS)"
          : f === "json"
            ? "JSON"
            : f === "tsv"
              ? "متن با Tab"
              : f === "txt"
                ? "متن جداشده"
                : "CSV";

  return (
    <div className="space-y-6" dir="rtl">
      <Tabs defaultValue="import" className="w-full">
        <TabsList className="w-full max-w-md">
          <TabsTrigger value="import" className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            واردات داده
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            صادرکرد داده
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            تاریخچه
          </TabsTrigger>
        </TabsList>

        {/* ========= تب واردات — ویزارد ۴ مرحله‌ای ========= */}
        <TabsContent value="import" className="space-y-4 mt-4">
          {/* کارت‌های آماری */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "کل واردات‌ها", value: history.length, icon: Upload, color: "text-primary", bg: "bg-primary/10" },
              {
                label: "ردیف‌های ذخیره‌شده",
                value: history.reduce((s, h) => s + h.successRows, 0),
                icon: CheckCircle2,
                color: "text-emerald-600 dark:text-emerald-400",
                bg: "bg-emerald-500/10",
              },
              {
                label: "ردیف‌های خطادار",
                value: history.reduce((s, h) => s + h.errorRows, 0),
                icon: AlertTriangle,
                color: "text-amber-600 dark:text-amber-400",
                bg: "bg-amber-500/10",
              },
              {
                label: "آخرین واردات",
                value: history[0] ? toJalaliSafe(history[0].date) : "—",
                icon: Clock,
                color: "text-muted-foreground",
                bg: "bg-muted",
                isText: true,
              },
            ].map((s) => (
              <Card key={s.label} className="border-border/60">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={cn("rounded-lg p-2", s.bg)}>
                    <s.icon className={cn("h-4 w-4", s.color)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate">{s.label}</p>
                    <p className="text-sm font-bold truncate">
                      {s.isText ? String(s.value) : toPersianDigits(Number(s.value))}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* انتخاب نوع درون‌ریزی */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                چه چیزی می‌خواهید درون‌ریزی کنید؟
              </CardTitle>
              <CardDescription>
                نوع داده را انتخاب کنید — بعد از آپلود فایل، ستون‌ها به‌صورت خودکار تشخیص داده می‌شوند و در صورت
                نیاز می‌توانید هر ستون را دستی اصلاح کنید.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {(Object.keys(TARGET_META) as ImportEntity[]).map((t) => {
                  const meta = TARGET_META[t];
                  const active = target === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleTargetChange(t)}
                      aria-pressed={active}
                      className={cn(
                        "group flex flex-col items-start gap-1.5 rounded-xl border p-3 text-right transition-all min-h-[44px]",
                        active
                          ? "border-primary/60 bg-primary/10 shadow-sm"
                          : "border-border/60 bg-card hover:border-primary/30 hover:bg-muted/50"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <meta.icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                        <span className={cn("text-sm font-semibold", active ? "text-primary" : "")}>{meta.label}</span>
                      </span>
                      <span className="text-[11px] leading-4 text-muted-foreground">{meta.description}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* استپر */}
          <Card className="border-border/60">
            <CardContent className="p-4">
              <ol className="flex flex-wrap items-center gap-1" aria-label="مراحل درون‌ریزی">
                {steps.map((s, i) => {
                  const done = step > s.id || (step === 4 && result !== null);
                  const current = step === s.id;
                  return (
                    <li key={s.id} className="flex items-center gap-1 flex-1 min-w-fit">
                      <button
                        type="button"
                        onClick={() => {
                          // بازگشت به مراحل قبلی مجاز است (اگر داده‌اش موجود است)
                          if (s.id < step || (s.id === 2 && analysis) || (s.id === 3 && analysis) || (s.id === 4 && result)) {
                            setStep(s.id);
                          }
                        }}
                        disabled={running}
                        className={cn(
                          "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors min-h-[36px]",
                          current
                            ? "bg-primary text-primary-foreground"
                            : done
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25"
                              : "bg-muted text-muted-foreground"
                        )}
                      >
                        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                        <span className="whitespace-nowrap">
                          {toPersianDigits(s.id)}. {s.label}
                        </span>
                      </button>
                      {i < steps.length - 1 && (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground rotate-90 hidden sm:block" aria-hidden />
                      )}
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          {/* ---------- مرحلهٔ ۱: آپلود فایل ---------- */}
          {step === 1 && (
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">مرحلهٔ ۱ — آپلود فایل</CardTitle>
                <CardDescription>
                  فایل اکسل یا متن داده‌هایتان را انتخاب کنید. همهٔ فرمت‌های رایج پشتیبانی می‌شوند و انکودینگ
                  فارسی (Windows-1256) خودکار تشخیص داده می‌شود.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="آپلود فایل درون‌ریزی"
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void handleFilePick(f);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all min-h-[200px]",
                    dragActive
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/40 hover:bg-muted/40"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    accept={ACCEPTED_EXTENSIONS.join(",")}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFilePick(f);
                    }}
                  />
                  {analyzing ? (
                    <>
                      <Loader2 className="h-10 w-10 text-primary animate-spin" />
                      <p className="text-sm font-medium">در حال تحلیل فایل…</p>
                      <p className="text-xs text-muted-foreground">انکودینگ، شیت‌ها و ستون‌ها بررسی می‌شود</p>
                    </>
                  ) : (
                    <>
                      <div className="rounded-full bg-primary/10 p-3">
                        <Upload className="h-7 w-7 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">فایل را اینجا رها کنید یا کلیک کنید</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          حداکثر {toPersianDigits(MAX_FILE_MB)} مگابایت — تا ۱۰۰,۰۰۰ ردیف
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                        {FORMAT_BADGES.map((b) => (
                          <Badge key={b} variant="secondary" className="text-[10px] font-mono">
                            {b}
                          </Badge>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5">
                    <FileDown className="h-3.5 w-3.5" />
                    دانلود فایل نمونه «{TARGET_META[target].label}» (XLSX)
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    فایل نمونه شامل هدرهای استاندارد و چند ردیف مثال است.
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ---------- مرحلهٔ ۲: انتخاب شیت و هدر ---------- */}
          {step === 2 && analysis && (
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">مرحلهٔ ۲ — انتخاب شیت و ردیف هدر</CardTitle>
                <CardDescription>
                  اگر فایل اکسل چند شیت دارد شیت موردنظر را انتخاب کنید. اگر جدول داده‌ها از ردیف دوم یا سوم شیت
                  شروع می‌شود، «ردیف هدر» را درست انتخاب کنید تا ستون‌ها درست خوانده شوند.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* اطلاعات فایل */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className="gap-1">
                    <FileSpreadsheet className="h-3 w-3" />
                    {formatFa(analysis.file.format)}
                  </Badge>
                  {analysis.file.encoding && (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {analysis.file.encoding}
                    </Badge>
                  )}
                  {analysis.file.delimiterLabel && <Badge variant="outline">{analysis.file.delimiterLabel}</Badge>}
                  <Badge variant="outline">{toPersianDigits(analysis.totalRows)} ردیف داده</Badge>
                  <Badge variant="outline">{toPersianDigits(analysis.headers.length)} ستون</Badge>
                  {analysis.dateFormat !== "none" && (
                    <Badge variant="outline">
                      تاریخ {analysis.dateFormat === "jalali" ? "شمسی" : analysis.dateFormat === "gregorian" ? "میلادی" : "ترکیبی"}
                    </Badge>
                  )}
                  <span className="text-muted-foreground truncate max-w-[200px]">{analysis.file.name}</span>
                </div>

                {/* انتخاب شیت + ردیف هدر */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {analysis.sheets.length > 0 && (
                    <div className="space-y-1.5">
                      <label htmlFor="wizard-sheet" className="text-xs font-medium flex items-center gap-1.5">
                        <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
                        شیت فایل اکسل
                      </label>
                      <Select value={sheet} onValueChange={(v) => void handleSheetChange(v)}>
                        <SelectTrigger id="wizard-sheet" className="w-full">
                          <SelectValue placeholder="انتخاب شیت" />
                        </SelectTrigger>
                        <SelectContent>
                          {analysis.sheets.map((s) => (
                            <SelectItem key={s.name} value={s.name}>
                              {s.name} ({toPersianDigits(s.rowCount)} ردیف)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label htmlFor="wizard-header-row" className="text-xs font-medium flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      ردیف هدر (سطر عنوان ستون‌ها)
                    </label>
                    <Select
                      value={String(headerRow ?? 1)}
                      onValueChange={(v) => void handleHeaderRowChange(Number(v))}
                    >
                      <SelectTrigger id="wizard-header-row" className="w-full">
                        <SelectValue placeholder="ردیف هدر" />
                      </SelectTrigger>
                      <SelectContent>
                        {analysis.rawPreview.map((r) => (
                          <SelectItem key={r.row} value={String(r.row)}>
                            ردیف {toPersianDigits(r.row)}
                            {r.cells.filter(Boolean).length > 0
                              ? ` — ${r.cells.filter(Boolean).slice(0, 3).join(" | ").slice(0, 50)}`
                              : " — (خالی)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {analysis.headerInjected && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>
                      این فایل هدر ندارد و ستون‌های عمومی «ستون ۱، ۲، …» ساخته شد. اگر سطر اولِ در واقع هدر است،
                      «ردیف هدر» را روی آن تنظیم کنید.
                    </p>
                  </div>
                )}

                {/* پیش‌نمایش ردیف‌های خام (برای انتخاب ردیف هدر) */}
                <div>
                  <p className="text-xs font-medium mb-2 text-muted-foreground">
                    ردیف‌های ابتدایی فایل (خام — {toPersianDigits(analysis.rawPreview.length)} ردیف اول)
                  </p>
                  <div className="max-h-56 overflow-auto rounded-lg border border-border/60 compact-scroll">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14 text-xs text-center">ردیف</TableHead>
                          {Array.from({ length: Math.max(...analysis.rawPreview.map((r) => r.cells.length), 1) }).map(
                            (_, ci) => (
                              <TableHead key={ci} className="text-xs">
                                ستون {toPersianDigits(ci + 1)}
                              </TableHead>
                            )
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analysis.rawPreview.map((r) => (
                          <TableRow
                            key={r.row}
                            className={cn(r.row === headerRow && "bg-primary/10")}
                          >
                            <TableCell className="text-xs text-center font-mono">
                              {toPersianDigits(r.row)}
                              {r.row === headerRow && <span className="text-primary"> ◀</span>}
                            </TableCell>
                            {Array.from({ length: Math.max(...analysis.rawPreview.map((x) => x.cells.length), 1) }).map(
                              (_, ci) => (
                                <TableCell key={ci} className="text-xs max-w-[160px] truncate">
                                  {r.cells[ci] ?? ""}
                                </TableCell>
                              )
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <Button type="button" variant="ghost" size="sm" onClick={resetWizard} className="gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" />
                    فایل دیگر
                  </Button>
                  <Button type="button" onClick={() => setStep(3)} className="gap-1.5">
                    ادامه به نگاشت ستون‌ها
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ---------- مرحلهٔ ۳: نگاشت ستون‌ها ---------- */}
          {step === 3 && analysis && (
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex flex-wrap items-center gap-2">
                  مرحلهٔ ۳ — نگاشت ستون‌ها
                  <Badge variant="secondary">{TARGET_META[target].label}</Badge>
                </CardTitle>
                <CardDescription>
                  برای هر فیلد، ستون مربوطه در فایل را انتخاب کنید. ستون‌هایی که خودکار تشخیص داده شده‌اند بج
                  «خودکار» دارند — هر انتخابی که تغییر دهید با بج «دستی» مشخص می‌شود.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* خلاصهٔ نگاشت */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                    {toPersianDigits(Object.keys(mapping).length)} فیلد نگاشت شد
                  </Badge>
                  <Badge variant="outline">
                    {toPersianDigits(analysis.headers.length - mappedColumns.size)} ستون استفاده‌نشده
                  </Badge>
                  {missingRequired.length > 0 && (
                    <Badge className="border-red-300/70 bg-red-50 text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200 gap-1">
                      <CircleAlert className="h-3 w-3" />
                      {toPersianDigits(missingRequired.length)} فیلد الزامی نگاشت‌نشده
                    </Badge>
                  )}
                </div>

                {/* گروه‌های فیلد */}
                {FIELD_GROUPS[target].map((group) => {
                  const defs = group.fields
                    .map((k) => fieldDefs(target).find((f) => f.key === k))
                    .filter(Boolean) as FieldDefUI[];
                  if (defs.length === 0) return null;
                  return (
                    <div key={group.label} className="rounded-xl border border-border/60 overflow-hidden">
                      <div className="bg-muted/60 px-3 py-2 text-xs font-semibold">{group.label}</div>
                      <div className="divide-y divide-border/60">
                        {defs.map((f) => {
                          const selectedIdx = mapping[f.key];
                          const isMapped = selectedIdx !== undefined && selectedIdx >= 0;
                          const isRequired = f.required || (target === "stock" && f.key === "productSku");
                          const missing = isRequired && !isMapped;
                          const isManual = manualFields.has(f.key);
                          const isRestored = restoredFields.has(f.key);
                          const suggestion = (analysis.suggestions[target] ?? []).find(
                            (s) => s.index === selectedIdx && s.field === f.key
                          );
                          const autoBadge =
                            !isManual && isMapped && (suggestion || isRestored) ? (
                              <Badge
                                className={cn(
                                  "text-[10px] gap-1",
                                  isRestored
                                    ? "border-violet-300/70 bg-violet-50 text-violet-800 dark:border-violet-800/60 dark:bg-violet-950/30 dark:text-violet-200"
                                    : CONFIDENCE_META[suggestion?.confidence ?? "fuzzy"].className
                                )}
                              >
                                {isRestored ? (
                                  <>
                                    <Save className="h-2.5 w-2.5" />
                                    از نگاشت ذخیره‌شده
                                  </>
                                ) : (
                                  <>
                                    <Wand2 className="h-2.5 w-2.5" />
                                    {CONFIDENCE_META[suggestion?.confidence ?? "fuzzy"].label}
                                  </>
                                )}
                              </Badge>
                            ) : isManual ? (
                              <Badge className="text-[10px] gap-1 border-sky-300/70 bg-sky-50 text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-200">
                                دستی
                              </Badge>
                            ) : null;
                          return (
                            <div
                              key={f.key}
                              className={cn(
                                "flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2.5",
                                missing && "bg-red-50/60 dark:bg-red-950/20"
                              )}
                            >
                              <div className="sm:w-64 shrink-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-medium">{f.label}</span>
                                  {f.required && (
                                    <Badge variant="destructive" className="text-[9px] px-1 py-0">
                                      الزامی
                                    </Badge>
                                  )}
                                  {autoBadge}
                                </div>
                                {f.hint && <p className="text-[11px] text-muted-foreground leading-4">{f.hint}</p>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <Select
                                  value={isMapped ? String(selectedIdx) : "none"}
                                  onValueChange={(v) => handleFieldColumnChange(f.key, v === "none" ? -1 : Number(v))}
                                >
                                  <SelectTrigger
                                    className={cn("w-full", missing && "border-red-400 focus:ring-red-300")}
                                    aria-label={`ستون فایل برای ${f.label}`}
                                  >
                                    <SelectValue placeholder="— انتخاب ستون —" />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-72">
                                    <SelectItem value="none">— نامشخص / بدون نگاشت —</SelectItem>
                                    {analysis.headers.map((h, ci) => {
                                      const samples = (analysis.columnSamples[ci] ?? []).slice(0, 2);
                                      const sampleText = samples.length > 0 ? samples.join(" ، ") : "بدون داده";
                                      const label = `${h} — نمونه: ${sampleText}`;
                                      return (
                                        <SelectItem key={ci} value={String(ci)} className="whitespace-normal">
                                          <span className="line-clamp-2 text-xs leading-4">{label.slice(0, 110)}</span>
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* هشدار الزامی‌های ویژهٔ stock */}
                {stockMissingProduct && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-300/60 bg-red-50 dark:border-red-800/50 dark:bg-red-950/30 p-3 text-xs text-red-800 dark:text-red-200">
                    <CircleAlert className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>برای موجودی انبار، «کد کالا» یا «نام کالا» (حداقل یکی) باید نگاشت شود تا کالا پیدا شود.</p>
                  </div>
                )}

                {/* به یاد سپردن نگاشت */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
                  <div className="flex items-center gap-2">
                    <Switch id="remember-mapping" checked={rememberMapping} onCheckedChange={setRememberMapping} />
                    <label htmlFor="remember-mapping" className="text-xs cursor-pointer">
                      نگاشت را برای «{TARGET_META[target].label}» به یاد بسپار
                      <span className="text-muted-foreground block">
                        دفعهٔ بعد، ستون‌های هم‌نام خودکار با همین نگاشت پر می‌شوند
                      </span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={resetMappingToAuto} className="gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5" />
                      بازگردانی خودکار
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        clearStoredMapping(target);
                        toast({ title: "نگاشت ذخیره‌شده پاک شد" });
                      }}
                      className="gap-1.5 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      فراموشی نگاشت
                    </Button>
                  </div>
                </div>

                {/* پیش‌نمایش نتیجهٔ نگاشت */}
                {analysis.sampleRows.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-2 text-muted-foreground">
                      پیش‌نمایش نتیجهٔ نگاشت ({toPersianDigits(Math.min(5, analysis.sampleRows.length))} ردیف اولِ
                      دادهٔ نهایی)
                    </p>
                    <div className="max-h-72 overflow-auto rounded-lg border border-border/60 compact-scroll">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-12 text-center">ردیف</TableHead>
                            {Object.entries(mapping)
                              .filter(([, idx]) => idx !== undefined && idx >= 0)
                              .slice(0, 8)
                              .map(([field]) => (
                                <TableHead key={field} className="text-xs whitespace-nowrap">
                                  {fieldLabelOf(target, field)}
                                </TableHead>
                              ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.sampleRows.slice(0, 5).map((row, ri) => (
                            <TableRow key={ri}>
                              <TableCell className="text-xs text-center text-muted-foreground font-mono">
                                {toPersianDigits(ri + 1)}
                              </TableCell>
                              {Object.entries(mapping)
                                .filter(([, idx]) => idx !== undefined && idx >= 0)
                                .slice(0, 8)
                                .map(([, idx]) => (
                                  <TableCell key={idx} className="text-xs max-w-[180px] truncate">
                                    {row[idx] ?? ""}
                                  </TableCell>
                                ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setStep(2)} className="gap-1.5">
                    <ArrowRight className="h-4 w-4" />
                    بازگشت به شیت و هدر
                  </Button>
                  <Button
                    type="button"
                    disabled={!canProceedToRun || running}
                    onClick={() => setStep(4)}
                    className="gap-1.5"
                  >
                    ادامه به اجرا
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ---------- مرحلهٔ ۴: اجرا و نتیجه ---------- */}
          {step === 4 && analysis && (
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">مرحلهٔ ۴ — اجرا و نتیجه</CardTitle>
                <CardDescription>
                  ابتدا «پیش‌اجرای آزمایشی» را انجام دهید تا خطاهای احتمالی بدون ذخیره‌سازی دیده شوند؛ سپس
                  «اجرای واقعی» را بزنید.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* گزینه‌ها */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="opt-dryrun" className="text-xs font-medium leading-4">
                        پیش‌اجرای آزمایشی
                        <span className="text-muted-foreground block font-normal">
                          بدون ذخیره‌سازی — فقط بررسی
                        </span>
                      </label>
                      <Switch id="opt-dryrun" checked={dryRun} onCheckedChange={setDryRun} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-3">
                    <label htmlFor="opt-update" className="text-xs font-medium leading-4">
                      به‌روزرسانی موارد موجود
                      <span className="text-muted-foreground block font-normal">
                        رکوردهای تکراری به‌روزرسانی شوند (وگرنه رد)
                      </span>
                    </label>
                    <Switch id="opt-update" checked={updateExisting} onCheckedChange={setUpdateExisting} />
                  </div>
                  {target === "products" && (
                    <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-3">
                      <label htmlFor="opt-autosku" className="text-xs font-medium leading-4">
                        تولید خودکار کد کالا
                        <span className="text-muted-foreground block font-normal">
                        برای ردیف‌های بدون کد کالا
                      </span>
                      </label>
                      <Switch id="opt-autosku" checked={autoSku} onCheckedChange={setAutoSku} />
                    </div>
                  )}
                </div>

                {/* پیشرفت */}
                {running && (
                  <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {serverProcessing ? "سرور در حال پردازش و ثبت داده‌ها…" : "در حال آپلود فایل…"}
                      </span>
                      <span className="font-mono">{toPersianDigits(uploadPct)}٪</span>
                    </div>
                    <Progress value={serverProcessing ? 100 : uploadPct} className="h-2" />
                    {serverProcessing && (
                      <p className="text-[11px] text-muted-foreground">
                        فایل‌های بزرگ ممکن است چند دقیقه طول بکشند — این پنجره را نبندید.
                      </p>
                    )}
                  </div>
                )}

                {/* نتیجه */}
                {result && !running && (
                  <div className="space-y-4">
                    {/* داشبورد نتیجه */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "ایجادشده", value: result.created, icon: CheckCircle2, cls: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
                        { label: "به‌روزرسانی", value: result.updated, icon: RefreshCw, cls: "text-sky-600 dark:text-sky-400", bg: "bg-sky-500/10" },
                        { label: "ردشده", value: result.skipped, icon: AlertTriangle, cls: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
                        { label: "خطا", value: result.errors.length, icon: XCircle, cls: "text-destructive", bg: "bg-destructive/10" },
                      ].map((s) => (
                        <Card key={s.label} className="border-border/60">
                          <CardContent className="flex items-center gap-3 p-4">
                            <div className={cn("rounded-lg p-2", s.bg)}>
                              <s.icon className={cn("h-4 w-4", s.cls)} />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">{s.label}</p>
                              <p className="text-lg font-bold">{toPersianDigits(s.value)}</p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {runWasDryRun && (
                      <div className="flex items-start gap-2 rounded-lg border border-sky-300/60 bg-sky-50 dark:border-sky-800/50 dark:bg-sky-950/30 p-3 text-xs text-sky-800 dark:text-sky-200">
                        <Info className="h-4 w-4 shrink-0 mt-0.5" />
                        <p>
                          این یک «پیش‌اجرای آزمایشی» بود و هیچ داده‌ای ذخیره نشده است. برای ثبت واقعی، دکمهٔ
                          «اجرای واقعی درون‌ریزی» را بزنید.
                        </p>
                      </div>
                    )}

                    {/* جدول خطاها */}
                    {result.errors.length > 0 && (
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
                            <XCircle className="h-3.5 w-3.5" />
                            خطاهای ردیف‌ها ({toPersianDigits(result.errors.length)} ردیف)
                          </p>
                          <Button type="button" variant="outline" size="sm" onClick={downloadErrorReport} className="gap-1.5">
                            <Download className="h-3.5 w-3.5" />
                            دریافت گزارش خطاها (CSV)
                          </Button>
                        </div>
                        <div className="max-h-72 overflow-y-auto rounded-lg border border-border/60 compact-scroll">
                          <Table>
                            <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur">
                              <TableRow>
                                <TableHead className="text-xs w-20 text-center">ردیف فایل</TableHead>
                                <TableHead className="text-xs">پیام خطا</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {result.errors.slice(0, 500).map((e, i) => (
                                <TableRow key={`${e.row}-${i}`}>
                                  <TableCell className="text-xs text-center font-mono">
                                    {toPersianDigits(e.row)}
                                  </TableCell>
                                  <TableCell className="text-xs">{e.message}</TableCell>
                                </TableRow>
                              ))}
                              {result.errors.length > 500 && (
                                <TableRow>
                                  <TableCell colSpan={2} className="text-xs text-center text-muted-foreground">
                                    … و {toPersianDigits(result.errors.length - 500)} خطای دیگر (در گزارش CSV کامل
                                    می‌آید)
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    {/* ردیف‌های ردشده */}
                    {result.skippedRows.length > 0 && (
                      <details className="group rounded-lg border border-border/60">
                        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium flex items-center gap-1.5">
                          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                          ردیف‌های ردشده با دلیل ({toPersianDigits(result.skippedRows.length)} ردیف)
                        </summary>
                        <div className="max-h-56 overflow-y-auto border-t border-border/60 compact-scroll">
                          <Table>
                            <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur">
                              <TableRow>
                                <TableHead className="text-xs w-20 text-center">ردیف فایل</TableHead>
                                <TableHead className="text-xs">دلیل ردشدن</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {result.skippedRows.slice(0, 300).map((s, i) => (
                                <TableRow key={`${s.row}-${i}`}>
                                  <TableCell className="text-xs text-center font-mono">{toPersianDigits(s.row)}</TableCell>
                                  <TableCell className="text-xs">{s.message}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </details>
                    )}

                    {/* اکشن‌های نتیجه */}
                    <div className="flex flex-wrap items-center gap-2">
                      {runWasDryRun && (
                        <Button
                          type="button"
                          onClick={() => void runImport(false)}
                          disabled={running || result.created + result.updated === 0}
                          className="gap-1.5"
                        >
                          <Database className="h-4 w-4" />
                          اجرای واقعی درون‌ریزی
                        </Button>
                      )}
                      <Button type="button" variant="outline" onClick={() => setStep(3)} disabled={running} className="gap-1.5">
                        <ArrowRight className="h-4 w-4" />
                        اصلاح نگاشت
                      </Button>
                      <Button type="button" variant="ghost" onClick={resetWizard} disabled={running} className="gap-1.5">
                        <Upload className="h-4 w-4" />
                        درون‌ریزی فایل جدید
                      </Button>
                    </div>
                  </div>
                )}

                {/* دکمه‌های اجرا */}
                {!running && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => setStep(3)} className="gap-1.5">
                      <ArrowRight className="h-4 w-4" />
                      بازگشت به نگاشت
                    </Button>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void runImport(true)}
                        disabled={running || !canProceedToRun}
                        className="gap-1.5"
                      >
                        <Sparkles className="h-4 w-4" />
                        پیش‌اجرای آزمایشی
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void runImport(dryRun)}
                        disabled={running || !canProceedToRun}
                        className="gap-1.5"
                      >
                        <Database className="h-4 w-4" />
                        {dryRun ? "پیش‌اجرای آزمایشی و ادامه" : "اجرای واقعی درون‌ریزی"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ========= تب صادرکرد ========= */}
        <TabsContent value="export" className="mt-4">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">صادرکرد داده‌ها</CardTitle>
              <CardDescription>
                داده‌های واقعی پایگاه داده را با همان ساختار فایل‌های نمونه به اکسل یا CSV تبدیل کنید — خروجی
                فارسی با پشتیبانی کامل اکسل (BOM).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">نوع داده</label>
                  <Select value={exportEntity} onValueChange={(v) => setExportEntity(v as ImportEntity)}>
                    <SelectTrigger className="w-full" aria-label="نوع داده برای صادرکرد">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TARGET_META) as ImportEntity[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {TARGET_META[t].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">فرمت خروجی</label>
                  <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
                    <SelectTrigger className="w-full" aria-label="فرمت خروجی">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="xlsx">اکسل (XLSX)</SelectItem>
                      <SelectItem value="csv">CSV با کاما (UTF-8)</SelectItem>
                      <SelectItem value="csv-excel">CSV با سمی‌کالن (برای اکسل فارسی)</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void handleExport()} disabled={exporting} className="gap-1.5">
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {exporting ? "در حال آماده‌سازی…" : "دریافت خروجی"}
                </Button>
                <Button variant="outline" onClick={() => void handleExport("xlsx")} disabled={exporting} className="gap-1.5">
                  <FileSpreadsheet className="h-4 w-4" />
                  خروجی سریع اکسل
                </Button>
                <Button variant="outline" onClick={downloadTemplate} disabled={exporting} className="gap-1.5">
                  <FileDown className="h-4 w-4" />
                  فایل نمونه «{TARGET_META[exportEntity].label}»
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground leading-5">
                نکته: خروجی «{TARGET_META[exportEntity].label}» دقیقاً هم‌ستون با فایل نمونه است — می‌توانید آن را
                ویرایش و دوباره درون‌ریزی کنید (گردش دوطرفه).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========= تب تاریخچه ========= */}
        <TabsContent value="history" className="mt-4">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                تاریخچهٔ واردات
              </CardTitle>
              <CardDescription>آخرین ۵۰ درون‌ریزی ثبت‌شده در سیستم (از ممیزی رویدادها)</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 && !historyLoading ? (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  <Upload className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  هنوز درون‌ریزی‌ای ثبت نشده است.
                  <p className="text-xs mt-1">از تب «واردات داده» اولین فایل خود را وارد کنید.</p>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto compact-scroll">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur">
                      <TableRow>
                        <TableHead className="text-xs">وضعیت</TableHead>
                        <TableHead className="text-xs">نوع</TableHead>
                        <TableHead className="text-xs">نام فایل</TableHead>
                        <TableHead className="text-xs text-center">کل</TableHead>
                        <TableHead className="text-xs text-center">ایجاد</TableHead>
                        <TableHead className="text-xs text-center">به‌روزرسانی</TableHead>
                        <TableHead className="text-xs text-center">ردشده</TableHead>
                        <TableHead className="text-xs text-center">خطا</TableHead>
                        <TableHead className="text-xs">تاریخ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell>{statusIcon(h.status)}</TableCell>
                          <TableCell className="text-xs">{TARGET_META[h.entity]?.label ?? h.entity}</TableCell>
                          <TableCell className="text-xs font-medium max-w-[140px] truncate">{h.fileName || "—"}</TableCell>
                          <TableCell className="text-xs text-center">{toPersianDigits(h.totalRows)}</TableCell>
                          <TableCell className="text-xs text-center text-emerald-600">{toPersianDigits(h.createdRows)}</TableCell>
                          <TableCell className="text-xs text-center text-sky-600 dark:text-sky-400">{toPersianDigits(h.updatedRows)}</TableCell>
                          <TableCell className="text-xs text-center text-amber-600 dark:text-amber-400">{toPersianDigits(h.skippedRows)}</TableCell>
                          <TableCell className="text-xs text-center text-destructive">{toPersianDigits(h.errorRows)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{toJalaliSafe(h.date)}</TableCell>
                        </TableRow>
                      ))}
                      {historyLoading && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center">
                            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- ابزارهای محلی ---------- */

function toJalaliSafe(dateStr: string): string {
  try {
    return toJalali(new Date(dateStr));
  } catch {
    return dateStr?.slice(0, 10) ?? "—";
  }
}

/** نرمال‌سازی نام موجودیت از تاریخچهٔ سرور → نوع ویزارد */
function normalizeHistoryEntity(e: string): ImportEntity {
  const t = e.toLowerCase();
  if (t === "product" || t === "products") return "products";
  if (t === "party" || t === "parties" || t === "customer" || t === "customers") return "parties";
  if (t === "account" || t === "accounts") return "accounts";
  if (t === "journalentry" || t === "journalentries" || t === "journal") return "journalEntries";
  if (t === "stock" || t === "stockitem" || t === "stockitems") return "stock";
  if (t === "invoice" || t === "invoices") return "products";
  return "products";
}
