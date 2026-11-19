"use client";

// ═══════════════════════════════════════════════════════════════════
// R16 — سوپرادمین: داشبورد فروشگاه‌های آنلاین + کنترل ویجت رفرال داشبورد
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  Loader2,
  RefreshCw,
  Store as StoreIcon,
  ExternalLink,
  Eye,
  Users,
  ShoppingCart,
  Ticket as TicketIcon,
  Wand2,
  Globe,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  ShieldX,
  Crown,
  Power,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { toPersianDigits, formatJalaliDayLabel } from "@/lib/persian";
import { rialToTomanLabel } from "@/lib/storefront";
import { normalizePlanName, getPlanName } from "@/lib/plans-static";

interface AdminStore {
  id: string;
  slug: string;
  title: string;
  template: string;
  businessType: string | null;
  isActive: boolean;
  ticketEnabled: boolean;
  wizardDone: boolean;
  customDomain: string | null;
  views: number;
  orders: number;
  customers: number;
  openTickets: number;
  approvedRevenueRial: string;
  createdAt: string;
}

interface WidgetState {
  mode: "on" | "off" | "forced";
  hiddenCount: number;
  hiddenUsers: { id: string; email: string; name: string }[];
}

// Task 1-a — ردیف کنترل دسترسی هر کسب‌وکار (از GET /api/platform/storefront-admin)
interface AccessRow {
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  plan: string;
  storefront: { slug: string; title: string; isActive: boolean } | null;
  owner: {
    userId: string;
    name: string;
    email: string;
    role: string;
    storefrontOverride: "granted" | "denied" | null;
  } | null;
  access: { allowed: boolean; reason: string; plan?: string } | null;
  userCount: number;
}

const ACCESS_BADGES: Record<string, { label: string; className: string }> = {
  plan_ok: {
    label: "مجاز (پلن)",
    className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  override_granted: {
    label: "مجاز (دسترسی ویژه)",
    className: "border-emerald-400 bg-emerald-100 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  override_denied: {
    label: "مسدود توسط مدیر",
    className: "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400",
  },
  master_off: {
    label: "خاموش در کل سامانه",
    className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
  },
  plan_required: {
    label: "نیازمند پلن حرفه‌ای",
    className: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300",
  },
};

export function StorefrontAdminTab({ token }: { token?: string | null }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [stores, setStores] = React.useState<AdminStore[]>([]);
  const [totals, setTotals] = React.useState<Record<string, number | string> | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // ویجت رفرال
  const [widget, setWidget] = React.useState<WidgetState | null>(null);
  const [widgetModeBusy, setWidgetModeBusy] = React.useState(false);

  // Task 1-a — کنترل دسترسی فروشگاه آنلاین
  const [accessRows, setAccessRows] = React.useState<AccessRow[]>([]);
  const [masterEnabled, setMasterEnabled] = React.useState(true);
  const [overrideBusyId, setOverrideBusyId] = React.useState<string | null>(null);
  const [masterBusy, setMasterBusy] = React.useState(false);
  const [confirmMaster, setConfirmMaster] = React.useState<null | { enabled: boolean }>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [resStores, resWidget] = await Promise.all([
        fetch("/api/platform/storefront-admin", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        }),
        fetch("/api/platform/referral-widget", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        }),
      ]);
      const jStores = await resStores.json().catch(() => null);
      if (jStores?.success) {
        setStores(jStores.stores ?? []);
        setTotals(jStores.totals ?? null);
        // Task 1-a — ردیف‌های دسترسی + کلید اصلی
        setAccessRows(Array.isArray(jStores.accessRows) ? jStores.accessRows : []);
        setMasterEnabled(jStores.masterEnabled !== false);
      }
      const jWidget = await resWidget.json().catch(() => null);
      if (jWidget?.success) {
        setWidget({ mode: jWidget.mode, hiddenCount: jWidget.hiddenCount ?? 0, hiddenUsers: jWidget.hiddenUsers ?? [] });
      }
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function toggleStore(s: AdminStore, field: "isActive" | "ticketEnabled") {
    setBusyId(s.id);
    try {
      const res = await fetch("/api/platform/storefront-admin", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ storefrontId: s.id, [field]: !s[field] }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "تغییر ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      setStores((prev) => prev.map((x) => (x.id === s.id ? { ...x, [field]: !s[field] } : x)));
      toast({ title: "ذخیره شد" });
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function setWidgetMode(mode: "on" | "off" | "forced") {
    setWidgetModeBusy(true);
    try {
      const res = await fetch("/api/platform/referral-widget", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mode }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ذخیره ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      setWidget((w) => (w ? { ...w, mode } : w));
      toast({ title: "حالت ویجت رفرال ذخیره شد" });
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setWidgetModeBusy(false);
    }
  }

  async function resetHiddenUsers(all: boolean, userIds?: string[]) {
    try {
      const res = await fetch("/api/platform/referral-widget", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(all ? { resetAll: true } : { resetUserIds: userIds }),
      });
      const json = await res.json().catch(() => null);
      if (json?.success) {
        toast({ title: "انجام شد", description: `ویجت برای ${toPersianDigits(json.changes?.resetAll ?? json.changes?.resetUsers ?? 0)} کاربر دوباره فعال شد` });
        void load();
      }
    } catch {
      /* ignore */
    }
  }

  // ═══ Task 1-a — تغییر دسترسی ویژهٔ یک کاربر (۳ حالته) ═══
  async function setOverride(row: AccessRow, value: "granted" | "denied" | null) {
    if (!row.owner) return;
    const userId = row.owner.userId;
    setOverrideBusyId(userId);
    try {
      const res = await fetch("/api/platform/storefront-admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: "set_override", userId, value }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ذخیره ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      // به‌روزرسانی موضعی ردیف (بدون reload کامل)
      setAccessRows((prev) =>
        prev.map((r) =>
          r.tenantId === row.tenantId && r.owner
            ? { ...r, owner: { ...r.owner, storefrontOverride: value }, access: json.access ?? r.access }
            : r
        )
      );
      toast({
        title: json.message ?? "ذخیره شد",
        description: row.owner.name,
      });
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setOverrideBusyId(null);
    }
  }

  // ═══ Task 1-a — تغییر کلید اصلی سامانه (با تأیید) ═══
  async function applyMaster(enabled: boolean) {
    setMasterBusy(true);
    try {
      const res = await fetch("/api/platform/storefront-admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: "set_master", enabled }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "تغییر ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      setMasterEnabled(json.masterEnabled === true);
      // دسترسی مؤثر همهٔ ردیف‌ها تغییر می‌کند — بازخوانی کامل از سرور
      void load();
      toast({ title: json.message ?? "ذخیره شد", variant: !enabled ? "destructive" : undefined });
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setMasterBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI ها */}
      {totals ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "فروشگاه فعال", value: toPersianDigits(Number(totals.active)), icon: StoreIcon },
            { label: "کل فروشگاه‌ها", value: toPersianDigits(Number(totals.stores)), icon: Globe },
            { label: "سفارش تأییدشده", value: toPersianDigits(Number(totals.orders)), icon: ShoppingCart },
            { label: "بازدید کل", value: toPersianDigits(Number(totals.views)), icon: Eye },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <k.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xl font-black tabular-nums">{k.value}</p>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
      {totals ? (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-4 text-sm">
            <span className="font-bold text-emerald-800">درآمد تأییدشدهٔ فروشگاه‌ها:</span>{" "}
            <span className="font-black tabular-nums text-emerald-700">{rialToTomanLabel(String(totals.revenueRial))}</span>
            <span className="ms-4 text-muted-foreground">مشتری: {toPersianDigits(Number(totals.customers))} — تیکت باز: {toPersianDigits(Number(totals.openTickets))}</span>
          </CardContent>
        </Card>
      ) : null}

      {/* کنترل ویجت رفرال داشبورد (R16) */}
      {widget ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Wand2 className="h-4 w-4 text-primary" aria-hidden="true" />
              ویجت رفرال داشبورد کاربران
              <Badge variant="outline" className="rounded-full">
                {widget.mode === "on" ? "روشن — کاربر می‌تواند ببندد" : widget.mode === "off" ? "خاموش برای همه" : "اجباری — بدون دکمهٔ بستن"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">حالت نمایش:</span>
              <div className="w-56">
                <Select value={widget.mode} onValueChange={(v) => void setWidgetMode(v as "on" | "off" | "forced")} disabled={widgetModeBusy}>
                  <SelectTrigger dir="rtl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on">روشن (پیش‌فرض — با ضربدرِ بستن)</SelectItem>
                    <SelectItem value="off">خاموش برای همه</SelectItem>
                    <SelectItem value="forced">اجباری (کمپین ویژه)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {widget.hiddenCount > 0 ? (
                <Button variant="outline" size="sm" onClick={() => void resetHiddenUsers(true)} className="gap-1.5 rounded-full">
                  <ToggleRight className="h-4 w-4" aria-hidden="true" />
                  دوباره نمایش برای {toPersianDigits(widget.hiddenCount)} کاربرِ بسته‌شده
                </Button>
              ) : null}
            </div>
            {widget.hiddenUsers.length > 0 ? (
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="text-xs font-bold text-muted-foreground">کاربرانی که ویجت را بسته‌اند:</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {widget.hiddenUsers.slice(0, 20).map((u) => (
                    <li key={u.id} className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-xs">
                      <span>{u.name || u.email}</span>
                      <button
                        type="button"
                        onClick={() => void resetHiddenUsers(false, [u.id])}
                        className="text-primary hover:underline"
                        aria-label={`فعال‌سازی دوباره برای ${u.email}`}
                      >
                        فعال‌سازی
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-xs leading-6 text-muted-foreground">
              پاداش رفرال از R16 فقط وقتی واریز می‌شود که دعوت‌شده لایسنس بخرد و پرداختش تأیید شود (زرین‌پال verify/اقساط).
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* ═══ Task 1-a — کنترل دسترسی فروشگاه آنلاین (هر کاربر + کلید اصلی) ═══ */}
      <Card id="storefront-access-control">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            کنترل دسترسی فروشگاه آنلاین
            <Badge
              variant="outline"
              className={`rounded-full ${
                masterEnabled
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400"
              }`}
            >
              {masterEnabled ? "روشن در کل سامانه" : "خاموش در کل سامانه"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* کلید اصلی سامانه */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3">
            <div className="flex items-center gap-3">
              <Power className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <Label htmlFor="sf-master-switch" className="text-sm font-bold">
                  فعال بودن فروشگاه آنلاین در کل سامانه
                </Label>
                <p className="text-xs leading-5 text-muted-foreground">
                  {masterEnabled
                    ? "کاربران پلن حرفه‌ای/سازمانی یا دارای دسترسی ویژه می‌توانند فروشگاه خود را عمومی کنند."
                    : "تا روشن نشود، هیچ کاربری نمی‌تواند فروشگاه را عمومی کند — ساخت و پیش‌نمایش سایت آزاد می‌ماند."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {masterBusy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
              <Switch
                id="sf-master-switch"
                checked={masterEnabled}
                disabled={masterBusy}
                onCheckedChange={(v) => setConfirmMaster({ enabled: v })}
                aria-label="فعال بودن فروشگاه آنلاین در کل سامانه"
              />
            </div>
          </div>

          {/* جدول دسترسی هر کسب‌وکار — اسکرول افقی در موبایل */}
          {accessRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              هنوز کسب‌وکاری ثبت نشده است.
            </div>
          ) : (
            <div className="max-h-96 overflow-auto rounded-xl border" dir="rtl">
              <Table className="min-w-[760px]">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="text-right">کاربر / کسب‌وکار</TableHead>
                    <TableHead className="text-right">پلن</TableHead>
                    <TableHead className="text-right">وضعیت فروشگاه</TableHead>
                    <TableHead className="text-right">دسترسی مؤثر</TableHead>
                    <TableHead className="text-right">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accessRows.map((row) => {
                    const badge = row.access ? ACCESS_BADGES[row.access.reason] ?? ACCESS_BADGES.plan_required : null;
                    return (
                      <TableRow key={row.tenantId}>
                        <TableCell>
                          <p className="font-bold">{row.owner?.name ?? "—"}</p>
                          {row.owner ? (
                            <p className="text-xs text-muted-foreground" dir="ltr">{row.owner.email}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">کاربری ثبت نشده</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {row.tenantName}
                            {row.userCount > 1 ? ` — ${toPersianDigits(row.userCount)} کاربر` : ""}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1 rounded-full">
                            {normalizePlanName(row.plan) === "pro" || normalizePlanName(row.plan) === "enterprise" ? (
                              <Crown className="h-3 w-3 text-amber-600" aria-hidden="true" />
                            ) : null}
                            {getPlanName(normalizePlanName(row.plan))}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {row.storefront ? (
                            <div className="space-y-1">
                              <Badge
                                variant="outline"
                                className={`rounded-full ${
                                  row.storefront.isActive
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400"
                                    : ""
                                }`}
                              >
                                {row.storefront.isActive ? "عمومی" : "غیرفعال"}
                              </Badge>
                              <p className="text-xs text-muted-foreground" dir="ltr">/{row.storefront.slug}</p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">ساخته نشده</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {badge ? (
                            <Badge variant="outline" className={`rounded-full ${badge.className}`}>
                              {row.access?.reason === "override_granted" ? <ShieldCheck className="h-3 w-3" aria-hidden="true" /> : null}
                              {row.access?.reason === "override_denied" ? <ShieldX className="h-3 w-3" aria-hidden="true" /> : null}
                              {badge.label}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.owner ? (
                            <div className="w-44">
                              <Select
                                value={row.owner.storefrontOverride ?? "plan"}
                                onValueChange={(v) => void setOverride(row, v === "plan" ? null : (v as "granted" | "denied"))}
                                disabled={overrideBusyId === row.owner.userId}
                              >
                                <SelectTrigger dir="rtl" aria-label={`دسترسی فروشگاه آنلاین ${row.owner.name}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="plan">پیش‌فرض پلن</SelectItem>
                                  <SelectItem value="granted">✅ دسترسی ویژه</SelectItem>
                                  <SelectItem value="denied">⛔ مسدود</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-xs leading-6 text-muted-foreground">
            «پیش‌فرض پلن» یعنی دسترسی از پلن کسب‌وکار ارث می‌برد (حرفه‌ای و سازمانی مجازند). «دسترسی ویژه» حتی بدون پلن مجاز می‌کند و «مسدود» حتی با پلن حرفه‌ای جلوی عمومی‌سازی را می‌گیرد.
          </p>
        </CardContent>
      </Card>

      {/* تأیید تغییر کلید اصلی سامانه */}
      <AlertDialog open={confirmMaster !== null} onOpenChange={(o) => (!o ? setConfirmMaster(null) : undefined)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmMaster?.enabled ? "فعال‌سازی فروشگاه آنلاین در کل سامانه؟" : "خاموش‌کردن فروشگاه آنلاین در کل سامانه؟"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMaster?.enabled
                ? "کاربران دارای پلن حرفه‌ای/سازمانی یا دسترسی ویژه از این لحظه می‌توانند فروشگاه خود را عمومی کنند."
                : "فعال‌سازی عمومی برای همهٔ کاربران مسدود می‌شود — ساخت سایت و پیش‌نمایش آزاد می‌ماند و فروشگاه‌های عمومی فعلی به کار خود ادامه می‌دهند."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const c = confirmMaster;
                setConfirmMaster(null);
                if (c) void applyMaster(c.enabled);
              }}
            >
              تأیید
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* فهرست فروشگاه‌ها */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-black">فروشگاه‌ها ({toPersianDigits(stores.length)})</h3>
        <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5 rounded-full">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          به‌روزرسانی
        </Button>
      </div>

      {stores.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          هنوز فروشگاهی ساخته نشده است.
        </div>
      ) : (
        <div className="space-y-2.5">
          {stores.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.isActive ? "bg-emerald-100 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                  <StoreIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-[180px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-extrabold">{s.title}</p>
                    {s.customDomain ? (
                      <Badge variant="outline" className="rounded-full text-[10px]">{s.customDomain}</Badge>
                    ) : null}
                    {s.wizardDone ? (
                      <Badge variant="outline" className="rounded-full border-violet-300 bg-violet-50 text-[10px] text-violet-700">
                        <Wand2 className="h-3 w-3" aria-hidden="true" />
                        ویزارد
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    /{s.slug} — قالب {s.template}{s.businessType ? ` — صنف ${s.businessType}` : ""} — {formatJalaliDayLabel(s.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    {toPersianDigits(s.views)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
                    {toPersianDigits(s.orders)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    {toPersianDigits(s.customers)}
                  </span>
                  {s.openTickets > 0 ? (
                    <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                      <TicketIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {toPersianDigits(s.openTickets)}
                    </span>
                  ) : null}
                  <span className="font-black tabular-nums text-emerald-700">{rialToTomanLabel(s.approvedRevenueRial)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === s.id}
                    onClick={() => void toggleStore(s, "isActive")}
                    className="gap-1.5 rounded-full"
                  >
                    {busyId === s.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : s.isActive ? (
                      <ToggleRight className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <ToggleLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {s.isActive ? "فعال" : "غیرفعال"}
                  </Button>
                  <a
                    href={`/shop/${s.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors hover:bg-muted"
                    aria-label={`مشاهدهٔ فروشگاه ${s.title}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
