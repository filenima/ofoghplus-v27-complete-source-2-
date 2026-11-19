// 1-e: check DRAFT + ALL posts cover images existence (they will be published later)
import { PrismaClient } from "@prisma/client";
import { existsSync } from "fs";
import { join } from "path";
const db = new PrismaClient();
async function main() {
  const posts = await db.blogPost.findMany({
    select: { slug: true, coverImage: true, status: true },
  });
  let nullCover = 0;
  const missingSet = new Map<string, number>();
  for (const p of posts) {
    if (!p.coverImage) { nullCover++; continue; }
    if (p.coverImage.startsWith("/")) {
      const path = join(process.cwd(), "public", p.coverImage);
      if (!existsSync(path)) {
        missingSet.set(p.coverImage, (missingSet.get(p.coverImage) || 0) + 1);
      }
    }
  }
  console.log("total posts:", posts.length, "| null cover:", nullCover, "| distinct broken paths:", missingSet.size);
  console.log([...missingSet.entries()]);
  await db.$disconnect();
}
main();
