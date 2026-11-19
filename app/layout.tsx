import type { Metadata, Viewport } from "next";
import { Vazirmatn, JetBrainsMono } from "@/lib/fonts";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";
import { JsonLd, StructuredData } from "@/components/seo/structured-data";
// AI-SEO (Agent #5): تکمیل موجودیت‌ها — knowsAbout سازمان، alternateName
// «Ofogh Plus»، ایمیل/پروفایل X و قیمت واقعی پلن‌ها + پلتفرم‌های PWA در
// SoftwareApplication. با همان @id های StructuredData ادغام می‌شود (بدون بلوک تکراری).
import { getEntitySupplementSchema } from "@/lib/seo/entity";
import { DEFAULT_BRANDING, getBrandingSettings, getSeoSettings } from "@/lib/system-settings";

// ============ Metadata ============
// متادیتای داینامیک — نام برند و دامنه از تنظیمات برندینگ (پنل سوپرادمین)
// خوانده می‌شود؛ در نبود تنظیمات، پیش‌فرض «افق پلاس» / ofoghplus.ir برمی‌گردد. (REBRAND R14-A)
const SITE_DESCRIPTION =
 "نرم‌افزار حسابداری ابری هوشمند با اتصال رسمی به سامانه مودیان، انبار، فروش، حقوق و دستمزد و هوش مصنوعی — ۷ روز رایگان تست کنید، بدون نیاز به کارت بانکی.";
// R21-A: تصویر/متن OG از تنظیمات سئو (پنل ادمین) خوانده می‌شود؛
// ادمین می‌تواند og:image و متن‌های پیش‌نمایش تلگرام/اینستا را عوض کند.
// R26: نام فایل دوباره عوض شد (og-ofoghplus-v4.png) — تلگرام/اینستا تصویر OG را
// بر اساس «مسیر کامل URL» کش می‌کنند و کوئری‌استرینگ (?v=) را نادیده
// می‌گیرند؛ فقط تغییر نام فایل کش قدیمی را باطل می‌کند.
// مسیرهای قدیمی (og-image.png، og-ofoghplus.png) هم روی دیسک بازنویسی شده‌اند
// تا ربات‌هایی که دوباره همان را می‌خوانند تصویر جدید ببینند.
const OG_IMAGE_DEFAULT = "/og-ofoghplus-v4.png";

export async function generateMetadata(): Promise<Metadata> {
 let appName = DEFAULT_BRANDING.appName;
 let domain = DEFAULT_BRANDING.domain;
 try {
 const branding = await getBrandingSettings();
 appName = branding.appName;
 domain = branding.domain;
 } catch {
 // fallback به پیش‌فرض «افق پلاس»
 }
 // R21-A: og:title / og:description / og:image از تنظیمات سئو — قابل ویرایش از پنل ادمین
 let seo = { ogTitle: "", ogDescription: "", ogImage: "" };
 try {
 const s = await getSeoSettings();
 seo = { ogTitle: s.ogTitle, ogDescription: s.ogDescription, ogImage: s.ogImage };
 } catch {
 // fallback به پیش‌فرض‌ها
 }
 const OG_IMAGE = seo.ogImage || OG_IMAGE_DEFAULT;
 const ogTitle = seo.ogTitle || `${appName} | نرم‌افزار حسابداری هوشمند`;
 const ogDescription = seo.ogDescription || SITE_DESCRIPTION;
 const siteUrl = `https://${domain}`;
 const siteTitle = `${appName} | نرم‌افزار حسابداری هوشمند`;
 return {
 metadataBase: new URL(siteUrl),
 title: { default: siteTitle, template: `%s | ${appName}` },
 description: SITE_DESCRIPTION,
 applicationName: appName,
 keywords: [
 "نرم افزار حسابداری",
 "حسابداری ابری",
 "سامانه مودیان",
 "صورتحساب الکترونیکی",
 appName,
 "OCR فاکتور",
 "حقوق و دستمزد",
 "ارزش افزوده",
 "حسابداری ایرانی",
 "نرم افزار مالیاتی",
 "مدیریت انبار",
 "فاکتور فروش",
 "باشگاه مشتریان",
 "CRM حسابداری",
 ],
 authors: [{ name: appName, url: siteUrl }],
 creator: appName,
 publisher: appName,
 manifest: "/manifest.webmanifest",
 appleWebApp: { capable: true, title: appName, statusBarStyle: "default" },
 icons: {
 icon: [
 // R19-D: لوگوی PNG در صدر — گوگل برای آیکون کنار نتایج PNG را ترجیح می‌دهد
 { url: "/logo.png", sizes: "512x512", type: "image/png" },
 { url: "/icon-32.svg", sizes: "32x32", type: "image/svg+xml" },
 { url: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
 { url: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
 { url: "/logo.svg", sizes: "any", type: "image/svg+xml" },
 ],
 // iOS Safari از SVG برای apple-touch-icon پشتیبانی نمی‌کند — PNG الزامی است
 apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
 shortcut: ["/icon-192.svg"],
 },
 alternates: {
 // FIX(SEO/GEO — باگ canonical ارثی): canonical «/» از این‌جا حذف شد.
 // متادیتای layout به همهٔ صفحاتی که خودشان alternates تعریف نکنند
 // «ارث می‌رسد» → صفحات noindex مثل /embed/* و /portal/* عملاً
 // <link rel="canonical" href="https://ofoghplus.ir"> (کانونیکال به صفحهٔ اصلی!)
 // منتشر می‌کردند — سیگنال متناقض (noindex + canonical به خانه). canonical
 // فقط باید در خودِ هر صفحه تعریف شود؛ صفحهٔ اصلی هم حالا در app/page.tsx
 // canonical اختصاصی خودش را دارد. صفحات بدون canonical دیگر هیچ canonical
 // نمی‌سازند (پیش‌فرض امن Next).
 types: { "application/rss+xml": [{ url: "/rss.xml", title: `بلاگ ${appName}` }] },
 // نکته سئو: سایت تک‌زبانه است — hreflang (alternates.languages) لازم نیست
 // و باعث تولید لینک‌های تکراری در همه صفحات می‌شد؛ حذف شد.
 },
 openGraph: {
 type: "website",
 locale: "fa_IR",
 alternateLocale: ["en_US"],
 url: siteUrl,
 siteName: appName,
 title: ogTitle,
 description: ogDescription,
 images: [
 {
 url: OG_IMAGE,
 width: 1200,
 height: 630,
 alt: `${appName} — نرم‌افزار حسابداری هوشمند ایرانی`,
 type: "image/png",
 },
 ],
 },
 twitter: {
 card: "summary_large_image",
 title: ogTitle,
 description: ogDescription,
 images: [OG_IMAGE],
 // R26-TS: twitter:site (حساب وب‌سایت) در کنار creator اضافه شد —
 // کارت‌های توییتر/ایکس site را برای انتساب رسمی برند می‌خوانند.
 site: "@ofoghplus",
 creator: "@ofoghplus", // R19-D: هندل فعلی برند (قبلی: @hoosh)
 },
 robots: {
 index: true,
 follow: true,
 nocache: false,
 googleBot: {
 index: true,
 follow: true,
 "max-image-preview": "large",
 "max-snippet": -1,
 "max-video-preview": -1,
 },
 },
 category: "business",
 formatDetection: {
 telephone: false,
 address: false,
 email: false,
 },
 };
}

export const viewport: Viewport = {
 themeColor: [
 { media: "(prefers-color-scheme: light)", color: "#ffffff" },
 { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
 ],
 width: "device-width",
 initialScale: 1,
 maximumScale: 5,
 colorScheme: "light dark",
};

// ============ Root Layout ============
// نکته سئو: لینک‌های hreflang دستی حذف شدند — سایت تک‌زبانه (fa) است و
// تکرار hreflang در تمام صفحات سیگنال منفی داشت.

export default async function RootLayout({ children }: { children: React.ReactNode }) {
 return (
 <html lang="fa" dir="rtl" suppressHydrationWarning className="scroll-smooth">
 <head>
 {/* CWV(v38): prefetch مسیرهای داغ — لندینگ بیشترین کلیک را به /pricing و
  * /blog می‌فرستد؛ prefetch مرورگر، ناوبری پرترافیک را تا حد زیادی آنی
  * می‌کند (LCP/INP سفر خرید بهتر). فقط روی مسیرهای پُرکلیک — نه همه‌جا.
  */}
 <link rel="prefetch" href="/pricing" as="fetch" />
 <link rel="prefetch" href="/blog" as="fetch" />
 {/*
  * FIX(v36-offline): preconnect/dns-prefetch به fonts.googleapis.com حذف شد —
  * فونت‌ها (Vazirmatn) کاملاً self-host با next/font هستند و هیچ درخواستی به
  * گوگل نمی‌رود؛ این دو خط فقط یک وابستگی آنلاین نمایشی بودند.
  * FIX(v36-PWA): ثبت SW یکسان‌سازی شد — فقط ServiceWorkerRegister (داخل
  * AppProviders با purge در dev + toast به‌روزرسانی) فعال است؛ PwaRegister
  * دوم (ثبت دوبله/رقابتی) از layout حذف شد.
  */}
 {/*
  * Anti-Flash برای محتوای SEO سرور-رندرشده (SeoHero) — FIX(loading-bug v21):
  * مشکل اصلی کاربر: «موقع لودینگ به‌جای لودینگ، متن خام سئو دیده می‌شد».
  *
  * ریشهٔ باگ (سه لایه):
  *  ۱) تایمر ۱۵ ثانیه‌ای قدیمی کلاس js-enabled را حذف می‌کرد (حذف شد).
  *  ۲) React هنگام hydration کلاس‌های افزودهٔ اسکریپت را از <html> پاک
  *     می‌کند → CSS مخفی‌کننده از کار می‌افتاد → متن تا mount شدن کامل اپ
  *     (کامپایل/دانلود چانک AppShell روی لپ‌تاپ ضعیف = ده‌ها ثانیه) دیده می‌شد.
  *  ۳) اتریبیوت hidden در SeoHeroGate هم فقط بعد از mount محتوای واقعی فعال
  *     می‌شد — یعنی کل دورهٔ انتظار، متن خام + لودینگ هم‌زمان دیده می‌شد.
  *
  * راه‌حل نهایی (hydration-proof): تزریق یک <style> به <head> که React
  * هرگز آن را مدیریت نمی‌کند (خارج از درخت React است) → [data-seo-gate]
  * از «اولین paint» تا همیشه مخفی می‌ماند؛ نه کلاسی هست که پاک شود و نه
  * state‌ای که دیر مقدار بگیرد.
  *  - کاربر JS-دار: فقط لودینگ برند را می‌بیند (AppShellLoader خودش retry
  *    و پیام خطای فارسی دارد)
  *  - کرالر بدون JS (GPTBot/ClaudeBot/Perplexity — هدف GEO): اسکریپت اجرا
  *    نمی‌شود → استایل تزریق نمی‌شود → متن کامل را می‌بیند
  *  - گوگل‌بات (JS-دار): لندینگ واقعی را رندرشده می‌بیند
  * کلاس js-enabled هم به‌عنوان لایهٔ دفاعی دوم حفظ شده (قوانین CSS موجود).
  */}
 <script
 dangerouslySetInnerHTML={{
 __html: `(function(){try{var d=document.documentElement;d.classList.add('js-enabled');var s=document.createElement('style');s.id='seo-gate-style';s.textContent='[data-seo-gate]{display:none !important}';document.head.appendChild(s);}catch(e){}})();`,
 }}
 />
 {/*
  * v32-E: تشخیص مرورگر قدیمی / سخت‌افزار ضعیف — ES5 خالص (بدون const/arrow)
  * تا روی قدیمی‌ترین مرورگرها هم اجرا شود. اگر مرورگر @layer یا color-mix
  * ندارد → legacy-mode (متن‌های درشت‌تر، بدون بلور) + بنر راهنمای به‌روزرسانی.
  * اگر رم ≤ ۲GB یا ≤ ۲ هسته → lite-mode (افکت‌های سبک).
  */}
 <script
 dangerouslySetInnerHTML={{
 __html: `(function(){
 try {
 var d = document.documentElement;
 var modern = false, layerOk = false;
 try { modern = !!(window.CSS && CSS.supports && CSS.supports('color', 'color-mix(in srgb, red 50%, transparent)')); } catch (e) { modern = false; }
 try {
 var s = document.createElement('style');
 s.textContent = '@layer hooshcheck {}';
 document.head.appendChild(s);
 layerOk = !!(s.sheet && s.sheet.cssRules && s.sheet.cssRules.length > 0);
 document.head.removeChild(s);
 } catch (e) { layerOk = false; }
 if (!modern || !layerOk) { d.classList.add('legacy-mode'); }
 var mem = navigator.deviceMemory || 0;
 var cores = navigator.hardwareConcurrency || 4;
 if ((mem > 0 && mem <= 2) || cores <= 2) { d.classList.add('lite-mode'); }
 /* Task F (Squad F — weak-laptop fix): perf-mode قبل از اولین paint.
    تا اینجا کلاس perf-mode را فقط usePerfMode بعد از mount روی <html>
    می‌گذاشت؛ یعنی گران‌ترین لحظهٔ اپ (رندر اولیهٔ لندینگ با بلورها و
    انیمیشن‌های بی‌نهایت) روی لپ‌تاپ ضعیف با هزینهٔ کامل اجرا می‌شد و
    دقیقاً همان لحظه فریز/خطا رخ می‌داد. منطق زیر عیناً همان
    lib/perf-mode.ts است (localStorage hoosh_perf_mode = on/off/auto،
    deviceMemory ≤ 4، hardwareConcurrency ≤ 4، prefers-reduced-motion) تا
    قواعد CSS مربوط به perf-mode از همان نخستین فریم فعال باشند.
    usePerfMode پس از mount همان کلاس را sync می‌کند — بدون تضاد. */
 var perfOverride = '';
 try { perfOverride = localStorage.getItem('hoosh_perf_mode') || ''; } catch (e2) {}
 var perfOn = perfOverride === 'on';
 if (perfOverride !== 'on' && perfOverride !== 'off') {
  var weakDev = false;
  if (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4) { weakDev = true; }
  else if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4) { weakDev = true; }
  else { try { weakDev = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e3) { weakDev = false; } }
  /* R28-12 — همگام با lib/perf-mode.ts: Data Saver + مرورگر قدیمی
     (نبود IntersectionObserver یا color-mix) هم بار سبک می‌گیرند */
  try {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    if (!weakDev && conn && conn.saveData) { weakDev = true; }
    if (!weakDev) {
      var modernCss = false;
      try { modernCss = !!(window.CSS && CSS.supports && CSS.supports('color', 'color-mix(in srgb, red 50%, transparent)')); } catch (e5) { modernCss = false; }
      if (!modernCss || !('IntersectionObserver' in window)) { weakDev = true; }
    }
  } catch (e4) {}
  perfOn = weakDev;
 }
 if (perfOn) { d.classList.add('perf-mode'); }
 } catch (e) {}
 })();
 (function () {
 function showBanner() {
 try {
 if (!document.documentElement.classList.contains('legacy-mode')) return;
 var dismissed = false;
 try { dismissed = localStorage.getItem('hoosh_legacy_dismissed') === '1'; } catch (e) {}
 if (dismissed) return;
 var b = document.createElement('div');
 b.id = 'hoosh-legacy-banner';
 b.setAttribute('dir', 'rtl');
 b.setAttribute('role', 'alert');
 b.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#7A4E00;color:#fff;font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.7;padding:10px 16px;text-align:center;box-shadow:0 -2px 10px rgba(0,0,0,.3)';
 b.innerHTML = '\\u0645\\u0631\\u0648\\u0631\\u06af\\u0631 \\u0634\\u0645\\u0627 \\u0642\\u062f\\u06cc\\u0645\\u06cc \\u0627\\u0633\\u062a \\u0648 \\u0647\\u0648\\u0634 \\u0631\\u0627 \\u0646\\u0627\\u0642\\u0635 \\u0646\\u0645\\u0627\\u06cc\\u0634 \\u0645\\u06cc\\u200c\\u062f\\u0647\\u062f. \\u0628\\u0631\\u0627\\u06cc \\u06a9\\u0627\\u0631\\u06a9\\u0631\\u062f \\u06a9\\u0627\\u0645\\u0644 \\u0648 \\u0633\\u0631\u06cc\\u0639\\u062a\u0631\\u060c \u0645\u0631\u0648\u0631\u06af\u0631 \u062c\u062f\u06cc\u062f \u0646\u0635\u0628 \u06a9\u0646\u06cc\u062f: ';
 var a = document.createElement('a');
 a.href = 'https://www.google.com/chrome/';
 a.target = '_blank';
 a.rel = 'noopener noreferrer';
 a.style.cssText = 'color:#fff;font-weight:bold;text-decoration:underline;margin:0 6px';
 a.innerHTML = '\\u062f\\u0627\\u0646\\u0644\\u0648\\u062f Chrome \\u062c\\u062f\\u06cc\\u062f';
 b.appendChild(a);
 var x = document.createElement('button');
 x.innerHTML = '\\u2715 \\u0628\\u0633\\u062a\\u0646';
 x.style.cssText = 'background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:6px;padding:3px 10px;margin-inline-start:12px;cursor:pointer;font-family:inherit;font-size:12px';
 x.onclick = function () {
 try { localStorage.setItem('hoosh_legacy_dismissed', '1'); } catch (e) {}
 if (b.parentNode) { b.parentNode.removeChild(b); }
 };
 b.appendChild(x);
 document.body.appendChild(b);
 } catch (e) {}
 }
 if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', showBanner); } else { showBanner(); }
 })();`,
 }}
 />
 </head>
 <body className={`${Vazirmatn.variable} ${JetBrainsMono.variable} font-sans antialiased`}>
 <AppProviders>{children}</AppProviders>
 {/* JSON-LD Structured Data — سراسری */}
 <StructuredData />
 {/* AI-SEO (Agent #5): گراف مکمل موجودیت‌ها — فقط فیلدهای مفقود را به
  * Organization (#organization) و SoftwareApplication (#software) موجود
  * می‌افزاید؛ پارسرها بر اساس @id ادغام می‌کنند. */}
 <JsonLd data={await getEntitySupplementSchema()} />
 {/* Global ChunkLoadError auto-recovery — هنگام stale cache، یک‌بار خودکار reload می‌کند */}
 <script
 dangerouslySetInnerHTML={{
 __html: `(function(){
 try {
 var KEY = 'hoshhesab_chunk_reload';
 var MAX = 2; // حداکثر دفعات reload خودکار برای جلوگیری از loop
 function isChunkErr(msg){
 if(!msg) return false;
 var m = String(msg);
 return m.indexOf('ChunkLoadError') >= 0
 || m.indexOf('Failed to load chunk') >= 0
 || m.indexOf('Loading chunk') >= 0
 || m.indexOf('Loading CSS chunk') >= 0;
 }
 function count(){
 try { return parseInt(sessionStorage.getItem(KEY) || '0', 10) || 0; } catch(e){ return 0; }
 }
 function bump(){
 try { sessionStorage.setItem(KEY, String(count()+1)); } catch(e){}
 }
 function clearCount(){
 try { sessionStorage.removeItem(KEY); } catch(e){}
 }
 // پس از ۵ ثانیه موفقیت، شمارنده ریست می‌شود
 setTimeout(clearCount, 5000);
 window.addEventListener('error', function(e){
 if(isChunkErr(e.message) || isChunkErr(e.error && e.error.message)){
 if(count() < MAX){
 bump();
 setTimeout(function(){ window.location.reload(); }, 300);
 }
 }
 });
 window.addEventListener('unhandledrejection', function(e){
 var r = e && e.reason;
 var msg = (r && (r.message || r.toString && r.toString())) || '';
 if(isChunkErr(msg)){
 if(count() < MAX){
 bump();
 setTimeout(function(){ window.location.reload(); }, 300);
 }
 }
 });
 } catch(_) {}
 })();`,
 }}
 />
 </body>
 </html>
 );
}
