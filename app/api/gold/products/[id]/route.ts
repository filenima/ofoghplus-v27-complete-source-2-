import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog } from "@/lib/auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { karatGramPrice, resolveGoldRate } from "@/lib/gold";
import { parseAmount } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
 * /api/gold/products/[id] — ویرایش / حذف / تغییر وضعیت کالای طلا
 * ============================================================
 * PATCH  : ویرایش فیلدها (name, karat, weightGrams, makingCharge..., isActive, ...)
 * DELETE : حذف نرم نیست — حذف فیزیکی (کالای طلا مستقل از Product حسابداری است)
 */

const isDev = process.env.NODE_ENV !== "production";
const VALID_KARATS = [24, 22, 18, 14];

type Params = { params: Promise<{ id: string }> };

// PATCH /api/gold/products/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const tenantId = ctx.tenantId;

    const existing = await db.goldProduct.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "کالای طلا پیدا نشد" },
        { status: 404 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
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

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return NextResponse.json({ success: false, error: "نام کالا خالی است" }, { status: 400 });
      }
      data.name = name;
    }
    if (body.karat !== undefined) {
      const karat = Number(body.karat);
      if (!VALID_KARATS.includes(karat)) {
        return NextResponse.json(
          { success: false, error: "عیار باید ۲۴، ۲۲، ۱۸ یا ۱۴ باشد" },
          { status: 400 }
        );
      }
      data.karat = karat;
    }
    if (body.weightGrams !== undefined) {
      const w = Number(body.weightGrams);
      if (!Number.isFinite(w) || w <= 0) {
        return NextResponse.json(
          { success: false, error: "وزن باید بزرگ‌تر از صفر باشد" },
          { status: 400 }
        );
      }
      data.weightGrams = w;
    }
    if (body.stoneWeight !== undefined) data.stoneWeight = Math.max(0, Number(body.stoneWeight) || 0);
    if (body.makingChargeType !== undefined)
      data.makingChargeType = body.makingChargeType === "PERCENT" ? "PERCENT" : "PER_GRAM";
    if (body.makingChargeValue !== undefined)
      data.makingChargeValue = Math.max(0, Number(body.makingChargeValue) || 0);
    if (body.stonePriceRial !== undefined)
      data.stonePriceRial = BigInt(Math.max(0, Math.round(Number(body.stonePriceRial) || 0)));
    if (body.stockWeightGrams !== undefined)
      data.stockWeightGrams = Math.max(0, Number(body.stockWeightGrams) || 0);
    if (body.sellerProfitRate !== undefined)
      data.sellerProfitRate = Math.max(0, Number(body.sellerProfitRate) || 0);
    if (body.category !== undefined)
      data.category =
        typeof body.category === "string" && body.category.trim() ? body.category.trim() : null;
    if (body.isActive !== undefined) data.isActive = body.isActive === true;

    // اعتبارسنجی سنگ < وزن کل پس از اعمال تغییرات
    const finalWeight = Number(data.weightGrams ?? existing.weightGrams);
    const finalStone = Number(data.stoneWeight ?? existing.stoneWeight);
    if (finalStone >= finalWeight) {
      return NextResponse.json(
        { success: false, error: "وزن سنگ نمی‌تواند بیشتر یا مساوی وزن کل کالا باشد" },
        { status: 400 }
      );
    }

    const updated = await db.goldProduct.update({ where: { id }, data });

    await auditLog({
      tenantId,
      action: "UPDATE",
      entity: "GoldProduct",
      entityId: id,
      changes: data,
      req,
    });

    const rate = await resolveGoldRate();
    const gramPrice = rate.karat24Rial > 0 ? karatGramPrice(rate.karat24Rial, updated.karat) : 0;
    const netWeight = Math.max(0, updated.weightGrams - updated.stoneWeight);
    const goldValueRial = Math.round(netWeight * gramPrice);

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        stonePriceRial: Number(updated.stonePriceRial),
        gramPriceRial: gramPrice,
        goldValueRial,
      },
      message: "کالای طلا به‌روزرسانی شد",
    });
  } catch (error) {
    console.error("gold-product PATCH error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "خطا در ویرایش کالای طلا",
        ...(isDev && { devMessage: error instanceof Error ? error.message : String(error) }),
      },
      { status: 500 }
    );
  }
}

// DELETE /api/gold/products/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`gold-product-delete:${ip}`, 30, 60_000);
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

    const existing = await db.goldProduct.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "کالای طلا پیدا نشد" },
        { status: 404 }
      );
    }

    await db.goldProduct.delete({ where: { id } });

    await auditLog({
      tenantId,
      action: "DELETE",
      entity: "GoldProduct",
      entityId: id,
      changes: { name: existing.name },
      req,
    });

    return NextResponse.json({
      success: true,
      message: "کالای طلا حذف شد",
    });
  } catch (error) {
    console.error("gold-product DELETE error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "خطا در حذف کالای طلا",
        ...(isDev && { devMessage: error instanceof Error ? error.message : String(error) }),
      },
      { status: 500 }
    );
  }
}
