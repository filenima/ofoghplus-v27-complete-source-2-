// ============ فروشگاه آنلاین (R15-C) — ثابت‌ها و توابع خالص ============
// این فایل «بدون» import های Node (crypto/db) نوشته شده تا هم در سرور و هم
// کلاینت (components/storefront/*) قابل استفاده باشد. توکن نشست مشتری و
// کوئری‌های دیتابیس در lib/storefront-auth.ts و مسیرهای API هستند.

import { toEnglishDigits } from "@/lib/persian";

// ─── قالب‌های صفحه فرود فروشگاه ───
// مالک پرسیده بود «۵۰ صفحه فرود» — زیرساخت الگوی قالب‌محور است: افزودن
// قالب جدید = یک کامپوننت در components/storefront/templates.tsx + یک
// رکورد در این آرایه (roadmap: توسعه تدریجی تا ۵۰ قالب).
import { STOREFRONT_TEMPLATES_V2 } from "@/lib/storefront-wizard";

export const STOREFRONT_TEMPLATES: { id: string; label: string; description: string }[] = [
  // ─── R16: ۵ قالب سینمایی خانوادهٔ digizlux (کاستومایز خودکار ویزارد) ───
  ...STOREFRONT_TEMPLATES_V2,
  // ─── قالب‌های نسل اول R15 ───
  {
    id: "modern",
    label: "مدرن بازار",
    description: "سبک امروزی با کارت‌های گرد و سایه نرم — مناسب فروشگاه‌های عمومی",
  },
  {
    id: "bazaar",
    label: "بازار سنتی",
    description: "گرم و صمیمی با رنگ‌های خاکی و حاشیه‌های تزیینی — مناسب صنایع دستی و خوراک",
  },
  {
    id: "minimal",
    label: "مینیمال روشن",
    description: "ساده و سفید با فاصله‌های زیاد و تایپوگرافی تمیز — مناسب خدمات و کالای لوکس‌آرام",
  },
  {
    id: "luxury",
    label: "لاکچری تیره",
    description: "پس‌زمینه تیره با لهجه طلایی — مناسب طلا، عطر و کالای پرمیوم",
  },
  {
    id: "retail",
    label: "خرده‌فروشی شاد",
    description: "پرنور و پرانرژی با نوار پیشنهاد ویژه — مناسب پوشاک و اسباب‌بازی",
  },
];

export const STOREFRONT_TEMPLATE_IDS = STOREFRONT_TEMPLATES.map((t) => t.id);

export function isValidStorefrontTemplate(id: string | null | undefined): boolean {
  return !!id && STOREFRONT_TEMPLATE_IDS.includes(id);
}

// ─── وضعیت سفارش ───
export type StorefrontOrderStatus =
  | "PENDING"
  | "AWAITING_RECEIPT"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "SHIPPED";

export const STOREFRONT_ORDER_STATUS_FA: Record<string, string> = {
  PENDING: "در انتظار پرداخت",
  AWAITING_RECEIPT: "در انتظار رسید",
  AWAITING_APPROVAL: "در انتظار تأیید مالک",
  APPROVED: "تأیید شده",
  REJECTED: "رد شده",
  SHIPPED: "ارسال شده",
};

/** رنگ badge وضعیت سفارش (کلاس‌های Tailwind ثابت) */
export function storefrontOrderStatusColor(status: string): string {
  const map: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    AWAITING_RECEIPT: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    AWAITING_APPROVAL: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
    APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    SHIPPED: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  };
  return map[status] || "bg-muted text-muted-foreground";
}

// ─── slug فروشگاه ───
// فقط لاتین (Persian-safe): در URLهای SEO لاتین پایدارتر است و encode مشکلی ندارد
export const STOREFRONT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export const RESERVED_STOREFRONT_SLUGS = new Set([
  "api",
  "app",
  "admin",
  "www",
  "shop",
  "store",
  "login",
  "register",
  "auth",
  "panel",
  "support",
  "blog",
  "pricing",
  "demo",
  "test",
  "dev",
  "staging",
  "docs",
  "help",
  "about",
  "contact",
  "privacy",
  "terms",
  "portal",
  "dashboard",
  "downloads",
  "features",
  "pricing-plans",
  "compare",
  "partners",
  "careers",
  "press",
  "media",
]);

export function validateStorefrontSlug(
  slug: unknown
): { ok: true; slug: string } | { ok: false; error: string } {
  if (typeof slug !== "string") return { ok: false, error: "نام فروشگاه را وارد کنید" };
  const s = slug.trim().toLowerCase();
  if (s.length < 3 || s.length > 40)
    return { ok: false, error: "نام فروشگاه باید ۳ تا ۴۰ نویسه باشد" };
  if (!STOREFRONT_SLUG_PATTERN.test(s))
    return {
      ok: false,
      error: "نام فروشگاه فقط می‌تواند حروف انگلیسی کوچک، رقم و خط تیره باشد (مثال: my-shop123)",
    };
  if (RESERVED_STOREFRONT_SLUGS.has(s))
    return { ok: false, error: "این نام رزرو شده است — نام دیگری انتخاب کنید" };
  return { ok: true, slug: s };
}

// ─── کارت بانکی ───
/** نرمال‌سازی شماره کارت (ارقام فارسی → انگلیسی، حذف غیررقم) — الگوی lib/wallet */
export function normalizeCardNumber(input: string): string {
  return toEnglishDigits(String(input || "")).replace(/\D/g, "");
}

/** نمایش گروه‌بندی‌شده کارت: 6037-9911-XXXX-1234 */
export function formatCardNumberForDisplay(card: string | null | undefined): string {
  const digits = normalizeCardNumber(String(card || ""));
  if (!digits) return "";
  return digits.replace(/(\d{4})(?=\d)/g, "$1-");
}

/** ماسک کارت برای پنل مالک (مالک کارت خود را می‌شناسد): 6037-****-****-1234 */
export function maskCardNumberForPanel(card: string | null | undefined): string {
  const digits = normalizeCardNumber(String(card || ""));
  if (digits.length < 12) return "—";
  return `${digits.slice(0, 4)}-****-****-${digits.slice(-4)}`;
}

/** اعتبارسنجی شماره کارت شتاب (۱۶ رقمی) یا کارت‌های ۱۹-۲۰ رقمی */
export function isValidCardNumber(card: string): boolean {
  const digits = normalizeCardNumber(card);
  return /^(\d{16}|\d{19,20})$/.test(digits);
}

// ─── DTO رابط مشترک سرور/کلاینت ───
export interface StorefrontProductDTO {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceRial: string; // BigInt → رشته (قیمت فروش Product.salePrice)
  inStock: boolean;
  stockKnown: boolean; // اگر StockItem نداشت → نامشخص (پیش‌فرض موجود)
  category?: string | null; // R16: دستهٔ خودکار/مالک برای فیلتر پیشرفته
  // ─── Task 4: فیلدهای اختیاری فروشگاه (گاردشده — نبودشان خطا نمی‌سازد) ───
  slug?: string | null; // اسلاگ لاتین کالا برای URL سئوپسند
  discountPercent?: number | null; // تخفیف اختصاصی کالا (٪)
  displayPriceRial?: string; // قیمت پس از تخفیف (ریال)
  gallery?: string[]; // مسیرهای تصاویر گالری
  ratingAvg?: number; // میانگین امتیاز نظرات تأییدشده
  ratingCount?: number; // تعداد نظرات تأییدشده
  stock?: number; // مقدار موجودی انبار (فقط وقتی stockKnown است — نوار پیشرفت موجودی کارت‌ها)
}

/** قیمت واحد مؤثر کالا برای سبد/سفارش — همیشه قیمت پس از تخفیف اختصاصی */
export function effectiveUnitPriceRial(p: StorefrontProductDTO): string {
  if (p.discountPercent && p.discountPercent > 0 && p.displayPriceRial) return p.displayPriceRial;
  return p.priceRial;
}

export interface StorefrontShopDTO {
  slug: string;
  title: string;
  description: string | null;
  template: string;
  accentColor: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  socialInstagram: string | null;
  socialTelegram: string | null;
  socialWhatsapp: string | null;
  // اطلاعات کارت برای مشتری کامل نمایش داده می‌شود (برای پرداخت لازم است)
  cardNumber: string | null;
  cardHolderName: string | null;
  cardImage: string | null;
  tenantName: string;
  // ─── R16: سایت‌ساز هوشمند ───
  businessType?: string | null;
  announcement?: string | null;
  ticketEnabled?: boolean;
  discountActive?: boolean; // فقط «آیا تخفیف فعال است» — کد مخفی می‌ماند
  discountPercent?: number | null;
  content?: unknown; // JSON محتوای ویرایش‌شدهٔ مالک (StorefrontContent)
  // ─── Task 1-c: درگاه آنلاین ───
  hasGateway?: boolean; // فقط وجودش افشا می‌شود — merchantId هرگز برای کلاینت نمی‌آید
}

export interface StorefrontOrderItemDTO {
  productId: string;
  name: string;
  priceRial: string;
  qty: number;
  imageUrl: string | null;
}

/** سقف‌های اعتبارسنجی سفارش عمومی */
export const STOREFRONT_MAX_ORDER_ITEMS = 50;
export const STOREFRONT_MAX_QTY_PER_ITEM = 99;
export const STOREFRONT_ORDER_NOTE_MAX = 500;

/** کوکی نشست مشتری فروشگاه (امضاشده HMAC — stateless) */
export const STOREFRONT_CUSTOMER_COOKIE = "hoshhesab_sf_customer";
export const STOREFRONT_CUSTOMER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // ۳۰ روز

/** ساخت bbox و embed-URL نقشه OSM — بدون هیچ پکیج نقشه‌ای */
export function osmEmbedUrl(lat: number, lng: number, delta = 0.008): string {
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta]
    .map((n) => n.toFixed(4))
    .join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox
  )}&layer=mapnik&marker=${encodeURIComponent(`${lat.toFixed(4)},${lng.toFixed(4)}`)}`;
}

/** لینک «مشاهده روی نقشه» در OSM */
export function osmLinkUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

/** قیمت ریال → تومان قالب‌بندی‌شده با ارقام فارسی (نمایش مشتری) */
export function rialToTomanLabel(rial: string | number | bigint): string {
  const n = typeof rial === "bigint" ? Number(rial) : Number(rial);
  const toman = Math.trunc(n / 10);
  return `${new Intl.NumberFormat("fa-IR").format(toman)} تومان`;
}

