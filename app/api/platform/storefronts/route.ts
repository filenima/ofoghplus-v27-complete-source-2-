// Task ID: 3-d — سوپرادمین: مدیریت فروشگاه‌ها و سایت‌های ساخته‌شدهٔ مشتریان
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ GET /api/platform/storefronts — فهرست همهٔ فروشگاه‌ها ============
// سوپرادمین: همهٔ فروشگاه‌ها/سایت‌های مشتریان + نام/تلفن tenant + اسلاگ و
// دامنهٔ اختصاصی + وضعیت (active/suspended) + وضعیت انتشار مالک + تعداد کالا
// + تاریخ ایجاد + آخرین بازنشر. جستجو (q) و صفحه‌بندی (skip/take).
//
// پارامترها:
//   q      — جستجو در عنوان سایت، اسلاگ، دامنهٔ اختصاصی و نام tenant
//   status — active | suspended (فیلتر وضعیت اداری)
//   skip   — پیش‌فرض ۰ | take — پیش‌فرض ۲۰، حداکثر ۱۰۰
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const sp = req.nextUrl.searchParams;
    const q = (sp.get("q") ?? "").trim();
    const statusFilter = sp.get("status") ?? "";
    const skip = Math.max(0, Number.parseInt(sp.get("skip") ?? "0", 10) || 0);
    const take = Math.min(100, Math.max(1, Number.parseInt(sp.get("take") ?? "20", 10) || 20));

    // جستجو — عنوان/اسلاگ/دامنه از خود Storefront؛ نام tenant جداگانه (Storefront
    // به Tenant رلیشن Prisma ندارد) → tenantIds منطبق پیدا و به OR اضافه می‌شود.
    let tenantIdsByName: string[] | null = null;
    if (q) {
      const matched = await db.tenant.findMany({
        where: { name: { contains: q } },
        select: { id: true },
        take: 500,
      });
      tenantIdsByName = matched.map((t) => t.id);
    }

    const where = {
      ...(statusFilter === "active" || statusFilter === "suspended" ? { status: statusFilter } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { slug: { contains: q } },
              { customDomain: { contains: q } },
              ...(tenantIdsByName && tenantIdsByName.length > 0
                ? [{ tenantId: { in: tenantIdsByName } }]
                : []),
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      db.storefront.count({ where }),
      db.storefront.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          tenantId: true,
          slug: true,
          title: true,
          customDomain: true,
          status: true,
          suspendedAt: true,
          isActive: true, // وضعیت انتشار از سمت مالک
          wizardDone: true,
          template: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { revisions: true, orders: true } },
        },
      }),
    ]);

    // ── داده‌های جانبی: tenant (نام) + مالک (تلفن) + تعداد کالا + آخرین بازنشر ──
    const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
    const [tenants, ownerUsers, productCounts, lastRevisions] = await Promise.all([
      tenantIds.length
        ? db.tenant.findMany({
            where: { id: { in: tenantIds } },
            select: { id: true, name: true, status: true, plan: true },
          })
        : Promise.resolve([] as { id: string; name: string; status: string; plan: string }[]),
      tenantIds.length
        ? db.user.findMany({
            // مالک = اولین ADMIN (مثل storefront-admin) — فقط برای تلفن تماس
            where: { tenantId: { in: tenantIds }, deletedAt: null, role: "ADMIN" },
            select: { tenantId: true, phone: true, email: true, name: true, family: true },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([] as { tenantId: string; phone: string | null; email: string; name: string; family: string | null }[]),
      tenantIds.length
        ? db.product.groupBy({
            by: ["tenantId"],
            where: { tenantId: { in: tenantIds }, deletedAt: null },
            _count: { _all: true },
          })
        : Promise.resolve([] as { tenantId: string; _count: { _all: number } }[]),
      tenantIds.length
        ? db.storefrontRevision.groupBy({
            by: ["storefrontId"],
            where: { storefrontId: { in: rows.map((r) => r.id) } },
            _max: { createdAt: true },
          })
        : Promise.resolve([] as { storefrontId: string; _max: { createdAt: Date | null } }[]),
    ]);

    const tenantById = new Map(tenants.map((t) => [t.id, t]));
    // اولین ADMIN هر tenant
    const ownerByTenant = new Map<string, { phone: string | null; email: string }>();
    for (const u of ownerUsers) {
      if (!ownerByTenant.has(u.tenantId)) {
        ownerByTenant.set(u.tenantId, { phone: u.phone, email: u.email });
      }
    }
    const productCountByTenant = new Map(productCounts.map((p) => [p.tenantId, p._count._all]));
    const lastRevisionBySf = new Map(lastRevisions.map((r) => [r.storefrontId, r._max.createdAt]));

    return NextResponse.json({
      success: true,
      total,
      skip,
      take,
      storefronts: rows.map((s) => {
        const tenant = tenantById.get(s.tenantId);
        const owner = ownerByTenant.get(s.tenantId);
        return {
          id: s.id,
          tenantId: s.tenantId,
          tenantName: tenant?.name ?? "—",
          tenantStatus: tenant?.status ?? null,
          plan: tenant?.plan ?? null,
          tenantPhone: owner?.phone ?? null,
          ownerEmail: owner?.email ?? null,
          title: s.title,
          slug: s.slug,
          customDomain: s.customDomain,
          status: s.status, // active | suspended (اداری — سوپرادمین)
          suspendedAt: s.suspendedAt,
          isActive: s.isActive, // انتشار از سمت مالک
          wizardDone: s.wizardDone,
          template: s.template,
          products: productCountByTenant.get(s.tenantId) ?? 0,
          revisions: s._count.revisions,
          orders: s._count.orders,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
          lastRevisionAt: lastRevisionBySf.get(s.id)?.toISOString() ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("[platform/storefronts GET]", error);
    return NextResponse.json({ success: false, error: "خطا در دریافت فهرست فروشگاه‌ها" }, { status: 500 });
  }
}
