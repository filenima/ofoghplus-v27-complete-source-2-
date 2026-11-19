import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getStorefrontByTenant } from "@/lib/storefront-auth";
import { issueInvoiceForStorefrontOrder } from "@/lib/storefront-accounting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["APPROVED", "REJECTED", "SHIPPED"],
  AWAITING_RECEIPT: ["APPROVED", "REJECTED", "SHIPPED"],
  AWAITING_APPROVAL: ["APPROVED", "REJECTED", "SHIPPED"],
  APPROVED: ["SHIPPED", "REJECTED"],
  REJECTED: ["APPROVED", "SHIPPED"],
  SHIPPED: [],
};

// PATCH /api/storefront/manage/orders/[id] — تأیید/رد/ارسال سفارش توسط مالک (با AuditLog)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json(
        { success: false, error: "فروشگاه شما هنوز فعال نیست" },
        { status: 404 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const status = body && typeof (body as Record<string, unknown>).status === "string"
      ? (body as Record<string, unknown>).status as string
      : "";
    if (!["APPROVED", "REJECTED", "SHIPPED"].includes(status)) {
      return NextResponse.json(
        { success: false, error: "وضعیت مقصد نامعتبر است (تأیید/رد/ارسال)" },
        { status: 400 }
      );
    }

    const order = await db.storefrontOrder.findFirst({
      where: { id, storefrontId: storefront.id },
      select: {
        id: true,
        status: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        items: true,
        totalRial: true,
        payableRial: true,
        discountApplied: true,
        invoiceId: true,
        paymentMethod: true,
      },
    });
    if (!order) {
      return NextResponse.json(
        { success: false, error: "سفارش یافت نشد" },
        { status: 404 }
      );
    }
    if (!(ALLOWED_STATUS_TRANSITIONS[order.status] ?? []).includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: `گذار از وضعیت «${order.status}» به «${status}» مجاز نیست`,
        },
        { status: 409 }
      );
    }

    let updated = await db.storefrontOrder.update({
      where: { id: order.id },
      data: { status },
      select: { id: true, status: true, invoiceId: true },
    });

    // ── R17-C: همگام‌سازی با حسابداری — تأیید سفارش = صدور فاکتور فروش ──
    // فاکتور SALE + اقلام + کاهش موجودی انبار + سند حسابداری + سند تسویه
    // (منبع واحد: lib/storefront-accounting — همان منطق pay/verify درگاه).
    // idempotent: اگر invoiceId از قبل باشد، دوباره صادر نمی‌شود.
    let invoiceNumber: string | null = null;
    let invoiceCreated = false;
    if (status === "APPROVED" && !order.invoiceId) {
      const issued = await issueInvoiceForStorefrontOrder({
        tenantId,
        storefrontSlug: storefront.slug,
        storefrontTitle: storefront.title,
        order,
        userId: auth.user.userId,
        paymentType: order.paymentMethod === "gateway" ? "ONLINE" : "CASH",
      });
      if (issued) {
        invoiceCreated = true;
        invoiceNumber = issued.invoiceNumber;
        updated = { ...updated, invoiceId: issued.invoiceId };
      }
    }

    // لاگ ممیزی — هر تغییر وضعیت با کاربر و شناسه سفارش
    await db.auditLog.create({
      data: {
        tenantId,
        userId: auth.user.userId,
        action: "UPDATE",
        entity: "StorefrontOrder",
        entityId: order.id,
        changes: JSON.stringify({
          from: order.status,
          to: status,
          customer: order.customerName,
        }),
        ipAddress: req.headers.get("x-forwarded-for") || null,
        userAgent: req.headers.get("user-agent") || null,
      },
    });

    return NextResponse.json({
      success: true,
      order: updated,
      invoiceCreated,
      invoiceNumber,
      message: invoiceCreated
        ? `سفارش تأیید و فاکتور فروش ${invoiceNumber} در حسابداری ثبت شد — مشتری می‌تواند فاکتور را دانلود کند`
        : undefined,
    });
  } catch (error) {
    console.error("[storefront order PATCH] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در تغییر وضعیت سفارش" },
      { status: 500 }
    );
  }
}
