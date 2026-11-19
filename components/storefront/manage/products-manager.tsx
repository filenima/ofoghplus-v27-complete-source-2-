"use client";

// ═══════════════════════════════════════════════════════════════════
// R24-4 — مدیر حرفه‌ای محصولات فروشگاه (تجربهٔ ووکامرس/وردپرس)
// جدول داده با: جستجو، فیلتر دسته/وضعیت/موجودی، مرتب‌سازی ستون‌ها،
// انتخاب گروهی + عملیات گروهی (نمایش/پنهان/تخفیف/حذف)، ویرایش سریع
// قیمت و تخفیف داخل جدول، صفحه‌بندی، خروجی اکسل و بج‌های موجودی.
// ویرایش کامل → همان ProductEditorSheet حرفه‌ای (۶ تب).
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  Search, RefreshCw, Package, Pencil, Trash2, BadgePercent, EyeOff, Eye,
  Loader2, Sparkles, ChevronRight, ChevronLeft, Check, FileSpreadsheet,
  ChevronDown, ChevronUp, ArrowUpDown, Globe, Image as ImageIcon,
  Banknote, FolderInput,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits, toEnglishDigits } from "@/lib/persian";
import { rialToTomanLabel } from "@/lib/storefront";
import { rialToCurrencyLabel, type StorefrontCurrencyCode } from "@/lib/storefront-wizard";
import { ProductEditorSheet, type ManageProductDTO } from "./product-editor-sheet";

type SortKey = "newest" | "name" | "price-asc" | "price-desc" | "stock" | "discount";
type StatusFilter = "all" | "visible" | "hidden" | "instock" | "outstock" | "lowstock" | "discounted";

const PAGE_SIZES = [10, 20, 50];

/** آستانهٔ کم‌موجودی: هر کالای «با ردیف انبار» که مجموعش ≤ ۳ باشد */
const LOW_STOCK_THRESHOLD = 3;

export function StorefrontProductsManager() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [products, setProducts] = React.useState<ManageProductDTO[]>([]);
  const [rates, setRates] = React.useState<{ usdRateToman: number | null; cnyRateToman: number | null }>({ usdRateToman: null, cnyRateToman: null });
  const [currency, setCurrency] = React.useState<StorefrontCurrencyCode>("IRT");

  // فیلترها
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<string>("all");
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [sort, setSort] = React.useState<SortKey>("newest");

  // انتخاب گروهی
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [discountValue, setDiscountValue] = React.useState("10");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  // R25-A2 — قیمت‌گذاری و انتقال گروهی به دسته
  const [bulkPrice, setBulkPrice] = React.useState("");
  const [bulkCategory, setBulkCategory] = React.useState("");

  // صفحه‌بندی
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  // ویرایش سریع قیمت/تخفیف
  const [inlineEdit, setInlineEdit] = React.useState<{ id: string; field: "price" | "discount"; value: string } | null>(null);
  const [inlineSaving, setInlineSaving] = React.useState(false);

  // ویرایشگر کامل
  const [editingProduct, setEditingProduct] = React.useState<ManageProductDTO | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);

  // دسته‌بندی خودکار
  const [categorizing, setCategorizing] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/storefront/manage/products", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (json?.success && Array.isArray(json.products)) {
        setProducts(json.products as ManageProductDTO[]);
        setRates({ usdRateToman: json.rates?.usdRateToman ?? null, cnyRateToman: json.rates?.cnyRateToman ?? null });
      } else if (!res.ok) {
        toast({ title: "خطا در دریافت کالاها", description: json?.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const categories = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const c = (p.category ?? "").trim();
      if (c) map.set(c, (map.get(c) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [products]);

  const uncategorized = products.filter((p) => !p.category).length;

  /** محاسبهٔ وضعیت موجودی هر کالا */
  function stockState(p: ManageProductDTO): "none" | "unknown" | "ok" | "low" | "out" {
    if (!p.stockKnown) return p.inStock ? "unknown" : "out";
    if (p.stock <= 0) return "out";
    if (p.stock <= Math.max(LOW_STOCK_THRESHOLD, 0)) return "low";
    return "ok";
  }

  const filtered = React.useMemo(() => {
    let list = [...products];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          (p.barcode ?? "").includes(q) ||
          (p.category ?? "").toLowerCase().includes(q)
      );
    }
    if (category !== "all") {
      list = category === "__none" ? list.filter((p) => !p.category) : list.filter((p) => (p.category ?? "") === category);
    }
    switch (status) {
      case "visible":
        list = list.filter((p) => p.showInStore !== false);
        break;
      case "hidden":
        list = list.filter((p) => p.showInStore === false);
        break;
      case "instock":
        list = list.filter((p) => p.inStock);
        break;
      case "outstock":
        list = list.filter((p) => !p.inStock);
        break;
      case "lowstock":
        list = list.filter((p) => stockState(p) === "low" || stockState(p) === "out");
        break;
      case "discounted":
        list = list.filter((p) => (p.discountPercent ?? 0) > 0);
        break;
      default:
        break;
    }
    switch (sort) {
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name, "fa"));
        break;
      case "price-asc":
        list.sort((a, b) => Number(a.salePrice) - Number(b.salePrice));
        break;
      case "price-desc":
        list.sort((a, b) => Number(b.salePrice) - Number(a.salePrice));
        break;
      case "stock":
        list.sort((a, b) => (a.stockKnown ? a.stock : 99999) - (b.stockKnown ? b.stock : 99999));
        break;
      case "discount":
        list.sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0));
        break;
      default:
        break; // newest = ترتیب API
    }
    return list;
     
  }, [products, query, category, status, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  React.useEffect(() => {
    setPage(1);
  }, [query, category, status, sort, pageSize]);

  const allOnPageSelected = paged.length > 0 && paged.every((p) => selected.has(p.id));
  const selectedCount = selected.size;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) paged.forEach((p) => next.delete(p.id));
      else paged.forEach((p) => next.add(p.id));
      return next;
    });
  }

  /* ── عملیات گروهی ── */
  async function runBulk(action: "show" | "hide" | "delete" | "discount" | "price" | "category", value?: number | string) {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await authFetch("/api/storefront/manage/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action, value }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "عملیات ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      toast({ title: "انجام شد", description: json.message });
      setSelected(new Set());
      setConfirmDelete(false);
      void load();
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  }

  /* ── ویرایش سریع قیمت/تخفیف ── */
  async function saveInline() {
    if (!inlineEdit) return;
    const { id, field, value } = inlineEdit;
    setInlineSaving(true);
    try {
      const body: Record<string, unknown> =
        field === "price"
          ? { salePrice: String(Number(toEnglishDigits(value).replace(/[^\d]/g, "")) * 10) } // تومان → ریال
          : { meta: { discountPercent: value.trim() === "" ? null : Number(toEnglishDigits(value)) } };
      const res = await authFetch(`/api/storefront/manage/products/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ذخیره ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      setProducts((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                salePrice: field === "price" ? String(Number(toEnglishDigits(value).replace(/[^\d]/g, "")) * 10) : p.salePrice,
                discountPercent: field === "discount" ? (value.trim() === "" ? null : Number(toEnglishDigits(value))) : p.discountPercent,
              }
            : p
        )
      );
      toast({ title: "ذخیره شد", description: field === "price" ? "قیمت جدید اعمال شد" : "تخفیف اعمال شد" });
      setInlineEdit(null);
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setInlineSaving(false);
    }
  }

  /* ── تغییر نمایش در فروشگاه (سوییچ) ── */
  async function toggleStoreFlag(p: ManageProductDTO, show: boolean) {
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, showInStore: show } : x)));
    try {
      const res = await authFetch(`/api/storefront/manage/products/${encodeURIComponent(p.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meta: { showInStore: show } }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, showInStore: !show } : x)));
        toast({ title: "تغییر ناموفق", description: json?.error, variant: "destructive" });
      }
    } catch {
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, showInStore: !show } : x)));
      toast({ title: "خطای شبکه", variant: "destructive" });
    }
  }

  /* ── آپلود سریع عکس ── */
  const [savingImage, setSavingImage] = React.useState<string | null>(null);

  async function uploadImage(productId: string, file: File) {
    setSavingImage(productId);
    try {
      const fd = new FormData();
      fd.set("productId", productId);
      fd.set("file", file);
      const res = await authFetch("/api/storefront/manage/product-image", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && json.imageUrl) {
        setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, imageUrl: json.imageUrl } : p)));
        toast({ title: "عکس ذخیره شد" });
      } else {
        toast({ title: "آپلود ناموفق", description: json?.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setSavingImage(null);
    }
  }

  /* ── دسته‌بندی خودکار ── */
  async function runAutoCategorize() {
    setCategorizing(true);
    try {
      const res = await authFetch("/api/storefront/manage/categorize", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "دسته‌بندی ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      toast({ title: "دسته‌بندی خودکار انجام شد", description: `${toPersianDigits(json.assigned)} کالا دسته گرفت` });
      void load();
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setCategorizing(false);
    }
  }

  /* ── خروجی اکسل ── */
  async function exportExcel() {
    try {
      const XLSX = await import("xlsx");
      const rows = filtered.map((p) => ({
        "نام کالا": p.name,
        "کد کالا": p.sku,
        "بارکد": p.barcode ?? "",
        "دسته‌بندی": p.category ?? "",
        "واحد": p.unit,
        "قیمت فروش (تومان)": Math.trunc(Number(p.salePrice) / 10),
        "قیمت خرید (تومان)": Math.trunc(Number(p.purchasePrice) / 10),
        "تخفیف (٪)": p.discountPercent ?? 0,
        "قیمت نهایی (تومان)": Math.trunc((Number(p.salePrice) * (100 - (p.discountPercent ?? 0))) / 100 / 10),
        "موجودی": p.stockKnown ? p.stock : "نامشخص",
        "نمایش در فروشگاه": p.showInStore === false ? "خیر" : "بله",
        "وضعیت": !p.inStock ? "ناموجود" : stockState(p) === "low" ? "کم‌موجودی" : "موجود",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 36 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "کالاها");
      XLSX.writeFile(wb, `products-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: "خروجی اکسل آماده شد", description: `${toPersianDigits(rows.length)} کالا صادر شد` });
    } catch {
      toast({ title: "خروجی اکسل ناموفق", variant: "destructive" });
    }
  }

  /* ═══════════ رندر ═══════════ */

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-11 w-full" />
        <div className="rounded-xl border">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="m-2 h-12" />
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center">
        <Package className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
        <p className="mt-3 text-sm font-bold">هنوز کالایی در نرم‌افزار ثبت نشده است</p>
        <p className="mt-1 text-xs text-muted-foreground">کالاها را در ماژول «انبار و کالا» ثبت کنید — خودکار در سایت شما نمایش داده می‌شوند.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" dir="rtl">
      {/* ═══ نوار ابزار ═══ */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-muted/30 p-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو: نام، کد کالا، بارکد، دسته…"
            className="rounded-full pr-9 text-sm"
            aria-label="جستجوی کالا"
          />
        </div>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-[150px] rounded-full text-xs" aria-label="فیلتر دسته">
            <SelectValue placeholder="دسته" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همهٔ دسته‌ها ({toPersianDigits(products.length)})</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                {c.name} ({toPersianDigits(c.count)})
              </SelectItem>
            ))}
            {uncategorized > 0 ? (
              <SelectItem value="__none">بدون دسته ({toPersianDigits(uncategorized)})</SelectItem>
            ) : null}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="h-9 w-[140px] rounded-full text-xs" aria-label="فیلتر وضعیت">
            <SelectValue placeholder="وضعیت" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همهٔ وضعیت‌ها</SelectItem>
            <SelectItem value="visible">در فروشگاه</SelectItem>
            <SelectItem value="hidden">مخفی‌شده</SelectItem>
            <SelectItem value="instock">موجود</SelectItem>
            <SelectItem value="outstock">ناموجود</SelectItem>
            <SelectItem value="lowstock">کم‌موجودی</SelectItem>
            <SelectItem value="discounted">تخفیف‌دار</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="h-9 w-[140px] rounded-full text-xs" aria-label="مرتب‌سازی">
            <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
            <SelectValue placeholder="ترتیب" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">جدیدترین</SelectItem>
            <SelectItem value="name">نام (الفبا)</SelectItem>
            <SelectItem value="price-asc">ارزان‌ترین</SelectItem>
            <SelectItem value="price-desc">گران‌ترین</SelectItem>
            <SelectItem value="stock">کم‌ترین موجودی</SelectItem>
            <SelectItem value="discount">بیش‌ترین تخفیف</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 rounded-full border bg-background p-0.5">
          {([["IRT", "تومان"], ["USD", "دلار"], ["CNY", "یوان"]] as const).map(([code, label]) => (
            <button
              key={code}
              type="button"
              onClick={() => setCurrency(code as StorefrontCurrencyCode)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                currency === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
              aria-pressed={currency === code}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mr-auto flex items-center gap-1.5">
          {uncategorized > 0 ? (
            <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full text-xs" onClick={() => void runAutoCategorize()} disabled={categorizing}>
              {categorizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />}
              دسته‌بندی خودکار
            </Button>
          ) : null}
          <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full text-xs" onClick={() => void exportExcel()}>
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            خروجی اکسل
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full text-xs" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            بازخوانی
          </Button>
        </div>
      </div>

      {/* ═══ نوار عملیات گروهی ═══ */}
      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-300/60 bg-emerald-50 p-2.5 dark:border-emerald-800 dark:bg-emerald-950/40" role="toolbar" aria-label="عملیات گروهی">
          <Badge className="rounded-full bg-emerald-600 text-white">
            {toPersianDigits(selectedCount)} کالای انتخاب‌شده
          </Badge>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs" disabled={bulkBusy} onClick={() => void runBulk("show")}>
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            نمایش در فروشگاه
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs" disabled={bulkBusy} onClick={() => void runBulk("hide")}>
            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            پنهان‌سازی
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs" disabled={bulkBusy}>
                <BadgePercent className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                تخفیف گروهی
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" dir="rtl">
              <p className="mb-2 text-xs font-bold">درصد تخفیف برای {toPersianDigits(selectedCount)} کالا:</p>
              <div className="flex items-center gap-2">
                <Input
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  inputMode="numeric"
                  className="h-9 w-20 text-center tabular-nums"
                  aria-label="درصد تخفیف"
                />
                <span className="text-xs text-muted-foreground">٪ (۰ = حذف تخفیف)</span>
              </div>
              <Button
                size="sm"
                className="mt-3 w-full rounded-full"
                disabled={bulkBusy}
                onClick={() => void runBulk("discount", Number(toEnglishDigits(discountValue)))}
              >
                {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                اعمال تخفیف
              </Button>
            </PopoverContent>
          </Popover>
          {/* R25-A2 — قیمت‌گذاری گروهی */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs" disabled={bulkBusy}>
                <Banknote className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                قیمت‌گذاری گروهی
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" dir="rtl">
              <p className="mb-1 text-xs font-bold">قیمت واحد (تومان) برای {toPersianDigits(selectedCount)} کالا:</p>
              <p className="mb-2 text-[11px] leading-5 text-muted-foreground">قیمت همهٔ کالاهای انتخاب‌شده با این مقدار جایگزین می‌شود.</p>
              <Input
                value={bulkPrice}
                onChange={(e) => setBulkPrice(e.target.value)}
                inputMode="numeric"
                placeholder="مثلاً ۲۵۰۰۰۰"
                className="h-9 text-center tabular-nums"
                aria-label="قیمت گروهی به تومان"
              />
              <Button
                size="sm"
                className="mt-3 w-full rounded-full"
                disabled={bulkBusy || !Number(toEnglishDigits(bulkPrice))}
                onClick={() => void runBulk("price", Number(toEnglishDigits(bulkPrice)))}
              >
                {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                اعمال قیمت
              </Button>
            </PopoverContent>
          </Popover>
          {/* R25-A2 — انتقال گروهی به دسته */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs" disabled={bulkBusy || categories.length === 0}>
                <FolderInput className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                انتقال به دسته
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" dir="rtl">
              <p className="mb-2 text-xs font-bold">دستهٔ {toPersianDigits(selectedCount)} کالای انتخاب‌شده:</p>
              <Select value={bulkCategory} onValueChange={setBulkCategory}>
                <SelectTrigger className="h-9 w-full text-xs" aria-label="انتخاب دسته">
                  <SelectValue placeholder="یک دسته انتخاب کنید" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.name} value={c.name} className="text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="mt-3 w-full rounded-full"
                disabled={bulkBusy || !bulkCategory}
                onClick={() => void runBulk("category", bulkCategory)}
              >
                {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                انتقال به «{bulkCategory || "..."}»
              </Button>
              <button
                type="button"
                className="mt-1.5 w-full text-center text-[11px] font-bold text-muted-foreground underline underline-offset-4 hover:text-foreground"
                onClick={() => void runBulk("category", "")}
              >
                حذف از همهٔ دسته‌ها
              </button>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full border-red-300 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40" disabled={bulkBusy} onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            حذف
          </Button>
          <button type="button" onClick={() => setSelected(new Set())} className="mr-auto text-xs font-bold text-muted-foreground underline underline-offset-4 hover:text-foreground">
            پاک‌کردن انتخاب‌ها
          </button>
        </div>
      ) : null}

      {/* ═══ جدول ═══ */}
      <div className="overflow-hidden rounded-2xl border">
        <div className="overflow-x-auto">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-10 p-2">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="انتخاب همهٔ کالاهای این صفحه"
                  />
                </TableHead>
                <TableHead className="p-2 text-right text-xs">کالا</TableHead>
                <TableHead className="p-2 text-right text-xs">دسته</TableHead>
                <TableHead className="p-2 text-right text-xs">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => setSort(sort === "price-asc" ? "price-desc" : "price-asc")}>
                    قیمت و تخفیف
                    {sort === "price-asc" ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : sort === "price-desc" ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" aria-hidden="true" />}
                  </button>
                </TableHead>
                <TableHead className="p-2 text-right text-xs">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => setSort(sort === "stock" ? "newest" : "stock")}>
                    موجودی
                    <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" aria-hidden="true" />
                  </button>
                </TableHead>
                <TableHead className="p-2 text-right text-xs">در فروشگاه</TableHead>
                <TableHead className="w-24 p-2 text-right text-xs">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    کالایی با این فیلترها پیدا نشد
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((p) => {
                  const st = stockState(p);
                  const isEditingPrice = inlineEdit?.id === p.id && inlineEdit.field === "price";
                  const isEditingDiscount = inlineEdit?.id === p.id && inlineEdit.field === "discount";
                  const finalPrice =
                    p.discountPercent && p.discountPercent > 0
                      ? String(Math.trunc((Number(p.salePrice) * (100 - p.discountPercent)) / 100))
                      : p.salePrice;
                  return (
                    <TableRow key={p.id} className={selected.has(p.id) ? "bg-emerald-50/60 dark:bg-emerald-950/20" : undefined}>
                      <TableCell className="p-2">
                        <Checkbox
                          checked={selected.has(p.id)}
                          onCheckedChange={() => toggleSelect(p.id)}
                          aria-label={`انتخاب ${p.name}`}
                        />
                      </TableCell>
                      <TableCell className="p-2">
                        <div className="flex items-center gap-2.5">
                          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border bg-muted">
                            {p.imageUrl ? (
                               
                              <img src={p.imageUrl} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              <Package className="h-5 w-5 text-muted-foreground/40" aria-hidden="true" />
                            )}
                            <label
                              className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/45 text-white opacity-0 transition-opacity hover:opacity-100"
                              title="تعویض عکس"
                            >
                              {savingImage === p.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImageIcon className="h-4 w-4" aria-hidden="true" />}
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void uploadImage(p.id, f);
                                }}
                              />
                            </label>
                          </div>
                          <div className="min-w-0">
                            <button
                              type="button"
                              className="block max-w-[240px] truncate text-right text-[13px] font-bold hover:text-emerald-700"
                              onClick={() => {
                                setEditingProduct(p);
                                setEditorOpen(true);
                              }}
                              title={p.name}
                            >
                              {p.name}
                            </button>
                            <span className="text-[10px] tabular-nums text-muted-foreground" dir="ltr">
                              {p.sku}
                              {p.barcode ? ` · ${p.barcode}` : ""}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="p-2">
                        {p.category ? (
                          <Badge variant="outline" className="rounded-full text-[10px]">{p.category}</Badge>
                        ) : (
                          <Badge variant="outline" className="rounded-full border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">بدون دسته</Badge>
                        )}
                      </TableCell>
                      <TableCell className="p-2">
                        {isEditingPrice ? (
                          <Input
                            autoFocus
                            value={inlineEdit.value}
                            onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                            onBlur={() => void saveInline()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveInline();
                              if (e.key === "Escape") setInlineEdit(null);
                            }}
                            className="h-8 w-28 text-xs tabular-nums"
                            inputMode="numeric"
                            disabled={inlineSaving}
                            aria-label="قیمت جدید (تومان)"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setInlineEdit({ id: p.id, field: "price", value: String(Math.trunc(Number(p.salePrice) / 10)) })}
                            className="group flex flex-col text-right"
                            title="کلیک: ویرایش سریع قیمت (تومان)"
                          >
                            <span className="text-[13px] font-black tabular-nums text-foreground group-hover:text-emerald-700">
                              {currency === "IRT"
                                ? rialToTomanLabel(finalPrice)
                                : rialToCurrencyLabel(finalPrice, currency, rates.usdRateToman, rates.cnyRateToman)}
                            </span>
                            {p.discountPercent && p.discountPercent > 0 ? (
                              <span className="text-[10px] text-muted-foreground line-through tabular-nums">
                                {rialToTomanLabel(p.salePrice)}
                              </span>
                            ) : (
                              <span className="text-[9px] text-muted-foreground/0 group-hover:text-muted-foreground">ویرایش…</span>
                            )}
                          </button>
                        )}
                        {isEditingDiscount ? (
                          <Input
                            autoFocus
                            value={inlineEdit.value}
                            onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                            onBlur={() => void saveInline()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveInline();
                              if (e.key === "Escape") setInlineEdit(null);
                            }}
                            className="mt-1 h-7 w-16 text-center text-xs tabular-nums"
                            inputMode="numeric"
                            disabled={inlineSaving}
                            aria-label="درصد تخفیف"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setInlineEdit({ id: p.id, field: "discount", value: p.discountPercent ? String(p.discountPercent) : "" })}
                            className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                              p.discountPercent && p.discountPercent > 0
                                ? "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300"
                                : "text-muted-foreground/60 hover:bg-muted"
                            }`}
                            title="کلیک: ویرایش سریع تخفیف (٪)"
                          >
                            <BadgePercent className="h-3 w-3" aria-hidden="true" />
                            {p.discountPercent && p.discountPercent > 0 ? `٪${toPersianDigits(p.discountPercent)}` : "بدون تخفیف"}
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="p-2">
                        <div className="flex flex-col gap-1">
                          {st === "unknown" ? (
                            <Badge variant="outline" className="w-fit rounded-full text-[10px]">موجود (نامشخص)</Badge>
                          ) : st === "out" ? (
                            <Badge variant="outline" className="w-fit rounded-full border-red-300 bg-red-50 text-[10px] text-red-600 dark:bg-red-950/40 dark:text-red-300">ناموجود</Badge>
                          ) : st === "low" ? (
                            <Badge variant="outline" className="w-fit rounded-full border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                              کم‌موجودی ({toPersianDigits(p.stock)})
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="w-fit rounded-full border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                              {toPersianDigits(p.stock)} {p.unit}
                            </Badge>
                          )}
                          {p.stockKnown ? (
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                              <div
                                className={`h-full rounded-full ${st === "out" ? "bg-red-500" : st === "low" ? "bg-amber-500" : "bg-emerald-500"}`}
                                style={{ width: `${Math.min(100, (p.stock / Math.max(p.stock, 10)) * 100)}%` }}
                              />
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="p-2">
                        <Switch
                          checked={p.showInStore !== false}
                          onCheckedChange={(v) => void toggleStoreFlag(p, v)}
                          aria-label={p.showInStore === false ? `نمایش ${p.name} در فروشگاه` : `پنهان‌سازی ${p.name}`}
                        />
                      </TableCell>
                      <TableCell className="p-2">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingProduct(p);
                              setEditorOpen(true);
                            }}
                            aria-label={`ویرایش کامل ${p.name}`}
                            title="ویرایش کامل (قیمت‌ها، گالری، سئو و…)"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600"
                            onClick={() => {
                              setSelected(new Set([p.id]));
                              setConfirmDelete(true);
                            }}
                            aria-label={`حذف ${p.name}`}
                            title="حذف کالا"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* ═══ صفحه‌بندی ═══ */}
        <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-3 py-2">
          <span className="text-[11px] text-muted-foreground">
            {toPersianDigits(filtered.length)} کالا — صفحهٔ {toPersianDigits(safePage)} از {toPersianDigits(totalPages)}
          </span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-7 w-[86px] rounded-full text-[11px]" aria-label="تعداد در هر صفحه">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>{toPersianDigits(s)} ردیف</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mr-auto flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="صفحهٔ قبل">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => Math.abs(n - safePage) <= 2 || n === 1 || n === totalPages)
              .map((n, idx, arr) => (
                <React.Fragment key={n}>
                  {idx > 0 && n - arr[idx - 1] > 1 ? <span className="px-1 text-xs text-muted-foreground">…</span> : null}
                  <button
                    type="button"
                    onClick={() => setPage(n)}
                    className={`h-8 min-w-8 rounded-full px-2 text-xs font-bold tabular-nums transition-colors ${
                      n === safePage ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-muted"
                    }`}
                    aria-current={n === safePage ? "page" : undefined}
                  >
                    {toPersianDigits(n)}
                  </button>
                </React.Fragment>
              ))}
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} aria-label="صفحهٔ بعد">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-5 text-muted-foreground">
        روی قیمت یا تخفیف هر ردیف کلیک کنید تا همان‌جا ویرایش سریع انجام شود. تغییرات قیمت و دسته به‌صورت دوسویه با نرم‌افزار حسابداری همگام می‌شود.
        {rates.usdRateToman ? (
          <span className="mr-2 inline-flex items-center gap-1">
            <Globe className="h-3 w-3" aria-hidden="true" />
            نرخ دلار: {toPersianDigits(rates.usdRateToman.toLocaleString("fa-IR"))} تومان
          </span>
        ) : null}
      </p>

      {/* ═══ ویرایشگر کامل کالا (شیت ۶ تبی) ═══ */}
      <ProductEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        product={editingProduct}
        onSaved={() => void load()}
      />

      {/* ═══ تأیید حذف گروهی ═══ */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle>حذف {toPersianDigits(selectedCount)} کالا؟</AlertDialogTitle>
            <AlertDialogDescription>
              کالاها به‌صورت نرم حذف می‌شوند (از فروشگاه و فهرست‌ها حذف می‌شوند اما سوابق حسابداری و انبار باقی می‌ماند). این عمل قابل بازگشت از این پنل نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                void runBulk("delete");
              }}
            >
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
              حذف قطعی
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
