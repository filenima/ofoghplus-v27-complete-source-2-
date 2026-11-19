"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Star, Send, CheckCircle2, Gift, Copy, Check, Phone, Headphones, Users } from "lucide-react";
import { toPersianDigits, formatNumber } from "@/lib/persian";
// R28-7 — NPS→رفرال: پاداش‌های دوطرفه از منبع واحد (ثابت‌های خالص و client-safe)
import {
  REFERRAL_REWARD_TOMAN,
  REFERRAL_REFEREE_REWARD_LABEL_FA,
} from "@/lib/referral-config";

interface NPSSurveyProps {
 token?: string;
 autoShow?: boolean;
 triggerAfterDays?: number;
 /** R28-7 — بعد از پاسخ حامیان (۹-۱۰): باز کردن ویجت «معرفی دوستان» توسط والد */
 onOpenReferral?: () => void;
}

/**
 * Modal نظرسنجی NPS (Net Promoter Score).
 *
 * نمایش پس از ۷ روز فعالیت کاربر (به‌صورت پیش‌فرض).
 * امتیاز ۰ تا ۱۰ با slider.
 * بازخورد اختیاری در textarea.
 *
 * Usage:
 * <NPSSurvey token={userToken} />
 */
export function NPSSurvey({ token, autoShow = true, triggerAfterDays = 7, onOpenReferral }: NPSSurveyProps) {
 const [open, setOpen] = React.useState(false);
 const [score, setScore] = React.useState(8);
 const [feedback, setFeedback] = React.useState("");
 const [submitting, setSubmitting] = React.useState(false);
 const [submitted, setSubmitted] = React.useState(false);
 const [thankYouMessage, setThankYouMessage] = React.useState("");
 // R28-7 — دستهٔ پاسخ ثبت‌شده (promoter/passive/detractor) برای پل رفرال/پشتیبانی
 const [submittedCategory, setSubmittedCategory] = React.useState<"promoter" | "passive" | "detractor" | null>(null);
 const [referralCode, setReferralCode] = React.useState<string | null>(null);
 const [referralLoading, setReferralLoading] = React.useState(false);
 const [copied, setCopied] = React.useState(false);
 const [supportOpen, setSupportOpen] = React.useState(false);

 // بررسی اینکه آیا باید نظرسنجی نمایش داده شود
 React.useEffect(() => {
 if (!autoShow ||!token) return;

 // بررسی localStorage — اگر قبلاً پاسخ داده، نمایش نده
 const dismissed = localStorage.getItem("hoshhesab_nps_dismissed");
 if (dismissed === "true") return;

 // بررسی session count — بعد از N روز activity
 const firstVisit = localStorage.getItem("hoshhesab_first_visit");
 if (!firstVisit) {
 localStorage.setItem("hoshhesab_first_visit", Date.now().toString());
 return;
 }

 const daysSinceFirstVisit = (Date.now() - Number(firstVisit)) / (86400000);
 if (daysSinceFirstVisit < triggerAfterDays) return;

 // دریافت وضعیت از سرور
 fetch("/api/marketing/nps", {
 headers: { Authorization: `Bearer ${token}` },
 })
.then((res) => res.json())
.then((data) => {
 if (data.success && data.data?.shouldShowSurvey) {
 // نمایش پس از ۳۰ ثانیه
 setTimeout(() => setOpen(true), 30000);
 }
 })
.catch(() => {
 /* ignore — never block user */
 });
 }, [token, autoShow, triggerAfterDays]);

 const handleSubmit = async () => {
 setSubmitting(true);
 try {
 const res = await fetch("/api/marketing/nps", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ score, feedback: feedback.trim() || undefined }),
 });
 const data = await res.json();
 if (data.success) {
 setSubmitted(true);
 setThankYouMessage(data.data?.thankYouMessage || "ممنون از بازخورد شما");
 // R28-7 — دستهٔ پاسخ از سرور (با fallback محلی) برای پل رفرال/پشتیبانی
 const returnedCategory = data.data?.category as
 | "promoter"
 | "passive"
 | "detractor"
 | undefined;
 const finalCategory =
 returnedCategory ?? (score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor");
 setSubmittedCategory(finalCategory);
 localStorage.setItem("hoshhesab_nps_dismissed", "true");
 // R28-7 (فاز ۱ سند R25 — NPS→رفرال): حامیان (۹-۱۰) بلافاصله کد دعوت‌شان
 // را می‌بینند — دعوت در قلهٔ احساس خوب، بیشترین نرخ ارسال را دارد.
 if (finalCategory === "promoter" && token) {
 setReferralLoading(true);
 try {
 const refRes = await fetch("/api/marketing/referral", {
 headers: { Authorization: `Bearer ${token}` },
 });
 const refJson = await refJsonSafe(refRes);
 if (refJson?.success && refJson.myCode) setReferralCode(refJson.myCode);
 } catch {
 /* کد دعوت اختیاری است — بدون آن هم کارت دعوت معنا دارد */
 } finally {
 setReferralLoading(false);
 }
 }
 }
 } catch (err) {
 console.error("NPS submit failed:", err);
 } finally {
 setSubmitting(false);
 }
 };

 /** R28-7 — خواندن امن JSON (پاسخ غیر-JSON نباید کل مسیر را بشکند) */
 async function refJsonSafe(res: Response): Promise<{ success?: boolean; myCode?: string } | null> {
 try {
 return (await res.json()) as { success?: boolean; myCode?: string };
 } catch {
 return null;
 }
 }

 /** R28-7 — کپی کد دعوت با بازخورد بصری (بدون alert) — همان الگوی fallback
  *  رایج کدبیس (roi-calculator-section/trial-success-modal): اول Clipboard API،
  *  بعد textarea + execCommand برای مرورگرهای بدون امنیتی/قدیمی */
 const handleCopyCode = () => {
 if (!referralCode) return;
 const done = () => {
 setCopied(true);
 setTimeout(() => setCopied(false), 1800);
 };
 const fallbackCopy = () => {
 try {
 const ta = document.createElement("textarea");
 ta.value = referralCode;
 ta.style.position = "fixed";
 ta.style.opacity = "0";
 document.body.appendChild(ta);
 ta.select();
 document.execCommand("copy");
 document.body.removeChild(ta);
 done();
 } catch {
 /* مرورگر خیلی قدیمی — کاربر کد را دستی انتخاب می‌کند */
 }
 };
 if (navigator.clipboard?.writeText) {
 navigator.clipboard.writeText(referralCode).then(done).catch(fallbackCopy);
 } else {
 fallbackCopy();
 }
 };

 const handleDismiss = () => {
 setOpen(false);
 localStorage.setItem("hoshhesab_nps_dismissed", "true");
 };

 const getCategory = (s: number) => {
 if (s >= 9) return { label: "Promoter", color: "bg-emerald-100 text-emerald-700" };
 if (s >= 7) return { label: "Passive", color: "bg-amber-100 text-amber-700" };
 return { label: "Detractor", color: "bg-rose-100 text-rose-700" };
 };

 const category = getCategory(score);

 return (
 <Dialog open={open} onOpenChange={(o) => {
 if (!o) handleDismiss();
 else setOpen(o);
 }}>
 <DialogContent className="max-w-md">
 {!submitted? (
 <>
 <DialogHeader>
 <DialogTitle className="text-center text-xl">
 نظر شما درباره‌ی افق پلاس
 </DialogTitle>
 <DialogDescription className="text-center">
 احتمال توصیه‌ی افق پلاس به دوستان و همکارانتان؟
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-6 py-4">
 {/* Score display */}
 <div className="text-center">
 <div className="inline-flex items-center gap-2 mb-3">
 <span className="text-5xl font-bold text-primary">
 {toPersianDigits(score)}
 </span>
 <span className="text-2xl text-muted-foreground">/</span>
 <span className="text-2xl text-muted-foreground">{toPersianDigits(10)}</span>
 </div>
 <Badge className={category.color} variant="secondary">
 {category.label}
 </Badge>
 </div>

 {/* Slider */}
 <div className="space-y-2">
 <div className="flex justify-between text-xs text-muted-foreground">
 <span>اصلاً احتمال ندارد</span>
 <span>حتماً توصیه می‌کنم</span>
 </div>
 <Slider
 value={[score]}
 onValueChange={(vals) => setScore(vals[0] || 0)}
 min={0}
 max={10}
 step={1}
 className="w-full"
 />
 <div className="flex justify-between text-xs">
 {Array.from({ length: 11 }, (_, i) => (
 <span
 key={i}
 className={i === score? "font-bold text-primary": "text-muted-foreground"}
 >
 {toPersianDigits(i)}
 </span>
 ))}
 </div>
 </div>

 {/* Feedback */}
 <div className="space-y-2">
 <Label htmlFor="nps-feedback" className="text-sm">
 چه چیزی می‌تواند افق پلاس را بهتر کند؟ (اختیاری)
 </Label>
 <Textarea
 id="nps-feedback"
 value={feedback}
 onChange={(e) => setFeedback(e.target.value)}
 placeholder="نظر، پیشنهاد یا انتقاد خود را بنویسید..."
 className="min-h-20 resize-none"
 maxLength={1000}
 />
 <p className="text-xs text-muted-foreground text-left">
 {toPersianDigits(feedback.length)}/{toPersianDigits(1000)}
 </p>
 </div>
 </div>

 <DialogFooter className="flex-row gap-2">
 <Button variant="ghost" onClick={handleDismiss} className="flex-1">
 بعداً
 </Button>
 <Button
 onClick={handleSubmit}
 disabled={submitting}
 className="flex-1"
 >
 <Send className="h-4 w-4 ml-2" />
 {submitting? "در حال ارسال...": "ارسال نظر"}
 </Button>
 </DialogFooter>
 </>
 ): (
 <>
 <DialogHeader>
 <DialogTitle className="text-center flex items-center justify-center gap-2">
 <CheckCircle2 className="h-6 w-6 text-emerald-500" />
 ممنون از شما
 </DialogTitle>
 </DialogHeader>
 <div className="py-6 text-center space-y-4">
 <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100">
 <Star className="h-8 w-8 text-emerald-600 fill-emerald-600" />
 </div>
 <p className="text-sm text-muted-foreground leading-relaxed">
 {thankYouMessage}
 </p>

 {/* R28-7 (فاز ۱ سند R25 — NPS→رفرال): حامیان (۹-۱۰) در همان قلهٔ
 احساس خوب، کد دعوت + پاداش دوطرفه را می‌بینند (اعداد از منبع واحد) */}
 {submittedCategory === "promoter" && (
 <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-right space-y-3">
 <div className="flex items-center gap-2">
 <Gift className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
 <p className="text-sm font-bold text-foreground">تجربه‌تان را به دوستانتان هدیه دهید</p>
 </div>
 <p className="text-xs leading-relaxed text-muted-foreground">
 با هر دعوت موفق {toPersianDigits(formatNumber(REFERRAL_REWARD_TOMAN))} تومان پاداش می‌گیرید و دوست‌تان {REFERRAL_REFEREE_REWARD_LABEL_FA} اعتبار هدیه + ۱۴ روز رایگان اضافه.
 </p>
 {referralLoading ? (
 <p className="text-xs text-muted-foreground">در حال دریافت کد دعوت شما…</p>
 ) : referralCode ? (
 <div className="flex items-center gap-2">
 <code
 dir="ltr"
 className="flex-1 rounded-lg border-2 border-dashed border-primary/40 bg-background px-3 py-2 text-center text-lg font-extrabold tracking-[0.15em] text-primary tnum"
 >
 {referralCode}
 </code>
 <Button
 type="button"
 size="sm"
 variant="outline"
 className="shrink-0 gap-1.5"
 onClick={handleCopyCode}
 aria-label="کپی کد دعوت"
 >
 {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
 {copied ? "کپی شد" : "کپی"}
 </Button>
 </div>
 ) : (
 <p className="text-xs leading-relaxed text-muted-foreground">
 کد دعوت اختصاصی‌تان در کارت «معرفی دوستان» داشبورد در دسترس است.
 </p>
 )}
 {onOpenReferral && (
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="w-full gap-1.5"
 onClick={() => {
 setOpen(false);
 onOpenReferral();
 }}
 >
 <Users className="h-4 w-4" />
 مشاهدهٔ برنامهٔ معرفی دوستان
 </Button>
 )}
 </div>
 )}

 {/* R28-7 (فاز ۱ سند R25 — NPS→پشتیبانی): منتقدان (۰-۶) مسیر تماس
 انسانی می‌گیرند — تماس تلفنی واقعی، نه فرم بی‌پاسخ */}
 {submittedCategory === "detractor" && (
 <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-right space-y-3">
 <div className="flex items-center gap-2">
 <Headphones className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
 <p className="text-sm font-bold text-foreground">اجازه بدهید خودمان تماس بگیریم</p>
 </div>
 <p className="text-xs leading-relaxed text-muted-foreground">
 مشکلات شما را جدی می‌گیریم؛ برای پیگیری سریع‌تر می‌توانید همین حالا با کارشناس ما صحبت کنید.
 </p>
 {!supportOpen ? (
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="w-full gap-1.5"
 onClick={() => setSupportOpen(true)}
 >
 <Phone className="h-4 w-4" />
 اطلاعات تماس پشتیبانی
 </Button>
 ) : (
 <div className="space-y-1 rounded-lg border border-border bg-background px-3 py-2.5 text-center">
 <a href="tel:07132622493" dir="ltr" className="block text-lg font-extrabold text-primary tnum">
 ۰۷۱-۳۲۶۲۲۴۹۳
 </a>
 <p className="text-[11px] text-muted-foreground">
 شنبه تا پنجشنبه، ۹ تا ۲۱ — پاسخ‌گویی سریع
 </p>
 </div>
 )}
 </div>
 )}

 <div className="pt-2">
 <Button onClick={() => setOpen(false)} variant="outline">
 بستن
 </Button>
 </div>
 </div>
 </>
 )}
 </DialogContent>
 </Dialog>
 );
}
