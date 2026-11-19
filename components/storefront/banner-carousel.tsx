"use client";

// ═══════════════════════════════════════════════════════════════════
// Task 3-a — کاروسل سینمایی بنر فروشگاه (multi-slide)
// ============================================================================
// ویژگی‌ها:
//   ۱) کراس‌فید نرم + زوم آرام Ken Burns (~۸ ثانیه، جهت متناوب)
//   ۲) پخش خودکار ۶ ثانیه‌ای با «نوارهای پیشرفت» به‌عنوان نشانگر (پرشدن RTL)
//   ۳) توقف روی hover/focus/لمس + ادامه پس از ۸ ثانیه
//   ۴) درگ/سوایپ با Pointer Events (آگاه از RTL: کشیدن به راست = اسلاید بعدی)
//   ۵) کیبورد: فلش چپ = بعدی، فلش راست = قبلی (منطق RTL)
//   ۶) prefers-reduced-motion و حالت عملکرد (perf-mode): بدون زوم، گذار آنی
//   ۷) فقط انیمیشن‌های transform/opacity (GPU-friendly — لپ‌تاپ ضعیف)
//   ۸) بدون layout shift: ارتفاع ثابت ریسپانسیو + تصاویر absolute
//   ۹) لود تنهلتصاویر غیراول (lazy) — اولین اسلاید eager + fetchPriority
//  ۱۰) اسلاید بدون متن همچنان سینمایی است (گرادیان تیره + vignette + نور اکسنت)
//
// سازگاری: اگر فقط ۱ اسلاید باشد → بدون نشانگر/فلش/پخش خودکار (بنر تکی زیبا).
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type BannerSlide } from "@/lib/storefront-wizard";
import { getBannerTheme, CinematicLayers } from "@/components/storefront/cinematic-banner";
import { usePerfMode } from "@/lib/perf-mode";
import { toPersianDigits } from "@/lib/persian";

/* ─────────────── ثابت‌ها ─────────────── */

const AUTOPLAY_MS = 6000; // فاصلهٔ پخش خودکار
const KB_MS = 8000; // مدت زوم Ken Burns
const SWIPE_THRESHOLD = 56; // حداقل جابه‌جایی (px) برای تغییر اسلاید با درگ
const TOUCH_PAUSE_MS = 8000; // مکث پس از تعامل لمسی

/** کی‌فریم‌ها — فقط transform/opacity (شتاب سخت‌افزاری) */
const BANNER_CAROUSEL_KEYFRAMES = `
@keyframes sfBcProgress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes sfBcKbIn { from { transform: scale(1); } to { transform: scale(1.08); } }
@keyframes sfBcKbOut { from { transform: scale(1.08); } to { transform: scale(1); } }
@keyframes sfBcRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
.sfBcSlide { transition: opacity 700ms cubic-bezier(.4,0,.2,1); }
.sfBcDrag { transition: transform 300ms cubic-bezier(.2,.8,.2,1); }
.sfBcRise { animation: sfBcRise 550ms cubic-bezier(.2,.8,.2,1) both; }
/* احترام به prefers-reduced-motion و حالت دستگاه ضعیف (کلاس perf-mode روی <html>) */
@media (prefers-reduced-motion: reduce) {
  .sfBcSlide, .sfBcDrag { transition: none; }
  .sfBcKb, .sfBcRise { animation: none !important; }
}
.perf-mode .sfBcSlide, .perf-mode .sfBcDrag { transition: none; }
.perf-mode .sfBcKb, .perf-mode .sfBcRise { animation: none !important; }
`;

export interface BannerCarouselProps {
  /** اسلایدها — آرایهٔ غیرخالی (۱ اسلاید = بنر تکی) */
  slides: BannerSlide[];
  /** نوع کسب‌وکار برای گرادیان/اکسنت fallback (مثل grocery) */
  businessType?: string | null;
  /** رنگ اکسنت دلخواه قالب — خالی = رنگ تم صنف */
  accentColor?: string | null;
  /** متن‌های جایگزین — فقط وقتی «اسلاید اول» متن ندارد استفاده می‌شوند */
  fallbackBadge?: string | null;
  fallbackTitle?: string | null;
  fallbackSubtitle?: string | null;
  fallbackCtaLabel?: string | null;
  fallbackCtaLink?: string | null;
  /**
   * کلاس ابعاد/گوشه — پیش‌فرض ارتفاع ثابت ریسپانسیو (بدون layout shift):
   * موبایل 52dvh (حداقل ۳۲۰px) تا دسکتاپ 72dvh
   */
  className?: string;
}

export function BannerCarousel({
  slides,
  businessType,
  accentColor,
  fallbackBadge,
  fallbackTitle,
  fallbackSubtitle,
  fallbackCtaLabel,
  fallbackCtaLink,
  className,
}: BannerCarouselProps) {
  const theme = getBannerTheme(businessType);
  const accent = accentColor || theme.accent;
  const { reducedMotion } = usePerfMode();

  // فقط اسلایدهای با تصویر معتبر — دفاعی در برابر دادهٔ خراب
  const valid = React.useMemo(
    () => slides.filter((s) => s && typeof s.image === "string" && s.image.trim()),
    [slides]
  );
  const n = valid.length;
  const multi = n > 1; // تک‌اسلاید: بدون نشانگر/فلش/پخش خودکار

  // نمای فعال + اسلاید قبلی (برای کراس‌فید «پوششی» — تصویر قبلی زیر تصویر جدید می‌ماند)
  const [view, setView] = React.useState({ cur: 0, prev: -1 });
  const index = Math.min(view.cur, Math.max(0, n - 1));

  /* ── ناوبری ── */
  const goTo = React.useCallback(
    (i: number) => {
      setView((v) => {
        const next = ((i % n) + n) % n;
        return next === v.cur ? v : { cur: next, prev: v.cur };
      });
    },
    [n]
  );
  const next = React.useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = React.useCallback(() => goTo(index - 1), [goTo, index]);

  // اگر تعداد اسلاید کم شد (حذف در حالت ویرایش) ایندکس خارج از محدوده به ۰ برمی‌گردد
  React.useEffect(() => {
    if (view.cur >= n) setView({ cur: 0, prev: -1 });
  }, [n, view.cur]);

  /* ── توقف پخش خودکار (hover / فوکس / لمس) ── */
  const [hoverPaused, setHoverPaused] = React.useState(false);
  const [focusPaused, setFocusPaused] = React.useState(false);
  const [touchPaused, setTouchPaused] = React.useState(false);
  const paused = !multi || hoverPaused || focusPaused || touchPaused;

  React.useEffect(() => {
    if (!touchPaused) return;
    const t = window.setTimeout(() => setTouchPaused(false), TOUCH_PAUSE_MS);
    return () => window.clearTimeout(t);
  }, [touchPaused]);

  /* ── درگ/سوایپ با Pointer Events (RTL: کشیدن به راست = بعدی) ──
     نکته: ref فقط در رویدادها خوانده می‌شود؛ «فعال بودن درگ» برای رندر در state است */
  const dragRef = React.useRef<{ startX: number; active: boolean }>({ startX: 0, active: false });
  const [dragX, setDragX] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (!multi || (e.pointerType === "mouse" && e.button !== 0)) return;
    dragRef.current = { startX: e.clientX, active: true };
    setDragX(0);
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (!dragRef.current.active) return;
    setDragX(e.clientX - dragRef.current.startX);
  }
  function endDrag() {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setDragging(false);
    setDragX(0);
  }
  function onPointerUp() {
    if (!dragRef.current.active) return;
    const dx = dragX;
    dragRef.current.active = false;
    setDragging(false);
    setDragX(0);
    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      // منطق RTL: انگشت به راست (dx>0) → اسلاید بعدی، به چپ → قبلی
      if (dx > 0) next();
      else prev();
    }
    if (Math.abs(dx) > 4) setTouchPaused(true); // پس از تعامل، مکث کوتاه
  }

  /* ── کیبورد: فلش چپ = بعدی (پیشروی RTL)، فلش راست = قبلی ── */
  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (!multi) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      prev();
    } else if (e.key === "Home") {
      e.preventDefault();
      goTo(0);
    } else if (e.key === "End") {
      e.preventDefault();
      goTo(n - 1);
    }
  }

  /* ── پخش خودکار: منبع زمان CSS است — رویداد پایانِ نوار پیشرفت، اسلاید را عوض می‌کند
        (صفر re-render در هر فریم؛ مکث = animation-play-state) ── */
  function onProgressEnd(e: React.AnimationEvent<HTMLSpanElement>) {
    if (e.animationName !== "sfBcProgress" || paused) return;
    next();
  }

  if (n === 0) return null;

  return (
    <section
      dir="rtl"
      role="region"
      aria-roledescription="کاروسل"
      aria-label="بنر اصلی فروشگاه"
      tabIndex={0}
      className={`group relative w-full select-none overflow-hidden bg-zinc-950 outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
        className ?? "h-[52dvh] min-h-[320px] md:h-[62dvh] xl:h-[72dvh]"
      }`}
      style={{ touchAction: "pan-y" }}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => {
        setHoverPaused(false);
        endDrag();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onFocusCapture={() => setFocusPaused(true)}
      onBlurCapture={() => setFocusPaused(false)}
    >
      {/* کی‌فریم‌های محلی (یک‌بار در هر کاروسل — سبک و بدون وابستگی) */}
      <style dangerouslySetInnerHTML={{ __html: BANNER_CAROUSEL_KEYFRAMES }} />

      {/* ── اسلایدها (کراس‌فید + Ken Burns) ── */}
      {/* اسلاید کاندید: هنگام درگ، اسلاید بعدی/قبلی از لبهٔ جهت درگ زیر اسلاید فعال «پیک» می‌شود */}
      {(() => {
        const dragDir = dragX > 0 ? 1 : dragX < 0 ? -1 : 0; // +۱ = بعدی (کشیدن به راست در RTL)
        const candidateIdx =
          dragDir === 0 || !multi ? -1 : dragDir === 1 ? (index + 1) % n : (index - 1 + n) % n;
        return valid.map((s, i) => {
        const active = i === index;
        const leaving = i === view.prev && !active; // اسلاید در حال محو شدن زیر اسلاید فعال
        const isCandidate = i === candidateIdx && !active && !leaving;
        const isFirst = i === 0;
        // متن اسلاید: متن خودش وگرنه (فقط اسلاید اول) متن‌های اصلی بنر
        const badge = s.badge?.trim() || (isFirst ? (fallbackBadge ?? "").trim() : "") || "";
        const title = s.title?.trim() || (isFirst ? (fallbackTitle ?? "").trim() : "") || "";
        const subtitle = s.subtitle?.trim() || (isFirst ? (fallbackSubtitle ?? "").trim() : "") || "";
        const ctaLabel = s.ctaLabel?.trim() || (isFirst ? (fallbackCtaLabel ?? "").trim() : "") || "";
        const ctaLink = (s.ctaLink?.trim() || (isFirst ? (fallbackCtaLink ?? "").trim() : "") || "#products").trim();
        const external = /^https?:\/\//i.test(ctaLink);
        const kbOn = active && !reducedMotion;
        return (
          <div
            key={i}
            className={"sfBcSlide absolute inset-0 " + (dragging ? "" : "sfBcDrag")}
            style={{
              opacity: active
                ? dragX !== 0
                  ? Math.max(0.6, 1 - Math.abs(dragX) / 700) // محو شدن ملایم اسلاید فعال حین درگ
                  : 1
                : leaving || isCandidate
                  ? 1
                  : 0,
              zIndex: active ? 2 : leaving || isCandidate ? 1 : 0,
              pointerEvents: active ? undefined : "none",
              // جابه‌جایی زندهٔ اسلاید فعال و «پیک» کاندید از لبهٔ مخالف (فقط transform)
              transform: active
                ? dragX !== 0
                  ? `translateX(${dragX * 0.4}px)`
                  : undefined
                : isCandidate
                  ? dragDir === 1
                    ? `translateX(calc(-100% + ${dragX * 0.4}px))` // کاندید بعدی از چپ می‌آید
                    : `translateX(calc(100% + ${dragX * 0.4}px))` // کاندید قبلی از راست می‌آید
                  : undefined,
              transition: dragging ? "none" : undefined,
            }}
            aria-hidden={!active}
            role="group"
            aria-roledescription="اسلاید"
            aria-label={`اسلاید ${toPersianDigits(i + 1)} از ${toPersianDigits(n)}`}
          >
            {/* تصویر اسلاید — Ken Burns با جهت متناوب؛ اسلاید در حال خروج حالت پایانی را نگه می‌دارد */}
            {s.image ? (
              <img
                src={s.image}
                alt={title || "بنر فروشگاه"}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={i === 0 ? "high" : "auto"}
                className="sfBcKb absolute inset-0 h-full w-full object-cover"
                style={
                  kbOn
                    ? { animation: `${i % 2 === 0 ? "sfBcKbIn" : "sfBcKbOut"} ${KB_MS}ms ease-out both`, willChange: "transform" }
                    : leaving
                      ? { transform: "scale(1.08)" } // حالت پایانی زوم — بدون پرش هنگام محو شدن
                      : undefined
                }
              />
            ) : (
              // دفاعی: اسلاید بدون تصویر → گرادیان سینمایی خودکار صنف
              <CinematicLayers businessType={businessType} className="absolute inset-0" idPrefix={`bc-${i}`} />
            )}

            {/* روکش‌های سینمایی برای خوانایی متن (گرادیان پایین + سمت شروع RTL) */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[75%] bg-gradient-to-t from-black/85 via-black/40 to-transparent" aria-hidden="true" />
            <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[65%] bg-gradient-to-l from-black/55 via-black/15 to-transparent sm:block" aria-hidden="true" />
            {/* vignette + نور اکسنت — اسلاید بدون متن هم سینمایی بماند */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.14]"
              style={{ background: `radial-gradient(90% 70% at 85% 15%, ${accent}, transparent 60%)` }}
              aria-hidden="true"
            />

            {/* متن روی اسلاید (ورود با transform/opacity — هر تعویض بازپخش می‌شود) */}
            {(badge || title || subtitle || ctaLabel) && active ? (
              <div key={`txt-${index}`} className="sfBcRise absolute inset-x-0 bottom-0 z-10 pb-16 sm:pb-20">
                <div className="mx-auto w-full max-w-7xl px-5 sm:px-10">
                  <div className="max-w-[46ch]">
                    {badge ? (
                      <span
                        className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold backdrop-blur-sm sm:text-xs"
                        style={{ background: `${accent}26`, color: "#fff", border: `1px solid ${accent}66` }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" aria-hidden="true">
                          <path d={theme.icon} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {badge}
                      </span>
                    ) : null}
                    {title ? (
                      <h2
                        className="text-2xl font-black leading-[1.4] text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.55)] sm:text-4xl sm:leading-[1.35]"
                        style={{ textShadow: `0 2px 24px ${theme.bg[0]}99, 0 0 2px rgba(255,255,255,.1)` }}
                      >
                        {title}
                      </h2>
                    ) : null}
                    {subtitle ? (
                      <p className="mt-2 text-sm leading-7 text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)] sm:mt-3 sm:text-base sm:leading-8">
                        {subtitle}
                      </p>
                    ) : null}
                    {ctaLabel ? (
                      <a
                        href={ctaLink || "#products"}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noopener noreferrer" : undefined}
                        className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-6 py-2.5 text-sm font-extrabold text-white shadow-xl transition-transform duration-300 hover:scale-[1.03] sm:mt-5"
                        style={{ backgroundColor: accent, textShadow: "0 1px 6px rgba(0,0,0,.35)" }}
                      >
                        {ctaLabel}
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        );
        });
      })()}

      {/* ── فلش‌های ناوبری (موبایل: پنهان — سوایپ؛ دسکتاپ: ظریف و شیشه‌ای) ── */}
      {multi ? (
        <>
          <button
            type="button"
            onClick={next}
            aria-label="اسلاید بعدی"
            className="absolute left-3 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/30 text-white opacity-50 backdrop-blur-sm transition-all duration-300 hover:bg-black/55 hover:opacity-100 focus-visible:opacity-100 sm:grid"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={prev}
            aria-label="اسلاید قبلی"
            className="absolute right-3 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/30 text-white opacity-50 backdrop-blur-sm transition-all duration-300 hover:bg-black/55 hover:opacity-100 focus-visible:opacity-100 sm:grid"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </>
      ) : null}

      {/* ── نشانگرها: نوار پیشرفت (پرشدن از راست = RTL) — خودشان دکمهٔ پرش‌اند ── */}
      {multi ? (
        <div className="absolute inset-x-0 bottom-2 z-20 flex justify-center gap-1 px-4 sm:bottom-3 sm:gap-1.5" role="tablist" aria-label="انتخاب اسلاید">
          {valid.map((_, i) => {
            const active = i === index;
            return (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`نمایش اسلاید ${toPersianDigits(i + 1)}`}
                onClick={() => goTo(i)}
                className="relative h-11 min-w-[32px] flex-1 max-w-[110px] rounded-lg transition-transform hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                {/* ریل نوار */}
                <span className="absolute inset-x-0 top-5 h-[3px] overflow-hidden rounded-full bg-white/25" aria-hidden="true">
                  {active ? (
                    // پرشدن نوار همگام با پخش خودکار — مکث = freeze روی همان درصد
                    <span
                      key={index}
                      className="absolute inset-0 origin-right rounded-full bg-white"
                      style={{
                        animation: `sfBcProgress ${AUTOPLAY_MS}ms linear both`,
                        animationPlayState: paused ? "paused" : "running",
                      }}
                      onAnimationEnd={onProgressEnd}
                    />
                  ) : (
                    <span
                      className="absolute inset-0 origin-right rounded-full bg-white"
                      style={{ transform: `scaleX(${i < index ? 1 : 0})` }}
                      aria-hidden="true"
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export default BannerCarousel;
