import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/referrals/widget-hide — بستن ماندگار ویجت رفرال توسط کاربر (R16)
 * سوپرادمین از پنل خود می‌تواند برای همه/یک کاربر دوباره فعالش کند
 * (PUT /api/superadmin/referral-widget → resetUserIds | mode).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;

    await db.user.update({
      where: { id: auth.user.userId },
      data: { referralWidgetHidden: true },
    });

    await db.auditLog.create({
      data: {
        tenantId: auth.user.tenantId,
        userId: auth.user.userId,
        action: "UPDATE",
        entity: "User",
        entityId: auth.user.userId,
        changes: JSON.stringify({ field: "referralWidgetHidden", to: true, via: "widget-x" }),
      },
    }).catch(() => undefined);

    return NextResponse.json({ success: true, message: "کارت معرفی دوستان بسته شد — دیگر نمایش داده نمی‌شود" });
  } catch (error) {
    console.error("[referrals widget-hide] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در بستن ویجت" }, { status: 500 });
  }
}
