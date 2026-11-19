import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorefrontBySlug, getSfCustomerFromCookie } from "@/lib/storefront-auth";
import type { StorefrontOrderItemDTO } from "@/lib/storefront";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/storefront/[slug]/customer/me — اطلاعات مشتری واردشده + سفارش‌های او
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const storefront = await getStorefrontBySlug(slug);
    if (!storefront) {
      return NextResponse.json(
        { success: false, error: "فروشگاه یافت نشد" },
        { status: 404 }
      );
    }
    // Task 3-d — تعلیق سوپرادمینی: حساب مشتری فروشگاه معلق در دسترس نیست
    if (!storefront.isActive || storefront.status === "suspended") {
      return NextResponse.json(
        { success: false, error: "این فروشگاه موقتاً در دسترس نیست" },
        { status: 503 }
      );
    }

    const customer = await getSfCustomerFromCookie(req, storefront.id);
    if (!customer) {
      return NextResponse.json(
        { success: false, error: "وارد نشده‌اید" },
        { status: 401 }
      );
    }

    const orders = await db.storefrontOrder.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        items: true,
        totalRial: true,
        payableRial: true,
        discountApplied: true,
        invoiceId: true,
        status: true,
        note: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      customer,
      orders: orders.map((o) => ({
        id: o.id,
        items: JSON.parse(o.items) as StorefrontOrderItemDTO[],
        totalRial: o.totalRial.toString(),
        payableRial: o.payableRial ? o.payableRial.toString() : null,
        discountApplied: o.discountApplied,
        invoiceId: o.invoiceId,
        status: o.status,
        note: o.note,
        createdAt: o.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[storefront me] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت اطلاعات مشتری" },
      { status: 500 }
    );
  }
}
