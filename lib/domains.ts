// ============================================================
// lib/domains.ts — پیکربندی مرکزی دامنه‌های برند (R14-A)
// ============================================================
// استراتژی دودامنه پس از rebrand «افق پلاس»:
//   • دامنهٔ canonical (اصلی/سئو): ofoghplus.ir — همهٔ URLهای canonical
//     (sitemap، robots، JSON-LD، RSS، llms.txt) با این دامنه ساخته می‌شوند.
//   • دامنهٔ ثانویه: hoosh.nobatime.ir — همچنان اپ را سرو می‌کند
//     (کاربران فعلی + اعتبار سئوی انباشته)؛ هیچ ریدایرکتی روی آن نیست.
//
// این ماژول client-safe است (بدون وابستگی سرور) تا در کامپوننت‌های
// کلاینت هم قابل import باشد.

/** دامنهٔ اصلی برند «افق پلاس» — منبع canonical برای URLهای سئو */
export const PRIMARY_DOMAIN = "ofoghplus.ir";

/** دامنه‌های ثانویه — همچنان سرو می‌شوند (میراث برند «هوش») */
export const SECONDARY_DOMAINS: readonly string[] = ["hoosh.nobatime.ir"];

/** همهٔ دامنه‌های متعلق به این برند (canonical اول) */
export const ALL_BRAND_DOMAINS: readonly string[] = [
  PRIMARY_DOMAIN,
  ...SECONDARY_DOMAINS,
];

/** نرمال‌سازی هاست — حذف پورت/پروتکل برای مقایسه */
function normalizeHost(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-zA-Z]+:\/\//, "")
    .replace(/:\d+$/, "")
    .replace(/\/+$/, "");
}

/**
 * آیا این هاست یکی از دامنه‌های برند است؟
 * (پشتیبانی دودامنه: ofoghplus.ir و hoosh.nobatime.ir)
 */
export function isBrandDomain(host: string): boolean {
  if (!host) return false;
  const normalized = normalizeHost(host);
  return ALL_BRAND_DOMAINS.some((d) => d === normalized);
}

/** دامنهٔ canonical برند — همیشه دامنهٔ اصلی (ofoghplus.ir) */
export function getCanonicalDomain(): string {
  return PRIMARY_DOMAIN;
}
