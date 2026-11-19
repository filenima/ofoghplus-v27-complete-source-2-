"use client";

/**
 * ExitIntentOffer — Task 3-c: ترفند Loss Aversion + Urgency (Cialdini)
 * ============================================================================
 * وقتی کاربر دسکتاپ قصد خروج از صفحه را دارد (mouseout به سمت بالا) یا
 * کاربر موبایل سریع به بالا اسکرول می‌کند + زمان مطالعه > ۱۵ ثانیه:
 * یک بار در هر نشست، پیشنهاد تریال ۷روزه با پیام «از دست نده» نمایش داده می‌شود.
 *
 * اصول به‌کاررفته:
 *   - Loss Aversion: «۷ روز دسترسی کامل رایگان — اگر الان نگیرید…»
 *   - Zeigarnik/تعهد: «حساب شما آماده است؛ فقط یک کلیک مانده»
 *   - Social Proof: عدد واقعی کسب‌وکارهای فعال از API
 *   - Respect: فقط یک بار در هر نشست + دکمهٔ «نه، ممنون» واضح (اعتمادسازی)
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Timer, Users, X } from "lucide-react";

const SEEN_KEY = "ofogh.exitOffer.seen";
const MIN_DWELL_MS = 12_000; // حداقل حضور قبل از تریگر — کاربری که ۳ ثانیه‌ای رفته واقعاً نگران ما نیست
const REST_DAYS = 7;

export function ExitIntentOffer() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [activeCount, setActiveCount] = React.useState<number | null>(null);
  const armedRef = React.useRef(false);

  // شمارش بازدید این نشست — تریگر فقط یک‌بار
  const markSeen = React.useCallback(() => {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
  }, []);

  const trigger = React.useCallback(() => {
    if (armedRef.current) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (seen) return;
    armedRef.current = true;
    markSeen();
    setOpen(true);
  }, [markSeen]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const start = Date.now();

    // آمار واقعی برای اثبات اجتماعی
    fetch("/api/pricing/social-proof", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const n = j?.data?.activeBusinesses ?? j?.activeBusinesses;
        if (typeof n === "number" && n > 0) setActiveCount(n);
      })
      .catch(() => undefined);

    // ۱) دسکتاپ: خروج ماوس به سمت نوار مرورگر
    const onMouseOut = (e: MouseEvent) => {
      if (e.clientY <= 8 && !e.relatedTarget && Date.now() - start > MIN_DWELL_MS) {
        trigger();
      }
    };

    // ۲) موبایل: اسکرول سریع به بالا بعد از مطالعه
    let lastY = window.scrollY;
    let lastT = Date.now();
    const onScroll = () => {
      const y = window.scrollY;
      const t = Date.now();
      const dt = t - lastT;
      if (dt > 0) {
        const v = (lastY - y) / dt; // سرعت به بالا (px/ms)
        if (v > 1.1 && y < 140 && Date.now() - start > MIN_DWELL_MS) trigger();
      }
      lastY = y;
      lastT = t;
    };

    document.addEventListener("mouseout", onMouseOut);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("scroll", onScroll);
    };
  }, [trigger]);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : (setOpen(false), markSeen()))}>
      <DialogContent
        className="max-w-md gap-0 overflow-y-auto rounded-3xl border-2 border-emerald-200/60 bg-gradient-to-b from-emerald-50/80 to-background p-0 [&>button]:hidden"
        dir="rtl"
      >
        {/* نوار بالایی */}
        <div className="relative bg-gradient-to-l from-emerald-600 to-teal-600 px-5 py-4 text-white">
          <button
            onClick={() => { setOpen(false); markSeen(); }}
            aria-label="بستن"
            className="absolute left-3 top-3 rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="flex items-center gap-2 text-sm font-black">
            <Timer className="h-4 w-4" aria-hidden="true" />
            صبر کنید! پیشنهاد ویژهٔ خروج
          </p>
        </div>

        <div className="space-y-4 p-5">
          <DialogHeader className="space-y-2 text-right">
            <DialogTitle className="text-xl font-black leading-8 text-foreground">
              {REST_DAYS} روز دسترسی کامل به افق پلاس — رایگان
            </DialogTitle>
            <DialogDescription className="text-sm leading-7 text-muted-foreground">
              همهٔ امکانات بدون محدودیت: فاکتور، مودیان، انبار، گزارش‌های مالی و فروشگاه آنلاین.
              بدون کارت بانکی. اگر بعد از {REST_DAYS} روز نپسندیدید، هیچ‌چیز از دست نمی‌دهید —
              <strong className="text-foreground"> اما اگر همین حالا شروع نکنید، فردا هم همان روزهای پرخطای دیروز را تکرار می‌کنید.</strong>
            </DialogDescription>
          </DialogHeader>

          {activeCount ? (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800">
              <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
              هم‌اکنون {activeCount.toLocaleString("fa-IR")} کسب‌وکار ایرانی با افق پلاس حساب‌هایشان را مدیریت می‌کنند
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              className="h-12 gap-2 bg-emerald-600 text-base font-extrabold hover:bg-emerald-700"
              onClick={() => {
                markSeen();
                setOpen(false);
                router.push("/?trial=1#auth");
              }}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              شروع رایگان ۷ روزه
            </Button>
            <button
              onClick={() => { setOpen(false); markSeen(); }}
              className="rounded-xl py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              نه، ممنون — بعداً تصمیم می‌گیرم
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
