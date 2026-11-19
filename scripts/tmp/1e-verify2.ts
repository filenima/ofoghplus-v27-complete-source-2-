import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const post = await db.blogPost.findUnique({ where: { slug: "software-accounting-ai-business-iranian-guide" } });
  console.log("DB record:", {
    coverImage: post?.coverImage,
    status: post?.status,
    category: post?.category,
    scheduledPublishAt: post?.scheduledPublishAt,
    scheduleOrder: post?.scheduleOrder,
  });
  // cleanup test post
  const r = await db.blogPost.deleteMany({ where: { slug: "software-accounting-ai-business-iranian-guide" } });
  console.log("cleaned:", r.count, "| total now:", await db.blogPost.count());
  await db.$disconnect();
}
main();
