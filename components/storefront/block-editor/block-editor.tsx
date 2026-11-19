"use client";

// ═══════════════════════════════════════════════════════════════════
// R24-4 — ویرایشگر بلوکی حرفه‌ای فروشگاه (قلب مأموریت)
// سه‌ستونه مثل وردپرس گوتنبرگ/المنتور:
//   چپ: کتابخانهٔ بلوک | وسط: بوم پیش‌نمایش زنده با سوئیچ دستگاه |
//   راست: پنل تنظیمات بلوک
// + Undo/Redo + ذخیرهٔ خودکار پیش‌نویس + انتشار + تاریخچهٔ نسخه‌ها
// + کشیدن‌ورهاکردن ترتیب (dnd-kit) + تکثیر/حذف/مخفی‌سازی بلوک
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  Undo2, Redo2, Monitor, Tablet, Smartphone, Save, Rocket, History, Loader2,
  Trash2, Copy, Eye, EyeOff, ChevronUp, ChevronDown, GripVertical, Plus,
  Sparkles, Check, ExternalLink, RefreshCw, PanelRightClose, PanelRightOpen,
  Pencil, ShoppingBag, Search, Undo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits } from "@/lib/persian";
import { type StorefrontProductDTO } from "@/lib/storefront";
import {
  type SfBlock, type SfBlockType, type SfBlocksDoc, createBlock,
  buildDefaultBlocks,
} from "@/lib/storefront-blocks";
import { SfBlockView, SfBlocksCtx, type SfBlocksContextValue } from "./block-views";
import { BlockLibrary, BlockSettingsPanel } from "./block-editor-parts";
import { format as formatJalaliDate } from "date-fns-jalali";

import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, verticalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/* ─────────────── انواع محلی ─────────────── */

interface EditorShop {
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
  accentColor: string | null;
  isActive: boolean;
}

interface RevisionRow {
  id: string;
  label: string | null;
  blockCount: number;
  createdAt: string;
}

type DeviceMode = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTH: Record<DeviceMode, string> = {
  desktop: "w-full",
  tablet: "w-[768px] max-w-full",
  mobile: "w-[390px] max-w-full",
};

/* ─────────────── قاب ویرایش هر بلوک روی بوم ─────────────── */

function SortableBlockFrame({
  block, index, total, selected, onSelect, onPatch, onDuplicate, onDelete, onMove,
}: {
  block: SfBlock;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onPatch: (b: SfBlock) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group/blk relative ${isDragging ? "z-50 opacity-80" : ""} ${block.visible ? "" : "opacity-50"}`}
      data-block-index={index}
      data-block-id={block.id}
    >
      {/* نوار ابزار بلوک */}
      <div
        className={`absolute -top-3 right-2 z-30 flex items-center gap-0.5 rounded-full border bg-background/95 p-0.5 shadow-lg backdrop-blur transition-opacity ${
          selected ? "opacity-100" : "opacity-0 group-hover/blk:opacity-100"
        }`}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted active:cursor-grabbing"
          aria-label="جابه‌جایی بلوک"
          title="بکشید و جابه‌جا کنید"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          // R25-A2/B7 — قبلاً onClick={onMove(-1)} بود که «موقع رندر» صدا زده می‌شد
          // (setState در رندر کامپوننت دیگر) و ترتیب بلوک‌ها خودبه‌خود به‌هم می‌ریخت.
          onClick={() => onMove(-1)}
          disabled={index === 0}
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
          aria-label="انتقال به بالا"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
          aria-label="انتقال به پایین"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onPatch({ ...block, visible: !block.visible })}
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted"
          aria-label={block.visible ? "مخفی‌کردن بلوک" : "نمایش بلوک"}
          title={block.visible ? "مخفی در سایت" : "نمایش در سایت"}
        >
          {block.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted"
          aria-label="تکثیر بلوک"
          title="تکثیر"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-full p-1.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/50"
          aria-label="حذف بلوک"
          title="حذف"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* برچسب نوع بلوک */}
      <span
        className={`absolute -top-3 left-2 z-30 flex items-center gap-1 rounded-full border bg-background/95 px-2 py-1 text-[10px] font-bold text-muted-foreground shadow-lg backdrop-blur transition-opacity ${
          selected ? "opacity-100" : "opacity-0 group-hover/blk:opacity-100"
        }`}
      >
        {index + 1}. {block.title}
      </span>

      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSelect();
        }}
        className={`cursor-pointer rounded-2xl outline-dashed outline-offset-4 transition-colors ${
          selected
            ? "outline-2 outline-emerald-500"
            : "outline-1 outline-transparent hover:outline-emerald-300"
        }`}
      >
        <SfBlockView block={block} />
      </div>
    </div>
  );
}

/* ─────────────── کامپوننت اصلی ─────────────── */

export function StorefrontBlockEditor({ onShopMayChange }: { onShopMayChange?: () => void }) {
  const { toast } = useToast();

  const [loading, setLoading] = React.useState(true);
  const [shop, setShop] = React.useState<EditorShop | null>(null);
  const [products, setProducts] = React.useState<StorefrontProductDTO[]>([]);
  const [blocks, setBlocks] = React.useState<SfBlock[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [device, setDevice] = React.useState<DeviceMode>("desktop");
  const [settingsOpen, setSettingsOpen] = React.useState(true);
  const [libraryOpen, setLibraryOpen] = React.useState(true);

  // ذخیرهٔ خودکار
  const [saveState, setSaveState] = React.useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [publishing, setPublishing] = React.useState(false);
  const [revisionsOpen, setRevisionsOpen] = React.useState(false);
  const [revisions, setRevisions] = React.useState<RevisionRow[]>([]);
  const [revisionsLoading, setRevisionsLoading] = React.useState(false);

  // تاریخچهٔ undo/redo
  const historyRef = React.useRef<SfBlock[][]>([]);
  const futureRef = React.useRef<SfBlock[][]>([]);
  const lastPushedRef = React.useRef<string>("");
  const [histVersion, setHistVersion] = React.useState(0);

  const selectedBlock = React.useMemo(() => blocks.find((b) => b.id === selectedId) ?? null, [blocks, selectedId]);

  /* ── بارگذاری اولیه ── */
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [manageRes, productsRes, blocksRes] = await Promise.all([
        authFetch("/api/storefront/manage", { cache: "no-store" }),
        authFetch("/api/storefront/manage/products", { cache: "no-store" }),
        authFetch("/api/storefront/manage/blocks", { cache: "no-store" }),
      ]);
      const manage = await manageRes.json().catch(() => null);
      if (!manage?.success || !manage.shop) {
        setShop(null);
        return;
      }
      const s = manage.shop;
      setShop({
        slug: s.slug,
        title: s.title,
        phone: s.phone,
        address: s.address,
        city: s.city,
        lat: s.lat,
        lng: s.lng,
        socialInstagram: s.socialInstagram,
        socialTelegram: s.socialTelegram,
        socialWhatsapp: s.socialWhatsapp,
        accentColor: s.accentColor,
        isActive: s.isActive,
      });

      const prodJson = await productsRes.json().catch(() => null);
      const prods: StorefrontProductDTO[] = prodJson?.success && Array.isArray(prodJson.products)
        ? prodJson.products.map((p: Record<string, unknown>) => ({
            id: String(p.id),
            name: String(p.name ?? ""),
            description: (p.description as string) ?? null,
            imageUrl: (p.imageUrl as string) ?? null,
            priceRial: String(p.salePrice ?? p.priceRial ?? "0"),
            inStock: p.inStock !== false,
            stockKnown: !!p.stockKnown,
            category: (p.category as string) ?? null,
            discountPercent: (p.discountPercent as number) ?? null,
            displayPriceRial: p.displayPriceRial ? String(p.displayPriceRial) : undefined,
          }))
        : [];
      setProducts(prods);

      const blocksJson = await blocksRes.json().catch(() => null);
      if (blocksJson?.success) {
        let doc: SfBlocksDoc | null = blocksJson.draft ?? blocksJson.published ?? null;
        if (!doc) {
          // چیدمان اولیه پیشنهادی — کاربر می‌تواند رد کند ولی ساختش بی‌دردسرتر است
          doc = buildDefaultBlocks(s.title, s.city);
        }
        setBlocks(doc.blocks);
        historyRef.current = [doc.blocks];
        futureRef.current = [];
        lastPushedRef.current = JSON.stringify(doc.blocks);
        setHistVersion((v) => v + 1);
      }
      setSaveState("saved");
    } catch {
      toast({ title: "خطای شبکه", description: "بارگذاری ویرایشگر ناموفق بود", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /* ── push تاریخچه ── */
  const pushHistory = React.useCallback((next: SfBlock[]) => {
    const snapshot = JSON.stringify(next);
    if (snapshot === lastPushedRef.current) return;
    historyRef.current.push(JSON.parse(snapshot) as SfBlock[]);
    if (historyRef.current.length > 60) historyRef.current.shift();
    futureRef.current = [];
    lastPushedRef.current = snapshot;
    setHistVersion((v) => v + 1);
  }, []);

  /* ── به‌روزرسانی بلوک‌ها (با تاریخچه) ── */
  const updateBlocks = React.useCallback(
    (next: SfBlock[] | ((prev: SfBlock[]) => SfBlock[]), opts?: { history?: boolean }) => {
      setBlocks((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        if (opts?.history !== false) pushHistory(resolved);
        return resolved;
      });
      setSaveState("dirty");
    },
    [pushHistory]
  );

  function undo() {
    if (historyRef.current.length <= 1) return;
    const current = historyRef.current.pop() as SfBlock[];
    futureRef.current.push(current);
    const prev = historyRef.current[historyRef.current.length - 1];
    lastPushedRef.current = JSON.stringify(prev);
    setBlocks(prev);
    setSaveState("dirty");
    setHistVersion((v) => v + 1);
  }

  function redo() {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(next);
    lastPushedRef.current = JSON.stringify(next);
    setBlocks(next);
    setSaveState("dirty");
    setHistVersion((v) => v + 1);
  }

  // میانبر Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
     
  }, []);

  /* ── ذخیرهٔ خودکار (debounce 1.2s) ── */
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (saveState !== "dirty") return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await authFetch("/api/storefront/manage/blocks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft: { version: 1, blocks } }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          setSaveState("error");
          return;
        }
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 1200);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [blocks, saveState]);

  /* ── لغو انتشار (بازگشت به قالب کلاسیک) ── */
  const [unpublishing, setUnpublishing] = React.useState(false);
  async function unpublish() {
    setUnpublishing(true);
    try {
      const res = await authFetch("/api/storefront/manage/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unpublish" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "لغو انتشار ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      toast({ title: "انتشار لغو شد", description: json.message });
      onShopMayChange?.();
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setUnpublishing(false);
    }
  }

  /* ── انتشار ── */
  async function publish() {
    if (blocks.length === 0) {
      toast({ title: "بلوکی برای انتشار نیست", variant: "destructive" });
      return;
    }
    // اول پیش‌نویس را قطعی ذخیره می‌کنیم بعد منتشر می‌کنیم
    setPublishing(true);
    try {
      const put = await authFetch("/api/storefront/manage/blocks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: { version: 1, blocks } }),
      });
      const putJson = await put.json().catch(() => null);
      if (!put.ok || !putJson?.success) {
        toast({ title: "ذخیرهٔ پیش‌نویس ناموفق", description: putJson?.error, variant: "destructive" });
        return;
      }
      const res = await authFetch("/api/storefront/manage/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "انتشار ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      setSaveState("saved");
      toast({ title: "منتشر شد", description: json.message });
      onShopMayChange?.();
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  }

  /* ── تاریخچهٔ نسخه‌ها ── */
  async function openRevisions() {
    setRevisionsOpen(true);
    setRevisionsLoading(true);
    try {
      const res = await authFetch("/api/storefront/manage/blocks/revisions", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (json?.success && Array.isArray(json.revisions)) {
        setRevisions(json.revisions);
      }
    } catch {
      /* ignore */
    } finally {
      setRevisionsLoading(false);
    }
  }

  // R25-A2/B5 — حذف نسخهٔ پشتیبان (DELETE revisions API از قبل موجود بود ولی UI نداشت)
  const [deletingRevisionId, setDeletingRevisionId] = React.useState<string | null>(null);
  async function deleteRevision(id: string) {
    setDeletingRevisionId(id);
    try {
      const res = await authFetch(`/api/storefront/manage/blocks/revisions?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "حذف نسخه ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      setRevisions((prev) => prev.filter((r) => r.id !== id));
      toast({ title: "نسخه حذف شد", description: json.message });
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setDeletingRevisionId(null);
    }
  }

  // R25-A2/B3 — بازنشانی صفحه به چیدمان پیشنهادی (قبلاً فقط در حالت خالی در دسترس بود)
  const [resetOpen, setResetOpen] = React.useState(false);
  function resetToTemplate() {
    if (!shop) return;
    const doc = buildDefaultBlocks(shop.title, shop.city);
    updateBlocks(doc.blocks);
    setSelectedId(null);
    setResetOpen(false);
    toast({ title: "چیدمان پیشنهادی ساخته شد", description: "می‌توانید آن را ویرایش کنید یا با «انتشار» روی سایت بگذارید" });
  }

  async function restoreRevision(id: string) {
    try {
      const res = await authFetch("/api/storefront/manage/blocks/revisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "بازگردانی ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      toast({ title: "بازگردانی شد", description: json.message });
      setRevisionsOpen(false);
      void load();
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    }
  }

  /* ── اعمال بلوک ── */
  // R25-A2/B4 — درج هوشمند: اگر بلوکی انتخاب است، بلوک جدید بلافاصله بعد از آن
  // درج می‌شود (نه لزوماً انتهای صفحه) + اسکرول نرم به بلوک تازه‌ساخته.
  function addBlock(type: SfBlockType, atIndex?: number) {
    const blk = createBlock(type);
    updateBlocks((prev) => {
      const next = [...prev];
      let insertAt = atIndex ?? next.length;
      if (atIndex === undefined && selectedId) {
        const selIdx = next.findIndex((b) => b.id === selectedId);
        if (selIdx >= 0) insertAt = selIdx + 1;
      }
      next.splice(insertAt, 0, blk);
      return next;
    });
    setSelectedId(blk.id);
    setSettingsOpen(true);
    requestAnimationFrame(() => {
      try {
        document
          .querySelector(`[data-block-id="${blk.id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        /* ignore */
      }
    });
  }

  function patchBlock(next: SfBlock) {
    updateBlocks((prev) => prev.map((b) => (b.id === next.id ? next : b)));
  }

  function duplicateBlock(id: string) {
    updateBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const copy = { ...prev[idx], id: `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, title: `${prev[idx].title} (کپی)` };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }

  function deleteBlock(id: string) {
    updateBlocks((prev) => prev.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function moveBlock(id: string, dir: -1 | 1) {
    updateBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= prev.length) return prev;
      return arrayMove(prev, idx, to);
    });
  }

  /* ── dnd ── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    updateBlocks((prev) => {
      const from = prev.findIndex((b) => b.id === active.id);
      const to = prev.findIndex((b) => b.id === over.id);
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  }

  /* ── بستر داده‌ای بلوک‌ها (پیش‌نمایش) ── */
  const categories = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const c = p.category?.trim();
      if (c) map.set(c, (map.get(c) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, count]) => ({ name, count }));
  }, [products]);

  const ctxValue = React.useMemo<SfBlocksContextValue>(
    () => ({
      shop: {
        slug: shop?.slug ?? "",
        title: shop?.title ?? "",
        phone: shop?.phone ?? null,
        address: shop?.address ?? null,
        city: shop?.city ?? null,
        lat: shop?.lat ?? null,
        lng: shop?.lng ?? null,
        socialInstagram: shop?.socialInstagram ?? null,
        socialTelegram: shop?.socialTelegram ?? null,
        socialWhatsapp: shop?.socialWhatsapp ?? null,
        accentColor: shop?.accentColor ?? null,
      },
      products,
      categories,
      onAddToCart: () => undefined,
      onOpenProduct: () => undefined,
      unitPrice: (p) => (p.displayPriceRial ? p.displayPriceRial : p.priceRial),
    }),
    [shop, products, categories]
  );

  /* ─────────────── رندر ─────────────── */

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-12 w-full" />
        <div className="flex gap-3">
          <Skeleton className="h-[520px] w-56 shrink-0" />
          <Skeleton className="h-[520px] flex-1" />
        </div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        برای استفاده از ویرایشگر بلوکی، ابتدا از تب «ساخت هوشمند» سایت فروشگاه خود را بسازید.
      </div>
    );
  }

  const canUndo = historyRef.current.length > 1;
  const canRedo = futureRef.current.length > 0;
  void histVersion; // فقط برای رندر مجدد هنگام تغییر تاریخچه

  return (
    <div className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border bg-background shadow-sm" dir="rtl">
      {/* ═══ نوار ابزار بالا ═══ */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <Badge variant="outline" className="gap-1.5 rounded-full bg-background">
          <Sparkles className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
          ویرایشگر بلوکی
        </Badge>

        <div className="flex items-center gap-0.5 rounded-full border bg-background p-0.5">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="rounded-full p-1.5 transition-colors hover:bg-muted disabled:opacity-30"
            aria-label="واگرد (Ctrl+Z)"
            title="واگرد (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="rounded-full p-1.5 transition-colors hover:bg-muted disabled:opacity-30"
            aria-label="ازنو (Ctrl+Shift+Z)"
            title="ازنو (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>

        {/* سوئیچ دستگاه */}
        <div className="flex items-center gap-0.5 rounded-full border bg-background p-0.5" role="group" aria-label="اندازهٔ نمایش">
          {(
            [
              ["desktop", Monitor, "دسکتاپ"],
              ["tablet", Tablet, "تبلت"],
              ["mobile", Smartphone, "موبایل"],
            ] as const
          ).map(([mode, Icon, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setDevice(mode)}
              className={`rounded-full px-2.5 py-1.5 text-xs font-bold transition-colors ${
                device === mode ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-muted"
              }`}
              aria-pressed={device === mode}
              title={label}
            >
              <Icon className="h-4 w-4" />
              <span className="sr-only">{label}</span>
            </button>
          ))}
        </div>

        {/* نشانگر ذخیره */}
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground" aria-live="polite">
          {saveState === "saved" ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              پیش‌نویس ذخیره شد
            </>
          ) : saveState === "saving" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              در حال ذخیره…
            </>
          ) : saveState === "error" ? (
            <span className="text-red-500">خطا در ذخیرهٔ خودکار!</span>
          ) : (
            <>
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
              تغییرات ذخیره‌نشده…
            </>
          )}
        </span>

        <div className="mr-auto flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs" onClick={() => void openRevisions()}>
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            نسخه‌ها
          </Button>
          <a
            href={`/shop/${shop.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            سایت زنده
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="h-8 gap-1.5 rounded-full bg-emerald-600 text-xs hover:bg-emerald-700"
                disabled={publishing || unpublishing || blocks.length === 0}
              >
                {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Rocket className="h-3.5 w-3.5" aria-hidden="true" />}
                انتشار
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem onClick={() => void publish()} className="gap-2 font-bold">
                <Rocket className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                انتشار روی سایت عمومی
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setResetOpen(true)}
                className="gap-2 font-bold"
                disabled={publishing || unpublishing}
              >
                <RefreshCw className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                بازنشانی به چیدمان پیشنهادی
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void unpublish()} className="gap-2 font-bold" disabled={unpublishing}>
                <Undo className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                لغو انتشار — بازگشت به قالب کلاسیک
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ═══ بدنهٔ سه‌ستونه ═══ */}
      <div className="flex min-h-0 flex-1">
        {/* کتابخانهٔ بلوک (چپ در RTL = راست بصری؟ نه — در RTL اولین فرزند سمت راست است؛ کتابخانه را سمت راست می‌خواهیم) */}
        {libraryOpen ? (
          <aside className="hidden w-56 shrink-0 border-l bg-background lg:block" aria-label="کتابخانهٔ بلوک‌ها">
            <BlockLibrary onAdd={(type) => addBlock(type)} categories={categories} productsCount={products.length} />
          </aside>
        ) : null}

        {/* بوم پیش‌نمایش */}
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto bg-zinc-100 p-3 dark:bg-zinc-950/60">
            <div
              className={`mx-auto ${DEVICE_WIDTH[device]} overflow-hidden rounded-2xl border-4 border-zinc-300 bg-background shadow-2xl transition-all dark:border-zinc-700`}
            >
              {/* هدر قالبی پیش‌نمایش */}
              <div className="sticky top-0 z-20 flex items-center gap-3 border-b bg-white/95 px-4 py-2.5 backdrop-blur dark:bg-zinc-900/95">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-sm font-black text-white">
                  {shop.title.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{shop.title}</p>
                  <p className="text-[10px] text-muted-foreground">{shop.city ?? "فروشگاه آنلاین"}</p>
                </div>
                <div className="relative mr-auto hidden w-40 items-center sm:flex">
                  <Search className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <input
                    type="search"
                    placeholder="جستجو…"
                    aria-label="پیش‌نمایش نوار جستجو"
                    className="w-full rounded-full border border-border bg-background py-1.5 pr-8 pl-3 text-xs outline-none"
                    tabIndex={-1}
                  />
                </div>
                <span className="relative rounded-full border p-2 text-muted-foreground">
                  <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                  <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-black text-white">۰</span>
                </span>
              </div>

              {/* بلوک‌ها */}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  <div className="min-h-[420px] pb-16">
                    {blocks.length === 0 ? (
                      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-8 text-center">
                        <Pencil className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
                        <p className="text-sm font-bold text-muted-foreground">صفحه خالی است</p>
                        <p className="max-w-xs text-xs leading-6 text-muted-foreground/80">
                          از کتابخانهٔ سمت راست بلوک اضافه کنید — یا دکمهٔ زیر را بزنید تا چیدمان پیشنهادی ساخته شود
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 rounded-full"
                          onClick={() => {
                            const doc = buildDefaultBlocks(shop.title, shop.city);
                            updateBlocks(doc.blocks);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          ساخت چیدمان پیشنهادی
                        </Button>
                      </div>
                    ) : (
                      blocks.map((b, i) => (
                        <SortableBlockFrame
                          key={b.id}
                          block={b}
                          index={i}
                          total={blocks.length}
                          selected={selectedId === b.id}
                          onSelect={() => {
                            setSelectedId(b.id);
                            setSettingsOpen(true);
                          }}
                          onPatch={patchBlock}
                          onDuplicate={() => duplicateBlock(b.id)}
                          onDelete={() => deleteBlock(b.id)}
                          onMove={(dir) => moveBlock(b.id, dir)}
                        />
                      ))
                    )}
                  </div>
                </SortableContext>
              </DndContext>

              {/* فوتر قالبی پیش‌نمایش */}
              <div className="border-t bg-zinc-50 px-4 py-4 text-center dark:bg-zinc-900">
                <p className="text-xs font-bold">{shop.title}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  ساخته‌شده با فروشگاه آنلاین «افق پلاس»
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* پنل تنظیمات (سمت چپ بصری در RTL) */}
        {settingsOpen ? (
          <aside className="hidden w-72 shrink-0 border-r bg-background md:block" aria-label="تنظیمات بلوک">
            <BlockSettingsPanel
              block={selectedBlock}
              onChange={patchBlock}
              onClose={() => setSettingsOpen(false)}
            />
          </aside>
        ) : null}
      </div>

      {/* ═══ نوار وضعیت پایین ═══ */}
      <div className="flex items-center gap-2 border-t bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        <button
          type="button"
          onClick={() => setLibraryOpen((v) => !v)}
          className="flex items-center gap-1 rounded-full px-2 py-1 font-bold transition-colors hover:bg-muted"
        >
          {libraryOpen ? <PanelRightClose className="h-3.5 w-3.5" aria-hidden="true" /> : <PanelRightOpen className="h-3.5 w-3.5" aria-hidden="true" />}
          کتابخانه
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex items-center gap-1 rounded-full px-2 py-1 font-bold transition-colors hover:bg-muted"
        >
          <PanelRightOpen className="h-3.5 w-3.5" aria-hidden="true" />
          تنظیمات
        </button>
        <span className="mr-auto">
          {toPersianDigits(blocks.length)} بلوک — {toPersianDigits(blocks.filter((b) => b.visible).length)} فعال
        </span>
      </div>

      {/* ═══ گفت‌وگوی نسخه‌ها ═══ */}
      <Dialog open={revisionsOpen} onOpenChange={setRevisionsOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              تاریخچهٔ نسخه‌های صفحه
            </DialogTitle>
            <DialogDescription>
              هر «انتشار» یک نسخهٔ پشتیبان می‌سازد. بازگردانی، نسخه را به پیش‌نویس برمی‌گرداند؛ برای اعمال روی سایت دوباره «انتشار» بزنید.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {revisionsLoading ? (
              <div className="space-y-2 pt-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : revisions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">هنوز نسخه‌ای منتشر نشده است</p>
            ) : (
              revisions.map((r, i) => (
                <div key={r.id} className="flex items-center gap-2 rounded-xl border p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-xs font-black text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    {toPersianDigits(revisions.length - i)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{r.label ?? "نسخهٔ منتشرشده"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {toPersianDigits(r.blockCount)} بلوک — {toPersianDigits(formatJalaliDate(new Date(r.createdAt), "yyyy/MM/dd HH:mm"))}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1 rounded-full text-xs" onClick={() => void restoreRevision(r.id)}>
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    بازگردانی
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1 rounded-full text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                    disabled={deletingRevisionId === r.id}
                    onClick={() => void deleteRevision(r.id)}
                    aria-label={`حذف نسخهٔ ${toPersianDigits(revisions.length - i)}`}
                    title="حذف این نسخه"
                  >
                    {deletingRevisionId === r.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ گفت‌وگوی بازنشانی به چیدمان پیشنهادی (R25-A2/B3) ═══ */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-teal-600" aria-hidden="true" />
              بازنشانی به چیدمان پیشنهادی
            </DialogTitle>
            <DialogDescription>
              همهٔ بلوک‌های فعلی پیش‌نویس با چیدمان استاندارد (قهرمان، دسته‌ها، پیشنهاد ویژه، محصولات، نظرات و...) جایگزین می‌شود. با «واگرد» می‌توانید برگردانید.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              className="flex-1 gap-1.5 rounded-full bg-teal-600 hover:bg-teal-700"
              onClick={resetToTemplate}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              بله، بازنشانی کن
            </Button>
            <Button variant="outline" className="flex-1 rounded-full" onClick={() => setResetOpen(false)}>
              انصراف
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
