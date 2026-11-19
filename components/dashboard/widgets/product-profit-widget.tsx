"use client";

/**
 * ProductProfitWidget — ویجت «سود و ضرر کالاها» برای داشبورد قابل‌تنظیم (Task 4)
 *
 * داده‌ها از /api/dashboard/product-profit?period=month|quarter|year|all:
 *  - فروش، بهای تمام‌شده و سود/زیان هر کالا + حاشیه سود ٪
 *  - تب «پرسودترین» (۱۰ کالای برتر) و تب «زیان‌ده» (۱۰ کالای زیان‌ده)
 *  - نوار خلاصه: جمع فروش / بهای تمام‌شده / سود خالص دوره + حاشیه میانگین
 *
 * ویژگی‌ها:
 *  - انتخاب دوره (ماه/فصل/سال/همه) با چیپ‌های کوچک
 *  - رنگ معنایی: زمردی برای سود، قرمز برای زیان (پالت برند)
 *  - نوار پیشرفت نسبی + چیپ حاشیه سود برای هر کالا
 *  - اعداد فارسی + مبالغ به «تومان» (مقادیر DB ریال است → formatPriceCompact)
 *  - اسکلتون بارگذاری، حالت خطا با تلاش مجدد و حالت خالی دوستانه
 *  - تازه‌سازی خودکار روی رویداد سراسری «hoshhesab:data-changed»
 */

import * as React from "react";
import {
 TrendingUp,
 TrendingDown,
 RefreshCw,
 AlertCircle,
 Package,
 Info,
 CheckCircle2,
 type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ux/empty-state";
import {
 toPersianDigits,
 formatNumber,
 formatPriceCompact,
} from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

type Period = "month" | "quarter" | "year" | "all";

const PERIODS: { key: Period; label: string; hint: string }[] = [
 { key: "month", label: "ماه", hint: "ماه جاری (شمسی)" },
 { key: "quarter", label: "فصل", hint: "فصل جاری (شمسی)" },
 { key: "year", label: "سال", hint: "سال شمسی جاری" },
 { key: "all", label: "همه", hint: "کل تاریخ" },
];

interface ProfitRow {
 productId: string;
 name: string;
 sku: string;
 unit: string;
 unitsSold: number;
 unitsReturned: number;
 netUnits: number;
 revenue: number; // ریال
 cost: number; // ریال
 profit: number; // ریال
 margin: number; // درصد
 costSource: "purchase_invoice" | "product_price" | "none";
}

interface ProductProfitPayload {
 success: boolean;
 period: Period;
 from: string | null;
 summary: {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  avgMargin: number;
  productsTracked: number;
  profitableCount: number;
  lossCount: number;
  estimate: boolean;
 };
 topProfitable: ProfitRow[];
 topLosses: ProfitRow[];
}

/** مبلغ ریالی → نمایش فشرده تومانی با ارقام فارسی */
function fmtToman(rial: number): string {
 return formatPriceCompact(rial, "toman");
}

/** تعداد کالا با حداکثر ۲ رقم اعشار و ارقام فارسی */
function fmtUnits(n: number): string {
 const rounded = Math.round(n * 100) / 100;
 return toPersianDigits(
  Number.isInteger(rounded)
   ? formatNumber(rounded)
   : formatNumber(rounded, 2)
 );
}

/** چیپ انتخاب دوره */
function PeriodChip({
 active,
 label,
 hint,
 onClick,
}: {
 active: boolean;
 label: string;
 hint: string;
 onClick: () => void;
}) {
 return (
  <button
   onClick={onClick}
   title={hint}
   aria-pressed={active}
   className={`h-6.5 rounded-full px-2.5 text-[11px] font-medium transition-all ${
    active
     ? "bg-primary text-primary-foreground shadow-sm"
     : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
   }`}
  >
   {label}
  </button>
 );
}

/** یک ردیف کالا: نام + فروش/بهای + سود/زیان + حاشیه + نوار نسبی */
function ProfitRowItem({
 row,
 rank,
 maxAbs,
 onOpen,
}: {
 row: ProfitRow;
 rank: number;
 maxAbs: number;
 onOpen: () => void;
}) {
 const pos = row.profit >= 0;
 const barPct = Math.max(5, Math.round((Math.abs(row.profit) / maxAbs) * 100));
 const unitLabel = row.unit || "عدد";

 return (
  <button
   onClick={onOpen}
   className="group w-full text-start py-1.5"
   title={`${row.name} — فروش ${fmtToman(row.revenue)} · بهای تمام‌شده ${fmtToman(row.cost)} · ${pos ? "سود" : "زیان"} ${fmtToman(Math.abs(row.profit))} — مشاهده در انبار`}
  >
   <div className="mb-1 flex items-center justify-between gap-2">
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
     <span className="shrink-0 text-[10px] font-bold text-muted-foreground tnum">
      {toPersianDigits(String(rank))}
     </span>
     <div className="min-w-0 flex-1">
      <p className="truncate text-xs font-medium text-foreground transition-colors group-hover:text-primary">
       {row.name}
      </p>
      <p className="truncate text-[9.5px] text-muted-foreground tnum leading-tight">
       فروش {fmtToman(row.revenue)} · بهای {fmtToman(row.cost)} ·{" "}
       {fmtUnits(row.netUnits)} {unitLabel}
       {row.unitsReturned > 0
        ? ` · مرجوعی ${fmtUnits(row.unitsReturned)}`
        : ""}
      </p>
     </div>
    </div>
    <div className="flex shrink-0 flex-col items-end gap-0.5">
     <span
      className={`text-[11px] font-bold tnum leading-tight ${
       pos
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-red-600 dark:text-red-400"
      }`}
     >
      {pos ? "+" : "−"}
      {fmtToman(Math.abs(row.profit))}
     </span>
     <span
      className={`rounded-full px-1.5 py-px text-[9px] font-medium tnum ${
       pos
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : "bg-red-500/10 text-red-600 dark:text-red-400"
      }`}
     >
      حاشیه {toPersianDigits(String(row.margin)).replace(".", "٫")}٪
     </span>
    </div>
   </div>
   {/* نوار نسبی سود/زیان */}
   <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
    <div
     className={`h-full rounded-full bg-gradient-to-l transition-all duration-500 ${
      pos
       ? "from-emerald-500/80 to-emerald-400/40"
       : "from-red-500/80 to-red-400/40"
     }`}
     style={{ width: `${barPct}%` }}
    />
   </div>
  </button>
 );
}

/** حالت خالی داخل تب */
function TabEmptyState({
 icon: Icon,
 title,
 description,
 tone = "neutral",
}: {
 icon: LucideIcon;
 title: string;
 description: string;
 tone?: "neutral" | "success";
}) {
 return (
  <div
   className={`flex items-start gap-2.5 rounded-lg border p-3 ${
    tone === "success"
     ? "border-emerald-500/25 bg-emerald-500/5"
     : "border-dashed border-border bg-muted/30"
   }`}
  >
   <Icon
    className={`mt-0.5 h-4 w-4 shrink-0 ${
     tone === "success" ? "text-emerald-500" : "text-muted-foreground"
    }`}
   />
   <div className="min-w-0">
    <p className="text-xs font-medium text-foreground">{title}</p>
    <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
     {description}
    </p>
   </div>
  </div>
 );
}

export function ProductProfitWidget() {
 const [period, setPeriod] = React.useState<Period>("month");
 const [data, setData] = React.useState<ProductProfitPayload | null>(null);
 const [loading, setLoading] = React.useState(true); // اولین بارگذاری
 const [switching, setSwitching] = React.useState(false); // تعویض دوره
 const [error, setError] = React.useState<string | null>(null);
 const [reloadKey, setReloadKey] = React.useState(0);

 // ─── دریافت داده ───
 React.useEffect(() => {
  let cancelled = false;
  const ac = new AbortController();
  (async () => {
   // اولین بار: اسکلتون؛ تعویض دوره: داده قبلی با کم‌رنگی می‌ماند
   if (data) setSwitching(true);
   else setLoading(true);
   try {
    const res = await authFetch(
     `/api/dashboard/product-profit?period=${period}`,
     { cache: "no-store", signal: ac.signal }
    );
    const json = (await res.json().catch(() => ({}))) as Partial<
     ProductProfitPayload & { error?: string }
    >;
    if (!res.ok || !json?.success) {
     throw new Error(json?.error || "خطا در دریافت تحلیل سود و ضرر");
    }
    if (!cancelled) {
     setData(json as ProductProfitPayload);
     setError(null);
    }
   } catch (e) {
    if (cancelled) return;
    if (e instanceof DOMException && e.name === "AbortError") return;
    setError(e instanceof Error ? e.message : "خطا در بارگذاری داده‌ها");
   } finally {
    if (!cancelled) {
     setLoading(false);
     setSwitching(false);
    }
   }
  })();
  return () => {
   cancelled = true;
   ac.abort();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [period, reloadKey]);

 // ─── تازه‌سازی خودکار وقتی دادهٔ مالی جایی دیگر تغییر کرد ───
 React.useEffect(() => {
  const onChange = () => setReloadKey((k) => k + 1);
  window.addEventListener("hoshhesab:data-changed", onChange);
  return () => window.removeEventListener("hoshhesab:data-changed", onChange);
 }, []);

 const navigateInventory = React.useCallback(() => {
  window.dispatchEvent(
   new CustomEvent("hoshhesab:navigate", { detail: { module: "inventory" } })
  );
 }, []);

 const refresh = React.useCallback(() => {
  setReloadKey((k) => k + 1);
 }, []);

 // ===== اسکلتون اولیه =====
 if (loading && !data) {
  return (
   <div className="space-y-3">
    <div className="grid grid-cols-3 gap-2">
     <Skeleton className="h-14 w-full rounded-lg" />
     <Skeleton className="h-14 w-full rounded-lg" />
     <Skeleton className="h-14 w-full rounded-lg" />
    </div>
    <div className="flex gap-1.5">
     <Skeleton className="h-6.5 w-12 rounded-full" />
     <Skeleton className="h-6.5 w-12 rounded-full" />
     <Skeleton className="h-6.5 w-12 rounded-full" />
    </div>
    <div className="space-y-2">
     {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="space-y-1.5">
       <Skeleton className="h-4 w-full" />
       <Skeleton className="h-1 w-full rounded-full" />
      </div>
     ))}
    </div>
   </div>
  );
 }

 // ===== خطا =====
 if (error && !data) {
  return (
   <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
    <AlertCircle className="h-8 w-8 text-destructive" />
    <p className="text-xs text-muted-foreground">{error}</p>
    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={refresh}>
     <RefreshCw className="h-3 w-3" />
     تلاش مجدد
    </Button>
   </div>
  );
 }

 // ===== حالت خالی: هنوز فروشی ثبت نشده =====
 if (!data || data.summary.productsTracked === 0) {
  return (
   <EmptyState
    icon={Package}
    title="هنوز داده کافی نیست"
    description="اولین فاکتور فروش را ثبت کنید تا سود و ضرر هر کالا به‌صورت خودکار اینجا محاسبه و نمایش داده شود."
    className="py-6"
   />
  );
 }

 const { summary } = data;
 const netPositive = summary.totalProfit >= 0;
 const periodLabel =
  PERIODS.find((p) => p.key === period)?.label ?? "ماه";

 return (
  <div className={`space-y-3 transition-opacity ${switching ? "opacity-50" : ""}`}>
   {/* ─── انتخاب دوره + تازه‌سازی ─── */}
   <div className="flex items-center justify-between gap-2">
    <div className="flex items-center gap-1.5">
     {PERIODS.map((p) => (
      <PeriodChip
       key={p.key}
       active={period === p.key}
       label={p.label}
       hint={p.hint}
       onClick={() => setPeriod(p.key)}
      />
     ))}
    </div>
    <Button
     variant="ghost"
     size="icon"
     className="h-6.5 w-6.5 text-muted-foreground hover:text-foreground"
     onClick={refresh}
     aria-label="تازه‌سازی تحلیل سود و ضرر"
     disabled={switching}
    >
     <RefreshCw className={`h-3.5 w-3.5 ${switching ? "animate-spin" : ""}`} />
    </Button>
   </div>

   {/* ─── نوار خلاصه: فروش / بهای تمام‌شده / سود خالص ─── */}
   <div className="grid grid-cols-3 gap-2">
    <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
     <p className="text-[10px] leading-tight text-muted-foreground">
      فروش {periodLabel}
     </p>
     <p className="mt-0.5 truncate text-xs font-bold text-foreground tnum" title={fmtToman(summary.totalRevenue)}>
      {fmtToman(summary.totalRevenue)}
     </p>
    </div>
    <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
     <p className="text-[10px] leading-tight text-muted-foreground">بهای تمام‌شده</p>
     <p className="mt-0.5 truncate text-xs font-bold text-foreground tnum" title={fmtToman(summary.totalCost)}>
      {fmtToman(summary.totalCost)}
     </p>
    </div>
    <div
     className={`relative overflow-hidden rounded-lg border px-2.5 py-2 ${
      netPositive
       ? "border-emerald-500/25 bg-emerald-500/5"
       : "border-red-500/25 bg-red-500/5"
     }`}
    >
     <p className="text-[10px] leading-tight text-muted-foreground flex items-center gap-1">
      {netPositive ? (
       <TrendingUp className="h-3 w-3 text-emerald-500" />
      ) : (
       <TrendingDown className="h-3 w-3 text-red-500" />
      )}
      سود/زیان خالص
     </p>
     <p
      className={`mt-0.5 truncate text-xs font-bold tnum ${
       netPositive
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-red-600 dark:text-red-400"
      }`}
      title={fmtToman(summary.totalProfit)}
     >
      {netPositive ? "+" : "−"}
      {fmtToman(Math.abs(summary.totalProfit))}
     </p>
     <span className="absolute bottom-1 end-2 text-[8.5px] text-muted-foreground tnum">
      حاشیه {toPersianDigits(String(summary.avgMargin)).replace(".", "٫")}٪
     </span>
    </div>
   </div>

   {/* ─── تب‌ها: پرسودترین / زیان‌ده ─── */}
   <Tabs defaultValue="profitable">
    <TabsList className="h-8 w-full">
     <TabsTrigger value="profitable" className="gap-1.5 text-xs">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      پرسودترین
      <span className="text-[9px] text-muted-foreground tnum">
       ({toPersianDigits(String(summary.profitableCount))})
      </span>
     </TabsTrigger>
     <TabsTrigger value="losses" className="gap-1.5 text-xs">
      <span className="size-1.5 rounded-full bg-red-500" />
      زیان‌ده
      <span className="text-[9px] text-muted-foreground tnum">
       ({toPersianDigits(String(summary.lossCount))})
      </span>
     </TabsTrigger>
    </TabsList>

    <TabsContent value="profitable" className="mt-1">
     {data.topProfitable.length === 0 ? (
      <TabEmptyState
       icon={Package}
       title="در این دوره کالای سوددهی ثبت نشده"
       description="با ثبت فاکتور فروش (و خرید برای محاسبه بهای تمام‌شده)، پرسودترین کالاها اینجا نمایش داده می‌شوند."
      />
     ) : (
      <div className="space-y-0.5">
       {data.topProfitable.map((row, i) => (
        <ProfitRowItem
         key={row.productId}
         row={row}
         rank={i + 1}
         maxAbs={Math.max(1, ...data.topProfitable.map((r) => Math.abs(r.profit)))}
         onOpen={navigateInventory}
        />
       ))}
      </div>
     )}
    </TabsContent>

    <TabsContent value="losses" className="mt-1">
     {data.topLosses.length === 0 ? (
      <TabEmptyState
       icon={CheckCircle2}
       tone="success"
       title="هیچ کالای زیان‌ده‌ای در این دوره نیست — عالی!"
       description="همهٔ کالاهای فروخته‌شده در این دوره سودآور بوده‌اند. وضعیت قیمت‌گذاری شما سالم است."
      />
     ) : (
      <div className="space-y-0.5">
       {data.topLosses.map((row, i) => (
        <ProfitRowItem
         key={row.productId}
         row={row}
         rank={i + 1}
         maxAbs={Math.max(1, ...data.topLosses.map((r) => Math.abs(r.profit)))}
         onOpen={navigateInventory}
        />
       ))}
      </div>
     )}
    </TabsContent>
   </Tabs>

   {/* ─── پانوشت: روش محاسبه ─── */}
   <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
    <Info className="mt-px h-3 w-3 shrink-0" />
    بهای تمام‌شده تقریبی است: میانگین موزون قیمت خرید (یا قیمت خرید ثبت‌شدهٔ کالا).
    برگشتی‌های فروش از درآمد کسر شده‌اند.
   </p>
  </div>
 );
}
