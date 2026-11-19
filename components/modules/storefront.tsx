"use client";

// ============ فروشگاه آنلاین (R15-C) — ماژول مدیریت مالک ============
// تب‌ها: سفارش‌ها (تأیید/رد/ارسال + پیش‌نمایش رسید) | تنظیمات فروشگاه
// (انتخاب قالب با پیش‌نمایش زنده + کارت پرداخت + نقشه + سئو) | مشتریان | آمار

import * as React from "react";
import {
  Store,
  ExternalLink,
  Wand2,
  Pencil,
  Ticket,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  ShoppingCart,
  Settings2,
  Users,
  BarChart3,
  CreditCard,
  Upload,
  MapPin,
  Search,
  Eye,
  TrendingUp,
  Package,
  ReceiptText,
  Truck,
  XCircle,
  CheckCircle2,
  Globe,
  Save,
  Info,
  BadgeCheck,
  X,
  FileText,
  Layers,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits, formatJalaliDayLabel } from "@/lib/persian";
import { StorefrontWizardTab, type StorefrontAccessInfo } from "@/components/storefront/manage/wizard-tab";
import { StorefrontVisualEditorTab } from "@/components/storefront/manage/visual-editor-tab";
import { StorefrontTicketsTab } from "@/components/storefront/manage/tickets-tab";
import { StorefrontProductsManager } from "@/components/storefront/manage/products-manager";
import { StorefrontBlockEditor } from "@/components/storefront/block-editor/block-editor";
import { StorefrontCategoriesTab } from "@/components/storefront/manage/categories-tab";
import { ReviewsTab } from "@/components/storefront/manage/reviews-tab";
import { BlogTab } from "@/components/storefront/manage/blog-tab";
import { MapPicker } from "@/components/storefront/manage/map-picker";
import {
  STOREFRONT_TEMPLATES,
  STOREFRONT_ORDER_STATUS_FA,
  storefrontOrderStatusColor,
  rialToTomanLabel,
  maskCardNumberForPanel,
  type StorefrontOrderItemDTO,
} from "@/lib/storefront";

/* ═══════════════ انواع ═══════════════ */

interface ManageShop {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  template: string;
  accentColor: string | null;
  isActive: boolean;
  phone: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  socialInstagram: string | null;
  socialTelegram: string | null;
  socialWhatsapp: string | null;
  cardNumber: string | null; // گروه‌بندی‌شده (کامل — مالک کارت خودش است)
  cardNumberSet: boolean;
  cardHolderName: string | null;
  cardImage: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
  // ─── R16 / Task 1-a / Task 1-c ───
  businessType: string | null;
  announcement: string | null;
  discountCode: string | null;
  discountPercent: number | null;
  ticketEnabled: boolean;
  customDomain: string | null;
  gatewayMerchantId: string | null;
  gatewaySandbox: boolean;
  wizardDone?: boolean;
  content?: unknown;
}

interface ManageStats {
  ordersByStatus: Record<string, number>;
  approvedRevenueRial: string;
  totalOrders: number;
  views: number;
  customers: number;
  products: number;
  openTickets?: number;
  // ─── Task 4: نوار آمار داشبورد ───
  ordersToday?: number;
  pendingReviews?: number;
  lowStockCount?: number;
}

interface OwnerOrder {
  id: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string;
  registeredCustomer: string | null;
  items: StorefrontOrderItemDTO[];
  totalRial: string;
  status: string;
  receiptUrl: string | null;
  note: string | null;
  createdAt: string;
  // R17-C — فاکتور حسابداری صادرشده برای این سفارش (پس از تأیید)
  invoiceNumber: string | null;
}

interface OwnerCustomer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
  orderCount: number;
  approvedRevenueRial: string;
}

/* ═══════════════ پیش‌نمایش مینی قالب ═══════════════ */

const TEMPLATE_PALETTES: Record<string, { bg: string; hero: string; card: string; accent: string; text: string }> = {
  modern: { bg: "bg-white", hero: "bg-emerald-50", card: "bg-white border", accent: "bg-emerald-500", text: "text-zinc-900" },
  bazaar: { bg: "bg-[#fdf8f2]", hero: "bg-amber-100", card: "bg-white border-2 border-amber-800/30", accent: "bg-amber-800", text: "text-amber-950" },
  minimal: { bg: "bg-white", hero: "bg-zinc-50", card: "bg-white border border-zinc-200", accent: "bg-zinc-900", text: "text-zinc-900" },
  luxury: { bg: "bg-zinc-950", hero: "bg-zinc-900", card: "bg-zinc-900 border border-zinc-800", accent: "bg-amber-300", text: "text-amber-100" },
  retail: { bg: "bg-rose-50", hero: "bg-rose-100", card: "bg-white ring-1 ring-rose-200", accent: "bg-rose-500", text: "text-zinc-900" },
};

function TemplateMiniPreview({ templateId }: { templateId: string }) {
  const p = TEMPLATE_PALETTES[templateId] ?? TEMPLATE_PALETTES.modern;
  return (
    <div className={`overflow-hidden rounded-xl ${p.bg} ${p.text}`} aria-hidden="true">
      {/* هیرو مینی */}
      <div className={`flex h-12 items-center justify-center ${p.hero}`}>
        <span className={`h-2 w-16 rounded-full ${p.accent} opacity-80`} />
      </div>
      {/* شبکه کالا مینی */}
      <div className="grid grid-cols-3 gap-1.5 p-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`overflow-hidden rounded-lg ${p.card}`}>
            <div className={`h-8 ${p.hero}`} />
            <div className="space-y-1 p-1.5">
              <span className={`block h-1.5 w-3/4 rounded-full bg-current opacity-20`} />
              <span className={`block h-1.5 w-1/2 rounded-full ${p.accent} opacity-70`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════ ماژول ═══════════════ */

export function StorefrontManageModule() {
  const { toast } = useToast();

  const [loading, setLoading] = React.useState(true);
  const [shop, setShop] = React.useState<ManageShop | null>(null);
  const [stats, setStats] = React.useState<ManageStats | null>(null);
  // Task 1-a — وضعیت دسترسی فعال‌سازی عمومی (پلن/دسترسی ویژه/مسدود) از GET manage
  const [access, setAccess] = React.useState<StorefrontAccessInfo | null>(null);

  // فرم تنظیمات
  const [form, setForm] = React.useState({
    title: "",
    description: "",
    slug: "",
    template: "modern",
    accentColor: "",
    isActive: false,
    phone: "",
    address: "",
    city: "",
    lat: "",
    lng: "",
    socialInstagram: "",
    socialTelegram: "",
    socialWhatsapp: "",
    cardNumber: "",
    cardHolderName: "",
    seoTitle: "",
    seoDescription: "",
    // R16
    announcement: "",
    discountCode: "",
    discountPercent: "",
    ticketEnabled: false,
    customDomain: "",
    // Task 1-c — درگاه اختصاصی
    gatewayMerchantId: "",
    gatewaySandbox: false,
  });
  const [cardImage, setCardImage] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [slugCheck, setSlugCheck] = React.useState<{ checking: boolean; available: boolean | null; reason: string | null }>({
    checking: false,
    available: null,
    reason: null,
  });

  // سفارش‌ها
  const [ordersTab, setOrdersTab] = React.useState("ALL");
  const [orders, setOrders] = React.useState<OwnerOrder[] | null>(null);
  const [ordersLoading, setOrdersLoading] = React.useState(false);
  const [receiptPreview, setReceiptPreview] = React.useState<string | null>(null);
  const [rejectOrder, setRejectOrder] = React.useState<OwnerOrder | null>(null);
  const [orderBusyId, setOrderBusyId] = React.useState<string | null>(null);

  // مشتریان
  const [customers, setCustomers] = React.useState<OwnerCustomer[] | null>(null);

  const [copiedLink, setCopiedLink] = React.useState(false);

  /* ── بارگذاری اولیه ── */
  const loadManage = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/storefront/manage", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "خطا", description: json?.error || "خطا در دریافت اطلاعات فروشگاه", variant: "destructive" });
        return;
      }
      const s = json.shop as ManageShop | null;
      setShop(s);
      setStats(json.stats as ManageStats);
      setAccess((json.access as StorefrontAccessInfo | null) ?? null);
      if (s) {
        setForm({
          title: s.title ?? "",
          description: s.description ?? "",
          slug: s.slug ?? "",
          template: s.template ?? "modern",
          accentColor: s.accentColor ?? "",
          isActive: !!s.isActive,
          phone: s.phone ?? "",
          address: s.address ?? "",
          city: s.city ?? "",
          lat: s.lat !== null && s.lat !== undefined ? String(s.lat) : "",
          lng: s.lng !== null && s.lng !== undefined ? String(s.lng) : "",
          socialInstagram: s.socialInstagram ?? "",
          socialTelegram: s.socialTelegram ?? "",
          socialWhatsapp: s.socialWhatsapp ?? "",
          cardNumber: s.cardNumber ?? "",
          cardHolderName: s.cardHolderName ?? "",
          seoTitle: s.seoTitle ?? "",
          seoDescription: s.seoDescription ?? "",
          // R16
          announcement: s.announcement ?? "",
          discountCode: s.discountCode ?? "",
          discountPercent: s.discountPercent != null ? String(s.discountPercent) : "",
          ticketEnabled: !!s.ticketEnabled,
          customDomain: s.customDomain ?? "",
          gatewayMerchantId: s.gatewayMerchantId ?? "",
          gatewaySandbox: !!s.gatewaySandbox,
        });
        setCardImage(s.cardImage ?? null);
      }
    } catch {
      toast({ title: "خطای شبکه", description: "دوباره تلاش کنید", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void loadManage();
  }, [loadManage]);

  const loadOrders = React.useCallback(
    async (status: string) => {
      setOrdersLoading(true);
      try {
        const res = await authFetch(`/api/storefront/manage/orders${status !== "ALL" ? `?status=${status}` : ""}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success) setOrders(json.orders as OwnerOrder[]);
      } catch {
        /* ignore */
      } finally {
        setOrdersLoading(false);
      }
    },
    []
  );

  React.useEffect(() => {
    if (shop) void loadOrders(ordersTab);
  }, [shop, ordersTab, loadOrders]);

  const loadCustomers = React.useCallback(async () => {
    try {
      const res = await authFetch("/api/storefront/manage/customers", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) setCustomers(json.customers as OwnerCustomer[]);
    } catch {
      /* ignore */
    }
  }, []);

  /* ── ذخیره تنظیمات ── */
  async function saveSettings(overrides?: Partial<typeof form>) {
    const payload = { ...form, ...overrides };
    setSaving(true);
    try {
      const res = await authFetch("/api/storefront/manage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.title,
          description: payload.description || null,
          slug: payload.slug,
          template: payload.template,
          accentColor: payload.accentColor || null,
          isActive: payload.isActive,
          phone: payload.phone || null,
          address: payload.address || null,
          city: payload.city || null,
          lat: payload.lat === "" ? null : Number(payload.lat),
          lng: payload.lng === "" ? null : Number(payload.lng),
          socialInstagram: payload.socialInstagram || null,
          socialTelegram: payload.socialTelegram || null,
          socialWhatsapp: payload.socialWhatsapp || null,
          cardNumber: payload.cardNumber || null,
          cardHolderName: payload.cardHolderName || null,
          seoTitle: payload.seoTitle || null,
          seoDescription: payload.seoDescription || null,
          // R16
          announcement: payload.announcement || null,
          discountCode: payload.discountCode || null,
          discountPercent: payload.discountPercent === "" ? null : Number(payload.discountPercent),
          ticketEnabled: payload.ticketEnabled,
          customDomain: payload.customDomain || null,
          gatewayMerchantId: payload.gatewayMerchantId?.trim() || null,
          gatewaySandbox: payload.gatewaySandbox,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        // Task 1-a — خطای گیت دسترسی (402): پیام فارسی سرور + بازگرداندن سوییچ فعال‌سازی
        // به وضعیت واقعی سرور تا UI دروغ نگویید؛ برای PLAN_REQUIRED دکمهٔ «مشاهده پلن‌ها»
        if (res.status === 402 && json?.code) {
          setForm((f) => ({ ...f, isActive: shop?.isActive ?? false }));
          if (json.access) setAccess(json.access as StorefrontAccessInfo);
          toast({
            title: "فعال‌سازی عمومی ممکن نشد",
            description: String(json.error ?? "دسترسی فروشگاه آنلاین کافی نیست"),
            variant: "destructive",
            duration: 9000,
            ...(json.code === "PLAN_REQUIRED"
              ? {
                  action: (
                    <ToastAction
                      altText="مشاهده پلن‌ها"
                      onClick={() => window.open("/pricing", "_blank", "noopener")}
                    >
                      مشاهده پلن‌ها
                    </ToastAction>
                  ),
                }
              : {}),
          });
          return false;
        }
        toast({ title: "ذخیره نشد", description: json?.error || "خطا در ذخیره تنظیمات", variant: "destructive" });
        return false;
      }
      toast({ title: "ذخیره شد", description: json.message ?? "تنظیمات فروشگاه به‌روزرسانی شد" });
      await loadManage();
      return true;
    } catch {
      toast({ title: "خطای شبکه", description: "دوباره تلاش کنید", variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  }

  /* ── تغییر وضعیت سفارش ── */
  async function setOrderStatus(order: OwnerOrder, status: "APPROVED" | "REJECTED" | "SHIPPED") {
    setOrderBusyId(order.id);
    try {
      const res = await authFetch(`/api/storefront/manage/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "تغییر وضعیت ناموفق", description: json?.error || "دوباره تلاش کنید", variant: "destructive" });
        return;
      }
      toast({
        title: status === "APPROVED" ? "سفارش تأیید شد" : status === "SHIPPED" ? "ارسال ثبت شد" : "سفارش رد شد",
        description: `سفارش ${order.customerName}`,
      });
      await loadOrders(ordersTab);
    } catch {
      toast({ title: "خطای شبکه", description: "دوباره تلاش کنید", variant: "destructive" });
    } finally {
      setOrderBusyId(null);
    }
  }

  /* ── بررسی slug ── */
  async function checkSlug() {
    const s = form.slug.trim().toLowerCase();
    if (!s) return;
    setSlugCheck({ checking: true, available: null, reason: null });
    try {
      const res = await authFetch(`/api/storefront/manage/slug-check?slug=${encodeURIComponent(s)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setSlugCheck({ checking: false, available: !!json.available, reason: json.reason ?? null });
      } else {
        setSlugCheck({ checking: false, available: null, reason: json?.error ?? null });
      }
    } catch {
      setSlugCheck({ checking: false, available: null, reason: "خطای شبکه" });
    }
  }

  /* ── آپلود تصویر کارت ── */
  async function uploadCardImage(file: File) {
    const fd = new FormData();
    fd.set("cardImage", file);
    try {
      const res = await authFetch("/api/storefront/manage/card-image", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "آپلود ناموفق", description: json?.error || "دوباره تلاش کنید", variant: "destructive" });
        return;
      }
      setCardImage(json.cardImage as string);
      toast({ title: "تصویر کارت آپلود شد", description: "مشتریان در مرحله پرداخت آن را می‌بینند" });
    } catch {
      toast({ title: "خطای شبکه", description: "دوباره تلاش کنید", variant: "destructive" });
    }
  }

  function copyShopLink() {
    const link = `${typeof window !== "undefined" ? window.location.origin : ""}/shop/${form.slug}`;
    navigator.clipboard
      .writeText(link)
      .then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
        toast({ title: "لینک فروشگاه کپی شد", description: link });
      })
      .catch(() => toast({ title: "کپی نشد", variant: "destructive" }));
  }

  const shopUrl = shop ? `/shop/${shop.slug}` : null;

  /* ═══════════════ حالت خالی — CTA فعال‌سازی ═══════════════ */
  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!shop) {
    return (
      <Card className="border-primary/30 bg-gradient-to-b from-primary/5 to-transparent">
        <CardHeader className="items-center text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Store className="h-8 w-8" aria-hidden="true" />
          </span>
          <CardTitle className="mt-3 text-xl sm:text-2xl">فروشگاه آنلاین خود را فعال کنید</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <ul className="grid gap-3 text-sm leading-7 sm:grid-cols-2" role="list">
            <li className="flex items-start gap-2 rounded-xl border bg-card p-3">
              <BadgeCheck className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              کالاها و قیمت‌های نرم‌افزار حسابداری‌تان به‌صورت خودکار و زنده در فروشگاه نمایش داده می‌شوند — بدون ثبت مجدد.
            </li>
            <li className="flex items-center gap-2 rounded-xl border bg-card p-3">
              <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              لینک اختصاصی قابل اشتراک در اینستاگرام و تلگرام: مشتری بدون نصب هیچ برنامه‌ای خرید می‌کند.
            </li>
            <li className="flex items-center gap-2 rounded-xl border bg-card p-3">
              <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              پرداخت کارت‌به‌کارت با ارسال رسید توسط مشتری و تأیید یک‌کلیکی شما.
            </li>
            <li className="flex items-center gap-2 rounded-xl border bg-card p-3">
              <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              ۵ قالب آماده زیبا + انتخاب رنگ تاکیدی؛ سفارش‌ها با اعلان درون‌برنامه‌ای خبرتان می‌کنند.
            </li>
          </ul>

          <div className="rounded-2xl border bg-card p-4 sm:p-6">
            <h3 className="mb-4 text-base font-bold">راه‌اندازی در ۳۰ ثانیه</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sf-new-slug">آدرس فروشگاه (لاتین، ۳ تا ۴۰ نویسه)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="sf-new-slug"
                    dir="ltr"
                    placeholder="my-shop"
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().trim() }))}
                    className="font-mono"
                  />
                  <Button variant="outline" size="icon" onClick={checkSlug} aria-label="بررسی آزاد بودن آدرس">
                    {slugCheck.checking ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Search className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
                {slugCheck.available === true ? (
                  <p className="text-xs font-medium text-emerald-600">این آدرس آزاد است</p>
                ) : slugCheck.available === false ? (
                  <p className="text-xs font-medium text-red-600">{slugCheck.reason}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">مثال: nobat-cafe — در نوار جستجو بررسی کنید</p>
                )}
                <p dir="ltr" className="truncate text-xs text-muted-foreground">
                  /shop/{form.slug || "your-shop"}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sf-new-title">عنوان فروشگاه</Label>
                <Input
                  id="sf-new-title"
                  placeholder="مثلاً: کافه نوبت"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  بعد از ساخت، از «تنظیمات فروشگاه» قالب، کارت پرداخت، نقشه و سئو را کامل کنید.
                </p>
              </div>
            </div>
            <Button
              className="mt-4 w-full gap-2 sm:w-auto"
              disabled={saving || !form.slug || !form.title || slugCheck.available === false}
              onClick={() => void saveSettings({ isActive: true })}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Store className="h-4 w-4" aria-hidden="true" />}
              ساخت و فعال‌سازی فروشگاه
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  /* ═══════════════ رندر اصلی (تب‌ها) ═══════════════ */

  return (
    <div className="space-y-4">
      {/* هدر ماژول */}
      <Card className="border-primary/25 bg-gradient-to-l from-primary/5 to-transparent">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Store className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="flex items-center gap-2 font-bold">
                  {shop.title}
                  {shop.isActive ? (
                    <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                      فعال
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted">غیرفعال</Badge>
                  )}
                </p>
                <a
                  href={shopUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  dir="ltr"
                >
                  {shopUrl}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2 rounded-full" onClick={copyShopLink}>
                {copiedLink ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                کپی لینک فروشگاه
              </Button>
              <Button variant="outline" size="sm" className="gap-2 rounded-full" onClick={() => void loadManage()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                به‌روزرسانی
              </Button>
            </div>
          </div>

          {/* Task 4 — نوار آمار لحظه‌ای کسب‌وکار (مثل داشبورد وردپرس/ووکامرس) */}
          {stats ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-xl border bg-card p-2.5 text-center">
                <p className="text-lg font-black tabular-nums text-primary">{toPersianDigits(stats.ordersToday ?? 0)}</p>
                <p className="mt-0.5 text-[10px] font-medium leading-4 text-muted-foreground">سفارش امروز</p>
              </div>
              <div className="rounded-xl border bg-card p-2.5 text-center">
                <p className="text-lg font-black tabular-nums text-emerald-600">
                  {rialToTomanLabel(stats.approvedRevenueRial ?? "0").replace(" تومان", "")}
                </p>
                <p className="mt-0.5 text-[10px] font-medium leading-4 text-muted-foreground">درآمد تأییدشده (تومان)</p>
              </div>
              <div className="rounded-xl border bg-card p-2.5 text-center">
                <p className="text-lg font-black tabular-nums text-violet-600">{toPersianDigits(stats.ordersByStatus["AWAITING_APPROVAL"] ?? 0)}</p>
                <p className="mt-0.5 text-[10px] font-medium leading-4 text-muted-foreground">در انتظار تأیید</p>
              </div>
              <button
                type="button"
                className="rounded-xl border bg-card p-2.5 text-center transition-colors hover:border-amber-300"
                onClick={() => {
                  document.getElementById<HTMLButtonElement>("sf-tab-reviews")?.click();
                }}
                title="رفتن به مدیریت نظرات"
              >
                <p className="text-lg font-black tabular-nums text-amber-600">{toPersianDigits(stats.pendingReviews ?? 0)}</p>
                <p className="mt-0.5 text-[10px] font-medium leading-4 text-muted-foreground">نظر در انتظار</p>
              </button>
              <div className="rounded-xl border bg-card p-2.5 text-center">
                <p className="text-lg font-black tabular-nums text-red-600">{toPersianDigits(stats.lowStockCount ?? 0)}</p>
                <p className="mt-0.5 text-[10px] font-medium leading-4 text-muted-foreground">کم‌موجودی</p>
              </div>
              <div className="rounded-xl border bg-card p-2.5 text-center">
                <p className="text-lg font-black tabular-nums text-muted-foreground">{toPersianDigits(stats.customers)}</p>
                <p className="mt-0.5 text-[10px] font-medium leading-4 text-muted-foreground">مشتری عضو</p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="orders" dir="rtl">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="wizard" className="gap-1.5">
            <Wand2 className="h-4 w-4" aria-hidden="true" />
            ساخت هوشمند
          </TabsTrigger>
          <TabsTrigger value="editor" className="gap-1.5">
            <Pencil className="h-4 w-4" aria-hidden="true" />
            ویرایشگر سایت
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5">
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            سفارش‌ها
            {stats && stats.ordersByStatus["AWAITING_APPROVAL"] > 0 ? (
              <Badge variant="outline" className="ml-1 bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300">
                {toPersianDigits(stats.ordersByStatus["AWAITING_APPROVAL"])}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            تنظیمات فروشگاه
          </TabsTrigger>
          <TabsTrigger value="customers" className="gap-1.5" onClick={() => void loadCustomers()}>
            <Users className="h-4 w-4" aria-hidden="true" />
            مشتریان
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            آمار
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-1.5">
            <Package className="h-4 w-4" aria-hidden="true" />
            کالاها و عکس
          </TabsTrigger>
          {/* v20-C — ویرایشگر دسته‌بندی‌ها */}
          <TabsTrigger value="categories" className="gap-1.5">
            <Layers className="h-4 w-4" aria-hidden="true" />
            دسته‌بندی‌ها
          </TabsTrigger>
          <TabsTrigger value="tickets" className="gap-1.5">
            <Ticket className="h-4 w-4" aria-hidden="true" />
            تیکت‌ها
            {stats && stats.openTickets && stats.openTickets > 0 ? (
              <Badge variant="outline" className="ml-1 bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                {toPersianDigits(stats.openTickets)}
              </Badge>
            ) : null}
          </TabsTrigger>
          {/* v20-C — نظرات فروشگاه */}
          <TabsTrigger value="reviews" id="sf-tab-reviews" className="gap-1.5">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            نظرات
          </TabsTrigger>
          {/* Task 3-g — بلاگ اختصاصی فروشگاه */}
          <TabsTrigger value="blog" className="gap-1.5">
            <FileText className="h-4 w-4" aria-hidden="true" />
            وبلاگ
          </TabsTrigger>
        </TabsList>

        {/* ═══════════ R16: تب ساخت هوشمند ═══════════ */}
        <TabsContent value="wizard" className="mt-4">
          <StorefrontWizardTab
            shopSlug={shop?.slug ?? null}
            wizardDone={!!shop?.wizardDone}
            access={access}
            onDone={() => void loadManage()}
          />
        </TabsContent>

        {/* ═══════════ R24-4: تب ویرایشگر سایت (بلوکی حرفه‌ای + بخشی ساده) ═══════════ */}
        <TabsContent value="editor" className="mt-4">
          {/* R25-A2/B2 — انتشار/لغو انتشار بلوک‌ها حالت سایت را عوض می‌کند؛ پنل رفرش شود */}
          <EditorTabSwitcher shopSlug={shop?.slug ?? null} onShopMayChange={() => void loadManage()} />
        </TabsContent>

        {/* ═══════════ R24-4: تب کالاها — مدیر حرفه‌ای محصولات ═══════════ */}
        <TabsContent value="products" className="mt-4">
          <StorefrontProductsManager />
        </TabsContent>

        {/* ═══════════ v20-C: تب دسته‌بندی‌ها ═══════════ */}
        <TabsContent value="categories" className="mt-4">
          <StorefrontCategoriesTab />
        </TabsContent>

        {/* ═══════════ R16: تب تیکت‌ها ═══════════ */}
        <TabsContent value="tickets" className="mt-4">
          <StorefrontTicketsTab />
        </TabsContent>

        {/* ═══════════ v20-C: تب نظرات فروشگاه ═══════════ */}
        <TabsContent value="reviews" className="mt-4">
          <ReviewsTab slug={shop?.slug ?? ""} onChanged={() => void loadManage()} />
        </TabsContent>

        {/* ═══════════ Task 3-g: تب وبلاگ — نوشتن و انتشار مقاله ═══════════ */}
        <TabsContent value="blog" className="mt-4">
          <BlogTab slug={shop?.slug ?? ""} onChanged={() => void loadManage()} />
        </TabsContent>

        {/* ═══════════ تب سفارش‌ها ═══════════ */}
        <TabsContent value="orders" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {["ALL", "PENDING", "AWAITING_APPROVAL", "APPROVED", "SHIPPED", "REJECTED"].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={ordersTab === s ? "default" : "outline"}
                className="rounded-full"
                onClick={() => setOrdersTab(s)}
              >
                {s === "ALL" ? "همه" : STOREFRONT_ORDER_STATUS_FA[s] ?? s}
                {s !== "ALL" && stats?.ordersByStatus[s] ? (
                  <span className="mr-1 opacity-70">{toPersianDigits(stats.ordersByStatus[s])}</span>
                ) : null}
              </Button>
            ))}
          </div>

          {ordersLoading ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : orders && orders.length > 0 ? (
            <ul className="grid gap-3 lg:grid-cols-2" role="list">
              {orders.map((o) => (
                <li key={o.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-2 font-bold">
                        <ReceiptText className="h-4 w-4 text-primary" aria-hidden="true" />
                        {o.customerName}
                        {o.registeredCustomer ? (
                          <Badge variant="outline" className="bg-muted text-[10px]">عضو ثبت‌نام‌شده</Badge>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                        {o.customerEmail}
                        {o.customerPhone ? ` — ${toPersianDigits(o.customerPhone)}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatJalaliDayLabel(o.createdAt)}</p>
                    </div>
                    <Badge variant="outline" className={storefrontOrderStatusColor(o.status)}>
                      {STOREFRONT_ORDER_STATUS_FA[o.status] ?? o.status}
                    </Badge>
                  </div>

                  <ul className="mt-3 space-y-1 rounded-xl bg-muted/50 p-3 text-sm" role="list">
                    {o.items.map((item) => (
                      <li key={item.productId} className="flex items-center justify-between gap-2">
                        <span>
                          {item.name}
                          <span className="text-muted-foreground"> ×{toPersianDigits(item.qty)}</span>
                        </span>
                        <span className="tabular-nums">{rialToTomanLabel(String(BigInt(item.priceRial) * BigInt(item.qty)))}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold">
                      جمع: <span className="tabular-nums text-primary">{rialToTomanLabel(o.totalRial)}</span>
                    </span>
                    {o.invoiceNumber ? (
                      <Badge variant="outline" className="gap-1.5 rounded-full border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        فاکتور فروش {toPersianDigits(o.invoiceNumber)} در حسابداری ثبت شد
                      </Badge>
                    ) : null}
                    {o.receiptUrl ? (
                      <Button variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={() => setReceiptPreview(o.receiptUrl)}>
                        <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
                        مشاهده رسید
                      </Button>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground">بدون رسید</Badge>
                    )}
                  </div>
                  {o.note ? (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:bg-amber-500/10 dark:text-amber-300">
                      یادداشت مشتری: {o.note}
                    </p>
                  ) : null}

                  {/* اکشن‌های وضعیت — یک‌کلیکی */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                    {["PENDING", "AWAITING_RECEIPT", "AWAITING_APPROVAL"].includes(o.status) ? (
                      <>
                        <Button
                          size="sm"
                          className="gap-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700"
                          disabled={orderBusyId === o.id}
                          onClick={() => void setOrderStatus(o, "APPROVED")}
                        >
                          {orderBusyId === o.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          )}
                          تأیید سفارش
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 rounded-full border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                          disabled={orderBusyId === o.id}
                          onClick={() => setRejectOrder(o)}
                        >
                          <XCircle className="h-4 w-4" aria-hidden="true" />
                          رد
                        </Button>
                      </>
                    ) : null}
                    {o.status === "APPROVED" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 rounded-full"
                        disabled={orderBusyId === o.id}
                        onClick={() => void setOrderStatus(o, "SHIPPED")}
                      >
                        {orderBusyId === o.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Truck className="h-4 w-4" aria-hidden="true" />
                        )}
                        ثبت ارسال
                      </Button>
                    ) : null}
                    {o.status === "SHIPPED" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                        ارسال شده — چرخه سفارش کامل است
                      </span>
                    ) : null}
                    {o.status === "REJECTED" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 rounded-full"
                        disabled={orderBusyId === o.id}
                        onClick={() => void setOrderStatus(o, "APPROVED")}
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        بازگرداندن به تأییدشده
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <ShoppingCart className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  سفارشی در این وضعیت نیست — سفارش‌های جدید به‌محض ثبت مشتری اینجا و در زنگ اعلان‌ها ظاهر می‌شوند.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════ تب تنظیمات ═══════════ */}
        <TabsContent value="settings" className="mt-4 space-y-4">
          {/* Task 1-a — وضعیت دسترسی فعال‌سازی عمومی (وقتی مجاز نیست) */}
          {access && !access.allowed ? (
            <div
              role="alert"
              className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm leading-6 ${
                access.reason === "plan_required"
                  ? "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300"
                  : "border-red-200 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
              }`}
            >
              <p className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {access.reason === "plan_required"
                  ? "فعال‌سازی عمومی فروشگاه در پلن‌های حرفه‌ای و سازمانی فعال است — پلن خود را ارتقا دهید یا از مدیر درخواست دسترسی ویژه کنید. ساخت سایت و پیش‌نمایش آزاد است."
                  : access.reason === "override_denied"
                    ? "دسترسی فروشگاه آنلاین برای این حساب توسط مدیر سیستم مسدود شده است."
                    : "فروشگاه آنلاین موقتاً توسط مدیر سیستم غیرفعال است."}
              </p>
              {access.reason === "plan_required" ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5 rounded-full border-violet-300 text-violet-700 hover:bg-violet-100 hover:text-violet-800 dark:border-violet-500/40 dark:text-violet-300"
                  onClick={() => window.open("/pricing", "_blank", "noopener")}
                >
                  <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                  مشاهده پلن‌ها
                </Button>
              ) : null}
            </div>
          ) : null}
          {/* فعال‌سازی + ذخیره */}
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <Switch
                  id="sf-active"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                  aria-label="فعال بودن فروشگاه"
                />
                <div>
                  <Label htmlFor="sf-active" className="text-sm font-bold">
                    فروشگاه {form.isActive ? "فعال" : "غیرفعال"} است
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {form.isActive ? "صفحه عمومی شما برای مشتریان در دسترس است." : "تا فعال نشود، صفحه عمومی ۴۰۴ می‌دهد."}
                  </p>
                </div>
              </div>
              <Button className="gap-2" disabled={saving} onClick={() => void saveSettings()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                ذخیره همه تنظیمات
              </Button>
            </CardContent>
          </Card>

          {/* اطلاعات پایه + آدرس فروشگاه */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4 text-primary" aria-hidden="true" />
                اطلاعات و آدرس فروشگاه
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sf-title">عنوان فروشگاه</Label>
                <Input id="sf-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sf-slug">آدرس یکتا (slug)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="sf-slug"
                    dir="ltr"
                    className="font-mono"
                    value={form.slug}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().trim() }));
                      setSlugCheck({ checking: false, available: null, reason: null });
                    }}
                  />
                  <Button variant="outline" size="icon" onClick={checkSlug} aria-label="بررسی آزاد بودن آدرس">
                    {slugCheck.checking ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Search className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
                {slugCheck.available === true ? (
                  <p className="text-xs font-medium text-emerald-600">آزاد است — قابل استفاده</p>
                ) : slugCheck.available === false ? (
                  <p className="text-xs font-medium text-red-600">{slugCheck.reason}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">حروف لاتین کوچک، رقم و خط تیره — ۳ تا ۴۰ نویسه</p>
                )}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sf-desc">توضیحات (در صفحه فروشگاه و گوگل دیده می‌شود)</Label>
                <Textarea
                  id="sf-desc"
                  rows={3}
                  maxLength={2000}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="معرفی کوتاه کسب‌وکار، ساعات پاسخگویی، شرایط ارسال و..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sf-phone">شماره تماس</Label>
                <Input id="sf-phone" dir="ltr" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="09123456789" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sf-city">شهر</Label>
                <Input id="sf-city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="تهران" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sf-address">آدرس کامل</Label>
                <Textarea id="sf-address" rows={2} maxLength={300} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              </div>

              <Separator className="sm:col-span-2" />

              {/* مختصات + نقشه — v20: انتخاب کلیکی روی نقشهٔ تعاملی */}
              <div className="space-y-2 sm:col-span-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
                  موقعیت روی نقشه (اختیاری — در فوتر فروشگاه با نقشهٔ تعاملی نمایش داده می‌شود)
                </Label>
                <MapPicker
                  lat={form.lat === "" ? null : Number(form.lat)}
                  lng={form.lng === "" ? null : Number(form.lng)}
                  onChange={(la, ln) => setForm((f) => ({ ...f, lat: String(la), lng: String(ln) }))}
                  height="300px"
                />
                <p className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  روی نقشه کلیک کنید، مارکر را بکشید یا آدرس را جستجو کنید — مختصات خودکار ثبت می‌شود. حذف موقعیت: مختصات را در کادر پایین پاک کنید.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="sf-lat" className="text-xs text-muted-foreground">
                      عرض جغرافیایی (lat)
                    </Label>
                    <Input
                      id="sf-lat"
                      dir="ltr"
                      inputMode="decimal"
                      placeholder="35.6892"
                      value={form.lat}
                      onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sf-lng" className="text-xs text-muted-foreground">
                      طول جغرافیایی (lng)
                    </Label>
                    <Input
                      id="sf-lng"
                      dir="ltr"
                      inputMode="decimal"
                      placeholder="51.3890"
                      value={form.lng}
                      onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <Separator className="sm:col-span-2" />

              {/* شبکه‌های اجتماعی */}
              <div className="space-y-2">
                <Label htmlFor="sf-insta">اینستاگرام (شناسه بدون @)</Label>
                <Input id="sf-insta" dir="ltr" value={form.socialInstagram} onChange={(e) => setForm((f) => ({ ...f, socialInstagram: e.target.value }))} placeholder="myshop" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sf-tg">تلگرام (شناسه بدون @)</Label>
                <Input id="sf-tg" dir="ltr" value={form.socialTelegram} onChange={(e) => setForm((f) => ({ ...f, socialTelegram: e.target.value }))} placeholder="myshop" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sf-wa">واتساپ (شماره بین‌المللی)</Label>
                <Input id="sf-wa" dir="ltr" value={form.socialWhatsapp} onChange={(e) => setForm((f) => ({ ...f, socialWhatsapp: e.target.value }))} placeholder="989123456789" />
              </div>

              <Separator className="sm:col-span-2" />

              {/* سئو */}
              <div className="space-y-2">
                <Label htmlFor="sf-seo-title">عنوان سئو (اختیاری)</Label>
                <Input id="sf-seo-title" maxLength={100} value={form.seoTitle} onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))} placeholder={`خرید آنلاین از ${form.title || "فروشگاه ما"}`} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sf-seo-desc">توضیح متا (اختیاری)</Label>
                <Input id="sf-seo-desc" maxLength={300} value={form.seoDescription} onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value }))} />
              </div>

              <Separator className="sm:col-span-2" />

              {/* ═══ R16: نوار اعلان + تخفیف + تیکت + دامنه ═══ */}
              <div className="space-y-2">
                <Label htmlFor="sf-announce">نوار اعلان بالای سایت (اختیاری)</Label>
                <Input id="sf-announce" maxLength={200} value={form.announcement} onChange={(e) => setForm((f) => ({ ...f, announcement: e.target.value }))} placeholder="مثلاً: ارسال رایگان سفارش‌های بالای ۵۰۰ هزار تومان" />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                <div className="space-y-2">
                  <Label htmlFor="sf-dcode">کد تخفیف فروشگاه (اختیاری)</Label>
                  <Input id="sf-dcode" dir="ltr" className="font-mono" maxLength={32} value={form.discountCode} onChange={(e) => setForm((f) => ({ ...f, discountCode: e.target.value.toUpperCase() }))} placeholder="WELCOME" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sf-dpercent">درصد تخفیف (۱ تا ۵۰)</Label>
                  <Input id="sf-dpercent" type="number" min={1} max={50} value={form.discountPercent} onChange={(e) => setForm((f) => ({ ...f, discountPercent: e.target.value }))} placeholder="10" />
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sf-cdomain">دامنهٔ اختصاصی (اختیاری)</Label>
                <Input id="sf-cdomain" dir="ltr" maxLength={100} value={form.customDomain} onChange={(e) => setForm((f) => ({ ...f, customDomain: e.target.value.toLowerCase() }))} placeholder="my-shop.ir" />
                <p className="text-xs leading-5 text-muted-foreground">
                  اگر دامنهٔ خودتان را دارید وارد کنید — پس از تأیید مالکیت (رکورد DNS) سایت شما روی آن باز می‌شود.
                  پیشنهاد دامنهٔ کوتاه رایگان: از تب «ساخت هوشمند».
                </p>
              </div>
              <div className="flex items-center justify-between rounded-xl border p-3 sm:col-span-2">
                <div>
                  <Label htmlFor="sf-ticket-toggle" className="text-sm">تیکت پشتیبانی مشتریان</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">مشتریان در سایت شما دکمهٔ تیکت می‌بینند؛ پیام‌ها در تب «تیکت‌ها» می‌آید و پاسخ به ایمیلشان می‌رود.</p>
                </div>
                <Switch
                  id="sf-ticket-toggle"
                  checked={form.ticketEnabled}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, ticketEnabled: v }))}
                />
              </div>

              {/* Task 1-c — درگاه پرداخت آنلاین اختصاصی (زرین‌پال) */}
              <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 p-4 sm:col-span-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                  <Label htmlFor="sf-gateway-merchant" className="text-sm font-bold text-emerald-900">درگاه پرداخت آنلاین زرین‌پال</Label>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-emerald-800/80">
                  اگر کد پذیرندگی زرین‌پال دارید، اینجا وارد کنید تا مشتریان به‌جای کارت‌به‌کارت، «پرداخت آنلاین» ببینند.
                  پول مستقیم به حساب شما می‌نشیند و سفارش پس از پرداخت موفق <strong>خودکار تأیید و فاکتورش صادر می‌شود</strong>.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <Label htmlFor="sf-gateway-merchant" className="text-xs text-emerald-900">کد پذیرندگی (Merchant ID)</Label>
                    <Input
                      id="sf-gateway-merchant"
                      dir="ltr"
                      className="mt-1.5 bg-white font-mono text-xs"
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      maxLength={64}
                      value={form.gatewayMerchantId}
                      onChange={(e) => setForm((f) => ({ ...f, gatewayMerchantId: e.target.value.trim() }))}
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-xs font-medium text-emerald-900">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-emerald-600"
                      checked={form.gatewaySandbox}
                      onChange={(e) => setForm((f) => ({ ...f, gatewaySandbox: e.target.checked }))}
                    />
                    حالت تستی (Sandbox)
                  </label>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-emerald-700/70">
                  راهنما: از پنل zarinpal.com → تنظیمات درگاه، «کد پذیرندگی» را کپی کنید. دامنهٔ سایت فروشگاه ({form.customDomain || `ofoghplus.ir/shop/…`}) باید در پنل زرین‌پال ثبت شده باشد.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* قالب + رنگ */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="h-4 w-4 text-primary" aria-hidden="true" />
                قالب و ظاهر فروشگاه — با پیش‌نمایش زنده
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {STOREFRONT_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, template: t.id }))}
                    className={`rounded-2xl border-2 p-3 text-right transition-all hover:shadow-md ${
                      form.template === t.id ? "border-primary shadow-sm" : "border-border"
                    }`}
                    aria-pressed={form.template === t.id}
                  >
                    <div className="mb-2">
                      <TemplateMiniPreview templateId={t.id} />
                    </div>
                    <p className="flex items-center justify-between text-sm font-bold">
                      {t.label}
                      {form.template === t.id ? (
                        <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">انتخاب شما</Badge>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{t.description}</p>
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sf-accent">رنگ تاکیدی دلخواه (اختیاری — کد hex)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="sf-accent"
                      dir="ltr"
                      placeholder="10b981"
                      value={form.accentColor}
                      onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value.trim() }))}
                      className="font-mono"
                    />
                    {form.accentColor ? (
                      <span
                        className="h-9 w-9 shrink-0 rounded-lg border"
                        style={{ backgroundColor: form.accentColor.startsWith("#") ? form.accentColor : `#${form.accentColor}` }}
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">اگر خالی بگذارید، رنگ پیش‌فرض قالب استفاده می‌شود.</p>
                </div>
                <div className="rounded-2xl border bg-muted/40 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">راهنما</p>
                  <p className="mt-1 text-xs leading-6">
                    ۵ قالب حرفه‌ای آماده است و به‌مرور قالب‌های بیشتری اضافه می‌شود. تغییر قالب فوراً پس از «ذخیره» در صفحه عمومی اعمال می‌شود — پیش‌نمایش بالا شبیه‌سازی کوچکی از ظاهر است.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* پرداخت کارت‌به‌کارت */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4 text-primary" aria-hidden="true" />
                پرداخت کارت‌به‌کارت
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sf-card">شماره کارت بانکی</Label>
                <Input
                  id="sf-card"
                  dir="ltr"
                  inputMode="numeric"
                  className="font-mono tracking-widest"
                  placeholder="6037991122334455"
                  value={form.cardNumber}
                  onChange={(e) => setForm((f) => ({ ...f, cardNumber: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  نمایش فعلی: {form.cardNumber ? maskCardNumberForPanel(form.cardNumber) : "—"} — شماره با رمزنگاری AES ذخیره می‌شود و به مشتری برای پرداخت کامل نمایش داده می‌شود.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sf-card-holder">نام صاحب کارت</Label>
                <Input
                  id="sf-card-holder"
                  value={form.cardHolderName}
                  onChange={(e) => setForm((f) => ({ ...f, cardHolderName: e.target.value }))}
                  placeholder="مثلاً: مریم احمدی"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Upload className="h-4 w-4 text-primary" aria-hidden="true" />
                  تصویر کارت (اختیاری — کارت را عکس بگیرید تا مشتری راحت‌تر واریز کند)
                </Label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      انتخاب تصویر کارت
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadCardImage(file);
                      }}
                      aria-label="آپلود تصویر کارت"
                    />
                  </label>
                  {cardImage ? (
                    <div className="relative">
                      {/* تصویر کارت آپلودی مالک */}
                      <img src={cardImage} alt="تصویر کارت بانکی" className="h-20 rounded-lg border object-cover" />
                      <button
                        type="button"
                        className="absolute -right-2 -top-2 rounded-full bg-red-600 p-1 text-white"
                        aria-label="حذف تصویر کارت"
                        onClick={() => setCardImage(null)}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end pb-2">
            <Button className="gap-2" disabled={saving} onClick={() => void saveSettings()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              ذخیره همه تنظیمات
            </Button>
          </div>
        </TabsContent>

        {/* ═══════════ تب مشتریان ═══════════ */}
        <TabsContent value="customers" className="mt-4">
          {customers === null ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : customers.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y" role="list">
                  {customers.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        <p className="font-bold">{c.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">
                          {c.email}
                          {c.phone ? ` — ${toPersianDigits(c.phone)}` : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">عضو از {formatJalaliDayLabel(c.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-center">
                          <p className="font-bold tabular-nums">{toPersianDigits(c.orderCount)}</p>
                          <p className="text-xs text-muted-foreground">سفارش</p>
                        </div>
                        <div className="text-center">
                          <p className="font-bold tabular-nums text-primary">
                            {Number(c.approvedRevenueRial) > 0 ? rialToTomanLabel(c.approvedRevenueRial) : "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">خرید تأییدشده</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <Users className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  هنوز مشتری‌ای ثبت‌نام نکرده — مشتریان هنگام خرید می‌توانند با ایمیل حساب بسازند و سفارش‌هایشان را پیگیری کنند.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════ تب آمار ═══════════ */}
        <TabsContent value="stats" className="mt-4 space-y-4">
          {stats ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Card>
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Eye className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xl font-black tabular-nums">{toPersianDigits(stats.views)}</p>
                      <p className="text-xs text-muted-foreground">بازدید صفحه فروشگاه</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <ShoppingCart className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xl font-black tabular-nums">{toPersianDigits(stats.totalOrders)}</p>
                      <p className="text-xs text-muted-foreground">کل سفارش‌ها</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Users className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xl font-black tabular-nums">{toPersianDigits(stats.customers)}</p>
                      <p className="text-xs text-muted-foreground">مشتری ثبت‌نام‌شده</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Package className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xl font-black tabular-nums">{toPersianDigits(stats.products)}</p>
                      <p className="text-xs text-muted-foreground">کالای همگام از حسابداری</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
                    درآمد تأییدشده
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-black tabular-nums text-primary sm:text-3xl">
                    {rialToTomanLabel(stats.approvedRevenueRial)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">مجموع سفارش‌های تأییدشده و ارسال‌شده (همگام با دفاتر شما نیست — گزارش فروش مستقل فروشگاه)</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">سفارش‌ها به تفکیک وضعیت</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-2 sm:grid-cols-2" role="list">
                    {Object.entries(stats.ordersByStatus).map(([status, count]) => (
                      <li key={status} className="flex items-center justify-between rounded-xl border p-3 text-sm">
                        <Badge variant="outline" className={storefrontOrderStatusColor(status)}>
                          {STOREFRONT_ORDER_STATUS_FA[status] ?? status}
                        </Badge>
                        <span className="font-bold tabular-nums">{toPersianDigits(count)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </TabsContent>
      </Tabs>

      {/* دیالوگ پیش‌نمایش رسید */}
      <Dialog open={!!receiptPreview} onOpenChange={(o) => !o && setReceiptPreview(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>رسید پرداخت مشتری</DialogTitle>
            <DialogDescription>تصویر رسید کارت‌به‌کارت ارسال‌شده توسط مشتری</DialogDescription>
          </DialogHeader>
          {receiptPreview ? (
            // URL امضاشدهٔ private-uploads
            <img src={receiptPreview} alt="رسید پرداخت" className="max-h-[60vh] w-full rounded-xl border object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* تأیید رد سفارش */}
      <AlertDialog open={!!rejectOrder} onOpenChange={(o) => !o && setRejectOrder(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>رد این سفارش؟</AlertDialogTitle>
            <AlertDialogDescription>
              سفارش {rejectOrder?.customerName} به مبلغ{" "}
              {rejectOrder ? rialToTomanLabel(rejectOrder.totalRial) : ""} رد می‌شود و مشتری در «سفارش‌های من» وضعیت «رد شده» را می‌بیند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (rejectOrder) void setOrderStatus(rejectOrder, "REJECTED");
                setRejectOrder(null);
              }}
            >
              بله، رد کن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 * R24-4 — سوئیچ دو حالت ویرایشگر سایت:
 *   ۱) ویرایشگر بلوکی حرفه‌ای (Gutenberg-مانند — پیش‌فرض و پیشنهادی)
 *   ۲) ویرایشگر بخشی سادهٔ نسل قبل (همان StorefrontVisualEditorTab)
 * مالک با انتشار بلوک‌ها، صفحهٔ عمومی را کاملاً بلوک‌محور می‌کند.
 * ═══════════════════════════════════════════════════════════════════ */
function EditorTabSwitcher({ shopSlug, onShopMayChange }: { shopSlug: string | null; onShopMayChange?: () => void }) {
  const [mode, setMode] = React.useState<"blocks" | "sections">("blocks");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-muted/30 p-2">
        <div className="flex items-center gap-1 rounded-full border bg-background p-0.5" role="group" aria-label="حالت ویرایشگر">
          <button
            type="button"
            onClick={() => setMode("blocks")}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
              mode === "blocks" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-muted"
            }`}
            aria-pressed={mode === "blocks"}
          >
            ویرایشگر بلوکی حرفه‌ای
          </button>
          <button
            type="button"
            onClick={() => setMode("sections")}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
              mode === "sections" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-muted"
            }`}
            aria-pressed={mode === "sections"}
          >
            ویرایشگر بخشی (نسل قبل)
          </button>
        </div>
        <p className="text-[11px] leading-5 text-muted-foreground">
          {mode === "blocks"
            ? "صفحه را مثل وردپرس با بلوک بسازید؛ با «انتشار» چیدمان جای قالب ثابت را می‌گیرد."
            : "ویرایش سریع متن/بنر قالب‌های سینمایی — برای تغییرات جزئی."}
        </p>
      </div>
      {mode === "blocks" ? (
        <StorefrontBlockEditor onShopMayChange={onShopMayChange} />
      ) : (
        <StorefrontVisualEditorTab shopSlug={shopSlug} />
      )}
    </div>
  );
}
