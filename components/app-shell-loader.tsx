"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { SafeBoundary } from "@/components/safe-boundary";
import { useBranding } from "@/hooks/use-branding";
import { OfoghLoader } from "@/components/ux/ofogh-loader";

/**
 * AppShellLoader — بارگذاری پوستهٔ اپ با تلاش مجدد خودکار
 * =====================================================
 * FIX(v13-preview): در سندباکسِ حافظهٔ محدود، کامپایل chunk سنگینِ AppShell
 * ممکن است سرور dev را momentarily از پا درآورد → درخواست chunk با خطا
 * (ChunkLoadError/Failed to fetch) روبه‌رو شود. next/dynamic به‌خودی‌خود
 * دوباره تلاش نمی‌کند و کاربر صفحهٔ «در حال بارگذاری» را همیشه می‌دید.
 * این لودر: خطا را می‌گیرد، شمارش معکوس نشان می‌دهد و خودش دوباره mount
 * می‌کند + دکمهٔ «تلاش مجدد فوری».
 * v20-F2: سقف تلاش خودکار ۲۰×۱۵ث به ۳×۵ث کاهش یافت (لپ‌تاپ ضعیف ساعت‌ها
 * روی صفحهٔ انتظار گیر نمی‌کند)؛ پس از اتمام، پیام خطای نهایی فارسی +
 * دکمهٔ نوسازی صفحه نمایش داده می‌شود.
 */

function ShellLoading() {
  const { branding } = useBranding();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6" dir="rtl">
      {/* Task 3-f — لودر برند (حلقهٔ دوگانهٔ همگام + شیمر) به‌جای اسپینر ساده */}
      <OfoghLoader compact messages={[`در حال بارگذاری ${branding.appName}…`]} />
    </div>
  );
}

const AppShell = dynamic(
  () => import("@/components/app-shell").then((m) => ({ default: m.AppShell })),
  {
    ssr: false,
    loading: () => <ShellLoading />,
  }
);

const MAX_AUTO_RETRIES = 3;
const RETRY_DELAY_MS = 5_000;

export function AppShellLoader() {
  const [retryKey, setRetryKey] = React.useState(0);
  const [countdown, setCountdown] = React.useState(0);
  const [lastError, setLastError] = React.useState<string | null>(null);
  const [exhausted, setExhausted] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const scheduleRetry = React.useCallback((delayMs: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    let remaining = Math.ceil(delayMs / 1000);
    setCountdown(remaining);
    timerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        setCountdown(0);
        setRetryKey((k) => k + 1);
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }, []);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleError = (error: Error) => {
    setLastError(error.message || "خطا در بارگذاری برنامه");
    if (retryKey < MAX_AUTO_RETRIES) {
      scheduleRetry(RETRY_DELAY_MS);
    } else {
      // v20-F2 — سقف تلاش خودکار پر شد: پیام نهایی + نوسازی دستی
      if (timerRef.current) clearInterval(timerRef.current);
      setCountdown(0);
      setExhausted(true);
    }
  };

  // v20-F2 — خطای نهایی پس از اتمام تلاش‌های خودکار
  if (exhausted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4" dir="rtl">
        <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-foreground">بارگذاری با خطا مواجه شد — صفحه را نوسازی کنید</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            پس از چند تلاش خودکار، اتصال به سرور برقرار نشد.
            {lastError ? (
              <span className="mt-2 block text-[11px] text-muted-foreground/70">({lastError})</span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            نوسازی صفحه
          </button>
        </div>
      </div>
    );
  }

  return (
    <SafeBoundary
      key={retryKey}
      resetKey={retryKey}
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background p-4" dir="rtl">
          <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50">
              <svg className="h-6 w-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-foreground">سرور در حال آماده‌سازی است</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              بارگذاری اولیهٔ برنامه کمی طول کشید. سیستم به‌طور خودکار دوباره تلاش می‌کند
              {countdown > 0 ? ` — ${countdown} ثانیه تا تلاش بعدی` : ""}.
              {retryKey > 0 && lastError ? (
                <span className="mt-2 block text-[11px] text-muted-foreground/70">
                  ({lastError})
                </span>
              ) : null}
            </p>
            <button
              type="button"
              onClick={() => {
                setRetryKey((k) => k + 1);
                setCountdown(0);
                if (timerRef.current) clearInterval(timerRef.current);
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              تلاش مجدد فوری
            </button>
          </div>
        </div>
      }
    >
      {/* handleError از طریق مرز خطا فراخوانی نمی‌شود؛ SafeBoundary فقط رندر می‌کند.
          خطای chunk در dynamic import باید اینجا بگیرد — پس یک لایهٔ catch اضافی: */}
      <AppShellErrorWatcher onError={handleError}>
        <AppShell />
      </AppShellErrorWatcher>
    </SafeBoundary>
  );
}

/** لایهٔ ردیابی خطای import برای dynamic chunk — خطا را به بالا گزارش می‌دهد و fallback رندر می‌کند */
function AppShellErrorWatcher({
  children,
  onError,
}: {
  children: React.ReactNode;
  onError: (error: Error) => void;
}) {
  const [caught, setCaught] = React.useState<Error | null>(null);
  React.useEffect(() => {
    const handler = (event: ErrorEvent) => {
      const msg = event.message || "";
      if (/ChunkLoadError|Failed to fetch|Loading chunk|dynamically imported module|Importing a module script failed/i.test(msg)) {
        const err = new Error(msg);
        setCaught(err);
        onError(err);
        event.preventDefault?.();
      }
    };
    window.addEventListener("error", handler);
    return () => window.removeEventListener("error", handler);
  }, [onError]);
  if (caught) {
    // رندر پوستهٔ انتظار — SafeBoundary والد بعد از شمارش معکوس دوباره mount می‌کند
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6" dir="rtl">
        <OfoghLoader compact messages={["در انتظار سرور… به‌زودی دوباره تلاش می‌شود"]} />
      </div>
    );
  }
  return <>{children}</>;
}
