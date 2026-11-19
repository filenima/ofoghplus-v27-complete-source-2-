"use client";

// ═══════════════════════════════════════════════════════════════════
// R24-4 — رندر بلوک‌های فروشگاه (مشترک ویرایشگر و سایت عمومی)
// هر بلوک یک کامپوننت خالص است: props + shop + products + categories
// SfBlockView در «سایت عمومی» و «پیش‌نمایش ویرایشگر» هر دو استفاده می‌شود.
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  MapPin, Phone, Instagram, Send, MessageCircle, Clock, ChevronDown, ChevronLeft,
  Star, ShieldCheck, Truck, Headset, BadgePercent, Heart, ShoppingBag,
} from "lucide-react";
import { toPersianDigits } from "@/lib/persian";
import {
  rialToTomanLabel, effectiveUnitPriceRial, type StorefrontProductDTO,
} from "@/lib/storefront";
import { type SfBlock, type SfBlockStyle, normalizeVideoEmbedUrl, isDirectVideoUrl } from "@/lib/storefront-blocks";
import { type BannerSlide } from "@/lib/storefront-wizard";
import { BannerCarousel } from "@/components/storefront/banner-carousel";
import { InteractiveMap } from "@/components/storefront/interactive-map";
import { sanitizeHtml } from "@/lib/sanitize-html";

/* ═══════════════ بافت داده‌ای مشترک ═══════════════ */

export interface SfWishlistApi {
  has: (id: string) => boolean;
  toggle: (p: StorefrontProductDTO) => void;
  count: number;
}

export interface SfBlocksContextValue {
  /** دادهٔ فروشگاه (عمومی) */
  shop: {
    slug: string;
    title: string;
    phone: string | null;
    address: string | null;
    city: string | null;
    lat: number | null;
    lng: number | null;
    socialInstagram: string | null;
    socialTelegram: string | null;
    socialWhatsapp: string | null;
    accentColor?: string | null;
  };
  products: StorefrontProductDTO[];
  categories: { name: string; count: number }[];
  /** تعامل عمومی (در ویرایشگر noop می‌شود) */
  onAddToCart: (p: StorefrontProductDTO) => void;
  onOpenProduct: (p: StorefrontProductDTO) => void;
  /** لیست علاقه‌مندی‌ها (اختیاری — فقط سایت عمومی) */
  wishlist?: SfWishlistApi;
  /** قیمت واحد مؤثر با تخفیف */
  unitPrice: (p: StorefrontProductDTO) => string;
}

export const SfBlocksCtx = React.createContext<SfBlocksContextValue>({
  shop: { slug: "", title: "", phone: null, address: null, city: null, lat: null, lng: null, socialInstagram: null, socialTelegram: null, socialWhatsapp: null },
  products: [],
  categories: [],
  onAddToCart: () => undefined,
  onOpenProduct: () => undefined,
  unitPrice: (p) => p.priceRial,
});

/** قلاب لیست علاقه‌مندی‌های مشتری — localStorage با کلید هر فروشگاه */
export function useSfWishlist(slug: string): SfWishlistApi {
  const storageKey = `sf-wishlist-${slug}`;
  const [ids, setIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setIds(parsed.filter((x): x is string => typeof x === "string").slice(0, 200));
      }
    } catch {
      /* ignore */
    }
     
  }, []);

  const persist = React.useCallback(
    (next: string[]) => {
      setIds(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
     
    [storageKey]
  );

  return React.useMemo(
    () => ({
      has: (id) => ids.includes(id),
      toggle: (p) => persist(ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id]),
      count: ids.length,
    }),
    [ids, persist]
  );
}

/* ═══════════════ سبک مشترک ═══════════════ */

const MAX_WIDTH_CLS: Record<string, string> = {
  full: "max-w-none",
  wide: "max-w-7xl",
  boxed: "max-w-4xl",
};

function bgClass(style: Partial<SfBlockStyle>): string {
  switch (style.bgColor) {
    case "surface": return "bg-card border border-border";
    case "muted": return "bg-muted/60";
    case "primary-soft": return "bg-emerald-50/80 dark:bg-emerald-950/30";
    case "dark": return "bg-zinc-900";
    case "aurora-mesh": return "sf-aurora-mesh";
    case "gold-soft": return "bg-gradient-to-br from-amber-100 via-yellow-50 to-amber-50 dark:from-amber-950/40 dark:via-zinc-900 dark:to-amber-950/20";
    default:
      return "";
  }
}

function SectionShell({
  block, children, className, style: extraStyle,
}: {
  block: SfBlock;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const s = block.style;
  const customBg = s.bgColor && /^#[0-9a-fA-F]{6}$/.test(s.bgColor) ? { backgroundColor: s.bgColor } : undefined;
  const textCls = s.textColor === "light" ? "text-zinc-100" : s.textColor === "dark" ? "text-zinc-900" : "";
  return (
    <section
      className={`relative w-full ${bgClass(s)} ${textCls} ${className ?? ""}`}
      style={{ paddingTop: s.paddingTop ?? 24, paddingBottom: s.paddingBottom ?? 24, borderRadius: s.radius ?? 0, ...customBg, ...extraStyle }}
    >
      <div className={`mx-auto w-full px-4 sm:px-6 ${MAX_WIDTH_CLS[s.maxWidth ?? "wide"]}`}>{children}</div>
    </section>
  );
}

function BlockTitle({ title, light, accent }: { title: string; light?: boolean; accent?: string }) {
  if (!title) return null;
  return (
    <div className="mb-5 text-center">
      <h2 className={`text-xl font-black tracking-tight sm:text-2xl ${light ? "text-white" : "text-foreground"}`}>{title}</h2>
      <span
        className="mx-auto mt-2 block h-1 w-16 rounded-full"
        style={{ background: `linear-gradient(to left, ${accent || "#10b981"}, transparent)` }}
        aria-hidden="true"
      />
    </div>
  );
}

/* ═══════════════ کارت کالا (پرمیوم با افکت سه‌بعدی) ═══════════════ */

export function SfProductCard({
  p, premium, showPrice, showStock, showRating, onAdd, onQuickView, accent,
}: {
  p: StorefrontProductDTO;
  premium?: boolean;
  showPrice?: boolean;
  showStock?: boolean;
  showRating?: boolean;
  onAdd?: (p: StorefrontProductDTO) => void;
  onQuickView?: (p: StorefrontProductDTO) => void;
  accent?: string | null;
}) {
  const ctx = React.useContext(SfBlocksCtx);
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 });
  const discount = typeof p.discountPercent === "number" && p.discountPercent > 0 ? Math.min(90, p.discountPercent) : 0;
  const price = effectiveUnitPriceRial(p);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!premium) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -6, y: px * 8 });
  }

  const ratingCount = (p as StorefrontProductDTO & { ratingCount?: number }).ratingCount;
  const ratingAvg = (p as StorefrontProductDTO & { ratingAvg?: number }).ratingAvg;
  const wished = ctx.wishlist?.has(p.id) ?? false;

  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      style={{
        transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: "transform 220ms ease",
      }}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-foreground shadow-sm transition-shadow hover:shadow-xl ${
        premium ? "backdrop-blur supports-[backdrop-filter]:bg-card/80" : ""
      }`}
    >
      {ctx.wishlist ? (
        <button
          type="button"
          onClick={() => ctx.wishlist?.toggle(p)}
          className={`absolute left-2 top-2 z-20 rounded-full p-1.5 shadow-md backdrop-blur transition-all ${
            wished ? "bg-red-500 text-white" : "bg-white/85 text-zinc-500 hover:text-red-500"
          }`}
          aria-label={wished ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}
          aria-pressed={wished}
        >
          <Heart className={`h-3.5 w-3.5 ${wished ? "fill-current" : ""}`} aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        className="relative block aspect-square w-full overflow-hidden bg-muted text-right"
        onClick={() => (onQuickView ? onQuickView(p) : ctx.onOpenProduct(p))}
        aria-label={`مشاهدهٔ ${p.name}`}
      >
        {p.imageUrl ? (
           
          <img
            src={p.imageUrl}
            alt={p.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted-foreground" aria-hidden="true">
            <ShoppingBag className="h-10 w-10 opacity-40" />
          </span>
        )}
        {discount > 0 ? (
          <span className="absolute right-2 top-2 z-10 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-extrabold text-white shadow-md">
            ٪{toPersianDigits(discount)} تخفیف
          </span>
        ) : null}
        {!p.inStock ? (
          <span className="absolute inset-0 z-[5] flex items-center justify-center bg-black/50 text-sm font-bold text-white">ناموجود</span>
        ) : null}
        <span
          className="pointer-events-none absolute bottom-2 left-2 z-10 translate-y-8 rounded-full px-3 py-1 text-[11px] font-bold text-white opacity-0 shadow-lg transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
          style={{ backgroundColor: accent || "#10b981" }}
        >
          مشاهدهٔ سریع
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <button
          type="button"
          onClick={() => ctx.onOpenProduct(p)}
          className="line-clamp-2 min-h-[2.6em] text-right text-[13px] font-bold leading-snug transition-colors hover:text-emerald-700"
        >
          {p.name}
        </button>

        {showRating !== false && typeof ratingCount === "number" && ratingCount > 0 && typeof ratingAvg === "number" ? (
          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
            {toPersianDigits(ratingAvg)}
            <span className="text-muted-foreground">({toPersianDigits(ratingCount)} نظر)</span>
          </span>
        ) : null}

        {showStock !== false ? (
          <span className={`text-[11px] font-semibold ${p.inStock ? "text-emerald-600" : "text-red-500"}`}>
            {p.inStock ? "موجود در انبار" : "فعلاً ناموجود"}
          </span>
        ) : null}

        {/* R24-4 — نوار پیشرفت موجودی (وقتی انبار شناخته‌شده است) */}
        {p.inStock && p.stockKnown && typeof p.stock === "number" && p.stock > 0 ? (
          <div className="space-y-1" aria-label={`موجودی: ${toPersianDigits(p.stock)} عدد`}>
            <p className={`text-[10px] font-bold ${p.stock <= 5 ? "text-amber-500" : "text-emerald-600"}`}>
              {p.stock <= 5 ? `فقط ${toPersianDigits(p.stock)} عدد باقی مانده!` : `${toPersianDigits(p.stock)} عدد موجود`}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <span
                className="block h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.round((p.stock / Math.max(10, p.stock)) * 100))}%`,
                  backgroundColor: p.stock <= 5 ? "#f59e0b" : accent || "#10b981",
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          {showPrice !== false ? (
            <div className="flex flex-col">
              {discount > 0 ? (
                <span className="text-[11px] text-muted-foreground line-through tabular-nums">{rialToTomanLabel(p.priceRial)}</span>
              ) : null}
              <span className="text-sm font-black tabular-nums text-emerald-700 dark:text-emerald-400">{rialToTomanLabel(price)}</span>
            </div>
          ) : (
            <span />
          )}
          {onAdd ? (
            <button
              type="button"
              onClick={() => onAdd(p)}
              disabled={!p.inStock}
              className="rounded-xl px-3 py-1.5 text-xs font-bold text-white shadow transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: accent || "#10b981" }}
            >
              افزودن
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ هر بلوک ═══════════════ */

type P = Record<string, unknown>;
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
const bool = (v: unknown, d = true) => (typeof v === "boolean" ? v : d);

function HeroBlock({ block, ctx }: { block: SfBlock; ctx: SfBlocksContextValue }) {
  const p = block.props as P;
  const heights: Record<string, string> = { sm: "min-h-[260px]", md: "min-h-[360px]", lg: "min-h-[480px]" };
  const accent = block.style.accent || ctx.shop.accentColor || "#10b981";
  const img = str(p.image, "/banners/general.avif");
  return (
    <section
      className={`relative flex w-full items-center overflow-hidden ${heights[str(p.height, "lg")]}`}
    >
      { }
      <img src={img} alt={str(p.title, ctx.shop.title)} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-zinc-950" style={{ opacity: num(p.overlay, 45) / 100 }} aria-hidden="true" />
      <div className={`relative z-10 mx-auto w-full px-4 sm:px-6 ${MAX_WIDTH_CLS[block.style.maxWidth ?? "wide"]}`}>
        <div className={`max-w-2xl ${str(p.align, "center") === "center" ? "mx-auto text-center" : "text-right"}`}>
          {str(p.badge) ? (
            <span className="mb-4 inline-block rounded-full px-4 py-1 text-xs font-bold text-white shadow-lg" style={{ backgroundColor: accent }}>
              {str(p.badge)}
            </span>
          ) : null}
          <h1 className="text-2xl font-black leading-tight text-white drop-shadow-lg sm:text-4xl">{str(p.title, ctx.shop.title)}</h1>
          {str(p.subtitle) ? (
            <p className="mt-3 text-sm leading-7 text-zinc-100 sm:text-base">{str(p.subtitle)}</p>
          ) : null}
          <div className={`mt-6 flex flex-wrap items-center gap-3 ${str(p.align, "center") === "center" ? "justify-center" : ""}`}>
            {str(p.ctaLabel) ? (
              <a
                href={str(p.ctaLink, "#products")}
                className="rounded-2xl px-6 py-2.5 text-sm font-extrabold text-white shadow-xl transition-transform hover:scale-105"
                style={{ backgroundColor: accent }}
              >
                {str(p.ctaLabel)}
              </a>
            ) : null}
            {str(p.cta2Label) ? (
              <a href={str(p.cta2Link, "#contact")} className="rounded-2xl border-2 border-white/60 px-6 py-2 text-sm font-extrabold text-white backdrop-blur transition-colors hover:bg-white/10">
                {str(p.cta2Label)}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function BannerBlock({ block }: { block: SfBlock }) {
  const p = block.props as P;
  // Task 3-a — اسلایدهای چرخشی: آرایهٔ غیرخالی → کاروسل سینمایی به‌جای بنر تکی
  const slides: BannerSlide[] = (Array.isArray(p.slides) ? p.slides : [])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && str(s.image) !== "")
    .map((s) => ({
      image: str(s.image),
      title: str(s.title) || undefined,
      subtitle: str(s.subtitle) || undefined,
      ctaLabel: str(s.ctaLabel) || undefined,
      ctaLink: str(s.ctaLink) || undefined,
      badge: str(s.badge) || undefined,
    }));
  if (slides.length > 0) {
    return (
      <section className="mx-auto w-full px-4 py-2 sm:px-6">
        <BannerCarousel
          slides={slides}
          className="h-[52dvh] min-h-[320px] rounded-2xl md:h-[62dvh] xl:h-[72dvh]"
        />
      </section>
    );
  }
  const heights: Record<string, string> = { sm: "h-32 sm:h-40", md: "h-48 sm:h-64", lg: "h-64 sm:h-80" };
  const link = str(p.link, "#");
  const img = str(p.image, "/banners/general.avif");
  const external = link.startsWith("http");
  return (
    <section className="mx-auto w-full px-4 py-2 sm:px-6">
      <a
        href={link}
        target={bool(p.openNewTab, false) && external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className={`block overflow-hidden rounded-2xl border shadow-sm ${heights[str(p.height, "md")]}`}
      >
        { }
        <img src={img} alt={str(p.title, "بنر")} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" />
      </a>
    </section>
  );
}

function pickProducts(ctx: SfBlocksContextValue, source: string, category: string, count: number): StorefrontProductDTO[] {
  let list = ctx.products;
  if (source === "category" && category.trim()) {
    list = list.filter((x) => (x.category ?? "").trim() === category.trim());
  } else if (source === "sale") {
    list = list.filter((x) => typeof x.discountPercent === "number" && x.discountPercent > 0);
  }
  return list.slice(0, count);
}

const COL_CLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
};

function ProductsGridBlock({ block, ctx }: { block: SfBlock; ctx: SfBlocksContextValue }) {
  const p = block.props as P;
  const [query, setQuery] = React.useState("");
  const [cat, setCat] = React.useState<string | null>(null);
  const accent = block.style.accent || ctx.shop.accentColor || "#10b981";

  let list = pickProducts(ctx, str(p.source, "all"), str(p.category), num(p.count, 8) * 3);
  if (query.trim()) {
    const q = query.trim();
    list = list.filter((x) => x.name.includes(q));
  }
  if (cat) list = list.filter((x) => (x.category ?? "") === cat);
  list = list.slice(0, num(p.count, 8));

  return (
    <SectionShell block={block}>
      <BlockTitle title={str(p.title, "محصولات")} light={block.style.textColor === "light"} accent={accent} />
      {bool(p.showSearch, true) ? (
        <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو در محصولات…"
            aria-label="جستجو در محصولات"
            className="w-full max-w-xs rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400/40"
          />
          <div className="flex flex-wrap justify-center gap-1.5">
            <button
              type="button"
              onClick={() => setCat(null)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${!cat ? "text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
              style={!cat ? { backgroundColor: accent } : undefined}
            >
              همه
            </button>
            {ctx.categories.slice(0, 6).map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => setCat(c.name)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${cat === c.name ? "text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                style={cat === c.name ? { backgroundColor: accent } : undefined}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">کالایی برای نمایش نیست — از تب «کالاها» اضافه کنید.</p>
      ) : (
        <div className={`grid gap-4 ${COL_CLS[num(p.columns, 4)] ?? COL_CLS[4]}`}>
          {list.map((x) => (
            <SfProductCard
              key={x.id}
              p={x}
              premium={str(p.cardStyle, "premium") === "premium"}
              showPrice={bool(p.showPrice, true)}
              showStock={bool(p.showStock, true)}
              showRating={bool(p.showRating, true)}
              onAdd={ctx.onAddToCart}
              onQuickView={ctx.onOpenProduct}
              accent={accent}
            />
          ))}
        </div>
      )}
    </SectionShell>
  );
}

function CategoriesBlock({ block, ctx }: { block: SfBlock; ctx: SfBlocksContextValue }) {
  const p = block.props as P;
  const accent = block.style.accent || ctx.shop.accentColor || "#10b981";
  const cats = ctx.categories.slice(0, num(p.count, 8));
  const style = str(p.style, "mosaic");

  if (style === "chips") {
    return (
      <SectionShell block={block}>
        <BlockTitle title={str(p.title, "دسته‌بندی‌ها")} light={block.style.textColor === "light"} accent={accent} />
        <div className="flex flex-wrap justify-center gap-2">
          {cats.map((c) => (
            <a key={c.name} href="#products" className="rounded-2xl border bg-card px-4 py-2 text-sm font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              {c.name}
              <span className="mr-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{toPersianDigits(c.count)}</span>
            </a>
          ))}
        </div>
      </SectionShell>
    );
  }

  const mosaicSizes = ["sm:col-span-2 sm:row-span-2", "sm:col-span-2", "", "", "sm:col-span-2", "", "", ""];
  return (
    <SectionShell block={block}>
      <BlockTitle title={str(p.title, "دسته‌بندی‌ها")} light={block.style.textColor === "light"} accent={accent} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cats.map((c, i) => (
          <a
            key={c.name}
            href="#products"
            className={`group relative flex min-h-[96px] flex-col justify-end overflow-hidden rounded-2xl border bg-gradient-to-br from-emerald-50 to-teal-50/50 p-3 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:from-emerald-950/40 dark:to-zinc-900 ${style === "mosaic" ? mosaicSizes[i % mosaicSizes.length] : ""}`}
          >
            <span className="text-sm font-black text-foreground transition-colors group-hover:text-emerald-700">{c.name}</span>
            <span className="text-[11px] text-muted-foreground">{toPersianDigits(c.count)} کالا</span>
            <span className="absolute left-2 top-2 h-2.5 w-2.5 rounded-full opacity-70" style={{ backgroundColor: accent }} aria-hidden="true" />
          </a>
        ))}
      </div>
    </SectionShell>
  );
}

function FeaturedProductsBlock({ block, ctx }: { block: SfBlock; ctx: SfBlocksContextValue }) {
  const p = block.props as P;
  const accent = block.style.accent || ctx.shop.accentColor || "#10b981";
  const list = pickProducts(ctx, str(p.source, "sale"), "", num(p.count, 10));
  return (
    <SectionShell block={block}>
      <BlockTitle title={str(p.title, "پیشنهاد ویژه")} light={block.style.textColor === "light"} accent={accent} />
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">کالای شاخصی برای نمایش نیست.</p>
      ) : (
        <div className="relative -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
          {list.map((x) => (
            <div key={x.id} className="w-[172px] shrink-0 snap-start sm:w-[210px]">
              <SfProductCard p={x} premium showPrice showStock showRating onAdd={ctx.onAddToCart} onQuickView={ctx.onOpenProduct} accent={accent} />
            </div>
          ))}
          <ChevronLeft className="pointer-events-none absolute left-0 top-1/2 hidden h-8 w-8 -translate-y-1/2 text-foreground/30 sm:block" aria-hidden="true" />
        </div>
      )}
    </SectionShell>
  );
}

function TestimonialsBlock({ block }: { block: SfBlock }) {
  const p = block.props as P;
  const items = Array.isArray(p.items) ? (p.items as { name: string; role: string; text: string; rating: number }[]) : [];
  const accent = block.style.accent || "#10b981";
  const light = block.style.textColor === "light";
  return (
    <SectionShell block={block}>
      <BlockTitle title={str(p.title, "نظرات مشتریان")} light={light} accent={accent} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t, i) => (
          <figure key={i} className={`rounded-2xl border p-4 shadow-sm ${light ? "border-white/10 bg-white/5 backdrop-blur" : "bg-card"}`}>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-black text-white" style={{ backgroundColor: accent }}>
                {(t.name || "؟").slice(0, 1)}
              </span>
              <div>
                <figcaption className="text-sm font-bold">{t.name}</figcaption>
                <span className={`text-[11px] ${light ? "text-zinc-400" : "text-muted-foreground"}`}>{t.role}</span>
              </div>
              <span className="mr-auto flex gap-0.5" aria-label={`امتیاز ${t.rating} از ۵`}>
                {Array.from({ length: 5 }, (_, si) => (
                  <Star key={si} className={`h-3.5 w-3.5 ${si < (t.rating ?? 5) ? "fill-amber-400 text-amber-400" : light ? "text-zinc-600" : "text-zinc-300"}`} aria-hidden="true" />
                ))}
              </span>
            </div>
            <blockquote className={`mt-3 text-[13px] leading-6 ${light ? "text-zinc-200" : "text-foreground/80"}`}>&laquo;{t.text}&raquo;</blockquote>
          </figure>
        ))}
      </div>
    </SectionShell>
  );
}

function FaqBlock({ block }: { block: SfBlock }) {
  const p = block.props as P;
  const items = Array.isArray(p.items) ? (p.items as { q: string; a: string }[]) : [];
  const accent = block.style.accent || "#10b981";
  const [open, setOpen] = React.useState(0);
  return (
    <SectionShell block={block}>
      <BlockTitle title={str(p.title, "پرسش‌های متداول")} light={block.style.textColor === "light"} accent={accent} />
      <div className="mx-auto max-w-2xl space-y-2">
        {items.map((f, i) => (
          <div key={i} className={`overflow-hidden rounded-xl border ${block.style.textColor === "light" ? "border-white/10 bg-white/5" : "bg-card"}`}>
            <button
              type="button"
              onClick={() => setOpen(open === i ? -1 : i)}
              className="flex w-full items-center gap-2 px-4 py-3 text-right text-sm font-bold transition-colors hover:bg-muted/40"
              aria-expanded={open === i}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} aria-hidden="true" />
              {f.q}
              <ChevronDown className={`mr-auto h-4 w-4 shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            <div className={`grid transition-all duration-300 ${open === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="overflow-hidden">
                <p className={`px-4 pb-3 pr-8 text-[13px] leading-6 ${block.style.textColor === "light" ? "text-zinc-300" : "text-muted-foreground"}`}>{f.a}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function GalleryBlock({ block }: { block: SfBlock }) {
  const p = block.props as P;
  const images = (Array.isArray(p.images) ? p.images : [])
    .map((x) => (typeof x === "object" && x ? String((x as { src?: unknown }).src ?? "") : ""))
    .filter(Boolean);
  const cols: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-2 sm:grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4", 5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5", 6: "grid-cols-3 sm:grid-cols-6" };
  return (
    <SectionShell block={block}>
      <BlockTitle title={str(p.title, "گالری")} light={block.style.textColor === "light"} accent={block.style.accent || "#10b981"} />
      <div className={`grid ${cols[num(p.columns, 4)] ?? cols[4]}`} style={{ gap: num(p.gap, 2) * 4 }}>
        {images.map((src, i) => (
          <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border shadow-sm">
            { }
            <img src={src} alt={`${str(p.title, "گالری")} — تصویر ${toPersianDigits(i + 1)}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function MapBlock({ block, ctx }: { block: SfBlock; ctx: SfBlocksContextValue }) {
  const p = block.props as P;
  const hasGeo = typeof ctx.shop.lat === "number" && typeof ctx.shop.lng === "number";
  return (
    <SectionShell block={block}>
      <BlockTitle title={str(p.title, "موقعیت ما")} light={block.style.textColor === "light"} accent={block.style.accent || "#10b981"} />
      <div className="overflow-hidden rounded-2xl border shadow-sm" style={{ height: num(p.height, 320) }}>
        {hasGeo ? (
          <InteractiveMap lat={ctx.shop.lat as number} lng={ctx.shop.lng as number} className="h-full w-full" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/50 text-muted-foreground">
            <MapPin className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm font-semibold">مختصات فروشگاه ثبت نشده</p>
            <p className="text-xs">از تب «تنظیمات فروشگاه» موقعیت را روی نقشه انتخاب کنید</p>
          </div>
        )}
      </div>
    </SectionShell>
  );
}

function ContactBlock({ block, ctx }: { block: SfBlock; ctx: SfBlocksContextValue }) {
  const p = block.props as P;
  const light = block.style.textColor === "light";
  const accent = block.style.accent || ctx.shop.accentColor || "#10b981";
  const socials = [
    { href: ctx.shop.socialInstagram, label: "اینستاگرام", Icon: Instagram },
    { href: ctx.shop.socialTelegram, label: "تلگرام", Icon: Send },
    { href: ctx.shop.socialWhatsapp, label: "واتساپ", Icon: MessageCircle },
  ].filter((s) => !!s.href);
  return (
    <SectionShell block={block}>
      <BlockTitle title={str(p.title, "تماس با ما")} light={light} accent={accent} />
      <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
        {bool(p.showPhone, true) && ctx.shop.phone ? (
          <a href={`tel:${ctx.shop.phone}`} className={`flex items-center gap-3 rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 ${light ? "border-white/10 bg-white/5" : "bg-card"}`}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ backgroundColor: accent }}><Phone className="h-5 w-5" aria-hidden="true" /></span>
            <span>
              <span className="block text-xs text-muted-foreground">تلفن تماس</span>
              <span className="text-sm font-black tabular-nums" dir="ltr">{ctx.shop.phone}</span>
            </span>
          </a>
        ) : null}
        {bool(p.showAddress, true) && (ctx.shop.address || ctx.shop.city) ? (
          <div className={`flex items-center gap-3 rounded-2xl border p-4 shadow-sm ${light ? "border-white/10 bg-white/5" : "bg-card"}`}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ backgroundColor: accent }}><MapPin className="h-5 w-5" aria-hidden="true" /></span>
            <span>
              <span className="block text-xs text-muted-foreground">آدرس فروشگاه</span>
              <span className="text-sm font-bold leading-6">{[ctx.shop.city, ctx.shop.address].filter(Boolean).join(" — ")}</span>
            </span>
          </div>
        ) : null}
        <div className={`flex items-center gap-3 rounded-2xl border p-4 shadow-sm ${light ? "border-white/10 bg-white/5" : "bg-card"}`}>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ backgroundColor: accent }}><Clock className="h-5 w-5" aria-hidden="true" /></span>
          <span>
            <span className="block text-xs text-muted-foreground">ساعات پاسخگویی</span>
            <span className="text-sm font-bold leading-6">{str(p.hours, "شنبه تا پنجشنبه ۹ تا ۲۰")}</span>
          </span>
        </div>
        {bool(p.showSocials, true) && socials.length > 0 ? (
          <div className={`flex items-center gap-3 rounded-2xl border p-4 shadow-sm ${light ? "border-white/10 bg-white/5" : "bg-card"}`}>
            <span className="flex gap-2">
              {socials.map(({ href, label, Icon }) => (
                <a key={label} href={href as string} target="_blank" rel="noopener noreferrer" className="flex h-10 w-10 items-center justify-center rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-md" aria-label={label} title={label}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </a>
              ))}
            </span>
            <span>
              <span className="block text-xs text-muted-foreground">شبکه‌های اجتماعی</span>
              <span className="text-sm font-bold">ما را دنبال کنید</span>
            </span>
          </div>
        ) : null}
      </div>
    </SectionShell>
  );
}

function RichTextBlock({ block }: { block: SfBlock }) {
  const p = block.props as P;
  const light = block.style.textColor === "light";
  return (
    <SectionShell block={block}>
      <BlockTitle title={str(p.title, "دربارهٔ ما")} light={light} accent={block.style.accent || "#10b981"} />
      <div
        className={`mx-auto max-w-3xl leading-8 [&_a]:text-emerald-700 [&_a]:underline [&_h3]:font-black [&_h4]:font-bold [&_p]:my-2 [&_ul]:list-disc [&_ul]:pr-6`}
        // FIX(3e-5): sanitizeHtml فقط یک آرگومان می‌گیرد — سقف ۲۰هزار نویسه قبلاً به‌عنوان
        // آرگومان دوم فرستاده می‌شد و بی‌اثر بود؛ حالا قبل از پاک‌سازی بریده می‌شود.
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(str(p.html).slice(0, 20000)) }}
      />
    </SectionShell>
  );
}

function CountdownBlock({ block, ctx }: { block: SfBlock; ctx: SfBlocksContextValue }) {
  const p = block.props as P;
  const accent = block.style.accent || "#f59e0b";
  const endsAt = str(p.endsAt);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const end = endsAt ? new Date(endsAt).getTime() : NaN;
  const remain = Number.isFinite(end) ? Math.max(0, end - now) : 0;
  const expired = Number.isFinite(end) && remain <= 0;
  const d = Math.floor(remain / 86400000);
  const h = Math.floor((remain % 86400000) / 3600000);
  const m = Math.floor((remain % 3600000) / 60000);
  const s = Math.floor((remain % 60000) / 1000);
  const cells = [
    { v: d, l: "روز" }, { v: h, l: "ساعت" }, { v: m, l: "دقیقه" }, { v: s, l: "ثانیه" },
  ];
  const saleProducts = bool(p.showProducts, true)
    ? ctx.products.filter((x) => typeof x.discountPercent === "number" && x.discountPercent > 0).slice(0, num(p.count, 4))
    : [];
  return (
    <SectionShell block={block}>
      <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-amber-200/60 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100 p-6 text-center shadow-lg dark:border-amber-900/40 dark:from-zinc-900 dark:via-zinc-900 dark:to-amber-950/30">
        <h2 className="text-lg font-black text-foreground sm:text-xl">{str(p.title, "پایان جشنوارهٔ تخفیف")}</h2>
        {expired ? (
          <p className="mt-4 rounded-xl bg-red-100 px-4 py-2 text-sm font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">مهلت تخفیف به پایان رسید</p>
        ) : (
          <div className="mt-4 flex justify-center gap-2 sm:gap-3" dir="ltr">
            {cells.map((c) => (
              <div key={c.l} className="min-w-[68px] rounded-2xl bg-zinc-900 px-3 py-2.5 text-white shadow-inner sm:min-w-[80px]">
                <span className="block text-2xl font-black tabular-nums sm:text-3xl">{toPersianDigits(c.v)}</span>
                <span className="text-[10px] font-medium text-zinc-400">{c.l}</span>
              </div>
            ))}
          </div>
        )}
        {str(p.ctaLabel) && !expired ? (
          <a href={str(p.ctaLink, "#products")} className="mt-5 inline-block rounded-2xl px-6 py-2.5 text-sm font-extrabold text-white shadow-lg transition-transform hover:scale-105" style={{ backgroundColor: accent }}>
            {str(p.ctaLabel)}
          </a>
        ) : null}
      </div>
      {saleProducts.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {saleProducts.map((x) => (
            <SfProductCard key={x.id} p={x} premium showPrice showStock onAdd={ctx.onAddToCart} onQuickView={ctx.onOpenProduct} accent={accent} />
          ))}
        </div>
      ) : null}
    </SectionShell>
  );
}

function VideoBlock({ block }: { block: SfBlock }) {
  const p = block.props as P;
  const aspect: Record<string, string> = { "16/9": "aspect-video", "4/3": "aspect-[4/3]", "1/1": "aspect-square" };
  // R26 — لینک معمولی آپارات/یوتیوب خودکار به embed تبدیل می‌شود؛ فایل مستقیم با <video> پخش می‌شود
  const rawUrl = str(p.url);
  const playUrl = rawUrl ? normalizeVideoEmbedUrl(rawUrl) : "";
  const isDirect = playUrl ? isDirectVideoUrl(playUrl) : false;
  const poster = str(p.poster) || undefined;
  return (
    <SectionShell block={block}>
      <BlockTitle title={str(p.title, "ویدیو")} light={block.style.textColor === "light"} accent={block.style.accent || "#10b981"} />
      <div className="mx-auto max-w-3xl">
        <div className={`overflow-hidden rounded-2xl border shadow-lg ${aspect[str(p.aspect, "16/9")]}`}>
          {playUrl && isDirect ? (
            // فایل ویدیویی آپلودی مالک — پخش مستقیم با کاور اختیاری
            <video
              src={playUrl}
              poster={poster}
              className="h-full w-full bg-black"
              controls
              playsInline
              preload="metadata"
            />
          ) : playUrl ? (
            <iframe
              src={playUrl}
              title={str(p.title, "ویدیو")}
              className="h-full w-full"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-sm text-muted-foreground">آدرس ویدیو را از تنظیمات وارد کنید</div>
          )}
        </div>
        {str(p.caption) ? <p className="mt-2 text-center text-xs text-muted-foreground">{str(p.caption)}</p> : null}
      </div>
    </SectionShell>
  );
}

function CtaBannerBlock({ block, ctx }: { block: SfBlock; ctx: SfBlocksContextValue }) {
  const p = block.props as P;
  const tone = str(p.tone, "brand");
  const tones: Record<string, string> = {
    brand: "bg-gradient-to-l from-emerald-600 via-emerald-500 to-teal-500 text-white",
    gold: "bg-gradient-to-l from-amber-600 via-yellow-500 to-amber-400 text-zinc-900",
    dark: "bg-zinc-900 text-white",
    outline: "border-2 border-emerald-500/50 bg-transparent text-foreground",
  };
  return (
    <SectionShell block={block}>
      <div className={`mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 rounded-3xl p-6 shadow-lg sm:p-8 ${tones[tone] ?? tones.brand}`}>
        <div className="max-w-xl">
          <h2 className="text-lg font-black sm:text-xl">{str(p.title, "همین حالا سفارش دهید")}</h2>
          {str(p.text) ? <p className="mt-2 text-sm leading-7 opacity-90">{str(p.text)}</p> : null}
        </div>
        {str(p.ctaLabel) ? (
          <a
            href={str(p.ctaLink, "#products")}
            className={`rounded-2xl px-6 py-2.5 text-sm font-extrabold shadow-lg transition-transform hover:scale-105 ${
              tone === "outline" ? "bg-emerald-600 text-white" : "bg-white text-zinc-900"
            }`}
          >
            {str(p.ctaLabel)}
          </a>
        ) : null}
        {ctx.shop.phone ? (
          <a href={`tel:${ctx.shop.phone}`} className="hidden items-center gap-1.5 text-sm font-bold underline underline-offset-4 sm:flex" dir="ltr">
            <Phone className="h-4 w-4" aria-hidden="true" />
            {ctx.shop.phone}
          </a>
        ) : null}
      </div>
    </SectionShell>
  );
}

function CustomHtmlBlock({ block }: { block: SfBlock }) {
  const p = block.props as P;
  return (
    <SectionShell block={block}>
      {/* FIX(3e-5): همانند RichTextBlock — سقف ۲۰هزار نویسه واقعاً اعمال شود */}
      <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(str(p.html).slice(0, 20000)) }} />
    </SectionShell>
  );
}

function SpacerBlock({ block }: { block: SfBlock }) {
  const p = block.props as P;
  return <div style={{ height: num(p.height, 48) }} aria-hidden="true" />;
}

function DividerBlock({ block }: { block: SfBlock }) {
  const p = block.props as P;
  const style = str(p.style, "fancy");
  const width = num(p.width, 240);
  const accent = block.style.accent || "#f59e0b";
  if (style === "fancy") {
    return (
      <div className="flex items-center justify-center gap-3 py-2" aria-hidden="true">
        <span className="h-px bg-gradient-to-l from-transparent to-amber-400/70" style={{ width: width / 2 }} />
        <span className="h-2 w-2 rotate-45 rounded-[2px]" style={{ backgroundColor: accent }} />
        <span className="h-px bg-gradient-to-r from-transparent to-amber-400/70" style={{ width: width / 2 }} />
      </div>
    );
  }
  return (
    <div className="flex justify-center py-2" aria-hidden="true">
      <span
        className={`${style === "dashed" ? "border-dashed" : ""} border-t-2 border-muted-foreground/25`}
        style={{ width }}
      />
    </div>
  );
}

/* ═══════════════ دیسپچر اصلی یک بلوک ═══════════════ */

export function SfBlockView({ block }: { block: SfBlock }) {
  const ctx = React.useContext(SfBlocksCtx);
  if (!block.visible) return null;
  switch (block.type) {
    case "hero": return <HeroBlock block={block} ctx={ctx} />;
    case "banner": return <BannerBlock block={block} />;
    case "products-grid": return <ProductsGridBlock block={block} ctx={ctx} />;
    case "categories": return <CategoriesBlock block={block} ctx={ctx} />;
    case "featured-products": return <FeaturedProductsBlock block={block} ctx={ctx} />;
    case "testimonials": return <TestimonialsBlock block={block} />;
    case "faq": return <FaqBlock block={block} />;
    case "gallery": return <GalleryBlock block={block} />;
    case "map": return <MapBlock block={block} ctx={ctx} />;
    case "contact": return <ContactBlock block={block} ctx={ctx} />;
    case "rich-text": return <RichTextBlock block={block} />;
    case "countdown-timer": return <CountdownBlock block={block} ctx={ctx} />;
    case "video": return <VideoBlock block={block} />;
    case "cta-banner": return <CtaBannerBlock block={block} ctx={ctx} />;
    case "custom-html": return <CustomHtmlBlock block={block} />;
    case "spacer": return <SpacerBlock block={block} />;
    case "divider": return <DividerBlock block={block} />;
    default: return null;
  }
}

/** نمادهای ویژگی (اشتراکی با قالب‌ها) */
export function SfFeatureIcon({ icon, className }: { icon: string; className?: string }) {
  if (icon === "shield") return <ShieldCheck className={className} aria-hidden="true" />;
  if (icon === "support") return <Headset className={className} aria-hidden="true" />;
  if (icon === "price") return <BadgePercent className={className} aria-hidden="true" />;
  return <Truck className={className} aria-hidden="true" />;
}
