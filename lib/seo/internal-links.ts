// ============================================================
// lib/seo/internal-links.ts — لینک‌ساز زمینه‌ای (contextual auto-linker)
// R24-7 / Agent 5 — Internal Linking (لینک‌دهی داخلی)
// ------------------------------------------------------------
// نگاشت کلیدواژه‌های پرتکرار بلاگ/محتوا به صفحات پولی (money pages)
// و صفحات هاب. تزریق خودکار لینک داخل HTML مقاله با قواعد امن:
//   • حداکثر maxLinks (پیش‌فرض ۳) لینک در هر محتوا
//   • فقط اولین رخداد هر کلیدواژه
//   • هر کلیدواژه فقط یک‌بار (بدون لینک تکراری روی همان عبارت)
//   • داخل تگ‌ها (attributes) لینک ساخته نمی‌شود
//   • داخل هدینگ‌ها (h1..h6) و لینک‌های موجود (<a>) لینک ساخته نمی‌شود
//   • فاصله/ZWNJ در کلیدواژه معادلند (نرم‌افزار ≡ نرم افزار)
//   • به صفحهٔ خودی (currentPath) لینک داده نمی‌شود
//   • ترتیب اولویت: بلندترین عبارت (سامانه مودیان قبل از مودیان)
// ============================================================

export interface InternalLinkRule {
  /** کلیدواژه فارسی برای جستجو در متن (فاصله = ZWNJ-پذیر) */
  keyword: string;
  /** مسیر مقصد (rel — مثلاً /pricing) */
  href: string;
  /** عنوان لینک (title) — اختیاری */
  title?: string;
}

/**
 * R24-7: ۳۳ نگاشت کلیدواژه → مقصد.
 * همهٔ مقصدها روت‌های واقعی app/ هستند (با scripts/seo/check-internal-links.ts راستی‌آزمایی شده).
 */
export const INTERNAL_LINK_RULES: InternalLinkRule[] = [
  // ─── صفحات پول / تبدیل ───
  { keyword: "قیمت نرم‌افزار حسابداری", href: "/pricing", title: "قیمت و پلن‌های افق پلاس" },
  { keyword: "قیمت نرم افزار حسابداری", href: "/pricing", title: "قیمت و پلن‌های افق پلاس" },
  { keyword: "تعرفه نرم‌افزار حسابداری", href: "/pricing" },
  { keyword: "پلن‌های نرم‌افزار حسابداری", href: "/pricing" },
  { keyword: "مقایسه پلن‌ها", href: "/compare-plans", title: "مقایسه تعاملی پلن‌های افق پلاس" },
  { keyword: "ماشین‌حساب بازگشت سرمایه", href: "/roi-calculator" },
  { keyword: "بازگشت سرمایه سرمایه‌گذاری", href: "/roi-calculator" },
  // ─── سامانه مودیان (مهم‌ترین خوشه) ───
  { keyword: "سامانه مودیان", href: "/moadian-invoice", title: "آزمایشگاه صورتحساب مودیان" },
  { keyword: "سامانه مودیان مالیاتی", href: "/moadian-invoice" },
  { keyword: "صورتحساب الکترونیکی", href: "/moadian-invoice", title: "ساخت و ارسال صورتحساب الکترونیکی" },
  { keyword: "صورت حساب الکترونیکی", href: "/moadian-invoice" },
  { keyword: "کارپوشه مودیان", href: "/moadian-invoice" },
  // ─── مالیات ───
  { keyword: "مالیات بر ارزش افزوده", href: "/taxes/vat", title: "راهنمای مالیات بر ارزش افزوده" },
  { keyword: "ارزش افزوده", href: "/taxes/vat" },
  { keyword: "اظهارنامه ارزش افزوده", href: "/taxes/vat" },
  { keyword: "مالیات بر درآمد", href: "/taxes/income-tax" },
  { keyword: "مالیات حقوق", href: "/taxes/salary-tax", title: "محاسبه و لیست مالیات حقوق" },
  // R25-D fix: مقصد قبلی /taxes/stamp-duty (مالیات تمبر) اشتباه مفهومی بود —
  // مالیات تکلیفی (ماده ۱۰۴) صفحهٔ هاب مستقل ندارد؛ مقالهٔ ستون مرجع است.
  { keyword: "مالیات تکلیفی", href: "/blog/withholding-tax-contracts", title: "راهنمای کامل مالیات تکلیفی (ماده ۱۰۴)" },
  // ─── هاب‌های موضوعی ───
  { keyword: "حسابداری ابری", href: "/seo/cloud-accounting-modian", title: "حسابداری ابری و مودیان" },
  { keyword: "نرم‌افزار حسابداری آنلاین", href: "/seo/online-accounting-software-iran" },
  { keyword: "حسابداری فروشگاهی", href: "/industries/retail", title: "حسابداری خرده‌فروشی" },
  { keyword: "حسابداری رستوران", href: "/industries/restaurant", title: "راهنمای حسابداری رستوران" },
  { keyword: "حسابداری داروخانه", href: "/industries/clinic" },
  { keyword: "حسابداری تولیدی", href: "/industries/manufacturing", title: "حسابداری صنایع تولیدی" },
  { keyword: "حسابداری پیمانکاری", href: "/industries/construction", title: "حسابداری پیمان و ساخت" },
  { keyword: "حسابداری فروشگاه اینترنتی", href: "/industries/ecommerce" },
  { keyword: "حقوق و دستمزد", href: "/seo/payroll-software-iran", title: "نرم‌افزار حقوق و دستمزد ایرانی" },
  { keyword: "مدیریت انبار", href: "/seo/warehouse-management-accounting", title: "مدیریت انبار و کاردکس" },
  // R25-D fix: انکر واقعی در /glossary برعکس نوشته شده بود (term-check-sayadi نه term-sayadi-check)
  { keyword: "چک صیادی", href: "/glossary#term-check-sayadi", title: "تعریف چک صیادی در واژه‌نامه" },
  // ─── بانک‌ها ───
  { keyword: "بانک ملت", href: "/banks/mellat", title: "اتصال به بانک ملت" },
  { keyword: "بانک ملی", href: "/banks/melli", title: "اتصال به بانک ملی" },
  { keyword: "بانک صادرات", href: "/banks/saderat", title: "اتصال به بانک صادرات" },
  { keyword: "بانک تجارت", href: "/banks/tejarat", title: "اتصال به بانک تجارت" },
  // ─── ابزارهای رایگان (لیدمگنت) ───
  { keyword: "سلامت مالی", href: "/financial-health", title: "سنجش رایگان سلامت مالی" },
  { keyword: "ماشین‌حساب مالیاتی", href: "/calculators", title: "ماشین‌حساب‌های رایگان مالیاتی" },
  { keyword: "ماشین حساب حقوق", href: "/calculators" },
  { keyword: "واژه‌نامه حسابداری", href: "/glossary", title: "واژه‌نامه اصطلاحات حسابداری" },
  // ─── شهرها (نمونه‌های پرجستجو) ───
  { keyword: "حسابداری در تهران", href: "/cities/tehran" },
  { keyword: "حسابداری در شیراز", href: "/cities/shiraz" },
  { keyword: "حسابداری در اصفهان", href: "/cities/isfahan" },
  { keyword: "حسابداری در مشهد", href: "/cities/mashhad" },
  // ─── مقایسه رقبا ───
  { keyword: "نرم‌افزار هلو", href: "/compare/holoo", title: "مقایسه هلو و افق پلاس" },
  { keyword: "نرم‌افزار سپیدار", href: "/compare/sepidar", title: "مقایسه سپیدار و افق پلاس" },
  { keyword: "نرم افزار محک", href: "/compare/chortke", title: "مقایسه محک و افق پلاس" },
  { keyword: "حسابفا", href: "/compare/hesabfa", title: "مقایسه حسابفا و افق پلاس" },
  // ─── اعتماد / آموزش ───
  { keyword: "نمونه‌های موفق مشتریان", href: "/case-studies" },
  { keyword: "دوره آموزش حسابداری", href: "/tutorials", title: "آموزش گام‌به‌گام حسابداری" },
  { keyword: "برنامه شرکای تجاری", href: "/partners" },
];

// ────────────────────────────────────────────────────────────
// موتور تزریق امن
// ────────────────────────────────────────────────────────────

/** escape برای regex */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * ساخت regex از کلیدواژه — فاصله/ZWNJ معادلند:
 * "قیمت نرم‌افزار" → /قیمت[\s\u200c]*نرم[\s\u200c]*افزار/gu
 */
function keywordToRegex(keyword: string): RegExp {
  const parts = keyword
    .split(/[\s\u200c]+/)
    .filter(Boolean)
    .map(escapeRe);
  return new RegExp(`(?<![\\w\\u0600-\\u06FF])(${parts.join("[\\s\\u200c]+")})(?![\\w\\u0600-\\u06FF])`, "gu");
}

export interface InjectLinksOptions {
  /** حداکثر تعداد لینک تزریقی (پیش‌فرض ۳) */
  maxLinks?: number;
  /** مسیر صفحهٔ فعلی — به خودش لینک داده نمی‌شود */
  currentPath?: string;
  /** قواعد سفارشی (پیش‌فرض: INTERNAL_LINK_RULES) */
  rules?: InternalLinkRule[];
}

/**
 * injectInternalLinks — لینک‌های زمینه‌ای را در HTML محتوا تزریق می‌کند.
 *
 * الگوریتم:
 *  ۱) HTML به قطعات tag/text تفکیک می‌شود (تگ‌ها دست‌نخورده می‌مانند).
 *  ۲) وضعیت پیمایش (insideAnchor / insideHeading) دنبال می‌شود — متن داخل
 *     <a> یا هدینگ‌ها رد می‌شود.
 *  ۳) در هر قطعهٔ متن، همهٔ رخدادهای همهٔ کلیدواژه‌ها پیدا می‌شود؛ انتخاب
 *     حریصانه بر اساس موقعیت (اولین‌ها) و طول عبارت (بلندتر اولویت دارد)
 *     تا لینک تودرتو ساخته نشود.
 *  ۴) سقف maxLinks و یکتایی هر کلیدواژه رعایت می‌شود.
 */
export function injectInternalLinks(html: string, options: InjectLinksOptions = {}): string {
  const maxLinks = options.maxLinks ?? 3;
  const rules = (options.rules ?? INTERNAL_LINK_RULES)
    .filter((r) => !options.currentPath || normalizePath(r.href) !== normalizePath(options.currentPath))
    .map((r) => ({ ...r, re: keywordToRegex(r.keyword), used: false }));
  if (rules.length === 0) return html;

  let linkCount = 0;
  // تفکیک tag / text — تگ‌ها شامل <...> هستند (بدون > داخل نقل‌قول‌ها؛ HTML بلاگ ساده است
  // و attributeهایی که > دارند نداریم؛ در بدترین حالت متن کمی جابه‌جا می‌شود نه خراب)
  const segments = html.split(/(<[^>]*>)/g);

  let insideAnchor = 0;
  let insideHeading = 0;

  const out = segments.map((seg) => {
    if (seg.startsWith("<")) {
      const tagMatch = seg.match(/^<\/?\s*([a-zA-Z0-9-]+)/);
      const tag = tagMatch ? tagMatch[1].toLowerCase() : "";
      const isClosing = seg.startsWith("</");
      if (tag === "a") {
        if (isClosing) insideAnchor = Math.max(0, insideAnchor - 1);
        else if (!seg.endsWith("/>")) insideAnchor += 1;
      }
      if (/^h[1-6]$/.test(tag)) {
        if (isClosing) insideHeading = Math.max(0, insideHeading - 1);
        else if (!seg.endsWith("/>")) insideHeading += 1;
      }
      return seg;
    }
    if (seg.length === 0) return seg;
    if (insideAnchor > 0 || insideHeading > 0) return seg;
    if (linkCount >= maxLinks) return seg;

    // همهٔ نامزدها در این قطعه متن: {start, end, ruleIndex, keyword}
    interface Candidate {
      start: number;
      end: number;
      rule: (typeof rules)[number];
    }
    const candidates: Candidate[] = [];
    for (const rule of rules) {
      if (rule.used || linkCount + candidates.length >= maxLinks) continue;
      rule.re.lastIndex = 0;
      const m = rule.re.exec(seg);
      if (m && m.index >= 0) {
        candidates.push({ start: m.index, end: m.index + m[0].length, rule });
      }
    }
    if (candidates.length === 0) return seg;

    // مرتب‌سازی: اولویت با موقعیت زودتر؛ در برخورد، عبارت بلندتر
    candidates.sort((a, b) => a.start - b.start || b.end - a.start - (a.end - b.start));
    const accepted: Candidate[] = [];
    let lastEnd = -1;
    for (const c of candidates) {
      if (linkCount + accepted.length >= maxLinks) break;
      if (c.start >= lastEnd) {
        accepted.push(c);
        lastEnd = c.end;
      }
    }
    if (accepted.length === 0) return seg;

    // ساخت متن جدید از انتها به ابتدا (تا ایندکس‌ها جابه‌جا نشوند)
    let result = seg;
    for (let i = accepted.length - 1; i >= 0; i--) {
      const c = accepted[i];
      const text = result.slice(c.start, c.end);
      const anchor =
        `<a href="${c.rule.href}"${c.rule.title ? ` title="${escapeAttr(c.rule.title)}"` : ""}` +
        ` class="internal-link">${text}</a>`;
      result = result.slice(0, c.start) + anchor + result.slice(c.end);
      c.rule.used = true;
      linkCount += 1;
    }
    return result;
  });

  return out.join("");
}

/** نرمال‌سازی مسیر برای مقایسه (حذف / انتهایی و انکر) */
function normalizePath(p: string): string {
  const clean = p.split("#")[0].split("?")[0];
  return clean.length > 1 && clean.endsWith("/") ? clean.slice(0, -1) : clean;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}
