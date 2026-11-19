// 1-e: cover image usage stats by category
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const posts = await db.blogPost.findMany({
    where: { status: "PUBLISHED" },
    select: { category: true, coverImage: true },
  });
  const byCat = new Map<string, string[]>();
  for (const p of posts) {
    if (!p.coverImage) continue;
    const arr = byCat.get(p.category) || [];
    arr.push(p.coverImage);
    byCat.set(p.category, arr);
  }
  for (const [cat, imgs] of byCat) {
    const counts = new Map<string, number>();
    for (const i of imgs) counts.set(i, (counts.get(i) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    console.log(cat, "→", top.map(([u, n]) => `${u} (${n})`).join(" | "));
  }
  const all = new Set(posts.map((p) => p.coverImage).filter(Boolean));
  console.log("distinct covers overall:", all.size);
  await db.$disconnect();
}
main();
