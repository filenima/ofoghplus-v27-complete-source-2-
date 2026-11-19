import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getStorefrontByTenant } from "@/lib/storefront-auth";
import { slugifyPostTitle, pingStorefrontPostPublished } from "@/lib/storefront-posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CONTENT_CHARS = 100_000;

/**
 * Task 3-g — GET /api/storefront/manage/posts/[id]
 * یک مقالهٔ کامل (برای ویرایش) — فقط از storefront خودِ مالک.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد" }, { status: 404 });
    }

    const { id } = await ctx.params;
    const post = await db.storefrontPost.findFirst({
      where: { id, storefrontId: storefront.id },
    });
    if (!post) {
      return NextResponse.json({ success: false, error: "مقاله یافت نشد" }, { status: 404 });
    }

    return NextResponse.json({ success: true, post });
  } catch (error) {
    console.error("[storefront manage posts GET id] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در دریافت مقاله" }, { status: 500 });
  }
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
 * Task 3-g — PATCH /api/storefront/manage/posts/[id]
 * ویرایش مقاله + انتشار/لغو انتشار.
 *
 * بدنه (همهٔ فیلدها اختیاری): { title?, slug?, excerpt?, content?, coverImage?, publish?: boolean, unpublish?: boolean }
 *  - publish=true → status=PUBLISHED (اولین بار publishedAt ست می‌شود) + پینگ IndexNow
 *  - unpublish=true → status=DRAFT
 * پاسخ: { success, post: {id, title, slug, status, publishedAt}, message }
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId, userId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد" }, { status: 404 });
    }

    const { id } = await ctx.params;
    const post = await db.storefrontPost.findFirst({
      where: { id, storefrontId: storefront.id },
      select: { id: true, title: true, slug: true, status: true },
    });
    if (!post) {
      return NextResponse.json({ success: false, error: "مقاله یافت نشد" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    const data: Record<string, unknown> = {};

    if (typeof b.title === "string") {
      const title = b.title.trim().slice(0, 150);
      if (title.length < 2) {
        return NextResponse.json({ success: false, error: "عنوان مقاله حداقل ۲ نویسه باشد" }, { status: 400 });
      }
      data.title = title;
    }

    if (typeof b.content === "string") {
      data.content = b.content.slice(0, MAX_CONTENT_CHARS);
    }

    if (b.excerpt !== undefined) {
      const excerpt = typeof b.excerpt === "string" ? b.excerpt.trim().slice(0, 300) : "";
      data.excerpt = excerpt || null;
    }

    const coverImage = validateCoverImage(b.coverImage);
    if (coverImage !== undefined) {
      data.coverImage = coverImage;
    }

    // اسلاگ — فقط اگر صریحاً فرستاده شده باشد؛ یکتایی per-storefront با پسوند
    if (typeof b.slug === "string" && b.slug.trim()) {
      const baseSlug = slugifyPostTitle(b.slug);
      if (!baseSlug) {
        return NextResponse.json(
          { success: false, error: "آدرس مقاله باید حروف/رقم و خط تیره باشد (فارسی مجاز است)" },
          { status: 400 }
        );
      }
      if (baseSlug !== post.slug) {
        let candidate = baseSlug;
        for (let i = 0; i < 100; i++) {
          const clash = await db.storefrontPost.findFirst({
            where: { storefrontId: storefront.id, slug: candidate, id: { not: post.id } },
            select: { id: true },
          });
          if (!clash) break;
          candidate = `${baseSlug}-${i + 2}`;
        }
        data.slug = candidate;
      }
    }

    // انتشار / لغو انتشار
    const publish = b.publish === true;
    const unpublish = b.unpublish === true;
    if (publish && unpublish) {
      return NextResponse.json({ success: false, error: "publish و unpublish با هم معنادار نیستند" }, { status: 400 });
    }
    if (publish && post.status !== "PUBLISHED") {
      data.status = "PUBLISHED";
      data.publishedAt = new Date();
    } else if (unpublish && post.status === "PUBLISHED") {
      data.status = "DRAFT";
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: true, post, message: "تغییری ارسال نشد" });
    }

    const updated = await db.storefrontPost.update({
      where: { id: post.id },
      data,
      select: { id: true, title: true, slug: true, status: true, publishedAt: true },
    });

    await db.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "UPDATE",
        entity: "StorefrontPost",
        entityId: post.id,
        changes: JSON.stringify({ via: "storefront-blog-tab", fields: Object.keys(data) }),
      },
    });

    // پینگ IndexNow — انتشار یا ویرایشِ مقالهٔ منتشرشده (URL تازه/تغییریافته)
    const finalSlug = (data.slug as string) ?? post.slug;
    if (updated.status === "PUBLISHED") {
      pingStorefrontPostPublished(storefront.slug, finalSlug);
    }

    return NextResponse.json({
      success: true,
      post: { ...updated, publishedAt: updated.publishedAt?.toISOString() ?? null },
      message: updated.status === "PUBLISHED" ? "انتشار به‌روز شد" : "تغییرات ذخیره شد",
    });
  } catch (error) {
    console.error("[storefront manage posts PATCH] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در ذخیره مقاله" }, { status: 500 });
  }
}

/**
 * Task 3-g — DELETE /api/storefront/manage/posts/[id]
 * حذف قطعی مقاله (فقط storefront خودِ مالک).
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId, userId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد" }, { status: 404 });
    }

    const { id } = await ctx.params;
    const post = await db.storefrontPost.findFirst({
      where: { id, storefrontId: storefront.id },
      select: { id: true, title: true },
    });
    if (!post) {
      return NextResponse.json({ success: false, error: "مقاله یافت نشد" }, { status: 404 });
    }

    await db.storefrontPost.delete({ where: { id: post.id } });

    await db.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "DELETE",
        entity: "StorefrontPost",
        entityId: post.id,
        changes: JSON.stringify({ via: "storefront-blog-tab", title: post.title }),
      },
    });

    return NextResponse.json({ success: true, message: "مقاله حذف شد" });
  } catch (error) {
    console.error("[storefront manage posts DELETE] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در حذف مقاله" }, { status: 500 });
  }
}
