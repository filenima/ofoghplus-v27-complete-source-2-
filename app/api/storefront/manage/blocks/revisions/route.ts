import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getStorefrontByTenant } from "@/lib/storefront-auth";
import { sanitizeStorefrontContent, type StorefrontContent } from "@/lib/storefront-wizard";
import { format as formatJalali } from "date-fns-jalali";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * R24-4 + R26 — تاریخچهٔ نسخه‌های صفحه (StorefrontRevision)
 *
 * GET    /api/storefront/manage/blocks/revisions → ۳۰ نسخهٔ آخر + خلاصهٔ تغییرات
 *        (پاسخ با UI قبلی ویرایشگر بلوکی سازگار است؛ kind و changes اضافه شدند)
 * POST   { id, publish? } → بازگردانی نسخه:
 *        - kind=content → محتوای کلاسیک همان لحظه روی سایت عمومی اعمال می‌شود
 *        - kind=blocks  → به پیش‌نویس بلوکی برمی‌گردد (publish=true همان لحظه منتشر می‌کند)
 *        پیش از بازگردانی، وضعیت فعلی هم اسنپ‌شات می‌شود تا بازگردانی خودش قابل بازگشت باشد.
 * DELETE ?id= → حذف نسخه
 */

const MAX_REVISIONS = 30;

/** برچسب فارسی بخش‌های محتوا برای خلاصهٔ تغییرات */
const CONTENT_SECTION_LABELS: Record<string, string> = {
  banner: "بنر",
  announcement: "نوار اعلان",
  features: "ویژگی‌ها",
  stats: "آمار",
  about: "دربارهٔ ما",
  header: "هدر و منو",
  footer: "فوتر",
  trustNotes: "نوار اعتماد",
  sections: "نمایش بخش‌ها",
};

/** تفاوت‌های سطح بالای دو محتوای کلاسیک → فهرست برچسب فارسی */
function diffContentSummary(a: Partial<StorefrontContent> | null, b: Partial<StorefrontContent> | null): string[] {
  const out: string[] = [];
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const key of keys) {
    if (key === "banner" || key === "header" || key === "footer" || key === "about" || key === "sections") {
      const va = JSON.stringify((a as Record<string, unknown>)?.[key] ?? null);
      const vb = JSON.stringify((b as Record<string, unknown>)?.[key] ?? null);
      if (va !== vb) out.push(CONTENT_SECTION_LABELS[key] ?? key);
    } else {
      const va = JSON.stringify((a as Record<string, unknown>)?.[key] ?? null);
      const vb = JSON.stringify((b as Record<string, unknown>)?.[key] ?? null);
      if (va !== vb) out.push(CONTENT_SECTION_LABELS[key] ?? key);
    }
  }
  return out.slice(0, 6);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد" }, { status: 404 });
    }

    const rows = await db.storefrontRevision.findMany({
      where: { storefrontId: storefront.id },
      orderBy: { createdAt: "desc" },
      take: MAX_REVISIONS + 1,
      select: {
        id: true, label: true, kind: true, blockCount: true, createdAt: true, contentJson: true,
      },
    });

    // خلاصهٔ «چه چیزی تغییر کرد» — مقایسه با نسخهٔ قدیمی‌ترِ هم‌نوع
    const revisions = rows.slice(0, MAX_REVISIONS).map((r, i) => {
      const olderSameKind = rows.slice(i + 1).find((x) => x.kind === r.kind);
      let changes: string[] = [];
      if (r.kind === "content") {
        let cur: Partial<StorefrontContent> | null = null;
        let prev: Partial<StorefrontContent> | null = null;
        try {
          cur = r.contentJson ? (JSON.parse(r.contentJson) as Partial<StorefrontContent>) : null;
        } catch { cur = null; }
        try {
          prev = olderSameKind?.contentJson ? (JSON.parse(olderSameKind.contentJson) as Partial<StorefrontContent>) : null;
        } catch { prev = null; }
        changes = olderSameKind ? diffContentSummary(cur, prev) : ["نسخهٔ اول"];
      } else {
        const olderCount = olderSameKind?.blockCount;
        changes =
          typeof olderCount === "number" && olderCount !== r.blockCount
            ? [`شمار بلوک: ${olderCount} ← ${r.blockCount}`]
            : ["چیدمان بلوک‌ها"];
      }
      return { id: r.id, label: r.label, kind: r.kind, blockCount: r.blockCount, createdAt: r.createdAt.toISOString(), changes };
    });

    return NextResponse.json({ success: true, revisions });
  } catch (error) {
    console.error("[storefront revisions GET] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در دریافت نسخه‌ها" }, { status: 500 });
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

    const body = await req.json().catch(() => null);
    const b = (body ?? {}) as Record<string, unknown>;
    const id = String(b.id ?? "");
    if (!id) {
      return NextResponse.json({ success: false, error: "شناسهٔ نسخه لازم است" }, { status: 400 });
    }

    const revision = await db.storefrontRevision.findFirst({
      where: { id, storefrontId: storefront.id },
    });
    if (!revision) {
      return NextResponse.json({ success: false, error: "نسخه یافت نشد" }, { status: 404 });
    }

    // ── R26: اسنپ‌شات وضعیت فعلی پیش از بازگردانی (تا خود بازگردانی هم قابل بازگشت باشد) ──
    const stamp = formatJalali(new Date(), "yyyy/MM/dd HH:mm");
    await db.storefrontRevision.create({
      data: {
        storefrontId: storefront.id,
        kind: revision.kind,
        label: `پیش از بازگردانی — ${stamp}`,
        blocksJson: storefront.blocksJson ?? "{}",
        contentJson: storefront.content,
        blockCount: 0,
        createdById: userId,
      },
    });
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

    // ── بازگردانی بر اساس نوع نسخه ──
    if (revision.kind === "content" && revision.contentJson) {
      const sanitized = sanitizeStorefrontContent(JSON.parse(revision.contentJson));
      if (!sanitized) {
        return NextResponse.json({ success: false, error: "محتوای این نسخه معتبر نیست" }, { status: 400 });
      }
      const contentStr = JSON.stringify(sanitized);
      const announcement = sanitized.announcement ?? null;
      // وضعیت بلوک‌های همان لحظه هم برمی‌گردد (تا سایت دقیقاً مثل آن زمان شود)
      let blocksData: Record<string, unknown> = {};
      if (revision.blocksJson && revision.blocksJson !== "{}") {
        try {
          const parsed = JSON.parse(revision.blocksJson) as { blocks?: unknown };
          if (Array.isArray(parsed.blocks) && parsed.blocks.length > 0) {
            blocksData = { blocksJson: revision.blocksJson, blocksDraftJson: revision.blocksJson };
          }
        } catch { /* بلوک خراب — نادیده */ }
      } else {
        // در لحظهٔ ذخیره صفحهٔ بلوکی منتشر نبود → کلاسیک برمی‌گردد
        blocksData = { blocksJson: null };
      }
      await db.storefront.update({
        where: { id: storefront.id },
        data: { content: contentStr, announcement, ...blocksData },
      });
      return NextResponse.json({
        success: true,
        restored: "content",
        message: `نسخهٔ «${revision.label ?? "بدون عنوان"}» بازگردانی شد — سایت همان لحظه به‌روز شد`,
      });
    }

    // kind=blocks (یا content بدون contentJson) → پیش‌نویس بلوکی
    const publish = b.publish === true;
    await db.storefront.update({
      where: { id: storefront.id },
      data: publish
        ? { blocksDraftJson: revision.blocksJson, blocksJson: revision.blocksJson }
        : { blocksDraftJson: revision.blocksJson },
    });
    return NextResponse.json({
      success: true,
      restored: "blocks",
      message: publish
        ? `نسخهٔ «${revision.label ?? "بدون عنوان"}» بازگردانی و منتشر شد`
        : `نسخهٔ «${revision.label ?? "بدون عنوان"}» به پیش‌نویس بازگردانی شد — بعد از بررسی، انتشار را بزنید`,
    });
  } catch (error) {
    console.error("[storefront revisions POST] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در بازگردانی نسخه" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد" }, { status: 404 });
    }

    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "شناسهٔ نسخه لازم است" }, { status: 400 });
    }

    await db.storefrontRevision.deleteMany({ where: { id, storefrontId: storefront.id } });
    return NextResponse.json({ success: true, message: "نسخه حذف شد" });
  } catch (error) {
    console.error("[storefront revisions DELETE] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در حذف نسخه" }, { status: 500 });
  }
}
