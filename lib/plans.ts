/**
 * لایهٔ سروری پلن‌ها — پوشش‌های داینامیک سوپرادمین از دیتابیس (Server-Only)
 * --------------------------------------------------------------------------
 * این فایل «@/lib/db» را import می‌کند؛ بنابراین فقط در کد سرور قابل
 * استفاده است (API routes / Server Components / سرویس‌های بک‌اند).
 * کامپوننت‌های کلاینت باید از «@/lib/plans-static» import کنند — نه اینجا.
 *
 * تمام دادهٔ ایستا (PLANS، قیمت‌ها، فرمت‌ها، توابع خالص) در
 * «lib/plans-static.ts» است و از اینجا re-export می‌شود تا همهٔ
 * importهای قدیری «@/lib/plans» در کد سرور بدون تغییر کار کنند.
 *
 * FIX(R24-8): قبلاً این فایل با await import("@/lib/db") داینامیک، از
 * داخل گراف کلاینت (pricing-view → plans → db) باندل می‌شد و
 * require('module') در db.ts خطای «Module not found» می‌داد و کل سایت
 * ۵۰۰ می‌شد. حالا: دادهٔ ایستا جدا شد (plans-static) و این فایل فقط
 * سروری است — db هرگز وارد باندل مرورگر نمی‌شود.
 */

import { db } from "@/lib/db";
import {
 PLANS,
 PLAN_OVERRIDES_V2_KEY,
 PLAN_OVERRIDES_TTL_MS,
 type Plan,
 type PlanId,
 type PlanOverride,
 type PlanOverridesMap,
 type PlanOverridesV2Map,
 applyPriceSteps,
 applyPlanOverrideV2,
 getLicenseDefaults,
 monthlyPriceOfYearly,
 normalizePlanName,
 sanitizePlanOverridesV2,
 __setPlanOverridesCache,
 __planOverridesCacheAge,
} from "./plans-static";

// همهٔ صادرات ایستا — importهای قدیمی «@/lib/plans» در کد سرور سالم می‌مانند
export * from "./plans-static";

/**
 * بارگذاری async پوشش‌ها از SystemSettings با TTL — باید در مسیرهای
 * async (ساخت لایسنس/بررسی سهمیه) صدا زده شود.
 * FIX(9-a): سقف‌های v2 (plan_overrides_v2) هم خوانده و روی legacy ادغام
 * می‌شوند (v2 اولویت دارد) — features v2 فقط نمایشی است و روی توکن‌های
 * ماشینی لایسنس اعمال نمی‌شود.
 */
export async function getEffectiveLicenseDefaults(plan: string): Promise<import("./plans-static").LicenseDefaults> {
 const normalized = normalizePlanName(plan) as PlanId;
 const now = Date.now();
 if (__planOverridesCacheAge(now) > PLAN_OVERRIDES_TTL_MS) {
 try {
 const [legacyRow, v2Row] = await Promise.all([
 db.systemSettings.findUnique({ where: { key: "plan_overrides" } }),
 db.systemSettings.findUnique({ where: { key: PLAN_OVERRIDES_V2_KEY } }),
 ]);
 const merged: PlanOverridesMap = {};
 // ۱) پوشش‌های legacy (توکن‌های ماشین + سقف‌ها) — مبنای اولیه
 if (legacyRow?.value) {
 try {
 const parsed = JSON.parse(legacyRow.value) as PlanOverridesMap;
 if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
 Object.assign(merged, parsed);
 }
 } catch {
 // JSON legacy نامعتبر → نادیده
 }
 }
 // ۲) سقف‌های v2 روی آن (اولویت بالاتر)
 if (v2Row?.value) {
 try {
 const v2 = sanitizePlanOverridesV2(JSON.parse(v2Row.value));
 for (const [pid, ov] of Object.entries(v2)) {
 const lim: PlanOverride = { ...(merged[pid] || {}) };
 if (ov.maxUsers !== undefined) lim.maxUsers = ov.maxUsers;
 if (ov.maxInvoices !== undefined) lim.maxInvoices = ov.maxInvoices;
 if (ov.maxWarehouses !== undefined) lim.maxWarehouses = ov.maxWarehouses;
 merged[pid] = lim;
 }
 } catch {
 // JSON v2 نامعتبر → نادیده (بدون کرش)
 }
 }
 __setPlanOverridesCache(merged, now);
 } catch {
 // DB error → پیش‌فرض‌ها استفاده می‌شوند
 __setPlanOverridesCache({}, now);
 }
 }
 return getLicenseDefaults(normalized);
}

let effectivePlansCache: Plan[] | null = null;
let effectivePlansLoadedAt = 0;
/** جلوگیری از بارگذاری موازی (dogpile) — همه فراخوان‌های هم‌زمان یک Promise می‌گیرند */
let effectivePlansLoading: Promise<Plan[]> | null = null;
const EFFECTIVE_PLANS_TTL_MS = 60_000;

/**
 * پلن‌های مؤثر — PLANS استاتیک + پوشش‌های v2 سوپرادمین.
 * - کش درون‌حافظه‌ای ۶۰ ثانیه‌ای
 * - JSON نامعتبر → پوشش‌ها بی‌صدا نادیده گرفته می‌شوند (هرگز کرش نمی‌کند)
 * - خطای DB → مقادیر استاتیک برگردانده می‌شوند
 */
export async function getEffectivePlans(): Promise<Plan[]> {
 const now = Date.now();
 if (effectivePlansCache && now - effectivePlansLoadedAt <= EFFECTIVE_PLANS_TTL_MS) {
 return effectivePlansCache;
 }
 if (effectivePlansLoading) return effectivePlansLoading;
 effectivePlansLoading = (async () => {
 try {
 let overrides: PlanOverridesV2Map = {};
 try {
 const row = await db.systemSettings.findUnique({
 where: { key: PLAN_OVERRIDES_V2_KEY },
 });
 if (row?.value) {
 overrides = sanitizePlanOverridesV2(JSON.parse(row.value));
 }
 } catch {
 overrides = {}; // JSON نامعتبر یا خطای DB → بدون پوشش
 }
 // #22 (v34-5) — اعمال پله‌های افزایش قیمت تدریجی روی قیمت نهایی هر پلن
 // (بعد از پوشش‌های v2) — منبع واحد: صفحه قیمت، چک‌اوت و گزارش‌ها همه
 // همین قیمت پله‌شده را می‌بینند. گرد شدن به ۱۰ هزار تومان.
 effectivePlansCache = PLANS.map((p) => {
 const ov = overrides[p.id];
 const merged = ov ? applyPlanOverrideV2(p, ov) : { ...p };
 const stepped = applyPriceSteps(merged.priceToman);
 if (stepped !== merged.priceToman) {
 merged.priceToman = stepped;
 merged.priceRial = stepped * 10;
 }
 return merged;
 });
 } catch {
 effectivePlansCache = PLANS.map((p) => ({ ...p }));
 } finally {
 effectivePlansLoadedAt = Date.now();
 effectivePlansLoading = null;
 }
 return effectivePlansCache;
 })();
 return effectivePlansLoading;
}

/** بی‌اعتبار کردن کش پلن‌های مؤثر — بعد از هر ذخیره سوپرادمین صدا زده شود */
export function invalidateEffectivePlansCache(): void {
 effectivePlansCache = null;
 effectivePlansLoadedAt = 0;
}

/** دریافت پلن مؤثر با id (با normalize نام‌های قدیمی) */
export async function getEffectivePlan(planId: string): Promise<Plan | undefined> {
 const normalized = normalizePlanName(planId) as PlanId;
 const plans = await getEffectivePlans();
 return plans.find((p) => p.id === normalized);
}

/**
 * FIX(9-a): نسخه async ِ getPlanByPriceCheck با قیمت مؤثر — این نسخه در تمام
 * مسیرهای تسویه/اعتبارسنجی پرداخت استفاده می‌شود تا قیمت ویرایش‌شدهٔ
 * سوپرادمین واقعاً در چک‌اوت اعمال شود (نه قیمت استاتیک کد).
 */
export async function getPlanByPriceCheckEffective(
 planId: string,
 amountRial: number,
 period: "monthly" | "yearly" = "yearly"
): Promise<{ ok: boolean; expectedRial: number }> {
 const plan = await getEffectivePlan(planId);
 if (!plan) return { ok: false, expectedRial: 0 };
 // پلن رایگان قابل خرید نیست
 if (plan.priceToman <= 0) return { ok: false, expectedRial: 0 };
 // #22 (v34-5): قیمت ماهانه از MONTHLY_PRICE_DIVISOR (منبع واحد) مشتق می‌شود
 const expectedRial =
 period === "monthly"
 ? monthlyPriceOfYearly(plan.priceToman) * 10
 : plan.priceRial;
 return { ok: amountRial === expectedRial, expectedRial };
}

/**
 * نقشه قیمت مؤثر (id → تومان) — برای گزارش‌های درآمدی/تحلیلی سمت سرور
 * که قبلاً از PLAN_PRICES_TOMAN استاتیک می‌خواندند.
 */
export async function getEffectivePlanPricesToman(): Promise<Record<string, number>> {
 const plans = await getEffectivePlans();
 return plans.reduce(
 (acc, p) => {
 acc[p.id] = p.priceToman;
 return acc;
 },
 {} as Record<string, number>
 );
}
