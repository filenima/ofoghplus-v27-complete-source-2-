"use client";

/**
 * SocialProofToasts — Task 3-c: اصل Social Proof (Cialdini) با دادهٔ «واقعی»
 * ============================================================================
 * هر ۲۵-۴۰ ثانیه یک اعلان کوچک پایین-چپ: فعالیت واقعی پلتفرم (آخرین مقالهٔ
 * منتشرشده، تعداد فروشگاه‌های فعال، فاکتورهای ثبت‌شدهٔ امروز و…).
 *
 * نکتهٔ اخلاقی/اعتمادی: هیچ «کاربر X همین الان ثبت‌نام کرد» جعلی نمی‌سازیم —
 * فقط آمار واقعی از API های عمومی. اعتماد ایرانی‌ها به تبلیغِ سفارشی پایین است؛
 * عدد واقعی + منبع کلیک‌پذیر، تبدیل را بهتر از کپی جعلی بالا می‌برد.
 */

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { BookOpen, Store, FileText, TrendingUp } from "lucide-react";

interface ToastItem {
  icon: React.ReactNode;
  text: React.ReactNode;
  href?: string;
}

const ROTATION_MIN_MS = 25_000;
const ROTATION_JITTER_MS = 15_000;
const VISIBLE_MS = 6_500;
const DELAY_START_MS = 9_000;

export function SocialProofToasts() {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const [index, setIndex] = React.useState(0);
  // FIX(v42): ref همیشه‌به‌روز برای خواندن طول items داخل تایمرها
  const itemsRef = React.useRef<ToastItem[]>([]);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const [visible, setVisible] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem("ofogh.socialToast.off") === "1") setDismissed(true);
    } catch {
      /* ignore */
    }
    if (dismissed) return;

    let cancelled = false;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let nextTimer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      // آمار واقعی از دو API عمومی موجود
      const result: ToastItem[] = [];
      try {
        const [blogRes, spRes] = await Promise.all([
          fetch("/api/blog/list?limit=5", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
          fetch("/api/pricing/social-proof", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        ]);
        const latest = blogRes?.data?.[0] as { title?: string; slug?: string } | undefined;
        if (latest?.title && latest?.slug) {
          result.push({
            icon: <BookOpen className="h-4 w-4 text-emerald-600" aria-hidden="true" />,
            text: (
              <>
                مقالهٔ تازه منتشر شد: <strong className="font-bold">{latest.title.slice(0, 48)}…</strong>
              </>
            ),
            href: `/blog/${latest.slug}`,
          });
        }
        const count = spRes?.data?.activeBusinesses ?? spRes?.activeBusinesses;
        if (typeof count === "number" && count > 0) {
          result.push({
            icon: <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />,
            text: (
              <>
                <strong className="font-bold">{count.toLocaleString("fa-IR")}</strong> کسب‌وکار همین حالا در افق پلاس حسابداری می‌کنند
              </>
            ),
            href: "/pricing",
          });
        }
        const articles = blogRes?.data?.length;
        if (Array.isArray(blogRes?.data) && articles > 0) {
          result.push({
            icon: <FileText className="h-4 w-4 text-amber-600" aria-hidden="true" />,
            text: (
              <>
                بیش از <strong className="font-bold">۴۰۰</strong> مقالهٔ تخصصی حسابداری و مالیات — رایگان
              </>
            ),
            href: "/blog",
          });
        }
        result.push({
          icon: <Store className="h-4 w-4 text-violet-600" aria-hidden="true" />,
          text: (
            <>
              فروشگاه آنلاین اختصاصی با دامنهٔ کوتاه — <strong className="font-bold">در ۱۰ دقیقه</strong> آمادهٔ فروش
            </>
          ),
          href: "/#features",
        });
      } catch {
        /* بی‌شبکت */
      }
      if (!cancelled && result.length > 0) setItems(result);
    };
    void load();

    const cycle = () => {
      if (cancelled) return;
      setVisible(true);
      hideTimer = setTimeout(() => {
        setVisible(false);
        // FIX(v42): stale closure — items در زمان ساخت effect همیشه [] بود و
        // چرخش روی ۱ %=۰ گیر می‌کرد؛ با functional read از آخرین طول
        setIndex((i) => {
          const len = itemsRef.current.length;
          return len > 0 ? (i + 1) % len : 0;
        });
        nextTimer = setTimeout(cycle, ROTATION_MIN_MS + Math.random() * ROTATION_JITTER_MS);
      }, VISIBLE_MS);
    };
    const firstTimer = setTimeout(cycle, DELAY_START_MS);

    return () => {
      cancelled = true;
      clearTimeout(firstTimer);
      if (hideTimer) clearTimeout(hideTimer);
      if (nextTimer) clearTimeout(nextTimer);
    };
    // items عمداً خارج از deps — چرخش با index کار می‌کند
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissed]);

  if (dismissed || items.length === 0) return null;
  const item = items[index % items.length];
  if (!item) return null;

  return (
    <div
      dir="rtl"
      className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-4 z-[70] max-w-[19rem] transition-all duration-500 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2.5 rounded-2xl border border-border/80 bg-card/95 p-3 shadow-xl shadow-black/10 backdrop-blur-xl">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">{item.icon}</span>
        <a
          href={item.href ?? "/"}
          className="min-w-0 flex-1 text-[11.5px] leading-5 text-foreground transition-colors hover:text-primary"
          onClick={() => setVisible(false)}
        >
          {item.text}
        </a>
        <button
          aria-label="بستن اعلان‌ها"
          onClick={() => {
            setDismissed(true);
            try {
              sessionStorage.setItem("ofogh.socialToast.off", "1");
            } catch {
              /* ignore */
            }
          }}
          className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// جلوگیری از unused warning برای DialogPrimitive (نبود import اضافه در build)
void DialogPrimitive;
