/**
 * افق پلاس — Sentry Error Boundary
 * React Error Boundary که خطاهای رندر را به Sentry ارسال می‌کند
 *
 * @example
 * <SentryErrorBoundary fallback={<ErrorFallback />}>
 * <YourComponent />
 * </SentryErrorBoundary>
 */

"use client";

import * as React from "react";
import {
        isChunkLoadError,
        serverHealthy,
        waitForServer,
        chunkReloadCount,
        bumpChunkReloadCount,
        resetChunkReloadCount,
        claimChunkReloadSlot,
        releaseChunkReloadSlot,
        MAX_CHUNK_AUTO_RELOADS,
} from "@/components/ux/chunk-recovery";

// FIX(compile-memory): ارسال به Sentry از import پویا انجام می‌شود — گراف
// کامپایل صفحه ~۹ پکیج @sentry را ندارد مگر واقعاً خطایی رخ دهد (و DSN باشد).
// بدون DSN همهٔ فراخوانی‌ها no-op ایمن هستند.
let sentryLib: typeof import("@/lib/sentry") | null = null;
let sentryTried = false;
async function ensureSentry(): Promise<typeof import("@/lib/sentry") | null> {
 if (sentryTried) return sentryLib;
 sentryTried = true;
 if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return null; // بدون DSN — no-op
 try {
 sentryLib = await import("@/lib/sentry");
 } catch {
 sentryLib = null;
 }
 return sentryLib;
}

/** ارسال خطا به Sentry (بدون DSN → no-op) */
async function captureErrorDynamic(error: unknown, context?: Record<string, unknown>) {
 const lib = await ensureSentry();
 if (lib) lib.captureError(error instanceof Error ? error : new Error(String(error)), context);
}

/** ثبت breadcrumb (بدون DSN → no-op) */
async function addBreadcrumbDynamic(breadcrumb: Record<string, unknown>) {
 const lib = await ensureSentry();
 if (lib) lib.addBreadcrumb(breadcrumb as Parameters<typeof lib.addBreadcrumb>[0]);
}

interface SentryErrorBoundaryProps {
 children: React.ReactNode;
 fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
 /** نام کامپوننت برای context بهتر در Sentry */
 componentName?: string;
 /** داده‌ی اضافی برای ارسال به Sentry */
 additionalData?: Record<string, unknown>;
 /** Callback در صورت وقوع خطا */
 onError?: (error: Error, componentStack: string | null) => void;
 /** Callback هنگام reset */
 onReset?: () => void;
}

interface SentryErrorBoundaryState {
 hasError: boolean;
 error: Error | null;
}

/* ============================================================================
 * ChunkAutoRecovery — بازیابی خودکار خطای ChunkLoadError (رفع باگ بن‌بست)
 * ============================================================================
 * باگ بحرانی (بازتولیدشده): کلیک روی «فروشگاه آنلاین حرفه‌ای» در پنل کاربر،
 * بعد از ری‌استارت سرور / تب stale، خطای ChunkLoadError می‌داد و همین مرزِ خطا
 * صفحهٔ بن‌بست «خطایی رخ داد» نشان می‌داد — در حالی که فقط یک reload بعد از
 * در دسترس شدن سرور کافی است. این UI فشرده به‌جای بن‌بست:
 *  ۱) «در حال بروزرسانی خودکار…» با اسپینر نشان می‌دهد
 *  ۲) منتظر سلامت سرور می‌ماند (HEAD سبک، حداکثر ~۹۰ ثانیه)
 *  ۳) به‌محض پاسخ سرور reload می‌کند
 *  ۴) گارد حلقه: یک‌بار در عمر صفحه + حداکثر ۳ بار در نشست (sessionStorage)
 *  ۵) دکمهٔ دستی همیشه هست (کلیک کاربر هرگز حلقه نمی‌سازد)
 *
 * نکته: استایل‌ها inline هستند چون ممکن است خودِ چانکِ CSS هم لود نشده باشد.
 * ============================================================================ */
function ChunkAutoRecovery() {
        const [phase, setPhase] = React.useState<
                "checking" | "waiting" | "failed" | "exhausted" | "deferred"
        >("checking");
        const startedRef = React.useRef(false);

        React.useEffect(() => {
                if (startedRef.current) return;
                startedRef.current = true;

                // سقف نشست — جلوگیری از حلقهٔ reload بی‌نهایت (مثلاً HTML کش‌شدهٔ قدیمی)
                if (chunkReloadCount() >= MAX_CHUNK_AUTO_RELOADS) {
                        setPhase("exhausted");
                        return;
                }
                // فقط یک فلوی recovery در هر بارگذاری صفحه (بین چند boundary همزمان)
                if (!claimChunkReloadSlot()) {
                        setPhase("deferred"); // فلوی دیگری (retryLazy/ModuleLoadError) صاحب reload است
                        return;
                }

                let cancelled = false;
                const run = async () => {
                        if (await serverHealthy()) {
                                if (!cancelled) {
                                        bumpChunkReloadCount();
                                        window.location.reload();
                                }
                                return;
                        }
                        if (cancelled) return;
                        setPhase("waiting");
                        const ok = await waitForServer(90_000);
                        if (cancelled) return;
                        if (ok) {
                                bumpChunkReloadCount();
                                window.location.reload();
                        } else {
                                // سرور بعد از ~۹۰ ثانیه هم نیامد — اسلات آزاد تا تلاش بعدی ممکن باشد
                                releaseChunkReloadSlot();
                                setPhase("failed");
                        }
                };
                // کمی تأخیر تا UI قبل از reloadِ احتمالی رندر شود
                const t = setTimeout(() => void run(), 700);
                return () => {
                        cancelled = true;
                        clearTimeout(t);
                };
        }, []);

        const statusText =
                phase === "waiting"
                        ? "در انتظار سرور… (تا ۹۰ ثانیه صبر می‌کنیم)"
                        : phase === "failed"
                                ? "سرور فعلاً در دسترس نیست — دکمهٔ زیر را امتحان کنید."
                                : phase === "exhausted"
                                        ? "چند بار به‌صورت خودکار تلاش کردیم. لطفاً دستی بارگذاری مجدد کنید."
                                        : phase === "deferred"
                                                ? "فرایند بازیابی در جریان است…"
                                                : "در حال بررسی اتصال به سرور…";

        return (
                <div
                        role="status"
                        aria-live="polite"
                        dir="rtl"
                        style={{
                                minHeight: "100vh",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "1.5rem",
                                background: "var(--background, #f7f9fb)",
                                color: "var(--foreground, #17212b)",
                                fontFamily: "inherit",
                        }}
                >
                        <style
                                dangerouslySetInnerHTML={{
                                        __html:
                                        "@keyframes ofogh-err-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.ofogh-err-spin{animation:none}}",
                                }}
                        />
                        <div
                                style={{
                                        maxWidth: "380px",
                                        width: "100%",
                                        textAlign: "center",
                                        padding: "1.75rem 1.5rem",
                                        borderRadius: "1rem",
                                        border: "1px solid rgba(16,185,129,.28)",
                                        background: "var(--card, #ffffff)",
                                        boxShadow: "0 10px 34px -12px rgba(16,185,129,.22)",
                                }}
                        >
                                <div
                                        className="ofogh-err-spin"
                                        style={{
                                                width: "40px",
                                                height: "40px",
                                                margin: "0 auto 1rem",
                                                borderRadius: "50%",
                                                border: "3px solid rgba(20,184,166,.18)",
                                                borderTopColor: "#10b981",
                                                animation: "ofogh-err-spin .8s linear infinite",
                                        }}
                                />
                                <h2
                                                style={{
                                                        fontSize: "1rem",
                                                        fontWeight: 800,
                                                        margin: "0 0 .5rem",
                                                }}
                                        >
                                        در حال بروزرسانی خودکار…
                                </h2>
                                <p
                                                style={{
                                                        fontSize: ".875rem",
                                                        lineHeight: 1.9,
                                                        opacity: 0.75,
                                                        margin: "0 0 .75rem",
                                                }}
                                        >
                                        نسخهٔ تازهٔ «افق پلاس» در حال آماده‌سازی است. صفحه به‌محض آماده‌شدن سرور،
                                        خودش بازگشایی می‌شود — نیازی به کاری نیست.
                                </p>
                                <p
                                                style={{
                                                        fontSize: ".75rem",
                                                        opacity: 0.6,
                                                        margin: "0 0 1.25rem",
                                                }}
                                        >
                                        {statusText}
                                </p>
                                <button
                                        onClick={() => {
                                                // کلیک کاربر = همیشه مجاز؛ شمارندهٔ خودکار ریست می‌شود
                                                resetChunkReloadCount();
                                                window.location.reload();
                                        }}
                                        style={{
                                                padding: ".5rem 1.25rem",
                                                backgroundColor: "#10b981",
                                                color: "#ffffff",
                                                border: "none",
                                                borderRadius: ".5rem",
                                                cursor: "pointer",
                                                fontSize: ".8125rem",
                                                fontWeight: 700,
                                        }}
                                >
                                        بارگذاری مجدد صفحه
                                </button>
                        </div>
                </div>
        );
}

export class SentryErrorBoundary extends React.Component<
 SentryErrorBoundaryProps,
 SentryErrorBoundaryState
> {
 constructor(props: SentryErrorBoundaryProps) {
 super(props);
 this.state = { hasError: false, error: null };
 }

 static getDerivedStateFromError(error: Error): SentryErrorBoundaryState {
 return { hasError: true, error };
 }

 componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
 const { componentName, additionalData, onError } = this.props;

 // ثبت breadcrumb برای context بهتر
 void addBreadcrumbDynamic({
 message: `Error in ${componentName?? "component"}`,
 category: "error-boundary",
 level: "error",
 data: {
 componentStack: errorInfo.componentStack,
...additionalData,
 },
 });

 // ارسال به Sentry با context کامل (پویا — بدون DSN no-op)
 void captureErrorDynamic(error, {
 component: componentName?? "unknown",
 componentStack: errorInfo.componentStack,
...additionalData,
 });

 // Callback سفارشی
 if (onError) {
 onError(error, errorInfo.componentStack?? null);
 }
 }

 reset = (): void => {
 this.setState({ hasError: false, error: null });
 if (this.props.onReset) {
 this.props.onReset();
 }
 };

 render(): React.ReactNode {
 const { hasError, error } = this.state;
 const { children, fallback } = this.props;

 if (hasError && error) {
 // FIX(ChunkLoadError): خطای چانک بن‌بست نیست — نسخهٔ جدید روی سرور است و
 // فقط یک reload بعد از در دسترس شدن سرور لازم است. فقط وقتی consumer
 // خودش fallback نگذاشته (مرز ریشه در app-providers) دخالت می‌کنیم.
 if (fallback === undefined && isChunkLoadError(error)) {
 return <ChunkAutoRecovery />;
 }
 if (typeof fallback === "function") {
 return (fallback as (e: Error, r: () => void) => React.ReactNode)(
 error,
 this.reset
 );
 }
 if (fallback!== undefined) {
 return fallback;
 }
 // Default fallback UI
 return (
 <div
 role="alert"
 dir="rtl"
 style={{
 padding: "1.5rem",
 border: "1px solid #fecaca",
 borderRadius: "0.5rem",
 backgroundColor: "#fef2f2",
 color: "#991b1b",
 fontFamily: "inherit",
 textAlign: "center",
 }}
 >
 <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
 خطایی رخ داد
 </h2>
 <p style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
 تیم فنی از این مشکل مطلع شده است. لطفاً صفحه را مجدداً بارگذاری کنید.
 </p>
 <button
 onClick={this.reset}
 style={{
 padding: "0.5rem 1rem",
 backgroundColor: "#dc2626",
 color: "white",
 border: "none",
 borderRadius: "0.375rem",
 cursor: "pointer",
 fontSize: "0.875rem",
 }}
 >
 تلاش مجدد
 </button>
 </div>
 );
 }

 return children;
 }
}

/**
 * Hook برای ارسال خطاهای دستی به Sentry از کامپوننت‌های تابعی
 *
 * @example
 * const captureError = useSentryError();
 * try {... } catch (e) { captureError(e, { context: "data" }); }
 */
export function useSentryError() {
 return (error: Error, context?: Record<string, unknown>) => {
 void captureErrorDynamic(error, context);
 };
}
