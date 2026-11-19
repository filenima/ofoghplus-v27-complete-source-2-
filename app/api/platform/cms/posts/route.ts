import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { cacheDeleteByPrefix } from "@/lib/cache";
import { notifyIndexNowForSlugs } from "@/lib/indexnow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/platform/cms/posts — لیست پست‌ها (شامل draft) با صفحه‌بندی سرور (R14-B)
// FIX(v20): محتوای کامل HTML پست‌ها (هر کدام ~۱۸۰KB برای مقالات ۳۰۰۰+ کلمه‌ای)
// در لیست ارسال نمی‌شود — با ۳۳ پست، پاسخ ~۶MB می‌شد و مرورگر/سرور را
// زیر فشار می‌برد (ویرایشگر «مقاله‌ای یافت نشد» نشان می‌داد).
// محتوا فقط در GET تک‌مقاله (/posts/[id]) بارگذاری می‌شود.
// FIX(R14-B — 296+ پست = ۴۶۲KB در هر بار): صفحه‌بندی سرور + فیلتر سرور.
//   ?page=1&limit=50&search=&status=&category=
//   پاسخ: { success, data, total, page, limit, stats }
//   سازگاری با قبلی: بدون page → صفحهٔ اول با limit=50 + total برمی‌گردد.
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    // سقف limit برای محافظت از سرور
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const search = (url.searchParams.get("search") || "").trim();
    const status = url.searchParams.get("status") || "";
    const category = url.searchParams.get("category") || "";

    // فیلتر سمت سرور — جستجو/فیلتر دیگر به «پست‌های لودشده» محدود نیست
    const where: Record<string, unknown> = {};
    if (status && status !== "all") where.status = status;
    if (category && category !== "all") where.category = category;
    if (search) {
      // R14-J2 FIX(جستجو): نرمال‌سازی «ی/ك» عربی ↔ فارسی — متن بانک فارسی است؛
      // اگر ادمین با کیبورد/کپی عربی جستجو کند («كسب/حسابي») قبلاً نتیجه‌ای
      // پیدا نمی‌شد. هر دو واریانت در OR جستجو می‌شوند (پست‌های قدیمی هم ممکن
      // است حروف عربی داشته باشند).
      const toPersian = (s: string) => s.replace(/ي/g, "ی").replace(/ك/g, "ک");
      const toArabic = (s: string) => s.replace(/ی/g, "ي").replace(/ک/g, "ك");
      const variants = Array.from(new Set([search, toPersian(search), toArabic(search)]));
      where.OR = variants.flatMap((v) => [
        { title: { contains: v } },
        { slug: { contains: v } },
        { excerpt: { contains: v } },
      ]);
    }

    const [posts, total, statusGroups, scheduledCount] = await Promise.all([
      db.blogPost.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          coverImage: true,
          category: true,
          tags: true,
          status: true,
          publishedAt: true,
          readingTime: true,
          metaTitle: true,
          metaDescription: true,
          focusKeyword: true,
          ogImage: true,
          canonicalUrl: true,
          authorId: true,
          createdAt: true,
          updatedAt: true,
          // FIX(3-a): نوبت انتشار برای نمایش در ویرایشگر + لیست
          scheduledPublishAt: true,
          scheduleOrder: true,
        },
      }),
      db.blogPost.count({ where }),
      // آمار کل بانک (فیلترنشده) برای کارت‌های آماری ویرایشگر
      db.blogPost.groupBy({ by: ["status"], _count: { _all: true } }),
      // FIX(1-e): تعداد «مقاله در صف انتشار» — پیش‌نویس‌های نوبت‌دار برای هدر تب بلاگ
      db.blogPost.count({
        where: { status: "DRAFT", scheduledPublishAt: { not: null } },
      }),
    ]);

    const stats = {
      total: statusGroups.reduce((acc, g) => acc + g._count._all, 0),
      published: statusGroups.find((g) => g.status === "PUBLISHED")?._count._all ?? 0,
      draft: statusGroups.find((g) => g.status === "DRAFT")?._count._all ?? 0,
      archived: statusGroups.find((g) => g.status === "ARCHIVED")?._count._all ?? 0,
      // FIX(1-e): زیرمجموعهٔ نوبت‌دار پیش‌نویس‌ها — «N مقاله در صف انتشار»
      scheduled: scheduledCount,
    };

    return NextResponse.json({
      success: true,
      data: posts,
      total,
      page,
      limit,
      stats,
      // برای «نمایش بیشتر»: آیا صفحهٔ بعدی محتوا دارد؟
      hasMore: page * limit < total,
    });
 } catch (error) {
    console.error("List posts error:", error);
    return NextResponse.json({ success: false, error: "خطا" }, { status: 500 });
 }
}

/** بعدین شمارهٔ ترتیب صف انتشار — برای نوبت جدید در انتهای صف */
async function nextScheduleOrder(): Promise<number> {
  try {
    const last = await db.blogPost.findFirst({
      where: { status: "DRAFT", scheduleOrder: { not: null } },
      orderBy: { scheduleOrder: "desc" },
      select: { scheduleOrder: true },
    });
    return (last?.scheduleOrder ?? 0) + 1;
  } catch {
    return 1;
  }
}

// POST /api/platform/cms/posts — ایجاد پست جدید
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json();
 const {
 slug,
 title,
 excerpt,
 content,
 coverImage,
 category,
 tags,
 status = "DRAFT",
 metaTitle,
 metaDescription,
 focusKeyword,
 ogImage,
 canonicalUrl,
 readingTime = 5,
 scheduledPublishAt,
 } = body;

 if (!slug ||!title ||!content) {
 return NextResponse.json(
 { success: false, error: "slug، عنوان و محتوا الزامی است" },
 { status: 400 }
 );
 }

 // FIX(3-a — ویرایشگر بلاگ): تاریخ انتشار آینده — فقط برای پیش‌نویس معنی دارد؛
 // اگر همین حالا منتشر می‌شود نوبت نمی‌خواهد.
 let parsedSchedule: Date | null = null;
 if (status!== "PUBLISHED" && scheduledPublishAt) {
 const d = new Date(scheduledPublishAt);
 if (!Number.isNaN(d.getTime())) parsedSchedule = d;
 }

 // بررسی یکتایی slug
 const existing = await db.blogPost.findUnique({ where: { slug } });
 if (existing) {
 return NextResponse.json(
 { success: false, error: "این slug قبلاً استفاده شده" },
 { status: 409 }
 );
 }

 const post = await db.blogPost.create({
 data: {
 slug,
 title,
 excerpt,
 content,
 coverImage,
 category: category || "ACCOUNTING",
 tags: tags? JSON.stringify(tags): null,
 status,
 publishedAt: status === "PUBLISHED"? new Date(): null,
 // نوبت انتشار (اگر پیش‌نویس زمان‌بندی‌شده است) — در انتهای صف با
 // scheduleOrder جدید می‌نشیند؛ اگر خالی بود، «بدون نوبت» می‌ماند و
 // «نوبت‌دهی خودکار» بعداً آن را صف می‌کند.
 scheduledPublishAt: parsedSchedule,
 scheduleOrder: parsedSchedule? await nextScheduleOrder(): null,
 metaTitle,
 metaDescription,
 focusKeyword,
 ogImage,
 canonicalUrl,
 readingTime,
 authorId: auth.admin.id,
 },
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "CREATE_BLOG_POST",
 entity: "BlogPost",
 entityId: post.id,
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 // کش لیست بلاگ و پست‌های تکی را باطل کن تا پست جدید فوراً دیده شود
 if (status === "PUBLISHED") {
 cacheDeleteByPrefix("blog:list:");
 cacheDeleteByPrefix("blog:post:");
 // R14-K2: ping IndexNow on direct PUBLISHED create (fire-and-forget)
 if (post.slug) notifyIndexNowForSlugs([post.slug]);
 }

 return NextResponse.json({
 success: true,
 data: post,
 message: "پست ایجاد شد",
 });
 } catch (error) {
 console.error("Create post error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد پست" },
 { status: 500 }
 );
 }
}
