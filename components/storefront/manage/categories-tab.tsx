"use client";

// ═══════════════════════════════════════════════════════════════════
// v20-C — تب مدیریت دسته‌بندی‌های فروشگاه
// ساخت/ویرایش/حذف دسته + انتخاب آیکون + اسلاگ لاتین + ترتیب‌چینی drag&drop
// API: GET/POST/PUT /api/storefront/manage/categories (+ [id] برای PUT/DELETE)
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Save,
  Layers,
  Package,
  AlertTriangle,
  RefreshCw,
  Tag as TagIcon,
  Upload,
  Image as ImageIconLucide,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Smartphone, Shirt, ShoppingCart, Utensils, Wrench, Car, Home, Book, Heart,
  Gift, Coffee, Laptop, Watch, Camera, Plane, Baby, Dog, Sparkles, Tag,
  Package as PackageIcon, Store, Percent, Star, Leaf, Search,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits } from "@/lib/persian";

/* ═══════════════ انواع و ثابت‌ها ═══════════════ */

interface CategoryRow {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  icon: string | null;
  slug: string | null;
  description: string | null;
  sortOrder: number;
  productCount: number;
  imageUrl: string | null;
  createdAt: string;
}

/** نقشهٔ آیکون‌های پیشنهادی (نام → کامپوننت lucide) */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Smartphone, Shirt, ShoppingCart, Utensils, Wrench, Car, Home, Book, Heart,
  Gift, Coffee, Laptop, Watch, Camera, Plane, Baby, Dog, Sparkles, Tag,
  Package: PackageIcon, Store, Percent, Star, Leaf,
};

const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

/** آیکون دسته بر اساس نام (fallback: Layers) */
export function categoryIconByName(name: string | null | undefined): LucideIcon {
  if (name && CATEGORY_ICONS[name]) return CATEGORY_ICONS[name];
  return Layers;
}

/** حروف‌نویسی سادهٔ فارسی → لاتین برای پیشنهاد اسلاگ */
const FA_TO_EN: Record<string, string> = {
  "آ": "a", "ا": "a", "ب": "b", "پ": "p", "ت": "t", "ث": "s", "ج": "j", "چ": "ch",
  "ح": "h", "خ": "kh", "د": "d", "ذ": "z", "ر": "r", "ز": "z", "ژ": "zh", "س": "s",
  "ش": "sh", "ص": "s", "ض": "z", "ط": "t", "ظ": "z", "ع": "a", "غ": "gh", "ف": "f",
  "ق": "gh", "ک": "k", "ك": "k", "گ": "g", "ل": "l", "م": "m", "ن": "n", "و": "v",
  "ه": "h", "ی": "i", "ي": "i", "ئ": "i", "ء": "", "ة": "h", "أ": "a", "ؤ": "v",
};

export function suggestCategorySlug(name: string): string {
  const transliterated = [...name.trim()]
    .map((ch) => (FA_TO_EN[ch] !== undefined ? FA_TO_EN[ch] : /[a-zA-Z0-9 -]/.test(ch) ? ch.toLowerCase() : ""))
    .join("")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return transliterated;
}

/* ═══════════════ سطر قابل‌مرتب‌سازی ═══════════════ */

function SortableCategoryRow({
  cat,
  onEdit,
  onDelete,
}: {
  cat: CategoryRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  const catIcon = categoryIconByName(cat.icon);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-2xl border bg-card p-3 ${isDragging ? "z-10 opacity-70 shadow-lg ring-2 ring-primary" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted active:cursor-grabbing"
        aria-label={`جابه‌جایی دستهٔ ${cat.name}`}
        title="بکشید و رها کنید"
      >
        <GripVertical className="h-5 w-5" aria-hidden="true" />
      </button>
      {cat.imageUrl ? (
        // Task 4 — تصویر اختصاصی دسته (اولویت روی آیکون)
        <img src={cat.imageUrl} alt={cat.name} className="h-10 w-10 shrink-0 rounded-xl object-cover" loading="lazy" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {React.createElement(catIcon, { className: "h-5 w-5", "aria-hidden": true })}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
          {cat.name}
          {cat.parentName ? (
            <Badge variant="outline" className="rounded-full text-[10px]">زیرمجموعهٔ {cat.parentName}</Badge>
          ) : null}
          {cat.slug ? (
            <Badge variant="outline" className="rounded-full bg-muted text-[10px]" dir="ltr">{cat.slug}</Badge>
          ) : null}
        </p>
        {cat.description ? <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{cat.description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground sm:inline-flex">
          <Package className="h-3.5 w-3.5" aria-hidden="true" />
          {toPersianDigits(cat.productCount)} کالا
        </span>
        <span className="hidden text-[11px] tabular-nums text-muted-foreground md:inline">
          ترتیب {toPersianDigits(cat.sortOrder)}
        </span>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onEdit} aria-label={`ویرایش ${cat.name}`}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
          onClick={onDelete}
          aria-label={`حذف ${cat.name}`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

/* ═══════════════ انتخاب‌گر آیکون ═══════════════ */

function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1.5 rounded-xl border bg-muted/30 p-2 sm:grid-cols-12">
      {CATEGORY_ICON_NAMES.map((name) => {
        const icon = CATEGORY_ICONS[name];
        const active = value === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(active ? "" : name)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-transparent bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
            aria-label={`آیکون ${name}`}
            aria-pressed={active}
            title={name}
          >
            {React.createElement(icon, { className: "h-4 w-4", "aria-hidden": true })}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════ تب اصلی ═══════════════ */

export function StorefrontCategoriesTab() {
  const { toast } = useToast();

  const [loading, setLoading] = React.useState(true);
  const [categories, setCategories] = React.useState<CategoryRow[]>([]);
  const [orderDirty, setOrderDirty] = React.useState(false);
  const [savingOrder, setSavingOrder] = React.useState(false);

  // ساخت
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState({ name: "", parentId: "", icon: "", slug: "", slugTouched: false, description: "" });
  const [creating, setCreating] = React.useState(false);

  // ویرایش
  const [editing, setEditing] = React.useState<CategoryRow | null>(null);
  const [editForm, setEditForm] = React.useState({ name: "", parentId: "", icon: "", slug: "", description: "" });
  const [savingEdit, setSavingEdit] = React.useState(false);

  // حذف
  const [deleting, setDeleting] = React.useState<CategoryRow | null>(null);
  const [moveTarget, setMoveTarget] = React.useState<string>("parent");
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  // Task 4 — جستجو + تصویر دسته
  const [search, setSearch] = React.useState("");
  const [savingImage, setSavingImage] = React.useState<string | null>(null);
  const [editImage, setEditImage] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/storefront/manage/categories", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && Array.isArray(json.categories)) {
        setCategories(json.categories as CategoryRow[]);
        setOrderDirty(false);
      } else {
        toast({ title: "خطا در دریافت دسته‌ها", description: json?.error, variant: "destructive" });
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

  /* ── ترتیب‌چینی ── */
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setCategories((cs) => {
      const oldIndex = cs.findIndex((c) => c.id === active.id);
      const newIndex = cs.findIndex((c) => c.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return cs;
      return arrayMove(cs, oldIndex, newIndex);
    });
    setOrderDirty(true);
  }

  async function saveOrder() {
    setSavingOrder(true);
    try {
      const res = await authFetch("/api/storefront/manage/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: categories.map((c) => c.id) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ذخیرهٔ ترتیب ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      toast({ title: "ترتیب دسته‌ها ذخیره شد" });
      await load();
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setSavingOrder(false);
    }
  }

  /* ── ساخت ── */
  async function createCategory() {
    const name = createForm.name.trim();
    if (name.length < 2) {
      toast({ title: "نام دسته معتبر نیست", description: "نام دسته باید ۲ تا ۸۰ نویسه باشد", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const res = await authFetch("/api/storefront/manage/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          parentId: createForm.parentId || null,
          icon: createForm.icon || null,
          slug: createForm.slug.trim() || null,
          description: createForm.description.trim() || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ساخت دسته ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      toast({ title: `دستهٔ «${name}» ساخته شد` });
      setCreateOpen(false);
      setCreateForm({ name: "", parentId: "", icon: "", slug: "", slugTouched: false, description: "" });
      await load();
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  /* ── ویرایش ── */
  function openEdit(cat: CategoryRow) {
    setEditing(cat);
    setEditImage(cat.imageUrl ?? null);
    setEditForm({
      name: cat.name,
      parentId: cat.parentId ?? "",
      icon: cat.icon ?? "",
      slug: cat.slug ?? "",
      description: cat.description ?? "",
    });
  }

  /* ── Task 4 — آپلود/حذف تصویر دسته (فوری) ── */
  async function saveCategoryImage(categoryId: string, file: File) {
    setSavingImage(categoryId);
    try {
      const fd = new FormData();
      fd.set("categoryId", categoryId);
      fd.set("file", file);
      const res = await authFetch("/api/storefront/manage/category-image", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && json.imageUrl) {
        setEditImage(json.imageUrl as string);
        setCategories((cs) => cs.map((c) => (c.id === categoryId ? { ...c, imageUrl: json.imageUrl as string } : c)));
        toast({ title: "تصویر دسته ذخیره شد", description: "همان حالا در فروشگاه دیده می‌شود" });
      } else {
        toast({ title: "آپلود ناموفق", description: json?.error || "دوباره تلاش کنید", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setSavingImage(null);
    }
  }

  async function removeCategoryImage(categoryId: string) {
    setSavingImage(categoryId);
    try {
      const res = await authFetch(`/api/storefront/manage/category-image?categoryId=${encodeURIComponent(categoryId)}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setEditImage(null);
        setCategories((cs) => cs.map((c) => (c.id === categoryId ? { ...c, imageUrl: null } : c)));
        toast({ title: "تصویر دسته حذف شد" });
      } else {
        toast({ title: "حذف ناموفق", description: json?.error || "دوباره تلاش کنید", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setSavingImage(null);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const name = editForm.name.trim();
    if (name.length < 2) {
      toast({ title: "نام دسته معتبر نیست", description: "نام دسته باید ۲ تا ۸۰ نویسه باشد", variant: "destructive" });
      return;
    }
    setSavingEdit(true);
    try {
      const res = await authFetch(`/api/storefront/manage/categories/${encodeURIComponent(editing.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          parentId: editForm.parentId || null,
          icon: editForm.icon || null,
          slug: editForm.slug.trim() || null,
          description: editForm.description.trim() || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ذخیرهٔ دسته ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      toast({ title: "دسته ذخیره شد", description: json.message });
      setEditing(null);
      await load();
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  }

  /* ── حذف ── */
  function openDelete(cat: CategoryRow) {
    setDeleting(cat);
    setMoveTarget(cat.parentId ? cat.parentId : "none");
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      let moveTo: string;
      if (moveTarget === "none") moveTo = "none";
      else moveTo = moveTarget; // categoryId (شامل والد)
      const res = await authFetch(
        `/api/storefront/manage/categories/${encodeURIComponent(deleting.id)}?moveTo=${encodeURIComponent(moveTo)}`,
        { method: "DELETE" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "حذف ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      toast({ title: "دسته حذف شد", description: json.message });
      setDeleting(null);
      await load();
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setDeleteBusy(false);
    }
  }

  /* ═══ رندر ═══ */

  // Task 4 — فیلتر جستجو (نام + اسلاگ + توضیح)
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.slug ?? "").toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q) ||
        (c.parentName ?? "").toLowerCase().includes(q)
    );
  }, [categories, search]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* نوار ابزار */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" aria-hidden="true" />
          <p className="text-sm font-bold">{toPersianDigits(categories.length)} دسته‌بندی</p>
        </div>
        <span className="hidden text-xs text-muted-foreground sm:inline">با کشیدن و رها کردن دسته‌ها ترتیب نمایششان را در فروشگاه عوض کنید</span>
        <div className="relative order-last w-full sm:order-none sm:w-56">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجوی دسته…"
            className="pr-9 text-sm"
            aria-label="جستجوی دسته‌بندی"
          />
        </div>
        <div className="mr-auto flex items-center gap-2">
          {orderDirty ? (
            <Button size="sm" className="gap-1.5 rounded-full" onClick={() => void saveOrder()} disabled={savingOrder}>
              {savingOrder ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              ذخیرهٔ ترتیب
            </Button>
          ) : null}
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            بازخوانی
          </Button>
          <Button size="sm" className="gap-1.5 rounded-full" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            دسته جدید
          </Button>
        </div>
      </div>

      {/* فهرست */}
      {categories.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Layers className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm font-bold">هنوز دسته‌ای نساخته‌اید</p>
            <p className="max-w-md text-xs leading-6 text-muted-foreground">
              با دسته‌بندی، مشتری‌ها سریع‌تر کالای موردنظر را پیدا می‌کنند — دسته‌های پیشنهادی صنف شما از دکمهٔ «دسته‌بندی خودکار» در تب کالاها هم ساخته می‌شوند.
            </p>
            <Button size="sm" className="mt-2 gap-1.5 rounded-full" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              ساخت اولین دسته
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          دسته‌ای با «{search}» پیدا نشد — عبارت دیگری جستجو کنید.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={filtered.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2" role="list">
              {filtered.map((cat) => (
                <SortableCategoryRow
                  key={cat.id}
                  cat={cat}
                  onEdit={() => openEdit(cat)}
                  onDelete={() => openDelete(cat)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {/* ═══ دیالوگ ساخت ═══ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TagIcon className="h-4 w-4 text-primary" aria-hidden="true" />
              دستهٔ جدید
            </DialogTitle>
            <DialogDescription>دسته‌ها در نوار فیلتر فروشگاه و کارت کالاها نمایش داده می‌شوند.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">نام دسته</Label>
              <Input
                id="cat-name"
                value={createForm.name}
                maxLength={80}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    name: e.target.value,
                    slug: f.slugTouched ? f.slug : suggestCategorySlug(e.target.value),
                  }))
                }
                placeholder="مثلاً: لوازم جانبی موبایل"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>دستهٔ والد (اختیاری)</Label>
                <Select value={createForm.parentId || "none"} onValueChange={(v) => setCreateForm((f) => ({ ...f, parentId: v === "none" ? "" : v }))}>
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
              <div className="space-y-1.5">
                <Label htmlFor="cat-slug">اسلاگ لاتین (اختیاری — سئو)</Label>
                <Input
                  id="cat-slug"
                  dir="ltr"
                  className="font-mono text-xs"
                  value={createForm.slug}
                  maxLength={60}
                  onChange={(e) => setCreateForm((f) => ({ ...f, slug: e.target.value.toLowerCase(), slugTouched: true }))}
                  placeholder="mobile-accessories"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>آیکون دسته</Label>
              <IconPicker value={createForm.icon} onChange={(icon) => setCreateForm((f) => ({ ...f, icon }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">توضیح کوتاه (سئو)</Label>
              <Textarea
                id="cat-desc"
                rows={2}
                maxLength={500}
                value={createForm.description}
                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="یک جمله دربارهٔ کالاهای این دسته"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setCreateOpen(false)} disabled={creating}>
              انصراف
            </Button>
            <Button className="gap-1.5 rounded-full" onClick={() => void createCategory()} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
              ساختن دسته
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ دیالوگ ویرایش ═══ */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" aria-hidden="true" />
              ویرایش دسته
            </DialogTitle>
            <DialogDescription>{editing?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Task 4 — تصویر اختصاصی دسته */}
            <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
              <Label className="flex items-center gap-1.5 text-xs">
                <ImageIconLucide className="h-3.5 w-3.5" aria-hidden="true" />
                تصویر دسته (اختیاری — به‌جای آیکون نمایش داده می‌شود)
              </Label>
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-background">
                  {editImage ? (
                    // آپلود کاربر — دامنه نامشخص
                    <img src={editImage} alt={editing?.name ?? "دسته"} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-muted-foreground/50">
                      {editing ? React.createElement(categoryIconByName(editing.icon), { className: "h-6 w-6", "aria-hidden": true }) : null}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors hover:bg-muted ${
                      savingImage ? "opacity-60" : ""
                    }`}
                  >
                    {savingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Upload className="h-3.5 w-3.5" aria-hidden="true" />}
                    {editImage ? "تعویض تصویر" : "گذاشتن تصویر"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f && editing) void saveCategoryImage(editing.id, f);
                      }}
                    />
                  </label>
                  {editImage && editing ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 rounded-full px-2 text-[11px] text-red-500 hover:text-red-600"
                      onClick={() => void removeCategoryImage(editing.id)}
                      disabled={savingImage === editing.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      حذف تصویر
                    </Button>
                  ) : null}
                  <p className="text-[10px] leading-4 text-muted-foreground">PNG/JPG/WebP تا ۴ مگابایت — بلافاصله ذخیره می‌شود</p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ecat-name">نام دسته</Label>
              <Input
                id="ecat-name"
                value={editForm.name}
                maxLength={80}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>دستهٔ والد</Label>
                <Select value={editForm.parentId || "none"} onValueChange={(v) => setEditForm((f) => ({ ...f, parentId: v === "none" ? "" : v }))}>
                  <SelectTrigger dir="rtl">
                    <SelectValue placeholder="بدون والد" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="none">بدون والد (دستهٔ اصلی)</SelectItem>
                    {categories
                      .filter((c) => c.id !== editing?.id)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ecat-slug">اسلاگ لاتین</Label>
                <Input
                  id="ecat-slug"
                  dir="ltr"
                  className="font-mono text-xs"
                  value={editForm.slug}
                  maxLength={60}
                  onChange={(e) => setEditForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))}
                  placeholder="mobile-accessories"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>آیکون دسته</Label>
              <IconPicker value={editForm.icon} onChange={(icon) => setEditForm((f) => ({ ...f, icon }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ecat-desc">توضیح کوتاه (سئو)</Label>
              <Textarea
                id="ecat-desc"
                rows={2}
                maxLength={500}
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setEditing(null)} disabled={savingEdit}>
              انصراف
            </Button>
            <Button className="gap-1.5 rounded-full" onClick={() => void saveEdit()} disabled={savingEdit}>
              {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ دیالوگ حذف ═══ */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              حذف دستهٔ «{deleting?.name}»
            </DialogTitle>
            <DialogDescription>
              {deleting && deleting.productCount > 0
                ? `این دسته ${toPersianDigits(deleting.productCount)} کالا دارد — ابتدا مقصد انتقال کالاها را انتخاب کنید.`
                : "این دسته خالی است و با تأیید شما حذف می‌شود."}
            </DialogDescription>
          </DialogHeader>
          {deleting && deleting.productCount > 0 ? (
            <div className="space-y-1.5">
              <Label>انتقال کالاها به:</Label>
              <Select value={moveTarget} onValueChange={setMoveTarget}>
                <SelectTrigger dir="rtl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {deleting.parentId ? (
                    <SelectItem value={deleting.parentId}>دستهٔ والد ({deleting.parentName})</SelectItem>
                  ) : null}
                  {categories
                    .filter((c) => c.id !== deleting.id && c.id !== deleting.parentId)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  <SelectItem value="none">بدون دسته</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] leading-5 text-muted-foreground">
                کالاها از انبار حذف نمی‌شوند — فقط دسته‌شان عوض می‌شود.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              انصراف
            </Button>
            <Button
              className="gap-1.5 rounded-full bg-red-600 hover:bg-red-700"
              onClick={() => void confirmDelete()}
              disabled={deleteBusy}
            >
              {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
              حذف دسته
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
