// ═══════════════════════════════════════════════════════════════════
// Task ID: 1-a — کنترل دسترسی «فروشگاه آنلاین» (server-side only)
// ---------------------------------------------------------------------
// گیت یکپارچه فعال‌سازی عمومی فروشگاه آنلاین. اولویت بررسی:
//   ۱) کلید اصلی سامانه (SystemSettings: storefront_master_enabled)
//   ۲) دسترسی ویژهٔ کاربر (User.storefrontOverride: granted | denied | null)
//   ۳) پلن کسب‌وکار (حرفه‌ای/سازمانی → مجاز)
// خروجی همیشه یک StorefrontAccessResult است تا UI بتواند پیام درست را
// بر اساس reason رندر کند. همهٔ مسیرهای API باید از همین ماژول بخوانند.
// ═══════════════════════════════════════════════════════════════════

import { db } from "@/lib/db";
import { normalizePlanName } from "@/lib/plans";

export type StorefrontAccessReason =
  | "plan_ok" // پلن حرفه‌ای/سازمانی → مجاز
  | "override_granted" // دسترسی ویژهٔ داده‌شده توسط سوپرادمین → مجاز
  | "override_denied" // مسدودشده توسط سوپرادمین (حتی با پلن حرفه‌ای) → غیرمجاز
  | "master_off" // کل سامانه توسط سوپرادمین خاموش شده → غیرمجاز
  | "plan_required"; // پلن پایین‌تر از حرفه‌ای → غیرمجاز (ارتقا یا درخواست ویژه)

export interface StorefrontAccessResult {
  allowed: boolean;
  reason: StorefrontAccessReason;
  plan?: string; // پلن نرمال‌شدهٔ tenant (اگر خوانده شده باشد)
}

/** کلید SystemSettings برای سوییچ اصلی فروشگاه آنلاین */
export const STOREFRONT_MASTER_KEY = "storefront_master_enabled";

// ── کش درون‌حافظه‌ای حذف شد (FIX 1-a) ──
// در Next.js dev (Turbopack) هر route handler ممکن است instance جدا از این ماژول
// داشته باشد؛ کش درون‌حافظه‌ای بین instanceها مشترک نبود و بعد از تغییر override
// مقدار کهنه برمی‌گشت. کوئری‌های زیر دو-سه lookup ایندکس‌شدهٔ SQLite هستند و
// بدون کش هم ناچیزند — درستی مهم‌تر از میکرو-بهینه‌سازی است.
// تابع زیر برای سازگاری API باقی مانده ولی no-op است.
export function invalidateStorefrontAccessCache(_tenantId?: string, _userId?: string): void {
  /* no-op — کش حذف شده است */
}

/**
 * وضعیت سوییچ اصلی سامانه — پیش‌فرض روشن (true) اگر ردیفی در DB نباشد.
 * خطای DB → fail-open (روشن) + لاگ؛ فروشگاه نباید به‌خاطر خطای موقت قفل شود.
 */
export async function getMasterSwitchState(): Promise<boolean> {
  let enabled = true;
  try {
    const row = await db.systemSettings.findUnique({
      where: { key: STOREFRONT_MASTER_KEY },
    });
    // فقط "0" یعنی خاموش — مقادیر ناشناخته/قدیمی fail-open هستند
    enabled = row ? row.value !== "0" : true;
  } catch (error) {
    console.error(
      "[storefront-access] خواندن کلید اصلی سامانه خطا خورد — fail-open (روشن):",
      error instanceof Error ? error.message : error
    );
    enabled = true;
  }
  return enabled;
}

/**
 * محاسبهٔ خالص دسترسی از ورودی‌های از پیش خوانده‌شده — بدون DB.
 * (برای محاسبهٔ گروهی در پنل سوپرادمین بدون کوئری N+1)
 */
export function computeStorefrontAccess(
  masterEnabled: boolean,
  override: string | null | undefined,
  planRaw: string | null | undefined
): StorefrontAccessResult {
  // ۱) کلید اصلی سامانه
  if (!masterEnabled) {
    return { allowed: false, reason: "master_off" };
  }
  // ۲) دسترسی ویژهٔ کاربر — denied حتی با پلن حرفه‌ای برنده نیست
  if (override === "granted") {
    return { allowed: true, reason: "override_granted" };
  }
  if (override === "denied") {
    return { allowed: false, reason: "override_denied" };
  }
  // ۳) پلن tenant (نرمال‌شده)
  const plan = normalizePlanName(planRaw);
  if (plan === "pro" || plan === "enterprise") {
    return { allowed: true, reason: "plan_ok", plan };
  }
  return { allowed: false, reason: "plan_required", plan };
}

/**
 * بررسی کامل دسترسی فروشگاه آنلاین برای یک کاربر (server-side only).
 * ترتیب: کلید اصلی → override کاربر → پلن tenant.
 * خطای DB در خواندن پلن → fail-open (مجاز) + لاگ تا سرویس‌دهی قطع نشود.
 */
export async function checkStorefrontAccess(
  tenantId: string,
  userId: string
): Promise<StorefrontAccessResult> {
  // ۱) کلید اصلی سامانه
  const masterEnabled = await getMasterSwitchState();
  if (!masterEnabled) {
    return { allowed: false, reason: "master_off" };
  }

  // ۲) دسترسی ویژهٔ کاربر
  let override: string | null = null;
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { storefrontOverride: true },
    });
    override = user?.storefrontOverride ?? null;
  } catch (error) {
    console.error(
      "[storefront-access] خواندن دسترسی ویژه کاربر خطا خورد — ادامه با پلن:",
      error instanceof Error ? error.message : error
    );
  }

  if (override === "granted") {
    return { allowed: true, reason: "override_granted" };
  }
  if (override === "denied") {
    return { allowed: false, reason: "override_denied" };
  }

  // ۳) پلن tenant — خطا = fail-open (مجاز با reason plan_ok) تا محصول قفل نشود
  let planRaw: string | null | undefined;
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });
    planRaw = tenant?.plan ?? null;
  } catch (error) {
    console.error(
      "[storefront-access] خواندن پلن tenant خطا خورد — fail-open (مجاز):",
      error instanceof Error ? error.message : error
    );
    return { allowed: true, reason: "plan_ok" };
  }

  // FIX(R17-0) — باگ «با پلن هم می‌گوید پلن بخر»:
  // مسیرهای متعددی وجود دارند که در آن‌ها کاربر «پلن دارد» ولی tenant.plan
  // هنوز sync نشده است:
  //   ۱) سوپرادمین از پنل پلتفرم لایسنس صادر کرده (License با tenantId و
  //      status=ACTIVE) ولی کاربر کلید را با /api/license/activate فعال
  //      نکرده → tenant.plan روی free/mini مانده
  //   ۲) کال‌بک درگاه پرداخت به هر دلیل (خطای شبکه، تعویض دامنه) کامل
  //      اجرا نشده ولی رکورد License خریداری‌شده ثبت شده است
  // در این حالت‌ها لایسنس ACTIVE و منقضی‌نشدهٔ این tenant با پلن
  // حرفه‌ای/سازمانی ملاک است و tenant.plan هم در پس‌زمینه خودترمیمی می‌شود.
  const normalized = normalizePlanName(planRaw);
  if (normalized !== "pro" && normalized !== "enterprise") {
    try {
      const activeLicense = await db.license.findFirst({
        where: {
          tenantId,
          status: "ACTIVE",
          plan: { in: ["pro", "enterprise", "business", "accountant"] },
          OR: [{ endDate: null }, { endDate: { gt: new Date() } }],
        },
        orderBy: { createdAt: "desc" },
        select: { plan: true },
      });
      if (activeLicense) {
        const licPlan = normalizePlanName(activeLicense.plan);
        // خودترمیمی best-effort — شکست هرگز دسترسی را نمی‌بندد
        try {
          await db.tenant.update({
            where: { id: tenantId },
            data: { plan: licPlan, status: "active" },
          });
        } catch {
          /* خودترمیمی اختیاری است */
        }
        return { allowed: true, reason: "plan_ok", plan: licPlan };
      }
    } catch (error) {
      console.error(
        "[storefront-access] بررسی لایسنس فعال خطا خورد — ادامه با پلن tenant:",
        error instanceof Error ? error.message : error
      );
    }
  }

  return computeStorefrontAccess(masterEnabled, override, planRaw);
}

/** پیام فارسی برای هر دلیل — منبع واحد API و UI */
export const STOREFRONT_ACCESS_MESSAGES: Record<StorefrontAccessReason, string> = {
  plan_ok: "فروشگاه آنلاین با پلن شما فعال است",
  override_granted: "دسترسی ویژهٔ فروشگاه آنلاین توسط مدیر سیستم فعال شده است",
  override_denied: "دسترسی فروشگاه آنلاین برای این حساب توسط مدیر سیستم مسدود شده است",
  master_off: "فروشگاه آنلاین موقتاً توسط مدیر سیستم غیرفعال است",
  plan_required:
    "فعال‌سازی عمومی فروشگاه در پلن‌های حرفه‌ای و سازمانی فعال است — پلن خود را ارتقا دهید یا از مدیر درخواست دسترسی ویژه کنید",
};
