"use client";

// R16 — تب کالاها: عکس هر کالا + دسته‌بندی خودکار + قیمت چندارزی
// کالاها همان‌های نرم‌افزار حسابداری هستند — ویرایش قیمت/عکس از همین‌جا
// به جدول Product برمی‌گردد (همگام‌سازی دوسویه با سایت).

import * as React from "react";
import {
  Loader2,
  Sparkles,
  Package,
  Search,
  Check,
  Image as ImageIcon,
  Trash2,
  Globe,
  RefreshCw,
  Upload,
  Pencil,
  BadgePercent,
  EyeOff,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits } from "@/lib/persian";
import { rialToTomanLabel } from "@/lib/storefront";
import { rialToCurrencyLabel, type StorefrontCurrencyCode } from "@/lib/storefront-wizard";
import { ProductEditorSheet, type ManageProductDTO } from "./product-editor-sheet";
import { UniversalImportDialog } from "@/components/ux/universal-import-dialog";

export function StorefrontProductsTab({ shopSlug }: { shopSlug: string | null }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [products, setProducts] = React.useState<ManageProductDTO[]>([]);
  const [query, setQuery] = React.useState("");
  const [categorizing, setCategorizing] = React.useState(false);
  const [savingImage, setSavingImage] = React.useState<string | null>(null);
  const [currency, setCurrency] = React.useState<StorefrontCurrencyCode>("IRT");
  const [rates, setRates] = React.useState<{ usdRateToman: number | null; cnyRateToman: number | null }>({ usdRateToman: null, cnyRateToman: null });
  // v20-C — ویرایشگر حرفه‌ای کالا
  const [editingProduct, setEditingProduct] = React.useState<ManageProductDTO | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  // R28-8 — ویزارد کامل درون‌ریزی کالا (نگاشت دستی ستون‌ها + عکس/قیمت ارزی)
  const [importOpen, setImportOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // v20-C — از API مدیریت مالک (authFetch) — API عمومی وقتی فروشگاه فعال
      // نیست 404 می‌داد و این تب کور می‌شد؛ این مسیر همیشه پاسخ می‌دهد.
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

  async function runAutoCategorize() {
    setCategorizing(true);
    try {
      const res = await authFetch("/api/storefront/manage/categorize", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "دسته‌بندی ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      toast({
        title: "دسته‌بندی خودکار انجام شد",
        description: `${toPersianDigits(json.assigned)} کالا دسته گرفت${json.categories?.length ? ` — دسته‌ها: ${json.categories.map((c: { name: string }) => c.name).join("، ")}` : ""}`,
      });
      void load();
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setCategorizing(false);
    }
  }

  async function saveImage(productId: string, file: File) {
    setSavingImage(productId);
    try {
      const fd = new FormData();
      fd.set("productId", productId);
      fd.set("file", file);
      // R17-C — آپلود اختصاصی پنل فروشگاه؛ همان لحظه روی Product اعمال می‌شود
      const res = await authFetch("/api/storefront/manage/product-image", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && json.imageUrl) {
        setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, imageUrl: json.imageUrl } : p)));
        toast({ title: "عکس کالا ذخیره شد", description: "همان حالا در سایت شما دیده می‌شود" });
      } else {
        toast({ title: "آپلود ناموفق", description: json?.error || "دوباره تلاش کنید", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setSavingImage(null);
    }
  }

  async function removeImage(productId: string) {
    setSavingImage(productId);
    try {
      const res = await authFetch(`/api/storefront/manage/product-image?productId=${encodeURIComponent(productId)}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, imageUrl: null } : p)));
        toast({ title: "عکس کالا حذف شد" });
      } else {
        toast({ title: "حذف ناموفق", description: json?.error || "دوباره تلاش کنید", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setSavingImage(null);
    }
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.category ?? "").includes(query.trim())
    );
  }, [products, query]);

  const uncategorized = products.filter((p) => !p.category).length;

  function openEditor(p: ManageProductDTO) {
    setEditingProduct(p);
    setEditorOpen(true);
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-10 w-full max-w-sm" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
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
    <div className="space-y-4">
      {/* نوار ابزار */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجوی کالا..." className="pr-9" />
        </div>
        {uncategorized > 0 ? (
          <Button onClick={() => void runAutoCategorize()} disabled={categorizing} className="gap-1.5 rounded-full">
            {categorizing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            دسته‌بندی خودکار {toPersianDigits(uncategorized)} کالا
          </Button>
        ) : (
          <Badge variant="outline" className="gap-1.5 rounded-full border-emerald-300 bg-emerald-50 px-3 py-1.5 text-emerald-700">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            همهٔ کالاها دسته‌بندی شده‌اند
          </Badge>
        )}
        <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5 rounded-full">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          همگام‌سازی با حسابداری
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-full"
          onClick={() => setImportOpen(true)}
          title="درون‌ریزی کالاها با عکس و قیمت ارزی — نگاشت دستی ستون‌ها، ردیف سرستون و پیش‌بینی نتیجه"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          درون‌ریزی کالاها
        </Button>
      </div>

      {/* انتخاب ارز */}
      <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2">
        <Globe className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs font-semibold text-muted-foreground">نمایش قیمت‌ها به:</span>
        <div className="flex gap-1">
          {([["IRT", "تومان"], ["USD", "دلار"], ["CNY", "یوان"]] as const).map(([code, label]) => (
            <button
              key={code}
              type="button"
              onClick={() => setCurrency(code as StorefrontCurrencyCode)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                currency === code ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
              aria-pressed={currency === code}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="mr-auto text-[10px] text-muted-foreground">
          {rates.usdRateToman ? `نرخ روز: دلار ${toPersianDigits(rates.usdRateToman.toLocaleString("fa-IR"))} تومان` : "نرخ دلار/یوان در حال همگام‌سازی"}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        {toPersianDigits(filtered.length)} از {toPersianDigits(products.length)} کالا — با دکمهٔ ویرایش هر کالا، قیمت، توضیحات، گالری و سئو را همین‌جا تغییر دهید؛ تغییرات قیمت و دسته به نرم‌افزار حسابداری هم برمی‌گردد.
      </p>

      {/* گرید کالاها */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((p) => (
          <Card key={p.id} className="overflow-hidden">
            <div className="relative aspect-[5/4] bg-muted">
              {p.imageUrl ? (
                // آپلود کاربر — دامنه نامشخص
                <img src={p.imageUrl} alt={p.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Package className="h-9 w-9 text-muted-foreground/40" aria-hidden="true" />
                </div>
              )}
              {/* بج‌های وضعیت فروشگاه */}
              <span className="absolute right-2 top-2 flex flex-col items-start gap-1">
                {p.discountPercent && p.discountPercent > 0 ? (
                  <Badge className="rounded-full bg-teal-600 text-white">
                    <BadgePercent className="h-3 w-3" aria-hidden="true" />
                    {toPersianDigits(p.discountPercent)}٪
                  </Badge>
                ) : null}
                {p.showInStore === false ? (
                  <Badge variant="outline" className="rounded-full bg-zinc-900/80 text-white">
                    <EyeOff className="h-3 w-3" aria-hidden="true" />
                    مخفی
                  </Badge>
                ) : null}
              </span>
              <label
                className="absolute bottom-2 left-2 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80"
                title="گذاشتن/تعویض عکس"
              >
                {savingImage === p.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ImageIcon className="h-4 w-4" aria-hidden="true" />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void saveImage(p.id, f);
                  }}
                />
              </label>
              {p.imageUrl ? (
                <button
                  type="button"
                  onClick={() => void removeImage(p.id)}
                  className="absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-red-600"
                  title="حذف عکس"
                  aria-label={`حذف عکس ${p.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <CardContent className="p-3">
              <p className="line-clamp-2 min-h-[2.4rem] text-xs font-bold leading-5">{p.name}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {p.category ? (
                  <Badge variant="outline" className="rounded-full text-[10px]">{p.category}</Badge>
                ) : (
                  <Badge variant="outline" className="rounded-full border-amber-300 bg-amber-50 text-[10px] text-amber-700">بدون دسته</Badge>
                )}
                <Badge variant="outline" className={`rounded-full text-[10px] ${p.inStock ? "border-emerald-300 text-emerald-700" : "border-red-300 text-red-600"}`}>
                  {p.inStock ? (p.stockKnown ? `موجودی ${toPersianDigits(p.stock)}` : "موجود") : "ناموجود"}
                </Badge>
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <p className="text-xs font-black tabular-nums text-primary">
                  {currency === "IRT"
                    ? rialToTomanLabel(
                        p.discountPercent && p.discountPercent > 0 && p.salePrice
                          ? String(Math.trunc((Number(p.salePrice) * (100 - p.discountPercent)) / 100))
                          : p.salePrice
                      )
                    : rialToCurrencyLabel(p.salePrice, currency, rates.usdRateToman, rates.cnyRateToman)}
                </p>
                {p.discountPercent && p.discountPercent > 0 ? (
                  <span className="text-[10px] text-muted-foreground line-through">{rialToTomanLabel(p.salePrice)}</span>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 w-full gap-1.5 rounded-full"
                onClick={() => openEditor(p)}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                ویرایش کالا
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* v20-C — ویرایشگر حرفه‌ای کالا */}
      <ProductEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        product={editingProduct}
        onSaved={() => void load()}
      />

      {/* R28-8 — ویزارد کامل درون‌ریزی همان ماژول انبار (نگاشت دستی + پیش‌فرض +
          پیش‌تنظیم + پیش‌بینی نتیجه) — بدون خروج از پنل فروشگاه */}
      <UniversalImportDialog
        entity="products"
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => void load()}
      />
    </div>
  );
}
