import { PrismaClient } from "@prisma/client";
import { existsSync } from "fs";
import { join } from "path";
const db = new PrismaClient();
async function main() {
  const posts = await db.blogPost.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true, coverImage: true },
  });
  let missing: string[] = [];
  let nullCover = 0;
  const missingSet = new Set<string>();
  for (const p of posts) {
    if (!p.coverImage) { nullCover++; continue; }
    if (p.coverImage.startsWith("/")) {
      const path = join(process.cwd(), "public", p.coverImage);
      if (!existsSync(path)) {
        missing.push(p.slug + " → " + p.coverImage);
        missingSet.add(p.coverImage);
      }
    }
  }
  console.log("published:", posts.length, "| null cover:", nullCover, "| broken covers:", missing.length);
  console.log("distinct missing files:", [...missingSet]);
  console.log("first 5:", missing.slice(0, 5));
  await db.$disconnect();
}
main();
