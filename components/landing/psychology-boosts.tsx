"use client";

/**
 * components/landing/psychology-boosts.tsx
 * ============================================================================
 * بستهٔ «تقویت‌کننده‌های روانشناسی فروش» لندینگ افق پلاس — دور سوم (نسخهٔ ۸)
 * ============================================================================
 *
 * مجموعه‌ای از کامپوننت‌های کوچک و سبک (بدون framer-motion، فقط
 * transform/opacity) که ترفندهای روانشناسی تأییدشده را «در لحظهٔ درستِ
 * قیف» نشان می‌دهند. همهٔ اعداد از API واقعی می‌آیند؛ همهٔ متن‌ها از
 * lib/marketing-psychology.ts (منبع واحد — قابل ویرایش مالک).
 *
 * قواعد صداقت (از کتاب بازی R24):
 *   ۱. هیچ عدد ساختگی/شمارندهٔ جعلی — داده نبود ⇒ المان رندر نمی‌شود.
 *   ۲. هیچ تایمر ریست‌شونده یا «فقط ۳ صندلی مانده»ی دروغین.
 *   ۳. قاب زیان (مودیان) فقط با ارجاع به قانون واقعی + مسیر حل.
 *
 * کامپوننت‌ها:
 *   - HeroCtaReassurance  → Risk Reversal میکروکپی زیر CTA هیرو
 *   - HeroLiveProofChip   → Social Proof زنده (عدد واقعی ثبت‌نام هفته)
 *   - MoadianLossNote     → Loss Framing مسئولانه (ماده ۱۶۹ مکرر)
 *   - PricingTrustStrip   → نوار اعتماد ۴‌ماده‌ای زیر کارت‌های قیمت
 *   - PsychologyOverlays  → ExitIntent + SocialProofToasts (بازگرداندن
 *                            دو کامپوننت آمادهٔ موجود به لندینگ فعال)
 */

import * as React from "react";
import {
  ShieldCheck,
  CreditCard,
  Lock,
  FileDown,
  AlertTriangle,
  Users,
  CalendarClock,
} from "lucide-react";
import { formatNumber } from "@/lib/persian";
import { useBranding } from "@/hooks/use-branding";
import {
  riskReversal,
  liveSocialProof,
  moadianLossFraming,
  migrationSlots,
  fillPsychoTemplate,
} from "@/lib/marketing-psychology";
import { ExitIntentOffer } from "@/components/ux/exit-intent-offer";
import { SocialProofToasts } from "@/components/ux/social-proof-toasts";

/* ---------------------------------------------------------------------------
 * ۱) HeroCtaReassurance — میکروکپی «بدون ریسک» بلافاصله زیر CTA اصلی
 * (Risk Reversal در نقطهٔ کلیک — مهم‌تر از هر پاراگراف اعتماد پایین صفحه)
 * ------------------------------------------------------------------------- */
export function HeroCtaReassurance() {
  return (
    <div
      className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground lg:justify-start"
      aria-label="شرایط شروع رایگان"
    >
      {riskReversal.ctaMicrocopy.map((line, i) => (
        <React.Fragment key={line}>
          {i > 0 && (
            <span aria-hidden="true" className="text-muted-foreground/40">
              ·
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            {line}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * ۲) HeroLiveProofChip — چیپ اثبات اجتماعی زنده زیر CTA هیرو
 * عدد «ثبت‌نام همین هفته» از /api/pricing/social-proof (شمارش واقعی جدول
 * User). اگر داده‌ای نبود (صفر یا خطا) کل چیپ حذف می‌شود — صداقت کامل.
 * ------------------------------------------------------------------------- */
interface HeroProofStats {
  signupsThisWeek: number;
  activeBusinesses: number;
}

export function HeroLiveProofChip() {
  const { branding } = useBranding();
  const [stats, setStats] = React.useState<HeroProofStats | null>(null);

  React.useEffect(() => {
    if (!liveSocialProof.heroChipEnabled) return;
    let alive = true;
    fetch("/api/pricing/social-proof", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j?.data) return;
        const signups = Number(j.data.signupsThisWeek) || 0;
        const active = Number(j.data.activeBusinesses) || 0;
        if (signups > 0 || active > 0) setStats({ signupsThisWeek: signups, activeBusinesses: active });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!stats) return null;

  const line =
    stats.signupsThisWeek > 0
      ? fillPsychoTemplate(liveSocialProof.heroSignupLine, {
          n: formatNumber(stats.signupsThisWeek),
          app: branding.appName,
        })
      : fillPsychoTemplate(liveSocialProof.heroActiveFallbackLine, {
          n: formatNumber(stats.activeBusinesses),
          app: branding.appName,
        });

  return (
    <p
      className="mx-auto mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/70 px-3 py-1 text-[11px] font-medium text-emerald-800 transition-opacity duration-500 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300 lg:mx-0"
      dir="rtl"
    >
      {/* نقطهٔ «زنده» — فقط انیمیشن opacity (سبک برای لپ‌تاپ ضعیف) */}
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {line}
    </p>
  );
}

/* ---------------------------------------------------------------------------
 * ۳) MoadianLossNote — قاب زیان مسئولانه زیر آزمایشگاه صورتحساب مودیان
 * ارجاع به الزام قانونی واقعی (ماده ۱۶۹ مکرر) + همیشه پایان با مسیر حل.
 * متن از lib/marketing-psychology.ts — قابل ویرایش مالک.
 * ------------------------------------------------------------------------- */
export function MoadianLossNote() {
  if (!moadianLossFraming.enabled) return null;
  return (
    <div
      className="mx-auto mt-6 max-w-3xl rounded-xl border border-amber-300/60 bg-amber-50/70 p-4 text-right dark:border-amber-800/60 dark:bg-amber-950/30"
      role="note"
      aria-label="الزام قانونی صورتحساب الکترونیکی"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-relaxed text-foreground">
            {moadianLossFraming.title}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {moadianLossFraming.body}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * ۴) PricingTrustStrip — نوار اعتماد ۴‌ماده‌ای زیر کارت‌های قیمت لندینگ
 * هر چهار مورد سیاستِ «از قبل واقعی» محصول‌اند (ضمانت بازگشت، تریال بدون
 * کارت، قفل قیمت مادام‌العمر، خروجی آزاد داده) — فقط دیده نمی‌شدند.
 * + ظرفیت مهاجرت هفتگی: فقط وقتی render می‌شود که مالک در کانفیگ آن را
 *   با عدد واقعی روشن کرده باشد (پیش‌فرض خاموش).
 * ------------------------------------------------------------------------- */
const TRUST_STRIP_ITEMS = [
  {
    icon: ShieldCheck,
    title: "۷ روز ضمانت بازگشت وجه",
    desc: "در صورت مشکل فنی حل‌نشده، مبلغ روزشمار عودت داده می‌شود",
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  {
    icon: CreditCard,
    title: "شروع بدون کارت بانکی",
    desc: "تریال کامل ۷ روزه با تمام امکانات — بدون نیاز به پرداخت یا تماس فروش",
    tone: "text-primary",
  },
  {
    icon: Lock,
    title: "قیمت شما برای همیشه قفل می‌شود",
    desc: "افزایش‌های سالانهٔ قیمت شامل حساب شما نمی‌شود (قفل مالک)",
    tone: "text-violet-600 dark:text-violet-400",
  },
  {
    icon: FileDown,
    title: "دادهٔ شما مال شماست",
    desc: "خروجی کامل با یک کلیک، حتی پس از پایان اشتراک — بدون قفل‌شدگی",
    tone: "text-teal-600 dark:text-teal-400",
  },
] as const;

export function PricingTrustStrip() {
  return (
    <div className="mt-10" aria-label="ضمانت‌ها و شرایط شروع">
      {/* ظرفیت مهاجرت — فقط با عدد واقعی مالک (پیش‌فرض خاموش) */}
      {migrationSlots.enabled && (
        <p className="mx-auto mb-5 flex max-w-xl flex-wrap items-center justify-center gap-2 rounded-full border border-primary/25 bg-primary/[0.06] px-4 py-2 text-center text-xs font-medium text-foreground">
          <CalendarClock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          {migrationSlots.label}: {formatNumber(migrationSlots.remainingThisWeek)} از{" "}
          {formatNumber(migrationSlots.weeklyCapacity)} باقی مانده — {migrationSlots.ctaHint}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST_STRIP_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/70 p-4 transition-colors hover:border-primary/30"
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${item.tone}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug text-foreground">{item.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * ۵) PsychologyOverlays — بازگرداندن دو کامپوننت آمادهٔ موجود به لندینگ فعال
 * ExitIntentOffer (Loss Aversion + Urgency صادقانه — یک‌بار در نشست، عدد
 * واقعی API، دکمهٔ محترمانهٔ «نه، ممنون») و SocialProofToasts (توست‌های
 * چرخانیِ دادهٔ واقعی). این دو فقط در landing-view قدیمی مونت بودند که
 * دیگر رندر نمی‌شود؛ اینجا دوباره به قیف فعال وصل می‌شوند.
 * ------------------------------------------------------------------------- */
export function PsychologyOverlays() {
  return (
    <>
      <ExitIntentOffer />
      <SocialProofToasts />
    </>
  );
}

/* ---------------------------------------------------------------------------
 * ۶) MobileStickyCta — نوار CTA چسبان موبایل (نسخهٔ ۱۰)
 * علم: در موبایل، CTA هیرو بعد از اسکرول از دید خارج می‌شود؛ پژوهش‌های
 * CRO (Baymard/NNGroup) نشان می‌دهند نوار چسبانِ «بعد از گذر از هیرو»
 * نرخ تبدیل موبایل را به‌طور معنادار بالا می‌برد چون اکشن همیشه در
 * دسترس است (قانون دسترس‌پذیری Fitts).
 * قواعد صداقت همین مجموعه: عدد واقعی از API؛ بسته‌شدن توسط کاربر
 * در sessionStorage حفظ می‌شود؛ فقط مهمان (غیرلاگین)؛ فقط موبایل؛
 * فقط بعد از عبور از هیرو؛ انیمیشن صرفاً transform/opacity.
 * ------------------------------------------------------------------------- */
export function MobileStickyCta({ onTrialCreate }: { onTrialCreate: () => void }) {
  const [visible, setVisible] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [proofLine, setProofLine] = React.useState<string | null>(null);
  const { branding } = useBranding();

  React.useEffect(() => {
    try {
      if (sessionStorage.getItem("ofogh.stickyCta.dismissed") === "1") {
        setDismissed(true);
        return;
      }
    } catch {
      /* private mode */
    }
    // بعد از عبور از هیرو (ارتفاع ۷۵vh) ظاهر شود
    const onScroll = () => {
      const hero = document.getElementById("hero");
      const threshold = hero ? hero.offsetTop + hero.offsetHeight * 0.75 : window.innerHeight * 0.9;
      setVisible(window.scrollY > threshold);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // اثبات اجتماعی زنده (اختیاری — بدون داده رندر نمی‌شود)
  React.useEffect(() => {
    if (dismissed || !visible) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pricing/social-proof", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { signupsThisWeek?: number; activeBusinesses?: number };
        if (cancelled) return;
        if ((data.signupsThisWeek ?? 0) > 0) {
          setProofLine(
            fillPsychoTemplate(liveSocialProof.heroSignupLine, {
              n: formatNumber(data.signupsThisWeek ?? 0),
              app: branding.appName,
            })
          );
        } else if ((data.activeBusinesses ?? 0) > 0) {
          setProofLine(
            fillPsychoTemplate(liveSocialProof.heroActiveFallbackLine, {
              n: formatNumber(data.activeBusinesses ?? 0),
              app: branding.appName,
            })
          );
        }
      } catch {
        /* offline — بدون چیپ */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dismissed, visible, branding.appName]);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem("ofogh.stickyCta.dismissed", "1");
    } catch {
      /* private mode */
    }
  };

  if (dismissed) return null;

  return (
    <div
      dir="rtl"
      role="complementary"
      aria-label="شروع سریع آزمایش رایگان"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/92 backdrop-blur-xl transition-transform duration-300 will-change-transform lg:hidden"
      style={{
        transform: visible ? "translateY(0)" : "translateY(110%)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-bold text-foreground">
            ۷ روز رایگان، بدون کارت بانکی
          </p>
          {proofLine && (
            <p className="truncate text-[10.5px] leading-4 text-muted-foreground">{proofLine}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onTrialCreate}
          className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground shadow-lg shadow-primary/25 active:scale-95 transition-transform"
        >
          شروع کن
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="بستن نوار"
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
