import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorefrontBySlug, getSfCustomerFromCookie, notifyStorefrontOwner } from "@/lib/storefront-auth";
import { rateLimitCheck, buildRateLimitResponse, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v20-D — نظرات مشتریان فروشگاه (عمومی)
 * GET  ?productId= → فقط نظرات تأییدشده (PENDING هرگز افشا نمی‌شود)
 * POST → ثبت نظر جدید با وضعیت PENDING؛ پس از تأیید مالک نمایش داده می‌شود.
 * الگوی امنیتی همان تیکت R16 است: rate-limit + اعتبارسنجی + پیام‌های فارسی.
 */

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
    // Task 3-d — تعلیق سوپرادمینی: نظرات فروشگاه معلق قابل مشاهده/ثبت نیست
    if (storefront.status === "suspended") {
      return NextResponse.json({ success: false, error: "این فروشگاه موقتاً تعلیق شده است" }, { status: 503 });
    }

    const url = new URL(req.url);
    const productId = url.searchParams.get("productId") || null;

    // کالا (اگر داده شد) باید متعلق به همین فروشگاه باشد — وگرنه همهٔ نظرات فروشگاه
    if (productId) {
      const product = await db.product.findFirst({
        where: { id: productId, tenantId: storefront.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!product) {
        return NextResponse.json({ success: false, error: "کالا یافت نشد" }, { status: 404 });
      }
    }

    const where = {
      storefrontId: storefront.id,
      status: "APPROVED",
      ...(productId ? { productId } : {}),
    };

    const [reviews, agg] = await Promise.all([
      db.storefrontReview.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          authorName: true,
          rating: true,
          comment: true,
          reply: true,
          createdAt: true,
          product: { select: { id: true, name: true } },
        },
      }),
      db.storefrontReview.aggregate({
        where,
        _count: { _all: true },
        _avg: { rating: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      reviews: reviews.map((r) => ({
        id: r.id,
        authorName: r.authorName,
        rating: r.rating,
        comment: r.comment,
        reply: r.reply,
        createdAt: r.createdAt.toISOString(),
        product: r.product ? { id: r.product.id, name: r.product.name } : null,
      })),
      aggregate: {
        count: agg._count._all,
        // میانگین با یک رقم اعشار — ۴.۳ از ۵
        avg: agg._avg.rating != null ? Math.round(agg._avg.rating * 10) / 10 : 0,
      },
    });
  } catch (error) {
    console.error("[storefront reviews GET] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در دریافت نظرات" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // همان محدودیت نرخ تیکت: ۵ نظر در ۱۰ دقیقه برای هر IP
    const rl = rateLimitCheck(`sf-review:${getClientIp(req)}`, 5, 10 * 60_000);
    if (!rl.ok) {
      return await buildRateLimitResponse(rl, "ثبت نظر بیش از حد مجاز است. کمی صبر کنید.");
    }

    const { slug } = await params;
    const storefront = await getStorefrontBySlug(slug);
    if (!storefront || !storefront.isActive) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد یا فعال نیست" }, { status: 404 });
    }
    // Task 3-d — تعلیق سوپرادمینی: نظرات فروشگاه معلق قابل مشاهده/ثبت نیست
    if (storefront.status === "suspended") {
      return NextResponse.json({ success: false, error: "این فروشگاه موقتاً تعلیق شده است" }, { status: 503 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    // ── اعتبارسنجی ──
    const authorName = String(b.authorName ?? "").trim();
    if (authorName.length < 2 || authorName.length > 60) {
      return NextResponse.json(
        { success: false, error: "نام شما باید ۲ تا ۶۰ نویسه باشد" },
        { status: 400 }
      );
    }
    const ratingRaw = typeof b.rating === "number" ? b.rating : Number(b.rating);
    if (!Number.isInteger(ratingRaw) || ratingRaw < 1 || ratingRaw > 5) {
      return NextResponse.json(
        { success: false, error: "امتیاز باید عددی بین ۱ تا ۵ باشد" },
        { status: 400 }
      );
    }
    const comment = String(b.comment ?? "").trim();
    if (comment.length < 5 || comment.length > 1000) {
      return NextResponse.json(
        { success: false, error: "متن نظر باید ۵ تا ۱۰۰۰ نویسه باشد" },
        { status: 400 }
      );
    }

    // کالای اختیاری — باید متعلق به همین فروشگاه باشد
    // (نظر روی کالای فروشگاه دیگر قابل ثبت نیست)
    let productId: string | null = null;
    if (b.productId !== undefined && b.productId !== null && String(b.productId).trim() !== "") {
      const pid = String(b.productId).trim();
      const product = await db.product.findFirst({
        where: { id: pid, tenantId: storefront.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!product) {
        return NextResponse.json({ success: false, error: "کالا یافت نشد" }, { status: 404 });
      }
      productId = product.id;
    }

    // اتصال به حساب مشتری واردشده (اگر کوکی نشست موجود بود — همان الگوی order)
    const sfCustomer = await getSfCustomerFromCookie(req, storefront.id);

    const review = await db.storefrontReview.create({
      data: {
        storefrontId: storefront.id,
        productId,
        customerId: sfCustomer?.id ?? null,
        authorName,
        rating: ratingRaw,
        comment,
        status: "PENDING",
      },
      select: { id: true, status: true },
    });

    // اعلان درون‌برنامه‌ای مالک برای تأیید سریع
    await notifyStorefrontOwner(
      storefront,
      "نظر جدید در فروشگاه",
      `«${authorName}» نظری با امتیاز ${ratingRaw} از ۵ ثبت کرد — در انتظار تأیید شما.`,
      "storefront"
    );

    return NextResponse.json({
      success: true,
      reviewId: review.id,
      status: review.status,
      message: "نظر شما ثبت شد و پس از تأیید مالک فروشگاه نمایش داده می‌شود",
    });
  } catch (error) {
    console.error("[storefront reviews POST] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در ثبت نظر — لطفاً دوباره تلاش کنید" },
      { status: 500 }
    );
  }
}
