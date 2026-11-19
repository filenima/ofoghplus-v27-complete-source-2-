// Task ID: 3-d — سوپرادمین: عملیات روی یک فروشگاه/سایت مشتری
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { validateStorefrontSlug } from "@/lib/storefront";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ PATCH /api/platform/storefronts/[id] ============
// اکشن‌های سوپرادمین:
//   { action: "suspend" }                     → تعلیق سایت (۵۰۳ روی اسلاگ + دامنه)
//   { action: "activate" }                    → رفع تعلیق
//   { action: "release_domain", target }      → آزادسازی دامنه
//        target: "custom" (پیش‌فرض — پاک‌کردن دامنهٔ اختصاصی + رکوردهای ثبتشده)
//              | "subdomain" (اسلاگ جدید تصادفی → زیردامنهٔ قبلی آزاد می‌شود)
// همهٔ اکشن‌ها در PlatformAuditLog ثبت می‌شوند؛ release_domain علاوه بر آن
// DomainEvent (append-only) می‌نویسد.
async function auditLog(
  req: NextRequest,
  adminId: string | null,
  action: string,
  entityId: string,
  details: Record<string, unknown>
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  await db.platformAuditLog
    .create({
      data: {
        superAdminId: adminId,
        action,
        entity: "Storefront",
        entityId,
        details: JSON.stringify(details),
        ipAddress: ip,
      },
    })
    .catch(() => undefined);
}

/** اسلاگ تصادفی معتبر و یکتا برای آزادسازی زیردامنهٔ قبلی */
async function generateFreedSlug(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const candidate = `freed-${randomBytes(4).toString("hex")}`;
    const v = validateStorefrontSlug(candidate);
    if (!v.ok) continue;
    const exists = await db.storefront.findUnique({ where: { slug: v.slug }, select: { id: true } });
    if (!exists) return v.slug;
  }
  // fallback عملاً هرگز رخ نمی‌دهد (۴۸ بیت تصادفی)
  return `freed-${Date.now().toString(36)}`;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const action = String(body.action ?? "");
    const storefront = await db.storefront.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        slug: true,
        title: true,
        customDomain: true,
        status: true,
        isActive: true,
      },
    });
    if (!storefront) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد" }, { status: 404 });
    }

    // ── تعلیق سایت ──
    if (action === "suspend") {
      const updated = await db.storefront.update({
        where: { id },
        data: { status: "suspended", suspendedAt: new Date() },
        select: { id: true, slug: true, status: true },
      });
      await auditLog(req, auth.admin?.id ?? null, "SUSPEND_STOREFRONT", id, {
        slug: storefront.slug,
        title: storefront.title,
        customDomain: storefront.customDomain,
        tenantId: storefront.tenantId,
      });
      return NextResponse.json({
        success: true,
        storefront: updated,
        message: `سایت «${storefront.title}» تعلیق شد — بازدیدکنندگان پیام تعلیق (۵۰۳) می‌بینند`,
      });
    }

    // ── رفع تعلیق ──
    if (action === "activate") {
      const updated = await db.storefront.update({
        where: { id },
        data: { status: "active", suspendedAt: null },
        select: { id: true, slug: true, status: true },
      });
      await auditLog(req, auth.admin?.id ?? null, "ACTIVATE_STOREFRONT", id, {
        slug: storefront.slug,
        title: storefront.title,
        tenantId: storefront.tenantId,
      });
      return NextResponse.json({
        success: true,
        storefront: updated,
        message: `تعلیق سایت «${storefront.title}» برداشته شد`,
      });
    }

    // ── آزادسازی دامنه (اختصاصی یا زیردامنه/اسلاگ) ──
    if (action === "release_domain") {
      const target = body.target === "subdomain" ? "subdomain" : "custom";

      if (target === "custom") {
        if (!storefront.customDomain) {
          return NextResponse.json(
            { success: false, error: "این فروشگاه دامنهٔ اختصاصی متصل ندارد" },
            { status: 400 }
          );
        }
        const released = storefront.customDomain;
        // پاک‌کردن فیلد + رکوردهای ثبت دامنه در TenantDomain (آزاد برای بقیه)
        const domainRows = await db.tenantDomain.deleteMany({
          where: { tenantId: storefront.tenantId, domain: released },
        });
        await db.storefront.update({
          where: { id },
          data: { customDomain: null },
        });
        // رویداد دامنه (append-only) + ممیزی پلتفرم
        await db.domainEvent
          .create({
            data: {
              tenantId: storefront.tenantId,
              aggregateType: "Storefront",
              aggregateId: storefront.id,
              eventType: "DOMAIN_RELEASED",
              data: JSON.stringify({
                domain: released,
                slug: storefront.slug,
                reason: "superadmin_release",
              }),
              metadata: JSON.stringify({
                actor: "superadmin",
                superAdminId: auth.admin?.id ?? null,
                source: "platform/storefronts",
              }),
            },
          })
          .catch(() => undefined);
        await auditLog(req, auth.admin?.id ?? null, "RELEASE_STOREFRONT_DOMAIN", id, {
          domain: released,
          slug: storefront.slug,
          tenantId: storefront.tenantId,
          deletedTenantDomainRows: domainRows.count,
        });
        return NextResponse.json({
          success: true,
          message: `دامنهٔ «${released}» آزاد شد و قابل ثبت مجدد توسط دیگران است`,
        });
      }

      // آزادسازی زیردامنه (اسلاگ) — نام جدید تصادفی می‌گیرد تا قبلی آزاد شود
      const oldSlug = storefront.slug;
      const newSlug = await generateFreedSlug();
      await db.storefront.update({ where: { id }, data: { slug: newSlug } });
      await db.domainEvent
        .create({
          data: {
            tenantId: storefront.tenantId,
            aggregateType: "Storefront",
            aggregateId: storefront.id,
            eventType: "SUBDOMAIN_RELEASED",
            data: JSON.stringify({
              oldSlug,
              newSlug,
              reason: "superadmin_release",
            }),
            metadata: JSON.stringify({
              actor: "superadmin",
              superAdminId: auth.admin?.id ?? null,
              source: "platform/storefronts",
            }),
          },
        })
        .catch(() => undefined);
      await auditLog(req, auth.admin?.id ?? null, "RELEASE_STOREFRONT_SUBDOMAIN", id, {
        oldSlug,
        newSlug,
        tenantId: storefront.tenantId,
      });
      return NextResponse.json({
        success: true,
        storefront: { id, slug: newSlug, status: storefront.status },
        message: `زیردامنهٔ «${oldSlug}» آزاد شد — آدرس جدید فروشگاه: ${newSlug}`,
      });
    }

    return NextResponse.json({ success: false, error: "اکشن نامعتبر است" }, { status: 400 });
  } catch (error) {
    console.error("[platform/storefronts PATCH]", error);
    return NextResponse.json({ success: false, error: "خطا در انجام عملیات" }, { status: 500 });
  }
}

// ============ DELETE /api/platform/storefronts/[id]?confirm=<slug> ============
// حذف کامل فروشگاه + محتوایش. تأیید دومرحله‌ای: پارامتر confirm باید دقیقاً
// برابر اسلاگ فروشگاه باشد. آبشار (Cascade): سفارش‌ها/مشتریان/تیکت‌ها/نظرات/
// نسخه‌ها خودکار؛ متای کالاهای فروشگاه (StorefrontProductMeta) و دامنه‌های
// ثبت‌شدهٔ tenant دستی پاک می‌شوند.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    const confirm = req.nextUrl.searchParams.get("confirm") ?? "";
    const storefront = await db.storefront.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        slug: true,
        title: true,
        customDomain: true,
        status: true,
        _count: {
          select: { orders: true, customers: true, tickets: true, reviews: true, revisions: true },
        },
      },
    });
    if (!storefront) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد" }, { status: 404 });
    }
    if (confirm !== storefront.slug) {
      return NextResponse.json(
        {
          success: false,
          error: "تأیید حذف نامعتبر است — مقدار confirm باید دقیقاً برابر شناسهٔ فروشگاه (اسلاگ) باشد",
          expectedConfirm: storefront.slug,
        },
        { status: 400 }
      );
    }

    // شمارش متای کالا/دامنه‌ها برای گزارش + ممیزی
    const [metaCount, domainCount] = await Promise.all([
      db.storefrontProductMeta.count({ where: { tenantId: storefront.tenantId } }),
      db.tenantDomain.count({ where: { tenantId: storefront.tenantId } }),
    ]);

    await db.$transaction(async (tx) => {
      // متای اختصاصی کالاهای فروشگاه این tenant
      await tx.storefrontProductMeta.deleteMany({ where: { tenantId: storefront.tenantId } });
      // دامنه‌های ثبت‌شدهٔ tenant (برای همین فروشگاه) — آزاد برای دیگران
      await tx.tenantDomain.deleteMany({ where: { tenantId: storefront.tenantId } });
      // خود فروشگاه — آبشار: revisions/orders/customers/tickets/reviews
      await tx.storefront.delete({ where: { id } });
    });

    // رویداد دامنه (append-only) + ممیزی
    await db.domainEvent
      .create({
        data: {
          tenantId: storefront.tenantId,
          aggregateType: "Storefront",
          aggregateId: storefront.id,
          eventType: "STOREFRONT_DELETED",
          data: JSON.stringify({
            slug: storefront.slug,
            title: storefront.title,
            customDomain: storefront.customDomain,
            counts: { ...storefront._count, productMeta: metaCount, domains: domainCount },
          }),
          metadata: JSON.stringify({
            actor: "superadmin",
            superAdminId: auth.admin?.id ?? null,
            source: "platform/storefronts",
          }),
        },
      })
      .catch(() => undefined);
    await auditLog(req, auth.admin?.id ?? null, "DELETE_STOREFRONT", id, {
      slug: storefront.slug,
      title: storefront.title,
      customDomain: storefront.customDomain,
      tenantId: storefront.tenantId,
      deleted: {
        orders: storefront._count.orders,
        customers: storefront._count.customers,
        tickets: storefront._count.tickets,
        reviews: storefront._count.reviews,
        revisions: storefront._count.revisions,
        productMeta: metaCount,
        domains: domainCount,
      },
    });

    return NextResponse.json({
      success: true,
      message: `فروشگاه «${storefront.title}» به‌همراه همهٔ محتوایش حذف شد`,
      deleted: {
        orders: storefront._count.orders,
        customers: storefront._count.customers,
        tickets: storefront._count.tickets,
        reviews: storefront._count.reviews,
        revisions: storefront._count.revisions,
        productMeta: metaCount,
        domains: domainCount,
      },
    });
  } catch (error) {
    console.error("[platform/storefronts DELETE]", error);
    return NextResponse.json({ success: false, error: "خطا در حذف فروشگاه" }, { status: 500 });
  }
}
