import { db } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/document-sequence";
import { moveStockForInvoice, type InvoiceStockItem } from "@/lib/products";
import {
  postInvoiceToLedger,
  postInvoiceSettlementToLedger,
} from "@/lib/accounting";

// ═══════════════════════════════════════════════════════════════════
// R17-C — همگام‌سازی سفارش فروشگاه با حسابداری (منبع واحد دو مسیر)
// هر دو مسیر «تأیید دستی مالک» (manage/orders/[id]) و «پرداخت موفق درگاه»
// (pay/verify) از همین تابع استفاده می‌کنند تا یک فاکتور، فقط یک‌بار و با
// همان ساختار ماژول حسابداری ثبت شود:
//   ۱) Invoice type=SALE با اقلام سفارش + طرف‌حساب مشتری (یافته یا ساخته)
//   ۲) کاهش موجودی انبار از طریق moveStockForInvoice (idempotent با StockMovement)
//   ۳) سند حسابداری خودکار فروش + سند تسویهٔ دریافت نقدی (idempotent)
//   ۴) AuditLog
// کل عملیات «بهترین تلاش» است — خطای حسابداری هرگز تأیید سفارش را بلاک نمی‌کند.
// ═══════════════════════════════════════════════════════════════════

interface StorefrontOrderItemJson {
  productId: string;
  name: string;
  priceRial: string;
  qty: number;
}

export interface StorefrontOrderForAccounting {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  items: string; // JSON اقلام سفارش
  totalRial: bigint;
  payableRial: bigint | null;
  invoiceId: string | null;
}

export interface IssuedStorefrontInvoice {
  invoiceId: string;
  invoiceNumber: string;
}

/**
 * صدور فاکتور فروش + کاهش موجودی + سند حسابداری برای سفارش تأییدشدهٔ فروشگاه.
 * idempotent: اگر سفارش از قبل invoiceId دارد، همان را برمی‌گرداند و چیزی ثبت نمی‌شود.
 * خروجی null یعنی ثبت ناموفق (غیرمسدودکننده) — فراخواننده فقط لاگ می‌گیرد.
 */
export async function issueInvoiceForStorefrontOrder(opts: {
  tenantId: string;
  storefrontSlug: string;
  storefrontTitle: string;
  order: StorefrontOrderForAccounting;
  userId: string | null;
  /** CASH برای کارت‌به‌کارت تأییدشده، ONLINE برای درگاه */
  paymentType: "CASH" | "ONLINE";
  /** توضیح تکمیلی در شرح فاکتور (مثلاً شماره پیگیری درگاه) */
  extraNote?: string | null;
}): Promise<IssuedStorefrontInvoice | null> {
  const { tenantId, order } = opts;
  if (order.invoiceId) {
    // قبلاً صادر شده — فقط شماره‌اش را بخوان
    const existing = await db.invoice.findUnique({
      where: { id: order.invoiceId },
      select: { id: true, number: true },
    });
    return existing ? { invoiceId: existing.id, invoiceNumber: existing.number } : null;
  }

  try {
    const items = JSON.parse(order.items) as StorefrontOrderItemJson[];
    if (!Array.isArray(items) || items.length === 0) return null;

    const payable = order.payableRial ?? order.totalRial;
    const discountAmount = order.totalRial - payable;

    // شماره‌ها «قبل از تراکنش» تخصیص می‌یابند (SQLite تک‌نویسنده —
    // upsert سندشماره بیرون از tx امن‌تر است؛ همان الگوی finalize فاکتور)
    const { number } = await nextDocumentNumber("INVOICE", tenantId);
    const saleJournal = await nextDocumentNumber("JOURNAL", tenantId);
    const settleJournal = await nextDocumentNumber("JOURNAL", tenantId);
    const date = new Date();

    const result = await db.$transaction(async (tx) => {
      // طرف حساب مشتری — بر اساس ایمیل/تلفن؛ اگر نبود ساخته می‌شود
      let party = await tx.party.findFirst({
        where: {
          tenantId,
          OR: [
            { email: order.customerEmail },
            ...(order.customerPhone ? [{ phone: order.customerPhone }] : []),
          ],
        },
        select: { id: true },
      });
      if (!party) {
        const partyCount = await tx.party.count({ where: { tenantId } });
        party = await tx.party.create({
          data: {
            tenantId,
            code: `C-${String(partyCount + 1).padStart(4, "0")}`,
            name: order.customerName,
            type: "CUSTOMER",
            email: order.customerEmail,
            phone: order.customerPhone,
          },
          select: { id: true },
        });
      }

      const description = [
        opts.paymentType === "ONLINE"
          ? `فروش آنلاین (درگاه) — سفارش فروشگاه ${opts.storefrontSlug}`
          : `فروش آنلاین — سفارش فروشگاه ${opts.storefrontSlug}`,
        `(${order.id.slice(-8).toUpperCase()})`,
        opts.extraNote ? opts.extraNote : "",
      ]
        .filter(Boolean)
        .join(" ");

      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          number,
          type: "SALE",
          partyId: party.id,
          date,
          subtotal: order.totalRial,
          discount: discountAmount,
          tax: 0n,
          total: payable,
          paidAmount: payable, // سفارش تأییدشده یعنی پول دریافت شده
          status: "PAID",
          paymentType: opts.paymentType,
          description,
          createdBy: opts.userId ?? undefined,
          items: {
            create: items.map((it) => ({
              productId: it.productId,
              description: it.name,
              quantity: it.qty,
              unitPrice: BigInt(it.priceRial),
              discount: 0,
              taxRate: 0,
              taxAmount: 0n,
              total: BigInt(it.priceRial) * BigInt(it.qty),
            })),
          },
        },
        select: { id: true, number: true },
      });

      // کاهش موجودی انبار — همان مسیر صدور فاکتور عادی (idempotent با StockMovement).
      // اجازهٔ موجودی منفی: مشتری آنلاین پرداخت کرده و تأیید مالک نباید
      // به‌خاطر کسری موجودی ثبت‌شده در انبار شکست بخورد.
      const stockItems: InvoiceStockItem[] = items.map((it) => ({
        productId: it.productId,
        quantity: it.qty,
        unitPrice: BigInt(it.priceRial),
      }));
      const productNames = new Map(items.map((it) => [it.productId, it.name]));
      await moveStockForInvoice(
        tx,
        tenantId,
        {
          invoiceId: invoice.id,
          type: "SALE",
          date,
          allowNegativeStock: true,
        },
        stockItems,
        productNames
      );

      // سند حسابداری خودکار فروش + سند تسویهٔ دریافت (هر دو idempotent)
      await postInvoiceToLedger(
        tx,
        tenantId,
        opts.userId,
        {
          invoiceId: invoice.id,
          number: invoice.number,
          type: "SALE",
          date,
          description: `سفارش فروشگاه ${opts.storefrontTitle}`,
          subtotal: order.totalRial,
          tax: 0n,
          discount: discountAmount,
          total: payable,
        },
        { journalNumber: saleJournal.seq }
      );
      await postInvoiceSettlementToLedger(
        tx,
        tenantId,
        opts.userId,
        {
          invoiceId: invoice.id,
          number: invoice.number,
          type: "SALE",
          date,
        },
        payable,
        { journalNumber: settleJournal.seq }
      );

      await tx.storefrontOrder.update({
        where: { id: order.id },
        data: { invoiceId: invoice.id },
      });

      return { invoiceId: invoice.id, invoiceNumber: invoice.number };
    });

    // AuditLog — بیرون از tx تا شکستش چیزی را برنگرداند
    await db.auditLog
      .create({
        data: {
          tenantId,
          userId: opts.userId,
          action: "CREATE",
          entity: "Invoice",
          entityId: result.invoiceId,
          changes: JSON.stringify({
            via: "storefront-order",
            orderId: order.id,
            storefront: opts.storefrontSlug,
            number: result.invoiceNumber,
            totalRial: Number(payable),
          }),
        },
      })
      .catch(() => undefined);

    return result;
  } catch (e) {
    console.warn(
      "[storefront-accounting] invoice sync failed (non-blocking):",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}
