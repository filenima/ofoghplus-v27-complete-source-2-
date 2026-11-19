// Validation for R17-B3 blog files (temporary tool — not part of app code)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, "..", "r17-blogs");
const TMP_DIR = path.join(__dirname, "tmp-b3");
fs.rmSync(TMP_DIR, { recursive: true, force: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

const SAFE_LINKS = [
  "/blog/store-accounting-from-zero",
  "/blog/goods-turnover-rate",
  "/blog/retail-store-accounting-guide",
  "/blog/price-tag-with-vat",
  "/blog/psychological-pricing-techniques",
  "/pricing",
  "/features",
  "/industries",
];
const SAFE_BLOG_SLUGS = SAFE_LINKS.filter((l) => l.startsWith("/blog/")).map((l) => l.replace("/blog/", ""));
const ALLOWED_COVERS = [
  "/images/hero-industries.avif",
  "/images/hero-accounting.avif",
  "/images/ai-assistant.avif",
  "/images/landing-hero.avif",
  "/images/hero-dashboard.avif",
];

function stripHtml(html) {
  return html.replace(/<\/?[a-zA-Z][^>]*>/g, " ");
}
function countWords(html) {
  const matches = stripHtml(html).match(/[\p{L}\p{N}]+(?:[-'\u200c][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

async function loadOne(relPath) {
  const src = fs.readFileSync(path.join(SRC_DIR, relPath), "utf8");
  const js = src.replace(/^import type .*$/m, "").replace(/: NewBlogSpec\[\]/, "");
  const tmpPath = path.join(TMP_DIR, relPath.replace(/[\/\\]/g, "_").replace(/\.ts$/, ".mjs"));
  fs.writeFileSync(tmpPath, js);
  const mod = await import("file://" + tmpPath + `?t=${Date.now()}`);
  return Object.values(mod)[0][0];
}

function analyze(art) {
  const body = [...art.intro, ...art.sections, ...art.faq.map((f) => f.q + " " + f.a), ...art.conclusion];
  const words = body.reduce((s, h) => s + countWords(h), 0);
  const allHtml = body.join(" ");
  const links = [...allHtml.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const badLinks = links.filter((l) => !SAFE_LINKS.includes(l));
  // latin / foreign script in visible text (after stripping tags)
  const visible = [art.title, art.excerpt, art.metaDescription, art.focusKeyword, ...art.keywords, ...body.map(stripHtml)].join(" ");
  const latin = visible.match(/[A-Za-z]+/g) || [];
  const cyrillic = visible.match(/[\u0400-\u04FF]+/g) || [];
  const cjk = visible.match(/[\u3000-\u9FFF]+/g) || [];
  const emoji = [...visible].filter((c) => /\p{Extended_Pictographic}/u.test(c)).length;
  return {
    slug: art.slug, words,
    titleLen: [...art.title].length,
    excerptLen: [...art.excerpt].length,
    metaLen: [...art.metaDescription].length,
    kwCount: art.keywords.length,
    linkCount: links.length, badLinks,
    latin, cyrillic, cjk, emoji,
    relatedOk: art.relatedSlugs.length === 3 && art.relatedSlugs.every((s) => SAFE_BLOG_SLUGS.includes(s)),
    sectionsCount: art.sections.length,
    faqCount: art.faq.length,
    hasQuickAnswer: art.intro.some((p) => p.includes("پاسخ سریع")),
    coverOk: ALLOWED_COVERS.includes(art.coverImage),
    category: art.category, cluster: art.cluster,
  };
}

const files = ["b3-01.ts", "b3-02.ts", "b3-03.ts", "b3-04.ts", "b3-05.ts", "b3-06.ts", "b3-07.ts", "b3-08.ts"];
const slugs = new Set();
let allOk = true;
for (const f of files) {
  const art = await loadOne(f);
  if (slugs.has(art.slug)) { console.log(`!! DUPLICATE SLUG ${art.slug}`); allOk = false; }
  slugs.add(art.slug);
  const a = analyze(art);
  const ok = {
    words: a.words >= 3000,
    title: a.titleLen < 65,
    excerpt: a.excerptLen >= 150 && a.excerptLen <= 160,
    meta: a.metaLen >= 150 && a.metaLen <= 165,
    kw: a.kwCount >= 8 && a.kwCount <= 12,
    links: a.linkCount >= 4 && a.linkCount <= 6 && a.badLinks.length === 0,
    clean: a.latin.length === 0 && a.cyrillic.length === 0 && a.cjk.length === 0 && a.emoji === 0,
    struct: a.sectionsCount >= 8 && a.sectionsCount <= 12 && a.faqCount >= 6 && a.faqCount <= 7 && a.hasQuickAnswer && a.relatedOk && a.coverOk && a.category === "ACCOUNTING" && a.cluster === "industry",
  };
  const fail = Object.entries(ok).filter(([, v]) => !v).map(([k]) => k);
  if (fail.length) allOk = false;
  console.log(
    `${f} ${fail.length ? "FAIL:" + fail.join(",") : "OK "} | words=${a.words} title=${a.titleLen} exc=${a.excerptLen} meta=${a.metaLen} kw=${a.kwCount} links=${a.linkCount} h2=${a.sectionsCount} faq=${a.faqCount}` +
      (a.badLinks.length ? ` BADLINKS=${JSON.stringify(a.badLinks)}` : "") +
      (a.latin.length || a.cyrillic.length || a.cjk.length ? ` FOREIGN=${JSON.stringify({ latin: a.latin, cyr: a.cyrillic, cjk: a.cjk })}` : "")
  );
}
// calibration vs exemplar
const a01 = await loadOne("../new-blogs-content/a01-fruit-shop.ts");
const ca = analyze(a01);
console.log(`\nCALIB a01: words=${ca.words} excLen=${ca.excerptLen} metaLen=${ca.metaLen} titleLen=${ca.titleLen} links=${ca.linkCount}`);
console.log(allOk ? "\nALL B3 FILES PASS" : "\nSOME CHECKS FAILED");
