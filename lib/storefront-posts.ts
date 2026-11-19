// ============================================================
// lib/storefront-posts.ts — ابزارهای مشترک بلاگ فروشگاه‌ها (Task 3-g)
// ============================================================
// اسلاگ‌سازی از عنوان فارسی + ساخت URL عمومی مقاله — بین
// app/api/storefront/manage/posts (CRUD) و صفحات عمومی
// app/shop/[slug]/blog مشترک است. اسلاگ فارسی مجاز است؛ در URL
// همیشه encodeURIComponent می‌شود (پروتکل‌ها ساپورت می‌کنند).

/** اسلاگ‌سازی از عنوان — حروف فارسی/لاتین حفظ، فاصله‌ها → خط تیره */
export function slugifyPostTitle(raw: string): string {
  return raw
    .trim()
    .replace(/[\u200b\u200c\u200e\u200f]/g, "") // نیم‌فاصله و کنترل‌های RTL
    .replace(/[«»"'“”‘’!?؟،؛:()[\]{}@#$%^&*+=<>/\\|~`._-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** URL عمومی صفحهٔ فهرست بلاگ فروشگاه */
export function storefrontBlogUrl(base: string, shopSlug: string): string {
  return `${base.replace(/\/+$/, "")}/shop/${encodeURIComponent(shopSlug)}/blog`;
}

/** URL عمومی یک مقالهٔ بلاگ فروشگاه */
export function storefrontPostUrl(base: string, shopSlug: string, postSlug: string): string {
  return `${storefrontBlogUrl(base, shopSlug)}/${encodeURIComponent(postSlug)}`;
}

/** متن ساده از HTML محتوا (برای excerpt خودکار و متا دیسکریپشن) */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * پینگ IndexNow بعد از انتشار/ویرایش مقالهٔ فروشگاه — همان الگوی
 * app/api/indexnow (پروتکل: api.indexnow.org/indexnow) اما برای URLهای
 * /shop/{slug}/blog/{postSlug}. fire-and-forget؛ شکست پینگ هرگز
 * انتشار مقاله یا پاسخ API را ناموفق نمی‌کند (شبکهٔ سندباکس محدود است).
 */
export function pingStorefrontPostPublished(shopSlug: string, postSlug: string): void {
  void (async () => {
    try {
      const { getIndexNowBaseUrl, pingIndexNowUrl } = await import("@/lib/indexnow");
      const base = await getIndexNowBaseUrl();
      await pingIndexNowUrl(storefrontPostUrl(base, shopSlug, postSlug));
    } catch {
      /* سکوت مطلق */
    }
  })();
}
