import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyUserSession } from "@/lib/user-token";

export const runtime = "nodejs";

/**
 * GET /api/notifications
 * - Bearer auth الزامی
 * - خروجی: لیست اعلان‌های کاربر فعلی (و اعلان‌های tenant-wide با userId = null)
 * - پارامترهای query:?unreadOnly=true
 */
export async function GET(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = await verifyUserSession(authHeader.substring(7));
 if (!payload) {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const userId = payload.id as string;
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const { searchParams } = new URL(req.url);
 const unreadOnly = searchParams.get("unreadOnly") === "true";
 // FIX(3-a-h10): صفحه‌بندی — قبلاً take ثابت ۵۰ بود و اعلان‌های قدیمی‌تر
 // هرگز قابل دسترسی نبودند. limit/offset اختیاری (پیش‌فرض همان رفتار قبلی).
 const limit = Math.min(
 Math.max(Number(searchParams.get("limit") || "50") || 50, 1),
 200
 );
 const offset = Math.max(Number(searchParams.get("offset") || "0") || 0, 0);

 const where: Record<string, unknown> = {
 tenantId: user.tenantId,
 OR: [{ userId: null }, { userId: user.id }],
 };
 if (unreadOnly) where.isRead = false;

 const [notifications, totalCount] = await Promise.all([
 db.notification.findMany({
 where,
 orderBy: { createdAt: "desc" },
 take: limit,
 skip: offset,
 }),
 db.notification.count({ where }),
 ]);

 const unreadCount = await db.notification.count({
 where: {
 tenantId: user.tenantId,
 OR: [{ userId: null }, { userId: user.id }],
 isRead: false,
 },
 });

 return NextResponse.json({
 success: true,
 data: notifications,
 unreadCount,
 total: totalCount,
 });
 } catch (error) {
 console.error("List notifications error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت اعلان‌ها" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/notifications/mark-read
 * - body: { id?: string } — اگر id ارسال شود فقط همان رکورد خوانده می‌شود،
 * در غیر این‌صورت همه‌ی خوانده‌نشده‌ها به‌عنوان خوانده‌شده علامت‌گذاری می‌شوند.
 *
 * نکته: مسیر مفهومی است؛ عملیات اصلی روی همین /api/notifications انجام می‌شود.
 */
export async function POST(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = await verifyUserSession(authHeader.substring(7));
 if (!payload) {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const userId = payload.id as string;
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const id = typeof body?.id === "string"? body.id: null;

 if (id) {
 await db.notification.updateMany({
 where: { id, tenantId: user.tenantId, OR: [{ userId: null }, { userId: user.id }] },
 data: { isRead: true },
 });
 return NextResponse.json({
 success: true,
 message: "اعلان به‌عنوان خوانده‌شده علامت‌گذاری شد",
 });
 }

 const result = await db.notification.updateMany({
 where: {
 tenantId: user.tenantId,
 OR: [{ userId: null }, { userId: user.id }],
 isRead: false,
 },
 data: { isRead: true },
 });

 return NextResponse.json({
 success: true,
 message: "همه‌ی اعلان‌ها به‌عنوان خوانده‌شده علامت‌گذاری شدند",
 updatedCount: result.count,
 });
 } catch (error) {
 console.error("Mark-read notifications error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی اعلان‌ها" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/notifications
 * - حذف اعلان‌هایی که خوانده شده‌اند (isRead = true)
 * - R14-J2: body اختیاری { ids?: string[] } — حذف انتخابی همان رکوردها
 *   (عملیات دسته‌ای مرکز اعلان‌ها)؛ گارد tenant/user مثل بقیهٔ مسیرها.
 */
export async function DELETE(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = await verifyUserSession(authHeader.substring(7));
 if (!payload) {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const userId = payload.id as string;
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 // R14-J2: حذف انتخابی با ids (در صورت ارسال)
 const body = await req.json().catch(() => ({}));
 const ids = Array.isArray(body?.ids)
 ? body.ids.filter((x: unknown) => typeof x === "string").slice(0, 200)
 : null;

 if (ids) {
 const result = await db.notification.deleteMany({
 where: {
 id: { in: ids },
 tenantId: user.tenantId,
 OR: [{ userId: null }, { userId: user.id }],
 },
 });
 return NextResponse.json({
 success: true,
 message: "اعلان‌های انتخاب‌شده حذف شدند",
 deletedCount: result.count,
 });
 }

 const result = await db.notification.deleteMany({
 where: {
 tenantId: user.tenantId,
 OR: [{ userId: null }, { userId: user.id }],
 isRead: true,
 },
 });

 return NextResponse.json({
 success: true,
 message: "اعلان‌های خوانده‌شده پاک‌سازی شدند",
 deletedCount: result.count,
 });
 } catch (error) {
 console.error("Clear notifications error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پاک‌سازی اعلان‌ها" },
 { status: 500 }
 );
 }
}
