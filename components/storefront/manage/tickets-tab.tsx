"use client";

// R16 — تیکت‌های پشتیبانی مشتریان فروشگاه (سمت مالک)

import * as React from "react";
import { Loader2, Ticket as TicketIcon, Send, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits, formatJalaliDayLabel } from "@/lib/persian";

interface SfTicket {
  id: string;
  customerEmail: string;
  customerName: string;
  subject: string;
  message: string;
  reply: string | null;
  status: string;
  createdAt: string;
}

const STATUS_FA: Record<string, string> = {
  OPEN: "باز",
  ANSWERED: "پاسخ داده شد",
  CLOSED: "بسته",
};

const STATUS_COLOR: Record<string, string> = {
  OPEN: "border-amber-300 bg-amber-50 text-amber-700",
  ANSWERED: "border-emerald-300 bg-emerald-50 text-emerald-700",
  CLOSED: "border-zinc-300 bg-zinc-100 text-zinc-500",
};

export function StorefrontTicketsTab() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [tickets, setTickets] = React.useState<SfTicket[]>([]);
  const [stats, setStats] = React.useState<{ open: number; answered: number; closed: number; total: number } | null>(null);
  const [enabled, setEnabled] = React.useState(false);
  const [replying, setReplying] = React.useState<string | null>(null);
  const [replyText, setReplyText] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/storefront/manage/tickets");
      const json = await res.json().catch(() => null);
      if (json?.success) {
        setTickets(json.tickets ?? []);
        setStats(json.stats ?? null);
        setEnabled(!!json.enabled);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function sendReply(ticketId: string) {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      const res = await authFetch("/api/storefront/manage/tickets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, reply: replyText.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ارسال ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      toast({ title: "پاسخ ثبت شد" });
      setReplying(null);
      setReplyText("");
      void load();
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  async function closeTicket(ticketId: string) {
    try {
      const res = await authFetch("/api/storefront/manage/tickets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, status: "CLOSED" }),
      });
      const json = await res.json().catch(() => null);
      if (json?.success) {
        toast({ title: "تیکت بسته شد" });
        void load();
      }
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center">
        <TicketIcon className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
        <p className="mt-3 text-sm font-bold">تیکت پشتیبانی فروشگاه شما فعال نیست</p>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          از تب «تنظیمات» گزینهٔ «تیکت پشتیبانی مشتریان» را روشن کنید تا مشتریان بتوانند برای شما تیکت بزنند
          و پاسخ شما به ایمیلشان ارسال شود.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stats ? (
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-amber-200 bg-amber-50/60">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-black tabular-nums text-amber-700">{toPersianDigits(stats.open)}</p>
              <p className="mt-1 text-xs font-bold text-amber-700">تیکت باز</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-emerald-50/60">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-black tabular-nums text-emerald-700">{toPersianDigits(stats.answered)}</p>
              <p className="mt-1 text-xs font-bold text-emerald-700">پاسخ داده‌شده</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-black tabular-nums">{toPersianDigits(stats.closed)}</p>
              <p className="mt-1 text-xs font-bold text-muted-foreground">بسته</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tickets.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          هنوز تیکتی از مشتریان ثبت نشده است.
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <TicketIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                    {t.subject}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={STATUS_COLOR[t.status] ?? ""}>
                      {STATUS_FA[t.status] ?? t.status}
                    </Badge>
                    {t.status !== "CLOSED" ? (
                      <Button variant="ghost" size="sm" onClick={() => void closeTicket(t.id)} className="h-7 gap-1 rounded-full px-2 text-xs">
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        بستن
                      </Button>
                    ) : null}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.customerName} — <span dir="ltr">{t.customerEmail}</span> — {formatJalaliDayLabel(t.createdAt)}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-sm leading-7">{t.message}</p>
                {t.reply ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      پاسخ شما
                    </p>
                    <p className="mt-1 text-sm leading-7 text-emerald-900">{t.reply}</p>
                  </div>
                ) : replying === t.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="پاسخ شما به مشتری..."
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void sendReply(t.id)} disabled={sending || !replyText.trim()} className="gap-1.5 rounded-full">
                        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
                        ارسال پاسخ
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setReplying(null); setReplyText(""); }} className="rounded-full">
                        انصراف
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => { setReplying(t.id); setReplyText(""); }} className="gap-1.5 rounded-full">
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    پاسخ به مشتری
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
