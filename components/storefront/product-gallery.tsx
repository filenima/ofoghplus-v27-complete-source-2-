"use client";

// ═══════════════ Task 4 — گالری تعاملی تصاویر کالا (صفحهٔ عمومی محصول) ═══════════════
// تصویر اصلی بزرگ + نوار بندانگشتی قابل کلیک + دکمه‌های قبلی/بعدی + شمارنده.
// اگر فقط یک تصویر باشد نوار مخفی می‌شود. SSR-safe (بدون window در رندر اولیه).

import * as React from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { toPersianDigits } from "@/lib/persian";

export interface ProductGalleryProps {
  /** تصویر اصلی کالا (Product.imageUrl) — اگر null باشد و گالری هم خالی باشد جای‌نگهدار نشان می‌دهیم */
  mainImage: string | null;
  /** مسیرهای گالری (StorefrontProductMeta.galleryJson) */
  gallery: string[];
  alt: string;
  className?: string;
}

export function ProductGallery({ mainImage, gallery, alt, className }: ProductGalleryProps) {
  // تصویر اصلی همیشه اول می‌آید؛ تکراری‌ها حذف می‌شوند
  const images = React.useMemo(() => {
    const list = gallery.filter((u) => typeof u === "string" && u.trim() !== "");
    return mainImage ? [mainImage, ...list.filter((u) => u !== mainImage)] : list;
  }, [mainImage, gallery]);

  const [active, setActive] = React.useState(0);
  const current = images[active] ?? null;

  // Task 3-e — سوایپ لمسی (موبایل): ثبت نقطهٔ شروع و سنجش جهت در پایان لمس
  const touchStartX = React.useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX == null || images.length < 2) return;
    const endX = e.changedTouches[0]?.clientX ?? startX;
    const dx = endX - startX;
    if (Math.abs(dx) < 40) return; // لمس کوتاه = tap — نادیده
    // در RTL: کشیدن به چپ = تصویر بعدی، کشیدن به راست = تصویر قبلی
    setActive((i) => (i + (dx < 0 ? 1 : -1) + images.length) % images.length);
  };

  if (!current) {
    return (
      <div
        className={`flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-2xl border bg-muted/40 text-muted-foreground ${className ?? ""}`}
        role="img"
        aria-label={`${alt} — بدون تصویر`}
      >
        <ImageOff className="h-10 w-10 opacity-40" aria-hidden="true" />
        <p className="text-xs">تصویری برای این کالا ثبت نشده است</p>
      </div>
    );
  }

  const go = (dir: 1 | -1) => {
    if (images.length < 2) return;
    setActive((i) => (i + dir + images.length) % images.length);
  };

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      <div
        className="group relative aspect-square w-full overflow-hidden rounded-2xl border bg-muted/40"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* آپلود کاربر — دامنه نامشخص */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current}
          alt={`${alt} — تصویر ${toPersianDigits(active + 1)} از ${toPersianDigits(images.length)}`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          loading="eager"
          fetchPriority="high"
        />
        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75"
              aria-label="تصویر قبلی"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75"
              aria-label="تصویر بعدی"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[11px] font-bold text-white backdrop-blur tabular-nums">
              {toPersianDigits(active + 1)} / {toPersianDigits(images.length)}
            </span>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1" role="listbox" aria-label="انتخاب تصویر کالا">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              role="option"
              aria-selected={i === active}
              aria-label={`نمایش تصویر ${toPersianDigits(i + 1)}`}
              onClick={() => setActive(i)}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition-all sm:h-20 sm:w-20 ${
                i === active
                  ? "border-primary ring-2 ring-primary/25"
                  : "border-transparent opacity-70 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`${alt} — بندانگشتی ${toPersianDigits(i + 1)}`} className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default ProductGallery;
