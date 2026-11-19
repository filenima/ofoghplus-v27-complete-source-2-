import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { encryptField } from "@/lib/db-encryption";
import { auditLog } from "@/lib/auth";
import { requireUser } from "@/lib/user-auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import {
  jalaliToGregorian,
  gregorianToJalali,
  toEnglishDigits,
  getCurrentJalaliYear,
  getJalaliYearRange,
  toPersianDigits,
} from "@/lib/persian";
import { getVatRateFraction } from "@/lib/accounting";
import { nationalIdBlindIndex } from "@/lib/validators";
import { resolveDefaultWarehouse } from "@/lib/stock-movements";
// ماژول مشترک پارسر ایمپورت (client-safe — بدون وابستگی سروری)
import {
  combineCategory,
  isBlankOrNumeric,
  autoDetectMapping,
  inferMappingFromData,
  guessEntityFromHeaders,
  IMPORTABLE_FIELDS,
  isValidMappingTarget,
  MAPPING_IGNORE,
  suggestFieldForHeader,
  headerField,
  fieldLabel,
  type ImportEntityKind,
} from "@/lib/import-parser";
// Task 1-d — پارسر سمت سرور همهٔ فرمت‌ها (xlsx/xls/csv/tsv/txt/json + شیت‌ها)
import {
  parseImportFile,
  ImportFileError,
  columnSamples,
  detectDateFormat,
  matrixToRecordRows,
  assertFileSize,
  assertRowLimit,
  type ParsedImportFile,
} from "@/lib/import-formats";

export const runtime = "nodejs";

type EntityType =
  | "invoices"
  | "products"
  | "parties"
  | "accounts"
  | "journalEntries"
  | "checks"
  | "employees";
type DuplicateStrategy = "skip" | "update";

/* Task 1-d — نگاشت دستی ستون‌ها:
 * mapping: { [columnIndex]: targetField | "ignore" }
 *  - کلیدها ایندکس ستون (۰-مبنا) برای ردیف‌های آرایه‌ای، یا نام هدر برای ردیف‌های آبجکتی
 *  - مقادیر باید در فهرست سفید IMPORTABLE_FIELDS[entityType] (خروجی از
 *    lib/import-parser — منبع یگانه) یا مقدار ویژهٔ "ignore" باشند.
 * NOTE: Next.js 16 اجازهٔ export کردن مقادیر غیر-handler از route.ts را
 * نمی‌دهد؛ IMPORTABLE_FIELDS در lib/import-parser.ts تعریف و از همین مسیر
 * «مفهومأ» export می‌شود (همین فایل و UI هر دو از آنجا import می‌کنند). */
interface ColumnMapping {
  [columnKey: string]: string;
}

interface ColumnPreview {
  index: number;
  header: string;
  samples: string[];
  /** فیلد هدف پیشنهادی (کلید API) یا "ignore" */
  suggestedField: string;
  confidence: "exact" | "fuzzy" | "inferred" | "none";
  reason: string;
}

interface ImportError {
  row: number;
  message: string;
}

interface ImportResponse {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: ImportError[];
  skippedRows: ImportError[];
  error?: string;
}

/* ============================================================
 * سقف‌های ایمپورت:
 *  - MAX_ROWS_PER_REQUEST = ۵۰۰۰ — کلاینت فایل‌های بزرگ‌تر را خودش به
 *    چانک‌های ۵۰۰تایی تقسیم و ارسال می‌کند (الگوی chunking موجود).
 *  - سقف کل فایل = ۱۰۰,۰۰۰ ردیف (تضمین‌شده سمت کلاینت در
 *    components/modules/data-import-export.tsx).
 *  - Rate limit = ۲۴۰ درخواست/دقیقه — چون ایمپورت ۱۰۰k ردیف یعنی
 *    ~۲۰۰ چانک ۵۰۰تایی.
 * ============================================================ */
const MAX_ROWS_PER_REQUEST = 5000;

// ============ FIX(Persian headers): نگاشت کلیدهای فارسی → انگلیسی ============
// خروجی نرم‌افزارهای حسابداری ایرانی (هلو، سپیدار، محک و...) معمولاً هدرهای
// فارسی دارند. این نگاشت در سمت سرور هم اعمال می‌شود تا هر فراخوانی API
// مستقیم با هدر فارسی هم درست کار کند (سمت کلاینت هم نگاشت مشابهی هست).
//
// FIX(21-A): هدرهای فایل واقعی مالک (خروجی هلو) اضافه شد — «رديف، گروه اصلي،
// گروه فرعي، نام كالا، موجودي، ميانگين خريد، في فروش، آخرين في خريد، درصد
// تخفيف، واحد هاي کالا...» — با ي/ك عربی که normalizeHeaderKey یکسان می‌کند.
const PERSIAN_KEY_MAP: Record<string, string> = {
  // --- کالاها (products) ---
  "نام کالا": "name", "نام": "name", "شرح کالا": "name", "شرح": "name", "عنوان": "name",
  "نام جنس": "name", "شرح جنس": "name", "نام محصول": "name", "کالا": "name",
  "نام کالا/خدمت": "name", "شرح کالا/خدمت": "name",
  // Task 2-a (بسترش): واریانت‌های بیشتر هلو/سپیدار/اکسل
  "کالا/خدمت": "name", "کالا و خدمات": "name", "نام کالا و خدمات": "name",
  "شرح کالا و خدمات": "name", "مشخصات کالا": "name", "شرح کلی": "name",
  "کد کالا": "sku", "کد": "sku", "شناسه کالا": "sku", "کد شناسایی": "sku", "کد یکتا": "sku",
  "کد جنس": "sku", "شماره کالا": "sku", "کد کالا/خدمت": "sku", "کد محصول": "sku", "شناسه": "sku",
  "شناسه کالا/خدمت": "sku", "کد کالا و خدمات": "sku",
  "واحد شمارش": "unit", "واحد": "unit", "واحد کالا": "unit", "واحد های کالا": "unit", "آیتم": "unit",
  "واحد اصلی": "unit", "واحد کالا/خدمت": "unit",
  "واحد اندازه‌گیری": "unit", "واحد سنجش": "unit", "واحد شمارش کالا": "unit",
  "قیمت فروش": "salePrice", "قیمت": "salePrice", "فروش": "salePrice", "نرخ فروش": "salePrice", "قیمت واحد فروش": "salePrice",
  "فی فروش": "salePrice", "فی": "salePrice",
  "مبلغ واحد": "salePrice", "مبلغ واحد فروش": "salePrice", "مبلغ فروش": "salePrice", "قیمت نهایی": "salePrice",
  "قیمت خرده‌فروشی": "salePrice", "قیمت خرده فروشی": "salePrice", "نرخ خرده فروشی": "salePrice",
  "قیمت واحد": "salePrice", "فی واحد": "salePrice", "قیمت فروش ریال": "salePrice",
  "قیمت خرید": "purchasePrice", "نرخ خرید": "purchasePrice", "قیمت واحد خرید": "purchasePrice", "بهای خرید": "purchasePrice",
  "فی خرید": "purchasePrice", "بهای تمام‌شده": "purchasePrice", "بهای تمام شده": "purchasePrice",
  "قیمت تمام‌شده": "purchasePrice", "قیمت تمام شده": "purchasePrice", "قیمت خرید ریال": "purchasePrice",
  // میانگین خرید = بهای تمام‌شده میانگین متحرک (ترجیحی)؛ آخرین فی خرید = fallback
  "میانگین خرید": "purchasePriceAvg", "میانگین قیمت خرید": "purchasePriceAvg",
  "متوسط بهای تمام‌شده": "purchasePriceAvg",
  "آخرین فی خرید": "purchasePriceLast", "آخرین نرخ خرید": "purchasePriceLast", "آخرین قیمت خرید": "purchasePriceLast",
  "آخرین قیمت خرید کالا": "purchasePriceLast", "قیمت آخرین خرید": "purchasePriceLast", "آخرین بهای خرید": "purchasePriceLast",
  "بهای میانگین": "purchasePriceAvg",
  "قیمت عمده": "wholesalePrice", "نرخ عمده": "wholesalePrice", "قیمت همکار": "wholesalePrice",
  "قیمت عمده‌فروشی": "wholesalePrice", "قیمت عمده فروشی": "wholesalePrice", "قیمت همکارها": "wholesalePrice",
  "بارکد": "barcode", "کد بارکد": "barcode", "باركد": "barcode", "شماره بارکد": "barcode",
  "ean13": "barcode", "upc": "barcode",
  // v33-a: نام‌های ستون بارکد در خروجی هلو/سپیدار (با کاف عربی و بدون فاصله)
  "بارکد کالا": "barcode", "باركد كالا": "barcode", "باركدكالا": "barcode", "کدبارکد": "barcode",
  "باركد فروش": "barcode", "بارکد فروش": "barcode", "باركدفروش": "barcode", "باركد داخلي": "barcode",
  "بارکد داخلی": "barcode", "باركد خريد": "barcode", "شماره باركد": "barcode", "باركد اختصاصي": "barcode",
  "دسته‌بندی": "category", "گروه کالا": "category", "گروه": "category", "دسته": "category",
  "گروه جنس": "category", "گروه‌بندی": "category", "گروه بندی": "category",
  "طبقه‌بندی": "category", "طبقه": "category", "سرفصل": "category", "گروه کالایی": "category",
  "دسته‌بندی کالا": "category",
  // R17-C (فروشگاه) — عکس و قیمت دلاری کالا در درون‌ریزی
  "عکس": "imageUrl", "عکس کالا": "imageUrl", "تصویر": "imageUrl", "تصویر کالا": "imageUrl",
  "لینک عکس": "imageUrl", "آدرس عکس": "imageUrl", "عکس محصول": "imageUrl", "تصویر محصول": "imageUrl",
  "قیمت دلار": "usdPrice", "قیمت دلاری": "usdPrice", "فی دلار": "usdPrice", "نرخ دلار": "usdPrice",
  "قیمت پایه دلار": "usdPrice", "قیمت کالا به دلار": "usdPrice",
  "گروه اصلی": "categoryMain", "گروه فرعی": "categorySub",
  "گروه سطح یک": "categoryMain", "گروه مرجع": "categoryMain",
  "گروه سطح دو": "categorySub", "زیر گروه": "categorySub",
  "توضیحات": "description", "شرح توضیحات": "description", "ملاحظات": "description",
  "توضیحات کالا": "description", "توضیح": "description", "یادداشت": "description",
  // موجودی اولیه کالا (مثل POST /api/products → StockItem + StockMovement)
  "موجودی": "stock", "تعداد": "stock", "کمیت": "stock", "مقدار": "stock",
  "موجودی انبار": "stock", "موجودی کل": "stock", "موجودی فعلی": "stock",
  "باقیمانده": "stock", "قابل فروش": "stock", "تعداد موجود": "stock",
  "موجودی کلی": "stock", "تعداد موجودی": "stock", "موجودی انبارها": "stock",
  "موجودی کل انبار": "stock", "موجودی قابل فروش": "stock", "تعداد در انبار": "stock",
  "مانده کالا": "stock", "موجودی انبار اصلی": "stock",
  // R13-2-a — فایل نمونهٔ ویزارد راه‌اندازی همین هدر را تولید می‌کند
  "موجودی اولیه": "stock", "تعداد اولیه": "stock",
  // ردیف ردیفِ فایل — نادیده گرفته می‌شود
  "ردیف": "rowNo",
  // --- طرف‌حساب‌ها (parties) ---
  "نام طرف‌حساب": "name", "نام مشتری": "name", "نام شخص": "name", "حساب": "name",
  "نام و نام خانوادگی": "name", "نام کامل": "name", "شرح حساب": "name", "عنوان حساب": "name",
  "طرف حساب": "name", "عنوان طرف‌حساب": "name", "نام شرکت/شخص": "name",
  // R13-2-a — فایل نمونهٔ ویزارد راه‌اندازی همین هدر را تولید می‌کند
  "نام/نام شرکت": "name", "نام شرکت": "name",
  "کد مشتری": "code", "کد حساب": "code", "کد طرف‌حساب": "code", "شماره حساب": "code",
  "شماره مشتری": "code", "کد شخص": "code", "کد طرف حساب": "code", "کد حساب مشتری": "code",
  "نوع": "type", "نوع طرف‌حساب": "type", "نوع حساب": "type", "گروه حساب": "type",
  "نوع شخص": "type", "نوع مشتری": "type",
  "تلفن": "phone", "شماره تلفن": "phone", "تلفن ثابت": "phone", "شماره تماس": "phone",
  "تلفن تماس": "phone",
  "موبایل": "mobile", "همراه": "mobile", "تلفن همراه": "mobile",
  "شماره موبایل": "mobile", "شماره همراه": "mobile",
  "کد ملی": "nationalId", "شناسه ملی": "nationalId", "کد ملی/شناسه ملی": "nationalId",
  "شماره ملی": "nationalId",
  "کد اقتصادی": "economicCode", "شناسه اقتصادی": "economicCode", "شماره اقتصادی": "economicCode",
  "کد اقتصادی/شناسه ملی": "economicCode",
  "کد مالیاتی": "taxId", "شناسه مالیاتی": "taxId", "شماره مالیاتی": "taxId", "شناسه یکتای مالیاتی": "taxId",
  "کد مالیاتی شرکت": "taxId",
  "ایمیل": "email", "پست الکترونیکی": "email",
  "آدرس": "address", "نشانی": "address", "نشانی کامل": "address", "آدرس محل": "address",
  "آدرس پستی": "address", "آدرس محل کار": "address", "نشانی محل": "address",
  // --- فاکتورها (invoices) ---
  "شماره فاکتور": "number", "شماره": "number", "شماره سند": "number",
  "شماره فاکتور فروش": "number", "شماره سند فروش": "number",
  "شماره صورت‌حساب": "number", "فاکتور شماره": "number", "شماره سند مالی": "number",
  "شماره فاکتور خرید": "number", "شماره برگه": "number",
  "تاریخ فاکتور": "date", "تاریخ": "date", "تاریخ سند": "date", "تاریخ صدور": "date", "تاریخ ثبت": "date",
  "تاریخ صدور فاکتور": "date", "تاریخ ثبت سند": "date", "تاریخ فاکتور فروش": "date",
  "تاریخ فاکتور خرید": "date", "تاریخ میلادی": "date", "تاریخ برگه": "date",
  "کد مشتری/طرف‌حساب": "partyCode",
  "اقلام": "items", "ردیف‌ها": "items", "شرح اقلام": "items", "جزئیات اقلام": "items",
  "مبلغ کل": "total", "جمع کل": "total", "مبلغ فاکتور": "total", "مبلغ": "total",
  "جمع فاکتور": "total", "جمع نهایی": "total", "مبلغ قابل پرداخت": "total",
  "مبلغ نهایی": "total", "جمع کل فاکتور": "total", "قیمت کل": "total", "جمع مبلغ": "total",
  "مانده فاکتور": "total",
  // --- v20-E2: موجودیت‌های جدید — حساب‌ها / اسناد حسابداری / چک‌ها / کارمندان ---
  // (نگاشت کلیدهای مشترک با فایل‌های محصولات/طرف‌حساب عمداً حفظ شده؛
  //  ایمپورترهای جدید fallback می‌خوانند: docNumber??number، accountCode??code،
  //  partyName??name، fullName??name، group??category، qty??stock، unitPrice??salePrice)
  "نام حساب": "name",
  "طبیعت": "nature", "طبیعت حساب": "nature", "بدهکار/بستانکار": "nature",
  "سطح": "level", "سطح حساب": "level",
  "کد گروه": "group", "گروه حسابداری": "group",
  "کد والد": "parentCode", "کد حساب والد": "parentCode", "حساب والد": "parentCode",
  "مانده": "balance", "مانده حساب": "balance",
  "بدهکار": "debit", "مبلغ بدهکار": "debit",
  "بستانکار": "credit", "مبلغ بستانکار": "credit",
  "شرح سند": "description", "شرح ردیف": "description",
  "نوع سند": "type",
  "شماره چک": "number", "شماره صیادی": "number", "شماره برگه": "number",
  "سررسید": "dueDate", "تاریخ سررسید": "dueDate", "تاریخ وصول": "dueDate",
  "بانک": "bankName", "نام بانک": "bankName", "بانک عهده": "bankName",
  "شعبه": "branch",
  "شناسه صیاد": "sayadId", "کد صیاد": "sayadId",
  "تاریخ استخدام": "hireDate", "تاریخ ورود": "hireDate",
  "حقوق": "baseSalary", "حقوق پایه": "baseSalary", "حقوق و دستمزد": "baseSalary",
  "سمت": "position", "عنوان شغلی": "position",
  "کد پرسنلی": "personnelCode",
  "دپارتمان": "department", "بخش": "department",
  "نوع قرارداد": "contractType",
  "استان": "province",
  "شهر": "city", "شهرستان": "city",
  "کد پستی": "postalCode",
  "سقف اعتبار": "creditLimit", "حد اعتبار": "creditLimit",
  "مانده اولیه": "openingBalance", "مانده اول دوره": "openingBalance", "مانده ابتدای دوره": "openingBalance",
  "شناسه کدینگ": "goodsCode", "شناسه کالا و خدمت": "goodsCode",
  "حداقل موجودی": "minStock", "حداکثر موجودی": "maxStock",
  "نوع فاکتور": "type",
  "شرح قلم": "productName", "نام قلم": "productName",
};

/* Task 2-a — هدرهای انگلیسی/اکسلی با فاصله/بزرگی کوچک متفاوت: «sale price»،
 * «Sale Price»، «Unit Price» — قبلاً فقط compact می‌شدند و camelCase گم می‌شد. */
const ENGLISH_KEY_MAP: Record<string, string> = {
  saleprice: "salePrice", price: "salePrice", unitprice: "salePrice", sprice: "salePrice",
  purchaseprice: "purchasePrice", cost: "purchasePrice", costprice: "purchasePrice",
  wholesaleprice: "wholesalePrice", tradeprice: "wholesalePrice",
  quantity: "stock", qty: "stock", onhand: "stock", instock: "stock",
  itemname: "name", productname: "name", goodsname: "name",
  itemcode: "sku", partnumber: "sku", partno: "sku", itemno: "sku",
  barcode: "barcode", ean: "barcode", ean13: "barcode", upc: "barcode",
  barcod: "barcode", eancode: "barcode", "ean code": "barcode", barcode1: "barcode",
  unit: "unit", uom: "unit", measure: "unit",
  category: "category", group: "category",
  // R17-C (فروشگاه) — عکس و قیمت دلاری
  image: "imageUrl", imageurl: "imageUrl", photo: "imageUrl", picture: "imageUrl", img: "imageUrl", thumbnail: "imageUrl",
  usd: "usdPrice", usdprice: "usdPrice", priceusd: "usdPrice", dollarprice: "usdPrice",
  description: "description", notes: "description", remark: "description", remarks: "description",
  accountname: "name", customername: "name", fullname: "name", clientname: "name",
  accountcode: "code", customerno: "code", custcode: "code",
  phone: "phone", tel: "phone", telephone: "phone", phonenumber: "phone",
  mobile: "mobile", cell: "mobile", cellphone: "mobile", mobilephone: "mobile", gsm: "mobile",
  nationalid: "nationalId", ssn: "nationalId",
  economiccode: "economicCode", taxid: "taxId", email: "email", mail: "email",
  address: "address", addr: "address", address1: "address",
  postalcode: "postalCode", zipcode: "postalCode",
  number: "number", invoiceno: "number", invoicenumber: "number", docno: "number",
  billno: "number", invno: "number",
  date: "date", invoicedate: "date", docdate: "date", issuedate: "date",
  partycode: "partyCode", customercode: "partyCode",
  total: "total", totalamount: "total", nettotal: "total", amountdue: "total",
  invoicetotal: "total", invoiceamount: "total", amount: "total", sum: "total",
  items: "items", lines: "items", lineitems: "items", rows: "items",
};

// Task 2c — مقدارهای «نام» که در واقع هدر تکراری وسط فایل‌اند (مثل سطر دومِ
// خروجی خراب اکسل) — این ردیف‌ها باید «ردشده» شوند نه کالای «نام كالا»!
const NAME_HEADER_NORMALIZED = new Set(
  [
    "نام كالا", "نام کالا", "شرح کالا", "شرح", "نام جنس", "نام محصول", "عنوان", "نام",
    "نام کالا/خدمت", "کالا", "نام مشتری", "نام طرف‌حساب", "حساب", "نام شخص",
    "name", "title",
    // v20-E2 — هدرهای نام موجودیت‌های جدید (تکرار سطر هدر وسط فایل)
    "نام حساب", "شرح حساب", "نام و نام خانوادگی", "نام کامل",
  ].map((k) => normalizeHeaderKey(k))
);

// نرمال‌سازی یک ردیف: کلیدهای فارسی → انگلیسی + حذف فاصله‌های اضافی کلید
// FIX: کلیدهای انگلیسی camelCase (مثل salePrice) باید دست‌نخورده بمانند —
// قبلاً lowercase می‌شدند و ایمپورترها row.salePrice را پیدا نمی‌کردند (قیمت صفر!)
//
// FIX(3b-پیوست): کلیدهای نقشه با «نیم‌فاصله» (ZWNJ U+200C) تعریف شده‌اند اما
// خروجی واقعی هلو/سپیدار/اکسل کاربران اغلب «فاصله معمولی» یا ی/ک عربی دارد →
// نگاشت بی‌صدا شکست می‌خورد و ردیف با خطای گمراه‌کننده رد می‌شد. حالا هر دو
// طرف با normalizeHeaderKey یکسان می‌شوند (هم‌راستا با migration-wizard کلاینت).
function normalizeHeaderKey(key: string): string {
  return key
    .replace(/[\u200c\u200f\u200e]/g, "") // ZWNJ و کاراکترهای جهت‌دهی RTL
    .replace(/[\s_\-.\u0640]/g, "") // فاصله، زیرخط، خط تیره، کشیده (ـ)
    .replace(/\u064a/g, "\u06cc") // ي عربی → ی فارسی
    .replace(/\u0643/g, "\u06a9") // ك عربی → ک فارسی
    .replace(/[\u0623\u0625\u0622]/g, "\u0627") // أ إ آ → ا
    .toLowerCase();
}

// نقشه نرمال‌شده — یک‌بار ساخته می‌شود (lazy)
let normalizedKeyMap: Record<string, string> | null = null;
function getNormalizedKeyMap(): Record<string, string> {
  if (!normalizedKeyMap) {
    normalizedKeyMap = {};
    for (const [k, v] of Object.entries(PERSIAN_KEY_MAP)) {
      const nk = normalizeHeaderKey(k);
      if (nk && !(nk in normalizedKeyMap)) normalizedKeyMap[nk] = v;
    }
  }
  return normalizedKeyMap;
}

function normalizeRowKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const nmap = getNormalizedKeyMap();
  for (const [rawKey, value] of Object.entries(row)) {
    const key = rawKey.trim();
    // ۱) اگر کلید در نگاشت فارسی بود → معادل انگلیسی استاندارد را بگذار
    const mapped = PERSIAN_KEY_MAP[key] ?? nmap[normalizeHeaderKey(key)];
    if (mapped) {
      out[mapped] = value;
      continue;
    }
    // ۲) اگر دقیقاً یکی از فیلدهای API بود → همان بماند (camelCase حفظ می‌شود)
    const apiFields = new Set([
      "name", "sku", "unit", "salePrice", "purchasePrice", "wholesalePrice",
      "barcode", "description", "category", "code", "type", "phone", "mobile",
      "nationalId", "economicCode", "taxId", "email", "address",
      "number", "date", "partyCode", "items", "total",
      // FIX(21-A): فیلدهای جدید ایمپورت کالا
      "stock", "rowNo", "purchasePriceAvg", "purchasePriceLast", "categoryMain", "categorySub",
      // R17-C (فروشگاه): عکس + قیمت پایه دلاری
      "imageUrl", "usdPrice",
      // Task 2-a: فیلدهای پشتیبان طرف‌حساب
      "postalCode", "city",
      // Task 1-d: نگاشت دستی «نام مشتری» در فاکتورها (importInvoices می‌خواند)
      "partyName",
      // v20-E2: کلیدهای API موجودیت‌های جدید (نگاشت صریح ستون‌ها / JSON)
      "nature", "level", "parentCode", "balance", "group", "debit", "credit",
      "docNumber", "accountCode", "docDescription",
      "dueDate", "bankName", "issueDate", "branch", "sayadId",
      "fullName", "baseSalary", "hireDate", "position", "accountNumber",
      "personnelCode", "department", "contractType",
      "province", "creditLimit", "openingBalance",
      "goodsCode", "minStock", "maxStock",
      "qty", "unitPrice", "productName", "items", "total",
    ]);
    if (apiFields.has(key)) {
      out[key] = value;
      continue;
    }
    // ۳) در غیر این‌صورت: فقط فاصله/خط تیره انگلیسی را حذف کن (بدون lowercase)
    //    و اگر با حرف بزرگ شروع می‌شد، همان بماند — مقدار با کلید اصلی هم حفظ می‌شود
    const compact = key.replace(/[ \-]/g, "");
    // Task 2-a — نگاشت انگلیسی کوچک‌شده: «sale price»/«Sale Price»/«Unit Price»
    const englishMapped = ENGLISH_KEY_MAP[compact.toLowerCase()];
    if (englishMapped && !(englishMapped in out)) {
      out[englishMapped] = value;
    }
    out[compact] = value;
    // اگر کلید اصلی با نسخه compact فرق دارد، نسخه اصلی را هم نگه دار (پشتیبان)
    if (compact !== key) out[key] = value;
  }
  return out;
}

// ============ Bearer auth (optional, env-based) ============
//
// اگر متغیر محیطی IMPORT_BEARER_TOKEN تنظیم شده باشد، درخواست‌ها باید
// هدر Authorization: Bearer <token> داشته باشند. در غیر این صورت (محیط توسعه)،
// احراز هویت نادیده گرفته می‌شود و از rate-limit + active tenant استفاده می‌کنیم.
function verifyBearer(req: NextRequest): boolean {
  const expected = process.env.IMPORT_BEARER_TOKEN;
  if (!expected) return true; // احراز هویت غیرفعال
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return false;
  const parts = auth.split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return false;
  // مقایسه‌ی ثابت‌زمانی برای جلوگیری از timing attack
  const provided = parts[1];
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// ============ Helpers ============

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    // حذف جداکننده‌های فارسی/عربی/انگلیسی و تبدیل ارقام فارسی به انگلیسی
    // FIX: پشتیبانی کامل از همه جداکننده‌های یونیکد:
    //   ٬ U+066C (جداکننده هزارگان عربی — خروجی اکسل فارسی)
    //   ٮ/، کامای فارسی، , کامای انگلیسی
    //   ٫ U+066B (ممیز عربی) و / (ممیز فارسی) → نقطه اعشار
    const normalized = value
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .replace(/[٫/]/g, ".")
      .replace(/[,،٬\s\u00A0\u200C\u200E\u200F]/g, "");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/** آیا سلول مقدار غیرخالی دارد؟ */
function cellFilled(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeDate(value: unknown): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  // FIX(3b-بیگ‌۵) HIGH: ارقام فارسی/عربی در تاریخ (هلو/سپیدار) → انگلیسی
  const str = toEnglishDigits(String(value).trim());
  // پشتیبانی از YYYY-MM-DD یا YYYY/MM/DD
  // FIX(3b-بیگ‌۵) CRITICAL: تاریخ شمسی («1403/05/12») قبلاً به‌عنوان سال میلادیِ
  // 1403 پارس می‌شد (۱۷۰۰ سال آینده!). خروجی نرم‌افزارهای ایرانی تاریخ شمسی
  // دارند — سال ۱xxx (بازهٔ واقعی جلالی ۱۲۰۰–۱۶۰۰) تشخیص داده و با
  // jalaliToGregorian تبدیل می‌شود (الگوی موجود import/bank-statement).
  const m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    // الگوی جلالی: سال ۱xxx در بازهٔ ۱۲۰۰–۱۶۰۰ (سال میلادی ۱۲۰۰–۱۶۰۰ منطقی نیست)
    if (/^1\d{3}$/.test(m[1]) && y >= 1200 && y <= 1600 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const [gy, gm, gd] = jalaliToGregorian(y, mo, d);
      // FIX(H3-jalali-rollover): اعتبارسنجی رفت‌وبرگشت — قبلاً «1403/12/31»
      // (اسفند ۳۱ روز نیست) بی‌صدا به 1404/01/01 سر می‌خورد و فاکتور به سال بعد
      // تاریخ می‌خورد. حالا اگر تبدیل برگشت همان تاریخ اصلی را ندهد، تاریخ
      // جلالی نامعتبر است → مثل سایر تاریخ‌های نامعتبر به «امروز» برمی‌گردد.
      const [ry, rm, rd] = gregorianToJalali(gy, gm, gd);
      if (ry === y && rm === mo && rd === d) {
        const jDate = new Date(gy, gm - 1, gd, 0, 0, 0, 0);
        if (!isNaN(jDate.getTime())) return jDate;
      }
      return new Date();
    }
    const d2 = new Date(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T00:00:00Z`);
    if (!isNaN(d2.getTime())) return d2;
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseItems(itemsStr: string): Array<{ description: string; quantity: number; unitPrice: number }> {
  // فرمت: "description|qty|price;description|qty|price"
  return itemsStr
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const [description, qty, price] = part.split("|").map((x) => (x ?? "").trim());
      return {
        description: description || "—",
        quantity: toNumber(qty, 1),
        unitPrice: toNumber(price, 0),
      };
    });
}

/* ============================================================
 * v20-E2 — Helpers مشترک ایمپورترهای جدید (حساب‌ها/اسناد/چک‌ها/کارکنان)
 * ============================================================ */

/** سال مالی جاری tenant — الگوی accounting API (findFirst isCurrent)؛
 *  در نبودِ هر سال مالی، به الگوی demo seed سال جاری جلالی ساخته می‌شود
 *  («سال مالی ۱۴۰X» — ۱ فروردین تا ۳۰ اسفند، OPEN + isCurrent).
 *  dryRun=true هیچ سالی نمی‌سازد (خواندن فقط). */
async function ensureFiscalYear(tenantId: string, dryRun = false): Promise<string | null> {
  const current = await db.fiscalYear.findFirst({
    where: { tenantId, isCurrent: true },
    select: { id: true },
  });
  if (current) return current.id;
  const anyOpen = await db.fiscalYear.findFirst({
    where: { tenantId, status: "OPEN" },
    orderBy: { startDate: "desc" },
    select: { id: true },
  });
  if (anyOpen) return anyOpen.id;
  if (dryRun) return null;
  const jy = getCurrentJalaliYear();
  const yr = getJalaliYearRange(jy);
  try {
    const created = await db.fiscalYear.create({
      data: {
        tenantId,
        name: `سال مالی ${toPersianDigits(jy)}`,
        startDate: yr.start,
        endDate: yr.end,
        status: "OPEN",
        isCurrent: true,
      },
    });
    return created.id;
  } catch {
    // تداخل نام یکتا (سال هم‌نام از قبل) → همان را برگردان
    const fallback = await db.fiscalYear.findFirst({
      where: { tenantId },
      orderBy: { startDate: "desc" },
      select: { id: true },
    });
    return fallback?.id ?? null;
  }
}

/** طبیعت حساب فارسی → DEBIT/CREDIT (مدل فقط همین دو مقدار دارد؛
 *  «دوطرفه» بدون ستون متناظر → DEBIT ثبت می‌شود) */
function parseAccountNature(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "DEBIT";
  const n = normalizeHeaderKey(raw);
  const hasDebit = n.includes("بدهکار") || n === "debit" || n === "dr";
  const hasCredit = n.includes("بستانکار") || n === "credit" || n === "cr";
  if (hasCredit && !hasDebit) return "CREDIT";
  return "DEBIT";
}

/** سطح حساب فارسی → کل/معین/تفصیلی (null = نامشخص) */
function parseAccountLevel(value: unknown): "کل" | "معین" | "تفصیلی" | null {
  const n = normalizeHeaderKey(String(value ?? ""));
  if (!n) return null;
  if (n.includes("تفصیل")) return "تفصیلی";
  if (n.includes("معین")) return "معین";
  if (n.includes("کل")) return "کل";
  return null;
}

/** نوع سند حسابداری → JOURNAL/RECEIPT/PAYMENT (مقادیر اسکیما) */
function parseJournalType(value: unknown): string {
  const n = normalizeHeaderKey(String(value ?? "").trim());
  if (!n) return "JOURNAL";
  if (n === "journal" || n === "receipt" || n === "payment") return n.toUpperCase();
  if (n.includes("پرداخت")) return "PAYMENT";
  if (n.includes("رسید") || n.includes("دریافت")) return "RECEIPT";
  return "JOURNAL";
}

/** نوع چک → RECEIVED/ISSUED (دریافتنی/پرداختنی — پیش‌فرض RECEIVED مثل API چک‌ها) */
function parseCheckType(value: unknown): string {
  const n = normalizeHeaderKey(String(value ?? "").trim());
  if (n === "received" || n === "issued") return n.toUpperCase();
  if (n.includes("پرداخت")) return "ISSUED";
  if (n.includes("دریافت")) return "RECEIVED";
  return "RECEIVED";
}

/** نوع فاکتور → SALE/PURCHASE/RETURN/PRE_INVOICE (مقادیر اسکیما) */
function parseInvoiceType(value: unknown): string {
  const n = normalizeHeaderKey(String(value ?? "").trim());
  if (!n) return "SALE";
  if (n === "sale" || n === "purchase" || n === "return" || n === "preinvoice" || n === "pre_invoice") {
    return n.replace("_", "").toUpperCase() === "PREINVOICE" ? "PRE_INVOICE" : n.toUpperCase();
  }
  if (n.includes("برگشت")) return "RETURN";
  if (n.includes("پیش") && n.includes("فاکتور")) return "PRE_INVOICE";
  if (n.includes("خرید")) return "PURCHASE";
  if (n.includes("فروش")) return "SALE";
  return "SALE";
}

/** نوع قرارداد کارمند → PERMANENT/PROBATION/TEMPORARY (کپی POST /api/employees) */
function parseContractType(value: unknown): string {
  const n = normalizeHeaderKey(String(value ?? "").trim());
  if (!n) return "PERMANENT";
  if (n === "probation" || n.includes("آزمایشی")) return "PROBATION";
  if (n === "temporary" || n.includes("پیمانی") || n.includes("موقت")) return "TEMPORARY";
  return "PERMANENT";
}

/** کنترل‌رقم کد ملی ایران (mod-11) — کپی POST /api/employees */
function isValidNationalId(nid: string): boolean {
  if (!/^\d{10}$/.test(nid)) return false;
  const digits = nid.split("").map(Number);
  const sum = digits.slice(0, 9).reduce((s, d, i) => s + d * (10 - i), 0);
  const remainder = sum % 11;
  const check = remainder < 2 ? remainder : 11 - remainder;
  return digits[9] === check;
}

/** تفکیک نام کامل → (نام، نام خانوادگی) — تک‌واژه‌ای → نام خانوادگی خالی */
function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// ============ Importers ============

/* ============================================================
 * FIX(21-A) importProducts — بازنویسی کامل برای ۱۰۰k ردیف بدون ردیف گم‌شده:
 *
 *  - پیش‌بارگذاری (بدون findFirst سطر به سطر — که برای ۱۰۰k ردیف دقیقه‌ها
 *    طول می‌کشید): همهٔ SKU های tenant در یک findMany → Map؛ همهٔ دسته‌ها → Map
 *  - دسته‌بندی هر ردیف به یکی از: ایجاد / به‌روزرسانی / ردِ تکراری / خطا
 *    (جمعِ این چهار دقیقاً برابر تعداد ردیف‌های دریافتی است — هیچ کالایی
 *    «گم» نمی‌شود)
 *  - ایجاد گروهی با $transaction های ۲۰۰تایی (SQLite) + fallback سطری در
 *    صورت شکک تراکنش (خطا به همان ردیف نسبت داده می‌شود)
 *  - موجودی اولیه: دقیقاً مثل POST /api/products — StockItem + StockMovement
 *    (type IN/OUT + referenceType ADJUSTMENT) در انبار پیش‌فرض
 *    (resolveDefaultWarehouse — در نبود انبار «انبار اصلی» می‌سازد)
 *  - استراتژی تکراری SKU: skip (پیش‌فرض) یا update (قیمت/توضیحات +
 *    تعدیل موجودی با دلتا)
 * ============================================================ */

interface ProductCreateItem {
  row: number;
  sku: string;
  name: string;
  unit: string;
  barcode: string | null;
  description: string | null;
  categoryId: string | null;
  salePrice: number;
  purchasePrice: number;
  wholesalePrice: number;
  stock: number;
  // R17-C (فروشگاه) — عکس و قیمت پایه دلاری
  imageUrl: string | null;
  usdPrice: number | null;
  // v20-E2 — شناسه کدینگ مودیان + حدود موجودی
  goodsCode: string | null;
  minStock: number;
  maxStock: number;
}

interface ProductUpdateItem {
  row: number;
  productId: string;
  sku: string;
  updateData: {
    salePrice?: bigint;
    purchasePrice?: bigint;
    wholesalePrice?: bigint;
    description?: string | null;
    /** v33-a: بارکد — هنگام درون‌ریزی مجدد، بارکد ستون فایل به کالای موجود می‌چسبد */
    barcode?: string | null;
    /** R17-C (فروشگاه): عکس و قیمت دلاری — فقط وقتی ستون در فایل مقدار داشت */
    imageUrl?: string | null;
    usdPrice?: number | null;
    usdSynced?: boolean;
    /** v20-E2: شناسه کدینگ/حدود موجودی — فقط وقتی ستونش در فایل پر بود */
    goodsCode?: string | null;
    minStock?: number;
    maxStock?: number;
  };
  /** موجودی جدید — undefined یعنی فایل ستون موجودی نداشت/خالی بود */
  newStock?: number;
}

async function importProducts(
  rowsRaw: Record<string, unknown>[],
  tenantId: string,
  req: NextRequest,
  fileName?: string,
  strategy: DuplicateStrategy = "skip",
  /** Task 1-d: تولید خودکار کد کالا برای ردیف‌های بدون کد (پیش‌فرض روشن) */
  autoSku = true,
  /** v20-E2: حالت اعتبارسنجی (mode=validate) — بدون هیچ نوشتن در DB */
  dryRun = false
): Promise<{
  created: number;
  updated: number;
  skipped: number;
  errors: ImportError[];
  skippedRows: ImportError[];
}> {
  const rows = rowsRaw.map(normalizeRowKeys);
  const errors: ImportError[] = [];
  const skippedRows: ImportError[] = [];
  let skipped = 0; // ردیف‌های تکراری (استراتژی skip)
  const creates: ProductCreateItem[] = [];
  const updates: ProductUpdateItem[] = [];

  // ۱) پیش‌بارگذاری SKU های موجود (یک کوئری — نه findFirst در هر ردیف)
  const existingProducts = await db.product.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, sku: true, purchasePrice: true, name: true, barcode: true },
  });
  const skuMap = new Map<string, { id: string; purchasePrice: bigint; barcode: string | null }>();
  for (const p of existingProducts) skuMap.set(p.sku, { id: p.id, purchasePrice: p.purchasePrice, barcode: p.barcode });
  // FIX(name-dedup): فایل‌های بدون کد کالا (خروجی هلو) دوباره ایمپورت شوند
  // نباید کالای تکراری بسازند — نقشهٔ نام→کالا (نام نرمال‌شده: ی/ک فارسی + trim)
  const nameMap = new Map<string, { id: string; purchasePrice: bigint; barcode: string | null }>();
  for (const p of existingProducts) {
    const normName = normalizeHeaderKey(p.name || "");
    if (normName && !nameMap.has(normName)) {
      nameMap.set(normName, { id: p.id, purchasePrice: p.purchasePrice, barcode: p.barcode });
    }
  }
  // v33-a: نقشهٔ بارکد→productId برای جلوگیری از تخصیص بارکد تکراری به دو کالا
  const barcodeOwner = new Map<string, string>();
  for (const p of existingProducts) {
    if (p.barcode && !barcodeOwner.has(p.barcode)) barcodeOwner.set(p.barcode, p.id);
  }

  // ۲) پیش‌بارگذاری دسته‌بندی‌ها
  const existingCats = await db.productCategory.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });
  const catMap = new Map<string, string>();
  for (const c of existingCats) {
    if (!catMap.has(c.name)) catMap.set(c.name, c.id);
  }

  // شمارنده SKU خودکار (یکتا در هر درخواست)
  let autoSkuCounter = 0;
  const autoSkuStamp = Date.now().toString(36).toUpperCase().slice(-4);
  const autoSkuRand = Math.random().toString(36).toUpperCase().slice(2, 5);
  // SKU های دیده‌شده در همین فایل (تشخیص تکراری داخل فایل)
  const seenSkus = new Set<string>();
  // نام‌های دیده‌شده در همین فایل (فایل بدون SKU — تشخیص تکراری نام)
  const seenNames = new Set<string>();
  // نام دسته‌های ناموفق (تا ردیف‌های آن‌ها خطای شفاف بگیرند)
  const failedCategories = new Set<string>();

  // ۳) طبقه‌بندی ردیف‌ها (بدون هیچ کوئری سطر به سطر)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const idx = i + 1;
    try {
      let sku = String(row.sku ?? "").trim();
      const name = String(row.name ?? "").trim();
      const unitRaw = String(row.unit ?? "").trim();
      // «واحد هاي کالا» در خروجی هلو عددی/خالی است → «عدد»
      const unit = unitRaw && !isBlankOrNumeric(unitRaw) ? unitRaw.slice(0, 20) : "عدد";
      const salePrice = toNumber(row.salePrice, 0);

      // قیمت خرید: میانگین خرید (ترجیحی — منطق بهای میانگین متحرک) > آخرین فی خرید
      const avgFilled = cellFilled(row.purchasePriceAvg);
      const lastFilled = cellFilled(row.purchasePriceLast);
      let purchasePrice: number;
      if (cellFilled(row.purchasePrice) && toNumber(row.purchasePrice) > 0) {
        purchasePrice = toNumber(row.purchasePrice);
      } else if (avgFilled && toNumber(row.purchasePriceAvg) > 0) {
        purchasePrice = toNumber(row.purchasePriceAvg);
      } else if (lastFilled) {
        purchasePrice = toNumber(row.purchasePriceLast);
      } else if (cellFilled(row.purchasePrice)) {
        purchasePrice = toNumber(row.purchasePrice);
      } else {
        purchasePrice = 0;
      }

      const wholesalePrice = row.wholesalePrice !== undefined ? toNumber(row.wholesalePrice, salePrice) : salePrice;
      // FIX(H3-negative-price): قیمت منفی در ایمپورت هم رد می‌شود — هم‌راستا با
      // POST /api/products (zod nonnegative). قبلاً «-5000» بی‌صدا ذخیره می‌شد.
      if (salePrice < 0 || purchasePrice < 0 || wholesalePrice < 0) {
        errors.push({ row: idx, message: "قیمت کالا نمی‌تواند منفی باشد" });
        continue;
      }
      const barcode = String(row.barcode ?? "").trim() || null;
      const description = String(row.description ?? "").trim() || null;

      // R17-C (فروشگاه) — عکس کالا: فقط لینک http(s) معتبر یا مسیر نسبی
      // /uploads/... پذیرفته می‌شود (جلوگیری از javascript:/data: و پیمایش مسیر —
      // مقدار نامعتبر مثل خالی رفتار می‌شود)
      const imageUrlRaw = String(row.imageUrl ?? "").trim();
      const imageUrl =
        imageUrlRaw &&
        (/^https?:\/\/\S+$/i.test(imageUrlRaw) ||
          /^\/uploads\/(?!.*\.\.)[\w\-./%]+$/i.test(imageUrlRaw))
          ? imageUrlRaw.slice(0, 600)
          : null;
      // R17-C (فروشگاه) — قیمت پایه دلاری (اعشار مجاز؛ خالی/صفر = بدون قیمت دلاری)
      const usdPrice = cellFilled(row.usdPrice) && toNumber(row.usdPrice) > 0 ? Math.round(toNumber(row.usdPrice) * 100) / 100 : null;

      // v20-E2 — شناسه کدینگ مودیان (sstid) + حدود موجودی (فقط وقتی ستون مقدار داشت)
      const goodsCode = String(row.goodsCode ?? "").trim() || null;
      const minStock = cellFilled(row.minStock) ? toNumber(row.minStock, 0) : 0;
      const maxStock = cellFilled(row.maxStock) ? toNumber(row.maxStock, 0) : 0;
      if (minStock < 0 || maxStock < 0) {
        errors.push({ row: idx, message: "حداقل/حداکثر موجودی نمی‌تواند منفی باشد" });
        continue;
      }

      // دسته‌بندی: مقدار مستقیم یا ترکیب «گروه اصلی / گروه فرعی»
      let category = String(row.category ?? "").trim() || null;
      if (!category) {
        category =
          combineCategory(String(row.categoryMain ?? ""), String(row.categorySub ?? "")) || null;
      }

      // Task 2c — تکرار سطر هدر در وسط فایل: مقدار «نام» دقیقاً یکی از
      // هدرهای شناخته‌شده است (مثل «نام كالا») → ردشده، نه کالای جدید!
      if (name && NAME_HEADER_NORMALIZED.has(normalizeHeaderKey(name))) {
        skipped++;
        skippedRows.push({ row: idx, message: "تکرار سطر هدر در فایل — وارد نشد" });
        continue;
      }

      if (!name) {
        // Task 24 — تشخیص «سطر جمع کل/فوتر»: نام خالی + مقادیر عددی →
        // سطر جمع خروجی هلو/سپیدار است؛ به‌جای خطا، هوشمندانه رد می‌شود.
        const rowValues = Object.values(row);
        const hasNumeric = rowValues.some((v) => {
          if (v === undefined || v === null) return false;
          const s = String(v).trim();
          if (!s) return false;
          const n = s
            .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
            .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
            .replace(/[,،٬\s]/g, "");
          return /^-?\d+(\.\d+)?$/.test(n) && Number(n) !== 0;
        });
        // Task 2c — سطر «مزاحم» خالص: نه نام، نه عدد، نه متنِ معنی‌دار
        // (ردیف خالی/ساختگی که از فیلتر کلاینت رد شده) → ردشده، نه خطا
        const hasMeaningfulText = rowValues.some((v) => {
          if (v === undefined || v === null) return false;
          const s = String(v).trim();
          if (!s) return false;
          return !/^[\d.,،٬\s۰-۹٠-٩\-]+$/.test(s) && !/^[-=_*·.‾—ـ\s]+$/.test(s);
        });
        if (hasNumeric) {
          skipped++;
          skippedRows.push({ row: idx, message: "سطر جمع کل فایل — وارد نشد" });
        } else if (!hasMeaningfulText) {
          skipped++;
          skippedRows.push({ row: idx, message: "سطر خالی/مزاحم — وارد نشد" });
        } else {
          errors.push({ row: idx, message: "نام کالا الزامی است" });
        }
        continue;
      }

      // FIX(auto-sku): اگر کد کالا خالی بود، خودکار تولید کن (یکتا در فایل)
      // Task 1-d: با autoSku=false ردیف بدون کد خطای شفاف می‌گیرد
      if (!sku) {
        if (!autoSku) {
          errors.push({
            row: idx,
            message: "کد کالا خالی است و تولید خودکار کد غیرفعال شده — ستون کد را نگاشت کنید یا گزینهٔ تولید خودکار را روشن کنید",
          });
          continue;
        }
        autoSkuCounter++;
        sku = `IMP-${autoSkuStamp}-${autoSkuRand}-${String(autoSkuCounter).padStart(4, "0")}`;
        while (seenSkus.has(sku) || skuMap.has(sku)) {
          autoSkuCounter++;
          sku = `IMP-${autoSkuStamp}-${autoSkuRand}-${String(autoSkuCounter).padStart(4, "0")}`;
        }
      }

      // FIX(name-dedup): فایل بدون کد کالا؟ نامِ نرمال‌شده را به‌عنوان کلید
      // یکتای دوم ببین — کالای هم‌نامِ موجود (skip) یا به‌روزرسانی (update)
      const rawSku = String(row.sku ?? "").trim();
      const normRowName = normalizeHeaderKey(name);
      let nameBasedExisting: { id: string; purchasePrice: bigint; barcode: string | null } | undefined;
      if (!rawSku && normRowName) {
        nameBasedExisting = nameMap.get(normRowName);
        if (!nameBasedExisting && seenNames.has(normRowName)) {
          // تکراری داخل همین فایل (بدون SKU) — ردیف دوم به بعد
          if (strategy === "update") {
            continue; // به‌روزرسانی تکراریِ سوم بی‌معنی است — رد
          }
          skipped++;
          skippedRows.push({ row: idx, message: `کالای هم‌نام تکراری در همین فایل: «${name.slice(0, 40)}»` });
          continue;
        }
        // نام جدید را ثبت کن (زنجیرهٔ چانک‌ها: چانک بعدی هم ببیند)
        seenNames.add(normRowName);
      }

      // موجودی اولیه (فقط وقتی ستون موجودی در فایل مقدار داشت)
      const stockProvided = cellFilled(row.stock);
      const stock = stockProvided ? toNumber(row.stock, 0) : 0;

      if (seenSkus.has(sku)) {
        errors.push({ row: idx, message: `کد کالا تکراری در همین فایل: ${sku}` });
        continue;
      }
      seenSkus.add(sku);

      const existing = skuMap.get(sku) ?? nameBasedExisting;
      if (existing) {
        // v33-a: بارکدِ فایل به کالای موجود می‌چسبد —
        // • استراتژی update: بارکد متفاوت/خالی → بروز می‌شود
        // • استراتژی skip: فقط «تکمیل» — کالایی که بارکد ندارد، بارکد می‌گیرد (قیمت/موجودی دست نمی‌خورد)
        // بارکد تکراریِ متعلق به کالای دیگر → بی‌سروصدا رد می‌شود (تا ردیف خطا نگیرد)
        const barcodeFree =
          barcode &&
          (barcodeOwner.get(barcode) === undefined || barcodeOwner.get(barcode) === existing.id);
        const barcodeAttachable =
          barcode && barcodeFree && barcode !== (existing.barcode ?? null)
            ? barcode
            : undefined;
        if (strategy === "update") {
          // به‌روزرسانی قیمت‌ها/توضیحات/بارکد + تعدیل موجودی (اگر فایل موجودی داشت)
          const updateData: ProductUpdateItem["updateData"] = {};
          if (cellFilled(row.salePrice)) updateData.salePrice = BigInt(Math.round(salePrice));
          if (cellFilled(row.purchasePrice) || avgFilled || lastFilled) {
            updateData.purchasePrice = BigInt(Math.round(purchasePrice));
          }
          if (row.wholesalePrice !== undefined && cellFilled(row.wholesalePrice)) {
            updateData.wholesalePrice = BigInt(Math.round(wholesalePrice));
          }
          if (description) updateData.description = description;
          if (barcodeAttachable) updateData.barcode = barcodeAttachable;
          // R17-C (فروشگاه): عکس و قیمت دلاری — فقط وقتی ستونش در فایل پر بود
          if (cellFilled(row.imageUrl)) {
            updateData.imageUrl = imageUrl;
          }
          if (cellFilled(row.usdPrice)) {
            updateData.usdPrice = usdPrice;
            updateData.usdSynced = usdPrice !== null;
          }
          // v20-E2 — شناسه کدینگ/حدود موجودی (فقط وقتی ستونش در فایل پر بود)
          if (goodsCode) updateData.goodsCode = goodsCode;
          if (cellFilled(row.minStock)) updateData.minStock = minStock;
          if (cellFilled(row.maxStock)) updateData.maxStock = maxStock;
          updates.push({
            row: idx,
            productId: existing.id,
            sku,
            updateData,
            newStock: stockProvided ? Math.max(stock, 0) : undefined,
          });
          // v33-a: بارکد تازه‌تخصیصی را در نقشه‌ها ثبت کن (زنجیره چانک‌ها)
          if (barcodeAttachable) {
            barcodeOwner.set(barcodeAttachable, existing.id);
            if (nameBasedExisting) nameBasedExisting.barcode = barcodeAttachable;
          }
          // SKU تازه به‌روزرسانی‌شده را در نقشه نگه دار (زنجیره چانک‌ها)
          skuMap.set(sku, {
            id: existing.id,
            purchasePrice: updateData.purchasePrice ?? existing.purchasePrice,
            barcode: barcodeAttachable ?? existing.barcode ?? null,
          });
        } else if (barcodeAttachable && !existing.barcode) {
          // استراتژی skip + کالای بدون بارکد → فقط بارکد را تکمیل کن (بدون قیمت/موجودی)
          updates.push({
            row: idx,
            productId: existing.id,
            sku,
            updateData: { barcode: barcodeAttachable },
            newStock: undefined,
          });
          barcodeOwner.set(barcodeAttachable, existing.id);
          if (nameBasedExisting) nameBasedExisting.barcode = barcodeAttachable;
          skuMap.set(sku, {
            id: existing.id,
            purchasePrice: existing.purchasePrice,
            barcode: barcodeAttachable,
          });
        } else {
          skipped++;
          skippedRows.push({
            row: idx,
            message: nameBasedExisting
              ? `کالای هم‌نام از قبل موجود: «${name.slice(0, 40)}»`
              : `کد کالا تکراری: ${sku}`,
          });
        }
        continue;
      }

      // دسته‌بندی: پیدا/بساز (فقط برای ایجادها) — با کش catMap
      let categoryId: string | null = null;
      if (category) {
        if (failedCategories.has(category)) {
          errors.push({ row: idx, message: `دسته‌بندی ساخته نشد: ${category}` });
          continue;
        }
        const cached = catMap.get(category);
        if (cached) {
          categoryId = cached;
        } else {
          if (dryRun) {
            // v20-E2 (validate) — دستهٔ جدید بدون نوشتن؛ شناسهٔ موقت برای زنجیرهٔ ردیف‌ها
            const dryId = `dry-cat:${category}`;
            catMap.set(category, dryId);
            categoryId = dryId;
          } else {
            try {
              const cat = await db.productCategory.create({
                data: { tenantId, name: category },
              });
              catMap.set(category, cat.id);
              categoryId = cat.id;
            } catch {
              failedCategories.add(category);
              errors.push({ row: idx, message: `دسته‌بندی ساخته نشد: ${category}` });
              continue;
            }
          }
        }
      }

      // SKU موقت را برای زنجیره چانک‌ها در نقشه درون‌درخواستی ثبت نکن —
      // تکراری داخل فایل قبلاً با seenSkus گرفته می‌شود
      creates.push({
        row: idx,
        sku,
        name,
        unit,
        barcode,
        description,
        categoryId,
        salePrice,
        purchasePrice,
        wholesalePrice,
        stock,
        imageUrl,
        usdPrice,
        goodsCode,
        minStock,
        maxStock,
      });
      // v33-a: بارکد کالای جدید در نقشهٔ مالکیت ثبت شود (تکراری داخل فایل
      // به کالای موجود بعدی تخصیص نیابد) — چون id هنوز ساخته نشده،
      // مقدار موقت «create:<sku>» کافی است تا مالکیت رزرو شود
      if (barcode) barcodeOwner.set(barcode, `create:${sku}`);
    } catch (err) {
      errors.push({
        row: idx,
        message: err instanceof Error ? err.message : "خطا در آماده‌سازی ردیف کالا",
      });
    }
  }

  // ۴) انبار پیش‌فرض — فقط اگر به موجودی نیاز باشد (مثل POST /api/products
  //    که فقط با stock>0 انبار می‌سازد؛ resolveDefaultWarehouse در نبود انبار
  //    «انبار اصلی» ایجاد می‌کند) — در حالت dryRun هیچ انباری ساخته نمی‌شود
  let warehouseId: string | null = null;
  const needsStock =
    creates.some((c) => c.stock > 0) || updates.some((u) => u.newStock !== undefined);
  if (needsStock && !dryRun) {
    warehouseId = await resolveDefaultWarehouse(tenantId);
  }

  // ۵) موجودی فعلی کالاهایی که به‌روزرسانی می‌شوند (یک کوئری)
  const currentStock = new Map<string, number>();
  if (warehouseId && updates.some((u) => u.newStock !== undefined)) {
    const updateIds = updates.filter((u) => u.newStock !== undefined).map((u) => u.productId);
    const stockItems = await db.stockItem.findMany({
      where: { tenantId, warehouseId, productId: { in: updateIds } },
      select: { productId: true, quantity: true },
    });
    for (const s of stockItems) currentStock.set(s.productId, s.quantity);
  }

  let created = 0;
  let updated = 0;

  // کلاینت دیتابیس (db یا کلاینت تراکنش تعاملی — ساختار یکسان)
  type DbLike = typeof db;

  // ایجاد یک کالا + موجودی اولیه (آینه‌ی POST /api/products → setProductStock
  // → applyStockChange: StockItem + StockMovement{type IN, referenceType ADJUSTMENT})
  const createProductRow = async (
    tx: DbLike,
    item: ProductCreateItem,
    whId: string | null
  ): Promise<void> => {
    const productId = randomUUID();
    await tx.product.create({
      data: {
        id: productId,
        tenantId,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        type: "GOODS",
        barcode: item.barcode,
        description: item.description,
        categoryId: item.categoryId,
        purchasePrice: BigInt(Math.round(item.purchasePrice)),
        salePrice: BigInt(Math.round(item.salePrice)),
        wholesalePrice: BigInt(Math.round(item.wholesalePrice)),
        // R17-C (فروشگاه) — عکس + قیمت پایه دلاری؛ usdSynced یعنی با هر به‌روزرسانی
        // نرخ دلار، قیمت فروش این کالا بازمحاسبه می‌شود (الگوی ماژول انبار)
        ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
        ...(item.usdPrice ? { usdPrice: item.usdPrice, usdSynced: true } : {}),
        // v20-E2 — شناسه کدینگ مودیان + حدود موجودی
        ...(item.goodsCode ? { goodsCode: item.goodsCode } : {}),
        minStock: item.minStock,
        maxStock: item.maxStock,
      },
    });
    if (whId && item.stock > 0) {
      // StockItem (قید یکتای tenant+product+warehouse — کالای تازه است → create)
      await tx.stockItem.create({
        data: { tenantId, productId, warehouseId: whId, quantity: item.stock },
      });
      // StockMovement — دقیقاً مثل applyStockChange با unitCost=null:
      // type=IN، referenceType=ADJUSTMENT، unitCost=قیمت خرید کالا (میانگین)
      const movementCost = item.purchasePrice > 0 ? BigInt(Math.round(item.purchasePrice)) : null;
      await tx.stockMovement.create({
        data: {
          tenantId,
          productId,
          type: "IN",
          quantity: item.stock,
          fromWarehouseId: null,
          toWarehouseId: whId,
          referenceType: "ADJUSTMENT",
          referenceId: null,
          unitCost: movementCost,
        },
      });
    }
  };

  // ۶) ایجاد گروهی — تراکنش‌های ۲۰۰تایی (SQLite) با fallback سطری
  //    v20-E2 (dryRun): شمارش بدون نوشتن
  const BATCH = 200;
  if (dryRun) {
    created = creates.length;
  } else
  for (let i = 0; i < creates.length; i += BATCH) {
    const batch = creates.slice(i, i + BATCH);
    try {
      await db.$transaction(async (tx) => {
        for (const item of batch) {
          await createProductRow(tx as unknown as DbLike, item, warehouseId);
        }
      });
      created += batch.length;
    } catch {
      // شکک تراکنش دسته → تلاش سطری تا خطا دقیقاً به ردیفِ مقصر نسبت یابد
      for (const item of batch) {
        try {
          await createProductRow(db, item, warehouseId);
          created++;
        } catch (err) {
          errors.push({
            row: item.row,
            message: err instanceof Error ? err.message : "خطا در ایجاد کالا",
          });
        }
      }
    }
  }

  // ۷) به‌روزرسانی گروهی (استراتژی update)
  const updateOne = async (tx: DbLike, u: ProductUpdateItem): Promise<void> => {
    if (Object.keys(u.updateData).length > 0) {
      await tx.product.update({
        where: { id: u.productId },
        data: u.updateData,
      });
    }
    if (warehouseId && u.newStock !== undefined) {
      const currentQty = currentStock.get(u.productId) ?? 0;
      const delta = u.newStock - currentQty;
      if (delta === 0) return;
      // StockItem — قید یکتای tenant+product+warehouse (مثل applyStockChange)
      const existingItem = await tx.stockItem.findUnique({
        where: {
          tenantId_productId_warehouseId: {
            tenantId,
            productId: u.productId,
            warehouseId,
          },
        },
        select: { id: true },
      });
      if (existingItem) {
        await tx.stockItem.update({
          where: { id: existingItem.id },
          data: { quantity: u.newStock },
        });
      } else {
        await tx.stockItem.create({
          data: { tenantId, productId: u.productId, warehouseId, quantity: u.newStock },
        });
      }
      // حرکت تعدیل — type IN/OUT + referenceType ADJUSTMENT
      const newPurchase = u.updateData.purchasePrice;
      const fallbackPurchase = skuMap.get(u.sku)?.purchasePrice ?? null;
      const unitCostRaw =
        newPurchase !== undefined && newPurchase > 0 ? newPurchase : fallbackPurchase;
      await tx.stockMovement.create({
        data: {
          tenantId,
          productId: u.productId,
          type: delta > 0 ? "IN" : "OUT",
          quantity: Math.abs(delta),
          fromWarehouseId: delta > 0 ? null : warehouseId,
          toWarehouseId: delta > 0 ? warehouseId : null,
          referenceType: "ADJUSTMENT",
          referenceId: null,
          unitCost: unitCostRaw && unitCostRaw > 0 ? unitCostRaw : null,
        },
      });
    }
  };
  for (let i = 0; i < updates.length; i += BATCH) {
    if (dryRun) {
      updated += updates.length;
      break;
    }
    const batch = updates.slice(i, i + BATCH);
    try {
      await db.$transaction(async (tx) => {
        for (const u of batch) {
          await updateOne(tx as unknown as DbLike, u);
        }
      });
      updated += batch.length;
    } catch {
      for (const u of batch) {
        try {
          await updateOne(db, u);
          updated++;
        } catch (err) {
          errors.push({
            row: u.row,
            message: err instanceof Error ? err.message : "خطا در به‌روزرسانی کالا",
          });
        }
      }
    }
  }

  // v20-E2 (dryRun): در حالت اعتبارسنجی هیچ ردیفی در AuditLog ثبت نمی‌شود
  // (تا تاریخچهٔ واردات، اجراهای validate را ایمپورت واقعی نشان ندهد)
  if (!dryRun) {
    await auditLog({
      tenantId,
      action: "BULK_IMPORT",
      entity: "Product",
      entityId: "bulk",
      changes: {
        count: created,
        updated,
        skipped,
        errors: errors.length,
        total: rows.length,
        strategy,
        fileName: fileName ?? null,
      },
      req,
    });
  }

  return { created, updated, skipped, errors, skippedRows };
}

async function importParties(
  rowsRaw: Record<string, unknown>[],
  tenantId: string,
  req: NextRequest,
  fileName?: string,
  /** v20-E2: استراتژی کد تکراری — skip (پیش‌فرض) یا update (مثل کالاها) */
  strategy: DuplicateStrategy = "skip",
  /** v20-E2: حالت اعتبارسنجی (mode=validate) — بدون هیچ نوشتن در DB */
  dryRun = false
): Promise<{
  created: number;
  updated: number;
  skipped: number;
  errors: ImportError[];
  skippedRows: ImportError[];
}> {
  const errors: ImportError[] = [];
  // Task 2c — سطرهای ردشده (تکرار هدر/خالی) با دلیل شفاف
  const skippedRows: ImportError[] = [];
  let skipped = 0;
  const rows = rowsRaw.map(normalizeRowKeys);

  const validTypes = new Set(["CUSTOMER", "SUPPLIER", "BOTH"]);

  // نگاشت مقادیر فارسی نوع طرف‌حساب → مقادیر سیستم
  const persianTypeMap: Record<string, string> = {
    "مشتری": "CUSTOMER", "خریدار": "CUSTOMER", "فروش": "CUSTOMER",
    "تامین‌کننده": "SUPPLIER", "تأمین‌کننده": "SUPPLIER", "فروشنده": "SUPPLIER", "خرید": "SUPPLIER",
    "هردو": "BOTH", "مشتری/فروشنده": "BOTH",
  };

  // FIX(21-A) + v20-E2: پیش‌بارگذاری همهٔ طرف‌حساب‌ها در یک کوئری — برای استراتژی
  // skip/update کد تکراری (قبلاً کد تکراری «خطا» بود و ردیف می‌افتاد)
  const existingParties = await db.party.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, code: true },
  });
  const partyByCode = new Map<string, string>(existingParties.map((p) => [p.code, p.id]));
  const seenCodes = new Set<string>();

  // FIX(auto-code): شمارنده برای تولید خودکار کد وقتی کد در فایل نیست
  let autoCodeCounter = 0;
  const autoStamp = Date.now().toString(36).toUpperCase().slice(-4);
  const autoRand = Math.random().toString(36).toUpperCase().slice(2, 5);

  interface PartyCreateItem {
    row: number;
    data: Prisma.PartyUncheckedCreateInput;
  }
  const creates: PartyCreateItem[] = [];
  // v20-E2: به‌روزرسانی‌های استراتژی update (کد تکراری)
  const updates: Array<{ row: number; partyId: string; data: Prisma.PartyUpdateInput }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const idx = i + 1;
    try {
      let code = String(row.code ?? "").trim();
      const name = String(row.name ?? "").trim();
      const typeRaw = String(row.type ?? "CUSTOMER").trim();
      const type = validTypes.has(typeRaw.toUpperCase())
        ? typeRaw.toUpperCase()
        : persianTypeMap[typeRaw] ?? "CUSTOMER";
      const phone = String(row.phone ?? "").trim() || null;
      const mobile = String(row.mobile ?? "").trim() || null;
      const email = String(row.email ?? "").trim() || null;
      const address = String(row.address ?? "").trim() || null;
      // v20-E2 FIX: شهر/استان/کد پستی قبلاً پارس می‌شد ولی هرگز در party.create
      // نوشته نمی‌شد (بی‌صدا دور ریخته می‌شد) — حالا ذخیره می‌شوند
      const city = String(row.city ?? "").trim() || null;
      const province = String(row.province ?? "").trim() || null;
      const postalCode = toEnglishDigits(String(row.postalCode ?? "").trim()).replace(/[\s\-]/g, "") || null;
      // v20-E2: سقف اعتبار + مانده اولیه (ریال خام — مثل بقیهٔ مبالغ درون‌ریزی؛
      // «مانده» بدون پسوند هم به مانده اولیه طرف‌حساب نگاشت می‌شود)
      const creditLimitRaw = cellFilled(row.creditLimit) ? toNumber(row.creditLimit, 0) : null;
      const openingBalanceRaw = cellFilled(row.openingBalance ?? row.balance)
        ? toNumber(row.openingBalance ?? row.balance, 0)
        : null;
      if (creditLimitRaw !== null && creditLimitRaw < 0) {
        errors.push({ row: idx, message: "سقف اعتبار نمی‌تواند منفی باشد" });
        continue;
      }
      // FIX(3b-بیگ۱۰): نرمال‌سازی ارقام فارسی کد ملی قبل از رمزنگاری/ایندکس
      const nationalId = toEnglishDigits(String(row.nationalId ?? "").trim()).replace(/[\s\-(),،.]/g, "") || null;
      // FIX(modian-import): پشتیبانی کد اقتصادی و کد مالیاتی — برای کاربرانی که
      // از هلو/سپیدار/محک می‌آیند و اطلاعات مودیان‌شان را هم می‌آورند
      const economicCode = toEnglishDigits(String(row.economicCode ?? "").trim()).replace(/[\s\-(),،.]/g, "") || null;
      const taxId = toEnglishDigits(String(row.taxId ?? "").trim()).replace(/[\s\-(),،.]/g, "") || null;

      // Task 2c — تکرار سطر هدر در فایل طرف‌حساب‌ها (نام == «نام مشتری» و ...)
      if (name && NAME_HEADER_NORMALIZED.has(normalizeHeaderKey(name))) {
        skipped++;
        skippedRows.push({ row: idx, message: "تکرار سطر هدر در فایل — وارد نشد" });
        continue;
      }

      if (!name) {
        // Task 2c — سطر مزاحم/خالی خالص (بدون هیچ مقدار معنی‌دار) → ردشده
        const rowValues = Object.values(row);
        const hasAnyMeaningful = rowValues.some((v) => {
          if (v === undefined || v === null) return false;
          const s = String(v).trim();
          if (!s) return false;
          return !/^[-=_*·.‾—ـ\s]+$/.test(s);
        });
        if (!hasAnyMeaningful) {
          skipped++;
          skippedRows.push({ row: idx, message: "سطر خالی/مزاحم — وارد نشد" });
        } else {
          errors.push({ row: idx, message: "نام طرف‌حساب الزامی است" });
        }
        continue;
      }

      // FIX(auto-code): اگر کد خالی بود، خودکار تولید کن
      if (!code) {
        autoCodeCounter++;
        code = `C-${autoStamp}-${autoRand}-${String(autoCodeCounter).padStart(4, "0")}`;
        while (seenCodes.has(code) || partyByCode.has(code)) {
          autoCodeCounter++;
          code = `C-${autoStamp}-${autoRand}-${String(autoCodeCounter).padStart(4, "0")}`;
        }
      }

      if (seenCodes.has(code)) {
        errors.push({ row: idx, message: `کد طرف‌حساب تکراری در همین فایل: ${code}` });
        continue;
      }
      seenCodes.add(code);

      // v20-E2 FIX(بایگ قبلی): `codeSet` تعریف‌نشده بود → ReferenceError در هر
      // ردیفِ بدون کد/با کدِ موجود (ایمپورت طرف‌حساب عملاً کور بود). کد تکراری
      // حالا طبق duplicateStrategy: skip (رد + skipped++) یا update (به‌روزرسانی فیلدها)
      const existingPartyId = partyByCode.get(code);
      if (existingPartyId) {
        if (strategy === "update") {
          const upd: Prisma.PartyUpdateInput = {};
          if (name) upd.name = name;
          if (cellFilled(row.type)) upd.type = type;
          if (phone) upd.phone = phone;
          if (mobile) upd.mobile = mobile;
          if (email) upd.email = email;
          if (address) upd.address = address;
          if (city) upd.city = city;
          if (province) upd.province = province;
          if (postalCode) upd.postalCode = postalCode;
          if (nationalId) {
            upd.nationalId = encryptField(nationalId);
            upd.nationalIdIndex = nationalIdBlindIndex(nationalId);
          }
          if (economicCode) upd.economicCode = economicCode;
          if (taxId) upd.taxId = taxId;
          if (creditLimitRaw !== null) upd.creditLimit = BigInt(Math.round(creditLimitRaw));
          if (openingBalanceRaw !== null) upd.openingBalance = BigInt(Math.round(openingBalanceRaw));
          if (Object.keys(upd).length > 0) {
            updates.push({ row: idx, partyId: existingPartyId, data: upd });
          } else {
            skipped++;
            skippedRows.push({ row: idx, message: `کد طرف‌حساب تکراری (بدون فیلد قابل به‌روزرسانی): ${code}` });
          }
        } else {
          skipped++;
          skippedRows.push({ row: idx, message: `کد طرف‌حساب تکراری: ${code}` });
        }
        continue;
      }
      partyByCode.set(code, `create:${code}`);

      creates.push({
        row: idx,
        data: {
          tenantId,
          code,
          name,
          type,
          phone,
          mobile,
          email,
          address,
          // v20-E2 FIX: شهر/استان/کد پستی قبلاً پارس می‌شد ولی در create نوشته
          // نمی‌شد (بی‌صدا دور ریخته می‌شد) — حالا ذخیره می‌شوند
          city,
          province,
          postalCode,
          nationalId: encryptField(nationalId),
          // FIX(3b-بیگ‌۸): ایندکس کور کد ملی — برای جستجوی واقعی (nationalId رمز است)
          nationalIdIndex: nationalIdBlindIndex(nationalId),
          economicCode,
          taxId,
          creditLimit: BigInt(Math.round(creditLimitRaw ?? 0)),
          openingBalance: BigInt(Math.round(openingBalanceRaw ?? 0)),
        },
      });
    } catch (err) {
      errors.push({
        row: idx,
        message: err instanceof Error ? err.message : "خطا در آماده‌سازی ردیف طرف‌حساب",
      });
    }
  }

  // ایجاد گروهی — تراکنش‌های ۲۰۰تایی با fallback سطری (dryRun: فقط شمارش)
  let created = 0;
  let updated = 0;
  const BATCH = 200;
  if (!dryRun) {
    for (let i = 0; i < creates.length; i += BATCH) {
      const batch = creates.slice(i, i + BATCH);
      try {
        await db.$transaction(async (tx) => {
          for (const item of batch) {
            await tx.party.create({ data: item.data });
          }
        });
        created += batch.length;
      } catch {
        for (const item of batch) {
          try {
            await db.party.create({ data: item.data });
            created++;
          } catch (err) {
            errors.push({
              row: item.row,
              message: err instanceof Error ? err.message : "خطا در ایجاد طرف‌حساب",
            });
          }
        }
      }
    }
    // v20-E2: به‌روزرسانی گروهی (استراتژی update روی کد تکراری)
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      try {
        await db.$transaction(async (tx) => {
          for (const u of batch) {
            await tx.party.update({ where: { id: u.partyId }, data: u.data });
          }
        });
        updated += batch.length;
      } catch {
        for (const u of batch) {
          try {
            await db.party.update({ where: { id: u.partyId }, data: u.data });
            updated++;
          } catch (err) {
            errors.push({
              row: u.row,
              message: err instanceof Error ? err.message : "خطا در به‌روزرسانی طرف‌حساب",
            });
          }
        }
      }
    }
  } else {
    created = creates.length;
    updated = updates.length;
  }

  // v20-E2 (dryRun): حالت اعتبارسنجی هیچ ردیفی در AuditLog ثبت نمی‌کند
  if (!dryRun) {
    await auditLog({
      tenantId,
      action: "BULK_IMPORT",
      entity: "Party",
      entityId: "bulk",
      changes: {
        count: created,
        updated,
        skipped,
        errors: errors.length,
        total: rows.length,
        strategy,
        fileName: fileName ?? null,
      },
      req,
    });
  }

  return { created, updated, skipped, errors, skippedRows };
}

async function importInvoices(
  rowsRaw: Record<string, unknown>[],
  tenantId: string,
  req: NextRequest,
  fileName?: string,
  /** v20-E2: حالت اعتبارسنجی (mode=validate) — بدون هیچ نوشتن در DB */
  dryRun = false
): Promise<{
  created: number;
  updated: number;
  skipped: number;
  errors: ImportError[];
  skippedRows: ImportError[];
}> {
  const errors: ImportError[] = [];
  const rows = rowsRaw.map(normalizeRowKeys);

  // FIX(3b-بیگ‌۵/۶): نرخ مالیات ارزش افزوده از SystemSettings (tax.vatRate —
  // درصد، پیش‌فرض ۱۰٪) — قبلاً ۰٫۰۹ hardcode بود (نرخ قانونی از ۱۴۰۴ = ۱۰٪).
  const vatRate = await getVatRateFraction();

  // v20-E2: پیش‌بارگذاری طرف‌حساب‌ها (کد + نام) و شماره فاکتورهای موجود —
  // الگوی importProducts (بدون findFirst سطر‌به‌سطر)
  const existingParties = await db.party.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  const partyByCode = new Map<string, string>(existingParties.map((p) => [p.code, p.id]));
  const partyByName = new Map<string, string>();
  for (const p of existingParties) {
    if (p.name && !partyByName.has(p.name)) partyByName.set(p.name, p.id);
  }
  const existingNumbers = new Set(
    (
      await db.invoice.findMany({
        where: { tenantId },
        select: { number: true },
      })
    ).map((i) => i.number)
  );

  // v20-E2: گروه‌بندی ردیف‌ها بر اساس شمارهٔ فاکتور — چند ردیف با شمارهٔ
  // مشترک = یک فاکتور چندقلمی (فرمت ردیفی هلو/سپیدار). ردیف‌های بدون شماره
  // خطای سطری می‌گیرند. ترتیب گروه‌ها = ترتیب اولین ظهور.
  interface GroupedRow {
    row: number;
    data: Record<string, unknown>;
  }
  const groups = new Map<string, GroupedRow[]>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const idx = i + 1;
    const number = String(row.number ?? "").trim();
    if (!number) {
      errors.push({ row: idx, message: "شماره فاکتور الزامی است" });
      continue;
    }
    const list = groups.get(number);
    if (list) list.push({ row: idx, data: row });
    else groups.set(number, [{ row: idx, data: row }]);
  }

  interface InvoiceCreateItem {
    row: number;
    data: Prisma.InvoiceUncheckedCreateInput;
  }
  const creates: InvoiceCreateItem[] = [];
  let created = 0;
  const migStamp = Date.now().toString(36).toUpperCase().slice(-6);
  let migCounter = 0;

  for (const [number, groupRows] of groups) {
    const firstIdx = groupRows[0].row;
    try {
      // فیلدهای سطح فاکتور = اولین مقدار غیرخالی در گروه (تکرار در هر ردیف مجاز است)
      const firstFilled = (key: string): unknown => {
        for (const g of groupRows) {
          const v = g.data[key];
          if (v !== undefined && v !== null && String(v).trim() !== "") return v;
        }
        return undefined;
      };
      const dateRaw = firstFilled("date");
      const partyCode = String(firstFilled("partyCode") ?? "").trim();
      const descriptionDoc = String(firstFilled("description") ?? "").trim() || null;
      const invoiceType = parseInvoiceType(firstFilled("type"));

      // ─── v20-E2: تشخیص فرمت اقلام ───
      //  ۱) فرمت legacy: رشتهٔ اقلام «شرح|تعداد|قیمت;...» (ستون items)
      //  ۲) فرمت ردیفی: هر ردیف یک قلم (productName/itemName + qty/تعداد +
      //     unitPrice/قیمت واحد) — با نگاشت صریح ستون‌ها یا هدرهای «تعداد»
      //     (stock) و «قیمت واحد» (salePrice) که normalizeRowKeys نگاشت می‌کند
      const hasItemsStr = groupRows.some((g) =>
        cellFilled(g.data.items) && String(g.data.items).includes("|")
      );
      const rowHasItemField = (g: GroupedRow) =>
        cellFilled(g.data.productName) ||
        cellFilled(g.data.itemName) ||
        cellFilled(g.data.qty) ||
        cellFilled(g.data.stock) ||
        cellFilled(g.data.unitPrice) ||
        cellFilled(g.data.salePrice);
      const hasItemFields = groupRows.some(rowHasItemField);

      type ParsedItem = { description: string; quantity: number; unitPrice: number };
      let items: ParsedItem[] = [];
      if (hasItemFields) {
        // فرمت ردیفی — هر ردیفِ دارای فیلد قلم = یک قلم فاکتور
        for (const g of groupRows) {
          const d = g.data;
          if (!rowHasItemField(g)) continue;
          const productName = String(d.productName ?? d.itemName ?? "").trim();
          const qtyRaw = d.qty !== undefined && cellFilled(d.qty) ? d.qty : d.stock;
          const priceRaw = d.unitPrice !== undefined && cellFilled(d.unitPrice) ? d.unitPrice : d.salePrice;
          items.push({
            description: productName || "—",
            quantity: toNumber(qtyRaw, 1),
            unitPrice: toNumber(priceRaw, 0),
          });
        }
      } else if (hasItemsStr) {
        // فرمت legacy — رشتهٔ اقلام اولین ردیف دارای ستون items
        const itemsRow = groupRows.find((g) => cellFilled(g.data.items) && String(g.data.items).includes("|"));
        items = parseItems(String(itemsRow?.data.items ?? ""));
      }

      if (items.length === 0) {
        errors.push({
          row: firstIdx,
          message: `اقلام فاکتور ${number} نامعتبر است — ستون اقلام (شرح|تعداد|قیمت) یا ستون‌های ردیفی (نام کالا/تعداد/قیمت واحد) را نگاشت کنید`,
        });
        continue;
      }

      // بررسی تکراری نبودن شماره فاکتور (DB) — قبل از ساخت طرف‌حساب تا
      // فاکتور رد‌شده، طرف‌حساب یتیم نسازد
      if (existingNumbers.has(number)) {
        errors.push({ row: firstIdx, message: `شماره فاکتور تکراری: ${number}` });
        continue;
      }
      existingNumbers.add(number);

      // طرف‌حساب: کد → نام → ساخت خودکار (فقط وقتی نام صریح داریم)
      // در فرمت ردیفی نام مشتری فقط از partyName صریح می‌آید (row.name ممکن
      // است به «نام کالا» نگاشت شده باشد)
      const partyNameRaw = hasItemFields ? String(firstFilled("partyName") ?? "") : String(firstFilled("partyName") ?? firstFilled("name") ?? "");
      const partyName = partyNameRaw.trim();
      if (!partyCode && !partyName) {
        errors.push({
          row: firstIdx,
          message: `مشتری فاکتور ${number} الزامی است (کد یا نام طرف‌حساب)`,
        });
        continue;
      }
      let partyId: string | null = partyCode ? partyByCode.get(partyCode) ?? null : null;
      if (!partyId && partyName) partyId = partyByName.get(partyName) ?? null;
      if (!partyId && partyName && !dryRun) {
        // اگر پیدا نشد ولی نام داشتیم → ساخت خودکار طرف‌حساب با کد یکتا (MIG)
        migCounter++;
        const autoCode = `MIG-${migStamp}-${String(migCounter).padStart(3, "0")}`;
        const newParty = await db.party.create({
          data: {
            tenantId,
            code: autoCode,
            name: partyName,
            type: "CUSTOMER",
            creditLimit: BigInt(0),
            openingBalance: BigInt(0),
          },
        });
        partyId = newParty.id;
        partyByName.set(partyName, newParty.id);
        partyByCode.set(autoCode, newParty.id);
      } else if (!partyId && partyName && dryRun) {
        // حالت اعتبارسنجی — شناسهٔ موقت، بدون نوشتن
        partyId = `dry-party:${partyName}`;
      }
      if (!partyId) {
        errors.push({ row: firstIdx, message: `طرف‌حساب با کد ${partyCode} یافت نشد` });
        continue;
      }

      // محاسبه مبالغ — با نرخ مالیاتِ تنظیمات (نه ۹٪ hardcode)
      let subtotal = 0;
      let tax = 0;
      const processedItems = items.map((it) => {
        const lineTotal = it.quantity * it.unitPrice;
        const lineTax = lineTotal * vatRate;
        subtotal += lineTotal;
        tax += lineTax;
        return {
          description: it.description,
          quantity: it.quantity,
          unitPrice: BigInt(Math.round(it.unitPrice)),
          discount: 0,
          taxRate: vatRate,
          taxAmount: BigInt(Math.round(lineTax)),
          total: BigInt(Math.round(lineTotal + lineTax)),
        };
      });

      const totalInput = toNumber(firstFilled("total"), 0);
      const totalCalc = subtotal + tax;
      // استفاده از مبلغ ورودی یا مبلغ محاسبه‌شده
      const finalTotal = totalInput > 0 ? totalInput : totalCalc;

      creates.push({
        row: firstIdx,
        data: {
          tenantId,
          number,
          type: invoiceType,
          partyId,
          date: normalizeDate(dateRaw),
          subtotal: BigInt(Math.round(subtotal)),
          tax: BigInt(Math.round(tax)),
          total: BigInt(Math.round(finalTotal)),
          status: "DRAFT",
          modianStatus: "PENDING",
          currency: "IRR",
          exchangeRate: 1,
          ...(descriptionDoc ? { description: descriptionDoc } : {}),
          items: { create: processedItems },
        },
      });
    } catch (err) {
      errors.push({
        row: firstIdx,
        message: err instanceof Error ? err.message : "خطا در ایجاد فاکتور",
      });
    }
  }

  // ایجاد گروهی — تراکنش‌های ۲۰۰تایی با fallback سطری (dryRun: فقط شمارش)
  const BATCH = 200;
  if (dryRun) {
    created = creates.length;
  } else {
    for (let i = 0; i < creates.length; i += BATCH) {
      const batch = creates.slice(i, i + BATCH);
      try {
        await db.$transaction(async (tx) => {
          for (const item of batch) {
            await tx.invoice.create({ data: item.data });
          }
        });
        created += batch.length;
      } catch {
        for (const item of batch) {
          try {
            await db.invoice.create({ data: item.data });
            created++;
          } catch (err) {
            errors.push({
              row: item.row,
              message: err instanceof Error ? err.message : "خطا در ایجاد فاکتور",
            });
          }
        }
      }
    }
  }

  // v20-E2 (dryRun): حالت اعتبارسنجی هیچ ردیفی در AuditLog ثبت نمی‌کند
  if (!dryRun) {
    await auditLog({
      tenantId,
      action: "BULK_IMPORT",
      entity: "Invoice",
      entityId: "bulk",
      changes: {
        count: created,
        updated: 0,
        skipped: 0,
        errors: errors.length,
        total: rows.length,
        fileName: fileName ?? null,
      },
      req,
    });
  }

  return { created, updated: 0, skipped: 0, errors, skippedRows: [] };
}

/* ============================================================
 * v20-E2 — importAccounts: درون‌ریزی کدینگ حساب‌ها
 * ============================================================
 * هر ردیف فایل → یک رکورد Account (code یکتا در tenant — کلید ارجاع اسناد):
 *  - code* / name* (الزامی) — «کد حساب» هدر بدون نگاشت هم به code نگاشت می‌شود
 *  - group: نام یا کد گروه حساب — نبود → گروه استاندارد از رقم اول کد
 *    (۱ دارایی‌ها / ۲ بدهی‌ها / ۳ سرمایه / ۴ درآمدها / ۵ هزینه‌ها — الگوی seed)
 *    وگرنه «سایر حساب‌ها» (code 9 — الگوی API اسناد حسابداری)
 *  - nature: بدهکار/بستانکار/دوطرفه → DEBIT/CREDIT (مدل فقط دو مقدار دارد)
 *  - level + parentCode: والدِ «کل» → معین؛ والدِ پایین‌تر → تفصیلی؛
 *    تفصیلی → balanceType=DETAIL (Account ستون level/parent ندارد — سطح در
 *    balanceType و ارث‌بری گروه ترمین می‌شود)
 *  - balance / description: پارس می‌شوند ولی ذخیره نمی‌شوند (ستون متناظر در
 *    مدل Account وجود ندارد)
 * والدِ دیرتر از فرزند در فایل → ردیف با گروه استاندارد/سطح اعلامی خودش
 * ثبت می‌شود (بدون خطا). تکرار کد → استراتژی skip/update.
 * ============================================================ */

// گروه‌های استاندارد کدینگ ایرانی — الگوی app/api/accounting/seed
const ACCOUNT_STANDARD_GROUPS: Array<{
  code: string;
  name: string;
  type: string;
  nature: string;
  order: number;
}> = [
  { code: "1", name: "دارایی‌ها", type: "BALANCE_SHEET", nature: "DEBIT", order: 1 },
  { code: "2", name: "بدهی‌ها", type: "BALANCE_SHEET", nature: "CREDIT", order: 2 },
  { code: "3", name: "سرمایه", type: "BALANCE_SHEET", nature: "CREDIT", order: 3 },
  { code: "4", name: "درآمدها", type: "PROFIT_LOSS", nature: "CREDIT", order: 4 },
  { code: "5", name: "هزینه‌ها", type: "PROFIT_LOSS", nature: "DEBIT", order: 5 },
];
// گروه پیش‌فرض حساب‌های بدون گروه/رقم شناخته‌شده — الگوی journal-entries API
const ACCOUNT_DEFAULT_GROUP = { code: "9", name: "سایر حساب‌ها", type: "BALANCE_SHEET", nature: "DEBIT", order: 9 };

async function importAccounts(
  rowsRaw: Record<string, unknown>[],
  tenantId: string,
  req: NextRequest,
  fileName?: string,
  strategy: DuplicateStrategy = "skip",
  dryRun = false
): Promise<ImporterResult> {
  const errors: ImportError[] = [];
  const skippedRows: ImportError[] = [];
  let skipped = 0;
  const rows = rowsRaw.map(normalizeRowKeys);

  // سال مالی جاری tenant تضمین می‌شود (حساب‌ها FK سال ندارند اما ماژول
  // حسابداری پس از ایمپورت کدینگ به آن وابسته است) — در dryRun فقط خواندن
  await ensureFiscalYear(tenantId, dryRun);

  // پیش‌بارگذاری گروه‌ها و حساب‌های موجود (الگوی importProducts)
  const existingGroups = await db.accountGroup.findMany({
    where: { tenantId },
    select: { id: true, code: true, name: true },
  });
  const groupByCode = new Map<string, string>(existingGroups.map((g) => [g.code, g.id]));
  const groupByName = new Map<string, string>();
  for (const g of existingGroups) {
    const nk = normalizeHeaderKey(g.name || "");
    if (nk && !groupByName.has(nk)) groupByName.set(nk, g.id);
  }
  const existingAccounts = await db.account.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, code: true, groupId: true },
  });
  const accountByCode = new Map<string, { id: string; groupId: string }>(
    existingAccounts.map((a) => [a.code, { id: a.id, groupId: a.groupId }])
  );
  // حساب‌های در انتظار ایجاد در همین فایل (برای ارجاع parentCode زودتر از والد)
  const pendingAccounts = new Map<string, { groupId: string; level: "کل" | "معین" | "تفصیلی" }>();

  // ساخت/یافتن گروه با کش — dryRun فقط شناسهٔ موقت می‌دهد
  const resolveGroup = async (
    groupKey: string,
    groupName: string,
    nature: string
  ): Promise<string | null> => {
    const byCode = groupByCode.get(groupKey);
    if (byCode) return byCode;
    const byName = groupByName.get(normalizeHeaderKey(groupName));
    if (byName) return byName;
    if (dryRun) {
      const dryId = `dry-grp:${groupKey}`;
      groupByCode.set(groupKey, dryId);
      return dryId;
    }
    try {
      const created = await db.accountGroup.create({
        data: {
          tenantId,
          code: groupKey.slice(0, 20),
          name: groupName.slice(0, 100),
          type: "BALANCE_SHEET",
          nature,
          order: 0,
        },
      });
      groupByCode.set(created.code, created.id);
      const nk = normalizeHeaderKey(created.name);
      if (nk && !groupByName.has(nk)) groupByName.set(nk, created.id);
      return created.id;
    } catch {
      return null;
    }
  };

  interface AccountCreateItem {
    row: number;
    code: string;
    name: string;
    nature: string;
    balanceType: string;
    groupId: string;
  }
  const creates: AccountCreateItem[] = [];
  const updates: Array<{
    row: number;
    accountId: string;
    data: { name?: string; nature?: string; balanceType?: string };
  }> = [];
  const seenCodes = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const idx = i + 1;
    try {
      const code = String(row.code ?? row.accountCode ?? "").trim();
      const name = String(row.name ?? "").trim();
      const nature = parseAccountNature(row.nature);
      const explicitLevel = parseAccountLevel(row.level);
      const groupRaw = String(row.group ?? row.category ?? "").trim();
      const parentCode = String(row.parentCode ?? "").trim();
      // balance پارس می‌شود (ارقام فارسی/جداکننده) اما Account ستون مانده ندارد
      const balance = cellFilled(row.balance) ? toNumber(row.balance, 0) : null;
      void balance;

      // تکرار سطر هدر در وسط فایل → ردشده
      if (name && NAME_HEADER_NORMALIZED.has(normalizeHeaderKey(name))) {
        skipped++;
        skippedRows.push({ row: idx, message: "تکرار سطر هدر در فایل — وارد نشد" });
        continue;
      }
      if (!name) {
        const rowValues = Object.values(row);
        const hasAnyMeaningful = rowValues.some((v) => {
          if (v === undefined || v === null) return false;
          const s = String(v).trim();
          if (!s) return false;
          return !/^[-=_*·.‾—ـ\s]+$/.test(s);
        });
        if (!hasAnyMeaningful) {
          skipped++;
          skippedRows.push({ row: idx, message: "سطر خالی/مزاحم — وارد نشد" });
        } else {
          errors.push({ row: idx, message: "نام حساب الزامی است" });
        }
        continue;
      }
      if (!code) {
        errors.push({ row: idx, message: "کد حساب الزامی است — کلید ارجاع اسناد حسابداری" });
        continue;
      }
      if (seenCodes.has(code)) {
        errors.push({ row: idx, message: `کد حساب تکراری در همین فایل: ${code}` });
        continue;
      }
      seenCodes.add(code);

      // ─── تعیین سطح و گروه ───
      let level = explicitLevel;
      let groupId: string | null = null;
      if (parentCode) {
        const dbParent = accountByCode.get(parentCode);
        const pendingParent = pendingAccounts.get(parentCode);
        if (dbParent) {
          // والدِ موجود در DB — سطح دقیق نامشخص → فرض کل ⇒ فرزند معین
          level = level ?? "معین";
          groupId = dbParent.groupId;
        } else if (pendingParent) {
          level = pendingParent.level === "کل" ? "معین" : "تفصیلی";
          groupId = pendingParent.groupId;
        }
        // والدِ نیافت‌شده → سطح اعلامی خود ردیف (یا کل) + گروه استاندارد
      }
      if (!level) level = "کل";
      const balanceType = level === "تفصیلی" ? "DETAIL" : "GENERAL";

      if (groupRaw) {
        const resolved = await resolveGroup(groupRaw, groupRaw, nature);
        if (!resolved) {
          errors.push({ row: idx, message: `گروه حساب ساخته نشد: ${groupRaw}` });
          continue;
        }
        groupId = resolved;
      }
      if (!groupId) {
        // گروه استاندارد از رقم اول کد (کدینگ سازمان حسابرسی) یا «سایر حساب‌ها»
        const first = code[0];
        const std = first && /[1-5]/.test(first)
          ? ACCOUNT_STANDARD_GROUPS[Number(first) - 1]
          : ACCOUNT_DEFAULT_GROUP;
        const resolved = await resolveGroup(std.code, std.name, std.nature);
        if (!resolved) {
          errors.push({ row: idx, message: `گروه حساب ساخته نشد: ${std.name}` });
          continue;
        }
        groupId = resolved;
      }

      // ─── تکراری (DB) → استراتژی ───
      const existing = accountByCode.get(code);
      if (existing) {
        if (strategy === "update") {
          const upd: { name?: string; nature?: string; balanceType?: string } = {};
          if (name) upd.name = name;
          if (cellFilled(row.nature)) upd.nature = nature;
          if (explicitLevel) upd.balanceType = balanceType;
          if (Object.keys(upd).length > 0) {
            updates.push({ row: idx, accountId: existing.id, data: upd });
          } else {
            skipped++;
            skippedRows.push({ row: idx, message: `کد حساب تکراری (بدون فیلد قابل به‌روزرسانی): ${code}` });
          }
        } else {
          skipped++;
          skippedRows.push({ row: idx, message: `کد حساب تکراری: ${code}` });
        }
        continue;
      }

      creates.push({ row: idx, code, name, nature, balanceType, groupId });
      pendingAccounts.set(code, { groupId, level });
    } catch (err) {
      errors.push({
        row: idx,
        message: err instanceof Error ? err.message : "خطا در آماده‌سازی ردیف حساب",
      });
    }
  }

  // ایجاد گروهی — تراکنش‌های ۲۰۰تایی با fallback سطری (dryRun: فقط شمارش)
  let created = 0;
  let updated = 0;
  const BATCH = 200;
  if (dryRun) {
    created = creates.length;
    updated = updates.length;
  } else {
    for (let i = 0; i < creates.length; i += BATCH) {
      const batch = creates.slice(i, i + BATCH);
      try {
        await db.$transaction(async (tx) => {
          for (const item of batch) {
            await tx.account.create({
              data: {
                tenantId,
                code: item.code,
                name: item.name,
                groupId: item.groupId,
                nature: item.nature,
                balanceType: item.balanceType,
              },
            });
          }
        });
        created += batch.length;
      } catch {
        for (const item of batch) {
          try {
            await db.account.create({
              data: {
                tenantId,
                code: item.code,
                name: item.name,
                groupId: item.groupId,
                nature: item.nature,
                balanceType: item.balanceType,
              },
            });
            created++;
          } catch (err) {
            errors.push({
              row: item.row,
              message: err instanceof Error ? err.message : "خطا در ایجاد حساب",
            });
          }
        }
      }
    }
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      try {
        await db.$transaction(async (tx) => {
          for (const u of batch) {
            await tx.account.update({ where: { id: u.accountId }, data: u.data });
          }
        });
        updated += batch.length;
      } catch {
        for (const u of batch) {
          try {
            await db.account.update({ where: { id: u.accountId }, data: u.data });
            updated++;
          } catch (err) {
            errors.push({
              row: u.row,
              message: err instanceof Error ? err.message : "خطا در به‌روزرسانی حساب",
            });
          }
        }
      }
    }
  }

  if (!dryRun) {
    await auditLog({
      tenantId,
      action: "BULK_IMPORT",
      entity: "Account",
      entityId: "bulk",
      changes: {
        count: created,
        updated,
        skipped,
        errors: errors.length,
        total: rows.length,
        strategy,
        fileName: fileName ?? null,
      },
      req,
    });
  }

  return { created, updated, skipped, errors, skippedRows };
}

/* ============================================================
 * v20-E2 — importJournalEntries: درون‌ریزی اسناد حسابداری
 * ============================================================
 * ردیف‌های هم‌شماره (docNumber) → یک سند با چند ردیف (ترتیب فایل حفظ می‌شود):
 *  - docNumber*: شماره سند (Int یکتا در tenant) — «شماره سند» بدون نگاشت هم
 *    به number می‌رسد؛ غیرعددی/نامعتبر → شمارهٔ خودکار max+1
 *  - type: سند حسابداری/عادی → JOURNAL، رسید → RECEIPT، پرداخت → PAYMENT
 *  - date: پارسر جلالی موجود (normalizeDate)
 *  - accountCode*: کد حساب → Account (باید موجود باشد — از همین ایمپورت یا قبل)
 *  - debit/credit: ریال خام؛ ردیفِ هر دو صفر → قلم نمی‌شود
 *  - تراز: |Σبدهکار − Σبستانکار| < 1 وگرنه «سند {n} تراز نیست» و سند رد
 *  - حساب نیافت‌شده → «حساب {code} یافت نشد» + سند ساخته نمی‌شود
 *  - status=DRAFT (اسناد درون‌ریزی تا بازبینی) + سال مالی جاری
 * ============================================================ */
async function importJournalEntries(
  rowsRaw: Record<string, unknown>[],
  tenantId: string,
  req: NextRequest,
  fileName?: string,
  dryRun = false
): Promise<ImporterResult> {
  const errors: ImportError[] = [];
  const skippedRows: ImportError[] = [];
  let skipped = 0;
  const rows = rowsRaw.map(normalizeRowKeys);

  // پیش‌بارگذاری حساب‌ها (کد → شناسه) — بدون ساخت خودکار (اسناد باید به کدینگ
  // موجود وصل شوند؛ ایمپورت حساب‌ها جداگانه انجام می‌شود)
  const existingAccounts = await db.account.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, code: true },
  });
  const accountByCode = new Map<string, string>(existingAccounts.map((a) => [a.code, a.id]));

  // شماره‌های موجود (Int یکتا در tenant) + بیشینه برای شمارهٔ خودکار
  const existingEntries = await db.journalEntry.findMany({
    where: { tenantId },
    select: { number: true },
  });
  const existingNumbers = new Set<number>(existingEntries.map((e) => e.number));
  let nextAutoNumber = existingEntries.reduce((m, e) => Math.max(m, e.number), 0);

  const fiscalYearId = await ensureFiscalYear(tenantId, dryRun);

  // ─── گروه‌بندی ردیف‌ها بر اساس شمارهٔ سند (ترتیب اولین ظهور) ───
  interface JournalRow {
    row: number;
    data: Record<string, unknown>;
  }
  const groups = new Map<string, JournalRow[]>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const idx = i + 1;
    const docNumberRaw = String(row.docNumber ?? row.number ?? "").trim();
    if (!docNumberRaw) {
      errors.push({ row: idx, message: "شماره سند الزامی است" });
      continue;
    }
    const list = groups.get(docNumberRaw);
    if (list) list.push({ row: idx, data: row });
    else groups.set(docNumberRaw, [{ row: idx, data: row }]);
  }

  interface EntryCreateItem {
    row: number;
    data: Prisma.JournalEntryUncheckedCreateInput;
  }
  const creates: EntryCreateItem[] = [];

  for (const [docNumber, groupRows] of groups) {
    const firstIdx = groupRows[0].row;
    let docInvalid = false;
    let sumDebit = 0;
    let sumCredit = 0;
    const lines: Array<{
      accountId: string;
      debit: bigint;
      credit: bigint;
      description: string | null;
    }> = [];
    let entryType: string | null = null;
    let entryDate: Date | null = null;
    let docDescription: string | null = null;
    let lineDescription: string | null = null;

    for (const g of groupRows) {
      const d = g.data;
      const accountCode = String(d.accountCode ?? d.code ?? "").trim();
      if (!accountCode) {
        errors.push({ row: g.row, message: "کد حساب الزامی است" });
        docInvalid = true;
        continue;
      }
      const accountId = accountByCode.get(accountCode);
      if (!accountId) {
        errors.push({ row: g.row, message: `حساب ${accountCode} یافت نشد` });
        docInvalid = true;
        continue;
      }
      const debit = cellFilled(d.debit) ? toNumber(d.debit, 0) : 0;
      const credit = cellFilled(d.credit) ? toNumber(d.credit, 0) : 0;
      if (debit < 0 || credit < 0) {
        errors.push({ row: g.row, message: "مبلغ بدهکار/بستانکار نمی‌تواند منفی باشد" });
        docInvalid = true;
        continue;
      }
      // ردیف هر دو صفر → قلم ثبت نمی‌شود (ردیف خالی رایج در خروجی نرم‌افزارها)
      if (debit === 0 && credit === 0) continue;

      const rowDesc = String(d.description ?? "").trim() || null;
      if (rowDesc && !lineDescription) lineDescription = rowDesc;
      const rowDocDesc = String(d.docDescription ?? "").trim() || null;
      if (rowDocDesc && !docDescription) docDescription = rowDocDesc;
      const rowType = String(d.type ?? "").trim();
      if (rowType && !entryType) entryType = parseJournalType(rowType);
      if (!entryDate && cellFilled(d.date)) entryDate = normalizeDate(d.date);

      sumDebit += debit;
      sumCredit += credit;
      lines.push({
        accountId,
        debit: BigInt(Math.round(debit)),
        credit: BigInt(Math.round(credit)),
        description: rowDesc,
      });
    }

    if (docInvalid) continue; // خطای ردیف → سند ساخته نمی‌شود
    if (lines.length === 0) {
      errors.push({ row: firstIdx, message: `سند ${docNumber} ردیف معتبر ندارد` });
      continue;
    }
    // تراز بودن سند (اختلاف < ۱ ریال)
    if (Math.abs(sumDebit - sumCredit) >= 1) {
      errors.push({
        row: firstIdx,
        message: `سند ${docNumber} تراز نیست (اختلاف ${Math.abs(sumDebit - sumCredit).toLocaleString("fa-IR")} ریال)`,
      });
      continue;
    }

    // شمارهٔ سند: عدد صحیح مثبت؛ غیرعددی/تکراری → خودکار (بدون مصرف توالی سند)
    const numParsed = Number(toEnglishDigits(docNumber).replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))));
    let entryNumber: number;
    if (Number.isInteger(numParsed) && numParsed > 0 && numParsed <= 2147483647) {
      entryNumber = numParsed;
      if (existingNumbers.has(entryNumber)) {
        skipped++;
        skippedRows.push({ row: firstIdx, message: `شماره سند تکراری: ${entryNumber}` });
        continue;
      }
    } else {
      do {
        nextAutoNumber++;
      } while (existingNumbers.has(nextAutoNumber));
      entryNumber = nextAutoNumber;
    }
    existingNumbers.add(entryNumber);

    creates.push({
      row: firstIdx,
      data: {
        tenantId,
        number: entryNumber,
        date: entryDate ?? new Date(),
        type: entryType ?? "JOURNAL",
        description: docDescription ?? lineDescription ?? `سند درون‌ریزی ${docNumber}`,
        status: "DRAFT",
        fiscalYearId,
        lines: {
          create: lines.map((l) => ({
            tenantId,
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            description: l.description,
          })),
        },
      },
    });
  }

  // ایجاد گروهی — تراکنش‌های ۲۰۰تایی با fallback سطری (dryRun: فقط شمارش)
  let created = 0;
  const BATCH = 200;
  if (dryRun) {
    created = creates.length;
  } else {
    for (let i = 0; i < creates.length; i += BATCH) {
      const batch = creates.slice(i, i + BATCH);
      try {
        await db.$transaction(async (tx) => {
          for (const item of batch) {
            await tx.journalEntry.create({ data: item.data });
          }
        });
        created += batch.length;
      } catch {
        for (const item of batch) {
          try {
            await db.journalEntry.create({ data: item.data });
            created++;
          } catch (err) {
            errors.push({
              row: item.row,
              message: err instanceof Error ? err.message : "خطا در ایجاد سند",
            });
          }
        }
      }
    }
  }

  if (!dryRun) {
    await auditLog({
      tenantId,
      action: "BULK_IMPORT",
      entity: "JournalEntry",
      entityId: "bulk",
      changes: {
        count: created,
        updated: 0,
        skipped,
        errors: errors.length,
        total: rows.length,
        fileName: fileName ?? null,
      },
      req,
    });
  }

  return { created, updated: 0, skipped, errors, skippedRows };
}

/* ============================================================
 * v20-E2 — importChecks: درون‌ریزی چک‌ها
 * ============================================================
 *  - number* / amount* (ریال خام — مبلغ صفر/منفی → خطای ردیف)
 *  - type: دریافتنی → RECEIVED، پرداختنی → ISSUED (پیش‌فرض RECEIVED)
 *  - partyName: طرف‌حساب با نام دقیق؛ نبود → Party حداقلی ساخته می‌شود
 *    (type از نوع چک: ISSUED → SUPPLIER، RECEIVED → CUSTOMER)
 *  - dueDate (پیش‌فرض امروز)، issueDate (یا تاریخ صدور/تاریخ)، bankName
 *    (الزامی در اسکیما — خالی → «نامشخص»)، branch/sayadId/description
 *  - status: REGISTERED (پیش‌فرض اسکیما)، تکرار شماره → استراتژی skip/update
 * ============================================================ */
async function importChecks(
  rowsRaw: Record<string, unknown>[],
  tenantId: string,
  req: NextRequest,
  fileName?: string,
  strategy: DuplicateStrategy = "skip",
  dryRun = false
): Promise<ImporterResult> {
  const errors: ImportError[] = [];
  const skippedRows: ImportError[] = [];
  let skipped = 0;
  const rows = rowsRaw.map(normalizeRowKeys);

  // پیش‌بارگذاری چک‌ها (شماره) و طرف‌حساب‌ها (نام)
  const existingChecks = await db.check.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, number: true },
  });
  const checkByNumber = new Map<string, string>(existingChecks.map((c) => [c.number, c.id]));
  const existingParties = await db.party.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, name: true },
  });
  const partyByName = new Map<string, string>();
  for (const p of existingParties) {
    if (p.name && !partyByName.has(p.name)) partyByName.set(p.name, p.id);
  }

  let autoCodeCounter = 0;
  const autoStamp = Date.now().toString(36).toUpperCase().slice(-4);
  const autoRand = Math.random().toString(36).toUpperCase().slice(2, 5);

  interface CheckCreateItem {
    row: number;
    data: Prisma.CheckUncheckedCreateInput;
  }
  const creates: CheckCreateItem[] = [];
  const updates: Array<{
    row: number;
    checkId: string;
    data: Prisma.CheckUpdateInput;
  }> = [];
  const seenNumbers = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const idx = i + 1;
    try {
      const number = String(row.number ?? "").trim();
      const partyName = String(row.partyName ?? row.name ?? "").trim();
      const checkType = parseCheckType(row.type);
      const amount = cellFilled(row.amount ?? row.total) ? toNumber(row.amount ?? row.total, 0) : 0;
      const bankName = String(row.bankName ?? "").trim() || "نامشخص";
      const branch = String(row.branch ?? "").trim() || null;
      const sayadId = toEnglishDigits(String(row.sayadId ?? "").trim()) || null;
      const description = String(row.description ?? "").trim() || null;
      const dueDate = normalizeDate(row.dueDate);
      const issueDate = cellFilled(row.issueDate)
        ? normalizeDate(row.issueDate)
        : cellFilled(row.date)
          ? normalizeDate(row.date)
          : new Date();

      // تکرار سطر هدر در وسط فایل → ردشده
      if (partyName && NAME_HEADER_NORMALIZED.has(normalizeHeaderKey(partyName))) {
        skipped++;
        skippedRows.push({ row: idx, message: "تکرار سطر هدر در فایل — وارد نشد" });
        continue;
      }
      if (!number) {
        errors.push({ row: idx, message: "شماره چک الزامی است" });
        continue;
      }
      if (amount <= 0) {
        errors.push({ row: idx, message: "مبلغ چک نامعتبر است" });
        continue;
      }
      if (seenNumbers.has(number)) {
        errors.push({ row: idx, message: `شماره چک تکراری در همین فایل: ${number}` });
        continue;
      }
      seenNumbers.add(number);

      // طرف‌حساب: نام دقیق → ساخت حداقلی (type از نوع چک)
      let partyId: string | null = partyName ? partyByName.get(partyName) ?? null : null;
      if (!partyId && partyName) {
        if (dryRun) {
          partyId = `dry-party:${partyName}`;
        } else {
          autoCodeCounter++;
          const autoCode = `CHK-${autoStamp}-${autoRand}-${String(autoCodeCounter).padStart(4, "0")}`;
          const newParty = await db.party.create({
            data: {
              tenantId,
              code: autoCode,
              name: partyName,
              type: checkType === "ISSUED" ? "SUPPLIER" : "CUSTOMER",
              creditLimit: BigInt(0),
              openingBalance: BigInt(0),
            },
          });
          partyId = newParty.id;
          partyByName.set(partyName, newParty.id);
        }
      }

      const checkData = {
        tenantId,
        number,
        type: checkType,
        sayadId,
        amount: BigInt(Math.round(amount)),
        issueDate,
        dueDate,
        bankName,
        branch,
        description,
        ...(partyId ? { partyId } : {}),
      };

      // تکراری (DB) → استراتژی
      const existingId = checkByNumber.get(number);
      if (existingId) {
        if (strategy === "update") {
          const upd: Prisma.CheckUpdateInput = {
            type: checkType,
            amount: BigInt(Math.round(amount)),
            issueDate,
            dueDate,
            bankName,
            ...(branch !== null ? { branch } : {}),
            ...(sayadId !== null ? { sayadId } : {}),
            ...(description !== null ? { description } : {}),
            ...(partyId ? { party: { connect: { id: partyId } } } : {}),
          };
          updates.push({ row: idx, checkId: existingId, data: upd });
        } else {
          skipped++;
          skippedRows.push({ row: idx, message: `شماره چک تکراری: ${number}` });
        }
        continue;
      }
      checkByNumber.set(number, `create:${number}`);

      creates.push({ row: idx, data: checkData });
    } catch (err) {
      errors.push({
        row: idx,
        message: err instanceof Error ? err.message : "خطا در آماده‌سازی ردیف چک",
      });
    }
  }

  // ایجاد گروهی — تراکنش‌های ۲۰۰تایی با fallback سطری (dryRun: فقط شمارش)
  let created = 0;
  let updated = 0;
  const BATCH = 200;
  if (dryRun) {
    created = creates.length;
    updated = updates.length;
  } else {
    for (let i = 0; i < creates.length; i += BATCH) {
      const batch = creates.slice(i, i + BATCH);
      try {
        await db.$transaction(async (tx) => {
          for (const item of batch) {
            await tx.check.create({ data: item.data });
          }
        });
        created += batch.length;
      } catch {
        for (const item of batch) {
          try {
            await db.check.create({ data: item.data });
            created++;
          } catch (err) {
            errors.push({
              row: item.row,
              message: err instanceof Error ? err.message : "خطا در ایجاد چک",
            });
          }
        }
      }
    }
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      try {
        await db.$transaction(async (tx) => {
          for (const u of batch) {
            await tx.check.update({ where: { id: u.checkId }, data: u.data });
          }
        });
        updated += batch.length;
      } catch {
        for (const u of batch) {
          try {
            await db.check.update({ where: { id: u.checkId }, data: u.data });
            updated++;
          } catch (err) {
            errors.push({
              row: u.row,
              message: err instanceof Error ? err.message : "خطا در به‌روزرسانی چک",
            });
          }
        }
      }
    }
  }

  if (!dryRun) {
    await auditLog({
      tenantId,
      action: "BULK_IMPORT",
      entity: "Check",
      entityId: "bulk",
      changes: {
        count: created,
        updated,
        skipped,
        errors: errors.length,
        total: rows.length,
        strategy,
        fileName: fileName ?? null,
      },
      req,
    });
  }

  return { created, updated, skipped, errors, skippedRows };
}

/* ============================================================
 * v20-E2 — importEmployees: درون‌ریزی کارکنان
 * ============================================================
 *  - fullName* → firstName + lastName (تفکیک فاصله؛ تک‌واژه → نام خانوادگی خالی)
 *  - nationalId: ارقام نرمال؛ ۱۰رقمی + کنترل‌رقم mod-11 (کپی POST /api/employees
 *    — ذخیرهٔ plain، بدون رمزنگاری)؛ خالی → رشتهٔ خالی (ستون required اسکیما)
 *  - personnelCode: یکتا در tenant؛ خالی → تولید خودکار EMP-…؛ تکرار → skip/update
 *  - baseSalary (ریال خام)، hireDate (پارسر جلالی)، contractType
 *    (رسمی/آزمایشی/پیمانی-موقت)، department، position
 *  - mobile/accountNumber/description: پارس می‌شوند ولی ذخیره نمی‌شوند
 *    (مدل Employee ستون متناظر ندارد — insuranceCode/taxCode معادل معنایی نیستند)
 * ============================================================ */
async function importEmployees(
  rowsRaw: Record<string, unknown>[],
  tenantId: string,
  req: NextRequest,
  fileName?: string,
  strategy: DuplicateStrategy = "skip",
  dryRun = false
): Promise<ImporterResult> {
  const errors: ImportError[] = [];
  const skippedRows: ImportError[] = [];
  let skipped = 0;
  const rows = rowsRaw.map(normalizeRowKeys);

  const existingEmployees = await db.employee.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, personnelCode: true },
  });
  const employeeByCode = new Map<string, string>(
    existingEmployees.map((e) => [e.personnelCode, e.id])
  );

  let autoCodeCounter = 0;
  const autoStamp = Date.now().toString(36).toUpperCase().slice(-4);
  const autoRand = Math.random().toString(36).toUpperCase().slice(2, 5);

  interface EmployeeCreateItem {
    row: number;
    data: Prisma.EmployeeUncheckedCreateInput;
  }
  const creates: EmployeeCreateItem[] = [];
  const updates: Array<{
    row: number;
    employeeId: string;
    data: Prisma.EmployeeUpdateInput;
  }> = [];
  const seenCodes = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const idx = i + 1;
    try {
      const fullName = String(row.fullName ?? row.name ?? "").trim();
      // فیلدهای بدون ستون در اسکیما — پارس برای اعتبارسنجی؛ ذخیره نمی‌شوند
      const mobileUnused = String(row.mobile ?? "").trim();
      const accountNumberUnused = String(row.accountNumber ?? "").trim();
      const descriptionUnused = String(row.description ?? "").trim();
      void mobileUnused;
      void accountNumberUnused;
      void descriptionUnused;

      // تکرار سطر هدر در وسط فایل → ردشده
      if (fullName && NAME_HEADER_NORMALIZED.has(normalizeHeaderKey(fullName))) {
        skipped++;
        skippedRows.push({ row: idx, message: "تکرار سطر هدر در فایل — وارد نشد" });
        continue;
      }
      if (!fullName) {
        const rowValues = Object.values(row);
        const hasAnyMeaningful = rowValues.some((v) => {
          if (v === undefined || v === null) return false;
          const s = String(v).trim();
          if (!s) return false;
          return !/^[-=_*·.‾—ـ\s]+$/.test(s);
        });
        if (!hasAnyMeaningful) {
          skipped++;
          skippedRows.push({ row: idx, message: "سطر خالی/مزاحم — وارد نشد" });
        } else {
          errors.push({ row: idx, message: "نام کارمند الزامی است" });
        }
        continue;
      }

      const nationalId = toEnglishDigits(String(row.nationalId ?? "").trim()).replace(/[\s\-]/g, "");
      if (nationalId && !/^\d{10}$/.test(nationalId)) {
        errors.push({ row: idx, message: "کد ملی باید ۱۰ رقم باشد" });
        continue;
      }
      // کنترل‌رقم کد ملی — کپی POST /api/employees
      if (nationalId && !isValidNationalId(nationalId)) {
        errors.push({ row: idx, message: "کد ملی نامعتبر است (رقم کنترل تطابق ندارد)" });
        continue;
      }

      const { firstName, lastName } = splitFullName(fullName);
      let personnelCode = toEnglishDigits(String(row.personnelCode ?? "").trim());
      const baseSalary = cellFilled(row.baseSalary) ? toNumber(row.baseSalary, 0) : 0;
      if (baseSalary < 0) {
        errors.push({ row: idx, message: "حقوق پایه نمی‌تواند منفی باشد" });
        continue;
      }
      const hireDate = normalizeDate(row.hireDate);
      const contractType = parseContractType(row.contractType);
      const department = String(row.department ?? "").trim() || null;
      const position = String(row.position ?? "").trim() || null;

      if (!personnelCode) {
        autoCodeCounter++;
        personnelCode = `EMP-${autoStamp}-${autoRand}-${String(autoCodeCounter).padStart(4, "0")}`;
        while (seenCodes.has(personnelCode) || employeeByCode.has(personnelCode)) {
          autoCodeCounter++;
          personnelCode = `EMP-${autoStamp}-${autoRand}-${String(autoCodeCounter).padStart(4, "0")}`;
        }
      }
      if (seenCodes.has(personnelCode)) {
        errors.push({ row: idx, message: `کد پرسنلی تکراری در همین فایل: ${personnelCode}` });
        continue;
      }
      seenCodes.add(personnelCode);

      const employeeData = {
        tenantId,
        personnelCode,
        firstName,
        lastName,
        nationalId, // خالی → رشتهٔ خالی (ستون required — الگوی ذخیرهٔ plain مثل API)
        contractType,
        baseSalary: BigInt(Math.round(baseSalary)),
        hireDate,
        status: "ACTIVE",
        ...(department ? { department } : {}),
        ...(position ? { position } : {}),
      };

      // تکراری (DB) → استراتژی
      const existingId = employeeByCode.get(personnelCode);
      if (existingId) {
        if (strategy === "update") {
          const upd: Prisma.EmployeeUpdateInput = {
            firstName,
            ...(lastName ? { lastName } : {}),
            ...(nationalId ? { nationalId } : {}),
            contractType,
            baseSalary: BigInt(Math.round(baseSalary)),
            hireDate,
            ...(department !== null ? { department } : {}),
            ...(position !== null ? { position } : {}),
          };
          updates.push({ row: idx, employeeId: existingId, data: upd });
        } else {
          skipped++;
          skippedRows.push({ row: idx, message: `کد پرسنلی تکراری: ${personnelCode}` });
        }
        continue;
      }
      employeeByCode.set(personnelCode, `create:${personnelCode}`);

      creates.push({ row: idx, data: employeeData });
    } catch (err) {
      errors.push({
        row: idx,
        message: err instanceof Error ? err.message : "خطا در آماده‌سازی ردیف کارمند",
      });
    }
  }

  // ایجاد گروهی — تراکنش‌های ۲۰۰تایی با fallback سطری (dryRun: فقط شمارش)
  let created = 0;
  let updated = 0;
  const BATCH = 200;
  if (dryRun) {
    created = creates.length;
    updated = updates.length;
  } else {
    for (let i = 0; i < creates.length; i += BATCH) {
      const batch = creates.slice(i, i + BATCH);
      try {
        await db.$transaction(async (tx) => {
          for (const item of batch) {
            await tx.employee.create({ data: item.data });
          }
        });
        created += batch.length;
      } catch {
        for (const item of batch) {
          try {
            await db.employee.create({ data: item.data });
            created++;
          } catch (err) {
            errors.push({
              row: item.row,
              message: err instanceof Error ? err.message : "خطا در ایجاد کارمند",
            });
          }
        }
      }
    }
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      try {
        await db.$transaction(async (tx) => {
          for (const u of batch) {
            await tx.employee.update({ where: { id: u.employeeId }, data: u.data });
          }
        });
        updated += batch.length;
      } catch {
        for (const u of batch) {
          try {
            await db.employee.update({ where: { id: u.employeeId }, data: u.data });
            updated++;
          } catch (err) {
            errors.push({
              row: u.row,
              message: err instanceof Error ? err.message : "خطا در به‌روزرسانی کارمند",
            });
          }
        }
      }
    }
  }

  if (!dryRun) {
    await auditLog({
      tenantId,
      action: "BULK_IMPORT",
      entity: "Employee",
      entityId: "bulk",
      changes: {
        count: created,
        updated,
        skipped,
        errors: errors.length,
        total: rows.length,
        strategy,
        fileName: fileName ?? null,
      },
      req,
    });
  }

  return { created, updated, skipped, errors, skippedRows };
}

// ============ Task 1-d: نگاشت دستی + پیش‌نمایش ============

// v20-E2: موجودیت‌های جدید (accounts / journalEntries / checks / employees)
// در فهرست سفید پذیرفته می‌شوند — هم در مسیر ایمپورت و هم در پیش‌نمایش
const VALID_ENTITIES = new Set<EntityType>([
  "invoices",
  "products",
  "parties",
  "accounts",
  "journalEntries",
  "checks",
  "employees",
]);

/** entityType سمت API (parties) → entityType دیکشنری مشترک (customers) */
function uiEntityFromApi(entity: EntityType): ImportEntityKind {
  return entity === "parties" ? "customers" : entity;
}

/**
 * اعتبارسنجی mapping دریافتی از کلاینت:
 *  - مقادیر باید در فهرست سفید IMPORTABLE_FIELDS[entityType] یا "ignore" باشند
 *  - کلیدهای عددی (ایندکس ستون) در بازهٔ [0, headerCount) باشند
 * خروجی: نگاشت نرمال‌شده { [columnKey]: targetField } (بدون "ignore"ها)
 */
function validateMapping(
  mapping: unknown,
  entity: EntityType,
  headerCount?: number
): { ok: true; mapping: ColumnMapping } | { ok: false; error: string } {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return { ok: false, error: "ساختار mapping نامعتبر است — باید آبجکتی از { ستون: فیلد } باشد" };
  }
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(mapping as Record<string, unknown>)) {
    const key = String(rawKey).trim();
    const field = String(rawValue ?? "").trim();
    if (!field) continue;
    if (!isValidMappingTarget(entity, field)) {
      const validList = [...IMPORTABLE_FIELDS[entity], MAPPING_IGNORE].join("، ");
      return {
        ok: false,
        error: `فیلد هدف «${field.slice(0, 40)}» برای ${entity} معتبر نیست — فیلدهای مجاز: ${validList}`,
      };
    }
    // کلید عددی (ایندکس ستون)؟ باید در بازهٔ ستون‌ها باشد
    if (headerCount !== undefined && /^\d+$/.test(key)) {
      const idx = Number(key);
      if (!Number.isInteger(idx) || idx < 0 || idx >= headerCount) {
        return {
          ok: false,
          error: `ایندکس ستون ${key} خارج از بازهٔ ستون‌های فایل است (۰ تا ${headerCount - 1})`,
        };
      }
    }
    if (field !== MAPPING_IGNORE) out[key] = field;
  }
  return { ok: true, mapping: out as ColumnMapping };
}

/** اعمال نگاشت صریح روی ردیف‌های آرایه‌ای (خروجی پارسر فایل):
 * هر ردیف string[] → آبجکت { [targetField]: value } (ستون‌های ignore و مقادیر
 * خالی حذف می‌شوند — مقدار خالی یعنی «فایل مقدار نداشت» و به‌روزرسانی نمی‌کند)
 */
function applyColumnMapping(
  rows: string[][],
  mapping: ColumnMapping
): Record<string, unknown>[] {
  const entries = Object.entries(mapping)
    .map(([k, f]) => ({ idx: Number(k), field: f }))
    .filter((e) => Number.isInteger(e.idx) && e.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const e of entries) {
      const v = row[e.idx];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        out[e.field] = v;
      }
    }
    return out;
  });
}

/**
 * اعمال نگاشت صریح روی ردیف‌های آبجکتی (JSON API — کلید mapping = نام هدر):
 * { "نام كالا": "name", ... } → ردیف‌های کلید-فیلدی
 */
function applyHeaderMapping(
  data: Record<string, unknown>[],
  mapping: ColumnMapping
): Record<string, unknown>[] {
  return data.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [header, field] of Object.entries(mapping)) {
      if (!(header in row)) continue;
      const v = row[header];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        out[field] = v;
      }
    }
    return out;
  });
}

/* ============================================================
 * R28-8 — «مقادیر پیش‌فرض» فیلدهای نگاشت‌نشده (fallbacks)
 * ============================================================
 * فیلدهای اجباری/مهمی که در فایل ستونی ندارند می‌توانند از یک مقدار
 * ثابتِ تعیین‌شدهٔ کاربر پر شوند (مثل دسته‌بندی پیش‌فرض همهٔ کالاها).
 * قرارداد: fallbacks = { [field]: value } — اعتبارسنجی سمت سرور
 * (فهرست سفید فیلدها + سقف طول) و اعمال بعد از mapping:
 * فقط خانه‌های «خالی/غایب» پر می‌شوند (مقدار فایل همیشه اولویت دارد).
 */
const FALLBACK_VALUE_MAX_LEN = 300;
const FALLBACK_MAX_FIELDS = 40;

/** اعتبارسنجی fallbacks دریافتی از کلاینت — خروجی نرمال‌شده یا null */
function validateFallbacks(
  raw: unknown,
  entity: EntityType
): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  let count = 0;
  for (const [rawField, rawValue] of Object.entries(raw as Record<string, unknown>)) {
    const field = String(rawField ?? "").trim();
    const value = String(rawValue ?? "").trim();
    if (!field || !value) continue; // مقدار خالی یعنی «بدون پیش‌فرض»
    if (!isValidMappingTarget(entity, field)) continue; // فقط فیلدهای مجاز همان موجودیت
    if (value.length > FALLBACK_VALUE_MAX_LEN) continue;
    out[field] = value;
    if (++count >= FALLBACK_MAX_FIELDS) break;
  }
  return count > 0 ? out : null;
}

/** اعمال مقادیر پیش‌فرض روی ردیف‌های نگاشت‌شده — فقط خانه‌های خالی/غایب پر می‌شوند */
function applyFallbacks(
  rows: Record<string, unknown>[],
  fallbacks: Record<string, string> | null
): Record<string, unknown>[] {
  if (!fallbacks) return rows;
  const entries = Object.entries(fallbacks);
  if (entries.length === 0) return rows;
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const [field, value] of entries) {
      const v = out[field];
      if (v === undefined || v === null || String(v).trim() === "") {
        out[field] = value;
      }
    }
    return out;
  });
}

/**
 * ساخت پیش‌نمایش ستون‌به‌ستون با پیشنهاد هوشمند:
 *  ۱) autoDetectMapping (بدون تداخل دو ستون بر سر یک فیلد)
 *  ۲) inferMappingFromData برای فیلدهای باقی‌مانده (الگوی مقادیر)
 *  ۳) ستون‌های بدون تخصیص → «نادیده» (با تشخیص ستون‌های کمکی مثل «رديف»)
 */
function buildColumnSuggestions(
  headers: string[],
  rows: string[][],
  entity: ImportEntityKind
): { columns: ColumnPreview[]; inferredCount: number } {
  const autoMap = autoDetectMapping(headers, entity);
  const headerToField = new Map<string, string>();
  for (const [field, header] of Object.entries(autoMap)) {
    if (header && !headerToField.has(header)) headerToField.set(header, field);
  }
  // استنتاج از الگوی داده‌ها (نمونهٔ ۳۰۰ ردیف — سبک و سریع)
  const recordRows = matrixToRecordRows(headers, rows.slice(0, 300));
  const inference = inferMappingFromData(headers, recordRows, entity, autoMap);
  for (const [field, header] of Object.entries(inference.mapping)) {
    if (!headerToField.has(header)) headerToField.set(header, field);
  }

  const columns: ColumnPreview[] = headers.map((header, index) => {
    const samples = columnSamples(rows, index, 5);
    const assigned = headerToField.get(header);
    if (assigned) {
      const direct = suggestFieldForHeader(header, entity);
      const isInferred = inference.mapping[assigned] === header;
      const confidence: ColumnPreview["confidence"] = isInferred
        ? "inferred"
        : direct?.field === assigned && direct.confidence === "exact"
          ? "exact"
          : "fuzzy";
      const reason = isInferred
        ? inference.reasons[assigned] ?? "استنتاج از الگوی مقادیر ستون"
        : `تطبیق هدر با «${fieldLabel(entity, assigned)}»`;
      return { index, header, samples, suggestedField: assigned, confidence, reason };
    }
    // ستون کمکی/بی‌اثر شناخته‌شده (رديف، درصد تخفیف، واریانس، ...)
    const sem = headerField(header);
    if (sem === "ignore" || sem === "rowNo") {
      return {
        index,
        header,
        samples,
        suggestedField: MAPPING_IGNORE,
        confidence: "exact",
        reason: "ستون کمکی/بی‌اثر — نادیده گرفته می‌شود",
      };
    }
    return {
      index,
      header,
      samples,
      suggestedField: MAPPING_IGNORE,
      confidence: "none",
      reason: "هدر شناخته نشد — از لیست، فیلد مناسب را انتخاب کنید یا نادیده بگیرید",
    };
  });
  return { columns, inferredCount: Object.keys(inference.mapping).length };
}

// ============ Route ============

// GET /api/import — تاریخچه واقعی واردات (از AuditLog با اکشن BULK_IMPORT)
// FIX: قبلاً UI تاریخچه را به‌صورت داده‌ی فیک (SAMPLE_HISTORY) نشان می‌داد.
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const tenantId = auth.user.tenantId;

    const logs = await db.auditLog.findMany({
      where: { tenantId, action: "BULK_IMPORT" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        entity: true,
        changes: true,
        createdAt: true,
      },
    });

    const history = logs.map((log) => {
      let changes: {
        count?: number;
        updated?: number;
        skipped?: number;
        errors?: number;
        total?: number;
        fileName?: string;
      } = {};
      try {
        changes = log.changes ? JSON.parse(log.changes) : {};
      } catch {
        /* ignore */
      }
      const total = changes.total ?? 0;
      const created = changes.count ?? 0;
      const updated = changes.updated ?? 0;
      const skipped = changes.skipped ?? 0;
      const success = created + updated;
      const errorCount =
        changes.errors ?? Math.max(total - created - updated - skipped, 0);
      const status =
        success === 0 && errorCount > 0
          ? "failed"
          : errorCount > 0
            ? "partial"
            : "success";
      return {
        id: log.id,
        entity: (log.entity || "products").toLowerCase(),
        fileName: typeof changes.fileName === "string" ? changes.fileName : "",
        totalRows: total,
        createdRows: created,
        updatedRows: updated,
        skippedRows: skipped,
        successRows: success,
        errorRows: errorCount,
        date: log.createdAt.toISOString(),
        status: status as "success" | "partial" | "failed",
      };
    });

    return NextResponse.json({ success: true, data: history });
  } catch {
    return NextResponse.json(
      { success: false, error: "خطا در دریافت تاریخچه واردات" },
      { status: 500 }
    );
  }
}


/* ============================================================
 * Task 1-d — پاسخ خطای استاندارد + دیسپچر مشترک ایمپورترها
 * ============================================================ */
function importErrorResponse(message: string, status: number): NextResponse {
  return NextResponse.json(
    {
      success: false,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      skippedRows: [],
      error: message,
    } satisfies ImportResponse,
    { status }
  );
}

interface ImporterResult {
  created: number;
  updated: number;
  skipped: number;
  errors: ImportError[];
  skippedRows: ImportError[];
}

async function runImporter(
  entity: EntityType,
  data: Record<string, unknown>[],
  tenantId: string,
  req: NextRequest,
  fileName: string | undefined,
  strategy: DuplicateStrategy,
  autoSku: boolean,
  /** v20-E2: mode=validate — اجرای ایمپورتر بدون هیچ نوشتن در DB */
  dryRun = false
): Promise<ImporterResult> {
  if (entity === "products") {
    return importProducts(data, tenantId, req, fileName, strategy, autoSku, dryRun);
  }
  if (entity === "parties") {
    return importParties(data, tenantId, req, fileName, strategy, dryRun);
  }
  // v20-E2: دیسپچ ایمپورترهای جدید — قبلاً هرچه غیر از سه‌تای اول بود به
  // importInvoices می‌افتاد (سند/چک/کارمند به‌عنوان فاکتور ساخته می‌شد!)
  if (entity === "accounts") {
    return importAccounts(data, tenantId, req, fileName, strategy, dryRun);
  }
  if (entity === "journalEntries") {
    return importJournalEntries(data, tenantId, req, fileName, dryRun);
  }
  if (entity === "checks") {
    return importChecks(data, tenantId, req, fileName, strategy, dryRun);
  }
  if (entity === "employees") {
    return importEmployees(data, tenantId, req, fileName, strategy, dryRun);
  }
  return importInvoices(data, tenantId, req, fileName, dryRun);
}

/* ============================================================
 * Task 1-d — مسیر مولتی‌پارت: آپلود فایل + پیش‌نمایش/ایمپورت
 * ============================================================
 * POST /api/import  (Content-Type: multipart/form-data)
 *   فیلدهای فرم:
 *     file               (File, الزامی) — xlsx / xlsm / xlsb / xls / ods / csv / tsv / txt / json
 *     mode               ("preview" | "import" | "validate") — پیش‌فرض import
 *                        v20-E2: validate = اجرای کامل ایمپورتر بدون نوشتن (dryRun)
 *     entityType         ("products" | "parties" | "invoices" | "accounts" |
 *                        "journalEntries" | "checks" | "employees") — برای preview اختیاری
 *     sheet              (نام شیت یا شمارهٔ ۱-مبنا) — اختیاری، فقط فرمت‌های اکسل/ODS
 *     mapping            (JSON: { "ایندکس ستون": "فیلد هدف" | "ignore" }) — اختیاری
 *                        v20-E2: در mode=preview همراه mapping، ۱۰ ردیف اولِ
 *                        نگاشت‌شده در mappedRows برگردانده می‌شود
 *     fallbacks          (JSON: { "فیلد": "مقدار پیش‌فرض" }) — R28-8: مقدار ثابت
 *                        برای فیلدهای بدون ستون (مثل دسته‌بندی پیش‌فرض)؛ فقط
 *                        خانه‌های خالی ردیف‌ها را پر می‌کند
 *     headerRow          (عدد ۱-مبنا) — R28-8: ردیف سرستون اجباری؛ ۰/حذف = خودکار
 *     duplicateStrategy  ("skip" | "update") — پیش‌فرض skip
 *     autoSku            ("true" | "false") — پیش‌فرض true (فقط products)
 *
 * preview:  هیچ نوشتن در دیتابیس ندارد — فقط پارس + پیشنهاد ستون‌ها.
 * validate: پارس + نگاشت + اجرای کامل ایمپورتر با dryRun (بدون هیچ نوشتن).
 * import:   پارس + (mapping صریح یا auto-detect) + نوشتن گروهی.
 */
async function handleMultipartImport(
  req: NextRequest,
  tenantIdFromAuth?: string
): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return importErrorResponse("فرم مولتی‌پارت نامعتبر است", 400);
  }
  const modeRaw = String(form.get("mode") ?? "import");
  const mode = modeRaw === "preview" ? "preview" : modeRaw === "validate" ? "validate" : "import";
  const fileEntry = form.get("file");
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return importErrorResponse("فایلی ارسال نشده است — فیلد «file» در فرم الزامی است", 400);
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await fileEntry.arrayBuffer());
  } catch {
    return importErrorResponse("خواندن محتوای فایل ناموفی بود", 400);
  }
  try {
    assertFileSize(bytes);
  } catch (err) {
    return importErrorResponse(err instanceof Error ? err.message : "حجم فایل بیش از حد مجاز است", 400);
  }

  const entityRaw = form.get("entityType");
  const entityType = typeof entityRaw === "string" ? entityRaw.trim() : "";
  const sheetEntry = form.get("sheet");
  const sheet = typeof sheetEntry === "string" && sheetEntry.trim() !== "" ? sheetEntry.trim() : undefined;
  // R28-8 — ردیف سرستون اجباری (۱-مبنا؛ ۰ یا نامعتبر = تشخیص خودکار)
  const headerRowRaw = form.get("headerRow");
  const headerRowNum =
    typeof headerRowRaw === "string" && /^\d+$/.test(headerRowRaw.trim())
      ? Number(headerRowRaw.trim())
      : 0;
  const headerRow = headerRowNum > 0 ? headerRowNum : undefined;

  // FIX(H3-preview-auth): احراز هویت قبل از هر کاری (حتی preview) — قبلاً
  // بررسی tenant بعد از بلوک preview بود و با تنظیم‌نبودن IMPORT_BEARER_TOKEN،
  // کاربر مهمان می‌توانست بدون لاگین فایل آپلود و پارس کند (مصرف CPU/حافظه
  // سمت سرور بدون احراز هویت — تا ۱۵MB × ۲۴۰ درخواست در دقیقه برای هر IP).
  const tenant = tenantIdFromAuth
    ? await db.tenant.findUnique({ where: { id: tenantIdFromAuth } })
    : null;
  if (!tenant) {
    return importErrorResponse("احراز هویت الزامی است — tenant کاربر پیدا نشد", 401);
  }

  // پارس فایل (همهٔ فرمت‌ها — انکودینگ/شیت/جداکننده خودکار + ردیف سرستون اجباری)
  let parsed: ParsedImportFile;
  try {
    parsed = parseImportFile(bytes, fileEntry.name, sheet, { headerRow });
  } catch (err) {
    if (err instanceof ImportFileError) return importErrorResponse(err.message, 400);
    throw err;
  }

  /* ---------- پیش‌نمایش: بدون هیچ نوشتن در DB ---------- */
  if (mode === "preview") {
    const hint =
      entityType && VALID_ENTITIES.has(entityType as EntityType)
        ? uiEntityFromApi(entityType as EntityType)
        : undefined;
    const guess = guessEntityFromHeaders(parsed.headers);
    const effectiveUiEntity = hint ?? guess.entity ?? "products";
    const { columns, inferredCount } = buildColumnSuggestions(parsed.headers, parsed.rows, effectiveUiEntity);
    const dateFormat = detectDateFormat(
      parsed.rows,
      parsed.headers.map((_, i) => i)
    );
    // v20-E2: پیش‌نمایش «۱۰ ردیف اول» با نگاشت تاییدشده — اگر فیلد mapping
    // همراه درخواست preview آمده باشد، ردیف‌ها با همان نگاشت به آبجکت‌های
    // { فیلد هدف: مقدار } تبدیل و در mappedRows برگردانده می‌شوند (UI گرید
    // نگاشت این را نشان می‌دهد). نگاشت نامعتبر → آرایهٔ خالی (پیش‌نمایش شکست
    // نمی‌خورد — خطای دقیق در مسیر import/validate برمی‌گردد).
    let mappedRows: Record<string, unknown>[] = [];
    const previewMappingRaw = form.get("mapping");
    // R28-8: مقادیر پیش‌فرض فیلدهای نگاشت‌نشده — در پیش‌نمایش ردیف‌ها هم اعمال می‌شود
    let previewFallbacks: Record<string, string> | null = null;
    try {
      previewFallbacks = validateFallbacks(
        JSON.parse(String(form.get("fallbacks") ?? "null")),
        (effectiveUiEntity === "customers" ? "parties" : effectiveUiEntity) as EntityType
      );
    } catch {
      /* fallbacks اختیاری است — بی‌صدا نادیده گرفته می‌شود */
    }
    if (typeof previewMappingRaw === "string" && previewMappingRaw.trim() !== "") {
      try {
        const previewMappingParsed: unknown = JSON.parse(previewMappingRaw);
        const apiEntityForValidation =
          effectiveUiEntity === "customers" ? "parties" : effectiveUiEntity;
        const v = validateMapping(
          previewMappingParsed,
          apiEntityForValidation as EntityType,
          parsed.headers.length
        );
        if (v.ok) {
          mappedRows = applyColumnMapping(parsed.rows.slice(0, 10), v.mapping);
          if (previewFallbacks) mappedRows = applyFallbacks(mappedRows, previewFallbacks);
        }
      } catch {
        /* mappedRows اختیاری است — بی‌صدا خالی می‌ماند */
      }
    }
    return NextResponse.json({
      success: true,
      mode: "preview",
      file: {
        name: fileEntry.name,
        sizeBytes: bytes.length,
        format: parsed.format,
        encoding: parsed.encoding,
        delimiter: parsed.delimiter,
      },
      sheets: parsed.sheets,
      selectedSheet: parsed.selectedSheet,
      totalRows: parsed.totalRows,
      headerInjected: parsed.headerInjected,
      junkRemoved: parsed.junkRemoved,
      totalsRemoved: parsed.totalsRemoved,
      detectedEntity: guess.entity ? (guess.entity === "customers" ? "parties" : guess.entity) : null,
      entityTypeUsed: effectiveUiEntity === "customers" ? "parties" : effectiveUiEntity,
      entityScores: {
        products: guess.scores.products,
        parties: guess.scores.customers,
        invoices: guess.scores.invoices,
        // v20-E2: امتیاز موجودیت‌های جدید
        accounts: guess.scores.accounts,
        journalEntries: guess.scores.journalEntries,
        checks: guess.scores.checks,
        employees: guess.scores.employees,
      },
      dateFormat,
      columns,
      inferredCount,
      mappedRows,
      importableFields: IMPORTABLE_FIELDS,
      // R28-8 — وضعیت ردیف سرستون برای استپر UI (خودکار یا اجباری)
      headerRowUsed: parsed.headerRowUsed,
      rawRowCount: parsed.rawRowCount,
      headerRowAuto: !headerRow,
    });
  }

  /* ---------- ایمپورت از فایل (یا اعتبارسنجی dryRun) ---------- */
  if (!entityType || !VALID_ENTITIES.has(entityType as EntityType)) {
    return importErrorResponse(
      "نوع موجودیت نامعتبر است — یکی از products / parties / invoices / accounts / journalEntries / checks / employees",
      400
    );
  }
  const entity = entityType as EntityType;
  try {
    assertRowLimit(parsed.totalRows);
  } catch (err) {
    return importErrorResponse(err instanceof Error ? err.message : "فایل بیش از حد بزرگ است", 400);
  }
  if (parsed.totalRows === 0) {
    return importErrorResponse("داده‌ای برای وارد کردن وجود ندارد", 400);
  }

  // نگاشت صریح ستون‌ها (اختیاری — وقتی نبود، auto-detect مثل قبل)
  const mappingRaw = form.get("mapping");
  let data: Record<string, unknown>[];
  if (typeof mappingRaw === "string" && mappingRaw.trim() !== "") {
    let mappingParsed: unknown;
    try {
      mappingParsed = JSON.parse(mappingRaw);
    } catch {
      return importErrorResponse("mapping باید JSON معتبر باشد — مثال: {\"1\":\"name\",\"2\":\"salePrice\"}", 400);
    }
    const v = validateMapping(mappingParsed, entity, parsed.headers.length);
    if (!v.ok) return importErrorResponse(v.error, 400);
    data = applyColumnMapping(parsed.rows, v.mapping);
  } else {
    // بدون mapping → رفتار قبل: کلید = هدر خام فایل (normalizeRowKeys نگاشت می‌کند)
    data = matrixToRecordRows(parsed.headers, parsed.rows);
  }

  // R28-8 — مقادیر پیش‌فرض فیلدهای نگاشت‌نشده (بعد از mapping؛ فقط خانه‌های خالی)
  let fallbacks: Record<string, string> | null = null;
  const fallbacksRaw = form.get("fallbacks");
  if (typeof fallbacksRaw === "string" && fallbacksRaw.trim() !== "") {
    let fallbacksParsed: unknown;
    try {
      fallbacksParsed = JSON.parse(fallbacksRaw);
    } catch {
      return importErrorResponse("fallbacks باید JSON معتبر باشد — مثال: {\"category\":\"متفرقه\"}", 400);
    }
    fallbacks = validateFallbacks(fallbacksParsed, entity);
    data = applyFallbacks(data, fallbacks);
  }

  const strategy: DuplicateStrategy =
    String(form.get("duplicateStrategy") ?? "skip") === "update" ? "update" : "skip";
  const autoSku = String(form.get("autoSku") ?? "true") !== "false";

  // v20-E2: mode=validate → اجرای کامل ایمپورتر با dryRun (هیچ نوشتن در DB)
  const dryRun = mode === "validate";
  const result = await runImporter(
    entity,
    data,
    tenant.id,
    req,
    fileEntry.name.slice(0, 200),
    strategy,
    autoSku,
    dryRun
  );
  return NextResponse.json({
    success: true,
    mode: dryRun ? "validate" : "file-import",
    totalRows: parsed.totalRows,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    errors: result.errors,
    skippedRows: result.skippedRows,
  } satisfies ImportResponse & { mode: string; totalRows: number });
}

/* ============================================================
 * مسیر JSON (سازگار با قبل) — body:
 *   { entityType, data, duplicateStrategy, fileName, autoSku?, mapping?, mode? }
 * Task 1-d: mapping اختیاری — وقتی data ردیف‌های «آرایه‌ای» است، کلید mapping
 * ایندکس ستون؛ وقتی ردیف‌های «آبجکتی» است، کلید mapping نام هدر است.
 * v20-E2: mode="validate" → اجرای ایمپورتر با dryRun (بدون هیچ نوشتن).
 * ============================================================ */
async function handleJsonImport(
  req: NextRequest,
  tenantIdFromAuth?: string
): Promise<NextResponse> {
  const body = (await req.json()) as {
    entityType?: string;
    data?: unknown[];
    duplicateStrategy?: string;
    fileName?: string;
    autoSku?: boolean;
    mapping?: unknown;
    mode?: string;
    /** R28-8: مقادیر پیش‌فرض فیلدهای نگاشت‌نشده — { فیلد: مقدار } */
    fallbacks?: unknown;
  };
  const entityType = body.entityType as EntityType;
  const strategyRaw = String(body.duplicateStrategy ?? "skip");
  const strategy: DuplicateStrategy = strategyRaw === "update" ? "update" : "skip";
  const autoSku = body.autoSku !== false;
  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 200) : undefined;
  // v20-E2: mode=validate → dryRun (بدون هیچ نوشتن در DB)
  const dryRun = body.mode === "validate";

  if (!entityType || !VALID_ENTITIES.has(entityType)) {
    return importErrorResponse("نوع موجودیت نامعتبر است", 400);
  }

  const rawData = Array.isArray(body.data) ? body.data : [];
  if (rawData.length === 0) {
    return importErrorResponse("داده‌ای برای وارد کردن وجود ندارد", 400);
  }
  if (rawData.length > MAX_ROWS_PER_REQUEST) {
    return importErrorResponse(
      `حداکثر ${MAX_ROWS_PER_REQUEST} ردیف در هر درخواست مجاز است — فایل را به بخش‌های کوچکتر تقسیم کنید`,
      400
    );
  }

  // Task 1-d — نگاشت صریح روی ردیف‌های JSON
  let data: Record<string, unknown>[];
  if (body.mapping && typeof body.mapping === "object" && !Array.isArray(body.mapping)) {
    const rowsAreArrays = Array.isArray(rawData[0]);
    // برای ردیف‌های آرایه‌ای، سقف ایندکس = طول بلندترین ردیف
    const headerCount = rowsAreArrays
      ? (rawData as unknown[][]).reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0)
      : undefined;
    const v = validateMapping(body.mapping, entityType, headerCount);
    if (!v.ok) return importErrorResponse(v.error, 400);
    if (rowsAreArrays) {
      data = applyColumnMapping(rawData as unknown as string[][], v.mapping);
    } else {
      data = applyHeaderMapping(rawData as Record<string, unknown>[], v.mapping);
    }
  } else {
    // بدون mapping → سازگار با قبل (ردیف‌های آبجکتی با کلید هدر/فیلد)
    data = rawData as Record<string, unknown>[];
  }

  // R28-8 — مقادیر پیش‌فرض فیلدهای نگاشت‌نشده (بعد از mapping؛ فقط خانه‌های خالی)
  const fallbacks = validateFallbacks(body.fallbacks, entityType);
  data = applyFallbacks(data, fallbacks);

  const tenant = tenantIdFromAuth
    ? await db.tenant.findUnique({ where: { id: tenantIdFromAuth } })
    : null;
  if (!tenant) {
    return importErrorResponse("احراز هویت الزامی است — tenant کاربر پیدا نشد", 401);
  }

  const result = await runImporter(entityType, data, tenant.id, req, fileName, strategy, autoSku, dryRun);
  return NextResponse.json({
    success: true,
    mode: dryRun ? "validate" : "import",
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    errors: result.errors,
    skippedRows: result.skippedRows,
  } satisfies ImportResponse & { mode: string });
}

export async function POST(req: NextRequest) {
  try {
    // احراز هویت کاربر — فقط کاربران واردشده می‌توانند داده وارد کنند
    let tenantIdFromAuth: string | undefined;
    try {
      const auth = await requireUser(req);
      if (!("error" in auth)) {
        tenantIdFromAuth = auth.user.tenantId;
      }
    } catch {
      // fallback به Bearer auth
    }

    // احراز هویت Bearer (اختیاری — فقط اگر IMPORT_BEARER_TOKEN تنظیم شده باشد)
    if (!tenantIdFromAuth && !verifyBearer(req)) {
      return importErrorResponse("احراز هویت الزامی است", 401);
    }

    // Rate limiting (per-IP) — FIX(21-A): از ۳۰ به ۲۴۰ در دقیقه افزایش یافت چون
    // ایمپورت تا ۱۰۰,۰۰۰ ردیف به‌صورت چانک‌های ۵۰۰تایی (~۲۰۰ درخواست) ارسال می‌شود
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`bulk-import:${ip}`, 240, 60_000);
    if (!rl.ok) {
      return importErrorResponse("درخواست بیش از حد. کمی بعد تلاش کنید.", 429);
    }

    // Task 1-d — مسیر مولتی‌پارت (فایل) یا JSON (دادهٔ پارس‌شده)
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("multipart/form-data")) {
      return await handleMultipartImport(req, tenantIdFromAuth);
    }
    return await handleJsonImport(req, tenantIdFromAuth);
  } catch (error) {
    // FIX(SEC-4a): پیام خام خطا به کلاینت نشت نمی‌کند — جزئیات فقط سمت سرور لاگ می‌شود
    console.error("Bulk import error:", error);
    return importErrorResponse(
      "خطا در وارد کردن داده — ساختار فایل را بررسی کنید و دوباره تلاش کنید",
      500
    );
  }
}
