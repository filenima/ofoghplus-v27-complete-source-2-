import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IDS = 100;

/**
 * R24-4 — عملیات گروهی کالاها (مدیریت حرفه‌ای محصولات)
 * POST /api/storefront/manage/products/bulk
 *
 * بدنه:
 *   { ids: string[], action: "show" | "hide" | "delete" | "discount" | "price" | "category", value?: number | string }
 *
 *   show     → نمایش در فروشگاه (meta.showInStore = true)
 *   hide     → پنهان‌سازی از فروشگاه
 *   delete   → حذف نرم (deletedAt = now — ردیف انبار باقی می‌ماند)
 *   discount → تخفیف گروهی درصدی (value: 0 تا ۹۰ — صفر یعنی حذف تخفیف)
 *   price    → (R25-A2) قیمت‌گذاری گروهی — value = قیمت واحد به «تومان» (×۱۰ = ریال ذخیره می‌شود)
 *   category → (R25-A2) انتقال گروهی به دسته — value = نام دسته یا "" برای حذف از دسته
 *
 * همهٔ عملیات tenant-scoped هستند (IDOR-safe).
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
    const b = body as { ids?: unknown; action?: unknown; value?: unknown };

    const ids = Array.isArray(b.ids)
      ? b.ids.filter((x): x is string => typeof x === "string").slice(0, MAX_IDS)
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: "هیچ کالایی انتخاب نشده است" }, { status: 400 });
    }

    const action = String(b.action ?? "");
    if (!["show", "hide", "delete", "discount", "price", "category"].includes(action)) {
      return NextResponse.json({ success: false, error: "عملیات نامعتبر است" }, { status: 400 });
    }

    // همهٔ کالاها باید متعلق به همین tenant باشند
    const products = await db.product.findMany({
      where: { id: { in: ids }, tenantId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (products.length === 0) {
      return NextResponse.json({ success: false, error: "کالای معتبری یافت نشد" }, { status: 404 });
    }
    const validIds = products.map((p) => p.id);

    let affected = 0;

    if (action === "delete") {
      const res = await db.product.updateMany({
        where: { id: { in: validIds }, tenantId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      affected = res.count;
    } else if (action === "price") {
      // R25-A2 — قیمت‌گذاری گروهی: value = تومان (مثل ویرایش سریع، ×۱۰ = ریال)
      const toman = Number(b.value);
      if (!Number.isFinite(toman) || toman < 100 || toman > 10_000_000_000) {
        return NextResponse.json({ success: false, error: "قیمت باید بین ۱۰۰ تا ۱۰ میلیارد تومان باشد" }, { status: 400 });
      }
      const salePriceRial = BigInt(Math.trunc(toman) * 10);
      const res = await db.product.updateMany({
        where: { id: { in: validIds }, tenantId, deletedAt: null },
        data: { salePrice: salePriceRial },
      });
      affected = res.count;
    } else if (action === "category") {
      // R25-A2 — انتقال گروهی به دسته بر اساس نام (یا خالی = حذف از دسته)
      const rawName = typeof b.value === "string" ? b.value.trim() : "";
      let categoryId: string | null = null;
      if (rawName) {
        const cat = await db.productCategory.findFirst({
          where: { tenantId, name: rawName, deletedAt: null },
          select: { id: true, name: true },
        });
        if (!cat) {
          return NextResponse.json({ success: false, error: `دستهٔ «${rawName}» یافت نشد` }, { status: 404 });
        }
        categoryId = cat.id;
      }
      const res = await db.product.updateMany({
        where: { id: { in: validIds }, tenantId, deletedAt: null },
        data: { categoryId },
      });
      affected = res.count;
    } else if (action === "show" || action === "hide") {
      const showInStore = action === "show";
      // کالاهایی که متا دارند → update؛ ندارند → create
      await db.storefrontProductMeta.updateMany({
        where: { tenantId, productId: { in: validIds } },
        data: { showInStore },
      });
      const withMeta = await db.storefrontProductMeta.findMany({
        where: { tenantId, productId: { in: validIds } },
        select: { productId: true },
      });
      const withMetaSet = new Set(withMeta.map((m) => m.productId));
      const withoutMeta = validIds.filter((id) => !withMetaSet.has(id));
      if (withoutMeta.length > 0) {
        await db.storefrontProductMeta.createMany({
          data: withoutMeta.map((productId) => ({ tenantId, productId, showInStore })),
        });
      }
      affected = validIds.length;
    } else {
      // discount
      const raw = b.value === undefined || b.value === null || b.value === "" ? 0 : Number(b.value);
      if (!Number.isFinite(raw) || raw < 0 || raw > 90) {
        return NextResponse.json({ success: false, error: "درصد تخفیف باید بین ۰ تا ۹۰ باشد" }, { status: 400 });
      }
      const discountPercent = Math.trunc(raw);
      const value = discountPercent > 0 ? discountPercent : null;

      await db.storefrontProductMeta.updateMany({
        where: { tenantId, productId: { in: validIds } },
        data: { discountPercent: value },
      });
      const withMeta = await db.storefrontProductMeta.findMany({
        where: { tenantId, productId: { in: validIds } },
        select: { productId: true },
      });
      const withMetaSet = new Set(withMeta.map((m) => m.productId));
      const withoutMeta = validIds.filter((id) => !withMetaSet.has(id));
      if (withoutMeta.length > 0 && value !== null) {
        await db.storefrontProductMeta.createMany({
          data: withoutMeta.map((productId) => ({ tenantId, productId, discountPercent: value })),
        });
      }
      affected = validIds.length;
    }

    await db.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "UPDATE",
        entity: "Product",
        entityId: "bulk",
        changes: JSON.stringify({ via: "storefront-products-bulk", action, affected }),
      },
    });

    const messages: Record<string, string> = {
      show: `${affected} کالا در فروشگاه نمایش داده می‌شود`,
      hide: `${affected} کالا از فروشگاه پنهان شد`,
      delete: `${affected} کالا حذف شد (قابل بازگردانی از فهرست کالاهای نرم‌افزار نیست — حذف نرم)`,
      discount: `تخفیف روی ${affected} کالا اعمال شد`,
      price: `قیمت ${affected} کالا به‌روزرسانی شد`,
      category: `${affected} کالا به دستهٔ «${typeof b.value === "string" && b.value.trim() ? b.value.trim() : "بدون دسته"}» منتقل شد`,
    };

    return NextResponse.json({ success: true, affected, message: messages[action] });
  } catch (error) {
    console.error("[storefront products bulk POST] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در انجام عملیات گروهی" }, { status: 500 });
  }
}
