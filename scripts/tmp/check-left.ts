import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/hooshhesab/db/custom.db" } } });
async function main() {
  const users = await prisma.user.findMany({ where: { email: { contains: "smartdoc" } }, select: { email: true, tenantId: true } });
  console.log("smartdoc users:", users);
  const tenants = await prisma.tenant.findMany({ where: { name: { contains: "سند هوشمند" } }, select: { id: true, name: true } });
  console.log("smartdoc tenants:", tenants);
}
main().finally(() => prisma.$disconnect());
