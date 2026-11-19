import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getStorefrontByTenant } from "@/lib/storefront-auth";
import { getBusinessType, categorizeProductByName } from "@/lib/storefront-wizard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/storefront/manage/categorize — دسته‌بندی خودکار کالاهای بدون دسته (R16)
 * موتور کلیدواژه‌ای مخصوص نوع کسب‌وکار فروشگاه — اگر کالایی دسته ندارد،
 * بر اساس نام کالا دقیق‌ترین دسته را می‌گیرد. دسته‌های پیش‌فرض کسب‌وکار هم ساخته می‌شوند.
 * idempotent: کالاهای دارای دسته دست نمی‌خورند.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json({ success: false, error: "ابتدا فروشگاه را بسازید" }, { status: 404 });
    }
    const cfg = getBusinessType(storefront.businessType) ?? getBusinessType("general")!;

    const products = await db.product.findMany({
      where: { tenantId, deletedAt: null, OR: [{ categoryId: null }, { categoryId: "" }] },
      select: { id: true, name: true },
      take: 500,
    });
    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        assigned: 0,
        categories: [],
        message: "همهٔ کالاها دسته‌بندی شده‌اند — نیازی به عملیات نبود",
      });
    }

    // دسته‌های موجود + ساخت دسته‌های پیش‌فرضِ این کسب‌وکار
    const existing = await db.productCategory.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true },
    });
    const catMap = new Map(existing.map((c) => [c.name, c.id]));
    const createdCats: string[] = [];
    for (const name of cfg.defaultCategories) {
      if (!catMap.has(name)) {
        const created = await db.productCategory.create({
          data: { tenantId, name },
          select: { id: true, name: true },
        });
        catMap.set(name, created.id);
        createdCats.push(name);
      }
    }

    let assigned = 0;
    const usedCats = new Map<string, number>();
    const samples: { name: string; category: string; matchedKeyword?: string }[] = [];
    for (const p of products) {
      const res = categorizeProductByName(p.id, p.name, cfg);
      const catId = catMap.get(res.category);
      if (catId) {
        await db.product.update({ where: { id: p.id }, data: { categoryId: catId } });
        assigned += 1;
        usedCats.set(res.category, (usedCats.get(res.category) ?? 0) + 1);
        if (samples.length < 12 && res.reason === "matched") {
          samples.push({ name: p.name, category: res.category, matchedKeyword: res.matchedKeyword });
        }
      }
    }

    await db.auditLog.create({
      data: {
        tenantId,
        userId: auth.user.userId,
        action: "UPDATE",
        entity: "Product",
        entityId: "bulk-categorize",
        changes: JSON.stringify({ assigned, via: "storefront-auto-categorize", businessType: cfg.id }),
      },
    });

    return NextResponse.json({
      success: true,
      assigned,
      createdCategories: createdCats,
      categories: [...usedCats.entries()].map(([name, count]) => ({ name, count })),
      samples,
      message: `${assigned} کالا به‌صورت خودکار دسته‌بندی شد`,
    });
  } catch (error) {
    console.error("[storefront categorize POST] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در دسته‌بندی خودکار" }, { status: 500 });
  }
}
