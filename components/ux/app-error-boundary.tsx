"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw, Zap, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPerfModeOverride } from "@/lib/perf-mode";

/**
 * AppErrorBoundary — R28-12 شبکهٔ ایمن ناحیهٔ محتوای اصلی اپ (افق پلاس)
 * ============================================================================
 * مشکل مالک: «روی لپ‌تاپ ضعیف، اپ در مرورگر مدام خطا می‌دهد و بارگذاری نمی‌شود».
 * SafeBoundary/ModuleErrorFallback از قبل هر «ماژول» را جدا می‌پوشانند؛
 * این مرز خطا یک لایهٔ بالاتر نشسته و بخش‌های بدون پوششِ کرومِ پوسته
 * (هدر/بنرها/ناحیهٔ محتوا) را هم می‌گیرد تا هیچ کرشی صفحهٔ سفید یا
 * سقوطِ کل SPA نسازد — فقط یک کارت خطای قابل بازیابی در همان ناحیه.
 *
 * ویژگی‌ها:
 * - دکمهٔ «تلاش مجدد» (ریست همان ناحیه بدون رفرش کامل صفحه)
 * - دکمهٔ «حالت سبک + تلاش مجدد»: برای لپ‌تاپ ضعیف — حالت عملکرد
 *   (perf-mode) را روشن می‌کند (بدون حذف هیچ ویژگی/طراحی؛ فقط ارزان‌سازی
 *   بلورها/انیمیشن‌ها/پیش‌بارگذاری‌ها) و همان لحظه دوباره تلاش می‌کند.
 * - «بازگشت به داشبورد» و «بارگذاری مجدد صفحه» به‌عنوان گزینه‌های نهایی.
 * - resetKey: با تغییر آن (مثلاً moduleRetryKey پوسته) حالت خطا پاک می‌شود.
 */

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  /** نام ناحیه برای نمایش در پیام (مثلاً «پنل اصلی») */
  name?: string;
  /** تغییر این مقدار حالت خطا را پاک می‌کند (الگوی SafeBoundary) */
  resetKey?: unknown;
  onBackToDashboard?: () => void;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  /** هر تلاش مجدد یک نسخهٔ تازه از fallback می‌سازد تا state داخلی‌اش ریست شود */
  generation: number;
}

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, generation: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    try {
      console.warn("AppErrorBoundary caught:", error?.message);
    } catch {
      /* ignore */
    }
  }

  componentDidUpdate(prevProps: AppErrorBoundaryProps) {
    // ریست خودکار با تغییر resetKey (دکمهٔ «تلاش مجدد» سطح پوسته)
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  private reset = () => {
    this.setState((s) => ({ hasError: false, error: undefined, generation: s.generation + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <AppErrorFallback
          key={this.state.generation}
          name={this.props.name}
          error={this.state.error}
          onRetry={this.reset}
          onBackToDashboard={this.props.onBackToDashboard}
        />
      );
    }
    return this.props.children;
  }
}

function AppErrorFallback({
  name,
  error,
  onRetry,
  onBackToDashboard,
}: {
  name?: string;
  error?: { message?: string };
  onRetry: () => void;
  onBackToDashboard?: () => void;
}) {
  const [perfActivated, setPerfActivated] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);
  const message = error?.message || "";

  const handleLightModeRetry = () => {
    try {
      setPerfModeOverride("on");
    } catch {
      /* localStorage در حالت خصوصی ممکن است خطا دهد — تلاش مجدد ادامه می‌یابد */
    }
    setPerfActivated(true);
    // یک فریم صبر تا کلاس perf-mode روی <html> بنشیند و سپس رندر مجدد
    window.requestAnimationFrame(() => onRetry());
  };

  return (
    <div
      role="alert"
      dir="rtl"
      className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-xl border border-destructive/30 bg-destructive/5 animate-fade-in-up"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-4">
        <AlertTriangle className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h3 className="text-sm font-bold text-foreground mb-1">
        خطا در نمایش{name ? ` ${name}` : " این بخش"}
      </h3>
      <p className="text-xs text-muted-foreground max-w-md leading-relaxed mb-5">
        یک خطای غیرمنتظره رخ داد. می‌توانید دوباره تلاش کنید؛ اگر دستگاه شما ضعیف است یا
        این خطا تکرار می‌شود، «حالت سبک» را فعال کنید — همهٔ امکانات حفظ می‌شود و فقط
        جلوه‌های سنگین موقتاً سبک‌تر می‌شوند.
        {perfActivated && (
          <span className="mt-1 block text-success font-medium">
            حالت سبک فعال شد ✓
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          تلاش مجدد
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleLightModeRetry}
          className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
        >
          <Zap className="h-3.5 w-3.5" />
          حالت سبک + تلاش مجدد
        </Button>
        {onBackToDashboard && (
          <Button size="sm" variant="outline" onClick={onBackToDashboard} className="gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" />
            بازگشت به داشبورد
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
          className="gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          بارگذاری مجدد صفحه
        </Button>
        {message && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowDetails((s) => !s)}
            className="gap-1.5"
          >
            جزئیات خطا
          </Button>
        )}
      </div>
      {showDetails && message && (
        <pre
          dir="ltr"
          className="mt-4 max-w-lg w-full text-left text-[10px] font-mono bg-muted/60 border border-border rounded-lg p-3 overflow-auto max-h-40"
        >
          {message.slice(0, 300)}
        </pre>
      )}
    </div>
  );
}

export default AppErrorBoundary;
