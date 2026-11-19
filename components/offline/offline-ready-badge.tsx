"use client";

/**
 * ============ components/offline/offline-ready-badge.tsx ============
 * R26 — بج یک‌بارهٔ «نسخهٔ آفلاین آماده شد ✓»
 * ============================================================================
 * درخواست مالک: بار اول که کاربر وارد پنل می‌شود همهٔ اجزای پنل دانلود شود
 * تا آفلاین هیچ‌چیز نشکند. این بج فقط «یک‌بار» بعد از پایان موفق دانلودِ
 * کامل پنل (warmPanelForOffline → PANEL_WARM_DONE_EVENT) به‌صورت ظریف
 * گوشهٔ پایین نشان داده می‌شود و خودش محو می‌شود.
 *
 * توجه: این «هشدار آفلاین» نیست — حالت آفلاین هیچ نشانگری ندارد (درخواست
 * مالک: حتی هشدار آفلاین هم نباید ظاهر شود). این بج صرفاً پیام مثبتِ
 * «آماده‌شدن نسخهٔ آفلاین» است.
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { PANEL_WARM_DONE_EVENT } from "@/lib/offline/warm-panel";

const SESSION_FLAG = "ofogh-offline-ready-shown";
const AUTO_HIDE_MS = 4500;

export function OfflineReadyBadge() {
  const [visible, setVisible] = React.useState(false);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    let shownThisSession = false;
    try {
      shownThisSession = sessionStorage.getItem(SESSION_FLAG) === "1";
    } catch {
      /* sessionStorage در دسترس نیست — فقط رویداد */
    }

    const show = () => {
      if (shownThisSession) return;
      shownThisSession = true;
      try {
        sessionStorage.setItem(SESSION_FLAG, "1");
      } catch {
        /* ignore */
      }
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    };

    window.addEventListener(PANEL_WARM_DONE_EVENT, show);
    return () => {
      window.removeEventListener(PANEL_WARM_DONE_EVENT, show);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 16, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 16, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          className="fixed bottom-[calc(10.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-[6.75rem] left-4 z-[60] pointer-events-none print:hidden"
          role="status"
          aria-live="polite"
        >
          <div
            dir="rtl"
            className="flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/95 px-3.5 py-1.5 shadow-lg shadow-black/5 backdrop-blur-md dark:border-emerald-800/60 dark:bg-emerald-950/85"
          >
            <CheckCircle2
              className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300"
              aria-hidden="true"
            />
            <span className="whitespace-nowrap text-[11px] font-bold leading-tight text-emerald-800 dark:text-emerald-200">
              نسخهٔ آفلاین آماده شد ✓
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default OfflineReadyBadge;
