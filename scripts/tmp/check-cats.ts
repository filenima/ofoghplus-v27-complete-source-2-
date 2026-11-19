import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const tenant = await db.tenant.findFirst({ where: { users: { some: { email: "demo@hoosh.nobatime.ir" } } } });
  if (!tenant) { console.log("no tenant"); return; }
  const total = await db.product.count({ where: { tenantId: tenant.id, deletedAt: null } });
  const noCat = await db.product.count({ where: { tenantId: tenant.id, deletedAt: null, OR: [{ categoryId: null }, { categoryId: "" }] } });
  console.log("tenant:", tenant.id, "| total products:", total, "| without category:", noCat);
  const samples = await db.product.findMany({ where: { tenantId: tenant.id, deletedAt: null, OR: [{ categoryId: null }, { categoryId: "" }] }, select: { id: true, name: true }, take: 8 });
  for (const s of samples) console.log(" -", s.id, s.name);
}
main().finally(() => db.$disconnect());
