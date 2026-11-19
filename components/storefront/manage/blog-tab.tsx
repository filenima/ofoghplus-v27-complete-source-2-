"use client";

// ═══ Task 3-g — تب مدیریت بلاگ فروشگاه (سمت مالک) ═══
// قرارداد (همان الگوی ReviewsTab): export function BlogTab({ slug, onChanged })
// مالک از اینجا مقاله می‌نویسد/منتشر می‌کند → سایت عمومی‌اش /shop/{slug}/blog
// محتوا با RichContentEditor (ویرایشگر غنی سبک موجود) ساخته می‌شود و کاور
// از همان مسیر آپلود رسانهٔ ویرایشگر سایت (‎/api/storefront/manage/media).

import * as React from "react";
import {
  Loader2,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  Upload,
  Images,
  Newspaper,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RichContentEditor } from "@/components/ui/rich-content-editor";
import { FileManagerDialog } from "@/components/file-manager-dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch, getAuthToken } from "@/lib/auth-fetch";
import { toPersianDigits, formatJalaliDayLabel } from "@/lib/persian";

export interface BlogTabProps {
  slug: string;
  onChanged?: () => void;
}

interface ManagePost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImage: string | null;
  status: string;
  publishedAt: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PostCounts {
  ALL: number;
  DRAFT: number;
  PUBLISHED: number;
}

interface PostForm {
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string;
  content: string;
}

const EMPTY_FORM: PostForm = { title: "", slug: "", excerpt: "", coverImage: "", content: "" };

const STATUS_FA: Record<string, string> = {
  DRAFT: "پیش‌نویس",
  PUBLISHED: "منتشرشده",
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "border-amber-300 bg-amber-50 text-amber-700",
  PUBLISHED: "border-emerald-300 bg-emerald-50 text-emerald-700",
};

export function BlogTab({ slug, onChanged }: BlogTabProps) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [statusTab, setStatusTab] = React.useState("ALL");
  const [posts, setPosts] = React.useState<ManagePost[]>([]);
  const [counts, setCounts] = React.useState<PostCounts | null>(null);
  const [totalViews, setTotalViews] = React.useState(0);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // ── شیت ویرایش ──
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null); // null = مقالهٔ جدید
  const [form, setForm] = React.useState<PostForm>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [coverUploading, setCoverUploading] = React.useState(false);
  const [fileManagerOpen, setFileManagerOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ManagePost | null>(null);
  const coverInputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res = await authFetch(
        `/api/storefront/manage/posts${status !== "ALL" ? `?status=${status}` : ""}`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => null);
      if (json?.success) {
        setPosts(json.posts ?? []);
        setCounts(json.counts ?? null);
        setTotalViews(
          Array.isArray(json.posts)
            ? (json.posts as ManagePost[]).reduce((sum, p) => sum + (p.viewCount ?? 0), 0)
            : 0
        );
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load(statusTab);
  }, [load, statusTab]);

  /** شیت ساخت مقالهٔ جدید */
  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  }

  /** شیت ویرایش — محتوای کامل از GET /posts/[id] */
  async function openEdit(post: ManagePost) {
    setBusyId(post.id);
    try {
      const res = await authFetch(`/api/storefront/manage/posts/${post.id}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "خطا", description: json?.error || "دریافت مقاله ناموفق بود", variant: "destructive" });
        return;
      }
      const p = json.post as {
        title: string; slug: string; excerpt: string | null; coverImage: string | null; content: string;
      };
      setEditingId(post.id);
      setForm({
        title: p.title ?? "",
        slug: p.slug ?? "",
        excerpt: p.excerpt ?? "",
        coverImage: p.coverImage ?? "",
        content: p.content ?? "",
      });
      setEditorOpen(true);
    } catch {
      toast({ title: "خطای شبکه", description: "دوباره تلاش کنید", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  /** آپلود کاور از همان مسیر رسانهٔ ویرایشگر سایت (AVIF خودکار) */
  async function uploadCover(file: File) {
    setCoverUploading(true);
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
      setForm((f) => ({ ...f, coverImage: json.url as string }));
      toast({ title: "تصویر شاخص آپلود شد" });
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setCoverUploading(false);
    }
  }

  /** ذخیره (پیش‌نویس یا انتشار) — POST برای جدید، PATCH برای ویرایش */
  async function save(publish: boolean) {
    const title = form.title.trim();
    if (title.length < 2) {
      toast({ title: "عنوان لازم است", description: "حداقل ۲ نویسه بنویسید", variant: "destructive" });
      return;
    }
    if (publish && !form.content.trim()) {
      toast({ title: "محتوا خالی است", description: "برای انتشار، متن مقاله را بنویسید", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title,
        ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
        excerpt: form.excerpt.trim(),
        coverImage: form.coverImage.trim(),
        content: form.content,
        publish,
      };
      const res = await authFetch(
        editingId ? `/api/storefront/manage/posts/${editingId}` : "/api/storefront/manage/posts",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "ذخیره ناموفق", description: json?.error || "دوباره تلاش کنید", variant: "destructive" });
        return;
      }
      toast({
        title: publish ? "مقاله منتشر شد" : "ذخیره شد",
        description: publish
          ? "همین حالا در بلاگ سایت شما دیده می‌شود و به موتورهای جستجو اطلاع داده می‌شود"
          : "پیش‌نویس ذخیره شد — هر وقت خواستید منتشر کنید",
      });
      setEditorOpen(false);
      onChanged?.();
      void load(statusTab);
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  /** انتشار/لغو انتشار سریع از لیست */
  async function togglePublish(post: ManagePost) {
    setBusyId(post.id);
    try {
      const res = await authFetch(`/api/storefront/manage/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(post.status === "PUBLISHED" ? { unpublish: true } : { publish: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "خطا", description: json?.error || "تغییر وضعیت ناموفق بود", variant: "destructive" });
        return;
      }
      toast({
        title: post.status === "PUBLISHED" ? "از انتشار خارج شد" : "منتشر شد",
        description:
          post.status === "PUBLISHED"
            ? "مقاله دیگر در سایت عمومی نمایش داده نمی‌شود"
            : "مقاله در بلاگ سایت شما منتشر شد",
      });
      onChanged?.();
      void load(statusTab);
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function removePost(id: string) {
    setBusyId(id);
    try {
      const res = await authFetch(`/api/storefront/manage/posts/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: "خطا", description: json?.error || "حذف ناموفق بود", variant: "destructive" });
        return;
      }
      toast({ title: "مقاله حذف شد" });
      setDeleteTarget(null);
      onChanged?.();
      void load(statusTab);
    } catch {
      toast({ title: "خطای شبکه", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  const liveUrl = (postSlug: string) =>
    slug ? `/shop/${encodeURIComponent(slug)}/blog/${encodeURIComponent(postSlug)}` : null;

  if (loading && !counts) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── آمار + دکمهٔ مقالهٔ جدید ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-violet-200 bg-violet-50/60">
          <CardContent className="flex flex-col items-center justify-center p-4 text-center">
            <span className="inline-flex items-center gap-1.5 text-3xl font-black tabular-nums text-violet-700">
              <Newspaper className="h-5 w-5" aria-hidden="true" />
              {toPersianDigits(counts?.ALL ?? 0)}
            </span>
            <p className="mt-1 text-xs font-bold text-violet-700">همهٔ مقاله‌ها</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black tabular-nums text-emerald-600">{toPersianDigits(counts?.PUBLISHED ?? 0)}</p>
            <p className="mt-1 text-xs font-bold text-muted-foreground">منتشرشده</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black tabular-nums text-amber-600">{toPersianDigits(counts?.DRAFT ?? 0)}</p>
            <p className="mt-1 text-xs font-bold text-muted-foreground">پیش‌نویس</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black tabular-nums">{toPersianDigits(totalViews)}</p>
            <p className="mt-1 text-xs font-bold text-muted-foreground">بازدید مقاله‌ها</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="ALL">همه ({toPersianDigits(counts?.ALL ?? 0)})</TabsTrigger>
            <TabsTrigger value="PUBLISHED">منتشرشده ({toPersianDigits(counts?.PUBLISHED ?? 0)})</TabsTrigger>
            <TabsTrigger value="DRAFT">پیش‌نویس ({toPersianDigits(counts?.DRAFT ?? 0)})</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button onClick={openCreate} className="gap-1.5 rounded-full">
          <Plus className="h-4 w-4" aria-hidden="true" />
          مقالهٔ جدید
        </Button>
      </div>

      {/* ── لیست مقاله‌ها ── */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Newspaper className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold">هنوز مقاله‌ای ندارید</p>
          <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
            با نوشتن مقاله دربارهٔ محصولات و تخصصتان، مشتریان بیشتری از گوگل پیدا می‌کنید — اولین مقاله را همین حالا بنویسید.
          </p>
          <Button onClick={openCreate} className="mt-3 gap-1.5 rounded-full" size="sm">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            نوشتن اولین مقاله
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {posts.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  {/* کاور کوچک */}
                  <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl border bg-muted">
                    {p.coverImage ? (
                      <img src={p.coverImage} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <FileText className="h-6 w-6 text-muted-foreground/40" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold">{p.title}</span>
                      <Badge variant="outline" className={STATUS_COLOR[p.status] ?? ""}>
                        {STATUS_FA[p.status] ?? p.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {formatJalaliDayLabel(p.publishedAt ?? p.createdAt)}
                      </span>
                      <span>{toPersianDigits(p.viewCount)} بازدید</span>
                    </div>
                    {p.excerpt ? (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{p.excerpt}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void openEdit(p)}
                    disabled={busyId === p.id}
                    className="gap-1.5 rounded-full"
                  >
                    {busyId === p.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    ویرایش
                  </Button>
                  {p.status === "PUBLISHED" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void togglePublish(p)}
                        disabled={busyId === p.id}
                        className="gap-1.5 rounded-full"
                      >
                        <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                        لغو انتشار
                      </Button>
                      {liveUrl(p.slug) ? (
                        <a
                          href={liveUrl(p.slug) as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors hover:border-primary/50 hover:text-primary"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          مشاهده در سایت
                        </a>
                      ) : null}
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => void togglePublish(p)}
                      disabled={busyId === p.id}
                      className="gap-1.5 rounded-full"
                    >
                      {busyId === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      انتشار
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteTarget(p)}
                    disabled={busyId === p.id}
                    className="gap-1.5 rounded-full text-red-600 hover:text-red-700"
                    aria-label={`حذف مقالهٔ ${p.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    حذف
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ═══ شیت ویرایشگر مقاله ═══ */}
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent dir="rtl" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-3xl">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle className="text-right">
              {editingId ? "ویرایش مقاله" : "مقالهٔ جدید"}
            </SheetTitle>
            <SheetDescription className="text-right">
              {editingId
                ? "تغییرات بعد از انتشار، همان لحظه در سایت شما اعمال می‌شود"
                : "عنوان و محتوا را بنویسید — آدرس (اسلاگ) خودکار از عنوان ساخته می‌شود"}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 px-6 py-5">
            {/* عنوان */}
            <div className="space-y-1.5">
              <Label>عنوان مقاله *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="مثلاً: راهنمای انتخاب گوشی مناسب بودجهٔ شما"
                maxLength={150}
              />
            </div>

            {/* آدرس (اختیاری) */}
            <div className="space-y-1.5">
              <Label>آدرس مقاله (اختیاری — خودکار از عنوان)</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="مثلاً: rahnamaye-goushie-kharid"
                dir="ltr"
                className="text-left"
              />
              {slug && form.slug.trim() ? (
                <p className="text-[11px] text-muted-foreground" dir="ltr">
                  /shop/{slug}/blog/{form.slug.trim()}
                </p>
              ) : null}
            </div>

            {/* خلاصه */}
            <div className="space-y-1.5">
              <Label>خلاصهٔ مقاله (سئو — در گوگل و کارت بلاگ نمایش داده می‌شود)</Label>
              <Textarea
                value={form.excerpt}
                onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
                rows={2}
                maxLength={300}
                placeholder="در ۱ یا ۲ جمله بگویید مقاله دربارهٔ چیست…"
              />
            </div>

            {/* تصویر شاخص */}
            <div className="space-y-1.5">
              <Label>تصویر شاخص</Label>
              <div className="flex flex-wrap items-center gap-2">
                {form.coverImage ? (
                  <div className="relative h-16 w-28 overflow-hidden rounded-xl border">
                    <img src={form.coverImage} alt="پیش‌نمایش کاور" className="h-full w-full object-cover" />
                  </div>
                ) : null}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadCover(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-full"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverUploading}
                >
                  {coverUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  آپلود تصویر
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-full"
                  onClick={() => setFileManagerOpen(true)}
                >
                  <Images className="h-3.5 w-3.5" aria-hidden="true" />
                  از گالری فایل‌ها
                </Button>
                {form.coverImage ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-full text-red-600"
                    onClick={() => setForm((f) => ({ ...f, coverImage: "" }))}
                  >
                    حذف تصویر
                  </Button>
                ) : null}
              </div>
              <Input
                value={form.coverImage}
                onChange={(e) => setForm((f) => ({ ...f, coverImage: e.target.value }))}
                placeholder="یا آدرس تصویر (https://…)"
                dir="ltr"
                className="text-left text-xs"
              />
            </div>

            <Separator />

            {/* محتوا — ویرایشگر غنی سبک (سبک همان توضیحات کالا) */}
            <div className="space-y-1.5">
              <Label>محتوای مقاله</Label>
              <RichContentEditor
                value={form.content}
                onChange={(html) => setForm((f) => ({ ...f, content: html }))}
                placeholder="متن کامل مقاله — سرتیتر، لیست، تصویر و لینک اضافه کنید…"
                minHeight={360}
              />
            </div>
          </div>

          <SheetFooter className="flex-row flex-wrap items-center justify-start gap-2 border-t px-6 py-4">
            <Button onClick={() => void save(true)} disabled={saving} className="gap-1.5 rounded-full">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
              {editingId && posts.find((p) => p.id === editingId)?.status === "PUBLISHED"
                ? "ذخیره و انتشار"
                : "انتشار در سایت"}
            </Button>
            <Button
              onClick={() => void save(false)}
              disabled={saving}
              variant="outline"
              className="gap-1.5 rounded-full"
            >
              ذخیرهٔ پیش‌نویس
            </Button>
            <Button variant="ghost" className="rounded-full" onClick={() => setEditorOpen(false)} disabled={saving}>
              بستن
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* گالری فایل‌ها برای انتخاب کاور */}
      <FileManagerDialog
        open={fileManagerOpen}
        onOpenChange={setFileManagerOpen}
        token={getAuthToken() ?? ""}
        currentUrl={form.coverImage || null}
        title="انتخاب تصویر شاخص"
        onSelect={(url) => {
          setForm((f) => ({ ...f, coverImage: url }));
          setFileManagerOpen(false);
        }}
      />

      {/* ── تأیید حذف ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف مقاله</AlertDialogTitle>
            <AlertDialogDescription>
              مقالهٔ «{deleteTarget?.title ?? ""}» برای همیشه حذف می‌شود و از نتایج گوگل نیز خارج خواهد شد. این عمل قابل
              بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && void removePost(deleteTarget.id)}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              حذف قطعی
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default BlogTab;
