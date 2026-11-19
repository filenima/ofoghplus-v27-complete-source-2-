import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorefrontBySlug, getSfCustomerFromCookie } from "@/lib/storefront-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/storefront/[slug]/invoice/[orderId] — فاکتور قابل‌چاپ/دانلود سفارش (R16)
 * دسترسی: نشست مشتری فروشگاه (کوکی امضاشده) یا ?email= مطابق ایمیل سفارش.
 * خروجی: HTML راست‌به‌چپ مخصوص چاپ (مرورگر → «ذخیره به‌صورت PDF» = دانلود فاکتور).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; orderId: string }> }
) {
  try {
    const { slug, orderId } = await params;
    const storefront = await getStorefrontBySlug(slug);
    if (!storefront || !storefront.isActive) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد" }, { status: 404 });
    }
    // Task 3-d — تعلیق سوپرادمینی: فاکتور فروشگاه معلق صادر نمی‌شود
    if (storefront.status === "suspended") {
      return NextResponse.json({ success: false, error: "این فروشگاه موقتاً تعلیق شده است" }, { status: 503 });
    }

    const order = await db.storefrontOrder.findFirst({
      where: { id: orderId, storefrontId: storefront.id },
      include: { invoice: { select: { number: true, date: true, id: true } } },
    });
    if (!order) {
      return NextResponse.json({ success: false, error: "سفارش یافت نشد" }, { status: 404 });
    }

    // احراز دسترسی: کوکی نشست مشتری یا ایمیل مطابق
    const sfCustomer = await getSfCustomerFromCookie(req, storefront.id);
    const emailParam = req.nextUrl.searchParams.get("email")?.trim().toLowerCase() ?? "";
    const authorized =
      (sfCustomer && order.customerId === sfCustomer.id) ||
      (emailParam && emailParam === order.customerEmail.toLowerCase());
    if (!authorized) {
      return NextResponse.json(
        { success: false, error: "برای مشاهدهٔ فاکتور، با ایمیلِ ثبت‌شده در سفارش وارد شوید" },
        { status: 403 }
      );
    }

    // اگر سفارش هنوز تأیید نشده، فاکتور نهایی صادر نمی‌شود
    if (!["APPROVED", "SHIPPED"].includes(order.status)) {
      return NextResponse.json(
        { success: false, error: "فاکتور پس از تأیید سفارش توسط فروشگاه صادر می‌شود" },
        { status: 409 }
      );
    }

    const items = JSON.parse(order.items) as { name: string; priceRial: string; qty: number }[];
    const payable = order.payableRial ?? order.totalRial;
    const discount = order.totalRial - payable;
    const faNum = (n: number | bigint | string) => new Intl.NumberFormat("fa-IR").format(Number(n) / 10);

    const jalali = new Intl.DateTimeFormat("fa-IR", { dateStyle: "full" }).format(order.createdAt);

    // HTML مخصوص چاپ — بدون وابستگی خارجی، فونت سیستمی فارسی
    const rows = items
      .map(
        (it, i) => `<tr>
          <td class="c">${i + 1}</td>
          <td>${escapeHtml(it.name)}</td>
          <td class="c">${faNum(it.priceRial)}</td>
          <td class="c">${it.qty}</td>
          <td class="c">${faNum(BigInt(it.priceRial) * BigInt(it.qty))}</td>
        </tr>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>فاکتور سفارش — ${escapeHtml(storefront.title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Vazirmatn, Tahoma, sans-serif; background: #f4f4f5; color: #18181b; padding: 16px; }
  .page { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 28px 24px; box-shadow: 0 8px 30px rgba(0,0,0,.06); }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding-bottom: 16px; border-bottom: 2px solid #18181b; }
  h1 { font-size: 18px; }
  .meta { font-size: 12px; color: #52525b; line-height: 1.9; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 13px; }
  th, td { border: 1px solid #d4d4d8; padding: 9px 8px; text-align: right; }
  th { background: #18181b; color: #fff; font-size: 12px; }
  .c { text-align: center; white-space: nowrap; }
  .totals { margin-top: 16px; margin-inline-start: auto; width: 300px; font-size: 13px; }
  .totals div { display: flex; justify-content: space-between; padding: 7px 10px; border-bottom: 1px dashed #d4d4d8; }
  .totals .grand { font-weight: 800; font-size: 15px; background: #fafafa; border: 1.5px solid #18181b; border-radius: 10px; margin-top: 6px; }
  .stamp { margin-top: 20px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; color: #71717a; }
  .actions { max-width: 720px; margin: 14px auto 0; display: flex; gap: 8px; flex-wrap: wrap; }
  .btn { border: 0; border-radius: 999px; padding: 10px 22px; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
  .btn-dark { background: #18181b; color: #fff; }
  .btn-ghost { background: #fff; color: #18181b; border: 1px solid #d4d4d8; }
  .brand { display: inline-flex; align-items: center; gap: 6px; margin-top: 18px; padding: 6px 14px; background: #18181b; color: #fff; border-radius: 999px; font-size: 11px; text-decoration: none; }
  @media print {
    body { background: #fff; padding: 0; }
    .page { box-shadow: none; border-radius: 0; max-width: 100%; }
    .actions { display: none; }
  }
</style>
</head>
<body>
  <div class="page">
    <header>
      <div>
        <h1>${escapeHtml(storefront.title)}</h1>
        <div class="meta">${escapeHtml(storefront.address ?? "")}${storefront.city ? " — " + escapeHtml(storefront.city) : ""}</div>
        <div class="meta" dir="ltr">${escapeHtml(storefront.phone ?? "")}</div>
      </div>
      <div style="text-align:left">
        <div style="font-weight:800">فاکتور فروش</div>
        <div class="meta">شمارهٔ سفارش: ${escapeHtml(order.id.slice(-8).toUpperCase())}</div>
        <div class="meta">${order.invoice ? "شمارهٔ فاکتور: " + escapeHtml(order.invoice.number) : ""}</div>
        <div class="meta">${jalali}</div>
      </div>
    </header>

    <div class="meta" style="margin-top:14px">
      خریدار: <strong>${escapeHtml(order.customerName)}</strong> — ${escapeHtml(order.customerEmail)}
    </div>

    <table>
      <thead>
        <tr><th>#</th><th>شرح کالا</th><th>مبلغ واحد (تومان)</th><th>تعداد</th><th>مبلغ کل (تومان)</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div><span>جمع کل</span><span>${faNum(order.totalRial)}</span></div>
      ${discount > 0n ? `<div><span>تخفیف (${order.discountApplied ?? 0}٪)</span><span>${faNum(discount)}</span></div>` : ""}
      <div class="grand"><span>قابل پرداخت</span><span>${faNum(payable)}</span></div>
    </div>

    <div class="stamp">
      <span>وضعیت: ${order.status === "SHIPPED" ? "ارسال شد" : "تأیید و پرداخت شد"}</span>
      <span>امضای فروشنده</span>
    </div>

    <div style="text-align:center; margin-top: 8px;">
      <a class="brand" href="/" target="_blank" rel="noopener noreferrer">نرم‌افزار حسابداری افق پلاس</a>
    </div>
  </div>

  <div class="actions">
    <button class="btn btn-dark" onclick="window.print()">دانلود / چاپ فاکتور (PDF)</button>
    <button class="btn btn-ghost" onclick="window.history.back()">بازگشت به فروشگاه</button>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[storefront invoice GET] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در تولید فاکتور" }, { status: 500 });
  }
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
