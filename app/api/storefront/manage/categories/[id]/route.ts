import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** نرمال‌سازی اسلاگ لاتین دسته — همان تابع route.ts والد */
function normalizeCategorySlug(raw: unknown): string | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);
  if (!s) return null;
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(s) || /^[a-z0-9]$/.test(s) ? s : null;
}

/**
 * v20-C — PUT /api/storefront/manage/categories/[id]
 * ویرایش دسته (تغییر نام/والد/آیکون/اسلاگ/توضیح). tenant-scoped.
 *
 * بدنه: { name?, parentId?, icon?, slug?, description?, sortOrder? }
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId, userId } = auth.user;

    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    // دسته باید متعلق به همین tenant باشد
    const category = await db.productCategory.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, name: true, parentId: true, icon: true, slug: true, description: true, sortOrder: true, imageUrl: true },
    });
    if (!category) {
      return NextResponse.json({ success: false, error: "دسته‌بندی یافت نشد" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};

    if (b.name !== undefined) {
      const name = String(b.name ?? "").trim();
      if (name.length < 2 || name.length > 80) {
        return NextResponse.json(
          { success: false, error: "نام دسته باید ۲ تا ۸۰ نویسه باشد" },
          { status: 400 }
        );
      }
      if (name !== category.name) {
        const dup = await db.productCategory.findFirst({
          where: { tenantId, deletedAt: null, name, id: { not: category.id } },
          select: { id: true },
        });
        if (dup) {
          return NextResponse.json({ success: false, error: "دسته‌ای با همین نام وجود دارد" }, { status: 409 });
        }
        data.name = name;
      }
    }

    if (b.parentId !== undefined) {
      let parentId: string | null = null;
      if (b.parentId !== null && String(b.parentId) !== "") {
        parentId = String(b.parentId);
        if (parentId === category.id) {
          return NextResponse.json(
            { success: false, error: "دسته نمی‌تواند والد خودش باشد" },
            { status: 400 }
          );
        }
        const parent = await db.productCategory.findFirst({
          where: { id: parentId, tenantId, deletedAt: null },
          select: { id: true },
        });
        if (!parent) {
          return NextResponse.json({ success: false, error: "دستهٔ والد یافت نشد" }, { status: 400 });
        }
      }
      if (parentId !== category.parentId) {
        data.parentId = parentId;
      }
    }

    if (b.icon !== undefined) {
      const icon = b.icon === null ? null : String(b.icon).trim().slice(0, 40) || null;
      if (icon !== category.icon) data.icon = icon;
    }

    if (b.slug !== undefined) {
      let slug: string | null = null;
      if (b.slug !== null && String(b.slug).trim() !== "") {
        slug = normalizeCategorySlug(b.slug);
        if (!slug) {
          return NextResponse.json(
            { success: false, error: "اسلاگ باید لاتین باشد (حروف انگلیسی کوچک، رقم و خط تیره — مثال: mobile-parts)" },
            { status: 400 }
          );
        }
        const slugDup = await db.productCategory.findFirst({
          where: { tenantId, deletedAt: null, slug, id: { not: category.id } },
          select: { id: true },
        });
        if (slugDup) {
          return NextResponse.json({ success: false, error: "این اسلاگ قبلاً گرفته شده است" }, { status: 409 });
        }
      }
      if (slug !== category.slug) data.slug = slug;
    }

    if (b.description !== undefined) {
      const description = b.description === null ? null : String(b.description).trim().slice(0, 500) || null;
      if (description !== category.description) data.description = description;
    }

    // Task 4 — تصویر اختصاصی دسته (فقط مسیر امن آپلودی فروشگاه)
    if (b.imageUrl !== undefined) {
      let imageUrl: string | null = null;
      if (b.imageUrl !== null && String(b.imageUrl) !== "") {
        const raw = String(b.imageUrl);
        if (!/^\/(uploads\/storefront\/categories\/|banners\/)/.test(raw) || raw.includes("..")) {
          return NextResponse.json(
            { success: false, error: "مسیر تصویر دسته نامعتبر است" },
            { status: 400 }
          );
        }
        imageUrl = raw;
      }
      if (imageUrl !== category.imageUrl) data.imageUrl = imageUrl;
    }

    if (b.sortOrder !== undefined) {
      const n = Number(b.sortOrder);
      if (!Number.isFinite(n) || Math.abs(n) > 100000) {
        return NextResponse.json({ success: false, error: "ترتیب نمایش نامعتبر است" }, { status: 400 });
      }
      if (Math.trunc(n) !== category.sortOrder) data.sortOrder = Math.trunc(n);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: true, category, message: "تغییری برای ذخیره وجود نداشت" });
    }

    const updated = await db.productCategory.update({
      where: { id: category.id },
      data,
      select: { id: true, name: true, parentId: true, icon: true, slug: true, description: true, sortOrder: true, imageUrl: true },
    });

    await db.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "UPDATE",
        entity: "ProductCategory",
        entityId: category.id,
        changes: JSON.stringify({ via: "storefront-categories-tab", changed: Object.keys(data) }),
      },
    });

    return NextResponse.json({
      success: true,
      category: updated,
      message: `دستهٔ «${updated.name}» ذخیره شد`,
    });
  } catch (error) {
    console.error("[storefront manage categories PUT id] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در ذخیره دسته‌بندی" }, { status: 500 });
  }
}

/**
 * v20-C — DELETE /api/storefront/manage/categories/[id]?moveTo=<categoryId|none>
 * حذف دسته. اگر کالایی داخلش باشد و moveTo ارسال نشده باشد → 409 با تعداد کالاها.
 * moveTo=none → کالاها بدون دسته می‌شوند؛ moveTo=<id> → به دستهٔ مقصد منتقل می‌شوند.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId, userId } = auth.user;

    const { id } = await params;
    const category = await db.productCategory.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, name: true, parentId: true },
    });
    if (!category) {
      return NextResponse.json({ success: false, error: "دسته‌بندی یافت نشد" }, { status: 404 });
    }

    // کالاهای این دسته (زنده)
    const productCount = await db.product.count({
      where: { tenantId, deletedAt: null, categoryId: category.id },
    });

    let moveTo: string | null | undefined;
    const moveToRaw = req.nextUrl.searchParams.get("moveTo");
    if (moveToRaw === "none") moveTo = null;
    else if (moveToRaw) moveTo = moveToRaw;

    if (productCount > 0 && moveTo === undefined) {
      // حذف مسدود — UI باید مقصد انتقال کالاها را بپرسد
      return NextResponse.json(
        {
          success: false,
          error: `این دسته ${productCount} کالا دارد — ابتدا کالاها را به دستهٔ دیگری منتقل کنید`,
          code: "CATEGORY_NOT_EMPTY",
          productCount,
          parentId: category.parentId,
        },
        { status: 409 }
      );
    }

    // اعتبارسنجی مقصد
    if (moveTo !== undefined && moveTo !== null) {
      if (moveTo === category.id) {
        return NextResponse.json(
          { success: false, error: "کالاها را به همین دسته نمی‌توان منتقل کرد" },
          { status: 400 }
        );
      }
      const target = await db.productCategory.findFirst({
        where: { id: moveTo, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!target) {
        return NextResponse.json({ success: false, error: "دستهٔ مقصد یافت نشد" }, { status: 400 });
      }
    }

    await db.$transaction(async (tx) => {
      if (productCount > 0) {
        await tx.product.updateMany({
          where: { tenantId, deletedAt: null, categoryId: category.id },
          data: { categoryId: moveTo === undefined ? category.parentId : moveTo },
        });
      }
      await tx.productCategory.delete({ where: { id: category.id } });
    });

    await db.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "DELETE",
        entity: "ProductCategory",
        entityId: category.id,
        changes: JSON.stringify({
          via: "storefront-categories-tab",
          name: category.name,
          movedProducts: productCount,
          moveTo: moveTo === undefined ? "parent" : moveTo ?? "none",
        }),
      },
    });

    return NextResponse.json({
      success: true,
      movedProducts: productCount,
      message:
        productCount > 0
          ? `دستهٔ «${category.name}» حذف شد و ${productCount} کالا منتقل شد`
          : `دستهٔ «${category.name}» حذف شد`,
    });
  } catch (error) {
    console.error("[storefront manage categories DELETE id] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در حذف دسته‌بندی" }, { status: 500 });
  }
}
