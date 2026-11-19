import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { convertToAvif } from "@/lib/image-avif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // ۵ مگابایت — هماهنگ با file-manager-dialog
// FIX(SEC-4a): SVG ممنوع — فایل در public/uploads سرو می‌شود (XSS ذخیره‌شده)
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/avif",
]);

/**
 * Task 3-e — POST /api/files/upload
 * آپلود عمومی تصویر «مدیریت فایل» (file-manager-dialog) — قبلاً دیالوگ به این
 * مسیر POST می‌زد و 404 می‌گرفت؛ حالا واقعاً وجود دارد.
 *
 * فایل در public/uploads ریشه ذخیره می‌شود با نام tenant-scoped
 * (tenant-file-<tenantId>-…) تا /api/files/list (که فقط فایل‌های متعلق به
 * tenant را لیست می‌کند) آن را نشان دهد. تبدیل خودکار AVIF مثل بقیهٔ مسیرها.
 *
 * پاسخ: { success, data: { name, url, size, type, uploadedAt } } — همان شکلی
 * که FileManagerDialog انتظار دارد.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId, userId } = auth.user;

    const formData = await req.formData().catch(() => null);
    const file = formData?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "فایل تصویر را انتخاب کنید" }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "حجم فایل باید بین ۱ بایت تا ۵ مگابایت باشد" },
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

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    // تبدیل خودکار به AVIF — در خطا همان بافر/پسوند اصلی (آپلود هرگز شکست نمی‌خورد)
    const converted = await convertToAvif(Buffer.from(await file.arrayBuffer()), { fallbackExt: ext });
    // نام tenant-scoped — پیش‌نیاز دیده‌شدن در /api/files/list (فیلتر tenant)
    const fileName = `tenant-file-${tenantId}-${Date.now()}.${converted.ext}`;
    await writeFile(path.join(uploadDir, fileName), converted.buffer);

    const url = `/uploads/${fileName}`;

    await db.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "UPLOAD_FILE",
        entity: "FileManager",
        entityId: fileName,
        changes: JSON.stringify({ url, size: converted.buffer.byteLength }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        name: fileName,
        url,
        size: converted.buffer.byteLength,
        type: converted.mime,
        uploadedAt: new Date().toISOString(),
      },
      message: "فایل آپلود شد",
    });
  } catch (error) {
    console.error("[files upload POST] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در آپلود فایل — دوباره تلاش کنید" },
      { status: 500 }
    );
  }
}
