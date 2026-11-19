import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getStorefrontByTenant } from "@/lib/storefront-auth";
import { signUploadUrl } from "@/lib/secure-uploads";
import type { StorefrontOrderItemDTO } from "@/lib/storefront";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORDER_STATUSES = ["PENDING", "AWAITING_RECEIPT", "AWAITING_APPROVAL", "APPROVED", "REJECTED", "SHIPPED"];

// GET /api/storefront/manage/orders?status=&q= — سفارش‌های فروشگاه مالک
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json({
        success: true,
        orders: [],
        message: "فروشگاه هنوز ساخته نشده است",
      });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";
    const where: { storefrontId: string; status?: string } = { storefrontId: storefront.id };
    if (status && ORDER_STATUSES.includes(status)) where.status = status;

    const orders = await db.storefrontOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        items: true,
        totalRial: true,
        status: true,
        receiptImage: true,
        note: true,
        createdAt: true,
        customer: { select: { name: true } },
        // R17-C — شماره فاکتور حسابداری صادرشده برای مالک قابل مشاهده باشد
        invoice: { select: { number: true } },
      },
    });

    return NextResponse.json({
      success: true,
      orders: orders.map((o) => ({
        id: o.id,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        customerEmail: o.customerEmail,
        registeredCustomer: o.customer?.name ?? null,
        items: JSON.parse(o.items) as StorefrontOrderItemDTO[],
        totalRial: o.totalRial.toString(),
        status: o.status,
        receiptUrl: o.receiptImage ? signUploadUrl(o.receiptImage, 3600) : null,
        note: o.note,
        createdAt: o.createdAt.toISOString(),
        invoiceNumber: o.invoice?.number ?? null,
      })),
    });
  } catch (error) {
    console.error("[storefront orders GET] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت سفارش‌ها" },
      { status: 500 }
    );
  }
}
