import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const oid = process.argv[2];
  const order = await db.storefrontOrder.findUnique({ where: { id: oid }, include: { invoice: { include: { items: true } } } });
  if (!order) { console.log("order not found"); return; }
  console.log("order:", order.id.slice(-8), "| status:", order.status, "| invoiceId:", order.invoiceId);
  if (!order.invoice) { console.log("NO INVOICE"); return; }
  const inv = order.invoice;
  console.log("invoice:", inv.number, "| type:", inv.type, "| status:", inv.status, "| paidAmount:", inv.paidAmount?.toString(), "| total:", inv.total.toString());
  console.log("items:", inv.items.map(i => `${i.description} x${i.quantity} @${i.unitPrice}`));
  // journals
  const journals = await db.journalEntry.findMany({ where: { tenantId: inv.tenantId, description: { contains: inv.number } }, include: { lines: true } });
  console.log("journal entries for invoice:", journals.length);
  for (const j of journals) {
    console.log(" -", j.number, "|", j.description?.slice(0, 60), "| lines:", j.lines.map(l => `${l.accountId.slice(-4)}:${l.debit?.toString() ?? 0}/${l.credit?.toString() ?? 0}`).join(" "));
  }
  // stock movement
  const stock = await db.stockMovement.findMany({ where: { tenantId: inv.tenantId, referenceId: inv.id } });
  console.log("stock movements:", stock.length, stock.map(s => `${s.productId.slice(-6)}:${s.quantity}`));
  // audit log
  const audit = await db.auditLog.findMany({ where: { tenantId: inv.tenantId, entity: "Invoice", entityId: inv.id } });
  console.log("audit logs:", audit.length);
  // party
  const party = await db.party.findUnique({ where: { id: inv.partyId ?? "" } });
  console.log("party:", party?.name, party?.type, party?.email);
}
main().finally(() => db.$disconnect());
