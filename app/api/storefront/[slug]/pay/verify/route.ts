import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorefrontBySlug } from "@/lib/storefront-auth";
import { zarinpalUrls, zarinpalErrorFa, ZARINPAL_FETCH_TIMEOUT_MS } from "@/lib/zarinpal";
import { getSiteUrl } from "@/lib/seo";
import { issueInvoiceForStorefrontOrder } from "@/lib/storefront-accounting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════
// Task 1-c — GET /api/storefront/[slug]/pay/verify?order=<orderId>&Authority=<auth>&Status=<OK|NOK>
// کال‌بک زرین‌پال — وریفای + تأیید خودکار سفارش + صدور فاکتور حسابداری
// ═══════════════════════════════════════════════════════════════════
// پس از وریفای موفق: status=APPROVED، gatewayRefId ذخیره، فاکتور SALE/PAID
// صادر و invoiceId ست می‌شود (همان منطق تأیید دستی مالک — یک منبع حقیقت)؛
// سپس کاربر به صفحهٔ فروشگاه با پیام موفقیت ریدایرکت می‌شود.

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const sp = req.nextUrl.searchParams;
    const orderId = sp.get("order") ?? "";
    const authority = sp.get("Authority") ?? sp.get("authority") ?? "";
    const status = (sp.get("Status") ?? sp.get("status") ?? "").toUpperCase();
    const base = (await getSiteUrl()).replace(/\/+$/, "");

    const storefront = await getStorefrontBySlug(slug);
    if (!storefront || !storefront.isActive) {
      return NextResponse.redirect(`${base}/shop/${slug}?pay=failed&reason=store`);
    }
    // Task 3-d — تعلیق سوپرادمینی: کال‌بک درگاه فروشگاه معلق تأیید نمی‌شود
    // (پول تسویه نمی‌شود چون verify فراخوانی نمی‌گردد)
    if (storefront.status === "suspended") {
      return NextResponse.redirect(`${base}/shop/${slug}?pay=failed&reason=store`);
    }
    const order = await db.storefrontOrder.findFirst({
      where: { id: orderId, storefrontId: storefront.id },
    });
    if (!order || !order.gatewayAuthority || order.gatewayAuthority !== authority) {
      return NextResponse.redirect(`${base}/shop/${slug}?pay=failed&reason=order`);
    }
    // قبلاً تأیید شده؟ idempotent
    if (order.status === "APPROVED" || order.status === "SHIPPED" || order.gatewayRefId) {
      return NextResponse.redirect(`${base}/shop/${slug}?pay=ok&order=${order.id}`);
    }
    if (status !== "OK") {
      return NextResponse.redirect(`${base}/shop/${slug}?pay=failed&reason=canceled`);
    }

    // وریفای با زرین‌پال
    const amountRial = order.payableRial ?? order.totalRial;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ZARINPAL_FETCH_TIMEOUT_MS);
    let refId = "";
    let verified = false;
    try {
      const res = await fetch(zarinpalUrls(storefront.gatewaySandbox).verify, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          merchant_id: storefront.gatewayMerchantId,
          amount: Number(amountRial),
          authority,
        }),
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => null)) as
        | { data?: { code?: number; ref_id?: number; card_pan?: string }; errors?: { code?: number } }
        | null;
      const code = json?.data?.code;
      if (code === 100 || code === 101) {
        verified = true;
        refId = String(json?.data?.ref_id ?? "");
      } else {
        const errCode = json?.errors?.code ?? code;
        return NextResponse.redirect(
          `${base}/shop/${slug}?pay=failed&reason=verify&code=${errCode ?? ""}&msg=${encodeURIComponent(zarinpalErrorFa(errCode ?? -51))}`
        );
      }
    } catch {
      return NextResponse.redirect(`${base}/shop/${slug}?pay=failed&reason=network`);
    } finally {
      clearTimeout(timer);
    }

    if (!verified) {
      return NextResponse.redirect(`${base}/shop/${slug}?pay=failed&reason=verify`);
    }

    // ── تأیید خودکار سفارش + فاکتور (منبع واحد: lib/storefront-accounting) ──
    // فاکتور SALE/PAID + اقلام + کاهش موجودی انبار + سند حسابداری و تسویه —
    // idempotent و غیرمسدودکننده؛ سفارش در هر حالت APPROVED می‌شود.
    const tenantId = storefront.tenantId;
    let invoiceNumber: string | null = null;
    const issued = await issueInvoiceForStorefrontOrder({
      tenantId,
      storefrontSlug: storefront.slug,
      storefrontTitle: storefront.title,
      order,
      userId: null, // پرداخت درگاهی — ثبت سیستمی
      paymentType: "ONLINE",
      extraNote: refId ? `پیگیری ${refId}` : null,
    });
    if (issued) invoiceNumber = issued.invoiceNumber;

    await db.storefrontOrder.update({
      where: { id: order.id },
      data: {
        status: "APPROVED",
        gatewayRefId: refId || null,
        gatewayAuthority: authority,
        paymentMethod: "gateway",
      },
    });

    // لاگ ممیزی برای مالک
    await db.auditLog
      .create({
        data: {
          tenantId,
          userId: "SYSTEM_GATEWAY",
          action: "UPDATE",
          entity: "StorefrontOrder",
          entityId: order.id,
          changes: JSON.stringify({
            status: "APPROVED",
            via: "zarinpal-auto",
            refId,
            invoiceNumber,
          }),
        },
      })
      .catch(() => undefined);

    return NextResponse.redirect(`${base}/shop/${slug}?pay=ok&order=${order.id}&ref=${refId}`);
  } catch (error) {
    console.error("[storefront pay verify]", error);
    // FIX(R17-C): قبلاً به «/shop» خالی ریدایرکت می‌شد که ۴۰۴ است (مسیر ایندکس
    // /shop وجود ندارد) — slug واقعی از params دوباره خوانده می‌شود.
    const base = (await getSiteUrl()).replace(/\/+$/, "");
    let shopSlug = "";
    try {
      shopSlug = (await params).slug;
    } catch {
      /* ignore */
    }
    return NextResponse.redirect(
      `${base}/shop/${encodeURIComponent(shopSlug)}?pay=failed&reason=error`
    );
  }
}
