import { NextRequest, NextResponse } from "next/server";
import { getReadDb } from "@/lib/db-replica";
import { getAuthContext } from "@/lib/auth";
import { cacheGetOrSet } from "@/lib/cache";
import {
 getCurrentJalaliYear,
 getCurrentJalaliMonth,
 jalaliToGregorian,
} from "@/lib/persian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════════
// افق پلاس — تحلیل «سود و ضرر هر کالا» برای داشبورد (Task 4)
// GET /api/dashboard/product-profit?period=month|quarter|year|all
//
// برای هر کالا:
//   revenue  = Σ (تعداد × قیمت واحد × (۱ − تخفیف٪)) از فاکتورهای فروش
//              منهای برگشتی از فروش (type=RETURN)
//   unitCost = میانگین موزون قیمت خرید از فاکتورهای خرید (کل تاریخ — چون
//              موجودیِ فروخته‌شده ممکن است قبل از دوره خریده شده باشد)؛
//              اگر خریدی ثبت نشده → purchasePrice کالا؛ اگر آن هم صفر → ۰
//   cost     = تعداد خالص فروخته‌شده × unitCost   (بهای تمام‌شدهٔ تقریبی)
//   profit   = revenue − cost
//   margin   = profit / revenue × ۱۰۰
//
// خروجی: summary (جمع فروش/بهای/سود + حاشیه میانگین) + پرسودترین ۱۰ کالا
// + زیان‌ده‌ترین ۱۰ کالا. دادهٔ خالی → صفر (هرگز خطا نمی‌دهد).
// کش حافظه‌ای ۶۰ ثانیه‌ای per-tenant/period (lib/cache — همان Map سراسری).
// ═══════════════════════════════════════════════════════════════════════════

type Period = "month" | "quarter" | "year" | "all";

const VALID_PERIODS: Period[] = ["month", "quarter", "year", "all"];
const CACHE_TTL_MS = 60_000; // ۶۰ ثانیه — داشبورد poll می‌شود
const ITEM_FETCH_CAP = 50_000; // سقف ایمن حافظه

interface ProductProfitRow {
 productId: string;
 name: string;
 sku: string;
 unit: string;
 unitsSold: number;
 unitsReturned: number;
 netUnits: number;
 revenue: number; // ریال — خالص پس از برگشتی
 cost: number; // ریال — بهای تمام‌شدهٔ تقریبی
 profit: number; // ریال — revenue − cost
 margin: number; // درصد
 costSource: "purchase_invoice" | "product_price" | "none";
}

/** ردیف داخلی با بهای تمام‌شدهٔ واحد (قبل از گرد کردن برای خروجی) */
interface AggRow extends ProductProfitRow {
 unitCost: number;
}

interface ProductProfitPayload {
 success: true;
 period: Period;
 from: string | null;
 summary: {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  avgMargin: number; // درصد
  productsTracked: number;
  profitableCount: number;
  lossCount: number;
  estimate: boolean;
 };
 topProfitable: ProductProfitRow[];
 topLosses: ProductProfitRow[];
}

/** شروع دورهٔ شمسی: ماه / فصل / سال جاری — «all» یعنی بدون فیلتر تاریخ */
function getPeriodStart(period: Period): Date | null {
 if (period === "all") return null;
 const now = new Date();
 const jy = getCurrentJalaliYear(now);
 const jm = getCurrentJalaliMonth(now);
 let startMonth = 1;
 if (period === "month") startMonth = jm;
 else if (period === "quarter") startMonth = Math.floor((jm - 1) / 3) * 3 + 1;
 const [gy, gm, gd] = jalaliToGregorian(jy, startMonth, 1);
 return new Date(gy, gm - 1, gd);
}

async function computeProductProfit(
 tenantId: string,
 period: Period
): Promise<ProductProfitPayload> {
 const db = getReadDb();
 const from = getPeriodStart(period);
 const dateFilter = from ? { gte: from } : {};

 // فروش معتبر = هر چیزی جز پیش‌نویس/ابطال (هم‌راستا با /api/dashboard)
 const validStatus = { notIn: ["DRAFT", "CANCELLED"] as string[] };

 const [saleItems, purchaseItems] = await Promise.all([
  // ۱) اقلام فروش + برگشتیِ دوره
  db.invoiceItem.findMany({
   where: {
    productId: { not: null },
    invoice: {
     tenantId,
     deletedAt: null,
     date: dateFilter,
     OR: [
      { type: "SALE", status: validStatus },
      { type: "RETURN", status: validStatus },
     ],
    },
   },
   select: {
    quantity: true,
    unitPrice: true,
    discount: true,
    productId: true,
    invoice: { select: { type: true } },
    product: {
     select: { name: true, sku: true, unit: true, purchasePrice: true },
    },
   },
   take: ITEM_FETCH_CAP,
  }),
  // ۲) اقلام خرید (کل تاریخ — برای میانگین موزون بهای تمام‌شده)
  db.invoiceItem.findMany({
   where: {
    productId: { not: null },
    invoice: {
     tenantId,
     deletedAt: null,
     type: "PURCHASE",
     status: validStatus,
    },
   },
   select: {
    quantity: true,
    unitPrice: true,
    discount: true,
    productId: true,
   },
   take: ITEM_FETCH_CAP,
  }),
 ]);

 // ─── میانگین موزون قیمت خرید هر کالا ───
 const purchaseAgg = new Map<string, { qty: number; amount: number }>();
 for (const it of purchaseItems) {
  const pid = it.productId as string;
  const qty = Number(it.quantity || 0);
  if (qty <= 0) continue;
  const unitCost =
   Number(it.unitPrice || 0) * (1 - (Number(it.discount) || 0) / 100);
  const cur = purchaseAgg.get(pid) ?? { qty: 0, amount: 0 };
  cur.qty += qty;
  cur.amount += qty * unitCost;
  purchaseAgg.set(pid, cur);
 }

 // ─── تجمیع فروش/برگشتی به تفکیک کالا ───
 const agg = new Map<string, AggRow>();
 for (const it of saleItems) {
  const pid = it.productId as string;
  const p = it.product;
  if (!p) continue;
  const isReturn = it.invoice.type === "RETURN";
  const qty = Number(it.quantity || 0);
  const lineRevenue =
   qty * Number(it.unitPrice || 0) * (1 - (Number(it.discount) || 0) / 100);

  let row = agg.get(pid);
  if (!row) {
   // بهای تمام‌شدهٔ واحد: میانگین خرید → قیمت خرید کالا → صفر
   const pa = purchaseAgg.get(pid);
   let unitCost = 0;
   let costSource: ProductProfitRow["costSource"] = "none";
   if (pa && pa.qty > 0 && pa.amount > 0) {
    unitCost = pa.amount / pa.qty;
    costSource = "purchase_invoice";
   } else if (Number(p.purchasePrice) > 0) {
    unitCost = Number(p.purchasePrice);
    costSource = "product_price";
   }
   row = {
    productId: pid,
    name: p.name,
    sku: p.sku || "",
    unit: p.unit || "",
    unitsSold: 0,
    unitsReturned: 0,
    netUnits: 0,
    revenue: 0,
    cost: 0,
    profit: 0,
    margin: 0,
    costSource,
    unitCost,
   };
   agg.set(pid, row);
  }
  if (isReturn) row.unitsReturned += qty;
  else row.unitsSold += qty;
  row.revenue += isReturn ? -lineRevenue : lineRevenue;
 }

 // ─── سود/حاشیه + گرد کردن ───
 const rows: ProductProfitRow[] = [];
 for (const r of agg.values()) {
  // فقط کالاهایی که در دوره فعالیت داشتند (فروش یا برگشت)
  if (r.unitsSold === 0 && r.unitsReturned === 0 && r.revenue === 0) continue;
  const netUnits = r.unitsSold - r.unitsReturned;
  const cost = netUnits * r.unitCost;
  const profit = r.revenue - cost;
  const margin = r.revenue > 0 ? (profit / r.revenue) * 100 : 0;
  rows.push({
   productId: r.productId,
   name: r.name,
   sku: r.sku,
   unit: r.unit,
   unitsSold: Math.round(r.unitsSold * 100) / 100,
   unitsReturned: Math.round(r.unitsReturned * 100) / 100,
   netUnits: Math.round(netUnits * 100) / 100,
   revenue: Math.round(r.revenue),
   cost: Math.round(cost),
   profit: Math.round(profit),
   margin: Math.round(margin * 10) / 10,
   costSource: r.costSource,
  });
 }

 const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
 const totalCost = rows.reduce((s, r) => s + r.cost, 0);
 const totalProfit = totalRevenue - totalCost;
 const profitable = rows.filter((r) => r.profit > 0);
 const losses = rows.filter((r) => r.profit < 0);

 return {
  success: true,
  period,
  from: from ? from.toISOString() : null,
  summary: {
   totalRevenue: Math.round(totalRevenue),
   totalCost: Math.round(totalCost),
   totalProfit: Math.round(totalProfit),
   avgMargin:
    totalRevenue > 0
     ? Math.round((totalProfit / totalRevenue) * 1000) / 10
     : 0,
   productsTracked: rows.length,
   profitableCount: profitable.length,
   lossCount: losses.length,
   estimate: true, // بهای تمام‌شده تقریبی است (تاریخ لحظهٔ فروش ذخیره نمی‌شود)
  },
  topProfitable: profitable.sort((a, b) => b.profit - a.profit).slice(0, 10),
  topLosses: losses.sort((a, b) => a.profit - b.profit).slice(0, 10),
 };
}

export async function GET(req: NextRequest) {
 try {
  const auth = await getAuthContext(req);
  if (!auth) {
   return NextResponse.json(
    { success: false, error: "احراز هویت الزامی است" },
    { status: 401 }
   );
  }
  const tenantId = auth.tenantId;

  const url = new URL(req.url);
  const raw = url.searchParams.get("period") || "month";
  const period = (VALID_PERIODS as string[]).includes(raw)
   ? (raw as Period)
   : "month";

  // کش ۶۰ثانیه‌ای per-tenant/period — با موتاسیون فاکتور باطل می‌شود
  // (invalidateDashboardCache در lib/cache پیشوند این کلیدها را پاک می‌کند)
  const payload = await cacheGetOrSet(
   `dashboard:product-profit:${tenantId}:${period}`,
   () => computeProductProfit(tenantId, period),
   CACHE_TTL_MS
  );

  return NextResponse.json(payload);
 } catch (error) {
  console.error(
   "[dashboard/product-profit] Error:",
   error instanceof Error ? error.message : error
  );
  return NextResponse.json(
   { success: false, error: "خطا در محاسبه سود و ضرر کالاها" },
   { status: 500 }
  );
 }
}
