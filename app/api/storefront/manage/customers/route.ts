import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getStorefrontByTenant } from "@/lib/storefront-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/storefront/manage/customers — مشتریان ثبت‌نام‌شده فروشگاه + تعداد سفارش‌ها
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json({ success: true, customers: [] });
    }

    const customers = await db.storefrontCustomer.findMany({
      where: { storefrontId: storefront.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        createdAt: true,
        orders: { select: { status: true, totalRial: true } },
      },
    });

    return NextResponse.json({
      success: true,
      customers: customers.map((c) => {
        const orders = c.orders;
        return {
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          createdAt: c.createdAt.toISOString(),
          orderCount: orders.length,
          approvedRevenueRial: orders
            .filter((o) => o.status === "APPROVED" || o.status === "SHIPPED")
            .reduce((sum, o) => sum + o.totalRial, 0n)
            .toString(),
        };
      }),
    });
  } catch (error) {
    console.error("[storefront customers GET] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت مشتریان فروشگاه" },
      { status: 500 }
    );
  }
}
