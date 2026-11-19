import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/hooshhesab/db/custom.db" } } });
async function main() {
  const total = await prisma.user.count();
  const recent = await prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { email: true, createdAt: true } });
  console.log("total users:", total);
  console.log("recent:", recent);
}
main().finally(() => prisma.$disconnect());
