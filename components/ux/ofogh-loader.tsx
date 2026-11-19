/**
 * OfoghLoader — لودر برند «افق پلاس» (Task 3-f)
 * ============================================================================
 * بازطراحی کامل انیمیشن بارگذاری با زبان بصری برند (زمرد/فیروزه‌ای/کهربایی):
 *
 *  ۱) حلقهٔ دوگانهٔ همگام‌شده (dual-ring) — حلقهٔ بیرونی با گرادیان
 *     زمرد→فیروزه‌ای→کهربایی ساعتگرد، حلقهٔ درونی ظریف‌تر پادساعتگرد؛
 *     هر دو با همان دورهٔ ۱.۵s → حس چرخش هماهنگ و پریمیوم
 *  ۲) نشان برند «افق» (خورشیدِ روی خط افق) در مرکز با تنفس نرم + هاله
 *  ۳) وردمارک «افق پلاس» با شیمر گرادیانی (sweep) — فقط background-position
 *  ۴) حس پیشرفت (progress feel): نوار باریکی که از راست (RTL) رشد می‌کند،
 *     آرام به ~۸۰٪ می‌رسد و محو می‌شود؛ + نوار سوئیپ بالای صفحه سبک nprogress
 *  ۵) پیام‌های فارسی چرخشی (چرخهٔ ۱۲ ثانیه، فقط CSS)
 *  ۶) هاله‌های محیطی نفس‌کشندهٔ زمرد/کهربایی (dark-mode آگاه)
 *
 * قواعد کارایی:
 *  - کامپوننت خالص و بدون state/hook → هم در Server Component (app/loading.tsx)
 *    بدون هزینهٔ hydration و هم در کلاینت (AppShellLoader) قابل استفاده است
 *  - فقط transform/opacity (+ background-position شیمر) — سبک برای GPU
 *  - prefers-reduced-motion → همهٔ انیمیشن‌ها خاموش، اولین پیام می‌ماند
 *  - بدون هیچ کتابخانهٔ JS؛ کل کامپوننت < 6KB
 *
 * @example
 * // صفحهٔ کامل (route-level):
 * <div className="flex min-h-dvh items-center justify-center bg-background"><OfoghLoader /></div>
 * // فشرده (جایگزین اسپینر ساده):
 * <OfoghLoader compact messages={["در حال بارگذاری افق پلاس…"]} />
 */

const DEFAULT_MESSAGES = [
        "در حال بارگذاری افق پلاس…",
        "آماده‌سازی داشبورد شما…",
        "بررسی امنیت نشست…",
        "دریافت اطلاعات کسب‌وکار…",
        "چند لحظه دیگر آماده است…",
] as const;

const MSG_STEP = 2.4; // ثانیه — هم‌خوان با چرخهٔ ۱۲ ثانیه‌ای ofogh-pl-cycle

/** CSS ایزوله — پیشوند یکتا ofogh-pl تا با لودرهای دیگر تداخل نکند */
const LOADER_CSS = `
@keyframes ofogh-pl-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes ofogh-pl-spin-rev{from{transform:rotate(360deg)}to{transform:rotate(0)}}
@keyframes ofogh-pl-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes ofogh-pl-glow{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:.9;transform:scale(1.14)}}
@keyframes ofogh-pl-word{from{background-position:200% 50%}to{background-position:-200% 50%}}
@keyframes ofogh-pl-cycle{0%,4%{opacity:0;transform:translateY(6px)}8%,20%{opacity:1;transform:translateY(0)}24%,100%{opacity:0;transform:translateY(-6px)}}
@keyframes ofogh-pl-bar{0%{transform:scaleX(0);opacity:1}60%{transform:scaleX(.74);opacity:1}86%{transform:scaleX(.8);opacity:1}100%{transform:scaleX(.84);opacity:0}}
@keyframes ofogh-pl-sweep{0%{transform:translateX(340%)}100%{transform:translateX(-340%)}}
.ofogh-pl-spin{animation:ofogh-pl-spin 1.5s linear infinite;will-change:transform}
.ofogh-pl-spin-rev{animation:ofogh-pl-spin-rev 1.5s linear infinite;will-change:transform}
.ofogh-pl-breathe{animation:ofogh-pl-breathe 2.1s ease-in-out infinite}
.ofogh-pl-glow{animation:ofogh-pl-glow 4s ease-in-out infinite;will-change:transform,opacity}
.ofogh-pl-word{background:linear-gradient(90deg,#10b981 0%,#14b8a6 22%,#f59e0b 50%,#14b8a6 78%,#10b981 100%);background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;animation:ofogh-pl-word 2.8s linear infinite}
.ofogh-pl-msg{opacity:0;animation:ofogh-pl-cycle 12s linear infinite}
.ofogh-pl-bar{transform-origin:100% 50%;animation:ofogh-pl-bar 2.8s cubic-bezier(.25,.1,.25,1) infinite;will-change:transform,opacity}
.ofogh-pl-sweep{animation:ofogh-pl-sweep 1.5s cubic-bezier(.45,.05,.55,.95) infinite;will-change:transform}
@media (prefers-reduced-motion:reduce){
 .ofogh-pl-spin,.ofogh-pl-spin-rev,.ofogh-pl-breathe,.ofogh-pl-glow,.ofogh-pl-word,.ofogh-pl-msg,.ofogh-pl-bar,.ofogh-pl-sweep{animation:none}
 .ofogh-pl-msg{opacity:0}
 .ofogh-pl-msg:first-child{opacity:1;transform:none}
 .ofogh-pl-bar{transform:scaleX(.6);opacity:1}
 .ofogh-pl-sweep{opacity:.5}
}`;

/** نشان «افق» — خورشید در حال طلوع (زمرد) روی خط افق (کهربایی) */
function HorizonMark({ size = 26 }: { size?: number }) {
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

export function OfoghLoader({
        messages,
        compact = false,
        label = "در حال بارگذاری...",
}: {
        /** پیام‌های چرخشی؛ در حالت compact فقط پیام اول به‌صورت ثابت نمایش داده می‌شود */
        messages?: readonly string[];
        compact?: boolean;
        label?: string;
}) {
        const msgs = messages && messages.length > 0 ? messages : DEFAULT_MESSAGES;
        const ringBox = compact ? "h-14 w-14" : "h-[76px] w-[76px]";

        return (
                <div
                        dir="rtl"
                        role="status"
                        aria-live="polite"
                        aria-label={label}
                        className="relative flex select-none flex-col items-center justify-center"
                >
                        <style dangerouslySetInnerHTML={{ __html: LOADER_CSS }} />

                        {/* نوار سوئیپ بالای صفحه — سبک nprogress (فقط حالت صفحهٔ کامل) */}
                        {!compact && (
                                <div
                                        className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden"
                                        aria-hidden="true"
                                >
                                        <div
                                                className="ofogh-pl-sweep absolute left-0 top-0 h-full w-[38%] rounded-full"
                                                style={{
                                                        background:
                                                                "linear-gradient(90deg, rgba(16,185,129,0), #10b981, #14b8a6, #f59e0b)",
                                                        boxShadow: "0 0 10px rgba(20,184,166,.6)",
                                                }}
                                        />
                                </div>
                        )}

                        {/* هاله‌های محیطی نفس‌کشنده */}
                        <div
                                aria-hidden="true"
                                className={`pointer-events-none absolute rounded-full blur-3xl ofogh-pl-glow ${
                                        compact ? "h-28 w-28" : "h-40 w-40"
                                } -z-10 bg-emerald-500/15 dark:bg-emerald-400/15`}
                        />
                        <div
                                aria-hidden="true"
                                className={`pointer-events-none absolute rounded-full blur-3xl ofogh-pl-glow ${
                                        compact ? "h-24 w-24" : "h-32 w-32"
                                } -z-10 bg-amber-500/10 dark:bg-amber-400/10`}
                                style={{ animationDelay: "-2s", transform: "translate(34px, 22px)" }}
                        />

                        {/* حلقهٔ دوگانهٔ همگام + نشان برند */}
                        <div className={`relative ${ringBox}`} aria-hidden="true">
                                {/* مدارهای کم‌رنگ ثابت */}
                                <div className="absolute inset-0 rounded-full border-2 border-emerald-500/12" />
                                <div className="absolute inset-[10px] rounded-full border border-teal-500/10" />
                                {/* حلقهٔ بیرونی — ساعتگرد، گرادیان زمرد→فیروزه‌ای→کهربایی */}
                                <div
                                        className="ofogh-pl-spin absolute inset-0 rounded-full"
                                        style={{
                                                background:
                                                        "conic-gradient(from 0deg, rgba(16,185,129,0) 0deg, rgba(16,185,129,0) 205deg, #f59e0b 282deg, #14b8a6 328deg, #10b981 360deg)",
                                                WebkitMask:
                                                        "radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px))",
                                                mask: "radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px))",
                                        }}
                                />
                                {/* حلقهٔ درونی — پادساعتگرد، ظریف‌تر (کهربایی→فیروزه‌ای) */}
                                <div
                                        className="ofogh-pl-spin-rev absolute inset-[10px] rounded-full"
                                        style={{
                                                background:
                                                        "conic-gradient(from 180deg, rgba(20,184,166,0) 0deg, rgba(20,184,166,0) 245deg, #14b8a6 308deg, #f59e0b 360deg)",
                                                WebkitMask:
                                                        "radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px))",
                                                mask: "radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px))",
                                        }}
                                />
                                {/* مرکز — نشان افق با تنفس نرم */}
                                <div className="ofogh-pl-breathe absolute inset-[16px] flex items-center justify-center rounded-full bg-background shadow-[inset_0_0_10px_rgba(16,185,129,.08)]">
                                        <HorizonMark size={compact ? 20 : 26} />
                                </div>
                        </div>

                        {/* وردمارک + پیام‌ها + نوار پیشرفت */}
                        <div className="mt-4 text-center">
                                <div
                                        className={`ofogh-pl-word font-extrabold tracking-tight ${
                                                compact ? "text-base" : "text-xl"
                                        }`}
                                >
                                        افق پلاس
                                </div>

                                {compact ? (
                                        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{msgs[0]}</p>
                                ) : (
                                        <>
                                                <div className="relative mx-auto mt-2 h-4 w-60 max-w-[80vw] overflow-hidden">
                                                        {msgs.map((msg, i) => (
                                                                <span
                                                                        key={msg}
                                                                        className="ofogh-pl-msg absolute inset-x-0 top-0 whitespace-nowrap text-xs leading-4 text-muted-foreground"
                                                                        style={{ animationDelay: `${(i * MSG_STEP).toFixed(1)}s` }}
                                                                >
                                                                        {msg}
                                                                </span>
                                                        ))}
                                                </div>
                                                {/* نوار پیشرفت — رشد از راست با حس پیشرفت واقعی */}
                                                <div
                                                        className="mx-auto mt-3 h-1.5 w-56 max-w-[70vw] overflow-hidden rounded-full bg-emerald-500/10 dark:bg-emerald-400/10"
                                                        aria-hidden="true"
                                                >
                                                        <div
                                                                className="ofogh-pl-bar h-full w-full rounded-full"
                                                                style={{
                                                                        background:
                                                                                "linear-gradient(90deg, #10b981, #14b8a6 60%, #f59e0b)",
                                                                        boxShadow: "0 0 8px rgba(20,184,166,.55)",
                                                                }}
                                                        />
                                                </div>
                                        </>
                                )}
                        </div>

                        <span className="sr-only">در حال بارگذاری...</span>
                </div>
        );
}

export default OfoghLoader;
