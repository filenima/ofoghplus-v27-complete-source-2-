// Task ID: 1-a — GET / PUT تنظیمات فروشگاه مالک (auth: requireUser)
// گیت فعال‌سازی عمومی از Task 1-a: lib/storefront-access (پلن حرفه‌ای/سازمانی
// یا دسترسی ویژهٔ سوپرادمین به‌جای الزام لایسنس خریداری‌شده)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { checkStorefrontAccess } from "@/lib/storefront-access";
import { getStorefrontByTenant, decryptCardNumber, encryptCardNumber } from "@/lib/storefront-auth";
import {
  validateStorefrontSlug,
  isValidStorefrontTemplate,
  normalizeCardNumber,
  isValidCardNumber,
  formatCardNumberForDisplay,
} from "@/lib/storefront";
import { sanitizeStorefrontContent } from "@/lib/storefront-wizard";
import { format as formatJalali } from "date-fns-jalali";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** R26 — وضعیت بلوک‌ها در لحظهٔ ذخیرهٔ کلاسیک (برای اسنپ‌شات تاریخچه) */
function storefront_blocksJsonSafe(raw: string | null | undefined): string {
  if (!raw) return "{}";
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    return "{}";
  }
}

// GET /api/storefront/manage — تنظیمات + آمار فروشگاه مالک (auth: requireUser)
// Task 1-a: فیلد access اضافه شد تا UI وضعیت دسترسی (پلن/ویژه/مسدود) را درست رندر کند
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId, userId } = auth.user;

    // Task 1-a — وضعیت دسترسی فعال‌سازی عمومی (پلن یا override یا کلید اصلی)
    const access = await checkStorefrontAccess(tenantId, userId);

    const storefront = await getStorefrontByTenant(tenantId);

    // آمار — همیشه محاسبه می‌شود (حتی قبل از فعال‌سازی برای پیش‌نمایش)
    const stats = {
      ordersByStatus: { PENDING: 0, AWAITING_RECEIPT: 0, AWAITING_APPROVAL: 0, APPROVED: 0, REJECTED: 0, SHIPPED: 0 } as Record<string, number>,
      approvedRevenueRial: "0",
      totalOrders: 0,
      views: 0,
      customers: 0,
      products: 0,
      openTickets: 0, // R17-C — بج تب تیکت‌ها در داشبورد مالک
      // ─── Task 4: آمار نوار داشبورد حرفه‌ای ───
      ordersToday: 0, // سفارش‌های امروز (همهٔ وضعیت‌ها)
      pendingReviews: 0, // نظرات در انتظار تأیید
      lowStockCount: 0, // کالاهای کم‌موجودی (مجموع انبار ≤ حداقل موجودی)
    };
    const productsCount = await db.product.count({ where: { tenantId, deletedAt: null } });
    stats.products = productsCount;

    if (storefront) {
      const grouped = await db.storefrontOrder.groupBy({
        by: ["status"],
        where: { storefrontId: storefront.id },
        _count: { _all: true },
      });
      for (const g of grouped) stats.ordersByStatus[g.status] = g._count._all;
      stats.totalOrders = grouped.reduce((sum, g) => sum + g._count._all, 0);

      const revenue = await db.storefrontOrder.aggregate({
        where: { storefrontId: storefront.id, status: { in: ["APPROVED", "SHIPPED"] } },
        _sum: { totalRial: true },
      });
      stats.approvedRevenueRial = (revenue._sum.totalRial ?? 0n).toString();
      stats.views = storefront.viewCount;
      stats.customers = await db.storefrontCustomer.count({ where: { storefrontId: storefront.id } });
      stats.openTickets = await db.storefrontTicket.count({ where: { storefrontId: storefront.id, status: "OPEN" } });

      // Task 4 — سفارش‌های امروز (از نیمه‌شب به وقت تهران)
      const tehranNow = new Date(Date.now() + 3.5 * 60 * 60 * 1000);
      const tehranMidnight = new Date(Date.UTC(tehranNow.getUTCFullYear(), tehranNow.getUTCMonth(), tehranNow.getUTCDate()) - 3.5 * 60 * 60 * 1000);
      stats.ordersToday = await db.storefrontOrder.count({
        where: { storefrontId: storefront.id, createdAt: { gte: tehranMidnight } },
      });
      stats.pendingReviews = await db.storefrontReview.count({
        where: { storefrontId: storefront.id, status: "PENDING" },
      });
    }

    // Task 4 — کالاهای کم‌موجودی (فقط کالاهایی که ردیف انبار دارند و به زیر حداقل رسیده‌اند)
    try {
      const lowStock = await db.stockItem.groupBy({
        by: ["productId"],
        where: { tenantId },
        _sum: { quantity: true },
      });
      if (lowStock.length > 0) {
        const minMap = await db.product.findMany({
          where: { tenantId, deletedAt: null, id: { in: lowStock.map((r) => r.productId) } },
          select: { id: true, minStock: true },
        });
        const minById = new Map(minMap.map((p) => [p.id, p.minStock]));
        stats.lowStockCount = lowStock.filter((r) => {
          const min = minById.get(r.productId) ?? 0;
          return min > 0 && (r._sum.quantity ?? 0) <= min;
        }).length;
      }
    } catch {
      /* آمار مکمل است — نبودش جریان اصلی را نمی‌شکند */
    }

    const shop = storefront
      ? {
          id: storefront.id,
          slug: storefront.slug,
          title: storefront.title,
          description: storefront.description,
          template: storefront.template,
          accentColor: storefront.accentColor,
          isActive: storefront.isActive,
          phone: storefront.phone,
          address: storefront.address,
          city: storefront.city,
          lat: storefront.lat,
          lng: storefront.lng,
          socialInstagram: storefront.socialInstagram,
          socialTelegram: storefront.socialTelegram,
          socialWhatsapp: storefront.socialWhatsapp,
          // کارت کامل رمزگشایی می‌شود تا فرم قابل ویرایش باشد؛ نمایش پنل ماسک می‌شود
          cardNumber: formatCardNumberForDisplay(decryptCardNumber(storefront.cardNumberEnc)),
          cardNumberSet: !!storefront.cardNumberEnc,
          cardHolderName: storefront.cardHolderName,
          cardImage: storefront.cardImage,
          seoTitle: storefront.seoTitle,
          seoDescription: storefront.seoDescription,
          createdAt: storefront.createdAt.toISOString(),
          // R16
          businessType: storefront.businessType,
          content: storefront.content ? JSON.parse(storefront.content) : null,
          wizardDone: storefront.wizardDone,
          announcement: storefront.announcement,
          discountCode: storefront.discountCode,
          discountPercent: storefront.discountPercent,
          ticketEnabled: storefront.ticketEnabled,
          customDomain: storefront.customDomain,
          logoImage: storefront.logoImage,
          // Task 1-c — درگاه پرداخت اختصاصی
          gatewayMerchantId: storefront.gatewayMerchantId,
          gatewaySandbox: storefront.gatewaySandbox,
        }
      : null;

    return NextResponse.json({ success: true, shop, stats, access });
  } catch (error) {
    console.error("[storefront manage GET] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت تنظیمات فروشگاه" },
      { status: 500 }
    );
  }
}

// PUT /api/storefront/manage — upsert تنظیمات (ایجاد اگر نبود)
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId, userId } = auth.user;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    const existing = await getStorefrontByTenant(tenantId);

    // ── slug: هنگام ایجاد الزامی؛ هنگام ویرایش فقط اگر ارسال شده باشد ──
    let slug: string;
    if (existing) {
      const slugInput = b.slug === undefined ? existing.slug : String(b.slug);
      const v = validateStorefrontSlug(slugInput);
      if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 });
      slug = v.slug;
      if (slug !== existing.slug) {
        const taken = await db.storefront.findFirst({
          where: { slug, tenantId: { not: tenantId } },
          select: { id: true },
        });
        if (taken) {
          return NextResponse.json(
            { success: false, error: "این نام فروشگاه قبلاً گرفته شده است" },
            { status: 409 }
          );
        }
      }
    } else {
      const v = validateStorefrontSlug(b.slug);
      if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 });
      slug = v.slug;
      const taken = await db.storefront.findFirst({
        where: { slug, tenantId: { not: tenantId } },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json(
          { success: false, error: "این نام فروشگاه قبلاً گرفته شده است" },
          { status: 409 }
        );
      }
    }

    // ── عنوان: الزامی ──
    const title = String(b.title ?? existing?.title ?? "").trim();
    if (title.length < 2 || title.length > 100) {
      return NextResponse.json(
        { success: false, error: "عنوان فروشگاه باید ۲ تا ۱۰۰ نویسه باشد" },
        { status: 400 }
      );
    }

    const str = (key: string, max: number): string | null | undefined => {
      if (!(key in b)) return undefined;
      if (b[key] === null) return null;
      const v = String(b[key]).trim();
      return v ? v.slice(0, max) : null;
    };

    // قالب
    let template = existing?.template ?? "modern";
    if (b.template !== undefined) {
      const t = String(b.template);
      if (!isValidStorefrontTemplate(t)) {
        return NextResponse.json(
          { success: false, error: "قالب انتخابی نامعتبر است" },
          { status: 400 }
        );
      }
      template = t;
    }

    // رنگ تاکیدی — hex ۶/۷ نویسه یا خالی
    let accentColor = existing?.accentColor ?? null;
    if (b.accentColor !== undefined) {
      const a = String(b.accentColor ?? "").trim();
      if (a && !/^#?[0-9a-fA-F]{6}$/.test(a)) {
        return NextResponse.json(
          { success: false, error: "رنگ تاکیدی باید کد hex معتبر باشد (مثال: 10b981)" },
          { status: 400 }
        );
      }
      accentColor = a ? (a.startsWith("#") ? a : `#${a}`) : null;
    }

    // موقعیت — بازه منطقی ایران/جهان
    let lat = existing?.lat ?? null;
    let lng = existing?.lng ?? null;
    if ("lat" in b || "lng" in b) {
      const latNum = b.lat === null || b.lat === undefined || b.lat === "" ? null : Number(b.lat);
      const lngNum = b.lng === null || b.lng === undefined || b.lng === "" ? null : Number(b.lng);
      for (const [label, v] of [["عرض", latNum], ["طول", lngNum]] as const) {
        if (v !== null && (!Number.isFinite(v) || Math.abs(v) > 180)) {
          return NextResponse.json(
            { success: false, error: `${label} جغرافیایی معتبر نیست` },
            { status: 400 }
          );
        }
      }
      lat = latNum;
      lng = lngNum;
    }

    // کارت پرداخت — نرمال‌سازی + اعتبارسنجی شماره؛ خالی = حذف
    let cardNumberEnc = existing?.cardNumberEnc ?? null;
    if ("cardNumber" in b) {
      if (b.cardNumber === null || String(b.cardNumber).trim() === "") {
        cardNumberEnc = null;
      } else {
        const digits = normalizeCardNumber(String(b.cardNumber));
        if (!isValidCardNumber(digits)) {
          return NextResponse.json(
            { success: false, error: "شماره کارت باید ۱۶ رقم (یا کارت ۱۹-۲۰ رقمی) باشد" },
            { status: 400 }
          );
        }
        cardNumberEnc = encryptCardNumber(digits);
      }
    }

    // فعال‌سازی
    let isActive = existing?.isActive ?? false;
    if (b.isActive !== undefined) isActive = Boolean(b.isActive);
    // فعال‌سازی بدون کارت پرداخت مجاز است ولی هشدار می‌دهد (UI راهنمایی می‌کند)

    // ── Task 1-a: گیت دسترسی فعال‌سازی عمومی ──
    // پلن حرفه‌ای/سازمانی کافی است؛ سوپرادمین می‌تواند به هر کاربر دسترسی ویژه
    // بدهد (granted) یا حتی با پلن حرفه‌ای مسدودش کند (denied)؛ کلید اصلی سامانه
    // هم می‌تواند فروشگاه را موقتاً خاموش کند (master_off).
    // FIX(1-a): گیت فقط برای «انتقال به فعال» نیست — هر ذخیره‌ای که در آن
    // isActive=true است باید دسترسی را تأیید کند؛ اگر دسترسی در همین فاصله
    // مسدود شده باشد، فروشگاهِ از قبل فعال نیز اجباراً غیرعمومی می‌شود.
    let accessWarning: string | null = null;
    if (isActive) {
      const access = await checkStorefrontAccess(tenantId, userId);
      if (!access.allowed) {
        const payloadByReason: Record<string, { code: string; error: string }> = {
          plan_required: {
            code: "PLAN_REQUIRED",
            error: "فعال‌سازی عمومی فروشگاه در پلن‌های حرفه‌ای و سازمانی فعال است — پلن خود را ارتقا دهید یا از مدیر درخواست دسترسی ویژه کنید",
          },
          override_denied: {
            code: "ACCESS_DENIED",
            error: "دسترسی فروشگاه آنلاین برای این حساب توسط مدیر سیستم مسدود شده است",
          },
          master_off: {
            code: "MASTER_OFF",
            error: "فروشگاه آنلاین موقتاً توسط مدیر سیستم غیرفعال است",
          },
        };
        const p = payloadByReason[access.reason] ?? payloadByReason.plan_required;
        if (!existing?.isActive) {
          // تلاش برای فعال‌سازی جدید → خطای ۴۰۲ با پیام دلیل
          return NextResponse.json(
            { success: false, error: p.error, code: p.code, access },
            { status: 402 }
          );
        }
        // فروشگاه از قبل فعال بود ولی دسترسی الان مسدود است → خاموش اجباری
        isActive = false;
        accessWarning = p.error;
      }
    }

    // ── R16: فیلدهای سایت‌ساز هوشمند ──
    let businessType = existing?.businessType ?? null;
    if (b.businessType !== undefined) {
      businessType = b.businessType === null || String(b.businessType).trim() === "" ? null : String(b.businessType).trim().slice(0, 40);
    }

    let content = existing?.content ?? null;
    if (b.content !== undefined) {
      if (b.content === null) {
        content = null;
      } else {
        const sanitized = sanitizeStorefrontContent(b.content);
        if (!sanitized) {
          return NextResponse.json({ success: false, error: "ساختار محتوای ویرایش‌شده معتبر نیست" }, { status: 400 });
        }
        content = JSON.stringify(sanitized);
      }
    }

    let announcement = existing?.announcement ?? null;
    if (b.announcement !== undefined) {
      announcement = b.announcement === null ? null : String(b.announcement).trim().slice(0, 200) || null;
    }

    // تخفیف فروشگاه — کد + درصد با هم معنا دارند
    let discountCode = existing?.discountCode ?? null;
    if (b.discountCode !== undefined) {
      discountCode = b.discountCode === null ? null : String(b.discountCode).trim().toUpperCase().slice(0, 32) || null;
    }

    // ── Task 1-c: درگاه پرداخت آنلاین اختصاصی مالک (زرین‌پال) ──
    let gatewayMerchantId = existing?.gatewayMerchantId ?? null;
    if (b.gatewayMerchantId !== undefined) {
      const raw = b.gatewayMerchantId === null ? "" : String(b.gatewayMerchantId).trim();
      if (raw === "") {
        gatewayMerchantId = null;
      } else if (!/^[0-9a-fA-F-]{16,64}$/.test(raw)) {
        return NextResponse.json(
          { success: false, error: "کد پذیرندگی زرین‌پال معتبر نیست (UUID ۳۶ کاراکتری)" },
          { status: 400 }
        );
      } else {
        gatewayMerchantId = raw.toLowerCase();
      }
    }
    let gatewaySandbox = existing?.gatewaySandbox ?? false;
    if (b.gatewaySandbox !== undefined) gatewaySandbox = Boolean(b.gatewaySandbox);
    let discountPercent = existing?.discountPercent ?? null;
    if (b.discountPercent !== undefined) {
      if (b.discountPercent === null || b.discountPercent === "") {
        discountPercent = null;
      } else {
        const n = Number(b.discountPercent);
        if (!Number.isFinite(n) || n < 1 || n > 50) {
          return NextResponse.json(
            { success: false, error: "درصد تخفیف باید بین ۱ تا ۵۰ باشد" },
            { status: 400 }
          );
        }
        discountPercent = Math.trunc(n);
      }
    }
    // یکی هست دیگری نیست → هر دو بی‌اثر (کد بدون درصد یا درصد بدون کد معنا ندارد)
    if (!discountCode || !discountPercent) {
      discountCode = discountCode && discountPercent ? discountCode : null;
      discountPercent = discountCode && discountPercent ? discountPercent : null;
    }

    let ticketEnabled = existing?.ticketEnabled ?? false;
    if (b.ticketEnabled !== undefined) ticketEnabled = Boolean(b.ticketEnabled);

    let customDomain = existing?.customDomain ?? null;
    if (b.customDomain !== undefined) {
      const raw = String(b.customDomain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
      if (raw && !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(raw)) {
        return NextResponse.json({ success: false, error: "قالب دامنهٔ اختصاصی معتبر نیست (مثال: my-shop.ir)" }, { status: 400 });
      }
      customDomain = raw || null;
    }

    let logoImage = existing?.logoImage ?? null;
    if (b.logoImage !== undefined) {
      const raw = String(b.logoImage ?? "").trim();
      logoImage = raw.startsWith("/uploads/storefront/") || raw.startsWith("/banners/") ? raw.slice(0, 300) : null;
    }

    let wizardDone = existing?.wizardDone ?? false;
    if (b.wizardDone !== undefined) wizardDone = Boolean(b.wizardDone);

    const data = {
      tenantId,
      slug,
      title,
      description: str("description", 2000) ?? existing?.description ?? null,
      template,
      accentColor,
      isActive,
      phone: str("phone", 30) ?? existing?.phone ?? null,
      address: str("address", 300) ?? existing?.address ?? null,
      city: str("city", 60) ?? existing?.city ?? null,
      lat,
      lng,
      socialInstagram: str("socialInstagram", 100) ?? existing?.socialInstagram ?? null,
      socialTelegram: str("socialTelegram", 100) ?? existing?.socialTelegram ?? null,
      socialWhatsapp: str("socialWhatsapp", 100) ?? existing?.socialWhatsapp ?? null,
      cardNumberEnc,
      cardHolderName: str("cardHolderName", 80) ?? existing?.cardHolderName ?? null,
      cardImage: str("cardImage", 300) ?? existing?.cardImage ?? null,
      seoTitle: str("seoTitle", 100) ?? existing?.seoTitle ?? null,
      seoDescription: str("seoDescription", 300) ?? existing?.seoDescription ?? null,
      // R16
      businessType,
      content,
      announcement,
      discountCode,
      discountPercent,
      ticketEnabled,
      customDomain,
      logoImage,
      wizardDone,
      // Task 1-c — درگاه اختصاصی
      gatewayMerchantId,
      gatewaySandbox,
    };

    const storefront = await db.storefront.upsert({
      where: { tenantId },
      update: data,
      create: data,
      select: {
        id: true,
        slug: true,
        title: true,
        isActive: true,
        template: true,
      },
    });

    // ── R26: تاریخچهٔ تغییرات — هر ذخیرهٔ محتوای ویرایشگر کلاسیک یک اسنپ‌شات ──
    // فقط وقتی content واقعاً تغییر کرده (نه تکرار ذخیرهٔ بدون تغییر)
    if (b.content !== undefined && content !== null && content !== existing?.content) {
      try {
        const label = `ذخیرهٔ ویرایشگر — ${formatJalali(new Date(), "yyyy/MM/dd HH:mm")}`;
        await db.storefrontRevision.create({
          data: {
            storefrontId: storefront.id,
            kind: "content",
            label,
            blocksJson: storefront_blocksJsonSafe(existing?.blocksJson),
            contentJson: content,
            blockCount: 0,
            createdById: userId,
          },
        });
        // نگه‌داشتن فقط ۳۰ نسخهٔ آخر (قدیمی‌ها حذف می‌شوند)
        const keep = await db.storefrontRevision.findMany({
          where: { storefrontId: storefront.id },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { id: true },
        });
        if (keep.length === 30) {
          await db.storefrontRevision.deleteMany({
            where: { storefrontId: storefront.id, id: { notIn: keep.map((r) => r.id) } },
          });
        }
      } catch (revErr) {
        // تاریخچه مکمل است — خطایش جریان ذخیره را نمی‌شکند
        console.warn("[storefront manage PUT] revision snapshot failed:", revErr instanceof Error ? revErr.message : revErr);
      }
    }

    // لاگ ممیزی
    await db.auditLog.create({
      data: {
        tenantId,
        userId: auth.user.userId,
        action: existing ? "UPDATE" : "CREATE",
        entity: "Storefront",
        entityId: storefront.id,
        changes: JSON.stringify({
          slug: storefront.slug,
          title: storefront.title,
          isActive: storefront.isActive,
          template: storefront.template,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      shop: storefront,
      message: existing ? "تنظیمات فروشگاه ذخیره شد" : "فروشگاه شما ساخته شد",
      ...(accessWarning ? { warning: accessWarning } : {}),
    });
  } catch (error) {
    console.error("[storefront manage PUT] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیره تنظیمات فروشگاه" },
      { status: 500 }
    );
  }
}
