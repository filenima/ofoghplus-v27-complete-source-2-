import sharp from "sharp";

// ============ افق پلاس — تبدیل خودکار تصاویر آپلودی به AVIF ============
// درخواست مالک: «همه تصاویری که آپلود می‌شوند باید خودکار به AVIF تبدیل شوند
// تا فضای زیادی اشغال نکنند.»
//
// این ماژول فقط سمت سرور استفاده می‌شود (sharp بومی است).
// همه مسیرهای آپلود تصویر قبل از نوشتن روی دیسک از convertToAvif رد می‌شوند.
// قرارداد: هرگز آپلود را شکست نمی‌دهیم — اگر انکود AVIF خطا خورد، همان
// بافر اصلی با پسوند اصلی برگردانده می‌شود.

/** تنظیمات پیش‌فرض انکود AVIF — کیفیت ۵۰ + تلاش ۴ (تعادل حجم/سرعت) */
const AVIF_QUALITY = 50;
const AVIF_EFFORT = 4;

/** سقف ابعاد تصویر — بزرگ‌تر از این، تناسب‌دار کوچک می‌شود (صرفه‌جویی عمده فضا) */
const MAX_DIMENSION = 2400;

/** پسوندهای خروجی ممکن — avif (موفق) یا پسوند اصلی در حالت fallback */
export type ConvertedImageExt = "avif" | "png" | "jpg" | "webp" | "gif" | "svg";

export interface ConvertedImage {
  /** بافر آماده نوشتن روی دیسک (AVIF یا در خطا همان ورودی) */
  buffer: Buffer;
  /** پسوند فایل برای نام‌گذاری نهایی */
  ext: ConvertedImageExt;
  /** mime متناظر پسوند — برای allowlist/هدر پاسخ */
  mime: string;
}

export interface ConvertToAvifOptions {
  /** کیفیت AVIF (۰ تا ۱۰۰) — پیش‌فرض ۵۰ */
  quality?: number;
  /** پسوند فایل اصلی — در fallback به‌کار می‌رود (اگر داده نشود از فرمت واقعی بافر تشخیص می‌شود) */
  fallbackExt?: string;
}

/** نگاشت پسوند → mime (برای پاسخ fallback) */
const EXT_MIME: Record<string, string> = {
  avif: "image/avif",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

/** نرمال‌سازی پسوند ورودی به مجموعهٔ امن */
function normalizeExt(raw: string | undefined): ConvertedImageExt | null {
  const e = (raw || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (e === "jpe" || e === "jpeg") return "jpg";
  if (["png", "jpg", "webp", "gif", "svg", "avif"].includes(e)) {
    return e as ConvertedImageExt;
  }
  return null;
}

/**
 * تبدیل هر تصویر ورودی (png/jpeg/webp/gif[فریم اول]/tiff/svg رستری) به AVIF.
 *
 * - چرخش خودکار بر اساس EXIF (rotate بدون آرگومان).
 * - گارد ابعاد: اگر عرض یا ارتفاع > ۲۴۰۰px باشد، تناسب‌دار به سقف ۲۴۰۰
 *   کوچک می‌شود — صرفه‌جویی بزرگی در فضا برای عکس‌های موبایل ۱۲MP+.
 * - هرگز throw نمی‌کند: در خطا، بافر اصلی + پسوند اصلی برگردانده می‌شود
 *   (آپلود نباید به‌خاطر انکود شکست بخورد).
 */
export async function convertToAvif(
  input: Buffer,
  opts: ConvertToAvifOptions = {}
): Promise<ConvertedImage> {
  const quality = Number.isFinite(opts.quality) ? Math.max(1, Math.min(100, opts.quality as number)) : AVIF_QUALITY;

  let pipeline = sharp(input, { failOn: "none" });

  try {
    const meta = await pipeline.metadata();

    // گارد ابعاد — فقط کوچک‌سازی، هرگز بزرگ‌نمایی (fit:inside)
    if (
      (meta.width && meta.width > MAX_DIMENSION) ||
      (meta.height && meta.height > MAX_DIMENSION)
    ) {
      pipeline = pipeline.resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    // rotate بدون آرگومان = اعمال جهت EXIF و حذف آن از خروجی
    const out = await pipeline
      .rotate()
      .avif({ quality, effort: AVIF_EFFORT })
      .toBuffer();

    return { buffer: out, ext: "avif", mime: EXT_MIME.avif };
  } catch (err) {
    // ── fallback: انکود AVIF ممکن نیست → همان فایل اصلی دست‌نخورده ──
    // پسوند fallback: اول hint فراخوان، بعد فرمت واقعی تشخیص‌شده، آخر png.
    console.error(
      "[image-avif] AVIF conversion failed — keeping original:",
      err instanceof Error ? err.message : err
    );
    let ext = normalizeExt(opts.fallbackExt);
    if (!ext) {
      try {
        const fmt = await sharp(input, { failOn: "none" }).metadata();
        ext = normalizeExt(fmt.format) || "png";
      } catch {
        ext = "png";
      }
    }
    return { buffer: input, ext, mime: EXT_MIME[ext] || EXT_MIME.png };
  }
}

/**
 * تعویض پسوند نام فایل به ‎.avif — منطق prefix/slug نام‌گذاری فراخوان دست‌نخورده می‌ماند.
 * مثال: «sf-product-123-456.png» → «sf-product-123-456.avif»
 */
export function avifFileName(originalName: string): string {
  const i = originalName.lastIndexOf(".");
  const base = i > 0 ? originalName.slice(0, i) : originalName;
  return `${base}.avif`;
}
