"use client";

// ═══════════════════════════════════════════════════════════════════
// AURORA — قالب فروشگاه آنلاین افق پلاس
// پورت وفادار طراحی «دیجی‌زلوکس v5» (سیستم AURORA) به ری‌اکت.
// کاستومایز خودکار بر اساس پروفایل کسب‌وکار (businessType + accent).
//
// ترفندهای روانشناسی دیجیتال مارکتینگ اعمال‌شده (صادقانه — بدون داده فیک):
//  ۱. فوریت (Urgency)      → شمارش معکوس واقعی تا پایان روز در پیشنهادها
//  ۲. لنگر قیمتی (Anchoring)→ قیمت قبل خط‌خورده فقط با تخفیف واقعی مالک
//  ۳. کمیابی (Scarcity)     → وضعیت واقعی موجودی + «موجودی محدود» فقط برای انبار کم
//  ۴. مدرک اجتماعی (Social Proof) → آمار واقعی فروشگاه + پاپ‌آپ سفارش‌های واقعی تأییدشده
//  ۵. اعتماد (Trust)        → بج‌های ضمانت/پرداخت امن/پشتیبانی + نقشه + آدرس
//  ۶. FOMO                  → صحنهٔ قرمز «پیشنهاد شگفت‌انگیز» + حلقهٔ پالس
//  ۷. اثر شروع (Primacy)    → هیرو سینمایی با کلمات پلکانی و aurora mesh
//  ۸. اثر پایان (Peak-End)  → جشن موفقیت سفارش (در shop-page)
//  ۹. کاهش اصطکاک           → افزودن به سبد بدون صفحه‌آرایی + CTA شناور تماس
// ۱۰. تعهد/سازگاری          → حساب مشتری + تاریخچهٔ سفارش
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  ShoppingBag, Phone, MapPin, Instagram, Send, MessageCircle, Package, Star,
  Truck, ShieldCheck, Store as StoreIcon, Search, X, Ticket, Sparkles,
  ChevronLeft, Heart, BadgePercent, Headset, Sun, Moon, ChevronRight,
  LayoutGrid, Home, Clock, CheckCircle2, Users, Layers, PhoneCall, ArrowLeft,
  Flame, ShoppingBasket, BadgeCheck, Wallet, Pencil, Clapperboard,
} from "lucide-react";
import "./aurora.css";
import { usePerfMode } from "@/lib/perf-mode";
import { toPersianDigits } from "@/lib/persian";
import {
  osmLinkUrl,
  type StorefrontProductDTO,
} from "@/lib/storefront";
import {
  type StorefrontContent, getBusinessType, rialToCurrencyLabel,
  type StorefrontCurrencyCode,
} from "@/lib/storefront-wizard";
import type { TemplateV2Props, ShopDTOV2 } from "@/components/storefront/templates-v2";
import type { StorefrontDiscovery } from "@/components/storefront/use-store-products";
import { InteractiveMap } from "../interactive-map";

/* ═══════════════ ابزارهای محلی ═══════════════ */

/** هش پایدار از رشته — برای انتخاب دترمینیستیک (بدون رندم هر رفرش) */
function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

/** ریویل اسکرول با IntersectionObserver — فقط opacity/transform */
function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = React.useRef<T | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
    );
    el.classList.add("rv-host");
    el.querySelectorAll(".rv:not(.in)").forEach((n) => io.observe(n));
    if (el.classList.contains("rv")) io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

/** شمارش معکوس تا پایان روز (فوریت صادقانه — هر روز تمدید واقعی) */
function useMidnightCountdown() {
  const [left, setLeft] = React.useState<{ h: number; m: number; s: number } | null>(null);
  React.useEffect(() => {
    const tick = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const diff = Math.max(0, end.getTime() - now.getTime());
      setLeft({
        h: Math.floor(diff / 3_600_000),
        m: Math.floor((diff % 3_600_000) / 60_000),
        s: Math.floor((diff % 60_000) / 1000),
      });
    };
    tick();
    // R28-12 — در تب مخفی ثانیه‌شمار متوقف می‌ماند (موبایل ضعیف: رندر صفر)؛
    // مقدار از Date.now محاسبه می‌شود و با بازگشت به تب بلافاصله درست است
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      tick();
    }, 1000);
    return () => clearInterval(t);
  }, []);
  return left;
}

/** دادهٔ پاپ‌آپ مدرک اجتماعی — فقط سفارش‌های واقعی تأییدشده */
interface SocialProofItem { name: string; product: string; minutesAgo: number }
function useSocialProof(slug: string) {
  const [items, setItems] = React.useState<SocialProofItem[]>([]);
  React.useEffect(() => {
    let alive = true;
    fetch(`/api/storefront/${encodeURIComponent(slug)}/social-proof`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.success && Array.isArray(j.items)) setItems(j.items); })
      .catch(() => {});
    return () => { alive = false; };
  }, [slug]);
  return items;
}

/* ═══════════════ v20-C: قاب ویرایش بصری (همان الگوی templates-v2) ═══════════════ */

/**
 * در حالت ویرایش مالک (editMode) هر بخش دکمهٔ «ویرایش» + قاب خط‌چین کهربایی می‌گیرد
 * که با کلیک onEditSection(sectionId) را صدا می‌زند؛ در حالت عادی DOM هیچ تغییری
 * نمی‌کند (طراحی سایت دست‌نخورده می‌ماند).
 */
function EditableShell({
  sectionId,
  editMode,
  onEditSection,
  children,
  className,
  label,
  as = "section",
  ...rest
}: {
  sectionId: string;
  editMode?: boolean;
  onEditSection?: (id: string) => void;
  children: React.ReactNode;
  className?: string;
  label: string;
  as?: "section" | "div" | "footer" | "header";
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">): React.JSX.Element {
  const Tag = as;
  if (!editMode) {
    return (
      <Tag className={className} {...rest}>
        {children}
      </Tag>
    );
  }
  return (
    <Tag className={`relative ${className ?? ""}`} data-edit-section={sectionId} {...rest}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEditSection?.(sectionId);
        }}
        className="absolute top-2 left-2 z-30 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg transition-transform hover:scale-105"
        aria-label={`ویرایش ${label}`}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        ویرایش {label}
      </button>
      <div className="rounded-2xl outline-2 outline-dashed outline-amber-400/70 outline-offset-4">{children}</div>
    </Tag>
  );
}

/* ═══════════════ کارت محصول AURORA ═══════════════ */

function AuroraProductCard({
  p, currency, usd, cny, discountActive, discountPercent, onAdd, onOpen, rvd,
}: {
  p: StorefrontProductDTO;
  currency: StorefrontCurrencyCode;
  usd?: number | null;
  cny?: number | null;
  discountActive?: boolean;
  discountPercent?: number | null;
  onAdd: (p: StorefrontProductDTO) => void;
  onOpen: (p: StorefrontProductDTO) => void;
  rvd?: string;
}) {
  // v20-C — تخفیف اختصاصی کالا (StorefrontProductMeta) بر تخفیف کد فروشگاه اولویت دارد
  const pm = p as StorefrontProductDTO & { discountPercent?: number | null; displayPriceRial?: string };
  const pDiscount = pm.discountPercent && pm.discountPercent > 0 ? pm.discountPercent : null;
  const shopDiscount = discountActive && discountPercent && discountPercent > 0 ? discountPercent : null;
  const effDiscount = pDiscount ?? shopDiscount;
  const hasRealDiscount = !!effDiscount;
  const nowLabel = rialToCurrencyLabel(pDiscount ? (pm.displayPriceRial ?? p.priceRial) : p.priceRial, currency, usd, cny);
  const oldPrice = pDiscount
    ? rialToCurrencyLabel(p.priceRial, currency, usd, cny)
    : shopDiscount
      ? rialToCurrencyLabel(String(Math.round((Number(p.priceRial) * 100) / (100 - shopDiscount))), currency, usd, cny)
      : null;
  return (
    <article className={`a-product-card${p.inStock ? "" : " out"}`} style={rvd ? ({ "--rvd": rvd } as React.CSSProperties) : undefined}>
      <div className="a-pc-media" onClick={() => onOpen(p)} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onOpen(p)} aria-label={`مشاهدهٔ ${p.name}`}>
        {p.imageUrl ? (
          <img src={p.imageUrl} alt={p.name} loading="lazy" decoding="async" />
        ) : (
          <span className="a-pc-ph" aria-hidden="true"><Package className="h-10 w-10" /></span>
        )}
        <span className="a-pc-badges">
          {pDiscount ? (
            <span className="a-badge a-badge-off" style={{ background: "linear-gradient(135deg, #0f766e, #14b8a6)" }}>
              {toPersianDigits(pDiscount)}٪ تخفیف
            </span>
          ) : hasRealDiscount ? (
            <span className="a-badge a-badge-off">{toPersianDigits(effDiscount!)}٪ تخفیف</span>
          ) : null}
          {!p.inStock ? <span className="a-badge a-badge-dark">ناموجود</span> : null}
        </span>
        <span className="a-pc-quick">مشاهدهٔ سریع</span>
      </div>
      <div className="a-pc-body">
        {p.category ? <span className="a-pc-cat">{p.category}</span> : null}
        <h3 className="a-pc-title" onClick={() => onOpen(p)}>{p.name}</h3>
        <div className="a-pc-rate">
          <span className="a-badge a-badge-green"><CheckCircle2 aria-hidden="true" />{p.inStock ? "موجود" : "اتاق تمام"}</span>
          {(() => {
            // Task 4 — امتیاز نظرات تأییدشده روی کارت (اگر وجود داشته باشد)
            const rc = (p as StorefrontProductDTO & { ratingCount?: number; ratingAvg?: number }).ratingCount;
            const ra = (p as StorefrontProductDTO & { ratingAvg?: number }).ratingAvg;
            if (typeof rc !== "number" || rc <= 0 || typeof ra !== "number") return null;
            return (
              <span className="a-badge a-badge-rate" title={`${toPersianDigits(ra)} از ۵ — ${toPersianDigits(rc)} نظر تأییدشده`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ color: "#fbbf24" }}>
                  <path d="M12 2l2.9 6.26 6.6.57-5 4.36 1.5 6.45L12 16.9l-6 3.74 1.5-6.45-5-4.36 6.6-.57L12 2z" />
                </svg>
                {toPersianDigits(ra)} ({toPersianDigits(rc)})
              </span>
            );
          })()}
        </div>
        <div className="a-pc-price-row">
          <span className="a-dl-price">
            {oldPrice ? <span className="a-pc-old">{oldPrice}</span> : null}
            <span className="a-pc-price">{nowLabel}</span>
          </span>
          <button type="button" className="a-pc-add" disabled={!p.inStock}
            onClick={() => onAdd(p)} aria-label={`افزودن ${p.name} به سبد`}>
            <ShoppingBag className="h-[19px] w-[19px]" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

/* ═══════════════ قالب اصلی ═══════════════ */

export function AuroraTemplate(props: TemplateV2Props) {
  const {
    shop, products, content, bannerSrc, cartCount, qtyOf,
    onAddToCart, onOpenCart, onOpenAuth, onOpenOrders, onOpenProduct, onOpenTicket,
    customerName, discovery, currency, usdRateToman, cnyRateToman,
    editMode, onEditSection,
  } = props;

  const biz = getBusinessType(shop.businessType ?? "general");
  const { perfMode } = usePerfMode();

  // R26 — رنگ لهجهٔ ویرایش‌شده در شیت هدر (content.header.accentColor) بر رنگ
  // فروشگاه (shop.accentColor از پنل) اولویت دارد؛ خالی = رنگ پیش‌فرض قالب.
  const accentHex = content.header.accentColor || shop.accentColor || null;
  // R26 — نمایش/عدم نمایش نوار جستجو در هدر (شیت «هدر و منو»)
  const showSearch = content.header.showSearch !== false;
  // R26 — ستون‌های لینک دلخواه فوتر (شیت «فوتر») و گزاره‌های نوار اعتماد
  const footerColumns = (content.footer.columns ?? [])
    .filter((c) => c.title.trim() || c.links.some((l) => l.label.trim()))
    .slice(0, 3);
  const trustBadges = (content.trustNotes ?? []).filter((t) => t.trim()).slice(0, 5);

  /* دارک‌مود (پایدار per-slug) — R26: پیش‌فرض سایت‌های جدید «روشن» است؛
     فقط اگر بازدیدکننده قبلاً صریحاً تیره را انتخاب کرده باشد تیره می‌شود */
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(`sfAuroraTheme:${shop.slug}`);
      if (saved === "dark") setDark(true);
      else setDark(false);
    } catch { /* ignore */ }
  }, [shop.slug]);
  const toggleTheme = React.useCallback(() => {
    setDark((d) => {
      const next = !d;
      try { localStorage.setItem(`sfAuroraTheme:${shop.slug}`, next ? "dark" : "light"); } catch { /* ignore */ }
      return next;
    });
  }, [shop.slug]);

  /* ریویل */
  const rootRef = useReveal<HTMLDivElement>();

  /* ویترین پایدار (صفحهٔ اول SSR — برای هیرو/پیشنهادها/کاروسل) */
  const showcase = React.useRef<StorefrontProductDTO[] | null>(null);
  if (showcase.current === null) showcase.current = products;
  const vitrine = showcase.current ?? [];

  /* هدر اسکرول‌شده */
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* پاپ سبد */
  const [cartPop, setCartPop] = React.useState(false);
  const prevCount = React.useRef(cartCount);
  React.useEffect(() => {
    if (cartCount > prevCount.current) {
      setCartPop(true);
      const t = setTimeout(() => setCartPop(false), 600);
      prevCount.current = cartCount;
      return () => clearTimeout(t);
    }
    prevCount.current = cartCount;
  }, [cartCount]);

  /* هیرو — اسلایدها */
  const [slide, setSlide] = React.useState(0);
  const heroSlides = React.useMemo(() => {
    const slides: { key: string; img: string | null; bg: string; kicker: string; titleWords: string[]; gradTo?: number; sub: string; cta: { label: string; action: () => void }[] }[] = [];
    // Task 3-a — اسلایدهای چندگانهٔ مالک (multi-slide): هر اسلاید با متن خودش;
    // متن‌های خالی اسلاید اول از متن‌های اصلی بنر به ارث می‌رسند.
    const ownerSlides = content.banner.slides ?? [];
    const bgPool = ["hb-1", "hb-2", "hb-4"];
    ownerSlides.slice(0, 8).forEach((s, i) => {
      if (!s.image) return;
      const title = s.title?.trim() || (i === 0 ? content.banner.title : "") || shop.title;
      slides.push({
        key: `owner-${i}`,
        img: s.image,
        bg: bgPool[i % bgPool.length],
        kicker: s.badge?.trim() || (i === 0 ? content.banner.badge : "") || biz?.heroBadge || "فروشگاه معتبر",
        titleWords: title.split(" "),
        gradTo: Math.min(2, title.split(" ").length - 1),
        sub: s.subtitle?.trim() || (i === 0 ? content.banner.subtitle : "") || biz?.heroSubtitle || "کالای اصل، قیمت منصفانه، ارسال سریع",
        cta: [
          {
            label: s.ctaLabel?.trim() || (i === 0 ? content.banner.ctaLabel : "") || biz?.ctaLabel || "مشاهدهٔ محصولات",
            action: () => {
              // لینک اسلاید: لنگر داخلی → اسکرول نرم؛ https کامل → تب جدید
              const link = s.ctaLink?.trim() || (i === 0 ? content.banner.ctaLink : "") || "#products";
              if (/^https?:\/\//i.test(link)) window.open(link, "_blank", "noopener,noreferrer");
              else scrollToId(link.replace(/^#/, "") || "products");
            },
          },
        ],
      });
    });
    if (slides.length > 0) return slides;
    // ۱) بنر مالک/سینمایی (متن صاحب فروشگاه)
    slides.push({
      key: "owner",
      img: bannerSrc ?? null,
      bg: "hb-1",
      kicker: content.banner.badge || (biz?.heroBadge ?? "فروشگاه معتبر"),
      titleWords: (content.banner.title || (biz?.heroTitle ?? "خرید مطمئن از {name}").replace("{name}", shop.title)).split(" "),
      gradTo: Math.min(2, (content.banner.title || "").split(" ").length - 1),
      sub: content.banner.subtitle || (biz?.heroSubtitle ?? "کالای اصل، قیمت منصفانه، ارسال سریع"),
      cta: [{ label: content.banner.ctaLabel || biz?.ctaLabel || "مشاهدهٔ محصولات", action: () => scrollToId("products") }],
    });
    // ۲) اسلاید خودکار از جنس کسب‌وکار
    slides.push({
      key: "biz",
      img: null,
      bg: "hb-2",
      kicker: "چرا ما؟",
      titleWords: (biz?.heroTitle ?? "خرید مطمئن از {name}").replace("{name}", shop.title).split(" "),
      gradTo: 1,
      sub: biz?.heroSubtitle ?? "همهٔ کالاها با ضمانت اصالت و پشتیبانی واقعی",
      cta: [
        { label: "دسته‌بندی‌ها", action: () => scrollToId("cats") },
        { label: "دربارهٔ ما", action: () => scrollToId("about") },
      ],
    });
    // ۳) اسلاید سفارش آسان (فوریت + کاهش اصطکاک)
    slides.push({
      key: "easy",
      img: null,
      bg: "hb-4",
      kicker: "سفارش در ۳۰ ثانیه",
      titleWords: `سفارش آنلاین از ${shop.title}`.split(" "),
      gradTo: 3,
      sub: "سبد بچینید، کارت‌به‌کارت بپردازید، رسید را بفرستید — فاکتور رسمی همان لحظه صادر می‌شود.",
      cta: [{ label: "همین حالا شروع کنید", action: () => scrollToId("products") }],
    });
    return slides;
  }, [bannerSrc, content, biz, shop.title]);

  React.useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % heroSlides.length), 6500);
    return () => clearInterval(t);
  }, [heroSlides.length]);

  // Task 3-a — اگر تعداد اسلاید کم شود (حذف در حالت ویرایش)، ایندکس به محدوده برمی‌گردد
  React.useEffect(() => {
    if (slide >= heroSlides.length) setSlide(0);
  }, [heroSlides.length, slide]);

  /* پیشنهاد شگفت‌انگیز — انتخاب هوشمند: کالاهای موجود با عکس اول */
  const deals = React.useMemo(() => {
    const inStock = vitrine.filter((p) => p.inStock);
    const withImg = inStock.filter((p) => p.imageUrl);
    const pool = (withImg.length >= 4 ? withImg : inStock).slice(0, 8);
    return pool;
  }, [vitrine]);

  const countdown = useMidnightCountdown();
  const socialProof = useSocialProof(shop.slug);
  const [spIndex, setSpIndex] = React.useState(0);
  const [spVisible, setSpVisible] = React.useState(false);
  React.useEffect(() => {
    if (socialProof.length === 0) return;
    let i = 0;
    const cycle = () => {
      setSpIndex(i % socialProof.length);
      setSpVisible(true);
      setTimeout(() => setSpVisible(false), 5200);
      i++;
    };
    const start = setTimeout(cycle, 7000);
    const t = setInterval(cycle, 21000);
    return () => { clearTimeout(start); clearInterval(t); };
  }, [socialProof.length]);

  /* دسته‌ها */
  const categories = discovery.categories ?? [];
  const discountActive = !!(shop as ShopDTOV2 & { discountActive?: boolean }).discountActive;
  const discountPercent = (shop as ShopDTOV2 & { discountPercent?: number | null }).discountPercent ?? null;

  /* جستجو — ساجست */
  const [suggestOpen, setSuggestOpen] = React.useState(false);
  const searchVal = discovery.searchQuery;
  const suggestions = React.useMemo(() => {
    if (!searchVal.trim()) return [];
    const q = searchVal.trim().toLowerCase();
    return vitrine.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 5);
  }, [searchVal, vitrine]);

  const scrollToId = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* آیکون دسته‌ها بر اساس نوع کسب‌وکار */
  const catIcon = (i: number) => [LayoutGrid, Layers, Package, ShoppingBasket][i % 4];
  const CC_ACCENTS = ["#ef394e", "#7c3aed", "#0d9668", "#d97706"];

  const stats = content.stats ?? [];

  return (
    <div
      ref={rootRef}
      className={`sf-aurora${dark ? "" : ""}`}
      data-sf-theme={dark ? "dark" : "light"}
      dir="rtl"
      style={accentHex ? ({
        "--primary": accentHex,
        "--primary-2": accentHex,
        "--primary-soft": `color-mix(in srgb, ${accentHex} 10%, #fff)`,
        "--primary-softer": `color-mix(in srgb, ${accentHex} 5%, #fff)`,
        "--grad": `linear-gradient(135deg, ${accentHex} 0%, color-mix(in srgb, ${accentHex} 70%, #ff6048) 100%)`,
      } as React.CSSProperties) : undefined}
    >
      {/* ═══ نوار اعلان متحرک ═══ */}
      {content.announcement ? (
        <EditableShell as="div" sectionId="announcement" label="نوار اعلان" editMode={editMode} onEditSection={onEditSection} className="a-announce" role="status">
          <div className="a-announce-track">
            {[0, 1].map((dup) => (
              <React.Fragment key={dup}>
                <span className="a-announce-item"><Sparkles aria-hidden="true" />{content.announcement}</span>
                <span className="a-announce-item"><Truck aria-hidden="true" />ارسال سریع به سراسر کشور</span>
                <span className="a-announce-item"><ShieldCheck aria-hidden="true" />ضمانت اصالت کالا</span>
                <span className="a-announce-item"><Headset aria-hidden="true" />پشتیبانی پاسخگو</span>
              </React.Fragment>
            ))}
          </div>
        </EditableShell>
      ) : null}

      {/* ═══ هدر شیشه‌ای ═══ */}
      <header className={`a-header${scrolled ? " scrolled" : ""}`} style={{ position: "relative" }}>
        {editMode ? (
          <button
            type="button"
            onClick={() => onEditSection?.("header")}
            className="absolute top-2 left-2 z-50 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg transition-transform hover:scale-105"
            aria-label="ویرایش هدر و منو"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            ویرایش هدر و منو
          </button>
        ) : null}
        <div className="a-container-wide a-header-in">
          <a className="a-logo" href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            {content.header.logoUrl ? (
              // لوگوی آپلودی مالک — دامنه نامشخص
              <img src={content.header.logoUrl} alt={`لوگوی ${shop.title}`} className="h-9 w-9 rounded-xl object-cover" />
            ) : (
              <span className="a-logo-ic"><StoreIcon className="h-5 w-5" aria-hidden="true" /></span>
            )}
            <span className="a-logo-txt">
              <b>{shop.title}</b>
              <span>{content.header.tagline || "فروشگاه آنلاین رسمی"}</span>
            </span>
          </a>

          {/* جستجو با ساجست — R26: با کلید «نمایش نوار جستجو» قابل مخفی‌کردن است */}
          {showSearch ? (
          <div className="a-search" role="search">
            <Search className="a-s-ic h-4 w-4" aria-hidden="true" />
            <input
              type="search"
              value={searchVal}
              onChange={(e) => { discovery.onSearchQueryChange(e.target.value); setSuggestOpen(true); }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 180)}
              placeholder={`جستجو در ${toPersianDigits(vitrine.length)} کالای ${shop.title}…`}
              aria-label="جستجوی محصولات"
            />
            <button type="button" className="a-s-go" onClick={() => scrollToId("products")}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />جستجو
            </button>
            {suggestOpen && suggestions.length > 0 ? (
              <div className="a-suggest-open absolute top-[calc(100%+10px)] inset-x-0 z-40 rounded-2xl border bg-[var(--surface)] shadow-2xl overflow-hidden">
                {suggestions.map((s) => (
                  <button key={s.id} type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-right hover:bg-[var(--surface-3)] transition-colors"
                    onMouseDown={() => { discovery.onSearchQueryChange(s.name); scrollToId("products"); }}>
                    {s.imageUrl ? <img src={s.imageUrl} alt="" className="h-11 w-11 rounded-xl object-cover flex-none" loading="lazy" /> : <span className="h-11 w-11 rounded-xl bg-[var(--surface-3)] flex items-center justify-center flex-none"><Package className="h-5 w-5 text-[var(--muted)]" /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{s.name}</span>
                      {s.category ? <span className="block text-xs text-[var(--muted-2)]">{s.category}</span> : null}
                    </span>
                    <span className="text-sm font-bold text-[var(--primary)] flex-none">{rialToCurrencyLabel(s.priceRial, currency, usdRateToman, cnyRateToman)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          ) : null}

          <div className="a-header-actions">
            {/* دارک‌مود */}
            <button type="button" className="a-icon-btn a-theme-toggle" onClick={toggleTheme} aria-label={dark ? "حالت روشن" : "حالت تاریک"}>
              <span className="a-tt-wrap">
                <Sun className="a-tt-sun h-5 w-5" aria-hidden="true" />
                <Moon className="a-tt-moon h-5 w-5" aria-hidden="true" />
              </span>
            </button>
            {shop.ticketEnabled ? (
              <button type="button" className="a-icon-btn" onClick={onOpenTicket} aria-label="پشتیبانی">
                <Ticket className="h-5 w-5" aria-hidden="true" />
              </button>
            ) : null}
            <button type="button" className="a-user-chip" onClick={customerName ? onOpenOrders : onOpenAuth}>
              <span className="a-av">{customerName ? customerName.trim().charAt(0) : "؟"}</span>
              <span className="hidden sm:inline">{customerName ?? "ورود / ثبت‌نام"}</span>
            </button>
            <button type="button" className={`a-cart-btn${cartPop ? " pop" : ""}`} onClick={onOpenCart} aria-label={`سبد خرید — ${toPersianDigits(cartCount)} قلم`}>
              <ShoppingBag className="a-cart-svg h-5 w-5" aria-hidden="true" />
              {cartCount > 0 ? <span className={`a-dot${cartPop ? " pop" : ""}`}>{toPersianDigits(cartCount)}</span> : null}
            </button>
          </div>
        </div>

        {/* نوار دسته‌ها + لینک‌های دلخواه منوی مالک (R26) */}
        <nav className="a-nav-strip" aria-label="دسته‌بندی‌ها">
          <div className="a-container-wide a-nav-strip-in">
            <button type="button" className={!discovery.selectedCategory ? "on" : ""}
              onClick={() => { discovery.onSelectCategory(null); scrollToId("products"); }}>
              همهٔ محصولات
            </button>
            {categories.slice(0, 10).map((c) => (
              <button key={c.name} type="button" className={discovery.selectedCategory === c.name ? "on" : ""}
                onClick={() => { discovery.onSelectCategory(c.name); scrollToId("products"); }}>
                {c.name}
                <span className="text-[10px] opacity-60">{toPersianDigits(c.count)}</span>
              </button>
            ))}
            {(content.header.links ?? []).filter((l) => l.label.trim()).map((l, i) => (
              <a key={`${l.label}-${i}`} href={l.href || "#"} className="a-nav-link">
                {l.label}
              </a>
            ))}
          </div>
        </nav>
      </header>

      <main id="main">
        {/* ═══ هیرو سینمایی ═══ */}
        <EditableShell sectionId="banner" label="بنر اصلی" editMode={editMode} onEditSection={onEditSection} className="a-container-wide" id="top" aria-label="اسلایدر اصلی">
          <div className="a-hero">
            <div className="a-hero-slides">
              {heroSlides.map((s, i) => (
                <div key={s.key} className={`a-hero-slide${i === slide ? " on" : ""}`}
                  aria-hidden={i !== slide}>
                  <div className="a-hero-media">
                    {s.img ? (
                      <img src={s.img} alt="" fetchPriority={i === 0 ? "high" : "low"} />
                    ) : null}
                    {!s.img ? <div className={`a-hero-bg ${s.bg}`} /> : null}
                    <div className="a-hero-aurora" aria-hidden="true"><i className="au-1" /><i className="au-2" /><i className="au-3" /></div>
                    <div className="a-hero-dots-grid" aria-hidden="true" />
                    <div className="a-hero-scrim" />
                  </div>
                  <div className="a-hero-floats" aria-hidden="true">
                    <span className="a-hero-float hf-p"><Truck aria-hidden="true" />ارسال سریع</span>
                    <span className="a-hero-float hf-p"><BadgeCheck aria-hidden="true" />ضمانت اصالت</span>
                    <span className="a-hero-float hf-p"><Wallet aria-hidden="true" />پرداخت امن</span>
                  </div>
                  <div className="a-hero-content">
                    <span className="a-hero-kicker"><Sparkles aria-hidden="true" />{s.kicker}</span>
                    {/* FIX(SEO-3c باگ ۴ — H1 مفقود): عنوان هیروی قالب آرورا قبلاً h2 بود
                        و صفحهٔ فروشگاه هیچ h1 نداشت (تأیید با خروجی SSR واقعی) — تنها قالب
                        از بین همهٔ قالب‌ها با این نقص. اسلاید اول (لحظهٔ SSR و پیش‌فرض
                        نمایان) h1 است و بقیهٔ اسلایدها h2 می‌مانند → دقیقاً یک h1 در صفحه.
                        استایل با کلاس .a-hero-title است، پس تغییر تگ خللی به ظاهر نمی‌زند. */}
                    {i === 0 ? (
                      <h1 className="a-hero-title">
                        {s.titleWords.map((w, wi) => {
                          if (wi === s.gradTo) {
                            return (
                              <span className="grad" key={wi}>
                                <span className="a-hero-word" style={{ "--wd": wi } as React.CSSProperties}>{w}</span>{" "}
                              </span>
                            );
                          }
                          return (
                            <React.Fragment key={wi}>
                              <span className="a-hero-word" style={{ "--wd": wi } as React.CSSProperties}>{w}</span>{" "}
                            </React.Fragment>
                          );
                        })}
                      </h1>
                    ) : (
                      <h2 className="a-hero-title">
                        {s.titleWords.map((w, wi) => {
                          if (wi === s.gradTo) {
                            return (
                              <span className="grad" key={wi}>
                                <span className="a-hero-word" style={{ "--wd": wi } as React.CSSProperties}>{w}</span>{" "}
                              </span>
                            );
                          }
                          return (
                            <React.Fragment key={wi}>
                              <span className="a-hero-word" style={{ "--wd": wi } as React.CSSProperties}>{w}</span>{" "}
                            </React.Fragment>
                          );
                        })}
                      </h2>
                    )}
                    <p className="a-hero-sub">{s.sub}</p>
                    <div className="a-hero-cta">
                      {s.cta.map((c, ci) => (
                        <button key={ci} type="button" className={`a-btn ${ci === 0 ? "a-btn-primary" : "a-btn-glass"}`} onClick={c.action}>
                          {c.label}<ChevronLeft aria-hidden="true" className="h-4 w-4" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="a-hero-nav prev" onClick={() => setSlide((slide - 1 + heroSlides.length) % heroSlides.length)} aria-label="اسلاید قبلی">
              <ChevronRight aria-hidden="true" />
            </button>
            <button type="button" className="a-hero-nav next" onClick={() => setSlide((slide + 1) % heroSlides.length)} aria-label="اسلاید بعدی">
              <ChevronLeft aria-hidden="true" />
            </button>
            <div className="a-hero-bottom">
              <div className="a-hero-dots" role="tablist" aria-label="انتخاب اسلاید">
                {heroSlides.map((s, i) => (
                  <button key={s.key} type="button" role="tab" aria-selected={i === slide}
                    className={`a-hero-dot${i === slide ? " on" : ""}`}
                    onClick={() => setSlide(i)} aria-label={`اسلاید ${toPersianDigits(i + 1)}`} />
                ))}
              </div>
              <span className="a-badge a-badge-off hidden sm:inline-flex"><Flame aria-hidden="true" />{toPersianDigits(vitrine.length)} کالای آماده</span>
            </div>
          </div>
        </EditableShell>

        {/* ═══ بنتو ویژگی‌ها ═══ */}
        {content.sections.showFeatures && (content.features?.length ?? 0) > 0 ? (
          <EditableShell sectionId="features" label="ویژگی‌ها" editMode={editMode} onEditSection={onEditSection} className="a-container-wide a-section" id="features" aria-label="خدمات ما">
            <div className="a-sec-head rv">
              <div>
                <span className="a-kicker">چرا {shop.title}؟</span>
                <h2 className="a-sec-title">تجربهٔ خریدی که به آن اعتماد می‌کنید</h2>
              </div>
            </div>
            <div className="a-features-bento">
              {(content.features ?? []).slice(0, 5).map((f, i) => {
                const Icon = f.icon === "shield" ? ShieldCheck : f.icon === "support" ? Headset : f.icon === "price" ? BadgePercent : Truck;
                return (
                  <div key={i} className={`a-feature-card rv${i === 0 ? " a-fb-lg" : i === 1 ? " a-fb-wide" : ""}`}
                    style={{ "--rvd": `${i * 0.08}s` } as React.CSSProperties}>
                    <span className="a-f-ic"><Icon aria-hidden="true" /></span>
                    <span>
                      <b>{f.title}</b>
                      <p>{f.text}</p>
                    </span>
                  </div>
                );
              })}
            </div>
          </EditableShell>
        ) : null}

        {/* ═══ پیشنهاد شگفت‌انگیز (صحنهٔ قرمز + شمارش معکوس) ═══ */}
        {deals.length > 0 ? (
          <section className="a-container-wide a-section-flat" aria-label="پیشنهاد شگفت‌انگیز">
            <div className="a-offers rv" id="offers">
              <div className="a-offers-head">
                <div className="a-offers-title">
                  <span className="a-of-ic"><Flame aria-hidden="true" /></span>
                  <div>
                    <h3>پیشنهاد شگفت‌انگیز امروز</h3>
                    <span className="a-of-sub">{discountActive && discountPercent ? `${toPersianDigits(discountPercent)}٪ تخفیف واقعی روی همهٔ کالاها` : "قیمت‌های امروز — تا پایان شب"}</span>
                  </div>
                </div>
                <div className="a-offers-tools">
                  {countdown ? (
                    <div className="a-countdown" aria-label="زمان باقی‌مانده تا پایان پیشنهادها">
                      <span className="a-cd-box"><b>{toPersianDigits(String(countdown.h).padStart(2, "0"))}</b><span>ساعت</span></span>
                      <span className="a-cd-sep" aria-hidden="true">:</span>
                      <span className="a-cd-box"><b>{toPersianDigits(String(countdown.m).padStart(2, "0"))}</b><span>دقیقه</span></span>
                      <span className="a-cd-sep" aria-hidden="true">:</span>
                      <span className="a-cd-box"><b>{toPersianDigits(String(countdown.s).padStart(2, "0"))}</b><span>ثانیه</span></span>
                    </div>
                  ) : null}
                  <button type="button" className="a-btn a-btn-glass a-btn-sm" onClick={() => scrollToId("products")}>
                    مشاهدهٔ همه<ArrowLeft aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="a-strip-wrap">
                <div className="a-strip" role="list">
                  {deals.map((p) => {
                    // v20-C — تخفیف اختصاصی کالا بر تخفیف فروشگاه اولویت دارد
                    const pm = p as StorefrontProductDTO & { discountPercent?: number | null; displayPriceRial?: string };
                    const pDiscount = pm.discountPercent && pm.discountPercent > 0 ? pm.discountPercent : null;
                    const effPercent = pDiscount ?? (discountActive && discountPercent ? discountPercent : null);
                    const hasRealDiscount = !!effPercent;
                    const nowPrice = pDiscount ? (pm.displayPriceRial ?? p.priceRial) : p.priceRial;
                    return (
                      <article className="a-deal-card" role="listitem" key={p.id}>
                        <div className="a-dl-media" onClick={() => onOpenProduct(p)} role="button" tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && onOpenProduct(p)} aria-label={`مشاهدهٔ ${p.name}`}>
                          {p.imageUrl ? <img src={p.imageUrl} alt={p.name} loading="lazy" decoding="async" /> : <span className="a-pc-ph"><Package className="h-10 w-10" /></span>}
                          {hasRealDiscount ? (
                            <span className="a-badge a-badge-off a-dl-off" style={pDiscount ? { background: "linear-gradient(135deg, #0f766e, #14b8a6)" } : undefined}>
                              {toPersianDigits(effPercent!)}٪
                            </span>
                          ) : (
                            <span className="a-badge a-badge-gold a-dl-off">قیمت امروز</span>
                          )}
                        </div>
                        <div className="a-dl-body">
                          <h3 className="a-dl-title" onClick={() => onOpenProduct(p)}>{p.name}</h3>
                          <div className="a-dl-price">
                            {hasRealDiscount ? (
                              <span className="a-dl-old">
                                {rialToCurrencyLabel(
                                  pDiscount ? p.priceRial : String(Math.round((Number(p.priceRial) * 100) / (100 - effPercent!))),
                                  currency,
                                  usdRateToman,
                                  cnyRateToman
                                )}
                              </span>
                            ) : null}
                            <span className="a-dl-now">{rialToCurrencyLabel(nowPrice, currency, usdRateToman, cnyRateToman)}</span>
                          </div>
                          <div className={`a-dl-stock${p.inStock ? "" : " low"}`}>
                            <span className="a-ds-bar"><i style={{ width: p.inStock ? "68%" : "8%" }} /></span>
                            <span>{p.inStock ? "آمادهٔ ارسال از انبار" : "ناموجود"}</span>
                          </div>
                          <button type="button" className="a-dl-add" disabled={!p.inStock} onClick={() => onAddToCart(p)}>
                            {p.inStock ? "افزودن به سبد" : "اتاق تمام شد"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* ═══ موزاییک دسته‌ها ═══ */}
        {content.sections.showCategories && categories.length > 0 ? (
          <section className="a-container-wide a-section" id="cats" aria-label="دسته‌بندی محصولات">
            <div className="a-sec-head rv">
              <div>
                <span className="a-kicker">دسته‌بندی‌ها</span>
                <h2 className="a-sec-title">مستقیم سراغ چیزی که می‌خواهید</h2>
              </div>
              <button type="button" className="a-sec-link" onClick={() => scrollToId("products")}>
                همهٔ محصولات<ChevronLeft aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div className="a-cat-mosaic">
              {categories.slice(0, 5).map((c, i) => {
                const Icon = catIcon(i);
                return (
                  <button key={c.name} type="button"
                    className={`a-category-tile rv${i === 0 ? " a-ct-hero" : ""}`}
                    style={{ "--rvd": `${i * 0.07}s` } as React.CSSProperties}
                    onClick={() => { discovery.onSelectCategory(c.name); scrollToId("products"); }}>
                    <span className={`a-ct-grad g${(stableHash(c.name) % 8) + 1}`} aria-hidden="true"><Icon className="h-12 w-12" /></span>
                    <span className="a-ct-chip"><Package aria-hidden="true" />{toPersianDigits(c.count)} کالا</span>
                    <span className="a-ct-scrim" />
                    <span className="a-ct-body">
                      <b>{c.name}</b>
                      <span className="a-ct-ic"><ChevronLeft aria-hidden="true" /></span>
                    </span>
                  </button>
                );
              })}
              <button type="button" className="a-category-tile a-ct-all rv" onClick={() => { discovery.reset(); scrollToId("products"); }}>
                <span className="a-ct-all-in">
                  <LayoutGrid aria-hidden="true" />
                  <b>همهٔ دسته‌ها</b>
                  <span>مرور کامل کالاها</span>
                </span>
              </button>
            </div>
          </section>
        ) : null}

        {/* ═══ کاروسل دسته‌ای (۲ دستهٔ پرکالا) ═══ */}
        {categories.filter((c) => c.count >= 3).length > 0 ? (
          <section className="a-container-wide a-section-flat" style={{ paddingTop: "1rem" }} aria-label="محصولات بر اساس دسته">
            <div className="flex flex-col gap-9">
              {categories.filter((c) => c.count >= 3).slice(0, 2).map((c, ci) => {
                const items = vitrine.filter((p) => p.category === c.name).slice(0, 10);
                if (items.length === 0) return null;
                const Icon = catIcon(ci);
                return (
                  <div key={c.name} className="a-cc-block rv" style={{ "--cc-accent": CC_ACCENTS[ci % 4] } as React.CSSProperties}>
                    <div className="a-cc-head">
                      <div className="a-cc-title">
                        <span className="a-cc-ic"><Icon aria-hidden="true" /></span>
                        <div>
                          <h3>{c.name}</h3>
                          <span className="a-cc-sub">{toPersianDigits(items.length)} کالای منتخب از {toPersianDigits(c.count)} کالا</span>
                        </div>
                      </div>
                      <div className="a-cc-tools">
                        <span className="a-cc-count">{toPersianDigits(c.count)} کالا</span>
                        <div className="a-cc-nav">
                          <button type="button" className="a-strip-btn" aria-label="بعدی"
                            onClick={(e) => scrollStrip(e, -1)}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
                          <button type="button" className="a-strip-btn" aria-label="قبلی"
                            onClick={(e) => scrollStrip(e, 1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
                        </div>
                      </div>
                    </div>
                    <div className="a-cc-strip-wrap a-strip-wrap">
                      <div className="a-strip a-cc-strip">
                        {items.map((p, i) => (
                          <div key={p.id} className="w-[210px] flex-none max-[640px]:w-[188px]">
                            <AuroraProductCard p={p} currency={currency} usd={usdRateToman} cny={cnyRateToman}
                              discountActive={discountActive} discountPercent={discountPercent}
                              onAdd={onAddToCart} onOpen={onOpenProduct} rvd={`${(i % 4) * 0.06}s`} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* ═══ مرور همهٔ محصولات (جستجو/فیلتر/صفحه‌بندی) ═══ */}
        <EditableShell sectionId="products" label="محصولات" editMode={editMode} onEditSection={onEditSection} className="a-container-wide a-section" id="products" aria-label="همهٔ محصولات">
          <div className="a-sec-head rv">
            <div>
              <span className="a-kicker"><ShoppingBasket aria-hidden="true" />فروشگاه</span>
              <h2 className="a-sec-title">{discovery.selectedCategory ? discovery.selectedCategory : (content.sections.productsTitle?.trim() || "همهٔ محصولات")}</h2>
              {discovery.searchQuery ? (
                <p className="a-sec-desc">نتایج جستجو برای «{discovery.searchQuery}»</p>
              ) : null}
            </div>
          </div>

          {/* نوار مرور */}
          <div className="a-browse-bar">
            <span className="a-browse-count"><b>{toPersianDigits(discovery.total)}</b> کالا</span>
            <div className="a-chips-scroll">
              <button type="button" className={`a-pill${!discovery.selectedCategory ? " on" : ""}`}
                onClick={() => discovery.onSelectCategory(null)}>همه</button>
              {categories.map((c) => (
                <button key={c.name} type="button" className={`a-pill${discovery.selectedCategory === c.name ? " on" : ""}`}
                  onClick={() => discovery.onSelectCategory(c.name)}>{c.name}</button>
              ))}
            </div>
            <label className="a-pill cursor-pointer select-none" aria-label="فقط کالاهای موجود">
              <input type="checkbox" className="accent-current scale-125" checked={discovery.inStockOnly}
                onChange={(e) => discovery.onInStockOnlyChange(e.target.checked)} />
              فقط موجود
            </label>
            <select className="a-select" value={discovery.sortMode} onChange={(e) => discovery.onSortModeChange(e.target.value as never)}
              aria-label="مرتب‌سازی">
              <option value="newest">جدیدترین</option>
              <option value="cheapest">ارزان‌ترین</option>
              <option value="expensive">گران‌ترین</option>
              <option value="name">بر اساس نام</option>
            </select>
            {discovery.hasActiveFilters ? (
              <button type="button" className="a-pill" onClick={discovery.reset}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />حذف فیلترها
              </button>
            ) : null}
          </div>

          {/* شبکهٔ محصولات */}
          {discovery.loading ? (
            <div className="a-grid-products mt-6" aria-busy="true" aria-label="در حال بارگذاری">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="a-skel" style={{ aspectRatio: "5/7" }} />
              ))}
            </div>
          ) : discovery.products.length === 0 ? (
            <div className="a-empty">
              <div className="a-es-ic"><Search aria-hidden="true" /></div>
              <h3>کالایی پیدا نشد</h3>
              <p>عبارت دیگری را جستجو کنید یا فیلترها را بردارید.</p>
              <button type="button" className="a-btn a-btn-outline mt-4" onClick={discovery.reset}>حذف فیلترها</button>
            </div>
          ) : (
            <div className="a-grid-products mt-6">
              {discovery.products.map((p, i) => (
                <AuroraProductCard key={p.id} p={p} currency={currency} usd={usdRateToman} cny={cnyRateToman}
                  discountActive={discountActive} discountPercent={discountPercent}
                  onAdd={onAddToCart} onOpen={onOpenProduct} rvd={`${(i % 4) * 0.06}s`} />
              ))}
            </div>
          )}

          {/* صفحه‌بندی */}
          {discovery.pages > 1 ? (
            <nav className="a-pagination" aria-label="صفحه‌بندی">
              <button type="button" className="a-page-btn" disabled={discovery.page <= 1}
                onClick={() => discovery.setPage(discovery.page - 1)} aria-label="صفحهٔ قبل">
                <ChevronRight aria-hidden="true" />
              </button>
              {Array.from({ length: discovery.pages }).slice(0, 7).map((_, i) => {
                const p = i + 1;
                return (
                  <button key={p} type="button" className={`a-page-btn${discovery.page === p ? " on" : ""}`}
                    onClick={() => discovery.setPage(p)} aria-current={discovery.page === p ? "page" : undefined}>
                    {toPersianDigits(p)}
                  </button>
                );
              })}
              <button type="button" className="a-page-btn" disabled={discovery.page >= discovery.pages}
                onClick={() => discovery.setPage(discovery.page + 1)} aria-label="صفحهٔ بعد">
                <ChevronLeft aria-hidden="true" />
              </button>
            </nav>
          ) : null}
        </EditableShell>

        {/* ═══ بنرهای دوتایی ═══ */}
        <section className="a-container-wide a-section-flat" aria-label="بیشتر بدانید">
          <div className="a-duo">
            {content.sections.showAbout ? (
              <EditableShell as="div" sectionId="about" label="دربارهٔ ما" editMode={editMode} onEditSection={onEditSection} className="a-duo-card d1 rv" id="about">
                <span className="a-duo-kick"><StoreIcon aria-hidden="true" className="h-3.5 w-3.5" />دربارهٔ ما</span>
                <b>{content.about.title || `داستان ${shop.title}`}</b>
                <p>{content.about.text || `ما در ${shop.title} با سال‌ها تجربه، کالای اصل و قیمت منصفانه به دست شما می‌رسانیم.`}</p>
                <button type="button" className="a-btn a-btn-glass a-btn-sm" onClick={() => scrollToId("products")}>
                  مشاهدهٔ محصولات<ChevronLeft aria-hidden="true" className="h-4 w-4" />
                </button>
              </EditableShell>
            ) : null}
            <div className="a-duo-card d2 rv" style={{ "--rvd": "0.1s" } as React.CSSProperties}>
              <span className="a-duo-kick"><PhoneCall aria-hidden="true" className="h-3.5 w-3.5" />سفارش تلفنی</span>
              <b>ترجیح می‌دهید زنده هماهنگ کنید؟</b>
              <p>در ساعات کاری پاسخگوی شما هستیم — یا پیام بگذارید تا خودمان تماس می‌گیریم.</p>
              <div className="flex flex-wrap gap-2">
                {shop.phone ? (
                  <a className="a-btn a-btn-primary a-btn-sm" href={`tel:${shop.phone}`}>
                    <Phone aria-hidden="true" className="h-4 w-4" />{toPersianDigits(shop.phone)}
                  </a>
                ) : null}
                {shop.ticketEnabled ? (
                  <button type="button" className="a-btn a-btn-glass a-btn-sm" onClick={onOpenTicket}>
                    <MessageCircle aria-hidden="true" className="h-4 w-4" />ارسال پیام
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* ═══ آمار (مدرک اجتماعی) ═══ */}
        {content.sections.showStats && stats.length > 0 ? (
          <EditableShell sectionId="stats" label="آمار" editMode={editMode} onEditSection={onEditSection} className="a-container-wide a-section" aria-label="آمار فروشگاه">
            <div className="a-stats">
              {stats.slice(0, 4).map((s, i) => {
                const Icon = [Package, Users, Star, Clock][i % 4];
                return (
                  <div key={i} className="a-stat rv" style={{ "--rvd": `${i * 0.07}s` } as React.CSSProperties}>
                    <Icon aria-hidden="true" />
                    <b>{s.value}</b>
                    <span>{s.label}</span>
                  </div>
                );
              })}
            </div>
          </EditableShell>
        ) : null}
      </main>

      {/* ═══ فوتر ═══ */}
      <EditableShell as="footer" sectionId="footer" label="فوتر" editMode={editMode} onEditSection={onEditSection} className="a-footer">
        <div className="a-container-wide a-footer-in">
          <div>
            <div className="a-logo" style={{ marginBottom: "0.9rem" }}>
              {content.header.logoUrl ? (
                // لوگوی آپلودی مالک — دامنه نامشخص
                <img src={content.header.logoUrl} alt={`لوگوی ${shop.title}`} className="h-9 w-9 rounded-xl object-cover" />
              ) : (
                <span className="a-logo-ic"><StoreIcon className="h-5 w-5" aria-hidden="true" /></span>
              )}
              <span className="a-logo-txt">
                <b>{content.footer.aboutTitle?.trim() || shop.title}</b>
                <span style={{ color: "#69748f" }}>{content.header.tagline || "فروشگاه آنلاین رسمی"}</span>
              </span>
            </div>
            <p style={{ color: "#9aa4be", fontSize: ".84rem", lineHeight: 2 }}>
              {content.footer.aboutText?.trim() || shop.description || content.about.text || `خرید آنلاین از ${shop.title} — کالای اصل، قیمت منصفانه و پشتیبانی واقعی.`}
            </p>
            {content.footer.showSocials ? (
              <div className="a-f-socials">
                {shop.socialInstagram ? (
                  <a className="a-f-social" href={`https://instagram.com/${shop.socialInstagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" aria-label="اینستاگرام">
                    <Instagram className="h-5 w-5" aria-hidden="true" />
                  </a>
                ) : null}
                {shop.socialTelegram ? (
                  <a className="a-f-social" href={`https://t.me/${shop.socialTelegram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" aria-label="تلگرام">
                    <Send className="h-5 w-5" aria-hidden="true" />
                  </a>
                ) : null}
                {shop.socialWhatsapp ? (
                  <a className="a-f-social" href={`https://wa.me/98${shop.socialWhatsapp.replace(/^0/, "").replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" aria-label="واتساپ">
                    <MessageCircle className="h-5 w-5" aria-hidden="true" />
                  </a>
                ) : null}
                {content.footer.socialAparat ? (
                  <a className="a-f-social" href={content.footer.socialAparat} target="_blank" rel="noopener noreferrer" aria-label="آپارات">
                    <Clapperboard className="h-5 w-5" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            ) : null}
            <div className="a-f-trust" style={{ marginTop: "1.1rem" }}>
              {(trustBadges.length > 0 ? trustBadges : ["ضمانت اصالت کالا", "پرداخت امن", "پشتیبانی پاسخگو"]).map((t, i) => (
                <span key={i} className="a-badge">{
                  i % 3 === 0 ? <ShieldCheck aria-hidden="true" /> : i % 3 === 1 ? <Wallet aria-hidden="true" /> : <Headset aria-hidden="true" />
                }{t}</span>
              ))}
            </div>
            {content.footer.note?.trim() ? (
              <p style={{ color: "#9aa4be", fontSize: ".8rem", marginTop: ".9rem", lineHeight: 1.9 }}>
                <Clock aria-hidden="true" className="ml-1 inline h-3.5 w-3.5 align-[-2px]" />{content.footer.note}
              </p>
            ) : null}
          </div>

          {/* R26 — ستون‌های لینک دلخواه فوتر؛ اگر مالک ستون ساخته باشد جای نوار
              پیش‌فرض می‌نشینند (مثل ۵ قالب سینمایی)، وگرنه دسترسی سریع پیش‌فرض */}
          {footerColumns.length > 0 ? (
            <>
              {footerColumns.map((col, ci) => (
                <nav key={`fc-${ci}`} aria-label={col.title || `ستون ${toPersianDigits(ci + 1)}`}>
                  <h4><LayoutGrid aria-hidden="true" />{col.title || "لینک‌ها"}</h4>
                  <div className="a-f-links">
                    {col.links.filter((l) => l.label.trim()).map((l, li) => (
                      <a key={`fl-${ci}-${li}`} href={l.href || "#"}><ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />{l.label}</a>
                    ))}
                  </div>
                </nav>
              ))}
            </>
          ) : (
          <nav aria-label="دسترسی سریع">
            <h4><LayoutGrid aria-hidden="true" />دسترسی سریع</h4>
            <div className="a-f-links">
              <button type="button" onClick={() => scrollToId("products")}><ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />همهٔ محصولات</button>
              <button type="button" onClick={() => scrollToId("cats")}><ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />دسته‌بندی‌ها</button>
              <button type="button" onClick={() => scrollToId("offers")}><ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />پیشنهادهای امروز</button>
              <button type="button" onClick={() => scrollToId("about")}><ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />دربارهٔ ما</button>
              {customerName ? (
                <button type="button" onClick={onOpenOrders}><ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />سفارش‌های من</button>
              ) : (
                <button type="button" onClick={onOpenAuth}><ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />ورود / ثبت‌نام</button>
              )}
            </div>
          </nav>
          )}

          <div>
            <h4><Phone aria-hidden="true" />تماس با ما</h4>
            <div className="a-f-contact">
              {shop.phone ? (
                <span><Phone aria-hidden="true" /><a href={`tel:${shop.phone}`} dir="ltr">{toPersianDigits(shop.phone)}</a></span>
              ) : null}
              {shop.address ? <span><MapPin aria-hidden="true" />{shop.address}</span> : null}
              {shop.city ? <span><MapPin aria-hidden="true" />{shop.city}</span> : null}
              <span><Clock aria-hidden="true" />پاسخگویی همه‌روزه در ساعات کاری</span>
            </div>
            {content.footer.showMap && typeof shop.lat === "number" && typeof shop.lng === "number" ? (
              <div className="a-f-map" style={{ marginTop: "1rem" }}>
                {/* v20-C — نقشهٔ تعاملی (زوم/درگ واقعی) به‌جای iframe ایستا */}
                <InteractiveMap
                  lat={shop.lat}
                  lng={shop.lng}
                  title={shop.title}
                  address={shop.address ?? undefined}
                  height="230px"
                  showRouteLink={false}
                />
              </div>
            ) : null}
            {typeof shop.lat === "number" && typeof shop.lng === "number" ? (
              <a className="a-btn a-btn-glass a-btn-sm" style={{ marginTop: "0.8rem" }} href={osmLinkUrl(shop.lat, shop.lng)} target="_blank" rel="noopener noreferrer">
                <MapPin aria-hidden="true" className="h-4 w-4" />مسیریابی تا فروشگاه
              </a>
            ) : null}
          </div>
        </div>
        <div className="a-footer-bar">
          <div className="a-container-wide" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <span>
              {content.footer.copyright?.trim() ||
                `© ${toPersianDigits(new Date().getFullYear())} ${shop.title} — تمامی حقوق محفوظ است.`}
            </span>
            {content.footer.showPoweredBy !== false ? (
              <a href="https://ofoghplus.ir" target="_blank" rel="noopener noreferrer">
                قدرت‌گرفته از نرم‌افزار حسابداری افق پلاس
              </a>
            ) : null}
          </div>
        </div>
      </EditableShell>

      {/* ═══ ناوبری موبایل ═══ */}
      <nav className="a-mobile-nav show" aria-label="ناوبری موبایل">
        <button type="button" className={`a-mn-item${!discovery.searchQuery && !discovery.selectedCategory ? " on" : ""}`}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <Home aria-hidden="true" />خانه
        </button>
        <button type="button" className="a-mn-item" onClick={() => scrollToId("cats")}>
          <LayoutGrid aria-hidden="true" />دسته‌ها
        </button>
        <button type="button" className="a-mn-item" onClick={() => scrollToId("products")}>
          <ShoppingBasket aria-hidden="true" />محصولات
        </button>
        <button type="button" className="a-mn-item" onClick={onOpenCart} style={{ position: "relative" }}>
          <ShoppingBag aria-hidden="true" />سبد
          {cartCount > 0 ? <span className="a-dot">{toPersianDigits(cartCount)}</span> : null}
        </button>
        <button type="button" className="a-mn-item" onClick={customerName ? onOpenOrders : onOpenAuth}>
          <Users aria-hidden="true" />حساب
        </button>
      </nav>

      {/* ═══ دکمهٔ شناور تماس (موبایل) ═══ */}
      {shop.phone ? (
        <a className="a-fab-call" href={`tel:${shop.phone}`} aria-label="تماس با فروشگاه">
          <Phone aria-hidden="true" />
        </a>
      ) : null}

      {/* ═══ پاپ‌آپ مدرک اجتماعی (فقط سفارش‌های واقعی) ═══ */}
      {socialProof.length > 0 && socialProof[spIndex] ? (
        <div className={`a-social-proof${spVisible ? "" : " out"}`} role="status" aria-live="polite">
          <span className="a-sp-ic"><CheckCircle2 aria-hidden="true" /></span>
          <span>
            <b>{socialProof[spIndex].name} همین الان {socialProof[spIndex].product} خرید</b>
            <span>{toPersianDigits(socialProof[spIndex].minutesAgo)} دقیقه پیش — تأییدشده</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* اسکرول نوار افقی — دکمه‌های جهت‌دار RTL */
function scrollStrip(e: React.MouseEvent<HTMLButtonElement>, dir: 1 | -1) {
  const wrap = e.currentTarget.closest(".a-strip-wrap");
  const strip = wrap?.querySelector<HTMLElement>(".a-strip");
  if (strip) strip.scrollBy({ left: dir * Math.min(480, strip.clientWidth * 0.8), behavior: "smooth" });
}

/* اسکرول نرم به بخش */
function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
