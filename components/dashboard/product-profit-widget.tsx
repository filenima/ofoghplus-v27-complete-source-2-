"use client";

/**
 * ProductProfitWidget — ویجت «تحلیل سود و زیان کالاها» (v2)
 *
 * داده‌ها از /api/analytics/product-profit?from=&to=&sort=&limit=20 :
 *  - فروش، بهای تمام‌شده، سود/زیان و حاشیهٔ سود هر کالا در بازهٔ انتخابی
 *  - بازه‌های آماده: ۳۰ روز / ۹۰ روز / سال مالی (شمسی)
 *  - مرتب‌سازی сегمنتی: سود / فروش / حاشیه
 *  - جدول در دسکتاپ + کارت در موبایل + نوار مقایسهٔ CSS (width٪)
 *  - پانوشت «مجموع سود دوره» + جمع فروش/بهای + برنده و بازندهٔ دوره
 *  - اسکلتون بارگذاری، حالت خالی «هنوز فروشی ثبت نشده»،
 *    توست خطا (use-toast) و تازه‌سازی روی رویداد «hoshhesab:data-changed»
 *
 * پالت: زمردی = سود، رز = زیان (بدون آبی/نیلی). مبالغ DB ریال است و
 * اینجا با formatPriceCompact(_, "toman") به تومان فشرده نمایش داده می‌شود.
 */

import * as React from "react";
import {
 TrendingUp,
 TrendingDown,
 RefreshCw,
 AlertCircle,
 Package,
 Info,
 Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ux/empty-state";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import {
 toPersianDigits,
 formatNumber,
 formatPriceCompact,
 toJalali,
 toLocalISODate,
 getCurrentJalaliYear,
 getJalaliYearRange,
} from "@/lib/persian";

/* ============ انواع ============ */

type SortKey = "profit" | "revenue" | "margin";
type PresetKey = "30d" | "90d" | "fy";

interface ProfitRow {
 productId: string;
 name: string;
 code: string;
 unit: string;
 qtySold: number;
 qtyReturned: number;
 netQty: number;
 revenue: number; // ریال
 cogs: number | null; // ریال — null = نامشخص
 profit: number | null; // ریال — null = نامشخص
 margin: number | null; // درصد — null = نامشخص
 costSource: "product_price" | "purchase_invoice" | "none";
}

interface ProductProfitPayload {
 success: true;
 from: string;
 to: string;
 sort: SortKey;
 limit: number;
 totals: {
  revenue: number;
  cogs: number;
  profit: number;
  margin: number;
  productsTracked: number;
  profitableCount: number;
  lossCount: number;
  unknownCostCount: number;
 };
 rows: ProfitRow[];
 topWinners: { productId: string; name: string; profit: number; margin: number | null }[];
 topLosers: { productId: string; name: string; profit: number; margin: number | null }[];
}

/* ============ پیکربندی ============ */

const PRESETS: { key: PresetKey; label: string; hint: string }[] = [
 { key: "30d", label: "۳۰ روز", hint: "سی روز گذشته تا امروز" },
 { key: "90d", label: "۹۰ روز", hint: "نود روز گذشته تا امروز" },
 { key: "fy", label: "سال مالی", hint: "از ابتدای سال شمسی جاری تا امروز" },
];

const SORTS: { key: SortKey; label: string }[] = [
 { key: "profit", label: "سود" },
 { key: "revenue", label: "فروش" },
 { key: "margin", label: "حاشیه" },
];

const ROW_LIMIT = 20;

/** بازهٔ [from, to] هر پیش‌فرض — تاریخ‌ها محلی، خروجی برای query است */
function presetRange(preset: PresetKey): { from: Date; to: Date } {
 const now = new Date();
 if (preset === "fy") {
  const { start } = getJalaliYearRange(getCurrentJalaliYear());
  return { from: start, to: now };
 }
 const days = preset === "30d" ? 30 : 90;
 const from = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
 from.setHours(0, 0, 0, 0);
 return { from, to: now };
}

/* ============ قالب‌بندی ============ */

/** مبلغ ریالی → نمایش فشردهٔ تومانی با ارقام فارسی */
function fmtToman(rial: number): string {
 return formatPriceCompact(rial, "toman");
}

/** تعداد کالا با حداکثر ۲ رقم اعشار و ارقام فارسی */
function fmtUnits(n: number): string {
 const rounded = Math.round(n * 100) / 100;
 return toPersianDigits(
  Number.isInteger(rounded) ? formatNumber(rounded) : formatNumber(rounded, 2)
 );
}

/** درصد با یک اعشار فارسی — مثلاً ۲۳٫۵٪ */
function fmtPct(pct: number): string {
 return `${toPersianDigits(String(pct)).replace(".", "٫")}٪`;
}

/* ============ اجزای کوچک ============ */

/** چیپ انتخاب بازهٔ زمانی */
function PresetChip({
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
   type="button"
   onClick={onClick}
   title={hint}
   aria-pressed={active}
   className={`h-7 rounded-full px-3 text-[11px] font-medium transition-all ${
    active
     ? "bg-emerald-600 text-white shadow-sm"
     : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
   }`}
  >
   {label}
  </button>
 );
}

/** نوار مقایسهٔ CSS (width٪) — زمردی مثبت / رز منفی */
function CompareBar({
 pct,
 positive,
}: {
 pct: number;
 positive: boolean;
}) {
 return (
  <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
   <div
     className={`h-full rounded-full transition-all duration-500 ${
      positive ? "bg-emerald-500" : "bg-rose-500"
     }`}
     style={{ width: `${Math.max(pct, 0)}%` }}
   />
  </div>
 );
}

/* ============ ویجت اصلی ============ */

export function ProductProfitWidget() {
 const [preset, setPreset] = React.useState<PresetKey>("90d");
 const [sort, setSort] = React.useState<SortKey>("profit");
 const [data, setData] = React.useState<ProductProfitPayload | null>(null);
 const [loading, setLoading] = React.useState(true); // اولین بارگذاری
 const [switching, setSwitching] = React.useState(false); // تعویض بازه/مرتب‌سازی
 const [error, setError] = React.useState<string | null>(null);
 const [reloadKey, setReloadKey] = React.useState(0);
 const { toast } = useToast();

 // ─── دریافت داده از API (URL نسبی + توست خطا) ───
 React.useEffect(() => {
  let cancelled = false;
  const ac = new AbortController();
  (async () => {
   // اولین بار: اسکلتون؛ تعویض پارامتر: دادهٔ قبلی با کم‌رنگی می‌ماند
   if (data) setSwitching(true);
   else setLoading(true);
   try {
    const range = presetRange(preset);
    const qs = new URLSearchParams({
     from: toLocalISODate(range.from),
     to: toLocalISODate(range.to),
     sort,
     limit: String(ROW_LIMIT),
    });
    const res = await authFetch(`/api/analytics/product-profit?${qs.toString()}`, {
     cache: "no-store",
     signal: ac.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Partial<
     ProductProfitPayload & { error?: string }
    >;
    if (!res.ok || !json?.success) {
     throw new Error(json?.error || "خطا در دریافت تحلیل سود و زیان کالاها");
    }
    if (!cancelled) {
     setData(json as ProductProfitPayload);
     setError(null);
    }
   } catch (e) {
    if (cancelled) return;
    if (e instanceof DOMException && e.name === "AbortError") return;
    const msg = e instanceof Error ? e.message : "خطا در بارگذاری داده‌ها";
    setError(msg);
    toast({
     title: "خطا در تحلیل سود و زیان کالاها",
     description: msg,
     variant: "destructive",
    });
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
 }, [preset, sort, reloadKey]);

 // ─── تازه‌سازی خودکار وقتی دادهٔ مالی جای دیگر تغییر کرد ───
 React.useEffect(() => {
  const onChange = () => setReloadKey((k) => k + 1);
  window.addEventListener("hoshhesab:data-changed", onChange);
  return () => window.removeEventListener("hoshhesab:data-changed", onChange);
 }, []);

 const refresh = React.useCallback(() => setReloadKey((k) => k + 1), []);

 // ===== اسکلتون اولیه =====
 if (loading && !data) {
  return (
   <div className="space-y-3">
    <div className="flex items-center justify-between">
     <div className="flex gap-1.5">
      <Skeleton className="h-7 w-16 rounded-full" />
      <Skeleton className="h-7 w-16 rounded-full" />
      <Skeleton className="h-7 w-16 rounded-full" />
     </div>
     <Skeleton className="h-7 w-7 rounded-md" />
    </div>
    <Skeleton className="h-8 w-full rounded-lg" />
    <div className="space-y-2">
     {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex items-center justify-between gap-4">
       <Skeleton className="h-5 w-2/5" />
       <Skeleton className="h-5 w-1/5" />
       <Skeleton className="h-5 w-1/5" />
      </div>
     ))}
    </div>
    <Skeleton className="h-12 w-full rounded-lg" />
   </div>
  );
 }

 // ===== خطا (بدون دادهٔ قبلی) =====
 if (error && !data) {
  return (
   <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
    <AlertCircle className="h-8 w-8 text-destructive" />
    <p className="text-xs text-muted-foreground">{error}</p>
    <Button
     size="sm"
     variant="outline"
     className="h-7 gap-1.5 text-xs"
     onClick={refresh}
    >
     <RefreshCw className="h-3 w-3" />
     تلاش مجدد
    </Button>
   </div>
  );
 }

 // ===== حالت خالی: هنوز فروشی ثبت نشده =====
 if (!data || data.totals.productsTracked === 0) {
  return (
   <EmptyState
    icon={Package}
    title="هنوز فروشی ثبت نشده"
    description="با ثبت اولین فاکتور فروش (و ثبت قیمت خرید کالاها)، سود و زیان هر کالا به‌صورت خودکار اینجا محاسبه و نمایش داده می‌شود."
    className="py-6"
   />
  );
 }

 const { totals, rows, topWinners, topLosers } = data;
 const netPositive = totals.profit >= 0;
 const profitColor = netPositive
  ? "text-emerald-600 dark:text-emerald-400"
  : "text-rose-600 dark:text-rose-400";

 // نوار مقایسه بر اساس متریکِ همان مرتب‌سازی
 const metricOf = (r: ProfitRow): number | null =>
  sort === "revenue" ? r.revenue : sort === "margin" ? r.margin : r.profit;
 const maxAbsMetric = Math.max(1, ...rows.map((r) => Math.abs(metricOf(r) ?? 0)));

 return (
  <div className={`space-y-3 transition-opacity ${switching ? "opacity-50" : ""}`}>
   {/* ─── بازهٔ زمانی + تازه‌سازی ─── */}
   <div className="flex items-center justify-between gap-2">
    <div className="flex items-center gap-1.5">
     {PRESETS.map((p) => (
      <PresetChip
       key={p.key}
       active={preset === p.key}
       label={p.label}
       hint={p.hint}
       onClick={() => setPreset(p.key)}
      />
     ))}
    </div>
    <Button
     variant="ghost"
     size="icon"
     className="h-7 w-7 text-muted-foreground hover:text-foreground"
     onClick={refresh}
     aria-label="تازه‌سازی تحلیل سود و زیان کالاها"
     disabled={switching}
    >
     <RefreshCw className={`h-3.5 w-3.5 ${switching ? "animate-spin" : ""}`} />
    </Button>
   </div>

   {/* ─── مرتب‌سازی: سود / فروش / حاشیه ─── */}
   <Tabs value={sort} onValueChange={(v) => setSort(v as SortKey)}>
    <TabsList className="h-8 w-full">
     {SORTS.map((s) => (
      <TabsTrigger key={s.key} value={s.key} className="gap-1.5 text-xs">
       {s.key === "profit" && (
        <span className="size-1.5 rounded-full bg-emerald-500" />
       )}
       {s.key === "margin" && (
        <span className="size-1.5 rounded-full bg-amber-500" />
       )}
       {s.label}
      </TabsTrigger>
     ))}
    </TabsList>
   </Tabs>

   {/* ─── جدول دسکتاپ ─── */}
   <div className="hidden overflow-hidden rounded-lg border border-border md:block">
    <Table>
     <TableHeader>
      <TableRow className="hover:bg-transparent">
       <TableHead className="h-9 w-10 text-center text-[11px] font-medium">#</TableHead>
       <TableHead className="h-9 text-[11px] font-medium">کالا</TableHead>
       <TableHead className="h-9 text-[11px] font-medium">تعداد فروش</TableHead>
       <TableHead className="h-9 text-[11px] font-medium">فروش</TableHead>
       <TableHead className="h-9 text-[11px] font-medium">بهای تمام‌شده</TableHead>
       <TableHead className="h-9 text-[11px] font-medium">سود / زیان</TableHead>
       <TableHead className="h-9 text-[11px] font-medium">حاشیه</TableHead>
      </TableRow>
     </TableHeader>
     <TableBody>
      {rows.map((row, i) => {
       const m = metricOf(row);
       const pos = (row.profit ?? 0) >= 0;
       const barPct =
        m == null ? 0 : Math.max(4, Math.round((Math.abs(m) / maxAbsMetric) * 100));
       return (
        <TableRow key={row.productId}>
         <TableCell className="py-2 text-center text-[11px] text-muted-foreground tnum">
          {toPersianDigits(String(i + 1))}
         </TableCell>
         <TableCell className="py-2">
          <p className="max-w-48 truncate text-xs font-medium text-foreground" title={row.name}>
           {row.name}
          </p>
          {row.code && (
           <p className="text-[10px] leading-tight text-muted-foreground tnum">
            {row.code}
           </p>
          )}
         </TableCell>
         <TableCell className="py-2 whitespace-nowrap text-[11px] text-muted-foreground tnum">
          {fmtUnits(row.netQty)} {row.unit || "عدد"}
          {row.qtyReturned > 0 && (
           <span className="text-[9px]"> (مرجوعی {fmtUnits(row.qtyReturned)})</span>
          )}
         </TableCell>
         <TableCell className="py-2 whitespace-nowrap text-xs text-foreground tnum">
          {fmtToman(row.revenue)}
         </TableCell>
         <TableCell className="py-2 whitespace-nowrap text-xs text-muted-foreground tnum">
          {row.cogs == null ? "—" : fmtToman(row.cogs)}
         </TableCell>
         <TableCell className="py-2">
          {row.profit == null ? (
           <span className="text-xs text-muted-foreground">—</span>
          ) : (
           <>
            <p
             className={`whitespace-nowrap text-xs font-bold tnum ${
              pos
               ? "text-emerald-600 dark:text-emerald-400"
               : "text-rose-600 dark:text-rose-400"
             }`}
            >
             {pos ? "+" : "−"}
             {fmtToman(Math.abs(row.profit))}
            </p>
            <div className="mt-1 w-24">
             <CompareBar pct={barPct} positive={pos} />
            </div>
           </>
          )}
         </TableCell>
         <TableCell className="py-2">
          {row.margin == null ? (
           <span className="text-xs text-muted-foreground">—</span>
          ) : (
           <span
            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium tnum ${
             pos
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-rose-500/10 text-rose-700 dark:text-rose-300"
            }`}
           >
            {fmtPct(row.margin)}
           </span>
          )}
         </TableCell>
        </TableRow>
       );
      })}
     </TableBody>
    </Table>
   </div>

   {/* ─── کارت‌های موبایل ─── */}
   <div className="space-y-2 md:hidden">
    {rows.map((row) => {
     const m = metricOf(row);
     const pos = (row.profit ?? 0) >= 0;
     const barPct =
      m == null ? 0 : Math.max(4, Math.round((Math.abs(m) / maxAbsMetric) * 100));
     return (
      <div
       key={row.productId}
       className="rounded-lg border border-border bg-muted/20 p-2.5"
      >
       <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
         <p className="truncate text-xs font-medium text-foreground" title={row.name}>
          {row.name}
         </p>
         {row.code && (
          <p className="text-[10px] leading-tight text-muted-foreground tnum">
           {row.code}
          </p>
         )}
        </div>
        {row.profit == null ? (
         <span className="shrink-0 text-xs font-bold text-muted-foreground">—</span>
        ) : (
         <span
          className={`shrink-0 text-xs font-bold tnum ${
           pos
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400"
          }`}
         >
          {pos ? "+" : "−"}
          {fmtToman(Math.abs(row.profit))}
         </span>
        )}
       </div>
       <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground tnum">
        <span>فروش {fmtToman(row.revenue)}</span>
        <span aria-hidden>·</span>
        <span>
         {fmtUnits(row.netQty)} {row.unit || "عدد"}
        </span>
        <span aria-hidden>·</span>
        <span>بهای {row.cogs == null ? "—" : fmtToman(row.cogs)}</span>
        <span aria-hidden>·</span>
        <span>حاشیه {row.margin == null ? "—" : fmtPct(row.margin)}</span>
       </div>
       <div className="mt-2">
        <CompareBar pct={barPct} positive={pos} />
       </div>
      </div>
     );
    })}
   </div>

   {/* ─── پانوشت: مجموع سود دوره + جمع‌ها ─── */}
   <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
    <div className="flex items-center justify-between gap-2">
     <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      {netPositive ? (
       <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
       <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
      )}
      مجموع سود دوره
     </span>
     <span className={`text-sm font-bold tnum ${profitColor}`}>
      {netPositive ? "+" : "−"}
      {fmtToman(Math.abs(totals.profit))}
     </span>
    </div>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground tnum">
     <span>فروش: {fmtToman(totals.revenue)}</span>
     <span>بهای تمام‌شده: {fmtToman(totals.cogs)}</span>
     <span>حاشیه کل: {fmtPct(totals.margin)}</span>
     <span>
      {toPersianDigits(String(totals.productsTracked))} کالا · سودده{" "}
      {toPersianDigits(String(totals.profitableCount))} · زیان‌ده{" "}
      {toPersianDigits(String(totals.lossCount))}
     </span>
    </div>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
     {topWinners[0] && (
      <span className="inline-flex min-w-0 items-center gap-1 text-emerald-700 dark:text-emerald-300">
       <Trophy className="h-3 w-3 shrink-0" />
       <span className="truncate">پرسودترین: {topWinners[0].name}</span>
       <span className="tnum">({fmtToman(topWinners[0].profit)})</span>
      </span>
     )}
     {topLosers[0] && (
      <span className="inline-flex min-w-0 items-center gap-1 text-rose-700 dark:text-rose-300">
       <TrendingDown className="h-3 w-3 shrink-0" />
       <span className="truncate">زیان‌ده‌ترین: {topLosers[0].name}</span>
       <span className="tnum">(−{fmtToman(Math.abs(topLosers[0].profit))})</span>
      </span>
     )}
     <span className="text-muted-foreground tnum">
      بازهٔ {toJalali(new Date(data.from))} تا {toJalali(new Date(data.to))}
     </span>
    </div>
   </div>

   {/* ─── یادداشت روش محاسبه ─── */}
   <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
    <Info className="mt-px h-3 w-3 shrink-0" />
    بهای تمام‌شده از قیمت خرید کالا یا میانگین موزون فاکتورهای خرید است (تقریبی)؛
    برگشتی‌های فروش از درآمد کسر شده‌اند.
    {totals.unknownCostCount > 0 &&
     ` ${toPersianDigits(String(totals.unknownCostCount))} کالا بدون بهای ثبت‌شده — حاشیهٔ آن‌ها «—» است.`}
   </p>
  </div>
 );
}
