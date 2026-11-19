import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyUserSession } from "@/lib/user-token";

export const runtime = "nodejs";

/**
 * POST /api/marketing/referral/track
 * body: { code, refereeEmail? }
 *
 * ردیابی ثبت‌نام یک کاربر دعوت‌شده با کد معرفی.
 * 1. یافتن Referral با code (PENDING)
 * 2. به‌روزرسانی status به "SIGNED_UP" و ثبت refereeUserId
 * 3. اعطای ۱۰۰ امتیاز وفاداری به دعوت‌کننده (auto-award REFERRAL)
 * R14-D: پاداش ۱٬۰۰۰٬۰۰۰ تومانی هم همین‌جا (داخل applyReferralOnSignup)
 * به دعوت‌کننده واریز می‌شود — idempotent.
 *
 * این endpoint معمولاً در صفحه‌ی ثبت‌نام یا اولین ورود کاربر دعوت‌شده فراخوانی می‌شود.
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

 const body = await req.json().catch(() => ({}));
 const code = String(body?.code || "").trim().toUpperCase();
 // FIX(SECURITY-M7): refereeUserId همیشه از توکن — قبلاً caller می‌توانست
 // userId دلخواه بفرستد و رفرال را به کاربر دیگری بچسباند
 const refereeEmail = body?.refereeEmail
? String(body.refereeEmail).trim().toLowerCase()
: undefined;

 if (!code) {
 return NextResponse.json(
 { success: false, error: "کد معرفی (code) الزامی است" },
 { status: 400 }
 );
 }

 // FIX(v12.1): منطق مشترک از lib/referral-engine — همان منطقی که
 // register/trial/register-and-pay هم استفاده می‌کنند
 const { applyReferralOnSignup } = await import("@/lib/referral-engine");
 const result = await applyReferralOnSignup(db, {
 code,
 refereeUserId: String(payload.id),
 refereeEmail,
 });

 if (!result.applied) {
 const messages: Record<string, string> = {
 INVALID_CODE: "کد معرفی معتبر نیست",
 ALREADY_TRACKED: "این کد معرفی قبلاً ردیابی شده است",
 SELF_REFERRAL: "نمی‌توانید از کد دعوت خودتان استفاده کنید",
 EMAIL_MISMATCH: "ایمیل کاربر با ایمیل دعوت‌شده مطابقت ندارد",
 REFERRER_INACTIVE: "دعوت‌کننده دیگر فعال نیست",
 NO_CODE: "کد معرفی الزامی است",
 };
 return NextResponse.json({
 success: true,
 data: {
 alreadyTracked: result.reason === "ALREADY_TRACKED",
 referralId: result.referralId,
 },
 message: messages[result.reason || ""] || "کد معرفی اعمال نشد",
 });
 }

 return NextResponse.json({
 success: true,
 data: {
 referralId: result.referralId,
 // R14-D — وضعیت نهایی پس از اعطای پاداش فوری
 status: result.rewardGranted ? "REWARDED" : "SIGNED_UP",
 rewardGranted: result.rewardGranted,
 loyaltyAwarded: result.loyaltyAwarded,
 loyaltyMessage: result.loyaltyMessage,
 },
 message: result.rewardGranted
 ? "ثبت‌نام ردیابی شد و پاداش ۱٬۰۰۰٬۰۰۰ تومانی به کیف پول دعوت‌کننده واریز شد"
 : "ثبت‌نام کاربر دعوت‌شده با موفقیت ردیابی شد",
 });
 } catch (error) {
 console.error("Referral track error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ردیابی معرفی" },
 { status: 500 }
 );
 }
}
