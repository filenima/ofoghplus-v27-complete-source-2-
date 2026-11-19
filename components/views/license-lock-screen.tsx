"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Lock, Sparkles, ArrowLeft, RefreshCw, CreditCard, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toPersianDigits, toJalali, formatToman } from "@/lib/persian";

interface OverdueInstallmentInfo {
  id: string;
  seq: number;
  installmentCount: number;
  amountToman: number;
  dueDateJalali: string;
  planName: string;
}

interface LicenseLockScreenProps {
  licenseInfo: {
    plan: string;
    endDate: string | null;
    status: string;
  } | null;
  /** v41: قسط معوق (در صورت قفل‌شدن به‌خاطر اقساط) — دکمهٔ پرداخت فوری */
  overdueInstallment?: OverdueInstallmentInfo | null;
  /** توکن کاربر برای فراخوانی API پرداخت قسط */
  token?: string | null;
  onRenew: () => void;
  onLogout: () => void;
  /** پس از پرداخت موفق (بازگشت از درگاه) — رفرش وضعیت لایسنس */
  onRecheck?: () => void;
}

export function LicenseLockScreen({
  licenseInfo,
  overdueInstallment,
  token,
  onRenew,
  onLogout,
  onRecheck,
}: LicenseLockScreenProps) {
  const endDate = licenseInfo?.endDate ? toJalali(new Date(licenseInfo.endDate)) : null;
  const [paying, setPaying] = React.useState(false);
  const [payError, setPayError] = React.useState<string | null>(null);

  // ── v41: پرداخت فوری قسط معوق از همین صفحهٔ قفل ──
  const handlePayInstallment = React.useCallback(async () => {
    if (!overdueInstallment || !token) return;
    setPaying(true);
    setPayError(null);
    try {
      const res = await fetch(
        `/api/payment/installments/${overdueInstallment.id}/pay`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            callbackUrl: `${window.location.origin}/api/integrations/payment/verify`,
          }),
        }
      );
      const data = (await res.json()) as {
        success?: boolean;
        gatewayUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.success || !data.gatewayUrl) {
        throw new Error(data.error || "خطا در ایجاد درخواست پرداخت قسط");
      }
      // انتقال به درگاه — پس از بازگشت، onRecheck وضعیت را دوباره می‌سنجد
      window.location.href = data.gatewayUrl;
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "خطای ناشناخته در پرداخت");
      setPaying(false);
    }
  }, [overdueInstallment, token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="absolute inset-0 grid-pattern opacity-30" aria-hidden="true" />
      <div className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-primary/10 blur-3xl orb-float" />
      <div className="absolute bottom-1/4 left-1/4 h-48 w-48 rounded-full bg-primary/5 blur-3xl orb-float" style={{ animationDelay: "7s" }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        <Card className="overflow-hidden border-border/60 shadow-2xl">
          {/* هدر */}
          <div
            className={`relative px-6 py-10 text-center text-primary-foreground ${
              overdueInstallment
                ? "bg-gradient-to-br from-red-600 via-red-600 to-red-500"
                : "bg-gradient-to-br from-primary via-primary to-primary/80"
            }`}
          >
            <div className="absolute inset-0 opacity-20" aria-hidden="true">
              <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-white/30 blur-3xl" />
            </div>
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", delay: 0.2 }}
              className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md"
            >
              <Lock className="h-8 w-8" />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="relative text-2xl font-bold"
            >
              {overdueInstallment ? "حساب شما تا پرداخت قسط قفل شده است" : "دسترسی شما محدود شده است"}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="relative mt-2 text-sm text-primary-foreground/80"
            >
              {overdueInstallment
                ? "با پرداخت همین یک قسط، حساب بلافاصله و به‌طور خودکار آزاد می‌شود"
                : "لایسنس یا دوره تریال شما به پایان رسیده است"}
            </motion.p>
          </div>

          {/* بدنه */}
          <div className="p-6 space-y-5">
            {/* v41: کارت قسط معوق — دکمهٔ پرداخت فوری */}
            {overdueInstallment && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="rounded-xl border-2 border-red-200 bg-red-50/80 p-4 space-y-3 dark:border-red-900/50 dark:bg-red-950/30"
              >
                <div className="flex items-center gap-2 text-sm font-bold text-red-700 dark:text-red-300">
                  <AlertTriangle className="h-4 w-4" />
                  قسط پرداخت‌نشده
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">قسط:</span>
                    <span className="font-medium tnum">
                      {toPersianDigits(overdueInstallment.seq)} از {toPersianDigits(overdueInstallment.installmentCount)}
                      {" — "}
                      پلن {overdueInstallment.planName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">سررسید:</span>
                    <span className="font-medium tnum">{overdueInstallment.dueDateJalali}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">مبلغ قابل پرداخت:</span>
                    <span className="text-base font-extrabold text-red-700 dark:text-red-300 tnum">
                      {formatToman(overdueInstallment.amountToman)}
                    </span>
                  </div>
                </div>
                <Button
                  className="w-full gap-2 bg-red-600 hover:bg-red-700"
                  size="lg"
                  onClick={handlePayInstallment}
                  disabled={paying}
                  style={{ animation: "pulse-shadow 2s infinite" }}
                >
                  {paying ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      در حال اتصال به درگاه…
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      پرداخت قسط و آزادسازی حساب
                    </>
                  )}
                </Button>
                {payError && (
                  <p className="text-xs leading-5 text-destructive">{payError}</p>
                )}
              </motion.div>
            )}

            {/* اطلاعات لایسنس */}
            {licenseInfo && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">پلن:</span>
                  <span className="font-medium">
                    {licenseInfo.plan === "free" ? "رایگان" :
                     licenseInfo.plan === "starter" ? "رایگان" :
                     licenseInfo.plan === "basic" ? "پایه" :
                     licenseInfo.plan === "business" ? "حرفه‌ای" :
                     licenseInfo.plan === "pro" ? "حرفه‌ای" :
                     licenseInfo.plan === "enterprise" ? "سازمانی" :
                     licenseInfo.plan === "accountant" ? "حسابداران" :
                     licenseInfo.plan}
                  </span>
                </div>
                {endDate && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">تاریخ انقضا:</span>
                    <span className="font-medium tnum">{endDate}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">وضعیت:</span>
                  <span className="font-medium text-destructive">
                    {licenseInfo.status === "EXPIRED" ? "منقضی شده" :
                     licenseInfo.status === "SUSPENDED" ? "تعلیق شده" :
                     licenseInfo.status === "REVOKED" ? "ابطال شده" :
                     licenseInfo.status}
                  </span>
                </div>
              </div>
            )}

            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              {overdueInstallment
                ? "داده‌های مالی شما به‌صورت امن و کامل نگهداری می‌شود — بلافاصله پس از پرداخت، همه‌چیز دقیقاً سر جای خودش خواهد بود."
                : "برای ادامه استفاده از افق پلاس، لایسنس خود را تمدید کنید یا به پلن بالاتر ارتقا دهید. داده‌های شما به‌صورت امن نگهداری می‌شود."}
            </p>

            {/* دکمه‌ها */}
            <div className="space-y-2">
              {!overdueInstallment && (
                <Button
                  className="w-full"
                  onClick={onRenew}
                  style={{ animation: "pulse-shadow 2s infinite" }}
                >
                  <Sparkles className="h-4 w-4 me-2" />
                  تمدید لایسنس
                </Button>
              )}
              {onRecheck && (
                <Button variant="outline" className="w-full gap-2" onClick={onRecheck}>
                  <RefreshCw className="h-4 w-4" />
                  پرداخت کرده‌ام — بررسی مجدد
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={onLogout}
              >
                <ArrowLeft className="h-4 w-4 me-2" />
                بازگشت به صفحه اصلی
              </Button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              {overdueInstallment
                ? "پرداخت آنلاین امن · فعال‌سازی خودکار لحظه‌ای پس از پرداخت"
                : "برای تمدید با پشتیبانی تماس بگیرید"}
            </p>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
