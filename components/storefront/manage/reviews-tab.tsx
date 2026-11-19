"use client";

// ═══ v20-D — تب مدیریت نظرات مشتریان فروشگاه (سمت مالک) ═══
// قرارداد (دست‌نخورده): export function ReviewsTab({ slug, onChanged })
// slug = اسلاگ فروشگاه (برای لینک راهنمای حالت خالی) — داده‌ها از مسیر manage می‌آیند.

import * as React from "react";
import {
  Loader2,
  Star,
  CheckCircle2,
  XCircle,
  Send,
  Trash2,
  MessageSquareQuote,
  ShoppingBag,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { toPersianDigits, formatJalaliDayLabel } from "@/lib/persian";

export interface ReviewsTabProps {
  slug: string;
  onChanged?: () => void;
}

interface ManageReview {
  id: string;
  authorName: string;
  rating: number;
  comment: string;
  reply: string | null;
  status: string;
  createdAt: string;
  productId: string | null;
  productName: string | null;
  customerEmail: string | null;
}

interface ReviewCounts {
  PENDING: number;
  APPROVED: number;
  REJECTED: number;
  ALL: number;
}

const STATUS_FA: Record<string, string> = {
  PENDING: "در انتظار تأیید",
  APPROVED: "تأییدشده",
  REJECTED: "ردشده",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "border-amber-300 bg-amber-50 text-amber-700",
  APPROVED: "border-emerald-300 bg-emerald-50 text-emerald-700",
  REJECTED: "border-zinc-300 bg-zinc-100 text-zinc-500",
};

/** ستاره‌های فقط-خواندنی (۱ تا ۵) */
function StarsReadonly({ value, className }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className ?? ""}`} aria-label={`امتیاز ${toPersianDigits(value)} از ۵`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export function ReviewsTab({ slug, onChanged }: ReviewsTabProps) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [statusTab, setStatusTab] = React.useState("ALL");
  const [reviews, setReviews] = React.useState<ManageReview[]>([]);
  const [counts, setCounts] = React.useState<ReviewCounts | null>(null);
  const [avgRating, setAvgRating] = React.useState(0);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [replying, setReplying] = React.useState<string | null>(null);
  const [replyText, setReplyText] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<ManageReview | null>(null);

  const load = React.useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res = await authFetch(
        `/api/storefront/manage/reviews${status !== "ALL" ? `?status=${status}` : ""}`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => null);
      if (json?.success) {
        setReviews(json.reviews ?? []);
        setCounts(json.counts ?? null);
        setAvgRating(typeof json.avgRating === "number" ? json.avgRating : 0);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load(statusTab);
  }, [load, statusTab]);

  /** تغییر وضعیت (تأیید/رد) + اطلاع به والد برای رفرش آمار */
  async function changeStatus(id: string, status: "APPROVED" | "REJECTED") {
    setBusyId(id);
    try {
      const res = await authFetch(`/api/storefront/manage/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "خطا", description: json?.error || "تغییر وضعیت ناموفق بود", variant: "destructive" });
        return;
      }
      toast({
        title: status === "APPROVED" ? "نظر تأیید شد" : "نظر رد شد",
        description: status === "APPROVED" ? "از این پس در صفحهٔ فروشگاه نمایش داده می‌شود" : "این نظر به مشتریان نمایش داده نمی‌شود",
      });
      onChanged?.();
      void load(statusTab);
    } catch {
      toast({ title: "خطای شبکه", description: "دوباره تلاش کنید", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  /** ثبت/ویرایش پاسخ مالک */
  async function sendReply(id: string) {
    const text = replyText.trim();
    if (!text) return;
    setBusyId(id);
    try {
      const res = await authFetch(`/api/storefront/manage/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: text }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "خطا", description: json?.error || "ثبت پاسخ ناموفق بود", variant: "destructive" });
        return;
      }
      toast({ title: "پاسخ ثبت شد", description: "پاسخ شما همراه نظر در فروشگاه نمایش داده می‌شود" });
      setReplying(null);
      setReplyText("");
      onChanged?.();
      void load(statusTab);
    } catch {
      toast({ title: "خطای شبکه", description: "دوباره تلاش کنید", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  /** حذف نظر (با تأیید) */
  async function removeReview(id: string) {
    setBusyId(id);
    try {
      const res = await authFetch(`/api/storefront/manage/reviews/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "خطا", description: json?.error || "حذف ناموفق بود", variant: "destructive" });
        return;
      }
      toast({ title: "نظر حذف شد" });
      setDeleteTarget(null);
      onChanged?.();
      void load(statusTab);
    } catch {
      toast({ title: "خطای شبکه", description: "دوباره تلاش کنید", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !counts) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── آمار: میانگین امتیاز + شمارنده‌ها ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="border-amber-200 bg-amber-50/60 sm:col-span-1">
          <CardContent className="flex flex-col items-center justify-center p-4 text-center">
            <span className="inline-flex items-center gap-1.5 text-3xl font-black tabular-nums text-amber-700">
              {toPersianDigits(avgRating.toFixed(1))}
              <Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden="true" />
            </span>
            <p className="mt-1 text-xs font-bold text-amber-700">میانگین امتیاز</p>
          </CardContent>
        </Card>
        {(
          [
            { key: "ALL", label: "همهٔ نظرات", cls: "" },
            { key: "PENDING", label: "در انتظار", cls: "border-amber-300 bg-amber-50/40 text-amber-800" },
            { key: "APPROVED", label: "تأییدشده", cls: "border-emerald-300 bg-emerald-50/40 text-emerald-800" },
            { key: "REJECTED", label: "ردشده", cls: "border-zinc-300 bg-zinc-50 text-zinc-600" },
          ] as const
        ).map((s) => (
          <Card key={s.key} className={s.cls}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-black tabular-nums">{toPersianDigits(counts?.[s.key] ?? 0)}</p>
              <p className="mt-1 text-xs font-bold text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── فیلتر وضعیت ── */}
      <Tabs value={statusTab} onValueChange={setStatusTab}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="ALL">همه ({toPersianDigits(counts?.ALL ?? 0)})</TabsTrigger>
          <TabsTrigger value="PENDING">در انتظار تأیید ({toPersianDigits(counts?.PENDING ?? 0)})</TabsTrigger>
          <TabsTrigger value="APPROVED">تأییدشده ({toPersianDigits(counts?.APPROVED ?? 0)})</TabsTrigger>
          <TabsTrigger value="REJECTED">ردشده ({toPersianDigits(counts?.REJECTED ?? 0)})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── لیست نظرات ── */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <MessageSquareQuote className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold">هنوز نظری در این وضعیت وجود ندارد</p>
          <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
            مشتریان از صفحهٔ هر کالا در فروشگاه شما نظر و امتیاز ثبت می‌کنند؛ نظرات پس از تأیید شما در همان صفحه
            نمایش داده می‌شوند.
          </p>
          {slug ? (
            <a
              href={`/shop/${encodeURIComponent(slug)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors hover:border-primary/50 hover:text-primary"
            >
              <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
              مشاهدهٔ فروشگاه
            </a>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <Card key={r.id} className={r.status === "PENDING" ? "border-amber-200" : ""}>
              <CardContent className="space-y-3 p-4">
                {/* سربرگ: نویسنده + تاریخ + وضعیت */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-sm font-bold">{r.authorName}</span>
                    <StarsReadonly value={r.rating} />
                    <span className="text-xs text-muted-foreground">{formatJalaliDayLabel(r.createdAt)}</span>
                    {r.customerEmail ? (
                      <span className="truncate text-xs text-muted-foreground" dir="ltr">
                        {r.customerEmail}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className={STATUS_COLOR[r.status] ?? ""}>
                      {STATUS_FA[r.status] ?? r.status}
                    </Badge>
                  </div>
                </div>

                {/* متن نظر */}
                <p className="whitespace-pre-line rounded-xl bg-muted/60 px-3 py-2.5 text-sm leading-7">{r.comment}</p>

                {/* کالای مرتبط */}
                {r.productName ? (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
                    <ShoppingBag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{r.productName}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    نظر کلی دربارهٔ فروشگاه
                  </span>
                )}

                {/* پاسخ مالک (نمایش/ویرایش) */}
                {r.reply && replying !== r.id ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      پاسخ شما
                    </p>
                    <p className="mt-1 text-sm leading-7 text-emerald-900">{r.reply}</p>
                  </div>
                ) : null}

                {/* فرم پاسخ درجا */}
                {replying === r.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      placeholder="پاسخ شما به مشتری (در کنار نظر نمایش داده می‌شود)..."
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => void sendReply(r.id)}
                        disabled={busyId === r.id || !replyText.trim()}
                        className="gap-1.5 rounded-full"
                      >
                        {busyId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Send className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        ثبت پاسخ
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setReplying(null);
                          setReplyText("");
                        }}
                        className="rounded-full"
                      >
                        انصراف
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {r.status === "PENDING" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void changeStatus(r.id, "APPROVED")}
                          disabled={busyId === r.id}
                          className="gap-1.5 rounded-full border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        >
                          {busyId === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          تأیید
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void changeStatus(r.id, "REJECTED")}
                          disabled={busyId === r.id}
                          className="gap-1.5 rounded-full border-zinc-300 text-zinc-600 hover:bg-zinc-100"
                        >
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          رد
                        </Button>
                      </>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReplying(r.id);
                        setReplyText(r.reply ?? "");
                      }}
                      className="gap-1.5 rounded-full"
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                      {r.reply ? "ویرایش پاسخ" : "پاسخ"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget(r)}
                      disabled={busyId === r.id}
                      className="gap-1.5 rounded-full text-red-600 hover:text-red-700"
                      aria-label={`حذف نظر ${r.authorName}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      حذف
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── تأیید حذف ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف نظر</AlertDialogTitle>
            <AlertDialogDescription>
              نظر «{deleteTarget?.authorName ?? ""}» برای همیشه حذف می‌شود. این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && void removeReview(deleteTarget.id)}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              حذف قطعی
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ReviewsTab;
