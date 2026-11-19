import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import {
  requireApiKey,
  hasScope,
  applyRateLimitHeaders,
} from "@/lib/api-key-auth";
import {
  resolveGoldRate,
  computeGoldInvoice,
  generateGoldInvoiceNumber,
  serializeGoldInvoice,
  validateGoldItems,
  logGoldIntegration,
  GOLD_VAT_RATE,
} from "@/lib/gold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
 * /api/gold/integration — اتصال سیستم‌های طلافروشی (API خارجی)
 * ============================================================
 * احراز هویت: هدر  x-api-key: hsk_live_...
 * (کلید از ماژول «API و توسعه» ساخته می‌شود — components/views/api-keys-view)
 *
 * POST (کلید API):
 *   { action: "push-rate", karat18Rial?, karat24Rial?, mesghalRial? }
 *       → ثبت نرخ لحظه‌ای طلای مغازهٔ خودتان (نیازمند اسکوپ write)
 *   { action: "get-rate" }
 *       → آخرین نرخ فعال
 *   { action: "create-invoice", type, items, customerName?, ... }
 *       → صدور فاکتور طلا از سیستم بیرونی (نیازمند write:invoices)
 *   { action: "list-invoices", limit? }
 *       → آخرین فاکتورها (نیازمند read:invoices)
 *
 * GET:
 *   با x-api-key  → آخرین نرخ + فاکتورها (read)
 *   با نشست پنل   → لاگ آخرین اتصال‌ها (برای تب «اتصالات» ماژول طلا)
 */

const isDev = process.env.NODE_ENV !== "production";

// GET — دوبل: کلید API (خواندن نرخ/فاکتور) یا نشست پنل (لاگ اتصال‌ها)
export async function GET(req: NextRequest) {
  try {
    const apiKeyHeader = req.headers.get("x-api-key");

    /* ---------- حالت کلید API: خواندن نرخ + فاکتورها ---------- */
    if (apiKeyHeader) {
      const auth = await requireApiKey(req);
      if ("error" in auth) return auth.error;
      const { ctx } = auth;

      if (!hasScope(ctx, "read:invoices") && !hasScope(ctx, "read:dashboard")) {
        // کلید بدون اسکوپ خواندن → فقط نرخ
        const rate = await resolveGoldRate();
        void logGoldIntegration(ctx.tenantId, ctx.apiKeyId, "GET_RATE", true, { mode: "rate-only" });
        return applyRateLimitHeaders(
          NextResponse.json({ success: true, rate }),
          ctx
        );
      }

      const [rate, invoices] = await Promise.all([
        resolveGoldRate(),
        db.goldInvoice.findMany({
          where: { tenantId: ctx.tenantId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      ]);
      void logGoldIntegration(ctx.tenantId, ctx.apiKeyId, "LIST_INVOICES", true, {
        count: invoices.length,
      });

      return applyRateLimitHeaders(
        NextResponse.json({
          success: true,
          rate,
          invoices: invoices.map(serializeGoldInvoice),
        }),
        ctx
      );
    }

    /* ---------- حالت نشست پنل: لاگ اتصال‌ها ---------- */
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است (نشست پنل یا کلید API)" },
        { status: 401 }
      );
    }

    const logs = await db.goldIntegrationLog.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    // کلیدهای فعال این tenant (فقط پیشوند — کلید کامل هرگز برنمی‌گردد)
    const keys = await db.apiKey.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, scopes: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        success: l.success,
        detail: l.detail,
        apiKeyId: l.apiKeyId,
        createdAt: l.createdAt.toISOString(),
      })),
      apiKeys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.keyPrefix,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        scopes: (() => {
          try {
            return JSON.parse(k.scopes);
          } catch {
            return [];
          }
        })(),
      })),
    });
  } catch (error) {
    console.error("gold-integration GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "خطا در اتصال طلا",
        ...(isDev && { devMessage: error instanceof Error ? error.message : String(error) }),
      },
      { status: 500 }
    );
  }
}

// POST — عملیات سیستم بیرونی با کلید API
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`gold-integration:${ip}`, 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    const auth = await requireApiKey(req);
    if ("error" in auth) return auth.error;
    const { ctx } = auth;
    const tenantId = ctx.tenantId;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "push-rate");

    /* ---------- push-rate: ثبت نرخ از سیستم مغازه ---------- */
    if (action === "push-rate") {
      const canWrite =
        hasScope(ctx, "write:products") || hasScope(ctx, "write:inventory") || hasScope(ctx, "write:invoices");
      if (!canWrite) {
        void logGoldIntegration(tenantId, ctx.apiKeyId, "PUSH_RATE", false, { error: "forbidden" });
        return NextResponse.json(
          { success: false, error: "کلید API دسترسی نوشتن (write) ندارد" },
          { status: 403 }
        );
      }

      const k18 = Number(body.karat18Rial);
      const k24 = Number(body.karat24Rial);
      const msg = Number(body.mesghalRial);
      const hasAny = [k18, k24, msg].some((n) => Number.isFinite(n) && n > 0);
      if (!hasAny) {
        void logGoldIntegration(tenantId, ctx.apiKeyId, "PUSH_RATE", false, { error: "no-rates" });
        return NextResponse.json(
          {
            success: false,
            error: "حداقل یکی از karat18Rial / karat24Rial / mesghalRial الزامی است (ریال)",
          },
          { status: 400 }
        );
      }

      const karat18 = Number.isFinite(k18) && k18 > 0 ? Math.round(k18) : Math.round(k24 * 0.75);
      const karat24 = Number.isFinite(k24) && k24 > 0 ? Math.round(k24) : Math.round(karat18 / 0.75);
      const mesghal =
        Number.isFinite(msg) && msg > 0 ? Math.round(msg) : Math.round(karat18 * 4.608 * (17 / 18));

      await db.goldRate.create({
        data: {
          karat18Rial: BigInt(karat18),
          karat24Rial: BigInt(karat24),
          mesghalRial: BigInt(mesghal),
          source: "integration",
        },
      });
      void logGoldIntegration(tenantId, ctx.apiKeyId, "PUSH_RATE", true, { karat18, karat24, mesghal });

      return applyRateLimitHeaders(
        NextResponse.json({
          success: true,
          message: "نرخ طلا از سیستم شما ثبت شد",
          rate: {
            karat18Rial: karat18,
            karat24Rial: karat24,
            mesghalRial: mesghal,
            source: "integration",
            fetchedAt: new Date().toISOString(),
          },
        }),
        ctx
      );
    }

    /* ---------- get-rate ---------- */
    if (action === "get-rate") {
      const rate = await resolveGoldRate();
      void logGoldIntegration(tenantId, ctx.apiKeyId, "GET_RATE", true, null);
      return applyRateLimitHeaders(
        NextResponse.json({ success: true, rate }),
        ctx
      );
    }

    /* ---------- list-invoices ---------- */
    if (action === "list-invoices") {
      if (!hasScope(ctx, "read:invoices")) {
        void logGoldIntegration(tenantId, ctx.apiKeyId, "LIST_INVOICES", false, { error: "forbidden" });
        return NextResponse.json(
          { success: false, error: "کلید API دسترسی «read:invoices» ندارد" },
          { status: 403 }
        );
      }
      const limit = Math.min(Math.max(1, Number(body.limit) || 50), 200);
      const invoices = await db.goldInvoice.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      void logGoldIntegration(tenantId, ctx.apiKeyId, "LIST_INVOICES", true, { count: invoices.length });
      return applyRateLimitHeaders(
        NextResponse.json({
          success: true,
          invoices: invoices.map(serializeGoldInvoice),
        }),
        ctx
      );
    }

    /* ---------- create-invoice ---------- */
    if (action === "create-invoice") {
      if (!hasScope(ctx, "write:invoices")) {
        void logGoldIntegration(tenantId, ctx.apiKeyId, "CREATE_INVOICE", false, { error: "forbidden" });
        return NextResponse.json(
          { success: false, error: "کلید API دسترسی «write:invoices» ندارد" },
          { status: 403 }
        );
      }

      const type = (
        ["SALE", "BUYBACK", "EXCHANGE"].includes(String(body.type)) ? String(body.type) : "SALE"
      ) as "SALE" | "BUYBACK" | "EXCHANGE";
      const v = validateGoldItems(body.items);
      if (!v.ok) {
        void logGoldIntegration(tenantId, ctx.apiKeyId, "CREATE_INVOICE", false, { error: v.error });
        return NextResponse.json({ success: false, error: v.error }, { status: 400 });
      }

      const rate = await resolveGoldRate();
      if (!rate.ok || rate.karat24Rial <= 0) {
        void logGoldIntegration(tenantId, ctx.apiKeyId, "CREATE_INVOICE", false, { error: "no-rate" });
        return NextResponse.json(
          { success: false, error: "نرخ طلا فعال نیست — ابتدا push-rate کنید" },
          { status: 409 }
        );
      }

      const profitRatePercent = Math.max(0, Math.min(100, Number(body.profitRatePercent) || 7));
      const receivedGoldGrams = Math.max(0, Number(body.receivedGoldGrams) || 0);
      const receivedGoldKarat = [24, 22, 18, 14].includes(Number(body.receivedGoldKarat))
        ? Number(body.receivedGoldKarat)
        : 18;

      const totals = computeGoldInvoice({
        type,
        items: v.items,
        karat24Rial: rate.karat24Rial,
        profitRatePercent,
        vatRate: GOLD_VAT_RATE,
        receivedGoldGrams,
        receivedGoldKarat,
      });

      const invoiceNumber = await generateGoldInvoiceNumber(tenantId);
      const invoice = await db.goldInvoice.create({
        data: {
          tenantId,
          invoiceNumber,
          type,
          customerName: typeof body.customerName === "string" ? body.customerName.trim() || null : null,
          customerPhone: typeof body.customerPhone === "string" ? body.customerPhone.trim() || null : null,
          totalGoldGrams: totals.totalGoldGrams,
          receivedGoldGrams,
          receivedGoldKarat,
          goldValueRial: BigInt(totals.goldValueRial),
          receivedValueRial: BigInt(totals.receivedValueRial),
          makingChargeRial: BigInt(totals.makingChargeRial),
          sellerProfitRial: BigInt(totals.sellerProfitRial),
          stoneValueRial: BigInt(totals.stoneValueRial),
          vatRial: BigInt(totals.vatRial),
          payableRial: BigInt(totals.payableRial),
          status: "PAID",
          items: JSON.stringify(v.items),
          note: "ایجادشده از اتصال API طلافروشی",
        },
      });
      void logGoldIntegration(tenantId, ctx.apiKeyId, "CREATE_INVOICE", true, {
        invoiceNumber,
        payableRial: totals.payableRial,
      });

      return applyRateLimitHeaders(
        NextResponse.json({
          success: true,
          data: serializeGoldInvoice(invoice),
        }),
        ctx
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "action نامعتبر — یکی از push-rate | get-rate | list-invoices | create-invoice",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("gold-integration POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "خطا در اتصال طلا",
        ...(isDev && { devMessage: error instanceof Error ? error.message : String(error) }),
      },
      { status: 500 }
    );
  }
}
