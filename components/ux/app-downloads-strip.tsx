"use client";

/**
 * AppDownloadsStrip — نوار «دانلود نسخه‌ها» مشترک فوترها (v34-2/v34-8)
 * ----------------------------------------------------------------------------
 * خواستهٔ مالک: «اپلیکیشن اندروید و نرم‌افزار دسکتاپ رو دوتاشونو بیلد بکن و
 * توی فوتر صفحهٔ اصلی باید باشه بتونن دانلود بکنن» — این نوار در فوتر صفحهٔ
 * اصلی (LandingFooter در landing-dynamic.tsx) و فوتر پوستهٔ مارکتینگ
 * (MarketingFooter در _marketing-shell.tsx) مشترک استفاده می‌شود.
 *
 * فایل‌ها از صفحهٔ /downloads (بخش نسخهٔ دسکتاپ — Task 1-f) و Releases گیت‌هاب
 * سرو می‌شوند؛ لینک مستقیم قبلی public/downloads در این اسنپ‌شات خالی بود و ۴۰۴ می‌داد:
 *   /downloads#desktop-apps                    — راهنما + لینک Releases
 *   https://github.com/filenima/hooshhesab1/releases — Setup.exe ها (CI خودکار)
 */

import * as React from "react";
import { Smartphone, Monitor, Download, WifiOff, Sparkles } from "lucide-react";
import { useBranding } from "@/hooks/use-branding";

const CARD_BASE =
  "group flex items-center gap-3 rounded-xl border border-border bg-background/80 p-3.5 transition-all hover:border-emerald-600/50 hover:bg-emerald-600/5";
const ICON_BASE =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-700 transition-colors group-hover:bg-emerald-600/25 dark:text-emerald-300";
const ACTION_BASE =
  "ms-auto shrink-0 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors group-hover:border-emerald-600/50 group-hover:text-emerald-700 dark:group-hover:text-emerald-300";

export function AppDownloadsStrip() {
  const { branding } = useBranding();
  return (
    <div className="mb-10 rounded-2xl border border-border bg-gradient-to-bl from-emerald-500/10 via-card to-card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-700 dark:text-emerald-300">
            <Download className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-extrabold text-foreground">
              دانلود نسخه‌های {branding.appName} — اندروید و دسکتاپ
            </p>
            <p className="text-[11px] text-muted-foreground">
              همهٔ داده‌ها روی سیستم خودتان می‌ماند؛ پس از نصب، بدون اینترنت هم کار می‌کند
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-600/10 px-3 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
          <WifiOff className="h-3.5 w-3.5" /> قابل استفادهٔ ۱۰۰٪ آفلاین
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <a href="/downloads#desktop-apps" className={CARD_BASE}>
          <span className={ICON_BASE}>
            <Monitor className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-foreground">نسخهٔ ویندوز — Setup.exe</span>
            <span className="block text-[11px] text-muted-foreground">ویندوز ۷ تا ۱۱ — نصاب استاندارد بدون CMD</span>
          </span>
          <span className={ACTION_BASE}>دریافت</span>
        </a>
        <a href="/downloads#desktop-apps" className={CARD_BASE}>
          <span className={ICON_BASE}>
            <Smartphone className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-foreground">نسخهٔ پرتابل و اندروید</span>
            <span className="block text-[11px] text-muted-foreground">بدون نصب — تک‌پوشه + اپ اندروید</span>
          </span>
          <span className={ACTION_BASE}>دریافت</span>
        </a>
        <a href="https://github.com/filenima/hooshhesab1/actions/workflows/build-desktop.yml" target="_blank" rel="noopener noreferrer" className={CARD_BASE}>
          <span className={ICON_BASE}>
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-foreground">ساخت خودکار نسخهٔ جدید</span>
            <span className="block text-[11px] text-muted-foreground">GitHub Actions — با یک کلیک Setup.exe تازه</span>
          </span>
          <span className={ACTION_BASE}>ساخت</span>
        </a>
      </div>
      <p className="mt-3.5 text-[11px] leading-relaxed text-muted-foreground">
        نصاب مدرن برای ویندوز ۱۰/۱۱، نسخهٔ Legacy برای ویندوز ۷ SP1/۸ و نسخهٔ پرتابل بدون نصب — همهٔ پیش‌نیازها (Node و VC++) داخل بسته هستند و پس از نصب، برنامه ۱۰۰٪ آفلاین کار می‌کند. راهنمای کامل: صفحهٔ دانلودها، بخش «نسخهٔ دسکتاپ».
      </p>
    </div>
  );
}
