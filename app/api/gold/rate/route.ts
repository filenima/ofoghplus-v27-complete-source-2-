import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { resolveGoldRate, getGoldRateHistory, karat18To24 } from "@/lib/gold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
 * /api/gold/rate — نرخ لحظه‌ای طلا (ماژول طلافروشی)
 * ============================================================
 * GET  : آخرین نرخ { karat18Rial, karat24Rial, mesghalRial } + تاریخچهٔ اسپارک‌لاین
 *        منبع: GoldRate → fallback: ExchangeRate تگ‌جو (GOLD_GERAM18/GOLD_MESGHAL)
 *        اگر هیچ نرخی نبود → ok:false (فرانت «قیمت گرم‌شده» + دکمهٔ بروزرسانی)
 *
 * POST : دو حالت —
 *   { sync: true }                      → همگام‌سازی از ExchangeRate تگ‌جو به GoldRate
 *   { karat18Rial?, karat24Rial?, mesghalRial? } → ثبت دستی نرخ (فقط مدیر)
 */

const isDev = process.env.NODE_ENV !== "production";

// GET /api/gold/rate — آخرین نرخ + تاریخچه
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }

    const rate = await resolveGoldRate();
    const history = await getGoldRateHistory(40);

    return NextResponse.json({
      success: true,
      rate,
      history,
      message: rate.ok ? undefined : "نرخ طلا در دسترس نیست — با دکمهٔ بروزرسانی همگام‌سازی کنید",
    });
  } catch (error) {
    console.error("gold-rate GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "خطا در دریافت نرخ طلا",
        ...(isDev && { devMessage: error instanceof Error ? error.message : String(error) }),
      },
      { status: 500 }
    );
  }
}

// POST /api/gold/rate — همگام‌سازی از تگ‌جو یا ثبت دستی
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`gold-rate-post:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." },
        { status: 429 }
      );
    }

    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const sync = body.sync === true;

    /* ---------- حالت ۱: همگام‌سازی از ExchangeRate تگ‌جو ---------- */
    if (sync) {
      const rates = await db.exchangeRate.findMany({
        where: { fromCurrency: { in: ["GOLD_GERAM18", "GOLD_MESGHAL"] }, toCurrency: "IRR" },
        orderBy: { fetchedAt: "desc" },
      });
      const g18 = rates.find((r) => r.fromCurrency === "GOLD_GERAM18");
      const msg = rates.find((r) => r.fromCurrency === "GOLD_MESGHAL");
      if (!g18 || g18.rate <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: "نرخ تگ‌جو هنوز در دسترس نیست — کمی بعد یا نرخ را دستی وارد کنید",
          },
          { status: 404 }
        );
      }

      const karat18 = Math.round(g18.rate);
      const karat24 = karat18To24(karat18);
      const mesghal = msg && msg.rate > 0 ? Math.round(msg.rate) : Math.round(karat18 * 4.608 * (17 / 18));

      // ضداسپام: اگر ردیف تازه با همین مقدار هست، دوباره ثبت نکن
      const last = await db.goldRate.findFirst({ orderBy: { fetchedAt: "desc" } });
      const fresh =
        last &&
        Date.now() - last.fetchedAt.getTime() < 5 * 60_000 &&
        Number(last.karat18Rial) === karat18;
      if (!fresh) {
        await db.goldRate.create({
          data: {
            karat18Rial: BigInt(karat18),
            karat24Rial: BigInt(karat24),
            mesghalRial: BigInt(mesghal),
            source: "sync",
          },
        });
      }

      return NextResponse.json({
        success: true,
        rate: {
          ok: true,
          karat18Rial: karat18,
          karat24Rial: karat24,
          mesghalRial: mesghal,
          source: "sync",
          fetchedAt: new Date().toISOString(),
        },
        message: "نرخ طلا از تگ‌جو همگام‌سازی شد",
      });
    }

    /* ---------- حالت ۲: ثبت دستی نرخ (فقط مدیر) ---------- */
    const manual18 = Number(body.karat18Rial);
    const manual24 = Number(body.karat24Rial);
    const manualMsg = Number(body.mesghalRial);
    const hasManual = [manual18, manual24, manualMsg].some((n) => Number.isFinite(n) && n > 0);
    if (!hasManual) {
      return NextResponse.json(
        { success: false, error: "یا sync:true بفرستید یا حداقل یکی از نرخ‌ها را دستی وارد کنید" },
        { status: 400 }
      );
    }

    // ثبت دستی فقط برای نقش مدیر — الگوی admin-only پروژه
    const role = (ctx.role || "USER").toUpperCase();
    if (ctx.userId && !["ADMIN", "MANAGER", "SUPER_ADMIN", "OWNER"].includes(role)) {
      return NextResponse.json(
        { success: false, error: "ثبت دستی نرخ طلا فقط برای مدیر مجاز است" },
        { status: 403 }
      );
    }

    const karat18 = Number.isFinite(manual18) && manual18 > 0 ? Math.round(manual18) : 0;
    const karat24 =
      Number.isFinite(manual24) && manual24 > 0
        ? Math.round(manual24)
        : karat18 > 0
          ? karat18To24(karat18)
          : 0;
    if (karat18 <= 0 && karat24 <= 0) {
      return NextResponse.json(
        { success: false, error: "حداقل نرخ گرم ۱۸ یا گرم ۲۴ الزامی است" },
        { status: 400 }
      );
    }
    const final18 = karat18 > 0 ? karat18 : Math.round(karat24 * 0.75);
    const mesghal =
      Number.isFinite(manualMsg) && manualMsg > 0
        ? Math.round(manualMsg)
        : Math.round(final18 * 4.608 * (17 / 18));

    const created = await db.goldRate.create({
      data: {
        karat18Rial: BigInt(final18),
        karat24Rial: BigInt(karat24 > 0 ? karat24 : karat18To24(final18)),
        mesghalRial: BigInt(mesghal),
        source: "manual",
      },
    });

    return NextResponse.json({
      success: true,
      rate: {
        ok: true,
        karat18Rial: final18,
        karat24Rial: karat24 > 0 ? karat24 : karat18To24(final18),
        mesghalRial: mesghal,
        source: "manual",
        fetchedAt: created.fetchedAt.toISOString(),
      },
      message: "نرخ طلا دستی ثبت شد",
    });
  } catch (error) {
    console.error("gold-rate POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "خطا در ثبت نرخ طلا",
        ...(isDev && { devMessage: error instanceof Error ? error.message : String(error) }),
      },
      { status: 500 }
    );
  }
}
