import { db } from "@/lib/db";
async function main() {
  const users = await db.user.findMany({ select: { id: true, username: true, role: true, isDemo: true, tenantId: true }, take: 8 });
  console.log(JSON.stringify(users, null, 1).slice(0, 1500));
  const demo = users.find(u => u.isDemo) || users[0];
  if (demo) {
    const t = await db.user.findUnique({ where: { id: demo.id }, select: { username: true, personalCode: true, passwordHash: true } });
    console.log("DEMO:", JSON.stringify({ ...t, passwordHash: t?.passwordHash ? "HAS_HASH" : null }));
  }
}
main().catch(e => { console.error(String(e).slice(0, 500)); process.exit(1); });
