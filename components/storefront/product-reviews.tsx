"use client";

// ═══ v20-D — امتیاز و نظرات مشتریان (سمت عمومی فروشگاه) ═══
// روی صفحهٔ تک‌محصول و دیالوگ نمایش سریع کالا رندر می‌شود.
// فقط نظرات تأییدشده (APPROVED) از GET /api/storefront/[slug]/reviews می‌آید؛
// ثبت نظر همیشه باز است (میهمان هم می‌تواند) و پس از تأیید مالک منتشر می‌شود.

import * as React from "react";
import { Loader2, Send, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatJalaliDayLabel } from "@/lib/persian";

export interface ProductReviewsProps {
  slug: string;
  productId: string;
  productName?: string;
  /** حالت فشرده برای دیالوگ نمایش سریع — لیست با اسکرول داخلی */
  compact?: boolean;
}

interface PublicReview {
  id: string;
  authorName: string;
  rating: number;
  comment: string;
  reply: string | null;
  createdAt: string;
  product: { id: string; name: string } | null;
}

interface PublicReviewsResponse {
  success: boolean;
  reviews?: PublicReview[];
  aggregate?: { count: number; avg: number };
  error?: string;
}

/** ستاره‌های فقط-خواندنی */
function StarsReadonly({ value }: { value: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`امتیاز ${toPersianDigits(value)} از ۵ ستاره`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

const SCROLLBAR_CLS =
  "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30";

export function ProductReviews({ slug, productId, productName, compact }: ProductReviewsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [reviews, setReviews] = React.useState<PublicReview[]>([]);
  const [aggregate, setAggregate] = React.useState<{ count: number; avg: number }>({ count: 0, avg: 0 });

  // فرم ثبت نظر
  const [rating, setRating] = React.useState(0);
  const [hoverRating, setHoverRating] = React.useState(0);
  const [authorName, setAuthorName] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(
        `/api/storefront/${encodeURIComponent(slug)}/reviews?productId=${encodeURIComponent(productId)}`,
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => null)) as PublicReviewsResponse | null;
      if (json?.success) {
        setReviews(json.reviews ?? []);
        setAggregate(json.aggregate ?? { count: 0, avg: 0 });
      }
    } catch {
      /* بی‌صدا — بخش نظرات نباید صفحهٔ کالا را بشکند */
    } finally {
      setLoading(false);
    }
  }, [slug, productId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (rating < 1) {
      toast({ title: "امتیاز انتخاب نشده", description: "لطفاً بین ۱ تا ۵ ستاره امتیاز دهید", variant: "destructive" });
      return;
    }
    if (authorName.trim().length < 2) {
      toast({ title: "نام نامعتبر", description: "نام شما باید حداقل ۲ نویسه باشد", variant: "destructive" });
      return;
    }
    if (comment.trim().length < 5) {
      toast({ title: "متن نظر کوتاه است", description: "متن نظر باید حداقل ۵ نویسه باشد", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/storefront/${encodeURIComponent(slug)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, authorName: authorName.trim(), rating, comment: comment.trim() }),
      });
      const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string; message?: string } | null;
      if (!res.ok || !json?.success) {
        toast({ title: "ثبت نظر ناموفق بود", description: json?.error || "دوباره تلاش کنید", variant: "destructive" });
        return;
      }
      toast({
        title: "نظر شما ثبت شد",
        description: json?.message || "پس از تأیید مالک فروشگاه نمایش داده می‌شود",
      });
      // ریست فرم — نظر تازه همچنان PENDING است و در لیست نمی‌آید
      setRating(0);
      setHoverRating(0);
      setAuthorName("");
      setComment("");
    } catch {
      toast({ title: "خطای شبکه", description: "دوباره تلاش کنید", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const displayRating = hoverRating || rating;

  return (
    <section aria-labelledby="product-reviews" className={compact ? "" : "mt-12"}>
      <h2 id="product-reviews" className="mb-4 flex items-center gap-2 text-lg font-extrabold text-foreground">
        <Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden="true" />
        امتیاز و نظرات
        {productName ? <span className="text-sm font-medium text-muted-foreground">({productName})</span> : null}
      </h2>

      <div className="rounded-2xl border bg-card p-4 sm:p-5">
        {/* ── خلاصهٔ امتیازها ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black tabular-nums text-amber-600">
              {toPersianDigits(aggregate.avg > 0 ? aggregate.avg.toFixed(1) : "۰")}
            </span>
            <span className="text-xs text-muted-foreground">از ۵</span>
          </div>
          <div className="flex items-center gap-2">
            <StarsReadonly value={Math.round(aggregate.avg)} />
            <span className="text-xs text-muted-foreground">
              {aggregate.count > 0
                ? `${toPersianDigits(aggregate.count)} نظر تأییدشده`
                : "هنوز نظری تأیید نشده است"}
            </span>
          </div>
        </div>

        {/* ── لیست نظرات تأییدشده ── */}
        <div className={`mt-4 space-y-3 ${compact ? `max-h-64 overflow-y-auto overscroll-contain pe-1 ${SCROLLBAR_CLS}` : ""}`}>
          {loading ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : reviews.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm leading-7 text-muted-foreground">
              هنوز نظری برای این کالا ثبت نشده است — اولین نفری باشید که نظر می‌دهد.
            </p>
          ) : (
            reviews.map((r) => (
              <article key={r.id} className="rounded-xl border bg-background p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{r.authorName}</span>
                    <StarsReadonly value={r.rating} />
                  </div>
                  <time className="text-xs text-muted-foreground" dateTime={r.createdAt}>
                    {formatJalaliDayLabel(r.createdAt)}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-7 text-foreground/90">{r.comment}</p>
                {r.reply ? (
                  <div className="mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <p className="text-xs font-bold text-emerald-700">پاسخ فروشگاه</p>
                    <p className="mt-1 text-sm leading-7 text-emerald-900">{r.reply}</p>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>

        {/* ── فرم ثبت نظر (همیشه باز — میهمان هم می‌تواند) ── */}
        <form onSubmit={submitReview} className="mt-5 space-y-3 border-t pt-4" dir="rtl">
          <p className="text-sm font-bold text-foreground">ثبت نظر شما</p>

          {/* انتخابگر ستارهٔ تعاملی */}
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">امتیاز شما</span>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="انتخاب امتیاز از ۱ تا ۵">
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={rating === i}
                  aria-label={`${toPersianDigits(i)} ستاره`}
                  onClick={() => setRating(i)}
                  onMouseEnter={() => setHoverRating(i)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="rounded-md p-0.5 transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/60"
                >
                  <Star
                    className={`h-6 w-6 transition-colors ${
                      i <= displayRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50"
                    }`}
                    aria-hidden="true"
                  />
                </button>
              ))}
              {rating > 0 ? (
                <span className="ms-2 text-xs font-semibold text-muted-foreground">
                  {toPersianDigits(rating)} از ۵
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`rv-name-${productId}`} className="text-xs">
                نام شما
              </Label>
              <Input
                id={`rv-name-${productId}`}
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                maxLength={60}
                placeholder="مثلاً: مریم احمدی"
                required
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor={`rv-comment-${productId}`} className="text-xs">
                متن نظر
              </Label>
              <Textarea
                id={`rv-comment-${productId}`}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="تجربهٔ خود از این کالا را بنویسید..."
                className="resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] leading-5 text-muted-foreground">
              نظر شما پس از تأیید مالک فروشگاه منتشر می‌شود.
            </p>
            <Button type="submit" size="sm" disabled={submitting} className="gap-1.5 rounded-xl font-bold">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              ثبت نظر
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

export default ProductReviews;
