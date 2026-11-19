"use client";

/**
 * GoldShopModule — طلا و جواهر (طلافروشی)
 * ============================================================
 * - داشبورد طلا: نرخ لحظه‌ای گرم ۱۸ / گرم ۲۴ / مثقال + اسپارک‌لاین SVG
 *   + جمع موجودی وزنی و ارزش ریالی
 * - کالاهای طلا: جدول با چیپ عیار (کهربایی)، وزن، اجرت، ارزش لحظه‌ای
 *   + افزودن/ویرایش/حذف با Dialog
 * - فاکتور طلا: ساخت فاکتور فروش/بازخرید/معاملهٔ طلا به طلا با تفکیک
 *   ارزش طلا / اجرت / سود / مالیات ۹٪ (فقط اجرت + سود) / قابل پرداخت
 * - اتصالات (API): مستندات اتصال سیستم طلافروشی + آخرین push ها
 */

import * as React from "react";
import {
  Gem,
  RefreshCw,
  Plus,
  Loader2,
  Trash2,
  Pencil,
  Coins,
  Scale,
  TrendingUp,
  TrendingDown,
  FileText,
  Receipt,
  ArrowLeftRight,
  Wallet,
  Plug,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Info,
  Phone,
  User,
  KeyRound,
  ExternalLink,
  Package,
  CircleDollarSign,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/ux/empty-state";
// FIX(A6): toEnglishDigits — ارقام فارسی/عربی ورودی کاربر قبل از parse عددی
import { toPersianDigits, formatNumber, formatToman, formatCompactToman, toJalali, toEnglishDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

/** ورودی عددی کاربر (ممکن است با کیبورد فارسی باشد: ۵/۱۲) → ارقام انگلیسی */
const enNum = (s: string): string => toEnglishDigits(s);

/* ============ انواع ============ */

interface GoldRateInfo {
  ok: boolean;
  karat24Rial: number;
  karat18Rial: number;
  mesghalRial: number;
  source: string;
  fetchedAt: string | null;
}

interface GoldProduct {
  id: string;
  name: string;
  karat: number;
  weightGrams: number;
  makingChargeType: "PER_GRAM" | "PERCENT";
  makingChargeValue: number;
  stoneWeight: number;
  stonePriceRial: number;
  stockWeightGrams: number;
  sellerProfitRate: number;
  category: string | null;
  isActive: boolean;
  gramPriceRial: number;
  goldValueRial: number;
  makingChargeRial: number;
  totalValueRial: number;
  stockCount: number;
  createdAt: string;
}

interface GoldInvoiceItem {
  goldProductId?: string | null;
  name: string;
  karat: number;
  weight: number;
  count: number;
  stoneWeight: number;
  makingChargeType: "PER_GRAM" | "PERCENT";
  makingChargeValue: number;
  stonePriceRial: number;
  gramPriceRial: number;
  goldValueRial: number;
  makingChargeRial: number;
}

interface GoldInvoice {
  id: string;
  invoiceNumber: string;
  type: "SALE" | "BUYBACK" | "EXCHANGE";
  customerName: string | null;
  customerPhone: string | null;
  totalGoldGrams: number;
  receivedGoldGrams: number;
  goldValueRial: number;
  receivedValueRial: number;
  makingChargeRial: number;
  sellerProfitRial: number;
  stoneValueRial: number;
  vatRial: number;
  payableRial: number;
  status: string;
  items: GoldInvoiceItem[];
  createdAt: string;
}

interface IntegrationLog {
  id: string;
  action: string;
  success: boolean;
  detail: string | null;
  apiKeyId: string | null;
  createdAt: string;
}

interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  scopes: string[];
}

/* ============ ثابت‌ها و کمکی‌ها ============ */

const KARAT_LABELS: Record<number, string> = {
  24: "۲۴ عیار",
  22: "۲۲ عیار",
  18: "۱۸ عیار",
  14: "۱۴ عیار",
};

const KARAT_CHIP: Record<number, string> = {
  24: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
  22: "bg-amber-400/15 text-amber-700 border-amber-400/30 dark:text-amber-300",
  18: "bg-teal-500/15 text-teal-700 border-teal-500/30 dark:text-teal-300",
  14: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
};

const INVOICE_TYPE_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  SALE: { label: "فروش", icon: Receipt, color: "bg-teal-500/15 text-teal-700 border-teal-500/30 dark:text-teal-300" },
  BUYBACK: { label: "بازخرید", icon: Coins, color: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300" },
  EXCHANGE: { label: "طلا به طلا", icon: ArrowLeftRight, color: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300" },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  PAID: { label: "پرداخت‌شده", color: "bg-success/15 text-success border-success/30" },
  PENDING: { label: "در انتظار", color: "bg-warning/15 text-warning border-warning/30" },
  DRAFT: { label: "پیش‌نویس", color: "bg-muted text-muted-foreground border-border" },
  CANCELLED: { label: "لغوشده", color: "bg-destructive/15 text-destructive border-destructive/30" },
};

const ACTION_LABELS: Record<string, string> = {
  PUSH_RATE: "ثبت نرخ از سیستم",
  GET_RATE: "دریافت نرخ",
  LIST_INVOICES: "دریافت فاکتورها",
  CREATE_INVOICE: "صدور فاکتور",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "ثبت دستی",
  sync: "همگام‌سازی تگ‌جو",
  integration: "سیستم طلافروشی",
  tgju: "تگ‌جو",
};

const GOLD_CATEGORIES = ["انگشتر", "گردنبند", "دستبند", "النگو", "سکه", "شمش", "گوشواره", "پلاک", "زنجیر", "سایر"];

const VAT_RATE = 0.09; // مالیات ۹٪ فقط روی اجرت + سود

const fmtRialToToman = (rial: number) => Math.trunc(rial / 10);

function fmtGrams(g: number): string {
  return toPersianDigits(formatNumber(g, g % 1 === 0 ? 0 : 2));
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${toJalali(d)} — ${toPersianDigits(
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  )}`;
}

/** اسپارک‌لاین SVG سبک — بدون کتابخانهٔ نمودار */
function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (!data || data.length < 2) {
    return <div className={`h-12 flex items-center justify-center text-[10px] text-muted-foreground ${className ?? ""}`}>داده کافی برای نمودار نیست</div>;
  }
  const w = 220;
  const h = 48;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${h - 4 - ((v - min) / range) * (h - 10)}`);
  const up = data[data.length - 1] >= data[0];
  const stroke = up ? "#14b8a6" : "#f59e0b"; // teal صعودی / amber نزولی — بدون آبی
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`w-full h-12 ${className ?? ""}`} preserveAspectRatio="none">
      <polyline
        points={`0,${h} ${pts.join(" ")} ${w},${h}`}
        fill={up ? "rgba(20,184,166,0.10)" : "rgba(245,158,11,0.10)"}
        stroke="none"
      />
      <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(data.length - 1) * step} cy={h - 4 - ((data[data.length - 1] - min) / range) * (h - 10)} r="3" fill={stroke} />
    </svg>
  );
}

/** محاسبهٔ سمت کلاینت برای پیش‌نمایش فاکتور (با نرخ جاری) */
function computePreview(
  items: GoldInvoiceItem[],
  karat24Rial: number,
  profitRate: number,
  type: "SALE" | "BUYBACK" | "EXCHANGE",
  receivedGrams: number,
  receivedKarat: number
) {
  let goldValue = 0;
  let makingCharge = 0;
  let stoneValue = 0;
  let grams = 0;
  for (const it of items) {
    const net = Math.max(0, it.weight - it.stoneWeight) * (it.count || 1);
    const gramPrice = karat24Rial > 0 ? Math.round((karat24Rial * it.karat) / 24) : 0;
    const gv = Math.round(net * gramPrice);
    const mc = it.makingChargeType === "PERCENT" ? Math.round((gv * it.makingChargeValue) / 100) : Math.round(it.makingChargeValue * net);
    goldValue += gv;
    makingCharge += mc;
    stoneValue += it.stonePriceRial || 0;
    grams += net;
  }
  const profit = type === "BUYBACK" ? 0 : Math.round((goldValue * profitRate) / 100);
  const vat = type === "BUYBACK" ? 0 : Math.round((makingCharge + profit) * VAT_RATE);
  const receivedGramPrice = karat24Rial > 0 ? Math.round((karat24Rial * receivedKarat) / 24) : 0;
  const receivedValue = type === "SALE" ? 0 : Math.round(receivedGrams * receivedGramPrice);
  const payable =
    type === "BUYBACK"
      ? goldValue + stoneValue - makingCharge
      : goldValue + makingCharge + profit + stoneValue + vat - receivedValue;
  return {
    grams: Math.round(grams * 1000) / 1000,
    goldValue,
    makingCharge,
    stoneValue,
    profit,
    vat,
    receivedValue,
    payable,
  };
}

/* ============================================================
 * کامپوننت اصلی
 * ============================================================ */

export function GoldShopModule() {
  const { toast } = useToast();

  /* ---------- نرخ ---------- */
  const [rate, setRate] = React.useState<GoldRateInfo | null>(null);
  const [rateHistory, setRateHistory] = React.useState<number[]>([]);
  const [rateLoading, setRateLoading] = React.useState(true);
  const [rateRefreshing, setRateRefreshing] = React.useState(false);
  const [manualRateOpen, setManualRateOpen] = React.useState(false);
  const [manual18, setManual18] = React.useState("");

  const loadRate = React.useCallback(async () => {
    try {
      const res = await authFetch("/api/gold/rate");
      const json = await res.json();
      if (json.success) {
        setRate(json.rate);
        setRateHistory((json.history ?? []).map((h: { v: number }) => h.v));
      }
    } catch {
      // بی‌صدا — نمایش وضعیت آفلاین در کارت
    } finally {
      setRateLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadRate();
    const t = setInterval(loadRate, 60_000); // به‌روزرسانی خودکار هر ۶۰ ثانیه
    return () => clearInterval(t);
  }, [loadRate]);

  const syncRate = async () => {
    setRateRefreshing(true);
    try {
      const res = await authFetch("/api/gold/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sync: true }),
      });
      const json = await res.json();
      if (json.success) {
        setRate(json.rate);
        toast({ title: "موفق", description: "نرخ طلا از تگ‌جو همگام‌سازی شد" });
        loadRate();
      } else {
        toast({ title: "خطا", description: json.error || "همگام‌سازی ناموفق بود", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
    } finally {
      setRateRefreshing(false);
    }
  };

  const saveManualRate = async () => {
    const raw = enNum(manual18).replace(/[^\d]/g, "");
    if (!raw) {
      toast({ title: "خطا", description: "نرخ گرم ۱۸ را وارد کنید", variant: "destructive" });
      return;
    }
    try {
      const res = await authFetch("/api/gold/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ karat18Rial: Number(raw) * 10 }), // ورودی تومان → ریال
      });
      const json = await res.json();
      if (json.success) {
        setRate(json.rate);
        setManualRateOpen(false);
        setManual18("");
        toast({ title: "موفق", description: "نرخ دستی ثبت شد" });
        loadRate();
      } else {
        toast({ title: "خطا", description: json.error || "ثبت ناموفق بود", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
    }
  };

  /* ---------- کالاها ---------- */
  const [products, setProducts] = React.useState<GoldProduct[]>([]);
  const [productsLoading, setProductsLoading] = React.useState(true);
  const [productDialogOpen, setProductDialogOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<GoldProduct | null>(null);
  const [deletingProduct, setDeletingProduct] = React.useState<GoldProduct | null>(null);
  const [savingProduct, setSavingProduct] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    karat: "18",
    weightGrams: "",
    stoneWeight: "",
    makingChargeType: "PER_GRAM" as "PER_GRAM" | "PERCENT",
    makingChargeValue: "",
    stonePrice: "",
    stockWeight: "",
    sellerProfitRate: "7",
    category: "انگشتر",
  });

  const loadProducts = React.useCallback(async () => {
    try {
      const res = await authFetch("/api/gold/products");
      const json = await res.json();
      if (json.success) setProducts(json.data ?? []);
    } catch {
      // ignore
    } finally {
      setProductsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const openProductDialog = (p: GoldProduct | null) => {
    setEditingProduct(p);
    setForm({
      name: p?.name ?? "",
      karat: String(p?.karat ?? 18),
      weightGrams: p ? String(p.weightGrams) : "",
      stoneWeight: p ? String(p.stoneWeight) : "0",
      makingChargeType: p?.makingChargeType ?? "PER_GRAM",
      makingChargeValue: p ? String(p.makingChargeValue) : "",
      stonePrice: p ? String(Math.trunc(p.stonePriceRial / 10)) : "0",
      stockWeight: p ? String(p.stockWeightGrams) : "",
      sellerProfitRate: p ? String(p.sellerProfitRate) : "7",
      category: p?.category ?? "انگشتر",
    });
    setProductDialogOpen(true);
  };

  const saveProduct = async () => {
    if (!form.name.trim()) {
      toast({ title: "خطا", description: "نام کالا الزامی است", variant: "destructive" });
      return;
    }
    const weight = Number(enNum(form.weightGrams).replace(/[^\d.]/g, ""));
    if (!weight || weight <= 0) {
      toast({ title: "خطا", description: "وزن کالا باید بزرگ‌تر از صفر باشد", variant: "destructive" });
      return;
    }
    setSavingProduct(true);
    try {
      const payload = {
        name: form.name.trim(),
        karat: Number(form.karat),
        weightGrams: weight,
        stoneWeight: Number(enNum(form.stoneWeight).replace(/[^\d.]/g, "")) || 0,
        makingChargeType: form.makingChargeType,
        makingChargeValue: Number(enNum(form.makingChargeValue).replace(/[^\d.]/g, "")) || 0,
        stonePriceRial: (Number(enNum(form.stonePrice).replace(/[^\d]/g, "")) || 0) * 10, // تومان → ریال
        stockWeightGrams: Number(enNum(form.stockWeight).replace(/[^\d.]/g, "")) || 0,
        sellerProfitRate: Number(enNum(form.sellerProfitRate).replace(/[^\d.]/g, "")) || 0,
        category: form.category,
      };
      const res = await authFetch(
        editingProduct ? `/api/gold/products/${editingProduct.id}` : "/api/gold/products",
        {
          method: editingProduct ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (json.success) {
        toast({ title: "موفق", description: json.message || "ذخیره شد" });
        setProductDialogOpen(false);
        loadProducts();
      } else {
        toast({ title: "خطا", description: json.error || "ذخیره ناموفق بود", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
    } finally {
      setSavingProduct(false);
    }
  };

  const deleteProduct = async () => {
    if (!deletingProduct) return;
    setSavingProduct(true);
    try {
      const res = await authFetch(`/api/gold/products/${deletingProduct.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast({ title: "موفق", description: "کالای طلا حذف شد" });
        setDeletingProduct(null);
        loadProducts();
      } else {
        toast({ title: "خطا", description: json.error || "حذف ناموفق بود", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
    } finally {
      setSavingProduct(false);
    }
  };

  /* ---------- فاکتور ---------- */
  const [invoices, setInvoices] = React.useState<GoldInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = React.useState(true);
  const [invoiceType, setInvoiceType] = React.useState<"SALE" | "BUYBACK" | "EXCHANGE">("SALE");
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [profitRate, setProfitRate] = React.useState("7");
  const [receivedGrams, setReceivedGrams] = React.useState("");
  const [receivedKarat, setReceivedKarat] = React.useState("18");
  const [invoiceItems, setInvoiceItems] = React.useState<GoldInvoiceItem[]>([]);
  const [savingInvoice, setSavingInvoice] = React.useState(false);
  const [detailInvoice, setDetailInvoice] = React.useState<GoldInvoice | null>(null);
  // فرم افزودن قلم
  const [pickProduct, setPickProduct] = React.useState("");
  const [itemWeight, setItemWeight] = React.useState("");
  const [itemCount, setItemCount] = React.useState("1");
  const [itemCharge, setItemCharge] = React.useState("");

  const loadInvoices = React.useCallback(async () => {
    try {
      const res = await authFetch("/api/gold/invoices?limit=100");
      const json = await res.json();
      if (json.success) setInvoices(json.data ?? []);
    } catch {
      // ignore
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const addItem = () => {
    const gp = products.find((p) => p.id === pickProduct);
    const weight = Number(enNum(itemWeight).replace(/[^\d.]/g, "")) || gp?.weightGrams || 0;
    if (!gp && !weight) {
      toast({ title: "خطا", description: "کالا یا وزن را وارد کنید", variant: "destructive" });
      return;
    }
    setInvoiceItems((prev) => [
      ...prev,
      {
        goldProductId: gp?.id ?? null,
        name: gp?.name ?? "کالای متفرقه",
        karat: gp?.karat ?? 18,
        weight,
        count: Number(enNum(itemCount).replace(/[^\d]/g, "")) || 1,
        stoneWeight: gp?.stoneWeight ?? 0,
        makingChargeType: gp?.makingChargeType ?? "PER_GRAM",
        makingChargeValue:
          enNum(itemCharge).replace(/[^\d.]/g, "") !== ""
            ? Number(enNum(itemCharge).replace(/[^\d.]/g, ""))
            : gp?.makingChargeValue ?? 0,
        stonePriceRial: gp?.stonePriceRial ?? 0,
        gramPriceRial: 0,
        goldValueRial: 0,
        makingChargeRial: 0,
      },
    ]);
    setPickProduct("");
    setItemWeight("");
    setItemCount("1");
    setItemCharge("");
  };

  const preview = React.useMemo(
    () =>
      computePreview(
        invoiceItems,
        rate?.karat24Rial ?? 0,
        Number(enNum(profitRate).replace(/[^\d.]/g, "")) || 0,
        invoiceType,
        Number(enNum(receivedGrams).replace(/[^\d.]/g, "")) || 0,
        Number(receivedKarat) || 18
      ),
    [invoiceItems, rate, profitRate, invoiceType, receivedGrams, receivedKarat]
  );

  const saveInvoice = async () => {
    if (invoiceItems.length === 0) {
      toast({ title: "خطا", description: "حداقل یک قلم به فاکتور اضافه کنید", variant: "destructive" });
      return;
    }
    if (!rate?.ok) {
      toast({ title: "خطا", description: "ابتدا نرخ طلا را همگام‌سازی کنید", variant: "destructive" });
      return;
    }
    setSavingInvoice(true);
    try {
      const res = await authFetch("/api/gold/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: invoiceType,
          customerName: customerName.trim() || null,
          customerPhone: customerPhone.trim() || null,
          profitRatePercent: Number(enNum(profitRate).replace(/[^\d.]/g, "")) || 0,
          receivedGoldGrams: Number(enNum(receivedGrams).replace(/[^\d.]/g, "")) || 0,
          receivedGoldKarat: Number(receivedKarat) || 18,
          items: invoiceItems.map((it) => ({
            goldProductId: it.goldProductId,
            name: it.name,
            karat: it.karat,
            weight: it.weight,
            count: it.count,
            stoneWeight: it.stoneWeight,
            makingChargeType: it.makingChargeType,
            makingChargeValue: it.makingChargeValue,
            stonePriceRial: it.stonePriceRial,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ title: "موفق", description: json.message || "فاکتور صادر شد" });
        setInvoiceItems([]);
        setCustomerName("");
        setCustomerPhone("");
        setReceivedGrams("");
        loadInvoices();
        loadProducts();
      } else {
        toast({ title: "خطا", description: json.error || "صدور فاکتور ناموفق بود", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
    } finally {
      setSavingInvoice(false);
    }
  };

  /* ---------- اتصالات ---------- */
  const [logs, setLogs] = React.useState<IntegrationLog[]>([]);
  const [apiKeys, setApiKeys] = React.useState<ApiKeyInfo[]>([]);
  const [logsLoading, setLogsLoading] = React.useState(true);
  const [origin, setOrigin] = React.useState("");

  const loadIntegration = React.useCallback(async () => {
    try {
      const res = await authFetch("/api/gold/integration");
      const json = await res.json();
      if (json.success) {
        setLogs(json.logs ?? []);
        setApiKeys(json.apiKeys ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLogsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    setOrigin(window.location.origin);
    loadIntegration();
  }, [loadIntegration]);

  /* ---------- خلاصهٔ موجودی ---------- */
  const inventory = React.useMemo(() => {
    const byKarat: Record<number, { grams: number; value: number }> = {};
    let totalGrams = 0;
    let totalValue = 0;
    for (const p of products) {
      if (!p.isActive) continue;
      const k = (byKarat[p.karat] ??= { grams: 0, value: 0 });
      k.grams += p.stockWeightGrams;
      k.value += Math.round(p.stockWeightGrams * p.gramPriceRial);
      totalGrams += p.stockWeightGrams;
      totalValue += Math.round(p.stockWeightGrams * p.gramPriceRial);
    }
    return { byKarat, totalGrams, totalValue };
  }, [products]);

  const rateChange = rateHistory.length >= 2 ? rateHistory[rateHistory.length - 1] - rateHistory[0] : 0;
  const rateChangePercent =
    rateHistory.length >= 2 && rateHistory[0] > 0 ? (rateChange / rateHistory[0]) * 100 : 0;

  /* ============================================================ */

  return (
    <div className="space-y-4 md:space-y-6" dir="rtl">
      {/* هدر */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Gem className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">طلا و جواهر (طلافروشی)</h2>
            <p className="text-xs text-muted-foreground">
              نرخ لحظه‌ای، کالای طلا با عیار و وزن، فاکتور طلا با اجرت و مالیات ۹٪ و اتصال سیستم مغازه
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rate?.ok && rate.fetchedAt && (
            <Badge variant="outline" className="gap-1 bg-success/10 text-success border-success/30">
              <Clock className="h-3 w-3" />
              {fmtTime(rate.fetchedAt)}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => setManualRateOpen(true)} title="ثبت دستی نرخ گرم ۱۸ عیار">
            <Pencil className="h-4 w-4" />
            ثبت دستی نرخ
          </Button>
          <Button variant="outline" size="sm" onClick={syncRate} disabled={rateRefreshing}>
            {rateRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            بروزرسانی نرخ
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/60 p-1">
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs md:text-sm">
            <TrendingUp className="h-4 w-4" />
            داشبورد طلا
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-1.5 text-xs md:text-sm">
            <Package className="h-4 w-4" />
            کالاهای طلا
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5 text-xs md:text-sm">
            <Receipt className="h-4 w-4" />
            فاکتور طلا
          </TabsTrigger>
          <TabsTrigger value="integration" className="gap-1.5 text-xs md:text-sm">
            <Plug className="h-4 w-4" />
            اتصالات (API)
          </TabsTrigger>
        </TabsList>

        {/* ================= تب ۱: داشبورد طلا ================= */}
        <TabsContent value="dashboard" className="space-y-4">
          {/* کارت‌های نرخ */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
            <RateCard
              title="گرم ۱۸ عیار"
              sub="محبوب‌ترین عیار بازار"
              rial={rate?.karat18Rial ?? 0}
              loading={rateLoading}
              ok={rate?.ok ?? false}
              accent="teal"
            />
            <RateCard
              title="گرم ۲۴ عیار"
              sub="طلای خالص — مبنای محاسبه"
              rial={rate?.karat24Rial ?? 0}
              loading={rateLoading}
              ok={rate?.ok ?? false}
              accent="amber"
            />
            <RateCard
              title="مثقال طلا"
              sub="۴٫۶۰۸ گرم — مبنای بازار سنتی"
              rial={rate?.mesghalRial ?? 0}
              loading={rateLoading}
              ok={rate?.ok ?? false}
              accent="emerald"
            />
            {/* موجودی وزنی */}
            <Card className="relative overflow-hidden border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <Scale className="h-4 w-4" />
                  موجودی طلای مغازه
                </CardDescription>
              </CardHeader>
              <CardContent>
                {productsLoading ? (
                  <Skeleton className="h-9 w-32" />
                ) : (
                  <>
                    <div className="text-2xl font-black text-foreground">
                      {fmtGrams(inventory.totalGrams)}
                      <span className="text-xs font-normal text-muted-foreground mr-1">گرم</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      ارزش تقریبی: {formatCompactToman(fmtRialToToman(inventory.totalValue))}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* نمودار نرخ + وضعیت منبع */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-teal-600" />
                    روند نرخ گرم ۱۸ عیار
                  </CardTitle>
                  {rateHistory.length >= 2 && (
                    <Badge
                      variant="outline"
                      className={
                        rateChange >= 0
                          ? "bg-teal-500/10 text-teal-700 border-teal-500/30 dark:text-teal-300"
                          : "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300"
                      }
                    >
                      {rateChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {rateChange >= 0 ? "+" : "−"}
                      {toPersianDigits(formatNumber(Math.abs(rateChangePercent), 2))}٪ در بازه
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {rate?.fetchedAt
                    ? `آخرین به‌روزرسانی: ${fmtTime(rate.fetchedAt)} — منبع: ${SOURCE_LABELS[rate.source] ?? rate.source}`
                    : "نرخ هنوز ثبت نشده است"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Sparkline data={rateHistory} />
              </CardContent>
            </Card>

            {/* تفکیک موجودی عیار */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Gem className="h-4 w-4 text-amber-600" />
                  موجودی به تفکیک عیار
                </CardTitle>
                <CardDescription>وزن خالص هر عیار + ارزش لحظه‌ای</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {productsLoading ? (
                  [0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)
                ) : Object.keys(inventory.byKarat).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    هنوز کالای طلایی ثبت نشده — از تب «کالاهای طلا» شروع کنید
                  </p>
                ) : (
                  [24, 22, 18, 14]
                    .filter((k) => inventory.byKarat[k]?.grams > 0)
                    .map((k) => (
                      <div key={k} className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className={KARAT_CHIP[k]}>{KARAT_LABELS[k]}</Badge>
                        <div className="text-end">
                          <div className="text-sm font-bold">{fmtGrams(inventory.byKarat[k].grams)} گرم</div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatCompactToman(fmtRialToToman(inventory.byKarat[k].value))}
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* راهنمای مالیات طلا */}
          <Card className="border-teal-500/20 bg-teal-500/5">
            <CardContent className="pt-4">
              <div className="flex items-start gap-2.5">
                <Info className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">قاعدهٔ مالیات فاکتور طلا:</span> مالیات بر ارزش افزودهٔ ۹٪
                  فقط روی <span className="font-semibold text-amber-600 dark:text-amber-400">اجرت ساخت + سود فروشنده</span> محاسبه
                  می‌شود — نه روی ارزش خود طلا. این قاعده به‌صورت خودکار در فاکتورهای ماژول اعمال می‌شود.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= تب ۲: کالاهای طلا ================= */}
        <TabsContent value="products" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {toPersianDigits(products.length)} کالا — موجودی به «گرم» دیده می‌شود، نه فقط تعداد
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={loadProducts}>
                <RefreshCw className="h-4 w-4" />
                بروزرسانی
              </Button>
              <Button size="sm" onClick={() => openProductDialog(null)} className="bg-amber-600 hover:bg-amber-700 text-white">
                <Plus className="h-4 w-4" />
                کالای طلا جدید
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {productsLoading ? (
                <div className="p-4 space-y-3">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <EmptyState
                  icon={Gem}
                  title="هنوز کالای طلایی ثبت نشده"
                  description="انگشتر، گردنبند، سکه و ... را با عیار، وزن و اجرت اضافه کنید تا ارزش لحظه‌ای‌شان را ببینید."
                  action={
                    <Button size="sm" onClick={() => openProductDialog(null)} className="bg-amber-600 hover:bg-amber-700 text-white">
                      <Plus className="h-4 w-4" />
                      اولین کالای طلا
                    </Button>
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>نام کالا</TableHead>
                        <TableHead>عیار</TableHead>
                        <TableHead>وزن هر عدد</TableHead>
                        <TableHead>اجرت</TableHead>
                        <TableHead>موجودی (گرم)</TableHead>
                        <TableHead>ارزش لحظه‌ای</TableHead>
                        <TableHead className="text-left">عملیات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((p) => (
                        <TableRow key={p.id} className={p.isActive ? "" : "opacity-50"}>
                          <TableCell>
                            <div className="font-medium">{p.name}</div>
                            {p.category && <div className="text-[10px] text-muted-foreground">{p.category}</div>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={KARAT_CHIP[p.karat] ?? KARAT_CHIP[18]}>
                              {KARAT_LABELS[p.karat] ?? `${toPersianDigits(p.karat)} عیار`}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {fmtGrams(p.weightGrams)} گرم
                            {p.stoneWeight > 0 && (
                              <span className="text-muted-foreground"> (سنگ: {fmtGrams(p.stoneWeight)})</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {p.makingChargeType === "PER_GRAM"
                              ? `${formatToman(Math.trunc(p.makingChargeValue / 10))} در گرم`
                              : `٪${toPersianDigits(formatNumber(p.makingChargeValue, 1))} از طلا`}
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {fmtGrams(p.stockWeightGrams)} گرم
                            <span className="text-muted-foreground"> (~{toPersianDigits(p.stockCount)} عدد)</span>
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                            {formatCompactToman(fmtRialToToman(p.totalValueRial))}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 justify-end">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openProductDialog(p)} aria-label="ویرایش">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setDeletingProduct(p)}
                                aria-label="حذف"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= تب ۳: فاکتور طلا ================= */}
        <TabsContent value="invoices" className="space-y-4">
          {/* ساخت فاکتور */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-teal-600" />
                    صدور فاکتور طلا
                  </CardTitle>
                  <CardDescription>
                    ارزش‌ها با نرخ لحظه‌ای محاسبه می‌شوند{rate?.ok ? "" : " — نرخ در دسترس نیست!"}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1.5">
                  {(["SALE", "BUYBACK", "EXCHANGE"] as const).map((t) => {
                    const meta = INVOICE_TYPE_META[t];
                    const active = invoiceType === t;
                    return (
                      <button
                        key={t}
                        onClick={() => setInvoiceType(t)}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                          active
                            ? "border-teal-500/50 bg-teal-500/15 text-teal-700 dark:text-teal-300 font-semibold"
                            : "border-border text-muted-foreground hover:bg-muted/60"
                        }`}
                      >
                        <meta.icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* مشتری */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1"><User className="h-3 w-3" /> نام مشتری</Label>
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="مثلاً خانم احمدی" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> شماره تماس</Label>
                  <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="۰۹۱۲..." inputMode="tel" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1"><CircleDollarSign className="h-3 w-3" /> سود فروشنده (٪)</Label>
                  <Input value={profitRate} onChange={(e) => setProfitRate(e.target.value)} inputMode="decimal" disabled={invoiceType === "BUYBACK"} />
                </div>
                {invoiceType !== "SALE" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      <Scale className="h-3 w-3" /> {invoiceType === "EXCHANGE" ? "وزن طلای دریافتی (گرم)" : "وزن طلای دریافتی (گرم)"}
                    </Label>
                    <div className="flex gap-1.5">
                      <Input value={receivedGrams} onChange={(e) => setReceivedGrams(e.target.value)} placeholder="مثلاً ۵٫۲" inputMode="decimal" />
                      <Select value={receivedKarat} onValueChange={setReceivedKarat}>
                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[24, 22, 18, 14].map((k) => (
                            <SelectItem key={k} value={String(k)}>{toPersianDigits(k)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* افزودن قلم */}
              <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
                  <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-xs">انتخاب کالا (اختیاری)</Label>
                    <Select value={pickProduct || undefined} onValueChange={setPickProduct}>
                      <SelectTrigger><SelectValue placeholder="از لیست کالاهای طلا…" /></SelectTrigger>
                      <SelectContent>
                        {products.filter((p) => p.isActive).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} — {KARAT_LABELS[p.karat]} — {fmtGrams(p.weightGrams)} گرم
                          </SelectItem>
                        ))}
                        {products.length === 0 && <SelectItem value="_none" disabled>کالایی ثبت نشده — دستی وارد کنید</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">وزن (گرم)</Label>
                    <Input value={itemWeight} onChange={(e) => setItemWeight(e.target.value)} placeholder="مثلاً ۳٫۵" inputMode="decimal" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">تعداد</Label>
                    <Input value={itemCount} onChange={(e) => setItemCount(e.target.value)} inputMode="numeric" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">اجرت {`(${"ریال/گرم یا ٪"})`}</Label>
                    <Input value={itemCharge} onChange={(e) => setItemCharge(e.target.value)} placeholder="خالی = اجرت کالا" inputMode="decimal" />
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={addItem} className="border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10">
                  <Plus className="h-4 w-4" />
                  افزودن به فاکتور
                </Button>
              </div>

              {/* اقلام */}
              {invoiceItems.length > 0 && (
                <div className="overflow-x-auto rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>کالا</TableHead>
                        <TableHead>عیار</TableHead>
                        <TableHead>تعداد</TableHead>
                        <TableHead>وزن خالص</TableHead>
                        <TableHead>ارزش طلا</TableHead>
                        <TableHead>اجرت</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceItems.map((it, idx) => {
                        const net = Math.max(0, it.weight - it.stoneWeight) * (it.count || 1);
                        const gramPrice = rate?.karat24Rial ? Math.round((rate.karat24Rial * it.karat) / 24) : 0;
                        const gv = Math.round(net * gramPrice);
                        const mc = it.makingChargeType === "PERCENT" ? Math.round((gv * it.makingChargeValue) / 100) : Math.round(it.makingChargeValue * net);
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-medium text-xs">{it.name}</TableCell>
                            <TableCell><Badge variant="outline" className={KARAT_CHIP[it.karat]}>{KARAT_LABELS[it.karat]}</Badge></TableCell>
                            <TableCell className="text-xs">{toPersianDigits(it.count)}</TableCell>
                            <TableCell className="text-xs">{fmtGrams(net)} گرم</TableCell>
                            <TableCell className="text-xs">{formatToman(Math.trunc(gv / 10))}</TableCell>
                            <TableCell className="text-xs">{formatToman(Math.trunc(mc / 10))}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setInvoiceItems((prev) => prev.filter((_, i) => i !== idx))} aria-label="حذف قلم">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* تفکیک نهایی */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="space-y-2 text-xs rounded-xl bg-muted/50 p-3.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">جمع وزن طلای تحویلی</span><span className="font-semibold">{fmtGrams(preview.grams)} گرم</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">ارزش طلا (نرخ لحظه‌ای)</span><span className="font-semibold">{formatToman(Math.trunc(preview.goldValue / 10))}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">جمع اجرت ساخت</span><span className="font-semibold">{formatToman(Math.trunc(preview.makingCharge / 10))}</span></div>
                  {invoiceType !== "BUYBACK" && (
                    <div className="flex justify-between"><span className="text-muted-foreground">سود فروشنده (٪{toPersianDigits(profitRate || "0")})</span><span className="font-semibold">{formatToman(Math.trunc(preview.profit / 10))}</span></div>
                  )}
                  {preview.stoneValue > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">ارزش سنگ</span><span className="font-semibold">{formatToman(Math.trunc(preview.stoneValue / 10))}</span></div>
                  )}
                  {invoiceType !== "BUYBACK" && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">مالیات ۹٪ (فقط اجرت + سود)</span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400">{formatToman(Math.trunc(preview.vat / 10))}</span>
                    </div>
                  )}
                  {invoiceType !== "SALE" && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ارزش طلای دریافتی از مشتری</span>
                      <span className="font-semibold text-teal-600 dark:text-teal-300">− {formatToman(Math.trunc(preview.receivedValue / 10))}</span>
                    </div>
                  )}
                </div>
                <div className={`rounded-xl p-4 flex flex-col justify-center ${preview.payable >= 0 ? "bg-teal-500/10 border border-teal-500/30" : "bg-amber-500/10 border border-amber-500/30"}`}>
                  <div className="text-xs text-muted-foreground">
                    {invoiceType === "BUYBACK" ? "مبلغ پرداختی به مشتری" : invoiceType === "EXCHANGE" ? "مابه‌التفاوت (طلبی از مشتری)" : "قابل پرداخت مشتری"}
                  </div>
                  <div className="text-2xl font-black mt-1 text-foreground">
                    {formatToman(Math.abs(Math.trunc(preview.payable / 10)))}
                  </div>
                  {invoiceType === "EXCHANGE" && (
                    <div className="text-[11px] mt-1.5 text-muted-foreground flex items-center gap-1">
                      <ArrowLeftRight className="h-3 w-3" />
                      {preview.payable >= 0 ? "مشتری به مغازه بدهکار است" : "مغازه به مشتری بدهکار است"}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={saveInvoice} disabled={savingInvoice || invoiceItems.length === 0} className="bg-teal-600 hover:bg-teal-700 text-white min-w-40">
                  {savingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                  {invoiceType === "SALE" ? "صدور فاکتور فروش" : invoiceType === "BUYBACK" ? "ثبت بازخرید" : "ثبت معاملهٔ طلا به طلا"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* لیست فاکتورها */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">فاکتورهای طلا</CardTitle>
                <Button size="sm" variant="ghost" onClick={loadInvoices}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {invoicesLoading ? (
                <div className="p-4 space-y-3">
                  {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : invoices.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="هنوز فاکتور طلا صادر نشده"
                  description="اولین فروش، بازخرید یا معاملهٔ طلا به طلا را از فرم بالا ثبت کنید."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>شماره</TableHead>
                        <TableHead>نوع</TableHead>
                        <TableHead>مشتری</TableHead>
                        <TableHead>وزن</TableHead>
                        <TableHead>ارزش طلا</TableHead>
                        <TableHead>مالیات</TableHead>
                        <TableHead>قابل پرداخت</TableHead>
                        <TableHead>وضعیت</TableHead>
                        <TableHead>تاریخ</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.slice(0, 30).map((inv) => {
                        const tMeta = INVOICE_TYPE_META[inv.type] ?? INVOICE_TYPE_META.SALE;
                        const sMeta = STATUS_META[inv.status] ?? STATUS_META.PENDING;
                        return (
                          <TableRow key={inv.id}>
                            <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={tMeta.color}>
                                <tMeta.icon className="h-3 w-3 ml-0.5" />
                                {tMeta.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">{inv.customerName || "—"}</TableCell>
                            <TableCell className="text-xs">
                              {fmtGrams(inv.totalGoldGrams)} گرم
                              {inv.receivedGoldGrams > 0 && (
                                <span className="text-muted-foreground"> (دریافتی: {fmtGrams(inv.receivedGoldGrams)})</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">{formatCompactToman(fmtRialToToman(inv.goldValueRial))}</TableCell>
                            <TableCell className="text-xs">{formatToman(fmtRialToToman(inv.vatRial))}</TableCell>
                            <TableCell className={`text-xs font-bold ${inv.payableRial >= 0 ? "text-teal-700 dark:text-teal-300" : "text-amber-600"}`}>
                              {formatCompactToman(Math.abs(fmtRialToToman(inv.payableRial)))}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={sMeta.color}>{sMeta.label}</Badge>
                            </TableCell>
                            <TableCell className="text-[10px] text-muted-foreground">{toJalali(new Date(inv.createdAt))}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDetailInvoice(inv)}>
                                جزئیات
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= تب ۴: اتصالات ================= */}
        <TabsContent value="integration" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
            {/* مستندات */}
            <Card className="border-teal-500/25">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Plug className="h-4 w-4 text-teal-600" />
                  اتصال سیستم طلافروشی شما
                </CardTitle>
                <CardDescription>
                  نرخ‌ها و فاکتورهای مغازه‌تان را از هر سیستم دیگری به افق پلاس وصل کنید
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs leading-relaxed">
                <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-2.5">
                  <KeyRound className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold">گام ۱ — ساخت کلید API:</span> از ماژول{" "}
                    <button
                      className="text-teal-600 dark:text-teal-400 underline underline-offset-2 inline-flex items-center gap-0.5"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent("hoshhesab:navigate-link", { detail: "/api" }));
                      }}
                    >
                      API و توسعه <ExternalLink className="h-3 w-3" />
                    </button>{" "}
                    یک کلید با اسکوپ <code className="bg-muted px-1 rounded">write:products</code> (برای ثبت نرخ) و{" "}
                    <code className="bg-muted px-1 rounded">read:invoices</code> بسازید.
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="font-semibold">گام ۲ — ثبت نرخ لحظه‌ای مغازه (هر چند دقیقه):</span>
                  <pre dir="ltr" className="rounded-lg bg-muted/80 p-2.5 text-[10px] overflow-x-auto leading-5" data-tour="gold-curl">
{`curl -X POST ${origin || "https://your-domain"}/api/gold/integration \\
  -H "x-api-key: hsk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"action":"push-rate","karat18Rial":254753000,"mesghalRial":1103460000}'`}
                  </pre>
                </div>
                <div className="space-y-1.5">
                  <span className="font-semibold">سایر عملیات:</span>
                  <ul className="list-disc pr-4 space-y-1 text-muted-foreground">
                    <li><code className="bg-muted px-1 rounded" dir="ltr">{"{action:'get-rate'}"}</code> — دریافت نرخ فعال</li>
                    <li><code className="bg-muted px-1 rounded" dir="ltr">{"{action:'list-invoices',limit:20}"}</code> — دریافت فاکتورها</li>
                    <li><code className="bg-muted px-1 rounded" dir="ltr">{"{action:'create-invoice',type:'SALE',items:[...]}"}</code> — صدور فاکتور از POS بیرونی</li>
                  </ul>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/25 p-2.5">
                  <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    سهمیه: پلن Basic حدود ۱٬۰۰۰ درخواست در روز و ۳۰ در دقیقه (هدرهای <code dir="ltr">X-RateLimit-*</code> در پاسخ).
                    نرخ‌ها به ریال هستند.
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* کلیدها + لاگ */}
            <div className="space-y-3 md:space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <KeyRound className="h-4 w-4 text-amber-600" />
                    کلیدهای API فعال
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {logsLoading ? (
                    [0, 1].map((i) => <Skeleton key={i} className="h-9 w-full" />)
                  ) : apiKeys.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      کلید فعالی ندارید — از ماژول «API و توسعه» کلید بسازید.
                    </p>
                  ) : (
                    apiKeys.map((k) => (
                      <div key={k.id} className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2">
                        <div>
                          <div className="text-xs font-medium">{k.name}</div>
                          <div dir="ltr" className="text-[10px] text-muted-foreground font-mono">{k.prefix}…</div>
                        </div>
                        <div className="text-end">
                          <div className="text-[10px] text-muted-foreground">
                            {k.lastUsedAt ? `آخرین استفاده: ${toJalali(new Date(k.lastUsedAt))}` : "بی‌استفاده"}
                          </div>
                          <div className="flex flex-wrap gap-1 justify-end mt-1">
                            {k.scopes.slice(0, 3).map((s) => (
                              <Badge key={s} variant="secondary" className="text-[9px] px-1 py-0" dir="ltr">{s}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <Wallet className="h-4 w-4 text-teal-600" />
                      آخرین اتصال‌های ثبت‌شده
                    </CardTitle>
                    <Button size="sm" variant="ghost" onClick={loadIntegration}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {logsLoading ? (
                    <div className="p-4 space-y-2">
                      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
                    </div>
                  ) : logs.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-4 text-center">
                      هنوز سیستمی متصل نشده — بعد از اولین push-rate، تاریخچهٔ اینجا نمایش داده می‌شود.
                    </p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto">
                      {logs.map((l) => (
                        <div key={l.id} className="flex items-center justify-between gap-2 px-4 py-2 border-b last:border-0 text-xs">
                          <div className="flex items-center gap-2">
                            {l.success ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                            )}
                            <span className="font-medium">{ACTION_LABELS[l.action] ?? l.action}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">{fmtTime(l.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ================= دیالوگ کالای طلا ================= */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gem className="h-4 w-4 text-amber-600" />
              {editingProduct ? "ویرایش کالای طلا" : "کالای طلا جدید"}
            </DialogTitle>
            <DialogDescription>
              وزن‌ها به گرم؛ اجرت می‌تواند «ریال در هر گرم» یا «درصد از ارزش طلا» باشد. مبالغ تومان وارد کنید.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">نام کالا *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="مثلاً انگشتر نیم‌ست طرح ترکی" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">عیار *</Label>
              <Select value={form.karat} onValueChange={(v) => setForm((f) => ({ ...f, karat: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[24, 22, 18, 14].map((k) => (
                    <SelectItem key={k} value={String(k)}>{KARAT_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">دسته</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOLD_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">وزن هر عدد (گرم) *</Label>
              <Input value={form.weightGrams} onChange={(e) => setForm((f) => ({ ...f, weightGrams: e.target.value }))} inputMode="decimal" placeholder="۳٫۵" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">وزن سنگ (گرم)</Label>
              <Input value={form.stoneWeight} onChange={(e) => setForm((f) => ({ ...f, stoneWeight: e.target.value }))} inputMode="decimal" placeholder="۰" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">نوع اجرت</Label>
              <Select
                value={form.makingChargeType}
                onValueChange={(v) => setForm((f) => ({ ...f, makingChargeType: v as "PER_GRAM" | "PERCENT" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PER_GRAM">ریال در هر گرم</SelectItem>
                  <SelectItem value="PERCENT">درصد از ارزش طلا</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{form.makingChargeType === "PER_GRAM" ? "اجرت (تومان در گرم)" : "اجرت (٪)"}</Label>
              <Input value={form.makingChargeValue} onChange={(e) => setForm((f) => ({ ...f, makingChargeValue: e.target.value }))} inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ارزش سنگ (تومان)</Label>
              <Input value={form.stonePrice} onChange={(e) => setForm((f) => ({ ...f, stonePrice: e.target.value }))} inputMode="numeric" placeholder="۰" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">موجودی وزنی کل (گرم)</Label>
              <Input value={form.stockWeight} onChange={(e) => setForm((f) => ({ ...f, stockWeight: e.target.value }))} inputMode="decimal" placeholder="۳۵" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">سود فروشندهٔ پیش‌فرض (٪ از ارزش طلا)</Label>
              <Input value={form.sellerProfitRate} onChange={(e) => setForm((f) => ({ ...f, sellerProfitRate: e.target.value }))} inputMode="decimal" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialogOpen(false)}>انصراف</Button>
            <Button onClick={saveProduct} disabled={savingProduct} className="bg-amber-600 hover:bg-amber-700 text-white">
              {savingProduct && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingProduct ? "ذخیرهٔ تغییرات" : "افزودن کالا"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ حذف */}
      <Dialog open={!!deletingProduct} onOpenChange={(o) => !o && setDeletingProduct(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>حذف کالای طلا</DialogTitle>
            <DialogDescription>
              آیا از حذف «{deletingProduct?.name}» مطمئن هستید؟ این عمل قابل بازگشت نیست.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingProduct(null)}>انصراف</Button>
            <Button variant="destructive" onClick={deleteProduct} disabled={savingProduct}>
              {savingProduct ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              حذف کن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ جزئیات فاکتور */}
      <Dialog open={!!detailInvoice} onOpenChange={(o) => !o && setDetailInvoice(null)}>
        <DialogContent className="max-w-2xl">
          {detailInvoice && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <Receipt className="h-4 w-4 text-teal-600" />
                  فاکتور {detailInvoice.invoiceNumber}
                  <Badge variant="outline" className={INVOICE_TYPE_META[detailInvoice.type]?.color}>
                    {INVOICE_TYPE_META[detailInvoice.type]?.label}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {detailInvoice.customerName ? `مشتری: ${detailInvoice.customerName}` : "مشتری: —"}
                  {detailInvoice.customerPhone ? ` — ${toPersianDigits(detailInvoice.customerPhone)}` : ""}
                  {` — ${toJalali(new Date(detailInvoice.createdAt))}`}
                </DialogDescription>
              </DialogHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>کالا</TableHead>
                      <TableHead>عیار</TableHead>
                      <TableHead>تعداد</TableHead>
                      <TableHead>وزن خالص</TableHead>
                      <TableHead>ارزش طلا</TableHead>
                      <TableHead>اجرت</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(detailInvoice.items) ? detailInvoice.items : []).map((it, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium">{it.name}</TableCell>
                        <TableCell className="text-xs">{KARAT_LABELS[it.karat] ?? toPersianDigits(it.karat)}</TableCell>
                        <TableCell className="text-xs">{toPersianDigits(it.count ?? 1)}</TableCell>
                        <TableCell className="text-xs">{fmtGrams(Math.max(0, (it.weight ?? 0) - (it.stoneWeight ?? 0)) * (it.count ?? 1))} گرم</TableCell>
                        <TableCell className="text-xs">{formatToman(Math.trunc((it.goldValueRial ?? 0) / 10))}</TableCell>
                        <TableCell className="text-xs">{formatToman(Math.trunc((it.makingChargeRial ?? 0) / 10))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-1.5 text-xs rounded-xl bg-muted/50 p-3">
                <div className="flex justify-between"><span className="text-muted-foreground">ارزش کل طلا</span><span className="font-semibold">{formatToman(fmtRialToToman(detailInvoice.goldValueRial))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">اجرت ساخت</span><span className="font-semibold">{formatToman(fmtRialToToman(detailInvoice.makingChargeRial))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">سود فروشنده</span><span className="font-semibold">{formatToman(fmtRialToToman(detailInvoice.sellerProfitRial))}</span></div>
                {detailInvoice.stoneValueRial > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">ارزش سنگ</span><span className="font-semibold">{formatToman(fmtRialToToman(detailInvoice.stoneValueRial))}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">مالیات ۹٪ (اجرت + سود)</span><span className="font-semibold text-amber-600 dark:text-amber-400">{formatToman(fmtRialToToman(detailInvoice.vatRial))}</span></div>
                {detailInvoice.receivedValueRial > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">ارزش طلای دریافتی از مشتری</span><span className="font-semibold text-teal-600 dark:text-teal-300">− {formatToman(fmtRialToToman(detailInvoice.receivedValueRial))}</span></div>
                )}
                <div className="flex justify-between border-t pt-2 mt-1">
                  <span className="font-bold">قابل پرداخت</span>
                  <span className="font-black text-teal-700 dark:text-teal-300">{formatToman(fmtRialToToman(detailInvoice.payableRial))}</span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailInvoice(null)}>بستن</Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <FileText className="h-4 w-4" />
                  چاپ فاکتور
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* دیالوگ ثبت دستی نرخ */}
      <Dialog open={manualRateOpen} onOpenChange={setManualRateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>ثبت دستی نرخ گرم ۱۸</DialogTitle>
            <DialogDescription>
              اگر تگ‌جو در دسترس نیست، نرخ روز مغازه را دستی وارد کنید (به تومان).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">نرخ هر گرم ۱۸ عیار (تومان)</Label>
            <Input value={manual18} onChange={(e) => setManual18(e.target.value)} inputMode="numeric" placeholder="۲۵٬۴۷۵٬۳۰۰" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualRateOpen(false)}>انصراف</Button>
            <Button onClick={saveManualRate} className="bg-teal-600 hover:bg-teal-700 text-white">ثبت نرخ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============ کارت نرخ ============ */

function RateCard({
  title,
  sub,
  rial,
  loading,
  ok,
  accent,
}: {
  title: string;
  sub: string;
  rial: number;
  loading: boolean;
  ok: boolean;
  accent: "teal" | "amber" | "emerald";
}) {
  const accents: Record<string, string> = {
    teal: "border-teal-500/25 bg-gradient-to-br from-teal-500/10 via-transparent to-transparent",
    amber: "border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent",
    emerald: "border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent",
  };
  return (
    <Card className={`relative overflow-hidden ${accents[accent]}`}>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{title}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-36" />
        ) : !ok || rial <= 0 ? (
          <div className="text-sm text-muted-foreground">قیمت گرم‌شده</div>
        ) : (
          <>
            <div className="text-2xl font-black text-foreground tabular-nums">
              {formatToman(Math.trunc(rial / 10))}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">{sub}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default GoldShopModule;
