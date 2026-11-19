"use client";

// ═══════════════════════════════════════════════════════════════════
// R26 — دیالوگ «تاریخچهٔ تغییرات» فروشگاه (مشترک همهٔ ویرایشگرها)
//  - ویرایش روی سایت (?edit=1) با توکن نشست مالک
//  - ویرایشگر بصری پنل و ویرایشگر بلوکی با authFetch
// هر نسخه: زمان نسبی فارسی + نوع (ویرایشگر/انتشار بلوکی) + خلاصهٔ تغییرات
// + دکمهٔ «بازگردانی» (با تأیید دومرحله‌ای). پس از بازگردانی محتوای کلاسیک،
// سایت از state محلی به‌روز می‌شود (بدون رفرش کامل).
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import { History, Loader2, RotateCcw, FileText, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits } from "@/lib/persian";
import { useToast } from "@/hooks/use-toast";

export interface StorefrontRevisionRow {
  id: string;
  label: string | null;
  kind: string; // "blocks" | "content"
  blockCount: number;
  createdAt: string;
  changes: string[];
}

/** زمان نسبی فارسی — «۲ ساعت پیش» */
export function relativeTimeFa(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "همین حالا";
  if (min < 60) return `${toPersianDigits(min)} دقیقه پیش`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${toPersianDigits(hr)} ساعت پیش`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${toPersianDigits(day)} روز پیش`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${toPersianDigits(week)} هفته پیش`;
  // قدیمی‌تر — تاریخ شمسی
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return `${toPersianDigits(Math.floor(day / 30))} ماه پیش`;
  }
}

export function StorefrontRevisionsDialog({
  open,
  onOpenChange,
  onRestored,
  /** حالت روی سایت: تابعی که توکن نشست مالک را برمی‌گرداند (localStorage) */
  getToken,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** پس از بازگردانی موفق — فراخواننده سایت/state را به‌روز می‌کند */
  onRestored?: (kind: "content" | "blocks") => void;
  getToken?: () => string | null;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<StorefrontRevisionRow[]>([]);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = getToken
        ? await fetch("/api/storefront/manage/blocks/revisions", {
            cache: "no-store",
            ...(getToken() ? { headers: { Authorization: `Bearer ${getToken()}` } } : {}),
          })
        : await authFetch("/api/storefront/manage/blocks/revisions", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (json?.success && Array.isArray(json.revisions)) {
        setRows(json.revisions as StorefrontRevisionRow[]);
      } else {
        toast({ title: "دریافت تاریخچه ناموفق", description: json?.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, getToken]);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function restore(id: string) {
    setRestoringId(id);
    try {
      const res = getToken
        ? await fetch("/api/storefront/manage/blocks/revisions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
            },
            body: JSON.stringify({ id }),
          })
        : await authFetch("/api/storefront/manage/blocks/revisions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "بازگردانی ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      toast({ title: "بازگردانی شد", description: json.message });
      setConfirmId(null);
      onOpenChange(false);
      onRestored?.(json.restored === "content" ? "content" : "blocks");
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg p-0" dir="rtl">
        <DialogHeader className="border-b px-5 py-4 text-right">
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" aria-hidden="true" />
            تاریخچهٔ تغییرات
          </DialogTitle>
          <DialogDescription>
            هر ذخیره و انتشار، یک نسخهٔ پشتیبان می‌سازد — می‌توانید هر نسخه را بازگردانی کنید.
            (حداکثر ۳۰ نسخهٔ آخر نگه داشته می‌شود)
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              در حال بارگذاری…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              هنوز نسخه‌ای ثبت نشده — با اولین ذخیره، تاریخچه شروع می‌شود.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {rows.map((r) => {
                const isContent = r.kind === "content";
                const restoring = restoringId === r.id;
                const confirming = confirmId === r.id;
                return (
                  <li key={r.id} className="rounded-2xl border p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          isContent
                            ? "gap-1 rounded-full border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700"
                            : "gap-1 rounded-full border-amber-300 bg-amber-50 text-[10px] text-amber-800"
                        }
                      >
                        {isContent ? <FileText className="h-3 w-3" aria-hidden="true" /> : <Layers className="h-3 w-3" aria-hidden="true" />}
                        {isContent ? "ویرایشگر سایت" : "انتشار بلوکی"}
                      </Badge>
                      <span className="text-xs font-bold text-foreground">{relativeTimeFa(r.createdAt)}</span>
                      <span className="mr-auto text-[10px] text-muted-foreground" dir="ltr">
                        {r.label ?? ""}
                      </span>
                    </div>
                    {r.changes.length > 0 ? (
                      <p className="mt-2 text-xs leading-6 text-muted-foreground">
                        تغییرات: {r.changes.join("، ")}
                      </p>
                    ) : null}
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {isContent ? "" : `${toPersianDigits(r.blockCount)} بلوک`}
                      </span>
                      <Button
                        size="sm"
                        variant={confirming ? "default" : "outline"}
                        className="h-8 gap-1.5 rounded-full px-3"
                        disabled={restoring}
                        onClick={() => {
                          if (confirming) void restore(r.id);
                          else setConfirmId(r.id);
                        }}
                      >
                        {restoring ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {restoring ? "در حال بازگردانی…" : confirming ? "تأیید بازگردانی؟" : "بازگردانی"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
