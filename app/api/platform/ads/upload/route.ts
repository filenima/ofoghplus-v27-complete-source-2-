import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, access } from "fs/promises";
import path from "path";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { db } from "@/lib/db";
import { convertToAvif } from "@/lib/image-avif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FIX(3e-2): POST /api/platform/ads/upload — آپلود تصویر تبلیغ از تب «تبلیغات» پنل سوپرادمین.
 *
 * دکمهٔ «آپلود تصویر» در ads-tab.tsx به این مسیر POST می‌زد، اما این route
 * هرگز ساخته نشده بود → همیشه ۴۰۴ و پیام «پاسخ سرور نامعتبر بود». الان
 * واقعاً وجود دارد: تصویر در public/uploads با نام versioned (ads-<ts>-<rand>)
 * ذخیره می‌شود و پاسخ همان شکلی است که ads-tab انتظار دارد: { success, url }.
 *
 * مدل اجازه‌ها و ذخیره‌سازی از /api/platform/branding/logo برداشته شد:
 *  - requireSuperAdmin (توکن Bearer سوپرادمین — همان هدری که ads-tab می‌فرستد)
 *  - MIME سخت‌گیرانه: فقط PNG/JPG/WebP/GIF/AVIF (SVG ممنوع — XSS)
 *  - سقف ۲MB (هماهنگ با اعتبارسنجی سمت کلاینت ads-tab)
 *  - تبدیل خودکار AVIF؛ در خطای انکود، بافر اصلی ذخیره می‌شود
 */
const MAX_FILE_SIZE = 2 * 1024 * 1024; // ۲MB — هماهنگ با ads-tab
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/avif"]);

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const formData = await req.formData().catch(() => null);
    // ads-tab فیلد را «file» می‌نامد؛ برای اطمینان «image» هم پذیرفته می‌شود
    const file = (formData?.get("file") ?? formData?.get("image")) as File | null | undefined;
    if (!file || typeof file === "string") {
      return NextResponse.json({ success: false, error: "فایل تصویر را انتخاب کنید" }, { status: 400 });
    }

    const fileType = (file.type || "").toLowerCase();
    const fileNameLower = (file.name || "").toLowerCase();
    const isImage =
      (ALLOWED_MIME.has(fileType) && !/\.svg$/i.test(fileNameLower)) ||
      /\.(png|jpe?g|webp|gif|avif)$/i.test(fileNameLower);
    if (!isImage) {
      return NextResponse.json(
        { success: false, error: "فقط فایل تصویری (PNG، JPG، WebP، GIF، AVIF) مجاز است" },
        { status: 400 }
      );
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "حجم تصویر باید بین ۱ بایت تا ۲ مگابایت باشد" },
        { status: 400 }
      );
    }

    const origExt = (fileNameLower.match(/\.(png|jpe?g|webp|gif|avif)$/)?.[1] || "png").toLowerCase();
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    try {
      await mkdir(uploadDir, { recursive: true });
      await access(uploadDir);
    } catch {
      return NextResponse.json({ success: false, error: "خطا در ایجاد پوشه آپلود" }, { status: 500 });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch {
      return NextResponse.json({ success: false, error: "خطا در خواندن فایل" }, { status: 400 });
    }

    // تبدیل خودکار به AVIF — در خطا همان بافر/پسوند اصلی (آپلود هرگز به‌خاطر انکود شکست نمی‌خورد)
    const converted = await convertToAvif(buffer, { fallbackExt: origExt });
    const fileName = `ads-${stamp}-${rand}.${converted.ext}`;

    try {
      await writeFile(path.join(uploadDir, fileName), converted.buffer);
    } catch {
      return NextResponse.json({ success: false, error: "خطا در ذخیره فایل" }, { status: 500 });
    }

    const url = `/uploads/${fileName}`;

    // ممیزی پلتفرم (best-effort — شکستش آپلود را خراب نمی‌کند)
    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin?.id ?? "system",
          action: "PLATFORM_AD_IMAGE_UPLOAD",
          entity: "Advertisement",
          entityId: fileName,
          details: JSON.stringify({ url, size: converted.buffer.byteLength, type: fileType }),
        },
      });
    } catch {
      /* ignore */
    }

    // پاسخ با url در سطح ریشه — همان چیزی که ads-tab.tsx (j.url) می‌خواند
    return NextResponse.json({ success: true, url, data: { url, name: fileName } });
  } catch (error) {
    console.error("[platform/ads upload POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در آپلود تصویر — دوباره تلاش کنید" }, { status: 500 });
  }
}
