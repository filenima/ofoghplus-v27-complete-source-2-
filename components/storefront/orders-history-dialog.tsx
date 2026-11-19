"use client";

// ============ فروشگاه آنلاین (R15-C) — سفارش‌های من (مشتری واردشده) ============

import * as React from "react";
import { Loader2, Package, ReceiptText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toPersianDigits } from "@/lib/persian";
import {
  rialToTomanLabel,
  storefrontOrderStatusColor,
  STOREFRONT_ORDER_STATUS_FA,
  type StorefrontOrderItemDTO,
} from "@/lib/storefront";
import { formatJalaliDayLabel } from "@/lib/persian";

export interface SfCustomerOrder {
  id: string;
  items: StorefrontOrderItemDTO[];
  totalRial: string;
  payableRial?: string | null;
  discountApplied?: number | null;
  invoiceId?: string | null;
  status: string;
  note: string | null;
  createdAt: string;
}

interface OrdersHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
}

export function OrdersHistoryDialog({ open, onOpenChange, slug }: OrdersHistoryDialogProps) {
  const [orders, setOrders] = React.useState<SfCustomerOrder[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/storefront/${encodeURIComponent(slug)}/customer/me`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !json?.success) {
          setError(json?.error || "خطا در دریافت سفارش‌ها");
          setOrders([]);
          return;
        }
        setOrders(json.orders as SfCustomerOrder[]);
      } catch {
        if (!cancelled) setError("خطای شبکه — دوباره تلاش کنید");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, slug]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>سفارش‌های من</DialogTitle>
          <DialogDescription>وضعیت سفارش‌های ثبت‌شده شما در این فروشگاه</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="در حال بارگذاری">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-red-600">{error}</p>
        ) : orders && orders.length > 0 ? (
          <ul className="max-h-[60vh] space-y-3 overflow-y-auto pl-1" role="list">
            {orders.map((o) => (
              <li key={o.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <ReceiptText className="h-4 w-4 text-primary" aria-hidden="true" />
                    سفارش {formatJalaliDayLabel(o.createdAt)}
                  </span>
                  <Badge variant="outline" className={storefrontOrderStatusColor(o.status)}>
                    {STOREFRONT_ORDER_STATUS_FA[o.status] ?? o.status}
                  </Badge>
                </div>
                <ul className="mt-3 space-y-1.5" role="list">
                  {o.items.map((item) => (
                    <li key={item.productId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        {item.name}
                        <span className="text-muted-foreground">×{toPersianDigits(item.qty)}</span>
                      </span>
                      <span className="tabular-nums">{rialToTomanLabel(String(BigInt(item.priceRial) * BigInt(item.qty)))}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between border-t pt-2 text-sm font-bold">
                  <span>{o.discountApplied ? "قابل پرداخت" : "جمع کل"}</span>
                  <span className="tabular-nums text-primary">
                    {rialToTomanLabel(o.payableRial ?? o.totalRial)}
                    {o.discountApplied ? (
                      <span className="ms-2 text-xs font-medium text-muted-foreground line-through">{rialToTomanLabel(o.totalRial)}</span>
                    ) : null}
                  </span>
                </div>
                {["APPROVED", "SHIPPED"].includes(o.status) ? (
                  <a
                    href={`/api/storefront/${encodeURIComponent(slug)}/invoice/${encodeURIComponent(o.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-85"
                  >
                    <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
                    دانلود فاکتور رسمی
                  </a>
                ) : null}
                {o.note ? <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-5">یادداشت: {o.note}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            هنوز سفارشی ثبت نکرده‌اید — از صفحه اصلی خرید خود را شروع کنید.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
