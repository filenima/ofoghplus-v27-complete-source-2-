"use client";

// ═══════════════════════════════════════════════════════════════════
// R16 — ویرایشگر بصری فروشگاه: مالک سایتش را می‌بیند و روی هر بخش
// که کلیک کند همان‌جا ویرایشش می‌کند (متن/بنر/لینک/هدر/فوتر/بخش‌ها).
// ذخیره → PUT /api/storefront/manage (فیلد content) → همان لحظه در سایت عمومی.
// R17-C: فرم‌های ویرایش به components/storefront/section-editor-sheet.tsx
// منتقل شدند تا «ویرایش روی سایت» (?edit=1) هم دقیقاً همان تجربه را بدهد.
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  Loader2,
  Save,
  Eye,
  ExternalLink,
  RefreshCw,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import {
  buildDefaultContent,
  mergeStorefrontContent,
  getBusinessType,
  type StorefrontContent,
} from "@/lib/storefront-wizard";
import {
  StorefrontTemplateV2Renderer,
  type ShopDTOV2,
} from "@/components/storefront/templates-v2";
import { createNoopDiscovery } from "@/components/storefront/use-store-products";
import {
  StorefrontSectionEditorSheet,
  type StorefrontSectionId,
  type StorefrontShopInfoDraft,
} from "@/components/storefront/section-editor-sheet";
import { StorefrontRevisionsDialog } from "@/components/storefront/manage/revisions-dialog";
import type { StorefrontProductDTO } from "@/lib/storefront";

export function StorefrontVisualEditorTab({ shopSlug }: { shopSlug: string | null }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [shop, setShop] = React.useState<ShopDTOV2 | null>(null);
  const [products, setProducts] = React.useState<StorefrontProductDTO[]>([]);
  const [content, setContent] = React.useState<StorefrontContent | null>(null);
  const [bannerImage, setBannerImage] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<StorefrontSectionId | null>(null);
  // R26 — اطلاعات فروشگاه (نام/تماس/شبکه‌های اجتماعی) برای ویرایش هدر/فوتر
  const [shopInfo, setShopInfo] = React.useState<StorefrontShopInfoDraft | null>(null);
  // R26 — تاریخچهٔ تغییرات و بازگردانی
  const [historyOpen, setHistoryOpen] = React.useState(false);
  // پس از بازگردانی کلاسیک، محتوای تازه خوانده می‌شود
  const [restoreTick, setRestoreTick] = React.useState(0);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/storefront/manage");
      const json = await res.json().catch(() => null);
      if (!json?.success || !json.shop) {
        toast({ title: "فروشگاه یافت نشد", description: "ابتدا از تب «ساخت هوشمند» سایت بسازید", variant: "destructive" });
        setShop(null);
        return;
      }
      const s = json.shop;
      const shopDTO: ShopDTOV2 = {
        slug: s.slug,
        title: s.title,
        description: s.description,
        template: s.template,
        accentColor: s.accentColor,
        phone: s.phone,
        address: s.address,
        city: s.city,
        lat: s.lat,
        lng: s.lng,
        socialInstagram: s.socialInstagram,
        socialTelegram: s.socialTelegram,
        socialWhatsapp: s.socialWhatsapp,
        tenantName: s.tenantName ?? "",
        businessType: s.businessType ?? null,
        announcement: s.announcement ?? null,
        ticketEnabled: !!s.ticketEnabled,
      };
      setShop(shopDTO);
      setShopInfo({
        title: s.title ?? "",
        phone: s.phone ?? "",
        address: s.address ?? "",
        city: s.city ?? "",
        socialInstagram: s.socialInstagram ?? "",
        socialTelegram: s.socialTelegram ?? "",
        socialWhatsapp: s.socialWhatsapp ?? "",
      });
      const base = buildDefaultContent(s.businessType ?? "general", s.title, s.city);
      setContent(mergeStorefrontContent(base, s.content ?? null));
      setBannerImage(s.content?.banner?.image ?? null);
      // v20-C — کالاها از API مدیریت مالک (authFetch) — API عمومی وقتی فروشگاه
      // فعال نیست 404 می‌دهد و ویرایشگر کور می‌شد؛ این مسیر همیشه جواب می‌دهد.
      const pub = await authFetch("/api/storefront/manage/products", { cache: "no-store" });
      const pubJson = await pub.json().catch(() => null);
      if (pubJson?.success && Array.isArray(pubJson.products)) {
        setProducts(
          (pubJson.products as StorefrontProductDTO[]).slice(0, 12).map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description ?? null,
            imageUrl: p.imageUrl ?? null,
            priceRial: String(p.priceRial ?? "0"),
            inStock: p.inStock !== false,
            stockKnown: !!p.stockKnown,
            category: p.category ?? null,
          }))
        );
      }
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void load();
  }, [load, restoreTick]);

  // دسته‌ها از کالاهای بارگذاری‌شده — همیشه صدا زده می‌شود (قانون هوک‌ها)
  const categories = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const c = p.category?.trim();
      if (c) map.set(c, (map.get(c) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, count]) => ({ name, count })).slice(0, 8);
  }, [products]);

  async function save() {
    if (!content) return;
    setSaving(true);
    try {
      const payload: Partial<StorefrontContent> & Record<string, unknown> = {
        ...content,
        banner: { ...content.banner, image: bannerImage },
        ...(shopInfo
          ? {
              title: shopInfo.title,
              phone: shopInfo.phone,
              address: shopInfo.address,
              city: shopInfo.city,
              socialInstagram: shopInfo.socialInstagram,
              socialTelegram: shopInfo.socialTelegram,
              socialWhatsapp: shopInfo.socialWhatsapp,
            }
          : {}),
      };
      const res = await authFetch("/api/storefront/manage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: payload }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ذخیره ناموفق", description: json?.error, variant: "destructive" });
        return;
      }
      toast({ title: "ذخیره شد", description: "تغییرات همین حالا در سایت عمومی شما اعمال شده است" });
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function patchContent(patch: Partial<StorefrontContent>) {
    setContent((c) => (c ? { ...c, ...patch } : c));
  }

  function patchShopInfo(patch: Partial<StorefrontShopInfoDraft>) {
    setShopInfo((s) => (s ? { ...s, ...patch } : s));
  }

  /** R26 — آپلود رسانه (لوگو) از پنل */
  async function uploadMedia(file: File, kind: "image" | "video"): Promise<string | null> {
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      const res = await authFetch("/api/storefront/manage/media", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "آپلود ناموفق", description: json?.error, variant: "destructive" });
        return null;
      }
      return json.url as string;
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
      return null;
    }
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }

  if (!shop || !content) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        برای ویرایش بصری، ابتدا از تب «ساخت هوشمند» سایت فروشگاه خود را بسازید.
      </div>
    );
  }

  const cfg = getBusinessType(shop.businessType);
  const bannerSrc = bannerImage ?? (cfg ? `/banners/${cfg.banner}.avif` : "/banners/general.avif");
  // v20-C — قالب پیش‌فرض آرورا هم حالت ویرایش کلیکی دارد (مثل ۵ قالب سینمایی)
  // R24-4 — قالب‌های پرمیوم هم ویرایش کلیکی دارند (همان رندرر v2)
  const v2Ids = new Set(["aurora", "sabzineh", "rose", "firouzeh", "kahroba", "bazaarpro", "aurora-pro", "bazaar-luxe", "dark-neon"]);
  const templateIsV2 = v2Ids.has(shop.template);

  return (
    <div className="space-y-4">
      {/* نوار ابزار */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-muted/40 p-3">
        <Badge variant="outline" className="gap-1.5 rounded-full">
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          حالت ویرایش بصری
        </Badge>
        <span className="text-xs text-muted-foreground">روی دکمهٔ «ویرایش» هر بخش کلیک کنید</span>
        <div className="mr-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="gap-1.5 rounded-full">
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            تاریخچهٔ تغییرات
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5 rounded-full">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            بازخوانی
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving} className="gap-1.5 rounded-full">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
            ذخیرهٔ تغییرات
          </Button>
          <a
            href={`/shop/${shop.slug}?edit=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors hover:bg-muted"
            title="سایت خود را با حالت ویرایش مالک باز کنید"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            ویرایش روی سایت
          </a>
          <a href={`/shop/${shop.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors hover:bg-muted">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            سایت زنده
          </a>
        </div>
      </div>

      {/* پیش‌نمایش زنده */}
      <div className="overflow-hidden rounded-3xl border-4 border-dashed border-amber-300/70 shadow-lg">
        <div className="origin-top scale-[0.92] sm:scale-100">
          {templateIsV2 ? (
            <StorefrontTemplateV2Renderer
              shop={{
                ...shop,
                // R26 — ویرایش نام/تماس/شبکه‌ها همان لحظه در پیش‌نمایش دیده می‌شود
                ...(shopInfo
                  ? {
                      title: shopInfo.title || shop.title,
                      phone: shopInfo.phone,
                      address: shopInfo.address,
                      city: shopInfo.city,
                      socialInstagram: shopInfo.socialInstagram,
                      socialTelegram: shopInfo.socialTelegram,
                      socialWhatsapp: shopInfo.socialWhatsapp,
                    }
                  : {}),
              }}
              products={products}
              categories={categories}
              content={content}
              bannerSrc={bannerSrc}
              cartCount={0}
              qtyOf={() => 0}
              onAddToCart={() => undefined}
              onOpenCart={() => undefined}
              onOpenAuth={() => undefined}
              onOpenOrders={() => undefined}
              onOpenProduct={() => undefined}
              onOpenTicket={() => undefined}
              customerName={null}
              discovery={createNoopDiscovery(products)}
              currency="IRT"
              editMode
              onEditSection={(id) => setEditing(id as StorefrontSectionId)}
            />
          ) : (
            <div className="bg-card p-10 text-center text-sm text-muted-foreground">
              ویرایش بصری برای قالب‌های سینمایی فعال است — قالب فعلی شما «{shop.template}» از نسل قبل است.
              از تب «ساخت هوشمند» یکی از قالب‌های جدید را انتخاب کنید تا ویرایش کلیکی فعال شود.
            </div>
          )}
        </div>
      </div>

      {/* شیت ویرایش بخش — مشترک با ویرایش روی سایت */}
      <StorefrontSectionEditorSheet
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        sectionId={editing}
        content={content}
        onPatchContent={patchContent}
        bannerImage={bannerImage}
        onBannerImage={setBannerImage}
        shopInfo={shopInfo}
        onPatchShopInfo={patchShopInfo}
        onUploadMedia={uploadMedia}
        applyLabel="اعمال در پیش‌نمایش"
      />

      {/* R26 — تاریخچهٔ تغییرات و بازگردانی */}
      <StorefrontRevisionsDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onRestored={(kind) => {
          if (kind === "content") setRestoreTick((t) => t + 1);
        }}
      />
    </div>
  );
}
