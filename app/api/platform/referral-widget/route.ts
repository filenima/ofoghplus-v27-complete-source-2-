import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ R16 — کنترل ویجت رفرال داشبورد (سوپرادمین) ============
// GET /api/platform/referral-widget — mode فعلی + آمار کاربرانی که بسته‌اند
// PUT /api/platform/referral-widget
//   { mode: "on" | "off" | "forced" }  → حالت سراسری ویجت
//   { resetAll: true }                  → بستن‌های همهٔ کاربران پاک شود (دوباره ببینند)
//   { resetUserIds: ["id1", ...] }      → فقط این کاربران دوباره ببینند
// همهٔ تغییرات در PlatformAuditLog ثبت می‌شوند.

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    let mode: string = "on";
    const setting = await db.systemSettings.findUnique({
      where: { key: "referral_widget_mode" },
      select: { value: true },
    });
    if (setting?.value) {
      const v = String(setting.value);
      if (v === "off" || v === "forced") mode = v;
    }
    const hiddenCount = await db.user.count({ where: { referralWidgetHidden: true } });
    const hiddenUsers = await db.user.findMany({
      where: { referralWidgetHidden: true },
      select: { id: true, email: true, name: true, family: true },
      take: 100,
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({
      success: true,
      mode,
      hiddenCount,
      hiddenUsers: hiddenUsers.map((u) => ({ id: u.id, email: u.email, name: `${u.name ?? ""} ${u.family ?? ""}`.trim() })),
    });
  } catch (error) {
    console.error("[referral-widget admin GET]", error);
    return NextResponse.json({ success: false, error: "خطا در دریافت وضعیت ویجت" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    const changes: Record<string, unknown> = {};

    if (b.mode !== undefined) {
      const mode = String(b.mode);
      if (!["on", "off", "forced"].includes(mode)) {
        return NextResponse.json({ success: false, error: "حالت مجاز نیست (on | off | forced)" }, { status: 400 });
      }
      await db.systemSettings.upsert({
        where: { key: "referral_widget_mode" },
        update: { value: mode },
        create: { key: "referral_widget_mode", value: mode },
      });
      changes.mode = mode;
    }

    if (b.resetAll === true) {
      const res = await db.user.updateMany({
        where: { referralWidgetHidden: true },
        data: { referralWidgetHidden: false },
      });
      changes.resetAll = res.count;
    }

    if (Array.isArray(b.resetUserIds) && b.resetUserIds.length > 0) {
      const ids = b.resetUserIds.map(String).slice(0, 200);
      const res = await db.user.updateMany({
        where: { id: { in: ids }, referralWidgetHidden: true },
        data: { referralWidgetHidden: false },
      });
      changes.resetUsers = res.count;
    }

    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ success: false, error: "هیچ تغییری مشخص نشده است" }, { status: 400 });
    }

    await db.platformAuditLog
      .create({
        data: {
          action: "UPDATE_REFERRAL_WIDGET",
          entity: "SystemSettings",
          entityId: "referral_widget_mode",
          // FIX(3e-6): requireSuperAdmin برمی‌گرداند { admin } نه { superAdmin } —
          // قبلاً superAdminId همیشه null ثبت می‌شد (مثل FIX قبلی در storefront-admin).
          superAdminId: auth.admin?.id ?? null,
          details: JSON.stringify(changes),
        },
      })
      .catch(() => undefined);

    return NextResponse.json({ success: true, changes, message: "تنظیمات ویجت رفرال ذخیره شد" });
  } catch (error) {
    console.error("[referral-widget admin PUT]", error);
    return NextResponse.json({ success: false, error: "خطا در ذخیرهٔ تنظیمات ویجت" }, { status: 500 });
  }
}
