import { db } from "@/lib/db";
async function main() {
  const stores = await db.storefront.findMany({ select: { slug: true, isActive: true, businessType: true, template: true, tenantId: true } });
  console.log(JSON.stringify(stores, null, 1));
  for (const s of stores) {
    const count = await db.product.count({ where: { tenantId: s.tenantId, deletedAt: null } });
    const sample = await db.product.findMany({ where: { tenantId: s.tenantId, deletedAt: null }, select: { id: true, name: true }, take: 3 });
    console.log(s.slug, "products:", count, JSON.stringify(sample));
  }
}
main().catch((e) => console.error(e)).finally(() => db.$disconnect());
