"use client";

import * as React from "react";
import { Joyride, type Step, type Styles, type Locale, type EventData, type PartialDeep } from "react-joyride";
import { Sparkles } from "lucide-react";
import { toPersianDigits } from "@/lib/persian";
// PERF(R15): منطق ذخیره‌سازی تور در ماژول سبک جدا lives می‌کند تا importers
// ایستا (مثل app-shell) react-joyride را به چانک اولیه نکشند.
import {
  isJoyrideTourDone,
  markJoyrideTourDone,
  resetJoyrideTour,
} from "@/lib/joyride-tour-storage";

// سازگاری با importers قبلی — همین توابع re-export می‌شوند
export { isJoyrideTourDone, markJoyrideTourDone, resetJoyrideTour };

interface OnboardingJoyrideProps {
 run: boolean;
 onComplete: () => void;
 /**
 * Callback اختیاری برای واکنش به تغییر مرحله‌ی تور.
 * فراخوانی می‌شود با (stepIndex, type) که type می‌تواند "step:before" یا "tour:end" باشد.
 * برای مثال: باز کردن فرم فاکتور پیش از نمایش مرحله‌ی ۳ (اندیس ۲).
 */
 onStep?: (stepIndex: number, type: string) => void;
}

// (توابع isJoyrideTourDone / markJoyrideTourDone / resetJoyrideTour به
// lib/joyride-tour-storage.ts منتقل و در بالای همین فایل re-export شدند)
function markTourDone() {
 markJoyrideTourDone();
}

// ============ Locale فارسی ============
const PERSIAN_LOCALE: Locale = {
 back: "قبلی",
 close: "بستن",
 last: "پایان",
 next: "بعدی",
 skip: "رد کردن",
};

// ============ مراحل تور ============
// توجه: در react-joyride v3، ویژگی صحیح برای غیرفعال‌کردن beacon ابتدایی
// «skipBeacon» است (نه «disableBeacon» قدیمی).
const TOUR_STEPS: Step[] = [
 {
 target: "[data-tour='sidebar']",
 placement: "left-start",
 title: "منوی اصلی",
 content:
 "از این منو به تمام بخش‌های نرم‌افزار دسترسی دارید. بخش‌ها در ۶ دسته مرتب شده‌اند: داشبورد، فروش و خرید، انبار و کالا، مالی و بانک، گزارش‌ها و هوشمند، سیستم.",
 isFixed: true,
 skipBeacon: true,
 },
 {
 target: "[data-tour='quick-create']",
 placement: "bottom",
 title: "ثبت سریع فاکتور",
 content:
 "با این دکمه می‌توانید فاکتور جدید ثبت کنید. در فرم باز شده، طرف‌حساب و کالای جدید را هم می‌توانید در همان لحظه اضافه کنید.",
 isFixed: true,
 skipBeacon: true,
 },
 {
 target: "[data-tour='ai-assistant']",
 placement: "top",
 title: "دستیار هوشمند مالی",
 content:
 "با کلیک روی این دکمه، دستیار هوشمند مالی باز می‌شود. می‌توانید به زبان فارسی سوال بپرسید، گزارش بخواهید یا تحلیل دریافت کنید.",
 isFixed: true,
 skipBeacon: true,
 },
 {
 target: "[data-tour='cmd-k']",
 placement: "bottom",
 title: "جستجوی پیشرفته (Cmd+K)",
 content:
 "با کلیک روی این دکمه یا فشردن Ctrl+K، پنل جستجوی پیشرفته باز می‌شود. می‌توانید فاکتور، کالا، طرف‌حساب یا سند را به‌سرعت پیدا کنید.",
 isFixed: true,
 skipBeacon: true,
 },
 {
 target: "[data-tour='settings']",
 placement: "bottom",
 title: "تنظیمات حساب کاربری",
 content:
 "با کلیک روی آواتار خود و سپس «تنظیمات حساب»، می‌توانید پروفایل، امنیت، اعلان‌ها، قالب برنامه، میانبرها و انتقال داده از نرم‌افزار دیگر را مدیریت کنید.",
 isFixed: true,
 skipBeacon: true,
 },
];

// ============ Override استایل‌ها (تم indigo + Vazirmatn) ============
const TOUR_STYLES: PartialDeep<Styles> = {
 beacon: {
 backgroundColor: "#4F46E5",
 borderRadius: "50%",
 },
 beaconInner: {
 backgroundColor: "#6366F1",
 },
 beaconOuter: {
 backgroundColor: "#4F46E5",
 },
 tooltip: {
 borderRadius: "0.75rem",
 boxShadow: "0 10px 40px -10px rgba(79, 70, 229, 0.4)",
 fontFamily:
 "var(--font-vazirmatn), ui-sans-serif, system-ui, -apple-system, sans-serif",
 padding: "0",
 textAlign: "right",
 },
 tooltipContainer: {
 textAlign: "right",
 },
 tooltipContent: {
 padding: "12px 16px 16px",
 fontSize: "13px",
 lineHeight: 1.7,
 },
 tooltipTitle: {
 fontSize: "14px",
 fontWeight: 700,
 color: "#0f172a",
 padding: "14px 16px 0",
 display: "flex",
 alignItems: "center",
 gap: "8px",
 },
 tooltipFooter: {
 padding: "8px 12px",
 borderTop: "1px solid #e2e8f0",
 marginTop: "0",
 flexDirection: "row-reverse", // RTL: دکمه بعدی در سمت چپ
 gap: "6px",
 },
 buttonBack: {
 backgroundColor: "transparent",
 color: "#64748b",
 border: "1px solid #e2e8f0",
 borderRadius: "0.5rem",
 padding: "6px 14px",
 fontSize: "12px",
 fontWeight: 500,
 fontFamily:
 "var(--font-vazirmatn), ui-sans-serif, system-ui, -apple-system, sans-serif",
 },
 buttonClose: {
 backgroundColor: "transparent",
 color: "#94a3b8",
 width: "28px",
 height: "28px",
 padding: 0,
 },
 buttonPrimary: {
 backgroundColor: "#4F46E5",
 color: "#ffffff",
 borderRadius: "0.5rem",
 padding: "6px 16px",
 fontSize: "12px",
 fontWeight: 600,
 boxShadow: "0 2px 8px -2px rgba(79, 70, 229, 0.5)",
 fontFamily:
 "var(--font-vazirmatn), ui-sans-serif, system-ui, -apple-system, sans-serif",
 },
 buttonSkip: {
 backgroundColor: "transparent",
 color: "#94a3b8",
 fontSize: "12px",
 fontWeight: 500,
 padding: "6px 10px",
 fontFamily:
 "var(--font-vazirmatn), ui-sans-serif, system-ui, -apple-system, sans-serif",
 },
 overlay: {
 backdropFilter: "blur(2px)",
 },
};

/**
 * OnboardingJoyride — تور معرفی محصول مبتنی بر react-joyride
 *
 * - ۵ گام: سایدبار، ثبت سریع، فرم فاکتور، گزارش‌ها، تنظیمات
 * - تم indigo و فونت Vazirmatn
 * - دکمه‌های فارسی: بعدی، قبلی، پایان، رد کردن
 * - continuous: true (پخش متوالی با Next)
 * - spotlightClicks: false (تعامل با المان روشن شده مسدود است)
 * - ذخیره تکمیل در localStorage "hoshhesab_tour_done"
 * - onStep: امکان باز/بستن فرم فاکتور بر اساس مرحله‌ی فعلی
 */
export function OnboardingJoyride({ run, onComplete, onStep }: OnboardingJoyrideProps) {
 const completedRef = React.useRef(false);

 const handleEvent = React.useCallback(
 (data: EventData) => {
 // واکنش به تغییر مرحله — باز/بستن فرم فاکتور
 if (data.type === "step:before") {
 onStep?.(data.index, "step:before");
 }
 // در پایان تور یا رد کردن آن، ثبت و فراخوانی onComplete
 if (data.type === "tour:end") {
 if (completedRef.current) return;
 completedRef.current = true;
 markTourDone();
 onStep?.(-1, "tour:end");
 onComplete();
 }
 },
 [onComplete, onStep]
 );

 // ریست فلگ تکمیل وقتی run دوباره true شد
 React.useEffect(() => {
 if (run) {
 completedRef.current = false;
 }
 }, [run]);

 if (!run) return null;

 return (
 <Joyride
 run={run}
 steps={TOUR_STEPS}
 continuous={true}
 scrollToFirstStep={true}
 locale={PERSIAN_LOCALE}
 styles={TOUR_STYLES}
 onEvent={handleEvent}
 options={{
 // نمایش پیشرفت (۱ از ۵) روی دکمه Next
 showProgress: true,
 // ترتیب دکمه‌ها برای نمایش دکمه رد کردن
 buttons: ["skip", "back", "close", "primary"],
 // معادل spotlightClicks: false تعامل با المان هدف مسدود
 blockTargetInteraction: true,
 // تم indigo
 primaryColor: "#4F46E5",
 backgroundColor: "#ffffff",
 arrowColor: "#ffffff",
 textColor: "#0f172a",
 overlayColor: "rgba(15, 23, 42, 0.65)",
 beaconSize: 36,
 width: 360,
 zIndex: 1000,
 spotlightRadius: 8,
 }}
 />
 );
}

/**
 * عنوان سفارشی برای تولتیپ‌ها با آیکون Sparkles
 * (در صورت نیاز برای توسعه آینده)
 */
export function TourTitle({ children }: { children: React.ReactNode }) {
 return (
 <span className="inline-flex items-center gap-2">
 <Sparkles className="h-4 w-4 text-indigo-600" />
 {children}
 </span>
 );
}

/** شمارش مراحل تور به فارسی */
export const TOUR_STEPS_COUNT = toPersianDigits(TOUR_STEPS.length);
