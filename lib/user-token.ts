// ============ lib/user-token.ts — توکن کاربرِSession-aware — افق پلاس ============
//
// FIX(R28-4): ~۶۰ مسیر API مستقیماً verifyToken خام از platform-auth را صدا
// می‌زدند که «فقط امضای HMAC» را چک می‌کند — یعنی توکنِ ابطال‌شده (خروج از
// دستگاه دیگر / اخراج کاربر / تعلیق سازمان / تغییر رمز) همچنان پاس می‌شد و
// دسترسی کامل داشت. این تابع علاوه بر امضا، «رکورد نشست» را در DB اعتبارسنجی
// می‌کند (isSessionActive با کش ۳۰ ثانیه‌ای داخل lib/auth.ts — پرفورمنس حفظ
// می‌شود) و در صورت ابطال، null برمی‌گرداند.
//
// سیاست خطا (همان lib/user-auth.ts): در production خطای DB → fail-closed؛
// در dev فقط لاگ (fail-open) تا فلپ‌های لحظه‌ای سندباکس کار را نمی‌بندند.

import { verifyToken } from "./platform-auth";

export interface UserTokenPayload {
 userId: string;
 tenantId: string;
 role: string;
 type: "user";
 [key: string]: unknown;
}

/**
 * توکن کاربر + نشست را اعتبارسنجی می‌کند.
 * @returns پیلود در صورت اعتبار کامل، وگرنه null.
 *
 * جایگزینِ امنِ الگوی قدیمی:
 *   const payload = verifyToken(token);
 *   if (!payload || payload.type !== "user") { ... 401 ... }
 */
export async function verifyUserSession(
 token: string | null | undefined
): Promise<UserTokenPayload | null> {
 if (!token) return null;
 const payload = verifyToken(token);
 if (!payload || payload.type !== "user") return null;

 try {
 // lazy import — جلوگیری از circular dependency با session.ts
 const { isSessionActive } = await import("./session");
 const active = await isSessionActive(token);
 if (!active) return null;
 return payload as unknown as UserTokenPayload;
 } catch (err) {
 if (process.env.NODE_ENV === "production") {
 console.error(
 "[user-token] session check failed — fail-closed رد می‌شود:",
 err instanceof Error ? err.message : err
 );
 return null;
 }
 // dev: خطای گذرای DB توکن معتبرِ امضادار را نمی‌بندد (همان سیاست user-auth)
 console.warn(
 "[user-token] session check failed (dev) — توکن معتبر HMAC پذیرفته می‌شود"
 );
 return payload as unknown as UserTokenPayload;
 }
}

/** استخراج توکن از هدر Authorization یا کوکی — هم‌شکل lib/user-auth.ts */
export function extractUserToken(req: {
 headers: { get(name: string): string | null };
 cookies?: { get(name: string): { value: string } | undefined };
}): string | null {
 const authHeader = req.headers.get("authorization");
 if (authHeader?.startsWith("Bearer ")) {
 return authHeader.substring(7).trim();
 }
 const cookieToken = req.cookies?.get("hoshhesab_user_token")?.value;
 if (cookieToken) return cookieToken;
 return null;
}
