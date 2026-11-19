import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getStorefrontByTenant } from "@/lib/storefront-auth";
import { convertToAvif } from "@/lib/image-avif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024; // ۸ مگابایت
const MAX_VIDEO_SIZE = 32 * 1024 * 1024; // ۳۲ مگابایت
// SVG ممنوع — فایل‌ها از public سرو می‌شوند (XSS ذخیره‌شده) — AVIF ورودی هم پذیرفته می‌شود
const ALLOWED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/avif"]);
const ALLOWED_VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/ogg"]);

/**
 * POST /api/storefront/manage/media — آپلود رسانهٔ ویرایشگر سایت مالک
 * بدنه: FormData { file, kind? } — kind: image (لوگو/پوستر) | video (آپلود مستقیم ویدیو)
 * خروجی: { url } — مسیر عمومی؛ فراخواننده آن را داخل content/بلوک‌ها ذخیره می‌کند.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json({ success: false, error: "ابتدا فروشگاه خود را بسازید" }, { status: 404 });
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "فایل را انتخاب کنید" }, { status: 400 });
    }
    const kind = String(formData.get("kind") ?? "image") === "video" ? "video" : "image";

    const mime = (file.type || "").toLowerCase();
    const nameLower = (file.name || "").toLowerCase();

    if (kind === "video") {
      const ok = ALLOWED_VIDEO_MIME.has(mime) || /\.(mp4|webm|ogv)$/i.test(nameLower);
      if (!ok) {
        return NextResponse.json({ success: false, error: "فقط ویدیوی MP4 یا WebM مجاز است" }, { status: 400 });
      }
      if (file.size === 0 || file.size > MAX_VIDEO_SIZE) {
        return NextResponse.json({ success: false, error: "حجم ویدیو باید تا ۳۲ مگابایت باشد" }, { status: 400 });
      }
    } else {
      const ok = (ALLOWED_IMAGE_MIME.has(mime) && !/\.svg$/i.test(nameLower)) || /\.(png|jpe?g|webp|gif|avif)$/i.test(nameLower);
      if (!ok) {
        return NextResponse.json({ success: false, error: "فقط تصویر (PNG، JPG، WebP، GIF، AVIF) مجاز است" }, { status: 400 });
      }
      if (file.size === 0 || file.size > MAX_IMAGE_SIZE) {
        return NextResponse.json({ success: false, error: "حجم تصویر باید تا ۸ مگابایت باشد" }, { status: 400 });
      }
    }

    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/avif": "avif",
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/ogg": "ogv",
    };
    const nameExt = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const fallbackExts = kind === "video" ? ["mp4", "webm", "ogv"] : ["png", "jpg", "jpeg", "webp", "gif", "avif"];
    const ext = extMap[mime] || (fallbackExts.includes(nameExt) ? nameExt : kind === "video" ? "mp4" : "png");

    const uploadDir = path.join(process.cwd(), "public", "uploads", "storefront");
    await mkdir(uploadDir, { recursive: true });
    let buffer = Buffer.from(await file.arrayBuffer());
    let fileName = `sf-media-${auth.user.userId}-${Date.now()}.${ext}`;
    // تصاویر خودکار به AVIF تبدیل می‌شوند (صرفه‌جویی فضا) — ویدیوها دست‌نخورده؛
    // در خطای انکود، همان بافر/پسوند اصلی ذخیره می‌شود (آپلود هرگز شکست نمی‌خورد)
    if (kind === "image") {
      const converted = await convertToAvif(buffer, { fallbackExt: ext });
      buffer = converted.buffer;
      fileName = `sf-media-${auth.user.userId}-${Date.now()}.${converted.ext}`;
    }
    await writeFile(path.join(uploadDir, fileName), buffer);

    await db.auditLog.create({
      data: {
        tenantId,
        userId: auth.user.userId,
        action: "UPLOAD_STOREFRONT_MEDIA",
        entity: "Storefront",
        entityId: storefront.id,
        changes: JSON.stringify({ kind, fileName, size: file.size }),
      },
    });

    return NextResponse.json({
      success: true,
      url: `/uploads/storefront/${fileName}`,
      message: kind === "video" ? "ویدیو آپلود شد" : "تصویر آپلود شد",
    });
  } catch (error) {
    console.error("[storefront media POST] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در آپلود فایل — دوباره تلاش کنید" }, { status: 500 });
  }
}
