import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const tenantId = "cmuwhrmin0004lt54l23ugqpg";
  // create uncategorized test products (mobile business type)
  const names = ["شارژر سریع تایپسی ۲۰ وات", "قلم لمسی سامسونگ", "گوشی شیائومی ردمی نوت ۱۳"];
  for (const n of names) {
    await db.product.create({ data: { tenantId, name: n, salePrice: 100000n, unit: "عدد", type: "PRODUCT", sku: "e2e-cat-" + Date.now() + "-" + Math.random().toString(36).slice(2,6) } });
  }
  const noCat = await db.product.findMany({ where: { tenantId, deletedAt: null, OR: [{ categoryId: null }, { categoryId: "" }], name: { contains: "" } }, select: { id: true, name: true, categoryId: true } });
  console.log("uncategorized now:", noCat.filter(p=>!p.categoryId).length);
  for (const p of noCat.filter(p=>!p.categoryId)) console.log(" -", p.name);
}
main().finally(() => db.$disconnect());
