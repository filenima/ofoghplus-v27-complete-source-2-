import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
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

/**
 * R17-C — POST /api/storefront/manage/product-image
 * آپلود/تعویض عکس یک کالا از پنل فروشگاه (فرم multipart: productId + file).
 * عکس کالا عمومی است (در سایت و فاکتور دیده می‌شود) → public/uploads/storefront/products
 * و همان لحظه روی Product.imageUrl همان tenant اعمال می‌شود.
 *
 * v20-C — حالت گالری: اگر فیلد gallery=1 ارسال شود، فایل فقط ذخیره و مسیرش
 * برگردانده می‌شود (بدون تغییر Product.imageUrl و بدون حذف عکس قبلی) — کلاینت
 * آرایهٔ گالری را با PUT /api/storefront/manage/products/[id] meta.gallery ذخیره می‌کند.
 */
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
    const productId = String(formData.get("productId") ?? "");
    const file = formData.get("file");
    // v20-C — گالری: فقط آپلود فایل، بدون تغییر عکس اصلی کالا
    const isGallery = formData.get("gallery") === "1" || formData.get("scope") === "gallery";
    if (!productId) {
      return NextResponse.json({ success: false, error: "شناسه کالا الزامی است" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "فایل تصویر را انتخاب کنید" }, { status: 400 });
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

    // کالا باید متعلق به tenant همان مالک باشد
    const product = await db.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
      select: { id: true, imageUrl: true },
    });
    if (!product) {
      return NextResponse.json({ success: false, error: "کالا یافت نشد" }, { status: 404 });
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

    const uploadDir = path.join(process.cwd(), "public", "uploads", "storefront", "products");
    await mkdir(uploadDir, { recursive: true });
    // تبدیل خودکار به AVIF — صرفه‌جویی در فضای ذخیره‌سازی؛ در خطا همان بافر/پسوند اصلی
    // ذخیره می‌شود (آپلود هرگز به‌خاطر انکود شکست نمی‌خورد)
    const converted = await convertToAvif(Buffer.from(await file.arrayBuffer()), { fallbackExt: ext });
    const fileName = `sf-product-${product.id}-${Date.now()}${isGallery ? "-g" : ""}.${converted.ext}`;
    await writeFile(path.join(uploadDir, fileName), converted.buffer);

    const imageUrl = `/uploads/storefront/products/${fileName}`;

    // ── حالت گالری: فایل ذخیره شد؛ عکس اصلی و فایل‌های قبلی دست‌نخورده می‌مانند ──
    if (isGallery) {
      return NextResponse.json({
        success: true,
        imageUrl,
        gallery: true,
        message: "تصویر گالری آپلود شد — ترتیب را در ویرایشگر بچینید و ذخیره کنید",
      });
    }

    // عکس قبلیِ اختصاصی همین مسیر را پاک کنیم (دریافت مجدد فضا)
    if (product.imageUrl?.startsWith("/uploads/storefront/products/")) {
      const oldPath = path.join(process.cwd(), "public", product.imageUrl.replace(/^\//, ""));
      await unlink(oldPath).catch(() => undefined);
    }

    await db.product.update({
      where: { id: product.id },
      data: { imageUrl },
    });

    await db.auditLog.create({
      data: {
        tenantId,
        userId: auth.user.userId,
        action: "UPLOAD_PRODUCT_IMAGE",
        entity: "Product",
        entityId: product.id,
        changes: JSON.stringify({ via: "storefront-panel", imageUrl }),
      },
    });

    return NextResponse.json({
      success: true,
      imageUrl,
      message: "عکس کالا ذخیره شد — همان حالا در سایت شما دیده می‌شود",
    });
  } catch (error) {
    console.error("[storefront product-image POST] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در آپلود عکس کالا — دوباره تلاش کنید" },
      { status: 500 }
    );
  }
}

/**
 * R17-C — DELETE /api/storefront/manage/product-image?productId=...
 * حذف عکس کالا (برمی‌گردد به جای‌نگهدار گرادیانی سایت).
 *
 * v20-C — حذف تصویر گالری: DELETE ?url=/uploads/storefront/products/...
 * فقط فایل را از دیسک پاک می‌کند (آرایهٔ گالری را خود کلاینت با PUT products/[id] به‌روز می‌کند).
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    // ── حالت گالری: حذف فایل با مسیر مستقیم ──
    const galleryUrl = req.nextUrl.searchParams.get("url");
    if (galleryUrl) {
      if (
        !galleryUrl.startsWith("/uploads/storefront/products/") ||
        galleryUrl.includes("..")
      ) {
        return NextResponse.json(
          { success: false, error: "مسیر تصویر گالری نامعتبر است" },
          { status: 400 }
        );
      }
      const filePath = path.join(process.cwd(), "public", galleryUrl.replace(/^\//, ""));
      await unlink(filePath).catch(() => undefined);
      return NextResponse.json({ success: true, message: "تصویر گالری حذف شد" });
    }

    const productId = String(req.nextUrl.searchParams.get("productId") ?? "");
    if (!productId) {
      return NextResponse.json({ success: false, error: "شناسه کالا الزامی است" }, { status: 400 });
    }

    const product = await db.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
      select: { id: true, imageUrl: true },
    });
    if (!product) {
      return NextResponse.json({ success: false, error: "کالا یافت نشد" }, { status: 404 });
    }

    if (product.imageUrl?.startsWith("/uploads/storefront/products/")) {
      const oldPath = path.join(process.cwd(), "public", product.imageUrl.replace(/^\//, ""));
      await unlink(oldPath).catch(() => undefined);
    }

    await db.product.update({
      where: { id: product.id },
      data: { imageUrl: null },
    });

    await db.auditLog.create({
      data: {
        tenantId,
        userId: auth.user.userId,
        action: "DELETE_PRODUCT_IMAGE",
        entity: "Product",
        entityId: product.id,
      },
    });

    return NextResponse.json({ success: true, message: "عکس کالا حذف شد" });
  } catch (error) {
    console.error("[storefront product-image DELETE] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در حذف عکس کالا" },
      { status: 500 }
    );
  }
}
