import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  console.log("total:", await db.blogPost.count());
  const t = await db.blogPost.findUnique({ where: { slug: "1e-scheduler-e2e-test" } });
  console.log("test post exists:", Boolean(t));
  await db.$disconnect();
}
main();
