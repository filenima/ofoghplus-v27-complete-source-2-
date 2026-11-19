/**
 * تعریف یکپارچه پلن‌ها و قیمت‌ها — بخش ایستا (Browser-Safe)
 * --------------------------------------------------------------------------
 * این فایل فقط دادهٔ ایستا و توابع خالص را دارد — هیچ import از DB/سرور
 * ندارد و به‌درون گراف کلاینت (browser bundle) اجازهٔ ورود دارد.
 * توابع async که DB می‌خوانند (getEffectivePlans و ...) در «lib/plans.ts»
 * (فقط سرور) هستند. فایل‌های کلاینت باید از «@/lib/plans-static» import کنند.
 *
 * منبع واحد قیمت‌گذاری افق پلاس. هر تغییری در قیمت‌ها فقط در اینجا انجام شود.
 *
 * قیمت‌ها به تومان ایران (سالانه):
 * - رایگان: ۰ تومان
 * - پایه: ۹,۷۵۰,۰۰۰ تومان/سال
 * - حرفه‌ای: ۱۴,۹۰۰,۰۰۰ تومان/سال (محبوب‌ترین)
 * - سازمانی: ۳۹,۹۰۰,۰۰۰ تومان/سال
 *
 * تمام مبالغ به تومان است. برای ریال ضرب در ۱۰.
 */

export type PlanId = "free" | "basic" | "pro" | "enterprise" | "mini";

// =====================================================================
// #22 (v34-5) — پلن ماهانه + افزایش قیمت تدریجی
// ---------------------------------------------------------------------
// قیمت ماهانه از قیمت سالانه مشتق می‌شود (منبع واحد — بدون عدد تکراری):
// قیمت ماهانه = قیمت سالانه ÷ MONTHLY_PRICE_DIVISOR
// با مقسوم‌علیه ۱۰، پرداخت سالانه دقیقاً معادل «۲ ماه رایگان» است
// (۱۲ × ماهانه − سالانه = ۲ × ماهانه ≈ ۱۷٪ صرفه‌جویی) — همان ادعای
// صفحه قیمت و FAQ. هر تغییر این عدد باید با متن‌های بازاریابی هماهنگ شود.
// =====================================================================
export const MONTHLY_PRICE_DIVISOR = 10;

/** قیمت ماهانه به تومان از قیمت سالانه — قیمت‌های سالانه مضرب ۱۰ هزارند
 * پس حاصل همیشه مضرب تمیزی است؛ برای اطمینان به نزدیک‌ترین ۱٬۰۰۰ گرد می‌شود */
export function monthlyPriceOfYearly(yearlyToman: number): number {
  if (yearlyToman <= 0) return 0;
  return Math.round(yearlyToman / MONTHLY_PRICE_DIVISOR / 1000) * 1000;
}

// =====================================================================
// #22 (v34-5) — برنامهٔ افزایش قیمت تدریجی (پله‌ای)
// ---------------------------------------------------------------------
// قیمت‌های فعلی تا پلهٔ اول ثابت می‌مانند؛ بعد از تاریخ هر پله، ضریب آن
// (و ضریب پله‌های قبلی — تجمعی) روی قیمت مؤثر هر پلن اعمال می‌شود و
// حاصل به نزدیک‌ترین ۱۰٬۰۰۰ تومان گرد می‌شود. منبع اعمال: getEffectivePlans
// (یعنی صفحه قیمت، چک‌اوت و گزارش‌های درآمدی همه خودکار پله را می‌بینند).
// خریدی که «قبل» از پله ثبت شود به قیمت لحظهٔ خرید نزد می‌شود (رکورد
// پرداخت مبلغ را ذخیره می‌کند — verify مبلغ رکورد را ملاک می‌داند).
// =====================================================================
export interface PriceStep {
  /** تاریخ شروع اعمال پله (ISO 8601 با منطقهٔ زمانی تهران) */
  startsAt: string;
  /** ضریب اعمالی روی قیمت (۱٫۰۸ = افزایش ۸٪) */
  multiplier: number;
  /** یادداشت فارسی دلیل/شرح پله — برای مستندسازی و بنر اطلاع‌رسانی */
  note: string;
}

/** برنامهٔ پله‌های افزایش قیمت — فعلاً حداکثر ۲ گام (تصمیم مالک #۲۲) */
export const PRICE_STEPS: PriceStep[] = [
  // پلهٔ ۱ — از ۱ آذر ۱۴۰۵ (۲۲ نوامبر ۲۰۲۶): ۸٪ افزایش
  { startsAt: "2026-11-22T00:00:00+03:30", multiplier: 1.08, note: "افزایش مرحله‌ای قیمت — گام اول (۸٪)" },
  // پلهٔ ۲ — از ۱ اسفند ۱۴۰۵ (۲۰ فوریه ۲۰۲۷): ۸٪ دیگر (نسبت به گام اول)
  { startsAt: "2027-02-20T00:00:00+03:30", multiplier: 1.08, note: "افزایش مرحله‌ای قیمت — گام دوم (۸٪)" },
];

/** گرد کردن قیمت پله‌شده به نزدیک‌ترین ۱۰ هزار تومان */
const PRICE_ROUND_STEP_TOMAN = 10_000;

/** ضریب تجمعی همهٔ پله‌هایی که تا لحظهٔ «at» شروع شده‌اند */
export function priceStepMultiplierAt(at: Date = new Date()): number {
  const t = at.getTime();
  let m = 1;
  for (const step of PRICE_STEPS) {
    const start = new Date(step.startsAt).getTime();
    if (Number.isFinite(start) && t >= start) m *= step.multiplier;
  }
  return m;
}

/** اعمال پله‌های رسیده روی یک قیمت (تومان) — رایگان (۰) تغییر نمی‌کند */
export function applyPriceSteps(priceToman: number, at: Date = new Date()): number {
  if (priceToman <= 0) return priceToman;
  const m = priceStepMultiplierAt(at);
  if (m === 1) return priceToman;
  return Math.round((priceToman * m) / PRICE_ROUND_STEP_TOMAN) * PRICE_ROUND_STEP_TOMAN;
}

/** اطلاعات نزدیک‌ترین پلهٔ افزایش قیمتِ آینده */
export interface NextPriceRise {
  /** تاریخ شروع پله (ISO) */
  at: string;
  /** ضریب این پله (۱٫۰۸ = +۸٪) */
  multiplier: number;
  /** یادداشت فارسی پله */
  note: string;
  /** قیمت فعلی (اگر قیمت پایه داده شده باشد) — پیش از پله */
  fromPrice: number | null;
  /** قیمت پس از پله (اگر قیمت پایه داده شده باشد) — گرد به ۱۰ هزار */
  toPrice: number | null;
}

/**
 * نزدیک‌ترین پلهٔ آیندهٔ افزایش قیمت — #22.
 * @param currentPriceToman اختیاری: قیمت فعلی (پایهٔ دورهٔ انتخابی) — اگر
 *   داده شود fromPrice/toPrice هم پر می‌شوند (برای کارت‌های پلن و بنر).
 * @param at لحظهٔ مرجع (پیش‌فرض الان)
 */
export function nextPriceRise(
  currentPriceToman?: number,
  at: Date = new Date()
): NextPriceRise | null {
  const t = at.getTime();
  const upcoming = PRICE_STEPS.map((step) => ({ step, start: new Date(step.startsAt).getTime() }))
    .filter((x) => Number.isFinite(x.start) && x.start > t)
    .sort((a, b) => a.start - b.start);
  const first = upcoming[0];
  if (!first) return null;
  let fromPrice: number | null = null;
  let toPrice: number | null = null;
  if (typeof currentPriceToman === "number" && currentPriceToman > 0) {
    fromPrice = currentPriceToman;
    toPrice =
      Math.round((currentPriceToman * first.step.multiplier) / PRICE_ROUND_STEP_TOMAN) *
      PRICE_ROUND_STEP_TOMAN;
  }
  return {
    at: first.step.startsAt,
    multiplier: first.step.multiplier,
    note: first.step.note,
    fromPrice,
    toPrice,
  };
}

/**
 * FIX(v35-trial): منبع واحد مدت آزمایش رایگان — ۷ روز (درخواست مالک).
 * قبلاً ۳ روز بود؛ حالا کاربران ۷ روز کامل می‌توانند همه امکانات را تست کنند.
 * برای تغییر مدت تریال فقط همین عدد را عوض کنید.
 */
export const TRIAL_DAYS = 7;

/** میلی‌ثانیه‌های مدت تریال — برای محاسبه trialEndsAt */
export const TRIAL_DURATION_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

/** برچسب فارسی مدت تریال برای UI */
export const TRIAL_DAYS_LABEL_FA = "۷ روز";

export interface Plan {
 id: PlanId;
 /** نام نمایشی فارسی */
 name: string;
 /** نام انگلیسی برای API و دیتابیس */
 nameEn: string;
 /** قیمت سالانه به تومان */
 priceToman: number;
 /** قیمت سالانه به ریال */
 priceRial: number;
 /** دوره صورتحساب */
 period: "سالانه" | "رایگان";
 /** توضیح کوتاه */
 description: string;
 /** لیست امکانات */
 features: string[];
 /** پلن محبوب؟ */
 popular?: boolean;
 /** متن دکمه CTA */
 cta: string;
 /** رنگ تم پلن (برای کارت) */
 accent: "slate" | "emerald" | "violet" | "amber";
 /** حداکثر کاربر */
 maxUsers: number;
 /** حداکثر انبار */
 maxWarehouses: number;
 /**
 * FIX(v18-لایسنس): سقف فاکتور سالانه — -1 یعنی نامحدود.
 * منبع واحد برای اعمال سهمیه (server-side) و ساخت لایسنس.
 */
 maxInvoices: number;
 /** آیا آزمایش رایگان دارد؟ */
 trialAvailable: boolean;
 /** تعداد روزهای آزمایش رایگان (در صورت وجود) */
 trialDays?: number;
 /** آیا پلن در صفحه قیمت‌گذاری مخفی باشد؟ (برای backward compat) */
 hidden?: boolean;
}

export const PLANS: Plan[] = [
 // =================================================================
 // v35.4 (پیشنهاد ۴ سند روانشناسی): پلن «مینی» رایگانِ همیشگی —
 // بعد از پایان تریال به‌جای قفل کامل، کاربر به‌صورت خودکار به این
 // پلن می‌رود (Foot-in-the-door): ۵ فاکتور در ماه، ۱ کاربر، ۱ انبار.
 // داده‌ها و عادت کاربر حفظ می‌شود؛ ارتقا از دل دادهٔ موجود آسان‌تر است.
 // hidden: در کارت‌های صفحه قیمت نمایش داده نمی‌شود (قابل خرید هم نیست).
 // =================================================================
 {
 id: "mini",
 name: "مینی",
 nameEn: "Mini",
 priceToman: 0,
 priceRial: 0,
 period: "رایگان",
 description: "پلن رایگان همیشگی پس از پایان دورهٔ آزمایش — داده‌های شما محفوظ می‌ماند",
 features: [
 "۵ فاکتور در ماه (۶۰ فاکتور در سال)",
 "۱ کاربر + ۱ انبار",
 "حسابداری پایه و داشبورد",
 "مشاهده و گزارش از داده‌های موجود",
 "دسترسی به مودیان و ماشین‌حساب",
 ],
 cta: "ارتقا از پلن مینی",
 accent: "slate",
 maxUsers: 1,
 maxWarehouses: 1,
 maxInvoices: 60, // ۵ فاکتور در ماه × ۱۲
 trialAvailable: false,
 hidden: true,
 },
 {
 id: "free",
 name: "رایگان",
 nameEn: "Free",
 priceToman: 0,
 priceRial: 0,
 period: "رایگان",
 description: "۷ روز رایگان با تمام امکانات — بدون نیاز به کارت بانکی",
 features: [
 "۷ روز دسترسی کامل به تمام امکانات",
 "۲ کاربر + ۲ انبار",
 "تا ۵۰ فاکتور در ماه",
 "حسابداری پایه و گزارش ساده",
 "داشبورد پایه",
 "پشتیبانی ایمیلی (۴۸ ساعت پاسخ)",
 ],
 cta: "شروع آزمایش ۷ روزه",
 accent: "slate",
 // FIX(v10-plans): سقف کاربر/انبار دوبرابر شد (درخواست صریح مالک پلتفرم)
 maxUsers: 2,
 maxWarehouses: 2,
 maxInvoices: 600,
 trialAvailable: true,
 trialDays: TRIAL_DAYS,
 hidden: true,
 },
 {
 id: "basic",
 name: "پایه",
 nameEn: "Basic",
 priceToman: 9_750_000,
 priceRial: 97_500_000,
 period: "سالانه",
 description: "برای فروشگاه‌های کوچک و کسب‌وکارهای نوپا",
 features: [
 "۲ کاربر + ۴ انبار",
 "تا ۲,۴۰۰ فاکتور در سال",
 "حسابداری، انبار، خرید و فروش",
 "ارز و نرخ لحظه‌ای طلا و دلار",
 "اتصال به سامانه مودیان",
 "چک و خزانه‌داری",
 "داشبورد و گزارش‌های پایه",
 "اپ موبایل + PWA",
 "پشتیبانی ایمیلی",
 ],
 cta: "انتخاب پلن پایه",
 accent: "emerald",
 // FIX(v10-plans): سقف کاربر/انبار دوبرابر شد (درخواست صریح مالک پلتفرم)
 maxUsers: 2,
 maxWarehouses: 4,
 maxInvoices: 2_400,
 trialAvailable: true,
 },
 {
 id: "pro",
 name: "حرفه‌ای",
 nameEn: "Professional",
 priceToman: 14_900_000,
 priceRial: 149_000_000,
 period: "سالانه",
 description: "محبوب‌ترین انتخاب شرکت‌های کوچک و متوسط",
 features: [
 "۴ کاربر + ۶ انبار",
 "تمام ماژول‌های حسابداری",
 "هوش مصنوعی (OCR + چت‌بات + پیش‌بینی)",
 "اتصال به ووکامرس و دیجی‌کالا",
 "حقوق و دستمزد + ارزش افزوده",
 "CRM + باشگاه مشتریان",
 "اپ موبایل + PWA",
 "API کامل + Webhook",
 "پشتیبانی تلفنی اولویت‌دار",
 ],
 popular: true,
 cta: "انتخاب پلن حرفه‌ای",
 accent: "violet",
 // FIX(v10-plans): سقف کاربر/انبار دوبرابر شد (درخواست صریح مالک پلتفرم)
 maxUsers: 4,
 maxWarehouses: 6,
 maxInvoices: 15_000,
 trialAvailable: true,
 },
 {
 id: "enterprise",
 name: "سازمانی",
 nameEn: "Enterprise",
 priceToman: 39_900_000,
 priceRial: 399_000_000,
 period: "سالانه",
 description: "برای شرکت‌های بزرگ، تولیدی و پیمانکاری",
 features: [
 "کاربر و انبار نامحدود",
 "۱۶ ماژول کامل + تولیدی پیشرفته",
 "هوش مصنوعی پیشرفته (تشخیص تقلب + ML)",
 "پیمانکاری + BOM چندسطحی",
 "GraphQL + Multi-company",
 "SSO + Audit Trail پیشرفته",
 "بکاپ ابری رمزنگاری‌شده",
 "مدیر اختصاصی حساب + SLA",
 "پشتیبانی ۲۴/۷ اختصاصی",
 ],
 cta: "تماس با فروش",
 accent: "amber",
 maxUsers: -1, // نامحدود
 maxWarehouses: -1, // نامحدود
 maxInvoices: -1, // نامحدود
 trialAvailable: true,
 },
];

/** پلن‌های قابل نمایش در صفحه قیمت‌گذاری (پلن‌های مخفی حذف شده‌اند) */
export const VISIBLE_PLANS: Plan[] = PLANS.filter((p) =>!p.hidden);

/** نقشه‌ی سریع id پلن */
export const PLAN_BY_ID: Record<PlanId, Plan> = PLANS.reduce(
 (acc, p) => {
 acc[p.id] = p;
 return acc;
 },
 {} as Record<PlanId, Plan>
);

/** قیمت‌ها به تومان — برای محاسبات درآمد داخلی */
export const PLAN_PRICES_TOMAN: Record<string, number> = PLANS.reduce(
 (acc, p) => {
 acc[p.id] = p.priceToman;
 return acc;
 },
 {} as Record<string, number>
);

/** پلن‌های معتبر برای API */
export const VALID_PLANS: string[] = PLANS.map((p) => p.id);

/**
 * FIX(v18-لایسنس): تنظیمات پیش‌فرض ساخت لایسنس بر اساس پلن — منبع واحد.
 * قبلاً ۴ جای مختلف ۴ ماتریس متناقض داشتند (plans.ts / platform/licenses /
 * quick-login / payment-verify). حالا همه از اینجا می‌خوانند.
 * features = توکن‌های ماشینی (نه متن فارسی) — هم‌راستا با lib/plan-features.ts
 */
export interface LicenseDefaults {
 maxUsers: number;
 maxInvoices: number;
 maxWarehouses: number;
 features: string[];
}

export const LICENSE_DEFAULTS: Record<PlanId, LicenseDefaults> = {
 // v35.4 (پیشنهاد ۴): پلن مینی — دسترسی محدود پس از پایان تریال.
 // توکن‌های ماشینی: فقط هستهٔ حسابداری + داشبورد + فاکتور + ماشین‌حساب.
 mini: {
 maxUsers: 1,
 maxInvoices: 60,
 maxWarehouses: 1,
 features: ["core", "dashboard", "invoices", "calculator"],
 },
 free: {
 // FIX(v10-plans): سقف کاربر/انبار دوبرابر — هم‌راستا با PLANS بالا
 maxUsers: 2,
 maxInvoices: 600,
 maxWarehouses: 2,
 features: ["core", "dashboard", "invoices", "calculator"],
 },
 basic: {
 maxUsers: 2,
 maxInvoices: 2_400,
 maxWarehouses: 4,
 features: [
 "core", "dashboard", "invoices", "calculator",
 "inventory", "treasury", "multi-currency", "modian", "crm",
 "reports-basic", "price-alerts",
 ],
 },
 pro: {
 maxUsers: 4,
 maxInvoices: 15_000,
 maxWarehouses: 6,
 features: [
 "core", "dashboard", "invoices", "calculator",
 "inventory", "treasury", "multi-currency", "modian", "crm",
 "reports-builder", "budget", "forecast", "ai",
 "payroll", "tax", "tax-filing", "bank-reconciliation",
 "fixed-assets", "manufacturing", "payment", "api",
 "time-attendance", "loyalty", "market-sync",
 ],
 },
 enterprise: {
 maxUsers: -1,
 maxInvoices: -1,
 maxWarehouses: -1,
 features: ["all"],
 },
};

/** گرفتن تنظیمات پیش‌فرض لایسنس یک پلن (با normalize نام‌های قدیمی) */
export function getLicenseDefaults(plan: string): LicenseDefaults {
 const normalized = normalizePlanName(plan) as PlanId;
 const base = LICENSE_DEFAULTS[normalized]?? LICENSE_DEFAULTS.free;
 // FIX(v12.1): ادغام پوشش‌های سوپرادمین (اگر در کش هستند)
 const ov = getCachedPlanOverrides()[normalized];
 if (ov) {
 return {
 maxUsers: ov.maxUsers?? base.maxUsers,
 maxInvoices: ov.maxInvoices?? base.maxInvoices,
 maxWarehouses: ov.maxWarehouses?? base.maxWarehouses,
 features: ov.features?? base.features,
 };
 }
 return base;
}

/**
 * FIX(SECURITY-C1) — تطبیق مبلغ پرداخت با قیمت واقعی پلن.
 * در تسویه پرداخت، مبلغ رکورد ذخیره‌شده باید دقیقاً با قیمت رسمی پلن
 * (با احتساب دوره: ماهانه = ۱/۱۲ قیمت سالانه) برابر باشد؛ در غیر این‌صورت
 * لایسنس صادر نمی‌شود.
 */
export function getPlanByPriceCheck(
 planId: string,
 amountRial: number,
 period: "monthly" | "yearly" = "yearly"
): { ok: boolean; expectedRial: number } {
 const plan = PLAN_BY_ID[planId as PlanId];
 if (!plan) return { ok: false, expectedRial: 0 };
 // پلن رایگان قابل خرید نیست
 if (plan.priceToman <= 0) return { ok: false, expectedRial: 0 };
 // #22 (v34-5): قیمت ماهانه از MONTHLY_PRICE_DIVISOR مشتق می‌شود (نه ÷۱۲)
 // تا ادعای «۲ ماه رایگانِ» پرداخت سالانه از دل داده درآید.
 const expectedRial =
 period === "monthly"
? monthlyPriceOfYearly(plan.priceToman) * 10
 : plan.priceRial;
 return { ok: amountRial === expectedRial, expectedRial };
}

// =====================================================================
// FIX(v12.1 — قابلیت جدید): پوشش محدودیت پلن‌ها از پنل سوپرادمین
// ---------------------------------------------------------------------
// سوپرادمین می‌تواند maxUsers/maxInvoices/maxWarehouses هر پلن را
// در SystemSettings (کلید: plan_overrides) تغییر دهد. این ماژول کش
// درون‌حافظه‌ای با TTL دارد و getEffectiveLicenseDefaults (در lib/plans.ts
// سروری) آن را با پیش‌فرض‌ها ادغام می‌کند.
// =====================================================================

export interface PlanOverride {
 maxUsers?: number;
 maxInvoices?: number;
 maxWarehouses?: number;
 /** لیست کامل قابلیت‌ها (جایگزین کامل پیش‌فرض) */
 features?: string[];
}
export type PlanOverridesMap = Record<string, PlanOverride>;

// کش اشتراکی — لایهٔ سروری (lib/plans.ts) از طریق __setPlanOverridesCache
// آن را به‌روز می‌کند تا getLicenseDefaults (ایستا) هم پوشش‌ها را ببیند.
let planOverridesCache: PlanOverridesMap = {};
let planOverridesLoadedAt = 0;
export const PLAN_OVERRIDES_TTL_MS = 30_000;

/** خواندن کش فعلی (بدون fetch) — برای مسیرهای sync */
export function getCachedPlanOverrides(): PlanOverridesMap {
 return planOverridesCache;
}

/** [داخلی] به‌روزرسانی مستقیم کش پوشش‌ها — فقط لایهٔ سروری صدا می‌زند */
export function __setPlanOverridesCache(overrides: PlanOverridesMap, loadedAt: number): void {
 planOverridesCache = overrides;
 planOverridesLoadedAt = loadedAt;
}

/** [داخلی] سنِ کش پوشش‌ها — برای تصمیم TTL در لایهٔ سروری */
export function __planOverridesCacheAge(now: number): number {
 return now - planOverridesLoadedAt;
}

/** اعمال فوری پوشش‌های جدید (بعد از ذخیره سوپرادمین) — کش را به‌روز می‌کند */
export function applyPlanOverrides(overrides: PlanOverridesMap): void {
 planOverridesCache = overrides;
 planOverridesLoadedAt = Date.now();
}

// =====================================================================
// FIX(9-a — ویرایش کامل پلن‌ها): لایه پوشش‌های v2 (قیمت/ویژگی/سقف)
// ---------------------------------------------------------------------
// سوپرادمین می‌تواند علاوه بر سقف‌ها، قیمت (تومان)، نام، توضیح، امکانات
// نمایشی، محبوب‌بودن و مخفی‌بودن هر پلن را در SystemSettings (کلید
// plan_overrides_v2) ویرایش کند. getEffectivePlans (lib/plans.ts سروری)
// این پوشش‌ها را روی PLANS استاتیک اعمال می‌کند — منبع واحد
// نمایش قیمت/ویژگی در سراسر سایت (صفحه قیمت، لندینگ، چک‌اوت، درگاه).
//
// نکته مهم: features در v2 «امکانات نمایشی» (متن فارسی صفحه قیمت) است؛
// توکن‌های ماشینی لایسنس همچنان از LICENSE_DEFAULTS می‌آیند (پوشش legacy
// plan_overrides همچنان روی آن‌ها اعمال می‌شود).
// =====================================================================

/** کلید SystemSettings برای پوشش‌های v2 */
export const PLAN_OVERRIDES_V2_KEY = "plan_overrides_v2";

export interface PlanOverrideV2 {
 /** نام نمایشی جدید (فارسی) */
 name?: string;
 /** توضیح جدید */
 description?: string;
 /** قیمت سالانه به تومان (۰ = رایگان) */
 priceToman?: number;
 /** امکانات نمایشی — هر خط یک مورد (جایگزین کامل پیش‌فرض) */
 features?: string[];
 /** نشان «محبوب‌ترین» */
 popular?: boolean;
 /** مخفی‌کردن از صفحه قیمت‌گذاری */
 hidden?: boolean;
 /** سقف کاربر (-1 = نامحدود) */
 maxUsers?: number;
 /** سقف فاکتور سالانه (-1 = نامحدود) */
 maxInvoices?: number;
 /** سقف انبار (-1 = نامحدود) */
 maxWarehouses?: number;
}
export type PlanOverridesV2Map = Record<string, PlanOverrideV2>;

/** حداکثر قیمت قابل تنظیم — ۱۰ میلیارد تومان */
export const MAX_PLAN_PRICE_TOMAN = 10_000_000_000;
/** حداکثر سقف قابل تنظیم برای کاربر/فاکتور/انبار */
const MAX_PLAN_LIMIT = 1_000_000;

/**
 * اعتبارسنجی/سقف‌گذاری یک عدد محدودیت: فقط عدد صحیح، -1 (نامحدود)
 * یا ≥ ۱ (تا ۱,۰۰۰,۰۰۰). مقدار نامعتبر → undefined (نادیده گرفته می‌شود).
 */
function clampPlanLimit(value: unknown): number | undefined {
 if (value === undefined || value === null || value === "") return undefined;
 const num = Number(value);
 if (!Number.isFinite(num) || !Number.isInteger(num)) return undefined;
 if (num === -1) return -1;
 if (num < 1) return undefined; // 0 نامعتبر است — یا -1 یا حداقل ۱
 return Math.min(num, MAX_PLAN_LIMIT);
}

/**
 * پاک‌سازی کامل نقشه پوشش‌های v2 — خروجی همیشه امن است:
 * فقط پلن‌های معتبر + فیلدهای clamp شده. ورودی نامعتبر → {} (بدون کرش).
 */
export function sanitizePlanOverridesV2(raw: unknown): PlanOverridesV2Map {
 const out: PlanOverridesV2Map = {};
 if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
 for (const [planId, value] of Object.entries(raw as Record<string, unknown>)) {
 if (!(planId in PLAN_BY_ID)) continue; // فقط پلن‌های معتبر
 if (!value || typeof value !== "object") continue;
 const v = value as Record<string, unknown>;
 const clean: PlanOverrideV2 = {};
 if (typeof v.name === "string" && v.name.trim()) {
 clean.name = v.name.trim().slice(0, 60);
 }
 if (typeof v.description === "string" && v.description.trim()) {
 clean.description = v.description.trim().slice(0, 300);
 }
 if (v.priceToman !== undefined && v.priceToman !== null && v.priceToman !== "") {
 const num = Number(v.priceToman);
 if (Number.isFinite(num) && num >= 0) {
 clean.priceToman = Math.min(Math.round(num), MAX_PLAN_PRICE_TOMAN);
 }
 }
 if (Array.isArray(v.features)) {
 const feats = v.features
 .filter((f): f is string => typeof f === "string")
 .map((f) => f.trim().slice(0, 200))
 .filter(Boolean)
 .slice(0, 50);
 if (feats.length > 0) clean.features = feats;
 }
 if (typeof v.popular === "boolean") clean.popular = v.popular;
 if (typeof v.hidden === "boolean") clean.hidden = v.hidden;
 const maxUsers = clampPlanLimit(v.maxUsers);
 if (maxUsers !== undefined) clean.maxUsers = maxUsers;
 const maxInvoices = clampPlanLimit(v.maxInvoices);
 if (maxInvoices !== undefined) clean.maxInvoices = maxInvoices;
 const maxWarehouses = clampPlanLimit(v.maxWarehouses);
 if (maxWarehouses !== undefined) clean.maxWarehouses = maxWarehouses;
 if (Object.keys(clean).length > 0) out[planId] = clean;
 }
 return out;
}

/** اعمال یک پوشش v2 روی پلن پایه — priceRial همیشه از priceToman محاسبه می‌شود */
export function applyPlanOverrideV2(base: Plan, ov: PlanOverrideV2): Plan {
 const merged: Plan = { ...base };
 if (ov.name !== undefined) merged.name = ov.name;
 if (ov.description !== undefined) merged.description = ov.description;
 if (ov.priceToman !== undefined) {
 merged.priceToman = ov.priceToman;
 merged.priceRial = ov.priceToman * 10;
 }
 if (ov.features !== undefined) merged.features = ov.features;
 if (ov.popular !== undefined) merged.popular = ov.popular;
 if (ov.hidden !== undefined) merged.hidden = ov.hidden;
 if (ov.maxUsers !== undefined) merged.maxUsers = ov.maxUsers;
 if (ov.maxInvoices !== undefined) merged.maxInvoices = ov.maxInvoices;
 if (ov.maxWarehouses !== undefined) merged.maxWarehouses = ov.maxWarehouses;
 return merged;
}

/**
 * نرمال‌سازی نام پلن — یکپارچه‌سازی نام‌های قدیمی و جدید.
 *
 * نگاشت (از نظر تاریخی UI پلن‌های starter/business/accountant می‌فرستاده ولی
 * مدل اصلی ما free/basic/pro/enterprise است):
 * starter free
 * business pro
 * accountant pro
 * enterprise enterprise
 * free / basic / pro بدون تغییر
 *
 * رشته‌های ناشناخته بدون تغییر بازمی‌گردند تا در صورت داده‌ی کثیف، کرش نکنیم.
 */
export function normalizePlanName(plan: string | undefined | null): string {
 if (!plan) return "free";
 const aliases: Record<string, string> = {
 starter: "free",
 business: "pro",
 accountant: "pro",
 enterprise: "enterprise",
 free: "free",
 basic: "basic",
 pro: "pro",
 mini: "mini", // v35.4 — پلن مینی پس از پایان تریال
 };
 return aliases[plan]?? plan;
}

/** دریافت پلن با id */
export function getPlan(id: string): Plan | undefined {
 return PLAN_BY_ID[id as PlanId];
}

/** دریافت نام فارسی پلن */
export function getPlanName(id: string): string {
 return PLAN_BY_ID[id as PlanId]?.name?? id;
}

/** تبدیل تومان به ریال */
export function tomanToRial(toman: number): number {
 return toman * 10;
}

/** تبدیل ریال به تومان */
export function rialToToman(rial: number): number {
 return Math.round(rial / 10);
}

/** فرمت‌بندی مبلغ تومان با جداکننده هزارگان فارسی */
export function formatToman(amount: number): string {
 if (amount === 0) return "رایگان";
 return amount.toLocaleString("fa-IR") + " تومان";
}

/** فرمت‌بندی مبلغ ریال با جداکننده هزارگان فارسی */
export function formatRial(amount: number): string {
 if (amount === 0) return "رایگان";
 return amount.toLocaleString("fa-IR") + " ریال";
}

/** فرمت‌بندی مبلغ کوتاه (مثلا ۷.۹ م تومان) */
export function formatTomanShort(amount: number): string {
 if (amount === 0) return "رایگان";
 if (amount >= 1_000_000) {
 return (amount / 1_000_000).toLocaleString("fa-IR", { maximumFractionDigits: 1 }) + " م تومان";
 }
 if (amount >= 1_000) {
 return (amount / 1_000).toLocaleString("fa-IR", { maximumFractionDigits: 0 }) + " هزار تومان";
 }
 return amount.toLocaleString("fa-IR") + " تومان";
}

/**
 * ابزار کمکی برای ساخت data-attribute رنگ پلن (Tailwind)
 */
export function planAccentClasses(accent: Plan["accent"]): {
 badge: string;
 border: string;
 button: string;
 glow: string;
} {
 const map = {
 slate: {
 badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
 border: "border-slate-200 dark:border-slate-800",
 button: "bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900",
 glow: "shadow-slate-200/50 dark:shadow-slate-900/50",
 },
 emerald: {
 badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
 border: "border-emerald-200 dark:border-emerald-900",
 button: "bg-emerald-600 hover:bg-emerald-700 text-white",
 glow: "shadow-emerald-200/50 dark:shadow-emerald-900/50",
 },
 violet: {
 badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
 border: "border-violet-300 dark:border-violet-800",
 button: "bg-violet-600 hover:bg-violet-700 text-white",
 glow: "shadow-violet-300/50 dark:shadow-violet-900/50",
 },
 amber: {
 badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
 border: "border-amber-200 dark:border-amber-900",
 button: "bg-amber-500 hover:bg-amber-600 text-white",
 glow: "shadow-amber-200/50 dark:shadow-amber-900/50",
 },
 };
 return map[accent];
}
