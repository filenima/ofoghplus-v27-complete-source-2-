import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { validateStorefrontSlug } from "@/lib/storefront";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/storefront/manage/slug-check?slug=my-shop — بررسی آنی آزاد بودن نام فروشگاه
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const url = new URL(req.url);
    const raw = url.searchParams.get("slug") ?? "";
    const v = validateStorefrontSlug(raw);
    if (!v.ok) {
      return NextResponse.json({ success: true, available: false, reason: v.error });
    }
    const slug = v.slug;

    const taken = await db.storefront.findFirst({
      where: { slug, tenantId: { not: tenantId } },
      select: { id: true },
    });

    return NextResponse.json({
      success: true,
      available: !taken,
      slug,
      reason: taken ? "این نام قبلاً توسط فروشگاه دیگری گرفته شده است" : null,
    });
  } catch (error) {
    console.error("[storefront slug-check] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در بررسی نام فروشگاه" },
      { status: 500 }
    );
  }
}
