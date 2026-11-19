import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getStorefrontByTenant } from "@/lib/storefront-auth";
import { checkStorefrontAccess } from "@/lib/storefront-access";
import { validateStorefrontSlug } from "@/lib/storefront";
import {
  getBusinessType,
  suggestStoreSlugCandidates,
  suggestDomainCandidates,
  buildDefaultContent,
  STOREFRONT_BUSINESS_TYPES,
  STOREFRONT_TEMPLATE_V2_IDS,
} from "@/lib/storefront-wizard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/storefront/manage/wizard — ویزارد سایت‌ساز هوشمند (R16)
 * بدنه: { businessType, businessName, city?, phone?, template?, slug?, preview?, applyCategories? }
 * خروجی: پیکربندی خودکار کامل (قالب پیشنهادی + محتوا + سئو + اسلاگ‌های آزاد + دامنه‌ها)
 * preview=true → فقط محاسبه و برگرداندن (بدون ذخیره)
 * preview=false → ذخیره روی Storefront (upsert) + wizardDone=true + دسته‌بندی خودکار اختیاری
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    const businessTypeId = String(b.businessType ?? "").trim();
    if (!STOREFRONT_BUSINESS_TYPES.some((t) => t.id === businessTypeId)) {
      return NextResponse.json({ success: false, error: "نوع کسب‌وکار را انتخاب کنید" }, { status: 400 });
    }
    const businessName = String(b.businessName ?? "").trim();
    if (businessName.length < 2 || businessName.length > 60) {
      return NextResponse.json({ success: false, error: "نام کسب‌وکار باید ۲ تا ۶۰ نویسه باشد" }, { status: 400 });
    }
    const city = b.city === undefined || b.city === null ? null : String(b.city).trim().slice(0, 60) || null;
    const phone = b.phone === undefined || b.phone === null ? null : String(b.phone).trim().slice(0, 30) || null;

    const cfg = getBusinessType(businessTypeId)!;

    // قالب: انتخاب کاربر از میان ۳ پیشنهادی (یا هر قالب v2)
    const requestedTemplate = typeof b.template === "string" ? b.template : "";
    const template =
      STOREFRONT_TEMPLATE_V2_IDS.includes(requestedTemplate) &&
      (requestedTemplate === cfg.recommendedTemplate || cfg.altTemplates.includes(requestedTemplate))
        ? requestedTemplate
        : cfg.recommendedTemplate;

    // اسلاگ: انتخاب کاربر یا اولین پیشنهادِ آزاد
    const slugCandidates = suggestStoreSlugCandidates(businessName, businessTypeId);
    let chosenSlug = "";
    const slugInput = typeof b.slug === "string" ? b.slug : "";
    if (slugInput) {
      const v = validateStorefrontSlug(slugInput);
      if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 });
      chosenSlug = v.slug;
    }
    const taken = new Set(
      (
        await db.storefront.findMany({
          where: { slug: { in: [...slugCandidates, chosenSlug].filter(Boolean) }, tenantId: { not: tenantId } },
          select: { slug: true },
        })
      ).map((s) => s.slug)
    );
    const freeCandidates = slugCandidates.filter((s) => !taken.has(s));
    if (!chosenSlug) {
      chosenSlug = freeCandidates[0] ?? slugCandidates[0] ?? `shop-${Date.now().toString(36)}`;
    }
    if (taken.has(chosenSlug)) {
      return NextResponse.json(
        { success: false, error: "این نام فروشگاه قبلاً گرفته شده — یکی از پیشنهادها را انتخاب کنید", freeCandidates },
        { status: 409 }
      );
    }

    // محتوای اولیهٔ هوشمند (بنر/بخش‌ها/هدر/فوتر) — کاستومایز برای این کسب‌وکار
    const content = buildDefaultContent(businessTypeId, businessName, city);

    // سئوی خودکار
    const seoTitle = `${businessName} | خرید آنلاین از ${cfg.label}`;
    const seoDescription = `خرید آنلاین از ${businessName}${city ? ` در ${city}` : ""} — ${cfg.heroSubtitle.slice(0, 150)}`.slice(0, 300);

    const announcement = city
      ? `ارسال سریع به ${city} و شهرهای اطراف — سفارش آنلاین بدون معطلی`
      : `سفارش آنلاین — ارسال سریع و مطمئن`;

    const domainCandidates = suggestDomainCandidates(businessName, businessTypeId);

    // ── دسته‌بندی خودکار کالاهای بدون دسته ──
    const applyCategories = b.applyCategories !== false; // پیش‌فرض: انجام بده
    async function runCategorization(): Promise<{ assigned: number; categories: string[] }> {
      const products = await db.product.findMany({
        where: { tenantId, deletedAt: null, OR: [{ categoryId: null }, { categoryId: "" }] },
        select: { id: true, name: true },
        take: 500,
      });
      if (products.length === 0) return { assigned: 0, categories: [] };

      const { categorizeProductByName } = await import("@/lib/storefront-wizard");
      // دسته‌های موجود tenant
      const existing = await db.productCategory.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, name: true },
      });
      const catMap = new Map(existing.map((c) => [c.name, c.id]));
      // دسته‌های پیش‌فرضِ این کسب‌وکار را بساز (اگر نبود)
      for (const name of cfg.defaultCategories) {
        if (!catMap.has(name)) {
          const created = await db.productCategory.create({
            data: { tenantId, name },
            select: { id: true, name: true },
          });
          catMap.set(name, created.id);
        }
      }
      let assigned = 0;
      const usedCats = new Set<string>();
      for (const p of products) {
        const res = categorizeProductByName(p.id, p.name, cfg);
        const catId = catMap.get(res.category);
        if (catId) {
          await db.product.update({ where: { id: p.id }, data: { categoryId: catId } });
          assigned += 1;
          usedCats.add(res.category);
        }
      }
      return { assigned, categories: [...usedCats] };
    }

    const preview = b.preview === true;
    let categorizeResult: { assigned: number; categories: string[] } | null = null;

    if (preview) {
      return NextResponse.json({
        success: true,
        preview: {
          businessType: businessTypeId,
          businessTypeLabel: cfg.label,
          template,
          alternativeTemplates: [cfg.recommendedTemplate, ...cfg.altTemplates].filter((t) => t !== template),
          slug: chosenSlug,
          slugCandidates: freeCandidates.length > 0 ? freeCandidates : slugCandidates,
          domainCandidates,
          content,
          seoTitle,
          seoDescription,
          announcement,
          banner: `/banners/${cfg.banner}.avif`,
          defaultCategories: cfg.defaultCategories,
        },
      });
    }

    // ── ذخیره (upsert) ──
    if (applyCategories) {
      try {
        categorizeResult = await runCategorization();
      } catch (e) {
        console.warn("[wizard] categorization failed (non-blocking):", e);
      }
    }

    const existing = await getStorefrontByTenant(tenantId);
    const data = {
      tenantId,
      slug: chosenSlug,
      title: businessName,
      // توضیح را فقط وقتی خودکار می‌گذاریم که مالک قبلاً توضیح دستی نگذاشته باشد
      description: existing?.description ?? content.banner.subtitle,
      template,
      businessType: businessTypeId,
      announcement,
      content: JSON.stringify(content),
      wizardDone: true,
      phone: phone ?? existing?.phone ?? null,
      city: city ?? existing?.city ?? null,
      seoTitle: existing?.seoTitle ?? seoTitle,
      seoDescription: existing?.seoDescription ?? seoDescription,
      // فیلدهای موجود را خراب نکن:
      accentColor: existing?.accentColor ?? null,
      isActive: existing?.isActive ?? false,
      address: existing?.address ?? null,
      lat: existing?.lat ?? null,
      lng: existing?.lng ?? null,
      socialInstagram: existing?.socialInstagram ?? null,
      socialTelegram: existing?.socialTelegram ?? null,
      socialWhatsapp: existing?.socialWhatsapp ?? null,
      cardNumberEnc: existing?.cardNumberEnc ?? null,
      cardHolderName: existing?.cardHolderName ?? null,
      cardImage: existing?.cardImage ?? null,
    };

    const storefront = await db.storefront.upsert({
      where: { tenantId },
      update: data,
      create: data,
      select: { id: true, slug: true, title: true, template: true, wizardDone: true, isActive: true },
    });

    await db.auditLog.create({
      data: {
        tenantId,
        userId: auth.user.userId,
        action: existing ? "UPDATE" : "CREATE",
        entity: "Storefront",
        entityId: storefront.id,
        changes: JSON.stringify({
          wizard: true,
          businessType: businessTypeId,
          template,
          slug: chosenSlug,
          categorized: categorizeResult?.assigned ?? 0,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      shop: storefront,
      categorize: categorizeResult,
      domainCandidates,
      message: "سایت فروشگاه شما با تنظیمات هوشمند ساخته شد",
    });
  } catch (error) {
    console.error("[storefront wizard POST] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در ساخت پیکربندی فروشگاه" }, { status: 500 });
  }
}

/** GET — فهرست انواع کسب‌وکار + وضعیت ویزارد + گیت پلن برای UI */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;

    const storefront = await getStorefrontByTenant(auth.user.tenantId);
    // Task 1-a — گیت دسترسی از lib/storefront-access (پلن حرفه‌ای/سازمانی یا override سوپرادمین)
    const access = await checkStorefrontAccess(auth.user.tenantId, auth.user.userId);
    const planOk = access.allowed; // سازگاری با کلاینت‌های قبلی — منبع حقیقی: access

    return NextResponse.json({
      success: true,
      businessTypes: STOREFRONT_BUSINESS_TYPES.map((t) => ({
        id: t.id,
        label: t.label,
        recommendedTemplate: t.recommendedTemplate,
        altTemplates: t.altTemplates,
        banner: `/banners/${t.banner}.avif`,
        defaultCategories: t.defaultCategories,
        trustNotes: t.trustNotes,
      })),
      current: storefront
        ? {
            wizardDone: storefront.wizardDone,
            businessType: storefront.businessType,
            template: storefront.template,
            slug: storefront.slug,
            isActive: storefront.isActive,
          }
        : null,
      planOk,
      access,
    });
  } catch (error) {
    console.error("[storefront wizard GET] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در دریافت اطلاعات ویزارد" }, { status: 500 });
  }
}
