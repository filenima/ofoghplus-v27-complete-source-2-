"use client";

// ═══════════════════════════════════════════════════════════════════
// Task 1-b — موتور جستجو/فیلتر/صفحه‌بندی سمت سرور برای فروشگاه عمومی
// هوک useStoreProducts: state فیلترها + fetch از /api/storefront/[slug]/products
// با debounce جستجو (۳۰۰ms)، همگام‌سازی URL (قابل اشتراک‌گذاری) و فاسِت‌ها.
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import type { StorefrontProductDTO } from "@/lib/storefront";

export type StorefrontSortMode = "newest" | "cheapest" | "expensive" | "name";

export interface StorefrontFacets {
  categories: { name: string; count: number }[];
  price: { min: number | null; max: number | null }; // تومان
  inStock: number;
  totalAll: number;
}

export interface StorefrontDiscovery {
  /** کالاهای صفحهٔ فعلی */
  products: StorefrontProductDTO[];
  total: number;
  page: number;
  pages: number;
  loading: boolean;
  facets: StorefrontFacets | null;
  /** دسته‌ها (از فاسِت سرور یا محاسبهٔ اولیه) */
  categories: { name: string; count: number }[];

  // جستجو — مقدار ورودی فوری به‌روز می‌شود، fetch با debounce انجام می‌شود
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;

  selectedCategory: string | null;
  onSelectCategory: (c: string | null) => void;

  // بازهٔ قیمت (تومان) — رشته‌های ورودی کاربر + مقادیر اعمال‌شده
  priceInput: { min: string; max: string };
  onPriceInputChange: (min: string, max: string) => void;
  applyPriceRange: () => void;
  clearPriceRange: () => void;
  priceApplied: { min: string; max: string };

  inStockOnly: boolean;
  onInStockOnlyChange: (v: boolean) => void;

  sortMode: StorefrontSortMode;
  onSortModeChange: (m: StorefrontSortMode) => void;

  setPage: (p: number) => void;
  /** حذف همهٔ فیلترها */
  reset: () => void;
  activeFilterCount: number;
  /** آیا در حال حاضر فیلتری فعال است */
  hasActiveFilters: boolean;
}

interface ProductsResponse {
  success: boolean;
  products: StorefrontProductDTO[];
  total: number;
  page: number;
  pages: number;
  facets: StorefrontFacets;
}

const SORTS: StorefrontSortMode[] = ["newest", "cheapest", "expensive", "name"];

/** کلیدهای URL متعلق به دیسکاوری — بقیه (مثل edit=1 مالک) باید حفظ شوند */
const DISCOVERY_URL_KEYS = new Set(["q", "cat", "min", "max", "inStock", "sort", "page"]);

interface InitialData {
  products: StorefrontProductDTO[];
  categories?: { name: string; count: number }[];
}

function buildQueryString(state: {
  q: string;
  cat: string | null;
  min: string;
  max: string;
  inStock: boolean;
  sort: StorefrontSortMode;
  page: number;
}): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.cat) params.set("cat", state.cat);
  const min = state.min.replace(/[^\d]/g, "");
  const max = state.max.replace(/[^\d]/g, "");
  if (min) params.set("min", min);
  if (max) params.set("max", max);
  if (state.inStock) params.set("inStock", "1");
  if (state.sort !== "newest") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));
  return params.toString();
}

export function useStoreProducts(slug: string, initial: InitialData): StorefrontDiscovery {
  // ── خواندن فیلترهای اشتراک‌گذاری‌شده از URL (اولین رندر کلاینت) ──
  const [urlState] = React.useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const sp = new URLSearchParams(window.location.search);
      const sortRaw = sp.get("sort") as StorefrontSortMode | null;
      return {
        q: sp.get("q") ?? "",
        cat: sp.get("cat"),
        min: sp.get("min") ?? "",
        max: sp.get("max") ?? "",
        inStock: sp.get("inStock") === "1",
        sort: sortRaw && SORTS.includes(sortRaw) ? sortRaw : ("newest" as StorefrontSortMode),
        page: Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1),
      };
    } catch {
      return null;
    }
  });

  const hasUrlFilters = !!urlState && !!(urlState.q || urlState.cat || urlState.min || urlState.max || urlState.inStock || urlState.sort !== "newest" || urlState.page > 1);

  const [products, setProducts] = React.useState<StorefrontProductDTO[]>(initial.products);
  const [total, setTotal] = React.useState(initial.products.length);
  const [page, setPageState] = React.useState(hasUrlFilters && urlState ? urlState.page : 1);
  const [pages, setPages] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [facets, setFacets] = React.useState<StorefrontFacets | null>(null);

  const [searchQuery, setSearchQuery] = React.useState(urlState?.q ?? "");
  const [debouncedQ, setDebouncedQ] = React.useState(urlState?.q ?? "");
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(urlState?.cat ?? null);
  const [priceInput, setPriceInput] = React.useState<{ min: string; max: string }>({
    min: urlState?.min ?? "",
    max: urlState?.max ?? "",
  });
  const [priceApplied, setPriceApplied] = React.useState<{ min: string; max: string }>({
    min: urlState?.min ?? "",
    max: urlState?.max ?? "",
  });
  const [inStockOnly, setInStockOnly] = React.useState(!!urlState?.inStock);
  const [sortMode, setSortMode] = React.useState<StorefrontSortMode>(urlState?.sort ?? "newest");

  const initialCategories = React.useMemo(() => {
    if (initial.categories?.length) return initial.categories;
    const map = new Map<string, number>();
    for (const p of initial.products) {
      const c = p.category?.trim();
      if (c) map.set(c, (map.get(c) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [initial.categories, initial.products]);

  const categories = facets?.categories?.length ? facets.categories.slice(0, 12) : initialCategories;

  // ── debounce جستجو (۳۰۰ms) ──
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── fetch هر وقت فیلترهای «اعمال‌شده» تغییر کردند ──
  const fetchSeq = React.useRef(0);
  React.useEffect(() => {
    const seq = ++fetchSeq.current;
    const qs = buildQueryString({ q: debouncedQ, cat: selectedCategory, min: priceApplied.min, max: priceApplied.max, inStock: inStockOnly, sort: sortMode, page });
    setLoading(true);
    fetch(`/api/storefront/${encodeURIComponent(slug)}/products${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: ProductsResponse | null) => {
        if (seq !== fetchSeq.current) return; // پاسخ قدیمی
        if (json?.success && Array.isArray(json.products)) {
          setProducts(json.products);
          setTotal(json.total);
          setPages(json.pages ?? 1);
          setPageState(json.page ?? 1);
          if (json.facets) setFacets(json.facets);
        }
      })
      .catch(() => {
        /* شبکه قطع شد — لیست قبلی می‌ماند */
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoading(false);
      });

    // همگام‌سازی URL برای اشتراک‌گذاری/بازگشت — بدون رندر مجدد سرور
    try {
      const url = new URL(window.location.href);
      const sp = new URLSearchParams(qs);
      // پارامترهای خارج از دیسکاوری (مثل edit=1 حالت ویرایش مالک) حفظ می‌شوند
      url.searchParams.forEach((value, key) => {
        if (!DISCOVERY_URL_KEYS.has(key)) sp.set(key, value);
      });
      // hash (#products) حفظ می‌شود
      url.search = sp.toString();
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignore */
    }
  }, [slug, debouncedQ, selectedCategory, priceApplied, inStockOnly, sortMode, page]);

  // صفحه اولیه با فیلتر URL → صفحه از حالت SSR جلوتر است؛ فقط وقتی فیلتر در URL بود
  // fetch اولیه در effect بالا انجام می‌شود (همیشه یک fetch اولیه داریم تا facets هم بیاید)

  const resetPageAnd = React.useCallback((fn: () => void) => {
    setPageState(1);
    fn();
  }, []);

  const discovery: StorefrontDiscovery = React.useMemo(
    () => ({
      products,
      total,
      page,
      pages,
      loading,
      facets,
      categories,
      searchQuery,
      onSearchQueryChange: (q: string) => {
        setSearchQuery(q);
        setPageState(1);
      },
      selectedCategory,
      onSelectCategory: (c: string | null) => resetPageAnd(() => setSelectedCategory(c)),
      priceInput,
      onPriceInputChange: (min: string, max: string) => setPriceInput({ min, max }),
      applyPriceRange: () => {
        setPageState(1);
        setPriceApplied({ min: priceInput.min.trim(), max: priceInput.max.trim() });
      },
      clearPriceRange: () => {
        setPriceInput({ min: "", max: "" });
        setPageState(1);
        setPriceApplied({ min: "", max: "" });
      },
      priceApplied,
      inStockOnly,
      onInStockOnlyChange: (v: boolean) => resetPageAnd(() => setInStockOnly(v)),
      sortMode,
      onSortModeChange: (m: StorefrontSortMode) => resetPageAnd(() => setSortMode(m)),
      setPage: (p: number) => {
        setPageState(Math.min(Math.max(1, p), Math.max(1, pages)));
        // اسکرول به بالای لیست محصولات
        try {
          document.getElementById("products")?.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch {
          /* ignore */
        }
      },
      reset: () => {
        setSearchQuery("");
        setDebouncedQ("");
        setSelectedCategory(null);
        setPriceInput({ min: "", max: "" });
        setPriceApplied({ min: "", max: "" });
        setInStockOnly(false);
        setSortMode("newest");
        setPageState(1);
      },
      activeFilterCount:
        (searchQuery.trim() ? 1 : 0) +
        (selectedCategory ? 1 : 0) +
        (priceApplied.min || priceApplied.max ? 1 : 0) +
        (inStockOnly ? 1 : 0),
      hasActiveFilters: !!(searchQuery.trim() || selectedCategory || priceApplied.min || priceApplied.max || inStockOnly),
    }),
    [
      products,
      total,
      page,
      pages,
      loading,
      facets,
      categories,
      searchQuery,
      selectedCategory,
      priceInput,
      priceApplied,
      inStockOnly,
      sortMode,
      resetPageAnd,
    ]
  );

  return discovery;
}

/** دیسکاوری غیرفعال برای پیش‌نمایش ویرایشگر بصری (بدون fetch) */
export function createNoopDiscovery(products: StorefrontProductDTO[]): StorefrontDiscovery {
  const categories = (() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const c = p.category?.trim();
      if (c) map.set(c, (map.get(c) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, count]) => ({ name, count })).slice(0, 12);
  })();
  return {
    products,
    total: products.length,
    page: 1,
    pages: 1,
    loading: false,
    facets: {
      categories,
      price: { min: null, max: null },
      inStock: products.filter((p) => p.inStock).length,
      totalAll: products.length,
    },
    categories,
    searchQuery: "",
    onSearchQueryChange: () => undefined,
    selectedCategory: null,
    onSelectCategory: () => undefined,
    priceInput: { min: "", max: "" },
    onPriceInputChange: () => undefined,
    applyPriceRange: () => undefined,
    clearPriceRange: () => undefined,
    priceApplied: { min: "", max: "" },
    inStockOnly: false,
    onInStockOnlyChange: () => undefined,
    sortMode: "newest",
    onSortModeChange: () => undefined,
    setPage: () => undefined,
    reset: () => undefined,
    activeFilterCount: 0,
    hasActiveFilters: false,
  };
}
