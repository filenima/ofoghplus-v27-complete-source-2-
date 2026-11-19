"use client";

// ═══════════════════════════════════════════════════════════════════
// R24-4 — رندر عمومی صفحهٔ بلوکی فروشگاه
// وقتی مالک با «ویرایشگر بلوکی» صفحه‌اش را منتشر کند، ShopPage به‌جای
// قالب‌های ثابت این کامپوننت را رندر می‌کند: هدر زنده (سبد/جستجو/حساب)
// + بلوک‌های منتشرشده + فوتر — همهٔ تعاملات سبد/پرداخت از ShopPage.
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  ShoppingBag, Search, User, Package, Ticket as TicketIcon, Heart,
  MapPin, Phone, Instagram, Send, MessageCircle, ChevronLeft,
} from "lucide-react";
import { toPersianDigits } from "@/lib/persian";
import { rialToTomanLabel, effectiveUnitPriceRial, type StorefrontProductDTO } from "@/lib/storefront";
import type { SfBlock, SfBlocksDoc } from "@/lib/storefront-blocks";
import { SfBlockView, SfBlocksCtx, useSfWishlist, type SfBlocksContextValue } from "./block-editor/block-views";

export interface BlocksRendererProps {
  shop: SfBlocksContextValue["shop"];
  products: StorefrontProductDTO[];
  categories: { name: string; count: number }[];
  blocks: SfBlock[];
  cartCount: number;
  onAddToCart: (p: StorefrontProductDTO) => void;
  onOpenCart: () => void;
  onOpenAuth: () => void;
  onOpenOrders: () => void;
  onOpenProduct: (p: StorefrontProductDTO) => void;
  onOpenTicket: () => void;
  customerName: string | null;
  announcement?: string | null;
  ticketEnabled?: boolean;
}

export function StorefrontBlocksRenderer({
  shop, products, categories, blocks, cartCount,
  onAddToCart, onOpenCart, onOpenAuth, onOpenOrders, onOpenProduct, onOpenTicket,
  customerName, announcement, ticketEnabled,
}: BlocksRendererProps) {
  const wishlist = useSfWishlist(shop.slug);
  const [search, setSearch] = React.useState("");
  const accent = shop.accentColor || "#10b981";

  const ctxValue = React.useMemo<SfBlocksContextValue>(
    () => ({
      shop,
      products,
      categories,
      onAddToCart,
      onOpenProduct,
      wishlist,
      unitPrice: (p) => effectiveUnitPriceRial(p),
    }),
    [shop, products, categories, onAddToCart, onOpenProduct, wishlist]
  );

  // لنگر #products/#categories/#contact به اولین بلوک همان نوع اشاره می‌کند
  const anchorSeen = new Set<string>();
  const navItems = React.useMemo(() => {
    const items: { label: string; href: string }[] = [];
    for (const b of blocks) {
      if (!b.visible) continue;
      if (b.type === "products-grid" && !items.some((x) => x.href === "#products")) items.push({ label: "محصولات", href: "#products" });
      if (b.type === "categories" && !items.some((x) => x.href === "#categories")) items.push({ label: "دسته‌بندی‌ها", href: "#categories" });
      if (b.type === "faq" && !items.some((x) => x.href === "#faq")) items.push({ label: "سؤالات", href: "#faq" });
      if (b.type === "contact" && !items.some((x) => x.href === "#contact")) items.push({ label: "تماس", href: "#contact" });
      if (b.type === "map" && !items.some((x) => x.href === "#map")) items.push({ label: "موقعیت", href: "#map" });
    }
    // Task 3-g — پیوند «وبلاگ» همیشه در ناوبری هدر و فوتر (لینک داخلی برای
    // ایندکس گوگل + مسیر ورود مشتری از هدر به مقاله‌های مالک)
    return [
      ...items.slice(0, 5),
      { label: "وبلاگ", href: `/shop/${encodeURIComponent(shop.slug)}/blog` },
    ];
  }, [blocks, shop.slug]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const el = document.getElementById("products");
    el?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <SfBlocksCtx.Provider value={ctxValue}>
      <div className="min-h-screen bg-background" dir="rtl">
        {/* نوار اعلان */}
        {announcement ? (
          <div className="px-4 py-2 text-center text-xs font-bold text-white" style={{ backgroundColor: accent }}>
            {announcement}
          </div>
        ) : null}

        {/* هدر چسبان */}
        <header className="sticky top-0 z-40 border-b bg-white/90 shadow-sm backdrop-blur dark:bg-zinc-900/90">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
            <a href="#" className="flex min-w-0 items-center gap-2.5" aria-label={shop.title}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white" style={{ backgroundColor: accent }}>
                {shop.title.slice(0, 1)}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block truncate text-sm font-black">{shop.title}</span>
                <span className="block text-[10px] text-muted-foreground">{shop.city ?? "فروشگاه آنلاین"}</span>
              </span>
            </a>

            <nav className="hidden items-center gap-1 md:flex" aria-label="ناوبری فروشگاه">
              {navItems.map((n) => (
                <a key={n.href} href={n.href} className="rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  {n.label}
                </a>
              ))}
            </nav>

            <form onSubmit={submitSearch} className="relative mr-auto hidden w-52 lg:block" role="search">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجو در محصولات…"
                aria-label="جستجو در محصولات فروشگاه"
                className="w-full rounded-full border border-border bg-background py-2 pr-9 pl-3 text-xs outline-none focus:ring-2 focus:ring-emerald-400/40"
              />
            </form>

            <div className="mr-auto flex items-center gap-1 lg:mr-0">
              {ticketEnabled ? (
                <button type="button" onClick={onOpenTicket} className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="پشتیبانی و تیکت" title="پشتیبانی">
                  <TicketIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              ) : null}
              {wishlist.count > 0 ? (
                <span className="relative rounded-full p-2 text-red-500" title={`${toPersianDigits(wishlist.count)} کالای علاقه‌مندی`}>
                  <Heart className="h-5 w-5 fill-current" aria-hidden="true" />
                  <span className="absolute -left-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white">
                    {toPersianDigits(wishlist.count)}
                  </span>
                </span>
              ) : null}
              <button type="button" onClick={customerName ? onOpenOrders : onOpenAuth} className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={customerName ? "سفارش‌های من" : "ورود / ثبت‌نام"} title={customerName ? `حساب ${customerName}` : "ورود / ثبت‌نام"}>
                {customerName ? <Package className="h-5 w-5" aria-hidden="true" /> : <User className="h-5 w-5" aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={onOpenCart}
                className="relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold text-white shadow-md transition-transform hover:scale-105"
                style={{ backgroundColor: accent }}
                aria-label={`سبد خرید — ${toPersianDigits(cartCount)} کالا`}
              >
                <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">سبد خرید</span>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1 tabular-nums">
                  {toPersianDigits(cartCount)}
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* بلوک‌های منتشرشده */}
        <main>
          {blocks.map((b) => {
            // FIX(3e-4): لنگر بلوک «شبکهٔ محصولات» باید id="products" باشد، نه
            // "products-grid" — همهٔ لینک‌های #products (ناوبری هدر/فوتر، دکمهٔ CTA
            // بنر و هیرو، کارت دسته‌ها و ارسال جستجو) به همین لنگر اشاره می‌کنند
            // و با id=products-grid هیچ‌کدام اسکرول نمی‌کردند (مثل قالب‌های کلاسیک
            // که sectionId="products" دارند).
            const ANCHOR_BY_TYPE: Record<string, string> = {
              "products-grid": "products",
              "featured-products": "featured",
            };
            const anchorId = ANCHOR_BY_TYPE[b.type] ?? b.type;
            const anchor = anchorSeen.has(b.type) ? undefined : anchorId;
            anchorSeen.add(b.type);
            return (
              <div key={b.id} id={anchor} className="scroll-mt-20">
                <SfBlockView block={b} />
              </div>
            );
          })}
        </main>

        {/* فوتر */}
        <footer className="mt-10 border-t bg-zinc-50 dark:bg-zinc-900">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:grid-cols-3 sm:px-6">
            <div>
              <p className="flex items-center gap-2 text-sm font-black">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: accent }}>
                  {shop.title.slice(0, 1)}
                </span>
                {shop.title}
              </p>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                فروشگاه آنلاین {shop.title} — سفارش آنلاین، پرداخت امن و ارسال سریع.
              </p>
            </div>
            <div className="text-xs leading-7 text-muted-foreground">
              <p className="mb-1 font-black text-foreground">راه‌های ارتباطی</p>
              {shop.phone ? (
                <p className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                  <a href={`tel:${shop.phone}`} className="hover:underline" dir="ltr">{shop.phone}</a>
                </p>
              ) : null}
              {shop.address || shop.city ? (
                <p className="flex items-start gap-1.5">
                  <MapPin className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {[shop.city, shop.address].filter(Boolean).join(" — ")}
                </p>
              ) : null}
              <p className="mt-2 flex items-center gap-2">
                {[
                  { href: shop.socialInstagram, Icon: Instagram, label: "اینستاگرام" },
                  { href: shop.socialTelegram, Icon: Send, label: "تلگرام" },
                  { href: shop.socialWhatsapp, Icon: MessageCircle, label: "واتساپ" },
                ]
                  .filter((s) => !!s.href)
                  .map(({ href, Icon, label }) => (
                    <a key={label} href={href as string} target="_blank" rel="noopener noreferrer" className="rounded-lg border p-1.5 transition-colors hover:bg-muted" aria-label={label} title={label}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </a>
                  ))}
              </p>
            </div>
            <nav className="text-xs leading-7 text-muted-foreground" aria-label="پیوندهای فوتر">
              <p className="mb-1 font-black text-foreground">دسترسی سریع</p>
              {navItems.map((n) => (
                <a key={n.href} href={n.href} className="flex items-center gap-1 hover:text-foreground">
                  <ChevronLeft className="h-3 w-3" aria-hidden="true" />
                  {n.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="border-t py-3 text-center text-[10px] text-muted-foreground">
            © {toPersianDigits(new Date().getFullYear())} {shop.title} — سامانهٔ فروشگاه آنلاین «افق پلاس»
          </div>
        </footer>
      </div>
    </SfBlocksCtx.Provider>
  );
}
