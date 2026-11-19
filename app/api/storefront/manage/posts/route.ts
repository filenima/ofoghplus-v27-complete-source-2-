import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getStorefrontByTenant } from "@/lib/storefront-auth";
import { slugifyPostTitle, pingStorefrontPostPublished } from "@/lib/storefront-posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_POSTS = 500;
const MAX_CONTENT_CHARS = 100_000;

/**
 * Task 3-g — GET /api/storefront/manage/posts
 * فهرست مقاله‌های بلاگ مالک (پیش‌نویس + منتشرشده).
 *
 * کوئری: ?status=DRAFT|PUBLISHED (بدون آن = همه)
 * پاسخ: { success, posts: [...], counts: { ALL, DRAFT, PUBLISHED }, shopSlug }
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json(
        { success: false, error: "ابتدا فروشگاه خود را بسازید" },
        { status: 404 }
      );
    }

    const statusParam = req.nextUrl.searchParams.get("status");
    const statusFilter = statusParam === "DRAFT" || statusParam === "PUBLISHED" ? statusParam : undefined;

    const rows = await db.storefrontPost.findMany({
      where: { storefrontId: storefront.id, ...(statusFilter ? { status: statusFilter } : {}) },
      orderBy: [{ createdAt: "desc" }],
      take: MAX_POSTS,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        coverImage: true,
        status: true,
        publishedAt: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const [draftCount, publishedCount] = await Promise.all([
      db.storefrontPost.count({ where: { storefrontId: storefront.id, status: "DRAFT" } }),
      db.storefrontPost.count({ where: { storefrontId: storefront.id, status: "PUBLISHED" } }),
    ]);

    return NextResponse.json({
      success: true,
      posts: rows.map((r) => ({
        ...r,
        publishedAt: r.publishedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      counts: { ALL: draftCount + publishedCount, DRAFT: draftCount, PUBLISHED: publishedCount },
      shopSlug: storefront.slug,
    });
  } catch (error) {
    console.error("[storefront manage posts GET] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در دریافت مقاله‌ها" }, { status: 500 });
  }
}

/** تولید اسلاگ یکتا per-storefront — پسوند -۲، -۳… در صورت تداخل */
async function uniquePostSlug(storefrontId: string, base: string, excludeId?: string): Promise<string> {
  let candidate = base || "post";
  for (let i = 0; i < 100; i++) {
    const clash = await db.storefrontPost.findFirst({
      where: { storefrontId, slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now()}`;
}

/** اعتبارسنجی مسیر کاور — فقط مسیر عمومی همین پلتفرم یا https مطلق */
function validateCoverImage(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^https:\/\//i.test(s) && s.length <= 500 && !/[<>"]/i.test(s)) return s;
  if (/^\/uploads\/storefront\//.test(s) && !s.includes("..") && s.length <= 300) return s;
  return null; // نامعتبر → مثل خالی رفتار می‌کنیم
}

/**
 * Task 3-g — POST /api/storefront/manage/posts
 * ساخت مقالهٔ جدید.
 *
 * بدنه: { title (الزامی ۲-۱۵۰), slug?, excerpt?, content?, coverImage?, publish?: boolean }
 * پاسخ: { success, post: {id, title, slug, status}, message }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId, userId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json(
        { success: false, error: "ابتدا فروشگاه خود را بسازید" },
        { status: 404 }
      );
    }

    const existingCount = await db.storefrontPost.count({ where: { storefrontId: storefront.id } });
    if (existingCount >= MAX_POSTS) {
      return NextResponse.json(
        { success: false, error: `حداکثر ${MAX_POSTS} مقاله در هر فروشگاه مجاز است` },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    const title = String(b.title ?? "").trim().slice(0, 150);
    if (title.length < 2) {
      return NextResponse.json(
        { success: false, error: "عنوان مقاله حداقل ۲ نویسه باشد" },
        { status: 400 }
      );
    }

    const content = typeof b.content === "string" ? b.content.slice(0, MAX_CONTENT_CHARS) : "";
    const excerptRaw = typeof b.excerpt === "string" ? b.excerpt.trim().slice(0, 300) : "";
    const excerpt = excerptRaw || null;
    const coverImage = validateCoverImage(b.coverImage);
    const publish = b.publish === true;

    // اسلاگ: دستی (نرمال‌سازی) یا خودکار از عنوان — یکتایی per-storefront
    const manualSlug = typeof b.slug === "string" && b.slug.trim() ? slugifyPostTitle(b.slug) : "";
    const baseSlug = manualSlug || slugifyPostTitle(title);
    if (!baseSlug) {
      return NextResponse.json(
        { success: false, error: "از این عنوان نمی‌توان آدرس ساخت — عنوان را کامل‌تر کنید" },
        { status: 400 }
      );
    }
    const slug = await uniquePostSlug(storefront.id, baseSlug);

    const post = await db.storefrontPost.create({
      data: {
        storefrontId: storefront.id,
        title,
        slug,
        excerpt,
        content,
        ...(coverImage !== undefined ? { coverImage } : {}),
        status: publish ? "PUBLISHED" : "DRAFT",
        publishedAt: publish ? new Date() : null,
      },
      select: { id: true, title: true, slug: true, status: true },
    });

    await db.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "CREATE",
        entity: "StorefrontPost",
        entityId: post.id,
        changes: JSON.stringify({ via: "storefront-blog-tab", title, slug, status: post.status }),
      },
    });

    if (publish) pingStorefrontPostPublished(storefront.slug, post.slug);

    return NextResponse.json({
      success: true,
      post,
      message: publish ? "مقاله منتشر شد — همین حالا در سایت شما دیده می‌شود" : "پیش‌نویس ذخیره شد",
    });
  } catch (error) {
    console.error("[storefront manage posts POST] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در ساخت مقاله" }, { status: 500 });
  }
}
