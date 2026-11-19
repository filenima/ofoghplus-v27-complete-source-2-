// ============ فروشگاه آنلاین (R15-C) — کمکی‌های سمت سرور ============
// نیازمند Node (crypto + db) — فقط در مسیرهای API و Server Components استفاده شود.

import { NextRequest } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { encryptField, decryptField } from "@/lib/db-encryption";
import {
  STOREFRONT_CUSTOMER_COOKIE,
  STOREFRONT_CUSTOMER_TOKEN_TTL_MS,
  STOREFRONT_MAX_ORDER_ITEMS,
  STOREFRONT_MAX_QTY_PER_ITEM,
  type StorefrontOrderItemDTO,
  type StorefrontProductDTO,
} from "@/lib/storefront";

/* ═══════════════ نشست مشتری فروشگاه (stateless HMAC) ═══════════════
 * مشتری فروشگاه جدول سبک مستقل از User اصلی است؛ نشست او را با یک توکن
 * امضاشده (JWT-lite همان الگوی session-lite اما نوع sf_customer) نگه
 * می‌داریم — بدون رکورد DB، بدون نشت state. کوکی httpOnly.
 */

function getSfTokenSecret(): string {
  const s = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY;
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET/ENCRYPTION_KEY for storefront customer token is required in production");
    }
    return "dev-only-sf-customer-secret";
  }
  return s;
}

export interface SfCustomerTokenPayload {
  type: "sf_customer";
  cid: string; // شناسه مشتری
  sfid: string; // شناسه فروشگاه
  exp: number;
}

export function signSfCustomerToken(customerId: string, storefrontId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload: SfCustomerTokenPayload = {
    type: "sf_customer",
    cid: customerId,
    sfid: storefrontId,
    exp: Date.now() + STOREFRONT_CUSTOMER_TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSfTokenSecret())
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifySfCustomerToken(token: string | null | undefined): SfCustomerTokenPayload | null {
  if (!token) return null;
  try {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return null;
    const expected = crypto
      .createHmac("sha256", getSfTokenSecret())
      .update(`${header}.${body}`)
      .digest("base64url");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SfCustomerTokenPayload;
    if (payload?.type !== "sf_customer" || typeof payload.cid !== "string") return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** خواندن مشتری واردشده از کوکی — فقط اگر توکن به همین فروشگاه تعلق داشته باشد */
export async function getSfCustomerFromCookie(
  req: NextRequest,
  storefrontId: string
): Promise<{ id: string; email: string; name: string; phone: string | null } | null> {
  const token = req.cookies.get(STOREFRONT_CUSTOMER_COOKIE)?.value;
  const payload = verifySfCustomerToken(token);
  if (!payload || payload.sfid !== storefrontId) return null;
  try {
    const customer = await db.storefrontCustomer.findUnique({
      where: { id: payload.cid },
      select: { id: true, email: true, name: true, phone: true, storefrontId: true },
    });
    if (!customer || customer.storefrontId !== storefrontId) return null;
    return { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone };
  } catch {
    return null;
  }
}

/* ═══════════════ کوئری‌های فروشگاه ═══════════════ */

export async function getStorefrontBySlug(slug: string) {
  return db.storefront.findUnique({ where: { slug } });
}

export async function getStorefrontByTenant(tenantId: string) {
  return db.storefront.findUnique({ where: { tenantId } });
}

/** نام tenant برای نمایش در فروشگاه (بدون relation سنگین) */
export async function getTenantName(tenantId: string): Promise<string> {
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    return tenant?.name ?? "فروشگاه";
  } catch {
    return "فروشگاه";
  }
}

/**
 * v20 — DTO کالای فروشگاه با متای اختصاصی (تخفیف/سئو/گالری)
 * discountPercent: تخفیف اختصاصی کالا (٪ ۱-۹۰)؛ displayPriceRial: قیمت پس از تخفیف.
 */
export type StorefrontProductWithMetaDTO = StorefrontProductDTO & {
  discountPercent?: number | null;
  displayPriceRial?: string;
};

/** v20 — محاسبهٔ قیمت نهایی پس از تخفیف اختصاصی کالا (ریال) */
export function applyProductDiscount(
  salePriceRial: bigint,
  discountPercent: number | null | undefined
): { discountPercent: number | null; displayPriceRial: string } {
  const d = discountPercent && discountPercent > 0 ? Math.min(90, Math.trunc(discountPercent)) : null;
  if (!d) return { discountPercent: null, displayPriceRial: salePriceRial.toString() };
  const final = (salePriceRial * BigInt(100 - d)) / 100n;
  return { discountPercent: d, displayPriceRial: final.toString() };
}

/**
 * کالاهای فروشگاه — همگام‌سازی زنده از Product (deletedAt null) موجودی هر کالا
 * از مجموع StockItem همه انبارها؛ اگر هیچ ردیف انجاری نبود → نامشخص (پیش‌فرض «موجود»).
 * v20: سقف ۵۰۰ کالا + ادغام StorefrontProductMeta (تخفیف اختصاصی، نمایش در فروشگاه) —
 * کالاهایی که مالک showInStore=false گذاشته از فروشگاه عمومی حذف می‌شوند.
 * Task 4: گالری + اسلاگ + امتیاز نظرات تأییدشده هم به DTO اضافه شد
 * (امتیازها با یک groupBy — کارت‌های فروشگاه ستاره نشان می‌دهند).
 */
export async function getStorefrontProducts(tenantId: string): Promise<StorefrontProductWithMetaDTO[]> {
  const products = await db.product.findMany({
    where: { tenantId, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      salePrice: true,
      createdAt: true,
      slug: true,
      // R16 — دسته برای فیلتر پیشرفتهٔ فروشگاه
      categoryId: true,
      category: { select: { name: true } },
      // v20 — متای اختصاصی فروشگاه (تخفیف/نمایش)
      storefrontMeta: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  if (products.length === 0) return [];

  const stockRows = await db.stockItem.groupBy({
    by: ["productId"],
    where: { tenantId },
    _sum: { quantity: true },
  });
  const stockMap = new Map(stockRows.map((r) => [r.productId, r._sum.quantity ?? 0]));

  // Task 4 — امتیاز تجمیعی نظرات تأییدشدهٔ هر کالا (یک کوئری برای همه)
  // (StorefrontReview tenantId ندارد — فیلتر با productIdهای همین tenant)
  const ratingRows = await db.storefrontReview
    .groupBy({
      by: ["productId"],
      where: { status: "APPROVED", productId: { in: products.map((p) => p.id) } },
      _avg: { rating: true },
      _count: { _all: true },
    })
    .catch(
      () =>
        [] as {
          productId: string | null;
          _avg: { rating: number | null };
          _count: { _all: number };
        }[]
    );
  const ratingMap = new Map(
    ratingRows
      .filter((r) => r.productId)
      .map((r) => [
        r.productId as string,
        { avg: r._avg.rating != null ? Math.round(r._avg.rating * 10) / 10 : 0, count: r._count._all },
      ])
  );

  const out: StorefrontProductWithMetaDTO[] = [];
  for (const p of products) {
    // مالک کالا را از فروشگاه پنهان کرده — عمومی نمی‌آید
    if (p.storefrontMeta && p.storefrontMeta.showInStore === false) continue;
    const stockKnown = stockMap.has(p.id);
    const qty = stockMap.get(p.id) ?? 0;
    const { discountPercent, displayPriceRial } = applyProductDiscount(p.salePrice, p.storefrontMeta?.discountPercent ?? null);
    let gallery: string[] = [];
    if (p.storefrontMeta?.galleryJson) {
      try {
        const parsedGallery = JSON.parse(p.storefrontMeta.galleryJson);
        if (Array.isArray(parsedGallery)) {
          gallery = parsedGallery.filter((g): g is string => typeof g === "string").slice(0, 24);
        }
      } catch {
        /* galleryJson خراب — گالری خالی */
      }
    }
    const rating = ratingMap.get(p.id);
    out.push({
      id: p.id,
      name: p.name,
      description: p.description,
      imageUrl: p.imageUrl,
      priceRial: p.salePrice.toString(),
      // نامشخص بودن موجودی ≠ ناموجود — کالای بدون ردیف انبار را «موجود» نشان می‌دهیم
      inStock: !stockKnown || qty > 0,
      stockKnown,
      category: p.category?.name ?? null,
      ...(discountPercent ? { discountPercent, displayPriceRial } : {}),
      ...(p.slug ? { slug: p.slug } : {}),
      ...(gallery.length ? { gallery } : {}),
      ...(rating && rating.count > 0 ? { ratingAvg: rating.avg, ratingCount: rating.count } : {}),
      ...(stockKnown ? { stock: qty } : {}),
    });
  }
  return out;
}

/**
 * اعتبارسنجی آیتم‌های سفارش + قیمت‌گذاری مجدد سمت سرور (قیمت هرگز از کلاینت پذیرفته نمی‌شود)
 * Task 4-FIX: تخفیف اختصاصی کالا (StorefrontProductMeta.discountPercent) اینجا اعمال
 * می‌شود — قبلاً کارت کالا قیمت تخفیف‌دار نشان می‌داد اما سفارش با قیمت کامل
 * ثبت می‌شد (باگ پولی). حالا قیمت هر قلم = قیمت پس از تخفیف اختصاصی.
 */
export async function priceOrderItemsServerSide(
  tenantId: string,
  rawItems: unknown
): Promise<{ ok: true; items: StorefrontOrderItemDTO[]; totalRial: bigint } | { ok: false; error: string }> {
  if (!Array.isArray(rawItems) || rawItems.length === 0)
    return { ok: false, error: "سبد خرید خالی است" };
  if (rawItems.length > STOREFRONT_MAX_ORDER_ITEMS)
    return { ok: false, error: "تعداد اقلام سبد بیش از حد مجاز است" };

  type Parsed = { productId: string; qty: number };
  const parsed: Parsed[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "آیتم نامعتبر در سبد" };
    const r = raw as Record<string, unknown>;
    const productId = typeof r.productId === "string" ? r.productId : "";
    const qty = typeof r.qty === "number" ? Math.trunc(r.qty) : Number.NaN;
    if (!productId || !Number.isFinite(qty) || qty < 1 || qty > STOREFRONT_MAX_QTY_PER_ITEM)
      return { ok: false, error: "تعداد یا شناسه کالا نامعتبر است" };
    if (parsed.some((p) => p.productId === productId))
      return { ok: false, error: "کالا تکراری در سبد است" };
    parsed.push({ productId, qty });
  }

  const products = await db.product.findMany({
    where: { tenantId, deletedAt: null, id: { in: parsed.map((p) => p.productId) } },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      salePrice: true,
      // Task 4-FIX — تخفیف اختصاصی کالا باید در قیمت سفارش لحاظ شود
      storefrontMeta: { select: { discountPercent: true, showInStore: true } },
    },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));
  if (products.length !== parsed.length)
    return { ok: false, error: "برخی کالاهای سبد یافت نشد — سبد را به‌روزرسانی کنید" };

  let total = 0n;
  const items: StorefrontOrderItemDTO[] = [];
  for (const p of parsed) {
    const product = productMap.get(p.productId)!;
    // کالای مخفی‌شده از فروشگاه قابل سفارش نیست (مالک showInStore=false گذاشته)
    if (product.storefrontMeta?.showInStore === false) {
      return { ok: false, error: `کالای «${product.name}» در فروشگاه موجود نیست — سبد را به‌روزرسانی کنید` };
    }
    // Task 4-FIX — قیمت هر قلم با تخفیف اختصاصی کالا محاسبه می‌شود
    const { discountPercent, displayPriceRial } = applyProductDiscount(
      product.salePrice,
      product.storefrontMeta?.discountPercent ?? null
    );
    const unitRial = discountPercent ? BigInt(displayPriceRial) : product.salePrice;
    const line = unitRial * BigInt(p.qty);
    total += line;
    items.push({
      productId: product.id,
      name: product.name,
      priceRial: unitRial.toString(),
      qty: p.qty,
      imageUrl: product.imageUrl,
    });
  }
  return { ok: true, items, totalRial: total };
}

/** رمزگشایی شماره کارت برای نمایش به مشتری (لازم است برای پرداخت کامل دیده شود) */
export function decryptCardNumber(cardNumberEnc: string | null | undefined): string | null {
  return decryptField(cardNumberEnc);
}

/** رمزنگاری شماره کارت قبل از ذخیره (الگوی کیف پول) */
export function encryptCardNumber(cardNumber: string | null | undefined): string | null {
  return encryptField(cardNumber);
}

/* ═══════════════ اعلان مالک ═══════════════ */

/**
 * اعلان درون‌برنامه‌ای برای مالک کسب‌وکار — کاربر ADMIN قدیمی tenant
 * (اگر نبود، اولین کاربر فعال). آیف استراتژی «everything automatic» است:
 * سفارش جدید = زنگ اعلان مالک بدون هیچ اقدامی.
 */
export async function notifyStorefrontOwner(
  storefront: { tenantId: string; title: string },
  title: string,
  message: string,
  link = "storefront"
): Promise<void> {
  try {
    const owner = await db.user.findFirst({
      where: { tenantId: storefront.tenantId, role: "ADMIN", deletedAt: null, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    let userId = owner?.id ?? null;
    if (!userId) {
      const anyUser = await db.user.findFirst({
        where: { tenantId: storefront.tenantId, deletedAt: null, isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      userId = anyUser?.id ?? null;
    }
    await db.notification.create({
      data: {
        tenantId: storefront.tenantId,
        userId,
        title,
        message,
        type: "SUCCESS",
        link,
      },
    });
  } catch (err) {
    console.error("[storefront] notifyStorefrontOwner failed:", err instanceof Error ? err.message : err);
  }
}
