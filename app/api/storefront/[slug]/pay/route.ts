import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorefrontBySlug } from "@/lib/storefront-auth";
import { zarinpalUrls, zarinpalErrorFa, ZARINPAL_FETCH_TIMEOUT_MS } from "@/lib/zarinpal";
import { getSiteUrl } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════
// Task 1-c — POST /api/storefront/[slug]/pay
// شروع پرداخت آنلاین سفارش از طریق درگاه زرین‌پالِ «اختصاصی مالک فروشگاه»
// ═══════════════════════════════════════════════════════════════════
// body: { orderId }
// جریان: سفارش PENDING/AWAITING_RECEIPT → درخواست به زرین‌پال با merchantId
// مالک → { redirectUrl } → کاربر پرداخت می‌کند → کال‌بک به /pay/verify
// پس از وریفای موفق: سفارش خودکار APPROVED + فاکتور حسابداری صادر می‌شود.

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const storefront = await getStorefrontBySlug(slug);
    if (!storefront || !storefront.isActive) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد یا فعال نیست" }, { status: 404 });
    }
    // Task 3-d — تعلیق سوپرادمینی: درگاه پرداخت بسته است
    if (storefront.status === "suspended") {
      return NextResponse.json(
        { success: false, error: "این فروشگاه موقتاً تعلیق شده است" },
        { status: 503 }
      );
    }
    if (!storefront.gatewayMerchantId) {
      return NextResponse.json(
        { success: false, error: "این فروشگاه درگاه پرداخت آنلاین ندارد — پرداخت کارت‌به‌کارت را انتخاب کنید" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    const orderId = String((body as Record<string, unknown> | null)?.orderId ?? "");
    if (!orderId) {
      return NextResponse.json({ success: false, error: "شناسه سفارش لازم است" }, { status: 400 });
    }

    const order = await db.storefrontOrder.findFirst({
      where: { id: orderId, storefrontId: storefront.id },
      select: { id: true, status: true, totalRial: true, payableRial: true, customerName: true, gatewayAuthority: true },
    });
    if (!order) {
      return NextResponse.json({ success: false, error: "سفارش یافت نشد" }, { status: 404 });
    }
    // فقط سفارش‌های در انتظار پرداخت
    if (order.status !== "PENDING" && order.status !== "AWAITING_RECEIPT") {
      return NextResponse.json(
        { success: false, error: "این سفارش در وضعیت قابل پرداخت نیست" },
        { status: 400 }
      );
    }
    // idempotency: اگر authority قبلی داریم، همان را برگردان
    if (order.gatewayAuthority) {
      return NextResponse.json({
        success: true,
        redirectUrl: `${zarinpalUrls(storefront.gatewaySandbox).startPay}${order.gatewayAuthority}`,
        orderId: order.id,
      });
    }

    const amountRial = order.payableRial ?? order.totalRial;
    // زرین‌پال v4 مبلغ را «ریال» می‌گیرد
    const callbackBase = (await getSiteUrl()).replace(/\/+$/, "");
    const callbackUrl = `${callbackBase}/api/storefront/${encodeURIComponent(slug)}/pay/verify?order=${order.id}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ZARINPAL_FETCH_TIMEOUT_MS);
    let startPay = "";
    let authority = "";
    try {
      const res = await fetch(zarinpalUrls(storefront.gatewaySandbox).request, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          merchant_id: storefront.gatewayMerchantId,
          amount: Number(amountRial), // ریال
          callback_url: callbackUrl,
          description: `سفارش ${order.id.slice(-8).toUpperCase()} از فروشگاه ${storefront.title} — ${order.customerName}`,
        }),
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => null)) as
        | { data?: { authority?: string; code?: number }; errors?: { code?: number } }
        | null;
      if (json?.data?.authority) {
        authority = json.data.authority;
        startPay = `${zarinpalUrls(storefront.gatewaySandbox).startPay}${authority}`;
      } else {
        const errCode = json?.errors?.code;
        return NextResponse.json(
          { success: false, error: `درگاه پرداخت: ${zarinpalErrorFa(errCode ?? -52)}` },
          { status: 502 }
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: "ارتباط با درگاه پرداخت برقرار نشد — چند لحظه بعد دوباره تلاش کنید" },
        { status: 502 }
      );
    } finally {
      clearTimeout(timer);
    }

    // ذخیرهٔ authority + روش پرداخت
    await db.storefrontOrder.update({
      where: { id: order.id },
      data: { gatewayAuthority: authority, paymentMethod: "gateway" },
    });

    return NextResponse.json({ success: true, redirectUrl: startPay, orderId: order.id });
  } catch (error) {
    console.error("[storefront pay POST]", error);
    return NextResponse.json({ success: false, error: "خطا در شروع پرداخت" }, { status: 500 });
  }
}
