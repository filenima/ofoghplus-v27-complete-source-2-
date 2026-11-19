import { db } from "@/lib/db";
import { cacheGetOrSet, cacheDeleteByPrefix, CACHE_TTL } from "@/lib/cache";
import {
  DEFAULT_SITE_CONTENT,
  DEFAULT_SECTION_IDS,
  normalizeSiteContent,
} from "@/lib/site-content-shared";

/**
 * lib/site-content.ts — محتوای داینامیک صفحه فرود (ویرایشگر بصری سایت)
 * ============================================================================
 * ماژول سمت سرور — فقط دسترسی دیتابیس. انواع و توابع خالص در
 * lib/site-content-shared.ts قرار دارند (client-safe).
 *
 * الگوی ذخیره‌سازی: ردیف واحد SiteContent (id="main") با فیلد JSON رشته‌ای.
 * GET عمومی از کش درون‌حافظه‌ای (TTL ۵ دقیقه) می‌خواند؛ PUT سوپرادمین پس از
 * ذخیره، cacheDeleteByPrefix("site_content:") را صدا می‌زند تا تغییرات فوراً
 * برای همه‌ی بازدیدکنندگان اعمال شود (همان الگوی lib/system-settings.ts).
 */

// re-export های client-safe (برای سازگاری import های سروری موجود)
export {
  type CustomSectionType,
  type SiteCustomSection,
  type SiteContentOverrides,
  DEFAULT_SITE_CONTENT,
  DEFAULT_SECTION_IDS,
  sanitizeCustomHtml,
  normalizeSiteContent,
} from "@/lib/site-content-shared";

// ============ دسترسی دیتابیس (با کش) ============

const CACHE_PREFIX = "site_content:";
const ROW_ID = "main";

/** خواندن محتوای سایت (defaults + overrides ادغام‌شده) — عمومی */
export async function getSiteContent(): Promise<
  import("@/lib/site-content-shared").SiteContentOverrides
> {
  return cacheGetOrSet(
    `${CACHE_PREFIX}main`,
    async () => {
      try {
        const row = await db.siteContent.findUnique({ where: { id: ROW_ID } });
        const parsed = row?.overrides ? JSON.parse(row.overrides) : null;
        const merged = normalizeSiteContent(parsed);
        // ادغام با پیش‌فرض‌ها: order خالی → ترتیب پیش‌فرض سکشن‌ها
        // (کلاینت با ترتیب کامل یا خالی هر دو درست کار می‌کند)
        if (merged.order.length === 0) {
          merged.order = [...DEFAULT_SECTION_IDS];
        }
        return merged;
      } catch {
        return { ...DEFAULT_SITE_CONTENT, order: [...DEFAULT_SECTION_IDS] };
      }
    },
    CACHE_TTL.MEDIUM
  );
}

/** ذخیره‌ی overrides (ردیف واحد، upsert) — فقط سوپرادمین */
export async function saveSiteContent(
  overrides: import("@/lib/site-content-shared").SiteContentOverrides,
  updatedBy?: string
): Promise<void> {
  await db.siteContent.upsert({
    where: { id: ROW_ID },
    update: { overrides: JSON.stringify(overrides), updatedBy: updatedBy ?? null },
    create: {
      id: ROW_ID,
      overrides: JSON.stringify(overrides),
      updatedBy: updatedBy ?? null,
    },
  });
  // باطل‌کردن کش تا تغییرات فوراً برای همه اعمال شود
  cacheDeleteByPrefix(CACHE_PREFIX);
}

/** بازنشانی به پیش‌فرض (حذف overrides) — فقط سوپرادمین */
export async function resetSiteContent(updatedBy?: string): Promise<void> {
  await saveSiteContent(DEFAULT_SITE_CONTENT, updatedBy);
}
