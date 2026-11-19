import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, generatePassword, generateUsername } from "@/lib/platform-auth";
import { hashLicenseKey } from "@/lib/license-security";
import { requireSuperAdmin } from "@/lib/platform-middleware";
// session-lite برای عملکرد بهتر در serverless cold-start
import { normalizePlanName, getEffectiveLicenseDefaults } from "@/lib/plans";

export const runtime = "nodejs";

// POST /api/platform/quick-login — ورود فوری به حساب یک tenant
// اگر tenant دارد: یوزر جدید با رمز تصادفی می‌سازد و توکن می‌دهد
// اگر tenant ندارد: tenant + user جدید می‌سازد
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json();
 const { tenantId, plan = "pro", companyName, name } = body;

 // ═══ R14-H — حالت impersonation: ورود به‌عنوان کاربر «موجود» برای پشتیبانی ═══
 // body.userId داده شود → هیچ کاربری ساخته نمی‌شود؛ فقط یک نشست کوتاه‌عمر
 // (حداکثر ۲ ساعت) با ادعای imp:true صادر می‌شود تا اپ بنر کهربایی نمایش دهد.
 if (body.userId && typeof body.userId === "string") {
  const target = await db.user.findUnique({
   where: { id: body.userId },
   include: { tenant: { select: { id: true, name: true, plan: true, status: true } } },
  });
  if (!target || target.deletedAt) {
   return NextResponse.json(
    { success: false, error: "کاربر یافت نشد یا حذف شده است" },
    { status: 404 }
   );
  }
  if (!target.isActive) {
   return NextResponse.json(
    { success: false, error: "این کاربر غیرفعال است — ابتدا از پنل فعالش کنید" },
    { status: 403 }
   );
  }
  if (!target.tenant) {
   return NextResponse.json(
    { success: false, error: "کاربر سازمان فعالی ندارد" },
    { status: 409 }
   );
  }
  if (target.tenant.status === "suspended" || target.tenant.status === "cancelled") {
   return NextResponse.json(
    { success: false, error: `سازمان این کاربر ${target.tenant.status === "suspended" ? "تعلیق" : "لغو"} شده است` },
    { status: 403 }
   );
  }

  await db.platformAuditLog.create({
   data: {
    superAdminId: auth.admin.id,
    action: "IMPERSONATE_LOGIN",
    entity: "User",
    entityId: target.id,
    details: JSON.stringify({
     userId: target.id,
     tenantId: target.tenant.id,
     tenantName: target.tenant.name,
     username: target.username,
    }),
    ipAddress: req.headers.get("x-forwarded-for") || null,
   },
  });
  await db.auditLog.create({
   data: {
    tenantId: target.tenant.id,
    userId: target.id,
    action: "IMPERSONATE_SESSION_START",
    entity: "User",
    entityId: target.id,
    ipAddress: req.headers.get("x-forwarded-for") || null,
   },
  });

  const { createUserSessionLite } = await import("@/lib/session-lite");
  const { token, sessionId } = await createUserSessionLite(
   req,
   db,
   target.id,
   target.tenant.id,
   target.role,
   { impersonated: true }
  );

  return NextResponse.json({
   success: true,
   token,
   sessionId,
   impersonated: true,
   tenant: {
    id: target.tenant.id,
    name: target.tenant.name,
    plan: target.tenant.plan,
   },
   user: {
    id: target.id,
    name: target.name,
    email: target.email,
    username: target.username,
    role: target.role,
   },
   message: "ورود به‌عنوان کاربر (جلسهٔ پشتیبانی) انجام شد — حداکثر ۲ ساعت اعتبار دارد",
  });
 }

 // نرمال‌سازی نام پلن (یکپارچه‌سازی با lib/plans.ts)
 const normalizedPlan = normalizePlanName(plan);

 let tenant;
 let isNewTenant = false;

 if (tenantId) {
 // ورود به tenant موجود
 tenant = await db.tenant.findUnique({ where: { id: tenantId } });
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "Tenant یافت نشد" },
 { status: 404 }
 );
 }
 // FIX(A3-1): ورود فوری به tenant تعلیق‌شده ممنوع — قبلاً quick-login
 // تعلیق را دور می‌زد و کاربر فعال در tenant معلق می‌ساخت
 if (tenant.status === "suspended" || tenant.status === "cancelled") {
 return NextResponse.json(
 { success: false, error: `این سازمان ${tenant.status === "suspended" ? "تعلیق" : "لغو"} شده است — ابتدا وضعیت را از پنل سوپرادمین فعال کنید` },
 { status: 403 }
 );
 }
 } else {
 // ساخت tenant جدید
 isNewTenant = true;
 const { getCurrentJalaliYear, getJalaliYearRange, toPersianDigits } =
 await import("@/lib/persian");
 const currentYear = getCurrentJalaliYear();
 tenant = await db.tenant.create({
 data: {
 name: companyName || `سازمان افق پلاس (${toPersianDigits(String(currentYear))})`,
 plan: normalizedPlan,
 status: "active",
 },
 });

 // سال مالی پیش‌فرض — داینامیک بر اساس سال شمسی جاری
 const yr = getJalaliYearRange(currentYear);
 await db.fiscalYear.create({
 data: {
 tenantId: tenant.id,
 name: `سال مالی ${toPersianDigits(currentYear)}`,
 startDate: yr.start,
 endDate: yr.end,
 status: "OPEN",
 isCurrent: true,
 },
 });

 // FIX(v18-لایسنس): منبع واحد — قبلاً ۵۰ کاربر/۱۰۰۰۰۰ فاکتور برای سازمانی هاردکد بود
 // که با پلن فروش‌شده تناقض داشت. سوپرادمین در پنل می‌تواند لایسنس دقیق صادر کند.
 const defaults = await getEffectiveLicenseDefaults(normalizedPlan) || await getEffectiveLicenseDefaults("pro");
 const { generateLicenseKey } = await import("@/lib/platform-auth");
 const licenseKey = generateLicenseKey();
 await db.license.create({
 data: {
 key: licenseKey,
 keyHash: hashLicenseKey(licenseKey),
 tenantId: tenant.id,
 plan: normalizedPlan,
 maxUsers: defaults.maxUsers,
 maxInvoices: defaults.maxInvoices,
 maxWarehouses: defaults.maxWarehouses,
 features: JSON.stringify(defaults.features),
 status: "ACTIVE",
 issuedBy: auth.admin.id,
 activatedAt: new Date(),
 },
 });
 }

 // تولید یوزرنیم و رمز تصادفی
 // FIX(B4): رمز عبور یک‌بار در پاسخ بازگردانده می‌شود (مثل کلید لایسنس)
 // تا سوپرادمین بتواند اعتبارنامه را به مشتری تحویل دهد — بدون این، حساب
 // ساخته می‌شد ولی هیچ‌کس رمز آن را نمی‌دانست. این یک نمایش one-time است
 // و در هیچ پاسخ دیگری (لیست کاربران و...) برنمی‌گردد.
 const username = generateUsername("user");
 const password = (body?.password as string | undefined)?.trim() || generatePassword(12);
 if (password.length < 8) {
 return NextResponse.json(
 { success: false, error: "رمز عبور باید حداقل ۸ کاراکتر باشد" },
 { status: 400 }
 );
 }
 const hashedPassword = await hashPassword(password);

 // ساخت کاربر ادمین برای tenant
 // SA-HIGH-5: username تولیدشده در رکورد User ذخیره می‌شود تا کاربر بتواند
 // با همان نام کاربری (که در پاسخ نمایش داده می‌شود) وارد شود.
 const user = await db.user.create({
 data: {
 tenantId: tenant.id,
 email: `${username}@ofoghplus.ir`, // REBRAND(R14-A): دامنهٔ ایمیل ساختگی کاربر سریع
 username,
 name: name || (isNewTenant? "مدیر سیستم": "کاربر فوری"),
 password: hashedPassword,
 role: "ADMIN",
 isActive: true,
 },
 });

 await db.auditLog.create({
 data: {
 tenantId: tenant.id,
 userId: user.id,
 action: "QUICK_LOGIN_CREATE",
 entity: "User",
 entityId: user.id,
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "QUICK_LOGIN",
 entity: "Tenant",
 entityId: tenant.id,
 details: JSON.stringify({
 tenantName: tenant.name,
 username,
 userId: user.id,
 isNewTenant,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 // ساخت نشست (با اطلاعات درخواست سوپرادمین؛ کاربر با این توکن وارد می‌شود)
 const { createUserSessionLite } = await import("@/lib/session-lite");
 const { token, sessionId } = await createUserSessionLite(
 req,
 db,
 user.id,
 tenant.id,
 user.role
 );

 return NextResponse.json({
 success: true,
 token,
 sessionId,
 tenant: {
 id: tenant.id,
 name: tenant.name,
 plan: tenant.plan,
 },
 user: {
 id: user.id,
 name: user.name,
 email: user.email,
 username,
 // FIX(B4): نمایش یک‌بارمصرف رمز — فقط در همین پاسخ ساخت (مثل کلید لایسنس).
 // در لاگ ممیزی فقط hash ثبت شده و plaintext هرگز ذخیره نمی‌شود.
 password,
 role: user.role,
 },
 isNewTenant,
 message: isNewTenant
? "سازمان جدید ایجاد شد و حساب کاربری آماده است"
: "ورود فوری انجام شد",
 });
 } catch (error) {
 console.error("Quick login error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ورود فوری" },
 { status: 500 }
 );
 }
}
