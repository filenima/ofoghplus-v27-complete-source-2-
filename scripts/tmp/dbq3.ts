import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/hooshhesab/db/custom.db" } } });
async function main() {
  const users = await prisma.user.findMany({ where: { email: { contains: "smartdoc" } } });
  const tenants = await prisma.tenant.findMany({ where: { name: { contains: "سند هوشمند" } } });
  const entries = await prisma.journalEntry.findMany({ where: { description: { contains: "ایمپورت تست" } } });
  console.log("leftover users:", users.length, "tenants:", tenants.length, "entries:", entries.length);
}
main().finally(() => prisma.$disconnect());
