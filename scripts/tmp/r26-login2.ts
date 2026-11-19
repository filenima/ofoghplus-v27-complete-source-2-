import { db } from "@/lib/db";
async function main() {
  const users = await db.user.findMany({ select: { id: true, username: true, role: true, isDemo: true, tenantId: true }, take: 8 });
  console.log(JSON.stringify(users.map(u => ({ u: u.username, role: u.role, demo: u.isDemo })), null, 1).slice(0, 1200));
}
main().catch(e => { console.error(String(e).slice(0, 400)); process.exit(1); });
