import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog } from "@/lib/auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import {
  computeGoldInvoice,
  resolveGoldRate,
  generateGoldInvoiceNumber,
  serializeGoldInvoice,
  validateGoldItems,
  GOLD_VAT_RATE,
} from "@/lib/gold";
import { parseAmount } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
 * /api/gold/invoices — فاکتور طلا (فروش / بازخرید / طلا به طلا)
 * ============================================================
 * GET  : لیست فاکتورها ?type=&status=&search=&limit=&offset=
 * POST : صدور فاکتور — محاسبهٔ سروری:
 *        قیمت گرم هر عیار = karat24Rial × عیار ÷ ۲۴
 *        ارزش طلا = وزن خالص × قیمت گرم
 *        اجرت = (ریال/گرم × وزن) یا (درصد × ارزش طلا)
 *        سود فروشنده = درصد × ارزش طلا
 *        مالیات ارزش افزوده = ۹٪ × (اجرت + سود)  ← فقط اجرت و سود، نه ارزش طلا
 *        قابل پرداخت = طلا + اجرت + سود + سنگ + مالیات (− ارزش طلای دریافتی در معامله)
 */

const isDev = process.env.NODE_ENV !== "production";
const VALID_TYPES = ["SALE", "BUYBACK", "EXCHANGE"];

// GET /api/gold/invoices
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
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const limit = Math.min(Math.max(1, Number(searchParams.get("limit")) || 50), 500);
    const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

    // ?id= — دریافت یک فاکتور مشخص (tenant-scoped)
    const singleId = searchParams.get("id");
    if (singleId) {
      const invoice = await db.goldInvoice.findFirst({
        where: { id: singleId, tenantId },
      });
      if (!invoice) {
        return NextResponse.json(
          { success: false, error: "فاکتور طلا پیدا نشد" },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        data: serializeGoldInvoice(invoice),
      });
    }

    const where: Record<string, unknown> = { tenantId };
    if (type && VALID_TYPES.includes(type)) where.type = type;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search } },
        { customerName: { contains: search } },
        { customerPhone: { contains: search } },
      ];
    }

    const [invoices, total] = await Promise.all([
      db.goldInvoice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.goldInvoice.count({ where }),
    ]);

    // خلاصهٔ آماری
    const [saleAgg, buybackAgg, exchangeAgg] = await Promise.all([
      db.goldInvoice.aggregate({
        where: { tenantId, type: "SALE", status: { not: "CANCELLED" } },
        _sum: { payableRial: true, totalGoldGrams: true },
        _count: true,
      }),
      db.goldInvoice.aggregate({
        where: { tenantId, type: "BUYBACK", status: { not: "CANCELLED" } },
        _sum: { payableRial: true, receivedGoldGrams: true },
        _count: true,
      }),
      db.goldInvoice.aggregate({
        where: { tenantId, type: "EXCHANGE", status: { not: "CANCELLED" } },
        _sum: { payableRial: true, totalGoldGrams: true },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: invoices.map(serializeGoldInvoice),
      total,
      summary: {
        sale: {
          count: saleAgg._count,
          payableRial: Number(saleAgg._sum.payableRial ?? 0),
          grams: saleAgg._sum.totalGoldGrams ?? 0,
        },
        buyback: {
          count: buybackAgg._count,
          payableRial: Number(buybackAgg._sum.payableRial ?? 0),
          grams: buybackAgg._sum.receivedGoldGrams ?? 0,
        },
        exchange: {
          count: exchangeAgg._count,
          payableRial: Number(exchangeAgg._sum.payableRial ?? 0),
          grams: exchangeAgg._sum.totalGoldGrams ?? 0,
        },
      },
    });
  } catch (error) {
    console.error("gold-invoices GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "خطا در دریافت فاکتورهای طلا",
        ...(isDev && { devMessage: error instanceof Error ? error.message : String(error) }),
      },
      { status: 500 }
    );
  }
}

// POST /api/gold/invoices
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`gold-invoice-create:${ip}`, 30, 60_000);
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

    const type = (
      ["SALE", "BUYBACK", "EXCHANGE"].includes(String(body.type)) ? String(body.type) : "SALE"
    ) as "SALE" | "BUYBACK" | "EXCHANGE";

    // اگر goldProductId ارسال شده، مشخصات کالا از DB خوانده می‌شود (weight/karat/اجرت)
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const enrichedItems: Record<string, unknown>[] = [];
    for (const raw of rawItems) {
      if (!raw || typeof raw !== "object") continue;
      const it = { ...(raw as Record<string, unknown>) };
      const pid = typeof it.goldProductId === "string" ? it.goldProductId : null;
      if (pid) {
        const gp = await db.goldProduct.findFirst({
          where: { id: pid, tenantId },
        });
        if (gp) {
          if (!it.name) it.name = gp.name;
          if (it.karat === undefined) it.karat = gp.karat;
          if (it.weight === undefined) it.weight = gp.weightGrams;
          if (it.stoneWeight === undefined) it.stoneWeight = gp.stoneWeight;
          if (it.stonePriceRial === undefined) it.stonePriceRial = Number(gp.stonePriceRial);
          if (it.makingChargeType === undefined) it.makingChargeType = gp.makingChargeType;
          if (it.makingChargeValue === undefined) it.makingChargeValue = gp.makingChargeValue;
        }
      }
      enrichedItems.push(it);
    }

    const v = validateGoldItems(enrichedItems);
    if (!v.ok) {
      return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    }

    // نرخ جاری طلا
    const rate = await resolveGoldRate();
    if (!rate.ok || rate.karat24Rial <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "نرخ طلا در دسترس نیست — ابتدا از تب داشبورد نرخ را همگام‌سازی یا دستی ثبت کنید",
        },
        { status: 409 }
      );
    }

    // سود فروشنده — نرمال‌سازی ارقام فارسی
    let profitRatePercent = 7;
    if (body.profitRatePercent !== undefined) {
      const parsed =
        typeof body.profitRatePercent === "string"
          ? parseAmount(body.profitRatePercent)
          : Number(body.profitRatePercent);
      if (parsed !== null && Number.isFinite(parsed)) profitRatePercent = Math.max(0, Math.min(100, parsed));
    }

    const receivedGoldGrams = Math.max(0, Number(body.receivedGoldGrams) || 0);
    const receivedGoldKarat = [24, 22, 18, 14].includes(Number(body.receivedGoldKarat))
      ? Number(body.receivedGoldKarat)
      : 18;

    if (type === "EXCHANGE" && receivedGoldGrams <= 0) {
      return NextResponse.json(
        { success: false, error: "در معاملهٔ طلا به طلا، وزن طلای دریافتی از مشتری الزامی است" },
        { status: 400 }
      );
    }
    if (type === "BUYBACK" && receivedGoldGrams <= 0) {
      return NextResponse.json(
        { success: false, error: "در بازخرید، وزن طلای دریافتی از مشتری الزامی است" },
        { status: 400 }
      );
    }

    const totals = computeGoldInvoice({
      type,
      items: v.items,
      karat24Rial: rate.karat24Rial,
      profitRatePercent,
      vatRate: GOLD_VAT_RATE,
      receivedGoldGrams,
      receivedGoldKarat,
    });

    const invoiceNumber = await generateGoldInvoiceNumber(tenantId);
    const status = ["DRAFT", "PENDING", "PAID", "CANCELLED"].includes(String(body.status))
      ? String(body.status)
      : "PAID";

    const invoice = await db.goldInvoice.create({
      data: {
        tenantId,
        invoiceNumber,
        type,
        customerName: typeof body.customerName === "string" ? body.customerName.trim() || null : null,
        customerPhone: typeof body.customerPhone === "string" ? body.customerPhone.trim() || null : null,
        totalGoldGrams: totals.totalGoldGrams,
        receivedGoldGrams,
        receivedGoldKarat,
        goldValueRial: BigInt(totals.goldValueRial),
        receivedValueRial: BigInt(totals.receivedValueRial),
        makingChargeRial: BigInt(totals.makingChargeRial),
        sellerProfitRial: BigInt(totals.sellerProfitRial),
        stoneValueRial: BigInt(totals.stoneValueRial),
        vatRial: BigInt(totals.vatRial),
        payableRial: BigInt(totals.payableRial),
        status,
        items: JSON.stringify(
          v.items.map((it, idx) => ({
            goldProductId: it.goldProductId ?? null,
            name: it.name,
            karat: it.karat,
            weight: it.weight,
            count: it.count ?? 1,
            stoneWeight: it.stoneWeight ?? 0,
            makingChargeType: it.makingChargeType ?? "PER_GRAM",
            makingChargeValue: it.makingChargeValue ?? 0,
            stonePriceRial: it.stonePriceRial ?? 0,
            gramPriceRial: totals.perItem[idx]?.gramPrice ?? 0,
            goldValueRial: totals.perItem[idx]?.goldValue ?? 0,
            makingChargeRial: totals.perItem[idx]?.makingCharge ?? 0,
          }))
        ),
        note: typeof body.note === "string" ? body.note.trim() || null : null,
      },
    });

    // به‌روزرسانی موجودی وزنی (best-effort — خطا فاکتور را نمی‌شکند)
    for (const it of v.items) {
      if (!it.goldProductId) continue;
      try {
        const gramsPerUnit = it.weight * (it.count ?? 1);
        if (type === "SALE" || type === "EXCHANGE") {
          await db.goldProduct.update({
            where: { id: it.goldProductId },
            data: { stockWeightGrams: { decrement: gramsPerUnit } },
          });
        } else {
          await db.goldProduct.update({
            where: { id: it.goldProductId },
            data: { stockWeightGrams: { increment: gramsPerUnit } },
          });
        }
      } catch {
        // کالا ممکن است حذف شده باشد
      }
    }

    await auditLog({
      tenantId,
      action: "CREATE",
      entity: "GoldInvoice",
      entityId: invoice.id,
      changes: { invoiceNumber, type, payableRial: totals.payableRial },
      req,
    });

    return NextResponse.json({
      success: true,
      data: serializeGoldInvoice(invoice),
      message:
        type === "SALE"
          ? `فاکتور فروش طلا ${invoiceNumber} صادر شد`
          : type === "BUYBACK"
            ? `فاکتور بازخرید طلا ${invoiceNumber} ثبت شد`
            : `معاملهٔ طلا به طلا ${invoiceNumber} ثبت شد`,
    });
  } catch (error) {
    console.error("gold-invoices POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "خطا در صدور فاکتور طلا",
        ...(isDev && { devMessage: error instanceof Error ? error.message : String(error) }),
      },
      { status: 500 }
    );
  }
}
