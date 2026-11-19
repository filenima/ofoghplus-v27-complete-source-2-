import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CATEGORIES = 200;

/** نرمال‌سازی اسلاگ لاتین دسته (a-z، رقم، خط تیره) */
function normalizeCategorySlug(raw: unknown): string | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);
  if (!s) return null;
  // اسلاگ باید لاتین باشد — اگر فقط حروف فارسی ماند، رد می‌شود (UI خودش پیشنهاد می‌دهد)
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(s) || /^[a-z0-9]$/.test(s) ? s : null;
}

/**
 * v20-C — GET /api/storefront/manage/categories
 * فهرست دسته‌بندی‌های مالک (نام، تعداد کالا، آیکون، ترتیب، والد، اسلاگ، توضیح).
 *
 * پاسخ: {
 *   success, total,
 *   categories: [{ id, name, parentId, parentName, icon, slug, description, sortOrder, productCount, createdAt }]
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const rows = await db.productCategory.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        parentId: true,
        icon: true,
        slug: true,
        description: true,
        sortOrder: true,
        imageUrl: true,
        createdAt: true,
        _count: { select: { products: { where: { deletedAt: null } } } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: MAX_CATEGORIES,
    });

    const nameById = new Map(rows.map((r) => [r.id, r.name]));
    const categories = rows.map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parentId,
      parentName: r.parentId ? nameById.get(r.parentId) ?? null : null,
      icon: r.icon,
      slug: r.slug,
      description: r.description,
      sortOrder: r.sortOrder,
      imageUrl: r.imageUrl,
      productCount: r._count.products,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, categories, total: categories.length });
  } catch (error) {
    console.error("[storefront manage categories GET] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در دریافت دسته‌بندی‌ها" }, { status: 500 });
  }
}

/**
 * v20-C — POST /api/storefront/manage/categories
 * ساخت دستهٔ جدید.
 *
 * بدنه: { name (الزامی ۲-۸۰ نویسه), parentId?, icon?, slug?, description? }
 * پاسخ: { success, category: {id, name, ...}, message }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId, userId } = auth.user;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    const name = String(b.name ?? "").trim();
    if (name.length < 2 || name.length > 80) {
      return NextResponse.json(
        { success: false, error: "نام دسته باید ۲ تا ۸۰ نویسه باشد" },
        { status: 400 }
      );
    }

    // والد باید دستهٔ همین tenant باشد
    let parentId: string | null = null;
    if (b.parentId !== undefined && b.parentId !== null && String(b.parentId) !== "") {
      parentId = String(b.parentId);
      const parent = await db.productCategory.findFirst({
        where: { id: parentId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!parent) {
        return NextResponse.json({ success: false, error: "دستهٔ والد یافت نشد" }, { status: 400 });
      }
    }

    // نام تکراری در همین tenant مجاز نیست
    const dup = await db.productCategory.findFirst({
      where: { tenantId, deletedAt: null, name },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json(
        { success: false, error: "دسته‌ای با همین نام وجود دارد" },
        { status: 409 }
      );
    }

    // اسلاگ لاتین اختیاری — یکتایی در tenant چک می‌شود
    let slug: string | null = null;
    if (b.slug !== undefined && b.slug !== null && String(b.slug).trim() !== "") {
      slug = normalizeCategorySlug(b.slug);
      if (!slug) {
        return NextResponse.json(
          { success: false, error: "اسلاگ باید لاتین باشد (حروف انگلیسی کوچک، رقم و خط تیره — مثال: mobile-parts)" },
          { status: 400 }
        );
      }
      const slugDup = await db.productCategory.findFirst({
        where: { tenantId, deletedAt: null, slug },
        select: { id: true },
      });
      if (slugDup) {
        return NextResponse.json({ success: false, error: "این اسلاگ قبلاً گرفته شده است" }, { status: 409 });
      }
    }

    const icon = b.icon === undefined || b.icon === null ? null : String(b.icon).trim().slice(0, 40) || null;
    const description =
      b.description === undefined || b.description === null ? null : String(b.description).trim().slice(0, 500) || null;
    // Task 4 — تصویر اختصاصی دسته (آپلود از مسیر امن فروشگاه)
    let imageUrl: string | null = null;
    if (b.imageUrl !== undefined && b.imageUrl !== null && String(b.imageUrl) !== "") {
      const raw = String(b.imageUrl);
      if (!/^\/(uploads\/storefront\/categories\/|banners\/)/.test(raw) || raw.includes("..")) {
        return NextResponse.json(
          { success: false, error: "مسیر تصویر دسته نامعتبر است" },
          { status: 400 }
        );
      }
      imageUrl = raw;
    }

    // ترتیب بعد از آخرین دسته
    const last = await db.productCategory.findFirst({
      where: { tenantId, deletedAt: null },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const category = await db.productCategory.create({
      data: {
        tenantId,
        name,
        parentId,
        icon,
        slug,
        description,
        imageUrl,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
      select: { id: true, name: true, parentId: true, icon: true, slug: true, description: true, sortOrder: true, imageUrl: true },
    });

    await db.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "CREATE",
        entity: "ProductCategory",
        entityId: category.id,
        changes: JSON.stringify({ via: "storefront-categories-tab", name, parentId, icon, slug }),
      },
    });

    return NextResponse.json({
      success: true,
      category: { ...category, productCount: 0 },
      message: `دستهٔ «${name}» ساخته شد`,
    });
  } catch (error) {
    console.error("[storefront manage categories POST] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در ساخت دسته‌بندی" }, { status: 500 });
  }
}

/**
 * v20-C — PUT /api/storefront/manage/categories
 * ترتیب‌چینی دسته‌ها با drag & drop — بدنه: { order: string[] } (آرایهٔ idها به‌ترتیب جدید).
 * sortOrder هر دسته = اندیس آن در آرایه. فقط دسته‌های همین tenant به‌روز می‌شوند.
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId, userId } = auth.user;

    const body = await req.json().catch(() => null);
    const order = body && typeof body === "object" ? (body as Record<string, unknown>).order : null;
    if (!Array.isArray(order) || order.length === 0 || order.length > MAX_CATEGORIES) {
      return NextResponse.json({ success: false, error: "ترتیب ارسال‌شده معتبر نیست" }, { status: 400 });
    }
    const ids = order.filter((x): x is string => typeof x === "string");
    if (ids.length !== order.length) {
      return NextResponse.json({ success: false, error: "شناسهٔ دسته نامعتبر است" }, { status: 400 });
    }

    // فقط دسته‌های همین tenant — ناشناخته‌ها بی‌صدا رد می‌شوند
    const owned = await db.productCategory.findMany({
      where: { tenantId, deletedAt: null, id: { in: ids } },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((c) => c.id));

    await db.$transaction(
      ids
        .filter((id) => ownedSet.has(id))
        .map((id, index) =>
          db.productCategory.update({
            where: { id },
            data: { sortOrder: index + 1 },
            select: { id: true },
          })
        )
    );

    await db.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "UPDATE",
        entity: "ProductCategory",
        entityId: "bulk-reorder",
        changes: JSON.stringify({ via: "storefront-categories-tab", count: ids.length }),
      },
    });

    return NextResponse.json({ success: true, message: "ترتیب دسته‌ها ذخیره شد" });
  } catch (error) {
    console.error("[storefront manage categories PUT] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در ذخیره ترتیب دسته‌ها" }, { status: 500 });
  }
}
