// 1-e cleanup: delete the AI-generated TEST post (keep DB clean — this was only a test)
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const r = await db.blogPost.deleteMany({ where: { slug: "guide-software-accounting-ai-guide" } });
  console.log("deleted test posts:", r.count);
  const total = await db.blogPost.count();
  console.log("total posts now:", total);
  await db.$disconnect();
}
main();
