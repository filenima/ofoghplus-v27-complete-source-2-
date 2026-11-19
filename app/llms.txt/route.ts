import { buildLlmsTxt } from "@/lib/seo/llms";

export const runtime = "nodejs";

// ============================================================
// /llms.txt — مسیر عمومی داینامیک راهنمای ربات‌های هوش مصنوعی (R14-K1 / GEO)
// ============================================================
// قبلاً این فایل استاتیک در public/llms.txt بود که فقط با «بازسازی دستی» از
// پنل سوپرادمین تازه می‌شد (اعداد کهنه: «۷۲ مقاله + ۲۲۹ پیش‌نویس»).
// حالا داینامیک است:
//   ۱) خط «آخرین به‌روزرسانی» با تاریخ جلالیِ روز (toJalali از lib/persian)
//      — سیگنال تازگی برای GPTBot/ClaudeBot/PerplexityBot
//   ۲) شمارش مقالات/پیش‌نویس‌ها و قیمت‌ها همیشه زنده از DB
//   ۳) بازاعتبارسنجی ساعتی (ISR) — تعادل کش و تازگی
// سازندهٔ مشترک: lib/seo/llms.ts (همان که پنل سوپرادمین برای پیش‌نمایش می‌سازد)
// ============================================================
export const revalidate = 3600;

export async function GET() {
 const txt = await buildLlmsTxt();
 return new Response(txt, {
  headers: {
   "Content-Type": "text/plain; charset=utf-8",
   "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
  },
 });
}
