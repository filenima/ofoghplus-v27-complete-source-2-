/**
 * ============ GET /api/analytics/ltv — داشبورد LTV برای «تنانتِ خودِ کاربر» ============
 * FIX(3d-5): ماژول پنل کاربری «داشبورد LTV» (components/views/ltv-dashboard.tsx)
 * قبلاً به /api/platform/analytics/ltv وصل بود که فقط سوپرادمین اجازهٔ دیدن دارد
 * (requireSuperAdmin). برای هر کاربر عادی:
 *   ۱) پاسخ ۴۰۱ → authFetch توکن را از localStorage پاک می‌کرد و رویداد
 *      session-expired می‌زد → «خروج اجباری» فقط با باز کردن ماژول!
 *   ۲) اگر رندر ادامه می‌یافت، json بدون data.summary بود → کرش روی
 *      data.summary.avgLTV.
 * این مسیر همان محاسبات را «محدود به tenant کاربر» انجام می‌دهد (کپی مطمئنِ
 * app/api/platform/analytics/ltv با دو اصلاح: getAuthContext به‌جای requireSuperAdmin،
 * و status بزرگ «PAID» به‌جای 'paid' کوچک که هرگز با رشته‌های DB مچ نمی‌شد).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx?.tenantId) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const tenantId = ctx.tenantId;

    const { searchParams } = new URL(req.url);
    const segment = searchParams.get("segment");

    // محاسبهٔ LTV بر اساس دادهٔ واقعیِ tenant — فاکتورهای فروش تسویه‌شده
    // FIX(3d-5): status «PAID» بزرگ (مقادیر DB) + حذف نرم (deletedAt)
    const invoices = await db.invoice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        type: "SALE",
        status: "PAID",
      },
      select: { id: true, partyId: true, total: true, date: true },
      take: 5000,
    });

    const byParty = new Map<
      string,
      { total: number; count: number; first: number; last: number }
    >();
    for (const inv of invoices) {
      const amount = Number(inv.total || 0);
      const date = new Date(inv.date).getTime();
      const existing = byParty.get(inv.partyId) || { total: 0, count: 0, first: Infinity, last: 0 };
      existing.total += amount;
      existing.count++;
      existing.first = Math.min(existing.first, date);
      existing.last = Math.max(existing.last, date);
      byParty.set(inv.partyId, existing);
    }

    const realData = Array.from(byParty.entries()).map(([partyId, d]) => {
      const months = Math.max(1, (d.last - d.first) / (30 * 86400_000));
      return {
        partyId,
        totalRevenue: d.total,
        invoices: d.count,
        firstInvoice: d.first,
        lastInvoice: d.last,
        avgMonthly: Math.round(d.total / months),
      };
    });

    const emptyPayload = (message: string) =>
      NextResponse.json({
        success: true,
        data: {
          summary: {
            totalCustomers: 0,
            totalLTV: 0,
            avgLTV: 0,
            medianLTV: 0,
            predictedLTVNext12: 0,
            avgMonthlyRevenue: 0,
            models: { historical: 0, simple_predictive: 0, cohort_based: 0 },
          },
          segments: { vip: 0, high_value: 0, low_value: 0 },
          distribution: [
            { label: "< ۱۰ میلیون", min: 0, count: 0, total: 0 },
            { label: "۱۰-۵۰ میلیون", min: 10_000_000, count: 0, total: 0 },
            { label: "۵۰-۱۰۰ میلیون", min: 50_000_000, count: 0, total: 0 },
            { label: "۱۰۰-۵۰۰ میلیون", min: 100_000_000, count: 0, total: 0 },
            { label: "۵۰۰ میلیون-۱ میلیارد", min: 500_000_000, count: 0, total: 0 },
            { label: "> ۱ میلیارد", min: 1_000_000_000, count: 0, total: 0 },
          ],
          cohorts: [],
          segment: segment || "all",
          topCustomers: [],
          isEmpty: true,
          message,
        },
      });

    if (realData.length === 0) {
      return emptyPayload(
        "هنوز فاکتور تسویه‌شده‌ای برای محاسبهٔ LTV ثبت نشده است. پس از ثبت و تسویهٔ فاکتورهای فروش، این گزارش به‌صورت خودکار به‌روزرسانی می‌شود."
      );
    }

    // فیلتر بر اساس segment (آستانه‌ها به ریال — توزیع مشابه پلتفرم با یک درجه جابه‌جایی برای مقیاس تنانت)
    let filtered = realData;
    if (segment === "vip") filtered = realData.filter((d) => d.totalRevenue > 10_000_000_000);
    else if (segment === "high_value")
      filtered = realData.filter((d) => d.totalRevenue > 1_000_000_000 && d.totalRevenue <= 10_000_000_000);
    else if (segment === "low_value") filtered = realData.filter((d) => d.totalRevenue <= 1_000_000_000);

    const segments = {
      vip: realData.filter((d) => d.totalRevenue > 10_000_000_000).length,
      high_value: realData.filter((d) => d.totalRevenue > 1_000_000_000 && d.totalRevenue <= 10_000_000_000).length,
      low_value: realData.filter((d) => d.totalRevenue <= 1_000_000_000).length,
    };

    const totalLTV = filtered.reduce((s, d) => s + d.totalRevenue, 0);
    const avgLTV = filtered.length > 0 ? Math.round(totalLTV / filtered.length) : 0;
    const sortedLTVs = filtered.map((d) => d.totalRevenue).sort((a, b) => a - b);
    const medianLTV = sortedLTVs.length > 0 ? sortedLTVs[Math.floor(sortedLTVs.length / 2)] : 0;

    const buckets = [
      { label: "< ۱۰ میلیون", min: 0, count: 0, total: 0 },
      { label: "۱۰-۵۰ میلیون", min: 10_000_000, count: 0, total: 0 },
      { label: "۵۰-۱۰۰ میلیون", min: 50_000_000, count: 0, total: 0 },
      { label: "۱۰۰-۵۰۰ میلیون", min: 100_000_000, count: 0, total: 0 },
      { label: "۵۰۰ میلیون-۱ میلیارد", min: 500_000_000, count: 0, total: 0 },
      { label: "> ۱ میلیارد", min: 1_000_000_000, count: 0, total: 0 },
    ];
    for (const d of filtered) {
      const bucket = buckets.slice().reverse().find((b) => d.totalRevenue >= b.min);
      if (bucket) {
        bucket.count++;
        bucket.total += d.totalRevenue;
      }
    }

    const cohorts = new Map<string, { count: number; totalRevenue: number }>();
    for (const d of filtered) {
      const month = new Date(d.firstInvoice).toISOString().slice(0, 7);
      const existing = cohorts.get(month) || { count: 0, totalRevenue: 0 };
      existing.count++;
      existing.totalRevenue += d.totalRevenue;
      cohorts.set(month, existing);
    }
    const cohortData = Array.from(cohorts.entries())
      .map(([month, d]) => ({
        month,
        count: d.count,
        totalRevenue: d.totalRevenue,
        avgLTV: d.count > 0 ? Math.round(d.totalRevenue / d.count) : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);

    const growthRate = 0.05;
    const avgLifetimeMonths = 18;
    const predictedLTVNext12 =
      avgLTV > 0 ? Math.round(avgLTV * (1 + growthRate) * (avgLifetimeMonths / 12)) : 0;

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalCustomers: filtered.length,
          totalLTV,
          avgLTV,
          medianLTV,
          predictedLTVNext12,
          avgMonthlyRevenue:
            filtered.length > 0
              ? Math.round(filtered.reduce((s, d) => s + d.avgMonthly, 0) / filtered.length)
              : 0,
          models: {
            historical: avgLTV,
            simple_predictive: predictedLTVNext12,
            cohort_based: cohortData.length > 0 ? cohortData[cohortData.length - 1].avgLTV : 0,
          },
        },
        segments,
        distribution: buckets,
        cohorts: cohortData,
        segment: segment || "all",
        topCustomers: filtered
          .slice()
          .sort((a, b) => b.totalRevenue - a.totalRevenue)
          .slice(0, 10)
          .map((c) => ({
            partyId: c.partyId,
            ltv: c.totalRevenue,
            invoices: c.invoices,
            avgMonthly: c.avgMonthly,
            tenureMonths: Math.max(1, Math.round((c.lastInvoice - c.firstInvoice) / (30 * 86400_000))),
          })),
        isEmpty: false,
      },
    });
  } catch (err) {
    console.error("[tenant ltv] error:", err);
    return NextResponse.json(
      { success: false, error: "خطا در محاسبهٔ LTV" },
      { status: 500 }
    );
  }
}
