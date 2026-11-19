import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { cacheGetOrSet } from "@/lib/cache";
import { toEnglishDigits, jalaliToGregorian } from "@/lib/persian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════════
// افق پلاس — تحلیل «سود و زیان هر کالا» (v2)
// GET /api/analytics/product-profit?from=&to=&sort=profit|revenue|margin&limit=20
//
// پارامترها:
//  - from / to: تاریخ میلادی (YYYY-MM-DD یا ISO) یا شمسی (۱۴۰۴/۱۱/۳۰ و
//    1404-11-30 هم پذیرفته می‌شود). پیش‌فرض: ۹۰ روز اخیر تا پایان امروز.
//  - sort: profit (پیش‌فرض) | revenue | margin — نزولی؛ سود/حاشیهٔ نامعلوم آخر.
//  - limit: تعداد ردیف خروجی (پیش‌فرض ۲۰، حداقل ۱، حداکثر ۱۰۰).
//    جمع‌ها روی «همهٔ» کالاهای فعالِ دوره محاسبه می‌شوند، نه فقط top-limit.
//
// منطق محاسبه (تمام مبالغ صحیح به «ریال» — همان واحد DB؛ گرد کردن فقط
// یک‌بار در انتهای هر سطر، بدون انباشت اعشار):
//  - revenue  = Σ [quantity × unitPrice × (۱ − discount٪)] از فاکتورهای SALE
//               منهای برگشتی از فروش (type=RETURN) — تخفیف اقلام «درصد» است
//               (هم‌راستا با lib/demo-seed و مسیر ثبت فاکتور).
//  - cogs     = netQty × بهای واحد؛ بهای واحد به ترتیب:
//               ۱) Product.purchasePrice (معادل costPrice — عدد صحیح ریال)
//               ۲) میانگین موزون خالصِ قیمت اقلام فاکتورهای PURCHASE تا پایان دوره
//               ۳) هیچ → cogs/profit/margin = null («—» — حاشیه نامشخص).
//  - profit   = revenue − cogs؛  margin = profit ÷ revenue × ۱۰۰.
//  - فاکتورهای DRAFT و CANCELLED و سافت‌دیلیت‌شده حذف می‌شوند.
//  - PRE_INVOICE فقط پیش‌فاکتور است و در سود لحاظ نمی‌شود.
//
// کش ۶۰ ثانیه‌ای per-tenant/params — کلید با پیشوند dashboard:product-profit
// شروع می‌شود تا invalidateDashboardCache (بعد از ثبت فاکتور) آن را هم باطل کند.
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_TTL_MS = 60_000;
const ITEM_FETCH_CAP = 50_000; // سقف ایمن حافظه (هم‌اندازهٔ مسیر داشبورد v1)

type SortKey = "profit" | "revenue" | "margin";
const VALID_SORTS: SortKey[] = ["profit", "revenue", "margin"];

type CostSource = "product_price" | "purchase_invoice" | "none";

interface ProductProfitRow {
 productId: string;
 name: string;
 code: string; // sku
 unit: string;
 qtySold: number;
 qtyReturned: number;
 netQty: number;
 revenue: number; // ریال صحیح
 cogs: number | null; // ریال صحیح — null یعنی بهای تمام‌شده نامشخص
 profit: number | null; // ریال صحیح — null وقتی cogs نامشخص
 margin: number | null; // درصد با یک رقم اعشار — null وقتی نامشخص
 costSource: CostSource;
}

interface ProductProfitPayload {
 success: true;
 from: string;
 to: string;
 sort: SortKey;
 limit: number;
 totals: {
  revenue: number;
  cogs: number;
  profit: number;
  margin: number; // درصد
  productsTracked: number;
  profitableCount: number;
  lossCount: number;
  unknownCostCount: number; // کالاهایی که بهای تمام‌شدهٔ آن‌ها نامشخص است
 };
 rows: ProductProfitRow[];
 topWinners: { productId: string; name: string; profit: number; margin: number | null }[];
 topLosers: { productId: string; name: string; profit: number; margin: number | null }[];
}

/** تجمیع داخلی هر کالا قبل از گرد کردن نهایی */
interface AggRow {
 productId: string;
 name: string;
 code: string;
 unit: string;
 qtySold: number;
 qtyReturned: number;
 revenue: number; // ریال صحیح — هر سطر یک‌بار گرد شده، جمع صحیح
 unitCost: number | null; // ریال
 costSource: CostSource;
}

/**
 * پارامتر تاریخ منعطف: میلادی «YYYY-MM-DD»/ISO یا شمسی «۱۴۰۴/۱۱/۳۰».
 * ارقام فارسی/عربی هم نرمال می‌شوند. خروجی: Date محلیِ ابتدای آن روز.
 * سال ≥ ۱۷۰۰ میلادی تلقی می‌شود، کمتر از آن شمسی (۱۳۰۰..۱۶۹۹).
 */
function parseFlexDate(raw: string | null): Date | null {
 if (!raw) return null;
 const s = toEnglishDigits(raw.trim()).replace(/[.\-]/g, "/");
 const m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
 if (m) {
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let [gy, gm, gd] = [y, mo, d] as const;
  if (y < 1700) {
   [gy, gm, gd] = jalaliToGregorian(y, mo, d);
  }
  const date = new Date(gy, gm - 1, gd);
  return Number.isNaN(date.getTime()) ? null : date;
 }
 const t = new Date(s).getTime();
 return Number.isNaN(t) ? null : new Date(t);
}

function startOfDay(d: Date): Date {
 return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
 return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** درصد با حداکثر یک رقم اعشار (گرد کردن تک‌مرحله‌ای) */
function pct1(n: number): number {
 return Math.round(n * 10) / 10;
}

async function computeProductProfit(
 tenantId: string,
 from: Date,
 to: Date,
 sort: SortKey,
 limit: number
): Promise<ProductProfitPayload> {
 const validStatus = { notIn: ["DRAFT", "CANCELLED"] as string[] };
 const dateRange = { gte: from, lte: to };

 // ─── ۱) اقلام فروش و برگشتیِ دوره ───
 const saleItems = await db.invoiceItem.findMany({
  where: {
   productId: { not: null },
   invoice: {
    tenantId,
    deletedAt: null,
    date: dateRange,
    OR: [
     { type: "SALE", status: validStatus },
     { type: "RETURN", status: validStatus },
    ],
   },
  },
  select: {
   productId: true,
   quantity: true,
   unitPrice: true,
   discount: true,
   invoice: { select: { type: true } },
   product: {
    select: { name: true, sku: true, unit: true, purchasePrice: true },
   },
  },
  take: ITEM_FETCH_CAP,
 });

 // ─── تجمیع به تفکیک کالا (مبالغ صحیح ریال) ───
 const agg = new Map<string, AggRow>();
 for (const it of saleItems) {
  const pid = it.productId as string;
  const p = it.product;
  if (!p) continue;
  const isReturn = it.invoice.type === "RETURN";
  const qty = Number(it.quantity || 0);
  const discountPct = Number(it.discount || 0);
  // درآمد خالص سطر (بدون مالیات — مالیات بر سود اثر ندارد) — یک‌بار گرد
  const lineRevenue = Math.round(
   qty * Number(it.unitPrice || 0) * (1 - discountPct / 100)
  );

  let row = agg.get(pid);
  if (!row) {
   // بهای واحد: ۱) قیمت خرید ثبت‌شدهٔ کالا؛ ۲) بعداً از فاکتورهای خرید
   const productPrice = Number(p.purchasePrice || 0);
   row = {
    productId: pid,
    name: p.name,
    code: p.sku || "",
    unit: p.unit || "",
    qtySold: 0,
    qtyReturned: 0,
    revenue: 0,
    unitCost: productPrice > 0 ? productPrice : null,
    costSource: productPrice > 0 ? "product_price" : "none",
   };
   agg.set(pid, row);
  }
  if (isReturn) row.qtyReturned += qty;
  else row.qtySold += qty;
  row.revenue += isReturn ? -lineRevenue : lineRevenue;
 }

 // ─── ۲) بهای تمام‌شده از فاکتورهای خرید (میانگین موزون) برای کالاهای بی‌قیمت ───
 const needPurchaseCost: string[] = [];
 for (const r of agg.values()) {
  if (r.costSource === "none") needPurchaseCost.push(r.productId);
 }
 if (needPurchaseCost.length > 0) {
  // خرید تا «پایان دوره» — موجودیِ فروخته‌شده ممکن است قبل از دوره خریده شده باشد
  const purchaseItems = await db.invoiceItem.findMany({
   where: {
    productId: { in: needPurchaseCost },
    invoice: {
     tenantId,
     deletedAt: null,
     type: "PURCHASE",
     status: validStatus,
     date: { lte: to },
    },
   },
   select: { productId: true, quantity: true, unitPrice: true, discount: true },
   take: ITEM_FETCH_CAP,
  });

  const purchaseAgg = new Map<string, { qty: number; amount: number }>();
  for (const it of purchaseItems) {
   const pid = it.productId as string;
   const qty = Number(it.quantity || 0);
   if (qty <= 0) continue;
   const discountPct = Number(it.discount || 0);
   // مبلغ خالص سطر خرید — صحیح ریال، یک‌بار گرد
   const lineAmount = Math.round(
    qty * Number(it.unitPrice || 0) * (1 - discountPct / 100)
   );
   const cur = purchaseAgg.get(pid) ?? { qty: 0, amount: 0 };
   cur.qty += qty;
   cur.amount += lineAmount;
   purchaseAgg.set(pid, cur);
  }
  for (const pid of needPurchaseCost) {
   const pa = purchaseAgg.get(pid);
   if (pa && pa.qty > 0 && pa.amount > 0) {
    const row = agg.get(pid);
    if (row) {
     row.unitCost = Math.round(pa.amount / pa.qty); // میانگین موزون
     row.costSource = "purchase_invoice";
    }
   }
  }
 }

 // ─── ۳) سطرهای نهایی: سود / حاشیه + گرد کردن تک‌مرحله‌ای ───
 const rows: ProductProfitRow[] = [];
 for (const r of agg.values()) {
  // فقط کالاهایی که در دوره فعالیت داشتند
  if (r.qtySold === 0 && r.qtyReturned === 0 && r.revenue === 0) continue;
  const netQty = r.qtySold - r.qtyReturned;
  const cogs = r.unitCost != null ? Math.round(netQty * r.unitCost) : null;
  const profit = cogs != null ? r.revenue - cogs : null;
  const margin =
   profit != null && r.revenue > 0 ? pct1((profit / r.revenue) * 100) : null;
  rows.push({
   productId: r.productId,
   name: r.name,
   code: r.code,
   unit: r.unit,
   qtySold: Math.round(r.qtySold * 100) / 100,
   qtyReturned: Math.round(r.qtyReturned * 100) / 100,
   netQty: Math.round(netQty * 100) / 100,
   revenue: Math.round(r.revenue),
   cogs: cogs != null ? Math.round(cogs) : null,
   profit: profit != null ? Math.round(profit) : null,
   margin,
   costSource: r.costSource,
  });
 }

 // ─── جمع‌های کل دوره (روی همهٔ کالاها، قبل از slice) ───
 const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
 const totalCogs = rows.reduce((s, r) => s + (r.cogs ?? 0), 0);
 const totalProfit = totalRevenue - totalCogs;
 const profitableCount = rows.filter((r) => r.profit != null && r.profit > 0).length;
 const lossCount = rows.filter((r) => r.profit != null && r.profit < 0).length;
 const unknownCostCount = rows.filter((r) => r.profit == null).length;

 // ─── مرتب‌سازی نزولی؛ سود/حاشیهٔ نامعلوم همیشه آخر ───
 const sorted = [...rows].sort((a, b) => {
  if (sort === "revenue") return b.revenue - a.revenue;
  const av = sort === "margin" ? a.margin : a.profit;
  const bv = sort === "margin" ? b.margin : b.profit;
  if (av == null && bv == null) return b.revenue - a.revenue;
  if (av == null) return 1;
  if (bv == null) return -1;
  return (bv as number) - (av as number);
 });

 const trimmed = sorted.slice(0, limit);
 const compact = (r: ProductProfitRow) => ({
  productId: r.productId,
  name: r.name,
  profit: r.profit as number,
  margin: r.margin,
 });
 const winners = rows
  .filter((r) => r.profit != null && r.profit > 0)
  .sort((a, b) => (b.profit as number) - (a.profit as number))
  .slice(0, 3)
  .map(compact);
 const losers = rows
  .filter((r) => r.profit != null && r.profit < 0)
  .sort((a, b) => (a.profit as number) - (b.profit as number))
  .slice(0, 3)
  .map(compact);

 return {
  success: true,
  from: from.toISOString(),
  to: to.toISOString(),
  sort,
  limit,
  totals: {
   revenue: Math.round(totalRevenue),
   cogs: Math.round(totalCogs),
   profit: Math.round(totalProfit),
   margin: totalRevenue > 0 ? pct1((totalProfit / totalRevenue) * 100) : 0,
   productsTracked: rows.length,
   profitableCount,
   lossCount,
   unknownCostCount,
  },
  rows: trimmed,
  topWinners: winners,
  topLosers: losers,
 };
}

export async function GET(req: NextRequest) {
 try {
  // احراز هویت — همان الگوی سایر مسیرهای /api/analytics
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const tenantId = user.tenantId;

  const url = new URL(req.url);

  // ─── بازهٔ تاریخ (پیش‌فرض: ۹۰ روز اخیر تا پایان امروز) ───
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const parsedFrom = parseFlexDate(fromRaw);
  const parsedTo = parseFlexDate(toRaw);
  if ((fromRaw && !parsedFrom) || (toRaw && !parsedTo)) {
   return NextResponse.json(
    {
     success: false,
     error:
      "قالب تاریخ نامعتبر است — از YYYY-MM-DD میلادی یا YYYY/MM/DD شمسی استفاده کنید",
    },
    { status: 400 }
   );
  }
  const now = new Date();
  const to = endOfDay(parsedTo ?? now);
  const defaultFrom = startOfDay(
   new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000)
  );
  const from = startOfDay(parsedFrom ?? defaultFrom);
  if (from.getTime() > to.getTime()) {
   return NextResponse.json(
    { success: false, error: "بازهٔ تاریخ نامعتبر است — «از» بعد از «تا» است" },
    { status: 400 }
   );
  }

  // ─── مرتب‌سازی و سقف ردیف ───
  const rawSort = url.searchParams.get("sort") || "profit";
  const sort: SortKey = (VALID_SORTS as string[]).includes(rawSort)
   ? (rawSort as SortKey)
   : "profit";
  const rawLimit = Number.parseInt(url.searchParams.get("limit") || "", 10);
  const limit = Math.min(
   100,
   Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 20)
  );

  // ─── کش ۶۰ ثانیه‌ای؛ پیشوند کلید با v1 مشترک است تا
  //     invalidateDashboardCache بعد از موتاسیون فاکتور آن را باطل کند ───
  const payload = await cacheGetOrSet(
   `dashboard:product-profit:${tenantId}:v2:${from.getTime()}:${to.getTime()}:${sort}:${limit}`,
   () => computeProductProfit(tenantId, from, to, sort, limit),
   CACHE_TTL_MS
  );

  return NextResponse.json(payload);
 } catch (error) {
  console.error(
   "[analytics/product-profit] Error:",
   error instanceof Error ? error.message : error
  );
  return NextResponse.json(
   { success: false, error: "خطا در محاسبه تحلیل سود و زیان کالاها" },
   { status: 500 }
  );
 }
}
