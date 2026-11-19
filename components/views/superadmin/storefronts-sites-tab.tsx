"use client";

// ═══════════════════════════════════════════════════════════════════
// Task 3-d — سوپرادمین: تب «فروشگاه‌ها و سایت‌ها»
// مدیریت سایت‌هایی که مشتریان ساخته‌اند: مشاهدهٔ اسلاگ/دامنهٔ اختصاصی،
// تعلیق (۵۰۳ روی سایت عمومی)، فعال‌سازی، آزادسازی دامنه/زیردامنه و حذف کامل
// با تأیید دومرحله‌ای. متصل به /api/platform/storefronts
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Globe,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  Store as StoreIcon,
  Trash2,
  Unlock,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

// ─── انواع ───
interface SiteRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantStatus: string | null;
  plan: string | null;
  tenantPhone: string | null;
  ownerEmail: string | null;
  title: string;
  slug: string;
  customDomain: string | null;
  status: "active" | "suspended" | string;
  suspendedAt: string | null;
  isActive: boolean; // انتشار از سمت مالک
  wizardDone: boolean;
  template: string;
  products: number;
  revisions: number;
  orders: number;
  createdAt: string;
  updatedAt: string;
  lastRevisionAt: string | null;
}

type DialogState =
  | { kind: "suspend"; row: SiteRow }
  | { kind: "activate"; row: SiteRow }
  | { kind: "release-domain"; row: SiteRow }
  | { kind: "release-subdomain"; row: SiteRow }
  | { kind: "delete"; row: SiteRow }
  | null;

const PAGE_SIZE = 20;

export function StorefrontsSitesTab({ token }: { token?: string | null }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<SiteRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0); // صفر مبنا
  const [qInput, setQInput] = React.useState("");
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<DialogState>(null);
  // مرحلهٔ دوم حذف — تایپ دقیق اسلاگ
  const [deleteStep, setDeleteStep] = React.useState<1 | 2>(1);
  const [deleteConfirmText, setDeleteConfirmText] = React.useState("");

  // debounce جستجو
  React.useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput.trim());
      setPage(0);
    }, 400);
    return () => clearTimeout(t);
  }, [qInput]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        skip: String(page * PAGE_SIZE),
        take: String(PAGE_SIZE),
      });
      if (q) params.set("q", q);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/platform/storefronts?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "خطا در دریافت فروشگاه‌ها", description: json?.error, variant: "destructive" });
        return;
      }
      setRows(json.storefronts ?? []);
      setTotal(json.total ?? 0);
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token, page, q, statusFilter, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const suspendedCount = rows.filter((r) => r.status === "suspended").length;
  const withDomainCount = rows.filter((r) => !!r.customDomain).length;

  // ─── اجرای اکشن PATCH ───
  async function runAction(
    row: SiteRow,
    action: "suspend" | "activate" | "release_domain",
    target?: "custom" | "subdomain"
  ) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/platform/storefronts/${row.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action, ...(target ? { target } : {}) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "عملیات ناموفق", description: json?.error, variant: "destructive" });
        return false;
      }
      toast({ title: json.message ?? "انجام شد" });
      return true;
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
      return false;
    } finally {
      setBusyId(null);
    }
  }

  // ─── حذف (با توکن تأیید = اسلاگ) ───
  async function runDelete(row: SiteRow) {
    setBusyId(row.id);
    try {
      const res = await fetch(
        `/api/platform/storefronts/${row.id}?confirm=${encodeURIComponent(row.slug)}`,
        {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "حذف ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      toast({ title: json.message ?? "فروشگاه حذف شد" });
      // اگر آخرین ردیف صفحهٔ آخر بود، یک صفحه عقب
      if (rows.length === 1 && page > 0) setPage(page - 1);
      else void load();
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  function openDialog(kind: NonNullable<DialogState>["kind"], row: SiteRow) {
    setDeleteStep(1);
    setDeleteConfirmText("");
    setDialog({ kind, row });
  }

  async function onDialogConfirm() {
    if (!dialog) return;
    const { kind, row } = dialog;
    setDialog(null);
    if (kind === "suspend" || kind === "activate") {
      const ok = await runAction(row, kind);
      if (ok) void load();
    } else if (kind === "release-domain") {
      const ok = await runAction(row, "release_domain", "custom");
      if (ok) void load();
    } else if (kind === "release-subdomain") {
      const ok = await runAction(row, "release_domain", "subdomain");
      if (ok) void load();
    } else if (kind === "delete") {
      await runDelete(row);
    }
  }

  // ─── اجزای مشترک ───
  const statusBadge = (row: SiteRow) =>
    row.status === "suspended" ? (
      <Badge className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
        معلق
      </Badge>
    ) : (
      <Badge className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400">
        فعال
      </Badge>
    );

  const publishBadge = (row: SiteRow) =>
    row.isActive ? (
      <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-400">
        منتشرشده
      </Badge>
    ) : (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        منتشرنشده
      </Badge>
    );

  const lastChange = (row: SiteRow) => formatJalaliDayLabel(row.lastRevisionAt ?? row.updatedAt);

  const actionsMenu = (row: SiteRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={busyId === row.id}
          aria-label="عملیات فروشگاه"
        >
          {busyId === row.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => window.open(`/shop/${row.slug}`, "_blank")}>
          <Eye className="h-4 w-4 ml-2" />
          مشاهدهٔ سایت
        </DropdownMenuItem>
        {row.status === "suspended" ? (
          <DropdownMenuItem onClick={() => openDialog("activate", row)}>
            <PlayCircle className="h-4 w-4 ml-2" />
            فعال‌سازی (رفع تعلیق)
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => openDialog("suspend", row)}>
            <PauseCircle className="h-4 w-4 ml-2" />
            تعلیق سایت
          </DropdownMenuItem>
        )}
        {row.customDomain && (
          <DropdownMenuItem onClick={() => openDialog("release-domain", row)}>
            <Globe className="h-4 w-4 ml-2" />
            آزادسازی دامنهٔ اختصاصی
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => openDialog("release-subdomain", row)}>
          <Unlock className="h-4 w-4 ml-2" />
          آزادسازی زیردامنه (اسلاگ)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => openDialog("delete", row)}
        >
          <Trash2 className="h-4 w-4 ml-2" />
          حذف کامل فروشگاه
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-4">
      {/* ─── خلاصه + فیلترها ─── */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-400">
            <StoreIcon className="h-3 w-3 ml-1" />
            {toPersianDigits(total)} فروشگاه
          </Badge>
          <Badge variant="outline" className="border-amber-300 text-amber-800 dark:border-amber-500/40 dark:text-amber-300">
            {toPersianDigits(suspendedCount)} معلق (این صفحه)
          </Badge>
          <Badge variant="outline" className="border-teal-300 text-teal-700 dark:border-teal-500/40 dark:text-teal-300">
            <Globe className="h-3 w-3 ml-1" />
            {toPersianDigits(withDomainCount)} دامنهٔ اختصاصی (این صفحه)
          </Badge>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative">
            <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="جستجو: نام کسب‌وکار، سایت، اسلاگ، دامنه…"
              className="ps-8 h-9 w-full sm:w-72 text-xs"
              aria-label="جستجوی فروشگاه‌ها"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-full sm:w-36 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همهٔ وضعیت‌ها</SelectItem>
              <SelectItem value="active">فعال</SelectItem>
              <SelectItem value="suspended">معلق</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="mr-1">به‌روزرسانی</span>
          </Button>
        </div>
      </div>

      {/* ─── جدول (دسکتاپ) ─── */}
      <div className="hidden md:block rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>کسب‌وکار</TableHead>
              <TableHead>سایت</TableHead>
              <TableHead>آدرس (اسلاگ / دامنه)</TableHead>
              <TableHead>وضعیت</TableHead>
              <TableHead className="text-center">کالا</TableHead>
              <TableHead>آخرین تغییر</TableHead>
              <TableHead className="w-14"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [0, 1, 2, 3].map((i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10 text-sm">
                  فروشگاهی یافت نشد
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className={row.status === "suspended" ? "bg-amber-50/50 dark:bg-amber-500/5" : undefined}>
                  <TableCell>
                    <div className="font-medium text-sm">{row.tenantName}</div>
                    <div className="text-[11px] text-muted-foreground" dir="ltr">
                      {row.tenantPhone || row.ownerEmail || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm max-w-40 truncate" title={row.title}>
                      {row.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      قالب {row.template}
                      {row.wizardDone ? "" : " · ویزارد ناقص"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start">
                      <button
                        type="button"
                        onClick={() => window.open(`/shop/${row.slug}`, "_blank")}
                        className="text-xs font-mono text-primary hover:underline text-start"
                        dir="ltr"
                        title={`/shop/${row.slug}`}
                      >
                        /shop/{row.slug}
                      </button>
                      {row.customDomain && (
                        <Badge variant="outline" className="text-[10px] font-mono border-teal-300 text-teal-700 dark:border-teal-500/40 dark:text-teal-300" dir="ltr">
                          <Globe className="h-3 w-3 ml-1" />
                          {row.customDomain}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start">
                      {statusBadge(row)}
                      {publishBadge(row)}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm">{toPersianDigits(row.products)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{lastChange(row)}</TableCell>
                  <TableCell>{actionsMenu(row)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ─── کارت‌ها (موبایل) ─── */}
      <div className="md:hidden space-y-3">
        {loading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">فروشگاهی یافت نشد</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className={`rounded-lg border border-border p-3 space-y-2 ${row.status === "suspended" ? "bg-amber-50/50 dark:bg-amber-500/5" : "bg-card"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{row.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{row.tenantName}</p>
                </div>
                {actionsMenu(row)}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {statusBadge(row)}
                {publishBadge(row)}
                <Badge variant="outline" className="text-[10px]">
                  {toPersianDigits(row.products)} کالا
                </Badge>
                {row.customDomain && (
                  <Badge variant="outline" className="text-[10px] font-mono border-teal-300 text-teal-700 dark:border-teal-500/40 dark:text-teal-300" dir="ltr">
                    <Globe className="h-3 w-3 ml-1" />
                    {row.customDomain}
                  </Badge>
                )}
              </div>
              <button
                type="button"
                onClick={() => window.open(`/shop/${row.slug}`, "_blank")}
                className="text-xs font-mono text-primary hover:underline text-start"
                dir="ltr"
              >
                /shop/{row.slug}
              </button>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>آخرین تغییر: {lastChange(row)}</span>
                {row.tenantPhone && <span dir="ltr">{row.tenantPhone}</span>}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ─── صفحه‌بندی ─── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          صفحهٔ {toPersianDigits(page + 1)} از {toPersianDigits(totalPages)} — {toPersianDigits(total)} نتیجه
        </p>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronRight className="h-4 w-4" />
            <span className="mr-1">قبلی</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={page + 1 >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            <span className="ml-1">بعدی</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ─── دیالوگ تأیید اکشن‌ها ─── */}
      {dialog && (
        <AlertDialog open onOpenChange={(o) => !o && setDialog(null)}>
          <AlertDialogContent>
            {dialog.kind === "suspend" && (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>تعلیق سایت «{dialog.row.title}»؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    بعد از تعلیق، صفحهٔ عمومی فروشگاه (اسلاگ /shop/{dialog.row.slug}
                    {dialog.row.customDomain ? ` و دامنهٔ ${dialog.row.customDomain}` : ""}) پیام
                    «این فروشگاه موقتاً تعلیق شده است» با کد ۵۰۳ نمایش می‌دهد و ثبت سفارش/درگاه پرداخت هم بسته می‌شود.
                    داده‌ها حذف نمی‌شوند و با فعال‌سازی دوباره برگردند.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>انصراف</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => void onDialogConfirm()}
                  >
                    بله، تعلیق کن
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            )}
            {dialog.kind === "activate" && (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>فعال‌سازی سایت «{dialog.row.title}»؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    تعلیق برداشته می‌شود و سایت دوباره به‌صورت عادی در دسترس قرار می‌گیرد.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>انصراف</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void onDialogConfirm()}>فعال‌سازی</AlertDialogAction>
                </AlertDialogFooter>
              </>
            )}
            {dialog.kind === "release-domain" && (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>آزادسازی دامنهٔ «{dialog.row.customDomain}»؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    دامنهٔ اختصاصی از این فروشگاه جدا می‌شود و برای ثبت توسط کسب‌وکارهای دیگر آزاد می‌شود.
                    خودِ فروشگاه روی اسلاگ /shop/{dialog.row.slug} باقی می‌ماند. این عمل بازگشت‌پذیر نیست.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>انصراف</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void onDialogConfirm()}
                  >
                    آزادسازی دامنه
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            )}
            {dialog.kind === "release-subdomain" && (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>آزادسازی زیردامنهٔ «{dialog.row.slug}»؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    این نام آزاد می‌شود تا کسب‌وکار دیگری بتواند آن را بردارد. فروشگاه یک آدرس موقت
                    تصادفی (freed-…) می‌گیرد و مالک می‌تواند بعداً نام جدید انتخاب کند.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>انصراف</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void onDialogConfirm()}
                  >
                    آزادسازی زیردامنه
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            )}
            {dialog.kind === "delete" && (
              <>
                {deleteStep === 1 ? (
                  <>
                    <AlertDialogHeader>
                      <AlertDialogTitle>حذف کامل فروشگاه «{dialog.row.title}»؟</AlertDialogTitle>
                      <AlertDialogDescription>
                        همهٔ محتوای سایت حذف می‌شود: نسخه‌ها ({toPersianDigits(dialog.row.revisions)})،
                        سفارش‌ها ({toPersianDigits(dialog.row.orders)})، مشتریان، تیکت‌ها، نظرات، متای کالاهای
                        فروشگاه و دامنه‌های ثبت‌شده. این عمل غیرقابل بازگشت است.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>انصراف</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => setDeleteStep(2)}
                      >
                        ادامه
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </>
                ) : (
                  <>
                    <AlertDialogHeader>
                      <AlertDialogTitle>تأیید نهایی حذف</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-2">
                          <span className="block">
                            برای تأیید، شناسهٔ فروشگاه را دقیقاً وارد کنید:
                          </span>
                          <code className="block rounded bg-muted px-2 py-1 text-sm font-mono select-all" dir="ltr">
                            {dialog.row.slug}
                          </code>
                          <Input
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            placeholder={dialog.row.slug}
                            dir="ltr"
                            className="font-mono"
                            aria-label="تأیید حذف — اسلاگ فروشگاه"
                          />
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>انصراف</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={deleteConfirmText.trim() !== dialog.row.slug}
                        onClick={() => void onDialogConfirm()}
                      >
                        <Trash2 className="h-4 w-4 ml-1" />
                        حذف قطعی
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </>
                )}
              </>
            )}
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* راهنمای کوتاه */}
      <p className="text-[11px] text-muted-foreground leading-6 border-t border-border pt-3">
        <ExternalLink className="inline h-3 w-3 ml-1" />
        «تعلیق» سایت عمومی را با پیام ۵۰۳ خاموش می‌کند (اسلاگ و دامنهٔ اختصاصی)؛ «آزادسازی دامنه» نام را برای
        ثبت مجدد توسط دیگران آزاد می‌کند؛ «حذف کامل» همهٔ محتوا را به‌صورت آبشاری پاک می‌کند. همهٔ عملیات در
        لاگ ممیزی پلتفرم ثبت می‌شود.
      </p>
    </div>
  );
}
