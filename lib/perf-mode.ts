'use client';

import { useEffect, useState } from 'react';

/**
 * R15-F2 — حالت عملکرد برای دستگاه‌های ضعیف
 * ماژول SSR-safe برای تشخیص لپ‌تاپ/موبایل ضعیف و کاهش انیمیشن‌ها در لحظه اجرا.
 * هیچ انیمیشنی حذف نمی‌شود؛ فقط با پرچم زیر زمان اجرا موقتاً غیرفعال می‌شود.
 */

const STORAGE_KEY = 'hoosh_perf_mode';
export const PERF_MODE_EVENT = 'hoosh:perf-mode-changed';

export type PerfModeOverride = 'auto' | 'on' | 'off';

interface NavigatorDeviceMemory extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

/**
 * R28-12 — تشخیص مرورگر قدیمی.
 * همان سیگنال‌هایی که اسکریپت boot در layout برای legacy-mode می‌سنجد:
 * نبود IntersectionObserver/matchMedia یا پشتیبانی‌نکردن از color-mix
 * (کروم<۱۱۱/سافاری<۱۶.۲) یعنی مرورگر چند ساله است و بلور/انیمیشن سنگین
 * روی آن فریز و خطا می‌سازد → همان «بارگیری سبک» دریافت کند.
 */
function isLegacyBrowser(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (!("IntersectionObserver" in window) || typeof window.matchMedia !== "function") return true;
    const supports =
      typeof window.CSS !== "undefined" && typeof window.CSS.supports === "function";
    if (!supports) return true;
    return !window.CSS.supports("color", "color-mix(in srgb, red 50%, transparent)");
  } catch {
    return false;
  }
}

/** آیا دستگاه فعلی ضعیف در نظر گرفته می‌شود؟ (فقط سمت کلاینت) */
export function isWeakDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const nav = navigator as NavigatorDeviceMemory;
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return true;
    if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) return true;
    // R28-12 — حالت صرفه‌جویی داده (Data Saver): کاربر بار سبک خواسته است
    if (nav.connection?.saveData === true) return true;
    // R28-12 — مرورگر قدیمی (بدون IntersectionObserver / color-mix و…)
    if (isLegacyBrowser()) return true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  } catch {
    // دسترسی به API های سخت‌افزار ممکن است محدود باشد — رفتار پیش‌فرض: غیر ضعیف
  }
  return false;
}

function readOverride(): PerfModeOverride {
  if (typeof window === 'undefined') return 'auto';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'on' || v === 'off' || v === 'auto') return v;
  } catch {
    // localStorage در حالت خصوصی بعضی مرورگرها خطا می‌دهد
  }
  return 'auto';
}

function computeFlags(override: PerfModeOverride, reducedMotionQuery: boolean) {
  const weak = isWeakDevice();
  if (override === 'on') return { perfMode: true, reducedMotion: true };
  if (override === 'off') return { perfMode: false, reducedMotion: false };
  return { perfMode: weak, reducedMotion: weak || reducedMotionQuery };
}

/** نوشتن انتخاب کاربر و اطلاع‌رسانی به همه هوک‌های فعال */
export function setPerfModeOverride(v: PerfModeOverride): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // نادیده بگیر — حتی بدون ذخیره، رویداد ارسال می‌شود تا UI هم‌راستا بماند
  }
  // به‌روزرسانی فوری کلاس <html> (حتی اگر هنوز هیچ هوکی mount نشده باشد)
  try {
    const flags = computeFlags(v, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    document.documentElement.classList.toggle('perf-mode', flags.perfMode);
  } catch {
    /* بی‌اهمیت */
  }
  window.dispatchEvent(new CustomEvent(PERF_MODE_EVENT, { detail: { value: v } }));
}

export interface PerfModeState {
  perfMode: boolean;
  reducedMotion: boolean;
  override: PerfModeOverride;
}

/**
 * R28-12 — آیا مونتِ ویجت/کامپوننت‌های سنگینِ غیرقابل‌مشاهده باید تا ورود
 * به دیدرس (IntersectionObserver) به تعویق بیفتد؟
 * فقط روی دستگاه ضعیف/مرورگر قدیمی یا با انتخاب دستی «حالت سبک» فعال است؛
 * روی دستگاه قوی همیشه false می‌ماند (رفتار دست‌نخورده).
 */
export function shouldDeferHeavyMount(): boolean {
  if (typeof window === 'undefined') return false;
  const override = readOverride();
  if (override === 'on') return true;
  if (override === 'off') return false;
  return isWeakDevice();
}

/**
 * هوک React برای حالت عملکرد.
 * منابع: localStorage (انتخاب کاربر) + ویژگی‌های دستگاه + prefers-reduced-motion
 * به تغییر هر سه گوش می‌دهد و در unmount پاک‌سازی می‌کند.
 */
export function usePerfMode(): PerfModeState {
  const [state, setState] = useState<PerfModeState>({
    perfMode: false,
    reducedMotion: false,
    override: 'auto',
  });

  useEffect(() => {
    const mql =
      typeof window !== 'undefined' && 'matchMedia' in window
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    const sync = () => {
      const override = readOverride();
      const flags = computeFlags(override, mql ? mql.matches : false);
      // همگام‌سازی کلاس <html> — مصرف‌کنندگان CSS/بدون-React (مثل Reveal با
      // documentElement.classList.contains("perf-mode")) همین علامت را می‌خوانند
      try {
        document.documentElement.classList.toggle('perf-mode', flags.perfMode);
      } catch {
        /* DOM آماده نیست — بی‌اهمیت */
      }
      setState({ override, ...flags });
    };

    sync(); // مقدار اولیه پس از mount (SSR-safe)

    const onMediaChange = () => sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === STORAGE_KEY) sync();
    };
    const onOverrideChange = () => sync();

    mql?.addEventListener('change', onMediaChange);
    window.addEventListener('storage', onStorage);
    window.addEventListener(PERF_MODE_EVENT, onOverrideChange as EventListener);

    return () => {
      mql?.removeEventListener('change', onMediaChange);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(PERF_MODE_EVENT, onOverrideChange as EventListener);
    };
  }, []);

  return state;
}
