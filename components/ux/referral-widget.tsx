"use client";

import * as React from "react";
import {
 Gift,
 Copy,
 Check,
 Users,
 Users2,
 TrendingUp,
 Clock,
 Award,
 Mail,
 Share2,
 Trash2,
 Plus,
 Send,
 MessageCircle,
 Link as LinkIcon,
 Trophy,
 Medal,
 Crown,
 Sparkles,
 Banknote,
 Landmark,
 Loader2,
 X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits, formatNumber, formatCompactToman } from "@/lib/persian";
// R14-D — منبع واحد پاداش رفرال (بدون عدد جادویی در UI)
// R28-7 — پاداش دوطرفه: برچسب سمت دعوت‌شده هم از همان منبع می‌آید
import {
 REFERRAL_REWARD_TOMAN,
 REFERRAL_MIN_WITHDRAWAL_TOMAN,
 REFERRAL_REFEREE_REWARD_LABEL_FA,
 REFERRAL_MARKETING_COPY_FA,
} from "@/lib/referral-config";

// ============ types ============
interface Referral {
 id: string;
 referrerId: string;
 refereeEmail: string;
 code: string;
 status: "PENDING" | "SIGNED_UP" | "REWARDED";
 reward: number;
 refereeUserId?: string | null;
 createdAt: string;
 updatedAt: string;
}

interface Stats {
 total: number;
 pending: number;
 signedUp: number;
 rewarded: number;
 totalReward: number;
}

// Task 3-c — مسابقه رفرال (جوایز نقدی ۱۰ نفر برتر — قابل ویرایش توسط سوپرادمین)
interface ContestLeaderRow {
 rank: number;
 displayName: string;
 referralCount: number;
 totalReward: number;
 prizeToman: number;
 isMe: boolean;
}
interface ContestData {
 contest: {
 active: boolean;
 title: string;
 prizes: number[];
 startDate: string | null;
 endDate: string | null;
 windowLabel: string;
 rules: { metric: string; note: string };
 };
 leaders: ContestLeaderRow[];
 me: { rank: number; referralCount: number; totalReward: number; inTop: boolean };
}

interface ReferralResponse {
 success: boolean;
 /** R15 — کد دعوت شخصی کاربر (User.personalCode) — همیشه موجود است */
 myCode?: string | null;
 data: Referral[];
 stats: Stats;
}

// R14-D — دادهٔ کیف پول برای نمایش موجودی/برداشت (الگوی WalletModule)
interface WalletSummary {
 balance: number;
 referralBonusToman: number;
 minWithdrawalToman: number;
 walletDisabled: boolean;
}

const STATUS_META: Record<
 Referral["status"],
 { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
 PENDING: {
 label: "در انتظار",
 color: "bg-amber-500/10 text-amber-600 border-amber-500/30",
 icon: Clock,
 },
 SIGNED_UP: {
 label: "ثبت‌نام کرد",
 color: "bg-primary/10 text-primary border-primary/30",
 icon: Users2,
 },
 REWARDED: {
 label: "پاداش داده شد",
 color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
 icon: Award,
 },
};

export function ReferralWidget({ className }: { className?: string }) {
 const { toast } = useToast();
 const [data, setData] = React.useState<Referral[]>([]);
 // R15 — کد دعوت شخصی: همون لحظهٔ ثبت‌نام ساخته شده و اینجا برجسته دیده می‌شود
 const [myCode, setMyCode] = React.useState<string | null>(null);
 const [stats, setStats] = React.useState<Stats>({
 total: 0,
 pending: 0,
 signedUp: 0,
 rewarded: 0,
 totalReward: 0,
 });
 const [loading, setLoading] = React.useState(true);
 const [newEmail, setNewEmail] = React.useState("");
 const [creating, setCreating] = React.useState(false);
 const [copiedCode, setCopiedCode] = React.useState<string | null>(null);
 const [deleteId, setDeleteId] = React.useState<string | null>(null);
 const [board, setBoard] = React.useState<ContestData | null>(null);
 const [boardLoading, setBoardLoading] = React.useState(true);

 // R14-D — موجودی کیف پول + جمع پاداش دعوت‌ها + فرم برداشت
 const [wallet, setWallet] = React.useState<WalletSummary | null>(null);
 const [withdrawOpen, setWithdrawOpen] = React.useState(false);
 const [withdrawSubmitting, setWithdrawSubmitting] = React.useState(false);
 const [wdAmount, setWdAmount] = React.useState("");
 const [wdCard, setWdCard] = React.useState("");
 const [wdSheba, setWdSheba] = React.useState("");
 const [wdHolder, setWdHolder] = React.useState("");

 // R16 — ضربدر بستن ویجت: کاربر دیگر نمی‌بیند (سوپرادمین می‌تواند دوباره فعال کند)
 const [widgetHidden, setWidgetHidden] = React.useState(false);
 const [widgetMode, setWidgetMode] = React.useState<"on" | "off" | "forced">("on");

 // R16 — وضعیت ویجت از سرور (hidden کاربر + mode سراسری سوپرادمین)
 React.useEffect(() => {
  let cancelled = false;
  (async () => {
   try {
    const res = await authFetch("/api/referrals/widget-state");
    const json = await res.json().catch(() => null);
    if (!cancelled && json?.success) {
     setWidgetHidden(!!json.hidden);
     setWidgetMode((json.mode as "on" | "off" | "forced") ?? "on");
    }
   } catch {
    /* ignore */
   }
  })();
  return () => {
   cancelled = true;
  };
 }, []);

 // R16 — بستن با ضربدر: ماندگار (ذخیره روی حساب کاربر)
 const hideWidget = React.useCallback(async () => {
  setWidgetHidden(true); // فوری مخفی شود — UX بدون انتظار
  try {
   await authFetch("/api/referrals/widget-hide", { method: "POST" });
  } catch {
   /* offline: همان حالت نشست هم کافی است */
  }
 }, []);

 // R14-D — واکشی کیف پول: موجودی + جمع تراکنش‌های REFERRAL_BONUS
 const fetchWallet = React.useCallback(async () => {
 try {
 const res = await authFetch("/api/wallet");
 const json = await res.json();
 if (res.status === 403 && json?.code === "WALLET_DISABLED") {
 setWallet({ balance: 0, referralBonusToman: 0, minWithdrawalToman: REFERRAL_MIN_WITHDRAWAL_TOMAN, walletDisabled: true });
 return;
 }
 if (json?.success) {
 const txs: Array<{ type: string; amountToman: number; status: string }> =
 json.data?.transactions ?? [];
 const referralBonusToman = txs
 .filter((t) => t.type === "REFERRAL_BONUS" && t.status !== "CANCELED")
 .reduce((sum, t) => sum + Math.abs(t.amountToman), 0);
 setWallet({
 balance: json.data?.balance ?? 0,
 referralBonusToman,
 minWithdrawalToman: json.data?.rules?.minWithdrawalToman ?? REFERRAL_MIN_WITHDRAWAL_TOMAN,
 walletDisabled: false,
 });
 }
 } catch {
 /* بی‌صدا — ویجت بدون کیف پول هم کار می‌کند */
 }
 }, []);

 React.useEffect(() => {
 void fetchWallet();
 }, [fetchWallet]);

 // R14-D — ثبت درخواست برداشت (همان API ماژول کیف پول)
 const submitWithdrawal = React.useCallback(async () => {
 // R14-J2 FIX: ارقام فارسی + عربی (٠-٩) + جداکننده‌ها → عدد لاتین
 const amountNum = Number(
 String(wdAmount)
 .replace(/[،,\s٬]/g, "")
 .replace(/[۰-۹]/g, (ch) => String(ch.charCodeAt(0) - 1776))
 .replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 1632))
 );
 if (!Number.isFinite(amountNum) || amountNum <= 0) {
 toast({ title: "مبلغ نامعتبر", description: "مبلغ برداشت را به تومان وارد کنید.", variant: "destructive" });
 return;
 }
 // R14-J2 FIX(Validation mismatch): همان حداقلِ API (۱٬۰۰۰٬۰۰۰) سمت کلاینت
 // هم چک می‌شود — قبلاً فقط مثبت‌بودن چک می‌شد و خطای حداقل بعد از رفت‌وبرگشت
 // سرور ظاهر می‌شد.
 const minWithdraw = wallet?.minWithdrawalToman ?? REFERRAL_MIN_WITHDRAWAL_TOMAN;
 if (amountNum < minWithdraw) {
 toast({
 title: "مبلغ کمتر از حداقل",
 description: `حداقل مبلغ برداشت ${minWithdraw.toLocaleString("fa-IR")} تومان است.`,
 variant: "destructive",
 });
 return;
 }
 if (!wdCard.trim() && !wdSheba.trim()) {
 toast({ title: "شماره حساب لازم است", description: "شماره کارت ۱۶ رقمی یا شبا (IR + ۲۴ رقم) را وارد کنید.", variant: "destructive" });
 return;
 }
 if (wdHolder.trim().length < 3) {
 toast({ title: "نام صاحب حساب", description: "نام صاحب حساب (مطابق کارت/شبا) را کامل وارد کنید.", variant: "destructive" });
 return;
 }
 setWithdrawSubmitting(true);
 try {
 const res = await authFetch("/api/wallet/withdraw", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 amountToman: amountNum,
 cardNumber: wdCard.trim() || undefined,
 shebaNumber: wdSheba.trim() || undefined,
 holderName: wdHolder.trim(),
 }),
 });
 const json = await res.json();
 if (!res.ok || !json.success) throw new Error(json.error || "خطا در ثبت درخواست");
 toast({
 title: "درخواست برداشت ثبت شد",
 description: json.message || "پس از بررسی پشتیبانی به کارت/شبای شما واریز می‌شود.",
 });
 setWithdrawOpen(false);
 setWdAmount("");
 setWdCard("");
 setWdSheba("");
 setWdHolder("");
 void fetchWallet();
 } catch (err) {
 toast({
 title: "خطا در ثبت برداشت",
 description: err instanceof Error ? err.message : "دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setWithdrawSubmitting(false);
 }
 }, [wdAmount, wdCard, wdSheba, wdHolder, wallet, fetchWallet, toast]);

 // Task 3-c — مسابقه رفرال (نقدی، ۱۰ نفر برتر کل پلتفرم)
 const fetchLeaderboard = React.useCallback(async () => {
 const token = localStorage.getItem("hoshhesab_user_token") || "";
 if (!token) {
 setBoardLoading(false);
 return;
 }
 try {
 const res = await fetch("/api/referrals/leaderboard", {
 headers: { Authorization: `Bearer ${token}` },
 });
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 const json = await res.json();
 if (json.success) setBoard(json as ContestData);
 } catch {
 /* بی‌صدا */
 } finally {
 setBoardLoading(false);
 }
 }, []);

 React.useEffect(() => {
 fetchLeaderboard();
 }, [fetchLeaderboard]);

 // شمارش معکوس پایان مسابقه (اگر تاریخ پایان تنظیم شده باشد)
 const [countdown, setCountdown] = React.useState<string | null>(null);
 React.useEffect(() => {
 const iso = board?.contest.endDate ?? null;
 if (!iso) {
 setCountdown(null);
 return;
 }
 const end = new Date(iso).getTime();
 if (Number.isNaN(end)) {
 setCountdown(null);
 return;
 }
 const tick = () => {
 const diff = end - Date.now();
 if (diff <= 0) {
 setCountdown("پایان یافته");
 return;
 }
 const days = Math.floor(diff / 86_400_000);
 const hours = Math.floor((diff % 86_400_000) / 3_600_000);
 setCountdown(days > 0 ? `${toPersianDigits(days)} روز مانده` : `${toPersianDigits(hours)} ساعت مانده`);
 };
 tick();
 const timer = setInterval(tick, 30_000);
 return () => clearInterval(timer);
 }, [board?.contest.endDate]);

 const fetchReferrals = React.useCallback(async () => {
 const token = localStorage.getItem("hoshhesab_user_token") || "";
 if (!token) {
 setLoading(false);
 return;
 }
 try {
 const res = await fetch("/api/marketing/referral", {
 headers: { Authorization: `Bearer ${token}` },
 });
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 const json: ReferralResponse = await res.json();
 setData(json.data);
 setStats(json.stats);
 setMyCode(json.myCode || json.data?.[0]?.code || null);
 } catch (err) {
 console.error("Referral fetch failed:", err);
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 fetchReferrals();
 }, [fetchReferrals]);

 const handleCreate = React.useCallback(async () => {
 const email = newEmail.trim().toLowerCase();
 if (!email ||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
 toast({
 title: "ایمیل نامعتبر",
 description: "یک ایمیل معتبر وارد کنید.",
 variant: "destructive",
 });
 return;
 }
 setCreating(true);
 try {
 const token = localStorage.getItem("hoshhesab_user_token") || "";
 const res = await fetch("/api/marketing/referral", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ refereeEmail: email }),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) {
 throw new Error(json?.error || "خطا در ایجاد کد دعوت");
 }
 toast({
 title: "کد دعوت ایجاد شد",
 description: `کد ${json.data.code} برای ${email} ساخته شد.`,
 });
 setNewEmail("");
 fetchReferrals();
 } catch (err) {
 toast({
 title: "خطا",
 description: err instanceof Error? err.message: "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setCreating(false);
 }
 }, [newEmail, fetchReferrals, toast]);

 const handleCopy = React.useCallback(
 async (code: string) => {
 try {
 await navigator.clipboard.writeText(code);
 setCopiedCode(code);
 toast({ title: "کپی شد", description: `کد ${code} در کلیپ‌بورد کپی شد.` });
 setTimeout(() => setCopiedCode(null), 2000);
 } catch {
 toast({
 title: "خطا در کپی",
 description: "لطفاً کد را دستی کپی کنید.",
 variant: "destructive",
 });
 }
 },
 [toast]
 );

 const handleShare = React.useCallback(
 async (ref: Referral) => {
 const shareUrl = `${window.location.origin}/?ref=${ref.code}`;
 const shareText = `با افق پلاس، حسابداری کسب‌وکارم رو خودکار کردم. با کد دعوت من ثبت‌نام کن و پاداش بگیر: ${shareUrl}`;
 try {
 if (navigator.share) {
 await navigator.share({
 title: "دعوت به افق پلاس",
 text: shareText,
 url: shareUrl,
 });
 } else {
 await navigator.clipboard.writeText(shareText);
 toast({
 title: "لینک دعوت کپی شد",
 description: "می‌توانید آن را برای دوستانتان بفرستید.",
 });
 }
 } catch {
 /* user cancelled — ignore */
 }
 },
 [toast]
 );

 const handleShareTelegram = React.useCallback(
 (ref: Referral) => {
 const shareUrl = `${window.location.origin}/?ref=${ref.code}`;
 const text = encodeURIComponent(
 `با افق پلاس، حسابداری کسب‌وکارم رو خودکار کردم. با کد دعوت من ثبت‌نام کن و پاداش بگیر:`
 );
 const url = encodeURIComponent(shareUrl);
 window.open(
 `https://t.me/share/url?url=${url}&text=${text}`,
 "_blank",
 "noopener,noreferrer"
 );
 },
 []
 );

 const handleShareWhatsApp = React.useCallback(
 (ref: Referral) => {
 const shareUrl = `${window.location.origin}/?ref=${ref.code}`;
 const text = encodeURIComponent(
 `با افق پلاس، حسابداری کسب‌وکارم رو خودکار کردم. با کد دعوت من ثبت‌نام کن و پاداش بگیر: ${shareUrl}`
 );
 window.open(
 `https://wa.me/?text=${text}`,
 "_blank",
 "noopener,noreferrer"
 );
 },
 []
 );

 const handleCopyLink = React.useCallback(
 async (ref: Referral) => {
 const shareUrl = `${window.location.origin}/?ref=${ref.code}`;
 try {
 await navigator.clipboard.writeText(shareUrl);
 toast({
 title: "لینک کپی شد",
 description: "لینک دعوت در کلیپ‌بورد کپی شد.",
 });
 } catch {
 toast({
 title: "خطا در کپی",
 description: "لطفاً لینک را دستی کپی کنید.",
 variant: "destructive",
 });
 }
 },
 [toast]
 );

 const handleDelete = React.useCallback(async () => {
 if (!deleteId) return;
 try {
 const token = localStorage.getItem("hoshhesab_user_token") || "";
 const res = await fetch(`/api/marketing/referral?id=${deleteId}`, {
 method: "DELETE",
 headers: { Authorization: `Bearer ${token}` },
 });
 const json = await res.json();
 if (!res.ok ||!json.success) {
 throw new Error(json?.error || "خطا در حذف");
 }
 toast({ title: "حذف شد", description: "کد دعوت حذف شد." });
 fetchReferrals();
 } catch (err) {
 toast({
 title: "خطا",
 description: err instanceof Error? err.message: "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setDeleteId(null);
 }
 }, [deleteId, fetchReferrals, toast]);

 // R16 — سوپرادمین ویجت را خاموش کرده یا کاربر با ضربدر بسته است
 if (widgetMode === "off" || (widgetMode !== "forced" && widgetHidden)) {
  return null;
 }

 return (
 <Card className={`overflow-hidden ${className || ""}`}>
 {/* هدر */}
 <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-gradient-to-l from-primary/5 to-transparent">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Gift className="h-5 w-5" />
 </div>
 <div className="flex-1">
 <h2 className="text-base font-semibold text-foreground">برنامه معرفی دوستان</h2>
 <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
 {/* R14-D + R28-7 (فاز ۱ سند R25): پیام بازاریابی «دوطرفه» از lib/referral-config —
             شما ۱٬۰۰۰٬۰۰۰ + دوست‌تان ۳۰۰٬۰۰۰ و ۱۴ روز رایگان */}
 {REFERRAL_MARKETING_COPY_FA}
 </p>
 </div>
 {widgetMode !== "forced" ? (
 <button
 type="button"
 onClick={() => void hideWidget()}
 className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
 aria-label="بستن کارت معرفی دوستان — دیگر نمایش داده نشود"
 title="بستن — دیگر نمایش داده نشود"
 >
 <X className="h-4 w-4" />
 </button>
 ) : null}
 </div>

 {/* R15 — کد دعوت شخصی، همیشه آماده: بدون ثبت ایمیل، بدون مرحله اضافه.
     این کارت همان چیزی است که مالک خواست: «کد دعوتت را بده به دوستت —
     ۱ میلیون تومان نقد بگیر». کد همان لحظهٔ ثبت‌نام ساخته شده است. */}
 {myCode && (
 <div className="border-b border-border bg-gradient-to-l from-primary/10 via-primary/5 to-transparent px-5 py-4">
 <div className="flex flex-col sm:flex-row sm:items-center gap-4">
 <button
 onClick={() => {
 navigator.clipboard?.writeText(myCode).then(() => {
 setCopiedCode(myCode);
 setTimeout(() => setCopiedCode(null), 1800);
 toast({ title: "کد دعوت کپی شد", description: "برای دوستتان بفرستید — واتساپ، تلگرام یا پیامک." });
 }).catch(() => {});
 }}
 className="group flex items-center gap-3 rounded-xl border-2 border-dashed border-primary/40 bg-background/60 px-4 py-2.5 text-start transition-all hover:border-primary hover:bg-primary/5 active:scale-[0.99]"
 aria-label="کپی کد دعوت شخصی"
 >
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
 <Users className="h-5 w-5" />
 </div>
 {/* R15-F2(موبایل): min-w-0 تا کد دعوت بلند در ردیفِ flex فشرده نشود/سرریز نکند */}
 <div className="min-w-0">
 <p className="text-[11px] text-muted-foreground">کد دعوت اختصاصی شما — کلیک کنید تا کپی شود</p>
 <p dir="ltr" className="text-2xl font-extrabold tracking-[0.16em] text-primary tnum">
 {myCode}
 </p>
 </div>
 <span className="ms-auto flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground group-hover:text-primary">
 {copiedCode === myCode ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
 </span>
 </button>
 <div className="flex items-center gap-2 flex-wrap">
 <Button
 size="sm"
 className="bg-[#16a34a] text-white hover:bg-[#15803d] gap-1.5"
 onClick={() => {
 const shareUrl = `${window.location.origin}/?ref=${myCode}`;
 const text = `سلام. من حساب و کتاب کسب‌وکارم را با «افق پلاس» صاف کردم — فاکتور، انبار، چک و گزارش سود، همه در یک‌جا. با کد دعوت من ثبت‌نام کن و ${REFERRAL_REFEREE_REWARD_LABEL_FA} اعتبار هدیه + ۱۴ روز تریال اضافه بگیر: ${myCode} — ${shareUrl}`;
 window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
 }}
 >
 <Send className="h-4 w-4" />
 ارسال در واتساپ
 </Button>
 </div>
 </div>
 </div>
 )}

 {/* R14-D — کارت پاداش برجسته: ۱٬۰۰۰٬۰۰۰ تومان (قابل برداشت) + موجودی */}
 <div className="border-b border-emerald-500/30 bg-gradient-to-l from-emerald-500/15 via-emerald-500/5 to-transparent px-5 py-4">
 <div className="flex flex-wrap items-center justify-between gap-4">
 <div className="flex items-center gap-3 min-w-0">
 <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
 <Award className="h-6 w-6" />
 </div>
 <div className="min-w-0">
 <p className="text-[11px] text-muted-foreground">پاداش هر دعوت موفق — به‌محض ثبت‌نام دوست شما</p>
 <p className="text-2xl font-bold text-emerald-600 tnum leading-tight">
 {toPersianDigits(formatNumber(REFERRAL_REWARD_TOMAN))}
 <span className="ms-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">تومان</span>
 </p>
 <p className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
 <Banknote className="h-3 w-3" />
 قابل برداشت به کارت / شبا
 </p>
 {/* R28-7 — رفرال دوطرفه: سمت دعوت‌شده (عدد از منبع واحد referral-config) */}
 <p className="text-[11px] text-muted-foreground leading-relaxed">
 هدیهٔ دوست شما: {REFERRAL_REFEREE_REWARD_LABEL_FA} اعتبار پس از اولین فاکتور + ۱۴ روز رایگان
 </p>
 </div>
 </div>
 <div className="flex flex-col items-end gap-1.5 shrink-0">
 <div className="text-end">
 <p className="text-[11px] text-muted-foreground">موجودی کیف پول شما</p>
 <p className="text-lg font-bold text-primary tnum leading-tight">
 {wallet ? toPersianDigits(formatNumber(wallet.balance)) : "…"}
 <span className="ms-1 text-[11px] font-medium text-muted-foreground">تومان</span>
 </p>
 {wallet && wallet.referralBonusToman > 0 && (
 <p className="text-[10px] text-muted-foreground tnum">
 پاداش دعوت‌ها: {toPersianDigits(formatNumber(wallet.referralBonusToman))} تومان
 </p>
 )}
 </div>
 <Button
 size="sm"
 className="gap-1.5"
 onClick={() => setWithdrawOpen(true)}
 disabled={wallet?.walletDisabled}
 aria-label="درخواست برداشت از کیف پول"
 >
 <Banknote className="h-4 w-4" />
 درخواست برداشت
 </Button>
 <p className="text-[10px] text-muted-foreground">
 حداقل برداشت: {toPersianDigits(formatNumber(wallet?.minWithdrawalToman ?? REFERRAL_MIN_WITHDRAWAL_TOMAN))} تومان (یک دعوت کامل)
 </p>
 </div>
 </div>
 {wallet?.walletDisabled && (
 <p className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
 کیف پول برای پلن فعال شما در دسترس نیست — برای فعال‌سازی با پشتیبانی تماس بگیرید.
 </p>
 )}
 </div>

 {/* آمار */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border-b border-border">
 <StatTile label="کل دعوت‌ها" value={stats.total} icon={Users2} />
 <StatTile label="در انتظار" value={stats.pending} icon={Clock} accent="amber" />
 <StatTile label="ثبت‌نام کرده" value={stats.signedUp} icon={TrendingUp} accent="primary" />
 <StatTile
 label="پاداش کل (تومان)"
 value={formatNumber(stats.totalReward)}
 icon={Award}
 accent="emerald"
 />
 </div>

 {/* فرم ایجاد کد جدید */}
 <div className="p-4 border-b border-border bg-muted/20">
 {/* R28-7 — برچسب دوطرفه: پاداش شما + هدیهٔ دوست‌تان (هر دو از منبع واحد) */}
 <label className="text-xs font-medium text-foreground mb-1.5 block">
 دعوت دوست با ایمیل — دوست شما با کد شما ثبت‌نام کند: شما {toPersianDigits(formatNumber(REFERRAL_REWARD_TOMAN))} تومان پاداش می‌گیرید، او {REFERRAL_REFEREE_REWARD_LABEL_FA} اعتبار هدیه + ۱۴ روز رایگان
 </label>
 <div className="flex gap-2">
 <div className="relative flex-1">
 <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 type="email"
 dir="ltr"
 placeholder="friend@example.com"
 value={newEmail}
 onChange={(e) => setNewEmail(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === "Enter") handleCreate();
 }}
 className="pr-9"
 disabled={creating}
 />
 </div>
 <Button onClick={handleCreate} disabled={creating ||!newEmail.trim()} className="gap-1.5">
 {creating? (
 <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
 ): (
 <Plus className="h-4 w-4" />
 )}
 ایجاد کد
 </Button>
 </div>
 </div>

 {/* Task 3-c — مسابقه رفرال (جوایز نقدی ۱۰ نفر برتر + لیدربورد) */}
 {board && !board.contest.active ? (
 <div className="p-4 border-b border-border">
 <div className="flex items-center gap-2.5">
 <Trophy className="h-4 w-4 text-muted-foreground/50 shrink-0" />
 <p className="text-xs text-muted-foreground">
 مسابقه رفرال فعلاً برگزار نمی‌شود — به‌محض شروع دورهٔ جدید همین‌جا نمایش داده می‌شود.
 </p>
 </div>
 </div>
 ) : (
 <div className="p-4 border-b border-border bg-gradient-to-l from-amber-500/5 via-transparent to-transparent">
 <div className="flex items-center gap-2.5 mb-3">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
 <Trophy className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <h3 className="text-sm font-semibold text-foreground">
 {board?.contest.title ?? "مسابقه رفرال افق پلاس"}
 </h3>
 <p className="text-[11px] text-muted-foreground">
 {board
 ? `۱۰ نفر اول: جوایز نقدی ${formatCompactToman(board.contest.prizes[0] ?? 0)} تا ${formatCompactToman(board.contest.prizes[board.contest.prizes.length - 1] ?? 0)}`
 : "نفر اول ۲۰ میلیون تومان — تا نفر دهم ۱ میلیون تومان"}
 </p>
 </div>
 <div className="flex flex-col items-end gap-1 shrink-0">
 {countdown && (
 <Badge variant="outline" className="text-[9px] gap-1 bg-primary/5 text-primary border-primary/30">
 <Clock className="h-2.5 w-2.5" />
 {countdown}
 </Badge>
 )}
 {board?.me && board.me.rank > 0 && (
 <Badge
 variant="outline"
 className={`text-[9px] gap-1 ${
 board.me.inTop
 ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
 : "bg-primary/5 text-primary border-primary/30"
 }`}
 >
 <Sparkles className="h-2.5 w-2.5" />
 رتبه شما: {toPersianDigits(board.me.rank)}
 </Badge>
 )}
 </div>
 </div>

 {/* سکو سه نفر اول با مبلغ جایزه */}
 <div className="grid grid-cols-3 gap-2 mb-3">
 {[0, 1, 2].map((i) => {
 const row = board?.leaders[i];
 const prize = board?.contest.prizes[i] ?? [20_000_000, 10_000_000, 10_000_000][i];
 return (
 <div
 key={i}
 className={`rounded-lg border p-2.5 text-center ${
 i === 0
 ? "border-amber-500/40 bg-amber-500/10"
 : i === 1
 ? "border-slate-400/40 bg-slate-400/10"
 : "border-orange-700/40 bg-orange-700/10"
 }`}
 >
 <div className="flex items-center justify-center mb-1">
 {i === 0 ? (
 <Crown className="h-4 w-4 text-amber-500" />
 ) : (
 <Medal className={`h-4 w-4 ${i === 1 ? "text-slate-400" : "text-orange-700"}`} />
 )}
 </div>
 <p className="text-[10px] text-muted-foreground">
 {i === 0 ? "نفر اول" : i === 1 ? "نفر دوم" : "نفر سوم"}
 </p>
 <p className="text-[11px] font-bold text-foreground mt-0.5 truncate">
 {row ? row.displayName : "—"}
 </p>
 <p className="text-[10px] font-bold text-amber-600 tnum mt-0.5">
 {formatCompactToman(prize)}
 </p>
 </div>
 );
 })}
 </div>

 {/* ردیف‌های لیدربورد ۱۰ نفر برتر */}
 {boardLoading ? (
 <div className="space-y-1.5">
 {Array.from({ length: 3 }).map((_, i) => (
 <Skeleton key={i} className="h-9 w-full rounded-lg" />
 ))}
 </div>
 ) : !board || board.leaders.length === 0 ? (
 <div className="rounded-lg border border-dashed border-border p-3 text-center">
 <Trophy className="h-6 w-6 text-muted-foreground/40 mx-auto mb-1.5" />
 <p className="text-xs text-muted-foreground">
 هنوز هیچ دعوت موفقی ثبت نشده — صندلی اول خالی است!
 </p>
 </div>
 ) : (
 <ScrollArea className="max-h-56">
 <div className="space-y-1">
 {board.leaders.slice(0, 10).map((row) => (
 <div
 key={row.rank}
 className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 ${
 row.isMe
 ? "border-primary/40 bg-primary/5"
 : "border-border bg-card"
 }`}
 >
 <div
 className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold shrink-0 ${
 row.rank === 1
 ? "bg-amber-500/15 text-amber-600"
 : row.rank === 2
 ? "bg-slate-400/15 text-slate-500"
 : row.rank === 3
 ? "bg-orange-700/15 text-orange-700"
 : "bg-muted text-muted-foreground"
 }`}
 >
 {toPersianDigits(row.rank)}
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-medium text-foreground truncate">
 {row.displayName}
 {row.isMe && <span className="text-primary"> (شما)</span>}
 </p>
 </div>
 <div className="flex items-center gap-1.5 shrink-0">
 {row.prizeToman > 0 && (
 <p className="text-[10px] text-muted-foreground tnum">
 {formatCompactToman(row.prizeToman)}
 </p>
 )}
 <p className="text-xs font-bold text-primary tnum">
 {toPersianDigits(row.referralCount)} دعوت
 </p>
 </div>
 </div>
 ))}
 </div>
 </ScrollArea>
 )}
 {board && board.me.rank > 0 && !board.me.inTop && (
 <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-center text-[11px]">
 رتبه شما: <span className="font-bold text-primary">{toPersianDigits(board.me.rank)}</span> — با{" "}
 <span className="font-bold text-foreground">{toPersianDigits(board.me.referralCount)}</span> دعوت موفق
 </div>
 )}
 </div>
 )}

 {/* لیست معرفی‌ها */}
 <div className="p-3">
 {loading? (
 <div className="space-y-2">
 {Array.from({ length: 3 }).map((_, i) => (
 <div key={i} className="flex items-center gap-3 p-3">
 <Skeleton className="h-10 w-10 rounded-full" />
 <div className="flex-1 space-y-1.5">
 <Skeleton className="h-3.5 w-40 rounded" />
 <Skeleton className="h-2.5 w-24 rounded" />
 </div>
 <Skeleton className="h-8 w-20 rounded" />
 </div>
 ))}
 </div>
 ): data.length === 0? (
 <div className="py-10 text-center">
 <Gift className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
 <p className="text-sm text-muted-foreground">
 هنوز کسی را دعوت نکرده‌اید.
 </p>
 <p className="text-xs text-muted-foreground/70 mt-1">
 اولین دعوت را با ایمیل دوستتان شروع کنید.
 </p>
 </div>
 ): (
 <ScrollArea className="max-h-96">
 <div className="space-y-1.5">
 {data.map((ref) => {
 const meta = STATUS_META[ref.status];
 const StatusIcon = meta.icon;
 return (
 <div
 key={ref.id}
 className="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:border-primary/30 hover:bg-primary/5 transition-colors"
 >
 {/* avatar */}
 <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
 {ref.refereeEmail.charAt(0).toUpperCase()}
 </div>

 {/* اطلاعات */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <p className="text-sm font-medium text-foreground truncate" dir="ltr">
 {ref.refereeEmail}
 </p>
 </div>
 <div className="flex items-center gap-2 mt-1">
 <code
 className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
 dir="ltr"
 >
 {ref.code}
 </code>
 <button
 onClick={() => handleCopy(ref.code)}
 className="text-muted-foreground hover:text-primary transition-colors"
 aria-label="کپی کد"
 >
 {copiedCode === ref.code? (
 <Check className="h-3 w-3 text-emerald-600" />
 ): (
 <Copy className="h-3 w-3" />
 )}
 </button>
 <Badge variant="outline" className={`text-[9px] gap-0.5 ${meta.color}`}>
 <StatusIcon className="h-2.5 w-2.5" />
 {meta.label}
 </Badge>
 </div>
 </div>

 {/* پاداش */}
 {ref.reward > 0 && (
 <div className="text-end shrink-0">
 <p className="text-xs font-bold text-emerald-600 tnum">
 {toPersianDigits(formatNumber(ref.reward))}
 </p>
 <p className="text-[9px] text-muted-foreground">تومان</p>
 </div>
 )}

 {/* اقدامات */}
 <div className="flex items-center gap-1 shrink-0">
 <Button
 size="icon"
 variant="ghost"
 className="h-7 w-7 text-sky-600 hover:bg-sky-500/10"
 onClick={() => handleShareTelegram(ref)}
 aria-label="اشتراک در تلگرام"
 title="تلگرام"
 >
 <Send className="h-3.5 w-3.5" />
 </Button>
 <Button
 size="icon"
 variant="ghost"
 className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
 onClick={() => handleShareWhatsApp(ref)}
 aria-label="اشتراک در واتساپ"
 title="واتساپ"
 >
 <MessageCircle className="h-3.5 w-3.5" />
 </Button>
 <Button
 size="icon"
 variant="ghost"
 className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
 onClick={() => handleCopyLink(ref)}
 aria-label="کپی لینک"
 title="کپی لینک"
 >
 <LinkIcon className="h-3.5 w-3.5" />
 </Button>
 <Button
 size="icon"
 variant="ghost"
 className="h-7 w-7 text-primary hover:bg-primary/10"
 onClick={() => handleShare(ref)}
 aria-label="اشتراک‌گذاری"
 title="اشتراک‌گذاری"
 >
 <Share2 className="h-3.5 w-3.5" />
 </Button>
 {ref.status === "PENDING" && (
 <Button
 size="icon"
 variant="ghost"
 className="h-7 w-7 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10"
 onClick={() => setDeleteId(ref.id)}
 aria-label="حذف"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </ScrollArea>
 )}
 </div>

 {/* دیالوگ تأیید حذف */}
 <AlertDialog open={!!deleteId} onOpenChange={(open) =>!open && setDeleteId(null)}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>حذف کد دعوت؟</AlertDialogTitle>
 <AlertDialogDescription>
 این کد دعوت برای همیشه حذف می‌شود و قابل بازگردانی نیست.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>انصراف</AlertDialogCancel>
 <AlertDialogAction
 onClick={handleDelete}
 className="bg-rose-600 hover:bg-rose-700 text-white"
 >
 حذف
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>

 {/* R14-D — دیالوگ درخواست برداشت از کیف پول (همان API ماژول کیف پول) */}
 <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
 <DialogContent dir="rtl" className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Banknote className="h-4 w-4 text-primary" />
 درخواست برداشت از کیف پول
 </DialogTitle>
 <DialogDescription>
 موجودی فعلی: {toPersianDigits(formatNumber(wallet?.balance ?? 0))} تومان — پس از بررسی
 پشتیبانی، مبلغ به‌صورت کارت‌به‌کارت یا شبا واریز می‌شود (معمولاً تا ۷۲ ساعت کاری).
 برداشت مشمول ۱۰٪ مالیات است.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3.5">
 <div className="space-y-1.5">
 <Label htmlFor="rw-amount" className="text-xs">
 مبلغ برداشت (تومان) — حداقل {toPersianDigits(formatNumber(wallet?.minWithdrawalToman ?? REFERRAL_MIN_WITHDRAWAL_TOMAN))} تومان
 </Label>
 <Input
 id="rw-amount"
 value={wdAmount}
 onChange={(e) => setWdAmount(e.target.value)}
 placeholder={String(wallet?.minWithdrawalToman ?? REFERRAL_MIN_WITHDRAWAL_TOMAN)}
 inputMode="numeric"
 disabled={withdrawSubmitting}
 />
 {(() => {
 const n = Number(String(wdAmount).replace(/[،,\s٬۰-۹]/g, (ch) => (/[۰-۹]/.test(ch) ? String(ch.charCodeAt(0) - 1776) : "")));
 if (!Number.isFinite(n) || n <= 0) return null;
 const tax = Math.round(n * 0.1);
 return (
 <p className="rounded-lg border border-border bg-card p-2 text-[11px] text-muted-foreground">
 مالیات برداشت (۱۰٪): <span className="tnum text-amber-600">−{toPersianDigits(formatNumber(tax))} تومان</span>
 {" — "}مبلغ خالص قابل واریز:{" "}
 <span className="tnum font-bold text-emerald-600">{toPersianDigits(formatNumber(Math.max(0, n - tax)))} تومان</span>
 </p>
 );
 })()}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="rw-card" className="text-xs">شماره کارت (۱۶ رقم)</Label>
 <div className="relative">
 <Landmark className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
 <Input
 id="rw-card"
 value={wdCard}
 onChange={(e) => setWdCard(e.target.value)}
 placeholder="۶۰۳۷۹۹۷۵۱۲۳۴۵۶۷۸"
 inputMode="numeric"
 className="pr-9"
 disabled={withdrawSubmitting}
 />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="rw-sheba" className="text-xs">یا شماره شبا (IR + ۲۴ رقم)</Label>
 {/* R14-J2 FIX: پلیس‌هولدر قبلی IR1234…234 checksum MOD-97 نداشت — کپی‌کردنش
     همیشه توسط اعتبارسنجی شبا رد می‌شد؛ نمونهٔ معتبر (checksum درست) جایگزین شد */}
 <Input
 id="rw-sheba"
 value={wdSheba}
 onChange={(e) => setWdSheba(e.target.value)}
 placeholder="IR820540102680020817909002"
 dir="ltr"
 disabled={withdrawSubmitting}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="rw-holder" className="text-xs">نام صاحب حساب *</Label>
 <Input
 id="rw-holder"
 value={wdHolder}
 onChange={(e) => setWdHolder(e.target.value)}
 placeholder="مثلاً: علی محمدی"
 disabled={withdrawSubmitting}
 />
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => setWithdrawOpen(false)} disabled={withdrawSubmitting}>
 انصراف
 </Button>
 <Button onClick={() => void submitWithdrawal()} disabled={withdrawSubmitting} className="gap-1.5">
 {withdrawSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
 ثبت درخواست برداشت
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </Card>
 );
}

// ============ stat tile ============
function StatTile({
 label,
 value,
 icon: Icon,
 accent,
}: {
 label: string;
 value: string | number;
 icon: React.ComponentType<{ className?: string }>;
 accent?: "primary" | "emerald" | "amber";
}) {
 const accentClass =
 accent === "emerald"
? "text-emerald-600"
: accent === "amber"
? "text-amber-600"
: "text-primary";
 return (
 <div className="bg-card px-4 py-3 flex items-center gap-2.5">
 <Icon className={`h-4 w-4 ${accentClass} shrink-0`} />
 <div className="min-w-0">
 <p className={`text-base font-bold leading-tight tnum truncate ${accentClass}`}>
 {typeof value === "number"? toPersianDigits(value): value}
 </p>
 <p className="text-[10px] text-muted-foreground leading-tight truncate">{label}</p>
 </div>
 </div>
 );
}

export default ReferralWidget;
