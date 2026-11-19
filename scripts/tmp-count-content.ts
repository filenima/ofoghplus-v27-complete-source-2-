import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const [blogTotal, blogPublished, blogDraft, pages, draftsAny, products, categories, orders, comments, testimonials, seoRows, siteContent] = await Promise.all([
    db.blogPost.count(), db.blogPost.count({ where: { status: "PUBLISHED" } }), db.blogPost.count({ where: { status: { not: "PUBLISHED" } } }),
    db.page?.count?.() ?? Promise.resolve(null),
    db.blogPost.count({ where: { status: "DRAFT" } }),
    db.product.count().catch(() => -1),
    db.productCategory.count().catch(() => -1),
    db.invoice.count().catch(() => -1),
    db.supportTicket.count().catch(() => -1),
    db.siteTestimonial.count().catch(() => -1),
    db.systemSettings.count().catch(() => -1),
    db.siteContent.count().catch(() => -1),
  ]);
  console.log(JSON.stringify({ blogTotal, blogPublished, blogDraft, pages, draftsAny, products, categories, orders, comments, testimonials, seoRows, siteContent }, null, 2));
}
main().finally(() => db.$disconnect());
