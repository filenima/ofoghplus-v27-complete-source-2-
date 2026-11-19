"use client";

import Image from "next/image";
// FIX(R24-8): SITE_URL از lib/seo حذف شد — آن ماژول system-settings (DB/سرور)
// را import می‌کند و کلاینت نباید آن را ببیند. دامنهٔ canonical از lib/domains
// (client-safe) ساخته می‌شود — همان مقدار SITE_URL در lib/seo.ts.
import { PRIMARY_DOMAIN } from "@/lib/domains";

const SITE_URL = `https://${PRIMARY_DOMAIN}`;

interface HeroImageProps {
 src: string;
 alt: string;
 title?: string;
 subtitle?: string;
 priority?: boolean;
}

/**
 * صفحه‌ی Hero تصویر — تصویر اختصاصی با عنوان و زیرعنوان
 * برای تمام صفحات سئو قابل استفاده است
 */
export function HeroImage({ src, alt, title, subtitle, priority = false }: HeroImageProps) {
 return (
 <div className="relative w-full overflow-hidden rounded-xl mb-8">
 <div className="relative aspect-[16/9] w-full">
 <Image
 src={src}
 alt={alt}
 fill
 className="object-cover"
 priority={priority}
 sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
 />
 {/* overlay gradient */}
 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
 </div>
 {(title || subtitle) && (
 <div className="absolute bottom-0 inset-x-0 p-6 text-white">
 {title && (
 <h1 className="text-2xl md:text-3xl font-bold mb-1 drop-shadow-lg">
 {title}
 </h1>
 )}
 {subtitle && (
 <p className="text-sm md:text-base opacity-90 drop-shadow-md max-w-2xl">
 {subtitle}
 </p>
 )}
 </div>
 )}
 </div>
 );
}

/**
 * تصویر سئو ساده — بدون overlay
 */
export function SeoImage({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
 return (
 <div className={`relative overflow-hidden rounded-lg ${className}`}>
 <Image
 src={src}
 alt={alt}
 width={800}
 height={450}
 className="object-cover w-full h-auto"
 sizes="(max-width: 768px) 100vw, 800px"
 />
 </div>
 );
}

/** نقشه‌ی تصاویر بر اساس نوع صفحه */
export const PAGE_IMAGES: Record<string, string> = {
 accounting: "/images/hero-accounting.avif",
 industries: "/images/hero-industries.avif",
 ecosystem: "/images/hero-ecosystem.avif",
 banks: "/images/hero-banks.avif",
 taxes: "/images/hero-taxes.avif",
 cities: "/images/hero-cities.avif",
};
