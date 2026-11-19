import { NextRequest, NextResponse } from "next/server";
import { getStorefrontBySlug, getStorefrontProducts, decryptCardNumber, getTenantName } from "@/lib/storefront-auth";
import { formatCardNumberForDisplay } from "@/lib/storefront";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** تجزیهٔ امن JSON — رکورد خراب هرگز پاسخ ۵۰۰ نمی‌سازد */
function safeJsonParse(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// GET /api/storefront/[slug] — داده‌های عمومی فروشگاه
// بدون احراز هویت: کالاها به‌صورت زنده از Product همان tenant همگام می‌شوند.
// شماره کارت برای مشتری کامل (گروه‌بندی‌شده) برمی‌گردد — مشتری برای پرداخت باید ببیندش.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const storefront = await getStorefrontBySlug(slug);
    if (!storefront || !storefront.isActive) {
      return NextResponse.json(
        { success: false, error: "فروشگاه یافت نشد یا فعال نیست" },
        { status: 404 }
      );
    }
    // Task 3-d — تعلیق سوپرادمینی
    if (storefront.status === "suspended") {
      return NextResponse.json(
        { success: false, error: "این فروشگاه موقتاً تعلیق شده است" },
        { status: 503 }
      );
    }

    const products = await getStorefrontProducts(storefront.tenantId);
    const tenantName = await getTenantName(storefront.tenantId);

    // R16 — نرخ ارز برای نمایش چندارزی (دلار/یوان) — از ExchangeRateHistory
    let usdRateToman: number | null = null;
    let cnyRateToman: number | null = null;
    try {
      const rates = await db.exchangeRateHistory.findMany({
        where: { fromCurrency: { in: ["USD", "CNY"] }, toCurrency: "IRR" },
        orderBy: { recordedAt: "desc" },
        take: 20,
      });
      const usd = rates.find((r) => r.fromCurrency === "USD");
      const cny = rates.find((r) => r.fromCurrency === "CNY");
      // rate به ریال است → تقسیم بر ۱۰ = تومان
      if (usd && Number(usd.rate) > 0) usdRateToman = Math.trunc(Number(usd.rate) / 10);
      if (cny && Number(cny.rate) > 0) cnyRateToman = Math.trunc(Number(cny.rate) / 10);
    } catch {
      /* نرخ ارز مکمل است — نبودش صفحه را نمی‌شکند */
    }

    const shop = {
      slug: storefront.slug,
      title: storefront.title,
      description: storefront.description,
      template: storefront.template,
      accentColor: storefront.accentColor,
      phone: storefront.phone,
      address: storefront.address,
      city: storefront.city,
      lat: storefront.lat,
      lng: storefront.lng,
      socialInstagram: storefront.socialInstagram,
      socialTelegram: storefront.socialTelegram,
      socialWhatsapp: storefront.socialWhatsapp,
      // شماره کارت کامل (گروه‌بندی ۴-رقمی) — لازم برای پرداخت مشتری
      cardNumber: formatCardNumberForDisplay(decryptCardNumber(storefront.cardNumberEnc)),
      cardHolderName: storefront.cardHolderName,
      cardImage: storefront.cardImage,
      tenantName,
      // ─── R16: سایت‌ساز هوشمند ───
      businessType: storefront.businessType,
      announcement: storefront.announcement,
      ticketEnabled: storefront.ticketEnabled,
      discountActive: !!(storefront.discountCode && storefront.discountPercent),
      discountPercent: storefront.discountCode && storefront.discountPercent ? storefront.discountPercent : null,
      content: storefront.content ? JSON.parse(storefront.content) : null,
      // R24-4 — بلوک‌های منتشرشدهٔ ویرایشگر بلوکی (اگر باشد، کلاینت به‌جای قالب رندر می‌کند)
      blocks: safeJsonParse(storefront.blocksJson),
    };

    return NextResponse.json({ success: true, shop, products, rates: { usdRateToman, cnyRateToman } });
  } catch (error) {
    console.error("[storefront GET] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت اطلاعات فروشگاه" },
      { status: 500 }
    );
  }
}
