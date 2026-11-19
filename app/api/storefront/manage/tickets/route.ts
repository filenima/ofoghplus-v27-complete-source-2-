import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getStorefrontByTenant } from "@/lib/storefront-auth";
import { sendFormSubmitEmail } from "@/lib/formsubmit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/storefront/manage/tickets — تیکت‌های پشتیبانی مشتریان فروشگاه (R16)
 * فقط وقتی معنا دارد که مالک «تیکت پشتیبانی» را فعال کرده باشد.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد" }, { status: 404 });
    }

    const tickets = await db.storefrontTicket.findMany({
      where: { storefrontId: storefront.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        customerEmail: true,
        customerName: true,
        subject: true,
        message: true,
        reply: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const stats = {
      open: tickets.filter((t) => t.status === "OPEN").length,
      answered: tickets.filter((t) => t.status === "ANSWERED").length,
      closed: tickets.filter((t) => t.status === "CLOSED").length,
      total: tickets.length,
    };

    return NextResponse.json({
      success: true,
      tickets: tickets.map((t) => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })),
      stats,
      enabled: storefront.ticketEnabled,
    });
  } catch (error) {
    console.error("[storefront tickets GET] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در دریافت تیکت‌ها" }, { status: 500 });
  }
}

/** PUT — پاسخ مالک به تیکت یا تغییر وضعیت */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const storefront = await getStorefrontByTenant(tenantId);
    if (!storefront) {
      return NextResponse.json({ success: false, error: "فروشگاه یافت نشد" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    const ticketId = String(b.ticketId ?? "");
    if (!ticketId) {
      return NextResponse.json({ success: false, error: "شناسه تیکت لازم است" }, { status: 400 });
    }

    const ticket = await db.storefrontTicket.findFirst({
      where: { id: ticketId, storefrontId: storefront.id },
      select: { id: true, status: true, customerEmail: true, customerName: true, subject: true },
    });
    if (!ticket) {
      return NextResponse.json({ success: false, error: "تیکت یافت نشد" }, { status: 404 });
    }

    const data: { reply?: string; status?: string } = {};
    if (typeof b.reply === "string" && b.reply.trim()) {
      data.reply = b.reply.trim().slice(0, 2000);
      data.status = "ANSWERED";
    }
    if (b.status === "CLOSED" || b.status === "OPEN") {
      data.status = b.status;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "پاسخ یا وضعیت جدید را مشخص کنید" }, { status: 400 });
    }

    const updated = await db.storefrontTicket.update({
      where: { id: ticket.id },
      data,
      select: { id: true, status: true, reply: true },
    });

    // FIX(3-a-h10): پاسخ مالک قبلاً فقط ذخیره می‌شد اما پیام API ادعا می‌کرد
    // «برای مشتری ارسال می‌شود» — هیچ ایمیلی ارسال نمی‌شد و مشتری هرگز پاسخ
    // را نمی‌دید (تیکت storefront هیچ رابط عمومی برای مشاهده پاسخ ندارد).
    // حالا ایمیل best-effort از طریق formsubmit.co برای مشتری ارسال می‌شود.
    // escapeHtml: جلوگیری از تزریق HTML در بدنهٔ ایمیل (reply/subject از ورودی کاربر است).
    if (data.reply && ticket.customerEmail) {
      const escapeHtml = (s: string) =>
        s.replace(/[&<>"']/g, (c) =>
          ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c
        );
      const safeReply = escapeHtml(data.reply);
      const safeSubject = escapeHtml(ticket.subject);
      void sendFormSubmitEmail({
        to: ticket.customerEmail,
        subject: `پاسخ پشتیبانی: ${ticket.subject}`,
        fromName: storefront.title || "پشتیبانی فروشگاه",
        message: `
          <p>${escapeHtml(ticket.customerName || "مشتری گرامی")} سلام،</p>
          <p>پاسخ پشتیبانی به تیکت «${safeSubject}»:</p>
          <blockquote>${safeReply}</blockquote>
        `,
        extra: {
          موضوع: ticket.subject,
          وضعیت: updated.status,
        },
      }).catch(() => {
        /* suppress email error — best-effort */
      });
    }

    return NextResponse.json({ success: true, ticket: updated, message: "پاسخ ثبت شد و برای مشتری ارسال می‌شود" });
  } catch (error) {
    console.error("[storefront tickets PUT] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در ثبت پاسخ تیکت" }, { status: 500 });
  }
}
