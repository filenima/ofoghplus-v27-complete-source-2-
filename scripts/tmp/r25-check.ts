import { db } from "@/lib/db";
async function main() {
  const sf = await db.storefront.findFirst({ where: { slug: "demo-shop" } });
  if (!sf) { console.log("NOT FOUND"); return; }
  const tenant = await db.tenant.findUnique({ where: { id: sf.tenantId }, select: { id: true, name: true, plan: true } });
  console.log("storefront:", JSON.stringify({ id: sf.id, slug: sf.slug, template: sf.template, isActive: sf.isActive, wizardDone: sf.wizardDone, tenant: tenant?.name, plan: tenant?.plan }));
  console.log("blocksJson len:", (sf.blocksJson||"").length, "| draft len:", (sf.blocksDraftJson||"").length);
  console.log("blocks head:", (sf.blocksJson||"(empty)").slice(0, 200));
  const products = await db.product.count({ where: { tenantId: sf.tenantId, deletedAt: null } });
  console.log("products:", products);
  const meta = await db.storefrontProductMeta.count({ where: { product: { tenantId: sf.tenantId } } });
  console.log("product metas:", meta);
  const reviews = await db.storefrontReview.count({ where: { storefrontId: sf.id } });
  console.log("reviews:", reviews);
  const orders = await db.storefrontOrder.count({ where: { storefrontId: sf.id } });
  console.log("orders:", orders);
  const revisions = await db.storefrontRevision.count({ where: { storefrontId: sf.id } });
  console.log("revisions:", revisions);
  const all = await db.storefront.count();
  console.log("total storefronts:", all);
}
main().catch(e => { console.error(String(e).slice(0,500)); process.exit(1); });
