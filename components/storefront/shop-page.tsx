"use client";

// ═══════════════════════════════════════════════════════════════════
// R16 — فروشگاه آنلاین: کامپوننت اصلی صفحه عمومی (نسخهٔ ۲)
// اضافه بر R15: جستجو/فیلتر/مرتب‌سازی پیشرفته + صفحهٔ تک‌محصول +
// کد تخفیف + ارز چندگانه (تومان/دلار/یوان) + تیکت پشتیبانی +
// ۵ قالب سینمایی digizlux + بنر اختصاصی کسب‌وکار.
// سبد خرید (باتم‌شیت موبایل / دراور دسکتاپ) + تسویه + پرداخت کارت‌به‌کارت +
// آپلود رسید + حساب مشتری و سفارش‌های من — همهٔ جریان R15 حفظ شده.
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  ShoppingBag,
  Loader2,
  Trash2,
  Minus,
  Plus,
  Copy,
  Check,
  CreditCard,
  Upload,
  FileImage,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Info,
  X,
  Search,
  Ticket as TicketIcon,
  Globe,
  ReceiptText,
  BadgePercent,
  ShieldCheck,
  Star as StarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { toPersianDigits, formatJalaliDayLabel } from "@/lib/persian";
import {
  rialToTomanLabel,
  STOREFRONT_ORDER_STATUS_FA,
  storefrontOrderStatusColor,
  normalizeCardNumber,
  effectiveUnitPriceRial,
  type StorefrontProductDTO,
  type StorefrontShopDTO,
} from "@/lib/storefront";
import {
  buildDefaultContent,
  mergeStorefrontContent,
  getBusinessType,
  rialToCurrencyLabel,
  type StorefrontContent,
  type StorefrontCurrencyCode,
  STOREFRONT_CURRENCIES,
} from "@/lib/storefront-wizard";
import { StorefrontTemplateRenderer } from "@/components/storefront/templates";
import {
  StorefrontTemplateV2Renderer,
  KAHROBA_KENBURNS_KEYFRAMES,
  type ShopDTOV2,
} from "@/components/storefront/templates-v2";
import { PREMIUM_TEMPLATE_KEYFRAMES } from "@/components/storefront/templates-premium";
import { StorefrontBlocksRenderer } from "@/components/storefront/blocks-renderer";
import type { SfBlock } from "@/lib/storefront-blocks";
import {
  StorefrontSectionEditorSheet,
  type StorefrontSectionId,
  type StorefrontShopInfoDraft,
} from "@/components/storefront/section-editor-sheet";
import { OnSiteOwnerEditBar } from "@/components/storefront/on-site-editor-bar";
import {
  StorefrontRevisionsDialog,
} from "@/components/storefront/manage/revisions-dialog";
import {
  CustomerAuthDialog,
  type SfCustomerSession,
} from "@/components/storefront/customer-auth-dialog";
import { OrdersHistoryDialog } from "@/components/storefront/orders-history-dialog";
import { ProductReviews } from "@/components/storefront/product-reviews";
import { useStoreProducts } from "@/components/storefront/use-store-products";
import { sanitizeHtml } from "@/lib/sanitize-html";

interface ShopPageProps {
  slug: string;
  initialShop: StorefrontShopDTO;
  initialProducts: StorefrontProductDTO[];
  bannerSrc?: string | null;
  usdRateToman?: number | null;
  cnyRateToman?: number | null;
  /** R24-4 — بلوک‌های منتشرشدهٔ ویرایشگر بلوکی (اگر باشد، به‌جای قالب رندر می‌شود) */
  blocks?: SfBlock[] | null;
}

interface CartItem {
  productId: string;
  name: string;
  priceRial: string;
  imageUrl: string | null;
  qty: number;
}

type CheckoutStep = "cart" | "form" | "payment" | "done";

interface CreatedOrder {
  id: string;
  totalRial: string;
  payableRial?: string | null;
  discountApplied?: number | null;
  status: string;
  payment: {
    cardNumber: string | null;
    cardHolderName: string | null;
    cardImage: string | null;
  };
}

const V2_TEMPLATES = new Set(["aurora", "sabzineh", "rose", "firouzeh", "kahroba", "bazaarpro", "aurora-pro", "bazaar-luxe", "dark-neon"]);
// R24-4 — قالب‌های پرمیوم (کدگذاری keyframe از templates-premium)
const PREMIUM_TEMPLATES = new Set(["aurora-pro", "bazaar-luxe", "dark-neon"]);

export function ShopPage({
  slug,
  initialShop,
  initialProducts,
  bannerSrc,
  usdRateToman,
  cnyRateToman,
  blocks,
}: ShopPageProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [products] = React.useState<StorefrontProductDTO[]>(initialProducts);
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [step, setStep] = React.useState<CheckoutStep>("cart");

  // ── R16/R17: جستجو / فیلتر / مرتب‌سازی برای همهٔ قالب‌ها (v1 + v2) ──
  const [currency, setCurrency] = React.useState<StorefrontCurrencyCode>("IRT");

  // ── R16: تک‌محصول + تیکت ──
  const [detailProduct, setDetailProduct] = React.useState<StorefrontProductDTO | null>(null);
  // ── Task 1-b: موتور جستجو/فیلتر/صفحه‌بندی سمت سرور (قالب‌های V2) ──
  const discovery = useStoreProducts(slug, { products: initialProducts });
  const [ticketOpen, setTicketOpen] = React.useState(false);

  // فرم تسویه
  const [name, setName] = React.useState("");
  // Task 1-c — پرداخت آنلاین
  const [payingOnline, setPayingOnline] = React.useState(false);
  React.useEffect(() => {
    // پیام بازگشت از درگاه (?pay=ok|failed)
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const pay = sp.get("pay");
    if (pay === "ok") {
      toast({
        title: "پرداخت موفق",
        description: `سفارش شما تأیید و فاکتورش صادر شد${sp.get("ref") ? ` — شماره پیگیری: ${toPersianDigits(sp.get("ref") ?? "")}` : ""}`,
      });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (pay === "failed") {
      const reason = sp.get("reason");
      const msg = sp.get("msg");
      toast({
        title: "پرداخت ناموفق",
        description: msg || (reason === "canceled" ? "پرداخت توسط شما لغو شد" : "خطا در پرداخت — می‌توانید دوباره تلاش کنید یا کارت‌به‌کارت بپردازید"),
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  /** Task 1-c — شروع پرداخت آنلاین زرین‌پال برای سفارش ثبت‌شده */
  async function payOnline() {
    if (!createdOrder) return;
    setPayingOnline(true);
    try {
      const res = await fetch(`/api/storefront/${encodeURIComponent(slug)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: createdOrder.id }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && json.redirectUrl) {
        window.location.href = json.redirectUrl as string;
        return; // ریدایرکت به زرین‌پال
      }
      toast({ title: "شروع پرداخت ناموفق", description: json?.error || "دوباره تلاش کنید", variant: "destructive" });
    } catch {
      toast({ title: "خطای شبکه", description: "اتصال اینترنت را بررسی کنید", variant: "destructive" });
    } finally {
      setPayingOnline(false);
    }
  }
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [note, setNote] = React.useState("");
  const [discountCode, setDiscountCode] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // سفارش ساخته‌شده + رسید
  const [createdOrder, setCreatedOrder] = React.useState<CreatedOrder | null>(null);
  const [receiptFile, setReceiptFile] = React.useState<File | null>(null);
  const [receiptNote, setReceiptNote] = React.useState("");
  const [uploading, setUploading] = React.useState(false);

  // حساب مشتری
  const [authOpen, setAuthOpen] = React.useState(false);
  const [ordersOpen, setOrdersOpen] = React.useState(false);
  const [customer, setCustomer] = React.useState<SfCustomerSession | null>(null);

  const [copied, setCopied] = React.useState(false);

  // بازیابی سبد از localStorage (per-slug) + بررسی نشست مشتری
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`sf_cart_${slug}`);
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[];
        if (Array.isArray(parsed)) setCart(parsed.filter((i) => i && i.productId && i.qty > 0).slice(0, 50));
      }
    } catch {
      /* ignore */
    }
  }, [slug]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(`sf_cart_${slug}`, JSON.stringify(cart));
    } catch {
      /* ignore */
    }
  }, [cart, slug]);

  // ── Task 1-b/R17: بازگشت از صفحهٔ تک‌محصول با ?focus=<productId> ──
  // دکمهٔ «سفارش این کالا» در صفحهٔ محصول به اینجا می‌آید؛ کالای هدف
  // بی‌درنگ به سبد اضافه و سبد باز می‌شود تا سفارش بدون جرقهٔ اضافه کامل شود.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const focusId = sp.get("focus");
    if (!focusId) return;
    // پارامتر مصرف‌شدنی — refresh بعدی سبد را دوباره باز نمی‌کند
    window.history.replaceState({}, "", window.location.pathname);
    const p = products.find((x) => x.id === focusId && x.inStock);
    if (!p) return;
    setCart((prev) =>
      prev.some((i) => i.productId === p.id)
        ? prev
        : [...prev, { productId: p.id, name: p.name, priceRial: effectiveUnitPriceRial(p), imageUrl: p.imageUrl, qty: 1 }]
    );
    setCartOpen(true);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/storefront/${encodeURIComponent(slug)}/customer/me`, { cache: "no-store" });
        if (res.ok) {
          const json = await res.json().catch(() => null);
          if (!cancelled && json?.success && json.customer) {
            setCustomer(json.customer as SfCustomerSession);
          }
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  React.useEffect(() => {
    if (customer) {
      setName((prev) => prev || customer.name);
      setEmail((prev) => prev || customer.email);
    }
  }, [customer]);

  const accentBg = React.useMemo<React.CSSProperties | undefined>(() => {
    return initialShop.accentColor
      ? { backgroundColor: initialShop.accentColor, color: "#ffffff" }
      : undefined;
  }, [initialShop.accentColor]);

  // ── R16: محتوای ویرایش‌شدهٔ مالک + پیش‌فرض هوشمند ──
  const storedContent: StorefrontContent = React.useMemo(() => {
    const base = buildDefaultContent(initialShop.businessType ?? "general", initialShop.title, initialShop.city);
    const stored = (initialShop.content as Partial<StorefrontContent> | null | undefined) ?? null;
    return mergeStorefrontContent(base, stored);
  }, [initialShop.businessType, initialShop.title, initialShop.city, initialShop.content]);

  // ══ R17-C: حالت ویرایش مالک روی سایت (?edit=1) ══
  // مالک از پنل (دکمهٔ «ویرایش روی سایت») یا مستقیم با ?edit=1 سایت خودش را باز
  // می‌کند؛ توکن نشست از localStorage خوانده و با GET manage مالکیت تأیید می‌شود.
  // سپس هر بخش با دکمهٔ «ویرایش» همان‌جا قابل تغییر است و با PUT manage ذخیره می‌شود.
  const [ownerEdit, setOwnerEdit] = React.useState(false);
  const [contentDraft, setContentDraft] = React.useState<StorefrontContent | null>(null);
  const [editingSection, setEditingSection] = React.useState<StorefrontSectionId | null>(null);
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [draftDirty, setDraftDirty] = React.useState(false);
  const [exitArmed, setExitArmed] = React.useState(false);
  // R26 — پیش‌نویس اطلاعات فروشگاه (نام/تماس/شبکه‌های اجتماعی) برای ویرایش هدر/فوتر
  const [shopInfoDraft, setShopInfoDraft] = React.useState<StorefrontShopInfoDraft | null>(null);
  // R26 — تاریخچهٔ تغییرات و بازگردانی
  const [historyOpen, setHistoryOpen] = React.useState(false);
  // آیا در این نشست ویرایش، ذخیره‌ای انجام شده؟ (برای همگام‌سازی props سرور هنگام خروج)
  const [savedOnce, setSavedOnce] = React.useState(false);

  /** توکن نشست مالک — برای دیالوگ تاریخچه روی سایت عمومی */
  const getOwnerToken = React.useCallback(
    () => (typeof window !== "undefined" ? window.localStorage.getItem("hoshhesab_user_token") : null),
    []
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("edit") !== "1") return;
    const token = window.localStorage.getItem("hoshhesab_user_token");
    if (!token) {
      toast({
        title: "برای ویرایش سایت وارد شوید",
        description: "این حالت فقط برای مالک فروشگاه است — در نرم‌افزار وارد حساب شوید و دوباره این آدرس را باز کنید",
        variant: "destructive",
      });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/storefront/manage", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.success && json.shop && json.shop.slug === slug) {
          if (blocks && blocks.length > 0) {
            // R24-4 — صفحهٔ بلوکی: ویرایش بخش‌محور قدیمی معنا ندارد؛ راهنمایی به پنل
            toast({
              title: "این فروشگاه با ویرایشگر بلوکی ساخته شده",
              description: "برای ویرایش، در پنل فروشگاه به تب «ویرایشگر بلوکی» بروید",
            });
            return;
          }
          setOwnerEdit(true);
          toast({ title: "حالت ویرایش مالک فعال شد", description: "روی دکمهٔ ویرایش هر بخش کلیک کنید و در پایان ذخیره کنید" });
        } else {
          toast({ title: "دسترسی ویرایش ندارید", description: "این حالت فقط برای مالک همین فروشگاه فعال است", variant: "destructive" });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, toast, blocks]);

  // فعال‌شدن حالت ویرایش → پیش‌نویس از محتوای فعلی سایت پر می‌شود
  React.useEffect(() => {
    if (ownerEdit && contentDraft === null) setContentDraft(storedContent);
  }, [ownerEdit, contentDraft, storedContent]);

  // R26 — پیش‌نویس اطلاعات فروشگاه هم با فعال‌شدن ویرایش پر می‌شود
  React.useEffect(() => {
    if (ownerEdit && shopInfoDraft === null) {
      setShopInfoDraft({
        title: initialShop.title ?? "",
        phone: initialShop.phone ?? "",
        address: initialShop.address ?? "",
        city: initialShop.city ?? "",
        socialInstagram: initialShop.socialInstagram ?? "",
        socialTelegram: initialShop.socialTelegram ?? "",
        socialWhatsapp: initialShop.socialWhatsapp ?? "",
      });
    }
  }, [ownerEdit, shopInfoDraft, initialShop]);

  // محتوای نهایی: در حالت ویرایش، پیش‌نویس مالک جایگزین محتوای ذخیره‌شده می‌شود
  const content: StorefrontContent = contentDraft ?? storedContent;

  // اطلاعات فروشگاهِ نمایشی: در حالت ویرایش از پیش‌نویس (ویرایش همان‌جا دیده می‌شود)
  const displayShopInfo = shopInfoDraft ?? {
    title: initialShop.title ?? "",
    phone: initialShop.phone ?? "",
    address: initialShop.address ?? "",
    city: initialShop.city ?? "",
    socialInstagram: initialShop.socialInstagram ?? "",
    socialTelegram: initialShop.socialTelegram ?? "",
    socialWhatsapp: initialShop.socialWhatsapp ?? "",
  };

  function patchDraft(patch: Partial<StorefrontContent>) {
    setDraftDirty(true);
    setExitArmed(false);
    setContentDraft((c) => (c ? { ...c, ...patch } : c));
  }

  function patchShopInfo(patch: Partial<StorefrontShopInfoDraft>) {
    setDraftDirty(true);
    setExitArmed(false);
    setShopInfoDraft((s) => (s ? { ...s, ...patch } : s));
  }

  /** R26 — آپلود رسانه (لوگو) با توکن مالک روی سایت عمومی */
  async function uploadOwnerMedia(file: File, kind: "image" | "video"): Promise<string | null> {
    const token = getOwnerToken();
    if (!token) {
      toast({ title: "نشست شما منقضی شده", description: "دوباره وارد نرم‌افزار شوید", variant: "destructive" });
      return null;
    }
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      const res = await fetch("/api/storefront/manage/media", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "آپلود ناموفق", description: json?.error || "دوباره تلاش کنید", variant: "destructive" });
        return null;
      }
      return json.url as string;
    } catch {
      toast({ title: "خطای شبکه", description: "اتصال اینترنت را بررسی کنید", variant: "destructive" });
      return null;
    }
  }

  async function saveOwnerEdit() {
    if (!contentDraft) return;
    const token = typeof window !== "undefined" ? window.localStorage.getItem("hoshhesab_user_token") : null;
    if (!token) {
      toast({ title: "نشست شما منقضی شده", description: "دوباره وارد نرم‌افزار شوید و این صفحه را بازنگری کنید", variant: "destructive" });
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch("/api/storefront/manage", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content: contentDraft,
          // R26 — اطلاعات فروشگاه ویرایش‌شده در شیت هدر/فوتر هم ذخیره می‌شود
          ...(shopInfoDraft
            ? {
                title: shopInfoDraft.title,
                phone: shopInfoDraft.phone,
                address: shopInfoDraft.address,
                city: shopInfoDraft.city,
                socialInstagram: shopInfoDraft.socialInstagram,
                socialTelegram: shopInfoDraft.socialTelegram,
                socialWhatsapp: shopInfoDraft.socialWhatsapp,
              }
            : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ذخیره ناموفق", description: json?.error || "دوباره تلاش کنید", variant: "destructive" });
        return;
      }
      setDraftDirty(false);
      setExitArmed(false);
      setSavedOnce(true);
      toast({ title: "ذخیره شد", description: "تغییرات همین حالا برای بازدیدکنندگان سایت شما اعمال شد" });
    } catch {
      toast({ title: "خطای شبکه", description: "اتصال اینترنت را بررسی کنید", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  }

  /** R26 — پس از بازگردانی از تاریخچه: محتوا از سرور خوانده و بدون رفرش در همان صفحه اعمال می‌شود */
  async function refreshAfterRestore() {
    const token = getOwnerToken();
    if (!token) return;
    try {
      const res = await fetch("/api/storefront/manage", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json.shop) return;
      const s = json.shop;
      const base = buildDefaultContent(s.businessType ?? "general", s.title, s.city);
      const merged = mergeStorefrontContent(base, s.content ?? null);
      setContentDraft(merged);
      setShopInfoDraft({
        title: s.title ?? "",
        phone: s.phone ?? "",
        address: s.address ?? "",
        city: s.city ?? "",
        socialInstagram: s.socialInstagram ?? "",
        socialTelegram: s.socialTelegram ?? "",
        socialWhatsapp: s.socialWhatsapp ?? "",
      });
      setDraftDirty(false);
      setExitArmed(false);
    } catch {
      /* ignore */
    }
  }

  function exitOwnerEdit() {
    if (draftDirty && !exitArmed) {
      setExitArmed(true);
      toast({ title: "تغییرات ذخیره‌نشده دارید", description: "برای خروج بدون ذخیره دوباره دکمهٔ خروج را بزنید، یا ابتدا ذخیره کنید" });
      return;
    }
    setOwnerEdit(false);
    setContentDraft(null);
    setEditingSection(null);
    setShopInfoDraft(null);
    setDraftDirty(false);
    setExitArmed(false);
    setHistoryOpen(false);
    // اگر در همین نشست ذخیره شده بود، props سرور (SEO/SSR) با بازنگری نرم همگام می‌شود
    // تا تغییرات ذخیره‌شده پس از خروج هم دقیق دیده شوند.
    if (savedOnce) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("edit");
        window.location.replace(url.toString());
        return;
      } catch {
        /* ignore */
      }
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("edit");
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* ignore */
    }
  }

  // ── R16: دسته‌ها از دادهٔ واقعی کالاها ──
  const categories = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const c = p.category?.trim();
      if (c) map.set(c, (map.get(c) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [products]);

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotalRial = cart.reduce((s, i) => s + BigInt(i.priceRial) * BigInt(i.qty), 0n);
  const qtyOf = React.useCallback((productId: string) => cart.find((i) => i.productId === productId)?.qty ?? 0, [cart]);

  // R25-A2/S1 — سوییچ ارز سبد خرید واقعاً روی قیمت‌ها اعمال شود (قبلاً هیچ اثری نداشت)
  const cartPrice = React.useCallback(
    (rial: string | bigint) =>
      rialToCurrencyLabel(
        typeof rial === "bigint" ? rial.toString() : rial,
        currency,
        usdRateToman ?? null,
        cnyRateToman ?? null
      ),
    [currency, usdRateToman, cnyRateToman]
  );

  // ── تخفیف نمایشی سمت کلاینت (اعتبارسنجی نهایی همیشه سمت سرور) ──
  const discountActive = !!(initialShop as StorefrontShopDTO & { discountActive?: boolean }).discountActive;
  const discountPercent = (initialShop as StorefrontShopDTO & { discountPercent?: number | null }).discountPercent ?? 0;
  const estimatedPayable = discountActive && discountPercent ? cartTotalRial - (cartTotalRial * BigInt(discountPercent)) / 100n : cartTotalRial;

  function addToCart(p: StorefrontProductDTO) {
    // Task 4-FIX — قیمت واحد سبد = قیمت پس از تخفیف اختصاصی کالا (هماهنگ با سرور)
    const unitPrice = effectiveUnitPriceRial(p);
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === p.id);
      if (existing) {
        if (existing.qty >= 99) return prev;
        return prev.map((i) => (i.productId === p.id ? { ...i, priceRial: unitPrice, qty: i.qty + 1 } : i));
      }
      return [...prev, { productId: p.id, name: p.name, priceRial: unitPrice, imageUrl: p.imageUrl, qty: 1 }];
    });
    toast({ title: "به سبد اضافه شد", description: p.name, duration: 1500 });
  }

  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.productId === productId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  }

  function removeItem(productId: string) {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }

  function openCart() {
    setStep((s) => (s === "done" ? "cart" : s));
    setCartOpen(true);
  }

  function resetCheckout() {
    setStep("cart");
    setCreatedOrder(null);
    setReceiptFile(null);
    setReceiptNote("");
  }

  function closeCart() {
    setCartOpen(false);
    setTimeout(() => {
      if (step === "done") resetCheckout();
    }, 300);
  }

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/storefront/${encodeURIComponent(slug)}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name,
          customerPhone: phone || undefined,
          customerEmail: email,
          note: note || undefined,
          discountCode: discountCode.trim() || undefined,
          items: cart.map((i) => ({ productId: i.productId, qty: i.qty })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ثبت سفارش ناموفق", description: json?.error || "اطلاعات فرم را بررسی کنید", variant: "destructive" });
        return;
      }
      setCreatedOrder({
        id: json.orderId,
        totalRial: json.totalRial,
        payableRial: json.payableRial ?? json.totalRial,
        discountApplied: json.discountApplied ?? null,
        status: json.status,
        payment: json.payment ?? { cardNumber: null, cardHolderName: null, cardImage: null },
      });
      setStep("payment");
      toast({ title: "سفارش ثبت شد", description: "اکنون مبلغ را کارت‌به‌کارت واریز و رسید را ارسال کنید" });
    } catch {
      toast({ title: "خطای شبکه", description: "اتصال اینترنت را بررسی کنید", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadReceipt(e: React.FormEvent) {
    e.preventDefault();
    if (!createdOrder) return;
    if (!receiptFile) {
      toast({ title: "تصویر رسید لازم است", description: "اسکرین‌شات یا عکس رسید واریزی را انتخاب کنید", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("orderId", createdOrder.id);
      fd.set("receipt", receiptFile);
      if (receiptNote.trim()) fd.set("note", receiptNote.trim());
      const res = await fetch(`/api/storefront/${encodeURIComponent(slug)}/receipt`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ارسال رسید ناموفق", description: json?.error || "دوباره تلاش کنید", variant: "destructive" });
        return;
      }
      setStep("done");
      setCart([]);
      toast({ title: "رسید شما ارسال شد", description: "سفارش در انتظار تأیید مالک فروشگاه است" });
    } catch {
      toast({ title: "خطای شبکه", description: "اتصال اینترنت را بررسی کنید", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function copyCardNumber() {
    const digits = normalizeCardNumber(createdOrder?.payment.cardNumber ?? initialShop.cardNumber ?? "");
    if (!digits) return;
    try {
      await navigator.clipboard.writeText(digits);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = digits;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        toast({ title: "کپی نشد", description: "شماره کارت را دستی یادداشت کنید", variant: "destructive" });
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "شماره کارت کپی شد", description: "مبلغ را واریز و رسید را ارسال کنید" });
  }

  const sheetSide: "bottom" | "left" = isMobile ? "bottom" : "left";

  // ── بنر فروشگاه: انتخاب هوشمند بر اساس نوع کسب‌وکار ──
  // در حالت ویرایش مالک، بنر از پیش‌نویس دیده می‌شود تا تغییرش همان‌جا نمایان شود
  const banner =
    ownerEdit && contentDraft
      ? contentDraft.banner.image || `/banners/${getBusinessType(initialShop.businessType)?.banner ?? "general"}.avif`
      : bannerSrc ??
        (content.banner.image ||
          (initialShop.businessType ? `/banners/${getBusinessType(initialShop.businessType)?.banner ?? "general"}.avif` : null));

  // ── DTO قالب v2 ──
  // R26 — در حالت ویرایش، اطلاعات فروشگاه از پیش‌نویس مالک می‌آید تا تغییر
  // نام/تماس/شبکه‌ها همان لحظه در هدر و فوتر دیده شود.
  const shopV2: ShopDTOV2 = {
    slug: initialShop.slug,
    title: ownerEdit ? displayShopInfo.title : initialShop.title,
    description: initialShop.description,
    template: initialShop.template,
    accentColor: initialShop.accentColor,
    phone: ownerEdit ? displayShopInfo.phone : initialShop.phone,
    address: ownerEdit ? displayShopInfo.address : initialShop.address,
    city: ownerEdit ? displayShopInfo.city : initialShop.city,
    lat: initialShop.lat,
    lng: initialShop.lng,
    socialInstagram: ownerEdit ? displayShopInfo.socialInstagram : initialShop.socialInstagram,
    socialTelegram: ownerEdit ? displayShopInfo.socialTelegram : initialShop.socialTelegram,
    socialWhatsapp: ownerEdit ? displayShopInfo.socialWhatsapp : initialShop.socialWhatsapp,
    tenantName: initialShop.tenantName,
    businessType: initialShop.businessType ?? null,
    announcement: content.announcement,
    ticketEnabled: !!(initialShop as StorefrontShopDTO & { ticketEnabled?: boolean }).ticketEnabled,
  };

  const templateV2Props = {
    shop: shopV2,
    products: discovery.products,
    categories: discovery.categories,
    content,
    bannerSrc: banner,
    cartCount,
    qtyOf,
    onAddToCart: addToCart,
    onOpenCart: openCart,
    onOpenAuth: () => setAuthOpen(true),
    onOpenOrders: () => setOrdersOpen(true),
    onOpenProduct: (p: StorefrontProductDTO) => {
      // Task 1-b — صفحهٔ تک‌محصول SSR (سئو + اشتراک‌گذاری)؛ دIALOG قدیمی فقط fallback
      if (typeof window !== "undefined") {
        window.location.href = `/shop/${encodeURIComponent(slug)}/p/${encodeURIComponent(p.id)}`;
      } else {
        setDetailProduct(p);
      }
    },
    onOpenTicket: () => setTicketOpen(true),
    customerName: customer?.name ?? null,
    discovery,
    searchQuery: discovery.searchQuery,
    onSearchQueryChange: discovery.onSearchQueryChange,
    selectedCategory: discovery.selectedCategory,
    onSelectCategory: discovery.onSelectCategory,
    sortMode: discovery.sortMode === "newest" ? "default" : discovery.sortMode,
    onSortModeChange: (m: string) => discovery.onSortModeChange((m === "default" ? "newest" : m) as (typeof discovery)["sortMode"]),
    inStockOnly: discovery.inStockOnly,
    onInStockOnlyChange: discovery.onInStockOnlyChange,
    currency,
    usdRateToman: usdRateToman ?? null,
    cnyRateToman: cnyRateToman ?? null,
    // R17-C — حالت ویرایش مالک روی سایت
    editMode: ownerEdit,
    onEditSection: (id: string) => setEditingSection(id as StorefrontSectionId),
  };

  /* ───────── رندر محتوای دراور سبد ───────── */
  function renderCartContent() {
    if (step === "cart") {
      return (
        <div className="flex flex-col gap-3">
          {cart.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">سبد خرید شما خالی است — از کالاها انتخاب کنید.</p>
          ) : (
            <>
              <ul className="space-y-2" role="list">
                {cart.map((item) => (
                  <li key={item.productId} className="flex items-center gap-3 rounded-xl border bg-card p-2.5">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ShoppingBag className="h-5 w-5 text-muted-foreground/60" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{cartPrice(item.priceRial)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeQty(item.productId, -1)} aria-label={`کاهش ${item.name}`}>
                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <span className="w-7 text-center text-sm font-bold tabular-nums">{toPersianDigits(item.qty)}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeQty(item.productId, 1)} aria-label={`افزایش ${item.name}`}>
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => removeItem(item.productId)} aria-label={`حذف ${item.name}`}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              <Separator />
              {discountActive && discountPercent > 0 ? (
                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                    <BadgePercent className="h-4 w-4" aria-hidden="true" />
                    تخفیف فروشگاه ({toPersianDigits(discountPercent)}٪ با کد)
                  </span>
                  <span className="font-bold tabular-nums text-emerald-700">
                    −{cartPrice((cartTotalRial * BigInt(discountPercent)) / 100n)}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-sm font-bold">
                <span>جمع کل ({toPersianDigits(cartCount)} قلم)</span>
                <span className="tabular-nums text-primary">{cartPrice(estimatedPayable)}</span>
              </div>
              <Button className="w-full gap-2 rounded-xl" size="lg" style={accentBg} onClick={() => setStep("form")}>
                ادامه و ثبت سفارش
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      );
    }

    if (step === "form") {
      return (
        <form onSubmit={submitOrder} className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep("cart")} className="gap-1">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
              بازگشت به سبد
            </Button>
          </div>
          <div className="rounded-xl border bg-muted/50 p-3 text-sm">
            <p className="font-semibold">
              جمع سفارش: <span className="tabular-nums text-primary">{cartPrice(estimatedPayable)}</span>
              {discountActive && discountPercent > 0 ? (
                <span className="ms-2 text-xs text-muted-foreground line-through">{cartPrice(cartTotalRial)}</span>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {toPersianDigits(cartCount)} قلم از {toPersianDigits(cart.length)} کالا
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sf-co-name">نام و نام خانوادگی *</Label>
            <Input id="sf-co-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} placeholder="مثلاً: مریم احمدی" autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sf-co-phone">شماره تماس (اختیاری)</Label>
            <Input id="sf-co-phone" type="tel" inputMode="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09123456789" autoComplete="tel" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sf-co-email">ایمیل *</Label>
            <Input id="sf-co-email" type="email" inputMode="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" autoComplete="email" />
            {!customer ? (
              <p className="text-xs leading-5 text-muted-foreground">
                ثبت‌نام مشتری فقط با همین ایمیل انجام می‌شود — رمز عبور لازم نیست، بعد از ثبت سفارش می‌توانید حساب بسازید.
              </p>
            ) : null}
          </div>
          {discountActive ? (
            <div className="space-y-2">
              <Label htmlFor="sf-co-discount">کد تخفیف</Label>
              <Input
                id="sf-co-discount"
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                placeholder="اگر کد تخفیف دارید وارد کنید"
                dir="ltr"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">کد در سرور اعتبارسنجی می‌شود و مبلغ نهایی در مرحلهٔ پرداخت دقیق نمایش داده خواهد شد.</p>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="sf-co-note">یادداشت سفارش (اختیاری)</Label>
            <Textarea id="sf-co-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="مثلاً: آدرس دقیق تحویل یا توضیح سفارش" />
          </div>
          <Button type="submit" disabled={submitting} className="w-full gap-2 rounded-xl" size="lg" style={accentBg}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            ثبت سفارش و ادامه به پرداخت
          </Button>
        </form>
      );
    }

    if (step === "payment") {
      const payable = createdOrder?.payableRial ?? createdOrder?.totalRial ?? "0";
      const old = createdOrder?.discountApplied ? createdOrder.totalRial : null;
      return (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep("form")} className="gap-1">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
              بازگشت به فرم
            </Button>
          </div>
          <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
            <p className="text-sm font-bold">مبلغ قابل پرداخت</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-primary">{cartPrice(payable)}</p>
            {old ? (
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="line-through">{cartPrice(old)}</span>
                <span className="ms-2 font-semibold text-emerald-600">تخفیف {toPersianDigits(createdOrder?.discountApplied ?? 0)}٪ اعمال شد</span>
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">شناسهٔ سفارش: {toPersianDigits(createdOrder?.id.slice(-8).toUpperCase() ?? "")}</p>
          </div>

          {/* Task 1-c — پرداخت آنلاین زرین‌پال (اگر مالک درگاه داشته باشد) */}
          {(initialShop as StorefrontShopDTO & { hasGateway?: boolean }).hasGateway && createdOrder ? (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                پرداخت آنلاین (زرین‌پال)
              </p>
              <p className="mt-1.5 text-xs leading-5 text-emerald-800">
                پرداخت امن با تمام کارت‌های شتاب — سفارش بلافاصله بعد از پرداخت موفق، خودکار تأیید و فاکتورش صادر می‌شود.
              </p>
              <Button
                type="button"
                size="lg"
                disabled={payingOnline}
                onClick={payOnline}
                className="mt-3 w-full gap-2 bg-emerald-600 text-base font-extrabold text-white hover:bg-emerald-700"
              >
                {payingOnline ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                {payingOnline ? "در حال اتصال به درگاه…" : `پرداخت آنلاین ${cartPrice(payable)}`}
              </Button>
              <p className="mt-2 text-center text-[10px] text-emerald-700/70">به درگاه امن زرین‌پال منتقل می‌شوید</p>
            </div>
          ) : null}

          {(createdOrder?.payment.cardNumber || initialShop.cardNumber) ? (
            <div className="rounded-2xl border bg-card p-4">
              <p className="flex items-center gap-2 text-sm font-bold">
                <CreditCard className="h-4 w-4 text-primary" aria-hidden="true" />
                پرداخت کارت‌به‌کارت
              </p>
              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2.5">
                <span className="font-mono text-sm font-bold tracking-wider tabular-nums" dir="ltr">
                  {createdOrder?.payment.cardNumber ?? initialShop.cardNumber}
                </span>
                <Button type="button" size="sm" variant="outline" onClick={copyCardNumber} className="gap-1.5 rounded-full">
                  {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                  {copied ? "کپی شد" : "کپی"}
                </Button>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                به نام: {createdOrder?.payment.cardHolderName ?? initialShop.cardHolderName ?? "—"}
                <br />
                مبلغ دقیق بالا را واریز کنید و تصویر رسید را ارسال نمایید تا سفارش شما تأیید شود.
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-800">
              مالک فروشگاه هنوز شماره کارت پرداخت ثبت نکرده است — لطفاً از طریق تماس با فروشگاه هماهنگ کنید.
            </p>
          )}

          <form onSubmit={uploadReceipt} className="flex flex-col gap-3">
            <Label>تصویر رسید واریزی *</Label>
            <label
              htmlFor="sf-receipt"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-muted-foreground/25 bg-muted/40 p-6 text-center transition-colors hover:border-primary/40"
            >
              <Upload className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-semibold">{receiptFile ? receiptFile.name : "انتخاب تصویر رسید"}</span>
              <span className="text-xs text-muted-foreground">PNG / JPG / PDF — حداکثر ۵ مگابایت</span>
            </label>
            <Input
              id="sf-receipt"
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
            />
            <Textarea
              value={receiptNote}
              onChange={(e) => setReceiptNote(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="توضیح رسید (اختیاری) — مثلاً: ساعت واریز یا ۴ رقم آخر کارت"
            />
            <Button type="submit" disabled={uploading || !receiptFile} className="w-full gap-2 rounded-xl" size="lg" style={accentBg}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileImage className="h-4 w-4" aria-hidden="true" />}
              ارسال رسید و تکمیل سفارش
            </Button>
          </form>
        </div>
      );
    }

    // done
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        </span>
        <div>
          <p className="text-lg font-black">رسید شما ثبت شد</p>
          <p className="mt-1 text-sm leading-7 text-muted-foreground">
            سفارش در انتظار تأیید مالک فروشگاه است.
            <br />
            پس از تأیید، فاکتور رسمی قابل دانلود خواهد بود.
          </p>
        </div>
        {customer ? (
          <Button variant="outline" onClick={() => { setCartOpen(false); setOrdersOpen(true); }} className="gap-2 rounded-full">
            <ReceiptText className="h-4 w-4" aria-hidden="true" />
            مشاهدهٔ سفارش‌های من
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={resetCheckout} className="rounded-full">
          بازگشت به فروشگاه
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* keyframe سبک برای قالب کهربا — تزریق یک‌باره */}
      {initialShop.template === "kahroba" ? (
        <style dangerouslySetInnerHTML={{ __html: KAHROBA_KENBURNS_KEYFRAMES }} />
      ) : null}
      {/* R24-4 — کی‌فریم‌های قالب‌های پرمیوم (بلاب گرادیان/نئون/طلایی) */}
      {PREMIUM_TEMPLATES.has(initialShop.template) ? (
        <style dangerouslySetInnerHTML={{ __html: PREMIUM_TEMPLATE_KEYFRAMES }} />
      ) : null}

      {/* R24-4 — صفحهٔ بلوکی: مالک با ویرایشگر بلوکی صفحه‌اش را چیده است */}
      {blocks && blocks.length > 0 ? (
        <StorefrontBlocksRenderer
          shop={{
            slug: initialShop.slug,
            title: initialShop.title,
            phone: initialShop.phone,
            address: initialShop.address,
            city: initialShop.city,
            lat: initialShop.lat,
            lng: initialShop.lng,
            socialInstagram: initialShop.socialInstagram,
            socialTelegram: initialShop.socialTelegram,
            socialWhatsapp: initialShop.socialWhatsapp,
            accentColor: initialShop.accentColor,
          }}
          products={products}
          categories={discovery.categories}
          blocks={blocks}
          cartCount={cartCount}
          onAddToCart={addToCart}
          onOpenCart={openCart}
          onOpenAuth={() => setAuthOpen(true)}
          onOpenOrders={() => setOrdersOpen(true)}
          onOpenProduct={(p) => {
            if (typeof window !== "undefined") {
              window.location.href = `/shop/${encodeURIComponent(slug)}/p/${encodeURIComponent(p.id)}`;
            } else {
              setDetailProduct(p);
            }
          }}
          onOpenTicket={() => setTicketOpen(true)}
          customerName={customer?.name ?? null}
          announcement={initialShop.announcement}
          ticketEnabled={initialShop.ticketEnabled}
        />
      ) : V2_TEMPLATES.has(initialShop.template) ? (
        <StorefrontTemplateV2Renderer {...templateV2Props} />
      ) : (
        <StorefrontTemplateRenderer
          shop={initialShop}
          products={discovery.products}
          discovery={discovery}
          cartCount={cartCount}
          qtyOf={qtyOf}
          onAddToCart={addToCart}
          onOpenCart={openCart}
          onOpenAuth={() => setAuthOpen(true)}
          onOpenOrders={() => setOrdersOpen(true)}
          customerName={customer?.name ?? null}
          accentBg={accentBg}
        />
      )}

      {/* ── سبد خرید / تسویه ── */}
      <Sheet open={cartOpen} onOpenChange={(o) => (o ? setCartOpen(true) : closeCart())}>
        <SheetContent
          side={sheetSide}
          className={
            isMobile
              ? "max-h-[92vh] overflow-y-auto rounded-t-3xl p-4 pb-8"
              : "w-[420px] max-w-[92vw] overflow-y-auto p-6 sm:rounded-l-3xl"
          }
        >
          <SheetHeader className="text-right">
            <SheetTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" aria-hidden="true" />
              {step === "cart" ? "سبد خرید" : step === "form" ? "تسویه سفارش" : step === "payment" ? "پرداخت" : "سفارش شما"}
            </SheetTitle>
            <SheetDescription className="sr-only">مدیریت سبد خرید و ثبت سفارش</SheetDescription>
          </SheetHeader>
          <div className="mt-2">
            {renderCartContent()}

            {/* انتخاب ارز نمایشی در سبد */}
            {step === "cart" && cart.length > 0 ? (
              <div className="mt-4 flex items-center justify-between rounded-xl border bg-muted/40 px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                  نمایش قیمت به:
                </span>
                <div className="flex gap-1">
                  {STOREFRONT_CURRENCIES.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => setCurrency(c.code)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                        currency === c.code ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                      }`}
                      aria-pressed={currency === c.code}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── دیالوگ تک‌محصول (R16) ── */}
      <Dialog open={!!detailProduct} onOpenChange={(o) => !o && setDetailProduct(null)}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto p-0 sm:rounded-3xl" dir="rtl">
          {detailProduct ? <QuickViewBody
            key={detailProduct.id}
            product={detailProduct}
            slug={slug}
            currency={currency}
            usdRateToman={usdRateToman ?? null}
            cnyRateToman={cnyRateToman ?? null}
            inCartQty={qtyOf(detailProduct.id)}
            accentBg={accentBg}
            onClose={() => setDetailProduct(null)}
            onAddToCart={() => addToCart(detailProduct)}
            onBuyNow={() => {
              addToCart(detailProduct);
              setDetailProduct(null);
              openCart();
            }}
          /> : null}
        </DialogContent>
      </Dialog>

      {/* ── تیکت پشتیبانی فروشگاه (R16) ── */}
      <StorefrontTicketDialog
        open={ticketOpen}
        onOpenChange={setTicketOpen}
        slug={slug}
        presetName={customer?.name ?? name}
        presetEmail={customer?.email ?? email}
      />

      <CustomerAuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        slug={slug}
        onLoggedIn={(c) => setCustomer(c)}
        prefill={{ name, email, phone }}
      />
      <OrdersHistoryDialog open={ordersOpen} onOpenChange={setOrdersOpen} slug={slug} />

      {/* ══ R17-C + R26: حالت ویرایش مالک روی سایت — شیت ویرایش بخش + نوار پایین + تاریخچه ══ */}
      {ownerEdit ? (
        <>
          <StorefrontSectionEditorSheet
            open={!!editingSection}
            onOpenChange={(o) => !o && setEditingSection(null)}
            sectionId={editingSection}
            content={contentDraft ?? content}
            onPatchContent={patchDraft}
            bannerImage={contentDraft?.banner?.image ?? null}
            onBannerImage={(v) => {
              if (contentDraft) patchDraft({ banner: { ...contentDraft.banner, image: v } });
            }}
            shopInfo={shopInfoDraft}
            onPatchShopInfo={patchShopInfo}
            onUploadMedia={uploadOwnerMedia}
            applyLabel="اعمال روی سایت"
          />
          <OnSiteOwnerEditBar
            saving={savingEdit}
            dirty={draftDirty}
            templateIsV2={V2_TEMPLATES.has(initialShop.template)}
            exitArmed={exitArmed}
            onSave={() => void saveOwnerEdit()}
            onExit={exitOwnerEdit}
            onHistory={() => setHistoryOpen(true)}
          />
          <StorefrontRevisionsDialog
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            getToken={getOwnerToken}
            onRestored={(kind) => {
              if (kind === "content") {
                void refreshAfterRestore();
              }
              // نسخه‌های بلوکی به پیش‌نویس برمی‌گردند — پیام راهنما در toast بازگردانی است
            }}
          />
        </>
      ) : null}
    </>
  );
}

/* ═══════════════ بدنهٔ دیالوگ نمایش سریع کالا (Task 4) ═══════════════
 * جدا شد تا گالری + توضیحات HTML پاک‌سازی‌شده + تخفیف اختصاصی را پشتیبانی کند.
 * قبلاً توضیحات به‌صورت متن خام رندر می‌شد و تگ‌های HTML برای مشتری دیده می‌شد.
 */
function QuickViewBody({
  product,
  slug,
  currency,
  usdRateToman,
  cnyRateToman,
  inCartQty,
  accentBg,
  onClose,
  onAddToCart,
  onBuyNow,
}: {
  product: StorefrontProductDTO;
  slug: string;
  currency: StorefrontCurrencyCode;
  usdRateToman: number | null;
  cnyRateToman: number | null;
  inCartQty: number;
  accentBg?: React.CSSProperties;
  onClose: () => void;
  onAddToCart: () => void;
  onBuyNow: () => void;
}) {
  const gallery = React.useMemo(() => {
    const list = (product.gallery ?? []).filter(Boolean);
    return product.imageUrl ? [product.imageUrl, ...list.filter((u) => u !== product.imageUrl)] : list;
  }, [product.gallery, product.imageUrl]);
  const [activeImage, setActiveImage] = React.useState(0);
  const currentImage = gallery[activeImage] ?? null;

  const discountPercent =
    product.discountPercent && product.discountPercent > 0 ? Math.min(99, Math.trunc(product.discountPercent)) : 0;
  const displayPrice = discountPercent > 0 ? product.displayPriceRial ?? null : null;
  const showPrice = displayPrice ?? product.priceRial;

  return (
    <div className="flex flex-col">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-t-3xl bg-muted">
        {currentImage ? (
          // آپلود کاربر — دامنه نامشخص
          <img src={currentImage} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ShoppingBag className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
          </div>
        )}
        <Button
          size="icon"
          variant="secondary"
          className="absolute left-3 top-3 h-9 w-9 rounded-full"
          onClick={onClose}
          aria-label="بستن"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
        {discountPercent > 0 ? (
          <span className="absolute right-3 top-3 rounded-full bg-teal-600 px-2.5 py-1 text-xs font-extrabold text-white shadow-md">
            {toPersianDigits(discountPercent)}٪ تخفیف
          </span>
        ) : null}
        {product.category ? (
          <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white backdrop-blur">
            {product.category}
          </span>
        ) : null}
      </div>

      {/* تصاویر گالری */}
      {gallery.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto px-4 pt-3" role="listbox" aria-label="تصاویر کالا">
          {gallery.map((url, i) => (
            <button
              key={url}
              type="button"
              role="option"
              aria-selected={i === activeImage}
              onClick={() => setActiveImage(i)}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 transition-colors ${
                i === activeImage ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"
              }`}
              aria-label={`تصویر ${toPersianDigits(i + 1)}`}
            >
              <img src={url} alt={`${product.name} — تصویر ${toPersianDigits(i + 1)}`} className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 p-5">
        <DialogHeader className="space-y-0 text-right">
          <DialogTitle className="text-lg font-black leading-relaxed">{product.name}</DialogTitle>
        </DialogHeader>
        {product.description ? (
          <div
            className="prose prose-sm max-w-none text-sm leading-7 text-muted-foreground [&_a]:text-primary [&_a]:underline [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-bold [&_img]:rounded-lg [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5 [&_blockquote]:border-s-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:ps-3"
            dir="rtl"
            // Task 4-FIX — توضیحات از ویرایشگر غنی HTML است؛ پاک‌سازی شده رندر می‌شود
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.description) }}
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={product.inStock ? "outline" : "destructive"} className={product.inStock ? "border-emerald-300 bg-emerald-50 text-emerald-700" : ""}>
            {product.inStock ? "موجود" : "ناموجود"}
          </Badge>
          {product.ratingCount && product.ratingCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
              <StarIcon className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              {toPersianDigits(product.ratingAvg ?? 0)} ({toPersianDigits(product.ratingCount)} نظر)
            </span>
          ) : null}
          {product.stockKnown && product.inStock ? (
            <span className="text-xs text-muted-foreground">موجودی محدود</span>
          ) : null}
        </div>
        <div className="rounded-2xl border bg-muted/40 p-4">
          <p className="text-xs text-muted-foreground">{discountPercent > 0 ? "قیمت با تخفیف" : "قیمت"}</p>
          <p className="mt-1 text-xl font-black tabular-nums text-primary">
            {rialToCurrencyLabel(showPrice, currency, usdRateToman, cnyRateToman)}
          </p>
          {displayPrice ? (
            <p className="mt-0.5 text-sm font-medium text-muted-foreground line-through">
              {rialToCurrencyLabel(product.priceRial, currency, usdRateToman, cnyRateToman)}
            </p>
          ) : null}
          {currency !== "IRT" ? (
            <p className="mt-1 text-xs text-muted-foreground">{rialToTomanLabel(showPrice)} (معادل)</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1 gap-2 rounded-xl"
            size="lg"
            style={accentBg}
            disabled={!product.inStock}
            onClick={onBuyNow}
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            افزودن به سبد و تسویه
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="rounded-xl"
            disabled={!product.inStock || inCartQty >= 99}
            onClick={onAddToCart}
            aria-label="افزودن به سبد"
          >
            {inCartQty > 0 ? `(${toPersianDigits(inCartQty)} در سبد)` : "افزودن"}
          </Button>
        </div>
        {/* v20-D — امتیاز و نظرات همین کالا (فشرده — لیست با اسکرول داخلی) */}
        <ProductReviews
          compact
          slug={slug}
          productId={product.id}
          productName={product.name}
        />
      </div>
    </div>
  );
}

/* ═══════════════ تیکت پشتیبانی مشتری (R16) ═══════════════ */

function StorefrontTicketDialog({
  open,
  onOpenChange,
  slug,
  presetName,
  presetEmail,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  slug: string;
  presetName?: string;
  presetEmail?: string;
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState(presetName ?? "");
  const [email, setEmail] = React.useState(presetEmail ?? "");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName((p) => p || presetName || "");
      setEmail((p) => p || presetEmail || "");
    }
  }, [open, presetName, presetEmail]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/storefront/${encodeURIComponent(slug)}/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: name, customerEmail: email, subject, message }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ثبت تیکت ناموفق", description: json?.error || "دوباره تلاش کنید", variant: "destructive" });
        return;
      }
      toast({ title: "تیکت ثبت شد", description: json?.message ?? "پاسخ به ایمیل شما ارسال می‌شود" });
      setSubject("");
      setMessage("");
      onOpenChange(false);
    } catch {
      toast({ title: "خطای شبکه", description: "اتصال اینترنت را بررسی کنید", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2">
            <TicketIcon className="h-5 w-5 text-primary" aria-hidden="true" />
            تیکت پشتیبانی فروشگاه
          </DialogTitle>
          <DialogDescription>سؤال یا مشکل خود را بنویسید — پاسخ به ایمیل شما ارسال می‌شود.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sf-tk-name">نام شما *</Label>
            <Input id="sf-tk-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} placeholder="نام و نام خانوادگی" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sf-tk-email">ایمیل *</Label>
            <Input id="sf-tk-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sf-tk-subject">موضوع *</Label>
            <Input id="sf-tk-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={3} maxLength={120} placeholder="مثلاً: وضعیت سفارش من چه خبر است؟" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sf-tk-msg">متن تیکت *</Label>
            <Textarea id="sf-tk-msg" value={message} onChange={(e) => setMessage(e.target.value)} required minLength={10} maxLength={2000} rows={4} placeholder="شرح کامل مشکل یا پرسش..." />
          </div>
          <Button type="submit" disabled={submitting} className="w-full gap-2 rounded-xl">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
            ارسال تیکت
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
