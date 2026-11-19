"use client";

// ═══════════════════════════════════════════════════════════════════
// R26 — شیت ویرایش بخش‌های سایت فروشگاه (نسخهٔ کامل «المنتوری»)
//  ۱) ویرایشگر بصری داخل پنل مالک (manage/visual-editor-tab)
//  ۲) حالت ویرایش روی سایت عمومی (?edit=1 — shop-page)
// هر دو دقیقاً همان فرم‌ها را نشان می‌دهند تا تجربهٔ یکدست باشد.
// R26: هدر/فوتر کامل شدند (لوگو، منو با افزودن/حذف/جابه‌جایی، رنگ لهجه،
// ستون‌های فوتر، شبکه‌های اجتماعی، تماس) + بخش‌های محصولات/دسته‌ها/نوار اعتماد.
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  Pencil,
  Image as ImageIcon,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Upload,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { StorefrontContent } from "@/lib/storefront-wizard";
import { STOREFRONT_HEADER_ACCENTS } from "@/lib/storefront-wizard";
// Task 3-a — مدیریت اسلایدهای چرخشی بنر (multi-slide)
import { BannerSlidesEditor } from "@/components/storefront/banner-slides-editor";

export type StorefrontSectionId =
  | "banner"
  | "announcement"
  | "features"
  | "stats"
  | "about"
  | "header"
  | "footer"
  | "sections"
  | "products"
  | "categories"
  | "trust";

export const STOREFRONT_SECTION_LABELS: Record<StorefrontSectionId, string> = {
  banner: "بنر اصلی",
  announcement: "نوار اعلان",
  features: "ویژگی‌ها",
  stats: "آمار",
  about: "دربارهٔ ما",
  header: "هدر و منو",
  footer: "فوتر",
  sections: "نمایش/مخفی بخش‌ها",
  products: "محصولات",
  categories: "دسته‌بندی‌ها",
  trust: "نوار اعتماد",
};

/** بنرهای آمادهٔ سینمایی پلتفرم (/banners/<id>.avif) */
export const STOREFRONT_STOCK_BANNERS = [
  "mobile", "hardware", "tailor", "restaurant", "grocery", "construction", "cosmetics",
  "books", "photo", "jewelry", "autoparts", "electronics", "souvenir", "flowers", "fashion",
  "nursery", "appliances", "general",
] as const;

/** اطلاعات فروشگاه که از شیت قابل ویرایش‌اند (فیلدهای سطح Storefront) */
export interface StorefrontShopInfoDraft {
  title: string;
  phone: string;
  address: string;
  city: string;
  socialInstagram: string;
  socialTelegram: string;
  socialWhatsapp: string;
}

export function StorefrontSectionEditorSheet({
  open,
  onOpenChange,
  sectionId,
  content,
  onPatchContent,
  bannerImage,
  onBannerImage,
  shopInfo,
  onPatchShopInfo,
  onUploadMedia,
  applyLabel = "اعمال در پیش‌نمایش",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionId: StorefrontSectionId | null;
  content: StorefrontContent;
  onPatchContent: (patch: Partial<StorefrontContent>) => void;
  /** تصویر بنر انتخابی مالک (null = بنر خودکار صنف) */
  bannerImage: string | null;
  onBannerImage: (v: string | null) => void;
  /** اطلاعات فروشگاه (نام/تماس/شبکه‌های اجتماعی) — برای ویرایش هدر و فوتر */
  shopInfo?: StorefrontShopInfoDraft | null;
  onPatchShopInfo?: (patch: Partial<StorefrontShopInfoDraft>) => void;
  /** آپلود لوگو/رسانه — پیاده‌سازی احراز هویت با فراخواننده است */
  onUploadMedia?: (file: File, kind: "image" | "video") => Promise<string | null>;
  /** متن دکمهٔ پایین شیت — در پنل «اعمال در پیش‌نمایش»، روی سایت «اعمال روی سایت» */
  applyLabel?: string;
}) {
  const logoInputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploadingLogo, setUploadingLogo] = React.useState(false);
  // R26 — آپلود تصویر دلخواه بنر (نه فقط بنرهای آماده)
  const bannerInputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploadingBanner, setUploadingBanner] = React.useState(false);

  const header = content.header;
  const footer = content.footer;

  const patchHeader = (patch: Partial<StorefrontContent["header"]>) =>
    onPatchContent({ header: { ...header, ...patch } });
  const patchFooter = (patch: Partial<StorefrontContent["footer"]>) =>
    onPatchContent({ footer: { ...footer, ...patch } });
  const patchShop = (patch: Partial<StorefrontShopInfoDraft>) => onPatchShopInfo?.(patch);

  async function handleLogoUpload(file: File | undefined) {
    if (!file || !onUploadMedia) return;
    setUploadingLogo(true);
    try {
      const url = await onUploadMedia(file, "image");
      if (url) patchHeader({ logoUrl: url });
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  /** R26 — آپلود تصویر پس‌زمینهٔ دلخواه بنر (تا ۸ مگابایت) */
  async function handleBannerUpload(file: File | undefined) {
    if (!file || !onUploadMedia) return;
    setUploadingBanner(true);
    try {
      const url = await onUploadMedia(file, "image");
      if (url) onBannerImage(url);
    } finally {
      setUploadingBanner(false);
      if (bannerInputRef.current) bannerInputRef.current.value = "";
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[440px] max-w-[92vw] overflow-y-auto p-5" dir="rtl">
        <SheetHeader className="text-right">
          <SheetTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" aria-hidden="true" />
            ویرایش {sectionId ? STOREFRONT_SECTION_LABELS[sectionId] : ""}
          </SheetTitle>
          <SheetDescription>
            تغییرات را وارد کنید؛ در پایان دکمهٔ ذخیره را بزنید تا برای بازدیدکنندگان سایت اعمال شود.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {sectionId === "banner" ? (
            <>
              <div className="space-y-1.5">
                <Label>بج بالای بنر</Label>
                <Input value={content.banner.badge} onChange={(e) => onPatchContent({ banner: { ...content.banner, badge: e.target.value } })} maxLength={60} />
              </div>
              <div className="space-y-1.5">
                <Label>تیتر اصلی</Label>
                <Input value={content.banner.title} onChange={(e) => onPatchContent({ banner: { ...content.banner, title: e.target.value } })} maxLength={120} />
              </div>
              <div className="space-y-1.5">
                <Label>زیرتیتر</Label>
                <Textarea value={content.banner.subtitle} onChange={(e) => onPatchContent({ banner: { ...content.banner, subtitle: e.target.value } })} rows={3} maxLength={400} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>متن دکمه</Label>
                  <Input value={content.banner.ctaLabel} onChange={(e) => onPatchContent({ banner: { ...content.banner, ctaLabel: e.target.value } })} maxLength={40} />
                </div>
                <div className="space-y-1.5">
                  <Label>لینک دکمه</Label>
                  <Input value={content.banner.ctaLink} onChange={(e) => onPatchContent({ banner: { ...content.banner, ctaLink: e.target.value } })} maxLength={500} dir="ltr" />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <ImageIcon className="h-4 w-4" aria-hidden="true" />
                  تصویر پس‌زمینهٔ بنر
                </Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {STOREFRONT_STOCK_BANNERS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => onBannerImage(`/banners/${b}.avif`)}
                      className={`relative aspect-[16/10] overflow-hidden rounded-lg border-2 transition-colors ${
                        bannerImage === `/banners/${b}.avif` ? "border-primary" : "border-transparent hover:border-primary/40"
                      }`}
                      aria-label={`بنر ${b}`}
                    >
                      {/* R19-D (CWV): بندانگشتی از نسخهٔ AVIF — PNG های ۱۰۰-۴۷۷KB با برادر avif سبک‌اند */}
                      <img src={`/banners/${b}.avif`} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="mt-1 w-full rounded-lg border border-dashed" onClick={() => onBannerImage(null)}>
                  {bannerImage ? "استفاده از بنر پیش‌فرض صنف من" : "بنر پیش‌فرض (خودکار بر اساس نوع کسب‌وکار)"}
                </Button>
                {onUploadMedia ? (
                  <>
                    <input
                      ref={bannerInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                      className="hidden"
                      onChange={(e) => void handleBannerUpload(e.target.files?.[0])}
                      aria-label="انتخاب فایل تصویر بنر"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl border-dashed"
                      disabled={uploadingBanner}
                      onClick={() => bannerInputRef.current?.click()}
                    >
                      {uploadingBanner ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                      {uploadingBanner ? "در حال آپلود…" : "آپلود تصویر دلخواه بنر (PNG/JPG/WebP تا ۸ مگابایت)"}
                    </Button>
                    {bannerImage?.startsWith("/uploads/storefront/") ? (
                      <div className="flex items-center gap-3 rounded-xl border p-2">
                        {/* آپلود مالک — دامنه نامشخص */}
                        <img src={bannerImage} alt="بنر دلخواه" className="h-12 w-20 rounded-lg object-cover" />
                        <span className="text-xs text-muted-foreground">بنر دلخواه شما فعال است</span>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>

              <Separator />
              {/* Task 3-a — اسلایدهای چرخشی بنر: افزودن/جابه‌جایی/تکثیر/حذف + متن هر اسلاید.
                  آرایهٔ خالی = بنر تکی فعلی (سازگاری کامل با فروشگاه‌های موجود). */}
              <BannerSlidesEditor
                slides={content.banner.slides ?? []}
                onChange={(slides) => onPatchContent({ banner: { ...content.banner, slides } })}
                onUploadMedia={onUploadMedia}
              />
            </>
          ) : null}

          {sectionId === "announcement" ? (
            <div className="space-y-1.5">
              <Label>متن نوار اعلان بالای سایت</Label>
              <Textarea value={content.announcement} onChange={(e) => onPatchContent({ announcement: e.target.value })} rows={2} maxLength={200} />
              <p className="text-xs text-muted-foreground">مثال: «ارسال رایگان سفارش‌های بالای ۵۰۰ هزار تومان»</p>
            </div>
          ) : null}

          {sectionId === "features" ? (
            <div className="space-y-3">
              {content.features.slice(0, 4).map((f, i) => (
                <div key={i} className="rounded-xl border p-3 space-y-2">
                  <div className="grid grid-cols-[1fr_120px] gap-2">
                    <Input
                      value={f.title}
                      onChange={(e) => {
                        const features = [...content.features];
                        features[i] = { ...f, title: e.target.value };
                        onPatchContent({ features });
                      }}
                      placeholder="عنوان ویژگی"
                      maxLength={60}
                    />
                    <select
                      value={f.icon}
                      onChange={(e) => {
                        const features = [...content.features];
                        features[i] = { ...f, icon: e.target.value };
                        onPatchContent({ features });
                      }}
                      className="rounded-lg border bg-background px-2 text-xs"
                      aria-label="آیکون"
                    >
                      <option value="truck">ارسال سریع</option>
                      <option value="shield">ضمانت اصالت</option>
                      <option value="support">پشتیبانی</option>
                      <option value="price">قیمت منصفانه</option>
                    </select>
                  </div>
                  <Textarea
                    value={f.text}
                    onChange={(e) => {
                      const features = [...content.features];
                      features[i] = { ...f, text: e.target.value };
                      onPatchContent({ features });
                    }}
                    placeholder="توضیح کوتاه"
                    rows={2}
                    maxLength={200}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {sectionId === "stats" ? (
            <div className="space-y-3">
              {content.stats.slice(0, 3).map((s, i) => (
                <div key={i} className="grid grid-cols-[140px_1fr] gap-2">
                  <Input
                    value={s.value}
                    onChange={(e) => {
                      const stats = [...content.stats];
                      stats[i] = { ...s, value: e.target.value };
                      onPatchContent({ stats });
                    }}
                    placeholder="عدد (مثلاً ۹۸٪)"
                    maxLength={30}
                  />
                  <Input
                    value={s.label}
                    onChange={(e) => {
                      const stats = [...content.stats];
                      stats[i] = { ...s, label: e.target.value };
                      onPatchContent({ stats });
                    }}
                    placeholder="برچسب (مثلاً رضایت مشتری)"
                    maxLength={60}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {sectionId === "about" ? (
            <div className="space-y-1.5">
              <Label>عنوان</Label>
              <Input value={content.about.title} onChange={(e) => onPatchContent({ about: { ...content.about, title: e.target.value } })} maxLength={100} />
              <Label className="mt-2">متن دربارهٔ ما</Label>
              <Textarea value={content.about.text} onChange={(e) => onPatchContent({ about: { ...content.about, text: e.target.value } })} rows={5} maxLength={2000} />
            </div>
          ) : null}

          {/* ═══ هدر — ویرایش کامل: نام، شعار، لوگو، منو، رنگ، جستجو ═══ */}
          {sectionId === "header" ? (
            <div className="space-y-4">
              {shopInfo && onPatchShopInfo ? (
                <div className="space-y-1.5">
                  <Label>نام فروشگاه (سربرگ سایت)</Label>
                  <Input value={shopInfo.title} onChange={(e) => patchShop({ title: e.target.value })} maxLength={100} />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label>شعار کنار نام فروشگاه</Label>
                <Input value={header.tagline} onChange={(e) => patchHeader({ tagline: e.target.value })} maxLength={60} />
              </div>

              <Separator />
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <ImageIcon className="h-4 w-4" aria-hidden="true" />
                  لوگوی هدر
                </Label>
                {header.logoUrl ? (
                  <div className="flex items-center gap-3 rounded-xl border p-2">
                    {/* آپلود مالک — دامنه نامشخص */}
                    <img src={header.logoUrl} alt="لوگو" className="h-10 w-10 rounded-xl object-cover" />
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => patchHeader({ logoUrl: null })}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      حذف لوگو
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs leading-6 text-muted-foreground">
                    الان نشان پیش‌فرض (آیکون فروشگاه) نشان داده می‌شود. لوگوی خودتان را آپلود کنید.
                  </p>
                )}
                {onUploadMedia ? (
                  <>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => void handleLogoUpload(e.target.files?.[0])}
                      aria-label="انتخاب فایل لوگو"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl border-dashed"
                      disabled={uploadingLogo}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                      {uploadingLogo ? "در حال آپلود…" : "آپلود لوگو (PNG/JPG/WebP تا ۸ مگابایت)"}
                    </Button>
                  </>
                ) : null}
              </div>

              <Separator />
              <div className="space-y-2">
                <Label>منوی هدر (عنوان + لینک)</Label>
                <div className="space-y-2">
                  {header.links.map((l, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        value={l.label}
                        onChange={(e) => {
                          const links = [...header.links];
                          links[i] = { ...l, label: e.target.value };
                          patchHeader({ links });
                        }}
                        placeholder="عنوان"
                        maxLength={40}
                        className="flex-1"
                      />
                      <Input
                        value={l.href}
                        onChange={(e) => {
                          const links = [...header.links];
                          links[i] = { ...l, href: e.target.value };
                          patchHeader({ links });
                        }}
                        placeholder="#products"
                        dir="ltr"
                        maxLength={500}
                        className="flex-1"
                      />
                      <div className="flex shrink-0 flex-col">
                        <button
                          type="button"
                          disabled={i === 0}
                          onClick={() => {
                            const links = [...header.links];
                            [links[i - 1], links[i]] = [links[i], links[i - 1]];
                            patchHeader({ links });
                          }}
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          aria-label="انتقال به بالا"
                        >
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={i === header.links.length - 1}
                          onClick={() => {
                            const links = [...header.links];
                            [links[i + 1], links[i]] = [links[i], links[i + 1]];
                            patchHeader({ links });
                          }}
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          aria-label="انتقال به پایین"
                        >
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => patchHeader({ links: header.links.filter((_, j) => j !== i) })}
                        className="shrink-0 rounded-lg p-1.5 text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`حذف ${l.label || "لینک"}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
                {header.links.length < 8 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full rounded-xl border-dashed"
                    onClick={() => patchHeader({ links: [...header.links, { label: "", href: "#" }] })}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    افزودن آیتم منو
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">سقف منو ۸ آیتم است.</p>
                )}
              </div>

              <Separator />
              <div className="space-y-2">
                <Label>رنگ لهجهٔ هدر و دکمه‌ها</Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {STOREFRONT_HEADER_ACCENTS.map((a) => (
                    <button
                      key={a.value || "default"}
                      type="button"
                      onClick={() => patchHeader({ accentColor: a.value || null })}
                      className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                        (header.accentColor ?? "") === a.value ? "border-foreground scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: a.value || "transparent", boxShadow: a.value ? undefined : "inset 0 0 0 1px rgba(0,0,0,.15)" }}
                      title={a.label}
                      aria-label={a.label}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {(header.accentColor ?? "") === "" ? "رنگ قالب فعلی (پیش‌فرض)" : "برای بازگشت به رنگ قالب، دایرهٔ اول را بزنید."}
                </p>
              </div>

              <div className="flex items-center justify-between rounded-xl border p-3">
                <span className="text-sm font-semibold">نمایش نوار جستجو در هدر</span>
                <Switch checked={header.showSearch !== false} onCheckedChange={(v) => patchHeader({ showSearch: v })} />
              </div>
            </div>
          ) : null}

          {/* ═══ فوتر — ویرایش کامل: معرفی، تماس، شبکه‌ها، ستون‌ها، کپی‌رایت ═══ */}
          {sectionId === "footer" ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>عنوان ستون معرفی فوتر</Label>
                <Input
                  value={footer.aboutTitle ?? ""}
                  onChange={(e) => patchFooter({ aboutTitle: e.target.value })}
                  maxLength={100}
                  placeholder="خالی = نام فروشگاه"
                />
              </div>
              <div className="space-y-1.5">
                <Label>متن ستون معرفی فوتر</Label>
                <Textarea
                  value={footer.aboutText ?? ""}
                  onChange={(e) => patchFooter({ aboutText: e.target.value })}
                  rows={4}
                  maxLength={1200}
                  placeholder="خالی = متن بخش «دربارهٔ ما»"
                />
              </div>
              <div className="space-y-1.5">
                <Label>یادداشت فوتر (ساعات پاسخگویی و...)</Label>
                <Textarea value={footer.note} onChange={(e) => patchFooter({ note: e.target.value })} rows={2} maxLength={300} />
              </div>

              {shopInfo && onPatchShopInfo ? (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label>اطلاعات تماس</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={shopInfo.phone} onChange={(e) => patchShop({ phone: e.target.value })} placeholder="تلفن" dir="ltr" maxLength={30} />
                      <Input value={shopInfo.city} onChange={(e) => patchShop({ city: e.target.value })} placeholder="شهر" maxLength={60} />
                    </div>
                    <Input value={shopInfo.address} onChange={(e) => patchShop({ address: e.target.value })} placeholder="نشانی کامل" maxLength={300} />
                  </div>
                  <div className="space-y-2">
                    <Label>شبکه‌های اجتماعی</Label>
                    <Input value={shopInfo.socialInstagram} onChange={(e) => patchShop({ socialInstagram: e.target.value })} placeholder="اینستاگرام — مثل myshop@" dir="ltr" maxLength={100} />
                    <Input value={shopInfo.socialTelegram} onChange={(e) => patchShop({ socialTelegram: e.target.value })} placeholder="تلگرام — مثل myshop@" dir="ltr" maxLength={100} />
                    <Input value={shopInfo.socialWhatsapp} onChange={(e) => patchShop({ socialWhatsapp: e.target.value })} placeholder="واتساپ — مثل 989123456789" dir="ltr" maxLength={100} />
                    <Input
                      value={footer.socialAparat ?? ""}
                      onChange={(e) => patchFooter({ socialAparat: e.target.value })}
                      placeholder="آپارات — لینک کانال یا ویدیو (https://...)"
                      dir="ltr"
                      maxLength={400}
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <Label>لینک آپارات (اختیاری)</Label>
                  <Input
                    value={footer.socialAparat ?? ""}
                    onChange={(e) => patchFooter({ socialAparat: e.target.value })}
                    placeholder="https://www.aparat.com/..."
                    dir="ltr"
                    maxLength={400}
                  />
                </div>
              )}

              <Separator />
              <div className="space-y-2">
                <Label>ستون‌های لینک فوتر (حداکثر ۳ ستون)</Label>
                {(footer.columns ?? []).map((col, ci) => (
                  <div key={ci} className="space-y-2 rounded-xl border p-3">
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={col.title}
                        onChange={(e) => {
                          const columns = [...(footer.columns ?? [])];
                          columns[ci] = { ...col, title: e.target.value };
                          patchFooter({ columns });
                        }}
                        placeholder="عنوان ستون (مثل دسترسی سریع)"
                        maxLength={60}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => patchFooter({ columns: (footer.columns ?? []).filter((_, j) => j !== ci) })}
                        className="shrink-0 rounded-lg p-1.5 text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`حذف ستون ${col.title || ci + 1}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    {col.links.map((l, li) => (
                      <div key={li} className="flex items-center gap-1.5">
                        <Input
                          value={l.label}
                          onChange={(e) => {
                            const columns = [...(footer.columns ?? [])];
                            const links = [...col.links];
                            links[li] = { ...l, label: e.target.value };
                            columns[ci] = { ...col, links };
                            patchFooter({ columns });
                          }}
                          placeholder="عنوان لینک"
                          maxLength={40}
                          className="flex-1"
                        />
                        <Input
                          value={l.href}
                          onChange={(e) => {
                            const columns = [...(footer.columns ?? [])];
                            const links = [...col.links];
                            links[li] = { ...l, href: e.target.value };
                            columns[ci] = { ...col, links };
                            patchFooter({ columns });
                          }}
                          placeholder="#products یا https://..."
                          dir="ltr"
                          maxLength={500}
                          className="flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const columns = [...(footer.columns ?? [])];
                            columns[ci] = { ...col, links: col.links.filter((_, j) => j !== li) };
                            patchFooter({ columns });
                          }}
                          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label="حذف لینک"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                    {col.links.length < 6 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full rounded-lg border border-dashed"
                        onClick={() => {
                          const columns = [...(footer.columns ?? [])];
                          columns[ci] = { ...col, links: [...col.links, { label: "", href: "#" }] };
                          patchFooter({ columns });
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        افزودن لینک
                      </Button>
                    ) : null}
                  </div>
                ))}
                {(footer.columns ?? []).length < 3 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full rounded-xl border-dashed"
                    onClick={() => patchFooter({ columns: [...(footer.columns ?? []), { title: "", links: [] }] })}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    افزودن ستون
                  </Button>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label>متن کپی‌رایت</Label>
                <Input
                  value={footer.copyright ?? ""}
                  onChange={(e) => patchFooter({ copyright: e.target.value })}
                  maxLength={200}
                  placeholder="خالی = «© سال — نام فروشگاه، تمامی حقوق محفوظ است»"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border p-3">
                <span className="text-sm font-semibold">نمایش نقشهٔ موقعیت</span>
                <Switch checked={footer.showMap} onCheckedChange={(v) => patchFooter({ showMap: v })} />
              </div>
              <div className="flex items-center justify-between rounded-xl border p-3">
                <span className="text-sm font-semibold">نمایش شبکه‌های اجتماعی</span>
                <Switch checked={footer.showSocials} onCheckedChange={(v) => patchFooter({ showSocials: v })} />
              </div>
              <div className="flex items-center justify-between rounded-xl border p-3">
                <span className="text-sm font-semibold">نمایش نوار «نرم‌افزار افق پلاس»</span>
                <Switch checked={footer.showPoweredBy !== false} onCheckedChange={(v) => patchFooter({ showPoweredBy: v })} />
              </div>
            </div>
          ) : null}

          {/* ═══ محصولات — عنوان بخش + راهنما ═══ */}
          {sectionId === "products" ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>عنوان بخش محصولات</Label>
                <Input
                  value={content.sections.productsTitle ?? ""}
                  onChange={(e) => onPatchContent({ sections: { ...content.sections, productsTitle: e.target.value } })}
                  maxLength={80}
                  placeholder="خالی = «همهٔ محصولات» (یا نام دستهٔ انتخابی)"
                />
              </div>
              <p className="rounded-xl border border-dashed p-3 text-xs leading-6 text-muted-foreground">
                خود کالاها، قیمت‌ها و موجودی از ماژول «کالا و خدمات» نرم‌افزار می‌آیند — برای افزودن یا ویرایش کالا به تب «کالاها» بروید.
                جستجو/فیلتر و صفحه‌بندی خودکار روی سایت فعال است.
              </p>
            </div>
          ) : null}

          {/* ═══ دسته‌بندی‌ها — نمایش/مخفی + راهنما ═══ */}
          {sectionId === "categories" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border p-3">
                <span className="text-sm font-semibold">نمایش بخش دسته‌بندی‌ها</span>
                <Switch
                  checked={content.sections.showCategories}
                  onCheckedChange={(v) => onPatchContent({ sections: { ...content.sections, showCategories: v } })}
                />
              </div>
              <p className="rounded-xl border border-dashed p-3 text-xs leading-6 text-muted-foreground">
                دسته‌ها به‌صورت خودکار از دستهٔ کالاهای شما ساخته می‌شوند — برای مدیریت دسته‌ها به تب «دسته‌بندی‌ها» بروید.
              </p>
            </div>
          ) : null}

          {/* ═══ نوار اعتماد — گزاره‌ها (هر خط یک گزاره) ═══ */}
          {sectionId === "trust" ? (
            <div className="space-y-1.5">
              <Label>گزاره‌های نوار اعتماد (هر خط یک گزاره)</Label>
              <Textarea
                value={(content.trustNotes ?? []).join("\n")}
                onChange={(e) =>
                  onPatchContent({
                    trustNotes: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .slice(0, 5),
                  })
                }
                rows={4}
                maxLength={480}
                placeholder={"ضمانت اصالت کالا\nارسال سریع به سراسر کشور\nپشتیبانی پاسخگو"}
              />
              <p className="text-xs text-muted-foreground">حداکثر ۵ گزاره — خالی بگذارید تا پیشنهاد خودکار صنف شما نمایش داده شود.</p>
            </div>
          ) : null}

          {sectionId === "sections" ? (
            <div className="space-y-2">
              {(
                [
                  ["showCategories", "دسته‌بندی‌ها"],
                  ["showFeatures", "ویژگی‌ها"],
                  ["showStats", "آمار"],
                  ["showAbout", "دربارهٔ ما"],
                  ["showTrustBar", "نوار اعتماد"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between rounded-xl border p-3">
                  <span className="text-sm font-semibold">{label}</span>
                  <Switch
                    checked={content.sections[key]}
                    onCheckedChange={(v) => onPatchContent({ sections: { ...content.sections, [key]: v } })}
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="sticky bottom-0 pt-2">
            <Button className="w-full rounded-xl" onClick={() => onOpenChange(false)}>
              {applyLabel}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
