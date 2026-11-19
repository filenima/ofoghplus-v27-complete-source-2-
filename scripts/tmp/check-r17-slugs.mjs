import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const slugs = ["sisemoni-baby-store-accounting","toy-shop-age-returns-accounting","sports-equipment-store-accounting","bicycle-shop-repair-accounting","tire-rim-shop-accounting","auto-body-paint-shop-accounting","antique-collectibles-shop-accounting","handicraft-souvenir-shop-accounting"];
const rows = await db.blogPost.findMany({ where: { slug: { in: slugs } }, select: { slug: true, status: true } });
console.log('COLLISIONS:', rows.length === 0 ? 'NONE — all 8 slugs unique' : rows.map(r => r.slug + '(' + r.status + ')').join(', '));
await db.$disconnect();
