"use client";

/**
 * CinematicBanner — موتور بنرهای سینمایی فروشگاه (Task 2-b)
 * ============================================================================
 * چرا SVG/کد به‌جای عکس؟
 *   ۱) متن فارسی «بی‌نقص» — صفر غلط املایی چون متن واقعی است نه رندرشده توسط AI
 *   ۲) ریسپانسیو واقعی — وکتور، در هر اندازه‌ای شارپ
 *   ۳) حجم ~۱۰KB به‌جای ~۳۰۰KB عکس (سرعت موبایل)
 *   ۴) شخصی‌سازی لحظه‌ای — اسم فروشگاه همان لحظه داخل بنر می‌نشیند
 *
 * هر نوع کسب‌وکار = یک تم سینمایی (گرادیان + رنگ اکسنت + نقش هندسی مختص همان صنف)
 * ۱۶ صنف: موبایل، خرازی، خیاطی، رستوران، سوپرمارکت، ساختمان، آرایشی، کتاب،
 * عکاسی، جواهر، قطعات خودرو، لوازم خانگی، صنایع‌دستی/سوغاتی، گل‌فروشی، مد و پوشاک، عمومی
 */

import * as React from "react";

export interface BannerTheme {
  /** گرادیان پس‌زمینه (سه-stop سینمایی — تیره با ته‌رنگ صنف) */
  bg: [string, string, string];
  /** رنگ اکسنت (نور، دکمه، خط) */
  accent: string;
  /** رنگ دوم برای نقش‌ها */
  accent2: string;
  /** نقش هندسی مختص صنف */
  pattern: "circuit" | "tools" | "fabric" | "dining" | "basket" | "blueprint" | "beauty" | "books" | "lens" | "gem" | "wheel" | "home" | "craft" | "bloom" | "runway" | "classic" | "leaf" | "gadget";
  /** آیکون ساده (path) داخل نشان */
  icon: string;
}

export const BANNER_THEMES: Record<string, BannerTheme> = {
  mobile: {
    bg: ["#0a0f1e", "#131c3a", "#1e2a52"],
    accent: "#38bdf8",
    accent2: "#818cf8",
    pattern: "circuit",
    icon: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 17h4",
  },
  hardware: {
    bg: ["#17120a", "#2a1f10", "#3b2d16"],
    accent: "#f59e0b",
    accent2: "#fbbf24",
    pattern: "tools",
    icon: "M14.7 6.3a4.5 4.5 0 0 0-6.4 5.6L3 17.2V21h3.8l5.3-5.3a4.5 4.5 0 0 0 5.6-6.4l-2.9 2.9-2.1-2.1 2.9-2.9z",
  },
  tailor: {
    bg: ["#1a0a14", "#2e1030", "#421a44"],
    accent: "#f472b6",
    accent2: "#c084fc",
    pattern: "fabric",
    icon: "M6 2l6 3 6-3v20l-6-3-6 3V2zm6 3v14",
  },
  restaurant: {
    bg: ["#1c0a08", "#33110c", "#4a1a10"],
    accent: "#fb7185",
    accent2: "#fbbf24",
    pattern: "dining",
    icon: "M5 3v8a3 3 0 0 0 6 0V3M8 3v18M16 3c-2 0-3 2-3 5s1 4 2 4v9",
  },
  grocery: {
    bg: ["#0a1a0f", "#12291a", "#1b3a26"],
    accent: "#34d399",
    accent2: "#a3e635",
    pattern: "basket",
    icon: "M4 8h16l-2 12H6L4 8zm4 0V6a4 4 0 0 1 8 0v2",
  },
  construction: {
    bg: ["#12141a", "#1f2430", "#2e3542"],
    accent: "#facc15",
    accent2: "#94a3b8",
    pattern: "blueprint",
    icon: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 11h.01M15 11h.01",
  },
  cosmetics: {
    bg: ["#1a0a12", "#2f1024", "#451834"],
    accent: "#f9a8d4",
    accent2: "#e879f9",
    pattern: "beauty",
    icon: "M12 2c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z",
  },
  books: {
    bg: ["#10131f", "#1a2036", "#262e4a"],
    accent: "#60a5fa",
    accent2: "#fcd34d",
    pattern: "books",
    icon: "M4 4h7v16H4zM13 4h7v16h-7zM6 8h3M15 8h3M6 12h3M15 12h3",
  },
  photo: {
    bg: ["#0c0c10", "#181820", "#24242e"],
    accent: "#e2e8f0",
    accent2: "#38bdf8",
    pattern: "lens",
    icon: "M4 8h3l2-3h6l2 3h3v11H4V8zm8 8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  },
  jewelry: {
    bg: ["#120c1a", "#221430", "#33203f"],
    accent: "#fcd34d",
    accent2: "#f0abfc",
    pattern: "gem",
    icon: "M6 3h12l3 6-9 12L3 9l3-6zm3 6h6l-3 9-3-9z",
  },
  autoparts: {
    bg: ["#0f1114", "#1c2026", "#292f38"],
    accent: "#f87171",
    accent2: "#fb923c",
    pattern: "wheel",
    icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
  },
  electronics: {
    bg: ["#0a1218", "#122430", "#1a3844"],
    accent: "#22d3ee",
    accent2: "#34d399",
    pattern: "home",
    icon: "M3 5h18v12H3zM8 21h8M12 5v12",
  },
  souvenir: {
    bg: ["#16100a", "#2b2010", "#402f16"],
    accent: "#d4a373",
    accent2: "#e9c46a",
    pattern: "craft",
    icon: "M12 2l2.4 4.8 5.3.8-3.8 3.7.9 5.3-4.8-2.5-4.8 2.5.9-5.3L4.3 7.6l5.3-.8L12 2z",
  },
  flowers: {
    bg: ["#0f1a10", "#1e3018", "#2c4222"],
    accent: "#86efac",
    accent2: "#fda4af",
    pattern: "bloom",
    icon: "M12 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm7 4a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm-14 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm7 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-8a4 4 0 1 1 0-8 4 4 0 0 1 0 8z",
  },
  fashion: {
    bg: ["#140f16", "#251728", "#362038"],
    accent: "#f5d0fe",
    accent2: "#a5b4fc",
    pattern: "runway",
    icon: "M8 3l4 3 4-3 4 4-3 3v11H7V10L4 7l4-4z",
  },
  nursery: {
    bg: ["#0a1408", "#16260f", "#243a18"],
    accent: "#4ade80",
    accent2: "#bef264",
    pattern: "leaf",
    icon: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10ZM2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12",
  },
  appliances: {
    bg: ["#101012", "#1d1d22", "#2b2b33"],
    accent: "#fb923c",
    accent2: "#2dd4bf",
    pattern: "gadget",
    icon: "M3 4h18v12H3zM8 20h8M12 16v4",
  },
  general: {
    bg: ["#0c1015", "#161d26", "#212b38"],
    accent: "#34d399",
    accent2: "#818cf8",
    pattern: "classic",
    icon: "M4 4h16v6H4zM4 14h7v6H4zM13 14h7v6h-7z",
  },
};

export function getBannerTheme(businessType?: string | null): BannerTheme {
  return BANNER_THEMES[businessType || "general"] || BANNER_THEMES.general;
}

/* ─────────────── نقش‌های هندسی مختص هر صنف ─────────────── */

function PatternLayer({ pattern, accent, accent2 }: { pattern: BannerTheme["pattern"]; accent: string; accent2: string }) {
  const common = "absolute inset-0 opacity-[0.13]";
  switch (pattern) {
    case "circuit":
      return (
        <svg className={common} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <path d="M-20 40 H120 V90 H220 V40 H420" stroke={accent} strokeWidth="1.2" fill="none" />
          <path d="M-20 140 H80 V100 H200 V160 H420" stroke={accent2} strokeWidth="1.2" fill="none" />
          <path d="M-20 70 H60 V130 H160" stroke={accent} strokeWidth="1" fill="none" />
          <circle cx="120" cy="90" r="3" fill={accent} />
          <circle cx="220" cy="40" r="3" fill={accent2} />
          <circle cx="200" cy="160" r="3" fill={accent} />
          <circle cx="80" cy="100" r="2.5" fill={accent2} />
          <circle cx="160" cy="130" r="2.5" fill={accent} />
        </svg>
      );
    case "tools":
      return (
        <svg className={common} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g stroke={accent} strokeWidth="1.4" strokeLinecap="round" fill="none">
            <path d="M40 160 L110 90 M100 80 l14 14" />
            <circle cx="118" cy="84" r="12" strokeDasharray="3 5" />
            <path d="M300 40 l24 24 M310 34 l16 16" />
            <path d="M240 170 l40 -40" />
            <rect x="60" y="30" width="26" height="26" rx="4" transform="rotate(45 73 43)" />
          </g>
        </svg>
      );
    case "fabric":
      return (
        <svg className={common} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g stroke={accent} strokeWidth="1" fill="none">
            <path d="M0 50 Q50 20 100 50 T200 50 T300 50 T400 50" />
            <path d="M0 100 Q50 70 100 100 T200 100 T300 100 T400 100" />
            <path d="M0 150 Q50 120 100 150 T200 150 T300 150 T400 150" />
            <path d="M100 0 Q130 50 100 100 T100 200" stroke={accent2} />
            <path d="M300 0 Q330 50 300 100 T300 200" stroke={accent2} />
          </g>
        </svg>
      );
    case "dining":
      return (
        <svg className={common} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g stroke={accent} strokeWidth="1.3" fill="none" strokeLinecap="round">
            <circle cx="200" cy="100" r="60" strokeDasharray="4 7" />
            <circle cx="200" cy="100" r="42" />
            <path d="M200 58 v-16 M200 158 v-16 M158 100 h-16 M242 100 h16" />
          </g>
          <g stroke={accent2} strokeWidth="1.1" fill="none">
            <path d="M60 60 l16 16 M76 60 l-16 16 M330 130 l16 16 M346 130 l-16 16" />
          </g>
        </svg>
      );
    case "basket":
      return (
        <svg className={common} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g stroke={accent} strokeWidth="1.2" fill="none">
            <path d="M100 70 L130 160 L270 160 L300 70" />
            <path d="M100 70 h200 M112 100 h176 M124 130 h152" strokeDasharray="6 6" />
            <path d="M160 70 Q180 20 210 70 M230 70 Q250 30 270 70" stroke={accent2} />
          </g>
        </svg>
      );
    case "blueprint":
      return (
        <svg className={common} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g stroke={accent} strokeWidth="1" fill="none">
            <rect x="70" y="60" width="90" height="60" />
            <rect x="190" y="40" width="70" height="110" />
            <rect x="290" y="90" width="60" height="60" />
            <path d="M70 140 h280 M40 40 v130 M360 20 v160" strokeDasharray="10 6" stroke={accent2} />
          </g>
        </svg>
      );
    case "beauty":
      return (
        <svg className={common} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g fill="none" stroke={accent} strokeWidth="1.1">
            <circle cx="200" cy="100" r="70" strokeDasharray="2 8" />
            <circle cx="200" cy="100" r="50" />
            <path d="M200 30 v-14 M200 170 v14 M130 100 h-14 M270 100 h14" stroke={accent2} />
          </g>
        </svg>
      );
    case "books":
      return (
        <svg className={common} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g stroke={accent} strokeWidth="1.2" fill="none">
            <rect x="80" y="50" width="20" height="100" />
            <rect x="104" y="50" width="20" height="100" />
            <rect x="128" y="50" width="20" height="100" />
            <rect x="250" y="60" width="24" height="90" stroke={accent2} transform="rotate(8 262 105)" />
            <rect x="280" y="60" width="24" height="90" stroke={accent2} transform="rotate(-6 292 105)" />
          </g>
        </svg>
      );
    case "lens":
      return (
        <svg className={common} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g fill="none" stroke={accent} strokeWidth="1.3">
            <circle cx="200" cy="100" r="72" />
            <circle cx="200" cy="100" r="52" stroke={accent2} strokeDasharray="14 10" />
            <circle cx="200" cy="100" r="30" />
            <path d="M148 48 L120 20 M252 48 L280 20" />
          </g>
        </svg>
      );
    case "gem":
      return (
        <svg className={common} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g stroke={accent} strokeWidth="1.2" fill="none">
            <path d="M170 60 L230 60 L265 105 L200 170 L135 105 Z" />
            <path d="M170 60 L185 105 L200 170 M230 60 L215 105 L200 170 M135 105 h130" stroke={accent2} />
          </g>
        </svg>
      );
    case "wheel":
      return (
        <svg className={common} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g stroke={accent} strokeWidth="1.3" fill="none">
            <circle cx="200" cy="100" r="70" />
            <circle cx="200" cy="100" r="46" stroke={accent2} />
            <circle cx="200" cy="100" r="14" />
            <path d="M200 30 v46 M200 124 v46 M130 100 h46 M224 100 h46 M150 50 l33 33 M250 50 l-33 33 M150 150 l33 -33 M250 150 l-33 -33" />
          </g>
        </svg>
      );
    case "home":
      return (
        <svg className={common} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g stroke={accent} strokeWidth="1.2" fill="none">
            <rect x="90" y="70" width="60" height="70" rx="4" />
            <rect x="160" y="90" width="50" height="50" rx="4" stroke={accent2} />
            <circle cx="185" cy="115" r="10" stroke={accent2} />
            <path d="M260 140 h70 M260 120 h50 M260 100 h70 M260 80 h40" stroke={accent} strokeDasharray="5 5" />
            <path d="M80 150 h240" strokeDasharray="2 6" />
          </g>
        </svg>
      );
    case "craft":
      return (
        <svg className={common} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g stroke={accent} strokeWidth="1.1" fill="none">
            <path d="M100 100 l30 -60 l30 60 z M160 100 l30 -60 l30 60 z" />
            <path d="M70 120 Q200 180 330 120" stroke={accent2} strokeDasharray="7 7" />
            <path d="M120 160 q80 30 160 -10" stroke={accent} />
          </g>
        </svg>
      );
    case "bloom":
      return (
        <svg className={common} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g stroke={accent} strokeWidth="1.1" fill="none">
            <circle cx="170" cy="90" r="22" />
            <circle cx="212" cy="78" r="20" stroke={accent2} />
            <circle cx="232" cy="115" r="20" stroke={accent2} />
            <circle cx="196" cy="128" r="19" stroke={accent2} />
            <circle cx="158" cy="120" r="18" stroke={accent2} />
            <path d="M196 110 q-8 50 -30 70 M196 110 q14 44 40 58" />
          </g>
        </svg>
      );
    case "runway":
      return (
        <svg className={common} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g stroke={accent} strokeWidth="1.1" fill="none">
            <path d="M180 30 L200 55 L220 30 L245 55 L220 78 V170 H180 V78 L155 55 Z" />
            <path d="M120 40 v120 M280 40 v120" stroke={accent2} strokeDasharray="3 9" />
            <path d="M100 170 h200" />
          </g>
        </svg>
      );
    default: // classic
      return (
        <svg className={common} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g stroke={accent} strokeWidth="1" fill="none">
            <rect x="70" y="50" width="100" height="60" rx="8" />
            <rect x="210" y="50" width="120" height="60" rx="8" stroke={accent2} />
            <rect x="70" y="125" width="260" height="30" rx="8" />
            <path d="M40 30 h320 M40 178 h320" strokeDasharray="4 8" />
          </g>
        </svg>
      );
  }
}

/* ─────────────── لایه‌های بصری سینمایی (مشترک) ─────────────── */

/**
 * CinematicLayers — لایه‌های گرادیان/نقش/نور/vignette بدون متن.
 * برای استفاده به‌عنوان پس‌زمینهٔ بنر در قالب‌ها (absolute inset-0).
 */
export function CinematicLayers({
  businessType,
  className = "absolute inset-0",
  idPrefix = "cb",
}: {
  businessType?: string | null;
  className?: string;
  idPrefix?: string;
}) {
  const theme = getBannerTheme(businessType);
  return (
    <div className={className} aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${theme.bg[0]} 0%, ${theme.bg[1]} 52%, ${theme.bg[2]} 100%)`,
        }}
      />
      {/* نور سینمایی از گوشه */}
      <div
        className="pointer-events-none absolute -top-1/3 left-[-10%] h-[80%] w-[60%] rounded-full blur-3xl"
        style={{ background: `radial-gradient(closest-side, ${theme.accent}33, transparent)` }}
      />
      <div
        className="pointer-events-none absolute -bottom-1/3 right-[-5%] h-[70%] w-[45%] rounded-full blur-3xl"
        style={{ background: `radial-gradient(closest-side, ${theme.accent2}26, transparent)` }}
      />
      {/* نقش مختص صنف */}
      <PatternLayer pattern={theme.pattern} accent={theme.accent} accent2={theme.accent2} />
      {/* vignette سینمایی */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(120% 100% at 80% 20%, transparent 40%, ${theme.bg[0]}cc 100%)`,
        }}
      />
      {/* خط نوری افقی متحرک (فقط دسکتاپ — موبایل بدون انیمیشن برای پرفورمنس) */}
      <div className="pointer-events-none absolute inset-0 hidden sm:block">
        <div
          id={`${idPrefix}-shine`}
          className="absolute top-0 h-full w-px opacity-40 animate-[bannerShine_5s_ease-in-out_infinite]"
          style={{ background: `linear-gradient(to bottom, transparent, ${theme.accent}, transparent)`, left: "30%" }}
        />
      </div>
    </div>
  );
}

/* ─────────────── کامپوننت اصلی ─────────────── */

export interface CinematicBannerProps {
  businessType?: string | null;
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  /** کلاس‌های ابعاد و گوشه — پیش‌فرض h-56 sm:h-64 rounded-2xl (قابل بازنویسی) */
  className?: string;
  /** آمار کوچک پایین بنر */
  stats?: { label: string; value: string }[];
}

export function CinematicBanner({
  businessType,
  title,
  subtitle,
  badge,
  className = "h-56 sm:h-64 rounded-2xl",
  stats,
}: CinematicBannerProps) {
  const theme = getBannerTheme(businessType);
  const gid = React.useId().replace(/[:]/g, "");

  return (
    <div
      dir="rtl"
      role="img"
      aria-label={`${badge ? badge + " — " : ""}${title}${subtitle ? " — " + subtitle : ""}`}
      className={`relative w-full overflow-hidden ${className}`}
    >
      <CinematicLayers businessType={businessType} idPrefix={`cb-${gid}`} />

      {/* محتوا */}
      <div className="relative flex h-full flex-col justify-center gap-2 p-5 sm:p-7">
        {badge ? (
          <span
            className="inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold backdrop-blur-sm sm:text-[11px]"
            style={{ background: `${theme.accent}22`, color: theme.accent, border: `1px solid ${theme.accent}55` }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={theme.accent} strokeWidth="2" aria-hidden="true">
              <path d={theme.icon} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {badge}
          </span>
        ) : null}
        {/* FIX(SEO/GEO — باگ سلسله‌مراتب هدینگ): عنوان بنر قبلاً <h2> بود؛
            در صفحهٔ تک‌کالا (/shop/[slug]/p/[pid]) همین عنوان (نام کالا)
            چند خط پایین‌تر به‌صورت <h1> هم می‌آمد → نام کالا هم h2 بود هم h1
            و h2 در DOM قبل از h1 (تأیید با خروجی SSR واقعی). این کامپوننت
            فقط در کارت/بنر کالا استفاده می‌شود و هرگز هدینگ اصلی صفحه نیست،
            پس به <p> تبدیل شد — ظاهر با همان کلاس‌ها دقیقاً حفظ می‌شود و
            سلسله‌مراتب (h1 → h2 بخش‌ها) تمیز می‌ماند. */}
        <p
          className="text-xl font-black leading-snug text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] sm:text-3xl sm:leading-snug"
          style={{ textShadow: `0 2px 24px ${theme.bg[0]}88, 0 0 2px rgba(255,255,255,.12)` }}
        >
          {title}
        </p>
        {subtitle ? (
          <p className="max-w-[52ch] text-xs leading-relaxed sm:text-sm">
            <span className="text-white/80">{subtitle}</span>
          </p>
        ) : null}
        {stats && stats.length > 0 ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1">
            {stats.slice(0, 3).map((s) => (
              <div key={s.label} className="flex flex-col">
                <span className="text-[10px] text-white/55">{s.label}</span>
                <span className="text-sm font-extrabold" style={{ color: theme.accent }}>{s.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default CinematicBanner;
