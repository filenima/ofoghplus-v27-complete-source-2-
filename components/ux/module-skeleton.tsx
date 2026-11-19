"use client";

import * as React from "react";

/**
 * ModuleSkeleton — تجربهٔ بارگذاری برندشدهٔ «افق پلاس» (بازطراحی کامل)
 * ============================================================================
 * جایگزین اسکلتون خاکستری قبلی. ساختار = «پوستهٔ ماژول» تا کاربر حس کند
 * صفحه همان لحظه شکل گرفته (perceptual performance):
 *
 *  ۱) نوار پیشرفت بالای صفحه (سبک nprogress/یوتیوب) — گرادیان زمرد→فیروزه‌ای→کهربایی
 *  ۲) نشان برند: حلقهٔ مداری (comet) با گرادیان برند + نشان «افق» (خورشیدِ روی خط افق)
 *  ۳) پیام‌های فارسی چرخشی («در حال آماده‌سازی ماژول…» و…) — هر ~۲.۴ ثانیه، فقط با CSS
 *  ۴) اسکلتون هدر ماژول + ۴ کارت KPI + ۲ نمودار + جدول — مطابق چیدمان واقعی ماژول‌ها
 *
 * قواعد کارایی (کاربر روی لپ‌تاپ ضعیف):
 *  - همهٔ انیمیشن‌ها فقط transform/opacity (+ شیمر background-position روی بلوک‌ها)
 *  - بدون هیچ JS در انیمیشن؛ کل کامپوننت < 5KB
 *  - prefers-reduced-motion → مدار/سوئیپ/پالس خاموش، فقط اولین پیام می‌ماند
 *
 * @example
 * <React.Suspense fallback={<ModuleSkeleton />}>
 * <Invoices />
 * </React.Suspense>
 */

/** پیام‌های چرخشی — هر ~۲.۴ ثانیه یکی (چرخهٔ کامل ۱۲ ثانیه، فقط با CSS) */
const LOADING_MESSAGES = [
        "در حال آماده‌سازی ماژول…",
        "اتصال به سامانه مودیان…",
        "بررسی داده‌های مالی…",
        "همگام‌سازی انبار و فروش…",
        "چند لحظه دیگر آماده است…",
] as const;

const MSG_STEP = 2.4; // ثانیه — باید با ofogh-ld-cycle (12s / 5) هم‌خوان بماند

/** CSS ایزولهٔ لودر — transform/opacity فقط؛ سبک برای GPU */
const LOADER_CSS = `
@keyframes ofogh-ld-sweep{0%{transform:translateX(320%)}100%{transform:translateX(-320%)}}
@keyframes ofogh-ld-orbit{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes ofogh-ld-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
@keyframes ofogh-ld-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
@keyframes ofogh-ld-cycle{0%,4%{opacity:0;transform:translateY(5px)}8%,20%{opacity:1;transform:translateY(0)}24%,100%{opacity:0;transform:translateY(-5px)}}
.ofogh-ld-sweep{animation:ofogh-ld-sweep 1.4s cubic-bezier(.45,.05,.55,.95) infinite;will-change:transform}
.ofogh-ld-orbit{animation:ofogh-ld-orbit 2.4s linear infinite;will-change:transform}
.ofogh-ld-breathe{animation:ofogh-ld-breathe 2.1s ease-in-out infinite}
.ofogh-ld-sk{background:linear-gradient(90deg,rgba(16,185,129,.07) 25%,rgba(20,184,166,.15) 50%,rgba(16,185,129,.07) 75%);background-size:200% 100%;animation:ofogh-ld-shimmer 1.6s linear infinite;border-radius:.5rem}
.dark .ofogh-ld-sk{background:linear-gradient(90deg,rgba(16,185,129,.1) 25%,rgba(20,184,166,.19) 50%,rgba(16,185,129,.1) 75%);background-size:200% 100%}
.ofogh-ld-msg{opacity:0;animation:ofogh-ld-cycle 12s linear infinite}
@media (prefers-reduced-motion:reduce){
.ofogh-ld-sweep{animation:none;opacity:.5}
.ofogh-ld-orbit,.ofogh-ld-breathe,.ofogh-ld-msg,.ofogh-ld-sk{animation:none}
.ofogh-ld-msg{opacity:0}
.ofogh-ld-msg:first-child{opacity:1;transform:none}
}`;

/** نشان «افق» — خورشید در حال طلوع (زمرد) روی خط افق (کهربایی) */
function HorizonMark({ size = 20 }: { size?: number }) {
        return (
                <svg
                        width={size}
                        height={size}
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                        focusable="false"
                >
                        <path
                                d="M4.5 15.5a7.5 7.5 0 0 1 15 0"
                                stroke="#10b981"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                        />
                        <path
                                d="M2.5 19.5h19"
                                stroke="#f59e0b"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                        />
                </svg>
        );
}

/** حلقهٔ مداری برند — دنباله‌دارِ گرادیانی زمرد→فیروزه‌ای→کهربایی */
function BrandOrbit() {
        return (
                <div className="relative h-11 w-11 shrink-0" aria-hidden="true">
                        {/* مدار کم‌رنگ ثابت */}
                        <div className="absolute inset-0 rounded-full border-2 border-emerald-500/15" />
                        {/* دنباله‌دارِ چرخان (فقط rotate — GPU) */}
                        <div
                                className="ofogh-ld-orbit absolute inset-0 rounded-full"
                                style={{
                                        background:
                                                "conic-gradient(from 0deg, rgba(16,185,129,0) 0deg, rgba(16,185,129,0) 235deg, #f59e0b 292deg, #14b8a6 330deg, #10b981 360deg)",
                                }}
                        />
                        {/* مرکز حلقه — رنگ پس‌زمینهٔ تم + نشان افق با تنفس نرم */}
                        <div
                                className="ofogh-ld-breathe absolute inset-[4px] flex items-center justify-center rounded-full"
                                style={{ background: "var(--background)" }}
                        >
                                <HorizonMark size={19} />
                        </div>
                </div>
        );
}

export function ModuleSkeleton() {
        return (
                <div
                        className="animate-fade-in-up"
                        aria-busy="true"
                        aria-live="polite"
                        role="status"
                        aria-label="در حال بارگذاری ماژول..."
                        dir="rtl"
                >
                        <style dangerouslySetInnerHTML={{ __html: LOADER_CSS }} />

                        {/* ۱) نوار پیشرفت بالای صفحه — سبک nprogress */}
                        <div
                                className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden"
                                aria-hidden="true"
                        >
                                <div
                                        className="ofogh-ld-sweep absolute left-0 top-0 h-full w-[38%] rounded-full"
                                        style={{
                                                background:
                                                        "linear-gradient(90deg, rgba(16,185,129,0), #10b981, #14b8a6, #f59e0b)",
                                                boxShadow: "0 0 10px rgba(20,184,166,.6)",
                                        }}
                                />
                        </div>

                        <div className="space-y-4 lg:space-y-5">
                                {/* ۲+۳) نشان برند + پیام‌های چرخشی فارسی */}
                                <div className="flex items-center gap-3.5 select-none">
                                        <BrandOrbit />
                                        <div className="min-w-0">
                                                <div className="text-[13px] font-extrabold leading-5 tracking-tight text-foreground">
                                                        افق <span className="text-emerald-600 dark:text-emerald-400">پلاس</span>
                                                </div>
                                                <div className="relative mt-0.5 h-4 min-w-[170px] overflow-hidden">
                                                        {LOADING_MESSAGES.map((msg, i) => (
                                                                <span
                                                                        key={msg}
                                                                        className="ofogh-ld-msg absolute inset-x-0 top-0 whitespace-nowrap text-xs leading-4 text-muted-foreground"
                                                                        style={{ animationDelay: `${(i * MSG_STEP).toFixed(1)}s` }}
                                                                >
                                                                        {msg}
                                                                </span>
                                                        ))}
                                                </div>
                                        </div>
                                </div>

                                {/* ۴) هدر ماژول — آیکن + عنوان + دکمه‌های عملیات */}
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                                <div className="ofogh-ld-sk h-12 w-12 rounded-xl" />
                                                <div className="space-y-2">
                                                        <div className="ofogh-ld-sk h-5 w-44 rounded-md" />
                                                        <div className="ofogh-ld-sk h-3 w-56 max-w-[52vw] rounded" />
                                                </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                                <div className="ofogh-ld-sk h-9 w-28 rounded-lg" />
                                                <div className="ofogh-ld-sk h-9 w-9 rounded-lg" />
                                                <div className="ofogh-ld-sk h-9 w-9 rounded-lg" />
                                        </div>
                                </div>

                                {/* ۴ کارت KPI */}
                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
                                        {Array.from({ length: 4 }).map((_, i) => (
                                                <div
                                                        key={i}
                                                        className="rounded-xl border border-border bg-card p-4 lg:p-5"
                                                >
                                                        <div className="mb-3 flex items-center justify-between">
                                                                <div className="ofogh-ld-sk h-9 w-9 rounded-lg" />
                                                                <div className="ofogh-ld-sk h-5 w-12 rounded-full" />
                                                        </div>
                                                        <div className="ofogh-ld-sk mb-2 h-3 w-16 rounded" />
                                                        <div className="ofogh-ld-sk h-6 w-24 rounded" />
                                                </div>
                                        ))}
                                </div>

                                {/* ۲ نمودار */}
                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
                                        <div className="rounded-xl border border-border bg-card p-4 lg:p-5">
                                                <div className="mb-4 flex items-center justify-between">
                                                        <div className="ofogh-ld-sk h-4 w-32 rounded" />
                                                        <div className="ofogh-ld-sk h-6 w-6 rounded" />
                                                </div>
                                                {/* نمودار سکه‌ای (donut) */}
                                                <div className="flex items-center justify-center py-4">
                                                        <div className="ofogh-ld-sk h-40 w-40 rounded-full" />
                                                </div>
                                                <div className="mt-2 flex items-center justify-center gap-4">
                                                        <div className="ofogh-ld-sk h-3 w-20 rounded" />
                                                        <div className="ofogh-ld-sk h-3 w-20 rounded" />
                                                </div>
                                        </div>
                                        <div className="rounded-xl border border-border bg-card p-4 lg:p-5">
                                                <div className="mb-4 flex items-center justify-between">
                                                        <div className="ofogh-ld-sk h-4 w-32 rounded" />
                                                        <div className="ofogh-ld-sk h-6 w-6 rounded" />
                                                </div>
                                                {/* نمودار خطی با میله‌ها */}
                                                <div className="flex h-40 items-end justify-between gap-2 px-2">
                                                        {Array.from({ length: 9 }).map((_, i) => (
                                                                <div
                                                                        key={i}
                                                                        className="ofogh-ld-sk flex-1 rounded-t"
                                                                        style={{ height: `${30 + ((i * 13) % 60)}%` }}
                                                                />
                                                        ))}
                                                </div>
                                                <div className="mt-3 flex items-center justify-between px-2">
                                                        {Array.from({ length: 5 }).map((_, i) => (
                                                                <div key={i} className="ofogh-ld-sk h-2 w-10 rounded" />
                                                        ))}
                                                </div>
                                        </div>
                                </div>

                                {/* جدول */}
                                <div className="rounded-xl border border-border bg-card p-4 lg:p-5">
                                        <div className="mb-4 flex items-center justify-between">
                                                <div className="ofogh-ld-sk h-4 w-40 rounded" />
                                                <div className="ofogh-ld-sk h-8 w-24 rounded-lg" />
                                        </div>
                                        <div className="space-y-2">
                                                {/* هدر */}
                                                <div className="grid grid-cols-6 gap-3 border-b border-border pb-2">
                                                        {Array.from({ length: 6 }).map((_, i) => (
                                                                <div key={i} className="ofogh-ld-sk h-3 rounded" />
                                                        ))}
                                                </div>
                                                {/* ردیف‌ها */}
                                                {Array.from({ length: 6 }).map((_, row) => (
                                                        <div key={row} className="grid grid-cols-6 gap-3 py-2.5">
                                                                {Array.from({ length: 6 }).map((_, col) => (
                                                                        <div
                                                                                key={col}
                                                                                className="ofogh-ld-sk h-3 rounded"
                                                                                style={{ width: `${50 + ((col + row * 7) % 40)}%` }}
                                                                        />
                                                                ))}
                                                        </div>
                                                ))}
                                        </div>
                                </div>
                        </div>

                        <span className="sr-only">در حال بارگذاری ماژول...</span>
                </div>
        );
}

export default ModuleSkeleton;
