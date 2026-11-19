"use client";

// ═══════════════════════════════════════════════════════════════════
// R16 — فروشگاه آنلاین: ۵ قالب سینمایی خانوادهٔ digizlux
// sabzineh | rose | firouzeh | kahroba | bazaarpro
// الگوبرداری از DNA قالب digizlux v5 (فروشگاه دیجیتال) با رنگ‌بندی،
// چیدمان و بخش‌های کاملاً متمایز تا شبیه هم نباشند.
// متن بنرها HTML است (نه داخل تصویر) → صفر غلط املایی در عکس.
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  ShoppingBag,
  Phone,
  MapPin,
  Instagram,
  Send,
  MessageCircle,
  Package,
  Star,
  Truck,
  ShieldCheck,
  Store as StoreIcon,
  Search,
  X,
  Ticket,
  Sparkles,
  ChevronLeft,
  Heart,
  BadgePercent,
  Headset,
  Pencil,
  Clapperboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePerfMode } from "@/lib/perf-mode";
import { toPersianDigits } from "@/lib/persian";
import {
  rialToTomanLabel,
  type StorefrontProductDTO,
} from "@/lib/storefront";
import { InteractiveMap } from "./interactive-map";
import {
  type StorefrontContent,
  getBusinessType,
  rialToCurrencyLabel,
  type StorefrontCurrencyCode,
} from "@/lib/storefront-wizard";
import { CinematicLayers } from "@/components/storefront/cinematic-banner";
// Task 3-a — کاروسل سینمایی بنر (اسلایدهای چندگانهٔ مالک)
import { BannerCarousel } from "@/components/storefront/banner-carousel";
import { AuroraTemplate } from "@/components/storefront/aurora/aurora-template";
import {
  AuroraProTemplate, BazaarLuxeTemplate, DarkNeonTemplate,
} from "@/components/storefront/templates-premium";
import {
  StorefrontDiscoveryBar,
  DiscoveryPagination,
  DiscoverySkeletonGrid,
  DiscoveryEmptyState,
  type DiscoveryTone,
} from "@/components/storefront/discovery-bar";
import type { StorefrontDiscovery } from "@/components/storefront/use-store-products";

/* ═══════════════ انواع مشترک ═══════════════ */

export interface ShopDTOV2 {
  slug: string;
  title: string;
  description: string | null;
  template: string;
  accentColor: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  socialInstagram: string | null;
  socialTelegram: string | null;
  socialWhatsapp: string | null;
  tenantName: string;
  businessType: string | null;
  announcement: string | null;
  ticketEnabled: boolean;
}

export interface TemplateV2Props {
  shop: ShopDTOV2;
  products: StorefrontProductDTO[];
  categories: { name: string; count: number }[];
  content: StorefrontContent;
  /** بنر تصویری مالک — null یعنی بنر سینمایی خودکار (پیش‌فرض) */
  bannerSrc: string | null;
  cartCount: number;
  qtyOf: (productId: string) => number;
  onAddToCart: (p: StorefrontProductDTO) => void;
  onOpenCart: () => void;
  onOpenAuth: () => void;
  onOpenOrders: () => void;
  onOpenProduct: (p: StorefrontProductDTO) => void;
  onOpenTicket: () => void;
  customerName: string | null;
  /** موتور جستجو/فیلتر/صفحه‌بندی — state و هندلرها از ShopPage می‌آیند */
  discovery: StorefrontDiscovery;
  /** ارز نمایشی */
  currency: StorefrontCurrencyCode;
  usdRateToman?: number | null;
  cnyRateToman?: number | null;
  /** حالت ویرایش بصری مالک */
  editMode?: boolean;
  onEditSection?: (sectionId: string) => void;
}

/* ═══════════════ اجزای مشترک ═══════════════ */

/** قاب ویرایش بصری — روی هر بخش قابل‌ویرایش در حالت editMode */
function EditableShell({
  sectionId,
  editMode,
  onEditSection,
  children,
  className,
  label,
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

/** بج موجودی */
function StockBadge({ p, tone }: { p: StorefrontProductDTO; tone?: string }) {
  if (!p.inStock) {
    return <Badge variant="outline" className={`border-red-300/50 bg-red-500/10 text-red-600 ${tone === "dark" ? "border-red-400/40 bg-red-500/15 text-red-300" : ""}`}>ناموجود</Badge>;
  }
  return (
    <Badge variant="outline" className={`border-emerald-300/60 bg-emerald-500/10 text-emerald-700 ${tone === "dark" ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300" : ""}`}>
      موجود
    </Badge>
  );
}

/* ═══ v20-D — تخفیف اختصاصی کالا (فیلدهای اختیاری API؛ گاردشده) ═══ */

/** فیلدهای تخفیف ممکن است از API بیایند — نبودشان هیچ خطایی نمی‌سازد
 *  (displayPriceRial نام رسمی فیلد است؛ displayPrice هم برای سازگاری پذیرفته می‌شود) */
type DiscountableProductDTO = StorefrontProductDTO & {
  discountPercent?: number | null;
  displayPrice?: string | null;
  displayPriceRial?: string | null;
};

function productDiscount(p: StorefrontProductDTO): number {
  const d = (p as DiscountableProductDTO).discountPercent;
  return typeof d === "number" && Number.isFinite(d) && d > 0 ? Math.min(99, Math.trunc(d)) : 0;
}

/** قیمت پس از تخفیف (قیمت نمایشی) — فقط وقتی هم تخفیف هست هم قیمت جدید آمده */
function productDisplayPrice(p: StorefrontProductDTO): string | null {
  if (productDiscount(p) <= 0) return null;
  const d = p as DiscountableProductDTO;
  const price = d.displayPrice ?? d.displayPriceRial;
  return typeof price === "string" && price.trim() !== "" ? price : null;
}

/** بج فیروزه‌ای تخفیف روی گوشهٔ تصویر کالا (گوشهٔ چپ — تداخلی با بج «در سبد» سمت راست ندارد) */
function DiscountCornerBadge({ p }: { p: StorefrontProductDTO }) {
  const d = productDiscount(p);
  if (!d) return null;
  return (
    <span className="absolute left-2 top-2 z-10 rounded-full bg-teal-600 px-2 py-0.5 text-[11px] font-extrabold text-white shadow-md">
      ٪{toPersianDigits(d)} تخفیف
    </span>
  );
}

/** Task 4 — ستارهٔ امتیاز نظرات تأییدشده روی کارت کالا (فقط وقتی نظر موجود است) */
function RatingStarsBadge({ p, dark }: { p: StorefrontProductDTO; dark?: boolean }) {
  const rc = (p as StorefrontProductDTO & { ratingCount?: number; ratingAvg?: number }).ratingCount;
  const ra = (p as StorefrontProductDTO & { ratingAvg?: number }).ratingAvg;
  if (typeof rc !== "number" || rc <= 0 || typeof ra !== "number") return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold ${dark ? "text-amber-300" : "text-amber-600"}`}
      title={`${toPersianDigits(ra)} از ۵ — ${toPersianDigits(rc)} نظر تأییدشده`}
    >
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
      {toPersianDigits(ra)}
      <span className={dark ? "text-zinc-400" : "text-muted-foreground"}>({toPersianDigits(rc)})</span>
    </span>
  );
}

/** قیمت چندارزی */
function PriceLabel({
  priceRial,
  currency,
  usdRateToman,
  cnyRateToman,
  className,
}: {
  priceRial: string;
  currency: StorefrontCurrencyCode;
  usdRateToman?: number | null;
  cnyRateToman?: number | null;
  className?: string;
}) {
  return (
    <span className={`tabular-nums ${className ?? ""}`}>
      {rialToCurrencyLabel(priceRial, currency, usdRateToman, cnyRateToman)}
    </span>
  );
}

/** آیکون ویژگی */
function FeatureIcon({ icon }: { icon: string }) {
  if (icon === "shield") return <ShieldCheck className="h-5 w-5" aria-hidden="true" />;
  if (icon === "support") return <Headset className="h-5 w-5" aria-hidden="true" />;
  if (icon === "price") return <BadgePercent className="h-5 w-5" aria-hidden="true" />;
  return <Truck className="h-5 w-5" aria-hidden="true" />;
}

/** هدر مشترک v2 — لوگو + جستجو + حساب/سبد (استایل tone) + منوی قابل ویرایش */
function ShopHeaderV2({
  shop,
  content,
  cartCount,
  onOpenCart,
  onOpenAuth,
  onOpenOrders,
  customerName,
  onOpenTicket,
  searchQuery,
  onSearchQueryChange,
  tone,
  logo,
  editMode,
  onEditSection,
}: {
  shop: ShopDTOV2;
  content: StorefrontContent;
  cartCount: number;
  onOpenCart: () => void;
  onOpenAuth: () => void;
  onOpenOrders: () => void;
  customerName: string | null;
  onOpenTicket: () => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  tone: { headerBg: string; ink: string; sub: string; accentBtn: string; inputCls: string };
  logo?: string | null;
  editMode?: boolean;
  onEditSection?: (id: string) => void;
}) {
  // R26 — رنگ لهجهٔ دلخواه مالک روی دکمه‌های هدر (inline تا روی همهٔ قالب‌ها بنشیند)
  const accent = content.header.accentColor || null;
  const accentStyle = accent ? { backgroundColor: accent, color: "#ffffff" } : undefined;
  const headerLogo = content.header.logoUrl || logo || null;
  const menuLinks = (content.header.links ?? []).filter((l) => l.label.trim());
  const showSearch = content.header.showSearch !== false;
  return (
    <header className={`sticky top-0 z-30 border-b backdrop-blur-md ${tone.headerBg}`}>
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
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          {headerLogo ? (
            // آپلود کاربر — دامنه نامشخص
            <img src={headerLogo} alt={`لوگوی ${shop.title}`} className="h-9 w-9 rounded-xl object-cover" />
          ) : (
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.accentBtn}`} style={accent ? { backgroundColor: accent, color: "#fff" } : undefined}>
              <StoreIcon className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
          <span className="min-w-0">
            <span className={`block truncate text-sm font-extrabold sm:text-base ${tone.ink}`}>{shop.title}</span>
            {content.header.tagline ? (
              <span className={`block truncate text-[11px] ${tone.sub}`}>{content.header.tagline}</span>
            ) : null}
          </span>
        </div>

        <div className={`relative mx-auto hidden max-w-md flex-1 md:block ${showSearch ? "" : "md:hidden"}`}>
          <Search className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${tone.sub}`} aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="جستجو در محصولات این فروشگاه..."
            aria-label="جستجوی محصولات"
            className={`w-full rounded-full py-2 pl-4 pr-9 text-sm outline-none transition-shadow focus:ring-2 focus:ring-emerald-500/40 ${tone.inputCls}`}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchQueryChange("")}
              className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1 ${tone.sub}`}
              aria-label="پاک کردن جستجو"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {shop.ticketEnabled ? (
            <Button size="icon" variant="ghost" onClick={onOpenTicket} className="h-9 w-9 rounded-full" aria-label="تیکت پشتیبانی">
              <Ticket className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
          {customerName ? (
            <Button size="sm" variant="outline" onClick={onOpenOrders} className="hidden rounded-full sm:inline-flex">
              سفارش‌های من
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onOpenAuth} className="hidden rounded-full sm:inline-flex">
              ورود / ثبت‌نام
            </Button>
          )}
          <Button size="sm" onClick={onOpenCart} className={`relative gap-2 rounded-full ${tone.accentBtn}`} style={accentStyle} aria-label={`سبد خرید — ${toPersianDigits(cartCount)} قلم`}>
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">سبد خرید</span>
            {cartCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1 text-xs font-bold tabular-nums">
                {toPersianDigits(cartCount)}
              </span>
            ) : null}
          </Button>
        </div>
      </div>

      {/* R26 — منوی قابل ویرایش مالک (فهرست لینک‌ها) */}
      {menuLinks.length > 0 ? (
        <nav className={`hidden border-t px-4 md:block sm:px-6 ${tone.sub}`} aria-label="منوی فروشگاه">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-1 overflow-x-auto py-1.5">
            {menuLinks.map((l, i) => (
              <a
                key={`${l.label}-${i}`}
                href={l.href || "#"}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-70 ${tone.ink}`}
              >
                {l.label}
              </a>
            ))}
          </div>
        </nav>
      ) : null}

      {/* جستجوی موبایل */}
      {showSearch ? (
        <div className="border-t px-4 pb-2.5 md:hidden">
          <div className="relative">
            <Search className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${tone.sub}`} aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="جستجو در محصولات..."
              aria-label="جستجوی محصولات"
              className={`w-full rounded-full py-2 pl-4 pr-9 text-sm outline-none ${tone.inputCls}`}
            />
          </div>
        </div>
      ) : null}
    </header>
  );
}

/** نوار اعلان (marquee ساده بدون انیمیشن سنگین) */
function AnnouncementBar({ text, bg, ink }: { text: string; bg: string; ink: string }) {
  if (!text) return null;
  return (
    <div className={`flex items-center justify-center gap-2 px-4 py-2 text-center ${bg} ${ink}`} role="status">
      <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="text-xs font-semibold sm:text-[13px]">{text}</span>
    </div>
  );
}

/** فوتر v2 — نقشه + تماس + ستون‌های دلخواه + کپی‌رایت افق پلاس (لینک‌دار) */
function ShopFooterV2({
  shop,
  content,
  dark,
  accentClasses,
  editMode,
  onEditSection,
}: {
  shop: ShopDTOV2;
  content: StorefrontContent;
  dark?: boolean;
  accentClasses: string;
  editMode?: boolean;
  onEditSection?: (id: string) => void;
}) {
  const hasGeo = typeof shop.lat === "number" && typeof shop.lng === "number";
  const socials: { label: string; href: string; icon: React.ElementType }[] = [];
  if (content.footer.showSocials) {
    if (shop.socialInstagram)
      socials.push({ label: `@${shop.socialInstagram}`, href: `https://instagram.com/${shop.socialInstagram.replace(/^@/, "")}`, icon: Instagram });
    if (shop.socialTelegram)
      socials.push({ label: `@${shop.socialTelegram}`, href: `https://t.me/${shop.socialTelegram.replace(/^@/, "")}`, icon: Send });
    if (shop.socialWhatsapp)
      socials.push({ label: shop.socialWhatsapp, href: `https://wa.me/${shop.socialWhatsapp.replace(/\D/g, "")}`, icon: MessageCircle });
    // R26 — آپارات (لینک مستقیم کانال/ویدیو)
    if (content.footer.socialAparat)
      socials.push({ label: "آپارات", href: content.footer.socialAparat, icon: Clapperboard });
  }
  const columns = (content.footer.columns ?? []).filter((c) => c.title.trim() || c.links.length > 0);
  const aboutTitle = content.footer.aboutTitle?.trim() || shop.title;
  const aboutText = content.footer.aboutText?.trim() || content.about.text;
  return (
    <footer
      className={`mt-auto border-t ${
        dark ? "border-white/10 bg-[#0f1410] text-zinc-300" : "border-[#e7e5e0] bg-[#faf9f7] text-zinc-700"
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
      <div className={`mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 ${editMode ? "outline-2 outline-dashed outline-amber-400/70 outline-offset-4" : ""}`}>
        <div className={`grid gap-8 ${hasGeo ? "md:grid-cols-2" : ""}`}>
          <div>
            <h3 className={`text-lg font-extrabold ${dark ? "text-white" : "text-zinc-900"}`}>{aboutTitle}</h3>
            <p className={`mt-2 text-sm leading-7 ${dark ? "text-zinc-400" : "text-zinc-500"}`}>{aboutText}</p>
            <ul className={`mt-4 space-y-2 text-sm ${dark ? "text-zinc-300" : "text-zinc-700"}`}>
              {shop.phone ? (
                <li className="flex items-center gap-2" dir="ltr">
                  <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="font-medium tabular-nums">{toPersianDigits(shop.phone)}</span>
                </li>
              ) : null}
              {shop.address ? (
                <li className="flex items-start gap-2">
                  <MapPin className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {shop.address}
                    {shop.city ? ` — ${shop.city}` : ""}
                  </span>
                </li>
              ) : null}
              {content.footer.note ? (
                <li className={`text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>{content.footer.note}</li>
              ) : null}
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
                      dark ? "bg-white/10 text-amber-200 hover:bg-white/20" : "bg-white text-zinc-700 shadow-sm hover:bg-zinc-100"
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
              <p className={`mb-2 text-sm font-bold ${dark ? "text-white" : "text-zinc-900"}`}>موقعیت روی نقشه</p>
              {/* v20-D — نقشهٔ تعاملی Leaflet (lazy) به‌جای iframe ایستا: زوم/درگ/مسیریابی */}
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
          <div className={`mt-8 grid gap-6 border-t pt-6 sm:grid-cols-3 ${dark ? "border-white/10" : "border-zinc-200"}`}>
            {columns.map((col, i) => (
              <nav key={`${col.title}-${i}`} aria-label={col.title || `ستون ${i + 1}`}>
                {col.title ? (
                  <p className={`mb-2 text-sm font-bold ${dark ? "text-white" : "text-zinc-900"}`}>{col.title}</p>
                ) : null}
                <ul className={`space-y-1.5 text-sm ${dark ? "text-zinc-400" : "text-zinc-500"}`}>
                  {col.links.map((l, j) => (
                    <li key={`${l.label}-${j}`}>
                      <a href={l.href || "#"} className={`transition-colors hover:underline ${dark ? "hover:text-zinc-200" : "hover:text-zinc-800"}`}>
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        ) : null}

        {/* کپی‌رایت — الزام مالک: نام + لینک نرم‌افزار افق پلاس */}
        <div
          className={`mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs ${
            dark ? "border-white/10 text-zinc-500" : "border-zinc-200 text-zinc-400"
          }`}
        >
          <span>
            {content.footer.copyright?.trim() ||
              `© ${toPersianDigits(new Date().getFullYear())} ${shop.title} — تمامی حقوق محفوظ است`}
          </span>
          {content.footer.showPoweredBy !== false ? (
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-bold transition-opacity hover:opacity-80 ${accentClasses}`}
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

/** کارت محصول v2 */
function ProductCardV2({
  p,
  onOpen,
  onAdd,
  qtyOf,
  currency,
  usdRateToman,
  cnyRateToman,
  style,
  detailHref,
  editMode,
}: {
  p: StorefrontProductDTO;
  onOpen: () => void;
  onAdd: () => void;
  qtyOf: () => number;
  currency: StorefrontCurrencyCode;
  usdRateToman?: number | null;
  cnyRateToman?: number | null;
  style: {
    card: string;
    imgWrap: string;
    badge: string;
    price: string;
    addBtn: string;
    sharp?: boolean;
    accentBar?: boolean;
    listLayout?: boolean;
    dark?: boolean;
  };
  /** لینک صفحهٔ تک‌محصول — در حالت ویرایش نادیده گرفته می‌شود */
  detailHref: string;
  editMode?: boolean;
}) {
  const { reducedMotion } = usePerfMode();
  const inCart = qtyOf();
  const motionCls = reducedMotion ? "" : "transition-transform duration-300 hover:-translate-y-1";
  const radius = style.sharp ? "rounded-lg" : "rounded-3xl";

  const media = p.imageUrl ? (
    // آپلود کاربر — دامنه نامشخص
    <img src={p.imageUrl} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
  ) : (
    <div className={`flex h-full w-full items-center justify-center ${style.imgWrap}`}>
      <Package className="h-10 w-10 opacity-40" aria-hidden="true" />
    </div>
  );

  const priceBlock = (
    <div className="flex items-baseline justify-between gap-2">
      {productDisplayPrice(p) ? (
        <span className="flex flex-col items-start leading-tight">
          <PriceLabel
            priceRial={productDisplayPrice(p) as string}
            currency={currency}
            usdRateToman={usdRateToman}
            cnyRateToman={cnyRateToman}
            className={`text-sm font-extrabold tabular-nums ${style.price}`}
          />
          <PriceLabel
            priceRial={p.priceRial}
            currency={currency}
            usdRateToman={usdRateToman}
            cnyRateToman={cnyRateToman}
            className="text-[11px] font-medium tabular-nums text-muted-foreground line-through"
          />
        </span>
      ) : (
        <PriceLabel priceRial={p.priceRial} currency={currency} usdRateToman={usdRateToman} cnyRateToman={cnyRateToman} className={`text-sm font-extrabold tabular-nums ${style.price}`} />
      )}
      {p.inStock ? null : <span className="text-[11px] text-red-500">ناموجود</span>}
    </div>
  );

  if (style.listLayout) {
    return (
      <div className={`group flex items-center gap-4 border p-3 ${style.card} ${radius}`}>
        {editMode ? (
          <button type="button" onClick={onOpen} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl" aria-label={`جزئیات ${p.name}`}>
            {media}
          </button>
        ) : (
          <a href={detailHref} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl" aria-label={`جزئیات ${p.name}`}>
            {media}
          </a>
        )}
        <div className="min-w-0 flex-1 text-right">
          {editMode ? (
            <button type="button" onClick={onOpen} className="block w-full text-right">
              <p className="line-clamp-1 text-sm font-bold">{p.name}</p>
            </button>
          ) : (
            <a href={detailHref} className="block w-full text-right">
              <p className="line-clamp-1 text-sm font-bold hover:underline">{p.name}</p>
            </a>
          )}
          <div className="mt-1.5">{priceBlock}</div>
          <div className="mt-2 flex items-center gap-2">
            <StockBadge p={p} />
            <RatingStarsBadge p={p} dark={style.dark} />
            {editMode ? (
              <button type="button" onClick={onOpen} className="text-[11px] font-semibold underline-offset-2 hover:underline">
                جزئیات
              </button>
            ) : (
              <a href={detailHref} className="text-[11px] font-semibold underline-offset-2 hover:underline">
                جزئیات
              </a>
            )}
          </div>
        </div>
        <Button size="sm" onClick={onAdd} disabled={!p.inStock} className={`shrink-0 rounded-full ${style.addBtn}`}>
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          {inCart > 0 ? `(${toPersianDigits(inCart)})` : null}
          <span className="hidden sm:inline">{inCart > 0 ? "افزودن" : "خرید"}</span>
        </Button>
      </div>
    );
  }

  return (
    <div className={`group flex flex-col overflow-hidden border ${style.card} ${radius} ${motionCls} ${style.accentBar ? "border-t-[3px] border-t-amber-500" : ""}`}>
      {editMode ? (
        <button type="button" onClick={onOpen} className={`relative block aspect-[5/4] w-full overflow-hidden ${style.imgWrap}`} aria-label={`جزئیات ${p.name}`}>
          {media}
          <DiscountCornerBadge p={p} />
          {!p.inStock ? (
            <span className="absolute inset-0 flex items-center justify-center bg-white/60 text-sm font-bold text-red-600 backdrop-blur-[1px]">
              ناموجود
            </span>
          ) : null}
          {inCart > 0 ? (
            <span className={`absolute right-2 top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white ${style.badge} tabular-nums`}>
              {toPersianDigits(inCart)} در سبد
            </span>
          ) : null}
        </button>
      ) : (
        <a href={detailHref} className={`relative block aspect-[5/4] w-full overflow-hidden ${style.imgWrap}`} aria-label={`جزئیات ${p.name}`}>
          {media}
          <DiscountCornerBadge p={p} />
          {!p.inStock ? (
            <span className="absolute inset-0 flex items-center justify-center bg-white/60 text-sm font-bold text-red-600 backdrop-blur-[1px]">
              ناموجود
            </span>
          ) : null}
          {inCart > 0 ? (
            <span className={`absolute right-2 top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white ${style.badge} tabular-nums`}>
              {toPersianDigits(inCart)} در سبد
            </span>
          ) : null}
        </a>
      )}
      <div className="flex flex-1 flex-col gap-2 p-3">
        {editMode ? (
          <button type="button" onClick={onOpen} className="block text-right">
            <p className="line-clamp-2 min-h-[2.6rem] text-[13px] font-bold leading-relaxed">{p.name}</p>
          </button>
        ) : (
          <a href={detailHref} className="block text-right">
            <p className="line-clamp-2 min-h-[2.6rem] text-[13px] font-bold leading-relaxed hover:underline">{p.name}</p>
          </a>
        )}
        <RatingStarsBadge p={p} dark={style.dark} />
        {priceBlock}
        <Button
          size="sm"
          onClick={onAdd}
          disabled={!p.inStock}
          className={`mt-auto w-full gap-1.5 rounded-xl ${style.addBtn}`}
          aria-label={`افزودن ${p.name} به سبد`}
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          {inCart > 0 ? `افزودن (${toPersianDigits(inCart)})` : "افزودن به سبد"}
        </Button>
      </div>
    </div>
  );
}

/** نوار اعتماد — قابل ویرایش مالک (گزاره‌ها از content.trustNotes یا پیش‌فرض صنف) */
function TrustBar({
  notes,
  bg,
  ink,
  editMode,
  onEditSection,
}: {
  notes: string[];
  bg: string;
  ink: string;
  editMode?: boolean;
  onEditSection?: (id: string) => void;
}) {
  if (!notes.length) {
    if (!editMode) return null;
    return (
      <div className={`relative px-4 py-3 ${bg} ${ink}`} data-edit-section="trust">
        <button
          type="button"
          onClick={() => onEditSection?.("trust")}
          className="mx-auto flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg transition-transform hover:scale-105"
          aria-label="ویرایش نوار اعتماد"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          ویرایش نوار اعتماد
        </button>
      </div>
    );
  }
  return (
    <div className={`relative flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-3 ${bg} ${ink}`} data-edit-section="trust">
      {editMode ? (
        <button
          type="button"
          onClick={() => onEditSection?.("trust")}
          className="absolute top-2 left-2 z-20 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg transition-transform hover:scale-105"
          aria-label="ویرایش نوار اعتماد"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          ویرایش نوار اعتماد
        </button>
      ) : null}
      {notes.map((n) => (
        <span key={n} className="inline-flex items-center gap-1.5 text-xs font-semibold">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {n}
        </span>
      ))}
    </div>
  );
}

/** آمار */
function StatsRow({ stats, style }: { stats: { label: string; value: string }[]; style: { card: string; value: string; label: string } }) {
  if (!stats.length) return null;
  return (
    <div className="grid grid-cols-3 gap-3" data-edit-section="stats">
      {stats.slice(0, 3).map((s) => (
        <div key={s.label} className={`rounded-2xl border p-4 text-center ${style.card}`}>
          <p className={`text-xl font-black tabular-nums sm:text-2xl ${style.value}`}>{s.value}</p>
          <p className={`mt-1 text-[11px] font-medium sm:text-xs ${style.label}`}>{s.label}</p>
        </div>
      ))}
    </div>
  );
}

/** بخش دربارهٔ ما */
function AboutSection({ content, style }: { content: StorefrontContent; style: { card: string; title: string; text: string } }) {
  return (
    <div className={`rounded-3xl border p-6 sm:p-8 ${style.card}`} data-edit-section="about">
      <h2 className={`text-lg font-extrabold sm:text-xl ${style.title}`}>{content.about.title}</h2>
      <p className={`mt-3 text-sm leading-8 ${style.text}`}>{content.about.text}</p>
    </div>
  );
}

/** نوار کشف + گرید محصولات + اسکلتون/حالت خالی + صفحه‌بندی — مشترک هر ۵ قالب */
function TemplateProductsArea({
  discovery,
  editMode,
  tone,
  gridCls,
  renderCard,
}: {
  discovery: StorefrontDiscovery;
  editMode?: boolean;
  tone: DiscoveryTone;
  gridCls: string;
  renderCard: (p: StorefrontProductDTO) => React.ReactNode;
}) {
  return (
    <>
      <StorefrontDiscoveryBar discovery={discovery} tone={tone} />
      <div className="mt-1">
        {discovery.loading && discovery.products.length === 0 ? (
          <DiscoverySkeletonGrid />
        ) : discovery.products.length === 0 ? (
          <DiscoveryEmptyState discovery={discovery} />
        ) : (
          <>
            <div className={`mt-4 grid ${gridCls} ${discovery.loading ? "opacity-60 transition-opacity" : ""}`}>
              {discovery.products.map(renderCard)}
            </div>
            {!editMode ? <DiscoveryPagination discovery={discovery} tone={tone} /> : null}
          </>
        )}
      </div>
    </>
  );
}

/** آدرس صفحهٔ تک‌محصول — Task 4: اگر کالا اسلاگ لاتین داشته باشد از آن استفاده می‌شود (سئو) */
export function productDetailHref(slug: string, productId: string): string {
  return `/shop/${encodeURIComponent(slug)}/p/${encodeURIComponent(productId)}`;
}

/** نسخهٔ DTO دار — اولویت با اسلاگ کالا، وگرنه id */
export function productDetailHrefFor(shopSlug: string, p: StorefrontProductDTO): string {
  return `/shop/${encodeURIComponent(shopSlug)}/p/${encodeURIComponent(p.slug || p.id)}`;
}

/* ═══════════════ ۱) قالب سبزینه (sabzineh) — زمردی/کهربایی، هیرو دونیمه ═══════════════ */

export function SabzinehTemplate(props: TemplateV2Props) {
  const { shop, content, bannerSrc, editMode, onEditSection } = props;
  const tone = {
    headerBg: "bg-[#f4faf7]/90 border-[#d9ece2]",
    ink: "text-[#15322a]",
    sub: "text-[#5d7a6e]",
    accentBtn: "bg-gradient-to-l from-emerald-600 to-emerald-500 text-white",
    inputCls: "border border-[#d9ece2] bg-white text-[#15322a] placeholder:text-[#9ab5aa]",
  };
  const cfg = getBusinessType(shop.businessType);

  return (
    <div className="flex min-h-screen flex-col bg-[#f4faf7] text-[#15322a]">
      <AnnouncementBar text={content.announcement} bg="bg-emerald-700 text-emerald-50" ink="" />
      <ShopHeaderV2
        shop={shop}
        content={content}
        cartCount={props.cartCount}
        onOpenCart={props.onOpenCart}
        onOpenAuth={props.onOpenAuth}
        onOpenOrders={props.onOpenOrders}
        customerName={props.customerName}
        onOpenTicket={props.onOpenTicket}
        searchQuery={props.discovery.searchQuery}
        onSearchQueryChange={props.discovery.onSearchQueryChange}
        tone={tone}
        editMode={editMode}
        onEditSection={onEditSection}
      />

      {/* هیرو دونیمه — بنر سینمایی خودکار یا تصویر مالک + متن HTML */}
      <EditableShell sectionId="banner" editMode={editMode} onEditSection={onEditSection} label="بنر" className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
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
            className="overflow-hidden rounded-3xl shadow-sm ring-1 ring-[#d9ece2]"
          />
        ) : (
        <div className="grid items-stretch gap-4 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#d9ece2] md:grid-cols-[55%_45%]">
          <div className="order-2 flex flex-col justify-center gap-4 p-6 sm:p-10 md:order-1">
            {content.banner.badge ? (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {content.banner.badge}
              </span>
            ) : null}
            <h1 className="text-2xl font-black leading-[1.5] sm:text-4xl sm:leading-[1.45]">{content.banner.title}</h1>
            <p className="text-sm leading-8 text-[#415e53] sm:text-base sm:leading-9">{content.banner.subtitle}</p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={content.banner.ctaLink || "#products"}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-l from-emerald-600 to-emerald-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition-transform hover:scale-[1.02]"
              >
                {content.banner.ctaLabel}
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </a>
              {shop.phone ? (
                <a href={`tel:${shop.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700 tabular-nums" dir="ltr">
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  {toPersianDigits(shop.phone)}
                </a>
              ) : null}
            </div>
          </div>
          <div className="order-1 relative min-h-[220px] overflow-hidden md:order-2 md:min-h-[380px]">
            {bannerSrc ? (
              // بنر اختصاصی مالک
              <img src={bannerSrc} alt={`بنر ${shop.title}`} className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />
            ) : (
              // بنر سینمایی خودکار — متن روی تصویر HTML است (صفر غلط املایی در عکس)
              <CinematicLayers businessType={shop.businessType} className="absolute inset-0" />
            )}
            <div className="absolute inset-0 bg-gradient-to-l from-transparent via-black/10 to-black/40" aria-hidden="true" />
            {cfg?.trustNotes?.length ? (
              <div className="absolute bottom-4 right-4 flex flex-col gap-2">
                {cfg.trustNotes.slice(0, 2).map((t) => (
                  <span key={t} className="rounded-full bg-white/85 px-3 py-1.5 text-[11px] font-bold text-emerald-800 backdrop-blur">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        )}
      </EditableShell>

      {/* ویژگی‌ها */}
      {content.sections.showFeatures && content.features.length > 0 ? (
        <EditableShell sectionId="features" editMode={editMode} onEditSection={onEditSection} label="ویژگی‌ها" className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {content.features.slice(0, 4).map((f) => (
              <div key={f.title} className="rounded-3xl border border-[#d9ece2] bg-white p-4 text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <FeatureIcon icon={f.icon} />
                </span>
                <p className="mt-2 text-sm font-extrabold">{f.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-[#5d7a6e]">{f.text}</p>
              </div>
            ))}
          </div>
        </EditableShell>
      ) : null}

      {/* دسته‌بندی‌ها */}
      {content.sections.showCategories && props.categories.length > 0 ? (
        <EditableShell sectionId="categories" editMode={editMode} onEditSection={onEditSection} label="دسته‌بندی‌ها" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pt-8 sm:px-6">
          <h2 className="text-lg font-black sm:text-xl">دسته‌بندی محصولات</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {props.categories.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => props.discovery.onSelectCategory(props.discovery.selectedCategory === c.name ? null : c.name)}
                className={`flex items-center justify-between rounded-2xl border bg-white px-4 py-3 text-sm font-bold transition-colors ${
                  props.discovery.selectedCategory === c.name ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-[#d9ece2] hover:border-emerald-300"
                }`}
                aria-pressed={props.discovery.selectedCategory === c.name}
              >
                <span>{c.name}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700 tabular-nums">{toPersianDigits(c.count)}</span>
              </button>
            ))}
          </div>
        </EditableShell>
      ) : null}

      {/* محصولات */}
      <EditableShell sectionId="products" editMode={editMode} onEditSection={onEditSection} label="محصولات" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pt-8 sm:px-6">
        <div>
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-black sm:text-xl">
              {props.discovery.selectedCategory ? props.discovery.selectedCategory : (content.sections.productsTitle?.trim() || "همهٔ محصولات")}
            </h2>
          </div>
          <div className="mt-3">
            <TemplateProductsArea
              discovery={props.discovery}
              editMode={editMode}
              tone={{
                bg: "bg-white",
                border: "border-[#d9ece2]",
                input: "border border-[#d9ece2] bg-white text-[#15322a] placeholder:text-[#9ab5aa]",
                select: "border-[#d9ece2] bg-white text-[#15322a]",
                chip: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
                chipActive: "bg-emerald-600 text-white",
                sub: "text-[#5d7a6e]",
              }}
              gridCls="grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              renderCard={(p) => (
                <ProductCardV2
                  key={p.id}
                  p={p}
                  onOpen={() => props.onOpenProduct(p)}
                  onAdd={() => props.onAddToCart(p)}
                  qtyOf={() => props.qtyOf(p.id)}
                  currency={props.currency}
                  usdRateToman={props.usdRateToman}
                  cnyRateToman={props.cnyRateToman}
                  detailHref={productDetailHrefFor(shop.slug, p)}
                  editMode={editMode}
                  style={{
                    card: "border-[#d9ece2] bg-white shadow-sm hover:shadow-md",
                    imgWrap: "bg-[#edf6f1]",
                    badge: "bg-emerald-600",
                    price: "text-emerald-700",
                    addBtn: "bg-emerald-600 text-white hover:bg-emerald-700",
                  }}
                />
              )}
            />
          </div>
        </div>
      </EditableShell>

      {/* آمار */}
      {content.sections.showStats && content.stats.length > 0 ? (
        <EditableShell sectionId="stats" editMode={editMode} onEditSection={onEditSection} label="آمار" className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
          <StatsRow
            stats={content.stats}
            style={{ card: "border-[#d9ece2] bg-white", value: "text-emerald-700", label: "text-[#5d7a6e]" }}
          />
        </EditableShell>
      ) : null}

      {/* دربارهٔ ما */}
      {content.sections.showAbout ? (
        <EditableShell sectionId="about" editMode={editMode} onEditSection={onEditSection} label="دربارهٔ ما" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-8 sm:px-6">
          <AboutSection content={content} style={{ card: "border-[#d9ece2] bg-white", title: "text-[#15322a]", text: "text-[#415e53]" }} />
        </EditableShell>
      ) : null}

      <div className="flex-grow" />
      {content.sections.showTrustBar ? (
        <TrustBar
          notes={content.trustNotes?.length ? content.trustNotes : (cfg?.trustNotes ?? [])}
          bg="bg-emerald-700"
          ink="text-emerald-50"
          editMode={editMode}
          onEditSection={onEditSection}
        />
      ) : null}
      <ShopFooterV2 shop={shop} content={content} editMode={editMode} onEditSection={onEditSection} accentClasses="bg-emerald-600 text-white" />
    </div>
  );
}

/* ═══════════════ ۲) قالب رز سرد (rose) — ادیتوریال مجله‌ای ═══════════════ */

export function RoseEditorialTemplate(props: TemplateV2Props) {
  const { shop, content, bannerSrc, editMode, onEditSection } = props;
  const tone = {
    headerBg: "bg-[#fafaf9]/90 border-[#e7e5e4]",
    ink: "text-[#1c1917]",
    sub: "text-[#78716c]",
    accentBtn: "bg-rose-600 text-white hover:bg-rose-700",
    inputCls: "border border-[#e7e5e4] bg-white text-[#1c1917] placeholder:text-[#a8a29e]",
  };
  const cfg = getBusinessType(shop.businessType);

  return (
    <div className="flex min-h-screen flex-col bg-[#fafaf9] text-[#1c1917]">
      <AnnouncementBar text={content.announcement} bg="bg-[#1c1917] text-rose-100" ink="" />
      <ShopHeaderV2
        shop={shop}
        content={content}
        cartCount={props.cartCount}
        onOpenCart={props.onOpenCart}
        onOpenAuth={props.onOpenAuth}
        onOpenOrders={props.onOpenOrders}
        customerName={props.customerName}
        onOpenTicket={props.onOpenTicket}
        searchQuery={props.discovery.searchQuery}
        onSearchQueryChange={props.discovery.onSearchQueryChange}
        tone={tone}
        editMode={editMode}
        onEditSection={onEditSection}
      />

      {/* هیرو ادیتوریال — تایپوگرافی درشت + تصویر عمودی سینمایی */}
      <EditableShell sectionId="banner" editMode={editMode} onEditSection={onEditSection} label="بنر" className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
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
            className="overflow-hidden rounded-2xl"
          />
        ) : (
        <div className="grid items-end gap-4 md:grid-cols-[1fr_280px]">
          <div className="pb-2">
            {content.banner.badge ? (
              <span className="mb-3 inline-block border border-[#d6d3d1] px-3 py-1 text-[11px] font-bold tracking-widest text-[#78716c]">{content.banner.badge}</span>
            ) : null}
            <h1 className="text-3xl font-black leading-[1.35] sm:text-5xl sm:leading-[1.3]">{content.banner.title}</h1>
            <div className="mt-4 h-px w-24 bg-rose-500" aria-hidden="true" />
            <p className="mt-4 max-w-xl text-sm leading-8 text-[#57534e] sm:leading-9">{content.banner.subtitle}</p>
            <a
              href={content.banner.ctaLink || "#products"}
              className="mt-6 inline-flex items-center gap-2 border-b-2 border-rose-600 pb-1 text-sm font-black text-rose-600 transition-colors hover:text-rose-700"
            >
              {content.banner.ctaLabel}
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <div className="relative hidden h-[340px] overflow-hidden rounded-2xl md:block">
            {bannerSrc ? (
              <img src={bannerSrc} alt={`بنر ${shop.title}`} className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />
            ) : (
              // بنر سینمایی خودکار بر اساس نوع کسب‌وکار
              <CinematicLayers businessType={shop.businessType} className="absolute inset-0 rounded-2xl" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" aria-hidden="true" />
            {cfg?.trustNotes?.[0] ? (
              <span className="absolute bottom-4 right-4 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-bold text-rose-700">{cfg.trustNotes[0]}</span>
            ) : null}
          </div>
        </div>
        )}
      </EditableShell>

      {/* آمار اول */}
      {content.sections.showStats && content.stats.length > 0 ? (
        <EditableShell sectionId="stats" editMode={editMode} onEditSection={onEditSection} label="آمار" className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6">
          <StatsRow stats={content.stats} style={{ card: "border-[#e7e5e4] bg-white", value: "text-rose-600", label: "text-[#78716c]" }} />
        </EditableShell>
      ) : null}

      {/* محصولات — لیستی به‌صورت پیش‌فرض */}
      <EditableShell sectionId="products" editMode={editMode} onEditSection={onEditSection} label="محصولات" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pt-10 sm:px-6">
        <div>
          <div className="flex items-end justify-between">
            <h2 className="text-xl font-black sm:text-2xl">{props.discovery.selectedCategory ? props.discovery.selectedCategory : (content.sections.productsTitle?.trim() || "کالکشن‌ها")}</h2>
          </div>
          <div className="mt-3">
            <TemplateProductsArea
              discovery={props.discovery}
              editMode={editMode}
              tone={{
                bg: "bg-white",
                border: "border-[#e7e5e4]",
                input: "border border-[#e7e5e4] bg-white text-[#1c1917] placeholder:text-[#a8a29e]",
                select: "border-[#e7e5e4] bg-white text-[#1c1917]",
                chip: "bg-[#f5f5f4] text-[#44403c] hover:bg-rose-50",
                chipActive: "bg-rose-600 text-white",
                sub: "text-[#78716c]",
              }}
              gridCls="gap-3 sm:grid-cols-2"
              renderCard={(p) => (
                <ProductCardV2
                  key={p.id}
                  p={p}
                  onOpen={() => props.onOpenProduct(p)}
                  onAdd={() => props.onAddToCart(p)}
                  qtyOf={() => props.qtyOf(p.id)}
                  currency={props.currency}
                  usdRateToman={props.usdRateToman}
                  cnyRateToman={props.cnyRateToman}
                  detailHref={productDetailHrefFor(shop.slug, p)}
                  editMode={editMode}
                  style={{
                    card: "border-[#e7e5e4] bg-white hover:border-rose-300",
                    imgWrap: "bg-[#f5f5f4]",
                    badge: "bg-rose-600",
                    price: "text-rose-600",
                    addBtn: "bg-[#1c1917] text-white hover:bg-[#292524]",
                    listLayout: true,
                    sharp: true,
                  }}
                />
              )}
            />
          </div>
        </div>
      </EditableShell>

      {/* ویژگی‌ها — ردیفی */}
      {content.sections.showFeatures && content.features.length > 0 ? (
        <EditableShell sectionId="features" editMode={editMode} onEditSection={onEditSection} label="ویژگی‌ها" className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6">
          <div className="grid gap-px overflow-hidden rounded-2xl border border-[#e7e5e4] bg-[#e7e5e4] sm:grid-cols-2 lg:grid-cols-4">
            {content.features.slice(0, 4).map((f) => (
              <div key={f.title} className="bg-white p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                  <FeatureIcon icon={f.icon} />
                </span>
                <p className="mt-3 text-sm font-black">{f.title}</p>
                <p className="mt-1 text-xs leading-6 text-[#78716c]">{f.text}</p>
              </div>
            ))}
          </div>
        </EditableShell>
      ) : null}

      {content.sections.showAbout ? (
        <EditableShell sectionId="about" editMode={editMode} onEditSection={onEditSection} label="دربارهٔ ما" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-10 sm:px-6">
          <AboutSection content={content} style={{ card: "border-[#e7e5e4] bg-white", title: "text-[#1c1917]", text: "text-[#57534e]" }} />
        </EditableShell>
      ) : null}

      <div className="flex-grow" />
      {content.sections.showTrustBar ? (
        <TrustBar
          notes={content.trustNotes?.length ? content.trustNotes : (cfg?.trustNotes ?? [])}
          bg="bg-[#1c1917]"
          ink="text-rose-100"
          editMode={editMode}
          onEditSection={onEditSection}
        />
      ) : null}
      <ShopFooterV2 shop={shop} content={content} editMode={editMode} onEditSection={onEditSection} accentClasses="bg-rose-600 text-white" />
    </div>
  );
}

/* ═══════════════ ۳) قالب فیروزه‌ساز (firouzeh) — کاشی ایرانی/مسی ═══════════════ */

export function FirouzehSazTemplate(props: TemplateV2Props) {
  const { shop, products, content, bannerSrc, editMode, onEditSection } = props;
  const tone = {
    headerBg: "bg-[#f2f8f7]/90 border-[#d3e5e1]",
    ink: "text-[#12242b]",
    sub: "text-[#5b7570]",
    accentBtn: "bg-gradient-to-l from-teal-700 to-teal-600 text-white",
    inputCls: "border border-[#d3e5e1] bg-white text-[#12242b] placeholder:text-[#9ab5b0]",
  };
  const cfg = getBusinessType(shop.businessType);

  return (
    <div className="flex min-h-screen flex-col bg-[#f2f8f7] text-[#12242b]">
      <AnnouncementBar text={content.announcement} bg="bg-teal-800 text-teal-50" ink="" />
      <ShopHeaderV2
        shop={shop}
        content={content}
        cartCount={props.cartCount}
        onOpenCart={props.onOpenCart}
        onOpenAuth={props.onOpenAuth}
        onOpenOrders={props.onOpenOrders}
        customerName={props.customerName}
        onOpenTicket={props.onOpenTicket}
        searchQuery={props.discovery.searchQuery}
        onSearchQueryChange={props.discovery.onSearchQueryChange}
        tone={tone}
        editMode={editMode}
        onEditSection={onEditSection}
      />

      {/* هیرو گرادیانی + تصویر سینمایی با قاب مسی */}
      <EditableShell sectionId="banner" editMode={editMode} onEditSection={onEditSection} label="بنر" className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
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
            className="overflow-hidden rounded-[1.7rem]"
          />
        ) : (
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-teal-800 via-teal-700 to-[#2a160b] p-1.5">
          <div className="relative overflow-hidden rounded-[1.7rem]">
            {bannerSrc ? (
              <div className="relative min-h-[300px] sm:min-h-[380px]">
                <img src={bannerSrc} alt={`بنر ${shop.title}`} className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />
                <div className="absolute inset-0 bg-gradient-to-l from-[#0f3a34]/85 via-[#0f3a34]/45 to-transparent" aria-hidden="true" />
                <div className="relative flex min-h-[300px] flex-col items-start justify-center gap-4 p-6 text-white sm:min-h-[380px] sm:p-12">
                  {content.banner.badge ? (
                    <span className="rounded-full border border-amber-300/50 bg-amber-400/15 px-3 py-1.5 text-xs font-bold text-amber-200">{content.banner.badge}</span>
                  ) : null}
                  <h1 className="max-w-lg text-2xl font-black leading-[1.5] sm:text-4xl sm:leading-[1.45]">{content.banner.title}</h1>
                  <p className="max-w-md text-sm leading-8 text-teal-50/90 sm:text-base">{content.banner.subtitle}</p>
                  <a
                    href={content.banner.ctaLink || "#products"}
                    className="inline-flex items-center gap-2 rounded-full bg-[#e2955c] px-6 py-3 text-sm font-black text-[#2a160b] shadow-lg transition-transform hover:scale-[1.02]"
                  >
                    {content.banner.ctaLabel}
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 p-8 text-center text-white sm:min-h-[380px]">
                <h1 className="text-2xl font-black sm:text-4xl">{content.banner.title}</h1>
                <p className="max-w-md text-sm leading-8 text-teal-50/90">{content.banner.subtitle}</p>
                <a href={content.banner.ctaLink || "#products"} className="rounded-full bg-[#e2955c] px-6 py-3 text-sm font-black text-[#2a160b]">
                  {content.banner.ctaLabel}
                </a>
              </div>
            )}
          </div>
        </div>
        )}
      </EditableShell>

      {/* دسته‌ها — کاشی‌های مسی */}
      {content.sections.showCategories && props.categories.length > 0 ? (
        <EditableShell sectionId="categories" editMode={editMode} onEditSection={onEditSection} label="دسته‌بندی‌ها" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pt-8 sm:px-6">
          <h2 className="text-lg font-black sm:text-xl">دسته‌بندی کاشی‌ها</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {props.categories.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => props.discovery.onSelectCategory(props.discovery.selectedCategory === c.name ? null : c.name)}
                className={`rounded-2xl border-2 p-0.5 transition-colors ${props.discovery.selectedCategory === c.name ? "border-[#c2703d]" : "border-transparent hover:border-[#c2703d]/50"}`}
                aria-pressed={props.discovery.selectedCategory === c.name}
              >
                <span className="flex items-center justify-between rounded-[calc(1rem-2px)] border border-[#d3e5e1] bg-white px-4 py-3 text-sm font-bold">
                  <span>{c.name}</span>
                  <span className="rounded-full bg-[#eef6f4] px-2 py-0.5 text-[11px] font-bold text-teal-700 tabular-nums">{toPersianDigits(c.count)}</span>
                </span>
              </button>
            ))}
          </div>
        </EditableShell>
      ) : null}

      {/* محصولات — کارت با قاب دوتایی */}
      <EditableShell sectionId="products" editMode={editMode} onEditSection={onEditSection} label="محصولات" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pt-8 sm:px-6">
        <div>
          <h2 className="text-lg font-black sm:text-xl">{props.discovery.selectedCategory ? props.discovery.selectedCategory : (content.sections.productsTitle?.trim() || "همهٔ محصولات")}</h2>
          <div className="mt-3">
            <StorefrontDiscoveryBar
              discovery={props.discovery}
              tone={{
                bg: "bg-white",
                border: "border-[#d3e5e1]",
                input: "border border-[#d3e5e1] bg-white text-[#0f2e2a] placeholder:text-[#7fa8a0]",
                select: "border-[#d3e5e1] bg-white text-[#0f2e2a]",
                chip: "bg-[#eef6f4] text-teal-800 hover:bg-teal-100",
                chipActive: "bg-teal-700 text-white",
                sub: "text-[#5f8a83]",
              }}
            />
          </div>
          {products.length === 0 ? (
            <p className="py-14 text-center text-sm text-[#5b7570]">کالایی مطابق جستجوی شما پیدا نشد.</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3.5 p-0.5 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((p) => (
                <div key={p.id} className="rounded-3xl border-2 border-[#c2703d]/25 p-0.5">
                  <ProductCardV2
                    key={p.id}
                    p={p}
                    onOpen={() => props.onOpenProduct(p)}
                    onAdd={() => props.onAddToCart(p)}
                    qtyOf={() => props.qtyOf(p.id)}
                    currency={props.currency}
                    detailHref={productDetailHrefFor(shop.slug, p)}
                    usdRateToman={props.usdRateToman}
                    cnyRateToman={props.cnyRateToman}
                    style={{
                      card: "h-full border-[#d3e5e1] bg-white",
                      imgWrap: "bg-[#eef6f4]",
                      badge: "bg-teal-700",
                      price: "text-teal-700",
                      addBtn: "bg-[#c2703d] text-white hover:bg-[#a85f33]",
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </EditableShell>

      {/* ویژگی‌ها */}
      {content.sections.showFeatures && content.features.length > 0 ? (
        <EditableShell sectionId="features" editMode={editMode} onEditSection={onEditSection} label="ویژگی‌ها" className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {content.features.slice(0, 4).map((f) => (
              <div key={f.title} className="rounded-2xl border border-[#d3e5e1] bg-white p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef6f4] text-teal-700">
                  <FeatureIcon icon={f.icon} />
                </span>
                <p className="mt-2 text-sm font-extrabold">{f.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-[#5b7570]">{f.text}</p>
              </div>
            ))}
          </div>
        </EditableShell>
      ) : null}

      {/* آمار + درباره */}
      {content.sections.showStats && content.stats.length > 0 ? (
        <EditableShell sectionId="stats" editMode={editMode} onEditSection={onEditSection} label="آمار" className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
          <StatsRow stats={content.stats} style={{ card: "border-[#d3e5e1] bg-white", value: "text-teal-700", label: "text-[#5b7570]" }} />
        </EditableShell>
      ) : null}
      {content.sections.showAbout ? (
        <EditableShell sectionId="about" editMode={editMode} onEditSection={onEditSection} label="دربارهٔ ما" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-8 sm:px-6">
          <AboutSection content={content} style={{ card: "border-[#d3e5e1] bg-white", title: "text-[#12242b]", text: "text-[#415e53]" }} />
        </EditableShell>
      ) : null}

      <div className="flex-grow" />
      {content.sections.showTrustBar ? (
        <TrustBar
          notes={content.trustNotes?.length ? content.trustNotes : (cfg?.trustNotes ?? [])}
          bg="bg-teal-800"
          ink="text-teal-50"
          editMode={editMode}
          onEditSection={onEditSection}
        />
      ) : null}
      <ShopFooterV2 shop={shop} content={content} editMode={editMode} onEditSection={onEditSection} dark accentClasses="bg-teal-700 text-white" />
    </div>
  );
}

/* ═══════════════ ۴) قالب کهربا (kahroba) — سینمایی تمام‌عرض صنعتی ═══════════════ */

export function KahrobaTemplate(props: TemplateV2Props) {
  const { shop, products, content, bannerSrc, editMode, onEditSection } = props;
  const { reducedMotion } = usePerfMode();
  const tone = {
    headerBg: "bg-[#f8f5ee]/90 border-[#e5ded0]",
    ink: "text-[#26221c]",
    sub: "text-[#7a7265]",
    accentBtn: "bg-gradient-to-l from-amber-600 to-amber-500 text-white",
    inputCls: "border border-[#e5ded0] bg-white text-[#26221c] placeholder:text-[#b3a58c]",
  };
  const cfg = getBusinessType(shop.businessType);

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f5ee] text-[#26221c]">
      <AnnouncementBar text={content.announcement} bg="bg-[#1c1917] text-amber-100" ink="" />
      <ShopHeaderV2
        shop={shop}
        content={content}
        cartCount={props.cartCount}
        onOpenCart={props.onOpenCart}
        onOpenAuth={props.onOpenAuth}
        onOpenOrders={props.onOpenOrders}
        customerName={props.customerName}
        onOpenTicket={props.onOpenTicket}
        searchQuery={props.discovery.searchQuery}
        onSearchQueryChange={props.discovery.onSearchQueryChange}
        tone={tone}
        editMode={editMode}
        onEditSection={onEditSection}
      />

      {/* هیرو تمام‌عرض سینمایی — بدون radius، لبه‌به‌لبه */}
      <EditableShell sectionId="banner" editMode={editMode} onEditSection={onEditSection} label="بنر">
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
          />
        ) : (
        <div className="relative min-h-[340px] w-full overflow-hidden sm:min-h-[440px]">
          {bannerSrc ? (
            <img
              src={bannerSrc}
              alt={`بنر ${shop.title}`}
              className={`absolute inset-0 h-full w-full object-cover ${reducedMotion ? "" : "animate-[kahroba-kenburns_18s_ease-in-out_infinite_alternate]"}`}
              fetchPriority="high"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-l from-[#1c1917] via-[#3a2f1a] to-amber-700" />
          )}
          <div className="absolute inset-0 bg-gradient-to-l from-black/75 via-black/40 to-black/10" aria-hidden="true" />
          <div className="relative mx-auto flex min-h-[340px] w-full max-w-6xl flex-col items-start justify-center gap-4 px-4 py-12 text-white sm:min-h-[440px] sm:px-6">
            {content.banner.badge ? (
              <span className="rounded-none bg-amber-500 px-3 py-1.5 text-xs font-black tracking-wide text-[#26221c]">{content.banner.badge}</span>
            ) : null}
            <h1 className="max-w-xl text-3xl font-black leading-[1.4] drop-shadow-lg sm:text-5xl sm:leading-[1.35]">{content.banner.title}</h1>
            <p className="max-w-lg text-sm leading-8 text-amber-50/90 sm:text-base">{content.banner.subtitle}</p>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href={content.banner.ctaLink || "#products"}
                className="inline-flex items-center gap-2 bg-amber-500 px-7 py-3.5 text-sm font-black text-[#26221c] shadow-xl shadow-black/30 transition-transform hover:scale-[1.03]"
              >
                {content.banner.ctaLabel}
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </a>
              {shop.phone ? (
                <a href={`tel:${shop.phone.replace(/\s/g, "")}`} className="border-b-2 border-amber-400 pb-0.5 text-sm font-black text-amber-200 tabular-nums" dir="ltr">
                  {toPersianDigits(shop.phone)}
                </a>
              ) : null}
            </div>
          </div>
        </div>
        )}
      </EditableShell>

      {/* نوار اعتماد زیر بنر */}
      {content.sections.showTrustBar ? (
        <TrustBar
          notes={content.trustNotes?.length ? content.trustNotes : (cfg?.trustNotes ?? [])}
          bg="bg-[#26221c]"
          ink="text-amber-100"
          editMode={editMode}
          onEditSection={onEditSection}
        />
      ) : null}

      {/* محصولات — کارت‌های نوار ضخیم */}
      <EditableShell sectionId="products" editMode={editMode} onEditSection={onEditSection} label="محصولات" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pt-10 sm:px-6">
        <div>
          <h2 className="border-r-4 border-amber-500 pr-3 text-xl font-black sm:text-2xl">{props.discovery.selectedCategory ? props.discovery.selectedCategory : (content.sections.productsTitle?.trim() || "همهٔ ابزار و کالاها")}</h2>
          <div className="mt-3">
            <StorefrontDiscoveryBar
              discovery={props.discovery}
              tone={{
                bg: "bg-white",
                border: "border-[#e5ded0]",
                input: "border border-[#e5ded0] bg-white text-[#26221c] placeholder:text-[#a89e8c]",
                select: "border-[#e5ded0] bg-white text-[#26221c]",
                chip: "bg-amber-50 text-amber-800 hover:bg-amber-100",
                chipActive: "bg-[#26221c] text-amber-100",
                sub: "text-[#7a7265]",
              }}
            />
          </div>
          {products.length === 0 ? (
            <DiscoveryEmptyState discovery={props.discovery} />
          ) : (
            <div className={`mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 ${props.discovery.loading ? "opacity-60 transition-opacity" : ""}`}>
              {products.map((p) => (
                <ProductCardV2
                  key={p.id}
                  p={p}
                  onOpen={() => props.onOpenProduct(p)}
                  onAdd={() => props.onAddToCart(p)}
                  qtyOf={() => props.qtyOf(p.id)}
                  currency={props.currency}
                  detailHref={productDetailHrefFor(shop.slug, p)}
                  usdRateToman={props.usdRateToman}
                  cnyRateToman={props.cnyRateToman}
                  style={{
                    card: "border-[#e5ded0] bg-white shadow-sm hover:border-amber-400",
                    imgWrap: "bg-[#efe8d8]",
                    badge: "bg-[#26221c]",
                    price: "text-[#26221c]",
                    addBtn: "bg-amber-500 text-[#26221c] hover:bg-amber-600 hover:text-white",
                    accentBar: true,
                  }}
                />
              ))}
            </div>
          )}
          {!editMode ? <DiscoveryPagination discovery={props.discovery} tone={{ bg: "bg-white", border: "border-[#e5ded0]", chip: "bg-amber-50 text-amber-800 hover:bg-amber-100", chipActive: "bg-[#26221c] text-amber-100", select: "border-[#e5ded0] bg-white", input: "border-[#e5ded0] bg-white text-[#26221c]", sub: "text-[#7a7265]" }} /> : null}
        </div>
      </EditableShell>

      {/* ویژگی‌ها — ردیفی */}
      {content.sections.showFeatures && content.features.length > 0 ? (
        <EditableShell sectionId="features" editMode={editMode} onEditSection={onEditSection} label="ویژگی‌ها" className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {content.features.slice(0, 4).map((f) => (
              <div key={f.title} className="rounded-lg border border-[#e5ded0] border-t-[3px] border-t-amber-500 bg-white p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <FeatureIcon icon={f.icon} />
                </span>
                <p className="mt-3 text-sm font-black">{f.title}</p>
                <p className="mt-1 text-xs leading-6 text-[#7a7265]">{f.text}</p>
              </div>
            ))}
          </div>
        </EditableShell>
      ) : null}

      {/* دسته‌ها — سکشن تیره صنعتی */}
      {content.sections.showCategories && props.categories.length > 0 ? (
        <EditableShell sectionId="categories" editMode={editMode} onEditSection={onEditSection} label="دسته‌بندی‌ها" className="mt-10 scroll-mt-24 bg-[#26221c] px-4 py-10 sm:px-6">
          <div className="mx-auto w-full max-w-6xl">
            <h2 className="text-lg font-black text-amber-100 sm:text-xl">قفسه‌بندی انبار</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {props.categories.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => props.discovery.onSelectCategory(props.discovery.selectedCategory === c.name ? null : c.name)}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-bold transition-colors ${
                    props.discovery.selectedCategory === c.name
                      ? "border-amber-400 bg-amber-500 text-[#26221c]"
                      : "border-white/15 bg-white/5 text-amber-50 hover:border-amber-400/60"
                  }`}
                  aria-pressed={props.discovery.selectedCategory === c.name}
                >
                  <span>{c.name}</span>
                  <span className="tabular-nums">{toPersianDigits(c.count)}</span>
                </button>
              ))}
            </div>
          </div>
        </EditableShell>
      ) : null}

      {content.sections.showStats && content.stats.length > 0 ? (
        <EditableShell sectionId="stats" editMode={editMode} onEditSection={onEditSection} label="آمار" className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
          <StatsRow stats={content.stats} style={{ card: "border-[#e5ded0] bg-white", value: "text-amber-600", label: "text-[#7a7265]" }} />
        </EditableShell>
      ) : null}
      {content.sections.showAbout ? (
        <EditableShell sectionId="about" editMode={editMode} onEditSection={onEditSection} label="دربارهٔ ما" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-8 sm:px-6">
          <AboutSection content={content} style={{ card: "border-[#e5ded0] bg-white", title: "text-[#26221c]", text: "text-[#57534e]" }} />
        </EditableShell>
      ) : null}

      <div className="flex-grow" />
      <ShopFooterV2 shop={shop} content={content} editMode={editMode} onEditSection={onEditSection} dark accentClasses="bg-amber-500 text-[#26221c]" />
    </div>
  );
}

/* ═══════════════ ۵) قالب بازار پلاس (bazaarpro) — پرمحصول پرفروش ═══════════════ */

export function BazaarProTemplate(props: TemplateV2Props) {
  const { shop, products, content, bannerSrc, editMode, onEditSection } = props;
  const tone = {
    headerBg: "bg-[#faf3ec]/90 border-[#ecdcc9]",
    ink: "text-[#2d1a1f]",
    sub: "text-[#8a6a72]",
    accentBtn: "bg-gradient-to-l from-[#be123c] to-[#e11d48] text-white",
    inputCls: "border border-[#ecdcc9] bg-white text-[#2d1a1f] placeholder:text-[#c4a3ad]",
  };
  const cfg = getBusinessType(shop.businessType);

  // پرتخفیف‌ترین‌ها (روانشناسی: کمیابی و فوریت) — کالاهای دارای قیمت بالاتر نمایش ویژه
  const featured = products.slice(0, 4);

  return (
    <div className="flex min-h-screen flex-col bg-[#faf3ec] text-[#2d1a1f]">
      <AnnouncementBar text={content.announcement} bg="bg-gradient-to-l from-[#be123c] to-[#e11d48] text-white" ink="" />
      <ShopHeaderV2
        shop={shop}
        content={content}
        cartCount={props.cartCount}
        onOpenCart={props.onOpenCart}
        onOpenAuth={props.onOpenAuth}
        onOpenOrders={props.onOpenOrders}
        customerName={props.customerName}
        onOpenTicket={props.onOpenTicket}
        searchQuery={props.discovery.searchQuery}
        onSearchQueryChange={props.discovery.onSearchQueryChange}
        tone={tone}
        editMode={editMode}
        onEditSection={onEditSection}
      />

      {/* هیرو فشرده + ردیف پیشنهاد */}
      <EditableShell sectionId="banner" editMode={editMode} onEditSection={onEditSection} label="بنر" className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
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
            className="overflow-hidden rounded-2xl"
          />
        ) : (
        <div className="grid gap-3 lg:grid-cols-[3fr_1fr]">
          <div className="relative min-h-[240px] overflow-hidden rounded-2xl sm:min-h-[300px]">
            {bannerSrc ? (
              <img src={bannerSrc} alt={`بنر ${shop.title}`} className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-l from-[#3d0a17] to-[#be123c]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-l from-black/70 via-black/35 to-transparent" aria-hidden="true" />
            <div className="relative flex min-h-[240px] flex-col items-start justify-center gap-3 p-6 text-white sm:min-h-[300px] sm:p-8">
              {content.banner.badge ? (
                <span className="rounded-full bg-[#a3c178] px-3 py-1 text-xs font-black text-[#2d1a1f]">{content.banner.badge}</span>
              ) : null}
              <h1 className="max-w-md text-2xl font-black leading-[1.4] sm:text-3xl">{content.banner.title}</h1>
              <p className="max-w-sm text-xs leading-7 text-white/85 sm:text-sm">{content.banner.subtitle}</p>
              <a
                href={content.banner.ctaLink || "#products"}
                className="mt-1 inline-flex items-center gap-2 rounded-full bg-[#e11d48] px-6 py-2.5 text-sm font-black text-white shadow-lg transition-transform hover:scale-[1.03]"
              >
                {content.banner.ctaLabel}
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
          {/* مینی‌پیشنهادها */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            {(cfg?.trustNotes ?? []).slice(0, 2).map((t) => (
              <div key={t} className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-[#ecdcc9] bg-white p-3 text-center">
                <ShieldCheck className="h-5 w-5 text-[#be123c]" aria-hidden="true" />
                <span className="text-[11px] font-black leading-4">{t}</span>
              </div>
            ))}
            {content.stats[0] ? (
              <div className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-[#2d1a1f] p-3 text-center text-white">
                <span className="text-lg font-black tabular-nums">{content.stats[0].value}</span>
                <span className="text-[10px] font-bold text-white/70">{content.stats[0].label}</span>
              </div>
            ) : null}
          </div>
        </div>
        )}
      </EditableShell>

      {/* دسته‌های دایره‌ای */}
      {content.sections.showCategories && props.categories.length > 0 ? (
        <EditableShell sectionId="categories" editMode={editMode} onEditSection={onEditSection} label="دسته‌بندی‌ها" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pt-6 sm:px-6">
          <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
            {props.categories.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => props.discovery.onSelectCategory(props.discovery.selectedCategory === c.name ? null : c.name)}
                className={`flex shrink-0 flex-col items-center gap-1.5 rounded-2xl px-4 py-2 transition-colors ${
                  props.discovery.selectedCategory === c.name ? "bg-[#be123c] text-white" : "bg-white text-[#2d1a1f] hover:bg-[#f6e9e0]"
                }`}
                aria-pressed={props.discovery.selectedCategory === c.name}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#e8a33d] to-[#be123c] text-sm font-black text-white">
                  {toPersianDigits(c.count)}
                </span>
                <span className="text-[11px] font-bold">{c.name}</span>
              </button>
            ))}
          </div>
        </EditableShell>
      ) : null}

      {/* پیشنهاد لحظه‌ای (روانشناسی) */}
      {featured.length > 0 && props.currency === "IRT" ? (
        <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
          <div className="rounded-2xl bg-gradient-to-l from-[#3d0a17] via-[#7a0e24] to-[#be123c] p-4">
            <div className="flex items-center gap-2 text-amber-200">
              <Star className="h-4 w-4 fill-amber-300 text-amber-300" aria-hidden="true" />
              <span className="text-sm font-black">پیشنهاد ویژهٔ امروز</span>
              <span className="mr-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-amber-100">تا پایان موجودی</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {featured.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => props.onOpenProduct(p)}
                  className="flex flex-col gap-1 rounded-xl bg-white p-2.5 text-right transition-transform hover:scale-[1.02]"
                >
                  <span className="line-clamp-2 min-h-[2.2rem] text-[11px] font-bold leading-5 text-[#2d1a1f]">{p.name}</span>
                  <PriceLabel priceRial={p.priceRial} currency={props.currency} className="text-xs font-black text-[#be123c]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* محصولات — گرید متراکم */}
      <EditableShell sectionId="products" editMode={editMode} onEditSection={onEditSection} label="محصولات" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pt-6 sm:px-6">
        <div>
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-black sm:text-xl">{props.discovery.selectedCategory ? props.discovery.selectedCategory : (content.sections.productsTitle?.trim() || "همهٔ کالاها")}</h2>
          </div>
          <div className="mt-3">
            <StorefrontDiscoveryBar
              discovery={props.discovery}
              tone={{
                bg: "bg-white",
                border: "border-[#ecdcc9]",
                input: "border border-[#ecdcc9] bg-white text-[#2d1a1f] placeholder:text-[#b39a89]",
                select: "border-[#ecdcc9] bg-white text-[#2d1a1f]",
                chip: "bg-[#f6e9e0] text-[#be123c] hover:bg-[#f0dcd0]",
                chipActive: "bg-[#be123c] text-white",
                sub: "text-[#8a6f60]",
              }}
            />
          </div>
          {products.length === 0 ? (
            <p className="py-14 text-center text-sm text-[#8a6a72]">کالایی مطابق جستجوی شما پیدا نشد.</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              {products.map((p) => (
                <ProductCardV2
                  key={p.id}
                  p={p}
                  onOpen={() => props.onOpenProduct(p)}
                  onAdd={() => props.onAddToCart(p)}
                  qtyOf={() => props.qtyOf(p.id)}
                  currency={props.currency}
                  detailHref={productDetailHrefFor(shop.slug, p)}
                  usdRateToman={props.usdRateToman}
                  cnyRateToman={props.cnyRateToman}
                  style={{
                    card: "border-[#ecdcc9] bg-white shadow-sm hover:shadow-md",
                    imgWrap: "bg-[#f6e9e0]",
                    badge: "bg-[#be123c]",
                    price: "text-[#be123c]",
                    addBtn: "bg-[#be123c] text-white hover:bg-[#a30f32]",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </EditableShell>

      {/* ویژگی‌ها — متراکم */}
      {content.sections.showFeatures && content.features.length > 0 ? (
        <EditableShell sectionId="features" editMode={editMode} onEditSection={onEditSection} label="ویژگی‌ها" className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {content.features.slice(0, 4).map((f) => (
              <div key={f.title} className="flex items-center gap-3 rounded-xl border border-[#ecdcc9] bg-white p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f6e9e0] text-[#be123c]">
                  <FeatureIcon icon={f.icon} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black">{f.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-[#8a6a72]">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </EditableShell>
      ) : null}

      {content.sections.showStats && content.stats.length > 0 ? (
        <EditableShell sectionId="stats" editMode={editMode} onEditSection={onEditSection} label="آمار" className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
          <StatsRow stats={content.stats} style={{ card: "border-[#ecdcc9] bg-white", value: "text-[#be123c]", label: "text-[#8a6a72]" }} />
        </EditableShell>
      ) : null}
      {content.sections.showAbout ? (
        <EditableShell sectionId="about" editMode={editMode} onEditSection={onEditSection} label="دربارهٔ ما" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-8 sm:px-6">
          <AboutSection content={content} style={{ card: "border-[#ecdcc9] bg-white", title: "text-[#2d1a1f]", text: "text-[#6b4a52]" }} />
        </EditableShell>
      ) : null}

      <div className="flex-grow" />
      {content.sections.showTrustBar ? (
        <TrustBar
          notes={content.trustNotes?.length ? content.trustNotes : (cfg?.trustNotes ?? [])}
          bg="bg-[#2d1a1f]"
          ink="text-[#f0dcd0]"
          editMode={editMode}
          onEditSection={onEditSection}
        />
      ) : null}
      <ShopFooterV2 shop={shop} content={content} editMode={editMode} onEditSection={onEditSection} accentClasses="bg-[#be123c] text-white" />
    </div>
  );
}

/* ═══════════════ رندرر — انتخاب قالب بر اساس شناسه ═══════════════ */

export function StorefrontTemplateV2Renderer(props: TemplateV2Props) {
  switch (props.shop.template) {
    case "rose":
      return <RoseEditorialTemplate {...props} />;
    case "firouzeh":
      return <FirouzehSazTemplate {...props} />;
    case "kahroba":
      return <KahrobaTemplate {...props} />;
    case "bazaarpro":
      return <BazaarProTemplate {...props} />;
    case "sabzineh":
      return <SabzinehTemplate {...props} />;
    // R24-4 — ۳ قالب پرمیوم
    case "aurora-pro":
      return <AuroraProTemplate {...props} />;
    case "bazaar-luxe":
      return <BazaarLuxeTemplate {...props} />;
    case "dark-neon":
      return <DarkNeonTemplate {...props} />;
    case "aurora":
    default:
      // R19: آرورا (پورت digizlux v5) — قالب پیش‌فرض همهٔ فروشگاه‌های جدید
      return <AuroraTemplate {...props} />;
  }
}

/** استایل انیمیشن ken-burns کهربا — تنها keyframe این فایل (سبک) */
export const KAHROBA_KENBURNS_KEYFRAMES = `
@keyframes kahroba-kenburns {
  from { transform: scale(1) translateX(0); }
  to { transform: scale(1.08) translateX(-1.5%); }
}
@media (prefers-reduced-motion: reduce) {
  .animate-\\[kahroba-kenburns_18s_ease-in-out_infinite_alternate\\] { animation: none !important; }
}
`;
