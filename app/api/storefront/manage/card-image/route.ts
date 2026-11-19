import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getStorefrontByTenant } from "@/lib/storefront-auth";
import { convertToAvif } from "@/lib/image-avif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 8 * 1024 * 1024; // ۸ مگابایت
// SVG ممنوع — فایل در public/uploads سرو می‌شود (XSS ذخیره‌شده) — AVIF ورودی هم پذیرفته می‌شود
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/avif"]);

// POST /api/storefront/manage/card-image — آپلود تصویر کارت بانکی مالک
// تصویر باید عمومی سرو شود (مشتری در پرداخت می‌بیندش) → public/uploads/storefront
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json(
        { success: false, error: "ابتدا فروشگاه خود را بسازید" },
        { status: 404 }
      );
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const file = formData.get("cardImage");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "فایل تصویر کارت را انتخاب کنید" },
        { status: 400 }
      );
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "حجم فایل باید بین ۱ بایت تا ۸ مگابایت باشد" },
        { status: 400 }
      );
    }

    const fileType = (file.type || "").toLowerCase();
    const fileNameLower = (file.name || "").toLowerCase();
    const isImage =
      (ALLOWED_MIME.has(fileType) && !/\.svg$/i.test(fileNameLower)) ||
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

    const uploadDir = path.join(process.cwd(), "public", "uploads", "storefront");
    await mkdir(uploadDir, { recursive: true });
    // تبدیل خودکار به AVIF — صرفه‌جویی در فضای ذخیره‌سازی؛ در خطا همان بافر/پسوند اصلی
    const converted = await convertToAvif(Buffer.from(await file.arrayBuffer()), { fallbackExt: ext });
    const fileName = `sf-card-${auth.user.userId}-${Date.now()}.${converted.ext}`;
    await writeFile(path.join(uploadDir, fileName), converted.buffer);

    const cardImage = `/uploads/storefront/${fileName}`;
    await db.storefront.update({
      where: { id: storefront.id },
      data: { cardImage },
    });

    await db.auditLog.create({
      data: {
        tenantId,
        userId: auth.user.userId,
        action: "UPLOAD_CARD_IMAGE",
        entity: "Storefront",
        entityId: storefront.id,
      },
    });

    return NextResponse.json({
      success: true,
      cardImage,
      message: "تصویر کارت با موفقیت آپلود شد",
    });
  } catch (error) {
    console.error("[storefront card-image POST] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در آپلود تصویر کارت — دوباره تلاش کنید" },
      { status: 500 }
    );
  }
}
