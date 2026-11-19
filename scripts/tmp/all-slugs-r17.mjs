import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const rows = await db.blogPost.findMany({ select: { slug: true, title: true, status: true } });
const kw = /اسباب|ورزشی|دوچرخه|لاستیک|رینگ|صافکاری|نقاشی|عتیقه|صنایع|سوغات|سیسمونی|نوزاد|کودک|بازی|گردشگری|امانی/;
for (const r of rows) if (kw.test(r.title) || /toy|sport|bike|bicycle|tire|rim|antique|craft|souvenir|baby|child|kids|paint|body/i.test(r.slug)) console.log(r.status,'|',r.slug,'|',r.title);
console.log('TOTAL:', rows.length);
await db.$disconnect();
