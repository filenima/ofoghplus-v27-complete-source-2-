"use client";

// ═══════════════════════════════════════════════════════════════════
// Task 1-b — نوار کشف محصولات (جستجو/دسته/قیمت/موجودی/مرتب‌سازی)
// کامپوننت مشترک همهٔ قالب‌ها v1 و v2 — با اسکلتون، حالت خالی،
// شمارش نتیجه، چیپ‌های فعال و صفحه‌بندی ریسپانسیو.
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  Search,
  X,
  SlidersHorizontal,
  ChevronRight,
  ChevronLeft,
  PackageSearch,
  RotateCcw,
  Check,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toPersianDigits } from "@/lib/persian";
import { rialToTomanLabel } from "@/lib/storefront";
import type { StorefrontDiscovery, StorefrontSortMode } from "@/components/storefront/use-store-products";

export interface DiscoveryTone {
  /** کارت/نوار */
  bg: string;
  border: string;
  /** input جستجو */
  input: string;
  /** چیپ دسته */
  chip: string;
  chipActive: string;
  /** select مرتب‌سازی */
  select: string;
  /** متن فرعی */
  sub: string;
}

export const DISCOVERY_TONE_DEFAULT: DiscoveryTone = {
  bg: "bg-card",
  border: "border-border",
  input: "border-border bg-background text-foreground placeholder:text-muted-foreground",
  chip: "bg-muted text-muted-foreground hover:bg-muted/70",
  chipActive: "bg-primary text-primary-foreground",
  select: "border-border bg-background text-foreground",
  sub: "text-muted-foreground",
};

const SORT_LABELS: Record<StorefrontSortMode, string> = {
  newest: "جدیدترین",
  cheapest: "ارزان‌ترین",
  expensive: "گران‌ترین",
  name: "بر اساس نام",
};

/* ─────────────── نوار اصلی ─────────────── */

export function StorefrontDiscoveryBar({
  discovery,
  tone = DISCOVERY_TONE_DEFAULT,
}: {
  discovery: StorefrontDiscovery;
  tone?: DiscoveryTone;
}) {
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const priceDirty =
    discovery.priceInput.min !== discovery.priceApplied.min || discovery.priceInput.max !== discovery.priceApplied.max;
  const priceActive = !!(discovery.priceApplied.min || discovery.priceApplied.max);

  return (
    <section
      aria-label="جستجو و فیلتر کالاها"
      className={`rounded-2xl border p-3 sm:p-4 ${tone.bg} ${tone.border}`}
      data-edit-section="discovery"
    >
      {/* ردیف ۱: جستجو + شمارش + مرتب‌سازی */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${tone.sub}`} aria-hidden="true" />
          <input
            type="search"
            value={discovery.searchQuery}
            onChange={(e) => discovery.onSearchQueryChange(e.target.value)}
            placeholder="جستجو در کالاهای این فروشگاه…"
            aria-label="جستجو در کالاهای این فروشگاه"
            className={`w-full rounded-full py-2.5 pl-10 pr-9 text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary/30 ${tone.input}`}
          />
          {discovery.searchQuery ? (
            <button
              type="button"
              onClick={() => discovery.onSearchQueryChange("")}
              className={`absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 ${tone.sub} transition-colors hover:text-foreground`}
              aria-label="پاک کردن جستجو"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <span className={`order-first w-full text-xs font-bold tabular-nums sm:order-none sm:w-auto ${tone.sub}`}>
          {discovery.loading ? "در حال جستجو…" : `${toPersianDigits(discovery.total)} کالا`}
        </span>

        <div className="flex items-center gap-2">
          <select
            value={discovery.sortMode}
            onChange={(e) => discovery.onSortModeChange(e.target.value as StorefrontSortMode)}
            aria-label="ترتیب نمایش"
            className={`rounded-full border px-3 py-2 text-xs font-medium outline-none ${tone.select}`}
          >
            {(Object.keys(SORT_LABELS) as StorefrontSortMode[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            aria-label="فیلترهای پیشرفته"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold transition-colors ${tone.select} ${
              advancedOpen || priceActive || discovery.inStockOnly ? "ring-2 ring-primary/30" : ""
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            فیلترها
            {discovery.activeFilterCount > 0 ? ` (${toPersianDigits(discovery.activeFilterCount)})` : ""}
          </button>
        </div>
      </div>

      {/* ردیف ۲: چیپ‌های دسته — اسکرول افقی موبایل */}
      {discovery.categories.length > 0 ? (
        <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible">
          <button
            type="button"
            onClick={() => discovery.onSelectCategory(null)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              !discovery.selectedCategory ? tone.chipActive : tone.chip
            }`}
            aria-pressed={!discovery.selectedCategory}
          >
            همه
          </button>
          {discovery.categories.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => discovery.onSelectCategory(discovery.selectedCategory === c.name ? null : c.name)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                discovery.selectedCategory === c.name ? tone.chipActive : tone.chip
              }`}
              aria-pressed={discovery.selectedCategory === c.name}
            >
              {c.name} <span className="opacity-70 tabular-nums">({toPersianDigits(c.count)})</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* ردیف ۳: فیلترهای پیشرفته (قیمت + موجودی) — بازشو */}
      {advancedOpen ? (
        <div className="mt-3 rounded-xl border border-dashed p-3" style={{ borderColor: "inherit" }}>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex items-center gap-1.5">
              <label className="flex flex-col gap-1">
                <span className={`text-[10px] font-bold ${tone.sub}`}>قیمت از (تومان)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={discovery.priceInput.min}
                  onChange={(e) => discovery.onPriceInputChange(e.target.value.replace(/[^\d۰-۹]/g, ""), discovery.priceInput.max)}
                  placeholder={discovery.facets?.price?.min ? toPersianDigits(discovery.facets.price.min.toLocaleString("fa-IR")) : "۰"}
                  aria-label="حداقل قیمت به تومان"
                  className={`w-32 rounded-lg border px-2.5 py-2 text-xs tabular-nums outline-none ${tone.input}`}
                  dir="ltr"
                />
              </label>
              <span className={`pb-2.5 ${tone.sub}`} aria-hidden="true">—</span>
              <label className="flex flex-col gap-1">
                <span className={`text-[10px] font-bold ${tone.sub}`}>تا (تومان)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={discovery.priceInput.max}
                  onChange={(e) => discovery.onPriceInputChange(discovery.priceInput.min, e.target.value.replace(/[^\d۰-۹]/g, ""))}
                  placeholder={discovery.facets?.price?.max ? toPersianDigits(discovery.facets.price.max.toLocaleString("fa-IR")) : "بی‌نهایت"}
                  aria-label="حداکثر قیمت به تومان"
                  className={`w-32 rounded-lg border px-2.5 py-2 text-xs tabular-nums outline-none ${tone.input}`}
                  dir="ltr"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => discovery.applyPriceRange()}
              className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${tone.chipActive}`}
            >
              {priceDirty ? "اعمال بازهٔ قیمت" : priceActive ? "بازهٔ اعمال‌شده ✓" : "اعمال"}
            </button>
            {priceActive ? (
              <button
                type="button"
                onClick={() => discovery.clearPriceRange()}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-bold ${tone.sub} transition-colors hover:text-foreground`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                حذف بازهٔ قیمت
              </button>
            ) : null}

            <label
              className={`ms-auto flex cursor-pointer select-none items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${tone.select}`}
            >
              <input
                type="checkbox"
                checked={discovery.inStockOnly}
                onChange={(e) => discovery.onInStockOnlyChange(e.target.checked)}
                className="h-4 w-4 accent-current"
              />
              فقط کالاهای موجود
              {discovery.facets ? (
                <span className={`tabular-nums ${tone.sub}`}>({toPersianDigits(discovery.facets.inStock)})</span>
              ) : null}
            </label>
          </div>
        </div>
      ) : null}

      {/* ردیف ۴: فیلترهای فعال + حذف همه */}
      {discovery.hasActiveFilters ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {discovery.searchQuery.trim() ? (
            <ActiveFilterChip label={`جستجو: ${discovery.searchQuery.trim()}`} onRemove={() => discovery.onSearchQueryChange("")} tone={tone} />
          ) : null}
          {discovery.selectedCategory ? (
            <ActiveFilterChip label={`دسته: ${discovery.selectedCategory}`} onRemove={() => discovery.onSelectCategory(null)} tone={tone} />
          ) : null}
          {priceActive ? (
            <ActiveFilterChip
              label={`قیمت: ${discovery.priceApplied.min ? toPersianDigits(Number(discovery.priceApplied.min).toLocaleString("fa-IR")) : "۰"} — ${discovery.priceApplied.max ? toPersianDigits(Number(discovery.priceApplied.max).toLocaleString("fa-IR")) : "∞"}`}
              onRemove={() => discovery.clearPriceRange()}
              tone={tone}
            />
          ) : null}
          {discovery.inStockOnly ? (
            <ActiveFilterChip label="فقط موجود" onRemove={() => discovery.onInStockOnlyChange(false)} tone={tone} />
          ) : null}
          <button
            type="button"
            onClick={() => discovery.reset()}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${tone.sub} transition-colors hover:text-foreground`}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            حذف فیلترها
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ActiveFilterChip({
  label,
  onRemove,
  tone,
}: {
  label: string;
  onRemove: () => void;
  tone: DiscoveryTone;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${tone.chip}`}>
      {label}
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 hover:text-foreground" aria-label={`حذف فیلتر ${label}`}>
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}

/* ─────────────── صفحه‌بندی ─────────────── */

export function DiscoveryPagination({
  discovery,
  tone = DISCOVERY_TONE_DEFAULT,
}: {
  discovery: StorefrontDiscovery;
  tone?: DiscoveryTone;
}) {
  if (discovery.pages <= 1) return null;
  const page = discovery.page;
  const pages = discovery.pages;

  // شماره‌ها با الipsis برای کاتالوگ‌های بزرگ
  const items: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) items.push(i);
    else if (items[items.length - 1] !== "…") items.push("…");
  }

  return (
    <nav aria-label="صفحه‌بندی کالاها" className="mt-5 flex items-center justify-center gap-1.5">
      {/* موبایل: قبلی/بعدی */}
      <button
        type="button"
        onClick={() => discovery.setPage(page - 1)}
        disabled={page <= 1}
        className="inline-flex h-11 items-center gap-1 rounded-full border px-4 text-xs font-bold disabled:opacity-40 sm:hidden"
        aria-label="صفحهٔ قبل"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
        قبلی
      </button>
      <span className={`text-xs font-bold tabular-nums sm:hidden ${tone.sub}`}>
        صفحهٔ {toPersianDigits(page)} از {toPersianDigits(pages)}
      </span>
      <button
        type="button"
        onClick={() => discovery.setPage(page + 1)}
        disabled={page >= pages}
        className="inline-flex h-11 items-center gap-1 rounded-full border px-4 text-xs font-bold disabled:opacity-40 sm:hidden"
        aria-label="صفحهٔ بعد"
      >
        بعدی
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>

      {/* دسکتاپ: شماره‌ای */}
      <div className="hidden items-center gap-1.5 sm:flex">
        <button
          type="button"
          onClick={() => discovery.setPage(page - 1)}
          disabled={page <= 1}
          className="inline-flex h-10 items-center gap-1 rounded-full border px-3.5 text-xs font-bold disabled:opacity-40"
          aria-label="صفحهٔ قبل"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          قبلی
        </button>
        {items.map((it, i) =>
          it === "…" ? (
            <span key={`e${i}`} className={`px-1 text-xs ${tone.sub}`} aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={it}
              type="button"
              onClick={() => discovery.setPage(it)}
              aria-current={it === page ? "page" : undefined}
              className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-xs font-bold tabular-nums transition-colors ${
                it === page ? tone.chipActive : tone.chip
              }`}
            >
              {it === page ? <Check className="ms-1 h-3.5 w-3.5" aria-hidden="true" /> : null}
              {toPersianDigits(it)}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => discovery.setPage(page + 1)}
          disabled={page >= pages}
          className="inline-flex h-10 items-center gap-1 rounded-full border px-3.5 text-xs font-bold disabled:opacity-40"
          aria-label="صفحهٔ بعد"
        >
          بعدی
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

/* ─────────────── اسکلتون بارگذاری ─────────────── */

export function DiscoverySkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col overflow-hidden rounded-2xl border bg-card">
          <Skeleton className="aspect-[5/4] w-full rounded-none" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-8 w-full rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────── حالت خالی ─────────────── */

export function DiscoveryEmptyState({
  discovery,
  className = "",
}: {
  discovery: StorefrontDiscovery;
  className?: string;
}) {
  return (
    <div className={`mt-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed py-14 text-center ${className}`}>
      <PackageSearch className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
      <p className="text-sm font-bold">کالایی مطابق فیلترهای شما پیدا نشد</p>
      <p className="max-w-sm text-xs leading-6 text-muted-foreground">
        عبارت دیگری جستجو کنید یا فیلترها را تغییر دهید — شاید آنچه می‌خواهید با نام دیگری ثبت شده باشد.
      </p>
      {discovery.hasActiveFilters ? (
        <button
          type="button"
          onClick={() => discovery.reset()}
          className="mt-1 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          حذف فیلترها
        </button>
      ) : null}
    </div>
  );
}

/** برچسب قیمت برای نمایش در حالت خالی فاسِت‌ها */
export function discoveryPriceHint(discovery: StorefrontDiscovery): string | null {
  const p = discovery.facets?.price;
  if (!p || p.min == null || p.max == null) return null;
  return `${rialToTomanLabel(String(p.min * 10))} تا ${rialToTomanLabel(String(p.max * 10))}`;
}
