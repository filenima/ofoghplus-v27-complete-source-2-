import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ id: string }>;
}

/**
 * POST /api/accounting/fixed-assets/[id]/depreciate
 * اجرای استهلاک ماهانه — روش خط مستقیم:
 * monthly = (purchaseCost - salvageValue) / (usefulLifeYears * 12)
 * - اگر برای همان ماه قبلاً ثبت شده، خطا برمی‌گرداند.
 * - accumulatedDepreciation و currentValue به‌روزرسانی می‌شوند.
 * - یک DepreciationEntry ثبت می‌شود.
 * Body (اختیاری): { period?: "YYYY-MM" } — پیش‌فرض ماه جاری میلادی.
 *
 * SECURITY (C1): احراز هویت اجبانی + فیلتر tenant
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;
 const asset = await db.fixedAsset.findFirst({
 where: { id, tenantId: auth.tenantId, deletedAt: null },
 });
 if (!asset) {
 return NextResponse.json(
 { success: false, error: "دارایی یافت نشد" },
 { status: 404 }
 );
 }
 if (asset.status === "DISPOSED" || asset.status === "SOLD") {
 return NextResponse.json(
 { success: false, error: "این دارایی از رده خارج شده است" },
 { status: 400 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const period =
 (body as { period?: string })?.period??
 new Date().toISOString().slice(0, 7); // YYYY-MM

 // بررسی تکراری نبودن
 const existingEntry = await db.depreciationEntry.findUnique({
 where: { assetId_period: { assetId: asset.id, period } },
 });
 if (existingEntry) {
 return NextResponse.json(
 {
 success: false,
 error: `برای دوره‌ی ${period} قبلاً استهلاک ثبت شده است`,
 },
 { status: 409 }
 );
 }

 // محاسبه‌ی استهلاک ماهانه (خط مستقیم)
 const cost = Number(asset.purchaseCost);
 const salvage = Number(asset.salvageValue);
 const lifeMonths = Math.max(1, asset.usefulLifeYears * 12);
 const monthlyDepreciation = Math.floor(
 Math.max(0, cost - salvage) / lifeMonths
 );
 if (monthlyDepreciation <= 0) {
 return NextResponse.json(
 { success: false, error: "استهلاک ماهانه صفر است (هزینه‌ی خرید ≤ ارزش اسقاط)" },
 { status: 400 }
 );
 }

 // FIX(H7-استهلاک): سقف استهلاک قبل از جمع انباشته اعمال می‌شود — قبلاً
 // newAccumulated با «ماهانهٔ کامل» جمع می‌شد و در آخرین دوره‌ها از سقف
 // (هزینه − اسقاط) عبور می‌کرد: currentValue منفی می‌شد و amount رکورد با
 // accumulatedAfter ناسازگار بود.
 const maxDepreciable = Math.max(0, cost - salvage);
 const cappedAmount = Math.min(
 monthlyDepreciation,
 Math.max(0, maxDepreciable - Number(asset.accumulatedDepreciation))
 );
 if (cappedAmount <= 0) {
 // دارایی به‌طور کامل مستهلک شده — به‌روزرسانی وضعیت
 await db.fixedAsset.update({
 where: { id: asset.id },
 data: { status: "DEPRECIATING", currentValue: BigInt(salvage) },
 });
 return NextResponse.json({
 success: false,
 error: "این دارایی به‌طور کامل مستهلک شده است",
 }, { status: 400 });
 }

 const newAccumulated =
 Number(asset.accumulatedDepreciation) + cappedAmount;
 const newValue = cost - newAccumulated;
 // FIX(H7-tx): به‌روزرسانی دارایی + ثبت رکورد استهلاک باید اتمیک باشد —
 // قبلاً دو write جدا بودند و شکست دومی دارایی را بدون رکورد به‌روز می‌کرد.
 const entry = await db.$transaction(async (tx) => {
 await tx.fixedAsset.update({
 where: { id: asset.id },
 data: {
 accumulatedDepreciation: BigInt(newAccumulated),
 currentValue: BigInt(newValue),
 lastDepreciationDate: new Date(),
 status: "DEPRECIATING",
 },
 });

 const entry = await tx.depreciationEntry.create({
 data: {
 tenantId: asset.tenantId,
 assetId: asset.id,
 period,
 amount: BigInt(cappedAmount),
 accumulatedAfter: BigInt(newAccumulated),
 },
 });
 return entry;
 });

 return NextResponse.json({
 success: true,
 data: {
 entryId: entry.id,
 period,
 amount: cappedAmount,
 accumulatedDepreciation: newAccumulated,
 currentValue: newValue,
 },
 message: `استهلاک دوره‌ی ${period} ثبت شد`,
 });
 } catch (error) {
 console.error("Fixed asset depreciate error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در اجرای استهلاک" },
 { status: 500 }
 );
 }
}
