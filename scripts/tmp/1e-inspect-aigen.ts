// 1-e: inspect the AI-generated test post + queue position, then decide cleanup
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const post = await db.blogPost.findUnique({
    where: { slug: "guide-software-accounting-ai-guide" },
  });
  if (!post) {
    console.log("NOT FOUND");
  } else {
    console.log({
      id: post.id,
      slug: post.slug,
      title: post.title,
      status: post.status,
      category: post.category,
      coverImage: post.coverImage,
      ogImage: post.ogImage,
      authorId: post.authorId,
      metaTitle: post.metaTitle?.slice(0, 40),
      metaDescription: (post.metaDescription || "").slice(0, 40),
      focusKeyword: post.focusKeyword,
      tags: post.tags,
      readingTime: post.readingTime,
      scheduledPublishAt: post.scheduledPublishAt,
      scheduleOrder: post.scheduleOrder,
      contentWords: (post.content || "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length,
      hasH2: (post.content.match(/<h2/g) || []).length,
      hasTable: (post.content.match(/<table/g) || []).length,
    });
  }
  await db.$disconnect();
}
main();
