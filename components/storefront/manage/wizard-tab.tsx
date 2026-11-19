"use client";

// ═══════════════════════════════════════════════════════════════════
// R16 — ویزارد سایت‌ساز هوشمند (تب «ساخت هوشمند» ماژول فروشگاه)
// اطلاعات کسب‌وکار را می‌گیرد → کل سایت اتومات برای بیزینسش کاستومایز
// می‌شود: قالب + بنر + متن‌ها + دسته‌بندی خودکار کالاها + سئو + اسلاگ/دامنه.
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import {
  Loader2,
  Sparkles,
  Wand2,
  Globe,
  Check,
  X,
  RefreshCw,
  Info,
  Crown,
  ShieldCheck,
  ShieldX,
  Store as StoreIcon,
  BadgeCheck,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits } from "@/lib/persian";
import { getPlanName } from "@/lib/plans-static";
import { STOREFRONT_TEMPLATES_V2 } from "@/lib/storefront-wizard";

// Task 1-a — وضعیت دسترسی فعال‌سازی عمومی (از GET /api/storefront/manage → access)
export interface StorefrontAccessInfo {
  allowed: boolean;
  reason: "plan_ok" | "override_granted" | "override_denied" | "master_off" | "plan_required";
  plan?: string;
}

interface BizType {
  id: string;
  label: string;
  recommendedTemplate: string;
  altTemplates: string[];
  banner: string;
  defaultCategories: string[];
  trustNotes: string[];
}

interface WizardPreview {
  businessType: string;
  businessTypeLabel: string;
  template: string;
  alternativeTemplates: string[];
  slug: string;
  slugCandidates: string[];
  domainCandidates: string[];
  content: {
    banner: { badge: string; title: string; subtitle: string; ctaLabel: string };
    announcement: string;
    defaultCategories?: string[];
  };
  seoTitle: string;
  seoDescription: string;
  banner: string;
  defaultCategories: string[];
}

interface DomainsInfo {
  slugCandidates: { slug: string; available: boolean }[];
  domainCandidates: { domain: string; available: boolean | null; note: string }[];
  customDomainHint?: string;
}

export function StorefrontWizardTab({
  onDone,
  shopSlug,
  wizardDone,
  access,
}: {
  onDone?: () => void;
  shopSlug?: string | null;
  wizardDone?: boolean;
  /** Task 1-a — وضعیت دسترسی فعال‌سازی عمومی (پلن/ویژه/مسدود) از GET manage */
  access?: StorefrontAccessInfo | null;
}) {
  const { toast } = useToast();

  const [loading, setLoading] = React.useState(true);
  const [bizTypes, setBizTypes] = React.useState<BizType[]>([]);
  const [bizType, setBizType] = React.useState<string>("");
  const [bizName, setBizName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [template, setTemplate] = React.useState<string>("");
  const [slug, setSlug] = React.useState("");
  const [slugCandidates, setSlugCandidates] = React.useState<string[]>([]);
  const [preview, setPreview] = React.useState<WizardPreview | null>(null);
  const [domains, setDomains] = React.useState<DomainsInfo | null>(null);
  const [checkingDomains, setCheckingDomains] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [applied, setApplied] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/storefront/manage/wizard");
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (json?.success) {
          setBizTypes(json.businessTypes ?? []);
          if (json.current?.businessType) setBizType(json.current.businessType);
          if (json.current?.slug) setSlug(json.current.slug);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runPreview() {
    if (!bizType) {
      toast({ title: "نوع کسب‌وکار را انتخاب کنید", variant: "destructive" });
      return;
    }
    if (bizName.trim().length < 2) {
      toast({ title: "نام کسب‌وکار را کامل وارد کنید", variant: "destructive" });
      return;
    }
    setPreviewing(true);
    try {
      const res = await authFetch("/api/storefront/manage/wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessType: bizType,
          businessName: bizName.trim(),
          city: city.trim() || undefined,
          phone: phone.trim() || undefined,
          template: template || undefined,
          slug: slug.trim() || undefined,
          preview: true,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "خطا در ساخت پیش‌نمایش", description: json?.error, variant: "destructive" });
        return;
      }
      setPreview(json.preview);
      setSlugCandidates(json.preview.slugCandidates ?? []);
      setSlug(json.preview.slug);
      if (!template) setTemplate(json.preview.template);
      // بررسی دامنه‌ها
      void checkDomains();
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  }

  async function checkDomains() {
    if (bizName.trim().length < 2 || !bizType) return;
    setCheckingDomains(true);
    try {
      const res = await authFetch(
        `/api/storefront/manage/domains?name=${encodeURIComponent(bizName.trim())}&type=${encodeURIComponent(bizType)}`
      );
      const json = await res.json().catch(() => null);
      if (json?.success) setDomains(json);
    } catch {
      /* ignore */
    } finally {
      setCheckingDomains(false);
    }
  }

  async function apply() {
    if (!bizType || bizName.trim().length < 2) return;
    setApplying(true);
    try {
      const res = await authFetch("/api/storefront/manage/wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessType: bizType,
          businessName: bizName.trim(),
          city: city.trim() || undefined,
          phone: phone.trim() || undefined,
          template: template || undefined,
          slug: slug.trim() || undefined,
          applyCategories: true,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "خطا در ساخت سایت", description: json?.error, variant: "destructive" });
        return;
      }
      setApplied(true);
      toast({
        title: "سایت فروشگاه شما ساخته شد",
        description:
          json.categorize && json.categorize.assigned > 0
            ? `${toPersianDigits(json.categorize.assigned)} کالای شما هم خودکار دسته‌بندی شد`
            : "کل تنظیمات به‌صورت هوشمند برای کسب‌وکار شما انجام شد",
      });
      onDone?.();
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  }

  const templateOptions = React.useMemo(() => {
    // R19: آرورا همیشه اول فهرست است (قالب پیش‌فرض digizlux v5) + پیشنهادی/جایگزین‌های صنف
    // R24-4: ۳ قالب پرمیوم همیشه آخر فهرست‌اند (با نشان تاج)
    const aurora = STOREFRONT_TEMPLATES_V2.find((t) => t.id === "aurora");
    const premium = STOREFRONT_TEMPLATES_V2.filter((t) => t.premium);
    const base = !bizType
      ? [aurora, ...STOREFRONT_TEMPLATES_V2.filter((t) => t.id !== "aurora" && !t.premium).slice(0, 4)]
      : (() => {
          const cfg = bizTypes.find((b) => b.id === bizType);
          if (!cfg) {
            return [aurora, ...STOREFRONT_TEMPLATES_V2.filter((t) => t.id !== "aurora" && !t.premium).slice(0, 4)];
          }
          const ids = new Set([cfg.recommendedTemplate, ...cfg.altTemplates, "aurora"]);
          return STOREFRONT_TEMPLATES_V2.filter((t) => ids.has(t.id));
        })();
    return [...base.filter(Boolean), ...premium];
  }, [bizType, bizTypes]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {wizardDone && !applied ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <BadgeCheck className="h-4 w-4" aria-hidden="true" />
          سایت شما قبلاً با ویزارد ساخته شده — با اجرای مجدد، تنظیمات هوشمند به‌روز می‌شود.
          {shopSlug ? <a href={`/shop/${shopSlug}`} target="_blank" rel="noopener noreferrer" className="mr-auto text-xs underline">مشاهدهٔ سایت ({shopSlug})</a> : null}
        </div>
      ) : null}

      {/* گام ۱: نوع کسب‌وکار */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">۱</span>
            نوع کسب‌وکار شما چیست؟
            <span className="text-xs font-normal text-muted-foreground">— سایت دقیقاً برای همین کاستومایز می‌شود</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {bizTypes.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setBizType(b.id);
                  setTemplate(b.recommendedTemplate);
                  setPreview(null);
                }}
                aria-pressed={bizType === b.id}
                className={`group relative overflow-hidden rounded-2xl border-2 text-right transition-all ${
                  bizType === b.id ? "border-primary shadow-lg" : "border-transparent hover:border-primary/40"
                }`}
              >
                <div className="relative h-16 w-full">
                  {/* آپلود عمومی — بنر پیش‌نمایش هر صنف */}
                  <img src={b.banner} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" aria-hidden="true" />
                  {bizType === b.id ? (
                    <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  ) : null}
                </div>
                <div className="bg-card px-3 py-2">
                  <span className="block text-xs font-extrabold">{b.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground line-clamp-1">
                    {b.defaultCategories.slice(0, 3).join("، ")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* گام ۲: اطلاعات پایه */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">۲</span>
            اطلاعات کسب‌وکار
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="wz-name">نام کسب‌وکار / برند *</Label>
            <Input id="wz-name" value={bizName} onChange={(e) => { setBizName(e.target.value); setPreview(null); }} placeholder="مثلاً: فروشگاه موبایل پارس" maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wz-city">شهر</Label>
            <Input id="wz-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="مثلاً: تهران" maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wz-phone">شماره تماس</Label>
            <Input id="wz-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="۰۲۱۱۲۳۴۵۶۷۸" dir="ltr" maxLength={30} />
          </div>
        </CardContent>
      </Card>

      {/* گام ۳: قالب */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">۳</span>
            قالب سایت — ۸ طرح سینمایی و پرمیوم
            <span className="text-xs font-normal text-muted-foreground">(پیشنهاد ما بر اساس نوع کسب‌وکار شما مشخص می‌شود — طرح‌های تاج‌دار پرمیوم‌اند)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {templateOptions.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplate(t.id)}
                aria-pressed={template === t.id}
                className={`rounded-2xl border-2 p-3 text-right transition-all ${
                  template === t.id ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/40"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-extrabold">{t.label}</span>
                  {t.premium ? (
                    <Badge className="gap-1 rounded-full border border-amber-300 bg-amber-100 text-[10px] text-amber-800 hover:bg-amber-100">
                      <Crown className="h-3 w-3" aria-hidden="true" />
                      پرمیوم
                    </Badge>
                  ) : i === 0 ? (
                    <Badge className="gap-1 rounded-full text-[10px]">
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      پیشنهاد ما
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground line-clamp-2">{t.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* گام ۴: آدرس سایت */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">۴</span>
            آدرس سایت شما
            <span className="text-xs font-normal text-muted-foreground">— کوتاه و متناسب با برندتان</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="wz-slug">نام فروشگاه (آدرس کوتاه لاتین)</Label>
            <div className="flex items-center gap-2">
              <Input id="wz-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="my-shop" dir="ltr" className="font-mono" />
              <Button type="button" variant="outline" size="sm" onClick={() => void checkDomains()} disabled={checkingDomains} className="gap-1.5 shrink-0">
                {checkingDomains ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Search className="h-3.5 w-3.5" aria-hidden="true" />}
                بررسی آزاد بودن
              </Button>
            </div>
            {slugCandidates.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-semibold text-muted-foreground">پیشنهاد کوتاه:</span>
                {(domains?.slugCandidates ?? slugCandidates.map((s) => ({ slug: s, available: true }))).map((s) => (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => setSlug(s.slug)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold font-mono transition-colors ${
                      slug === s.slug ? "bg-primary text-primary-foreground" : s.available === false ? "bg-muted text-muted-foreground line-through" : "bg-primary/10 text-primary hover:bg-primary/20"
                    }`}
                  >
                    {s.slug}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {domains?.domainCandidates?.length ? (
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                دامنه‌های اختصاصی پیشنهادی (برای وقتی که دامنهٔ خودتان را می‌خواهید)
              </p>
              <ul className="mt-2 space-y-1.5">
                {domains.domainCandidates.map((d) => (
                  <li key={d.domain} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono" dir="ltr">{d.domain}</span>
                    {d.available === true ? (
                      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700">احتمالاً آزاد</Badge>
                    ) : d.available === false ? (
                      <Badge variant="outline" className="border-red-300 bg-red-50 text-[10px] text-red-600">ثبت شده</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">نامشخص</Badge>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{domains.customDomainHint ?? ""}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* دکمه اجرا + پیش‌نمایش */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void runPreview()} disabled={previewing} className="gap-2 rounded-xl" size="lg">
          {previewing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />}
          پیش‌نمایش پیکربندی هوشمند
        </Button>
        {preview ? (
          <Button onClick={() => void apply()} disabled={applying} className="gap-2 rounded-xl" size="lg" variant="default">
            {applying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            ساخت نهایی سایت من
          </Button>
        ) : null}
        {preview ? (
          <a href={`/shop/${slug || preview.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
            <StoreIcon className="h-4 w-4" aria-hidden="true" />
            مشاهدهٔ زندهٔ سایت
          </a>
        ) : null}
      </div>

      {/* پیش‌نمایش پیکربندی */}
      {preview ? (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              پیکربندی هوشمند برای «{preview.businessTypeLabel}»
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border">
                <div className="relative h-32">
                  <img src={preview.banner} alt="بنر فروشگاه" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-black/20" aria-hidden="true" />
                  <div className="absolute bottom-3 right-3 left-3 text-white">
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold backdrop-blur">{preview.content.banner.badge}</span>
                    <p className="mt-1.5 text-sm font-black leading-snug">{preview.content.banner.title}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <p><span className="font-bold">عنوان سئو:</span> <span className="text-muted-foreground">{preview.seoTitle}</span></p>
                <p className="line-clamp-2"><span className="font-bold">توضیح سئو:</span> <span className="text-muted-foreground">{preview.seoDescription}</span></p>
                <p><span className="font-bold">نوار اعلان:</span> <span className="text-muted-foreground">{preview.content.announcement}</span></p>
                <p><span className="font-bold">دسته‌های خودکار:</span> <span className="text-muted-foreground">{preview.defaultCategories.join("، ")}</span></p>
              </div>
            </div>
            <Separator />
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              کالاهای ثبت‌شدهٔ شما در نرم‌افزار حسابداری، خودکار در سایت نمایش داده می‌شوند و اگر دسته نداشته باشند،
              <strong> دسته‌بندی خودکار</strong> بر اساس نام کالا برایشان انجام می‌شود. هر چیزی که بعداً در نرم‌افزار ویرایش کنید، همان لحظه در سایت هم به‌روز می‌شود.
            </p>
            {access ? (
              access.allowed ? (
                access.reason === "override_granted" ? (
                  <p className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs leading-6 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      <strong>دسترسی ویژه فعال شده توسط مدیر</strong> — می‌توانید فروشگاه را عمومی کنید.
                    </span>
                  </p>
                ) : (
                  <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-6 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    فروشگاه شما با پلن {access.plan ? getPlanName(access.plan) : "فعلی"} فعال است — بعد از ساخت، از تب «تنظیمات» عمومی‌اش کنید.
                  </p>
                )
              ) : access.reason === "plan_required" ? (
                <p className="flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs leading-6 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300">
                  <Crown className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  فعال‌سازی عمومی در پلن‌های حرفه‌ای و سازمانی فعال است — می‌توانید سایت را بسازید و پیش‌نمایش ببینید.
                </p>
              ) : access.reason === "override_denied" ? (
                <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-6 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                  <ShieldX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  دسترسی فروشگاه آنلاین برای این حساب توسط مدیر سیستم مسدود شده است — می‌توانید سایت را بسازید و پیش‌نمایش ببینید، اما عمومی‌سازی ممکن نیست.
                </p>
              ) : (
                <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  فروشگاه آنلاین موقتاً توسط مدیر سیستم غیرفعال است — سایت ساخته می‌شود و بعد از فعال‌سازی سامانه قابل انتشار است.
                </p>
              )
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {applied ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Check className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="text-lg font-black text-emerald-900">سایت فروشگاه شما ساخته شد</p>
          <p className="max-w-md text-sm leading-7 text-emerald-800">
            از تب «تنظیمات» می‌توانید کارت پرداخت و آدرس و نقشه را کامل کنید و سایت را عمومی کنید.
            همه‌چیز — بنر، متن‌ها، دسته‌ها، سئو — از الان مختص کسب‌وکار شماست.
          </p>
          {slug ? (
            <a href={`/shop/${slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90">
              <StoreIcon className="h-4 w-4" aria-hidden="true" />
              بازکردن سایت من
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
