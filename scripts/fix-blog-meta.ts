// ============================================================
// scripts/fix-blog-meta.ts — بازسازی متادیتای سئوی مقالات بلاگ (R14-K1)
// ============================================================
// ابزار idempotent برای مالک:
//   ۱) گزارش تخلف‌ها: metaTitle (۳۰-۶۵)، metaDescription (۱۲۰-۱۶۰)،
//      focusKeyword، coverImage، readingTime ≥ ۸
//   ۲) اصلاحِ سیستماتیکِ آنچه قابل اصلاح است:
//      - metaTitle خالی/بلند (>۶۵) → از title با برش درستِ مرز واژه
//      - metaDescription خالی/کم‌طول (<۱۲۰)/بلند (>۱۶۰) → از excerpt با
//        برش مرز واژه؛ اگر excerpt کوتاه بود، از پاراگراف اول محتوا
//      - readingTime کمتر از حد محتوای واقعی → از شمارش واژه (۲۲۰ واژه/دقیقه)
//        فقط «افزایش» — هرگز کاهش (idempotent)
//   ۳) focusKeyword/coverImage: فقط گزارش (پرکردن خودکار ریسک واژه‌سازی دارد)
//
// اجرا:
//   DATABASE_URL="file:/home/z/my-project/hooshhesab/db/custom.db" \
//     bun scripts/fix-blog-meta.ts           # dry-run (پیش‌فرض)
//   DATABASE_URL="file:/home/z/my-project/hooshhesab/db/custom.db" \
//     bun scripts/fix-blog-meta.ts --apply   # اعمال واقعی
// ============================================================
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const TITLE_MIN = 30;
const TITLE_MAX = 65;
const DESC_MIN = 120;
const DESC_MAX = 160;
const READING_WORDS_PER_MIN = 220;

/** برش فارسی در مرز واژه (بدون بریدن کلمه) با برش ایمن نویسه‌ها */
function clampAtWordBoundary(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  let sliced = chars.slice(0, max).join("");
  // حذف واژهٔ نیمه‌بریده در انتها + نیم‌فاصله/فاصله/علائم معلق انتها
  const lastSpace = Math.max(sliced.lastIndexOf(" "), sliced.lastIndexOf("‌"));
  if (lastSpace > max * 0.6) sliced = sliced.slice(0, lastSpace);
  return sliced.replace(/[\s‌،؛:.\-—]+$/u, "").trim();
}

/** متن سادهٔ فارسی از HTML (بدون تگ) */
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(html: string): number {
  return htmlToText(html).split(" ").filter(Boolean).length;
}

/** ساخت متا‌توضیح در حد مجاز از excerpt یا پاراگراف اول محتوا */
function buildDescription(excerpt: string | null, content: string): string | null {
  const source = (excerpt && excerpt.trim().length >= 60
    ? excerpt
    // اگر excerpt کوتاه بود، پاراگراف اول + دوم محتوا
    : (() => {
        const paras = (content.match(/<p[^>]*>[\s\S]*?<\/p>/g) || [])
          .map((p) => htmlToText(p))
          .filter((t) => t.length > 80);
        return paras.slice(0, 2).join(" ");
      })()
  ).replace(/\s+/g, " ").trim();
  if (!source) return null;
  const desc = clampAtWordBoundary(source, DESC_MAX);
  return desc.length >= DESC_MIN ? desc : null; // کوتاه‌تر از حد → دست نمی‌زنیم
}

interface Violations {
  metaTitleMissing: number;
  metaTitleShort: number;
  metaTitleLong: number;
  metaDescriptionMissing: number;
  metaDescriptionShort: number;
  metaDescriptionLong: number;
  focusKeywordMissing: number;
  coverImageMissing: number;
  readingTimeLow: number;
}

async function main() {
  const posts = await db.blogPost.findMany({
    select: {
      id: true, slug: true, title: true, excerpt: true, content: true,
      metaTitle: true, metaDescription: true, focusKeyword: true,
      coverImage: true, readingTime: true, status: true,
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`بررسی ${posts.length} پست (${APPLY ? "APPLY" : "DRY-RUN"})\n`);

  const v: Violations = {
    metaTitleMissing: 0, metaTitleShort: 0, metaTitleLong: 0,
    metaDescriptionMissing: 0, metaDescriptionShort: 0, metaDescriptionLong: 0,
    focusKeywordMissing: 0, coverImageMissing: 0, readingTimeLow: 0,
  };

  type Change = {
    slug: string; field: string; from: string; to: string;
  };
  const changes: Change[] = [];
  let fixedTitles = 0, fixedDescs = 0, fixedReading = 0;

  for (const p of posts) {
    const tLen = p.metaTitle ? [...p.metaTitle].length : 0;
    const dLen = p.metaDescription ? [...p.metaDescription].length : 0;
    const words = countWords(p.content);
    const computedReading = Math.max(1, Math.round(words / READING_WORDS_PER_MIN));

    if (!p.metaTitle || !p.metaTitle.trim()) v.metaTitleMissing++;
    else if (tLen < TITLE_MIN) v.metaTitleShort++;
    else if (tLen > TITLE_MAX) v.metaTitleLong++;

    if (!p.metaDescription || !p.metaDescription.trim()) v.metaDescriptionMissing++;
    else if (dLen < DESC_MIN) v.metaDescriptionShort++;
    else if (dLen > DESC_MAX) v.metaDescriptionLong++;

    if (!p.focusKeyword || !p.focusKeyword.trim()) v.focusKeywordMissing++;
    if (!p.coverImage || !p.coverImage.trim()) v.coverImageMissing++;
    if (p.readingTime < 8) v.readingTimeLow++;

    // ─── اصلاح سیستماتیک ───
    const updates: Record<string, unknown> = {};

    // metaTitle: خالی یا بلند → از title (برش مرز واژه)
    if (!p.metaTitle?.trim() || tLen > TITLE_MAX) {
      const newTitle = clampAtWordBoundary(p.title, TITLE_MAX);
      if (newTitle !== p.metaTitle && [...newTitle].length >= TITLE_MIN) {
        updates.metaTitle = newTitle;
        changes.push({ slug: p.slug, field: "metaTitle", from: (p.metaTitle || "—").slice(0, 40), to: newTitle.slice(0, 40) });
        fixedTitles++;
      }
    }

    // metaDescription: خالی یا خارج از حد → از excerpt/محتوا
    if (!p.metaDescription?.trim() || dLen < DESC_MIN || dLen > DESC_MAX) {
      const newDesc = buildDescription(p.excerpt, p.content);
      if (newDesc && newDesc !== p.metaDescription) {
        updates.metaDescription = newDesc;
        changes.push({ slug: p.slug, field: "metaDescription", from: (p.metaDescription || "—").slice(0, 40), to: newDesc.slice(0, 40) });
        fixedDescs++;
      }
    }

    // readingTime: فقط افزایش تا حد محتوای واقعی (هرگز کاهش — idempotent)
    if (computedReading > p.readingTime) {
      updates.readingTime = computedReading;
      changes.push({ slug: p.slug, field: "readingTime", from: String(p.readingTime), to: String(computedReading) });
      fixedReading++;
    }

    if (APPLY && Object.keys(updates).length > 0) {
      await db.blogPost.update({ where: { id: p.id }, data: updates });
    }
  }

  // ─── گزارش ───
  console.log("=== گزارش تخلف‌ها (قبل از اصلاح) ===");
  console.log(`metaTitle:            خالی=${v.metaTitleMissing} | کوتاه(<${TITLE_MIN})=${v.metaTitleShort} | بلند(>${TITLE_MAX})=${v.metaTitleLong}`);
  console.log(`metaDescription:      خالی=${v.metaDescriptionMissing} | کوتاه(<${DESC_MIN})=${v.metaDescriptionShort} | بلند(>${DESC_MAX})=${v.metaDescriptionLong}`);
  console.log(`focusKeyword خالی:    ${v.focusKeywordMissing}`);
  console.log(`coverImage خالی:      ${v.coverImageMissing}`);
  console.log(`readingTime < 8:      ${v.readingTimeLow}`);
  console.log(`\n=== اصلاح‌های ${APPLY ? "اعمال‌شده" : "پیشنهادی (dry-run)"} ===`);
  console.log(`metaTitle: ${fixedTitles} | metaDescription: ${fixedDescs} | readingTime: ${fixedReading}`);
  console.log(`\nنمونهٔ ۱۲ تغییر نخست:`);
  for (const c of changes.slice(0, 12)) {
    console.log(`  [${c.slug}] ${c.field}: «${c.from}…» → «${c.to}…»`);
  }
  if (!APPLY) {
    console.log("\n(dry-run — برای اعمال: bun scripts/fix-blog-meta.ts --apply)");
  } else {
    console.log(`\n✅ ${changes.length} تغییر در DB اعمال شد.`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
