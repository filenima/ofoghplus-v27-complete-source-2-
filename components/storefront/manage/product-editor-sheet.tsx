"use client";

// ═══════════════════════════════════════════════════════════════════
// Task 4 — ویرایشگر حرفه‌ای کالا (نسخهٔ ۲ — تجربهٔ ووکامرس‌مانند)
// شیت بزرگ با ۶ تب: محتوا | قیمت‌گذاری | گالری | دسته و برچسب | ارسال | سئو
// ذخیره → PUT /api/storefront/manage/products/[id]
// عکس‌ها → POST /api/storefront/manage/product-image (آپلود فایل، تبدیل خودکار AVIF)
// Task 3-e — بازسازی بخش تصاویر: گالری یکپارچه (تصویر اصلی + آرایهٔ تصاویر)،
// سه مسیر افزودن (آپلود | از مدیریت فایل | لینک عکس)، ترتیب‌چینی با دکمه‌های
// پیکان (بدون درگ — مناسب موبایل)، «اصلی» = تصویر کارت کالا، حذف تک‌تک تصاویر.
// جدید در Task 4:
//  • اسلاگ لاتین خودکار از نام فارسی (URL سئوپسند)
//  • برچسب‌ها (chips) + وزن بسته‌بندی + یادداشت ارسال
//  • پیش‌نمایش زندهٔ کارت کالا همان‌طور که مشتری می‌بیند
//  • Ctrl+S ذخیره | هشدار بستن با تغییرات ذخیره‌نشده | پیش‌نویس خودکار localStorage
//  • «تبدیل به تصویر اصلی» روی هر تصویر گالری
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  Loader2,
  Save,
  Package,
  Image as ImageIconLucide,
  Trash2,
  Upload,
  Plus,
  Tag as TagIcon,
  X,
  Star,
  Link2,
  Eye,
  Weight,
  Truck,
  Keyboard,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  ImagePlus,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichContentEditor } from "@/components/ui/rich-content-editor";
import { FileManagerDialog } from "@/components/file-manager-dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch, getAuthToken } from "@/lib/auth-fetch";
import { toPersianDigits, toEnglishDigits } from "@/lib/persian";
import { suggestCategorySlug } from "./categories-tab";

/* ═══════════════ انواع ═══════════════ */

/** شکل کالا از GET /api/storefront/manage/products */
export interface ManageProductDTO {
  id: string;
  sku: string;
  name: string;
  salePrice: string;
  purchasePrice: string;
  wholesalePrice: string;
  barcode?: string | null;
  goodsCode?: string | null;
  unit: string;
  description: string | null;
  imageUrl: string | null;
  slug?: string | null;
  categoryId: string | null;
  categoryName?: string | null;
  stock: number;
  stockKnown: boolean;
  inStock: boolean;
  discountPercent: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  showInStore: boolean;
  sortOrder: number;
  gallery: string[];
  tags?: string[];
  weightGrams?: number | null;
  shippingNote?: string | null;
}

export interface EditorCategoryOption {
  id: string;
  name: string;
  productCount?: number;
}

interface ProductEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ManageProductDTO | null;
  /** بعد از ذخیرهٔ موفق — والد فهرست را بازخوانی می‌کند */
  onSaved?: () => void;
}

/* ═══════════════ ابزارهای قیمت (ریال ↔ تومان) ═══════════════ */

/** رشتهٔ ریال → ورودی تومانی خالص (بدون جداکننده) */
function rialToTomanInput(rial: string | null | undefined): string {
  const n = Math.trunc(Number(rial ?? 0) / 10);
  return Number.isFinite(n) && n > 0 ? String(n) : "0";
}

/** ورودی تومانی (ارقام فارسی/جداکننده مجاز) → رشتهٔ ریال */
function tomanInputToRial(v: string): string {
  const digits = toEnglishDigits(String(v ?? "")).replace(/[^\d]/g, "");
  const n = digits ? Math.trunc(Number(digits)) : 0;
  if (!Number.isFinite(n) || n < 0) return "0";
  return String(n * 10);
}

function parseToman(v: string): number {
  const digits = toEnglishDigits(String(v ?? "")).replace(/[^\d]/g, "");
  const n = digits ? Math.trunc(Number(digits)) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function tomanLabel(n: number): string {
  return `${new Intl.NumberFormat("fa-IR").format(n)} تومان`;
}

/* ═══════════════ شکل فرم + پیش‌نویس ═══════════════ */

interface EditorForm {
  name: string;
  slug: string;
  slugTouched: boolean;
  unit: string;
  description: string;
  saleToman: string;
  purchaseToman: string;
  wholesaleToman: string;
  discountPercent: number;
  categoryId: string;
  seoTitle: string;
  seoDescription: string;
  showInStore: boolean;
  sortOrder: number;
  tags: string[];
  weightGrams: string;
  shippingNote: string;
}

function formFromProduct(p: ManageProductDTO): EditorForm {
  return {
    name: p.name,
    slug: p.slug ?? "",
    slugTouched: !!p.slug,
    unit: p.unit || "",
    description: p.description ?? "",
    saleToman: rialToTomanInput(p.salePrice),
    purchaseToman: rialToTomanInput(p.purchasePrice),
    wholesaleToman: rialToTomanInput(p.wholesalePrice),
    discountPercent: p.discountPercent ?? 0,
    categoryId: p.categoryId ?? "",
    seoTitle: p.seoTitle ?? "",
    seoDescription: p.seoDescription ?? "",
    showInStore: p.showInStore !== false,
    sortOrder: p.sortOrder ?? 0,
    tags: Array.isArray(p.tags) ? p.tags : [],
    weightGrams: p.weightGrams != null ? String(p.weightGrams) : "",
    shippingNote: p.shippingNote ?? "",
  };
}

/** پیش‌نویس خودکار در localStorage — بازیابی بعد از بستن تصادفی/refresh */
const draftKey = (id: string) => `sf_prod_draft_${id}`;

interface DraftPayload {
  form: EditorForm;
  gallery: string[];
  mainImage: string | null;
  savedAt: number;
}

/* ═══════════════ ابزارهای تصویر (Task 3-e) ═══════════════ */

/** آدرس معتبر تصویر: لینک کامل http(s) یا مسیر امن /uploads|banners/... */
function isValidImageSrc(u: string): boolean {
  if (u.includes("..") || /[\s"'<>]/.test(u)) return false;
  return /^https?:\/\/[^\s"'<>]+$/i.test(u) || /^\/(uploads|banners)\/[A-Za-z0-9._\/-]+$/i.test(u);
}

/** نرمال‌سازی گالری: حذف تکراری‌ها + اطمینان از حضور تصویر اصلی در ابتدای لیست */
function normalizeImages(main: string | null, gal: string[]): string[] {
  const list = Array.isArray(gal) ? gal.filter((u) => typeof u === "string" && u.trim() !== "") : [];
  const deduped = [...new Set(list)].slice(0, 24);
  if (main && !deduped.includes(main)) return [main, ...deduped].slice(0, 24);
  return deduped;
}

/* ═══════════════ کارت تصویر گالری (بدون درگ — دکمه‌های پیکان) ═══════════════ */

function ImageCard({
  url,
  isPrimary,
  busy,
  canMovePrev,
  canMoveNext,
  onMovePrev,
  onMoveNext,
  onRemove,
  onSetPrimary,
}: {
  url: string;
  isPrimary: boolean;
  busy: boolean;
  canMovePrev: boolean;
  canMoveNext: boolean;
  onMovePrev: () => void;
  onMoveNext: () => void;
  onRemove: () => void;
  onSetPrimary: () => void;
}) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl border bg-muted">
      {/* آپلود کاربر — دامنه نامشخص */}
      <img src={url} alt="تصویر کالا" className="h-full w-full object-cover" loading="lazy" />
      {isPrimary ? (
        <Badge className="absolute right-1.5 top-1.5 rounded-full bg-teal-600 text-white">تصویر اصلی</Badge>
      ) : (
        <button
          type="button"
          onClick={onSetPrimary}
          className="absolute right-1.5 top-1.5 inline-flex h-7 items-center gap-1 rounded-lg bg-black/60 px-2 text-[10px] font-bold text-white backdrop-blur transition-colors hover:bg-teal-700"
          aria-label="تبدیل به تصویر اصلی"
          title="این تصویر به‌عنوان تصویر اصلی کارت کالا نمایش داده می‌شود"
        >
          <Star className="h-3 w-3" aria-hidden="true" />
          اصلی
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        className="absolute left-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur transition-colors hover:bg-red-600 disabled:opacity-60"
        aria-label="حذف تصویر"
        title="حذف تصویر"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
      </button>
      {/* ترتیب — دکمه‌های پیکان (مناسب لمسی، بدون درگ) */}
      <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between">
        <button
          type="button"
          onClick={onMovePrev}
          disabled={!canMovePrev || busy}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80 disabled:opacity-30"
          aria-label="انتقال به ابتدای ترتیب"
          title="یک جای به عقب (ابتدای گالری)"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onMoveNext}
          disabled={!canMoveNext || busy}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80 disabled:opacity-30"
          aria-label="انتقال به انتهای ترتیب"
          title="یک جای به جلو (انتهای گالری)"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════ پیش‌نمایش زندهٔ کارت کالا (همان‌طور که مشتری می‌بیند) ═══════════════ */

function LiveProductPreview({
  form,
  mainImage,
  categoryName,
}: {
  form: EditorForm;
  mainImage: string | null;
  categoryName: string | null;
}) {
  const saleToman = parseToman(form.saleToman);
  const discount = Math.trunc(Number(form.discountPercent) || 0);
  const finalToman = discount > 0 ? Math.floor((saleToman * (100 - discount)) / 100) : saleToman;
  return (
    <div className="rounded-2xl border border-dashed bg-gradient-to-b from-muted/40 to-transparent p-3" dir="rtl">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        پیش‌نمایش زنده — کارت کالا در فروشگاه شما
      </p>
      <div className="mx-auto max-w-[230px] overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="relative aspect-[5/4] bg-muted">
          {mainImage ? (
            // آپلود کاربر — دامنه نامشخص
            <img src={mainImage} alt={form.name || "کالا"} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-9 w-9 text-muted-foreground/40" aria-hidden="true" />
            </div>
          )}
          {discount > 0 ? (
            <span className="absolute left-2 top-2 rounded-full bg-teal-600 px-2 py-0.5 text-[11px] font-extrabold text-white shadow-md">
              ٪{toPersianDigits(discount)} تخفیف
            </span>
          ) : null}
          {!form.showInStore ? (
            <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs font-bold text-zinc-700 backdrop-blur-[1px]">
              مخفی از فروشگاه
            </span>
          ) : null}
        </div>
        <div className="space-y-1.5 p-3 text-right">
          <p className="line-clamp-2 min-h-[2.4rem] text-[13px] font-bold leading-relaxed">
            {form.name || "نام کالا…"}
          </p>
          {categoryName ? (
            <Badge variant="outline" className="rounded-full text-[10px]">{categoryName}</Badge>
          ) : null}
          <div className="flex items-baseline gap-1.5">
            <p className="text-sm font-black tabular-nums text-primary">{tomanLabel(finalToman)}</p>
            {discount > 0 ? (
              <span className="text-[10px] text-muted-foreground line-through">{tomanLabel(saleToman)}</span>
            ) : null}
          </div>
          {form.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {form.tags.slice(0, 4).map((t) => (
                <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">#{t}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ شیت ویرایشگر کالا ═══════════════ */

export function ProductEditorSheet({ open, onOpenChange, product, onSaved }: ProductEditorSheetProps) {
  const { toast } = useToast();

  const [tab, setTab] = React.useState("content");
  const [form, setForm] = React.useState<EditorForm>(() => formFromProduct(product ?? ({ id: "", sku: "", name: "", salePrice: "0", purchasePrice: "0", wholesalePrice: "0", unit: "", description: null, imageUrl: null, categoryId: null, stock: 0, stockKnown: false, inStock: true, discountPercent: null, seoTitle: null, seoDescription: null, showInStore: true, sortOrder: 0, gallery: [] } as unknown as ManageProductDTO)));
  const [gallery, setGallery] = React.useState<string[]>([]);
  const [mainImage, setMainImage] = React.useState<string | null>(null);
  const [snapshot, setSnapshot] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [uploadingGallery, setUploadingGallery] = React.useState(false);
  const [removingUrl, setRemovingUrl] = React.useState<string | null>(null);
  const [categories, setCategories] = React.useState<EditorCategoryOption[]>([]);
  const [catDialogOpen, setCatDialogOpen] = React.useState(false);
  const [newCat, setNewCat] = React.useState({ name: "", parentId: "" });
  const [creatingCat, setCreatingCat] = React.useState(false);
  // ورودی برچسب تازه (chips)
  const [tagInput, setTagInput] = React.useState("");
  // هشدار بستن با تغییرات ذخیره‌نشده (دو مرحله‌ای مثل حالت ویرایش سایت)
  const [closeArmed, setCloseArmed] = React.useState(false);
  // پیش‌نویس بازیابی‌شده؟ (برای نمایش اطلاع)
  const [draftRestoredAt, setDraftRestoredAt] = React.useState<number | null>(null);
  // Task 3-e — سه مسیر افزودن تصویر: لینک + مدیریت فایل
  const [linkInput, setLinkInput] = React.useState("");
  const [fileManagerOpen, setFileManagerOpen] = React.useState(false);
  const [fmToken, setFmToken] = React.useState("");

  /* ── مقداردهی اولیه هنگام باز شدن + بازیابی پیش‌نویس ── */
  React.useEffect(() => {
    if (!open || !product) return;
    const fresh = formFromProduct(product);
    const freshMain = product.imageUrl ?? null;
    // نرمال‌سازی: تصویر اصلی همیشه اول گالری است (تکراری‌ها حذف)
    const freshGallery = normalizeImages(freshMain, product.gallery ?? []);

    // پیش‌نویس خودکار ذخیره‌شده؟ (بستن تصادفی/refresh) — فقط اگر جدیدتر از دادهٔ سرور باشد
    let restored: DraftPayload | null = null;
    try {
      const raw = window.localStorage.getItem(draftKey(product.id));
      if (raw) {
        const parsed = JSON.parse(raw) as DraftPayload;
        if (parsed?.form && typeof parsed.savedAt === "number" && Date.now() - parsed.savedAt < 24 * 60 * 60 * 1000) {
          restored = parsed;
        }
      }
    } catch {
      /* ignore */
    }

    const useDraft = !!restored;
    setForm(useDraft ? (restored as DraftPayload).form : fresh);
    setGallery(useDraft ? normalizeImages((restored as DraftPayload).mainImage, (restored as DraftPayload).gallery) : freshGallery);
    setMainImage(useDraft ? (restored as DraftPayload).mainImage : freshMain);
    setSnapshot(JSON.stringify({ f: fresh, gallery: freshGallery, m: freshMain }));
    setDraftRestoredAt(useDraft ? (restored as DraftPayload).savedAt : null);
    setTab("content");
    setCloseArmed(false);

    if (useDraft) {
      toast({
        title: "پیش‌نویس بازیابی شد",
        description: "تغییرات ذخیره‌نشدهٔ اخیر این کالا برگردانده شد — «نادیده گرفتن پیش‌نویس» برای بازگشت به دادهٔ سرور",
        duration: 7000,
      });
    }
  }, [open, product, toast]);

  /* ── پیش‌نویس خودکار (debounce) ── */
  React.useEffect(() => {
    if (!open || !product || !snapshot) return;
    const t = setTimeout(() => {
      try {
        const payload: DraftPayload = { form, gallery, mainImage, savedAt: Date.now() };
        window.localStorage.setItem(draftKey(product.id), JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    }, 800);
    return () => clearTimeout(t);
  }, [open, product, snapshot, form, gallery, mainImage]);

  /* ── دسته‌ها ── */
  const loadCategories = React.useCallback(async () => {
    try {
      const res = await authFetch("/api/storefront/manage/categories", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && Array.isArray(json.categories)) {
        setCategories(
          (json.categories as EditorCategoryOption[]).map((c) => ({ id: c.id, name: c.name, productCount: c.productCount }))
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    if (open) void loadCategories();
  }, [open, loadCategories]);

  const dirty = React.useMemo(() => {
    if (!product) return false;
    return JSON.stringify({ f: form, gallery, m: mainImage }) !== snapshot;
  }, [form, gallery, mainImage, snapshot, product]);

  /* ── Ctrl+S ذخیره + هشدار خروج ── */
  const saveRef = React.useRef<() => void>(() => undefined);
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirtyRef.current) saveRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  React.useEffect(() => {
    if (!open || !dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [open, dirty]);

  /* ── Task 3-e: افزودن تصویر از هر مسیر (لینک / مدیریت فایل) ── */
  function addImageUrl(url: string) {
    const u = url.trim();
    if (!u) return;
    if (!isValidImageSrc(u)) {
      toast({
        title: "آدرس تصویر نامعتبر است",
        description: "فقط لینک کامل (https://…) یا مسیر /uploads/… مجاز است",
        variant: "destructive",
      });
      return;
    }
    if (gallery.includes(u)) {
      toast({ title: "این تصویر قبلاً اضافه شده است" });
      return;
    }
    if (gallery.length >= 24) {
      toast({ title: "گالری پر است", description: "حداکثر ۲۴ تصویر برای هر کالا", variant: "destructive" });
      return;
    }
    setGallery((g) => [...g, u]);
    // اگر هنوز تصویر اصلی‌ای نیست، همین تصویر اصلی کارت کالا می‌شود
    setMainImage((m) => m ?? u);
    toast({ title: "تصویر اضافه شد", description: "برای اعمال نهایی «ذخیره» را بزنید" });
  }

  /* ── آپلود تصاویر جدید (تبدیل خودکار AVIF سمت سرور؛ ترتیب با ذخیره اعمال می‌شود) ── */
  async function uploadGalleryImages(files: FileList) {
    if (!product) return;
    setUploadingGallery(true);
    try {
      const added: string[] = [];
      for (const file of Array.from(files).slice(0, 8)) {
        const fd = new FormData();
        fd.set("productId", product.id);
        fd.set("file", file);
        fd.set("gallery", "1");
        const res = await authFetch("/api/storefront/manage/product-image", { method: "POST", body: fd });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success && json.imageUrl) added.push(json.imageUrl as string);
      }
      if (added.length > 0) {
        setGallery((g) => [...g, ...added.filter((u) => !g.includes(u))].slice(0, 24));
        setMainImage((m) => m ?? added[0] ?? null);
        toast({ title: `${toPersianDigits(added.length)} تصویر اضافه شد`, description: "برای اعمال نهایی «ذخیره» را بزنید" });
      } else {
        toast({ title: "آپلود ناموفق", description: "حداقل یک تصویر معتبر انتخاب کنید", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setUploadingGallery(false);
    }
  }

  /* ── حذف تصویر (فایل اختصاصی همین کالا از دیسک پاک می‌شود) ── */
  async function removeGalleryImage(url: string) {
    setRemovingUrl(url);
    try {
      // فقط فایل‌های اختصاصی گالری این کالا از دیسک پاک می‌شوند —
      // فایل‌های کتابخانهٔ «مدیریت فایل» و لینک‌های بیرونی دست‌نخورده می‌مانند
      if (url.startsWith("/uploads/storefront/products/")) {
        await authFetch(`/api/storefront/manage/product-image?url=${encodeURIComponent(url)}`, { method: "DELETE" });
      }
    } catch {
      /* فایل شاید قبلاً حذف شده — آرایه را به‌روز می‌کنیم */
    } finally {
      const next = gallery.filter((x) => x !== url);
      setGallery(next);
      if (mainImage === url) setMainImage(next[0] ?? null);
      setRemovingUrl(null);
    }
  }

  /* ── جابه‌جایی ترتیب با دکمه‌های پیکان (بدون درگ — مناسب موبایل) ── */
  function moveImage(url: string, dir: -1 | 1) {
    setGallery((g) => {
      const i = g.indexOf(url);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= g.length) return g;
      const next = [...g];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  /* ── ساخت دستهٔ جدید درجا ── */
  async function createCategory() {
    const name = newCat.name.trim();
    if (name.length < 2) {
      toast({ title: "نام دسته را وارد کنید", description: "نام دسته باید ۲ تا ۸۰ نویسه باشد", variant: "destructive" });
      return;
    }
    setCreatingCat(true);
    try {
      const res = await authFetch("/api/storefront/manage/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: newCat.parentId || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ساخت دسته ناموفق", description: json?.error || "دوباره تلاش کنید", variant: "destructive" });
        return;
      }
      const cat = json.category as { id: string; name: string };
      setCategories((cs) => [...cs, { id: cat.id, name: cat.name, productCount: 0 }]);
      setForm((f) => ({ ...f, categoryId: cat.id }));
      setCatDialogOpen(false);
      setNewCat({ name: "", parentId: "" });
      toast({ title: `دستهٔ «${cat.name}» ساخته شد` });
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setCreatingCat(false);
    }
  }

  /* ── برچسب‌ها (chips) ── */
  function addTag() {
    const t = tagInput.trim().replace(/^#/, "").slice(0, 40);
    if (!t) return;
    setForm((f) => (f.tags.includes(t) || f.tags.length >= 15 ? f : { ...f, tags: [...f.tags, t] }));
    setTagInput("");
  }

  function removeTag(tag: string) {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  }

  /* ── نادیده گرفتن پیش‌نویس محلی ── */
  function discardDraft() {
    if (!product) return;
    try {
      window.localStorage.removeItem(draftKey(product.id));
    } catch {
      /* ignore */
    }
    const fresh = formFromProduct(product);
    setForm(fresh);
    setGallery(normalizeImages(product.imageUrl ?? null, product.gallery ?? []));
    setMainImage(product.imageUrl ?? null);
    setDraftRestoredAt(null);
    toast({ title: "پیش‌نویس نادیده گرفته شد", description: "دادهٔ سرور بازیابی شد" });
  }

  /* ── اعتبارسنجی + ذخیره ── */
  async function save() {
    if (!product) return;
    const name = form.name.trim();
    if (name.length < 2 || name.length > 200) {
      setTab("content");
      toast({ title: "نام کالا معتبر نیست", description: "نام باید ۲ تا ۲۰۰ نویسه باشد", variant: "destructive" });
      return;
    }
    if (!form.unit.trim()) {
      setTab("content");
      toast({ title: "واحد شمارش خالی است", description: "مثلاً: عدد، کیلوگرم، بسته", variant: "destructive" });
      return;
    }
    const slug = form.slug.trim().toLowerCase();
    if (slug && !/^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/.test(slug) && !/^[a-z0-9]$/.test(slug)) {
      setTab("content");
      toast({
        title: "اسلاگ نامعتبر است",
        description: "فقط حروف انگلیسی کوچک، رقم و خط تیره (۲ تا ۸۰ نویسه) — خالی بگذارید تا URL با کد کالا ساخته شود",
        variant: "destructive",
      });
      return;
    }
    const d = Math.trunc(Number(form.discountPercent) || 0);
    if (d < 0 || d > 90) {
      setTab("pricing");
      toast({ title: "درصد تخفیف نامعتبر است", description: "عددی بین ۰ تا ۹۰ وارد کنید", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(`/api/storefront/manage/products/${encodeURIComponent(product.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          unit: form.unit.trim(),
          description: form.description || null,
          slug: slug || null,
          // Task 3-e — تصویر اصلی (لینک یا مسیر آپلودی) همراه همان ذخیرهٔ گالری
          imageUrl: mainImage,
          salePrice: tomanInputToRial(form.saleToman),
          purchasePrice: tomanInputToRial(form.purchaseToman),
          wholesalePrice: tomanInputToRial(form.wholesaleToman),
          categoryId: form.categoryId || null,
          meta: {
            gallery,
            discountPercent: d > 0 ? d : null,
            seoTitle: form.seoTitle.trim() || null,
            seoDescription: form.seoDescription.trim() || null,
            showInStore: form.showInStore,
            sortOrder: form.sortOrder,
            tags: form.tags,
            weightGrams: form.weightGrams.trim() === "" ? null : Number(toEnglishDigits(form.weightGrams).replace(/[^\d]/g, "")) || null,
            shippingNote: form.shippingNote.trim() || null,
          },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ذخیره نشد", description: json?.error || "دوباره تلاش کنید", variant: "destructive" });
        return;
      }
      setSnapshot(JSON.stringify({ f: form, gallery, m: mainImage }));
      // پیش‌نویس محلی دیگر لازم نیست
      try {
        window.localStorage.removeItem(draftKey(product.id));
      } catch {
        /* ignore */
      }
      setDraftRestoredAt(null);
      toast({
        title: "کالا ذخیره شد",
        description: json.message || "تغییرات همین حالا در فروشگاه شما اعمال می‌شود",
      });
      onSaved?.();
      onOpenChange(false);
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }
  // برای میان‌بر Ctrl+S (همیشه تازه‌ترین save)
  saveRef.current = () => void save();

  /* ── بستن با هشدار دو مرحله‌ای وقتی تغییرات ذخیره‌نشده هست ── */
  function requestClose() {
    if (dirty && !closeArmed) {
      setCloseArmed(true);
      toast({
        title: "تغییرات ذخیره‌نشده دارید",
        description: "دوباره «انصراف» را بزنید تا بدون ذخیره بسته شود — پیش‌نویس به‌صورت خودکار نگه داشته می‌شود",
      });
      return;
    }
    onOpenChange(false);
  }

  /* ── پیش‌نمایش قیمت نهایی ── */
  const saleToman = parseToman(form.saleToman);
  const discount = Math.trunc(Number(form.discountPercent) || 0);
  const finalToman = discount > 0 ? Math.floor((saleToman * (100 - discount)) / 100) : saleToman;
  const currentCategoryName = categories.find((c) => c.id === form.categoryId)?.name ?? null;

  if (!product) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) requestClose();
        else onOpenChange(true);
      }}
    >
      <SheetContent
        side="left"
        dir="rtl"
        className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        {/* هدر */}
        <SheetHeader className="border-b px-5 py-4 text-right">
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" aria-hidden="true" />
            ویرایش کالا
            <span className="truncate text-sm font-normal text-muted-foreground" dir="ltr">
              {product.sku}
            </span>
            {dirty ? (
              <Badge variant="outline" className="mr-auto shrink-0 gap-1 rounded-full border-amber-300 bg-amber-50 text-[11px] text-amber-700">
                تغییرات ذخیره‌نشده
              </Badge>
            ) : (
              <Badge variant="outline" className="mr-auto shrink-0 gap-1 rounded-full border-emerald-300 bg-emerald-50 text-[11px] text-emerald-700">
                ذخیره شده
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription className="line-clamp-1">
            {product.name} — {product.inStock ? `موجودی: ${toPersianDigits(product.stock)}` : "ناموجود"}
            <span className="mx-1.5 text-muted-foreground/50">·</span>
            <span className="inline-flex items-center gap-1 text-[11px]">
              <Keyboard className="h-3 w-3" aria-hidden="true" />
              Ctrl+S = ذخیره
            </span>
          </SheetDescription>
        </SheetHeader>

        {/* تب‌ها */}
        <Tabs value={tab} onValueChange={setTab} dir="rtl" className="flex min-h-0 flex-1 flex-col">
          <div className="border-b px-3 pt-3">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
              <TabsTrigger value="content" className="gap-1.5 rounded-lg text-xs">محتوا</TabsTrigger>
              <TabsTrigger value="pricing" className="gap-1.5 rounded-lg text-xs">قیمت‌گذاری</TabsTrigger>
              <TabsTrigger value="gallery" className="gap-1.5 rounded-lg text-xs">گالری</TabsTrigger>
              <TabsTrigger value="category" className="gap-1.5 rounded-lg text-xs">دسته و برچسب</TabsTrigger>
              <TabsTrigger value="shipping" className="gap-1.5 rounded-lg text-xs">ارسال</TabsTrigger>
              <TabsTrigger value="seo" className="gap-1.5 rounded-lg text-xs">سئو</TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {/* ═══ تب محتوا ═══ */}
            <TabsContent value="content" className="mt-0 space-y-4">
              <div className="grid gap-4 lg:grid-cols-[1fr_250px]">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pe-name">نام کالا</Label>
                    <Input
                      id="pe-name"
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          name: e.target.value,
                          // اسلاگ خودکار تا وقتی کاربر دستی تغییرش نداده
                          slug: f.slugTouched ? f.slug : suggestCategorySlug(e.target.value),
                        }))
                      }
                      maxLength={200}
                      placeholder="نامی که مشتری در فروشگاه می‌بیند"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pe-slug" className="flex items-center gap-1.5">
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                      اسلاگ (آدرس کالا — اختیاری)
                    </Label>
                    <Input
                      id="pe-slug"
                      dir="ltr"
                      className="font-mono text-xs"
                      value={form.slug}
                      onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().trim(), slugTouched: true }))}
                      maxLength={80}
                      placeholder={suggestCategorySlug(form.name) || "redmi-note-13"}
                    />
                    <p className="text-[11px] leading-5 text-muted-foreground">
                      اگر خالی بگذارید، آدرس با کد یکتای کالا ساخته می‌شود. با اسلاگ لاتین، آدرس سئوپسند و قابل‌اشتراک است.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="pe-sku">کد کالا (SKU)</Label>
                      <Input id="pe-sku" value={product.sku} readOnly disabled dir="ltr" className="font-mono text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pe-unit">واحد شمارش</Label>
                      <Input
                        id="pe-unit"
                        value={form.unit}
                        onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                        maxLength={30}
                        placeholder="عدد / کیلوگرم / بسته"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pe-barcode">بارکد</Label>
                    <Input
                      id="pe-barcode"
                      dir="ltr"
                      value={product.barcode ?? ""}
                      readOnly
                      disabled
                      className="font-mono text-xs"
                      placeholder="—"
                    />
                    <p className="text-[11px] text-muted-foreground">بارکد و SKU از ماژول «انبار و کالا» تغییر می‌کند (همگام با حسابداری)</p>
                  </div>

                  <Separator />

                  {/* تصویر اصلی — پیش‌نمایش؛ مدیریت کامل در تب «گالری» (Task 3-e) */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <ImageIconLucide className="h-4 w-4" aria-hidden="true" />
                      تصویر اصلی کالا
                    </Label>
                    <div className="flex items-start gap-3">
                      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border bg-muted">
                        {mainImage ? (
                          // آپلود کاربر — دامنه نامشخص
                          <img src={mainImage} alt={form.name || "کالا"} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-9 w-9 text-muted-foreground/40" aria-hidden="true" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-fit gap-1.5 rounded-full"
                          onClick={() => setTab("gallery")}
                        >
                          <ImagePlus className="h-4 w-4" aria-hidden="true" />
                          {mainImage ? "تعویض / مدیریت تصاویر" : "افزودن تصویر"}
                        </Button>
                        <p className="text-[11px] leading-5 text-muted-foreground">
                          در تب «گالری» تصویر آپلود کنید (تبدیل خودکار AVIF)، از مدیریت فایل انتخاب کنید یا لینک تصویر را وارد کنید — تصویر «اصلی» روی کارت کالا در فروشگاه نمایش داده می‌شود.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-1.5">
                    <Label>توضیحات کالا</Label>
                    <RichContentEditor
                      value={form.description ?? ""}
                      onChange={(html) => setForm((f) => ({ ...f, description: html }))}
                      placeholder="توضیح کامل کالا: مشخصات، مزایا، شرایط ارسال…"
                      minHeight={240}
                    />
                  </div>
                </div>

                {/* پیش‌نمایش زنده */}
                <div className="space-y-3">
                  <LiveProductPreview form={form} mainImage={mainImage} categoryName={currentCategoryName} />
                  {draftRestoredAt ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">
                      <p className="font-bold">پیش‌نویس بازیابی‌شده</p>
                      <p className="mt-1">ذخیرهٔ {new Date(draftRestoredAt).toLocaleTimeString("fa-IR")} — اگر نمی‌خواهید:</p>
                      <Button type="button" variant="outline" size="sm" className="mt-2 gap-1.5 rounded-full text-[11px]" onClick={discardDraft}>
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        نادیده گرفتن پیش‌نویس
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </TabsContent>

            {/* ═══ تب قیمت‌گذاری ═══ */}
            <TabsContent value="pricing" className="mt-0 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pe-sale">قیمت فروش (تومان)</Label>
                  <Input
                    id="pe-sale"
                    dir="ltr"
                    inputMode="numeric"
                    value={form.saleToman}
                    onChange={(e) => setForm((f) => ({ ...f, saleToman: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground">{tomanLabel(saleToman)}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pe-purchase">قیمت خرید (تومان)</Label>
                  <Input
                    id="pe-purchase"
                    dir="ltr"
                    inputMode="numeric"
                    value={form.purchaseToman}
                    onChange={(e) => setForm((f) => ({ ...f, purchaseToman: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground">{tomanLabel(parseToman(form.purchaseToman))}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pe-wholesale">قیمت عمده (تومان)</Label>
                  <Input
                    id="pe-wholesale"
                    dir="ltr"
                    inputMode="numeric"
                    value={form.wholesaleToman}
                    onChange={(e) => setForm((f) => ({ ...f, wholesaleToman: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground">{tomanLabel(parseToman(form.wholesaleToman))}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3 rounded-2xl border border-teal-200/70 bg-teal-50/40 p-4 dark:border-teal-900 dark:bg-teal-950/30">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pe-discount" className="text-sm font-bold text-teal-900 dark:text-teal-300">
                    تخفیف اختصاصی این کالا
                  </Label>
                  <span className="text-xs font-bold text-teal-800 dark:text-teal-300">
                    {toPersianDigits(discount)}٪ (۰ تا ۹۰)
                  </span>
                </div>
                <Slider
                  id="pe-discount"
                  value={[discount]}
                  onValueChange={(v) => setForm((f) => ({ ...f, discountPercent: v[0] ?? 0 }))}
                  min={0}
                  max={90}
                  step={1}
                />
                <div className="flex items-center gap-2">
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    className="h-8 w-20 text-center"
                    value={String(discount)}
                    onChange={(e) => {
                      const n = Number(toEnglishDigits(e.target.value).replace(/[^\d]/g, ""));
                      setForm((f) => ({ ...f, discountPercent: Number.isFinite(n) ? Math.min(90, Math.max(0, n)) : 0 }));
                    }}
                    aria-label="درصد تخفیف"
                  />
                  <span className="text-xs text-muted-foreground">درصد</span>
                </div>
                {/* پیش‌نمایش زندهٔ قیمت نهایی */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 p-3 dark:bg-black/20">
                  <div>
                    <p className="text-[11px] text-muted-foreground">قیمت نهایی برای مشتری</p>
                    <p className="text-lg font-black tabular-nums text-teal-700 dark:text-teal-400">
                      {tomanLabel(finalToman)}
                    </p>
                  </div>
                  {discount > 0 ? (
                    <div className="text-left">
                      <p className="text-[11px] text-muted-foreground">قیمت قبل از تخفیف</p>
                      <p className="text-sm font-bold text-muted-foreground line-through">{tomanLabel(saleToman)}</p>
                      <Badge className="mt-1 rounded-full bg-teal-600 text-white">{toPersianDigits(discount)}٪ تخفیف</Badge>
                    </div>
                  ) : (
                    <p className="max-w-[220px] text-[11px] leading-5 text-muted-foreground">
                      با بالا بردن اسلایدر، قیمت خط‌خورده و بج تخفیف سبز در کارت کالا نمایش داده می‌شود.
                    </p>
                  )}
                </div>
                <p className="text-[11px] leading-5 text-teal-800/80 dark:text-teal-400/70">
                  تخفیف اختصاصی کالا بر کد تخفیف کل فروشگاه اولویت دارد و در قیمت نهایی سفارش هم اعمال می‌شود. قیمت پایه در نرم‌افزار حسابداری هم به‌روز می‌شود.
                </p>
              </div>
            </TabsContent>

            {/* ═══ تب گالری (Task 3-e — سه مسیر افزودن تصویر) ═══ */}
            <TabsContent value="gallery" className="mt-0 space-y-4">
              <div>
                <p className="text-sm font-bold">تصاویر کالا</p>
                <p className="text-[11px] leading-5 text-muted-foreground">
                  تصویر «اصلی» روی کارت کالا در فروشگاه نمایش داده می‌شود — با دکمه‌های پیکانِ هر تصویر ترتیب را عوض کنید و با «اصلی» هر تصویر را به تصویر اصلی تبدیل کنید.
                </p>
              </div>

              {/* سه مسیر افزودن: آپلود | از مدیریت فایل | لینک عکس */}
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 ${
                    uploadingGallery ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  {uploadingGallery ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                  آپلود عکس
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) void uploadGalleryImages(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-full"
                  onClick={() => {
                    setFmToken(getAuthToken() ?? "");
                    setFileManagerOpen(true);
                  }}
                >
                  <FolderOpen className="h-4 w-4" aria-hidden="true" />
                  از مدیریت فایل
                </Button>
                <div className="flex min-w-[240px] flex-1 items-center gap-1.5">
                  <Input
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (linkInput.trim()) {
                          addImageUrl(linkInput);
                          setLinkInput("");
                        }
                      }
                    }}
                    dir="ltr"
                    placeholder="https://example.com/photo.jpg"
                    className="h-9 text-xs"
                    aria-label="لینک عکس"
                    maxLength={2048}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 gap-1.5 rounded-full"
                    disabled={!linkInput.trim()}
                    onClick={() => {
                      if (linkInput.trim()) {
                        addImageUrl(linkInput);
                        setLinkInput("");
                      }
                    }}
                  >
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                    افزودن لینک
                  </Button>
                </div>
              </div>
              <p className="text-[11px] leading-5 text-muted-foreground">
                لینک عکس باید با https:// شروع شود یا مسیری از /uploads/ باشد — تصاویر آپلودی خودکار به AVIF تبدیل و فشرده می‌شوند.
              </p>

              {gallery.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  هنوز تصویری برای این کالا ثبت نشده — آپلود کنید، از مدیریت فایل انتخاب کنید یا لینک تصویر را وارد کنید تا در فروشگاه نمایش داده شود.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {gallery.map((url, i) => (
                    <ImageCard
                      key={url}
                      url={url}
                      isPrimary={url === mainImage}
                      busy={removingUrl === url}
                      canMovePrev={i > 0}
                      canMoveNext={i < gallery.length - 1}
                      onMovePrev={() => moveImage(url, -1)}
                      onMoveNext={() => moveImage(url, 1)}
                      onRemove={() => void removeGalleryImage(url)}
                      onSetPrimary={() => setMainImage(url)}
                    />
                  ))}
                </div>
              )}

              <p className="text-[11px] leading-5 text-muted-foreground">
                تا ۲۴ تصویر؛ همهٔ تغییرات (افزودن، ترتیب، تصویر اصلی، حذف) فقط با دکمهٔ «ذخیره» اعمال می‌شود. متن جایگزین (alt) هر تصویر = نام کالا.
              </p>
            </TabsContent>

            {/* ═══ تب دسته و برچسب ═══ */}
            <TabsContent value="category" className="mt-0 space-y-4">
              <div className="space-y-1.5">
                <Label>دستهٔ این کالا</Label>
                <div className="flex items-center gap-2">
                  <Select value={form.categoryId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v === "none" ? "" : v }))}>
                    <SelectTrigger className="flex-1" dir="rtl">
                      <SelectValue placeholder="انتخاب دسته…" />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="none">بدون دسته</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {typeof c.productCount === "number" ? ` (${toPersianDigits(c.productCount)} کالا)` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5 rounded-full"
                    onClick={() => setCatDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    دسته جدید
                  </Button>
                </div>
                <p className="text-[11px] leading-5 text-muted-foreground">
                  دستهٔ کالا در فیلترها و صفحهٔ فروشگاه مشتری دیده می‌شود — مدیریت کامل دسته‌ها در تب «دسته‌بندی‌ها».
                </p>
              </div>

              <Separator />

              {/* برچسب‌ها */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <TagIcon className="h-4 w-4" aria-hidden="true" />
                  برچسب‌ها (تا ۱۵ مورد)
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="مثلاً: اورجینال — اینتر بزنید"
                    maxLength={40}
                  />
                  <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5 rounded-full" onClick={addTag}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    افزودن
                  </Button>
                </div>
                {form.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {form.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                      >
                        #{t}
                        <button
                          type="button"
                          onClick={() => removeTag(t)}
                          className="rounded-full p-0.5 transition-colors hover:bg-muted-foreground/15 hover:text-foreground"
                          aria-label={`حذف برچسب ${t}`}
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] leading-5 text-muted-foreground">
                    برچسب‌ها در جستجوی فروشگاه هم تطبیق می‌شوند و روی کارت/صفحهٔ کالا با # نمایش داده می‌شوند.
                  </p>
                )}
              </div>
            </TabsContent>

            {/* ═══ تب ارسال (Task 4) ═══ */}
            <TabsContent value="shipping" className="mt-0 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pe-weight" className="flex items-center gap-1.5">
                  <Weight className="h-4 w-4 text-primary" aria-hidden="true" />
                  وزن بسته‌بندی (گرم)
                </Label>
                <Input
                  id="pe-weight"
                  dir="ltr"
                  inputMode="numeric"
                  className="w-40"
                  value={form.weightGrams}
                  onChange={(e) => setForm((f) => ({ ...f, weightGrams: toEnglishDigits(e.target.value).replace(/[^\d]/g, "") }))}
                  placeholder="مثلاً: 350"
                  maxLength={8}
                />
                <p className="text-[11px] leading-5 text-muted-foreground">
                  {form.weightGrams && Number(form.weightGrams) > 0
                    ? `≈ ${toPersianDigits((Number(form.weightGrams) / 1000).toFixed(2))} کیلوگرم — برای تخمین هزینهٔ ارسال پستی استفاده می‌شود.`
                    : "اختیاری — روی صفحهٔ کالا و محاسبهٔ ارسال کمک می‌کند."}
                </p>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="pe-shipping-note" className="flex items-center gap-1.5">
                  <Truck className="h-4 w-4 text-primary" aria-hidden="true" />
                  یادداشت ارسال اختصاصی این کالا
                </Label>
                <Textarea
                  id="pe-shipping-note"
                  rows={3}
                  value={form.shippingNote}
                  onChange={(e) => setForm((f) => ({ ...f, shippingNote: e.target.value.slice(0, 300) }))}
                  maxLength={300}
                  placeholder="مثلاً: فقط با پست پیشتاز ارسال می‌شود — بسته‌بندی ضدضربه"
                />
                <p className="text-[11px] leading-5 text-muted-foreground">
                  این متن روی صفحهٔ عمومی کالا کنار قیمت نمایش داده می‌شود (تا ۳۰۰ نویسه).
                </p>
              </div>
            </TabsContent>

            {/* ═══ تب سئو ═══ */}
            <TabsContent value="seo" className="mt-0 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pe-seo-title">عنوان سئو</Label>
                  <span className={`text-[11px] tabular-nums ${form.seoTitle.length > 120 ? "font-bold text-red-500" : "text-muted-foreground"}`}>
                    {toPersianDigits(form.seoTitle.length)} / {toPersianDigits(120)}
                  </span>
                </div>
                <Input
                  id="pe-seo-title"
                  value={form.seoTitle}
                  onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value.slice(0, 140) }))}
                  maxLength={140}
                  placeholder={form.name || product.name}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pe-seo-desc">توضیح متا (توضیح سئو)</Label>
                  <span className={`text-[11px] tabular-nums ${form.seoDescription.length > 320 ? "font-bold text-red-500" : "text-muted-foreground"}`}>
                    {toPersianDigits(form.seoDescription.length)} / {toPersianDigits(320)}
                  </span>
                </div>
                <Textarea
                  id="pe-seo-desc"
                  rows={4}
                  value={form.seoDescription}
                  onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value.slice(0, 340) }))}
                  maxLength={340}
                  placeholder="خلاصه‌ای که در نتایج جستجوی گوگل نمایش داده می‌شود"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <Label htmlFor="pe-show-store" className="text-sm">وضعیت انتشار در فروشگاه</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {form.showInStore
                      ? "منتشر شده — کالا برای مشتریان قابل مشاهده و سفارش است."
                      : "پیش‌نویس (مخفی) — کالا از فروشگاه پنهان می‌شود ولی در حسابداری می‌ماند."}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <Switch
                    id="pe-show-store"
                    checked={form.showInStore}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, showInStore: v }))}
                  />
                  <Badge
                    variant="outline"
                    className={
                      form.showInStore
                        ? "border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700"
                        : "border-amber-300 bg-amber-50 text-[10px] text-amber-700"
                    }
                  >
                    {form.showInStore ? "منتشر شده" : "پیش‌نویس"}
                  </Badge>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pe-sort">ترتیب نمایش</Label>
                <Input
                  id="pe-sort"
                  dir="ltr"
                  inputMode="numeric"
                  className="w-28"
                  value={String(form.sortOrder)}
                  onChange={(e) => {
                    const n = Number(toEnglishDigits(e.target.value).replace(/[^\d-]/g, ""));
                    setForm((f) => ({ ...f, sortOrder: Number.isFinite(n) ? n : 0 }));
                  }}
                />
                <p className="text-[11px] text-muted-foreground">عدد کوچک‌تر = بالاتر در فهرست</p>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* فوتر چسبان */}
        <div className="flex flex-wrap items-center gap-2 border-t bg-background px-5 py-3">
          {dirty ? (
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-600">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
              تغییرات ذخیره‌نشده دارید (پیش‌نویس خودکار نگه داشته می‌شود)
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">همهٔ تغییرات ذخیره شده است</span>
          )}
          <div className="mr-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={requestClose}
              disabled={saving}
            >
              انصراف
            </Button>
            <Button type="button" className="gap-1.5 rounded-full" onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              ذخیره
              <kbd className="ms-1 hidden rounded border border-primary-foreground/30 px-1 text-[10px] font-bold sm:inline" dir="ltr">Ctrl+S</kbd>
            </Button>
          </div>
        </div>

        {/* دیالوگ ساخت دستهٔ جدید درجا */}
        <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
          <DialogContent className="sm:max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TagIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                دستهٔ جدید
              </DialogTitle>
              <DialogDescription>دستهٔ ساخته‌شده بلافاصله به فهرست بالا اضافه می‌شود.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pe-newcat-name">نام دسته</Label>
                <Input
                  id="pe-newcat-name"
                  value={newCat.name}
                  onChange={(e) => setNewCat((c) => ({ ...c, name: e.target.value }))}
                  maxLength={80}
                  placeholder="مثلاً: لوازم جانبی موبایل"
                />
              </div>
              <div className="space-y-1.5">
                <Label>دستهٔ والد (اختیاری)</Label>
                <Select value={newCat.parentId || "none"} onValueChange={(v) => setNewCat((c) => ({ ...c, parentId: v === "none" ? "" : v }))}>
                  <SelectTrigger dir="rtl">
                    <SelectValue placeholder="بدون والد" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="none">بدون والد (دستهٔ اصلی)</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setCatDialogOpen(false)} disabled={creatingCat}>
                <X className="h-4 w-4" aria-hidden="true" />
                انصراف
              </Button>
              <Button type="button" size="sm" className="rounded-full" onClick={() => void createCategory()} disabled={creatingCat}>
                {creatingCat ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                ساختن دسته
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Task 3-e — انتخاب تصویر کالا از مدیریت فایل (کتابخانهٔ تصاویر آپلودشده) */}
        <FileManagerDialog
          open={fileManagerOpen}
          onOpenChange={setFileManagerOpen}
          token={fmToken}
          onSelect={(url) => addImageUrl(url)}
          title="انتخاب تصویر کالا"
          description="از بین تصاویر آپلودشدهٔ کسب‌وکارتان انتخاب کنید یا تصویر جدیدی آپلود کنید (حداکثر ۵ مگابایت)"
          currentUrl={mainImage}
        />
      </SheetContent>
    </Sheet>
  );
}
