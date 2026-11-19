import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorefrontBySlug, notifyStorefrontOwner } from "@/lib/storefront-auth";
import { rateLimitCheck, buildRateLimitResponse, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/storefront/[slug]/ticket — ثبت تیکت پشتیبانی توسط مشتری فروشگاه (R16)
 * عمومی + محدودیت نرخ. فقط وقتی مالک گزینهٔ تیکت را فعال کرده باشد.
 * ثبت‌نام مشتری فقط با ایمیل — بدون پیامک (خواستهٔ مالک).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const rl = rateLimitCheck(`sf-ticket:${getClientIp(req)}`, 5, 10 * 60_000);
    if (!rl.ok) {
      return await buildRateLimitResponse(rl, "درخواست‌های تیکت بیش از حد مجاز است. کمی صبر کنید.");
    }

    const { slug } = await params;
    const storefront = await getStorefrontBySlug(slug);
    if (!storefront || !storefront.isActive) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد یا فعال نیست" }, { status: 404 });
    }
    // Task 3-d — تعلیق سوپرادمینی: ثبت تیکت در فروشگاه معلق بسته است
    if (storefront.status === "suspended") {
      return NextResponse.json({ success: false, error: "این فروشگاه موقتاً تعلیق شده است" }, { status: 503 });
    }
    if (!storefront.ticketEnabled) {
      return NextResponse.json({ success: false, error: "پشتیبانی تیکتی این فروشگاه فعال نیست" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    const customerName = String(b.customerName ?? "").trim();
    if (customerName.length < 2 || customerName.length > 80) {
      return NextResponse.json({ success: false, error: "نام را کامل وارد کنید" }, { status: 400 });
    }
    const customerEmail = String(b.customerEmail ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customerEmail)) {
      return NextResponse.json({ success: false, error: "ایمیل معتبر وارد کنید" }, { status: 400 });
    }
    const subject = String(b.subject ?? "").trim();
    if (subject.length < 3 || subject.length > 120) {
      return NextResponse.json({ success: false, error: "موضوع تیکت باید ۳ تا ۱۲۰ نویسه باشد" }, { status: 400 });
    }
    const message = String(b.message ?? "").trim();
    if (message.length < 10 || message.length > 2000) {
      return NextResponse.json({ success: false, error: "متن تیکت باید حداقل ۱۰ نویسه باشد" }, { status: 400 });
    }

    const ticket = await db.storefrontTicket.create({
      data: {
        storefrontId: storefront.id,
        customerName,
        customerEmail,
        subject,
        message,
        status: "OPEN",
      },
      select: { id: true, status: true },
    });

    // اعلان درون‌برنامه‌ای مالک + نمایش در داشبورد فروشگاه
    await notifyStorefrontOwner(
      storefront,
      "تیکت پشتیبانی جدید در فروشگاه",
      `مشتری «${customerName}» تیکت «${subject}» ثبت کرد.`,
      "storefront"
    );

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      message: "تیکت شما ثبت شد — پاسخ به ایمیل شما ارسال می‌شود",
    });
  } catch (error) {
    console.error("[storefront ticket POST] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در ثبت تیکت — دوباره تلاش کنید" }, { status: 500 });
  }
}
