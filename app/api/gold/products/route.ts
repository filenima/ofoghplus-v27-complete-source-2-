import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog } from "@/lib/auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { karatGramPrice, resolveGoldRate } from "@/lib/gold";
import { parseAmount } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
 * /api/gold/products — کالاهای طلا (tenant-scoped)
 * ============================================================
 * GET  : لیست کالاهای طلا + ارزش لحظه‌ای هر کالا بر اساس نرخ جاری
 *        ?search=&karat=&active=&category=
 * POST : ایجاد کالای طلا { name, karat, weightGrams, makingChargeType,
 *        makingChargeValue, stoneWeight, stonePriceRial, stockWeightGrams,
 *        sellerProfitRate, category }
 */

const isDev = process.env.NODE_ENV !== "production";

const VALID_KARATS = [24, 22, 18, 14];

function serializeGoldProduct(
  p: {
    id: string;
    name: string;
    karat: number;
    weightGrams: number;
    makingChargeType: string;
    makingChargeValue: number;
    stoneWeight: number;
    stonePriceRial: bigint;
    stockWeightGrams: number;
    sellerProfitRate: number;
    category: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    [key: string]: unknown;
  },
  karat24Rial: number
) {
  const stonePriceRial = Number(p.stonePriceRial);
  const gramPrice = karat24Rial > 0 ? karatGramPrice(karat24Rial, p.karat) : 0;
  const netWeight = Math.max(0, p.weightGrams - p.stoneWeight);
  const goldValueRial = Math.round(netWeight * gramPrice);
  const makingChargeRial =
    p.makingChargeType === "PERCENT"
      ? Math.round((goldValueRial * p.makingChargeValue) / 100)
      : Math.round(p.makingChargeValue * netWeight);
  return {
    ...p,
    stonePriceRial,
    gramPriceRial: gramPrice,
    goldValueRial,
    makingChargeRial,
    totalValueRial: goldValueRial + makingChargeRial + stonePriceRial,
    stockCount: p.weightGrams > 0 ? Math.floor(p.stockWeightGrams / p.weightGrams) : 0,
  };
}

// GET /api/gold/products
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const tenantId = ctx.tenantId;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const karat = searchParams.get("karat");
    const active = searchParams.get("active");
    const category = searchParams.get("category");

    const where: Record<string, unknown> = { tenantId };
    if (karat && VALID_KARATS.includes(Number(karat))) where.karat = Number(karat);
    if (active === "true") where.isActive = true;
    if (active === "false") where.isActive = false;
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { category: { contains: search } },
      ];
    }

    const [products, rate] = await Promise.all([
      db.goldProduct.findMany({
        where,
        orderBy: { createdAt: "desc" },
      }),
      resolveGoldRate(),
    ]);

    const karat24 = rate.karat24Rial;
    const serialized = products.map((p) => serializeGoldProduct(p, karat24));

    // خلاصهٔ موجودی وزنی کل (به تفکیک عیار)
    const karatSummary: Record<number, { grams: number; valueRial: number }> = {};
    for (const p of serialized) {
      if (!p.isActive) continue;
      const ks = (karatSummary[p.karat] ??= { grams: 0, valueRial: 0 });
      ks.grams += p.stockWeightGrams;
      ks.valueRial += Math.round(p.stockWeightGrams * p.gramPriceRial);
    }
    const totalWeight = Object.values(karatSummary).reduce((s, k) => s + k.grams, 0);
    const totalValueRial = Object.values(karatSummary).reduce((s, k) => s + k.valueRial, 0);

    return NextResponse.json({
      success: true,
      data: serialized,
      total: serialized.length,
      rateOk: rate.ok,
      summary: { karatSummary, totalWeightGrams: Math.round(totalWeight * 1000) / 1000, totalValueRial },
    });
  } catch (error) {
    console.error("gold-products GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "خطا در دریافت کالاهای طلا",
        ...(isDev && { devMessage: error instanceof Error ? error.message : String(error) }),
      },
      { status: 500 }
    );
  }
}

// POST /api/gold/products
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`gold-product-create:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." },
        { status: 429 }
      );
    }

    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const tenantId = ctx.tenantId;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // نرمال‌سازی ارقام فارسی/جداکننده در فیلدهای عددی
    for (const key of [
      "weightGrams",
      "makingChargeValue",
      "stoneWeight",
      "stonePriceRial",
      "stockWeightGrams",
      "sellerProfitRate",
    ]) {
      if (typeof body[key] === "string") {
        const n = parseAmount(body[key] as string);
        if (n !== null) body[key] = n;
      }
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { success: false, error: "نام کالای طلا الزامی است" },
        { status: 400 }
      );
    }
    const karat = Number(body.karat) || 18;
    if (!VALID_KARATS.includes(karat)) {
      return NextResponse.json(
        { success: false, error: "عیار باید ۲۴، ۲۲، ۱۸ یا ۱۴ باشد" },
        { status: 400 }
      );
    }
    const weightGrams = Number(body.weightGrams);
    if (!Number.isFinite(weightGrams) || weightGrams <= 0) {
      return NextResponse.json(
        { success: false, error: "وزن کالا (گرم) باید بزرگ‌تر از صفر باشد" },
        { status: 400 }
      );
    }
    const stoneWeight = Math.max(0, Number(body.stoneWeight) || 0);
    if (stoneWeight >= weightGrams) {
      return NextResponse.json(
        { success: false, error: "وزن سنگ نمی‌تواند بیشتر یا مساوی وزن کل کالا باشد" },
        { status: 400 }
      );
    }

    const product = await db.goldProduct.create({
      data: {
        tenantId,
        name,
        karat,
        weightGrams,
        makingChargeType: body.makingChargeType === "PERCENT" ? "PERCENT" : "PER_GRAM",
        makingChargeValue: Math.max(0, Number(body.makingChargeValue) || 0),
        stoneWeight,
        stonePriceRial: BigInt(Math.max(0, Math.round(Number(body.stonePriceRial) || 0))),
        stockWeightGrams: Math.max(0, Number(body.stockWeightGrams) || 0),
        sellerProfitRate: Number.isFinite(Number(body.sellerProfitRate))
          ? Math.max(0, Number(body.sellerProfitRate))
          : 7,
        category: typeof body.category === "string" && body.category.trim() ? body.category.trim() : null,
        isActive: body.isActive !== false,
      },
    });

    await auditLog({
      tenantId,
      action: "CREATE",
      entity: "GoldProduct",
      entityId: product.id,
      changes: { name, karat, weightGrams },
      req,
    });

    const rate = await resolveGoldRate();
    return NextResponse.json({
      success: true,
      data: serializeGoldProduct(product, rate.karat24Rial),
      message: "کالای طلا با موفقیت ایجاد شد",
    });
  } catch (error) {
    console.error("gold-products POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "خطا در ایجاد کالای طلا",
        ...(isDev && { devMessage: error instanceof Error ? error.message : String(error) }),
      },
      { status: 500 }
    );
  }
}
