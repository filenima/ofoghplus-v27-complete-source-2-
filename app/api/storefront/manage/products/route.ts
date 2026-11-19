import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PRODUCTS = 500;

/**
 * v20-C — GET /api/storefront/manage/products
 * فهرست کامل کالاهای مالک برای ویرایشگر حرفه‌ای فروشگاه (برخلاف API عمومی
 * /api/storefront/[slug] که وقتی فروشگاه isActive=false است 404 می‌دهد، این
 * مسیر همیشه کار می‌کند — مالک باید بتواند قبل از فعال‌سازی هم محتوا ویرایش کند).
 *
 * auth: requireUser (همان الگوی /api/storefront/manage)
 *
 * پاسخ:
 *   {
 *     success: true,
 *     products: [{
 *       id, sku, name,
 *       salePrice, purchasePrice, wholesalePrice,      // رشتهٔ ریال (BigInt)
 *       priceRial,                                      // = salePrice (سازگاری DTO عمومی)
 *       barcode, goodsCode, unit, description, imageUrl,
 *       categoryId, categoryName, category,
 *       stock, stockKnown, inStock,                     // مجموع StockItem همهٔ انبارها
 *       minStock, maxStock,
 *       discountPercent, seoTitle, seoDescription,      // از StorefrontProductMeta
 *       showInStore, sortOrder,
 *       gallery: string[]                               // گالری تصاویر (galleryJson)
 *     }],
 *     total,
 *     rates: { usdRateToman, cnyRateToman }             // نمایش چندارزی
 *   }
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const rows = await db.product.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        sku: true,
        name: true,
        barcode: true,
        goodsCode: true,
        unit: true,
        description: true,
        imageUrl: true,
        slug: true,
        salePrice: true,
        purchasePrice: true,
        wholesalePrice: true,
        minStock: true,
        maxStock: true,
        createdAt: true,
        categoryId: true,
        category: { select: { id: true, name: true } },
        storefrontMeta: true,
      },
      orderBy: { createdAt: "desc" },
      take: MAX_PRODUCTS,
    });

    const stockRows = await db.stockItem.groupBy({
      by: ["productId"],
      where: { tenantId },
      _sum: { quantity: true },
    });
    const stockMap = new Map(stockRows.map((r) => [r.productId, r._sum.quantity ?? 0]));

    const products = rows.map((p) => {
      const stockKnown = stockMap.has(p.id);
      const qty = stockMap.get(p.id) ?? 0;
      let gallery: string[] = [];
      if (p.storefrontMeta?.galleryJson) {
        try {
          const parsed = JSON.parse(p.storefrontMeta.galleryJson);
          if (Array.isArray(parsed)) {
            gallery = parsed.filter((g): g is string => typeof g === "string").slice(0, 24);
          }
        } catch {
          /* galleryJson خراب — گالری خالی */
        }
      }
      let tags: string[] = [];
      if (p.storefrontMeta?.tagsJson) {
        try {
          const parsedTags = JSON.parse(p.storefrontMeta.tagsJson);
          if (Array.isArray(parsedTags)) {
            tags = parsedTags.filter((t): t is string => typeof t === "string").slice(0, 15);
          }
        } catch {
          /* ignore */
        }
      }
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        // قیمت‌ها به ریال (رشته) — UI با rialToTomanLabel نمایش می‌دهد
        salePrice: p.salePrice.toString(),
        purchasePrice: p.purchasePrice.toString(),
        wholesalePrice: p.wholesalePrice.toString(),
        priceRial: p.salePrice.toString(),
        barcode: p.barcode,
        goodsCode: p.goodsCode,
        unit: p.unit,
        description: p.description,
        imageUrl: p.imageUrl,
        slug: p.slug ?? null,
        categoryId: p.categoryId,
        categoryName: p.category?.name ?? null,
        category: p.category?.name ?? null,
        stock: qty,
        stockKnown,
        inStock: !stockKnown || qty > 0,
        minStock: p.minStock,
        maxStock: p.maxStock,
        // ── متای اختصاصی فروشگاه ──
        discountPercent: p.storefrontMeta?.discountPercent ?? null,
        seoTitle: p.storefrontMeta?.seoTitle ?? null,
        seoDescription: p.storefrontMeta?.seoDescription ?? null,
        showInStore: p.storefrontMeta ? p.storefrontMeta.showInStore : true,
        sortOrder: p.storefrontMeta?.sortOrder ?? 0,
        gallery,
        tags,
        weightGrams: p.storefrontMeta?.weightGrams ?? null,
        shippingNote: p.storefrontMeta?.shippingNote ?? null,
      };
    });

    // نرخ ارز برای نمایش چندارزی (مکمل — نبودش فهرست را نمی‌شکند)
    let usdRateToman: number | null = null;
    let cnyRateToman: number | null = null;
    try {
      const rates = await db.exchangeRateHistory.findMany({
        where: { fromCurrency: { in: ["USD", "CNY"] }, toCurrency: "IRR" },
        orderBy: { recordedAt: "desc" },
        take: 20,
      });
      const usd = rates.find((r) => r.fromCurrency === "USD");
      const cny = rates.find((r) => r.fromCurrency === "CNY");
      if (usd && Number(usd.rate) > 0) usdRateToman = Math.trunc(Number(usd.rate) / 10);
      if (cny && Number(cny.rate) > 0) cnyRateToman = Math.trunc(Number(cny.rate) / 10);
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      success: true,
      products,
      total: products.length,
      rates: { usdRateToman, cnyRateToman },
    });
  } catch (error) {
    console.error("[storefront manage products GET] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت کالاها" },
      { status: 500 }
    );
  }
}
