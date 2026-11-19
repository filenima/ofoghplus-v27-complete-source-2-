import { db } from "@/lib/db";
async function main() {
  const rows = await db.storefront.findMany({ select: { slug: true, template: true, isActive: true }, take: 8 });
  console.log(JSON.stringify(rows));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
