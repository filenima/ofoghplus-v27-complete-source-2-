"use client";

// ═══════════════════════════════════════════════════════════════════
// R24-4 — ۳ قالب پرمیوم فروشگاه (نسل سوم)
//   aurora-pro  → گلس‌مورفیسم با گرادیان متحرک روی زمینهٔ تیره
//   bazaar-luxe → لوکس ایرانی با پالت کرم-طلایی و جزئیات تذهیبی
//   dark-neon   → تیرهٔ مدرن با درخشش نئون زمردی و شبکهٔ دیجیتال
// امکانات مشترک (فوق‌پرمیوم):
//   • کارت کالای سه‌بعدی (tilt با ماوس) + مشاهدهٔ سریع (Dialog)
//   • بج تخفیف + ستارهٔ امتیاز + نوار پیشرفت موجودی
//   • سایدبار فیلتر: بازهٔ قیمت (اسلایدر دوطرفه)، دسته‌ها، فقط موجود، مرتب‌سازی
//   • اسکلتون بارگذاری + صفحه‌بندی + حالت خالی (مشترک با discovery-bar)
// این فایل عمداً self-contained است (type-only از templates-v2 می‌گیرد)
// تا حلقهٔ import ایجاد نشود.
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  ShoppingBag, Phone, MapPin, Instagram, Send, MessageCircle, Package, Star,
  Truck, ShieldCheck, Store as StoreIcon, Search, X, Ticket, Sparkles,
  ChevronLeft, BadgePercent, Headset, Pencil, Eye, SlidersHorizontal, RotateCcw,
  Crown, Zap, Gem, Clapperboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { usePerfMode } from "@/lib/perf-mode";
import { toPersianDigits } from "@/lib/persian";
import {
  rialToTomanLabel,
  effectiveUnitPriceRial,
  type StorefrontProductDTO,
} from "@/lib/storefront";
import {
  type StorefrontContent,
  getBusinessType,
  rialToCurrencyLabel,
  type StorefrontCurrencyCode,
} from "@/lib/storefront-wizard";
import { InteractiveMap } from "./interactive-map";
// Task 3-a — کاروسل سینمایی بنر (اسلایدهای چندگانهٔ مالک)
import { BannerCarousel } from "@/components/storefront/banner-carousel";
import { CinematicLayers } from "./cinematic-banner";
import {
  DiscoveryPagination, DiscoverySkeletonGrid, DiscoveryEmptyState,
  type DiscoveryTone,
} from "./discovery-bar";
import type { StorefrontDiscovery, StorefrontSortMode } from "./use-store-products";
import type { TemplateV2Props } from "./templates-v2";

/* ═══════════════ کی‌فریم‌های مشترک (تزریق یک‌باره از shop-page) ═══════════════ */

export const PREMIUM_TEMPLATE_KEYFRAMES = `
@keyframes sf-aurora-drift {
  0%   { transform: translate(0, 0) scale(1); }
  33%  { transform: translate(6%, -8%) scale(1.15); }
  66%  { transform: translate(-5%, 6%) scale(0.95); }
  100% { transform: translate(0, 0) scale(1); }
}
@keyframes sf-neon-pulse {
  0%, 100% { opacity: .85; }
  50%      { opacity: 1; }
}
@keyframes sf-gold-shimmer {
  0%   { background-position: 200% 50%; }
  100% { background-position: -200% 50%; }
}
@media (prefers-reduced-motion: reduce) {
  .sf-anim-blob, .sf-anim-pulse, .sf-anim-shimmer { animation: none !important; }
}
`;

export const PREMIUM_TEMPLATE_IDS = new Set(["aurora-pro", "bazaar-luxe", "dark-neon"]);

/* ═══════════════ اسکین‌ها ═══════════════ */

interface PremiumSkin {
  id: "aurora-pro" | "bazaar-luxe" | "dark-neon";
  accent: string;
  page: string;
  ink: string;
  sub: string;
  headerBg: string;
  inputCls: string;
  card: string;
  imgWrap: string;
  priceInk: string;
  addBtn: string;
  sidebar: string;
  sideInk: string;
  chip: string;
  chipActive: string;
  tone: DiscoveryTone;
  footerDark: boolean;
}

const SKIN_GLASS: PremiumSkin = {
  id: "aurora-pro",
  accent: "#10b981",
  page: "bg-[#0a0f1e] text-zinc-100",
  ink: "text-white",
  sub: "text-zinc-400",
  headerBg: "bg-[#0a0f1e]/70 border-white/10",
  inputCls: "border border-white/15 bg-white/10 text-zinc-100 placeholder:text-zinc-500",
  card: "border-white/10 bg-white/[0.07] backdrop-blur-xl hover:bg-white/[0.12] hover:shadow-emerald-500/10",
  imgWrap: "bg-white/5",
  priceInk: "text-emerald-300",
  addBtn: "bg-emerald-500 text-[#052015] hover:bg-emerald-400",
  sidebar: "border-white/10 bg-white/[0.06] backdrop-blur-xl",
  sideInk: "text-zinc-300",
  chip: "bg-white/10 text-zinc-200 hover:bg-white/20",
  chipActive: "bg-emerald-500 text-[#052015]",
  tone: {
    bg: "bg-white/[0.06] backdrop-blur-xl",
    border: "border-white/10",
    input: "border border-white/15 bg-white/10 text-zinc-100 placeholder:text-zinc-500",
    chip: "bg-white/10 text-zinc-200 hover:bg-white/20",
    chipActive: "bg-emerald-500 text-[#052015]",
    select: "border border-white/15 bg-[#0a0f1e] text-zinc-100",
    sub: "text-zinc-400",
  },
  footerDark: true,
};

const SKIN_GOLD: PremiumSkin = {
  id: "bazaar-luxe",
  accent: "#b8860b",
  page: "bg-[#faf6ee] text-[#33261a]",
  ink: "text-[#33261a]",
  sub: "text-[#8a7657]",
  headerBg: "bg-[#faf6ee]/90 border-[#e6dcc4]",
  inputCls: "border border-[#e6dcc4] bg-white text-[#33261a] placeholder:text-[#b3a684]",
  card: "border-[#e6dcc4] bg-white hover:border-[#c9a227] hover:shadow-[0_10px_40px_-12px_rgba(184,134,11,.35)]",
  imgWrap: "bg-[#f5efdf]",
  priceInk: "text-[#9a7418]",
  addBtn: "bg-gradient-to-l from-[#c9a227] to-[#a87c1a] text-white hover:brightness-110",
  sidebar: "border-[#e6dcc4] bg-white",
  sideInk: "text-[#5f5138]",
  chip: "bg-[#f5efdf] text-[#5f5138] hover:bg-[#efe7d0]",
  chipActive: "bg-[#33261a] text-[#f5e7c4]",
  tone: {
    bg: "bg-white",
    border: "border-[#e6dcc4]",
    input: "border border-[#e6dcc4] bg-white text-[#33261a] placeholder:text-[#b3a684]",
    chip: "bg-[#f5efdf] text-[#5f5138] hover:bg-[#efe7d0]",
    chipActive: "bg-[#33261a] text-[#f5e7c4]",
    select: "border border-[#e6dcc4] bg-white text-[#33261a]",
    sub: "text-[#8a7657]",
  },
  footerDark: true,
};

const SKIN_NEON: PremiumSkin = {
  id: "dark-neon",
  accent: "#10b981",
  page: "bg-[#07090d] text-zinc-100",
  ink: "text-white",
  sub: "text-zinc-500",
  headerBg: "bg-[#07090d]/80 border-[#10b981]/20",
  inputCls: "border border-[#10b981]/30 bg-black/40 text-zinc-100 placeholder:text-zinc-600",
  card: "border-[#10b981]/20 bg-[#0b0f14] hover:border-[#10b981]/60 hover:shadow-[0_0_30px_-6px_rgba(16,185,129,.45)]",
  imgWrap: "bg-[#0e141b]",
  priceInk: "text-emerald-400",
  addBtn: "bg-emerald-500 text-[#032015] hover:bg-emerald-400 hover:shadow-[0_0_20px_-4px_rgba(16,185,129,.8)]",
  sidebar: "border-[#10b981]/20 bg-[#0b0f14]",
  sideInk: "text-zinc-400",
  chip: "bg-[#101820] text-zinc-300 hover:bg-[#16212b]",
  chipActive: "bg-emerald-500 text-[#032015]",
  tone: {
    bg: "bg-[#0b0f14]",
    border: "border-[#10b981]/20",
    input: "border border-[#10b981]/30 bg-black/40 text-zinc-100 placeholder:text-zinc-600",
    chip: "bg-[#101820] text-zinc-300 hover:bg-[#16212b]",
    chipActive: "bg-emerald-500 text-[#032015]",
    select: "border border-[#10b981]/30 bg-[#07090d] text-zinc-100",
    sub: "text-zinc-500",
  },
  footerDark: true,
};

/* ═══════════════ اجزای مشترک پرمیوم ═══════════════ */

/** قاب ویرایش بصری مالک */
function EditableShellP({
  sectionId, editMode, onEditSection, children, className, label,
}: {
  sectionId: string;
  editMode?: boolean;
  onEditSection?: (id: string) => void;
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  if (!editMode) return <div id={sectionId} className={className}>{children}</div>;
  return (
    <div id={sectionId} className={`relative ${className ?? ""}`} data-edit-section={sectionId}>
      <button
        type="button"
        onClick={() => onEditSection?.(sectionId)}
        className="absolute top-2 left-2 z-20 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg transition-transform hover:scale-105"
        aria-label={`ویرایش ${label}`}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        ویرایش {label}
      </button>
      <div className="rounded-2xl outline-2 outline-dashed outline-amber-400/70 outline-offset-4">{children}</div>
    </div>
  );
}

/** نوار اعلان */
function PremiumAnnouncement({ text, skin }: { text: string; skin: PremiumSkin }) {
  if (!text) return null;
  const bg =
    skin.id === "aurora-pro"
      ? "bg-gradient-to-l from-emerald-500/25 via-teal-500/20 to-cyan-500/25 text-emerald-100"
      : skin.id === "bazaar-luxe"
        ? "bg-[#33261a] text-[#f5e7c4]"
        : "bg-emerald-500/15 text-emerald-300 border-b border-emerald-500/30";
  return (
    <div className={`flex items-center justify-center gap-2 px-4 py-2 text-center ${bg}`} role="status">
      <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="text-xs font-semibold sm:text-[13px]">{text}</span>
    </div>
  );
}

/** هدر پرمیوم */
function PremiumHeader({ props, skin }: { props: TemplateV2Props; skin: PremiumSkin }) {
  const { shop, content, discovery, editMode, onEditSection } = props;
  const menuLinks = (content.header.links ?? []).filter((l) => l.label.trim());
  const showSearch = content.header.showSearch !== false;
  return (
    <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${skin.headerBg}`}>
      {editMode ? (
        <button
          type="button"
          onClick={() => onEditSection?.("header")}
          className="absolute top-2 left-2 z-20 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg transition-transform hover:scale-105"
          aria-label="ویرایش هدر و منو"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          ویرایش هدر و منو
        </button>
      ) : null}
      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          {content.header.logoUrl ? (
            // لوگوی آپلودی مالک — دامنه نامشخص
            <img src={content.header.logoUrl} alt={`لوگوی ${shop.title}`} className="h-9 w-9 rounded-xl object-cover" />
          ) : (
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                skin.id === "bazaar-luxe"
                  ? "bg-gradient-to-br from-[#c9a227] to-[#8a6410] text-white"
                  : skin.id === "dark-neon"
                    ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/40"
                    : "bg-white/10 text-emerald-300 ring-1 ring-white/15"
              }`}
              style={
                content.header.accentColor
                  ? { backgroundColor: content.header.accentColor, color: "#ffffff" }
                  : undefined
              }
            >
              <StoreIcon className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
          <span className="min-w-0">
            <span className={`block truncate text-sm font-extrabold sm:text-base ${skin.ink}`}>{shop.title}</span>
            {content.header.tagline ? (
              <span className={`block truncate text-[11px] ${skin.sub}`}>{content.header.tagline}</span>
            ) : null}
          </span>
        </div>

        <div className={`relative mx-auto hidden max-w-md flex-1 md:block ${showSearch ? "" : "md:hidden"}`}>
          <Search className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${skin.sub}`} aria-hidden="true" />
          <input
            type="search"
            value={discovery.searchQuery}
            onChange={(e) => discovery.onSearchQueryChange(e.target.value)}
            placeholder="جستجو در محصولات این فروشگاه..."
            aria-label="جستجوی محصولات"
            className={`w-full rounded-full py-2 pl-4 pr-9 text-sm outline-none transition-shadow focus:ring-2 focus:ring-emerald-500/40 ${skin.inputCls}`}
          />
          {discovery.searchQuery ? (
            <button
              type="button"
              onClick={() => discovery.onSearchQueryChange("")}
              className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1 ${skin.sub}`}
              aria-label="پاک کردن جستجو"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {shop.ticketEnabled ? (
            <Button size="icon" variant="ghost" onClick={props.onOpenTicket} className="h-9 w-9 rounded-full" aria-label="تیکت پشتیبانی">
              <Ticket className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
          {props.customerName ? (
            <Button size="sm" variant="outline" onClick={props.onOpenOrders} className="hidden rounded-full sm:inline-flex">
              سفارش‌های من
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={props.onOpenAuth} className="hidden rounded-full sm:inline-flex">
              ورود / ثبت‌نام
            </Button>
          )}
          <Button size="sm" onClick={props.onOpenCart} className={`relative gap-2 rounded-full ${skin.addBtn}`} aria-label={`سبد خرید — ${toPersianDigits(props.cartCount)} قلم`}>
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">سبد خرید</span>
            {props.cartCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-black/25 px-1 text-xs font-bold tabular-nums">
                {toPersianDigits(props.cartCount)}
              </span>
            ) : null}
          </Button>
        </div>
      </div>

      {/* R26 — منوی قابل ویرایش مالک */}
      {menuLinks.length > 0 ? (
        <nav className="hidden border-t px-4 md:block sm:px-6" style={{ borderColor: skin.id === "bazaar-luxe" ? "#e6dcc4" : undefined }} aria-label="منوی فروشگاه">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-1 overflow-x-auto py-1.5">
            {menuLinks.map((l, i) => (
              <a
                key={`${l.label}-${i}`}
                href={l.href || "#"}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-70 ${skin.ink}`}
              >
                {l.label}
              </a>
            ))}
          </div>
        </nav>
      ) : null}

      <div className="border-t px-4 pb-2.5 md:hidden" style={{ borderColor: skin.id === "bazaar-luxe" ? "#e6dcc4" : undefined }}>
        <div className="relative">
          <Search className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${skin.sub}`} aria-hidden="true" />
          <input
            type="search"
            value={discovery.searchQuery}
            onChange={(e) => discovery.onSearchQueryChange(e.target.value)}
            placeholder="جستجو در محصولات..."
            aria-label="جستجوی محصولات"
            className={`w-full rounded-full py-2 pl-4 pr-9 text-sm outline-none ${skin.inputCls}`}
          />
        </div>
      </div>
    </header>
  );
}

/** نوار پیشرفت موجودی — فقط وقتی انبار شناخته‌شده است */
function StockProgressBar({ p, accent, dark }: { p: StorefrontProductDTO; accent: string; dark?: boolean }) {
  if (!p.stockKnown || typeof p.stock !== "number" || p.stock <= 0) return null;
  const qty = p.stock;
  const pct = Math.min(100, Math.round((qty / Math.max(10, qty)) * 100));
  const low = qty <= 5;
  const color = low ? "#f59e0b" : accent;
  return (
    <div className="space-y-1" aria-label={`موجودی: ${toPersianDigits(qty)} عدد`}>
      <p className={`text-[10px] font-bold ${low ? "text-amber-500" : dark ? "text-emerald-400" : "text-emerald-600"}`}>
        {low ? `فقط ${toPersianDigits(qty)} عدد باقی مانده!` : `${toPersianDigits(qty)} عدد موجود`}
      </p>
      <div className={`h-1.5 overflow-hidden rounded-full ${dark ? "bg-white/10" : "bg-black/10"}`}>
        <span className="block h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

/** کارت کالای پرمیوم — تیلت سه‌بعدی + مشاهدهٔ سریع + تخفیف + نوار موجودی */
function PremiumProductCard({
  p, skin, currency, usdRateToman, cnyRateToman, qtyOf, onAdd, onQuickView, detailHref, editMode, onOpen,
}: {
  p: StorefrontProductDTO;
  skin: PremiumSkin;
  currency: StorefrontCurrencyCode;
  usdRateToman?: number | null;
  cnyRateToman?: number | null;
  qtyOf: number;
  onAdd: () => void;
  onQuickView: () => void;
  detailHref: string;
  editMode?: boolean;
  onOpen: () => void;
}) {
  const { reducedMotion } = usePerfMode();
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 });
  const dark = skin.id !== "bazaar-luxe";
  const discount = typeof p.discountPercent === "number" && p.discountPercent > 0 ? Math.min(90, p.discountPercent) : 0;
  const price = effectiveUnitPriceRial(p);
  const ratingCount = p.ratingCount;
  const ratingAvg = p.ratingAvg;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -6, y: px * 8 });
  }

  const priceNode = (
    <div className="flex flex-col items-start leading-tight">
      {discount > 0 ? (
        <span className={`text-[11px] font-medium tabular-nums line-through ${dark ? "text-zinc-500" : "text-[#b3a684]"}`}>
          {rialToCurrencyLabel(p.priceRial, currency, usdRateToman, cnyRateToman)}
        </span>
      ) : null}
      <span className={`text-sm font-black tabular-nums ${skin.priceInk}`}>
        {rialToCurrencyLabel(price, currency, usdRateToman, cnyRateToman)}
      </span>
    </div>
  );

  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      style={{ transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transition: "transform 220ms ease" }}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-300 ${skin.card}`}
    >
      <div className={`relative block aspect-square w-full overflow-hidden ${skin.imgWrap}`}>
        {p.imageUrl ? (
          <img
            src={p.imageUrl}
            alt={p.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <span className={`flex h-full w-full items-center justify-center ${skin.sub}`}>
            <Package className="h-10 w-10 opacity-50" aria-hidden="true" />
          </span>
        )}

        {discount > 0 ? (
          <span className="absolute right-2 top-2 z-10 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-extrabold text-white shadow-md">
            ٪{toPersianDigits(discount)} تخفیف
          </span>
        ) : null}
        {!p.inStock ? (
          <span className="absolute inset-0 z-[5] flex items-center justify-center bg-black/60 text-sm font-bold text-white backdrop-blur-[2px]">
            ناموجود
          </span>
        ) : null}
        {qtyOf > 0 ? (
          <span className="absolute left-2 top-2 z-10 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white shadow-md tabular-nums" style={{ backgroundColor: skin.accent }}>
            {toPersianDigits(qtyOf)} در سبد
          </span>
        ) : null}

        {/* اکشن‌های شناور: مشاهدهٔ سریع */}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex translate-y-10 justify-center gap-2 opacity-0 transition-all duration-300 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
          <button
            type="button"
            onClick={onQuickView}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-extrabold shadow-lg backdrop-blur-md transition-transform hover:scale-[1.03] ${
              dark ? "bg-white/15 text-white" : "bg-[#33261a]/85 text-[#f5e7c4]"
            }`}
            aria-label={`مشاهدهٔ سریع ${p.name}`}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            مشاهدهٔ سریع
          </button>
          {editMode ? (
            <button
              type="button"
              onClick={onOpen}
              className={`inline-flex items-center justify-center rounded-full px-3 py-2 text-[11px] font-extrabold shadow-lg backdrop-blur-md ${
                dark ? "bg-white/15 text-white" : "bg-[#33261a]/85 text-[#f5e7c4]"
              }`}
              aria-label={`جزئیات ${p.name}`}
            >
              جزئیات
            </button>
          ) : (
            <a
              href={detailHref}
              className={`inline-flex items-center justify-center rounded-full px-3 py-2 text-[11px] font-extrabold shadow-lg backdrop-blur-md transition-transform hover:scale-[1.03] ${
                dark ? "bg-white/15 text-white" : "bg-[#33261a]/85 text-[#f5e7c4]"
              }`}
              aria-label={`صفحهٔ ${p.name}`}
            >
              صفحهٔ کالا
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {editMode ? (
          <button type="button" onClick={onOpen} className="min-h-[2.6em] text-right">
            <p className="line-clamp-2 text-[13px] font-bold leading-snug">{p.name}</p>
          </button>
        ) : (
          <a href={detailHref} className="min-h-[2.6em] text-right">
            <p className="line-clamp-2 text-[13px] font-bold leading-snug transition-colors hover:underline">{p.name}</p>
          </a>
        )}

        {typeof ratingCount === "number" && ratingCount > 0 && typeof ratingAvg === "number" ? (
          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-500">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
            {toPersianDigits(ratingAvg)}
            <span className={skin.sub}>({toPersianDigits(ratingCount)} نظر)</span>
          </span>
        ) : null}

        <StockProgressBar p={p} accent={skin.accent} dark={dark} />

        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          {priceNode}
          <Button
            size="sm"
            onClick={onAdd}
            disabled={!p.inStock}
            className={`shrink-0 gap-1 rounded-xl ${skin.addBtn}`}
            aria-label={`افزودن ${p.name} به سبد`}
          >
            <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
            {qtyOf > 0 ? `(${toPersianDigits(qtyOf)})` : "افزودن"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** گفت‌وگوی مشاهدهٔ سریع — گالری + قیمت + توضیح + افزودن به سبد */
function QuickViewDialog({
  p, open, onOpenChange, skin, currency, usdRateToman, cnyRateToman, onAdd, detailHref,
}: {
  p: StorefrontProductDTO | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  skin: PremiumSkin;
  currency: StorefrontCurrencyCode;
  usdRateToman?: number | null;
  cnyRateToman?: number | null;
  onAdd: (p: StorefrontProductDTO) => void;
  detailHref: (p: StorefrontProductDTO) => string;
}) {
  const [activeImg, setActiveImg] = React.useState(0);
  React.useEffect(() => setActiveImg(0), [p?.id]);
  if (!p) return null;

  const images = [p.imageUrl, ...(p.gallery ?? [])].filter((x): x is string => !!x);
  const discount = typeof p.discountPercent === "number" && p.discountPercent > 0 ? p.discountPercent : 0;
  const price = effectiveUnitPriceRial(p);
  const plainDesc = (p.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl overflow-y-auto">
        <DialogHeader className="text-right">
          <DialogTitle className="text-base leading-7">{p.name}</DialogTitle>
          <DialogDescription className="sr-only">مشاهدهٔ سریع کالا</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className={`relative aspect-square overflow-hidden rounded-2xl border ${skin.imgWrap}`}>
              {images[activeImg] ? (
                <img src={images[activeImg]} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <Package className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
                </span>
              )}
              {discount > 0 ? (
                <span className="absolute right-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-extrabold text-white shadow">
                  ٪{toPersianDigits(discount)} تخفیف
                </span>
              ) : null}
            </div>
            {images.length > 1 ? (
              <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={img + i}
                    type="button"
                    onClick={() => setActiveImg(i)}
                    className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                      i === activeImg ? "border-emerald-500" : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                    aria-label={`تصویر ${toPersianDigits(i + 1)} ${p.name}`}
                  >
                    <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              {p.inStock ? (
                <Badge variant="outline" className="border-emerald-300/60 bg-emerald-500/10 text-emerald-600">موجود در انبار</Badge>
              ) : (
                <Badge variant="outline" className="border-red-300/60 bg-red-500/10 text-red-600">فعلاً ناموجود</Badge>
              )}
              {typeof p.ratingCount === "number" && p.ratingCount > 0 && typeof p.ratingAvg === "number" ? (
                <span className="flex items-center gap-1 text-xs font-bold text-amber-600">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                  {toPersianDigits(p.ratingAvg)} ({toPersianDigits(p.ratingCount)} نظر)
                </span>
              ) : null}
            </div>

            <div className="rounded-2xl border bg-muted/40 p-4">
              {discount > 0 ? (
                <p className="text-xs font-medium tabular-nums text-muted-foreground line-through">
                  {rialToCurrencyLabel(p.priceRial, currency, usdRateToman, cnyRateToman)}
                </p>
              ) : null}
              <p className={`text-xl font-black tabular-nums ${skin.id === "bazaar-luxe" ? "text-[#9a7418]" : "text-emerald-600"}`}>
                {rialToCurrencyLabel(price, currency, usdRateToman, cnyRateToman)}
              </p>
            </div>

            {plainDesc ? (
              <p className="line-clamp-5 text-sm leading-7 text-muted-foreground">{plainDesc}</p>
            ) : null}

            <StockProgressBar p={p} accent={skin.accent} />

            <div className="mt-auto flex flex-col gap-2">
              <Button
                onClick={() => {
                  onAdd(p);
                  onOpenChange(false);
                }}
                disabled={!p.inStock}
                className={`w-full gap-2 rounded-full ${skin.addBtn}`}
              >
                <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                افزودن به سبد خرید
              </Button>
              <a
                href={detailHref(p)}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition-colors hover:bg-muted"
              >
                مشاهدهٔ صفحهٔ کامل کالا
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════ سایدبار فیلتر پرمیوم ═══════════════ */

function PremiumFiltersSidebar({
  discovery, skin, idPrefix,
}: {
  discovery: StorefrontDiscovery;
  skin: PremiumSkin;
  idPrefix: string;
}) {
  const facets = discovery.facets;
  const domainMin = 0;
  const domainMax = React.useMemo(() => {
    const fmax = facets?.price.max;
    if (typeof fmax === "number" && fmax > 0) return Math.ceil(fmax * 1.05);
    return 5_000_000; // سقف پیش‌فرض وقتی فاسِت هنوز نیامده
  }, [facets?.price.max]);

  const appliedMin = Number(discovery.priceApplied.min || domainMin);
  const appliedMax = Number(discovery.priceApplied.max || domainMax);
  const lo = Math.min(appliedMin, appliedMax || domainMax);
  const hi = Math.max(appliedMin, appliedMax || domainMax);

  const priceActive = !!(discovery.priceApplied.min || discovery.priceApplied.max);

  return (
    <div className={`rounded-2xl border p-4 ${skin.sidebar}`} aria-label="فیلترهای کالاها">
      {/* دسته‌ها */}
      <div>
        <p className={`mb-2 text-xs font-black ${skin.sideInk}`}>دسته‌بندی‌ها</p>
        <div className="max-h-64 space-y-1 overflow-y-auto pl-1" role="listbox" aria-label="انتخاب دسته">
          <button
            type="button"
            role="option"
            aria-selected={discovery.selectedCategory === null}
            onClick={() => discovery.onSelectCategory(null)}
            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-bold transition-colors ${
              discovery.selectedCategory === null ? skin.chipActive : skin.chip
            }`}
          >
            <span>همهٔ دسته‌ها</span>
          </button>
          {(discovery.categories ?? []).map((c) => (
            <button
              key={c.name}
              type="button"
              role="option"
              aria-selected={discovery.selectedCategory === c.name}
              onClick={() => discovery.onSelectCategory(discovery.selectedCategory === c.name ? null : c.name)}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-bold transition-colors ${
                discovery.selectedCategory === c.name ? skin.chipActive : skin.chip
              }`}
            >
              <span className="truncate">{c.name}</span>
              <span className="tabular-nums opacity-70">{toPersianDigits(c.count)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* بازهٔ قیمت */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <p className={`text-xs font-black ${skin.sideInk}`}>بازهٔ قیمت (تومان)</p>
          {priceActive ? (
            <button
              type="button"
              onClick={discovery.clearPriceRange}
              className={`inline-flex items-center gap-1 text-[10px] font-bold ${skin.id === "bazaar-luxe" ? "text-[#9a7418]" : "text-emerald-400"}`}
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              حذف بازه
            </button>
          ) : null}
        </div>
        <Slider
          dir="ltr"
          min={domainMin}
          max={domainMax}
          step={Math.max(1, Math.round(domainMax / 200))}
          value={[lo, hi]}
          onValueChange={([a, b]) => discovery.onPriceInputChange(a <= 0 ? "" : String(a), b >= domainMax ? "" : String(b))}
          onValueCommit={() => discovery.applyPriceRange()}
          aria-label="بازهٔ قیمت"
          className={`${skin.id === "bazaar-luxe" ? "*:border-[#c9a227]" : "*:border-emerald-500"}`}
        />
        <div className={`mt-2 flex items-center justify-between text-[10px] font-bold tabular-nums ${skin.sideInk}`}>
          <span>{toPersianDigits(new Intl.NumberFormat("fa-IR").format(lo))}</span>
          <span>{toPersianDigits(new Intl.NumberFormat("fa-IR").format(hi))}</span>
        </div>
      </div>

      {/* فقط موجود */}
      <div className={`mt-5 flex items-center justify-between rounded-xl border px-3 py-2.5 ${skin.sidebar}`}>
        <div>
          <p className="text-xs font-bold">فقط کالاهای موجود</p>
          <p className={`mt-0.5 text-[10px] ${skin.sub}`}>
            {facets ? `${toPersianDigits(facets.inStock)} کالا از ${toPersianDigits(facets.totalAll)}` : "…"}
          </p>
        </div>
        <Switch checked={discovery.inStockOnly} onCheckedChange={discovery.onInStockOnlyChange} aria-label="فقط کالاهای موجود" />
      </div>

      {/* مرتب‌سازی */}
      <div className="mt-5">
        <label htmlFor={`${idPrefix}-sort`} className={`mb-2 block text-xs font-black ${skin.sideInk}`}>
          مرتب‌سازی
        </label>
        <select
          id={`${idPrefix}-sort`}
          value={discovery.sortMode}
          onChange={(e) => discovery.onSortModeChange(e.target.value as StorefrontSortMode)}
          className={`w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none ${skin.tone.select}`}
        >
          <option value="newest">جدیدترین</option>
          <option value="cheapest">ارزان‌ترین</option>
          <option value="expensive">گران‌ترین</option>
          <option value="name">بر اساس نام</option>
        </select>
      </div>

      {discovery.hasActiveFilters ? (
        <Button
          variant="outline"
          size="sm"
          onClick={discovery.reset}
          className={`mt-4 w-full gap-1.5 rounded-full text-xs ${skin.id === "bazaar-luxe" ? "border-[#c9a227]/50 text-[#9a7418] hover:bg-[#f5efdf]" : "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"}`}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          حذف همهٔ فیلترها ({toPersianDigits(discovery.activeFilterCount)})
        </Button>
      ) : null}
    </div>
  );
}

/* ═══════════════ بخش محصولات پرمیوم: سایدبار + گرید + مشاهدهٔ سریع ═══════════════ */

function PremiumProductsArea({
  props, skin,
}: {
  props: TemplateV2Props;
  skin: PremiumSkin;
}) {
  const { discovery, editMode } = props;
  const [quickView, setQuickView] = React.useState<StorefrontProductDTO | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);
  const dark = skin.id !== "bazaar-luxe";

  const sidebar = (
    <PremiumFiltersSidebar discovery={discovery} skin={skin} idPrefix={skin.id} />
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`text-lg font-black sm:text-xl ${skin.ink}`}>
          {discovery.selectedCategory ? discovery.selectedCategory : "همهٔ محصولات"}
          <span className={`mr-2 text-xs font-bold ${skin.sub}`}>{toPersianDigits(discovery.total)} کالا</span>
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMobileFiltersOpen((v) => !v)}
          className={`gap-1.5 rounded-full lg:hidden ${skin.id === "bazaar-luxe" ? "border-[#c9a227]/50" : "border-emerald-500/40"}`}
          aria-expanded={mobileFiltersOpen}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          فیلترها {discovery.activeFilterCount > 0 ? `(${toPersianDigits(discovery.activeFilterCount)})` : ""}
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <aside className={`${mobileFiltersOpen ? "block" : "hidden"} lg:block`} aria-label="سایدبار فیلترها">
          {sidebar}
        </aside>

        <div className="min-w-0">
          {discovery.loading && discovery.products.length === 0 ? (
            <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4`}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={`overflow-hidden rounded-2xl border ${skin.sidebar}`}>
                  <Skeleton className={`aspect-square w-full rounded-none ${skin.id === "bazaar-luxe" ? "bg-[#f5efdf]" : "bg-white/5"}`} />
                  <div className="space-y-2 p-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-6 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : discovery.products.length === 0 ? (
            <DiscoveryEmptyState discovery={discovery} tone={skin.tone} />
          ) : (
            <>
              <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 ${discovery.loading ? "opacity-60 transition-opacity" : ""}`}>
                {discovery.products.map((p) => (
                  <PremiumProductCard
                    key={p.id}
                    p={p}
                    skin={skin}
                    currency={props.currency}
                    usdRateToman={props.usdRateToman}
                    cnyRateToman={props.cnyRateToman}
                    qtyOf={props.qtyOf(p.id)}
                    onAdd={() => props.onAddToCart(p)}
                    onQuickView={() => setQuickView(p)}
                    onOpen={() => props.onOpenProduct(p)}
                    detailHref={`/shop/${encodeURIComponent(props.shop.slug)}/p/${encodeURIComponent(p.slug || p.id)}`}
                    editMode={editMode}
                  />
                ))}
              </div>
              {!editMode ? <DiscoveryPagination discovery={discovery} tone={skin.tone} /> : null}
            </>
          )}
        </div>
      </div>

      <QuickViewDialog
        p={quickView}
        open={!!quickView}
        onOpenChange={(o) => !o && setQuickView(null)}
        skin={skin}
        currency={props.currency}
        usdRateToman={props.usdRateToman}
        cnyRateToman={props.cnyRateToman}
        onAdd={props.onAddToCart}
        detailHref={(p) => `/shop/${encodeURIComponent(props.shop.slug)}/p/${encodeURIComponent(p.slug || p.id)}`}
      />
    </div>
  );
}

/* ═══════════════ فوتر و بخش‌های مشترک ═══════════════ */

function PremiumFooter({ props, skin }: { props: TemplateV2Props; skin: PremiumSkin }) {
  const { shop, content, editMode, onEditSection } = props;
  const dark = true;
  const hasGeo = typeof shop.lat === "number" && typeof shop.lng === "number";
  const socials: { label: string; href: string; icon: React.ElementType }[] = [];
  if (content.footer.showSocials) {
    if (shop.socialInstagram) socials.push({ label: `@${shop.socialInstagram}`, href: `https://instagram.com/${shop.socialInstagram.replace(/^@/, "")}`, icon: Instagram });
    if (shop.socialTelegram) socials.push({ label: `@${shop.socialTelegram}`, href: `https://t.me/${shop.socialTelegram.replace(/^@/, "")}`, icon: Send });
    if (shop.socialWhatsapp) socials.push({ label: shop.socialWhatsapp, href: `https://wa.me/${shop.socialWhatsapp.replace(/\D/g, "")}`, icon: MessageCircle });
    // R26 — آپارات
    if (content.footer.socialAparat) socials.push({ label: "آپارات", href: content.footer.socialAparat, icon: Clapperboard });
  }
  const goldish = skin.id === "bazaar-luxe";
  const aboutTitle = content.footer.aboutTitle?.trim() || shop.title;
  const aboutText = content.footer.aboutText?.trim() || content.about.text;
  const columns = (content.footer.columns ?? []).filter((c) => c.title.trim() || c.links.length > 0);
  return (
    <footer
      className={`mt-auto border-t ${
        goldish ? "border-[#e6dcc4] bg-[#2b2114] text-[#e9ddc2]" : skin.id === "dark-neon" ? "border-emerald-500/20 bg-[#05070a] text-zinc-400" : "border-white/10 bg-[#070b16] text-zinc-400"
      }`}
      data-edit-section="footer"
    >
      {editMode ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => onEditSection?.("footer")}
            className="absolute top-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg transition-transform hover:scale-105"
            aria-label="ویرایش فوتر"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            ویرایش فوتر
          </button>
        </div>
      ) : null}
      <div className={`mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 ${editMode ? "outline-2 outline-dashed outline-amber-400/70 outline-offset-4" : ""}`}>
        <div className={`grid gap-8 ${hasGeo ? "md:grid-cols-2" : ""}`}>
          <div>
            <h3 className={`text-lg font-extrabold ${goldish ? "text-[#f5e7c4]" : "text-white"}`}>{aboutTitle}</h3>
            <p className="mt-2 text-sm leading-7 opacity-80">{aboutText}</p>
            <ul className="mt-4 space-y-2 text-sm">
              {shop.phone ? (
                <li className="flex items-center gap-2" dir="ltr">
                  <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="font-medium tabular-nums">{toPersianDigits(shop.phone)}</span>
                </li>
              ) : null}
              {shop.address ? (
                <li className="flex items-start gap-2">
                  <MapPin className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{shop.address}{shop.city ? ` — ${shop.city}` : ""}</span>
                </li>
              ) : null}
              {content.footer.note ? <li className="text-xs opacity-60">{content.footer.note}</li> : null}
            </ul>
            {socials.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      goldish ? "bg-[#c9a227]/15 text-[#f0d98c] hover:bg-[#c9a227]/25" : "bg-white/10 text-emerald-300 hover:bg-white/20"
                    }`}
                  >
                    <s.icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {s.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
          {content.footer.showMap && hasGeo ? (
            <div>
              <p className={`mb-2 text-sm font-bold ${goldish ? "text-[#f5e7c4]" : "text-white"}`}>موقعیت روی نقشه</p>
              <InteractiveMap
                lat={shop.lat as number}
                lng={shop.lng as number}
                title={shop.title}
                address={[shop.address, shop.city].filter(Boolean).join(" — ") || undefined}
                height="220px"
              />
            </div>
          ) : null}
        </div>

        {/* R26 — ستون‌های لینک دلخواه مالک */}
        {columns.length > 0 ? (
          <div className={`mt-8 grid gap-6 border-t pt-6 sm:grid-cols-3 ${goldish ? "border-[#4a3a22]" : "border-white/10"}`}>
            {columns.map((col, i) => (
              <nav key={`${col.title}-${i}`} aria-label={col.title || `ستون ${i + 1}`}>
                {col.title ? (
                  <p className={`mb-2 text-sm font-bold ${goldish ? "text-[#f5e7c4]" : "text-white"}`}>{col.title}</p>
                ) : null}
                <ul className="space-y-1.5 text-sm opacity-75">
                  {col.links.map((l, j) => (
                    <li key={`${l.label}-${j}`}>
                      <a href={l.href || "#"} className="transition-colors hover:underline">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        ) : null}

        <div className={`mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs ${goldish ? "border-[#4a3a22] opacity-70" : "border-white/10 opacity-60"}`}>
          <span>
            {content.footer.copyright?.trim() ||
              `© ${toPersianDigits(new Date().getFullYear())} ${shop.title} — تمامی حقوق محفوظ است`}
          </span>
          {content.footer.showPoweredBy !== false ? (
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-bold transition-opacity hover:opacity-80 ${
                goldish ? "bg-[#c9a227] text-[#2b2114]" : "bg-emerald-500 text-[#032015]"
              }`}
            >
              <StoreIcon className="h-3.5 w-3.5" aria-hidden="true" />
              نرم‌افزار حسابداری افق پلاس
            </a>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

function FeatureIconP({ icon }: { icon: string }) {
  if (icon === "shield") return <ShieldCheck className="h-5 w-5" aria-hidden="true" />;
  if (icon === "support") return <Headset className="h-5 w-5" aria-hidden="true" />;
  if (icon === "price") return <BadgePercent className="h-5 w-5" aria-hidden="true" />;
  return <Truck className="h-5 w-5" aria-hidden="true" />;
}

/** نوار اعتماد + آمار + دربارهٔ ما (استایل پرمیوم) */
function PremiumExtras({ props, skin }: { props: TemplateV2Props; skin: PremiumSkin }) {
  const { content, editMode, onEditSection } = props;
  const cfg = getBusinessType(props.shop.businessType);
  const goldish = skin.id === "bazaar-luxe";
  const cardCls = goldish
    ? "border-[#e6dcc4] bg-white"
    : skin.id === "dark-neon"
      ? "border-[#10b981]/20 bg-[#0b0f14]"
      : "border-white/10 bg-white/[0.06] backdrop-blur-xl";

  return (
    <>
      {/* آمار */}
      {content.sections.showStats && content.stats.length > 0 ? (
        <EditableShellP sectionId="stats" editMode={editMode} onEditSection={onEditSection} label="آمار" className="mx-auto w-full max-w-7xl px-4 pt-10 sm:px-6">
          <div className="grid grid-cols-3 gap-3" data-edit-section="stats">
            {content.stats.slice(0, 3).map((s) => (
              <div key={s.label} className={`rounded-2xl border p-5 text-center ${cardCls}`}>
                <p className={`text-xl font-black tabular-nums sm:text-2xl ${goldish ? "text-[#9a7418]" : "text-emerald-400"}`}>{s.value}</p>
                <p className={`mt-1 text-[11px] font-medium sm:text-xs ${skin.sub}`}>{s.label}</p>
              </div>
            ))}
          </div>
        </EditableShellP>
      ) : null}

      {/* دربارهٔ ما */}
      {content.sections.showAbout ? (
        <EditableShellP sectionId="about" editMode={editMode} onEditSection={onEditSection} label="دربارهٔ ما" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-10 sm:px-6">
          <div className={`rounded-3xl border p-6 sm:p-8 ${cardCls}`} data-edit-section="about">
            <h2 className={`text-lg font-extrabold sm:text-xl ${skin.ink}`}>{content.about.title}</h2>
            <p className={`mt-3 text-sm leading-8 ${skin.sub}`}>{content.about.text}</p>
          </div>
        </EditableShellP>
      ) : null}

      {/* اعتماد */}
      {cfg?.trustNotes?.length ? (
        <div
          className={`flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-3 ${
            goldish ? "bg-[#33261a] text-[#f5e7c4]" : skin.id === "dark-neon" ? "bg-emerald-500/10 text-emerald-300" : "bg-white/[0.04] text-zinc-300"
          }`}
          data-edit-section="trust"
        >
          {cfg.trustNotes.map((n) => (
            <span key={n} className="inline-flex items-center gap-1.5 text-xs font-semibold">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {n}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

/* ═══════════════ ۱) آرورا پرو — گلس‌مورفیسم با گرادیان متحرک ═══════════════ */

export function AuroraProTemplate(props: TemplateV2Props) {
  const { shop, content, bannerSrc, editMode, onEditSection } = props;
  const skin = SKIN_GLASS;
  const cfg = getBusinessType(shop.businessType);

  return (
    <div className={`relative flex min-h-screen flex-col overflow-hidden ${skin.page}`} dir="rtl">
      {/* بلاب‌های گرادیان متحرک پس‌زمینه */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="sf-anim-blob absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-500/25 blur-3xl" style={{ animation: "sf-aurora-drift 22s ease-in-out infinite" }} />
        <div className="sf-anim-blob absolute -left-24 top-1/3 h-80 w-80 rounded-full bg-teal-400/20 blur-3xl" style={{ animation: "sf-aurora-drift 28s ease-in-out infinite reverse" }} />
        <div className="sf-anim-blob absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" style={{ animation: "sf-aurora-drift 25s ease-in-out infinite" }} />
      </div>

      <div className="relative">
        <PremiumAnnouncement text={content.announcement} skin={skin} />
        <PremiumHeader props={props} skin={skin} />

        {/* هیرو شیشه‌ای */}
        <EditableShellP sectionId="banner" editMode={editMode} onEditSection={onEditSection} label="بنر" className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6">
          {/* Task 3-a — اسلایدهای چندگانهٔ مالک → کاروسل سینمایی به‌جای هیرو تکی */}
          {content.banner.slides?.length ? (
            <BannerCarousel
              slides={content.banner.slides}
              businessType={shop.businessType}
              fallbackBadge={content.banner.badge}
              fallbackTitle={content.banner.title}
              fallbackSubtitle={content.banner.subtitle}
              fallbackCtaLabel={content.banner.ctaLabel}
              fallbackCtaLink={content.banner.ctaLink}
              className="overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl"
            />
          ) : (
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] shadow-2xl backdrop-blur-2xl">
            <div className="grid items-stretch md:grid-cols-2">
              <div className="flex flex-col items-start justify-center gap-5 p-7 sm:p-12">
                {content.banner.badge ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-1.5 text-xs font-bold text-emerald-300">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    {content.banner.badge}
                  </span>
                ) : null}
                <h1 className="text-3xl font-black leading-[1.4] text-white sm:text-5xl sm:leading-[1.35]">{content.banner.title}</h1>
                <p className="max-w-md text-sm leading-8 text-zinc-300 sm:text-base">{content.banner.subtitle}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={content.banner.ctaLink || "#products"}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-l from-emerald-500 to-teal-400 px-7 py-3.5 text-sm font-extrabold text-[#052015] shadow-lg shadow-emerald-500/30 transition-transform hover:scale-[1.03]"
                  >
                    {content.banner.ctaLabel}
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </a>
                  {shop.phone ? (
                    <a href={`tel:${shop.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 text-sm font-bold text-emerald-300 tabular-nums" dir="ltr">
                      <Phone className="h-4 w-4" aria-hidden="true" />
                      {toPersianDigits(shop.phone)}
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="relative min-h-[260px] md:min-h-[420px]">
                {bannerSrc ? (
                  <img src={bannerSrc} alt={`بنر ${shop.title}`} className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />
                ) : (
                  <CinematicLayers businessType={shop.businessType} className="absolute inset-0" />
                )}
                <div className="absolute inset-0 bg-gradient-to-l from-transparent via-[#0a0f1e]/20 to-[#0a0f1e]/70" aria-hidden="true" />
              </div>
            </div>
          </div>
          )}
        </EditableShellP>

        {/* ویژگی‌ها */}
        {content.sections.showFeatures && content.features.length > 0 ? (
          <EditableShellP sectionId="features" editMode={editMode} onEditSection={onEditSection} label="ویژگی‌ها" className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {content.features.slice(0, 4).map((f) => (
                <div key={f.title} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center backdrop-blur-xl transition-colors hover:bg-white/[0.1]">
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                    <FeatureIconP icon={f.icon} />
                  </span>
                  <p className="mt-2 text-sm font-extrabold text-white">{f.title}</p>
                  <p className="mt-1 text-[11px] leading-5 text-zinc-400">{f.text}</p>
                </div>
              ))}
            </div>
          </EditableShellP>
        ) : null}

        {/* دسته‌ها */}
        {content.sections.showCategories && props.categories.length > 0 ? (
          <EditableShellP sectionId="categories" editMode={editMode} onEditSection={onEditSection} label="دسته‌بندی‌ها" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 pt-8 sm:px-6">
            <div className="flex flex-wrap gap-2">
              {props.categories.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => props.discovery.onSelectCategory(props.discovery.selectedCategory === c.name ? null : c.name)}
                  aria-pressed={props.discovery.selectedCategory === c.name}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all ${
                    props.discovery.selectedCategory === c.name ? "bg-emerald-500 text-[#052015] shadow-lg shadow-emerald-500/30" : "border border-white/10 bg-white/[0.06] text-zinc-200 backdrop-blur-xl hover:bg-white/[0.12]"
                  }`}
                >
                  {c.name}
                  <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] tabular-nums">{toPersianDigits(c.count)}</span>
                </button>
              ))}
            </div>
          </EditableShellP>
        ) : null}

        {/* محصولات */}
        <EditableShellP sectionId="products" editMode={editMode} onEditSection={onEditSection} label="محصولات" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-10 sm:px-6">
          <PremiumProductsArea props={props} skin={skin} />
        </EditableShellP>

        <PremiumExtras props={props} skin={skin} />
      </div>
      <div className="flex-grow" />
      <PremiumFooter props={props} skin={skin} />
    </div>
  );
}

/* ═══════════════ ۲) بازار لوکس — طلایی ایرانی ═══════════════ */

export function BazaarLuxeTemplate(props: TemplateV2Props) {
  const { shop, content, bannerSrc, editMode, onEditSection } = props;
  const skin = SKIN_GOLD;

  return (
    <div className={`flex min-h-screen flex-col ${skin.page}`} dir="rtl">
      <PremiumAnnouncement text={content.announcement} skin={skin} />
      <PremiumHeader props={props} skin={skin} />

      {/* هیرو لوکس — قاب طلایی با نگین */}
      <EditableShellP sectionId="banner" editMode={editMode} onEditSection={onEditSection} label="بنر" className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6">
        {/* Task 3-a — اسلایدهای چندگانهٔ مالک → کاروسل سینمایی به‌جای هیرو تکی */}
        {content.banner.slides?.length ? (
          <BannerCarousel
            slides={content.banner.slides}
            businessType={shop.businessType}
            fallbackBadge={content.banner.badge}
            fallbackTitle={content.banner.title}
            fallbackSubtitle={content.banner.subtitle}
            fallbackCtaLabel={content.banner.ctaLabel}
            fallbackCtaLink={content.banner.ctaLink}
            className="overflow-hidden rounded-[2rem] border-2 border-[#c9a227]/50 shadow-[0_20px_80px_-30px_rgba(184,134,11,.4)]"
          />
        ) : (
        <div className="relative overflow-hidden rounded-[2rem] border-2 border-[#c9a227]/50 bg-white shadow-[0_20px_80px_-30px_rgba(184,134,11,.4)]">
          {/* حاشیهٔ تذهیبی داخلی */}
          <div className="pointer-events-none absolute inset-3 rounded-[1.6rem] border border-[#c9a227]/30" aria-hidden="true" />
          <span className="absolute -top-0 right-1/2 z-10 flex h-9 w-9 -translate-y-1/2 translate-x-1/2 rotate-45 items-center justify-center rounded-md bg-gradient-to-br from-[#e7c65a] to-[#a87c1a] shadow-md" aria-hidden="true">
            <Gem className="-rotate-45 text-white" style={{ width: 14, height: 14 }} />
          </span>

          <div className="grid items-stretch md:grid-cols-[52%_48%]">
            <div className="order-2 flex flex-col items-start justify-center gap-5 p-7 sm:p-12 md:order-1">
              {content.banner.badge ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#c9a227]/40 bg-[#faf3e0] px-3.5 py-1.5 text-xs font-bold text-[#9a7418]">
                  <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                  {content.banner.badge}
                </span>
              ) : null}
              <h1 className="sf-anim-shimmer bg-gradient-to-l from-[#8a6410] via-[#c9a227] to-[#8a6410] bg-[length:200%_auto] bg-clip-text text-3xl font-black leading-[1.45] text-transparent sm:text-5xl sm:leading-[1.4]" style={{ animation: "sf-gold-shimmer 6s linear infinite" }}>
                {content.banner.title}
              </h1>
              <p className="max-w-md text-sm leading-8 text-[#5f5138] sm:text-base">{content.banner.subtitle}</p>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={content.banner.ctaLink || "#products"}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-l from-[#c9a227] to-[#a87c1a] px-7 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-[#c9a227]/40 transition-transform hover:scale-[1.03]"
                >
                  {content.banner.ctaLabel}
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </a>
                {shop.phone ? (
                  <a href={`tel:${shop.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 text-sm font-bold text-[#9a7418] tabular-nums" dir="ltr">
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    {toPersianDigits(shop.phone)}
                  </a>
                ) : null}
              </div>
            </div>
            <div className="order-1 relative min-h-[240px] md:order-2 md:min-h-[420px]">
              {bannerSrc ? (
                <img src={bannerSrc} alt={`بنر ${shop.title}`} className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />
              ) : (
                <CinematicLayers businessType={shop.businessType} className="absolute inset-0" />
              )}
              <div className="absolute inset-0 bg-gradient-to-l from-transparent to-[#faf6ee]/60" aria-hidden="true" />
            </div>
          </div>
        </div>
        )}
      </EditableShellP>

      {/* ویژگی‌ها — کارت‌های کرم با حاشیهٔ طلایی */}
      {content.sections.showFeatures && content.features.length > 0 ? (
        <EditableShellP sectionId="features" editMode={editMode} onEditSection={onEditSection} label="ویژگی‌ها" className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {content.features.slice(0, 4).map((f) => (
              <div key={f.title} className="rounded-2xl border border-[#e6dcc4] bg-white p-4 text-center transition-shadow hover:shadow-[0_10px_40px_-12px_rgba(184,134,11,.35)]">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#faf3e0] text-[#9a7418]">
                  <FeatureIconP icon={f.icon} />
                </span>
                <p className="mt-2 text-sm font-extrabold text-[#33261a]">{f.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-[#8a7657]">{f.text}</p>
              </div>
            ))}
          </div>
        </EditableShellP>
      ) : null}

      {/* دسته‌ها — چیپ‌های کرم */}
      {content.sections.showCategories && props.categories.length > 0 ? (
        <EditableShellP sectionId="categories" editMode={editMode} onEditSection={onEditSection} label="دسته‌بندی‌ها" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 pt-8 sm:px-6">
          <div className="flex flex-wrap gap-2">
            {props.categories.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => props.discovery.onSelectCategory(props.discovery.selectedCategory === c.name ? null : c.name)}
                aria-pressed={props.discovery.selectedCategory === c.name}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition-all ${
                  props.discovery.selectedCategory === c.name
                    ? "border-[#c9a227] bg-[#33261a] text-[#f5e7c4] shadow-md"
                    : "border-[#e6dcc4] bg-white text-[#5f5138] hover:border-[#c9a227]/60"
                }`}
              >
                {c.name}
                <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] tabular-nums">{toPersianDigits(c.count)}</span>
              </button>
            ))}
          </div>
        </EditableShellP>
      ) : null}

      <EditableShellP sectionId="products" editMode={editMode} onEditSection={onEditSection} label="محصولات" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-10 sm:px-6">
        <PremiumProductsArea props={props} skin={skin} />
      </EditableShellP>

      <PremiumExtras props={props} skin={skin} />
      <div className="flex-grow" />
      <PremiumFooter props={props} skin={skin} />
    </div>
  );
}

/* ═══════════════ ۳) دارک نئون — تکنولوژی زمردی ═══════════════ */

export function DarkNeonTemplate(props: TemplateV2Props) {
  const { shop, content, bannerSrc, editMode, onEditSection } = props;
  const skin = SKIN_NEON;

  return (
    <div className={`relative flex min-h-screen flex-col ${skin.page}`} dir="rtl">
      {/* شبکهٔ دیجیتال پس‌زمینه */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(rgba(16,185,129,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,.5) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)",
        }}
      />

      <div className="relative">
        <PremiumAnnouncement text={content.announcement} skin={skin} />
        <PremiumHeader props={props} skin={skin} />

        {/* هیرو نئون */}
        <EditableShellP sectionId="banner" editMode={editMode} onEditSection={onEditSection} label="بنر" className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6">
          {/* Task 3-a — اسلایدهای چندگانهٔ مالک → کاروسل سینمایی به‌جای هیرو تکی */}
          {content.banner.slides?.length ? (
            <BannerCarousel
              slides={content.banner.slides}
              businessType={shop.businessType}
              fallbackBadge={content.banner.badge}
              fallbackTitle={content.banner.title}
              fallbackSubtitle={content.banner.subtitle}
              fallbackCtaLabel={content.banner.ctaLabel}
              fallbackCtaLink={content.banner.ctaLink}
              className="overflow-hidden rounded-[2rem] border border-emerald-500/40 shadow-[0_0_60px_-15px_rgba(16,185,129,.55)]"
            />
          ) : (
          <div className="sf-anim-pulse relative overflow-hidden rounded-[2rem] border border-emerald-500/40 shadow-[0_0_60px_-15px_rgba(16,185,129,.55)]" style={{ animation: "sf-neon-pulse 4s ease-in-out infinite" }}>
            <div className="grid items-stretch md:grid-cols-2">
              <div className="flex flex-col items-start justify-center gap-5 bg-[#0b0f14] p-7 sm:p-12">
                {content.banner.badge ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-bold text-emerald-400">
                    <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                    {content.banner.badge}
                  </span>
                ) : null}
                <h1 className="text-3xl font-black leading-[1.4] text-white sm:text-5xl sm:leading-[1.35]">
                  {content.banner.title}
                  <span className="ml-1 inline-block h-3 w-3 translate-y-[-0.35em] rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,1)]" aria-hidden="true" />
                </h1>
                <p className="max-w-md text-sm leading-8 text-zinc-400 sm:text-base">{content.banner.subtitle}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={content.banner.ctaLink || "#products"}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-7 py-3.5 text-sm font-extrabold text-[#032015] shadow-[0_0_30px_-6px_rgba(16,185,129,.9)] transition-all hover:scale-[1.03] hover:shadow-[0_0_40px_-4px_rgba(16,185,129,1)]"
                  >
                    {content.banner.ctaLabel}
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </a>
                  {shop.phone ? (
                    <a href={`tel:${shop.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 text-sm font-bold text-emerald-400 tabular-nums" dir="ltr">
                      <Phone className="h-4 w-4" aria-hidden="true" />
                      {toPersianDigits(shop.phone)}
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="relative min-h-[260px] bg-black/40 md:min-h-[420px]">
                {bannerSrc ? (
                  <img src={bannerSrc} alt={`بنر ${shop.title}`} className="absolute inset-0 h-full w-full object-cover opacity-90" fetchPriority="high" />
                ) : (
                  <CinematicLayers businessType={shop.businessType} className="absolute inset-0" />
                )}
                <div className="absolute inset-0 bg-gradient-to-l from-transparent via-[#07090d]/30 to-[#0b0f14]/90" aria-hidden="true" />
              </div>
            </div>
          </div>
          )}
        </EditableShellP>

        {/* ویژگی‌ها */}
        {content.sections.showFeatures && content.features.length > 0 ? (
          <EditableShellP sectionId="features" editMode={editMode} onEditSection={onEditSection} label="ویژگی‌ها" className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {content.features.slice(0, 4).map((f) => (
                <div key={f.title} className="rounded-2xl border border-[#10b981]/20 bg-[#0b0f14] p-4 text-center transition-all hover:border-[#10b981]/60 hover:shadow-[0_0_25px_-8px_rgba(16,185,129,.5)]">
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                    <FeatureIconP icon={f.icon} />
                  </span>
                  <p className="mt-2 text-sm font-extrabold text-white">{f.title}</p>
                  <p className="mt-1 text-[11px] leading-5 text-zinc-500">{f.text}</p>
                </div>
              ))}
            </div>
          </EditableShellP>
        ) : null}

        {/* دسته‌ها */}
        {content.sections.showCategories && props.categories.length > 0 ? (
          <EditableShellP sectionId="categories" editMode={editMode} onEditSection={onEditSection} label="دسته‌بندی‌ها" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 pt-8 sm:px-6">
            <div className="flex flex-wrap gap-2">
              {props.categories.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => props.discovery.onSelectCategory(props.discovery.selectedCategory === c.name ? null : c.name)}
                  aria-pressed={props.discovery.selectedCategory === c.name}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition-all ${
                    props.discovery.selectedCategory === c.name
                      ? "border-emerald-400 bg-emerald-500 text-[#032015] shadow-[0_0_20px_-4px_rgba(16,185,129,.8)]"
                      : "border-[#10b981]/25 bg-[#0b0f14] text-zinc-300 hover:border-[#10b981]/60"
                  }`}
                >
                  {c.name}
                  <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] tabular-nums">{toPersianDigits(c.count)}</span>
                </button>
              ))}
            </div>
          </EditableShellP>
        ) : null}

        <EditableShellP sectionId="products" editMode={editMode} onEditSection={onEditSection} label="محصولات" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-10 sm:px-6">
          <PremiumProductsArea props={props} skin={skin} />
        </EditableShellP>

        <PremiumExtras props={props} skin={skin} />
      </div>
      <div className="flex-grow" />
      <PremiumFooter props={props} skin={skin} />
    </div>
  );
}

/* ═══════════════ رندرر پرمیوم ═══════════════ */

export function StorefrontPremiumTemplateRenderer(props: TemplateV2Props) {
  switch (props.shop.template) {
    case "bazaar-luxe":
      return <BazaarLuxeTemplate {...props} />;
    case "dark-neon":
      return <DarkNeonTemplate {...props} />;
    case "aurora-pro":
    default:
      return <AuroraProTemplate {...props} />;
  }
}
