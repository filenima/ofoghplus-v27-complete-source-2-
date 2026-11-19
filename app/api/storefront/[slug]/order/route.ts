import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorefrontBySlug, priceOrderItemsServerSide, getSfCustomerFromCookie, notifyStorefrontOwner, decryptCardNumber } from "@/lib/storefront-auth";
import { formatCardNumberForDisplay, STOREFRONT_ORDER_NOTE_MAX } from "@/lib/storefront";
import { toEnglishDigits, toPersianDigits, formatNumber } from "@/lib/persian";
import { rateLimitCheck, buildRateLimitResponse, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/storefront/[slug]/order — ثبت سفارش عمومی
// قیمت‌ها همیشه سمت سرور از Product.salePrice بازمحاسبه می‌شوند (به کلاینت اعتماد نمی‌شود).
// وضعیت اولیه PENDING؛ اعلان درون‌برنامه‌ای برای مالک ساخته می‌شود.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // محدودیت نرخ: ۱۲ سفارش در ۱۰ دقیقه برای هر IP (ضد اسپم فرم عمومی)
    const rl = rateLimitCheck(`sf-order:${getClientIp(req)}`, 12, 10 * 60_000);
    if (!rl.ok) {
      return await buildRateLimitResponse(rl, "درخواست‌های سفارش بیش از حد مجاز است. کمی صبر کنید.");
    }

    const { slug } = await params;
    const storefront = await getStorefrontBySlug(slug);
    if (!storefront || !storefront.isActive) {
      return NextResponse.json(
        { success: false, error: "فروشگاه یافت نشد یا فعال نیست" },
        { status: 404 }
      );
    }
    // Task 3-d — تعلیق سوپرادمینی: ثبت سفارش بسته است
    if (storefront.status === "suspended") {
      return NextResponse.json(
        { success: false, error: "این فروشگاه موقتاً تعلیق شده است" },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    // ── اعتبارسنجی اطلاعات خریدار ──
    const customerName = String(b.customerName ?? "").trim();
    if (customerName.length < 2 || customerName.length > 80) {
      return NextResponse.json(
        { success: false, error: "نام خریدار باید ۲ تا ۸۰ نویسه باشد" },
        { status: 400 }
      );
    }
    const customerEmailRaw = String(b.customerEmail ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customerEmailRaw)) {
      return NextResponse.json(
        { success: false, error: "ایمیل معتبر وارد کنید" },
        { status: 400 }
      );
    }
    const customerPhoneRaw = b.customerPhone === undefined || b.customerPhone === null ? "" : toEnglishDigits(String(b.customerPhone)).replace(/[\s-]/g, "");
    if (customerPhoneRaw && !/^\+?\d{8,15}$/.test(customerPhoneRaw)) {
      return NextResponse.json(
        { success: false, error: "شماره تماس معتبر نیست" },
        { status: 400 }
      );
    }
    const note = b.note === undefined || b.note === null ? null : String(b.note).trim().slice(0, STOREFRONT_ORDER_NOTE_MAX) || null;

    // ── قیمت‌گذاری امن سمت سرور ──
    const priced = await priceOrderItemsServerSide(storefront.tenantId, b.items);
    if (!priced.ok) {
      return NextResponse.json({ success: false, error: priced.error }, { status: 400 });
    }

    // ── بازبینی موجودی در لحظهٔ ثبت سفارش (همان منطق getStorefrontProducts) ──
    // کلاینت فقط اقلام inStock را می‌فرستد، اما فراخوانی مستقیم API می‌توانست
    // کالای ناموجود را سفارش دهد و پس از تأیید، موجودی انبار را منفی کند.
    const stockRows = await db.stockItem.groupBy({
      by: ["productId"],
      where: { tenantId: storefront.tenantId, productId: { in: priced.items.map((i) => i.productId) } },
      _sum: { quantity: true },
    });
    const stockMap = new Map(stockRows.map((r) => [r.productId, r._sum.quantity ?? 0]));
    for (const it of priced.items) {
      if (stockMap.has(it.productId) && (stockMap.get(it.productId) ?? 0) < it.qty) {
        return NextResponse.json(
          { success: false, error: `موجودی کالای «${it.name}» کافی نیست — سبد خرید را به‌روزرسانی کنید` },
          { status: 409 }
        );
      }
    }

    // ── R16: کد تخفیف فروشگاه (اختیاری) — سمت سرور اعتبارسنجی و اعمال ──
    let discountApplied = 0;
    let payableRial = priced.totalRial;
    if (b.discountCode !== undefined && b.discountCode !== null && String(b.discountCode).trim() !== "") {
      const codeInput = String(b.discountCode).trim().toUpperCase();
      const codeStored = (storefront.discountCode ?? "").trim().toUpperCase();
      const percent = storefront.discountPercent ?? 0;
      if (!codeStored || !percent) {
        return NextResponse.json({ success: false, error: "این فروشگاه کد تخفیف فعال ندارد" }, { status: 400 });
      }
      if (codeInput !== codeStored) {
        return NextResponse.json({ success: false, error: "کد تخفیف واردشده معتبر نیست" }, { status: 400 });
      }
      if (percent < 1 || percent > 50) {
        return NextResponse.json({ success: false, error: "درصد تخفیف نامعتبر است" }, { status: 400 });
      }
      discountApplied = percent;
      const discountAmount = (priced.totalRial * BigInt(percent)) / 100n;
      payableRial = priced.totalRial - discountAmount;
    }

    // ── اتصال به حساب مشتری واردشده (اگر کوکی نشست موجود بود) ──
    const sfCustomer = await getSfCustomerFromCookie(req, storefront.id);

    const order = await db.storefrontOrder.create({
      data: {
        storefrontId: storefront.id,
        customerId: sfCustomer?.id ?? null,
        customerName,
        customerPhone: customerPhoneRaw || null,
        customerEmail: customerEmailRaw,
        items: JSON.stringify(priced.items),
        totalRial: priced.totalRial,
        discountApplied: discountApplied || null,
        payableRial: discountApplied ? payableRial : null,
        status: "PENDING",
        note,
      },
      select: { id: true, status: true, totalRial: true, payableRial: true, discountApplied: true },
    });

    // اعلان مالک — «everything automatic»: سفارش جدید بدون اقدام مالک زنگ اعلان می‌خورد
    await notifyStorefrontOwner(
      storefront,
      "سفارش جدید در فروشگاه آنلاین",
      `مشتری «${customerName}» سفارشی به مبلغ ${formatNumber(Number(payableRial / 10n))} تومان ثبت کرد${discountApplied ? ` (با تخفیف ${toPersianDigits(discountApplied)}٪)` : ""}. در انتظار پرداخت و رسید.`,
      "storefront"
    );

    return NextResponse.json({
      success: true,
      orderId: order.id,
      status: order.status,
      totalRial: order.totalRial.toString(),
      discountApplied: discountApplied || null,
      payableRial: payableRial.toString(),
      // اطلاعات پرداخت برای مرحله بعد (آپلود رسید)
      payment: {
        cardNumber: formatCardNumberForDisplay(decryptCardNumber(storefront.cardNumberEnc)),
        cardHolderName: storefront.cardHolderName,
        cardImage: storefront.cardImage,
      },
    });
  } catch (error) {
    console.error("[storefront order POST] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در ثبت سفارش — لطفاً دوباره تلاش کنید" },
      { status: 500 }
    );
  }
}
