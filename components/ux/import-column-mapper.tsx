"use client";

/**
 * ============================================================
 * ImportColumnMapper — ویزارد ۳ مرحله‌ای درون‌ریزی با «نگاشت دستی ستون‌ها»
 * (Task 1-d — ارتقای درون‌ریزی کالا و محصولات)
 * ============================================================
 * مرحله ۱) بارگذاری فایل (drag & drop — همهٔ فرمت‌ها: xlsx/xlsm/xlsb/xls/ods/csv/tsv/txt/json)
 * مرحله ۲) پیش‌نمایش ستون‌ها + انتخاب دستی «هر ستون = کدام فیلد»
 *          - پیشنهاد هوشمند سرور (تطبیق هدر + استنتاج از الگوی داده‌ها)
 *          - انتخابگر موجودیت و شیت (اکسل چند-شیتی) که پیشنهادها را تازه می‌کند
 *          - خلاصهٔ «X از Y ستون نگاشت شد — Z نادیده»
 * مرحله ۳) گزینه‌ها (استراتژی تکراری، تولید خودکار کد) + وارد کردن با پیشرفت
 *          + نتایج کامل (ایجاد/به‌روزرسانی/ردشده/خطا + جدول ردیف‌های ناموفق
 *          + دانلود گزارش خطاها CSV)
 *
 * API: POST /api/import (multipart/form-data)
 *   preview → { mode:"preview", file, entityType?, sheet? }
 *   import  → { file, entityType, mapping (JSON ایندکس→فیلد), sheet, duplicateStrategy, autoSku }
 *
 * ماندگاری نگاشت: آخرین نگاشت موفق هر موجودیت در localStorage
 * (ofogh.importMapping.products / .customers / .invoices / .accounts /
 * .journalEntries / .checks / .employees) ذخیره و دفعهٔ بعد
 * برای هدرهای هم‌نام پیش‌پر می‌شود.
 * v20-E: ۴ موجودیت جدید (حساب‌ها، اسناد حسابداری، چک‌ها، کارکنان) +
 * فیلدهای جدید موجودیت‌های قبلی + «پیش‌نمایش ۱۰ ردیف اول» (mappedRows)
 * + prop «fixedEntity» برای استفاده در UniversalImportDialog.
 * v20-F (Squad D — ارتقای بزرگ درون‌ریزی):
 *  - فرمت‌های جدید: ODS (LibreOffice) + XLSM + XLSB در کنار XLSX/XLS
 *  - دکمهٔ برجستهٔ «دستی ستون‌ها را مدیریت کنید» در مرحلهٔ پیش‌نمایش +
 *    بازشدن خودکار ادیتور وقتی برخی ستون‌ها با اطمینان تشخیص نشده‌اند
 *  - نشانگر اطمینان تشخیص هر ستون + هایلایت کهربایی ستون‌های مشکوک
 *    (تطبیق تقریبی/ناشناخته) برای انتخاب دستی
 * ============================================================
 */

import * as React from "react";
import {
  Upload,
  FileSpreadsheet,
  FileJson,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Wand2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Download,
  Layers,
  Table2,
  Package,
  Users,
  ShoppingCart,
  Landmark,
  BookOpen,
  Banknote,
  ClipboardList,
  Info,
  Settings2,
  ChevronDown,
  Save,
  Bookmark,
  Trash2,
  Minus,
  Plus,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/persian";
import { authFetch, getAuthToken } from "@/lib/auth-fetch";
import { useToast } from "@/hooks/use-toast";
import { IMPORT_FIELD_DEFS, MAPPING_IGNORE } from "@/lib/import-parser";

/* ============================================================
 * انواع
 * ============================================================ */

export type MapperEntity =
  | "products"
  | "customers"
  | "invoices"
  | "accounts"
  | "journalEntries"
  | "checks"
  | "employees";

/** موجودیت UI → entityType سمت API (فقط «customers» به «parties» ترجمه می‌شود) */
const apiEntity = (e: MapperEntity): string => (e === "customers" ? "parties" : e);

interface PreviewColumn {
  index: number;
  header: string;
  samples: string[];
  suggestedField: string;
  confidence: "exact" | "fuzzy" | "inferred" | "none";
  reason: string;
}

interface PreviewData {
  file: { name: string; sizeBytes: number; format: string; encoding: string; delimiter: string };
  sheets: string[];
  selectedSheet: string;
  totalRows: number;
  headerInjected: boolean;
  junkRemoved: number;
  totalsRemoved: number;
  detectedEntity: string | null;
  entityTypeUsed: string;
  entityScores: Record<string, number>;
  dateFormat: string;
  columns: PreviewColumn[];
  inferredCount: number;
  /** R28-8: ردیف سرستون به‌کار-رفته (۱-مبنا؛ ۰ = بدون هدر/تزریق عمومی) */
  headerRowUsed?: number;
  /** R28-8: کل ردیف‌های خام فایل (برای بازهٔ استپر «ردیف سرستون») */
  rawRowCount?: number;
  /** R28-8: سرستون خودکار تشخیص شد (نه اجباری از کاربر) */
  headerRowAuto?: boolean;
}

interface ImportResultRow {
  row: number;
  message: string;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: ImportResultRow[];
  skippedRows: ImportResultRow[];
  totalRows: number;
}

type StepId = 1 | 2 | 3;

/* ============================================================
 * متادیتا: برچسب/گروه‌بندی فیلدهای هر موجودیت (برای دراپ‌داون نگاشت)
 * ============================================================ */

const ENTITY_META: Record<MapperEntity, { label: string; icon: React.ElementType }> = {
  products: { label: "محصولات", icon: Package },
  customers: { label: "مشتریان", icon: Users },
  invoices: { label: "فاکتورها", icon: ShoppingCart },
  accounts: { label: "حساب‌ها (کدینگ)", icon: Landmark },
  journalEntries: { label: "اسناد حسابداری", icon: BookOpen },
  checks: { label: "چک‌ها", icon: Banknote },
  employees: { label: "کارکنان", icon: ClipboardList },
};

/** فیلدهای قابل نمایش هر موجودیت (hidden ها مثل میانگین خرید هم می‌آیند — نگاشت دستی آزاد است)
 *
 * v20-E: تعریف فیلدهای ۴ موجودیت جدید + فیلدهای جدید موجودیت‌های قبلی
 * «محلی» است و با IMPORT_FIELD_DEFS (lib/import-parser.ts — منبع یگانه،
 * هم‌زمان توسط عامل موازی گسترش می‌یابد) ادغام می‌شود:
 *  - اگر فیلدی در lib تعریف شده باشد، تعریف lib اولویت دارد (label/alias)
 *  - فیلدهای محلی که در lib نیستند اضافه می‌شوند تا UI قبل از فرود کامل
 *    تعریف‌های سرور هم کار کند و بعدش با آن یکی شود
 */
export interface MapperFieldDef {
  key: string;
  label: string;
  required?: boolean;
  hidden?: boolean;
  aliases?: string[];
}

/** فیلدهای جدید موجودیت‌های قبلی (قرارداد v20 — lib/import-parser.ts هم‌زمان اضافه می‌کند) */
const EXTRA_FIELD_DEFS: Partial<Record<MapperEntity, MapperFieldDef[]>> = {
  products: [
    // تصویر کالا — تعریف lib (import-parser) اولویت دارد؛ این تعریف «پشتیبان» است
    { key: "imageUrl", label: "آدرس عکس کالا (لینک)", aliases: ["عکس", "تصویر", "لینک عکس", "آدرس عکس", "image", "photo", "imageurl"] },
    { key: "goodsCode", label: "کد جنس (خارجی)", aliases: ["کد جنس", "کد کالای خارجی", "goodscode"] },
    { key: "minStock", label: "حداقل موجودی (نقطه سفارش)", aliases: ["حداقل موجودی", "نقطه سفارش", "minstock", "min stock"] },
    { key: "maxStock", label: "حداکثر موجودی", aliases: ["حداکثر موجودی", "maxstock", "max stock"] },
  ],
  customers: [
    { key: "province", label: "استان", aliases: ["استان", "province"] },
    { key: "creditLimit", label: "سقف اعتبار", aliases: ["سقف اعتبار", "حد اعتبار", "creditlimit", "credit limit"] },
    { key: "openingBalance", label: "مانده اولیه", aliases: ["مانده اولیه", "مانده ابتدای دوره", "openingbalance", "opening balance"] },
  ],
  invoices: [
    { key: "type", label: "نوع فاکتور (فروش/خرید)", aliases: ["نوع فاکتور", "نوع", "type"] },
    { key: "itemRows", label: "ردیف‌های اقلام (هر قلم یک ردیف)", aliases: ["ردیف‌های اقلام", "ردیف اقلام", "قلم", "itemrows"] },
  ],
};

/** تعریف کامل فیلدهای ۴ موجودیت جدید v20 (قرارداد مشترک با /api/import) */
const NEW_ENTITY_FIELD_DEFS: Record<"accounts" | "journalEntries" | "checks" | "employees", MapperFieldDef[]> = {
  accounts: [
    { key: "code", label: "کد حساب", required: true, aliases: ["کد حساب", "کد", "code"] },
    { key: "name", label: "نام حساب", required: true, aliases: ["نام حساب", "شرح حساب", "نام", "name"] },
    { key: "group", label: "کدینگ/گروه", aliases: ["کدینگ", "گروه", "گروه حساب", "group"] },
    { key: "nature", label: "ماهیت (بدهکار/بستانکار/دوطرفه)", aliases: ["ماهیت", "نوع ماهیت", "nature"] },
    { key: "level", label: "سطح (کل/معین/تفصیلی)", aliases: ["سطح", "سطح حساب", "level"] },
    { key: "parentCode", label: "کد والد", aliases: ["کد والد", "کد حساب بالادستی", "parentcode"] },
    { key: "balance", label: "مانده اولیه", aliases: ["مانده اولیه", "مانده", "balance"] },
    { key: "description", label: "توضیحات", aliases: ["توضیحات", "شرح", "description"] },
  ],
  journalEntries: [
    { key: "docNumber", label: "شماره سند", required: true, aliases: ["شماره سند", "شماره عطف", "docnumber"] },
    { key: "date", label: "تاریخ", aliases: ["تاریخ", "تاریخ سند", "date"] },
    { key: "type", label: "نوع سند (سند حسابداری/رسید/پرداخت)", aliases: ["نوع سند", "نوع", "type"] },
    { key: "description", label: "شرح سند", aliases: ["شرح سند", "شرح", "توضیحات", "description"] },
    { key: "accountCode", label: "کد حساب", required: true, aliases: ["کد حساب", "کد طرف حساب", "accountcode"] },
    { key: "debit", label: "بدهکار", aliases: ["بدهکار", "بده", "debit"] },
    { key: "credit", label: "بستانکار", aliases: ["بستانکار", "بستان", "credit"] },
    { key: "docDescription", label: "شرح ردیف", aliases: ["شرح ردیف", "شرح آرتیکل", "docdescription"] },
  ],
  checks: [
    { key: "number", label: "شماره چک", required: true, aliases: ["شماره چک", "شماره", "number"] },
    { key: "type", label: "نوع (دریافتنی/پرداختنی)", aliases: ["نوع چک", "نوع", "type"] },
    { key: "partyName", label: "طرف حساب", aliases: ["طرف حساب", "نام طرف حساب", "partyname"] },
    { key: "amount", label: "مبلغ", required: true, aliases: ["مبلغ", "مبلغ چک", "amount"] },
    { key: "dueDate", label: "سررسید", aliases: ["سررسید", "تاریخ سررسید", "duedate"] },
    { key: "bankName", label: "نام بانک", aliases: ["نام بانک", "بانک", "bankname"] },
    { key: "description", label: "توضیحات", aliases: ["توضیحات", "شرح", "description"] },
  ],
  employees: [
    { key: "fullName", label: "نام و نام خانوادگی", required: true, aliases: ["نام و نام خانوادگی", "نام کامل", "fullname"] },
    { key: "nationalId", label: "کد ملی", aliases: ["کد ملی", "nationalid"] },
    { key: "mobile", label: "موبایل", aliases: ["موبایل", "تلفن همراه", "mobile"] },
    { key: "position", label: "سمت", aliases: ["سمت", "عنوان شغلی", "position"] },
    { key: "baseSalary", label: "حقوق پایه", aliases: ["حقوق پایه", "حقوق", "basesalary"] },
    { key: "hireDate", label: "تاریخ استخدام", aliases: ["تاریخ استخدام", "hiredate"] },
    { key: "accountNumber", label: "شماره شبا/حساب", aliases: ["شماره شبا", "شماره حساب", "شبا", "accountnumber"] },
    { key: "description", label: "توضیحات", aliases: ["توضیحات", "شرح", "description"] },
  ],
};

/** ادغام تعریف lib (اولویت) + فیلدهای محلی — برای همهٔ موجودیت‌ها */
export function getMapperFieldDefs(entity: MapperEntity): MapperFieldDef[] {
  const fromLib = (IMPORT_FIELD_DEFS as Record<string, MapperFieldDef[] | undefined>)[entity] ?? [];
  const extras = [
    ...(EXTRA_FIELD_DEFS[entity] ?? []),
    ...(NEW_ENTITY_FIELD_DEFS[entity as keyof typeof NEW_ENTITY_FIELD_DEFS] ?? []),
  ];
  const seen = new Set(fromLib.map((f) => f.key));
  return [...fromLib, ...extras.filter((f) => !seen.has(f.key))];
}

function fieldDefs(entity: MapperEntity) {
  return getMapperFieldDefs(entity);
}

function fieldLabel(entity: MapperEntity, key: string): string {
  return fieldDefs(entity).find((f) => f.key === key)?.label ?? key;
}

const FIELD_GROUPS: Record<MapperEntity, { label: string; fields: string[] }[]> = {
  products: [
    { label: "نام و مشخصات", fields: ["name", "unit"] },
    { label: "قیمت‌ها", fields: ["salePrice", "purchasePrice", "purchasePriceAvg", "purchasePriceLast", "wholesalePrice", "usdPrice"] },
    { label: "موجودی", fields: ["stock", "minStock", "maxStock"] },
    { label: "بارکد و کد", fields: ["sku", "barcode", "goodsCode"] },
    { label: "دسته‌بندی", fields: ["category", "categoryMain", "categorySub"] },
    { label: "تصویر و توضیحات", fields: ["description", "imageUrl"] },
  ],
  customers: [
    { label: "نام و مشخصات", fields: ["name", "code", "type"] },
    { label: "اطلاعات تماس", fields: ["phone", "mobile", "email"] },
    { label: "مالیاتی و هویتی", fields: ["nationalId", "economicCode", "taxId"] },
    { label: "آدرس", fields: ["address", "postalCode", "city", "province"] },
    { label: "مالی", fields: ["creditLimit", "openingBalance"] },
  ],
  invoices: [
    { label: "نام و مشخصات", fields: ["number", "date", "type", "description"] },
    { label: "مشتری", fields: ["partyCode", "partyName"] },
    { label: "مبالغ و اقلام", fields: ["total", "items", "itemRows"] },
  ],
  accounts: [
    { label: "شناسه حساب", fields: ["code", "name", "parentCode"] },
    { label: "ساختار کدینگ", fields: ["group", "nature", "level"] },
    { label: "مانده و شرح", fields: ["balance", "description"] },
  ],
  journalEntries: [
    { label: "شناسنامه سند", fields: ["docNumber", "date", "type", "description"] },
    { label: "ردیف‌های سند", fields: ["accountCode", "debit", "credit", "docDescription"] },
  ],
  checks: [
    { label: "شناسه چک", fields: ["number", "type", "partyName"] },
    { label: "مالی و سررسید", fields: ["amount", "dueDate", "bankName"] },
    { label: "شرح", fields: ["description"] },
  ],
  employees: [
    { label: "هویت", fields: ["fullName", "nationalId", "mobile"] },
    { label: "شغلی", fields: ["position", "baseSalary", "hireDate"] },
    { label: "مالی و شرح", fields: ["accountNumber", "description"] },
  ],
};

/** فیلدهای اجباری برای فعال شدن دکمهٔ وارد کردن */
function requiredFields(entity: MapperEntity): string[] {
  if (entity === "invoices") return ["number", "items"]; // مشتری: partyCode یا partyName
  if (entity === "accounts") return ["code", "name"];
  if (entity === "journalEntries") return ["docNumber", "accountCode"];
  if (entity === "checks") return ["number", "amount"];
  if (entity === "employees") return ["fullName"];
  return ["name"]; // products / customers
}

/** نمایش برچسب موجودیت از کلید API */
const entityLabelFromApi = (api: string): string =>
  ENTITY_META[(api === "parties" ? "customers" : api) as MapperEntity]?.label ?? api;

/* ============================================================
 * ماندگاری نگاشت — localStorage
 * ============================================================ */

const mappingStorageKey = (entity: MapperEntity) => `ofogh.importMapping.${entity}`;

interface StoredMapping {
  /** هدر فایل قبلی → فیلد هدف یا "ignore" */
  byHeader: Record<string, string>;
  savedAt: number;
}

function loadStoredMapping(entity: MapperEntity): StoredMapping | null {
  try {
    const raw = localStorage.getItem(mappingStorageKey(entity));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMapping;
    if (!parsed || typeof parsed !== "object" || !parsed.byHeader) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredMapping(entity: MapperEntity, byHeader: Record<string, string>): void {
  try {
    localStorage.setItem(
      mappingStorageKey(entity),
      JSON.stringify({ byHeader, savedAt: Date.now() } satisfies StoredMapping)
    );
  } catch {
    /* localStorage در دسترس نیست — بی‌صدا رد شود */
  }
}

/* ============================================================
 * R28-8 — پیش‌تنظیم‌های نام‌دار نگاشت (per entity — localStorage)
 * کلید: ofogh-import-mapping:<entity> — قرارداد صاحب محصول.
 * آخرین نگاشت موفق (بالای همین فایل) همچنان خودکار بازیابی می‌شود؛
 * پیش‌تنظیم‌ها «نسخه‌های نام‌دار» هستند که کاربر صریحاً ذخیره/اعمال می‌کند.
 * ============================================================ */

export interface MappingPreset {
  id: string;
  name: string;
  /** هدر فایل → فیلد هدف یا "ignore" */
  byHeader: Record<string, string>;
  savedAt: number;
}

const PRESET_STORAGE_PREFIX = "ofogh-import-mapping:";
const PRESET_MAX_COUNT = 12;

function presetStorageKey(entity: MapperEntity): string {
  return `${PRESET_STORAGE_PREFIX}${entity}`;
}

function loadPresets(entity: MapperEntity): MappingPreset[] {
  try {
    const raw = localStorage.getItem(presetStorageKey(entity));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MappingPreset[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p) =>
          p &&
          typeof p === "object" &&
          typeof p.name === "string" &&
          p.byHeader &&
          typeof p.byHeader === "object"
      )
      .slice(0, PRESET_MAX_COUNT);
  } catch {
    return [];
  }
}

function persistPresets(entity: MapperEntity, presets: MappingPreset[]): void {
  try {
    localStorage.setItem(
      presetStorageKey(entity),
      JSON.stringify(presets.slice(0, PRESET_MAX_COUNT))
    );
  } catch {
    /* localStorage در دسترس نیست — بی‌صدا */
  }
}

/* ============================================================
 * آپلود با پیشرفت واقعی (XHR — fetch پیشرفت آپلود ندارد)
 * ============================================================ */

interface XhrResult {
  status: number;
  json: Record<string, unknown>;
}

function xhrUploadForm(form: FormData, onProgress: (pct: number) => void): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/import");
    xhr.timeout = 600_000; // ۱۰ دقیقه — فایل‌های بزرگ تا ۱۰۰هزار ردیف
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

/* ============================================================
 * ابزارها
 * ============================================================ */

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

const FORMAT_BADGES: { label: string; icon: React.ElementType }[] = [
  { label: "CSV", icon: FileText },
  { label: "TXT", icon: FileText },
  { label: "TSV", icon: FileText },
  { label: "XLSX", icon: FileSpreadsheet },
  { label: "XLSM", icon: FileSpreadsheet },
  { label: "XLSB", icon: FileSpreadsheet },
  { label: "XLS", icon: FileSpreadsheet },
  { label: "ODS", icon: FileSpreadsheet },
  { label: "JSON", icon: FileJson },
];

/** پسوندهای مجاز آپلود — v20-F: + ods/xlsm/xlsb (همهٔ انواع اکسل + LibreOffice) */
const ALLOWED_EXTENSIONS = [
  ".xlsx",
  ".xlsm",
  ".xlsb",
  ".xls",
  ".ods",
  ".csv",
  ".tsv",
  ".txt",
  ".json",
] as const;

const CONFIDENCE_META: Record<
  PreviewColumn["confidence"],
  { label: string; className: string }
> = {
  exact: {
    label: "تطبیق دقیق",
    className: "border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200",
  },
  fuzzy: {
    label: "تطبیق تقریبی",
    className: "border-amber-300/70 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200",
  },
  inferred: {
    label: "تشخیص هوشمند",
    className: "border-primary/40 bg-primary/10 text-primary",
  },
  none: {
    label: "ناشناخته — انتخاب دستی",
    className: "border-amber-400/70 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200",
  },
};

/** سقف حجم فایل سمت کلاینت — همان سقف سرور (۱۵MB) */
const MAX_FILE_MB = 15;

/* R28-8 — اندازهٔ هر بچ ایمپورت چانکی (مسیر JSON سرور سقف ۵٬۰۰۰ ردیف دارد) */
const IMPORT_CHUNK_ROWS = 2000;
/** R28-8 — سقف حجم فایل برای «پیش‌نمایش فوری ردیف‌ها هنگام تغییر نگاشت» —
 * فایل‌های بزرگ‌تر فقط با دکمهٔ «ادامه» پیش‌نمایش را تازه می‌کنند (پرهیز از
 * آپلود مکرر فایل‌های حجیم با هر تغییر سلکت) */
const INSTANT_PREVIEW_MAX_BYTES = 4 * 1024 * 1024;

const isDateFormatFa = (d: string) =>
  d === "jalali" ? "شمسی (جلالی)" : d === "gregorian" ? "میلادی" : d === "mixed" ? "ترکیبی" : "";

/* ============================================================
 * کامپوننت اصلی
 * ============================================================ */

export interface ImportColumnMapperProps {
  /** موجودیت انتخاب‌شده (کنترل‌شده از بیرون — تب/سلکتور والد) */
  entity: MapperEntity;
  onEntityChange: (entity: MapperEntity) => void;
  /** بعد از ایمپورت موفق (برای به‌روزرسانی تاریخچه) */
  onImported?: () => void;
  /** v20-E: موجودیت از بیرون قفل شده (UniversalImportDialog) — سلکتور موجودیت مخفی می‌شود */
  fixedEntity?: boolean;
}

export function ImportColumnMapper({
  entity,
  onEntityChange,
  onImported,
  fixedEntity = false,
}: ImportColumnMapperProps) {
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = React.useState(false);

  // وضعیت مراحل
  const [step, setStep] = React.useState<StepId>(1);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [sheet, setSheet] = React.useState<string>("");

  // نگاشت: ایندکس ستون → فیلد هدف یا "ignore"
  const [mapping, setMapping] = React.useState<Record<number, string>>({});
  // ستون‌هایی که کاربر دستی تغییر داده (هایلایت + بج «دستی»)
  const [manualColumns, setManualColumns] = React.useState<Set<number>>(new Set());
  // ستون‌هایی که از نگاشت ذخیره‌شدهٔ قبلی پر شده‌اند
  const [restoredColumns, setRestoredColumns] = React.useState<Set<number>>(new Set());
  // بخش «دستی ستون‌ها را مدیریت کنید» — پیش‌فرض جمع‌شده (خلاصهٔ چیپی + شمارنده‌ها؛
  // v20-F: اگر ستون مشکوک باشد خودکار باز می‌شود — runPreview)
  const [mapperExpanded, setMapperExpanded] = React.useState(false);

  // گزینه‌ها
  const [duplicateStrategy, setDuplicateStrategy] = React.useState<"skip" | "update">("skip");
  const [autoSku, setAutoSku] = React.useState(true);

  // ایمپورت
  const [importing, setImporting] = React.useState(false);
  const [uploadPct, setUploadPct] = React.useState(0);
  const [serverProcessing, setServerProcessing] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  // v20-E: پیش‌نمایش «۱۰ ردیف اول» با نگاشت تاییدشده (mappedRows از API)
  const [mappedPreview, setMappedPreview] = React.useState<{
    rows: Record<string, unknown>[];
    errors: { row?: number; message: string }[];
  } | null>(null);
  const [mappedPreviewLoading, setMappedPreviewLoading] = React.useState(false);

  // R28-8 — ردیف سرستون اجباری (۰ = تشخیص خودکار) + استپر UI
  const [headerRow, setHeaderRow] = React.useState(0);
  // R28-8 — مقادیر پیش‌فرض فیلدهای نگاشت‌نشده ({ فیلد: مقدار })
  const [fallbacks, setFallbacks] = React.useState<Record<string, string>>({});
  // R28-8 — پیش‌تنظیم‌های نام‌دار نگاشت (localStorage ofogh-import-mapping:<entity>)
  const [presets, setPresets] = React.useState<MappingPreset[]>([]);
  const [presetName, setPresetName] = React.useState("");
  // R28-8 — اعتبارسنجی dryRun قبل از ثبت (شمارش ایجاد/به‌روز/رد + خطاهای ردیفی)
  const [validation, setValidation] = React.useState<ImportResult | null>(null);
  const [validationLoading, setValidationLoading] = React.useState(false);
  // R28-8 — پیشرفت بچ‌به‌بچ ایمپورت (مسیر چانکی JSON)
  const [batchProgress, setBatchProgress] = React.useState<{
    batchNo: number;
    totalBatches: number;
    rowsDone: number;
    totalRows: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  } | null>(null);

  /* ---------- دراپ‌زون ---------- */
  const handleFilePick = async (picked: File) => {
    const lower = picked.name.toLowerCase();
    const okExt = (ALLOWED_EXTENSIONS as readonly string[]).some((e) => lower.endsWith(e));
    if (!okExt) {
      toast({
        title: "فرمت فایل پشتیبانی نمی‌شود",
        description: "فرمت‌های مجاز: XLSX، XLSM، XLSB، XLS، ODS، CSV، TSV، TXT و JSON",
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
    // فایل جدید → بخش «دستی ستون‌ها را مدیریت کنید» جمع می‌شود (مگر آنکه ستون
    // مشکوک باشد — runPreview خودکار بازش می‌کند)
    setMapperExpanded(false);
    // R28-8: وضعیت‌های وابسته به فایل قبلی پاک شوند
    setHeaderRow(0);
    setValidation(null);
    setBatchProgress(null);
    await runPreview(picked, entity, "", 0);
  };

  /* R28-8 — بارگذاری پیش‌تنظیم‌های نگاشت همین موجودیت (localStorage) */
  React.useEffect(() => {
    setPresets(loadPresets(entity));
    setPresetName("");
  }, [entity]);

  /* ---------- پیش‌نمایش از سرور (پارس + پیشنهاد ستون‌ها) ---------- */
  const runPreview = React.useCallback(
    async (f: File, ent: MapperEntity, sheetName: string, forcedHeaderRow = 0) => {
      setPreviewLoading(true);
      setPreview(null);
      // FIX(1d-p2): نتیجهٔ ایمپورت قبلی با فایل/موجودیت/شیتِ جدید نامعتبر است —
      // بدون این پاک‌سازی، «ادامه» بعد از اصلاح نگاشت نتیجهٔ قدیمی را نشان می‌داد
      setResult(null);
      // v20-E: پیش‌نمایش ردیف‌های نگاشت‌شده هم با فایل/شیت جدید نامعتبر است
      setMappedPreview(null);
      // R28-8: اعتبارسنجی dryRun قبلی هم نامعتبر است
      setValidation(null);
      try {
        const form = new FormData();
        form.append("mode", "preview");
        form.append("file", f);
        form.append("entityType", apiEntity(ent));
        if (sheetName) form.append("sheet", sheetName);
        // R28-8 — ردیف سرستون اجباری (۰ = تشخیص خودکار)
        if (forcedHeaderRow > 0) form.append("headerRow", String(forcedHeaderRow));
        const { status, json } = await xhrUploadForm(form, () => {
          /* پیشرفت پیش‌نمایش مهم نیست — سریع است */
        });
        if (status !== 200 || !json.success) {
          throw new Error(String(json.error ?? "پیش‌نمایش فایل ناموفی بود"));
        }
        const p = json as unknown as PreviewData & { success: boolean };
        setPreview(p);

        // پیشنهادها + بازیابی نگاشت ذخیره‌شدهٔ همین موجودیت (برای هدرهای هم‌نام)
        const stored = loadStoredMapping(ent);
        const next: Record<number, string> = {};
        const restored = new Set<number>();
        for (const col of p.columns) {
          const saved = stored?.byHeader[col.header];
          if (saved !== undefined) {
            next[col.index] = saved;
            restored.add(col.index);
          } else {
            next[col.index] = col.suggestedField || MAPPING_IGNORE;
          }
        }
        setMapping(next);
        setManualColumns(new Set());
        setRestoredColumns(restored);

        // R28-8 (درخواست مالک): ادیتور نگاشت به‌طور پیش‌فرض «باز» است تا هر
        // ستون فایل با نمونه‌مقدارش دیده شود و کاربر بتواند فیلدش را عوض کند
        setMapperExpanded(true);
        setStep(2);

        const mappedCount = Object.values(next).filter((v) => v !== MAPPING_IGNORE).length;
        const needsManualReview = p.columns.filter(
          (c) =>
            (c.confidence === "fuzzy" || c.confidence === "none") &&
            !restored.has(c.index)
        ).length;
        toast({
          title: "فایل بررسی شد",
          description:
            `${toPersianDigits(p.totalRows)} ردیف • ${toPersianDigits(mappedCount)} از ${toPersianDigits(
              p.columns.length
            )} ستون نگاشت شد` +
            (restored.size > 0 ? ` • ${toPersianDigits(restored.size)} ستون از نگاشت قبلی شما` : "") +
            (p.inferredCount > 0 ? ` • ${toPersianDigits(p.inferredCount)} تشخیص هوشمند` : "") +
            (needsManualReview > 0
              ? ` • ${toPersianDigits(needsManualReview)} ستون نیازمند بررسی دستی`
              : "") +
            (forcedHeaderRow > 0
              ? ` • سرستون: ردیف ${toPersianDigits(forcedHeaderRow)}`
              : ""),
        });
      } catch (err) {
        if (forcedHeaderRow > 0) {
          // R28-8 — سرستون دستی معتبر نبود (مثلاً بعد از آن هیچ ردیف داده‌ای
          // باقی نماند) → به تشخیص خودکارِ همین فایل برگرد؛ فایل از دست نمی‌رود
          setHeaderRow(0);
          toast({
            title: "با این ردیف سرستون داده‌ای باقی نماند",
            description:
              "ردیف سرستون دیگری انتخاب کنید یا حالت «خودکار» را بگذارید — فایل شما حفظ شد.",
            variant: "destructive",
            duration: 8000,
          });
          queueMicrotask(() => {
            void runPreviewRef.current?.(f, ent, sheetName, 0);
          });
          return;
        }
        setFile(null);
        // FIX(1d-p2): اگر پیش‌نمایشِ مجدد (تغییر موجودیت/شیت) شکست بخورد،
        // کاربر در مرحلهٔ ۲ با صفحهٔ خالی گیر نمی‌کند — به‌آپلود برمی‌گردد
        setStep(1);
        toast({
          title: "خطا در خواندن فایل",
          description: err instanceof Error ? err.message : "فایل قابل خواندن نیست.",
          variant: "destructive",
          duration: 10000,
        });
      } finally {
        setPreviewLoading(false);
      }
    },
    [toast]
  );

  /* آخرین نسخهٔ runPreview برای بازگشت امن از سرستون نامعتبر (الگوی latest-ref) */
  const runPreviewRef = React.useRef(runPreview);
  runPreviewRef.current = runPreview;

  /* تغییر موجودیت → فقط گزارش به والد؛ پیش‌نمایش تازه در effect پایین
   * (FIX(1d-p2): entity یک prop کنترل‌شده است — تغییر آن از والد هم باید
   * پیش‌نمایش را تازه کند وگرنه گرید نگاشت با فیلدهای موجودیت جدید ناهمگام
   * می‌شد و سرور mapping را با ۴۰۰ رد می‌کرد) */
  const handleEntityChange = (next: MapperEntity) => {
    if (next === entity) return;
    onEntityChange(next);
  };

  /* اثر تغییر موجودیت (از سلکتور داخلی یا والد) → پیشنهادهای تازه برای همان فایل */
  const entityRef = React.useRef(entity);
  React.useEffect(() => {
    if (entityRef.current === entity) return;
    entityRef.current = entity;
    // R28-8: فیلدهای موجودیت عوض شد → مقادیر پیش‌فرض قبلی موضوعیت ندارند
    setFallbacks({});
    setValidation(null);
    if (file) void runPreview(file, entity, sheet, headerRow);
  }, [entity, file, sheet, runPreview, headerRow]);

  /* تغییر شیت (اکسل چند-شیتی) → پیش‌نمایش مجدد (انتخاب سرستون حفظ می‌شود) */
  const handleSheetChange = (next: string) => {
    setSheet(next);
    if (file) void runPreview(file, entity, next, headerRow);
  };

  /* ---------- R28-8: استپر «ردیف سرستون» ----------
   * اگر سطر اول فایل داده است (تیتر گزارش/خالی)، کاربر با این استپر تعیین
   * می‌کند سرستون‌ها کدام ردیف‌اند؛ ردیف‌های بالاتر دور ریخته می‌شوند و
   * پیش‌نمایش + پیشنهادها برای همان ردیف از نو محاسبه می‌شود. */
  const headerRowMax = Math.max(1, Math.min((preview?.rawRowCount ?? 2) - 1, 30));
  const effectiveHeaderRow = headerRow > 0 ? headerRow : Math.max(preview?.headerRowUsed ?? 1, 1);
  const handleHeaderRowChange = (next: number) => {
    const clamped = Math.min(Math.max(next, 1), headerRowMax);
    if (clamped === effectiveHeaderRow && headerRow === 0) return;
    if (clamped === headerRow) return;
    setHeaderRow(clamped);
    if (file) void runPreview(file, entity, sheet, clamped);
  };
  const resetHeaderRowAuto = () => {
    if (headerRow === 0) return;
    setHeaderRow(0);
    if (file) void runPreview(file, entity, sheet, 0);
  };

  /* ---------- v20-E: پیش‌نمایش «۱۰ ردیف اول» با نگاشت تاییدشده ----------
   * بعد از «ادامه» (مرحلهٔ ۲ → ۳) همان فایل + mapping به mode=preview
   * فرستاده می‌شود؛ API در پاسخ mappedRows (ردیف‌های نگاشت‌شده) و در صورت
   * وجود اعتبارسنجی سطر-to-سطر (mode=validate سمت سرور) خطاهای هر ردیف را
   * برمی‌گرداند (rowErrors / validationErrors / errors). اگر سرور قدیمی باشد
   * و mappedRows نداشته باشد، این بخش بی‌صدا حذف می‌شود و ایمپورت مسیر
   * قبلی خود را می‌رود. */
  const runMappedPreview = React.useCallback(async () => {
    if (!file) return;
    const hasMapping = Object.values(mapping).some((v) => v !== MAPPING_IGNORE);
    if (!hasMapping) {
      setMappedPreview(null);
      return;
    }
    setMappedPreviewLoading(true);
    try {
      const form = new FormData();
      form.append("mode", "preview");
      form.append("file", file);
      form.append("entityType", apiEntity(entity));
      if (sheet) form.append("sheet", sheet);
      // R28-8 — سرستون اجباری + مقادیر پیش‌فرض هم در پیش‌نمایش اعمال می‌شوند
      if (headerRow > 0) form.append("headerRow", String(headerRow));
      const mappingOut: Record<string, string> = {};
      for (const [k, v] of Object.entries(mapping)) mappingOut[String(k)] = v;
      form.append("mapping", JSON.stringify(mappingOut));
      const fallbacksOut = Object.fromEntries(
        Object.entries(fallbacks).filter(([, v]) => v.trim() !== "")
      );
      if (Object.keys(fallbacksOut).length > 0) {
        form.append("fallbacks", JSON.stringify(fallbacksOut));
      }
      const { status, json } = await xhrUploadForm(form, () => {
        /* پیشرفت مهم نیست */
      });
      if (status !== 200 || !json.success) {
        setMappedPreview(null);
        return;
      }
      const rows = Array.isArray(json.mappedRows)
        ? (json.mappedRows as Record<string, unknown>[])
        : [];
      const rawErrors: unknown[] = Array.isArray(json.rowErrors)
        ? (json.rowErrors as unknown[])
        : Array.isArray(json.validationErrors)
          ? (json.validationErrors as unknown[])
          : Array.isArray(json.errors)
            ? (json.errors as unknown[])
            : [];
      const errors = rawErrors.map((e) => {
        if (typeof e === "string") return { message: e };
        const o = e as { row?: unknown; message?: unknown; error?: unknown };
        const rowNo = Number(o.row);
        return {
          row: Number.isFinite(rowNo) && rowNo > 0 ? rowNo : undefined,
          message: String(o.message ?? o.error ?? "خطای نامشخص"),
        };
      });
      setMappedPreview({ rows, errors });
    } catch {
      // بی‌صدا — پیش‌نمایش ردیف‌ها اختیاری است و ایمپورت را متوقف نمی‌کند
      setMappedPreview(null);
    } finally {
      setMappedPreviewLoading(false);
    }
  }, [file, mapping, entity, sheet, headerRow, fallbacks]);

  /* ---------- R28-8: اعتبارسنجی dryRun قبل از ثبت (mode=validate) ----------
   * کل فایل + نگاشت + مقادیر پیش‌فرض + استراتژی تکراری به سرور می‌رود و
   * ایمپورتر «بدون نوشتن» اجرا می‌شود: شمارش ایجاد/به‌روزرسانی/ردشده +
   * دلایل رد (تکراری‌ها) + خطاهای ردیفی — پیش از اینکه کاربر دکمهٔ ثبت
   * را بزند. شکست → کارت بی‌صدا حذف می‌شود (مانع ایمپورت نیست). */
  const runValidation = React.useCallback(async () => {
    if (!file || !preview) return;
    const hasMapping = Object.values(mapping).some((v) => v !== MAPPING_IGNORE);
    if (!hasMapping) {
      setValidation(null);
      return;
    }
    setValidationLoading(true);
    try {
      const form = new FormData();
      form.append("mode", "validate");
      form.append("file", file);
      form.append("entityType", apiEntity(entity));
      if (sheet) form.append("sheet", sheet);
      if (headerRow > 0) form.append("headerRow", String(headerRow));
      const mappingOut: Record<string, string> = {};
      for (const [k, v] of Object.entries(mapping)) mappingOut[String(k)] = v;
      form.append("mapping", JSON.stringify(mappingOut));
      const fallbacksOut = Object.fromEntries(
        Object.entries(fallbacks).filter(([, v]) => v.trim() !== "")
      );
      if (Object.keys(fallbacksOut).length > 0) {
        form.append("fallbacks", JSON.stringify(fallbacksOut));
      }
      form.append("duplicateStrategy", duplicateStrategy);
      form.append("autoSku", autoSku ? "true" : "false");
      const { status, json } = await xhrUploadForm(form, () => {
        /* پیشرفت مهم نیست */
      });
      if (status !== 200 || !json.success) {
        setValidation(null);
        return;
      }
      setValidation({
        created: Number(json.created ?? 0),
        updated: Number(json.updated ?? 0),
        skipped: Number(json.skipped ?? 0),
        errors: (json.errors as ImportResultRow[]) ?? [],
        skippedRows: (json.skippedRows as ImportResultRow[]) ?? [],
        totalRows: Number(json.totalRows ?? preview.totalRows),
      });
    } catch {
      setValidation(null);
    } finally {
      setValidationLoading(false);
    }
  }, [file, preview, mapping, entity, sheet, headerRow, fallbacks, duplicateStrategy, autoSku]);

  /* R28-8 — تغییر نگاشت در مرحلهٔ ۲ → پیش‌نمایش ردیف‌ها بلافاصله (debounce)
   * تازه می‌شود تا کاربر اثر هر انتخاب را همان‌جا ببیند (درخواست مالک).
   * فایل‌های بزرگ‌تر از سقف، فقط با «ادامه» تازه می‌شوند. */
  React.useEffect(() => {
    if (step !== 2 || !file || !preview) return;
    if (file.size > INSTANT_PREVIEW_MAX_BYTES) return;
    const hasMapping = Object.values(mapping).some((v) => v !== MAPPING_IGNORE);
    if (!hasMapping) return;
    const t = setTimeout(() => {
      void runMappedPreview();
    }, 700);
    return () => clearTimeout(t);
  }, [mapping, step, file, preview, runMappedPreview]);

  /* R28-8 — در مرحلهٔ ۳، تغییر استراتژی/مقادیر پیش‌فرض → اعتبارسنجی dryRun
   * مجدد (شمارش تکراری‌ها به استراتژی وابسته است) */
  React.useEffect(() => {
    if (step !== 3 || result) return;
    const t = setTimeout(() => {
      void runValidation();
    }, 600);
    return () => clearTimeout(t);
  }, [step, duplicateStrategy, fallbacks, autoSku, result, runValidation]);

  /* ---------- تغییر نگاشت یک ستون ---------- */
  const handleMappingChange = (colIndex: number, field: string) => {
    setMapping((prev) => ({ ...prev, [colIndex]: field }));
    setManualColumns((prev) => new Set(prev).add(colIndex));
    setRestoredColumns((prev) => {
      if (!prev.has(colIndex)) return prev;
      const next = new Set(prev);
      next.delete(colIndex);
      return next;
    });
  };

  /* بازنشانی همهٔ ستون‌ها به پیشنهاد خودکار */
  const resetToSuggestions = () => {
    if (!preview) return;
    const next: Record<number, string> = {};
    for (const col of preview.columns) next[col.index] = col.suggestedField || MAPPING_IGNORE;
    setMapping(next);
    setManualColumns(new Set());
    setRestoredColumns(new Set());
    toast({ title: "نگاشت به پیشنهاد خودکار بازنشانی شد" });
  };

  /* ---------- محاسبات خلاصه ---------- */
  const columns = preview?.columns ?? [];
  const mappedFields = Object.entries(mapping).filter(([, v]) => v !== MAPPING_IGNORE);
  const mappedCount = mappedFields.length;
  const ignoredCount = columns.length - mappedCount;
  // FIX(1d-p2): دو ستون به یک فیلد → سرور بی‌صدا ستون دومی را اعمال می‌کند؛
  // باید تشخیص داده و قبل از ادامه اصلاح شود
  const fieldUsage = new Map<string, number>();
  for (const [, v] of Object.entries(mapping)) {
    if (v === MAPPING_IGNORE) continue;
    fieldUsage.set(v, (fieldUsage.get(v) ?? 0) + 1);
  }
  const duplicateFields = [...fieldUsage.entries()].filter(([, n]) => n > 1).map(([f]) => f);
  const required = requiredFields(entity);
  // R28-8 — فیلد اجباریِ بدون ستون، با «مقدار پیش‌فرض» هم قابل تأمین است
  const hasFallback = (field: string) => (fallbacks[field] ?? "").trim() !== "";
  const fieldMapped = (field: string) => mappedFields.some(([, v]) => v === field);
  const missingRequired = entity === "invoices"
    ? [
        ...required.filter((r) => !fieldMapped(r) && !hasFallback(r)),
        ...(!fieldMapped("partyCode") && !fieldMapped("partyName") && !hasFallback("partyName")
          ? ["partyCode"]
          : []),
      ]
    : required.filter((r) => !fieldMapped(r) && !hasFallback(r));
  const hasCustomerField =
    entity !== "invoices" ||
    fieldMapped("partyCode") ||
    fieldMapped("partyName") ||
    hasFallback("partyName");
  // R28-8 — فیلدهای بدون ستون (کاندید «مقدار پیش‌فرض») — اجباری‌ها اول
  const unmappedFields = fieldDefs(entity)
    .filter((f) => !f.hidden && !fieldMapped(f.key))
    .sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)));
  const activeFallbackCount = Object.values(fallbacks).filter((v) => v.trim() !== "").length;

  /* ---------- v20-F: ستون‌های «نیازمند بررسی دستی» ----------
   * تشخیص خودکار برای این ستون‌ها قطعی نیست (تطبیق تقریبی یا ناشناخته) و
   * کاربر هنوز آنها را دستی تعیین نکرده → هایلایت کهربایی + شمارنده +
   * بازشدن خودکار ادیتور نگاشت (بالا در runPreview) */
  const isColumnUnsure = (col: PreviewColumn) =>
    (col.confidence === "fuzzy" || col.confidence === "none") &&
    !manualColumns.has(col.index) &&
    !restoredColumns.has(col.index);
  const unsureCount = columns.filter(isColumnUnsure).length;

  /* ---------- R28-8: پیش‌تنظیم‌های نگاشت — ذخیره/اعمال/حذف ---------- */
  const saveCurrentPreset = () => {
    const name = presetName.trim();
    if (!name) {
      toast({
        title: "نام پیش‌تنظیم را وارد کنید",
        description: "مثلاً «خروجی هلو» یا «لیست سپیدار»",
        variant: "destructive",
      });
      return;
    }
    if (columns.length === 0) return;
    const byHeader: Record<string, string> = {};
    for (const col of columns) byHeader[col.header] = mapping[col.index] ?? MAPPING_IGNORE;
    const preset: MappingPreset = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: name.slice(0, 60),
      byHeader,
      savedAt: Date.now(),
    };
    const next = [preset, ...presets.filter((p) => p.name !== preset.name)].slice(0, PRESET_MAX_COUNT);
    setPresets(next);
    persistPresets(entity, next);
    setPresetName("");
    toast({
      title: "پیش‌تنظیم نگاشت ذخیره شد",
      description: `«${preset.name}» — دفعهٔ بعد با یک کلیک روی همین موجودیت اعمال می‌شود.`,
    });
  };

  const applyPreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset || columns.length === 0) return;
    const next: Record<number, string> = {};
    const applied = new Set<number>();
    for (const col of columns) {
      const saved = preset.byHeader[col.header];
      if (saved !== undefined) {
        next[col.index] = saved;
        applied.add(col.index);
      } else {
        next[col.index] = mapping[col.index] ?? MAPPING_IGNORE;
      }
    }
    setMapping(next);
    setRestoredColumns(applied);
    setManualColumns(new Set());
    toast({
      title: "پیش‌تنظیم اعمال شد",
      description:
        applied.size > 0
          ? `«${preset.name}» — ${toPersianDigits(applied.size)} ستون هم‌نام از پیش‌تنظیم پر شد.`
          : `هیچ هدر فایل با «${preset.name}» هم‌نام نبود — نگاشت تغییری نکرد.`,
      variant: applied.size > 0 ? "default" : "destructive",
    });
  };

  const deletePreset = (presetId: string) => {
    const next = presets.filter((p) => p.id !== presetId);
    setPresets(next);
    persistPresets(entity, next);
    toast({ title: "پیش‌تنظیم حذف شد" });
  };

  /* ---------- اجرای ایمپورت ---------- */
  const handleImport = async () => {
    if (!file || !preview) return;
    setImporting(true);
    setUploadPct(0);
    setServerProcessing(false);
    setBatchProgress(null);
    // نگاشت کامل: همهٔ ستون‌ها (نگاشت‌شده + نادیده) — ایندکس → فیلد
    const mappingOut: Record<string, string> = {};
    for (const [k, v] of Object.entries(mapping)) mappingOut[String(k)] = v;
    const fallbacksOut = Object.fromEntries(
      Object.entries(fallbacks).filter(([, v]) => v.trim() !== "")
    );
    try {
      /* R28-8 (3d) — ایمپورت بچ‌به‌بچ با پیشرفت واقعی:
       * فایل با همان پارسر سرور (lib/import-formats — dynamic import تا باندل
       * xlsx فقط همین‌جا بارگیری شود) سمت کلاینت پارس می‌شود و ردیف‌ها در
       * بچ‌های ۲۰۰۰تایی به مسیر JSON ارسال می‌شوند؛ شمارهٔ ردیف خطاها به
       * شمارهٔ مطلق فایل برمی‌گردد (آفست بچ). ترتیبِ ترتیبیِ بچ‌ها یعنی
       * تشخیص تکراری بین‌بچی از روی DB همگی درست کار می‌کند.
       * هر خطای پارس → بازگشت به مسیر کلاسیک «آپلود یکجای فایل». */
      let res: ImportResult | null = null;
      // شمارش بچ‌های «ارسال‌شده» — اگر بعد از موفقیتِ برخی بچ‌ها خطا بیاید،
      // بازگشت به مسیر یکجا ممنوع است (خطر ایمپورت دوبارهٔ همان ردیف‌ها)
      let batchesSent = 0;
      let chunkTotals: { created: number; updated: number; skipped: number; errors: ImportResultRow[]; skippedRows: ImportResultRow[]; totalRows: number } | null = null;
      try {
        const { parseImportFile } = await import("@/lib/import-formats");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const parsed = parseImportFile(bytes, file.name, sheet || undefined, {
          headerRow: headerRow > 0 ? headerRow : undefined,
        });
        if (parsed.rows.length > 0) {
          const totalBatches = Math.ceil(parsed.rows.length / IMPORT_CHUNK_ROWS);
          let created = 0;
          let updated = 0;
          let skipped = 0;
          const errors: ImportResultRow[] = [];
          const skippedRows: ImportResultRow[] = [];
          for (let b = 0; b < totalBatches; b++) {
            const slice = parsed.rows.slice(b * IMPORT_CHUNK_ROWS, (b + 1) * IMPORT_CHUNK_ROWS);
            const offset = b * IMPORT_CHUNK_ROWS;
            const resp = await authFetch("/api/import", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                entityType: apiEntity(entity),
                data: slice,
                mapping: mappingOut,
                ...(Object.keys(fallbacksOut).length > 0 ? { fallbacks: fallbacksOut } : {}),
                duplicateStrategy,
                autoSku,
                fileName: file.name,
                mode: "import",
              }),
            });
            const json = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
            if (!resp.ok || !json?.success) {
              throw new Error(String(json?.error ?? "وارد کردن داده ناموفق بود"));
            }
            batchesSent++;
            created += Number(json.created ?? 0);
            updated += Number(json.updated ?? 0);
            skipped += Number(json.skipped ?? 0);
            for (const e of (json.errors as ImportResultRow[]) ?? []) {
              errors.push({ row: e.row + offset, message: e.message });
            }
            for (const s of (json.skippedRows as ImportResultRow[]) ?? []) {
              skippedRows.push({ row: s.row + offset, message: s.message });
            }
            chunkTotals = { created, updated, skipped, errors, skippedRows, totalRows: parsed.rows.length };
            setBatchProgress({
              batchNo: b + 1,
              totalBatches,
              rowsDone: Math.min((b + 1) * IMPORT_CHUNK_ROWS, parsed.rows.length),
              totalRows: parsed.rows.length,
              created,
              updated,
              skipped,
              errors: errors.length,
            });
          }
          res = chunkTotals;
        }
      } catch (chunkErr) {
        if (batchesSent > 0 && chunkTotals) {
          // قطع وسط ایمپورت — ردیف‌های بچ‌های قبلی ثبت شده‌اند؛ نتیجهٔ جزئی
          // گزارش می‌شود و مسیر یکجا اجرا نمی‌شود (خطر تکرار)
          chunkTotals.errors.push({
            row: 0,
            message: `ایمپورت در بخش ${toPersianDigits(batchesSent + 1)} قطع شد (${
              chunkErr instanceof Error ? chunkErr.message : "خطای شبکه"
            }) — ردیف‌های بخش‌های قبلی ثبت شده‌اند.`,
          });
          res = chunkTotals;
        } else {
          // پارس کلاینت یا بچ اول شکست خورد (هیچ چیزی ثبت نشده) →
          // مسیر کلاسیک «آپلود یکجای فایل»
          setBatchProgress(null);
        }
      }

      /* مسیر کلاسیک — آپلود یکجای فایل (fallback) */
      if (!res) {
        const form = new FormData();
        form.append("mode", "import");
        form.append("file", file);
        form.append("entityType", apiEntity(entity));
        if (sheet) form.append("sheet", sheet);
        if (headerRow > 0) form.append("headerRow", String(headerRow));
        form.append("mapping", JSON.stringify(mappingOut));
        if (Object.keys(fallbacksOut).length > 0) {
          form.append("fallbacks", JSON.stringify(fallbacksOut));
        }
        form.append("duplicateStrategy", duplicateStrategy);
        form.append("autoSku", autoSku ? "true" : "false");

        const { status, json } = await xhrUploadForm(form, (pct) => {
          // ۰ تا ۷۰٪ آپلود؛ بقیه پردازش سرور
          setUploadPct(Math.min(70, Math.round(pct * 0.7)));
          if (pct >= 100) setServerProcessing(true);
        });
        setServerProcessing(false);
        if (status !== 200 || !json.success) {
          throw new Error(String(json.error ?? "وارد کردن داده ناموفق بود"));
        }
        res = {
          created: Number(json.created ?? 0),
          updated: Number(json.updated ?? 0),
          skipped: Number(json.skipped ?? 0),
          errors: (json.errors as ImportResultRow[]) ?? [],
          skippedRows: (json.skippedRows as ImportResultRow[]) ?? [],
          totalRows: Number(json.totalRows ?? preview.totalRows),
        };
      }
      setResult(res);

      // ماندگاری نگاشت موفق — هدر → فیلد (دفعهٔ بعد پیش‌پر می‌شود)
      const byHeader: Record<string, string> = {};
      for (const col of columns) byHeader[col.header] = mapping[col.index] ?? MAPPING_IGNORE;
      saveStoredMapping(entity, byHeader);

      const failedCount = res.errors.length;
      if (res.created + res.updated === 0) {
        toast({
          title: "هیچ ردیفی وارد نشد",
          description: res.errors[0]?.message ?? res.skippedRows[0]?.message ?? "نگاشت ستون‌ها را بررسی کنید.",
          variant: "destructive",
          duration: 10000,
        });
      } else {
        toast({
          title: failedCount > 0 ? "واردات ناقص انجام شد" : "واردات با موفقیت انجام شد",
          description:
            `${toPersianDigits(res.created)} ایجاد، ${toPersianDigits(res.updated)} به‌روزرسانی، ` +
            `${toPersianDigits(res.skipped)} ردشده، ${toPersianDigits(failedCount)} خطا`,
          variant: failedCount > 0 ? "destructive" : "default",
        });
      }
      onImported?.();
    } catch (err) {
      toast({
        title: "خطا در واردات",
        description: err instanceof Error ? err.message : "ارتباط با سرور برقرار نشد.",
        variant: "destructive",
        duration: 10000,
      });
    } finally {
      setImporting(false);
      setUploadPct(0);
      setServerProcessing(false);
    }
  };

  /* شروع مجدد — فایل جدید */
  const resetAll = () => {
    setStep(1);
    setFile(null);
    setPreview(null);
    setMapping({});
    setManualColumns(new Set());
    setRestoredColumns(new Set());
    setResult(null);
    setSheet("");
    setMappedPreview(null);
    setMapperExpanded(false);
    setHeaderRow(0);
    setValidation(null);
    setBatchProgress(null);
  };

  /* دانلود گزارش خطاها/ردشده‌ها (CSV با BOM) */
  const downloadErrorReport = () => {
    if (!result) return;
    const lines = ["ردیف,نوع,دلیل"];
    for (const e of result.errors) lines.push(`${e.row},خطا,"${e.message.replace(/"/g, '""')}"`);
    for (const s of result.skippedRows) lines.push(`${s.row},ردشده,"${s.message.replace(/"/g, '""')}"`);
    downloadBlob(
      "\uFEFF" + lines.join("\r\n"),
      "text/csv;charset=utf-8",
      `گزارش_ایمپورت_${entity}_${new Date().toISOString().slice(0, 10)}.csv`
    );
  };

  /* ---------- رندرهای مشترک ادیتور «دستی ستون‌ها را مدیریت کنید» ----------
   * سلکت فیلد هدف و بج اطمینان بین نمای کارتی موبایل و جدول دسکتاپ
   * مشترک‌اند تا رفتار (بج «دستی»، هشدار تکراری/اجباری و…) یکسان بماند */

  const renderTargetSelect = (col: PreviewColumn) => {
    const value = mapping[col.index] ?? MAPPING_IGNORE;
    const isManual = manualColumns.has(col.index);
    return (
      <Select
        value={value}
        onValueChange={(v) => handleMappingChange(col.index, v)}
        disabled={previewLoading || importing}
      >
        <SelectTrigger
          className={cn(
            "h-9 w-full text-xs",
            isManual && "border-primary/60 ring-1 ring-primary/30",
            value === MAPPING_IGNORE && "text-muted-foreground",
            duplicateFields.includes(value) && "border-destructive/60 ring-1 ring-destructive/25",
            missingRequired.some(
              (r) =>
                r === value ||
                (r === "partyCode" &&
                  !hasCustomerField &&
                  (value === "partyName" || value === "partyCode"))
            ) && "border-destructive/50"
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel className="text-[11px]">نادیده گرفتن</SelectLabel>
            <SelectItem value={MAPPING_IGNORE} className="text-xs">
              نادیده گرفتن این ستون
            </SelectItem>
          </SelectGroup>
          <SelectSeparator />
          {FIELD_GROUPS[entity].map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel className="text-[11px]">{group.label}</SelectLabel>
              {group.fields
                .filter((f) => fieldDefs(entity).some((d) => d.key === f))
                .map((f) => {
                  const def = fieldDefs(entity).find((d) => d.key === f);
                  return (
                    <SelectItem key={f} value={f} className="text-xs">
                      {def?.label ?? f}
                      {def?.required ? " *" : ""}
                    </SelectItem>
                  );
                })}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const renderConfidenceBadge = (col: PreviewColumn) => {
    const conf = CONFIDENCE_META[col.confidence];
    return (
      <Badge
        variant="outline"
        title={col.reason}
        className={cn("text-[9px] gap-1 max-w-full whitespace-normal", conf.className)}
      >
        {col.confidence === "inferred" && <Sparkles className="h-3 w-3 shrink-0" />}
        {col.confidence === "none" && <AlertTriangle className="h-3 w-3 shrink-0" />}
        {conf.label}
      </Badge>
    );
  };

  /* ---------- رندر ---------- */

  const steps: { id: StepId; label: string }[] = [
    { id: 1, label: "بارگذاری فایل" },
    { id: 2, label: "نگاشت ستون‌ها" },
    { id: 3, label: "وارد کردن" },
  ];

  const currentStep: StepId = result ? 3 : step;

  return (
    <div className="space-y-4" dir="rtl">
      {/* ---------- نشانگر مراحل ---------- */}
      <ol className="flex items-center gap-1 sm:gap-2" aria-label="مراحل درون‌ریزی">
        {steps.map((s, i) => {
          const done = currentStep > s.id || (result && s.id === 3);
          const active = currentStep === s.id && !result;
          return (
            <React.Fragment key={s.id}>
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-px flex-1 min-w-3",
                    done || active ? "bg-primary/60" : "bg-border"
                  )}
                />
              )}
              <li className="flex items-center gap-1.5 shrink-0">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition-colors",
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : active
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground"
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : toPersianDigits(s.id)}
                </span>
                <span
                  className={cn(
                    "hidden sm:block text-[11px]",
                    active ? "font-bold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {s.label}
                </span>
              </li>
            </React.Fragment>
          );
        })}
      </ol>

      {/* ============================================================
       * مرحله ۱ — بارگذاری فایل
       * ============================================================ */}
      {step === 1 && (
        <div
          className={cn(
            "group relative border-2 border-dashed rounded-2xl px-6 py-10 text-center transition-all duration-300 cursor-pointer overflow-hidden",
            dragActive
              ? "border-primary bg-primary/10 scale-[1.01] shadow-lg shadow-primary/10"
              : "border-border hover:border-primary/60 hover:bg-primary/[0.03] hover:shadow-md"
          )}
          onClick={() => !previewLoading && fileInputRef.current?.click()}
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
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
          }}
          aria-label="آپلود فایل برای درون‌ریزی"
        >
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-amber-500/10 transition-opacity duration-500",
              dragActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          />
          <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center">
            <div
              className={cn(
                "absolute inset-0 rounded-2xl bg-gradient-to-br transition-transform duration-300",
                dragActive
                  ? "from-primary/30 to-amber-500/30 scale-110 rotate-3"
                  : "from-primary/15 to-amber-500/15 group-hover:scale-105 group-hover:-rotate-3"
              )}
            />
            {previewLoading ? (
              <Loader2 className="relative h-7 w-7 animate-spin text-primary" />
            ) : (
              <Upload
                className={cn(
                  "relative h-7 w-7 transition-all duration-300",
                  dragActive
                    ? "text-primary scale-110 -translate-y-1"
                    : "text-primary/80 group-hover:text-primary group-hover:-translate-y-0.5"
                )}
              />
            )}
          </div>
          <p className="relative text-sm font-semibold text-foreground">
            {previewLoading
              ? "در حال بررسی فایل…"
              : dragActive
                ? "فایل را همین‌جا رها کنید"
                : "فایل خود را اینجا رها کنید یا کلیک کنید"}
          </p>
          <p className="relative text-xs text-muted-foreground mt-1.5">
            اکسل (XLSX/XLS/XLSM/XLSB)، ODS (لیبره‌آفیس)، CSV، TSV، TXT و JSON — حداکثر{" "}
            {toPersianDigits(MAX_FILE_MB)} مگابایت و {toPersianDigits(100000)} ردیف
          </p>
          <div className="relative mt-3 flex flex-wrap items-center justify-center gap-2">
            {FORMAT_BADGES.map(({ label, icon: Icon }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 rounded-full border bg-background/80 px-2.5 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur transition-colors group-hover:text-foreground"
              >
                <Icon className="h-3 w-3" />
                {label}
              </span>
            ))}
          </div>
          <div className="relative mt-4 inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-[11px] text-primary/90 dark:text-primary/80">
            <Table2 className="h-3.5 w-3.5 shrink-0" />
            <span>
              خروجی هلو/سپیدار/محک مستقیم وارد کنید — انکودینگ Windows-1256، جداکننده‌های مختلف و قیمت‌های
              شکسته خودکار اصلاح می‌شوند
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xlsm,.xlsb,.xls,.ods,.csv,.tsv,.txt,.json,text/csv,text/plain,text/tab-separated-values,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.ms-excel.sheet.binary.macroEnabled.12,application/vnd.oasis.opendocument.spreadsheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFilePick(f);
              e.target.value = "";
            }}
            disabled={previewLoading}
          />
        </div>
      )}

      {/* ============================================================
       * مرحله ۲ — نگاشت ستون‌ها
       * ============================================================ */}
      {/* FIX(1d-p2): هنگام پیش‌نمایشِ مجدد (تغییر موجودیت/شیت) گرید قدیمی حذف
       * می‌شود — به‌جای صفحهٔ خالی، حالت بارگذاری نمایش داده می‌شود */}
      {step === 2 && !preview && previewLoading && (
        <div className="rounded-xl border bg-card p-8 text-center space-y-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">در حال تحلیل مجدد ستون‌های فایل…</p>
        </div>
      )}
      {step === 2 && preview && (
        <div className="space-y-3">
          {/* نوار بالا: اطلاعات فایل + موجودیت + شیت */}
          <div className="rounded-xl border bg-card p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px] gap-1">
                {["xlsx", "xls", "xlsm", "xlsb", "ods"].includes(preview.file.format) ? (
                  <FileSpreadsheet className="h-3 w-3" />
                ) : preview.file.format === "json" ? (
                  <FileJson className="h-3 w-3" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
                {file?.name.slice(0, 32) ?? preview.file.name.slice(0, 32)}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {toPersianDigits(preview.totalRows)} ردیف
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {toPersianDigits(preview.columns.length)} ستون
              </Badge>
              {preview.file.encoding && (
                <Badge variant="secondary" className="text-[10px]">
                  {preview.file.encoding === "windows-1256"
                    ? "Windows-1256"
                    : preview.file.encoding.toUpperCase()}
                </Badge>
              )}
              {isDateFormatFa(preview.dateFormat) && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Info className="h-3 w-3" />
                  تاریخ {isDateFormatFa(preview.dateFormat)}
                </Badge>
              )}
              {preview.headerInjected && (
                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300">
                  بدون هدر — ستون‌ها نام‌گذاری شد
                </Badge>
              )}
              {(preview.junkRemoved > 0 || preview.totalsRemoved > 0) && (
                <Badge variant="outline" className="text-[10px]">
                  {toPersianDigits(preview.junkRemoved + preview.totalsRemoved)} سطر مزاحم حذف شد
                </Badge>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {/* انتخابگر موجودیت — تغییرش پیشنهادها را تازه می‌کند */}
              {/* v20-E: در UniversalImportDialog موجودیت قفل است — سلکتور مخفی */}
              {fixedEntity ? (
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-[11px] text-muted-foreground shrink-0">نوع داده:</span>
                  <Badge variant="secondary" className="text-[11px] gap-1 h-9 px-3 rounded-md">
                    {(() => {
                      const M = ENTITY_META[entity];
                      const Icon = M.icon;
                    return (
                      <span className="flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5" />
                        {M.label}
                      </span>
                    );
                    })()}
                  </Badge>
                </div>
              ) : (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-[11px] text-muted-foreground shrink-0">نوع داده:</span>
                <Select
                  value={entity}
                  onValueChange={(v) => handleEntityChange(v as MapperEntity)}
                  disabled={previewLoading || importing}
                >
                  <SelectTrigger className="h-9 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ENTITY_META).map(([key, meta]) => {
                      const Icon = meta.icon;
                      return (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" />
                            {meta.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              )}
              {/* انتخابگر شیت — فقط اکسل چند-شیتی */}
              {preview.sheets.length > 1 && (
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    <Layers className="h-3.5 w-3.5 ml-1 inline" />
                    شیت:
                  </span>
                  <Select
                    value={preview.selectedSheet}
                    onValueChange={handleSheetChange}
                    disabled={previewLoading || importing}
                  >
                    <SelectTrigger className="h-9 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {preview.sheets.map((s, i) => (
                        <SelectItem key={s} value={s}>
                          {s} {toPersianDigits(i + 1) !== s ? `(${toPersianDigits(i + 1)})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {/* R28-8 — استپر «ردیف سرستون»: اگر سطر اول فایل داده است (تیتر
                   گزارش/خالی)، کاربر تعیین می‌کند سرستون‌ها کدام ردیف‌اند؛
                   ردیف‌های بالاتر دور ریخته می‌شوند و پیشنهادها از نو محاسبه می‌شوند */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground shrink-0">
                  <ListChecks className="h-3.5 w-3.5 ml-1 inline" />
                  ردیف سرستون:
                </span>
                <div
                  className="flex items-center gap-0.5 rounded-lg border bg-background h-9"
                  role="group"
                  aria-label="ردیف سرستون"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleHeaderRowChange(effectiveHeaderRow - 1)}
                    disabled={previewLoading || importing || effectiveHeaderRow <= 1}
                    aria-label="ردیف سرستون قبلی"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span
                    className="min-w-9 text-center text-xs font-bold tabular-nums"
                    title={headerRow === 0 ? "تشخیص خودکار" : `انتخاب دستی — ردیف ${toPersianDigits(headerRow)}`}
                  >
                    {toPersianDigits(effectiveHeaderRow)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleHeaderRowChange(effectiveHeaderRow + 1)}
                    disabled={previewLoading || importing || effectiveHeaderRow >= headerRowMax}
                    aria-label="ردیف سرستون بعدی"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {headerRow === 0 ? (
                  <Badge
                    variant="outline"
                    className="text-[9px] gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    title="سرستون به‌طور خودکار از روی محتوای فایل تشخیص شد"
                  >
                    خودکار
                  </Badge>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-[10px] text-muted-foreground"
                    onClick={resetHeaderRowAuto}
                    disabled={previewLoading || importing}
                  >
                    <RotateCcw className="h-3 w-3" />
                    خودکار
                  </Button>
                )}
              </div>
            </div>
            {/* پیشنهاد تغییر موجودیت اگر هدرها با تب فعلی نمی‌خوانند
             * (v20-E: با موجودیت قفل‌شده، پیشنهاد نمایش داده نمی‌شود — قابل تغییر نیست) */}
            {!fixedEntity && preview.detectedEntity && preview.detectedEntity !== apiEntity(entity) && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/30 p-2.5">
                <Wand2 className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span className="text-[11px] text-amber-800 dark:text-amber-300 flex-1">
                  هدرهای فایل شما بیشتر شبیه «{entityLabelFromApi(preview.detectedEntity)}» است
                  {` (امتیاز: ${toPersianDigits(
                    preview.entityScores[preview.detectedEntity] ?? 0
                  )})`}
                  — پیشنهاد می‌شود موجودیت را عوض کنید.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() =>
                    handleEntityChange(
                      (preview.detectedEntity === "parties" ? "customers" : preview.detectedEntity) as MapperEntity
                    )
                  }
                  disabled={previewLoading}
                >
                  تغییر به {entityLabelFromApi(preview.detectedEntity)}
                </Button>
              </div>
            )}
          </div>

          {/* بخش «دستی ستون‌ها را مدیریت کنید» — بلافاصله زیر نوار اطلاعات فایل؛
           * v20-F: دکمهٔ اصلی و برجسته ( Settings2 ) — پیش‌فرض جمع‌شده:
           * خلاصهٔ چیپی «فیلد هدف ← نام ستون فایل» + شمارنده‌ها + هشدار کهربایی
           * ستون‌های تشخیص‌نیافته. با کلیک، ادیتور کامل باز می‌شود
           * (موبایل: کارت‌های عمودی / دسکتاپ: جدول هم‌عرض کانتینر — بدون اسکرول افقی) */}
          <div className="rounded-xl border border-primary/25 bg-primary/[0.04] overflow-hidden">
            {/* هدر بخش: دکمهٔ باز/بسته + شمارنده‌ها + بازنشانی */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 p-3">
              <Button
                type="button"
                variant={mapperExpanded ? "secondary" : "outline"}
                size="sm"
                onClick={() => setMapperExpanded((v) => !v)}
                aria-expanded={mapperExpanded}
                aria-controls="manual-columns-editor"
                className={cn(
                  "h-10 w-full justify-center gap-2 px-4 text-[13px] font-bold sm:w-auto sm:justify-start",
                  !mapperExpanded &&
                    "border-primary/50 bg-primary/10 text-primary shadow-sm hover:bg-primary/15 hover:text-primary dark:bg-primary/15"
                )}
              >
                <Settings2 className="h-4 w-4 shrink-0" />
                دستی ستون‌ها را مدیریت کنید
                {unsureCount > 0 && !mapperExpanded && (
                  <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                    mapperExpanded && "rotate-180"
                  )}
                />
              </Button>
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge className="text-[10px] gap-1 border border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                  {toPersianDigits(mappedCount)} نگاشت
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {toPersianDigits(ignoredCount)} نادیده
                </Badge>
                {unsureCount > 0 && (
                  <Badge className="text-[10px] gap-1 border border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                    <AlertTriangle className="h-3 w-3" />
                    {toPersianDigits(unsureCount)} ستون نیازمند بررسی
                  </Badge>
                )}
                {preview.inferredCount > 0 && (
                  <Badge className="text-[10px] gap-1 border border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                    <Sparkles className="h-3 w-3" />
                    {toPersianDigits(preview.inferredCount)} تشخیص هوشمند
                  </Badge>
                )}
                {restoredColumns.size > 0 && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <RotateCcw className="h-3 w-3" />
                    {toPersianDigits(restoredColumns.size)} ستون از نگاشت قبلی
                  </Badge>
                )}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ms-auto h-7 gap-1 text-[11px]"
                onClick={resetToSuggestions}
                disabled={previewLoading || importing}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                بازنشانی به پیشنهاد خودکار
              </Button>
              {/* R28-8 — نشانگر «پیش‌نمایش در حال به‌روزرسانی» (تغییر نگاشت →
                   پیش‌نمایش ردیف‌ها بلافاصله تازه می‌شود) */}
              {mappedPreviewLoading && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  به‌روزرسانی پیش‌نمایش…
                </span>
              )}
            </div>

            {/* R28-8 — پیش‌تنظیم‌های نام‌دار نگاشت: اعمال یک‌کلیکی + ذخیرهٔ
                نگاشت جاری با نام + حذف (localStorage ofogh-import-mapping:<entity>) */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 pb-3 border-t border-primary/15 pt-2.5">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                <Bookmark className="h-3.5 w-3.5" />
                پیش‌تنظیم‌ها:
              </span>
              {presets.length > 0 ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {presets.map((p) => (
                    <span key={p.id} className="inline-flex items-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 rounded-l-none border-dashed text-[11px]"
                        onClick={() => applyPreset(p.id)}
                        disabled={previewLoading || importing}
                        title={`اعمال «${p.name}» — ${toPersianDigits(
                          Object.keys(p.byHeader).length
                        )} هدر ذخیره شده`}
                      >
                        {p.name}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0 rounded-r-none border-dashed text-muted-foreground hover:text-destructive"
                        onClick={() => deletePreset(p.id)}
                        disabled={previewLoading || importing}
                        aria-label={`حذف پیش‌تنظیم ${p.name}`}
                        title="حذف این پیش‌تنظیم"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-[10px] text-muted-foreground">
                  نگاشت‌های پرکاربردتان را با نام ذخیره کنید تا دفعهٔ بعد یک‌کلیکی اعمال شوند.
                </span>
              )}
              <span className="ms-auto flex items-center gap-1.5">
                <Input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveCurrentPreset();
                  }}
                  placeholder="نام پیش‌تنظیم (مثلاً خروجی هلو)"
                  className="h-7 w-40 text-[11px]"
                  disabled={previewLoading || importing || columns.length === 0}
                  maxLength={60}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  onClick={saveCurrentPreset}
                  disabled={previewLoading || importing || columns.length === 0}
                >
                  <Save className="h-3 w-3" />
                  ذخیرهٔ این نگاشت
                </Button>
              </span>
            </div>

            {/* حالت جمع‌شده — هشدار کهربایی ستون‌های تشخیص‌نیافته + خلاصهٔ چیپی */}
            {!mapperExpanded && (
              <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                {unsureCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setMapperExpanded(true)}
                    className="flex w-full items-center gap-2 rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-start text-[11px] text-amber-800 transition-colors hover:bg-amber-100/70 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      {toPersianDigits(unsureCount)} ستون با اطمینان کامل تشخیص داده نشده — برای انتخاب
                      دستیِ فیلد هر ستون، «دستی ستون‌ها را مدیریت کنید» را باز کنید.
                    </span>
                  </button>
                )}
                {mappedFields.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    هنوز ستونی نگاشت نشده — برای انتخاب دستی، «دستی ستون‌ها را مدیریت کنید» را باز کنید.
                  </p>
                ) : (
                  mappedFields.map(([idx, field]) => {
                    const header = columns[Number(idx)]?.header ?? "";
                    const isManual = manualColumns.has(Number(idx));
                    return (
                      <Badge
                        key={idx}
                        variant="outline"
                        title={`ستون «${header}»`}
                        className={cn(
                          "max-w-full min-w-0 text-[10px] gap-1 font-normal",
                          isManual && "border-primary/40 bg-primary/[0.06] text-primary"
                        )}
                      >
                        <span className="truncate max-w-[110px]">{fieldLabel(entity, field)}</span>
                        <span className="shrink-0 text-muted-foreground">←</span>
                        <span className="truncate max-w-[130px]">{header}</span>
                      </Badge>
                    );
                  })
                )}
              </div>
            )}

            {/* حالت باز — ادیتور کامل نگاشت ستون‌ها */}
            {mapperExpanded && (
              <div id="manual-columns-editor" className="border-t border-primary/20 bg-card p-3 space-y-3">
                <p className="text-[11px] text-muted-foreground">
                  هر ستون فایل را با منوی «نگاشت به فیلد» به فیلد هدف وصل کنید — ستون‌های بی‌اهمیت را
                  «نادیده» بگذارید. ستون‌های کهربایی، تشخیص خودکارِ قطعی ندارند و بهتر است خودتان فیلدشان را انتخاب کنید.
                </p>

                {/* موبایل (< md): لیست کارتی عمودی — بدون اسکرول افقی */}
                <div className="md:hidden space-y-2">
                  {columns.map((col) => {
                    const value = mapping[col.index] ?? MAPPING_IGNORE;
                    const isManual = manualColumns.has(col.index);
                    const isRestored = restoredColumns.has(col.index);
                    const isUnsure = isColumnUnsure(col);
                    return (
                      <div
                        key={col.index}
                        className={cn(
                          "rounded-xl border bg-background p-3 space-y-2.5",
                          isManual && "border-primary/40",
                          isUnsure &&
                            !isManual &&
                            "border-amber-400/70 bg-amber-50/40 dark:border-amber-700/50 dark:bg-amber-950/20",
                          value === MAPPING_IGNORE && !isUnsure && "opacity-75"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 space-y-1">
                            <span className="block text-xs font-medium truncate" title={col.header}>
                              {toPersianDigits(col.index + 1)}. {col.header || "(بی‌نام)"}
                            </span>
                            {(isManual || isRestored || isUnsure) && (
                              <span className="flex flex-wrap gap-1">
                                {isManual && (
                                  <Badge className="text-[9px] h-4 px-1.5 bg-primary/15 text-primary border border-primary/30 hover:bg-primary/15">
                                    دستی
                                  </Badge>
                                )}
                                {isRestored && (
                                  <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                                    از نگاشت قبلی
                                  </Badge>
                                )}
                                {isUnsure && !isRestored && (
                                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-1 border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                    نیازمند بررسی
                                  </Badge>
                                )}
                              </span>
                            )}
                          </div>
                          {renderConfidenceBadge(col)}
                        </div>
                        {/* نمونهٔ مقادیر — حداکثر ۲ مورد کوتاه‌شده */}
                        <div className="flex flex-col gap-0.5">
                          {col.samples.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground">(خالی)</span>
                          ) : (
                            col.samples.slice(0, 2).map((s, i) => (
                              <span key={i} className="text-[10px] text-muted-foreground truncate" title={s}>
                                {s}
                              </span>
                            ))
                          )}
                        </div>
                        {renderTargetSelect(col)}
                        {isUnsure && (
                          <p className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            تشخیص خودکار قطعی نیست — فیلد درست را از منوی بالا انتخاب کنید
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* دسکتاپ (>= md): جدول هم‌عرض کانتینر — بدون اسکرول افقی */}
                <div className="hidden md:block rounded-lg border overflow-hidden">
                  <Table className="w-full table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 text-center text-xs">#</TableHead>
                        <TableHead className="text-xs w-[23%]">ستون فایل</TableHead>
                        <TableHead className="text-xs w-[21%] hidden lg:table-cell">نمونهٔ مقادیر</TableHead>
                        <TableHead className="text-xs w-[37%]">نگاشت به فیلد</TableHead>
                        <TableHead className="text-xs w-[12%]">اطمینان</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {columns.map((col) => {
                        const value = mapping[col.index] ?? MAPPING_IGNORE;
                        const isManual = manualColumns.has(col.index);
                        const isRestored = restoredColumns.has(col.index);
                        const isUnsure = isColumnUnsure(col);
                        return (
                          <TableRow
                            key={col.index}
                            className={cn(
                              isManual && "bg-primary/[0.06]",
                              isUnsure && !isManual && "bg-amber-50/50 dark:bg-amber-950/15",
                              value === MAPPING_IGNORE && !isUnsure && "opacity-70"
                            )}
                          >
                            <TableCell className="text-center text-xs text-muted-foreground">
                              {toPersianDigits(col.index + 1)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-xs font-medium truncate max-w-full" title={col.header}>
                                  {col.header || "(بی‌نام)"}
                                </span>
                                {(isManual || isRestored || isUnsure) && (
                                  <span className="flex flex-wrap gap-1">
                                    {isManual && (
                                      <Badge className="w-fit text-[9px] h-4 px-1.5 bg-primary/15 text-primary border border-primary/30 hover:bg-primary/15">
                                        دستی
                                      </Badge>
                                    )}
                                    {isRestored && (
                                      <Badge variant="outline" className="w-fit text-[9px] h-4 px-1.5">
                                        از نگاشت قبلی
                                      </Badge>
                                    )}
                                    {isUnsure && !isRestored && (
                                      <Badge variant="outline" className="w-fit text-[9px] h-4 px-1.5 gap-1 border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                        <AlertTriangle className="h-2.5 w-2.5" />
                                        نیازمند بررسی
                                      </Badge>
                                    )}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <div className="flex flex-col gap-0.5 min-w-0">
                                {col.samples.length === 0 ? (
                                  <span className="text-[10px] text-muted-foreground">(خالی)</span>
                                ) : (
                                  col.samples.slice(0, 2).map((s, i) => (
                                    <span
                                      key={i}
                                      className="text-[10px] text-muted-foreground truncate max-w-full"
                                      title={s}
                                    >
                                      {s}
                                    </span>
                                  ))
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{renderTargetSelect(col)}</TableCell>
                            <TableCell>{renderConfidenceBadge(col)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          {/* R28-8 — پیش‌نمایش زندهٔ ردیف‌های نگاشت‌شده در همین مرحله:
           * با هر تغییر سلکت نگاشت (debounce)، ۵ ردیف اولِ تازه در پایین
           * ادیتور نمایش داده می‌شود تا کاربر اثر انتخابش را فوراً ببیند */}
          {mappedPreview && mappedPreview.rows.length > 0 && !mappedPreviewLoading && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center justify-between bg-muted/50 px-3 py-1.5">
                <span className="text-[11px] font-medium flex items-center gap-1.5">
                  <Table2 className="h-3 w-3 text-primary" />
                  پیش‌نمایش زنده — {toPersianDigits(Math.min(mappedPreview.rows.length, 5))} ردیف اول با نگاشت فعلی
                </span>
              </div>
              <div className="overflow-x-auto">
                <Table className="min-w-[480px]">
                  <TableHeader>
                    <TableRow>
                      {[...mappedFields]
                        .sort((a, b) => Number(a[0]) - Number(b[0]))
                        .map(([, field]) => (
                          <TableHead key={field} className="text-[10px] min-w-[90px] whitespace-nowrap">
                            {fieldLabel(entity, field)}
                          </TableHead>
                        ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappedPreview.rows.slice(0, 5).map((r, i) => (
                      <TableRow key={i}>
                        {[...mappedFields]
                          .sort((a, b) => Number(a[0]) - Number(b[0]))
                          .map(([, field]) => {
                            const v = r[field];
                            const text = v === null || v === undefined ? "" : String(v);
                            return (
                              <TableCell key={field} className="text-[10px] max-w-[140px] truncate" title={text}>
                                {text === "" ? "—" : text}
                              </TableCell>
                            );
                          })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* R28-8 — «مقادیر پیش‌فرض» فیلدهای بدون ستون: فیلدهایی که در فایل
           * ستونی ندارند می‌توانند از یک مقدار ثابت پر شوند (مثل دسته‌بندی
           * پیش‌فرض)؛ فیلد اجباریِ بدون ستون هم با پیش‌فرض تأمین می‌شود و
           * دکمهٔ «ادامه» فعال می‌شود. مقدار فایل همیشه بر پیش‌فرض مقدم است. */}
          {unmappedFields.length > 0 && (
            <div className="rounded-xl border bg-card p-3 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium flex items-center gap-1.5">
                  <Wand2 className="h-3.5 w-3.5 text-primary" />
                  مقادیر پیش‌فرض ردیف‌ها
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {toPersianDigits(unmappedFields.length)} فیلد بدون ستون
                </Badge>
                {activeFallbackCount > 0 && (
                  <Badge className="text-[10px] gap-1 border border-primary/40 bg-primary/10 text-primary">
                    {toPersianDigits(activeFallbackCount)} پیش‌فرض فعال
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                فیلدهایی که در فایل ستونی ندارند، اگر اینجا مقدار بگیرند برای همهٔ ردیف‌ها پر می‌شوند — سلولِ پرِ فایل
                همیشه بر پیش‌فرض مقدم است.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {unmappedFields.map((f) => {
                  const isMissingRequired = missingRequired.includes(f.key);
                  return (
                    <label
                      key={f.key}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5",
                        isMissingRequired && "border-destructive/40"
                      )}
                    >
                      <span
                        className={cn(
                          "text-[11px] shrink-0 truncate max-w-[45%]",
                          isMissingRequired && "text-destructive font-medium"
                        )}
                        title={`${f.label}${f.required ? " (اجباری)" : ""}`}
                      >
                        {f.label}
                        {f.required ? " *" : ""}
                      </span>
                      <Input
                        value={fallbacks[f.key] ?? ""}
                        onChange={(e) =>
                          setFallbacks((prev) => ({ ...prev, [f.key]: e.target.value }))
                        }
                        placeholder={isMissingRequired ? "اجباری — مقدار وارد کنید" : "اختیاری"}
                        className="h-7 flex-1 min-w-0 text-[11px]"
                        disabled={importing}
                        maxLength={300}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* هشدار فیلدهای اجباری نگاشت‌نشده */}
          {missingRequired.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[11px] text-destructive flex flex-wrap items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                فیلدهای اجباری نگاشت نشده:{" "}
                {missingRequired
                  .filter((r) => r !== "partyCode" || !hasCustomerField)
                  .map((r) => `«${fieldLabel(entity, r)}»`)
                  .join("، ")}
                {" "}— ستون مربوطه را در «دستی ستون‌ها را مدیریت کنید» انتخاب کنید یا در بخش «مقادیر پیش‌فرض» مقدار ثابت بدهید.
              </span>
              {!mapperExpanded && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setMapperExpanded(true)}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  باز کردن مدیریت دستی ستون‌ها
                </Button>
              )}
            </div>
          )}

          {/* FIX(1d-p2): هشدار ستون‌های تکراری — دو ستون نباید به یک فیلد بروند */}
          {duplicateFields.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[11px] text-destructive flex flex-wrap items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                چند ستون به یک فیلد نگاشت شده‌اند:{" "}
                {duplicateFields.map((f) => `«${fieldLabel(entity, f)}»`).join("، ")}
                {" "}— هر فیلد فقط یک ستون می‌پذیرد؛ یکی از ستون‌ها را «نادیده» بگذارید.
              </span>
              {!mapperExpanded && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setMapperExpanded(true)}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  باز کردن مدیریت دستی ستون‌ها
                </Button>
              )}
            </div>
          )}

          {/* ناوبری */}
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetAll}
              disabled={previewLoading || importing}
              className="gap-1.5"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              فایل دیگر
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setStep(3);
                // v20-E: پیش‌نمایش ۱۰ ردیف اول با نگاشت تاییدشده — موازی با ورود به مرحلهٔ ۳
                void runMappedPreview();
                // R28-8: اعتبارسنجی dryRun (شمارش ایجاد/به‌روز/رد + خطاهای ردیفی)
                // با اثرِ ورود به مرحلهٔ ۳ (debounce) خودکار اجرا می‌شود
              }}
              disabled={
                previewLoading ||
                importing ||
                mappedCount === 0 ||
                missingRequired.length > 0 ||
                !hasCustomerField ||
                duplicateFields.length > 0
              }
              className="gap-1.5"
            >
              ادامه
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ============================================================
       * مرحله ۳ — گزینه‌ها + اجرا + نتایج
       * ============================================================ */}
      {step === 3 && preview && (
        <div className="space-y-4">
          {!result ? (
            <>
              {/* خلاصهٔ نگاشت نهایی */}
              <div className="rounded-xl border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <Table2 className="h-3.5 w-3.5 text-primary" />
                    خلاصهٔ نگاشت — {ENTITY_META[entity].label}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {toPersianDigits(preview.totalRows)} ردیف •{" "}
                    {toPersianDigits(mappedCount)} ستون فعال
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {mappedFields.map(([idx, field]) => (
                    <Badge
                      key={idx}
                      variant="outline"
                      className="text-[10px] gap-1 font-normal"
                      title={`ستون «${columns[Number(idx)]?.header ?? ""}»`}
                    >
                      {fieldLabel(entity, field)}
                      <span className="text-muted-foreground">←</span>
                      {columns[Number(idx)]?.header?.slice(0, 18) ?? ""}
                    </Badge>
                  ))}
                  {/* R28-8 — پیش‌فرض‌های فعال در خلاصهٔ نهایی */}
                  {Object.entries(fallbacks)
                    .filter(([, v]) => v.trim() !== "")
                    .map(([field, value]) => (
                      <Badge
                        key={`fb-${field}`}
                        className="text-[10px] gap-1 font-normal border border-primary/40 bg-primary/10 text-primary hover:bg-primary/10"
                        title={`مقدار پیش‌فرض برای فیلد «${fieldLabel(entity, field)}» — فقط خانه‌های خالی ردیف‌ها را پر می‌کند`}
                      >
                        <Wand2 className="h-3 w-3" />
                        {fieldLabel(entity, field)}: {value.slice(0, 18)}
                      </Badge>
                    ))}
                </div>
              </div>

              {/* R28-8 (3b/3c) — «پیش‌بینی نتیجه» با اجرای آزمایشی (dryRun):
               * کل فایل با نگاشت/پیش‌فرض/استراتژی فعلی بدون نوشتن در DB اجرا
               * می‌شود → چند ردیف «جدید» می‌شود، چند «به‌روزرسانی»، چند «رد
               * (تکراری)» + خطاهای ردیفی با شمارهٔ ردیف — قبل از ثبت نهایی.
               * سرور پشتیبانی نکند/خطا بخورد → کارت بی‌صدا حذف می‌شود. */}
              {(validationLoading || validation) && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/50 dark:border-sky-900/60 dark:bg-sky-950/20 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-sky-100/60 dark:bg-sky-950/40 px-3 py-2">
                    <span className="text-xs font-medium flex items-center gap-1.5 text-sky-800 dark:text-sky-300">
                      <ShieldCheck className="h-4 w-4" />
                      پیش‌بینی نتیجه (اجرای آزمایشی — چیزی ثبت نشده)
                    </span>
                    {validationLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-700 dark:text-sky-300" />}
                  </div>
                  {validationLoading && !validation ? (
                    <p className="text-[11px] text-muted-foreground text-center py-4">
                      در حال اجرای آزمایشی روی {toPersianDigits(preview.totalRows)} ردیف…
                    </p>
                  ) : validation ? (
                    <div className="p-3 space-y-2.5">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/30 p-2 text-center">
                          <p className="text-[10px] text-emerald-700 dark:text-emerald-300">جدید</p>
                          <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                            {toPersianDigits(validation.created)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-sky-200 bg-sky-50/70 dark:border-sky-900/60 dark:bg-sky-950/30 p-2 text-center">
                          <p className="text-[10px] text-sky-700 dark:text-sky-300">به‌روزرسانی</p>
                          <p className="text-base font-bold text-sky-700 dark:text-sky-300">
                            {toPersianDigits(validation.updated)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30 p-2 text-center">
                          <p className="text-[10px] text-amber-700 dark:text-amber-300">رد (تکراری)</p>
                          <p className="text-base font-bold text-amber-700 dark:text-amber-300">
                            {toPersianDigits(validation.skipped)}
                          </p>
                        </div>
                        <div
                          className={cn(
                            "rounded-lg border p-2 text-center",
                            validation.errors.length > 0
                              ? "border-destructive/30 bg-destructive/5"
                              : "border-border bg-muted/40"
                          )}
                        >
                          <p className="text-[10px] text-muted-foreground">خطای ردیفی</p>
                          <p
                            className={cn(
                              "text-base font-bold",
                              validation.errors.length > 0 ? "text-destructive" : "text-foreground"
                            )}
                          >
                            {toPersianDigits(validation.errors.length)}
                          </p>
                        </div>
                      </div>
                      {/* دلایل رد (تکراری‌ها) — سطح‌بندی‌شدن منطق skip/update */}
                      {validation.skippedRows.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            ردیف‌های رد‌شده (نمونهٔ {toPersianDigits(Math.min(validation.skippedRows.length, 6))} از{" "}
                            {toPersianDigits(validation.skippedRows.length)}):
                          </p>
                          <ul className="space-y-0.5">
                            {validation.skippedRows.slice(0, 6).map((s, i) => (
                              <li key={i} className="text-[10px] text-amber-700/90 dark:text-amber-400/90">
                                ردیف {toPersianDigits(s.row)}: {s.message}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {/* خطاهای اعتبارسنجی ردیفی (3c) — با شمارهٔ ردیف، قبل از ثبت */}
                      {validation.errors.length > 0 && (
                        <div className="space-y-1 border-t border-destructive/15 pt-2">
                          <p className="text-[11px] font-medium text-destructive">
                            خطاهای قابل رفع (نمونهٔ {toPersianDigits(Math.min(validation.errors.length, 6))} از{" "}
                            {toPersianDigits(validation.errors.length)}):
                          </p>
                          <ul className="space-y-0.5">
                            {validation.errors.slice(0, 6).map((e, i) => (
                              <li key={i} className="text-[10px] text-destructive/90">
                                ردیف {toPersianDigits(e.row)}: {e.message}
                              </li>
                            ))}
                          </ul>
                          <p className="text-[10px] text-muted-foreground">
                            ردیف‌های خطادار وارد نمی‌شوند؛ بقیهٔ ردیف‌ها نرمال ثبت می‌شوند.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              {/* v20-E: پیش‌نمایش ۱۰ ردیف اول — دادهٔ نگاشت‌شده قبل از ایمپورت نهایی
               * (mappedRows از API + خطاهای اعتبارسنجی ردیف‌ها اگر موجود باشد) */}
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center justify-between bg-muted/50 px-3 py-2">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <Table2 className="h-3.5 w-3.5 text-primary" />
                    پیش‌نمایش {toPersianDigits(mappedPreview?.rows.length ?? 10)} ردیف اول
                  </span>
                  {mappedPreviewLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
                {mappedPreviewLoading ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    در حال آماده‌سازی پیش‌نمایش ردیف‌ها…
                  </p>
                ) : mappedPreview && mappedPreview.rows.length > 0 ? (
                  <div className="max-h-64 overflow-y-auto compact-scroll">
                    <div className="overflow-x-auto">
                      <Table className="min-w-[560px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-12 text-center">#</TableHead>
                            {[...mappedFields]
                              .sort((a, b) => Number(a[0]) - Number(b[0]))
                              .map(([, field]) => (
                                <TableHead key={field} className="text-xs min-w-[110px] whitespace-nowrap">
                                  {fieldLabel(entity, field)}
                                </TableHead>
                              ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mappedPreview.rows.map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs text-center text-muted-foreground">
                                {toPersianDigits(i + 1)}
                              </TableCell>
                              {[...mappedFields]
                                .sort((a, b) => Number(a[0]) - Number(b[0]))
                                .map(([, field]) => {
                                  const v = r[field];
                                  const text = v === null || v === undefined ? "" : String(v);
                                  return (
                                    <TableCell
                                      key={field}
                                      className="text-xs max-w-[180px] truncate"
                                      title={text}
                                    >
                                      {text === "" ? "—" : text}
                                    </TableCell>
                                  );
                                })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground text-center py-3.5">
                    پیش‌نمایش ردیف‌ها برای این فایل در دسترس نیست — می‌توانید مستقیم وارد کنید.
                  </p>
                )}
                {/* خطاهای اعتبارسنجی ردیف‌ها (اگر API برگردانده باشد) — قبل از دکمهٔ ایمپورت */}
                {mappedPreview && mappedPreview.errors.length > 0 && (
                  <div className="border-t border-destructive/20 bg-destructive/5 px-3 py-2.5 space-y-1.5">
                    <p className="text-[11px] font-medium text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {toPersianDigits(mappedPreview.errors.length)} خطا در اعتبارسنجی ردیف‌ها
                    </p>
                    <ul className="space-y-1">
                      {mappedPreview.errors.slice(0, 10).map((e, i) => (
                        <li key={i} className="text-[11px] text-destructive/90">
                          {e.row ? `ردیف ${toPersianDigits(e.row)}: ` : ""}
                          {e.message}
                        </li>
                      ))}
                    </ul>
                    {mappedPreview.errors.length > 10 && (
                      <p className="text-[10px] text-muted-foreground">
                        و {toPersianDigits(mappedPreview.errors.length - 10)} خطای دیگر…
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* گزینه‌های کالا: استراتژی تکراری + کد خودکار */}
              {entity === "products" && (
                <div className="rounded-xl border bg-card p-3 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 text-primary" />
                    برخورد با کد کالای تکراری (SKU)
                  </div>
                  <RadioGroup
                    value={duplicateStrategy}
                    onValueChange={(v) => setDuplicateStrategy(v === "update" ? "update" : "skip")}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                    disabled={importing}
                  >
                    <label
                      className={cn(
                        "flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer transition-colors",
                        duplicateStrategy === "skip"
                          ? "border-primary/50 bg-primary/5"
                          : "border-border hover:border-primary/30"
                      )}
                    >
                      <RadioGroupItem value="skip" className="mt-0.5" />
                      <span className="space-y-0.5">
                        <span className="block text-xs font-medium">رد ردیف‌های تکراری</span>
                        <span className="block text-[10px] text-muted-foreground">
                          ردیف‌هایی که کدشان قبلاً ثبت شده رد می‌شوند (با گزارش دلیل)
                        </span>
                      </span>
                    </label>
                    <label
                      className={cn(
                        "flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer transition-colors",
                        duplicateStrategy === "update"
                          ? "border-primary/50 bg-primary/5"
                          : "border-border hover:border-primary/30"
                      )}
                    >
                      <RadioGroupItem value="update" className="mt-0.5" />
                      <span className="space-y-0.5">
                        <span className="block text-xs font-medium">به‌روزرسانی قیمت و موجودی</span>
                        <span className="block text-[10px] text-muted-foreground">
                          قیمت‌ها و توضیحات به‌روزرسانی و موجودی تعدیل می‌شود
                        </span>
                      </span>
                    </label>
                  </RadioGroup>
                  <div className="flex items-center justify-between rounded-lg border p-2.5">
                    <div className="space-y-0.5">
                      <span className="block text-xs font-medium">تولید خودکار کد کالا</span>
                      <span className="block text-[10px] text-muted-foreground">
                        ردیف‌های بدون کد، کد یکتای خودکار می‌گیرند — خاموش کردن یعنی ردیف بدون کد خطا می‌خورد
                      </span>
                    </div>
                    <Switch checked={autoSku} onCheckedChange={setAutoSku} disabled={importing} aria-label="تولید خودکار کد کالا" />
                  </div>
                </div>
              )}

              {/* دکمهٔ اجرا + پیشرفت */}
              <div className="space-y-3">
                {importing && batchProgress && (
                  /* R28-8 (3d) — پیشرفت بچ‌به‌بچ با شمارندهٔ زندهٔ ردیف‌ها و نتایج */
                  <div className="space-y-2 rounded-xl border bg-card p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        بخش {toPersianDigits(batchProgress.batchNo)} از{" "}
                        {toPersianDigits(batchProgress.totalBatches)} —{" "}
                        {toPersianDigits(batchProgress.rowsDone)} از{" "}
                        {toPersianDigits(batchProgress.totalRows)} ردیف پردازش شد
                      </span>
                      <span className="font-medium tabular-nums">
                        {toPersianDigits(
                          Math.round((batchProgress.rowsDone / Math.max(batchProgress.totalRows, 1)) * 100)
                        )}
                        ٪
                      </span>
                    </div>
                    <Progress
                      value={Math.round(
                        (batchProgress.rowsDone / Math.max(batchProgress.totalRows, 1)) * 100
                      )}
                      className="h-2"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      <Badge className="text-[9px] gap-1 border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                        {toPersianDigits(batchProgress.created)} ایجاد
                      </Badge>
                      <Badge className="text-[9px] gap-1 border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                        {toPersianDigits(batchProgress.updated)} به‌روزرسانی
                      </Badge>
                      <Badge className="text-[9px] gap-1 border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        {toPersianDigits(batchProgress.skipped)} ردشده
                      </Badge>
                      {batchProgress.errors > 0 && (
                        <Badge variant="destructive" className="text-[9px]">
                          {toPersianDigits(batchProgress.errors)} خطا
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                {importing && !batchProgress && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        {serverProcessing ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            پردازش روی سرور — ممکن است برای فایل‌های بزرگ کمی طول بکشد…
                          </>
                        ) : (
                          <>در حال بارگذاری فایل…</>
                        )}
                      </span>
                      <span className="font-medium">
                        {serverProcessing ? "…" : `${toPersianDigits(uploadPct)}٪`}
                      </span>
                    </div>
                    <Progress value={serverProcessing ? 90 : uploadPct} className="h-2" />
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStep(2)}
                    disabled={importing}
                    className="gap-1.5"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    بازگشت به نگاشت
                  </Button>
                  <Button onClick={() => void handleImport()} disabled={importing} className="gap-1.5">
                    {importing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        در حال وارد کردن…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        وارد کردن {toPersianDigits(preview.totalRows)} ردیف{" "}
                        {ENTITY_META[entity].label}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* ---------- نتایج ---------- */
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/30 p-3 text-center">
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-300">ایجادشده</p>
                  <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {toPersianDigits(result.created)}
                  </p>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50/60 dark:border-sky-900/60 dark:bg-sky-950/30 p-3 text-center">
                  <p className="text-[10px] text-sky-700 dark:text-sky-300">به‌روزرسانی‌شده</p>
                  <p className="text-lg font-bold text-sky-700 dark:text-sky-300 mt-0.5">
                    {toPersianDigits(result.updated)}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/30 p-3 text-center">
                  <p className="text-[10px] text-amber-700 dark:text-amber-300">ردشده</p>
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-300 mt-0.5">
                    {toPersianDigits(result.skipped)}
                  </p>
                </div>
                <div
                  className={cn(
                    "rounded-xl border p-3 text-center",
                    result.errors.length > 0
                      ? "border-destructive/30 bg-destructive/5"
                      : "border-border bg-muted/40"
                  )}
                >
                  <p className="text-[10px] text-muted-foreground">خطا</p>
                  <p
                    className={cn(
                      "text-lg font-bold mt-0.5",
                      result.errors.length > 0 ? "text-destructive" : "text-foreground"
                    )}
                  >
                    {toPersianDigits(result.errors.length)}
                  </p>
                </div>
              </div>

              {/* راستی‌آزمایی جمع ردیف‌ها */}
              {(() => {
                const accounted =
                  result.created + result.updated + result.skipped + result.errors.length;
                return (
                  <div
                    className={cn(
                      "rounded-lg border p-2.5 text-[11px] flex items-center gap-2",
                      accounted === result.totalRows
                        ? "border-emerald-300/60 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300"
                        : "border-destructive/40 bg-destructive/5 text-destructive"
                    )}
                  >
                    {accounted === result.totalRows ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span>
                      ایجاد {toPersianDigits(result.created)} + به‌روزرسانی{" "}
                      {toPersianDigits(result.updated)} + ردشده {toPersianDigits(result.skipped)} + خطا{" "}
                      {toPersianDigits(result.errors.length)} = {toPersianDigits(accounted)} از{" "}
                      {toPersianDigits(result.totalRows)} ردیف
                      {accounted === result.totalRows ? " — هیچ ردیفی گم نشده" : " — مغایرت!"}
                    </span>
                  </div>
                );
              })()}

              {/* جدول ردیف‌های ناموفق */}
              {(result.errors.length > 0 || result.skippedRows.length > 0) && (
                <div className="rounded-xl border overflow-hidden">
                  <div className="flex items-center justify-between bg-muted/50 px-3 py-2">
                    <span className="text-xs font-medium flex items-center gap-1.5">
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                      ردیف‌های ناموفق ({toPersianDigits(result.errors.length)} خطا،{" "}
                      {toPersianDigits(result.skippedRows.length)} ردشده)
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-[11px]"
                      onClick={downloadErrorReport}
                    >
                      <Download className="h-3.5 w-3.5" />
                      دانلود گزارش خطاها (CSV)
                    </Button>
                  </div>
                  <ScrollArea className="max-h-72">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-16 text-center">ردیف</TableHead>
                          <TableHead className="text-xs w-20">نوع</TableHead>
                          <TableHead className="text-xs">دلیل</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.errors.slice(0, 200).map((e, i) => (
                          <TableRow key={`e-${i}`}>
                            <TableCell className="text-xs text-center text-destructive">
                              {toPersianDigits(e.row)}
                            </TableCell>
                            <TableCell className="text-xs text-destructive">خطا</TableCell>
                            <TableCell className="text-xs text-destructive/90">{e.message}</TableCell>
                          </TableRow>
                        ))}
                        {result.skippedRows.slice(0, 200).map((s, i) => (
                          <TableRow key={`s-${i}`}>
                            <TableCell className="text-xs text-center text-amber-700 dark:text-amber-400">
                              {toPersianDigits(s.row)}
                            </TableCell>
                            <TableCell className="text-xs text-amber-700 dark:text-amber-400">ردشده</TableCell>
                            <TableCell className="text-xs text-amber-700/90 dark:text-amber-400/90">
                              {s.message}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {result.errors.length + result.skippedRows.length > 200 && (
                      <p className="text-[11px] text-muted-foreground text-center py-2">
                        و {toPersianDigits(result.errors.length + result.skippedRows.length - 200)} مورد
                        دیگر — برای مشاهدهٔ کامل، گزارش CSV را دانلود کنید.
                      </p>
                    )}
                  </ScrollArea>
                </div>
              )}

              {/* اتمام */}
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // FIX(1d-p2): نتیجهٔ قبلی پاک شود تا بعد از اصلاح نگاشت،
                    // مرحلهٔ ۳ گزینه‌ها را نشان دهد نه نتیجهٔ قدیمی را
                    setResult(null);
                    setStep(2);
                  }}
                  className="gap-1.5"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  اصلاح نگاشت
                </Button>
                <Button onClick={resetAll} className="gap-1.5">
                  <Upload className="h-4 w-4" />
                  ایمپورت فایل دیگر
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
