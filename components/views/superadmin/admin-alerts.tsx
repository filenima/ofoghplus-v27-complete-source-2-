"use client";

// ════════════════════════════════════════════════════════════════
// صندوق هشدارهای سوپرادمین (R14-H) — زنگ در هدر پنل
//  • همان دادهٔ مرکز اقدام‌ها (GET /api/platform/action-center) با hook مشترک
//  • poll هر ۲ دقیقه — وقتی تب مخفی است متوقف (document.visibilitychange)
//  • «بررسی» → پرش به تب مربوطه؛ «علامت‌گذاری دیده‌شده» → localStorage
//    hoosh_admin_seen_alerts (timestamp) — با generatedAt سمت سرور مقایسه
//    می‌شود؛ اگر سرور دادهٔ تازه‌تری ساخته باشد هشدار دوباره ظاهر می‌شود.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import {
	Bell,
	CheckCheck,
	ChevronLeft,
	Inbox,
	Loader2,
	RefreshCw,
	type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toPersianDigits, toJalali } from "@/lib/persian";
import {
	ATTENTION_CARDS,
	type ActionCenterData,
} from "@/components/views/superadmin/action-center";

const SEEN_ALERTS_KEY = "hoosh_admin_seen_alerts";
const POLL_INTERVAL_MS = 2 * 60 * 1000; // ۲ دقیقه

/** حالت هشدار — ترکیب داده + وضعیت دیده‌شدن */
export interface AdminAlertItem {
	key: string;
	label: string;
	sub: string;
	tab: string;
	icon: LucideIcon;
	accent: "warning" | "destructive" | "chart5" | "primary";
	count: number;
}

export interface UseAdminAlertsResult {
	/** آیتم‌های دارای شمار > ۰ */
	alerts: AdminAlertItem[];
	/** کل موارد نیازمند توجه */
	total: number;
	/** شمار موارد دیده‌نشده (بعد از آخرین «دیده‌شده») */
	unseen: number;
	data: ActionCenterData | null;
	loading: boolean;
	error: boolean;
	refresh: () => void;
	markAllSeen: () => void;
}

function readSeenAt(): number {
	try {
		const v = Number(localStorage.getItem(SEEN_ALERTS_KEY));
		return Number.isFinite(v) ? v : 0;
	} catch {
		return 0;
	}
}

/**
 * hook مشترک هشدارها — در زنگ هدر و بخش «تمرکز امروز» داشبورد استفاده
 * می‌شود. یک fetch اولیه + poll ۲ دقیقه‌ای که در تب مخفی متوقف می‌ماند.
 */
export function useAdminAlerts(token: string): UseAdminAlertsResult {
	const [data, setData] = React.useState<ActionCenterData | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState(false);
	const [seenAt, setSeenAt] = React.useState<number>(0);
	const fetchedAtRef = React.useRef<number>(0);

	// seenAt از localStorage فقط یک‌بار در mount (SSR-safe)
	React.useEffect(() => {
		setSeenAt(readSeenAt());
	}, []);

	const load = React.useCallback(async () => {
		try {
			const res = await fetch("/api/platform/action-center", {
				headers: { Authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(12_000),
			});
			const json = (await res.json().catch(() => null)) as {
				success?: boolean;
				data?: ActionCenterData;
			} | null;
			if (json?.success && json.data) {
				setData(json.data);
				setError(false);
				fetchedAtRef.current = Date.now();
			} else {
				setError(true);
			}
		} catch {
			setError(true);
		} finally {
			setLoading(false);
		}
	}, [token]);

	React.useEffect(() => {
		void load();
	}, [load]);

	// poll هر ۲ دقیقه — فقط وقتی تب دیده می‌شود
	React.useEffect(() => {
		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") void load();
		}, POLL_INTERVAL_MS);
		const onVisible = () => {
			if (document.visibilityState === "visible" && Date.now() - fetchedAtRef.current > POLL_INTERVAL_MS) {
				void load();
			}
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			window.clearInterval(id);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [load]);

	const alerts = React.useMemo(
		() =>
			data
				? ATTENTION_CARDS.map((c) => ({
						key: c.key as string,
						label: c.label,
						sub: c.sub,
						tab: c.tab,
						icon: c.icon,
						accent: c.accent,
						count: Math.max(0, Number(data[c.key]) || 0),
					})).filter((a) => a.count > 0)
				: [],
		[data]
	);

	const total = React.useMemo(() => alerts.reduce((s, a) => s + a.count, 0), [alerts]);

	// دیده‌نشده: دادهٔ سرور جدیدتر از آخرین «دیده‌شده» است
	const generatedAt = data ? Date.parse(data.generatedAt) : 0;
	const unseen = data && Number.isFinite(generatedAt) && generatedAt > seenAt ? total : 0;

	const markAllSeen = React.useCallback(() => {
		const now = Date.now();
		try {
			localStorage.setItem(SEEN_ALERTS_KEY, String(now));
		} catch {
			/* ignore */
		}
		setSeenAt(now);
	}, []);

	return { alerts, total, unseen, data, loading, error, refresh: () => void load(), markAllSeen };
}

// ─── لهجهٔ رنگی ───
const ACCENT_TEXT: Record<AdminAlertItem["accent"], string> = {
	warning: "text-warning",
	destructive: "text-destructive",
	chart5: "text-chart-5",
	primary: "text-primary",
};
const ACCENT_BG: Record<AdminAlertItem["accent"], string> = {
	warning: "bg-warning/12",
	destructive: "bg-destructive/12",
	chart5: "bg-chart-5/12",
	primary: "bg-primary/12",
};

/** زنگ هشدار هدر پنل سوپرادمین — Popover با لیست هشدارها */
export function AdminAlertsInbox({
	token,
	onNavigate,
}: {
	token: string;
	onNavigate: (tab: string) => void;
}) {
	const { alerts, total, unseen, data, loading, error, refresh, markAllSeen } = useAdminAlerts(token);
	const [open, setOpen] = React.useState(false);

	const badgeCount = unseen > 0 ? unseen : 0;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background hover:bg-accent transition-colors"
					aria-label={`هشدارهای مدیریت — ${toPersianDigits(total)} مورد نیاز به توجه`}
				>
					<Bell className="h-4 w-4" />
					{badgeCount > 0 && (
						<span className="absolute -top-1.5 -end-1.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center tnum">
							{toPersianDigits(badgeCount)}
						</span>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" sideOffset={8} className="w-80 p-0" dir="rtl">
				{/* سربرگ */}
				<div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border">
					<div className="flex items-center gap-2 min-w-0">
						<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
							<Inbox className="h-3.5 w-3.5" aria-hidden="true" />
						</span>
						<div className="min-w-0">
							<p className="text-xs font-bold leading-tight">هشدارهای مدیریت</p>
							<p className="text-[10px] text-muted-foreground leading-tight truncate">
								{loading
									? "در حال دریافت…"
									: error
										? "دریافت ناموفق"
										: total > 0
											? `${toPersianDigits(total)} مورد نیاز به توجه`
											: "همه‌چیز مرتب است"}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-1 shrink-0">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 w-7 p-0"
							onClick={refresh}
							aria-label="به‌روزرسانی هشدارها"
						>
							<Loader2 className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
						</Button>
					</div>
				</div>

				{/* لیست */}
				<div className="max-h-80 overflow-y-auto" role="list" aria-label="لیست هشدارها">
					{error && !data ? (
						<div className="p-4 text-center">
							<p className="text-xs text-destructive mb-2">دریافت هشدارها ناموفق بود</p>
							<Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={refresh}>
								<RefreshCw className="h-3 w-3 me-1" />
								تلاش دوباره
							</Button>
						</div>
					) : loading && !data ? (
						<div className="space-y-2 p-3">
							{[1, 2, 3].map((i) => (
								<div key={i} className="h-12 rounded-lg bg-muted animate-pulse" aria-hidden="true" />
							))}
						</div>
					) : alerts.length === 0 ? (
						<div className="py-8 px-4 text-center">
							<CheckCheck className="h-8 w-8 mx-auto text-success/60 mb-2" aria-hidden="true" />
							<p className="text-xs font-bold text-foreground/80">موردی نیاز به توجه ندارد</p>
							<p className="text-[10px] text-muted-foreground mt-1">
								تیکت، باگ، خطا، تریال و صف انتشار بررسی شدند
							</p>
						</div>
					) : (
						alerts.map((a) => {
							const Icon = a.icon;
							return (
								<div
									key={a.key}
									role="listitem"
									className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors"
								>
									<span
										className={cn(
											"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
											ACCENT_BG[a.accent],
											ACCENT_TEXT[a.accent]
										)}
									>
										<Icon className="h-4 w-4" aria-hidden="true" />
									</span>
									<div className="min-w-0 flex-1">
										<p className="text-xs font-medium truncate">
											{a.label}
											<span className="tnum font-bold me-1.5">({toPersianDigits(a.count)})</span>
										</p>
										<p className="text-[10px] text-muted-foreground truncate">{a.sub}</p>
									</div>
									<Button
										variant="ghost"
										size="sm"
										className="h-7 px-2 text-[10px] text-primary hover:text-primary shrink-0 gap-0.5"
										onClick={() => {
											onNavigate(a.tab);
											setOpen(false);
										}}
									>
										بررسی
										<ChevronLeft className="h-3 w-3" aria-hidden="true" />
									</Button>
								</div>
							);
						})
					)}
				</div>

				{/* پاورقی: دیده‌شده + زمان داده */}
				<div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-[10px] gap-1 text-muted-foreground"
						onClick={markAllSeen}
						disabled={alerts.length === 0}
					>
						<CheckCheck className="h-3 w-3" aria-hidden="true" />
						علامت‌گذاری به‌عنوان دیده‌شده
					</Button>
					{data?.generatedAt && (
						<span className="text-[9px] text-muted-foreground tnum shrink-0">
							{toJalali(new Date(data.generatedAt))}
						</span>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
