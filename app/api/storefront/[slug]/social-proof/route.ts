import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorefrontBySlug } from "@/lib/storefront-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/storefront/[slug]/social-proof — مدرک اجتماعی صادقانه (R19)
 * فقط سفارش‌های واقعی این فروشگاه در ۷ روز گذشته (تأییدشده/ارسال‌شده).
 * نام مشتری ماسک می‌شود («علی م.») و تعداد اقلام هرگز جعل نمی‌شود.
 * اگر سفارشی نباشد → آرایهٔ خالی (پاپ‌آپ نمایش داده نمی‌شود).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const storefront = await getStorefrontBySlug(slug);
    if (!storefront || !storefront.isActive) {
      return NextResponse.json({ success: false, error: "not found" }, { status: 404 });
    }
    // Task 3-d — تعلیق سوپرادمینی: فروشگاه معلق از API عمومی هم خاموش است
    if (storefront.status === "suspended") {
      return NextResponse.json({ success: false, error: "این فروشگاه موقتاً تعلیق شده است" }, { status: 503 });
    }

    const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);
    const orders = await db.storefrontOrder.findMany({
      where: {
        storefrontId: storefront.id,
        status: { in: ["APPROVED", "SHIPPED"] },
        createdAt: { gte: weekAgo },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        customerName: true,
        items: true, // JSON string
        createdAt: true,
      },
    });

    const maskName = (raw: string | null | undefined): string => {
      if (!raw) return "مشتری فروشگاه";
      const parts = raw.trim().split(/\s+/);
      if (parts.length === 1) return parts[0];
      return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
    };

    const firstItemName = (itemsJson: string): string | null => {
      try {
        const arr = JSON.parse(itemsJson) as { name?: unknown }[];
        if (Array.isArray(arr) && arr.length > 0 && typeof arr[0].name === "string") {
          return arr[0].name;
        }
      } catch { /* ignore */ }
      return null;
    };

    const items = orders
      .map((o) => {
        const productName = firstItemName(o.items);
        if (!productName) return null;
        return {
          name: maskName(o.customerName),
          product: productName,
          minutesAgo: Math.max(1, Math.round((Date.now() - o.createdAt.getTime()) / 60_000)),
        };
      })
      .filter((x): x is { name: string; product: string; minutesAgo: number } => x !== null);

    return NextResponse.json(
      { success: true, items },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } },
    );
  } catch {
    return NextResponse.json({ success: true, items: [] });
  }
}
