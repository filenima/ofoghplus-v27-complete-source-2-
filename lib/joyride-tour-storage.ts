"use client";

/**
 * joyride-tour-storage — انبارِ سبکِ وضعیت تور معرفی (R15-PERF)
 * ============================================================================
 * PERF FIX: app-shell برای دو تابع کوچکِ localStorage («آیا تور تمام شده؟» /
 * «ریست تور») به‌صورت ایستا از components/onboarding-joyride import می‌کرد
 * → با همین یک import، کل کتابخانهٔ سنگین react-joyride به‌همراه گراف
 * کامپوننتش وارد چانک اولیهٔ اپ می‌شد و بارگذاری تنبلِ OnboardingJoyride
 * عملاً بی‌اثر بود. این ماژول بدون هیچ وابستگی‌ای فقط منطق ذخیره‌سازی را
 * دارد؛ onboarding-joyride.tsx از همین‌جا می‌خواند (و برای سازگاری
 * re-export می‌کند) تا هیچ انیمیشن/ویژگی‌ای حذف نشود — فقط از چانک
 * اولیه به چانک تنبلِ خودِ تور منتقل می‌شود.
 */

const STORAGE_KEY = "hoshhesab_tour_done";
// اگر تور قدیمی هم قبلاً تکمیل شده باشد، تور جدید را نمایش نده
const LEGACY_STORAGE_KEY = "hoshhesab.tour.completed.v1";

/** آیا تور joyride قبلاً تکمیل/رد شده است؟ */
export function isJoyrideTourDone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(STORAGE_KEY) === "1") return true;
    if (localStorage.getItem(LEGACY_STORAGE_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** ثبت وضعیت تکمیل تور در localStorage */
function markTourDone() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * ثبت تکمیل/رد تور از بیرون (R13-2-a) — ویزارد راه‌اندازی (SetupWizard)
 * جایگزین اجرای خودکار تور شده است؛ بعد از تکمیل یا ردِ ویزارد، همین فلگ
 * را هم می‌گذارد تا منطق‌های وابسته به تور (مانند پاپ‌آپ «ایمیل‌تان را
 * امن کنید») به‌درستی فعال شوند و ویزارد در ورود بعدی دوباره باز نشود.
 */
export function markJoyrideTourDone() {
  markTourDone();
}

/**
 * پاک‌سازی وضعیت تکمیل تور — برای شروع مجدد تور از منوی کاربری.
 */
export function resetJoyrideTour() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
