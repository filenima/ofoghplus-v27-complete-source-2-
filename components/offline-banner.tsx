"use client";

/**
 * OfflineBanner → R26 «آفلاین = سکوت کامل»
 * ============================================================
 * درخواست مالک: «حتی هشدار آفلاین هم نباید ظاهر شود» — آفلاین ۱۰۰٪ بی‌صدا
 * است؛ همه‌چیز از کش/آینهٔ IDB کار می‌کند و موتاسیون‌ها در صف می‌روند.
 * فقط وضعیت‌های «قابل‌اقدام» همگام‌سازی نمایش داده می‌شود:
 *  - syncing: به اینترنت وصل شدیم و صف در حال ارسال است (موقت)
 *  - pending: N تغییر در صف (کلیک → ارسال فوری)
 *  - auth-expired / failed: نیاز به اقدام کاربر (ورود دوباره / بررسی)
 * اتمام موفق همگام‌سازی فقط با «یک توست» از sw-register اعلام می‌شود
 * («همگام‌سازی آفلاین انجام شد») — نه با بنر جدا.
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, CloudUpload, AlertCircle } from "lucide-react";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { toPersianDigits } from "@/lib/persian";

type Mode = "syncing" | "pending" | "auth-expired" | "failed" | "hidden";

export function OfflineBanner({ token }: { token: string | null }) {
  const { isOnline, serverOffline, pendingCount, failedCount, authExpired, syncing, syncNow } = useOfflineSync(token);

  const [mode, setMode] = React.useState<Mode>("hidden");
  const [justCameOnline, setJustCameOnline] = React.useState(false);
  const prevOnlineRef = React.useRef<boolean | null>(null);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // تشخیص لحظهٔ اتصال مجدد
  React.useEffect(() => {
    const prev = prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (prev === false && isOnline) {
      setJustCameOnline(true);
      const t = setTimeout(() => setJustCameOnline(false), 8000);
      return () => clearTimeout(t);
    }
  }, [isOnline]);

  // ماشین حالت — R26: آفلاین/سرور-داون کاملاً بی‌صدا (درخواست مالک: حتی
  // هشدار آفلاین هم نباید ظاهر شود)؛ فقط وضعیت‌های قابل‌اقدام همگام‌سازی
  React.useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    // آفلاین → هیچ نشانگری نیست؛ همه‌چیز از کش/آینهٔ IDB کار می‌کند
    if (!isOnline) {
      setMode("hidden");
      return;
    }
    // سرور پایین است → داده‌های ذخیره‌شده سرو می‌شوند؛ باز هم بی‌صدا
    if (serverOffline) {
      setMode("hidden");
      return;
    }
    // v20-F1 — نشست منقضی: بازپخش صف به ۴۰۱ خورده؛ آیتم‌ها امن در صف مانده‌اند
    if (authExpired && pendingCount > 0) {
      setMode("auth-expired");
      return;
    }
    // وصل شدیم و صف در حال ارسال است → نمایش موقت syncing؛
    // اتمام موفق فقط با «یک توست» sw-register اعلام می‌شود
    if (justCameOnline) {
      if (syncing) {
        setMode("syncing");
      } else {
        setMode("hidden");
        setJustCameOnline(false);
      }
      return;
    }
    if (pendingCount > 0) {
      setMode("pending");
      return;
    }
    // v20-F1 — همهٔ صف تخلیه شده ولی آیتم‌های ناموفق (deadletter) باقی است
    if (failedCount > 0) {
      setMode("failed");
      return;
    }
    setMode("hidden");
  }, [isOnline, serverOffline, justCameOnline, syncing, pendingCount, failedCount, authExpired]);

  // وقتی syncing از true به false رفت (پایان همگام‌سازی پس از اتصال) →
  // بدون بنر جداگانه؛ فقط توست sw-register («همگام‌سازی آفلاین انجام شد»)
  const prevSyncing = React.useRef(false);
  React.useEffect(() => {
    if (prevSyncing.current && !syncing && isOnline) {
      setJustCameOnline(false);
      setMode("hidden");
    }
    prevSyncing.current = syncing;
  }, [syncing, isOnline]);

  const visible = mode !== "hidden";

  const cfg: Record<
    Exclude<Mode, "hidden">,
    { icon: React.ReactNode; box: string; text: string; sub?: string; onClick?: () => void }
  > = {
    syncing: {
      icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />,
      box: "bg-emerald-50/95 dark:bg-emerald-950/85 border-emerald-200/80 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200",
      text: "در حال همگام‌سازی…",
      sub: "چند لحظه صبر کنید…",
    },
    pending: {
      icon: <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />,
      box: "bg-sky-50/95 dark:bg-sky-950/85 border-sky-200/80 dark:border-sky-800/60 text-sky-800 dark:text-sky-200",
      text: `${toPersianDigits(pendingCount)} تغییر در صف همگام‌سازی`,
      sub:
        failedCount > 0
          ? `${toPersianDigits(failedCount)} آیتم همگام نشده`
          : "خودکار ارسال می‌شوند",
      onClick: () => void syncNow(),
    },
    // v20-F1 — نشست منقضی: صف آماده است ولی برای ارسال باید دوباره وارد شوید
    "auth-expired": {
      icon: <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />,
      box: "bg-amber-50/95 dark:bg-amber-950/85 border-amber-200/80 dark:border-amber-800/60 text-amber-800 dark:text-amber-200",
      text: "برای همگام‌سازی دوباره وارد شوید",
      sub: `${toPersianDigits(pendingCount)} تغییر در انتظار ورود شما`,
    },
    // v20-F1 — آیتم‌های ناموفق پس از تلاش‌های مکرر (deadletter) — صرفاً اطلاع‌رسانی
    failed: {
      icon: <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />,
      box: "bg-orange-50/95 dark:bg-orange-950/85 border-orange-200/80 dark:border-orange-800/60 text-orange-800 dark:text-orange-200",
      text: `${toPersianDigits(failedCount)} آیتم همگام نشده`,
      sub: "پس از تلاش‌های مکرر متوقف شد — پس از رفع مشکل دوباره تلاش کنید",
    },
  };

  const styles = cfg[mode as Exclude<Mode, "hidden">];

  return (
    <AnimatePresence>
      {visible && styles && (
        <motion.div
          initial={{ y: 24, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 24, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 left-4 z-[60] pointer-events-none print:hidden"
          role="status"
          aria-live="polite"
        >
          <div
            onClick={styles.onClick}
            className={`pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border px-3.5 py-2 shadow-lg shadow-black/5 backdrop-blur-md transition-shadow ${
              styles.box
            } ${styles.onClick ? "cursor-pointer hover:shadow-md" : ""}`}
          >
            {styles.icon}
            <div className="min-w-0 text-right" dir="rtl">
              <p className="whitespace-nowrap text-[11px] font-bold leading-tight">{styles.text}</p>
              {styles.sub && (
                <p className="hidden whitespace-nowrap text-[9px] leading-tight opacity-75 sm:block">
                  {styles.sub}
                </p>
              )}
            </div>
            {pendingCount > 0 && mode !== "pending" && (
              <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-black/10 px-1 text-[9px] font-bold tabular-nums dark:bg-white/10">
                {toPersianDigits(pendingCount)}
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default OfflineBanner;
