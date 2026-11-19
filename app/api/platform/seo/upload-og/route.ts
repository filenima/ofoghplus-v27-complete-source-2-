import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ R21-A: آپلود تصویر OG (پیش‌نمایش تلگرام/اینستا) ============
// POST /api/platform/seo/upload-og
// مصرف‌کننده: superadmin-panel.tsx (بخش Open Graph)
//
// قرارداد:
//   درخواست:  multipart/form-data با فیلد «file» + هدر Authorization (سوپرادمین)
//   پاسخ ok:  { success: true, url: "/uploads/seo/og-xxx.png", width, height }
//
// تصویر هر نسبت/سایزی پذیرفته می‌شود و به‌صورت خودکار:
//  - cover-crop به دقیقاً 1200×630 (استاندارد og:image)
//  - تبدیل به PNG بهینه (سازگار با همه شبکه‌های اجتماعی)
// حداکثر حجم ورودی: ۸ مگابایت
//
// NOTE(AVIF): این مسیر عمداً به AVIF تبدیل نمی‌شود — کرالرهای اجتماعی
// (تلگرام، فیسبوک، واتساپ) og:image با فرمت AVIF را رندر نمی‌کنند و فقط
// PNG/JPG می‌پذیرند؛ بنابراین خروجی PNG می‌ماند (lib/image-avif.ts فقط برای
// بقیه آپلودهای تصویری به‌کار می‌رود).

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp",
  "image/tiff",
]);

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { success: false, error: "درخواست نامعتبر — بدنه باید multipart/form-data باشد" },
        { status: 400 }
      );
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "فایل تصویر را انتخاب کنید" },
        { status: 400 }
      );
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "حجم تصویر باید بین ۱ بایت تا ۸ مگابایت باشد" },
        { status: 400 }
      );
    }
    const fileType = (file.type || "").toLowerCase();
    if (!ALLOWED_MIME.has(fileType)) {
      return NextResponse.json(
        { success: false, error: "فقط تصویر (PNG، JPG، WebP، GIF، AVIF) مجاز است" },
        { status: 400 }
      );
    }

    const input = Buffer.from(await file.arrayBuffer());

    // پردازش با sharp: cover-crop به 1200×630 + خروجی PNG بهینه
    const processed = await sharp(input, { failOn: "none" })
      .resize(1200, 630, { fit: "cover", position: "attention" })
      .png({ compressionLevel: 9 })
      .toBuffer();

    const safeName = `og-${Date.now()}-${crypto.randomBytes(3).toString("hex")}.png`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "seo");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, safeName), processed);

    // audit (fire-and-forget)
    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin.id,
          action: "UPLOAD_OG_IMAGE",
          entity: "SeoSettings",
          details: JSON.stringify({ fileName: safeName, originalName: file.name }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      /* audit اختیاری است */
    }

    return NextResponse.json({
      success: true,
      url: `/uploads/seo/${safeName}`,
      width: 1200,
      height: 630,
      message: "تصویر پیش‌نمایش با موفقیت آپلود و به ابعاد ۱۲۰۰×۶۳۰ تبدیل شد",
    });
  } catch (error) {
    console.error(
      "[platform/seo/upload-og POST] error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { success: false, error: "خطا در آپلود تصویر — دوباره تلاش کنید" },
      { status: 500 }
    );
  }
}
