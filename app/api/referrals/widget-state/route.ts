import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/referrals/widget-state — وضعیت ویجت رفرال داشبورد (R16)
 * hidden: کاربرِ فعلی با ضربدر بسته است؟ (User.referralWidgetHidden)
 * mode:   تنظیم سراسری سوپرادمین — on | off | forced
 *   on     → پیش‌فرض؛ کاربر می‌تواند با ضربدر ببندد
 *   off    → برای همه خاموش (سوپرادمین)
 *   forced → همیشه نمایش؛ ضربدر مخفی می‌شود (کمپین ویژه)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;

    const user = await db.user.findUnique({
      where: { id: auth.user.userId },
      select: { referralWidgetHidden: true },
    });

    let mode: "on" | "off" | "forced" = "on";
    try {
      const setting = await db.systemSettings.findUnique({
        where: { key: "referral_widget_mode" },
        select: { value: true },
      });
      if (setting?.value) {
        const v = String(setting.value);
        if (v === "off" || v === "forced") mode = v;
      }
    } catch {
      /* پیش‌فرض: on */
    }

    return NextResponse.json({
      success: true,
      hidden: !!user?.referralWidgetHidden,
      mode,
    });
  } catch (error) {
    console.error("[referrals widget-state] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در دریافت وضعیت ویجت" }, { status: 500 });
  }
}
