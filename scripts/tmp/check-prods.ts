import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const tenantId = "cmuwhrmin0004lt54l23ugqpg";
  const total = await db.product.count({ where: { tenantId, deletedAt: null } });
  console.log("total products:", total);
  const recent = await db.product.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, name: true, sku: true, createdAt: true, type: true } });
  for (const p of recent) console.log(p.createdAt.toISOString(), "|", p.sku.slice(0, 24), "|", p.type, "|", p.name.slice(0, 30));
}
main().finally(() => db.$disconnect());
