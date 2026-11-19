"use client";

// ============ فروشگاه آنلاین (R15-C) — قالب‌های صفحه فروشگاه ============
// ۵ قالب حرفه‌ای متمایز: modern | bazaar | minimal | luxury | retail
// هر قالب: هدر + هیرو + شبکه کالا + فوتر (تماس + نقشه OSM).
// افزودن قالب جدید (roadmap تا ۵۰ قالب): یک کامپوننت در این فایل + رکورد در
// STOREFRONT_TEMPLATES در lib/storefront.ts + یک case در رندرر پایین همین فایل.

import * as React from "react";
// R15-F — حالت کارایی: روی دستگاه ضعیف/کاهش حرکت، افکت‌های hover (lift + zoom تصویر)
// خاموش می‌شوند — چیدمان/رنگ/سایه‌های ایستا دست‌نخورده می‌مانند
import { usePerfMode } from "@/lib/perf-mode";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toPersianDigits, formatJalaliDayLabel } from "@/lib/persian";
import {
  rialToTomanLabel,
  type StorefrontProductDTO,
  type StorefrontShopDTO,
} from "@/lib/storefront";
import { InteractiveMap } from "./interactive-map";
import {
  StorefrontDiscoveryBar,
  DiscoveryPagination,
  DiscoveryEmptyState,
  type DiscoveryTone,
} from "@/components/storefront/discovery-bar";
import type { StorefrontDiscovery } from "@/components/storefront/use-store-products";

/* ═══════════════ اشتراک‌ها ═══════════════ */

export interface TemplateProps {
  shop: StorefrontShopDTO;
  products: StorefrontProductDTO[];
  cartCount: number;
  qtyOf: (productId: string) => number;
  onAddToCart: (p: StorefrontProductDTO) => void;
  onOpenCart: () => void;
  onOpenAuth: () => void;
  customerName: string | null;
  onOpenOrders: () => void;
  /** style object رنگ تاکیدی دلخواه مالک (اگر تنظیم کرده باشد) */
  accentBg?: React.CSSProperties;
  /** R17-C — موتور جستجو/فیلتر/صفحه‌بندی؛ قالب‌های v1 هم حالا نوار کشف دارند */
  discovery?: StorefrontDiscovery;
}

/** تُن نوار کشف هر قالب v1 — هم‌راستا با هویت بصری همان قالب */
const V1_TONES: Record<string, DiscoveryTone> = {
  modern: {
    bg: "bg-card",
    border: "border-border",
    input: "border-border bg-background text-foreground placeholder:text-muted-foreground",
    chip: "bg-muted text-muted-foreground hover:bg-muted/70",
    chipActive: "bg-primary text-primary-foreground",
    select: "border-border bg-background text-foreground",
    sub: "text-muted-foreground",
  },
  bazaar: {
    bg: "bg-white",
    border: "border-amber-800/25",
    input: "border-amber-800/25 bg-white text-amber-950 placeholder:text-amber-700/60",
    chip: "bg-amber-50 text-amber-900 hover:bg-amber-100",
    chipActive: "bg-amber-800 text-amber-50",
    select: "border-amber-800/25 bg-white text-amber-950",
    sub: "text-amber-800/70",
  },
  minimal: {
    bg: "bg-white",
    border: "border-zinc-200",
    input: "border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400",
    chip: "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
    chipActive: "bg-zinc-900 text-white",
    select: "border-zinc-200 bg-white text-zinc-900",
    sub: "text-zinc-400",
  },
  luxury: {
    bg: "bg-zinc-900/60",
    border: "border-zinc-800",
    input: "border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500",
    chip: "bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
    chipActive: "bg-amber-300 text-zinc-900",
    select: "border-zinc-800 bg-zinc-900 text-amber-100",
    sub: "text-zinc-500",
  },
  retail: {
    bg: "bg-white",
    border: "border-rose-200",
    input: "border-rose-200 bg-white text-zinc-900 placeholder:text-zinc-400",
    chip: "bg-rose-50 text-rose-700 hover:bg-rose-100",
    chipActive: "bg-rose-500 text-white",
    select: "border-rose-200 bg-white text-zinc-900",
    sub: "text-zinc-500",
  },
};

/** نوار کشف قالب‌های v1 — بدون discovery هیچ چیزی رندر نمی‌شود */
function V1DiscoveryBarArea({ discovery, tone }: { discovery?: StorefrontDiscovery; tone: DiscoveryTone }) {
  if (!discovery) return null;
  return <StorefrontDiscoveryBar discovery={discovery} tone={tone} />;
}

/** صفحه‌بندی قالب‌های v1 — بعد از شبکهٔ کالاها */
function V1DiscoveryPager({ discovery, tone }: { discovery?: StorefrontDiscovery; tone: DiscoveryTone }) {
  if (!discovery) return null;
  return <DiscoveryPagination discovery={discovery} tone={tone} />;
}

/** حالت خالی قالب‌های v1 — با دیسکاوری فعال، حالت خالی هوشمند (با دکمهٔ حذف فیلترها) */
function V1EmptyState({
  discovery,
  productsLength,
  fallback,
}: {
  discovery?: StorefrontDiscovery;
  productsLength: number;
  fallback: React.ReactNode;
}) {
  if (productsLength > 0) return null;
  if (discovery) return <DiscoveryEmptyState discovery={discovery} />;
  return fallback;
}

/** تصویر کالا — بدون عکس: جای‌نگهدار گرادیانی با آیکون */
function ProductImageFrame({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  if (src) {
    return (
      // آپلود کاربر با دامنه نامشخص — img ساده (rule در این پروژه خاموش است)
      <img src={src} alt={alt} loading="lazy" className={`h-full w-full object-cover ${className ?? ""}`} />
    );
  }
  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-muted/60 to-muted ${className ?? ""}`}
      role="img"
      aria-label={alt}
    >
      <Package className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
    </div>
  );
}

/** بج موجودی — نامشخص ≠ ناموجود (کالای بدون ردیف انبار «موجود» است) */
function StockBadge({ p, dark }: { p: StorefrontProductDTO; dark?: boolean }) {
  if (!p.inStock) {
    return (
      <Badge
        variant="outline"
        className={dark ? "border-red-400/40 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700"}
      >
        ناموجود
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={dark ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"}
    >
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

/** بج فیروزه‌ای تخفیف روی گوشهٔ تصویر کالا */
function DiscountCornerBadge({ p }: { p: StorefrontProductDTO }) {
  const d = productDiscount(p);
  if (!d) return null;
  return (
    <span className="absolute right-2 top-2 z-10 rounded-full bg-teal-600 px-2 py-0.5 text-[11px] font-extrabold text-white shadow-md">
      ٪{toPersianDigits(d)} تخفیف
    </span>
  );
}

/** قیمت با تخفیف — قیمت نمایشی برجسته + قیمت قبل خط‌خورده کوچک */
function PriceWithDiscount({
  p,
  className,
  oldClassName = "text-[11px] font-medium text-muted-foreground line-through",
}: {
  p: StorefrontProductDTO;
  className: string;
  oldClassName?: string;
}) {
  const d = productDiscount(p);
  const displayPrice = productDisplayPrice(p);
  if (d > 0 && displayPrice) {
    return (
      <span className="flex flex-col items-start leading-tight">
        <span className={className}>{rialToTomanLabel(displayPrice)}</span>
        <span className={oldClassName}>{rialToTomanLabel(p.priceRial)}</span>
      </span>
    );
  }
  return <span className={className}>{rialToTomanLabel(p.priceRial)}</span>;
}

/** فوتر مشترک — تماس، شبکه‌های اجتماعی، آدرس + نقشهٔ تعاملی Leaflet (v20-D) */
function ShopFooter({
  shop,
  dark,
  accentBg,
}: {
  shop: StorefrontShopDTO;
  dark?: boolean;
  accentBg?: React.CSSProperties;
}) {
  const hasGeo = typeof shop.lat === "number" && typeof shop.lng === "number";
  const socials: { label: string; href: string; icon: React.ElementType }[] = [];
  if (shop.socialInstagram)
    socials.push({
      label: `@${shop.socialInstagram}`,
      href: `https://instagram.com/${shop.socialInstagram.replace(/^@/, "")}`,
      icon: Instagram,
    });
  if (shop.socialTelegram)
    socials.push({
      label: `@${shop.socialTelegram}`,
      href: `https://t.me/${shop.socialTelegram.replace(/^@/, "")}`,
      icon: Send,
    });
  if (shop.socialWhatsapp)
    socials.push({
      label: shop.socialWhatsapp,
      href: `https://wa.me/${shop.socialWhatsapp.replace(/\D/g, "")}`,
      icon: MessageCircle,
    });
  const socialClass = dark ? "bg-zinc-800 text-amber-200 hover:bg-zinc-700" : "bg-muted text-foreground hover:bg-muted/70";

  return (
    <footer
      className={`mt-auto border-t ${
        dark ? "border-zinc-800 bg-zinc-950 text-zinc-300" : "border-border bg-muted/40 text-foreground"
      }`}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h3 className={`text-lg font-bold ${dark ? "text-amber-100" : ""}`}>{shop.title}</h3>
            {shop.description ? (
              <p className={`mt-2 line-clamp-3 text-sm leading-7 ${dark ? "text-zinc-400" : "text-muted-foreground"}`}>
                {shop.description}
              </p>
            ) : null}
            <ul className="mt-4 space-y-2 text-sm">
              {shop.phone ? (
                <li className="flex items-center gap-2" dir="ltr">
                  <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="font-medium">{toPersianDigits(shop.phone)}</span>
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
            </ul>
            {socials.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${socialClass}`}
                  >
                    <s.icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {s.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
          {hasGeo ? (
            <div>
              <p className={`mb-2 text-sm font-semibold ${dark ? "text-amber-100" : ""}`}>موقعیت روی نقشه</p>
              {/* v20-D — نقشهٔ تعاملی Leaflet (lazy) به‌جای iframe ایستا: زوم/درگ/مسیریابی */}
              <InteractiveMap
                lat={shop.lat as number}
                lng={shop.lng as number}
                title={shop.title}
                address={[shop.address, shop.city].filter(Boolean).join(" — ") || undefined}
                height="220px"
                className={dark ? "rounded-2xl ring-1 ring-zinc-800" : "rounded-2xl"}
              />
            </div>
          ) : null}
        </div>
        <div
          className={`mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs ${
            dark ? "border-zinc-800 text-zinc-500" : "border-border text-muted-foreground"
          }`}
        >
          <span>{formatJalaliDayLabel(new Date().toISOString())} — {shop.title}</span>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-opacity hover:opacity-80 ${
              dark ? "bg-zinc-800 text-zinc-300" : "bg-muted"
            }`}
            style={accentBg}
          >
            <StoreIcon className="h-3.5 w-3.5" aria-hidden="true" />
            نرم‌افزار حسابداری افق پلاس
          </a>
        </div>
      </div>
    </footer>
  );
}

/** دکمه سبد خرید هدر (با شمارنده) */
function HeaderCartButton({
  count,
  onOpen,
  dark,
  accentBg,
}: {
  count: number;
  onOpen: () => void;
  dark?: boolean;
  accentBg?: React.CSSProperties;
}) {
  return (
    <Button
      size="sm"
      onClick={onOpen}
      className="relative gap-2 rounded-full"
      style={accentBg}
      variant={dark ? "default" : "default"}
      aria-label={`سبد خرید — ${toPersianDigits(count)} قلم`}
    >
      <ShoppingBag className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">سبد خرید</span>
      <span
        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold ${
          accentBg ? "bg-white/25" : dark ? "bg-amber-300 text-zinc-900" : "bg-background/20"
        }`}
      >
        {toPersianDigits(count)}
      </span>
    </Button>
  );
}

/** دکمه ورود/حساب مشتری */
function HeaderAccountButton({
  customerName,
  onOpenAuth,
  onOpenOrders,
  dark,
}: {
  customerName: string | null;
  onOpenAuth: () => void;
  onOpenOrders: () => void;
  dark?: boolean;
}) {
  if (customerName) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={onOpenOrders}
        className={`rounded-full gap-2 ${dark ? "border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800" : ""}`}
      >
        سفارش‌های من
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onOpenAuth}
      className={`rounded-full ${dark ? "border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800" : ""}`}
    >
      ورود / ثبت‌نام
    </Button>
  );
}

/* ═══════════════ ۱) قالب مدرن بازار (modern) ═══════════════ */
export function ModernBazaarTemplate(props: TemplateProps) {
  const { shop, products, accentBg } = props;
  // R15-F — میکرو-انیمیشن hover کالاها فقط روی دستگاه‌های توانمند
  const { reducedMotion } = usePerfMode();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"
              style={accentBg}
            >
              <StoreIcon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-base font-bold sm:text-lg">{shop.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <HeaderAccountButton
              customerName={props.customerName}
              onOpenAuth={props.onOpenAuth}
              onOpenOrders={props.onOpenOrders}
            />
            <HeaderCartButton count={props.cartCount} onOpen={props.onOpenCart} accentBg={accentBg} />
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-b from-primary/10 via-primary/5 to-transparent">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(16,185,129,0.18), transparent 45%), radial-gradient(circle at 85% 15%, rgba(245,158,11,0.15), transparent 40%)",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/10 text-primary">
            فروشگاه رسمی {shop.tenantName}
          </Badge>
          <h1 className="text-2xl font-extrabold leading-relaxed sm:text-4xl sm:leading-[1.4]">{shop.title}</h1>
          {shop.description ? (
            <p className="mt-4 max-w-2xl text-sm leading-8 text-muted-foreground sm:text-base sm:leading-9">
              {shop.description}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-background/80 px-4 py-2 shadow-sm">
              <Truck className="h-4 w-4 text-primary" aria-hidden="true" />
              ارسال سریع سفارش‌ها
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-background/80 px-4 py-2 shadow-sm">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              پرداخت امن کارت‌به‌کارت
            </span>
            {shop.phone ? (
              <a
                href={`tel:${shop.phone}`}
                className="inline-flex items-center gap-2 rounded-full bg-background/80 px-4 py-2 shadow-sm transition-shadow hover:shadow-md"
              >
                <Phone className="h-4 w-4 text-primary" aria-hidden="true" />
                {toPersianDigits(shop.phone)}
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-xl font-bold sm:text-2xl">کالاها و خدمات</h2>
          <span className="text-sm text-muted-foreground">{toPersianDigits(products.length)} قلم</span>
        </div>
        <V1DiscoveryBarArea discovery={props.discovery} tone={V1_TONES.modern} />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {(props.discovery?.products ?? products).map((p) => (
            <article
              key={p.id}
              className={`group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm ${
                reducedMotion? "": "transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              }`}
            >
              <div className="relative aspect-square overflow-hidden bg-muted">
                <DiscountCornerBadge p={p} />
                <ProductImageFrame
                  src={p.imageUrl}
                  alt={p.name}
                  className={reducedMotion? "": "transition-transform duration-500 group-hover:scale-105"}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
                <h3 className="line-clamp-2 text-sm font-semibold leading-6 sm:text-base">{p.name}</h3>
                {p.description ? (
                  <p className="line-clamp-2 hidden text-xs leading-5 text-muted-foreground sm:block">{p.description}</p>
                ) : null}
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <PriceWithDiscount p={p} className="text-sm font-extrabold text-primary" />
                  <StockBadge p={p} />
                </div>
                <Button
                  size="sm"
                  className="w-full rounded-xl"
                  disabled={!p.inStock}
                  onClick={() => props.onAddToCart(p)}
                  style={accentBg}
                >
                  <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                  {props.qtyOf(p.id) > 0 ? `در سبد (${toPersianDigits(props.qtyOf(p.id))})` : "افزودن به سبد"}
                </Button>
              </div>
            </article>
          ))}
        </div>
        <V1EmptyState
          discovery={props.discovery}
          productsLength={(props.discovery?.products ?? products).length}
          fallback={<p className="py-16 text-center text-muted-foreground">فعلاً کالایی برای نمایش ثبت نشده است.</p>}
        />
        <V1DiscoveryPager discovery={props.discovery} tone={V1_TONES.modern} />
      </section>

      <ShopFooter shop={shop} accentBg={accentBg} />
    </div>
  );
}

/* ═══════════════ ۲) قالب بازار سنتی (bazaar) ═══════════════ */
export function ClassicBazaarTemplate(props: TemplateProps) {
  const { shop, products } = props;
  // R15-F — افکت lift کالا فقط روی دستگاه‌های توانمند
  const { reducedMotion } = usePerfMode();
  return (
    <div className="flex min-h-screen flex-col bg-[#fdf8f2] text-[#3f2d20]">
      <header className="sticky top-0 z-30 border-b-2 border-amber-800/30 bg-[#fdf8f2]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-amber-800 bg-amber-100 text-amber-900">
              <StoreIcon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-base font-extrabold text-amber-950 sm:text-lg">{shop.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <HeaderAccountButton
              customerName={props.customerName}
              onOpenAuth={props.onOpenAuth}
              onOpenOrders={props.onOpenOrders}
              dark
            />
            <HeaderCartButton count={props.cartCount} onOpen={props.onOpenCart} accentBg={{ backgroundColor: "#92400e" }} />
          </div>
        </div>
      </header>

      <section className="relative border-b-4 border-double border-amber-800/40 bg-gradient-to-b from-amber-100 to-[#fdf8f2]">
        {/* حاشیه تزیینی کیلیم‌گونه با CSS خالص */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-2"
          style={{
            backgroundImage: "repeating-linear-gradient(90deg, #92400e 0 18px, #d97706 18px 36px, #fde68a 36px 54px)",
          }}
          aria-hidden="true"
        />
        <div className="mx-auto w-full max-w-6xl px-4 py-12 text-center sm:px-6 sm:py-16">
          <p className="text-sm font-medium tracking-widest text-amber-700">به بازار ما خوش آمدید</p>
          <h1 className="mt-3 text-3xl font-black leading-relaxed text-amber-950 sm:text-5xl sm:leading-[1.3]">{shop.title}</h1>
          {shop.description ? (
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-8 text-amber-900/80 sm:text-base sm:leading-9">{shop.description}</p>
          ) : null}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3 text-sm">
            {shop.city ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-800/30 bg-amber-50 px-4 py-2 text-amber-900">
                <MapPin className="h-4 w-4 text-amber-700" aria-hidden="true" />
                {shop.city}
              </span>
            ) : null}
            {shop.phone ? (
              <a
                href={`tel:${shop.phone}`}
                className="inline-flex items-center gap-2 rounded-full border border-amber-800/30 bg-amber-50 px-4 py-2 font-bold text-amber-900 transition-colors hover:bg-amber-100"
              >
                <Phone className="h-4 w-4 text-amber-700" aria-hidden="true" />
                {toPersianDigits(shop.phone)}
              </a>
            ) : null}
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-800/30 bg-amber-50 px-4 py-2 text-amber-900">
              <Star className="h-4 w-4 text-amber-600" aria-hidden="true" />
              جنس اصل، قیمت بازار
            </span>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="h-px flex-1 bg-amber-800/25" aria-hidden="true" />
          <h2 className="text-xl font-black text-amber-950 sm:text-2xl">دستمزد و اجناس بازار</h2>
          <span className="h-px flex-1 bg-amber-800/25" aria-hidden="true" />
        </div>
        <V1DiscoveryBarArea discovery={props.discovery} tone={V1_TONES.bazaar} />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {(props.discovery?.products ?? products).map((p) => (
            <article
              key={p.id}
              className={`flex flex-col overflow-hidden rounded-xl border-2 border-amber-800/25 bg-white shadow-[0_2px_0_rgba(146,64,14,0.15)] ${
                reducedMotion? "": "transition-transform duration-200 hover:-translate-y-0.5"
              }`}
            >
              <div className="relative aspect-square overflow-hidden border-b-2 border-amber-800/20 bg-amber-50">
                <DiscountCornerBadge p={p} />
                <ProductImageFrame src={p.imageUrl} alt={p.name} />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <h3 className="line-clamp-2 text-sm font-bold leading-6 text-amber-950">{p.name}</h3>
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <PriceWithDiscount
                    p={p}
                    className="rounded-lg bg-amber-100 px-2.5 py-1 text-sm font-extrabold text-amber-900"
                    oldClassName="text-[11px] font-medium text-amber-700/70 line-through"
                  />
                  <StockBadge p={p} />
                </div>
                <Button
                  size="sm"
                  className="w-full rounded-xl bg-amber-800 text-amber-50 hover:bg-amber-900"
                  disabled={!p.inStock}
                  onClick={() => props.onAddToCart(p)}
                >
                  <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                  {props.qtyOf(p.id) > 0 ? `در سبد (${toPersianDigits(props.qtyOf(p.id))})` : "سبد کنید"}
                </Button>
              </div>
            </article>
          ))}
        </div>
        <V1EmptyState
          discovery={props.discovery}
          productsLength={(props.discovery?.products ?? products).length}
          fallback={<p className="py-16 text-center text-amber-800/70">فعلاً کالایی روی پایه بازار نیست.</p>}
        />
        <V1DiscoveryPager discovery={props.discovery} tone={V1_TONES.bazaar} />
      </section>

      <ShopFooter shop={shop} accentBg={{ backgroundColor: "#92400e" }} />
    </div>
  );
}

/* ═══════════════ ۳) قالب مینیمال روشن (minimal) ═══════════════ */
export function MinimalCleanTemplate(props: TemplateProps) {
  const { shop, products, accentBg } = props;
  // R15-F — zoom تصویر کالا فقط روی دستگاه‌های توانمند
  const { reducedMotion } = usePerfMode();
  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-900">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <span className="text-lg font-semibold tracking-tight sm:text-xl">{shop.title}</span>
          <div className="flex items-center gap-2">
            <HeaderAccountButton customerName={props.customerName} onOpenAuth={props.onOpenAuth} onOpenOrders={props.onOpenOrders} />
            <HeaderCartButton count={props.cartCount} onOpen={props.onOpenCart} accentBg={accentBg} />
          </div>
        </div>
      </header>

      <section className="border-b border-zinc-200">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-400">فروشگاه آنلاین</p>
          <h1 className="mt-4 text-3xl font-medium leading-relaxed tracking-tight sm:text-5xl sm:leading-[1.25]">{shop.title}</h1>
          {shop.description ? (
            <p className="mx-auto mt-6 max-w-xl text-sm leading-8 text-zinc-500 sm:text-base sm:leading-9">{shop.description}</p>
          ) : null}
          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-zinc-500">
            {shop.phone ? (
              <a href={`tel:${shop.phone}`} className="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-900">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {toPersianDigits(shop.phone)}
              </a>
            ) : null}
            {shop.city ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {shop.city}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
        <div className="mb-8 flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-[0.25em] text-zinc-400">کالاها</h2>
          <span className="text-xs text-zinc-400">{toPersianDigits(products.length)} قلم</span>
        </div>
        <V1DiscoveryBarArea discovery={props.discovery} tone={V1_TONES.minimal} />
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {(props.discovery?.products ?? products).map((p) => (
            <article key={p.id} className="group flex flex-col">
              <div className="relative aspect-square overflow-hidden border border-zinc-200 bg-zinc-50">
                <DiscountCornerBadge p={p} />
                <ProductImageFrame
                  src={p.imageUrl}
                  alt={p.name}
                  className={reducedMotion? "": "transition-transform duration-500 group-hover:scale-[1.03]"}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1 pt-3">
                <h3 className="line-clamp-2 text-sm font-normal leading-6">{p.name}</h3>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <PriceWithDiscount p={p} className="text-sm font-medium tabular-nums" />
                  <StockBadge p={p} />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full rounded-none border-zinc-300 font-normal hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
                  disabled={!p.inStock}
                  onClick={() => props.onAddToCart(p)}
                >
                  {props.qtyOf(p.id) > 0 ? `در سبد (${toPersianDigits(props.qtyOf(p.id))})` : "افزودن به سبد"}
                </Button>
              </div>
            </article>
          ))}
        </div>
        <V1EmptyState
          discovery={props.discovery}
          productsLength={(props.discovery?.products ?? products).length}
          fallback={<p className="py-20 text-center text-sm text-zinc-400">فعلاً کالایی ثبت نشده است.</p>}
        />
        <V1DiscoveryPager discovery={props.discovery} tone={V1_TONES.minimal} />
      </section>

      <ShopFooter shop={shop} accentBg={accentBg} />
    </div>
  );
}

/* ═══════════════ ۴) قالب لاکچری تیره (luxury) ═══════════════ */
export function LuxuryDarkTemplate(props: TemplateProps) {
  const { shop, products } = props;
  // R15-F — zoom تصویر گالری فقط روی دستگاه‌های توانمند
  const { reducedMotion } = usePerfMode();
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-200">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <span className="h-px w-6 bg-amber-300/60" aria-hidden="true" />
            <span className="text-base font-semibold tracking-[0.2em] text-amber-100 sm:text-lg">{shop.title}</span>
            <span className="h-px w-6 bg-amber-300/60" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2">
            <HeaderAccountButton customerName={props.customerName} onOpenAuth={props.onOpenAuth} onOpenOrders={props.onOpenOrders} dark />
            <HeaderCartButton count={props.cartCount} onOpen={props.onOpenCart} accentBg={{ backgroundColor: "#d4af37", color: "#181810" }} />
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-zinc-800">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.14), transparent 55%), radial-gradient(circle at 10% 90%, rgba(212,175,55,0.07), transparent 45%)",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <p className="text-[11px] font-medium tracking-[0.5em] text-amber-300/80">مجموعه منتخب</p>
          <h1 className="mt-4 text-3xl font-semibold leading-relaxed tracking-wide text-amber-50 sm:text-5xl sm:leading-[1.35]">
            {shop.title}
          </h1>
          {shop.description ? (
            <p className="mx-auto mt-6 max-w-2xl text-sm leading-8 text-zinc-400 sm:text-base sm:leading-9">{shop.description}</p>
          ) : null}
          <div className="mx-auto mt-8 h-px w-24 bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" aria-hidden="true" />
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs">
            {shop.phone ? (
              <a
                href={`tel:${shop.phone}`}
                className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 px-4 py-2 text-amber-200 transition-colors hover:border-amber-300/60"
              >
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {toPersianDigits(shop.phone)}
              </a>
            ) : null}
            {shop.city ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-zinc-300">
                <MapPin className="h-3.5 w-3.5 text-amber-300/80" aria-hidden="true" />
                {shop.city}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8 text-center">
          <h2 className="inline-block border-b border-amber-300/40 pb-2 text-lg font-medium tracking-[0.2em] text-amber-100 sm:text-xl">
            گالری کالاها
          </h2>
        </div>
        <V1DiscoveryBarArea discovery={props.discovery} tone={V1_TONES.luxury} />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {(props.discovery?.products ?? products).map((p) => (
            <article
              key={p.id}
              className="group flex flex-col border border-zinc-800 bg-zinc-900/60 transition-colors duration-300 hover:border-amber-300/40"
            >
              <div className="relative aspect-square overflow-hidden bg-zinc-900">
                <DiscountCornerBadge p={p} />
                <ProductImageFrame
                  src={p.imageUrl}
                  alt={p.name}
                  className={reducedMotion? "": "transition-transform duration-700 group-hover:scale-105"}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="line-clamp-2 text-center text-sm font-medium leading-6 text-zinc-100">{p.name}</h3>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <PriceWithDiscount
                    p={p}
                    className="text-sm font-semibold tracking-wide text-amber-300"
                    oldClassName="text-[11px] font-medium text-zinc-500 line-through"
                  />
                  <StockBadge p={p} dark />
                </div>
                <Button
                  size="sm"
                  className="w-full border border-amber-300/30 bg-transparent text-amber-200 transition-colors hover:bg-amber-300 hover:text-zinc-900"
                  disabled={!p.inStock}
                  onClick={() => props.onAddToCart(p)}
                >
                  {props.qtyOf(p.id) > 0 ? `در سبد (${toPersianDigits(props.qtyOf(p.id))})` : "افزودن به سبد"}
                </Button>
              </div>
            </article>
          ))}
        </div>
        <V1EmptyState
          discovery={props.discovery}
          productsLength={(props.discovery?.products ?? products).length}
          fallback={<p className="py-20 text-center text-sm text-zinc-500">فعلاً کالایی در گالری نیست.</p>}
        />
        <V1DiscoveryPager discovery={props.discovery} tone={V1_TONES.luxury} />
      </section>

      <ShopFooter shop={shop} dark accentBg={{ backgroundColor: "#d4af37", color: "#181810" }} />
    </div>
  );
}

/* ═══════════════ ۵) قالب خرده‌فروشی شاد (retail) ═══════════════ */
export function RetailBrightTemplate(props: TemplateProps) {
  const { shop, products, accentBg } = props;
  // R15-F — افکت lift + zoom کالا فقط روی دستگاه‌های توانمند
  const { reducedMotion } = usePerfMode();
  return (
    <div className="flex min-h-screen flex-col bg-rose-50/60 text-zinc-900">
      <header className="sticky top-0 z-30 border-b border-rose-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 rotate-3 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-md">
              <StoreIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-base font-extrabold sm:text-lg">{shop.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <HeaderAccountButton customerName={props.customerName} onOpenAuth={props.onOpenAuth} onOpenOrders={props.onOpenOrders} />
            <HeaderCartButton count={props.cartCount} onOpen={props.onOpenCart} accentBg={accentBg ?? { backgroundColor: "#e11d48" }} />
          </div>
        </div>
      </header>

      {/* نوار پیشنهاد ویژه */}
      <div className="overflow-hidden bg-zinc-900 py-2 text-center text-xs font-bold tracking-wide text-rose-100 sm:text-sm">
        ارسال به سراسر کشور — سفارش‌ها سریع تأیید و ارسال می‌شوند
      </div>

      <section className="bg-gradient-to-br from-rose-100 via-orange-50 to-amber-100">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid items-center gap-6 md:grid-cols-2">
            <div>
              <span className="inline-block -rotate-2 rounded-lg bg-rose-500 px-3 py-1 text-xs font-black text-white sm:text-sm">
                فروش آنلاین با یک کلیک
              </span>
              <h1 className="mt-4 text-3xl font-black leading-[1.5] sm:text-5xl sm:leading-[1.4]">{shop.title}</h1>
              {shop.description ? (
                <p className="mt-4 max-w-xl text-sm leading-8 text-zinc-600 sm:text-base sm:leading-9">{shop.description}</p>
              ) : null}
              <div className="mt-6 flex flex-wrap gap-3">
                <Button size="lg" className="rounded-full bg-rose-500 hover:bg-rose-600" onClick={props.onOpenCart}>
                  <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                  مشاهده سبد خرید
                </Button>
                {shop.phone ? (
                  <a
                    href={`tel:${shop.phone}`}
                    className="inline-flex items-center gap-2 rounded-full border-2 border-rose-300 bg-white px-5 py-2 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-50"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    {toPersianDigits(shop.phone)}
                  </a>
                ) : null}
              </div>
            </div>
            <div className="relative hidden h-56 md:block" aria-hidden="true">
              <div className="absolute inset-0 rotate-2 rounded-[2rem] bg-rose-500/20" />
              <div className="absolute inset-4 -rotate-1 rounded-[2rem] bg-orange-400/20" />
              <div className="absolute inset-8 flex items-center justify-center rounded-[1.5rem] bg-white shadow-xl">
                <ShoppingBag className="h-20 w-20 text-rose-400" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex items-center gap-3">
          <h2 className="rounded-full bg-white px-4 py-1.5 text-lg font-black shadow-sm sm:text-xl">همه کالاها</h2>
          <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-bold text-amber-900">
            {toPersianDigits(products.length)} قلم
          </span>
        </div>
        <V1DiscoveryBarArea discovery={props.discovery} tone={V1_TONES.retail} />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {(props.discovery?.products ?? products).map((p) => (
            <article
              key={p.id}
              className={`group flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-rose-100 ${
                reducedMotion? "": "transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:ring-rose-300"
              }`}
            >
              <div className="relative aspect-square overflow-hidden bg-rose-50">
                <DiscountCornerBadge p={p} />
                <ProductImageFrame
                  src={p.imageUrl}
                  alt={p.name}
                  className={reducedMotion? "": "transition-transform duration-500 group-hover:scale-110"}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
                <h3 className="line-clamp-2 text-sm font-bold leading-6">{p.name}</h3>
                {p.description ? <p className="line-clamp-2 hidden text-xs leading-5 text-zinc-500 sm:block">{p.description}</p> : null}
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <PriceWithDiscount
                    p={p}
                    className="rounded-full bg-rose-100 px-2.5 py-1 text-sm font-black text-rose-700"
                    oldClassName="text-[11px] font-medium text-zinc-400 line-through"
                  />
                  <StockBadge p={p} />
                </div>
                <Button
                  size="sm"
                  className="w-full rounded-full bg-rose-500 hover:bg-rose-600"
                  disabled={!p.inStock}
                  onClick={() => props.onAddToCart(p)}
                  style={accentBg}
                >
                  <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                  {props.qtyOf(p.id) > 0 ? `در سبد (${toPersianDigits(props.qtyOf(p.id))})` : "افزودن به سبد"}
                </Button>
              </div>
            </article>
          ))}
        </div>
        <V1EmptyState
          discovery={props.discovery}
          productsLength={(props.discovery?.products ?? products).length}
          fallback={<p className="py-16 text-center text-zinc-400">فعلاً کالایی برای فروش نیست — به‌زودی!</p>}
        />
        <V1DiscoveryPager discovery={props.discovery} tone={V1_TONES.retail} />
      </section>

      <ShopFooter shop={shop} accentBg={accentBg ?? { backgroundColor: "#e11d48" }} />
    </div>
  );
}

/* ═══════════════ رندرر قالب ═══════════════ */
export function StorefrontTemplateRenderer(props: TemplateProps) {
  switch (props.shop.template) {
    case "bazaar":
      return <ClassicBazaarTemplate {...props} />;
    case "minimal":
      return <MinimalCleanTemplate {...props} />;
    case "luxury":
      return <LuxuryDarkTemplate {...props} />;
    case "retail":
      return <RetailBrightTemplate {...props} />;
    case "modern":
    default:
      return <ModernBazaarTemplate {...props} />;
  }
}

/** تاریخ سفارش برای لیست‌های مشتری — برچسب شمسی خوانا */
export function orderDateLabel(iso: string): string {
  return formatJalaliDayLabel(iso);
}
