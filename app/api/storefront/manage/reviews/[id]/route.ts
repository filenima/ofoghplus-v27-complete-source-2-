import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getStorefrontByTenant } from "@/lib/storefront-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v20-D — PATCH /api/storefront/manage/reviews/[id]
 *   { status: "APPROVED" | "REJECTED" } یا { reply: "..." } (یا هر دو)
 * DELETE /api/storefront/manage/reviews/[id]
 * مالکیت: نظر باید به storefront همین tenant تعلق داشته باشد (findFirst scoped).
 * AuditLog مانند سایر مسیرهای manage.
 */
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
      return NextResponse.json({ success: false, error: "فروشگاه شما هنوز فعال نیست" }, { status: 404 });
    }

    const { id } = await params;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }

    const status =
      typeof body.status === "string" && ["APPROVED", "REJECTED"].includes(body.status)
        ? body.status
        : null;
    const reply =
      body.reply !== undefined && body.reply !== null
        ? String(body.reply).trim().slice(0, 1000)
        : undefined;

    if (!status && reply === undefined) {
      return NextResponse.json(
        { success: false, error: "چیزی برای به‌روزرسانی داده نشد (وضعیت یا پاسخ)" },
        { status: 400 }
      );
    }
    if (reply !== undefined && reply !== "" && reply.length < 2) {
      return NextResponse.json(
        { success: false, error: "پاسخ باید حداقل ۲ نویسه باشد" },
        { status: 400 }
      );
    }

    // مالکیت‌سنجی scoped — نظر فروشگاه دیگر قابل ویرایش نیست
    const review = await db.storefrontReview.findFirst({
      where: { id, storefrontId: storefront.id },
      select: { id: true, status: true, authorName: true },
    });
    if (!review) {
      return NextResponse.json({ success: false, error: "نظر یافت نشد" }, { status: 404 });
    }

    const updated = await db.storefrontReview.update({
      where: { id: review.id },
      data: {
        ...(status ? { status } : {}),
        ...(reply !== undefined ? { reply: reply || null } : {}),
      },
      select: { id: true, status: true, reply: true },
    });

    await db.auditLog.create({
      data: {
        tenantId,
        userId: auth.user.userId,
        action: "UPDATE",
        entity: "StorefrontReview",
        entityId: review.id,
        changes: JSON.stringify({
          ...(status ? { from: review.status, to: status } : {}),
          ...(reply !== undefined ? { reply: reply || null } : {}),
          author: review.authorName,
        }),
        ipAddress: req.headers.get("x-forwarded-for") || null,
        userAgent: req.headers.get("user-agent") || null,
      },
    });

    return NextResponse.json({
      success: true,
      review: updated,
      message: status === "APPROVED" ? "نظر تأیید شد و در فروشگاه نمایش داده می‌شود" : undefined,
    });
  } catch (error) {
    console.error("[storefront review PATCH] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در به‌روزرسانی نظر" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json({ success: false, error: "فروشگاه شما هنوز فعال نیست" }, { status: 404 });
    }

    const { id } = await params;
    const review = await db.storefrontReview.findFirst({
      where: { id, storefrontId: storefront.id },
      select: { id: true, authorName: true, rating: true },
    });
    if (!review) {
      return NextResponse.json({ success: false, error: "نظر یافت نشد" }, { status: 404 });
    }

    await db.storefrontReview.delete({ where: { id: review.id } });

    await db.auditLog.create({
      data: {
        tenantId,
        userId: auth.user.userId,
        action: "DELETE",
        entity: "StorefrontReview",
        entityId: review.id,
        changes: JSON.stringify({ author: review.authorName, rating: review.rating }),
        ipAddress: req.headers.get("x-forwarded-for") || null,
        userAgent: req.headers.get("user-agent") || null,
      },
    });

    return NextResponse.json({ success: true, message: "نظر حذف شد" });
  } catch (error) {
    console.error("[storefront review DELETE] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در حذف نظر" }, { status: 500 });
  }
}
