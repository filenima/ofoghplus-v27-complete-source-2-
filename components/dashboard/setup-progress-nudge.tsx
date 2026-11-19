"use client";

/**
 * components/dashboard/setup-progress-nudge.tsx
 * ============================================================================
 * نسخهٔ ۹ — کارت «پیشرفت راه‌اندازی» با اثر زایگارنیک (Zeigarnik Effect)
 * ============================================================================
 *
 * علم: کارِ نیمه‌کامه در ذهن می‌ماند — بلوما زایگارنیک (۱۹۲۷): افراد
 * جزئیات تکالیف ناتمام را به‌مراتب بهتر از تکالیف تمام‌شده به یاد می‌سپارند
 * و کششِ بازگشت به آن بالاتر است. در SaaS، «درصد پیشرفت راه‌اندازی»
 * کاربر را به بازگشت و تکمیل (فعال‌سازی) سوق می‌دهد — الگویی که LinkedIn
 * با نوار «پروفایل شما X٪ کامل است» به مشهورترین نمونهٔ رشد محصول تبدیل کرد.
 * نوار پیشرفت هم‌زمان Goal-Gradient را فعال می‌کند: هرچه به ۱۰۰٪ نزدیک‌تر،
 * انگیزهٔ گام بعدی قوی‌تر (کلارک هال، ۱۹۳۲؛ کیوز و روی ۲۰۱۲).
 *
 * قواعد صداقت (هم‌راستا با lib/marketing-psychology.ts):
 *  - درصد از /api/onboarding/progress (شمارش واقعی کالا/طرف‌حساب/فاکتور
 *    از دیتابیس) — بدون داده یا خطا ⇒ کارت رندر نمی‌شود.
 *  - ۰٪ و ۱۰۰٪ ⇒ رندر نمی‌شود (۰٪ = اعلانِ «هیچ»؛ ۱۰۰٪ = انگیزه‌ای نیست).
 *  - بستن فقط برای جلسهٔ جاری (sessionStorage) — نشست بعدی دوباره یادآوری
 *    می‌کند تا کارِ نیمه‌کامه (عمداً) در ذهن بماند.
 *  - رفرش خودکار با رویداد پیشرفتِ ویزارد + focus پنجره.
 */

import * as React from "react";
import { Rocket, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toPersianDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

/** همان رشتهٔ ONBOARDING_PROGRESS_CHANGED_EVENT در setup-wizard.tsx —
 * اینجا تکرار می‌شود تا ماژول سنگین ویزارد به باندل داشبورد کشیده نشود */
const PROGRESS_CHANGED_EVENT = "hoshhesab:onboarding-progress-changed";
const DISMISS_KEY = "hoshhesab_setup_nudge_dismissed_session";

interface ProgressStep {
	id: string;
	label: string;
	done: boolean;
}

export function SetupProgressNudge() {
	const [percent, setPercent] = React.useState<number | null>(null);
	const [nextStep, setNextStep] = React.useState<string | null>(null);
	const [dismissed, setDismissed] = React.useState(false);

	// وضعیت بسته‌شدن در همین نشست
	React.useEffect(() => {
		try {
			if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
		} catch {
			/* ignore */
		}
	}, []);

	const load = React.useCallback(async () => {
		try {
			const res = await authFetch("/api/onboarding/progress", {
				cache: "no-store",
			});
			if (!res.ok) {
				setPercent(null);
				return;
			}
			const json = await res.json();
			if (!json?.success) {
				setPercent(null);
				return;
			}
			const pct = Number(json.completionPercent);
			if (!Number.isFinite(pct)) {
				setPercent(null);
				return;
			}
			setPercent(pct);
			const steps: ProgressStep[] = Array.isArray(json?.data?.steps)
				? (json.data.steps as ProgressStep[])
				: [];
			const next = steps.find((s) => !s.done && s.id !== "explore");
			setNextStep(next ? next.label : null);
		} catch {
			setPercent(null); // آفلاین/خطا ⇒ هیچ چیزی نشان نده
		}
	}, []);

	React.useEffect(() => {
		load();
		const onChange = () => load();
		window.addEventListener(PROGRESS_CHANGED_EVENT, onChange as EventListener);
		window.addEventListener("focus", onChange);
		return () => {
			window.removeEventListener(PROGRESS_CHANGED_EVENT, onChange as EventListener);
			window.removeEventListener("focus", onChange);
		};
	}, [load]);

	if (dismissed || percent === null || percent <= 0 || percent >= 100) return null;

	const dismiss = () => {
		setDismissed(true);
		try {
			sessionStorage.setItem(DISMISS_KEY, "1");
		} catch {
			/* ignore */
		}
	};

	// ۴ گام قابل‌سنجش سروری (هر گام ۲۵٪) — از درصد باقی‌مانده محاسبه می‌شود
	const remainingSteps = Math.max(1, Math.round((100 - percent) / 25));

	return (
		<div
			role="status"
			dir="rtl"
			aria-label={`پیشرفت راه‌اندازی کسب‌وکار — ${toPersianDigits(percent)} درصد`}
			className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-l from-primary/[0.07] via-card to-card p-4 shadow-sm"
		>
			<button
				type="button"
				onClick={dismiss}
				aria-label="بستن"
				className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
			>
				<X className="h-3.5 w-3.5" />
			</button>
			<div className="flex items-center gap-3">
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
					<Rocket className="h-5 w-5" aria-hidden="true" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
						<p className="text-sm font-bold text-foreground">
							راه‌اندازی کسب‌وکار شما {toPersianDigits(percent)}٪ کامل است
						</p>
						<p className="text-[11px] font-medium text-primary">
							{toPersianDigits(remainingSteps)} گام تا فعال‌سازی کامل
						</p>
					</div>
					{/* زایگارنیک: گام بعدیِ مشخص + دعوت به ادامه — کار نیمه‌کامه رهایش نکنید */}
					<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
						گام بعدی:{" "}
						<span className="font-semibold text-foreground/80">
							{nextStep ?? "ادامهٔ مسیر راه‌اندازی"}
						</span>{" "}
						— نیمه‌کاره رهایش نکنید؛ از دکمهٔ «راه‌اندازی» در نوار بالا ادامه دهید.
					</p>
					<Progress value={percent} className="mt-2 h-1.5" />
				</div>
			</div>
		</div>
	);
}
