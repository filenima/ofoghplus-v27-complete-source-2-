import Image from "next/image";
import { Building2, TrendingUp, ShieldCheck } from "lucide-react";

/**
 * CinematicHeroImage — نیمهٔ تصویری هیروی لندینگ (v41 — بازگشت به چیدمان پس‌زمینه)
 * ============================================================================
 * درخواست مالک (v41): «هیرو عکس رو بد جایی گذاشتی، برگردون به نسخهٔ قبل و
 * عکس باید توی بک‌گراندِ نصف قسمت هیرو باشه.»
 *
 * این کامپوننت حالا «لایهٔ پس‌زمینهٔ نیمی از هیرو» است — نه کارت قاب‌دار:
 *  - دسکتاپ: نیمهٔ چپِ سکشن هیرو (متن در نیمهٔ راست RTL می‌ماند)
 *  - موبایل: نیمهٔ پایین هیرو، تمام‌عرض (متن بالا خوانا می‌ماند)
 *  - انیمیشن Ken Burns آهسته (فقط transform — GPU، بدون JS)
 *  - محوِ لبه‌ها با گرادیان background → تصویر «تولد می‌کند» نه «چسبیده»
 *  - چیپ وضعیت «اتصال مودیان فعال» + کارت گلاسمورفیک «+۲٬۴۰۰ کسب‌وکار»
 *    روی تصویر شناور می‌مانند (حس زنده بودن، بدون کاهش دیزاین)
 *  - next/image با priority → بدون CLS، LCP سریع
 *  - prefers-reduced-motion + موبایل (≤768px): انیمیشن‌های تزئینی خاموش
 *
 * نکتهٔ چیدمان: باید فرزندِ مستقیمِ <section class="relative …"> هیرو باشد
 * (نه ستون گرید) تا absolute نسبت به کل هیرو позиچن شود.
 * کامپوننت خالص و بدون state است؛ فایل AVIF تنها ~۳۵KB است.
 */

const HERO_CSS = `
@keyframes ofogh-hero-kenburns{from{transform:scale(1)}to{transform:scale(1.08)}}
@keyframes ofogh-hero-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
@keyframes ofogh-hero-float-sm{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes ofogh-hero-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.75)}}
.ofogh-hero-kenburns{animation:ofogh-hero-kenburns 18s ease-in-out infinite alternate;will-change:transform}
.ofogh-hero-float{animation:ofogh-hero-float 6s ease-in-out infinite;will-change:transform}
.ofogh-hero-float-sm{animation:ofogh-hero-float-sm 5s ease-in-out infinite;animation-delay:-2.2s;will-change:transform}
.ofogh-hero-dot{animation:ofogh-hero-dot 2.4s ease-in-out infinite}
/* احترام به reduced-motion و حالت پرفورمنس موبایل پروژه (انیمیشن تزئینی خاموش) */
@media (prefers-reduced-motion:reduce){
 .ofogh-hero-kenburns,.ofogh-hero-float,.ofogh-hero-float-sm,.ofogh-hero-dot{animation:none}
}
@media (max-width:768px){
 .ofogh-hero-kenburns,.ofogh-hero-float,.ofogh-hero-float-sm{animation:none}
 .ofogh-hero-dot{animation:none}
}`;

export function CinematicHeroImage({
        priority = true,
        className = "",
}: {
        /** تصویر هیرو LCP است؛ پیش‌فرض preload فعال است */
        priority?: boolean;
        className?: string;
}) {
        return (
                <div
                        aria-hidden="true"
                        className={`pointer-events-none absolute bottom-0 left-0 h-1/2 w-full select-none lg:inset-y-0 lg:h-full lg:w-1/2 ${className}`}
                >
                        <style dangerouslySetInnerHTML={{ __html: HERO_CSS }} />

                        {/* تصویر سینمایی — پس‌زمینهٔ نیمی از هیرو */}
                        <Image
                                src="/landing/hero-cinematic.avif"
                                alt=""
                                fill
                                priority={priority}
                                sizes="(max-width: 1023px) 100vw, 50vw"
                                className="ofogh-hero-kenburns object-cover"
                        />

                        {/* محو لبه‌ها — موبایل: از بالا به داخل متن محو می‌شود؛
                            دسکتاپ: لبهٔ راست (سمت متن) به رنگ پس‌زمینه می‌رود */}
                        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-background/25 to-background lg:bg-gradient-to-r lg:from-transparent lg:via-background/10 lg:to-background" />
                        {/* وینیت پایین — اتصال نرم به سکشن بعدی */}
                        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
                        {/* هایلایت شیشه‌ای گوشه — حس عمق قاب */}
                        <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />

                        {/* چیپ وضعیت — شناور روی تصویر (دسکتاپ: بالا-چپ هیرو) */}
                        <div className="ofogh-hero-float-sm absolute left-5 top-20 hidden sm:block lg:top-24">
                                <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/25 bg-card/70 px-3 py-1.5 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-card/60">
                                        <span className="ofogh-hero-dot h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,.8)]" />
                                        <span className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
                                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                                اتصال مودیان فعال
                                        </span>
                                </div>
                        </div>

                        {/* کارت آمار گلاسمورفیک — گوشهٔ پایینِ تصویر */}
                        <div className="ofogh-hero-float absolute bottom-6 left-5 sm:left-8 lg:bottom-10">
                                <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/25 bg-card/75 px-4 py-3 shadow-xl shadow-black/10 backdrop-blur-md transition-transform duration-200 hover:scale-[1.03] dark:border-white/10 dark:bg-card/70 dark:shadow-black/30">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-teal-500/15 text-emerald-600 dark:text-emerald-400">
                                                <Building2 className="h-5 w-5" />
                                        </div>
                                        <div>
                                                <p className="text-base font-extrabold leading-6 text-foreground">
                                                        +۲٬۴۰۰ <span className="text-sm font-bold text-muted-foreground">کسب‌وکار</span>
                                                </p>
                                                <p className="flex items-center gap-1 text-[11px] leading-4 text-muted-foreground">
                                                        <TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                                        <span className="text-emerald-600 dark:text-emerald-400">۱۸٪ رشد امسال</span>
                                                        · به افق پلاس اعتماد کرده‌اند
                                                </p>
                                        </div>
                                </div>
                        </div>
                </div>
        );
}

export default CinematicHeroImage;
