import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getStorefrontByTenant } from "@/lib/storefront-auth";
import { sanitizeBlocksDoc, parseBlocksDoc } from "@/lib/storefront-blocks";
import { format as formatJalali } from "date-fns-jalali";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * R24-4 — سند بلوک‌های صفحهٔ فروشگاه (Gutenberg-مانند)
 *
 * GET  /api/storefront/manage/blocks → { draft, published } (هر دو SfBlocksDoc | null)
 * PUT  { draft }                      → ذخیرهٔ خودکار پیش‌نویس (sanitize عمیق سمت سرور)
 * POST { action: "publish" }          → انتشار پیش‌نویس روی سایت عمومی + ساخت نسخهٔ پشتیبان
 * POST { action: "unpublish" }        → لغو انتشار (بازگشت به قالب کلاسیک)
 */

const MAX_REVISIONS = 20;

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      draft: parseBlocksDoc(storefront.blocksDraftJson),
      published: parseBlocksDoc(storefront.blocksJson),
      publishedAt: storefront.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("[storefront blocks GET] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در دریافت بلوک‌های صفحه" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const rawDraft = (body as Record<string, unknown> | null)?.draft;
    // R25-A2/B1 — سند خالی معتبر است: کاربر همهٔ بلوک‌ها را پاک کرده (پیش‌نویس خالی می‌شود).
    // قبلاً sanitizeBlocksDoc برای آرایهٔ خالی null می‌داد و autosave بعد از حذف آخرین
    // بلوک همیشه ۴۰۰ می‌گرفت و نشانگر «خطا در ذخیرهٔ خودکار!» دائمی می‌شد.
    const isEmptyDraft =
      !!rawDraft && typeof rawDraft === "object" && Array.isArray((rawDraft as { blocks?: unknown }).blocks)
        && ((rawDraft as { blocks: unknown[] }).blocks.length === 0);
    const doc = isEmptyDraft ? { version: 1 as const, blocks: [] } : sanitizeBlocksDoc(rawDraft);
    if (!doc) {
      return NextResponse.json(
        { success: false, error: "ساختار بلوک‌ها نامعتبر است — بیش از ۴۰ بلوک یا فیلد خراب" },
        { status: 400 }
      );
    }

    await db.storefront.update({
      where: { id: storefront.id },
      data: { blocksDraftJson: JSON.stringify(doc) },
    });

    return NextResponse.json({
      success: true,
      message: "پیش‌نویس ذخیره شد",
      blockCount: doc.blocks.length,
    });
  } catch (error) {
    console.error("[storefront blocks PUT] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در ذخیرهٔ پیش‌نویس" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId, userId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "publish");

    if (action === "unpublish") {
      await db.storefront.update({
        where: { id: storefront.id },
        data: { blocksJson: null },
      });
      return NextResponse.json({
        success: true,
        message: "انتشار لغو شد — سایت عمومی به نمایش قالب کلاسیک برمی‌گردد",
      });
    }

    if (action !== "publish") {
      return NextResponse.json({ success: false, error: "عملیات نامعتبر" }, { status: 400 });
    }

    // انتشار: سند از پیش‌نویس (یا بدنهٔ درخواست اگر داده شد) با sanitize سرور
    const rawDoc = body.blocks ?? parseBlocksDoc(storefront.blocksDraftJson);
    const doc = sanitizeBlocksDoc(rawDoc);
    if (!doc || doc.blocks.length === 0) {
      return NextResponse.json(
        { success: false, error: "پیش‌نویسی برای انتشار نیست — ابتدا بلوک‌ها را بسازید و ذخیره کنید" },
        { status: 400 }
      );
    }

    const docJson = JSON.stringify(doc);
    const label = `انتشار ${formatJalali(new Date(), "yyyy/MM/dd HH:mm")} — ${doc.blocks.length} بلوک`;

    await db.$transaction([
      db.storefront.update({
        where: { id: storefront.id },
        data: { blocksJson: docJson },
      }),
      db.storefrontRevision.create({
        data: {
          storefrontId: storefront.id,
          label,
          blocksJson: docJson,
          blockCount: doc.blocks.length,
          createdById: userId,
        },
      }),
    ]);

    // نگه‌داشتن فقط ۲۰ نسخهٔ آخر
    const keep = await db.storefrontRevision.findMany({
      where: { storefrontId: storefront.id },
      orderBy: { createdAt: "desc" },
      take: MAX_REVISIONS,
      select: { id: true },
    });
    if (keep.length === MAX_REVISIONS) {
      await db.storefrontRevision.deleteMany({
        where: { storefrontId: storefront.id, id: { notIn: keep.map((r) => r.id) } },
      });
    }

    return NextResponse.json({
      success: true,
      message: `صفحه با ${doc.blocks.length} بلوک منتشر شد — همین حالا در سایت عمومی شما دیده می‌شود`,
      blockCount: doc.blocks.length,
    });
  } catch (error) {
    console.error("[storefront blocks POST] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در انتشار صفحه" }, { status: 500 });
  }
}
