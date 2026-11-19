import type { Metadata } from "next";
import { AppShellLoader } from "@/components/app-shell-loader";
import { SeoHero } from "@/components/seo/seo-hero";
import { SeoHeroGate } from "@/components/seo/seo-hero-gate";
// AI-SEO (Agent #5): FAQPage از منبع واحد سوالاتِ «قابل مشاهده» لندینگ
// (lib/landing-config → FAQSection) — سیاست گوگل: محتوای FAQ مارک‌شده باید
// در صفحه دیده شود؛ DEFAULT_FAQ_SCHEMA قبلی سوالاتی داشت که رندر نمی‌شدند.
import { LandingFaqJsonLd } from "@/lib/seo/faq-schema";
import { getBrandName } from "@/lib/brand-interpolate";

/**
 * صفحه‌ی اصلی افق پلاس
 * =====================
 * ساختار سئو-محور:
 * 1. JSON-LD پرسش‌های متداول (فقط همین صفحه — در layout تزریق نمی‌شود)
 * 2. SeoHero — محتوای بازاریابی سرور-رندرشده (H1 + متن + لینک داخلی)
 * که پس از mount شدن لندینگ کلاینت، از دید کاربر پنهان می‌شود.
 * 3. AppShell — اپلیکیشن کامل — FIX(v13-preview): با dynamic + ssr:false
 * بارگذاری می‌شود. چرا؟ کامپایل سرورِ «/» قبلاً کل گراف کلاینتِ AppShell
 * (۳۲۰۰+ خط + framer-motion + ده‌ها کامپوننت) را هم‌زمان می‌ساخت و در
 * سندباکس ۴GB به OOM می‌رسید (پیشنمایش سفید/قطع می‌شد). حالا کامپایل
 * «/» سبک است؛ گراف AppShell به‌صورت chunk جدا بعد از هیدریشن و تدریجی
 * کامپایل می‌شود. محتوای سئو (SeoHero/JsonLd) همچنان سرور-رندر می‌ماند.
 */

// FIX(SEO/GEO — باگ canonical ارثی): canonical صفحهٔ اصلی قبلاً در layout
// تعریف می‌شد و به‌صورت ارثی به صفحات بدون alternates (مثل /embed/* و
// /portal/*) نشت می‌کرد (کانونیکال به خانه + noindex = سیگنال متناقض).
// حالا صفحهٔ اصلی canonical خودش را صریح تعریف می‌کند و layout فقط
// لینک RSS (types) را نگه می‌دارد. title/description/OG همچنان از
// generateMetadata ریشه ارث می‌رسند (بدون تغییر).
export async function generateMetadata(): Promise<Metadata> {
 const appName = await getBrandName();
 return {
  alternates: {
   canonical: "/",
   types: { "application/rss+xml": [{ url: "/rss.xml", title: `بلاگ ${appName}` }] },
  },
 };
}

export default async function Home() {
 return (
 <>
 <LandingFaqJsonLd /> {/* v20-S: @id صفحه‌محور — داخل کامپوننت حفظ شده */}
 <SeoHeroGate>
 <SeoHero />
 </SeoHeroGate>
 <AppShellLoader />
 </>
 );
}
