"use client";

/**
 * ============ components/offline/sync-status-badge.tsx ============
 * R24-5 — بج شناور وضعیت همگام‌سازی آفلاین
 * ============================================================================
 * نمایش لحظه‌ای وضعیت صف آفلاین (فوق برنامه در ناحیهٔ بنر آفلاین — گوشهٔ
 * پایین‌چپ، بالای OfflineBanner):
 *   ✓ همه همگام شد          (پس از تخلیهٔ موفق — محو خودکار)
 *   ⏳ N در صف همگام‌سازی    (کلیک → همگام‌سازی فوری)
 *   ⟳ در حال همگام‌سازی…
 *   ⚠ N تعارض — بررسی کنید  (فاکتور آفلاین 409 خورده — بررسی دستی)
 * شمارندهٔ «در صف» مجموع دو صف است: موتور جدید (ofogh-offline) + صف
 * قدیمی (hoosh-offline از use-offline-sync) تا کاربر همیشه عدد واقعی ببیند.
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, RefreshCw, Clock, AlertTriangle } from "lucide-react";
import { toPersianDigits } from "@/lib/persian";
import { getOfflineCounts } from "@/lib/offline/invoice-offline";
import { OFFLINE_EVENTS, syncOutbox } from "@/lib/offline/sync-engine";
import { countLegacyPending } from "@/hooks/use-offline-sync";

type BadgeMode = "hidden" | "synced" | "pending" | "syncing" | "conflict";

export interface SyncStatusState {
  isOnline: boolean;
  syncing: boolean;
  pending: number; // مجموع صف جدید + صف قدیمی
  conflicts: number;
  mode: BadgeMode;
}

/** هوک وضعیت — هم توسط بج مصرف می‌شود هم قابل استفاده در UIهای دیگر */
export function useSyncStatus(): SyncStatusState & { syncNow: () => void } {
  const [isOnline, setIsOnline] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [pendingNew, setPendingNew] = React.useState(0);
  const [pendingLegacy, setPendingLegacy] = React.useState(0);
  const [conflicts, setConflicts] = React.useState(0);

  const refresh = React.useCallback(async () => {
    try {
      const [counts, legacy] = await Promise.all([
        getOfflineCounts(),
        countLegacyPending().catch(() => 0),
      ]);
      setPendingNew(counts.outbox + counts.draftsPending);
      setConflicts(counts.conflicts);
      setPendingLegacy(legacy ?? 0);
    } catch {
      /* IDB در دسترس نیست */
    }
  }, []);

  // وضعیت آنلاین + رویدادها + نظرسنجی سبک ۳۰ ثانیه‌ای (پشتیبان)
  React.useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    const onOutboxChanged = () => void refresh();
    const onSyncDoneEvt = () => void refresh();
    const onLegacyFlush = () => void refresh();
    updateOnline();
    void refresh();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener(OFFLINE_EVENTS.outboxChanged, onOutboxChanged);
    window.addEventListener(OFFLINE_EVENTS.syncDone, onSyncDoneEvt);
    window.addEventListener("hoosh:sync-flush", onLegacyFlush);
    // R28-12 — الگوی notification-center: polling در تب مخفی کاملاً متوقف و
    // با بازگشت به تب فعال، بلافاصله یک refresh + شروع مجدد
    let iv: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (!iv) iv = setInterval(() => void refresh(), 30_000);
    };
    const stopPolling = () => {
      if (iv) {
        clearInterval(iv);
        iv = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        startPolling();
      } else {
        stopPolling();
      }
    };
    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener(OFFLINE_EVENTS.outboxChanged, onOutboxChanged);
      window.removeEventListener(OFFLINE_EVENTS.syncDone, onSyncDoneEvt);
      window.removeEventListener("hoosh:sync-flush", onLegacyFlush);
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  // syncing از رویدادهای موتور (حتی وقتی تخلیه از جای دیگری شروع شده)
  React.useEffect(() => {
    const onStart = () => setSyncing(true);
    const onDone = () => {
      setSyncing(false);
      void refresh();
    };
    window.addEventListener(OFFLINE_EVENTS.syncStart, onStart);
    window.addEventListener(OFFLINE_EVENTS.syncDone, onDone);
    return () => {
      window.removeEventListener(OFFLINE_EVENTS.syncStart, onStart);
      window.removeEventListener(OFFLINE_EVENTS.syncDone, onDone);
    };
  }, [refresh]);

  const syncNow = React.useCallback(() => {
    void (async () => {
      setSyncing(true);
      try {
        await syncOutbox();
      } finally {
        setSyncing(false);
        void refresh();
      }
    })();
  }, [refresh]);

  const pending = pendingNew + pendingLegacy;

  const mode: BadgeMode = React.useMemo(() => {
    if (conflicts > 0) return "conflict";
    if (syncing) return "syncing";
    if (pending > 0) return "pending";
    return "hidden"; // حالت synced با ماشین حالت داخلی بج مدیریت می‌شود
  }, [conflicts, syncing, pending]);

  return { isOnline, syncing, pending, conflicts, mode, syncNow };
}

/**
 * SyncStatusBadge — بج شناور. R26: اتمام موفق همگام‌سازی فقط با «یک توست»
 * از sw-register («همگام‌سازی آفلاین انجام شد») اعلام می‌شود؛ بج دیگر حالت
 * جداگانهٔ «همه همگام شد» ندارد و پس از تخلیه بی‌صدا محو می‌شود.
 * نمایش فقط برای وضعیت‌های قابل‌اقدام: صف در انتظار / در حال ارسال / تعارض.
 */
export function SyncStatusBadge() {
  const { mode, pending, conflicts, syncNow } = useSyncStatus();
  const effectiveMode: BadgeMode = mode;
  const visible = effectiveMode !== "hidden";

  const cfg: Record<
    Exclude<BadgeMode, "hidden">,
    { icon: React.ReactNode; box: string; text: string; onClick?: () => void }
  > = {
    synced: {
      // نگه داشته شده برای سازگاری تایپ — R26: دیگر نمایش داده نمی‌شود
      icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
      box:
        "bg-emerald-50/95 dark:bg-emerald-950/85 border-emerald-200/80 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200",
      text: "همه همگام شد",
    },
    pending: {
      icon: <Clock className="h-3.5 w-3.5" aria-hidden="true" />,
      box:
        "bg-amber-50/95 dark:bg-amber-950/85 border-amber-200/80 dark:border-amber-800/60 text-amber-800 dark:text-amber-200",
      text: `${toPersianDigits(pending)} در صف همگام‌سازی`,
      onClick: syncNow,
    },
    syncing: {
      icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />,
      box:
        "bg-emerald-50/95 dark:bg-emerald-950/85 border-emerald-200/80 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200",
      text: "در حال همگام‌سازی…",
    },
    conflict: {
      icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
      box:
        "bg-orange-50/95 dark:bg-orange-950/85 border-orange-200/80 dark:border-orange-800/60 text-orange-800 dark:text-orange-200",
      text: `${toPersianDigits(conflicts)} تعارض — بررسی کنید`,
      onClick: syncNow,
    },
  };

  const styles = cfg[effectiveMode as Exclude<BadgeMode, "hidden">];

  return (
    <AnimatePresence>
      {visible && styles && (
        <motion.div
          initial={{ y: 16, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 16, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          className="fixed bottom-[calc(7.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-[3.75rem] left-4 z-[60] pointer-events-none print:hidden"
          role="status"
          aria-live="polite"
        >
          <button
            type="button"
            onClick={styles.onClick}
            aria-label={styles.text}
            className={`pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border px-3.5 py-1.5 shadow-lg shadow-black/5 backdrop-blur-md transition-all ${
              styles.box
            } ${styles.onClick ? "cursor-pointer hover:shadow-md" : "cursor-default"}`}
          >
            {styles.icon}
            <span dir="rtl" className="whitespace-nowrap text-[11px] font-bold leading-tight">
              {styles.text}
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SyncStatusBadge;
