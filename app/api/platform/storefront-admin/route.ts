// Task ID: 1-a — سوپرادمین: داشبورد فروشگاه‌ها + کنترل دسترسی هر کاربر
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
  checkStorefrontAccess,
  computeStorefrontAccess,
  getMasterSwitchState,
  invalidateStorefrontAccessCache,
  STOREFRONT_MASTER_KEY,
} from "@/lib/storefront-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ R16 — داشبورد فروشگاه‌ها (سوپرادمین) ============
// GET /api/platform/storefront-admin — همهٔ فروشگاه‌ها + آمار تجمیعی:
// فعال/غیرفعال، بازدید، سفارش، درآمد تأییدشده، تیکت‌های باز
// PUT — { storefrontId, isActive | ticketEnabled } تغییرات اضطراری سوپرادمین
//
// ============ Task 1-a — کنترل دسترسی ویژهٔ هر کاربر ============
// GET (افزوده) — accessRows: هر tenant + فروشگاهش + پلن + کاربر مالک +
//   override فعلی + دسترسی مؤثر (محاسبه از lib/storefront-access) + masterEnabled
// POST — { action: "set_override", userId, value: "granted"|"denied"|null }
//      — { action: "set_master", enabled: boolean }

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const stores = await db.storefront.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        slug: true,
        title: true,
        template: true,
        businessType: true,
        isActive: true,
        ticketEnabled: true,
        wizardDone: true,
        customDomain: true,
        viewCount: true,
        createdAt: true,
        _count: {
          select: {
            orders: true,
            customers: true,
            tickets: { where: { status: "OPEN" } },
          },
        },
      },
    });

    // درآمد تأییدشده هر فروشگاه (APPROVED + SHIPPED)
    const revenueRows = await db.storefrontOrder.groupBy({
      by: ["storefrontId"],
      where: { status: { in: ["APPROVED", "SHIPPED"] } },
      _sum: { payableRial: true, totalRial: true },
      _count: { _all: true },
    });
    const revenueMap = new Map(revenueRows.map((r) => [r.storefrontId, r]));

    const totals = {
      stores: stores.length,
      active: stores.filter((s) => s.isActive).length,
      orders: revenueRows.reduce((sum, r) => sum + r._count._all, 0),
      revenueRial: (revenueRows.reduce((sum, r) => sum + (r._sum.payableRial ?? r._sum.totalRial ?? 0n), 0n)).toString(),
      views: stores.reduce((sum, s) => sum + s.viewCount, 0),
      customers: stores.reduce((sum, s) => sum + s._count.customers, 0),
      openTickets: stores.reduce((sum, s) => sum + s._count.tickets, 0),
    };

    // ── Task 1-a — ردیف‌های کنترل دسترسی: tenant × مالک × دسترسی مؤثر ──
    const masterEnabled = await getMasterSwitchState();
    const tenants = await db.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, name: true, plan: true, status: true },
    });
    const tenantIds = tenants.map((t) => t.id);
    const tenantStorefronts = await db.storefront.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { tenantId: true, slug: true, title: true, isActive: true },
    });
    const storefrontByTenant = new Map(tenantStorefronts.map((s) => [s.tenantId, s]));
    // کاربران هر tenant (حذف‌نشده) — مالک = اولین ADMIN، وگرنه اولین کاربر
    const tenantUsers = await db.user.findMany({
      where: { tenantId: { in: tenantIds }, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        name: true,
        family: true,
        email: true,
        role: true,
        storefrontOverride: true,
      },
      orderBy: { createdAt: "asc" },
    });
    const usersByTenant = new Map<string, typeof tenantUsers>();
    for (const u of tenantUsers) {
      const list = usersByTenant.get(u.tenantId) ?? [];
      list.push(u);
      usersByTenant.set(u.tenantId, list);
    }

    const accessRows = tenants.map((t) => {
      const users = usersByTenant.get(t.id) ?? [];
      const owner = users.find((u) => u.role === "ADMIN") ?? users[0] ?? null;
      // محاسبهٔ گروهی بدون N+1 — ورودی‌ها از قبل خوانده شده‌اند (کش ۳۰ثانیه‌ای هم اعمال می‌شود)
      const access = owner ? computeStorefrontAccess(masterEnabled, owner.storefrontOverride, t.plan) : null;
      const sf = storefrontByTenant.get(t.id) ?? null;
      return {
        tenantId: t.id,
        tenantName: t.name,
        tenantStatus: t.status,
        plan: t.plan,
        storefront: sf ? { slug: sf.slug, title: sf.title, isActive: sf.isActive } : null,
        owner: owner
          ? {
              userId: owner.id,
              name: [owner.name, owner.family].filter(Boolean).join(" ").trim() || owner.email,
              email: owner.email,
              role: owner.role,
              storefrontOverride: owner.storefrontOverride,
            }
          : null,
        access,
        userCount: users.length,
      };
    });

    return NextResponse.json({
      success: true,
      totals,
      masterEnabled,
      stores: stores.map((s) => {
        const rev = revenueMap.get(s.id);
        return {
          id: s.id,
          slug: s.slug,
          title: s.title,
          template: s.template,
          businessType: s.businessType,
          isActive: s.isActive,
          ticketEnabled: s.ticketEnabled,
          wizardDone: s.wizardDone,
          customDomain: s.customDomain,
          views: s.viewCount,
          orders: s._count.orders,
          customers: s._count.customers,
          openTickets: s._count.tickets,
          approvedRevenueRial: ((rev?._sum.payableRial ?? rev?._sum.totalRial ?? 0n) as bigint).toString(),
          createdAt: s.createdAt.toISOString(),
        };
      }),
      accessRows,
    });
  } catch (error) {
    console.error("[storefront-admin GET]", error);
    return NextResponse.json({ success: false, error: "خطا در دریافت فروشگاه‌ها" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    const storefrontId = String(b.storefrontId ?? "");
    if (!storefrontId) {
      return NextResponse.json({ success: false, error: "شناسه فروشگاه لازم است" }, { status: 400 });
    }
    const data: { isActive?: boolean; ticketEnabled?: boolean } = {};
    if (b.isActive !== undefined) data.isActive = Boolean(b.isActive);
    if (b.ticketEnabled !== undefined) data.ticketEnabled = Boolean(b.ticketEnabled);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "تغییری مشخص نشده است" }, { status: 400 });
    }
    const updated = await db.storefront.update({
      where: { id: storefrontId },
      data,
      select: { id: true, slug: true, isActive: true, ticketEnabled: true },
    });
    await db.platformAuditLog
      .create({
        data: {
          action: "UPDATE_STOREFRONT",
          entity: "Storefront",
          entityId: storefrontId,
          // Task 1-a — FIX: requireSuperAdmin برمی‌گرداند { admin } نه { superAdmin }؛
          // قبلاً همیشه null ثبت می‌شد
          superAdminId: auth.admin?.id ?? null,
          details: JSON.stringify(data),
        },
      })
      .catch(() => undefined);
    return NextResponse.json({ success: true, store: updated });
  } catch (error) {
    console.error("[storefront-admin PUT]", error);
    return NextResponse.json({ success: false, error: "خطا در تغییر وضعیت فروشگاه" }, { status: 500 });
  }
}

// ============ Task 1-a — POST: کنترل دسترسی ویژهٔ هر کاربر ============
// body: { action: "set_override", userId, value: "granted" | "denied" | null }
//     | { action: "set_master", enabled: boolean }
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    const action = String(b.action ?? "");

    // ── دسترسی ویژهٔ یک کاربر ──
    if (action === "set_override") {
      const userId = String(b.userId ?? "");
      if (!userId) {
        return NextResponse.json({ success: false, error: "شناسه کاربر لازم است" }, { status: 400 });
      }
      let value: "granted" | "denied" | null = null;
      if (b.value === "granted" || b.value === "denied") {
        value = b.value;
      } else if (b.value !== null && b.value !== undefined && b.value !== "") {
        return NextResponse.json(
          { success: false, error: "مقدار دسترسی باید granted، denied یا null (پیش‌فرض پلن) باشد" },
          { status: 400 }
        );
      }

      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, tenantId: true, deletedAt: true },
      });
      if (!user || user.deletedAt) {
        return NextResponse.json({ success: false, error: "کاربر یافت نشد" }, { status: 404 });
      }

      const updated = await db.user.update({
        where: { id: userId },
        data: { storefrontOverride: value },
        select: { id: true, tenantId: true, storefrontOverride: true },
      });

      // اعمال فوری — کل کش دسترسی باطل شود (FIX 1-a: کلید کش بر اساس
      // tenantIdِ «زمینهٔ احراز هویت» ساخته می‌شود که ممکن است با tenantIdِ مستقیم
      // کاربر فرق کند؛ برای اطمینان از اعمال فوری، کل کش پاک می‌شود)
      invalidateStorefrontAccessCache();
      const access = await checkStorefrontAccess(updated.tenantId, updated.id);

      // ── FIX(1-a): مسدودسازی باید «همین لحظه» فروشگاهِ فعال را هم خاموش کند ──
      // قبلاً گیت فقط مانع فعال‌سازیِ جدید می‌شد؛ فروشگاهِ از قبل عمومی، بعد از
      // denied یا master_off همچنان آنلاین می‌ماند. حالا اگر دسترسی مؤثر مسدود
      // است، فروشگاه فعالِ این tenant فوراً غیرعمومی می‌شود.
      let deactivatedCount = 0;
      if (!access.allowed && updated.tenantId) {
        const res = await db.storefront.updateMany({
          where: { tenantId: updated.tenantId, isActive: true },
          data: { isActive: false },
        });
        deactivatedCount = res.count;
      }

      await db.platformAuditLog
        .create({
          data: {
            action: "SET_STOREFRONT_OVERRIDE",
            entity: "User",
            entityId: userId,
            superAdminId: auth.admin?.id ?? null,
            details: JSON.stringify({ override: value, effective: { allowed: access.allowed, reason: access.reason } }),
          },
        })
        .catch(() => undefined);

      return NextResponse.json({
        success: true,
        user: updated,
        access,
        deactivatedCount,
        message:
          value === "granted"
            ? "دسترسی ویژهٔ فروشگاه آنلاین فعال شد"
            : value === "denied"
              ? deactivatedCount > 0
                ? `دسترسی فروشگاه آنلاین مسدود شد و ${deactivatedCount} فروشگاه فعال غیرعمومی شد`
                : "دسترسی فروشگاه آنلاین مسدود شد"
              : "دسترسی به حالت پیش‌فرض پلن برگشت",
      });
    }

    // ── کلید اصلی سامانه ──
    if (action === "set_master") {
      if (typeof b.enabled !== "boolean") {
        return NextResponse.json(
          { success: false, error: "مقدار enabled باید true یا false باشد" },
          { status: 400 }
        );
      }
      const enabled = b.enabled;
      await db.systemSettings.upsert({
        where: { key: STOREFRONT_MASTER_KEY },
        update: { value: enabled ? "1" : "0" },
        create: { key: STOREFRONT_MASTER_KEY, value: enabled ? "1" : "0" },
      });

      // اعمال فوری در همهٔ کش‌ها
      invalidateStorefrontAccessCache();
      const masterEnabled = await getMasterSwitchState();

      // ── FIX(1-a): خاموشی کلید اصلی باید همهٔ فروشگاه‌های فعال را هم غیرعمومی کند ──
      let deactivatedByMaster = 0;
      if (!enabled) {
        const res = await db.storefront.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        });
        deactivatedByMaster = res.count;
      }

      await db.platformAuditLog
        .create({
          data: {
            action: "SET_STOREFRONT_MASTER",
            entity: "SystemSettings",
            entityId: STOREFRONT_MASTER_KEY,
            superAdminId: auth.admin?.id ?? null,
            details: JSON.stringify({ enabled }),
          },
        })
        .catch(() => undefined);

      return NextResponse.json({
        success: true,
        masterEnabled,
        deactivatedCount: deactivatedByMaster,
        message: enabled
          ? "فروشگاه آنلاین در کل سامانه فعال شد"
          : deactivatedByMaster > 0
            ? `فروشگاه آنلاین در کل سامانه غیرفعال شد و ${deactivatedByMaster} فروشگاه فعال غیرعمومی شد`
            : "فروشگاه آنلاین در کل سامانه غیرفعال شد",
      });
    }

    return NextResponse.json({ success: false, error: "اکشن نامعتبر است" }, { status: 400 });
  } catch (error) {
    console.error("[storefront-admin POST]", error);
    return NextResponse.json({ success: false, error: "خطا در ذخیره دسترسی فروشگاه" }, { status: 500 });
  }
}
