import { db } from "@/lib/db";
async function main() {
  const [blogTotal, blogPublished, blogDraft, blogScheduled, cmsPages, seoMeta, siteContent, storefronts, products, parties, invoices, users, tenants] = await Promise.all([
    db.blogPost.count(),
    db.blogPost.count({ where: { status: "PUBLISHED" } }),
    db.blogPost.count({ where: { status: "DRAFT" } }),
    db.blogPost.count({ where: { status: "SCHEDULED" } }).catch(() => -1),
    db.cmsPage.count().catch(() => -1),
    db.seoMeta.count().catch(() => -1),
    db.siteContent.count().catch(() => -1),
    db.storefront.count().catch(() => -1),
    db.product.count().catch(() => -1),
    db.party.count().catch(() => -1),
    db.invoice.count().catch(() => -1),
    db.user.count().catch(() => -1),
    db.tenant.count().catch(() => -1),
  ]);
  console.log(JSON.stringify({ blogTotal, blogPublished, blogDraft, blogScheduled, cmsPages, seoMeta, siteContent, storefronts, products, parties, invoices, users, tenants }, null, 1));
}
main().catch(e => { console.error(String(e).slice(0, 500)); process.exit(1); });
