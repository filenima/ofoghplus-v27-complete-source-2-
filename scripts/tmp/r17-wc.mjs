// R17-B2 — شمارش کلمات و اعتبارسنجی مقالات b2-01..b2-08
import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "scripts", "r17-blogs");
const files = fs.readdirSync(dir).filter((f) => /^b2-\d+\.ts$/.test(f)).sort();

function stripHtml(html) {
  return html
    .replace(/<img[^>]*>/g, " ")
    .replace(/<\/?[a-zA-Z][^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, " ");
}
function words(text) {
  return text.match(/[\p{L}\p{N}]+(?:[-'\u200c][\p{L}\p{N}]+)*/gu) || [];
}
function extract(src, from, to) {
  const s = src.indexOf(from);
  const e = src.indexOf(to, s);
  return src.slice(s, e === -1 ? undefined : e);
}
function quoted(chunk) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(chunk))) out.push(m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
  return out;
}

const allowedCovers = [
  "/images/hero-industries.avif",
  "/images/crm-customers.avif",
  "/images/hero-accounting.avif",
  "/images/landing-hero.avif",
  "/images/inventory-warehouse.avif",
];
const safeLinks = [
  "/blog/store-accounting-from-zero",
  "/blog/goods-turnover-rate",
  "/blog/retail-store-accounting-guide",
  "/blog/price-tag-with-vat",
  "/blog/psychological-pricing-techniques",
  "/pricing",
  "/features",
  "/industries",
];

let grandTotal = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  const meta = {
    title: (src.match(/title: "((?:[^"\\]|\\.)*)"/) || [])[1] || "",
    excerpt: (src.match(/excerpt:\s*\n?\s*"((?:[^"\\]|\\.)*)"/) || [])[1] || "",
    meta: (src.match(/metaDescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/) || [])[1] || "",
    cover: (src.match(/coverImage: "(\/images\/[^"]+)"/) || [])[1] || "",
    category: (src.match(/category: "([^"]+)"/) || [])[1] || "",
    cluster: (src.match(/cluster: "([^"]+)"/) || [])[1] || "",
    slug: (src.match(/slug: "([^"]+)"/) || [])[1] || "",
  };
  const kwCount = (src.match(/keywords:\s*\[/) && quoted(extract(src, "keywords:", "]")).length) || 0;
  const faqChunk = extract(src, "faq:", "conclusion:");
  const faqCount = (faqChunk.match(/q: "/g) || []).length;
  const related = quoted(extract(src, "relatedSlugs:", "]"));

  const bodyChunk = extract(src, "intro:", "relatedSlugs:");
  const bodyStrs = quoted(bodyChunk);
  const rawBody = bodyStrs.join("\n");
  const bodyText = bodyStrs.map(stripHtml).join("\n");
  const w = words(bodyText);
  const nonNum = w.filter((x) => !/^[\p{N}\u066C\u066B/٬,.]+$/u.test(x));

  const h2count = (src.match(/<h2>/g) || []).length;
  const paras = (src.match(/<p>/g) || []).length;
  const links = [...rawBody.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const internalLinks = links.filter((l) => safeLinks.includes(l));
  const badLinks = links.filter((l) => !safeLinks.includes(l));
  const allText = stripHtml(rawBody);
  const asciiDigits = allText.match(/[0-9]/g) || [];
  const cjk = allText.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || [];
  const emoji = allText.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [];
  const hasQuick = bodyChunk.includes("پاسخ سریع:") || (quoted(extract(src, "intro:", "sections:")).join(" ").includes("پاسخ سریع:"));

  grandTotal += w.length;
  const issues = [];
  if (w.length < 3000) issues.push(`WORDS ${w.length} < 3000`);
  if (nonNum.length < 2700) issues.push(`nonNumeric ${nonNum.length} low`);
  if (meta.title.length >= 65) issues.push(`title ${meta.title.length}>=65`);
  if (meta.excerpt.length < 150 || meta.excerpt.length > 160) issues.push(`excerpt ${meta.excerpt.length}`);
  if (meta.meta.length < 150 || meta.meta.length > 165) issues.push(`meta ${meta.meta.length}`);
  if (kwCount < 8 || kwCount > 12) issues.push(`keywords ${kwCount}`);
  if (faqCount < 6 || faqCount > 7) issues.push(`faq ${faqCount}`);
  if (h2count < 8 || h2count > 12) issues.push(`h2 ${h2count}`);
  if (internalLinks.length < 4 || internalLinks.length > 6) issues.push(`links ${internalLinks.length}`);
  if (badLinks.length) issues.push(`BADLINKS ${badLinks.join(",")}`);
  if (related.length !== 3) issues.push(`related ${related.length}`);
  if (!allowedCovers.includes(meta.cover)) issues.push(`cover ${meta.cover}`);
  if (meta.category !== "ACCOUNTING") issues.push("category");
  if (meta.cluster !== "industry") issues.push("cluster");
  if (asciiDigits.length) issues.push(`asciiDigits ${asciiDigits.length}`);
  if (cjk.length) issues.push(`CJK ${cjk.length}`);
  if (emoji.length) issues.push(`EMOJI ${emoji.length}`);
  if (!hasQuick) issues.push("no پاسخ سریع");
  if (paras < 20) issues.push(`paras ${paras}`);
  if (!/^\d+$/.test((src.match(/تعداد کلمات[:：]\s*(\d+)/) || [])[1] || "")) issues.push("no word-count comment");

  console.log(
    `${f} | ${meta.slug} | words=${String(w.length).padStart(4)} (nonNum=${String(nonNum.length).padStart(4)}) | h2=${h2count} paras=${paras} faq=${faqCount} links=${internalLinks.length} | title=${meta.title.length} exc=${meta.excerpt.length} meta=${meta.meta.length} kw=${kwCount}${issues.length ? " | ISSUES: " + issues.join(" ; ") : " | OK"}`
  );
}
console.log("GRAND TOTAL BODY WORDS:", grandTotal);
