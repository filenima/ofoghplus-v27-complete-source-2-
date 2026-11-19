import * as React from "react";

/**
 * SeoHeroGate — دروازهٔ محتوای SEO سرور-رندرشده (نسخهٔ hydration-proof)
 * =====================================================================
 * FIX(loading-bug v21): پیاده‌سازی قبلی با state «hidden» کار می‌کرد که
 * فقط «بعد از mount شدن محتوای واقعی» (section#hero / سایدبار پنل) فعال
 * می‌شد. یعنی در کل دورهٔ لود/کامپایل AppShell روی لپ‌تاپ ضعیف، «متن خام
 * سئو» دیده می‌شد — دقیقاً باگی که مالک گزارش کرد:
 * «بجای اینکه موقع لودینگ خود لودینگ رو نمایش بده این متن رو نمایش میده».
 *
 * مخفی‌سازی حالا ۱۰۰٪ CSS و پیش از paint است:
 *  - اسکریپت inline در <head> (layout.tsx) یک <style> خارج از کنترل React
 *    تزریق می‌کند: [data-seo-gate]{display:none!important} — React در
 *    hydration آن را حذف نمی‌کند و تا ابد پابرجاست.
 *  - لایهٔ دوم: کلاس js-enabled روی <html> (قانون CSS قدیمی globals.css)
 *  - کرالرهای بدون JS (GPTBot/ClaudeBot/…): هیچ‌کدام از این‌ها فعال نمی‌شود
 *    → متن سئو برایشان کاملاً قابل خواندن می‌ماند (هدف GEO).
 *
 * این کامپوننت حالا فقط «قلاب» (data-seo-gate) برای آن CSS است — بدون
 * state، بدون MutationObserver، بدون هیچ منطقی که بتواند دیر اجرا شود.
 */
export function SeoHeroGate({ children }: { children: React.ReactNode }) {
 return <div data-seo-gate>{children}</div>;
}
