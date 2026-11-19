import Link from "next/link";
import { ArrowRight, Newspaper, Phone, Store } from "lucide-react";

// ═══ Task 3-g — کروم مشترک صفحات بلاگ فروشگاه (Server Component) ═══
// همان هدر مینیمال صفحهٔ تک‌کالا (app/shop/[slug]/p/[pid]) — برای
// /shop/{slug}/blog و /shop/{slug}/blog/{postSlug} — تا کاربر هرگز
// در سایت مشتری «گم» نشود و همیشه مسیر بازگشت به فروشگاه داشته باشد.

export interface StorefrontBlogHeaderProps {
  shopSlug: string;
  shopTitle: string;
  announcement?: string | null;
  phone?: string | null;
}

export function StorefrontBlogHeader({
  shopSlug,
  shopTitle,
  announcement,
  phone,
}: StorefrontBlogHeaderProps) {
  const storeUrl = `/shop/${encodeURIComponent(shopSlug)}`;
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
        <Link
          href={storeUrl}
          prefetch={false}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground transition-colors hover:text-primary"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
          <Store className="h-4 w-4" aria-hidden="true" />
          {shopTitle}
        </Link>
        <span className="hidden items-center gap-1 text-xs font-semibold text-muted-foreground sm:inline-flex">
          <Newspaper className="h-3.5 w-3.5" aria-hidden="true" />
          وبلاگ
        </span>
        {announcement ? (
          <span className="hidden truncate text-xs text-muted-foreground sm:block">· {announcement}</span>
        ) : null}
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="ms-auto inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">تماس با فروشگاه</span>
            <span className="sm:hidden">تماس</span>
          </a>
        ) : null}
      </div>
    </header>
  );
}
