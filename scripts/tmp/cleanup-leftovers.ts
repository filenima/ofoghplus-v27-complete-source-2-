import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/hooshhesab/db/custom.db" } } });
async function main() {
  const guards = await prisma.registrationGuard.findMany({ take: 20, orderBy: { lastSeen: "desc" } });
  console.log("guards:", guards.map((g) => ({ k: g.guardKey.slice(0, 24), t: g.guardType, c: g.count, ip: g.lastIp })));
  const users = await prisma.user.findMany({ where: { email: { startsWith: "qa-smartdoc-" } }, select: { tenantId: true, email: true } });
  for (const u of users) {
    const tenantId = u.tenantId;
    await prisma.journalEntry.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.journalLine.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.documentSequence.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.account.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.accountGroup.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.fiscalYear.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.license.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.userSession.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
    console.log(`cleaned ${u.email}`);
  }
  const d1 = await prisma.registrationGuard.deleteMany({ where: { lastIp: "127.0.0.1" } });
  const d2 = await prisma.registrationGuard.deleteMany({ where: { guardKey: { startsWith: "email:qa-smartdoc-" } } });
  console.log(`guards deleted (ip): ${d1.count}, (email): ${d2.count}`);
}
main().finally(() => prisma.$disconnect());
