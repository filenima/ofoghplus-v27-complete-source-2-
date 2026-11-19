// ============ lib/invoice-constants.ts — منبع واحد ثابت‌های فاکتور — افق پلاس ============
//
// FIX(R28-3): دو مسیر آینه‌ای /api/invoices و /api/accounting/invoices هرکدام
// لیست وضعیت/نوع خودشان را داشته بودند و واگرا شده بودند — RESERVED و
// paymentType=CREDIT فقط در /api/invoices پشتیبانی می‌شد و همان payload به
// /api/accounting/invoices خطای 400 می‌گرفت (یا بی‌صدا DRAFT می‌شد).
// از این پس هر دو مسیر (و هر مسیر آیندهٔ فاکتور) فقط از این ماژول import
// می‌کنند — ثابت‌ها دیگر هیچ‌جا duplicate نمی‌شوند.

/** وضعیت‌های مجاز فاکتور — منبع واحد (آینهٔ lib/accounting.ts) */
export const ALLOWED_INVOICE_STATUSES = [
  "DRAFT",
  "PENDING",
  "SENT",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  // Task 21-B: رزرو — بدون اثر انبار/سند تا نهایی‌سازی (finalize)
  "RESERVED",
] as const;

export type InvoiceStatus = (typeof ALLOWED_INVOICE_STATUSES)[number];

/** انواع فاکتور مجاز — منبع واحد */
export const ALLOWED_INVOICE_TYPES = [
  "SALE",
  "PURCHASE",
  "PRE_INVOICE",
  "RETURN",
] as const;

export type InvoiceType = (typeof ALLOWED_INVOICE_TYPES)[number];

/** انواع پرداخت — CASH (نقدی) | CREDIT (قرضی/نسیه با dueDate) */
export const ALLOWED_PAYMENT_TYPES = ["CASH", "CREDIT"] as const;
export type InvoicePaymentType = (typeof ALLOWED_PAYMENT_TYPES)[number];

/**
 * نرمال‌سازی وضعیت ارسالی + نگاشت‌های تاریخی:
 *  - PARTIAL (قدیمی) → PARTIALLY_PAID (FIX 3b-بیگ‌۱۲ — هم‌ساز با settlements)
 *  - رشتهٔ خالی/null → null (فراخواننده باید پیش‌فرض خودش را بگذارد)
 */
export function normalizeInvoiceStatus(raw: unknown): InvoiceStatus | null {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (s === "PARTIAL") return "PARTIALLY_PAID";
  return (ALLOWED_INVOICE_STATUSES as readonly string[]).includes(s)
    ? (s as InvoiceStatus)
    : null;
}

/**
 * نرمال‌سازی نوع پرداخت — مقادیر نامعتبر/خالی → CASH (پیش‌فرض امن).
 * CREDIT فقط با dueDate معنادار است (اعتبارسنجی سر تاریخ در فراخواننده).
 */
export function normalizePaymentType(raw: unknown): InvoicePaymentType {
  return String(raw || "CASH").toUpperCase() === "CREDIT" ? "CREDIT" : "CASH";
}

/** نرمال‌سازی نوع فاکتور — نامعتبر → null */
export function normalizeInvoiceType(raw: unknown): InvoiceType | null {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  return (ALLOWED_INVOICE_TYPES as readonly string[]).includes(s)
    ? (s as InvoiceType)
    : null;
}
