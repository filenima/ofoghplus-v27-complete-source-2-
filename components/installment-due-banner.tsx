"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarClock, CreditCard, AlertTriangle, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toPersianDigits, formatToman } from "@/lib/persian";
import { useToast } from "@/hooks/use-toast";

/**
 * InstallmentDueBanner — بنر شمارش معکوس سررسید قسط لایسنس (v41)
 * ============================================================================
 * درخواست مالک: «یک هفته مونده به موقع پرداخت قسط، مثل بخش ارتقای حساب
 * که بالای هیروی پنل کاربر نمایش می‌دهد، نمایش بده و تایمر نشان بده که
 * تا ۷ روز آینده باید پرداخت بشه و یه دکمه هم باشه که قسط رو پرداخت کنن.»
 *
 * رفتار:
 *  - هر ۶۰ ثانیه وضعیت را از /api/license/status می‌گیرد (فیلد installment)
 *  - فقط وقتی قسط بازِ بعدی ≤ ۷ روز تا سررسید دارد (یا معوق شده) نمایش داده می‌شود
 *  - تایمر زندهٔ hh:mm:ss تا لحظهٔ سررسید + دکمهٔ «پرداخت قسط» → درگاه زرین‌پال
 *  - معوق: تم قرمز/destructive + متن هشدار تعلیق
 *  - بستن فقط برای جلسهٔ جاری (sessionStorage) — فردا دوباره یادآوری می‌شود
 *  - پس از پرداخت موفق (بازگشت از درگاه) بنر خودش رفرش می‌شود
 */

interface NextDueInstallment {
  id: string;
  seq: number;
  installmentCount: number;
  amountToman: number;
  dueDate: string;
  dueDateJalali: string;
  daysLeft: number;
  status: "PENDING" | "OVERDUE";
  planName: string;
  licenseSuspended: boolean;
}

interface StatusResponse {
  success?: boolean;
  data?: {
    isValid: boolean;
    isDemo?: boolean;
    installment?: NextDueInstallment | null;
  };
}

const DISMISS_KEY = "ofogh_installment_banner_dismissed_session";
const SHOW_WINDOW_DAYS = 7;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function InstallmentDueBanner({ token }: { token: string }) {
  const { toast } = useToast();
  const [inst, setInst] = React.useState<NextDueInstallment | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [paying, setPaying] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());

  // وضعیت dismissed را از sessionStorage بخوان (فقط جلسهٔ جاری)
  React.useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/license/status", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = (await res.json()) as StatusResponse;
      if (json.success && json.data) {
        setInst(json.data.installment ?? null);
      }
    } catch {
      /* شبکهٔ موقتاً قطع — بی‌صدا */
    } finally {
      setLoaded(true);
    }
  }, [token]);

  React.useEffect(() => {
    if (!token) {
      setLoaded(true);
      return;
    }
    void fetchStatus();
    const id = setInterval(() => void fetchStatus(), 60_000);
    // پس از بازگشت از درگاه پرداخت، فوراً رفرش شود
    const onFocus = () => void fetchStatus();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [token, fetchStatus]);

  // تایمر زندهٔ ثانیه‌شمار
  const dueMs = inst ? new Date(inst.dueDate).getTime() : 0;
  React.useEffect(() => {
    if (!inst) return;
    // R28-12 — در تب مخفی ثانیه‌شمار متوقف می‌ماند (رندر بی‌فایده = صفر) و
    // با بازگشت به تب، فوراً یک‌بار به‌روز می‌شود تا شمارنده عقب نماند
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setNow(Date.now());
    }, 1000);
    const onVisible = () => {
      if (!document.hidden) setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [inst, dueMs]);

  const dismiss = React.useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const handlePay = React.useCallback(async () => {
    if (!inst) return;
    setPaying(true);
    try {
      const res = await fetch(`/api/payment/installments/${inst.id}/pay`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          callbackUrl: `${window.location.origin}/api/integrations/payment/verify`,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        gatewayUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.success || !data.gatewayUrl) {
        throw new Error(data.error || "خطا در ایجاد درخواست پرداخت قسط");
      }
      toast({
        title: "انتقال به درگاه پرداخت",
        description: `قسط ${toPersianDigits(inst.seq)} از ${toPersianDigits(inst.installmentCount)} — در حال انتقال به درگاه…`,
      });
      window.location.href = data.gatewayUrl;
    } catch (e) {
      toast({
        title: "خطا در پرداخت قسط",
        description: e instanceof Error ? e.message : "خطای ناشناخته",
        variant: "destructive",
      });
      setPaying(false);
    }
  }, [inst, token, toast]);

  if (!loaded || !inst || dismissed) return null;
  // فقط در پنجرهٔ ۷ روزهٔ قبل از سررسید (یا معوق) نمایش بده
  if (inst.daysLeft > SHOW_WINDOW_DAYS) return null;

  const isOverdue = inst.status === "OVERDUE" || inst.daysLeft < 0;
  const msLeft = dueMs - now;
  const absMs = Math.abs(msLeft);
  const d = Math.floor(absMs / 86400000);
  const h = Math.floor((absMs % 86400000) / 3600000);
  const m = Math.floor((absMs % 3600000) / 60000);
  const s = Math.floor((absMs % 60000) / 1000);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className={
          isOverdue
            ? "sticky top-16 z-30 border-b border-red-300/60 bg-gradient-to-l from-red-600 via-rose-600 to-orange-600 text-white shadow-lg shadow-red-900/20"
            : "sticky top-16 z-30 border-b border-amber-300/60 bg-gradient-to-l from-amber-500 via-orange-500 to-amber-600 text-white shadow-lg shadow-amber-900/20"
        }
        role="alert"
        dir="rtl"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm ${
                isOverdue ? "animate-pulse" : ""
              }`}
            >
              {isOverdue ? (
                <AlertTriangle className="h-4.5 w-4.5" />
              ) : (
                <CalendarClock className="h-4.5 w-4.5" />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-5">
                {isOverdue
                  ? `قسط ${toPersianDigits(inst.seq)} از ${toPersianDigits(inst.installmentCount)} لایسنس معوق است — ${formatToman(inst.amountToman)}`
                  : `سررسید قسط ${toPersianDigits(inst.seq)} از ${toPersianDigits(inst.installmentCount)} لایسنس: ${inst.dueDateJalali}`}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 text-white/90">
                {isOverdue ? (
                  <span className="tnum font-semibold">
                    {d > 0 ? `${toPersianDigits(d)} روز گذشته` : ""} — برای جلوگیری از تعلیق کامل حساب، همین حالا پرداخت کنید
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 tnum font-semibold">
                    <Timer className="h-3 w-3" />
                    {d > 0 ? `${toPersianDigits(d)} روز و ` : ""}
                    {toPersianDigits(pad2(h))}:{toPersianDigits(pad2(m))}:{toPersianDigits(pad2(s))} تا سررسید
                  </span>
                )}
                <span className="opacity-80">پلن {inst.planName} · {formatToman(inst.amountToman)}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              onClick={handlePay}
              disabled={paying}
              className="h-9 gap-1.5 rounded-xl bg-white px-4 text-xs font-bold text-red-700 shadow-md transition-all hover:bg-white/90 hover:shadow-lg disabled:opacity-70"
            >
              {paying ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-700/40 border-t-red-700" />
                  در حال اتصال…
                </>
              ) : (
                <>
                  <CreditCard className="h-3.5 w-3.5" />
                  پرداخت قسط
                </>
              )}
            </Button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="بستن یادآور قسط (تا پایان این جلسه)"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
