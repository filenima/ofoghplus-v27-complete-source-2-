// ═══════════════════════════════════════════════════════════════════
// R24-4 — سیستم بلوکی فروشگاه (Gutenberg/Elementor-مانند)
// ثابت‌ها و توابع خالص (بدون Node API) — قابل استفاده در سرور و کلاینت.
// هر صفحهٔ فروشگاه = فهرست مرتبی از «بلوک»ها با پراپ‌های ویرایش‌پذیر.
// ساختار در Storefront.blocksJson (منتشرشده) و blocksDraftJson (پیش‌نویس)
// ذخیره می‌شود؛ تاریخچه در مدل StorefrontRevision.
// ═══════════════════════════════════════════════════════════════════

// ─── انواع بلوک ───
export type SfBlockType =
  | "hero"
  | "banner"
  | "products-grid"
  | "categories"
  | "featured-products"
  | "testimonials"
  | "faq"
  | "gallery"
  | "map"
  | "contact"
  | "rich-text"
  | "countdown-timer"
  | "video"
  | "cta-banner"
  | "custom-html"
  | "spacer"
  | "divider";

export interface SfBlockStyle {
  /** پس‌زمینه: "" (شفاف) | surface | muted | primary-soft | dark | aurora-mesh | hex */
  bgColor: string;
  /** رنگ متن: default | light | dark */
  textColor: "default" | "light" | "dark";
  /** رنگ لهجه (hex) — خالی یعنی رنگ برند قالب */
  accent: string;
  /** فاصله بالا/پایین (px ۰ تا ۱۲۸) */
  paddingTop: number;
  paddingBottom: number;
  /** عرض محتوا */
  maxWidth: "full" | "wide" | "boxed";
  /** گردی گوشه‌ها (px ۰ تا ۳۲) */
  radius: number;
}

export interface SfBlock {
  id: string;
  type: SfBlockType;
  /** عنوان مدیریتی (فقط در ویرایشگر دیده می‌شود) */
  title: string;
  visible: boolean;
  style: Partial<SfBlockStyle>;
  props: Record<string, unknown>;
}

export interface SfBlocksDoc {
  version: 1;
  blocks: SfBlock[];
}

// ─── اسکیمای فیلدهای پنل تنظیمات ───
export type SfFieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "switch"
  | "color"
  | "image"
  | "video"
  | "slider"
  | "datetime"
  | "link"
  | "list";

export interface SfFieldDef {
  key: string;
  label: string;
  type: SfFieldType;
  placeholder?: string;
  hint?: string;
  dir?: "rtl" | "ltr";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  /** برای list: فیلدهای هر آیتم */
  itemFields?: SfFieldDef[];
  maxItems?: number;
  defaultItem?: Record<string, unknown>;
  /** گروه نمایش در پنل */
  group?: string;
}

export interface SfBlockDef {
  type: SfBlockType;
  label: string;
  description: string;
  icon: string; // کلید آیکون lucide — نگاشت در block-icons.tsx
  category: "ساختار" | "محتوا" | "فروش" | "رسانه" | "پیشرفته";
  defaultProps: Record<string, unknown>;
  defaultStyle?: Partial<SfBlockStyle>;
  fields: SfFieldDef[];
}

// ─── رنگ‌های آمادهٔ پس‌زمینه (برای پنل انتخاب رنگ) ───
export const SF_BG_PRESETS: { value: string; label: string; className: string }[] = [
  { value: "", label: "شفاف (پس‌زمینهٔ قالب)", className: "bg-white border border-dashed border-border" },
  { value: "surface", label: "سطح کارت", className: "bg-white border border-border" },
  { value: "muted", label: "خاکستری ملایم", className: "bg-zinc-100 border border-zinc-200" },
  { value: "primary-soft", label: "سبز برند (ملایم)", className: "bg-emerald-50 border border-emerald-200" },
  { value: "dark", label: "تیرهٔ لوکس", className: "bg-zinc-900 border border-zinc-700" },
  { value: "aurora-mesh", label: "شبکهٔ آرورا (گرادیان متحرک)", className: "bg-gradient-to-br from-emerald-400 via-teal-400 to-cyan-400" },
  { value: "gold-soft", label: "طلایی ملایم", className: "bg-gradient-to-br from-amber-100 to-yellow-50 border border-amber-300" },
];

// ─── ثبت تعریف بلوک‌ها ───
const LINK_FIELDS_HINT = "لینک کامل https یا لنگر داخلی مثل #products";

export const SF_BLOCK_DEFS: SfBlockDef[] = [
  {
    type: "hero",
    label: "قهرمان (هیرو)",
    description: "بنر تمام‌صفحهٔ ابتدای سایت با تیتر درشت و دکمه‌های اقدام",
    icon: "layout-template",
    category: "ساختار",
    defaultProps: {
      badge: "فروش ویژهٔ این هفته",
      title: "به فروشگاه ما خوش آمدید",
      subtitle: "کیفیت برتر، قیمت منصفانه و ارسال سریع به سراسر کشور",
      ctaLabel: "مشاهدهٔ محصولات",
      ctaLink: "#products",
      cta2Label: "تماس با ما",
      cta2Link: "#contact",
      image: "/banners/general.avif",
      overlay: 45,
      height: "lg",
      align: "center",
    },
    defaultStyle: { bgColor: "dark", textColor: "light", paddingTop: 64, paddingBottom: 64 },
    fields: [
      { key: "badge", label: "بج بالای تیتر", type: "text", group: "محتوا" },
      { key: "title", label: "تیتر اصلی", type: "text", group: "محتوا" },
      { key: "subtitle", label: "زیرتیتر", type: "textarea", group: "محتوا" },
      { key: "ctaLabel", label: "متن دکمهٔ اصلی", type: "text", group: "محتوا" },
      { key: "ctaLink", label: "لینک دکمهٔ اصلی", type: "link", hint: LINK_FIELDS_HINT, dir: "ltr", group: "محتوا" },
      { key: "cta2Label", label: "متن دکمهٔ دوم", type: "text", group: "محتوا" },
      { key: "cta2Link", label: "لینک دکمهٔ دوم", type: "link", hint: LINK_FIELDS_HINT, dir: "ltr", group: "محتوا" },
      { key: "image", label: "تصویر پس‌زمینه", type: "image", group: "رسانه" },
      { key: "overlay", label: "تیرگی روکش تصویر (٪)", type: "slider", min: 0, max: 90, step: 5, group: "رسانه" },
      { key: "height", label: "ارتفاع", type: "select", group: "رسانه", options: [
        { value: "sm", label: "کوتاه" }, { value: "md", label: "متوسط" }, { value: "lg", label: "بلند" },
      ] },
      { key: "align", label: "چیدمان متن", type: "select", group: "رسانه", options: [
        { value: "start", label: "راست‌چین" }, { value: "center", label: "وسط‌چین" },
      ] },
    ],
  },
  {
    type: "banner",
    label: "بنر تصویری",
    description: "تصویر تبلیغاتی با لینک — یا اسلایدر سینمایی چنداسلایده",
    icon: "image",
    category: "رسانه",
    defaultProps: {
      image: "/banners/general.avif",
      title: "پیشنهاد ویژه",
      link: "#products",
      height: "md",
      openNewTab: false,
      slides: [],
    },
    fields: [
      { key: "image", label: "تصویر بنر", type: "image", group: "محتوا" },
      { key: "title", label: "متن جایگزین (سئو)", type: "text", group: "محتوا" },
      { key: "link", label: "لینک کلیک", type: "link", hint: LINK_FIELDS_HINT, dir: "ltr", group: "محتوا" },
      // Task 3-a — اسلایدهای چرخشی: با افزودن حداقل یک اسلاید، بنر به کاروسل سینمایی تبدیل می‌شود
      {
        key: "slides",
        label: "اسلایدهای چرخشی (کاروسل سینمایی)",
        type: "list",
        maxItems: 8,
        group: "محتوا",
        defaultItem: { image: "", title: "", subtitle: "", badge: "", ctaLabel: "", ctaLink: "#products" },
        itemFields: [
          { key: "title", label: "تیتر اسلاید", type: "text", placeholder: "مثلاً: جشنوارهٔ فروش پاییزی" },
          { key: "image", label: "تصویر اسلاید", type: "image" },
          { key: "subtitle", label: "زیرتیتر", type: "textarea", placeholder: "توضیح کوتاه روی اسلاید (اختیاری)" },
          { key: "badge", label: "بج (نشان کوچک)", type: "text", placeholder: "مثلاً: جدید" },
          { key: "ctaLabel", label: "متن دکمه", type: "text", placeholder: "مثلاً: مشاهدهٔ محصولات" },
          { key: "ctaLink", label: "لینک دکمه", type: "link", dir: "ltr" },
        ],
      },
      { key: "height", label: "ارتفاع", type: "select", group: "چیدمان", options: [
        { value: "sm", label: "کوتاه" }, { value: "md", label: "متوسط" }, { value: "lg", label: "بلند" },
      ] },
      { key: "openNewTab", label: "باز شدن در تب جدید", type: "switch", group: "چیدمان" },
    ],
  },
  {
    type: "products-grid",
    label: "شبکهٔ محصولات",
    description: "نمایش کالاهای فروشگاه با فیلتر و جستجوی هوشمند",
    icon: "layout-grid",
    category: "فروش",
    defaultProps: {
      title: "محصولات ما",
      source: "all",
      category: "",
      count: 8,
      columns: 4,
      showPrice: true,
      showStock: true,
      showSearch: true,
      showRating: true,
      cardStyle: "premium",
    },
    fields: [
      { key: "title", label: "عنوان بخش", type: "text", group: "محتوا" },
      { key: "source", label: "منبع کالاها", type: "select", group: "محتوا", options: [
        { value: "all", label: "همهٔ کالاها" },
        { value: "category", label: "دستهٔ مشخص" },
        { value: "sale", label: "فقط تخفیف‌دارها" },
        { value: "newest", label: "جدیدترین‌ها" },
      ] },
      { key: "category", label: "نام دسته (وقتی منبع=دسته)", type: "text", group: "محتوا" },
      { key: "count", label: "تعداد نمایش", type: "slider", min: 4, max: 24, step: 4, group: "چیدمان" },
      { key: "columns", label: "ستون (دسکتاپ)", type: "slider", min: 2, max: 5, step: 1, group: "چیدمان" },
      { key: "cardStyle", label: "سبک کارت کالا", type: "select", group: "چیدمان", options: [
        { value: "classic", label: "کلاسیک" },
        { value: "premium", label: "پرمیوم (شیشه‌ای با افکت سه‌بعدی)" },
      ] },
      { key: "showSearch", label: "نمایش نوار جستجو/فیلتر", type: "switch", group: "چیدمان" },
      { key: "showPrice", label: "نمایش قیمت", type: "switch", group: "چیدمان" },
      { key: "showStock", label: "نمایش وضعیت موجودی", type: "switch", group: "چیدمان" },
      { key: "showRating", label: "نمایش امتیاز نظرات", type: "switch", group: "چیدمان" },
    ],
  },
  {
    type: "categories",
    label: "دسته‌بندی‌ها",
    description: "کاشی‌های دستهٔ کالاها با شمارنده",
    icon: "folder-grid",
    category: "فروش",
    defaultProps: { title: "دسته‌بندی‌ها", style: "mosaic", count: 8, linkTo: "#products" },
    fields: [
      { key: "title", label: "عنوان بخش", type: "text", group: "محتوا" },
      { key: "style", label: "سبک نمایش", type: "select", group: "چیدمان", options: [
        { value: "mosaic", label: "موزاییک (کاشی‌های چنداندازه)" },
        { value: "cards", label: "کارت‌های یکنواخت" },
        { value: "chips", label: "چیپ‌های فشرده" },
      ] },
      { key: "count", label: "حداکثر دسته", type: "slider", min: 3, max: 12, step: 1, group: "چیدمان" },
    ],
  },
  {
    type: "featured-products",
    label: "کالاهای شاخص",
    description: "ردیف اسکرولی کالاهای منتخب با کارت‌های پهن",
    icon: "star",
    category: "فروش",
    defaultProps: { title: "پیشنهاد ویژهٔ فروشگاه", count: 10, source: "sale" },
    fields: [
      { key: "title", label: "عنوان بخش", type: "text", group: "محتوا" },
      { key: "source", label: "منبع", type: "select", group: "محتوا", options: [
        { value: "sale", label: "تخفیف‌دارها" },
        { value: "newest", label: "جدیدترین‌ها" },
        { value: "all", label: "همه" },
      ] },
      { key: "count", label: "تعداد", type: "slider", min: 4, max: 20, step: 2, group: "چیدمان" },
    ],
  },
  {
    type: "testimonials",
    label: "نظرات مشتریان",
    description: "کارت‌های نقل‌قول مشتریان با ستاره",
    icon: "quote",
    category: "محتوا",
    defaultProps: {
      title: "مشتریان چه می‌گویند",
      items: [
        { name: "مریم احمدی", role: "مشتری ثابت", text: "کیفیت محصولات عالی بود و سفارشم زودتر از موعد رسید. حتماً باز هم خرید می‌کنم.", rating: 5 },
        { name: "علی رضایی", role: "خریدار عمده", text: "قیمت‌ها منصفانه و پشتیبانی پاسخگو است. برای کسب‌وکارمان همیشه از همین‌جا تهیه می‌کنیم.", rating: 5 },
        { name: "زهرا کریمی", role: "مشتری", text: "بسته‌بندی خیلی مرتب و حرفه‌ای بود. از خریدم کاملاً راضی‌ام.", rating: 4 },
      ],
    },
    fields: [
      { key: "title", label: "عنوان بخش", type: "text", group: "محتوا" },
      {
        key: "items", label: "نظرها", type: "list", maxItems: 9, group: "محتوا",
        defaultItem: { name: "", role: "", text: "", rating: 5 },
        itemFields: [
          { key: "name", label: "نام مشتری", type: "text" },
          { key: "role", label: "عنوان/نقش", type: "text" },
          { key: "text", label: "متن نظر", type: "textarea" },
          { key: "rating", label: "امتیاز (۱ تا ۵)", type: "slider", min: 1, max: 5, step: 1 },
        ],
      },
    ],
  },
  {
    type: "faq",
    label: "پرسش‌های متداول",
    description: "آکاردئون سؤال و جواب — خوب برای سئو",
    icon: "help-circle",
    category: "محتوا",
    defaultProps: {
      title: "پرسش‌های متداول",
      items: [
        { q: "زمان ارسال سفارش چقدر است؟", a: "سفارش‌های ثبت‌شده تا ساعت ۱۴، همان روز و بقیه روز بعد ارسال می‌شوند." },
        { q: "امکان مرجوعی وجود دارد؟", a: "بله — تا ۷ روز پس از دریافت، در صورت سالم بودن بسته‌بندی امکان مرجوعی هست." },
        { q: "چطور پرداخت کنم؟", a: "پرداخت کارت‌به‌کارت و آنلاین (درگاه امن) پشتیبانی می‌شود." },
      ],
    },
    fields: [
      { key: "title", label: "عنوان بخش", type: "text", group: "محتوا" },
      {
        key: "items", label: "پرسش‌ها", type: "list", maxItems: 12, group: "محتوا",
        defaultItem: { q: "", a: "" },
        itemFields: [
          { key: "q", label: "پرسش", type: "text" },
          { key: "a", label: "پاسخ", type: "textarea" },
        ],
      },
    ],
  },
  {
    type: "gallery",
    label: "گالری تصاویر",
    description: "شبکهٔ تصاویر فروشگاه/محصولات",
    icon: "images",
    category: "رسانه",
    defaultProps: {
      title: "گالری",
      images: ["/banners/general.avif", "/banners/grocery.avif", "/banners/electronics.avif", "/banners/fashion.avif"],
      columns: 4,
      gap: 2,
    },
    fields: [
      { key: "title", label: "عنوان بخش", type: "text", group: "محتوا" },
      { key: "images", label: "تصاویر", type: "list", maxItems: 16, group: "محتوا", defaultItem: { src: "" }, itemFields: [
        { key: "src", label: "آدرس تصویر", type: "image" },
      ] },
      { key: "columns", label: "ستون‌ها", type: "slider", min: 2, max: 6, step: 1, group: "چیدمان" },
      { key: "gap", label: "فاصله (px)", type: "slider", min: 0, max: 5, step: 1, group: "چیدمان" },
    ],
  },
  {
    type: "map",
    label: "نقشهٔ موقعیت",
    description: "نقشهٔ تعاملی محل فروشگاه (اگر مختصات ثبت شده باشد)",
    icon: "map-pin",
    category: "ساختار",
    defaultProps: { title: "ما اینجا هستیم", height: 320 },
    fields: [
      { key: "title", label: "عنوان بخش", type: "text", group: "محتوا" },
      { key: "height", label: "ارتفاع (px)", type: "slider", min: 200, max: 520, step: 20, group: "چیدمان" },
    ],
  },
  {
    type: "contact",
    label: "اطلاعات تماس",
    description: "تلفن، آدرس، شبکه‌های اجتماعی و ساعات کاری",
    icon: "phone",
    category: "محتوا",
    defaultProps: {
      title: "تماس با ما",
      showPhone: true,
      showAddress: true,
      showSocials: true,
      hours: "شنبه تا پنجشنبه — ۹ صبح تا ۸ شب",
    },
    fields: [
      { key: "title", label: "عنوان بخش", type: "text", group: "محتوا" },
      { key: "hours", label: "ساعات پاسخگویی", type: "text", group: "محتوا" },
      { key: "showPhone", label: "نمایش تلفن", type: "switch", group: "چیدمان" },
      { key: "showAddress", label: "نمایش آدرس", type: "switch", group: "چیدمان" },
      { key: "showSocials", label: "نمایش شبکه‌های اجتماعی", type: "switch", group: "چیدمان" },
    ],
  },
  {
    type: "rich-text",
    label: "متن غنی",
    description: "بلوک متن/HTML دربارهٔ ما و متون آزاد",
    icon: "file-text",
    category: "محتوا",
    defaultProps: {
      title: "دربارهٔ ما",
      html: "<p>این متن را از پنل تنظیمات ویرایش کنید. می‌توانید از <strong>متن پرنگ</strong> و فهرست استفاده کنید.</p>",
    },
    fields: [
      { key: "title", label: "عنوان بخش", type: "text", group: "محتوا" },
      { key: "html", label: "متن (HTML ساده)", type: "textarea", dir: "rtl", hint: "تگ‌های مجاز: p, strong, em, ul, li, a, br, h3, h4", group: "محتوا" },
    ],
  },
  {
    type: "countdown-timer",
    label: "شمارش معکوس فروش",
    description: "تایمر پویا تا پایان پیشنهاد ویژه + کالاهای تخفیف‌دار",
    icon: "timer",
    category: "فروش",
    defaultProps: {
      title: "پایان جشنوارهٔ تخفیف",
      endsAt: "",
      ctaLabel: "همین حالا بخرید",
      ctaLink: "#products",
      showProducts: true,
      count: 4,
    },
    fields: [
      { key: "title", label: "عنوان کمپین", type: "text", group: "محتوا" },
      { key: "endsAt", label: "زمان پایان", type: "datetime", hint: "تاریخ و ساعت پایان تخفیف", group: "محتوا" },
      { key: "ctaLabel", label: "متن دکمه", type: "text", group: "محتوا" },
      { key: "ctaLink", label: "لینک دکمه", type: "link", hint: LINK_FIELDS_HINT, dir: "ltr", group: "محتوا" },
      { key: "showProducts", label: "نمایش کالاهای تخفیف‌دار", type: "switch", group: "چیدمان" },
      { key: "count", label: "تعداد کالا", type: "slider", min: 2, max: 8, step: 2, group: "چیدمان" },
    ],
  },
  {
    type: "video",
    label: "ویدیو",
    description: "ویدیوی معرفی — لینک آپارات/یوتیوب یا آپلود مستقیم MP4",
    icon: "video",
    category: "رسانه",
    defaultProps: {
      title: "ویدیوی معرفی فروشگاه",
      url: "",
      poster: "",
      caption: "",
      aspect: "16/9",
    },
    fields: [
      { key: "title", label: "عنوان بخش", type: "text", group: "محتوا" },
      {
        key: "url",
        label: "آدرس ویدیو",
        type: "video",
        dir: "ltr",
        hint: "لینک معمولی آپارات (aparat.com/v/…) یا یوتیوب (youtube.com/watch?v=… یا youtu.be/…) خودکار به embed تبدیل می‌شود؛ یا فایل MP4/WebM خود را آپلود کنید",
        group: "محتوا",
      },
      { key: "poster", label: "تصویر کاور ویدیو (اختیاری — فقط برای فایل آپلودی)", type: "image", group: "محتوا" },
      { key: "caption", label: "توضیح زیر ویدیو", type: "text", group: "محتوا" },
      { key: "aspect", label: "نسبت تصویر", type: "select", group: "چیدمان", options: [
        { value: "16/9", label: "عریض ۱۶:۹" }, { value: "4/3", label: "کلاسیک ۴:۳" }, { value: "1/1", label: "مربع ۱:۱" },
      ] },
    ],
  },
  {
    type: "cta-banner",
    label: "بنر دعوت به اقدام",
    description: "نوار گرادیانی جذاب با دکمه — برای هدایت مشتری",
    icon: "megaphone",
    category: "ساختار",
    defaultProps: {
      title: "امروز سفارش خود را ثبت کنید",
      text: "ارسال سریع، پرداخت امن و پشتیبانی پاسخگو — همین حالا تجربه کنید.",
      ctaLabel: "ثبت سفارش",
      ctaLink: "#products",
      tone: "brand",
    },
    defaultStyle: { paddingTop: 48, paddingBottom: 48 },
    fields: [
      { key: "title", label: "تیتر", type: "text", group: "محتوا" },
      { key: "text", label: "متن توضیح", type: "textarea", group: "محتوا" },
      { key: "ctaLabel", label: "متن دکمه", type: "text", group: "محتوا" },
      { key: "ctaLink", label: "لینک دکمه", type: "link", hint: LINK_FIELDS_HINT, dir: "ltr", group: "محتوا" },
      { key: "tone", label: "حال‌وهوا", type: "select", group: "چیدمان", options: [
        { value: "brand", label: "گرادیان برند (زمردی)" },
        { value: "gold", label: "طلایی لوکس" },
        { value: "dark", label: "تیرهٔ مات" },
        { value: "outline", label: "خطی ساده" },
      ] },
    ],
  },
  {
    type: "custom-html",
    label: "HTML سفارشی",
    description: "کد HTML دلخواه (تگ‌های امن) — برای طرح‌های خاص",
    icon: "code",
    category: "پیشرفته",
    defaultProps: { html: '<div style="text-align:center;padding:16px">کد HTML دلخواه خود را اینجا بگذارید</div>' },
    fields: [
      { key: "html", label: "کد HTML", type: "textarea", dir: "ltr", hint: "تگ‌های مجاز: div, span, p, strong, em, a, img, ul, li, br, h3, h4, table, tr, td", group: "محتوا" },
    ],
  },
  {
    type: "spacer",
    label: "فاصله‌ساز",
    description: "فضای خالی عمودی بین بخش‌ها",
    icon: "stretch-vertical",
    category: "پیشرفته",
    defaultProps: { height: 48 },
    fields: [
      { key: "height", label: "ارتفاع (px)", type: "slider", min: 8, max: 200, step: 4, group: "چیدمان" },
    ],
  },
  {
    type: "divider",
    label: "جداکننده",
    description: "خط جداکنندهٔ تزیینی",
    icon: "minus",
    category: "پیشرفته",
    defaultProps: { style: "fancy", width: 240 },
    fields: [
      { key: "style", label: "سبک", type: "select", group: "چیدمان", options: [
        { value: "solid", label: "خط ساده" },
        { value: "dashed", label: "خط‌چین" },
        { value: "fancy", label: "تزیینی (لوزی طلایی)" },
      ] },
      { key: "width", label: "عرض (px)", type: "slider", min: 60, max: 640, step: 20, group: "چیدمان" },
    ],
  },
];

export const SF_BLOCK_DEFS_BY_TYPE: Record<SfBlockType, SfBlockDef> = Object.fromEntries(
  SF_BLOCK_DEFS.map((d) => [d.type, d])
) as Record<SfBlockType, SfBlockDef>;

export const SF_BLOCK_TYPES = SF_BLOCK_DEFS.map((d) => d.type);

// ─── ساخت بلوک جدید با مقادیر پیش‌فرض ───
let blockSeq = 0;
export function newBlockId(): string {
  blockSeq += 1;
  return `blk-${Date.now().toString(36)}-${blockSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createBlock(type: SfBlockType, overrides?: Partial<Record<string, unknown>>): SfBlock {
  const def = SF_BLOCK_DEFS_BY_TYPE[type];
  if (!def) {
    return { id: newBlockId(), type: "spacer", title: "فاصله‌ساز", visible: true, style: {}, props: { height: 32 } };
  }
  return {
    id: newBlockId(),
    type,
    title: def.label,
    visible: true,
    style: { ...(def.defaultStyle ?? {}) },
    props: { ...def.defaultProps, ...(overrides ?? {}) },
  };
}

/** چیدمان آغازین پیشنهادی برای فروشگاه تازه */
export function buildDefaultBlocks(shopTitle: string, city?: string | null): SfBlocksDoc {
  return {
    version: 1,
    blocks: [
      createBlock("hero", {
        title: `${shopTitle} — قهرمان`,
        badge: "فروش ویژهٔ این هفته",
        title: `${shopTitle}`,
        subtitle: city ? `خرید آنلاین از ${shopTitle} در ${city} — ارسال سریع و مطمئن` : "خرید آنلاین با ارسال سریع و مطمئن",
      }),
      createBlock("categories", { title: "دسته‌بندی‌های فروشگاه" }),
      createBlock("featured-products", { title: "پیشنهاد ویژهٔ امروز" }),
      createBlock("products-grid", { title: "همهٔ محصولات" }),
      createBlock("cta-banner"),
      createBlock("testimonials"),
      createBlock("faq"),
      createBlock("map"),
      createBlock("contact"),
    ],
  };
}

// ─── اعتبارسنجی/پاک‌سازی (سمت سرور قبل از ذخیره) ───

const SAFE_LINK_RE = /^(https?:\/\/[^\s]+|#[\w\u0600-\u06FF-]*|\/[\w\-./%]*)$/i;
const SAFE_IMG_RE = /^(https?:\/\/[^\s]+|\/(?:banners|uploads)\/[\w\-./%]+)$/i;

function sanitizeLink(raw: unknown, fallback = "#"): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s && SAFE_LINK_RE.test(s) ? s.slice(0, 500) : fallback;
}

function sanitizeImage(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s && SAFE_IMG_RE.test(s) ? s.slice(0, 600) : "";
}

function clampNum(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function sanitizeText(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "";
}

/** پاک‌سازی عمیق یک SfBlocksDoc خام (از کلاینت) — خروجی همیشه معتبر است */
export function sanitizeBlocksDoc(raw: unknown): SfBlocksDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as { blocks?: unknown; version?: unknown };
  if (!Array.isArray(b.blocks)) return null;
  if (b.blocks.length > 40) return null; // سقف ۴۰ بلوک

  const blocks: SfBlock[] = [];
  for (const item of b.blocks) {
    if (!item || typeof item !== "object") continue;
    const blk = item as Record<string, unknown>;
    const type = String(blk.type ?? "") as SfBlockType;
    const def = SF_BLOCK_DEFS_BY_TYPE[type];
    if (!def) continue;

    const rawProps = (blk.props && typeof blk.props === "object" ? blk.props : {}) as Record<string, unknown>;
    const props: Record<string, unknown> = {};

    for (const field of def.fields) {
      const v = rawProps[field.key];
      switch (field.type) {
        case "text":
        case "textarea": {
          const max = field.type === "text" ? 300 : 20000;
          props[field.key] = sanitizeText(v, max);
          break;
        }
        case "link":
          props[field.key] = sanitizeLink(v, "#");
          break;
        case "video": {
          // لینک ویدیو مثل link ولی fallback خالی (بدون لنگر بی‌معنا)
          const raw = typeof v === "string" ? v.trim() : "";
          props[field.key] = raw && SAFE_LINK_RE.test(raw) ? raw.slice(0, 600) : "";
          break;
        }
        case "image": {
          if (field.key === "images" || field.key === "html") {
            props[field.key] = v; // list/html جداً مدیریت می‌شود
            break;
          }
          props[field.key] = sanitizeImage(v) || (typeof def.defaultProps[field.key] === "string" ? String(def.defaultProps[field.key]) : "");
          break;
        }
        case "number":
        case "slider":
          props[field.key] = clampNum(v, field.min ?? 0, field.max ?? 9999, Number(def.defaultProps[field.key] ?? 0));
          break;
        case "select": {
          const allowed = (field.options ?? []).map((o) => o.value);
          const s = String(v ?? "");
          props[field.key] = allowed.includes(s) ? s : String(def.defaultProps[field.key] ?? allowed[0] ?? "");
          break;
        }
        case "switch":
          props[field.key] = typeof v === "boolean" ? v : Boolean(def.defaultProps[field.key]);
          break;
        case "datetime": {
          const s = typeof v === "string" ? v.trim() : "";
          if (!s) {
            props[field.key] = "";
          } else {
            const d = new Date(s);
            props[field.key] = Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
          }
          break;
        }
        case "list": {
          if (!Array.isArray(v)) {
            props[field.key] = Array.isArray(def.defaultProps[field.key]) ? def.defaultProps[field.key] : [];
            break;
          }
          const items = v
            .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
            .slice(0, field.maxItems ?? 12)
            .map((it) => {
              const clean: Record<string, unknown> = {};
              for (const sub of field.itemFields ?? []) {
                const sv = it[sub.key];
                if (sub.type === "slider" || sub.type === "number") clean[sub.key] = clampNum(sv, sub.min ?? 0, sub.max ?? 99, 1);
                else if (sub.type === "switch") clean[sub.key] = Boolean(sv);
                else if (sub.type === "image") clean[sub.key] = sanitizeImage(sv);
                else if (sub.type === "link") clean[sub.key] = sanitizeLink(sv);
                else clean[sub.key] = sanitizeText(sv, sub.type === "textarea" ? 2000 : 300);
              }
              return clean;
            })
            .filter((it) => Object.values(it).some((x) => typeof x === "string" ? x.trim() !== "" : true));
          props[field.key] = items;
          break;
        }
        default:
          break;
      }
    }

    // فیلدهای خاص بدون اسکیما
    if (type === "rich-text" || type === "custom-html") {
      props.html = sanitizeText(rawProps.html, 20000);
    }

    const rawStyle = (blk.style && typeof blk.style === "object" ? blk.style : {}) as Record<string, unknown>;
    const style: Partial<SfBlockStyle> = {
      bgColor: sanitizeText(rawStyle.bgColor, 40),
      textColor: rawStyle.textColor === "light" || rawStyle.textColor === "dark" ? rawStyle.textColor : "default",
      accent: /^#[0-9a-fA-F]{6}$/.test(String(rawStyle.accent ?? "")) ? String(rawStyle.accent) : "",
      paddingTop: clampNum(rawStyle.paddingTop, 0, 128, (def.defaultStyle?.paddingTop ?? 24)),
      paddingBottom: clampNum(rawStyle.paddingBottom, 0, 128, (def.defaultStyle?.paddingBottom ?? 24)),
      maxWidth: rawStyle.maxWidth === "full" || rawStyle.maxWidth === "boxed" ? rawStyle.maxWidth : "wide",
      radius: clampNum(rawStyle.radius, 0, 32, 16),
    };

    blocks.push({
      id: typeof blk.id === "string" && blk.id.length <= 60 ? blk.id : newBlockId(),
      type,
      title: sanitizeText(blk.title, 80) || def.label,
      visible: blk.visible === false ? false : true,
      style,
      props,
    });
  }

  if (blocks.length === 0) return null;
  return { version: 1, blocks };
}

/** تجزیهٔ امن blocksJson ذخیره‌شده — خطا = null */
export function parseBlocksDoc(raw: string | null | undefined): SfBlocksDoc | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.blocks)) return null;
    return parsed as SfBlocksDoc;
  } catch {
    return null;
  }
}

/** آیا بلوک ویدیو آدرس امن embed دارد؟ (فقط https و بدون javascript:) */
export function safeVideoEmbedUrl(url: string): string | null {
  const s = String(url ?? "").trim();
  if (!s || !/^https:\/\//i.test(s)) return null;
  if (s.includes("javascript:") || s.includes('"') || s.includes("<")) return null;
  return s.slice(0, 600);
}

/** آیا آدرس، فایل ویدیوی مستقیم است؟ (آپلود مالک — با تگ <video> پخش می‌شود) */
export function isDirectVideoUrl(url: string): boolean {
  const s = String(url ?? "").trim().toLowerCase();
  return (
    /\.(mp4|webm|ogv|ogg|mov|m4v)$/i.test(s) ||
    s.startsWith("/uploads/storefront/") && /\.(mp4|webm|ogv|ogg|mov|m4v)$/.test(s)
  );
}

/**
 * R26 — نرمال‌سازی آدرس ویدیو برای پخش:
 *  - لینک معمولی آپارات (aparat.com/v/HASH یا /video/video/embed/...) → embed رسمی
 *  - لینک معمولی یوتیوب (watch?v=، youtu.be/، /shorts/) → embed رسمی
 *  - فایل مستقیم (mp4/webm/آپلودی) → دست‌نخورده (با <video> پخش می‌شود)
 *  - بقیه (embed آماده، https دلخواه) → همان ورودی
 */
export function normalizeVideoEmbedUrl(url: string): string {
  const s = String(url ?? "").trim();
  if (!s) return "";
  // فایل مستقیم؟
  if (isDirectVideoUrl(s)) return s;
  // بدون پروتکل → https بگذار
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  let u: URL;
  try {
    u = new URL(withProto);
  } catch {
    return s;
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  // ── آپارات ──
  if (host === "aparat.com" || host.endsWith(".aparat.com")) {
    // embed رسمی از قبل؟
    const m = u.pathname.match(/\/v\/([A-Za-z0-9]+)/);
    if (m) return `https://www.aparat.com/video/video/embed/videohash/${m[1]}/vt/frame`;
    return withProto;
  }
  // ── یوتیوب ──
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id ? `https://www.youtube.com/embed/${id}` : withProto;
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com")) {
    if (u.pathname === "/watch") {
      const id = u.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : withProto;
    }
    const shorts = u.pathname.match(/\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]+)/);
    if (shorts) return `https://www.youtube.com/embed/${shorts[1]}`;
  }
  return withProto;
}
