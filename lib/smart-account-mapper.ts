// ============================================================================
// lib/smart-account-mapper.ts — موتور نگاشت هوشمند شرح → حساب (Task R14-C)
// ----------------------------------------------------------------------------
// «سند هوشمند»: حسابدار فایل اکسل/CSV (صورتحساب بانک، لیست فروش/خرید، هزینه‌ها
// یا دفتر کل) آپلود می‌کند و هر ردیف باید به یک حساب از کدینگِ همان tenant
// نگاشت شود. این ماژول قواعد کلیدواژه‌ای فارسی را نگه می‌دارد.
//
// طراحی:
//  - خالص (pure) و بدون وابستگی به DB/سرور — تست‌پذیر و مشترک سرور/کلاینت.
//  - هر قاعده: کلیدواژه‌های شرح + الگوی جستجوی نام حساب.
//  - ترتیب قواعد = اولویت (اولین تطبیق برنده است).
//  - اگر هیچ قاعده‌ای نخورد → حساب fallback (موقت/سایر) + پرچم unmapped
//    (خودکار حساب نمی‌سازیم — طبق طراحی R14-C برای بازبینی حسابدار پرچم می‌خورد).
// ============================================================================

export interface AccountLite {
  id: string;
  code: string;
  name: string;
  nature: string; // DEBIT | CREDIT
  groupName?: string;
}

export interface MappingRule {
  /** شناسه پایدار برای override از سمت کلاینت */
  id: string;
  /** برچسب فارسی برای نمایش در UI */
  label: string;
  /** کلیدواژه‌های داخل «شرح» ردیف */
  keywords: string[];
  /** الگوهای جستجو در «نام حساب» کدینگ (نرمال‌شده) */
  accountMatchers: string[];
}

/** نرمال‌سازی متن فارسی: ارقام فارسی/عربی→انگلیسی، ي/ك عربی→فارسی، حذف ZWNJ و علائم */
export function normalizeFa(text: string): string {
  return String(text ?? "")
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\u064a/g, "\u06cc") // ي عربی → ی
    .replace(/\u0643/g, "\u06a9") // ك عربی → ک
    .replace(/[\u0623\u0625\u0622]/g, "\u0627") // أ إ آ → ا
    .replace(/[\u200c\u200f\u200e\u0640]/g, " ") // نیم‌فاصله/جهت‌دهی/کشیده → فاصله
    .replace(/[_\-.,،؛;:()«»"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** نرمال‌سازی مخصوص جستجوی نام حساب (بدون فاصله — «بانک ملی» ≈ «بانکملی») */
function normalizeAccountName(name: string): string {
  return normalizeFa(name).replace(/\s+/g, "");
}

// ============ قواعد نگاشت (به ترتیب اولویت) ============
// محدوده‌های موضوعی پرتکرار حسابداری ایران. هر قاعده حسابی از کدینگ را
// می‌گیرد که نامش با یکی از accountMatcherها «شامل» باشد.
export const MAPPING_RULES: MappingRule[] = [
  {
    id: "payroll",
    label: "حقوق و دستمزد",
    keywords: [
      "حقوق", "دستمزد", "فیش حقوقی", "سنوات", "عیدی", "مزایا",
      "پاداش کارکنان", "بیمه تامین اجتماعی", "بیمه تأمین اجتماعی",
    ],
    accountMatchers: ["حقوق", "دستمزد", "پرسنل", "کارکنان"],
  },
  {
    id: "rent",
    label: "اجاره",
    keywords: ["اجاره", "رهن", "سرقفلی"],
    accountMatchers: ["اجاره"],
  },
  {
    id: "utilities",
    label: "آب و برق و گاز و تلفن",
    keywords: [
      "آب", "برق", "گاز", "تلفن", "اینترنت", "انترنت", "مخابرات",
      "همراه اول", "ایرانسل", "رایتل",
    ],
    accountMatchers: ["آب", "برق", "گاز", "تلفن", "مخابرات", "تاسیسات", "تأسیسات"],
  },
  {
    id: "bank-fees",
    label: "کارمزد بانکی",
    keywords: [
      "کارمزد", "کمیسیون بانک", "انتقال پول", "عوارض انتقال",
      "خدمات بانکی", "شمول",
    ],
    accountMatchers: ["کارمزد", "کمیسیون", "خدمات بانکی"],
  },
  {
    id: "tax",
    label: "مالیات و ارزش افزوده",
    keywords: ["مالیات", "ارزش افزوده", "عوارض"],
    accountMatchers: ["مالیات", "ارزش افزوده"],
  },
  {
    id: "insurance",
    label: "بیمه",
    keywords: ["بیمه", "بیمه ایران", "شخص ثالث"],
    accountMatchers: ["بیمه"],
  },
  {
    id: "sales",
    label: "فروش / درآمد",
    keywords: ["فروش", "فاکتور فروش", "درآمد", "درامد", "صورتحساب فروش"],
    accountMatchers: ["فروش", "درآمد", "درامد", "درآمد عملیات"],
  },
  {
    id: "purchases",
    label: "خرید / بهای تمام‌شده",
    keywords: ["خرید", "فاکتور خرید", "بهای تمام شده", "بهای تمامشده"],
    accountMatchers: ["خرید", "بهای تمام شده", "بهای تمامشده", "بهای کالا"],
  },
  {
    id: "shipping",
    label: "حمل و نقل",
    keywords: ["حمل", "باربری", "ارسال", "پست", "تیپاکس", "ترابری", "فریت"],
    accountMatchers: ["حمل", "باربری", "ترابری", "پست"],
  },
  {
    id: "discount",
    label: "تخفیف",
    keywords: ["تخفیف", "کسورات فروش"],
    accountMatchers: ["تخفیف", "کسورات"],
  },
  {
    id: "office-supplies",
    label: "لوازم اداری و عمومی",
    keywords: [
      "لوازم اداری", "ملزومات", "کاغذ", "جوهر", "مصرفی", "اداری",
      "تنقلات", "نظافت", "پاک کن", "قهوه", "چای",
    ],
    accountMatchers: ["اداری", "عمومی", "مصرفی", "ملزومات"],
  },
  {
    id: "repairs",
    label: "تعمیر و نگهداری",
    keywords: ["تعمیر", "نگهداری", "قطعات یدکی"],
    accountMatchers: ["تعمیر", "نگهداری"],
  },
  {
    id: "marketing",
    label: "تبلیغات و بازاریابی",
    keywords: ["تبلیغ", "بازاریابی", "بنر", "طراحی سایت", "سئو", "گوگل ادز"],
    accountMatchers: ["تبلیغ", "بازاریابی"],
  },
  {
    id: "professional-fees",
    label: "حق‌الزحمه و مشاوره",
    keywords: [
      "حق الزحمه", "حق‌الزحمه", "حقالزحمه", "وکیل", "حسابدار رسمی",
      "مشاوره", "خدمات حسابداری",
    ],
    accountMatchers: ["حق الزحمه", "حقالزحمه", "مشاوره", "وکیل"],
  },
  {
    id: "cash",
    label: "صندوق / نقد",
    keywords: ["صندوق", "نقد", "دریافت نقدی", "پرداخت نقدی"],
    accountMatchers: ["صندوق", "نقد"],
  },
  {
    id: "bank",
    label: "بانک",
    keywords: [
      "بانک", "واریز به حساب", "کارت به کارت", "شبا", "انتقال بانکی",
      "حساب بانکی",
    ],
    accountMatchers: ["بانک"],
  },
  {
    id: "receivable",
    label: "حساب‌های دریافتنی",
    keywords: ["مشتری", "طرف حساب", "طلبکار", "دریافتنی"],
    accountMatchers: ["دریافتنی", "مشتری", "طرف حساب"],
  },
  {
    id: "payable",
    label: "حساب‌های پرداختنی",
    keywords: ["تامین کننده", "تأمین‌کننده", "فروشنده", "پرداختنی", "بستانکار"],
    accountMatchers: ["پرداختنی", "تامین", "تأمین", "فروشنده", "بستانکار", "بدهکاران"],
  },
];

export interface MatchResult {
  /** شناسه قاعده یا null برای unmapped */
  ruleId: string | null;
  ruleLabel: string | null;
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
}

/**
 * جستجوی حسابِ متناظر با قاعده در کدینگ — امتیازدهی توکن‌محور.
 *
 * چرا توکن؟ تطبیق «شامل» خام با کلمات کوتاه خطا می‌دهد: «آب» (→اب) در
 * «حساب‌های» هست و «بهای» پسوندِ «حساب‌های» است! قواعد امتیاز:
 *   ۵ = برابری کامل نام (نرمال بدون فاصله)
 *   ۳ = matcher دقیقاً یک «واژهٔ» نام حساب است (تطبیق مرز واژه)
 *   ۲ = نام حساب شامل عبارت matcher است (فقط matcher ≥ ۴ حرف)
 *   ۱ = matcher شامل نام حساب کوتاه است (فقط نام ≥ ۳ حرف)
 * matcherهای کوتاه (< ۴ حرف) فقط با ۵/۳ تطبیق می‌شوند — نه شامل‌سازی.
 * حساب با بالاترین امتیاز برنده است.
 */
function findAccountByMatchers(
  matchers: string[],
  accounts: AccountLite[]
): AccountLite | null {
  let best: AccountLite | null = null;
  let bestScore = 0;

  for (const acc of accounts) {
    const nameFlat = normalizeAccountName(acc.name); // بدون فاصله
    const tokens = normalizeFa(acc.name)
      .split(" ")
      .filter(Boolean);
    let score = 0;

    for (const matcher of matchers) {
      const mFlat = normalizeAccountName(matcher);
      if (!mFlat) continue;
      const short = mFlat.length < 4;

      // ۵) برابری کامل
      if (nameFlat === mFlat) {
        score = Math.max(score, 5);
        continue;
      }
      // ۳) تطبیق مرز واژه — matcher دقیقاً یکی از واژه‌های نام حساب
      if (tokens.includes(mFlat)) {
        score = Math.max(score, 3);
        continue;
      }
      if (short) continue; // کوتاه — فقط حالت‌های بالا
      // ۲) نام حساب شامل matcher
      if (nameFlat.includes(mFlat)) {
        score = Math.max(score, 2);
        continue;
      }
      // ۱) matcher شامل نامِ کوتاه حساب (مثل matcher «کارمزد بانکی» و حساب «کارمزد»)
      if (nameFlat.length >= 3 && mFlat.includes(nameFlat)) {
        score = Math.max(score, 1);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = acc;
    }
  }
  return best;
}

/**
 * نگاشت شرح یک ردیف به حساب کدینگ — قلب «سند هوشمند».
 * @param description شرح ردیف فایل
 * @param accounts کدینگ حساب‌های tenant
 * @param overrides نگاشت دستی ruleId → accountId از سمت کاربر
 */
export function matchAccount(
  description: string,
  accounts: AccountLite[],
  overrides?: Record<string, string>
): MatchResult {
  const text = normalizeFa(description);
  if (text && accounts.length > 0) {
    // قواعد به ترتیب اولویت — اولین کلیدواژه‌ای که در شرح پیدا شد
    for (const rule of MAPPING_RULES) {
      const overrideId = overrides?.[rule.id];
      const overrideAcc = overrideId
        ? accounts.find((a) => a.id === overrideId) ?? null
        : null;
      const hit = rule.keywords.some((kw) => {
        const nkw = normalizeFa(kw);
        return nkw.length >= 2 && text.includes(nkw);
      });
      if (hit) {
        const acc =
          overrideAcc ?? findAccountByMatchers(rule.accountMatchers, accounts);
        return {
          ruleId: rule.id,
          ruleLabel: rule.label,
          accountId: acc?.id ?? null,
          accountCode: acc?.code ?? null,
          accountName: acc?.name ?? null,
        };
      }
    }
  }
  return {
    ruleId: null,
    ruleLabel: null,
    accountId: null,
    accountCode: null,
    accountName: null,
  };
}

/**
 * یافتن حسابِ متقابل (بانک/صندوق) برای صورتحساب بانکی — حسابی از کدینگ
 * که نامش «بانک» یا «صندوق» داشته باشد. ترتیب: بانکِ هم‌نام با شرح →
 * اولین بانک → صندوق → هیچ.
 */
export function findCounterAccount(
  accounts: AccountLite[],
  descriptionHint?: string
): { account: AccountLite | null; kind: "bank" | "cash" | "none" } {
  if (accounts.length === 0) return { account: null, kind: "none" };
  const hint = descriptionHint ? normalizeAccountName(descriptionHint) : "";
  const banks = accounts.filter((a) => normalizeAccountName(a.name).includes("بانک"));
  // بانکِ مشخص‌شده در شرح (مثل «بانک ملت»)
  if (hint) {
    for (const b of banks) {
      const nb = normalizeAccountName(b.name);
      if (nb.length >= 4 && (nb.includes(hint) || hint.includes(nb))) {
        return { account: b, kind: "bank" };
      }
    }
  }
  if (banks.length > 0) return { account: banks[0], kind: "bank" };
  const cash = accounts.find((a) => {
    const n = normalizeAccountName(a.name);
    return n.includes("صندوق") || n.includes("نقد");
  });
  if (cash) return { account: cash, kind: "cash" };
  return { account: null, kind: "none" };
}

/**
 * یافتن حساب موقت/سایر به‌عنوان fallback — حسابی با نام «موقت»/«سایر»/«متفرقه».
 * اگر نبود null برمی‌گردد تا کاربر در UI انتخاب کند.
 */
export function findFallbackAccount(accounts: AccountLite[]): AccountLite | null {
  return (
    accounts.find((a) => {
      const n = normalizeAccountName(a.name);
      return n.includes("موقت") || n.includes("سایر") || n.includes("متفرقه");
    }) ?? null
  );
}

/** برچسب فارسی قاعده بر اساس شناسه — برای UI */
export function ruleLabelById(id: string | null): string | null {
  if (!id) return null;
  return MAPPING_RULES.find((r) => r.id === id)?.label ?? null;
}
