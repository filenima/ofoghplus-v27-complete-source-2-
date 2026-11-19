import { db } from "@/lib/db";

/* ============================================================
 * lib/gold.ts — منطق مشترک ماژول طلا و جواهر (طلافروشی)
 * ============================================================
 * - resolveGoldRate: آخرین نرخ طلا از GoldRate؛ در نبود آن،
 *   محاسبه از ExchangeRate (کرون ارز تگ‌جو GOLD_GERAM18/GOLD_MESGHAL).
 * - محاسبهٔ قیمت هر گرم برای هر عیار: karat24Rial × karat / 24
 * - computeGoldInvoice: فرمول فاکتور طلا طبق رویهٔ رایج طلافروشی ایران:
 *     ارزش طلا = وزن خالص × قیمت گرمِ عیار
 *     اجرت = «ریال در گرم» × وزن  یا  «درصد» × ارزش طلا
 *     سود فروشنده = درصد × ارزش طلا
 *     مالیات ارزش افزوده = ۹٪ × (اجرت + سود)   ← نه روی ارزش خود طلا
 *     قابل پرداخت = ارزش طلا + اجرت + سود + سنگ + مالیات
 *     (در بازخرید: کارمزد از مبلغ پرداختی کسر می‌شود)
 *     (در معاملهٔ طلا به طلا: ارزش طلای دریافتی بستان مشتری است)
 */

export const GOLD_KARATS = [24, 22, 18, 14] as const;
export const GOLD_VAT_RATE = 0.09; // ۹٪ — مالیات بر ارزش افزودهٔ فاکتور طلا (اجرت + سود)

export interface GoldRateInfo {
  ok: boolean;
  karat24Rial: number;
  karat18Rial: number;
  mesghalRial: number;
  source: string;
  fetchedAt: string | null;
}

const ZERO_RATE: GoldRateInfo = {
  ok: false,
  karat24Rial: 0,
  karat18Rial: 0,
  mesghalRial: 0,
  source: "none",
  fetchedAt: null,
};

/**
 * قیمت هر گرم طلا برای عیار دلخواه (ریال).
 * مبنای محاسبه: گرم ۲۴ عیار (طلای خالص) — karatPrice = karat24 × karat / 24
 */
export function karatGramPrice(karat24Rial: number, karat: number): number {
  if (!Number.isFinite(karat24Rial) || karat24Rial <= 0) return 0;
  const k = Math.max(1, Math.min(24, Math.round(karat)));
  return Math.round(karat24Rial * (k / 24));
}

/** تبدیل سریع ۱۸→۲۴ عیار: گرم ۲۴ = گرم ۱۸ ÷ ۰٫۷۵ */
export function karat18To24(karat18Rial: number): number {
  return Math.round(karat18Rial / 0.75);
}

/**
 * آخرین نرخ طلا:
 * ۱) آخرین ردیف GoldRate (دستی/یکپارچه‌سازی)
 * ۲) fallback: ExchangeRate تگ‌جو (GOLD_GERAM18 + GOLD_MESGHAL) که کرون ارز تازه نگه می‌دارد
 */
export async function resolveGoldRate(): Promise<GoldRateInfo> {
  // ۱) GoldRate — منبع اختصاصی ماژول
  try {
    const latest = await db.goldRate.findFirst({ orderBy: { fetchedAt: "desc" } });
    if (latest && Number(latest.karat18Rial) > 0) {
      return {
        ok: true,
        karat24Rial: Number(latest.karat24Rial),
        karat18Rial: Number(latest.karat18Rial),
        mesghalRial: Number(latest.mesghalRial),
        source: latest.source,
        fetchedAt: latest.fetchedAt.toISOString(),
      };
    }
  } catch {
    // ادامه به fallback
  }

  // ۲) fallback — ExchangeRate تگ‌جو
  try {
    const rates = await db.exchangeRate.findMany({
      where: { fromCurrency: { in: ["GOLD_GERAM18", "GOLD_MESGHAL"] }, toCurrency: "IRR" },
      orderBy: { fetchedAt: "desc" },
    });
    const g18 = rates.find((r) => r.fromCurrency === "GOLD_GERAM18");
    const msg = rates.find((r) => r.fromCurrency === "GOLD_MESGHAL");
    if (g18 && g18.rate > 0) {
      return {
        ok: true,
        karat18Rial: Math.round(g18.rate),
        karat24Rial: karat18To24(g18.rate),
        mesghalRial: msg ? Math.round(msg.rate) : Math.round(g18.rate * 4.608 * (17 / 18)),
        source: g18.source || "tgju",
        fetchedAt: g18.fetchedAt.toISOString(),
      };
    }
  } catch {
    // بی‌نرخ
  }

  return { ...ZERO_RATE };
}

/** تاریخچهٔ نرخ برای نمودار — از GoldRate و در نبود آن ExchangeRateHistory */
export async function getGoldRateHistory(limit = 40): Promise<{ t: string; v: number }[]> {
  try {
    const rows = await db.goldRate.findMany({
      orderBy: { fetchedAt: "desc" },
      take: limit,
      select: { karat18Rial: true, fetchedAt: true },
    });
    if (rows.length > 0) {
      return rows
        .map((r) => ({ t: r.fetchedAt.toISOString(), v: Number(r.karat18Rial) }))
        .reverse();
    }
    // fallback: تاریخچهٔ تگ‌جو برای گرم ۱۸
    const hist = await db.exchangeRateHistory.findMany({
      where: { fromCurrency: "GOLD_GERAM18", toCurrency: "IRR" },
      orderBy: { recordedAt: "desc" },
      take: limit,
      select: { rate: true, recordedAt: true },
    });
    return hist.map((r) => ({ t: r.recordedAt.toISOString(), v: Math.round(r.rate) })).reverse();
  } catch {
    return [];
  }
}

/* ---------------- محاسبهٔ فاکتور طلا ---------------- */

export interface GoldInvoiceItemInput {
  goldProductId?: string | null;
  name: string;
  karat: number; // 24 | 22 | 18 | 14
  weight: number; // وزن کل هر عدد (گرم)
  count?: number; // تعداد (پیش‌فرض ۱)
  stoneWeight?: number; // وزن سنگ (گرم) — از وزن طلا کسر می‌شود
  makingChargeType?: "PER_GRAM" | "PERCENT"; // پیش‌فرض PER_GRAM
  makingChargeValue?: number; // اجرت (ریال/گرم یا درصد)
  stonePriceRial?: number; // ارزش سنگ این ردیف
}

export interface InvoiceTotals {
  totalGoldGrams: number; // وزن خالص طلای تحویلی (گرم — بدون سنگ)
  goldValueRial: number;
  makingChargeRial: number;
  sellerProfitRial: number;
  stoneValueRial: number;
  vatRial: number;
  receivedValueRial: number; // ارزش طلای دریافتی (بازخرید/معامله)
  payableRial: number; // نهایی (مثبت = طلب از مشتری، منفی = پرداخت به مشتری)
}

export interface ComputeInvoiceInput {
  type: "SALE" | "BUYBACK" | "EXCHANGE";
  items: GoldInvoiceItemInput[];
  karat24Rial: number;
  profitRatePercent?: number; // سود فروشنده سرگروه (٪) — item می‌تواند override کند؟ ساده: سرگروه
  vatRate?: number; // پیش‌فرض ۰٫۰۹
  receivedGoldGrams?: number; // طلای دریافتی از مشتری (گرم)
  receivedGoldKarat?: number; // عیار طلای دریافتی (پیش‌فرض ۱۸)
}

const rial = (n: number) => BigInt(Math.max(0, Math.round(Number.isFinite(n) ? n : 0)));

/**
 * محاسبهٔ کامل فاکتور طلا — هر سه نوع SALE / BUYBACK / EXCHANGE.
 *
 * SALE:     payable = طلا + اجرت + سود + سنگ + مالیات(۹٪ اجرت+سود)
 * BUYBACK:  payable = طلا + سنگ − کارمزد (اجرت به‌عنوان کارمزد کسر می‌شود؛ بدون مالیات و سود)
 * EXCHANGE: مثل SALE، منهای ارزش طلای دریافتی از مشتری (مابه‌التفاوت)
 */
export function computeGoldInvoice(input: ComputeInvoiceInput): InvoiceTotals & { perItem: (ReturnType<typeof computeItem> & { name: string; karat: number; count: number; weight: number })[] } {
  const vatRate =
    typeof input.vatRate === "number" && input.vatRate >= 0 && input.vatRate <= 0.5
      ? input.vatRate
      : GOLD_VAT_RATE;

  let goldValue = 0;
  let makingCharge = 0;
  let stoneValue = 0;
  let totalGrams = 0;
  const perItem: (ReturnType<typeof computeItem> & { name: string; karat: number; count: number; weight: number })[] = [];

  for (const raw of input.items ?? []) {
    const it = computeItem(raw, input.karat24Rial, input.profitRatePercent ?? 0);
    goldValue += it.goldValue;
    makingCharge += it.makingCharge;
    stoneValue += it.stoneValue;
    totalGrams += it.netWeight;
    perItem.push({
      ...it,
      name: raw.name,
      karat: raw.karat,
      count: raw.count && raw.count > 0 ? raw.count : 1,
      weight: raw.weight,
    });
  }

  // سود فروشنده — فقط روی فروش/معامله (در بازخرید، فروشنده سود نمی‌گیرد)
  const profitRate = Math.max(0, input.profitRatePercent ?? 0);
  const sellerProfit =
    input.type === "BUYBACK" ? 0 : Math.round((goldValue * profitRate) / 100);

  // مالیات ارزش افزوده: ۹٪ فقط روی (اجرت + سود) — طبق رویهٔ فاکتور طلا
  const vat =
    input.type === "BUYBACK" ? 0 : Math.round((makingCharge + sellerProfit) * vatRate);

  // ارزش طلای دریافتی از مشتری (بازخرید یا معاملهٔ طلا به طلا)
  let receivedValue = 0;
  if (input.type !== "SALE") {
    const grams = Math.max(0, input.receivedGoldGrams ?? 0);
    const karat = input.receivedGoldKarat && input.receivedGoldKarat > 0 ? input.receivedGoldKarat : 18;
    if (grams > 0 && input.karat24Rial > 0) {
      receivedValue = Math.round(grams * karatGramPrice(input.karat24Rial, karat));
    }
  }

  let payable: number;
  if (input.type === "BUYBACK") {
    // پرداخت به مشتری = ارزش طلا + سنگ − کارمزد (اجرت)
    payable = goldValue + stoneValue - makingCharge;
  } else {
    // فروش یا معامله: طلا + اجرت + سود + سنگ + مالیات − ارزش طلای دریافتی
    payable = goldValue + makingCharge + sellerProfit + stoneValue + vat - receivedValue;
  }

  return {
    totalGoldGrams: Math.round(totalGrams * 1000) / 1000,
    goldValueRial: goldValue,
    makingChargeRial: makingCharge,
    sellerProfitRial: sellerProfit,
    stoneValueRial: stoneValue,
    vatRial: vat,
    receivedValueRial: receivedValue,
    payableRial: payable,
    perItem,
  };
}

/** محاسبهٔ یک قلم — وزن در تعداد ضرب می‌شود؛ سنگ از وزن طلا کسر می‌شود */
function computeItem(
  raw: GoldInvoiceItemInput,
  karat24Rial: number,
  _fallbackProfit: number
) {
  const count = raw.count && raw.count > 0 ? raw.count : 1;
  const weight = Math.max(0, Number(raw.weight) || 0);
  const stoneW = Math.max(0, Number(raw.stoneWeight) || 0);
  const netWeight = Math.max(0, weight - stoneW) * count; // وزن خالص طلا (گرم)
  const gramPrice = karatGramPrice(karat24Rial, raw.karat);
  const goldValue = Math.round(netWeight * gramPrice);

  const mcType = raw.makingChargeType === "PERCENT" ? "PERCENT" : "PER_GRAM";
  const mcValue = Math.max(0, Number(raw.makingChargeValue) || 0);
  const makingCharge =
    mcType === "PER_GRAM"
      ? Math.round(mcValue * netWeight)
      : Math.round((goldValue * mcValue) / 100);

  const stoneValue = Math.max(0, Math.round(Number(raw.stonePriceRial) || 0));

  return {
    gramPrice,
    netWeight: Math.round(netWeight * 1000) / 1000,
    goldValue,
    makingCharge,
    stoneValue,
    makingChargeType: mcType,
  };
}

/** سریالایز BigInt برای JSON */
export function serializeGoldInvoice(inv: {
  id: string;
  invoiceNumber: string;
  type: string;
  customerName: string | null;
  customerPhone: string | null;
  totalGoldGrams: number;
  receivedGoldGrams: number;
  goldValueRial: bigint;
  receivedValueRial: bigint;
  makingChargeRial: bigint;
  sellerProfitRial: bigint;
  stoneValueRial: bigint;
  vatRial: bigint;
  payableRial: bigint;
  status: string;
  items: string;
  note?: string | null;
  createdAt: Date;
  [key: string]: unknown;
}) {
  let items: unknown[] = [];
  try {
    items = JSON.parse(inv.items || "[]");
  } catch {
    items = [];
  }
  return {
    ...inv,
    goldValueRial: Number(inv.goldValueRial),
    receivedValueRial: Number(inv.receivedValueRial),
    makingChargeRial: Number(inv.makingChargeRial),
    sellerProfitRial: Number(inv.sellerProfitRial),
    stoneValueRial: Number(inv.stoneValueRial),
    vatRial: Number(inv.vatRial),
    payableRial: Number(inv.payableRial),
    items,
  };
}

/** تولید شماره فاکتور یکتا: GLD-1001, GLD-1002, ... */
export async function generateGoldInvoiceNumber(tenantId: string): Promise<string> {
  const count = await db.goldInvoice.count({ where: { tenantId } });
  for (let i = 0; i < 50; i++) {
    const candidate = `GLD-${1001 + count + i}`;
    const exists = await db.goldInvoice.findFirst({
      where: { tenantId, invoiceNumber: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  return `GLD-${Date.now().toString(36).toUpperCase()}`;
}

/** لاگ اتصال (best-effort — خطای لاگ جریان اصلی را نمی‌شکند) */
export async function logGoldIntegration(
  tenantId: string,
  apiKeyId: string | null,
  action: string,
  success: boolean,
  detail?: unknown
): Promise<void> {
  try {
    await db.goldIntegrationLog.create({
      data: {
        tenantId,
        apiKeyId,
        action,
        success,
        detail: detail === undefined ? null : JSON.stringify(detail).slice(0, 2000),
      },
    });
  } catch {
    // ignore
  }
}

/** اعتبارسنجی وزن/عیار اقلام — رد وزن صفر/منفی و عیار نامعتبر */
export function validateGoldItems(items: unknown): { ok: true; items: GoldInvoiceItemInput[] } | { ok: false; error: string } {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "حداقل یک قلم کالا الزامی است" };
  }
  const out: GoldInvoiceItemInput[] = [];
  for (const [i, raw] of items.entries()) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: `قلم ${i + 1} نامعتبر است` };
    }
    const it = raw as Record<string, unknown>;
    const name = typeof it.name === "string" ? it.name.trim() : "";
    if (!name) return { ok: false, error: `نام کالای قلم ${i + 1} الزامی است` };
    const karat = Number(it.karat);
    if (![24, 22, 18, 14].includes(karat)) {
      return { ok: false, error: `عیار قلم «${name}» باید ۲۴، ۲۲، ۱۸ یا ۱۴ باشد` };
    }
    const weight = Number(it.weight);
    if (!Number.isFinite(weight) || weight <= 0) {
      return { ok: false, error: `وزن قلم «${name}» باید بزرگ‌تر از صفر باشد` };
    }
    out.push({
      goldProductId: typeof it.goldProductId === "string" ? it.goldProductId : null,
      name,
      karat,
      weight,
      count: Number(it.count) > 0 ? Number(it.count) : 1,
      stoneWeight: Math.max(0, Number(it.stoneWeight) || 0),
      makingChargeType: it.makingChargeType === "PERCENT" ? "PERCENT" : "PER_GRAM",
      makingChargeValue: Math.max(0, Number(it.makingChargeValue) || 0),
      stonePriceRial: Math.max(0, Number(it.stonePriceRial) || 0),
    });
  }
  return { ok: true, items: out };
}
