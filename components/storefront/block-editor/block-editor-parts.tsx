"use client";

// ═══════════════════════════════════════════════════════════════════
// R24-4 — اجزای ویرایشگر بلوکی: کتابخانهٔ بلوک + پنل تنظیمات
// (سمت چپ: افزودن بلوک — سمت راست: تنظیمات بلوک انتخابی)
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  LayoutTemplate, Image as ImageIcon, LayoutGrid, Star, Quote, HelpCircle,
  Images, MapPin, Phone, FileText, Timer, Video, Megaphone, Code, StretchVertical, Minus,
  Search, Plus, Trash2, GripVertical, X, ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/hooks/use-toast";
import {
  SF_BLOCK_DEFS, SF_BG_PRESETS, type SfBlock, type SfBlockType,
  type SfFieldDef, type SfBlockStyle,
} from "@/lib/storefront-blocks";

/* ═══════════════ نگاشت آیکون بلوک‌ها ═══════════════ */

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "layout-template": LayoutTemplate,
  image: ImageIcon,
  "layout-grid": LayoutGrid,
  "folder-grid": LayoutGrid,
  star: Star,
  quote: Quote,
  "help-circle": HelpCircle,
  images: Images,
  "map-pin": MapPin,
  phone: Phone,
  "file-text": FileText,
  timer: Timer,
  video: Video,
  megaphone: Megaphone,
  code: Code,
  "stretch-vertical": StretchVertical,
  minus: Minus,
};

export function SfBlockIcon({ icon, className }: { icon: string; className?: string }) {
  const Cmp = ICONS[icon] ?? LayoutGrid;
  return <Cmp className={className} />;
}

/* ═══════════════ کتابخانهٔ بلوک (نوار چپ) ═══════════════ */

export function BlockLibrary({
  onAdd, categories, productsCount,
}: {
  onAdd: (type: SfBlockType) => void;
  categories: { name: string; count: number }[];
  productsCount: number;
}) {
  const [q, setQ] = React.useState("");
  const filtered = React.useMemo(() => {
    const query = q.trim();
    if (!query) return SF_BLOCK_DEFS;
    return SF_BLOCK_DEFS.filter(
      (d) => d.label.includes(query) || d.description.includes(query) || d.category.includes(query)
    );
  }, [q]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const d of filtered) {
      const arr = map.get(d.category) ?? [];
      arr.push(d);
      map.set(d.category, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="flex h-full flex-col" dir="rtl">
      <div className="border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی بلوک…" className="rounded-full pr-9 text-sm" />
        </div>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          {productsCount > 0
            ? `${productsCount} کالا و ${categories.length} دسته در فروشگاه شما آماده است`
            : "برای بلوک‌های کالا، ابتدا از تب «کالاها» محصول اضافه کنید"}
        </p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {grouped.map(([cat, defs]) => (
          <div key={cat}>
            <p className="mb-2 text-[11px] font-black tracking-wide text-muted-foreground">{cat}</p>
            <div className="grid grid-cols-2 gap-2">
              {defs.map((d) => (
                <button
                  key={d.type}
                  type="button"
                  onClick={() => onAdd(d.type)}
                  className="group flex flex-col items-start gap-2 rounded-xl border bg-card p-3 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md"
                  title={d.description}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 transition-colors group-hover:bg-emerald-600 group-hover:text-white dark:bg-emerald-950 dark:text-emerald-400">
                    <SfBlockIcon icon={d.icon} className="h-4 w-4" />
                  </span>
                  <span className="text-xs font-bold leading-4">{d.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {grouped.length === 0 ? (
          <p className="pt-8 text-center text-xs text-muted-foreground">بلوکی با این نام پیدا نشد</p>
        ) : null}
      </div>
    </div>
  );
}

/* ═══════════════ کنترل‌های فیلد ═══════════════ */

const STOCK_BANNER_KEYS = [
  "mobile", "hardware", "tailor", "restaurant", "grocery", "construction", "cosmetics",
  "books", "photo", "jewelry", "autoparts", "electronics", "souvenir", "flowers", "fashion",
  "nursery", "appliances", "general",
];

/** R26 — فیلد ویدیو: لینک آپارات/یوتیوب (خودکار embed می‌شود) یا آپلود مستقیم MP4/WebM */
function VideoField({
  value, onChange, hint,
}: {
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = React.useState(false);

  async function uploadVideo(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", "video");
      const res = await authFetch("/api/storefront/manage/media", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "آپلود ویدیو ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      onChange(json.url as string);
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://www.aparat.com/v/… یا https://youtu.be/…"
        dir="ltr"
        className="text-sm"
      />
      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/webm,video/ogg,.mp4,.webm"
        className="hidden"
        onChange={(e) => void uploadVideo(e.target.files?.[0])}
        aria-label="انتخاب فایل ویدیو"
      />
      <Button variant="outline" size="sm" className="w-full rounded-xl border-dashed" disabled={uploading} onClick={() => fileRef.current?.click()}>
        {uploading ? "در حال آپلود ویدیو…" : "آپلود مستقیم ویدیو (MP4/WebM تا ۳۲ مگابایت)"}
      </Button>
      {hint ? <p className="text-[11px] leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ImageField({
  value, onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = React.useState<"stock" | "upload" | "url">(
    value.startsWith("/banners/") ? "stock" : value.startsWith("/uploads/") ? "upload" : "url"
  );
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = React.useState(false);

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", "image");
      const res = await authFetch("/api/storefront/manage/media", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "آپلود ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      onChange(json.url as string);
      setTab("upload");
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2 rounded-xl border p-2.5">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setTab("stock")}
          className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${tab === "stock" ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}
        >
          بنرهای آماده
        </button>
        <button
          type="button"
          onClick={() => setTab("upload")}
          className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${tab === "upload" ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}
        >
          آپلود
        </button>
        <button
          type="button"
          onClick={() => setTab("url")}
          className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${tab === "url" ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}
        >
          آدرس تصویر
        </button>
      </div>
      {tab === "stock" ? (
        <div className="grid grid-cols-4 gap-1.5">
          {STOCK_BANNER_KEYS.map((b) => {
            const src = `/banners/${b}.avif`;
            return (
              <button
                key={b}
                type="button"
                onClick={() => onChange(src)}
                className={`relative aspect-[16/10] overflow-hidden rounded-lg border-2 transition-colors ${
                  value === src ? "border-emerald-500" : "border-transparent hover:border-emerald-300"
                }`}
                aria-label={`بنر ${b}`}
              >
                { }
                <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            );
          })}
        </div>
      ) : null}
      {tab === "upload" ? (
        <div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => void uploadImage(e.target.files?.[0])} aria-label="انتخاب فایل تصویر" />
          <Button variant="outline" size="sm" className="w-full rounded-xl border-dashed" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? "در حال آپلود…" : "انتخاب و آپلود تصویر (تا ۸ مگابایت)"}
          </Button>
          {value ? (
            <div className="mt-2 text-[11px] text-muted-foreground" dir="ltr">{value}</div>
          ) : null}
        </div>
      ) : null}
      {tab === "url" ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          dir="ltr"
          placeholder="/uploads/storefront/... یا https://..."
          className="text-xs"
        />
      ) : null}
      {value ? (
        <div className="relative overflow-hidden rounded-lg border">
          { }
          <img src={value} alt="پیش‌نمایش" className="h-24 w-full object-cover" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute left-1.5 top-1.5 rounded-full bg-red-500 p-1 text-white shadow"
            aria-label="حذف تصویر"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FieldControl({
  field, value, onChange,
}: {
  field: SfFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (field.type) {
    case "text":
      return (
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          dir={field.dir ?? "rtl"}
          className="text-sm"
        />
      );
    case "textarea":
      return (
        <Textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          dir={field.dir ?? "rtl"}
          rows={field.key === "html" ? 7 : 3}
          className="text-sm"
        />
      );
    case "link":
      return (
        <div className="space-y-1.5">
          <Input
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#products یا https://..."
            dir="ltr"
            className="text-sm"
          />
          {field.hint ? <p className="text-[11px] leading-5 text-muted-foreground">{field.hint}</p> : null}
        </div>
      );
    case "video":
      return <VideoField value={typeof value === "string" ? value : ""} onChange={(v) => onChange(v)} hint={field.hint} />;
    case "number":
      return (
        <Input
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(Number(e.target.value))}
          min={field.min}
          max={field.max}
          className="text-sm tabular-nums"
        />
      );
    case "select":
      return (
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((o) => {
            const active = String(value ?? "") === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange(o.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                  active ? "border-emerald-500 bg-emerald-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    case "switch":
      return (
        <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
          <span className="text-sm font-semibold">{field.label}</span>
          <Switch checked={Boolean(value)} onCheckedChange={(v) => onChange(v)} />
        </div>
      );
    case "image":
      return <ImageField value={typeof value === "string" ? value : ""} onChange={(v) => onChange(v)} />;
    case "slider":
      return (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{field.label}</span>
            <Badge variant="outline" className="tabular-nums">{String(value ?? 0)}</Badge>
          </div>
          <Slider
            value={[Number(value ?? field.min ?? 0)]}
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            onValueChange={([v]) => onChange(v)}
          />
        </div>
      );
    case "datetime":
      return (
        <Input
          type="datetime-local"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          dir="ltr"
          className="text-sm"
        />
      );
    case "list": {
      const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      return (
        <ListField
          field={field}
          items={items}
          onChange={(next) => onChange(next)}
        />
      );
    }
    default:
      return null;
  }
}

function ListField({
  field, items, onChange,
}: {
  field: SfFieldDef;
  items: Record<string, unknown>[];
  onChange: (items: Record<string, unknown>[]) => void;
}) {
  const [openIdx, setOpenIdx] = React.useState<number | null>(null);
  const maxItems = field.maxItems ?? 12;

  function update(idx: number, key: string, v: unknown) {
    const next = items.map((it, i) => (i === idx ? { ...it, [key]: v } : it));
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {items.map((it, idx) => (
        <div key={idx} className="rounded-xl border bg-card">
          <div className="flex items-center gap-1.5 p-2">
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
              className="flex-1 truncate text-right text-xs font-bold"
            >
              {String(it[field.itemFields?.[0]?.key ?? ""] ?? `آیتم ${idx + 1}`) || `آیتم ${idx + 1}`}
              {openIdx === idx ? null : <span className="mr-1 text-muted-foreground"> — ویرایش</span>}
            </button>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              className="rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/40"
              aria-label={`حذف آیتم ${idx + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${openIdx === idx ? "rotate-180" : ""}`} aria-hidden="true" />
          </div>
          {openIdx === idx ? (
            <div className="space-y-2.5 border-t p-2.5">
              {(field.itemFields ?? []).map((sub) => (
                <div key={sub.key} className="space-y-1">
                  {sub.type !== "switch" && sub.type !== "slider" ? (
                    <Label className="text-xs text-muted-foreground">{sub.label}</Label>
                  ) : null}
                  <FieldControl
                    field={sub}
                    value={it[sub.key]}
                    onChange={(v) => update(idx, sub.key, v)}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
      {items.length < maxItems ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-1.5 rounded-xl border-dashed text-xs"
          onClick={() => {
            onChange([...items, { ...(field.defaultItem ?? {}) }]);
            setOpenIdx(items.length);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          افزودن آیتم
        </Button>
      ) : null}
    </div>
  );
}

/* ═══════════════ پنل تنظیمات بلوک (نوار راست) ═══════════════ */

export function BlockSettingsPanel({
  block, onChange, onClose,
}: {
  block: SfBlock | null;
  onChange: (next: SfBlock) => void;
  onClose: () => void;
}) {
  if (!block) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center" dir="rtl">
        <LayoutTemplate className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm font-bold text-muted-foreground">بلوکی انتخاب نشده</p>
        <p className="text-xs leading-6 text-muted-foreground/80">
          روی یک بلوک در بوم کلیک کنید تا تنظیماتش اینجا باز شود
        </p>
      </div>
    );
  }

  const def = SF_BLOCK_DEFS.find((d) => d.type === block.type);
  if (!def) return null;

  // R25-A2 — TS narrowing برای closureها: بلوک غیرتهی در متغیر محلی ثابت
  const blk: SfBlock = block;

  function setProp(key: string, v: unknown) {
    onChange({ ...blk, props: { ...blk.props, [key]: v } });
  }

  function setStyle(patch: Partial<SfBlockStyle>) {
    onChange({ ...blk, style: { ...blk.style, ...patch } });
  }

  // گروه‌بندی فیلدها: محتوا / چیدمان
  const contentFields = def.fields.filter((f) => (f.group ?? "محتوا") === "محتوا");
  const layoutFields = def.fields.filter((f) => f.group === "چیدمان" || f.group === "رسانه");

  return (
    <div className="flex h-full flex-col" dir="rtl">
      <div className="flex items-center gap-2 border-b p-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          <SfBlockIcon icon={def.icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">{def.label}</p>
          <Input
            value={block.title}
            onChange={(e) => onChange({ ...block, title: e.target.value })}
            className="mt-1 h-7 border-none bg-muted/60 px-2 text-[11px]"
            placeholder="عنوان مدیریتی (اختیاری)"
          />
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose} aria-label="بستن پنل">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="content" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-2 grid w-auto grid-cols-3 rounded-xl">
          <TabsTrigger value="content" className="text-xs">محتوا</TabsTrigger>
          <TabsTrigger value="layout" className="text-xs">چیدمان</TabsTrigger>
          <TabsTrigger value="style" className="text-xs">استایل</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-3">
            {contentFields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                {f.type !== "switch" && f.type !== "slider" ? (
                  <Label className="text-xs font-semibold text-muted-foreground">{f.label}</Label>
                ) : null}
                <FieldControl field={f} value={block.props[f.key]} onChange={(v) => setProp(f.key, v)} />
                {f.hint ? <p className="text-[10px] leading-4 text-muted-foreground">{f.hint}</p> : null}
              </div>
            ))}
            {contentFields.length === 0 ? (
              <p className="pt-4 text-center text-xs text-muted-foreground">فیلد محتوایی ندارد — تنظیمات چیدمان را ببینید</p>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="layout" className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-3">
            {layoutFields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                {f.type !== "switch" && f.type !== "slider" ? (
                  <Label className="text-xs font-semibold text-muted-foreground">{f.label}</Label>
                ) : null}
                <FieldControl field={f} value={block.props[f.key]} onChange={(v) => setProp(f.key, v)} />
                {f.hint ? <p className="text-[10px] leading-4 text-muted-foreground">{f.hint}</p> : null}
              </div>
            ))}

            <div className="space-y-2 rounded-xl border p-3">
              <p className="text-xs font-black">فاصله‌ها</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>فاصله از بالا</span>
                  <span className="tabular-nums">{block.style.paddingTop ?? 24}px</span>
                </div>
                <Slider
                  value={[block.style.paddingTop ?? 24]}
                  min={0} max={128} step={4}
                  onValueChange={([v]) => setStyle({ paddingTop: v })}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>فاصله از پایین</span>
                  <span className="tabular-nums">{block.style.paddingBottom ?? 24}px</span>
                </div>
                <Slider
                  value={[block.style.paddingBottom ?? 24]}
                  min={0} max={128} step={4}
                  onValueChange={([v]) => setStyle({ paddingBottom: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">عرض محتوا</Label>
                <div className="flex gap-1.5">
                  {[
                    { v: "full", l: "تمام‌عرض" },
                    { v: "wide", l: "پهن" },
                    { v: "boxed", l: "جعبه‌ای" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setStyle({ maxWidth: o.v as SfBlockStyle["maxWidth"] })}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors ${
                        (block.style.maxWidth ?? "wide") === o.v ? "border-emerald-500 bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="style" className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-black">پس‌زمینه</p>
              <div className="grid grid-cols-2 gap-1.5">
                {SF_BG_PRESETS.map((preset) => (
                  <button
                    key={preset.value || "transparent"}
                    type="button"
                    onClick={() => setStyle({ bgColor: preset.value, textColor: preset.value === "dark" || preset.value === "aurora-mesh" ? "light" : "default" })}
                    className={`flex items-center gap-2 rounded-xl border p-2 text-right text-[11px] font-semibold transition-all hover:shadow-md ${
                      (block.style.bgColor ?? "") === preset.value ? "border-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900" : "border-border"
                    }`}
                  >
                    <span className={`h-6 w-6 shrink-0 rounded-md ${preset.className}`} aria-hidden="true" />
                    <span className="leading-4">{preset.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Label className="text-xs text-muted-foreground">رنگ دلخواه (hex)</Label>
                <Input
                  value={block.style.bgColor?.startsWith("#") ? block.style.bgColor : ""}
                  onChange={(e) => setStyle({ bgColor: e.target.value })}
                  placeholder="#f0fdf4"
                  dir="ltr"
                  className="h-8 flex-1 text-xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-black">رنگ متن</p>
              <div className="flex gap-1.5">
                {[
                  { v: "default", l: "پیش‌فرض قالب" },
                  { v: "dark", l: "تیره" },
                  { v: "light", l: "روشن" },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setStyle({ textColor: o.v as SfBlockStyle["textColor"] })}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors ${
                      (block.style.textColor ?? "default") === o.v ? "border-emerald-500 bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-black">رنگ لهجه</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {["", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#0d9488", "#e11d48"].map((c) => (
                  <button
                    key={c || "default"}
                    type="button"
                    onClick={() => setStyle({ accent: c })}
                    className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                      (block.style.accent ?? "") === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c || "transparent", boxShadow: c ? undefined : "inset 0 0 0 1px rgba(0,0,0,.15)" }}
                    aria-label={c ? `رنگ ${c}` : "رنگ پیش‌فرض قالب"}
                  >
                    {c ? null : <Minus className="mx-auto h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                ))}
                <Input
                  value={block.style.accent ?? ""}
                  onChange={(e) => setStyle({ accent: e.target.value })}
                  placeholder="#hex"
                  dir="ltr"
                  className="h-8 w-24 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5 rounded-xl border p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>گردی گوشه‌ها</span>
                <span className="tabular-nums">{block.style.radius ?? 16}px</span>
              </div>
              <Slider
                value={[block.style.radius ?? 16]}
                min={0} max={32} step={2}
                onValueChange={([v]) => setStyle({ radius: v })}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-bold">نمایش بلوک</p>
                <p className="text-[11px] text-muted-foreground">بلوک مخفی در سایت عمومی دیده نمی‌شود</p>
              </div>
              <Switch checked={block.visible} onCheckedChange={(v) => onChange({ ...block, visible: v })} />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
