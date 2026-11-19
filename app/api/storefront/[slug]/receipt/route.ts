import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorefrontBySlug, notifyStorefrontOwner } from "@/lib/storefront-auth";
import { STOREFRONT_ORDER_NOTE_MAX } from "@/lib/storefront";
import { savePrivateUpload, signUploadUrl } from "@/lib/secure-uploads";
import { rateLimitCheck, buildRateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { formatNumber } from "@/lib/persian";
import { convertToAvif } from "@/lib/image-avif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RECEIPT_SIZE = 8 * 1024 * 1024; // ۸ مگابایت

// POST /api/storefront/[slug]/receipt — آپلود رسید پرداخت کارت‌به‌کارت
// multipart: orderId + receipt (تصویر اسکرین‌شات/عکس رسید) + note اختیاری
// پس از آپلود موفق، وضعیت سفارش AWAITING_APPROVAL می‌شود.
// NOTE(امنیت): رسیدها در private-uploads ذخیره و فقط با URL امضاشده سرو می‌شوند
// (الگوی SECURITY-H3 — رسید مالی نباید عمومی باشد).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const rl = rateLimitCheck(`sf-receipt:${getClientIp(req)}`, 20, 10 * 60_000);
    if (!rl.ok) {
      return await buildRateLimitResponse(rl, "درخواست‌های آپلود بیش از حد مجاز است. کمی صبر کنید.");
    }

    const { slug } = await params;
    const storefront = await getStorefrontBySlug(slug);
    if (!storefront || !storefront.isActive) {
      return NextResponse.json(
        { success: false, error: "فروشگاه یافت نشد یا فعال نیست" },
        { status: 404 }
      );
    }
    // Task 3-d — تعلیق سوپرادمینی: جریان رسید/پرداخت فروشگاه معلق بسته است
    if (storefront.status === "suspended") {
      return NextResponse.json(
        { success: false, error: "این فروشگاه موقتاً تعلیق شده است" },
        { status: 503 }
      );
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { success: false, error: "درخواست multipart نامعتبر است" },
        { status: 400 }
      );
    }

    const orderId = String(formData.get("orderId") ?? "");
    const file = formData.get("receipt");
    const noteRaw = String(formData.get("note") ?? "");
    const note = noteRaw.trim().slice(0, STOREFRONT_ORDER_NOTE_MAX) || null;

    if (!orderId) {
      return NextResponse.json({ success: false, error: "شناسه سفارش الزامی است" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "تصویر رسید را انتخاب کنید" },
        { status: 400 }
      );
    }
    if (file.size === 0 || file.size > MAX_RECEIPT_SIZE) {
      return NextResponse.json(
        { success: false, error: "حجم فایل باید بین ۱ بایت تا ۸ مگابایت باشد" },
        { status: 400 }
      );
    }

    // پسوند/MIME امن — SVG ممنوع (الگوی upload-logo)
    const fileType = (file.type || "").toLowerCase();
    const fileNameLower = (file.name || "").toLowerCase();
    const isImage =
      (["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/avif"].includes(fileType) &&
        !/\.svg$/i.test(fileNameLower)) ||
      /\.(png|jpe?g|webp|gif|avif)$/i.test(fileNameLower);
    if (!isImage) {
      return NextResponse.json(
        { success: false, error: "فقط تصویر (PNG، JPG، WebP، GIF، AVIF) مجاز است" },
        { status: 400 }
      );
    }
    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/avif": "avif",
    };
    const nameExt = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const ext = extMap[fileType] || (["png", "jpg", "jpeg", "webp", "gif", "avif"].includes(nameExt) ? nameExt : "png");

    const order = await db.storefrontOrder.findFirst({
      where: { id: orderId, storefrontId: storefront.id },
      select: { id: true, status: true, customerName: true, totalRial: true, receiptImage: true },
    });
    if (!order) {
      return NextResponse.json(
        { success: false, error: "سفارش یافت نشد" },
        { status: 404 }
      );
    }
    // فقط سفارش‌های در جریان پرداخت می‌توانند رسید بگیرند (تأیید/رد/ارسال‌شده قفل است)
    if (!["PENDING", "AWAITING_RECEIPT", "AWAITING_APPROVAL"].includes(order.status)) {
      return NextResponse.json(
        { success: false, error: "برای این سفارش رسید قابل ارسال نیست" },
        { status: 409 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // تبدیل خودکار به AVIF — صرفه‌جویی در فضای ذخیره‌سازی؛ در خطا همان بافر/پسوند اصلی
    // ذخیره می‌شود (آپلود هرگز به‌خاطر انکود شکست نمی‌خورد)
    const converted = await convertToAvif(buffer, { fallbackExt: ext });
    // ذخیره خصوصی + نام تصادفی (prefix سفارش) — امنیت مسیر و پوشش
    const fileName = await savePrivateUpload(converted.buffer, `sf-receipt-${order.id.slice(0, 10)}`, converted.ext);

    const updated = await db.storefrontOrder.update({
      where: { id: order.id },
      data: {
        receiptImage: fileName,
        status: "AWAITING_APPROVAL",
        ...(note ? { note } : {}),
      },
      select: { id: true, status: true },
    });

    // اعلان مالک: رسید رسید و منتظر تأیید است
    await notifyStorefrontOwner(
      storefront,
      "رسید پرداخت جدید",
      `سفارش «${order.customerName}» به مبلغ ${formatNumber(Number(order.totalRial / 10n))} تومان رسید دارد و منتظر تأیید شماست.`,
      "storefront"
    );

    return NextResponse.json({
      success: true,
      orderId: updated.id,
      status: updated.status,
      receiptUrl: signUploadUrl(fileName, 3600),
      message: "رسید با موفقیت ارسال شد — سفارش در انتظار تأیید مالک فروشگاه است",
    });
  } catch (error) {
    console.error("[storefront receipt POST] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در آپلود رسید — لطفاً دوباره تلاش کنید" },
      { status: 500 }
    );
  }
}
