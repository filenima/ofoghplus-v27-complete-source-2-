import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { convertToAvif } from "@/lib/image-avif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // ۴ مگابایت
// SVG ممنوع — فایل در public/uploads سرو می‌شود (XSS ذخیره‌شده) — AVIF ورودی هم پذیرفته می‌شود
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/avif"]);

/**
 * Task 4 — POST /api/storefront/manage/category-image
 * آپلود تصویر اختصاصی دسته‌بندی فروشگاه (فرم multipart: categoryId + file).
 * تصویر عمومی است → public/uploads/storefront/categories
 * و همان لحظه روی ProductCategory.imageUrl همان tenant اعمال می‌شود.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId, userId } = auth.user;

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const categoryId = String(formData.get("categoryId") ?? "");
    const file = formData.get("file");
    if (!categoryId) {
      return NextResponse.json({ success: false, error: "شناسه دسته الزامی است" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "فایل تصویر را انتخاب کنید" }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "حجم فایل باید بین ۱ بایت تا ۴ مگابایت باشد" },
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

    // دسته باید متعلق به tenant همان مالک باشد
    const category = await db.productCategory.findFirst({
      where: { id: categoryId, tenantId, deletedAt: null },
      select: { id: true, imageUrl: true },
    });
    if (!category) {
      return NextResponse.json({ success: false, error: "دسته‌بندی یافت نشد" }, { status: 404 });
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

    const uploadDir = path.join(process.cwd(), "public", "uploads", "storefront", "categories");
    await mkdir(uploadDir, { recursive: true });
    // تبدیل خودکار به AVIF — صرفه‌جویی در فضای ذخیره‌سازی؛ در خطا همان بافر/پسوند اصلی
    const converted = await convertToAvif(Buffer.from(await file.arrayBuffer()), { fallbackExt: ext });
    const fileName = `sf-category-${category.id}-${Date.now()}.${converted.ext}`;
    await writeFile(path.join(uploadDir, fileName), converted.buffer);

    const imageUrl = `/uploads/storefront/categories/${fileName}`;

    // تصویر قبلیِ اختصاصی همین مسیر را پاک کنیم (دریافت مجدد فضا)
    if (category.imageUrl?.startsWith("/uploads/storefront/categories/")) {
      const oldPath = path.join(process.cwd(), "public", category.imageUrl.replace(/^\//, ""));
      await unlink(oldPath).catch(() => undefined);
    }

    await db.productCategory.update({
      where: { id: category.id },
      data: { imageUrl },
    });

    await db.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "UPLOAD_CATEGORY_IMAGE",
        entity: "ProductCategory",
        entityId: category.id,
        changes: JSON.stringify({ via: "storefront-categories-tab", imageUrl }),
      },
    });

    return NextResponse.json({
      success: true,
      imageUrl,
      message: "تصویر دسته ذخیره شد — همان حالا در فروشگاه شما دیده می‌شود",
    });
  } catch (error) {
    console.error("[storefront category-image POST] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در آپلود تصویر دسته — دوباره تلاش کنید" },
      { status: 500 }
    );
  }
}

/**
 * Task 4 — DELETE /api/storefront/manage/category-image?categoryId=...
 * حذف تصویر دسته (برمی‌گردد به آیکون).
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId, userId } = auth.user;

    const categoryId = String(req.nextUrl.searchParams.get("categoryId") ?? "");
    if (!categoryId) {
      return NextResponse.json({ success: false, error: "شناسه دسته الزامی است" }, { status: 400 });
    }

    const category = await db.productCategory.findFirst({
      where: { id: categoryId, tenantId, deletedAt: null },
      select: { id: true, imageUrl: true },
    });
    if (!category) {
      return NextResponse.json({ success: false, error: "دسته‌بندی یافت نشد" }, { status: 404 });
    }

    if (category.imageUrl?.startsWith("/uploads/storefront/categories/")) {
      const oldPath = path.join(process.cwd(), "public", category.imageUrl.replace(/^\//, ""));
      await unlink(oldPath).catch(() => undefined);
    }

    await db.productCategory.update({
      where: { id: category.id },
      data: { imageUrl: null },
    });

    await db.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "DELETE_CATEGORY_IMAGE",
        entity: "ProductCategory",
        entityId: category.id,
      },
    });

    return NextResponse.json({ success: true, message: "تصویر دسته حذف شد" });
  } catch (error) {
    console.error("[storefront category-image DELETE] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در حذف تصویر دسته" }, { status: 500 });
  }
}
