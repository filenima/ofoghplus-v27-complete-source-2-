import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getStorefrontByTenant } from "@/lib/storefront-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REVIEW_STATUSES = ["PENDING", "APPROVED", "REJECTED"];

/**
 * v20-D — GET /api/storefront/manage/reviews?status=PENDING|APPROVED|REJECTED|ALL
 * لیست نظرات فروشگاه برای مالک + شمارندهٔ هر وضعیت + میانگین امتیاز.
 * الگوی احراز هویت همان orders است: requireUser + Storefront.tenantId.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json({
        success: true,
        reviews: [],
        counts: { PENDING: 0, APPROVED: 0, REJECTED: 0, ALL: 0 },
        avgRating: 0,
        message: "فروشگاه هنوز ساخته نشده است",
      });
    }

    const url = new URL(req.url);
    const status = (url.searchParams.get("status") ?? "ALL").toUpperCase();
    const where: { storefrontId: string; status?: string } = { storefrontId: storefront.id };
    if (status !== "ALL" && REVIEW_STATUSES.includes(status)) where.status = status;

    const [reviews, grouped, aggApproved] = await Promise.all([
      db.storefrontReview.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          authorName: true,
          rating: true,
          comment: true,
          reply: true,
          status: true,
          createdAt: true,
          productId: true,
          product: { select: { id: true, name: true } },
          customer: { select: { email: true } },
        },
      }),
      db.storefrontReview.groupBy({
        by: ["status"],
        where: { storefrontId: storefront.id },
        _count: { _all: true },
      }),
      db.storefrontReview.aggregate({
        where: { storefrontId: storefront.id, status: "APPROVED" },
        _avg: { rating: true },
      }),
    ]);

    const counts: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, ALL: 0 };
    for (const g of grouped) {
      if (g.status in counts) counts[g.status] = g._count._all;
      counts.ALL += g._count._all;
    }

    return NextResponse.json({
      success: true,
      reviews: reviews.map((r) => ({
        id: r.id,
        authorName: r.authorName,
        rating: r.rating,
        comment: r.comment,
        reply: r.reply,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        productId: r.productId,
        productName: r.product?.name ?? null,
        customerEmail: r.customer?.email ?? null,
      })),
      counts,
      avgRating:
        aggApproved._avg.rating != null ? Math.round(aggApproved._avg.rating * 10) / 10 : 0,
    });
  } catch (error) {
    console.error("[storefront reviews manage GET] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در دریافت نظرات" }, { status: 500 });
  }
}
