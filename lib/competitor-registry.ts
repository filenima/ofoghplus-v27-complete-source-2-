/**
 * lib/competitor-registry.ts — دفتر قیمت روز رقبا: انواع و ثابت‌های خالص
 * ============================================================================
 * FIX(R24-8): این تعاریف قبلاً داخل lib/system-settings.ts بودند که DB
 * import می‌کند؛ کامپوننت‌های کلاینت (market-settings-tab و
 * interactive-price-comparison) فقط برای همین ثابت‌ها آن ماژول را import
 * می‌کردند و db وارد باندل مرورگر می‌شد. این ماژول کاملاً client-safe است —
 * فقط نوع و دادهٔ خالص؛ توابع DB (خواندن/ذخیره) همچنان در system-settings.ts
 * هستند و از اینجا re-export می‌شوند.
 */

/** رقبای پشتیبانی‌شده در دفتر قیمت — هلو/تدبیر/سپیدار (درخواست مالک #۲۳) */
export type CompetitorRegistryId = "holoo" | "tadbir" | "sepidar";

/** برچسب فارسی هر رقیب — برای جدول /compare و ادیتور سوپرادمین */
export const COMPETITOR_REGISTRY_LABELS: Record<CompetitorRegistryId, string> = {
  holoo: "هلو",
  tadbir: "تدبیر",
  sepidar: "سپیدار",
};

/** یک ردیف قیمت رقیب — «استعلام دستی» مبنای ثبت است (عدد لایو نیست) */
export interface CompetitorPriceRow {
  competitor: CompetitorRegistryId;
  /** نام پلن/بستهٔ نزدیک به متن سازنده */
  planName: string;
  /** دورهٔ صورتحساب: سالانه / ماهانه / یک‌باره (لایسنس دائمی) */
  period: "year" | "month" | "once";
  /** قیمت به تومان */
  priceToman: number;
  /** یادداشت استعلام — مثلاً «شامل ارتقای سالانه» */
  note: string;
  /** تاریخ استعلام (ISO) */
  verifiedAt: string;
}

export interface CompetitorPricesSetting {
  /** آخرین به‌روزرسانی دفتر (ISO) — چیپ «آخرین به‌روزرسانی» صفحهٔ مقایسه */
  updatedAt: string;
  sources: CompetitorPriceRow[];
}

/** کانال‌های رسانه (پادکست/ویدیو) — #15 (v34-5) */
export interface MediaChannelsSetting {
  /** شناسهٔ کانال یوتیوب — مثلاً UCxxxxxxxx؛ خالی = جای‌نگهدار «به‌زودی» */
  youtubeChannelId: string;
  /** نام کاربری آپارات — مثلاً hooshhesab؛ خالی = جای‌نگهدار «به‌زودی» */
  aparatUsername: string;
}

/**
 * بذر پیش‌فرض دفتر — مقادیر واقع‌گرایانهٔ بازار ایران ۱۴۰۵ (۲۰۲۶)
 * با برچسب صریح «استعلام دستی». سوپرادمین هر زمان می‌تواند ویرایش کند؛
 * این مقادیر فقط تا اولین ذخیره ملاک‌اند.
 */
export const DEFAULT_COMPETITOR_PRICES: CompetitorPricesSetting = {
  updatedAt: "2026-09-01T10:00:00+03:30",
  sources: [
    {
      competitor: "holoo",
      planName: "هلو — لایسنس پایه (حسابداری + انبار + فروش)",
      period: "once",
      priceToman: 9_500_000,
      note: "استعلام دستی — لایسنس دائمی؛ ارتقای سالانه جداگانه محاسبه می‌شود",
      verifiedAt: "2026-09-01T10:00:00+03:30",
    },
    {
      competitor: "holoo",
      planName: "هلو — لایسنس کامل ماژولار (تولیدی + پیمانکاری + ارزی)",
      period: "once",
      priceToman: 45_000_000,
      note: "استعلام دستی — بسته به ماژول‌های انتخابی ۹ تا ۴۵ میلیون",
      verifiedAt: "2026-09-01T10:00:00+03:30",
    },
    {
      competitor: "tadbir",
      planName: "تدبیر — نسخهٔ استاندارد (دسکتاپ)",
      period: "year",
      priceToman: 15_000_000,
      note: "استعلام دستی — اشتراک سالانه با ماژول‌های پایه",
      verifiedAt: "2026-09-01T10:00:00+03:30",
    },
    {
      competitor: "tadbir",
      planName: "تدبیر — نسخهٔ سازمانی چندماژوله",
      period: "year",
      priceToman: 60_000_000,
      note: "استعلام دستی — بسته به ماژول ۱۵ تا ۶۰ میلیون",
      verifiedAt: "2026-09-01T10:00:00+03:30",
    },
    {
      competitor: "sepidar",
      planName: "سپیدار — ابری پایه (سالانه)",
      period: "year",
      priceToman: 12_000_000,
      note: "استعلام دستی — اشتراک ابری سالانه",
      verifiedAt: "2026-09-01T10:00:00+03:30",
    },
    {
      competitor: "sepidar",
      planName: "سپیدار — ابری پیشرفته (سالانه)",
      period: "year",
      priceToman: 55_000_000,
      note: "استعلام دستی — با ماژول‌های تولیدی/پیمانکاری؛ بسته به ماژول ۱۲ تا ۵۵ میلیون",
      verifiedAt: "2026-09-01T10:00:00+03:30",
    },
  ],
};

/** پاک‌سازی/اعتبارسنجی یک ردیف قیمت رقیب — ورودی نامعتبر حذف می‌شود */
function sanitizeCompetitorPriceRow(raw: unknown): CompetitorPriceRow | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const competitor = v.competitor;
  if (competitor !== "holoo" && competitor !== "tadbir" && competitor !== "sepidar") return null;
  const planName = String(v.planName || "").trim().slice(0, 120);
  if (!planName) return null;
  const period =
    v.period === "month" || v.period === "once" ? v.period : "year";
  const price = Number(v.priceToman);
  if (!Number.isFinite(price) || price < 0 || price > 10_000_000_000) return null;
  const note = String(v.note || "").trim().slice(0, 300);
  const verifiedAt =
    typeof v.verifiedAt === "string" && !Number.isNaN(Date.parse(v.verifiedAt))
      ? v.verifiedAt
      : new Date().toISOString();
  return {
    competitor,
    planName,
    period,
    priceToman: Math.round(price),
    note,
    verifiedAt,
  };
}

/** پاک‌سازی کامل دفتر قیمت رقبا — حداکثر ۲۴ ردیف معتبر */
export function sanitizeCompetitorPrices(raw: unknown): CompetitorPricesSetting {
  const out: CompetitorPricesSetting = { updatedAt: new Date().toISOString(), sources: [] };
  if (!raw || typeof raw !== "object") return out;
  const v = raw as Record<string, unknown>;
  if (Array.isArray(v.sources)) {
    out.sources = v.sources
      .map(sanitizeCompetitorPriceRow)
      .filter((r): r is CompetitorPriceRow => r !== null)
      .slice(0, 24);
  }
  if (typeof v.updatedAt === "string" && !Number.isNaN(Date.parse(v.updatedAt))) {
    out.updatedAt = v.updatedAt;
  }
  return out;
}
