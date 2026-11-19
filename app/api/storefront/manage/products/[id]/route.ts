import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { applyProductDiscount } from "@/lib/storefront-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_GALLERY = 24;

/**
 * Task 3-e — پاک‌سازی مسیر تصویر کالا/گالری:
 * فقط لینک کامل http(s) یا مسیر نسبی /uploads/... پذیرفته می‌شود
 * (بدون پیمایش دایرکتوری «..»، بدون javascript:/data: و …).
 */
function sanitizeImageUrl(raw: unknown): string | null {
  if (raw === null || raw === undefined || String(raw) === "") return null;
  const url = String(raw).trim();
  if (url.includes("..") || /[\s"'<>]/.test(url)) return null;
  if (/^https?:\/\/[^\s"'<>]+$/i.test(url)) return url.slice(0, 2048);
  if (/^\/(uploads|banners)\/[A-Za-z0-9._\/-]+$/i.test(url)) return url.slice(0, 2048);
  return null;
}

/** تبدیل ورودی قیمت (ریال — رشته/عدد، ارقام فارسی مجاز) به BigInt نامنفی */
function parseRial(raw: unknown): bigint | { error: string } {
  const s = String(raw ?? "").replace(/[_,٬،\s]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  if (!/^\d+$/.test(s)) return { error: "قیمت باید عدد صحیح بزرگ‌تر یا مساوی صفر باشد" };
  try {
    return BigInt(s);
  } catch {
    return { error: "قیمت واردشده بیش از حد بزرگ است" };
  }
}

/**
 * v20-C — PUT /api/storefront/manage/products/[id]
 * ویرایشگر حرفه‌ای کالا (ووکامرس‌مانند): فیلدهای امن Product + upsert
 * StorefrontProductMeta (تخفیف/گالری/سئو/نمایش در فروشگاه).
 *
 * auth: requireUser — همیشه tenant-scoped: کالا باید product.tenantId === user.tenantId باشد.
 *
 * بدنه (همهٔ فیلدها اختیاری — فقط همان‌هایی که ارسال شوند تغییر می‌کنند):
 *   {
 *     name?, description?, unit?, slug?,
 *     salePrice?, purchasePrice?, wholesalePrice?,   // ریال (رشته/عدد)
 *     barcode?, goodsCode?, categoryId? (id یا null),
 *     minStock?, maxStock?,
 *     imageUrl?,                                    // Task 4 — تصویر اصلی از گالری
 *     meta?: {
 *       gallery?: string[],           // ترتیب‌دار؛ [0] = تصویر اصلی
 *       discountPercent?: number|null, // ۰ تا ۹۰
 *       seoTitle?: string|null,
 *       seoDescription?: string|null,
 *       showInStore?: boolean,
 *       sortOrder?: number,
 *       tags?: string[],             // Task 4 — برچسب‌ها (تا ۱۵ مورد)
 *       weightGrams?: number|null,   // Task 4 — وزن بسته‌بندی (گرم)
 *       shippingNote?: string|null   // Task 4 — یادداشت ارسال اختصاصی
 *     }
 *   }
 *
 * پاسخ: { success, product: {...فیلدهای به‌روزشده + displayPriceRial}, message }
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

    // ── کالا حتماً باید متعلق به همین tenant باشد (جلوگیری از IDOR) ──
    const product = await db.product.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true,
        sku: true,
        name: true,
        unit: true,
        description: true,
        salePrice: true,
        purchasePrice: true,
        wholesalePrice: true,
        barcode: true,
        goodsCode: true,
        categoryId: true,
        minStock: true,
        maxStock: true,
        slug: true,
        imageUrl: true,
        storefrontMeta: true,
      },
    });
    if (!product) {
      return NextResponse.json({ success: false, error: "کالا یافت نشد" }, { status: 404 });
    }

    const productData: Record<string, unknown> = {};
    const changed: string[] = [];

    // ── نام ──
    if (b.name !== undefined) {
      const name = String(b.name ?? "").trim();
      if (name.length < 2 || name.length > 200) {
        return NextResponse.json(
          { success: false, error: "نام کالا باید ۲ تا ۲۰۰ نویسه باشد" },
          { status: 400 }
        );
      }
      if (name !== product.name) {
        productData.name = name;
        changed.push("name");
      }
    }

    // ── توضیحات (HTML از ویرایشگر غنی) ──
    if (b.description !== undefined) {
      const raw = b.description === null ? "" : String(b.description);
      if (raw.length > 20000) {
        return NextResponse.json(
          { success: false, error: "توضیحات کالا بیش از حد مجاز است (حداکثر ۲۰٬۰۰۰ نویسه)" },
          { status: 400 }
        );
      }
      const description = raw.trim() ? raw : null;
      if (description !== product.description) {
        productData.description = description;
        changed.push("description");
      }
    }

    // ── واحد شمارش ──
    if (b.unit !== undefined) {
      const unit = String(b.unit ?? "").trim().slice(0, 30);
      if (!unit) {
        return NextResponse.json({ success: false, error: "واحد شمارش کالا را وارد کنید" }, { status: 400 });
      }
      if (unit !== product.unit) {
        productData.unit = unit;
        changed.push("unit");
      }
    }

    // ── Task 4: اسلاگ لاتین کالا (URL سئوپسند) — یکتا در tenant ──
    if (b.slug !== undefined) {
      let slug: string | null = null;
      const rawSlug = String(b.slug ?? "").trim().toLowerCase();
      if (rawSlug) {
        if (!/^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/.test(rawSlug) && !/^[a-z0-9]$/.test(rawSlug)) {
          return NextResponse.json(
            { success: false, error: "اسلاگ کالا فقط حروف انگلیسی کوچک، رقم و خط تیره باشد (۲ تا ۸۰ نویسه)" },
            { status: 400 }
          );
        }
        // یکتایی در tenant (خود کالا مستثناست)
        const slugDup = await db.product.findFirst({
          where: { tenantId, slug: rawSlug, NOT: { id: product.id } },
          select: { id: true },
        });
        if (slugDup) {
          return NextResponse.json(
            { success: false, error: "این اسلاگ برای کالای دیگری گرفته شده است" },
            { status: 409 }
          );
        }
        slug = rawSlug;
      }
      if (slug !== product.slug) {
        productData.slug = slug;
        changed.push("slug");
      }
    }

    // ── Task 3-e: تصویر اصلی — لینک کامل http(s) یا مسیر امن /uploads/... ──
    if (b.imageUrl !== undefined) {
      const imageUrl = sanitizeImageUrl(b.imageUrl);
      if (b.imageUrl !== null && String(b.imageUrl) !== "" && !imageUrl) {
        return NextResponse.json(
          { success: false, error: "آدرس تصویر اصلی نامعتبر است — فقط لینک https یا مسیر /uploads/... مجاز است" },
          { status: 400 }
        );
      }
      if (imageUrl !== product.imageUrl) {
        productData.imageUrl = imageUrl;
        changed.push("imageUrl");
      }
    }

    // ── قیمت‌ها (ریال) ──
    for (const [key, field, label] of [
      ["salePrice", "salePrice", "قیمت فروش"],
      ["purchasePrice", "purchasePrice", "قیمت خرید"],
      ["wholesalePrice", "wholesalePrice", "قیمت عمده"],
    ] as const) {
      if (b[key] !== undefined) {
        const parsed = parseRial(b[key]);
        if (typeof parsed === "object" && "error" in parsed) {
          return NextResponse.json(
            { success: false, error: `${label} نامعتبر است — ${parsed.error}` },
            { status: 400 }
          );
        }
        if (parsed !== product[field]) {
          productData[field] = parsed;
          changed.push(key);
        }
      }
    }

    // ── بارکد / شناسه کالا / موجودی هشدار ──
    if (b.barcode !== undefined) {
      const barcode = String(b.barcode ?? "").trim().slice(0, 64) || null;
      if (barcode !== product.barcode) {
        productData.barcode = barcode;
        changed.push("barcode");
      }
    }
    if (b.goodsCode !== undefined) {
      const goodsCode = String(b.goodsCode ?? "").trim().slice(0, 60) || null;
      if (goodsCode !== product.goodsCode) {
        productData.goodsCode = goodsCode;
        changed.push("goodsCode");
      }
    }
    for (const key of ["minStock", "maxStock"] as const) {
      if (b[key] !== undefined) {
        const n = Number(b[key]);
        if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
          return NextResponse.json(
            { success: false, error: key === "minStock" ? "حداقل موجودی نامعتبر است" : "حداکثر موجودی نامعتبر است" },
            { status: 400 }
          );
        }
        const v = Math.trunc(n);
        if (v !== product[key]) {
          productData[key] = v;
          changed.push(key);
        }
      }
    }

    // ── دسته‌بندی ──
    if (b.categoryId !== undefined) {
      let categoryId: string | null = null;
      if (b.categoryId !== null && String(b.categoryId) !== "") {
        categoryId = String(b.categoryId);
        const cat = await db.productCategory.findFirst({
          where: { id: categoryId, tenantId, deletedAt: null },
          select: { id: true },
        });
        if (!cat) {
          return NextResponse.json(
            { success: false, error: "دسته‌بندی انتخاب‌شده یافت نشد" },
            { status: 400 }
          );
        }
      }
      if (categoryId !== product.categoryId) {
        productData.categoryId = categoryId;
        changed.push("categoryId");
      }
    }

    // ── متای اختصاصی فروشگاه (upsert) ──
    const metaInput = (b.meta && typeof b.meta === "object" ? b.meta : null) as Record<string, unknown> | null;
    const metaData: Record<string, unknown> = {};
    if (metaInput) {
      if (metaInput.gallery !== undefined) {
        let gallery: string[] = [];
        if (Array.isArray(metaInput.gallery)) {
          // Task 3-e: هر آیتم باید لینک http(s) یا مسیر امن /uploads/... باشد
          gallery = metaInput.gallery
            .map((g) => sanitizeImageUrl(g))
            .filter((g): g is string => !!g)
            .slice(0, MAX_GALLERY);
        }
        metaData.galleryJson = JSON.stringify(gallery);
        // Task 3-e: fallback کارت‌های فروشگاه — اگر تصویر اصلی خالی است ولی
        // گالری تصویر دارد، اولین تصویرِ گالری تصویر اصلی می‌شود تا همهٔ
        // قالب‌ها (که فقط imageUrl را می‌خوانند) عکس کالا را نشان دهند.
        if (b.imageUrl === undefined && !product.imageUrl && gallery.length > 0) {
          productData.imageUrl = gallery[0];
          changed.push("imageUrl");
        }
      }
      if (metaInput.discountPercent !== undefined) {
        if (metaInput.discountPercent === null || metaInput.discountPercent === "") {
          metaData.discountPercent = null;
        } else {
          const n = Number(metaInput.discountPercent);
          if (!Number.isFinite(n) || n < 0 || n > 90) {
            return NextResponse.json(
              { success: false, error: "درصد تخفیف باید بین ۰ تا ۹۰ باشد" },
              { status: 400 }
            );
          }
          metaData.discountPercent = Math.trunc(n);
        }
      }
      for (const key of ["seoTitle", "seoDescription"] as const) {
        if (metaInput[key] !== undefined) {
          const v = metaInput[key] === null ? null : String(metaInput[key]).trim().slice(0, key === "seoTitle" ? 120 : 320) || null;
          metaData[key] = v;
        }
      }
      if (metaInput.showInStore !== undefined) {
        metaData.showInStore = Boolean(metaInput.showInStore);
      }
      if (metaInput.sortOrder !== undefined) {
        const n = Number(metaInput.sortOrder);
        if (!Number.isFinite(n) || Math.abs(n) > 100000) {
          return NextResponse.json({ success: false, error: "ترتیب نمایش نامعتبر است" }, { status: 400 });
        }
        metaData.sortOrder = Math.trunc(n);
      }
      // ── Task 4: برچسب‌ها + وزن + یادداشت ارسال ──
      if (metaInput.tags !== undefined) {
        let tags: string[] = [];
        if (Array.isArray(metaInput.tags)) {
          tags = metaInput.tags
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.trim().slice(0, 40))
            .filter(Boolean)
            .slice(0, 15);
        }
        metaData.tagsJson = JSON.stringify(tags);
      }
      if (metaInput.weightGrams !== undefined) {
        if (metaInput.weightGrams === null || metaInput.weightGrams === "") {
          metaData.weightGrams = null;
        } else {
          const n = Number(metaInput.weightGrams);
          if (!Number.isFinite(n) || n < 0 || n > 10_000_000) {
            return NextResponse.json(
              { success: false, error: "وزن بسته‌بندی نامعتبر است (۰ تا ۱۰ میلیون گرم)" },
              { status: 400 }
            );
          }
          metaData.weightGrams = Math.trunc(n);
        }
      }
      if (metaInput.shippingNote !== undefined) {
        metaData.shippingNote =
          metaInput.shippingNote === null ? null : String(metaInput.shippingNote).trim().slice(0, 300) || null;
      }
    }

    if (Object.keys(productData).length === 0 && Object.keys(metaData).length === 0) {
      return NextResponse.json({ success: true, product: null, message: "تغییری برای ذخیره وجود نداشت" });
    }

    // ── اعمال ──
    let updated;
    if (Object.keys(productData).length > 0) {
      updated = await db.product.update({
        where: { id: product.id },
        data: productData,
        select: { id: true, name: true, salePrice: true, sku: true, unit: true, description: true, barcode: true, goodsCode: true, categoryId: true, minStock: true, maxStock: true, purchasePrice: true, wholesalePrice: true, slug: true, imageUrl: true, storefrontMeta: true },
      });
    } else {
      updated = {
        ...product,
        storefrontMeta: await db.storefrontProductMeta.findUnique({
          where: { tenantId_productId: { tenantId, productId: product.id } },
        }),
      };
    }

    let meta;
    if (Object.keys(metaData).length > 0) {
      meta = await db.storefrontProductMeta.upsert({
        where: { tenantId_productId: { tenantId, productId: product.id } },
        update: metaData,
        create: { tenantId, productId: product.id, ...metaData },
      });
    } else {
      meta = updated.storefrontMeta;
    }

    // قیمت نهایی پس از تخفیف (برای نمایش فوری در UI)
    const { discountPercent, displayPriceRial } = applyProductDiscount(
      updated.salePrice,
      meta?.discountPercent ?? null
    );

    // ── لاگ ممیزی ──
    await db.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "UPDATE",
        entity: "Product",
        entityId: product.id,
        changes: JSON.stringify({
          via: "storefront-product-editor",
          changed,
          meta: Object.keys(metaData),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      product: {
        id: updated.id,
        name: updated.name,
        sku: updated.sku,
        unit: updated.unit,
        description: updated.description,
        salePrice: updated.salePrice.toString(),
        purchasePrice: updated.purchasePrice.toString(),
        wholesalePrice: updated.wholesalePrice.toString(),
        barcode: updated.barcode,
        goodsCode: updated.goodsCode,
        categoryId: updated.categoryId,
        minStock: updated.minStock,
        maxStock: updated.maxStock,
        slug: updated.slug ?? null,
        imageUrl: updated.imageUrl ?? null,
        discountPercent: meta?.discountPercent ?? null,
        seoTitle: meta?.seoTitle ?? null,
        seoDescription: meta?.seoDescription ?? null,
        showInStore: meta ? meta.showInStore : true,
        sortOrder: meta?.sortOrder ?? 0,
        tags: meta?.tagsJson ? safeParseTags(meta.tagsJson) : [],
        gallery: meta?.galleryJson ? safeParseGallery(meta.galleryJson) : [],
        weightGrams: meta?.weightGrams ?? null,
        shippingNote: meta?.shippingNote ?? null,
        displayPriceRial,
      },
      message: discountPercent
        ? `کالا ذخیره شد — تخفیف ${discountPercent}٪ اعمال شد`
        : "تغییرات کالا ذخیره شد",
    });
  } catch (error) {
    console.error("[storefront manage products PUT] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیره کالا — دوباره تلاش کنید" },
      { status: 500 }
    );
  }
}

/** تجزیهٔ امن tagsJson */
function safeParseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((t): t is string => typeof t === "string").slice(0, 15);
  } catch {
    /* ignore */
  }
  return [];
}

/** تجزیهٔ امن galleryJson */
function safeParseGallery(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((g): g is string => typeof g === "string").slice(0, MAX_GALLERY);
  } catch {
    /* ignore */
  }
  return [];
}
