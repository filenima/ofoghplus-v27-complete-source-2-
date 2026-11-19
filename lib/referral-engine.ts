// ============ افق پلاس — موتور رفرال (FIX v12.1 — سیستم رفرال سرتاسری) ============
// -----------------------------------------------------------------------------
// مشکل قبلی (گزارش شکار باگ): قیف رفرال ۱۰۰٪ کد مرده بود —
//   ۱) هیچ مسیر ثبت‌نامی referral/track را صدا نمی‌زد
//   ۲) ویجت رفرال هیچ‌جا رندر نمی‌شد
//   ۳) لینک ?ref= در landing پیدا نمی‌شد
//   ۴) هیچ چیز REWARDED را ست نمی‌کرد
// این ماژول منطق مشترک را یک‌جا دارد تا register / trial / register-and-pay
// همگی از آن استفاده کنند.
// -----------------------------------------------------------------------------

import type { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import { REFERRAL_REWARD_TOMAN } from "@/lib/referral-config";

/**
 * R15 — ساخت/بازیابی «کد دعوت شخصی» کاربر.
 * این کد همون لحظه‌ای که حساب ساخته می‌شود وجود دارد — بدون نیاز به ثبت
 * ایمیل دوست یا هر مرحله اضافه‌ای. برای کاربران قدیمی به‌صورت تنبل ساخته می‌شود.
 * قالب: OF-XXXXXX (۶ کاراکتر از الفبای بدون ابهام — بدون 0/O/1/I)
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePersonalCode(seed: string): string {
  // FIX(R15-C/lint): require() سبک CJS در ESLint ممنوع بود — import سبک ESM
  // سرور (فقط مسیرهای API این فایل را import می‌کنند، نه کلاینت).
  const hash = createHash("sha256")
    .update(`${seed}:${randomBytes(8).toString("hex")}`)
    .digest("hex");
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[parseInt(hash.slice(i * 2, i * 2 + 2), 16) % CODE_ALPHABET.length];
  }
  return `OF-${code}`;
}

/**
 * R15 — تضمین وجود کد شخصی برای کاربر (idempotent).
 * اگر کاربر کد ندارد، یکی می‌سازد و ذخیره می‌کند. کد کاربر را برمی‌گرداند.
 */
export async function ensurePersonalCode(
  db: PrismaClient | any,
  userId: string
): Promise<string> {
  const user = await (db as PrismaClient).user.findUnique({
    where: { id: userId },
    select: { personalCode: true },
  });
  if (user?.personalCode) return user.personalCode;

  // ساخت کد یکتا با retry (تصادم با کاربر دیگر تقریباً ناممکن است)
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generatePersonalCode(userId);
    try {
      const updated = await (db as PrismaClient).user.update({
        // R15-TSC: فیلتر null روی ستون nullable — تایپ کلاینت Prisma آن را string
        // می‌گیرد؛ cast موضعی برای شرط «فقط وقتی هنوز کد ندارد» (idempotency)
        where: { id: userId, personalCode: null } as any,
        data: { personalCode: code },
        select: { personalCode: true },
      });
      if (updated.personalCode) return updated.personalCode;
    } catch {
      /* تصادم unique یا شرط نقض شد — تلاش دوباره */
    }
    // شاید فراخوانی هم‌زمان کد ساخته باشد
    const again = await (db as PrismaClient).user.findUnique({
      where: { id: userId },
      select: { personalCode: true },
    });
    if (again?.personalCode) return again.personalCode;
  }
  // آخرین بازگشت — حتی اگر ذخیره نشد، کد این لحظه را بده
  return generatePersonalCode(userId);
}

export interface ApplyReferralResult {
  applied: boolean;
  reason?: string;
  referralId?: string;
  referrerId?: string;
  loyaltyAwarded?: boolean;
  loyaltyMessage?: string;
  /** Task 23-A — پاداش دوطرفه: روزهایی که به تریال دعوت‌شده اضافه شد */
  refereeBonusDays?: number;
  refereeBonusMessage?: string;
  /** R14-D — آیا پاداش ۱,۰۰۰,۰۰۰ تومانی کیف پول همین حالا اعطا شد؟ */
  rewardGranted?: boolean;
}

/** Task 23-A — پاداش استاندارد دعوت‌شده: ۱۴ روز تریال اضافه (۱۴→۲۸) */
export const REFEREE_BONUS_DAYS = 14;

/**
 * Task 23-A — اعطای ۱۴ روز پاداش به کاربر «دعوت‌شده»:
 * تمدید لایسنس ACTIVE آن tenant (اگر endDate دارد) + تمدید trialEndsAt خود کاربر.
 * اتمیک نیست اما best-effort و idempotent (فقط وقتی refereeBonusDays=0 رکورد).
 * برمی‌گرداند: تعداد روزهایی که واقعاً اعطا شد (۰ = هیچ).
 */
export async function grantRefereeBonus(
  db: PrismaClient | any,
  params: {
    referralId: string;
    refereeUserId: string;
    days?: number;
  }
): Promise<{ days: number; message: string }> {
  const days = Math.min(90, Math.max(0, Math.round(params.days ?? REFEREE_BONUS_DAYS)));
  if (days <= 0) return { days: 0, message: "" };

  // قفل رکورد با شرط refereeBonusDays=0 → idempotent (دو ثبت‌نام هم‌زمان دوباره اعطا نمی‌کنند)
  const claimed = await (db as PrismaClient).referral.updateMany({
    where: { id: params.referralId, refereeBonusDays: 0 },
    data: { refereeBonusDays: days },
  });
  if (claimed.count === 0) {
    return { days: 0, message: "پاداش دعوت‌شده قبلاً اعطا شده است" };
  }

  const referee = await (db as PrismaClient).user.findUnique({
    where: { id: params.refereeUserId },
    select: { id: true, tenantId: true, isTrial: true, trialEndsAt: true },
  });
  if (!referee || !referee.tenantId) {
    return { days: 0, message: "کاربر دعوت‌شده یافت نشد" };
  }

  const bonusMs = days * 24 * 60 * 60 * 1000;
  let extendedLicense = false;

  // ۱) تمدید لایسنس ACTIVE با endDate (تریال و اشتراک‌های زمان‌دار)
  try {
    const activeLicenses = await (db as PrismaClient).license.findMany({
      where: { tenantId: referee.tenantId, status: "ACTIVE", endDate: { not: null } },
      select: { id: true, endDate: true },
    });
    for (const lic of activeLicenses) {
      const base = lic.endDate && lic.endDate > new Date() ? lic.endDate : new Date();
      const newEnd = new Date(base.getTime() + bonusMs);
      await (db as PrismaClient).license.update({
        where: { id: lic.id },
        data: { endDate: newEnd },
      });
      extendedLicense = true;
    }
  } catch (e) {
    console.warn("[referral] referee bonus license extend failed:", e);
  }

  // ۲) تمدید trialEndsAt خود کاربر (شمارش معکوس UI /api/license/status)
  let extendedUser = false;
  try {
    if (referee.isTrial && referee.trialEndsAt) {
      const base = referee.trialEndsAt > new Date() ? referee.trialEndsAt : new Date();
      await (db as PrismaClient).user.update({
        where: { id: referee.id },
        data: { trialEndsAt: new Date(base.getTime() + bonusMs) },
      });
      extendedUser = true;
    }
  } catch (e) {
    console.warn("[referral] referee bonus trialEndsAt extend failed:", e);
  }

  // ۳) Audit شفاف
  try {
    await (db as PrismaClient).auditLog.create({
      data: {
        tenantId: referee.tenantId,
        userId: referee.id,
        action: "REFERRAL_REFEREE_BONUS",
        entity: "Referral",
        entityId: params.referralId,
        changes: JSON.stringify({
          days,
          extendedLicense,
          extendedUser,
        }),
      },
    });
  } catch {
    /* ignore */
  }

  return {
    days,
    message: extendedLicense || extendedUser
      ? `${days} روز به دوره آزمایشی/اشتراک شما اضافه شد`
      : "پاداش دعوت ثبت شد (لایسنس زمان‌دار فعالی برای تمدید یافت نشد)",
  };
}

/**
 * اعمال کد رفرال هنگام ثبت‌نام کاربر جدید.
 *
 * FIX(v12.1.2 — رفرال دقیق): کد رفرال «کد شخصی دعوت‌کننده» است — یک کد
 * می‌تواند چند دعوت را پوشش دهد. دو مسیر ورودی:
 *  A) دعوت مستقیم (فرم ویجت): رکورد PENDING با refereeEmail ازپیش‌تعیین‌شده →
 *     ثبت‌نام با همان ایمیل، همان رکورد را SIGNED_UP می‌کند.
 *  B) لینک عمومی ?ref=CODE: دوست با ایمیل خودش ثبت‌نام می‌کند → رکورد جدید
 *     SIGNED_UP با همان کد شخصی ساخته می‌شود (قبلاً EMAIL_MISMATCH می‌شد و
 *     رفرال گم می‌شد).
 *
 * امنیت:
 *  - self-referral ممنوع (referee !== referrer)
 *  - idempotent — کاربر دعوت‌شده قبلاً با این کد track شده باشد، دوباره track نمی‌شود
 *  - اعطای ۱۰۰ امتیاز وفاداری به دعوت‌کننده (best-effort)
 */
export async function applyReferralOnSignup(
  db: PrismaClient | any,
  params: {
    code: string;
    refereeUserId: string;
    refereeEmail?: string | null;
    refereeTenantId?: string | null;
  }
): Promise<ApplyReferralResult> {
  const code = String(params.code || "").trim().toUpperCase();
  if (!code) return { applied: false, reason: "NO_CODE" };

  // همه رکوردهای این کد — کد متعلق به یک دعوت‌کننده (صاحب کد)
  let refs = await (db as PrismaClient).referral.findMany({
    where: { code },
    orderBy: { createdAt: "asc" },
  });

  // R15 — اگر کدی در جدول Referral نبود، کد «شخصی» کاربر (User.personalCode)
  // چک می‌شود — کد اختصاصی همون لحظه پس از ثبت‌نام وجود دارد و رکورد دعوت
  // هنوز ساخته نشده است. صاحب کد = همان کاربر؛ رکورد SIGNED_UP همین‌جا ساخته می‌شود.
  if (!refs || refs.length === 0) {
    const codeOwner = await (db as PrismaClient).user.findFirst({
      where: { personalCode: code },
      select: { id: true, isActive: true, deletedAt: true },
    });
    if (codeOwner) {
      refs = [
        {
          id: "__personal__",
          referrerId: codeOwner.id,
          refereeEmail: "",
          code,
          status: "PENDING",
          reward: REFERRAL_REWARD_TOMAN,
          refereeUserId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any;
    }
  }
  if (!refs || refs.length === 0) return { applied: false, reason: "INVALID_CODE" };

  const ownerReferrerId = refs[0].referrerId;

  // self-referral ممنوع — کد خودش را وارد کرده
  if (ownerReferrerId === params.refereeUserId) {
    return { applied: false, reason: "SELF_REFERRAL", referralId: refs[0].id };
  }

  // idempotent — این کاربر قبلاً با این کد track شده است
  const alreadyTracked = refs.find(
    (r: { refereeUserId: string | null }) => r.refereeUserId === params.refereeUserId
  );
  if (alreadyTracked) {
    return { applied: false, reason: "ALREADY_TRACKED", referralId: alreadyTracked.id };
  }

  // دعوت‌کننده باید هنوز کاربر فعال باشد
  const referrer = await (db as PrismaClient).user.findUnique({
    where: { id: ownerReferrerId },
    select: { id: true, tenantId: true, isActive: true, deletedAt: true },
  });
  if (!referrer || !referrer.isActive || referrer.deletedAt) {
    return { applied: false, reason: "REFERRER_INACTIVE", referralId: refs[0].id };
  }

  // ─── مسیر A: دعوت مستقیم — رکورد PENDING با همین ایمیل → همان رکورد ───
  const refereeEmailNorm = params.refereeEmail
    ? String(params.refereeEmail).toLowerCase().trim()
    : "";
  const directInvite = refs.find(
    (r: { status: string; refereeEmail: string }) =>
      r.status === "PENDING" &&
      refereeEmailNorm &&
      r.refereeEmail &&
      r.refereeEmail.toLowerCase() === refereeEmailNorm
  );

  let referralId: string;
  if (directInvite) {
    await (db as PrismaClient).referral.update({
      where: { id: directInvite.id },
      data: {
        status: "SIGNED_UP",
        refereeUserId: params.refereeUserId,
        updatedAt: new Date(),
      },
    });
    referralId = directInvite.id;
  } else {
    // ─── مسیر B: لینک عمومی — رکورد جدید SIGNED_UP با کد شخصی ───
    // ایمیل دعوت‌شده اگر با رکورد PENDING دیگری بخورد ولی آن رکورد مال ایمیل
    // دیگری است (ایمیل match نشد)، رکورد جدید می‌سازیم — قیف رفرال گم نمی‌شود.
    const created = await (db as PrismaClient).referral.create({
      data: {
        referrerId: ownerReferrerId,
        refereeEmail: refereeEmailNorm || "(ثبت‌نام با لینک دعوت)",
        code,
        status: "SIGNED_UP",
        // R14-D — پاداش نقدی هر رفرال (منبع واحد: lib/referral-config)
        reward: REFERRAL_REWARD_TOMAN,
        refereeUserId: params.refereeUserId,
      },
    });
    referralId = created.id;
  }

  // ۱۰۰ امتیاز وفاداری (best-effort — نباید ثبت‌نام را بترکاند)
  let loyaltyAwarded = false;
  let loyaltyMessage = "";
  try {
    const { awardAuto } = await import("@/lib/loyalty-engine");
    const result = await awardAuto(referrer.tenantId, referrer.id, "REFERRAL", referralId);
    loyaltyAwarded = result.awarded;
    loyaltyMessage = result.message;
  } catch (e) {
    console.warn("[referral] loyalty award failed:", e);
  }

  // ─── Task 23-A: پاداش دوطرفه — ۱۴ روز به تریال/اشتراک «دعوت‌شده» ───
  // دعوت‌کننده: ۱٬۰۰۰٬۰۰۰ تومان پاداش نقدی کیف پول (R14-D — همین پایین)
  // دعوت‌شده: همین‌جا و بدون منتظر ماندن، ۱۴ روز اضافه (تریال ۱۴→۲۸ روز)
  let refereeBonusDays = 0;
  let refereeBonusMessage = "";
  try {
    const bonus = await grantRefereeBonus(db, {
      referralId,
      refereeUserId: params.refereeUserId,
    });
    refereeBonusDays = bonus.days;
    refereeBonusMessage = bonus.message;
  } catch (e) {
    console.warn("[referral] referee bonus failed (non-blocking):", e);
  }

  // ─── R16: پاداش نقدی دیگر در ثبت‌نام اعطا نمی‌شود ───
  // تصمیم مالک: پاداش ۱٬۰۰۰٬۰۰۰ تومانی وقتی واریز می‌شود که دعوت‌شده
  // «لایسنس بخرد» و خریدش تأیید شود (verify/callback/اقساط).
  // در ثبت‌نام فقط: علامت SIGNED_UP + ۱۴ روز تریال اضافهٔ دعوت‌شده (بالا).
  // اعطای پاداش در لحظهٔ خرید: rewardReferralsOnPaidConversion() (idempotent)
  // از مسیرهای payments/callback + integrations/payment/verify + installments.

  // FIX(3-a-h4): rewardGranted در return و audit-log استفاده می‌شد ولی تعریف
  // نشده بود → ReferenceError در هر ثبت‌نام با کد دعوت؛ در register خطا catch
  // می‌شد و grantReferralReward دعوت‌کننده هرگز اجرا نمی‌شد (باگ «رفرال پاداش
  // نمی‌دهد» که ادعای رفعش شده بود، عملاً بازگشته بود). این تابع خودش پاداش
  // نمی‌دهد (R16) — فراخوانندهٔ خرید/register اعطا می‌کند؛ پس همیشه false.
  const rewardGranted = false;

  // audit log (best-effort)
  try {
    await (db as PrismaClient).auditLog.create({
      data: {
        tenantId: params.refereeTenantId ?? referrer.tenantId,
        userId: params.refereeUserId,
        action: "REFERRAL_TRACKED",
        entity: "Referral",
        entityId: referralId,
        changes: JSON.stringify({
          code,
          referrerId: ownerReferrerId,
          refereeUserId: params.refereeUserId,
          loyaltyAwarded,
          refereeBonusDays,
          rewardGranted,
          rewardToman: REFERRAL_REWARD_TOMAN,
          path: directInvite ? "DIRECT" : "PUBLIC_LINK",
        }),
      },
    });
  } catch {
    /* ignore */
  }

  return {
    applied: true,
    referralId,
    referrerId: ownerReferrerId,
    loyaltyAwarded,
    loyaltyMessage,
    refereeBonusDays,
    refereeBonusMessage,
    rewardGranted,
  };
}

/**
 * R28-7 (فاز ۱ سند R25 — رفرال دوطرفه): پاداش سمت «دعوت‌شده».
 *
 * ۳۰۰٬۰۰۰ تومان اعتبار کیف پول (REFERRAL_REFEREE_REWARD_TOMAN) که یک‌بار،
 * به‌محض «اولین فاکتور» دعوت‌شده اعطا می‌شود — قلاب: مسیرهای ساخت فاکتور
 * (api/invoices + api/accounting/invoices) داخل بلوکِ «اولین فاکتور tenant».
 *
 * idempotent: کلید کیف پول «referee-bonus:{referralId}» فقط یک‌بار شارژ
 * می‌کند؛ سوییچ‌های per-plan (referral + wallet) پلنِ خود دعوت‌شده رعایت
 * می‌شود. هرگز خطا نمی‌دهد (fire-and-forget از مسیر فاکتور).
 */
export async function grantRefereeFirstInvoiceReward(
  db: PrismaClient | any,
  params: { tenantId: string; userId?: string | null }
): Promise<{ granted: boolean; reason?: string }> {
  try {
    // کاربر دعوت‌شده: اول خود کاربرِ سازندهٔ فاکتور، وگرنه کاربران tenant
    let refereeUserId: string | null = params.userId ?? null;
    if (!refereeUserId) {
      const tenantUsers = await (db as PrismaClient).user.findMany({
        where: { tenantId: params.tenantId },
        select: { id: true },
        take: 5,
        orderBy: { createdAt: "asc" },
      });
      refereeUserId = tenantUsers[0]?.id ?? null;
    }
    if (!refereeUserId) return { granted: false, reason: "NO_REFEREE_USER" };

    // رکورد رفرالِ همین دعوت‌شده (بعد از ثبت‌نام حداقل SIGNED_UP است)
    const referral = await (db as PrismaClient).referral.findFirst({
      where: { refereeUserId, status: { in: ["SIGNED_UP", "REWARDED"] } },
      orderBy: { createdAt: "asc" },
    });
    if (!referral) return { granted: false, reason: "NO_REFERRAL" };

    // دعوت‌شده باید tenant معتبر داشته باشد (کیف پول روی شرکت او شارژ می‌شود)
    const refereeUser = await (db as PrismaClient).user.findUnique({
      where: { id: refereeUserId },
      select: { id: true, tenantId: true, name: true, email: true },
    });
    if (!refereeUser?.tenantId || refereeUser.tenantId !== params.tenantId) {
      return { granted: false, reason: "TENANT_MISMATCH" };
    }

    // سوییچ per-plan پلنِ خود دعوت‌شده
    const refereeTenant = await (db as PrismaClient).tenant.findUnique({
      where: { id: params.tenantId },
      select: { plan: true },
    });
    const { getPlanFeatureToggles, applyRefereeWalletReward } = await import("@/lib/wallet");
    const toggles = await getPlanFeatureToggles(refereeTenant?.plan ?? "free");
    if (!toggles.referral || !toggles.wallet) {
      return { granted: false, reason: "WALLET_DISABLED_FOR_PLAN" };
    }

    // نام دعوت‌کننده برای توضیح شفاف تراکنش (best-effort)
    let referrerLabel = "";
    try {
      const referrer = await (db as PrismaClient).user.findUnique({
        where: { id: referral.referrerId },
        select: { name: true },
      });
      referrerLabel = referrer?.name || "";
    } catch {
      /* ignore */
    }

    const res = await applyRefereeWalletReward({
      referralId: referral.id,
      refereeTenantId: params.tenantId,
      refereeUserId: refereeUser.id,
      referrerLabel,
    });
    return { granted: res.ok && !res.skipped, reason: res.skipped ? "ALREADY_GRANTED" : undefined };
  } catch (e) {
    console.warn("[referral] referee first-invoice reward failed (non-blocking):", e);
    return { granted: false, reason: "ERROR" };
  }
}

/**
 * تبدیل رفرال به REWARDED — فقط از مسیر SIGNED_UP (state-machine یک‌طرفه).
 * R14-D: مقدار پاداش روی رکورد ثبت می‌شود (REFERRAL_REWARD_TOMAN).
 */
export async function markReferralRewarded(
  db: PrismaClient | any,
  referralId: string
): Promise<{ ok: boolean; reason?: string }> {
  const referral = await (db as PrismaClient).referral.findUnique({
    where: { id: referralId },
  });
  if (!referral) return { ok: false, reason: "NOT_FOUND" };
  if (referral.status !== "SIGNED_UP") {
    return { ok: false, reason: "NOT_SIGNED_UP" };
  }
  await (db as PrismaClient).referral.update({
    where: { id: referralId },
    data: { status: "REWARDED", reward: REFERRAL_REWARD_TOMAN, updatedAt: new Date() },
  });
  return { ok: true };
}

/**
 * R14-D — اعطای کامل پاداش رفرال: SIGNED_UP → REWARDED + شارژ ۱,۰۰۰,۰۰۰
 * تومانی کیف پول دعوت‌کننده (قابل برداشت). idempotent دوبل:
 *  ۱) markReferralRewarded یک‌طرفه است — فقط رکورد SIGNED_UP تبدیل می‌شود
 *  ۲) WalletTransaction با idempotencyKey «referral:{id}» فقط یک‌بار ثبت می‌شود
 * سوییچ‌های per-plan دعوت‌کننده رعایت می‌شود (referral + wallet روشن باشد).
 */
export async function grantReferralReward(
  db: PrismaClient | any,
  params: { referralId: string; refereeLabel?: string; refereePlan?: string | null }
): Promise<{ ok: boolean; reason?: string; walletCredited?: boolean }> {
  // ۱) قفل state-machine — رفرال فقط یک‌بار پاداش می‌گیرد
  const marked = await markReferralRewarded(db, params.referralId);
  if (!marked.ok) return { ok: false, reason: marked.reason };

  const referral = await (db as PrismaClient).referral.findUnique({
    where: { id: params.referralId },
    select: { referrerId: true, refereeEmail: true },
  });
  if (!referral) return { ok: false, reason: "NOT_FOUND" };

  // ۲) شارژ کیف پول دعوت‌کننده (best-effort — وضعیت REWARDED معتبر می‌ماند)
  try {
    const referrerUser = await (db as PrismaClient).user.findUnique({
      where: { id: referral.referrerId },
      select: { id: true, tenantId: true },
    });
    if (referrerUser?.tenantId) {
      const referrerTenant = await (db as PrismaClient).tenant.findUnique({
        where: { id: referrerUser.tenantId },
        select: { plan: true },
      });
      const { getPlanFeatureToggles, applyReferralWalletReward } = await import("@/lib/wallet");
      const toggles = await getPlanFeatureToggles(referrerTenant?.plan ?? "free");
      if (toggles.referral && toggles.wallet) {
        const walletRes = await applyReferralWalletReward({
          referralId: params.referralId,
          referrerTenantId: referrerUser.tenantId,
          referrerUserId: referrerUser.id,
          refereePlan: params.refereePlan ?? undefined,
          refereeLabel: params.refereeLabel || referral.refereeEmail || undefined,
        });
        return { ok: true, walletCredited: walletRes.ok && !walletRes.skipped };
      }
      return { ok: true, walletCredited: false };
    }
    return { ok: true, walletCredited: false };
  } catch (e) {
    console.warn("[referral] wallet reward credit failed (non-blocking):", e);
    return { ok: true, walletCredited: false };
  }
}

/**
 * Task 3-c (دقت رفرال) — پاداش «اولین تبدیل پرداختی» برای کاربران موجود.
 *
 * گمشدهٔ زنجیره: کاربری که با کد دعوت «تریال» ساخته (SIGNED_UP ثبت شده) و
 * بعداً هنگامِ ورود‌به‌حساب اشتراک می‌خرد (فلو payment/create)، در verify فقط
 * مسیر register-and-pay پاداش می‌داد → رکوردهای SIGNED_UP همان کاربر برای
 * همیشه بدون REWARDED و بدون پاداش کیف پول می‌ماندند.
 *
 * R14-D: پاداش اکنون به‌محض فعال‌سازی ثبت‌نام اعطا می‌شود؛ این تابع به‌عنوان
 * تور ایمنی برای رکوردهای قدیمیِ SIGNED_UP (قبل از R14-D) باقی می‌ماند و
 * همان مسیر واحد grantReferralReward (۱٬۰۰۰٬۰۰۰ ت + سوییچ per-plan) را
 * صدا می‌زند — idempotent (WalletTransaction با کلید referral:{id} فقط یک‌بار).
 */
export async function rewardReferralsOnPaidConversion(
  db: PrismaClient | any,
  params: { tenantId: string; planId?: string | null }
): Promise<{ rewarded: number; walletCredited: number }> {
  const tenantUsers = await (db as PrismaClient).user.findMany({
    where: { tenantId: params.tenantId },
    select: { id: true },
  });
  if (!tenantUsers || tenantUsers.length === 0) return { rewarded: 0, walletCredited: 0 };

  const pending = await (db as PrismaClient).referral.findMany({
    where: {
      refereeUserId: { in: tenantUsers.map((u: { id: string }) => u.id) },
      status: "SIGNED_UP",
    },
  });
  if (!pending || pending.length === 0) return { rewarded: 0, walletCredited: 0 };

  let rewarded = 0;
  let walletCredited = 0;

  for (const ref of pending) {
    // R14-D — مسیر واحد اعطای پاداش (state-machine + کیف پول idempotent)
    const res = await grantReferralReward(db, {
      referralId: ref.id,
      refereePlan: params.planId ?? null,
    });
    if (!res.ok) continue;
    rewarded += 1;
    if (res.walletCredited) walletCredited += 1;
  }

  if (rewarded > 0) {
    console.info(
      `[referral] تبدیل پرداختی کاربر موجود: ${rewarded} رفرال REWARDED شد (tenant=${params.tenantId})`
    );
  }
  return { rewarded, walletCredited };
}
