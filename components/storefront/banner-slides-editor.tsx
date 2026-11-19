"use client";

// ═══════════════════════════════════════════════════════════════════
// Task 3-a — مدیریت اسلایدهای بنر (multi-slide) برای شیت ویرایش «بنر اصلی»
// ============================================================================
// فهرست کارت‌های اسلاید (بندانگشتی + عنوان + جابه‌جایی/تکثیر/حذف) + ویرایش
// متن هر اسلاید (تیتر/زیرتیتر/بج/دکمه + لینک) + دیالوگ سه‌راهی انتخاب تصویر:
//   ۱) «مدیریت فایل»  → FileManagerDialog (تصاویر قبلاً آپلودشدهٔ tenant)
//   ۲) «آپلود تصویر»  → POST /api/files/upload (تبدیل خودکار AVIF)
//   ۳) «بنرهای آماده» → گرید /banners/<industry>.avif (۱۸ صنف)
// اگر آرایهٔ اسلایدها خالی باشد، بنر تکی فعلی سایت بدون تغییر می‌ماند.
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronDown as ChevronExpand,
  Copy,
  Upload,
  FolderOpen,
  Images,
  Loader2,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileManagerDialog } from "@/components/file-manager-dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch, getAuthToken } from "@/lib/auth-fetch";
import { toPersianDigits } from "@/lib/persian";
import { type BannerSlide } from "@/lib/storefront-wizard";
import { BANNER_THEMES } from "@/components/storefront/cinematic-banner";

const MAX_SLIDES = 8;

/** بنرهای آمادهٔ سینمایی پلتفرم — کلیدهای تم = همان نام فایل‌های /banners/*.avif */
const STOCK_BANNERS = Object.keys(BANNER_THEMES);

export function BannerSlidesEditor({
  slides,
  onChange,
  onUploadMedia,
}: {
  slides: BannerSlide[];
  onChange: (slides: BannerSlide[]) => void;
  /** آپلود جایگزین (رسانهٔ فروشگاه) — اگر مسیر مدیریت فایل در دسترس نبود */
  onUploadMedia?: (file: File, kind: "image" | "video") => Promise<string | null>;
}) {
  const { toast } = useToast();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [fileManagerOpen, setFileManagerOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  /** کارت باز (ویرایش متن) — null یعنی همه بسته */
  const [openIdx, setOpenIdx] = React.useState<number | null>(null);
  /** ایندکس «تغییر تصویر» — null یعنی دیالوگ برای افزودن اسلاید جدید باز شده */
  const [replaceIdx, setReplaceIdx] = React.useState<number | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  /* ── عملیات پایه روی آرایهٔ اسلایدها ── */
  function patchSlide(idx: number, fields: Partial<BannerSlide>) {
    onChange(slides.map((s, i) => (i === idx ? { ...s, ...fields } : s)));
  }
  function moveSlide(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }
  function duplicateSlide(idx: number) {
    if (slides.length >= MAX_SLIDES) return;
    const next = [...slides];
    next.splice(idx + 1, 0, { ...slides[idx] });
    onChange(next);
  }
  function deleteSlide(idx: number) {
    onChange(slides.filter((_, i) => i !== idx));
    setOpenIdx((o) => (o === idx ? null : o !== null && o > idx ? o - 1 : o));
  }
  /** افزودن اسلاید جدید یا جایگزینی تصویر اسلاید موجود */
  function addSlide(image: string) {
    if (replaceIdx !== null) {
      patchSlide(replaceIdx, { image });
      setReplaceIdx(null);
      return;
    }
    if (slides.length >= MAX_SLIDES) return;
    onChange([...slides, { image }]);
    setOpenIdx(slides.length); // کارت تازه‌افزوده باز شود تا متنش را بنویسد
  }

  /* ── آپلود مستقیم: مسیر اصلی /api/files/upload + fallback رسانهٔ فروشگاه ── */
  async function handleUpload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      let url: string | null = null;
      let errMsg = "";
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await authFetch("/api/files/upload", { method: "POST", body: fd });
        const json = (await res.json().catch(() => null)) as
          | { success?: boolean; error?: string; data?: { url?: string } }
          | null;
        if (res.ok && json?.success && json.data?.url) url = json.data.url;
        else errMsg = json?.error || "";
      } catch {
        /* مسیر جایگزین پایین */
      }
      if (!url && onUploadMedia) url = await onUploadMedia(file, "image");
      if (!url) {
        toast({
          title: "آپلود ناموفق",
          description: errMsg || "اتصال را بررسی کنید و دوباره تلاش کنید",
          variant: "destructive",
        });
        return;
      }
      addSlide(url);
      setPickerOpen(false);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="flex items-center gap-1.5">
          <Layers className="h-4 w-4" aria-hidden="true" />
          اسلایدهای چرخشی بنر
        </Label>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          با افزودن یک یا چند اسلاید، بنر اصلی سایت به اسلایدر سینمایی (پخش خودکار با نوار پیشرفت و افکت زوم آرام) تبدیل می‌شود.
          تا وقتی اسلایدی اضافه نکنید، بنر فعلی بدون تغییر می‌ماند. متن‌های خالی روی اسلاید نمایش داده نمی‌شوند؛ اسلاید اول در صورت
          خالی بودن متن، متن‌های بنر اصلی (بالا) را به ارث می‌برد.
        </p>
      </div>

      {/* ── کارت‌های اسلاید ── */}
      {slides.length > 0 ? (
        <div className="space-y-2">
          {slides.map((s, i) => {
            const open = openIdx === i;
            return (
              <div key={i} className="rounded-xl border bg-card">
                {/* سرصفحهٔ کارت: بندانگشتی + عنوان + عملیات */}
                <div className="flex items-center gap-2 p-2">
                  <img
                    src={s.image}
                    alt={s.title || `اسلاید ${toPersianDigits(i + 1)}`}
                    className="h-11 w-[72px] shrink-0 rounded-lg border border-border object-cover"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    onClick={() => setOpenIdx(open ? null : i)}
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-right transition-colors hover:bg-muted/60"
                    aria-expanded={open}
                  >
                    <span className="w-full truncate text-xs font-bold">
                      {toPersianDigits(i + 1)}. {s.title?.trim() || "بدون عنوان"}
                    </span>
                    <span className="w-full truncate text-[10px] text-muted-foreground" dir="ltr">
                      {s.image}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => moveSlide(i, -1)}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                      aria-label={`انتقال اسلاید ${toPersianDigits(i + 1)} به بالا`}
                    >
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={i === slides.length - 1}
                      onClick={() => moveSlide(i, 1)}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                      aria-label={`انتقال اسلاید ${toPersianDigits(i + 1)} به پایین`}
                    >
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={slides.length >= MAX_SLIDES}
                      onClick={() => duplicateSlide(i)}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                      aria-label={`تکثیر اسلاید ${toPersianDigits(i + 1)}`}
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSlide(i)}
                      className="rounded-lg p-1.5 text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`حذف اسلاید ${toPersianDigits(i + 1)}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenIdx(open ? null : i)}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={open ? "بستن ویرایش اسلاید" : "ویرایش متن اسلاید"}
                    >
                      <ChevronExpand className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* ویرایش متن اسلاید (بازشونده) */}
                {open ? (
                  <div className="space-y-2.5 border-t p-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">تیتر اسلاید</Label>
                      <Input
                        value={s.title ?? ""}
                        onChange={(e) => patchSlide(i, { title: e.target.value })}
                        maxLength={120}
                        placeholder="مثلاً: جشنوارهٔ فروش پاییزی"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">زیرتیتر</Label>
                      <Textarea
                        value={s.subtitle ?? ""}
                        onChange={(e) => patchSlide(i, { subtitle: e.target.value })}
                        rows={2}
                        maxLength={400}
                        placeholder="توضیح کوتاه روی اسلاید (اختیاری)"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">بج (نشان کوچک)</Label>
                        <Input
                          value={s.badge ?? ""}
                          onChange={(e) => patchSlide(i, { badge: e.target.value })}
                          maxLength={60}
                          placeholder="مثلاً: جدید"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">متن دکمه</Label>
                        <Input
                          value={s.ctaLabel ?? ""}
                          onChange={(e) => patchSlide(i, { ctaLabel: e.target.value })}
                          maxLength={40}
                          placeholder="مثلاً: مشاهدهٔ محصولات"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">لینک دکمه</Label>
                      <Input
                        value={s.ctaLink ?? ""}
                        onChange={(e) => patchSlide(i, { ctaLink: e.target.value })}
                        maxLength={500}
                        dir="ltr"
                        placeholder="#products یا https://..."
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl border-dashed"
                      onClick={() => {
                        setReplaceIdx(i);
                        setPickerOpen(true);
                      }}
                    >
                      <Images className="h-4 w-4" aria-hidden="true" />
                      تغییر تصویر این اسلاید
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* افزودن اسلاید */}
      {slides.length < MAX_SLIDES ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full rounded-xl border-dashed"
          onClick={() => {
            setReplaceIdx(null);
            setPickerOpen(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          افزودن اسلاید
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">سقف اسلایدها {toPersianDigits(MAX_SLIDES)} عدد است.</p>
      )}

      {/* حذف همه — بازگشت به بنر تکی */}
      {slides.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            onChange([]);
            setOpenIdx(null);
          }}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          حذف همهٔ اسلایدها (بازگشت به بنر تکی)
        </Button>
      ) : null}

      {/* ── دیالوگ سه‌راهی انتخاب تصویر اسلاید ── */}
      <Dialog
        open={pickerOpen}
        onOpenChange={(o) => {
          setPickerOpen(o);
          if (!o) setReplaceIdx(null);
        }}
      >
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader className="text-right">
            <DialogTitle>{replaceIdx !== null ? "تغییر تصویر اسلاید" : "افزودن اسلاید جدید"}</DialogTitle>
            <DialogDescription>
              تصویر اسلاید را از بنرهای آمادهٔ سینمایی، آپلود مستقیم یا مدیریت فایل انتخاب کنید.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="stock">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="stock" className="gap-1.5 text-xs">
                <Images className="h-3.5 w-3.5" aria-hidden="true" />
                بنرهای آماده
              </TabsTrigger>
              <TabsTrigger value="upload" className="gap-1.5 text-xs">
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                آپلود تصویر
              </TabsTrigger>
              <TabsTrigger value="files" className="gap-1.5 text-xs">
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                مدیریت فایل
              </TabsTrigger>
            </TabsList>

            {/* ۱) بنرهای آمادهٔ صنف‌ها */}
            <TabsContent value="stock">
              <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto p-1">
                {STOCK_BANNERS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      addSlide(`/banners/${b}.avif`);
                      setPickerOpen(false);
                    }}
                    className="relative aspect-[16/10] overflow-hidden rounded-lg border-2 border-transparent transition-all hover:scale-[1.03] hover:border-primary/60 focus-visible:border-primary"
                    aria-label={`بنر آمادهٔ ${b}`}
                  >
                    <img
                      src={`/banners/${b}.avif`}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </TabsContent>

            {/* ۲) آپلود مستقیم فایل */}
            <TabsContent value="upload">
              <div className="space-y-2 p-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  className="hidden"
                  onChange={(e) => void handleUpload(e.target.files?.[0])}
                  aria-label="انتخاب فایل تصویر اسلاید"
                />
                <Button
                  variant="outline"
                  className="w-full rounded-xl border-dashed"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="h-4 w-4" aria-hidden="true" />
                  )}
                  {uploading ? "در حال آپلود…" : "انتخاب و آپلود تصویر (PNG/JPG/WebP/GIF/AVIF تا ۵ مگابایت)"}
                </Button>
                <p className="text-xs leading-6 text-muted-foreground">
                  تصویر به‌صورت خودکار به فرمت سبک AVIF تبدیل و بلافاصله به اسلایدها اضافه می‌شود.
                </p>
              </div>
            </TabsContent>

            {/* ۳) مدیریت فایل (تصاویر قبلاً آپلودشده) */}
            <TabsContent value="files">
              <div className="space-y-2 p-1">
                <Button className="w-full rounded-xl" onClick={() => setFileManagerOpen(true)}>
                  <FolderOpen className="h-4 w-4" aria-hidden="true" />
                  باز کردن مدیریت فایل
                </Button>
                <p className="text-xs leading-6 text-muted-foreground">
                  از بین تصاویر قبلاً آپلودشدهٔ حساب خودتان انتخاب کنید یا در همان‌جا تصویر جدیدی آپلود کنید.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* دیالوگ مدیریت فایل — انتخاب تصویر اسلاید */}
      <FileManagerDialog
        open={fileManagerOpen}
        onOpenChange={setFileManagerOpen}
        token={getAuthToken() ?? ""}
        onSelect={(url) => {
          addSlide(url);
          setPickerOpen(false);
        }}
        title="انتخاب تصویر اسلاید"
        description="از بین تصاویر آپلودشده انتخاب کنید یا تصویر جدیدی آپلود کنید"
      />
    </div>
  );
}

export default BannerSlidesEditor;
