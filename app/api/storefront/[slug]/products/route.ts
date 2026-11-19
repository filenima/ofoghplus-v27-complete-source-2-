import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorefrontBySlug, applyProductDiscount } from "@/lib/storefront-auth";
import type { StorefrontProductDTO } from "@/lib/storefront";
import { normalizeFaText } from "@/lib/storefront-wizard";
import { toEnglishDigits } from "@/lib/persian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/storefront/[slug]/products — جستجو/فیلتر/مرتب‌سازی/صفحه‌بندی سمت سرور (Task 1-b)
 * ============================================================================
 * پارامترها:
 *   q        — جستجو در نام + توضیحات + بارکد (نرمال‌سازی فارسی: ارقام فارسی→انگلیسی،
 *              حذف اعراب، نیم‌فاصله→فاصله، حروف کوچک)
 *   cat      — نام دقیق دسته
 *   min/max  — بازهٔ قیمت به «تومان» (شامل خود مرز)
 *   inStock  — 1 یعنی فقط موجود
 *   sort     — newest (پیش‌فرض) | cheapest | expensive | name
 *   page     — ۱ مبنا (پیش‌فرض ۱)
 *   limit    — پیش‌فرض ۲۴، حداکثر ۶۰
 *
 * پاسخ:
 *   { success, products, total, page, limit, pages, facets }
 *   facets = { categories: [{name,count}], price: {min,max} (تومان), inStock, totalAll }
 */

const MAX_FETCH = 500;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

/** نرمال‌سازی متن فارسی برای جستجو (یکسان با موتور دسته‌بندی خودکار) */
function normalizeSearch(input: string): string {
  return toEnglishDigits(normalizeFaText(String(input ?? "")).toLowerCase()).replace(/\s+/g, " ").trim();
}

function parsePositiveInt(raw: string | null, fallback: number, max: number): number {
  const n = Number.parseInt(toEnglishDigits(String(raw ?? "")), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/** تبدیل ورودی تومانی به ریال BigInt (ورودی ممکن است ارقام فارسی/اعشار داشته باشد) */
function parseTomanToRial(raw: string | null): bigint | null {
  if (raw == null) return null;
  const cleaned = toEnglishDigits(String(raw)).replace(/[_,٬،\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const toman = Math.trunc(Number(cleaned));
  if (!Number.isFinite(toman) || toman < 0) return null;
  return BigInt(toman) * 10n; // تومان → ریال
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const storefront = await getStorefrontBySlug(slug);
    if (!storefront || !storefront.isActive) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد یا فعال نیست" }, { status: 404 });
    }
    // Task 3-d — تعلیق سوپرادمینی
    if (storefront.status === "suspended") {
      return NextResponse.json(
        { success: false, error: "این فروشگاه موقتاً تعلیق شده است" },
        { status: 503 }
      );
    }

    const sp = req.nextUrl.searchParams;
    const q = normalizeSearch(sp.get("q") ?? "");
    const cat = (sp.get("cat") ?? "").trim().slice(0, 120) || null;
    const minRial = parseTomanToRial(sp.get("min"));
    const maxRial = parseTomanToRial(sp.get("max"));
    const inStockOnly = sp.get("inStock") === "1" || sp.get("inStock") === "true";
    const sort = (sp.get("sort") ?? "newest").trim();
    const sortMode: "newest" | "cheapest" | "expensive" | "name" =
      sort === "cheapest" || sort === "expensive" || sort === "name" ? sort : "newest";
    const page = parsePositiveInt(sp.get("page"), 1, 10000);
    const limit = parsePositiveInt(sp.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);

    if (minRial !== null && maxRial !== null && minRial > maxRial) {
      return NextResponse.json(
        { success: false, error: "حداقل قیمت نباید از حداکثر بیشتر باشد" },
        { status: 400 }
      );
    }

    // کالاهای زندهٔ همین tenant (سقف ۵۰۰ — فروشگاه‌های واقعی در این محدوده جا می‌شوند)
    const rows = await db.product.findMany({
      where: { tenantId: storefront.tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true,
        salePrice: true,
        createdAt: true,
        barcode: true,
        slug: true,
        category: { select: { name: true } },
        // v20 — متای اختصاصی فروشگاه (تخفیف/نمایش در فروشگاه)
        storefrontMeta: true,
      },
      take: MAX_FETCH,
    });

    const stockRows = await db.stockItem.groupBy({
      by: ["productId"],
      where: { tenantId: storefront.tenantId },
      _sum: { quantity: true },
    });
    const stockMap = new Map(stockRows.map((r) => [r.productId, r._sum.quantity ?? 0]));

    // Task 4 — امتیاز تجمیعی نظرات تأییدشدهٔ هر کالا (ستاره‌ها روی کارت‌های فروشگاه)
    const ratingRows = await db.storefrontReview
      .groupBy({
        by: ["productId"],
        where: { status: "APPROVED", productId: { in: rows.map((p) => p.id) } },
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

    // DTO + ایندکس جستجوی نرمال‌شده
    // v20: کالاهایی که مالک showInStore=false گذاشته از نتایج/فاسِت‌ها حذف می‌شوند؛
    // تخفیف اختصاصی کالا هم ادغام می‌شود (discountPercent + displayPriceRial).
    // Task 4: گالری + اسلاگ + امتیاز نظرات هم اضافه شد.
    type Row = StorefrontProductDTO & {
      _createdAt: Date;
      _q: string;
      discountPercent?: number | null;
      displayPriceRial?: string;
    };
    const all: Row[] = [];
    for (const p of rows) {
      if (p.storefrontMeta && p.storefrontMeta.showInStore === false) continue;
      const stockKnown = stockMap.has(p.id);
      const qty = stockMap.get(p.id) ?? 0;
      const category = p.category?.name ?? null;
      const { discountPercent, displayPriceRial } = applyProductDiscount(
        p.salePrice,
        p.storefrontMeta?.discountPercent ?? null
      );
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
      let tags: string[] = [];
      if (p.storefrontMeta?.tagsJson) {
        try {
          const parsedTags = JSON.parse(p.storefrontMeta.tagsJson);
          if (Array.isArray(parsedTags)) tags = parsedTags.filter((t): t is string => typeof t === "string").slice(0, 15);
        } catch {
          /* ignore */
        }
      }
      all.push({
        id: p.id,
        name: p.name,
        description: p.description,
        imageUrl: p.imageUrl,
        priceRial: p.salePrice.toString(),
        inStock: !stockKnown || qty > 0,
        stockKnown,
        category,
        ...(discountPercent ? { discountPercent, displayPriceRial } : {}),
        ...(p.slug ? { slug: p.slug } : {}),
        ...(gallery.length ? { gallery } : {}),
        ...(rating && rating.count > 0 ? { ratingAvg: rating.avg, ratingCount: rating.count } : {}),
        ...(stockKnown ? { stock: qty } : {}),
        _createdAt: p.createdAt,
        _q: normalizeSearch(`${p.name} ${p.description ?? ""} ${p.barcode ?? ""} ${category ?? ""} ${tags.join(" ")}`),
      });
    }

    // ── فاسِت‌ها روی کل کاتالوگ (برای چیپ‌های دسته و بازهٔ قیمت) ──
    const catCounts = new Map<string, number>();
    let priceMinRial: bigint | null = null;
    let priceMaxRial: bigint | null = null;
    let inStockCount = 0;
    for (const p of all) {
      if (p.category) catCounts.set(p.category, (catCounts.get(p.category) ?? 0) + 1);
      const price = BigInt(p.priceRial);
      if (priceMinRial === null || price < priceMinRial) priceMinRial = price;
      if (priceMaxRial === null || price > priceMaxRial) priceMaxRial = price;
      if (p.inStock) inStockCount += 1;
    }

    // ── فیلترها ──
    let list = all;
    if (q) list = list.filter((p) => p._q.includes(q));
    if (cat) list = list.filter((p) => p.category === cat);
    if (minRial !== null) list = list.filter((p) => BigInt(p.priceRial) >= minRial);
    if (maxRial !== null) list = list.filter((p) => BigInt(p.priceRial) <= maxRial);
    if (inStockOnly) list = list.filter((p) => p.inStock);

    // ── مرتب‌سازی ──
    if (sortMode === "cheapest") {
      list = [...list].sort((a, b) => (BigInt(a.priceRial) < BigInt(b.priceRial) ? -1 : BigInt(a.priceRial) > BigInt(b.priceRial) ? 1 : 0));
    } else if (sortMode === "expensive") {
      list = [...list].sort((a, b) => (BigInt(a.priceRial) > BigInt(b.priceRial) ? -1 : BigInt(a.priceRial) < BigInt(b.priceRial) ? 1 : 0));
    } else if (sortMode === "name") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, "fa"));
    } else {
      list = [...list].sort((a, b) => b._createdAt.getTime() - a._createdAt.getTime());
    }

    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, pages);
    const start = (safePage - 1) * limit;
    const pageItems = list.slice(start, start + limit).map(
      ({ _createdAt: _c, _q: _s, ...row }) => row
    );

    return NextResponse.json({
      success: true,
      products: pageItems,
      total,
      page: safePage,
      limit,
      pages,
      facets: {
        categories: [...catCounts.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20),
        price: {
          min: priceMinRial !== null ? Math.trunc(Number(priceMinRial) / 10) : null, // تومان
          max: priceMaxRial !== null ? Math.trunc(Number(priceMaxRial) / 10) : null, // تومان
        },
        inStock: inStockCount,
        totalAll: all.length,
      },
    });
  } catch (error) {
    console.error("[storefront products GET] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در دریافت کالاها" }, { status: 500 });
  }
}
