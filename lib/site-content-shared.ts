/**
 * lib/site-content-shared.ts — بخش client-safe ماژول site-content
 * ============================================================================
 * این فایل فقط شامل انواع، ثابت‌ها و توابع خالص است و به هیچ ماژول
 * سروری (db/prisma) وابسته نیست؛ بنابراین import آن از کلاینت مجاز است.
 *
 * نکتهٔ مهم (رفع باگ R24-A1): قبلاً hooks/use-site-content.ts مقدار
 * DEFAULT_SITE_CONTENT را مستقیم از lib/site-content.ts (که db را import
 * می‌کرد) می‌گرفت؛ در نتیجه Prisma وارد باندل مرورگر می‌شد و روی
 * لپ‌تاپ‌های ضعیف باعث خطای مرورگر/هنگ می‌شد. اکنون کلاینت فقط از
 * همین ماژول shared ایمن import می‌کند.
 */

// ============ انواع داده‌ای ============

export type CustomSectionType =
  | "html"
  | "shortcode"
  | "richtext"
  | "image-text"
  | "cta";

export interface SiteCustomSection {
  id: string;
  type: CustomSectionType;
  /** سکشن داخلی که این سکشن سفارشی بعد از آن رندر می‌شود — خالی = آخر صفحه */
  after?: string;
  props: Record<string, string>;
}

export interface SiteContentOverrides {
  /** "hero.title" → متن جدید (فقط متن‌های اصلی قابل بازنویسی هستند) */
  fields: Record<string, string>;
  /** شناسه‌ی سکشن‌های مخفی‌شده */
  hidden: string[];
  /** ترتیب صریح سکشن‌ها (کل شناسه‌های شناخته‌شده) */
  order: string[];
  /** سکشن‌های سفارشی */
  custom: SiteCustomSection[];
}

/** حالت پیش‌فرض — هیچ override ای اعمال نشده (رندر ۱:۱ با کد فعلی) */
export const DEFAULT_SITE_CONTENT: SiteContentOverrides = {
  fields: {},
  hidden: [],
  order: [],
  custom: [],
};

// ============ محدودیت‌های امنیتی ============

const LIMITS = {
  fieldsCount: 400,
  fieldValue: 4_000,
  hiddenCount: 40,
  orderCount: 40,
  customCount: 20,
  customIdLen: 60,
  customProps: 12,
  customPropValue: 12_000,
} as const;

const ID_PATTERN = /^[a-z0-9_-]{1,40}$/i;
const CUSTOM_ID_PATTERN = /^cs_[a-z0-9_-]{2,40}$/i;
const SECTION_TYPES: CustomSectionType[] = [
  "html",
  "shortcode",
  "richtext",
  "image-text",
  "cta",
];

/**
 * شناسه‌های سکشن‌های اصلی صفحه فرود — به ترتیب پیش‌فرض.
 * باید با SECTION_META در components/site-editor/section-registry.ts هماهنگ بماند.
 */
export const DEFAULT_SECTION_IDS: readonly string[] = [
  "hero",
  "logos",
  "features",
  "ecosystem",
  "unique-features",
  "stats",
  // v20/v22/v23 — ابزارهای رایگان (خوشهٔ لیدمگنت) — v24: sync با SECTION_META
  "calculators",
  "moadian-lab",
  "financial-health",
  // v24 — ماشین‌حساب بازگشت سرمایه (ROI)
  "roi",
  "pricing",
  "testimonials",
  "faq",
  "cta",
  "blog",
  "footer",
];

// ============ پاک‌سازی HTML سکشن‌های سفارشی ============
// (دفاع عمقی: هم موقع ذخیره در API و هم موقع رندر در کلاینت اجرا می‌شود)

export function sanitizeCustomHtml(raw: string): string {
  if (!raw) return "";
  return raw
    // حذف کامل بلوک‌های تگ خطرناک (باز و بسته)
    .replace(
      /<\s*(script|iframe|object|embed|form|input|link|meta|base)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
      ""
    )
    // حذف تگ‌های باز/خودبسته‌ی خطرناک باقی‌مانده
    .replace(
      /<\s*(script|iframe|object|embed|form|input|link|meta|base)\b[^>]*\/?>/gi,
      ""
    )
    // حذف رویدادهای inline (onclick=... و مشابه)
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // حذف آدرس‌های javascript:
    .replace(/javascript\s*:/gi, "");
}

// ============ نرمال‌سازی ورودی ============

function cleanString(v: unknown, maxLen: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLen) return trimmed.slice(0, maxLen);
  return trimmed;
}

/**
 * نرمال‌سازی و اعتبارسنجی overrides — ورودی نامعتبر بی‌صدا حذف/مهار می‌شود
 * (به‌جای reject کامل، تا ویرایشگر مقاوم بماند). خروجی همیشه shape سالم است.
 */
export function normalizeSiteContent(raw: unknown): SiteContentOverrides {
  const result: SiteContentOverrides = {
    fields: {},
    hidden: [],
    order: [],
    custom: [],
  };
  if (!raw || typeof raw !== "object") return result;
  const input = raw as Record<string, unknown>;

  // fields
  if (input.fields && typeof input.fields === "object") {
    let count = 0;
    for (const [k, v] of Object.entries(input.fields as Record<string, unknown>)) {
      if (count >= LIMITS.fieldsCount) break;
      const key = cleanString(k, 120);
      if (!key) continue;
      const value = cleanString(v, LIMITS.fieldValue);
      if (value === undefined) continue;
      result.fields[key] = value;
      count++;
    }
  }

  // hidden
  if (Array.isArray(input.hidden)) {
    result.hidden = input.hidden
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v) => v && ID_PATTERN.test(v))
      .slice(0, LIMITS.hiddenCount);
  }

  // order
  if (Array.isArray(input.order)) {
    const seen = new Set<string>();
    for (const v of input.order) {
      if (typeof v !== "string") continue;
      const id = v.trim();
      if (!id || !ID_PATTERN.test(id) || seen.has(id)) continue;
      seen.add(id);
      result.order.push(id);
      if (result.order.length >= LIMITS.orderCount) break;
    }
  }

  // custom
  if (Array.isArray(input.custom)) {
    for (const item of input.custom) {
      if (result.custom.length >= LIMITS.customCount) break;
      if (!item || typeof item !== "object") continue;
      const c = item as Record<string, unknown>;
      const id = cleanString(c.id, LIMITS.customIdLen);
      const type = c.type;
      if (!id || !CUSTOM_ID_PATTERN.test(id)) continue;
      if (typeof type !== "string" || !SECTION_TYPES.includes(type as CustomSectionType)) {
        continue;
      }
      const after = cleanString(c.after, 40);
      if (after !== undefined && !ID_PATTERN.test(after)) continue;

      const props: Record<string, string> = {};
      if (c.props && typeof c.props === "object") {
        let pCount = 0;
        for (const [pk, pv] of Object.entries(c.props as Record<string, unknown>)) {
          if (pCount >= LIMITS.customProps) break;
          const key = cleanString(pk, 40);
          if (!key) continue;
          const value = typeof pv === "string" ? pv : "";
          props[key] =
            key === "html"
              ? sanitizeCustomHtml(value.slice(0, LIMITS.customPropValue))
              : value.slice(0, LIMITS.customPropValue);
          pCount++;
        }
      }

      // سکشن تکراری با همین id؟ جایگزین می‌شود
      const existingIdx = result.custom.findIndex((x) => x.id === id);
      const section: SiteCustomSection = {
        id,
        type: type as CustomSectionType,
        after: after || undefined,
        props,
      };
      if (existingIdx >= 0) result.custom[existingIdx] = section;
      else result.custom.push(section);
    }
  }

  // hidden/order فقط از مجموعه‌ی شناسه‌های شناخته‌شده پذیرفته می‌شوند
  // (سکشن‌های اصلی + cs_* های موجود در همین custom)
  const knownCustomIds = new Set(result.custom.map((c) => c.id));
  const isKnownId = (id: string) =>
    DEFAULT_SECTION_IDS.includes(id) || knownCustomIds.has(id);
  result.hidden = result.hidden.filter((id) => isKnownId(id));
  result.order = result.order.filter((id) =>
    DEFAULT_SECTION_IDS.includes(id)
  );

  return result;
}
