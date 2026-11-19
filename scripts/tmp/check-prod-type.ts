import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const pid = process.argv[2];
  const p = await db.product.findUnique({ where: { id: pid }, select: { id: true, name: true, type: true, sku: true } });
  console.log(p);
}
main().finally(() => db.$disconnect());
