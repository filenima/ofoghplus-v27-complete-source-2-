import { db } from "@/lib/db";
async function main() {
  const sf = await db.storefront.findFirst({ where: { slug: "demo-shop" } });
  if (!sf) { console.log("no sf"); return; }
  const users = await db.user.findMany({ where: { tenantId: sf.tenantId }, select: { id: true, username: true, personalCode: true, family: true, role: true, isDemo: true } });
  console.log(JSON.stringify(users, null, 1).slice(0, 1200));
}
main().catch(e => { console.error(String(e).slice(0, 800)); process.exit(1); });
