"use client";

// ════════════════════════════════════════════════════════════════
// پالت فرمان سوپرادمین (R14-H — ارتقای کامل) — Cmd/Ctrl+K
//  • ایندکس همهٔ تب‌ها با عنوان فارسی + نام گروه + کلیدواژه‌ها
//  • جستجوی فازی فارسی (نرمال‌سازی ی/ک عربی، حذف نیم‌فاصله و اعراب)
//  • اکشن‌های سریع واقعی: خروجی اکسل کاربران (CSV)، بازسازی فایل‌های
//    سئو، پشتیبان‌گیری فوری، پاک‌سازی کش، انتشار مقالهٔ صف
//  • دستورات اخیر (localStorage، حداکثر ۵، بالای لیست)
//  • ورود فوری به سازمان (همان قبلی)
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import {
        CommandDialog,
        CommandInput,
        CommandList,
        CommandEmpty,
        CommandGroup,
        CommandItem,
        CommandSeparator,
} from "@/components/ui/command";
import {
        Search,
        Zap,
        KeyRound,
        RefreshCcw,
        Newspaper,
        ArrowLeft,
        Download,
        Database,
        FileText,
        Mail,
        History,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

export interface PaletteNavItem {
        value: string;
        label: string;
        group: string;
}

/** کلیدواژه‌های فارسی برای تب‌های پرکاربرد — جستجو بدون تایپِ عنوان دقیق */
const TAB_KEYWORDS: Record<string, string> = {
        dashboard: "خانه اصلی kpi شاخص",
        "online-users": "آنلاین جلسات live geo",
        users: "کاربر اکانت حساب member",
        tenants: "سازمان شرکت tenant مشتری",
        licenses: "لایسنس مجوز کلید license key",
        quick: "ورود فوری quick login",
        crm: "سرنخ lead مشتری pipeline قیف",
        coupons: "کوپن تخفیف کد تخفیف coupon",
        "discount-rules": "تخفیف قوانین خودکار",
        "installments-admin": "قسط اقساط پرداخت",
        "price-experiments": "قیمت آزمایش تست قیمت",
        billing: "پرداخت فاکتور صورتحساب billing",
        "saas-finance": "مالی درآمد mrr arr مالی",
        "revenue-intelligence": "درآمد سود مالی هوش",
        "wallet-admin": "کیف پول برداشت wallet",
        "plan-limits": "پلن محدودیت سقف",
        modian: "مودیان مالیات tax",
        consolidation: "تلفیق تجمیع مالی",
        cms: "محتوا صفحه cms ویرایش",
        "blog-editor": "بلاگ مقاله ویرایشگر article",
        "news-workflow": "خبر ۴۸ news",
        newsletter: "خبرنامه ایمیل newsletter",
        testimonials: "نظر مشتری نظرات review",
        "trust-badges": "نماد اعتماد نشان badge",
        "content-seo": "سئو محتوا seo",
        "sitemap-files": "سایت‌مپ sitemap فایل سئو ربات",
        "seo-growth": "سئو رشد کلمه کلیدی keyword",
        "gsc-monitor": "سرچ کنسول gsc ctr",
        "google-maps": "نقشه گوگل نظرات maps",
        messaging: "پیام گروهی sms ایمیل ارسال",
        "referral-admin": "رفرال معرفی زیرمجموعه",
        partners: "شراکت پارتنر affiliate",
        ads: "تبلیغ بنر کمپین campaign",
        "gbp-posts": "گوگل بیزینس پست gbp",
        "pr-outreach": "پی‌آر دیجیتال رسانه pr",
        "push-ab": "پوش نوتیفیکیشن ab تست",
        "ab-titles": "تایتل عنوان ab تست",
        tickets: "تیکت پشتیبانی support",
        "bug-reports": "باگ خطا گزارش reward پاداش",
        security: "امنیت ip فایروال",
        "anti-fraud": "ضدتقلب جلوگیری fraud",
        "threat-center": "تهدید مرکز",
        "system-logs": "لاگ سیستم log",
        backups: "بکاپ پشتیبان backup",
        "sys-monitor": "مانیتور منابع cpu ram",
        "db-manager": "دیتابیس database",
        deploy: "دیپلوی سرور deploy",
        cron: "زمان‌بندی cron کار",
        "api-gateway": "گیت‌وی api",
        "cache-perf": "کش کش performance",
        "data-mgr": "داده مدیریت etl",
        "global-control": "کنترل سراسری",
        settings: "تنظیمات تنظیمات",
        "platform-settings": "پلتفرم تنظیمات",
        "ai-settings": "هوش مصنوعی ai دانش‌نامه",
        "root-ai": "روت دستیار ai",
        "smtp-settings": "ایمیل smtp",
        notifications: "پیامک اعلان",
        "theme-default": "تم ظاهر رنگ",
        branding: "برند وایت لیبل لوگو",
        "module-manager": "منو ماژول",
        "sidebar-config": "سایدبار چیدمان",
        domains: "دامنه domain",
        "feature-flags": "فلگ ویژگی flag",
        versions: "نسخه version",
        impersonate: "جعل هویت شوید",
        analytics: "آنالیتیکس تحلیل stats",
        cohort: "کوهورت نگهداشت retention",
        adoption: "پذیرش ویژگی feature",
        compliance: "انطباق",
        competitors: "رقبا competitor",
        reports: "گزارش گزارش‌ها",
        "widgets-stats": "ویجت آمار شرکا",
        "db-query": "کوئری query sql",
        "db-schema": "اسکیما schema",
        "db-slow": "کند slow query",
        audit: "ممیزی لاگ تغییرات",
        "audit-live": "رخداد زنده live",
        errors: "خطا error",
        health: "سلامت health",
};

/** ─── نرمال‌سازی فارسی برای جستجوی فازی ─── */
function normalizeFa(input: string): string {
        return input
                .toLowerCase()
                .replace(/\u064a/g, "\u06cc") // ي عربی → ی
                .replace(/\u0643/g, "\u06a9") // ك عربی → ک
                .replace(/\u200c/g, " ") // نیم‌فاصله → فاصله
                .replace(/[\u064b-\u0652\u0670]/g, "") // اعراب
                .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // ارقام عربی
                .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // ارقام فارسی
                .replace(/\s+/g, " ")
                .trim();
}

/** فیلتر فارسی cmdk — includes روی رشتهٔ نرمال‌شده (کافی و سریع) */
function faFilter(value: string, search: string): number {
        const v = normalizeFa(value);
        const s = normalizeFa(search);
        if (!s) return 1;
        if (v.includes(s)) return s.length / Math.max(v.length, 1) + 1;
        return 0;
}

/** ─── دستورات اخیر (localStorage، حداکثر ۵) ─── */
const RECENT_COMMANDS_KEY = "hoosh_admin_recent_commands";
const MAX_RECENT_COMMANDS = 5;

interface RecentCommand {
        id: string;
        label: string;
        icon: "tab" | "action";
        tab?: string;
        at: number;
}

function readRecentCommands(): RecentCommand[] {
        try {
                const v = JSON.parse(localStorage.getItem(RECENT_COMMANDS_KEY) || "[]");
                return Array.isArray(v)
                        ? v.filter(
                                        (x): x is RecentCommand =>
                                                x && typeof x.id === "string" && typeof x.label === "string"
                                )
                        : [];
        } catch {
                return [];
        }
}

function writeRecentCommands(list: RecentCommand[]) {
        try {
                localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(list.slice(0, MAX_RECENT_COMMANDS)));
        } catch {
                /* ignore */
        }
}

/** ─── شکل دادهٔ کاربر برای خروجی اکسل ─── */
interface ExportUser {
        name?: string | null;
        email?: string | null;
        username?: string | null;
        role?: string | null;
        isActive?: boolean;
        isTrial?: boolean;
        createdAt?: string | null;
        lastLogin?: string | null;
        tenant?: { name?: string | null; plan?: string | null } | null;
}

/** خروجی CSV سازگار با اکسل (BOM + جداکنندهٔ کاما) — ساخت سمت کلاینت */
function buildUsersCsv(users: ExportUser[]): string {
        const header = [
                "نام",
                "ایمیل",
                "نام کاربری",
                "سازمان",
                "پلن",
                "نقش",
                "وضعیت",
                "تریال",
                "تاریخ ایجاد",
                "آخرین ورود",
        ];
        const esc = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
        const rows = users.map((u) =>
                [
                        u.name || "",
                        u.email || "",
                        u.username || "",
                        u.tenant?.name || "",
                        u.tenant?.plan || "",
                        u.role || "",
                        u.isActive ? "فعال" : "غیرفعال",
                        u.isTrial ? "بله" : "خیر",
                        u.createdAt ? u.createdAt.slice(0, 10) : "",
                        u.lastLogin ? u.lastLogin.slice(0, 10) : "",
                ]
                        .map(esc)
                        .join(",")
        );
        return "\uFEFF" + [header.map(esc).join(","), ...rows].join("\r\n");
}

// ═══════════════ کامپوننت اصلی ═══════════════
export function AdminCommandPalette({
        open,
        onOpenChange,
        token,
        navItems,
        tenants,
        onNavigate,
        onQuickLogin,
}: {
        open: boolean;
        onOpenChange: (open: boolean) => void;
        token: string;
        navItems: PaletteNavItem[];
        tenants: { id: string; name: string }[];
        onNavigate: (tab: string) => void;
        onQuickLogin: (token: string, tenantName?: string) => void;
}) {
        const { toast } = useToast();
        const [busy, setBusy] = React.useState<string | null>(null);
        const [search, setSearch] = React.useState("");
        const [recent, setRecent] = React.useState<RecentCommand[]>([]);

        // بارگذاری دستورات اخیر هنگام باز شدن پالت
        React.useEffect(() => {
                if (open) {
                        setRecent(readRecentCommands());
                        setSearch("");
                }
        }, [open]);

        const pushRecent = React.useCallback((entry: Omit<RecentCommand, "at">) => {
                setRecent((prev) => {
                        const next = [
                                { ...entry, at: Date.now() },
                                ...prev.filter((r) => r.id !== entry.id),
                        ].slice(0, MAX_RECENT_COMMANDS);
                        writeRecentCommands(next);
                        return next;
                });
        }, []);

        const run = async (id: string, fn: () => Promise<void>) => {
                setBusy(id);
                try {
                        await fn();
                } catch (e) {
                        toast({
                                title: "خطا در اجرای دستور",
                                description: e instanceof Error ? e.message : "عملیات ناموفق بود",
                                variant: "destructive",
                        });
                } finally {
                        setBusy(null);
                }
        };

        // ─── اکشن: خروجی اکسل کاربران (CSV سمت کلاینت از API موجود) ───
        const exportUsersCsv = () =>
                run("export-users", async () => {
                        const res = await fetch("/api/platform/users?take=500", {
                                headers: { Authorization: `Bearer ${token}` },
                        });
                        const json = await res.json().catch(() => null);
                        if (!res.ok || !json?.success || !Array.isArray(json.data)) {
                                throw new Error(json?.error || `کد ${res.status}`);
                        }
                        const users = json.data as ExportUser[];
                        if (users.length === 0) {
                                toast({ title: "کاربری برای خروجی وجود ندارد" });
                                return;
                        }
                        const csv = buildUsersCsv(users);
                        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `users-ofoghplus-${new Date().toISOString().slice(0, 10)}.csv`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                        toast({
                                title: "خروجی اکسل کاربران آماده شد",
                                description: `${toPersianDigits(users.length)} کاربر — فایل CSV (سازگار با اکسل) دانلود شد`,
                        });
                });

        // ─── اکشن: بازسازی فایل‌های سئو (sitemap/robots/…) ───
        const rebuildSeoFiles = () =>
                run("seo-rebuild", async () => {
                        const res = await fetch("/api/platform/seo-files", {
                                method: "POST",
                                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "rebuild" }),
                        });
                        const json = await res.json().catch(() => ({}));
                        if (!res.ok || !json.success) throw new Error(json.error || `کد ${res.status}`);
                        toast({ title: "بازسازی فایل‌های سئو انجام شد", description: json.message || "" });
                });

        // ─── اکشن: پشتیبان‌گیری فوری (بکاپ دستی) ───
        const backupNow = () =>
                run("backup-now", async () => {
                        const res = await fetch("/api/platform/backups", {
                                method: "POST",
                                headers: { Authorization: `Bearer ${token}` },
                        });
                        const json = await res.json().catch(() => ({}));
                        if (!res.ok || !json.success) throw new Error(json.error || `کد ${res.status}`);
                        const name = json.data?.backup?.name || "";
                        toast({
                                title: "پشتیبان فوری گرفته شد",
                                description: name ? `فایل: ${name}` : "بکاپ دستی در فهرست بکاپ‌ها ثبت شد",
                        });
                });

        // ─── اکشن: پاک‌سازی کامل کش سئو ───
        const clearSeoCache = () =>
                run("seo-cache", async () => {
                        const res = await fetch("/api/seo/revalidate", {
                                method: "POST",
                                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                                body: JSON.stringify({ tag: "all" }),
                        });
                        const json = await res.json().catch(() => ({}));
                        if (!res.ok || !json.success) throw new Error(json.error || `کد ${res.status}`);
                        toast({
                                title: "کش سئو پاک شد",
                                description: `${toPersianDigits(String((json.data?.revalidatedPaths?.length ?? 0) + (json.data?.revalidatedTags?.length ?? 0)))} مسیر/تگ تازه‌سازی شد`,
                        });
                });

        // ─── اکشن: انتشار فوری مقالهٔ بعدیِ سررسیده ───
        // FIX(v20-G): قبلاً کرونِ بی‌احراز (/api/cron/publish-scheduled) صدا زده می‌شد —
        // در production با CRON_SECRET فعال همیشه 401 می‌گرفت. حالا اندپوینت
        // پلتفرمی با توکن سوپرادمین (همان منطق زمان‌بند) صدا زده می‌شود.
        const publishNext = () =>
                run("publish-next", async () => {
                        const res = await fetch("/api/platform/publish-scheduled?autoschedule=1", {
                                method: "POST",
                                headers: { Authorization: `Bearer ${token}` },
                        });
                        const json = await res.json().catch(() => ({}));
                        if (!res.ok || !json.success) throw new Error(json.error || `کد ${res.status}`);
                        toast({
                                title: "صف انتشار اجرا شد",
                                description: json.message || "اگر مقالهٔ سررسیده‌ای در صف باشد منتشر شد (حداکثر ۱ مورد)",
                        });
                });

        // ─── اکشن: ورود فوری به سازمان ───
        const quickLogin = (tenantId: string, name: string) =>
                run(`login-${tenantId}`, async () => {
                        const res = await fetch("/api/platform/quick-login", {
                                method: "POST",
                                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                                body: JSON.stringify({ tenantId }),
                        });
                        const json = await res.json().catch(() => ({}));
                        if (!res.ok || !json.success || !json.token) {
                                throw new Error(json.error || "ورود فوری ناموفق بود");
                        }
                        toast({ title: "ورود فوری انجام شد", description: `به «${name}» وارد شدید` });
                        onOpenChange(false);
                        onQuickLogin(json.token, name);
                });

        const handleTab = (value: string, label: string) => {
                pushRecent({ id: `tab:${value}`, label, icon: "tab", tab: value });
                onNavigate(value);
                onOpenChange(false);
        };

        const handleAction = (id: string, label: string, fn: () => void, tab?: string) => {
                pushRecent({ id: `action:${id}`, label, icon: "action", tab });
                fn();
        };

        const q = normalizeFa(search);
        const showRecent = !q && recent.length > 0;
        const recentTabs = recent.filter((r) => r.tab).map((r) => r.tab as string);

        // کلیدواژهٔ جستجو به هر آیتم تب اضافه می‌شود (cmdk روی value فیلتر می‌کند)
        const navValue = (it: PaletteNavItem) =>
                `${it.label} ${it.value} ${it.group} ${TAB_KEYWORDS[it.value] || ""}`;

        return (
                <CommandDialog
                        open={open}
                        onOpenChange={onOpenChange}
                        commandProps={{ filter: faFilter }}
                >
                        <CommandInput
                                placeholder="جستجوی تب، سازمان یا اکشن… (مثلاً: لایسنس، بکاپ، کوپن)"
                                value={search}
                                onValueChange={setSearch}
                        />
                        <CommandList className="max-h-[60vh]">
                                <CommandEmpty>چیزی یافت نشد</CommandEmpty>

                                {/* ─── دستورات اخیر (R14-H) — فقط بدون جستجو ─── */}
                                {showRecent && (
                                        <CommandGroup heading="دستورات اخیر">
                                                {recent.map((r) => (
                                                        <CommandItem
                                                                key={`recent-${r.id}`}
                                                                value={`recent ${r.label} ${r.tab || ""}`}
                                                                onSelect={() => {
                                                                        if (r.tab) {
                                                                                onNavigate(r.tab);
                                                                                onOpenChange(false);
                                                                        }
                                                                }}
                                                        >
                                                                <History className="h-3.5 w-3.5 me-2 text-muted-foreground" />
                                                                {r.label}
                                                                <span className="text-[9px] text-muted-foreground ms-auto me-2">
                                                                        {r.icon === "tab" ? "تب" : "اکشن"}
                                                                </span>
                                                                <ArrowLeft className="h-3 w-3 text-muted-foreground" />
                                                        </CommandItem>
                                                ))}
                                        </CommandGroup>
                                )}

                                {showRecent && <CommandSeparator />}

                                {/* ─── اکشن‌های سریع ─── */}
                                <CommandGroup heading="اکشن‌های سریع">
                                        <CommandItem
                                                value="خروجی اکسل کاربران export csv excel خروجی خروجیگیری"
                                                onSelect={() => handleAction("export-users", "خروجی اکسل کاربران", () => void exportUsersCsv())}
                                                disabled={busy === "export-users"}
                                        >
                                                <Download className="h-4 w-4 me-2 text-primary" />
                                                خروجی اکسل کاربران (CSV)
                                                {busy === "export-users" && <span className="text-[10px] text-muted-foreground ms-1">در حال اجرا…</span>}
                                        </CommandItem>
                                        <CommandItem
                                                value="بازسازی فایل های سئو sitemap robots rebuild سئو"
                                                onSelect={() => handleAction("seo-rebuild", "بازسازی فایل‌های سئو", () => void rebuildSeoFiles())}
                                                disabled={busy === "seo-rebuild"}
                                        >
                                                <FileText className="h-4 w-4 me-2 text-primary" />
                                                بازسازی فایل‌های سئو
                                                {busy === "seo-rebuild" && <span className="text-[10px] text-muted-foreground ms-1">در حال اجرا…</span>}
                                        </CommandItem>
                                        <CommandItem
                                                value="پشتیبان گیری فوری بکاپ backup پشتیبان"
                                                onSelect={() => handleAction("backup-now", "پشتیبان‌گیری فوری", () => void backupNow(), "backups")}
                                                disabled={busy === "backup-now"}
                                        >
                                                <Database className="h-4 w-4 me-2 text-primary" />
                                                پشتیبان‌گیری فوری
                                                {busy === "backup-now" && <span className="text-[10px] text-muted-foreground ms-1">در حال اجرا…</span>}
                                        </CommandItem>
                                        <CommandItem
                                                value="ارسال پیام گروهی sms ایمیل پیام"
                                                onSelect={() => handleAction("go-messaging", "ارسال پیام گروهی", () => { onNavigate("messaging"); onOpenChange(false); }, "messaging")}
                                        >
                                                <Mail className="h-4 w-4 me-2 text-primary" />
                                                ارسال پیام گروهی
                                                <span className="text-[10px] text-muted-foreground ms-auto me-2">رفتن به تب پیام‌ها</span>
                                                <ArrowLeft className="h-3 w-3 text-muted-foreground" />
                                        </CommandItem>
                                        <CommandItem
                                                value="مقاله جدید بلاگ نوشتن مقاله تازه blog"
                                                onSelect={() => handleAction("go-blog", "مقالهٔ جدید بلاگ", () => { onNavigate("blog-editor"); onOpenChange(false); }, "blog-editor")}
                                        >
                                                <Newspaper className="h-4 w-4 me-2 text-primary" />
                                                مقالهٔ جدید بلاگ
                                                <span className="text-[10px] text-muted-foreground ms-auto me-2">رفتن به ویرایشگر بلاگ</span>
                                                <ArrowLeft className="h-3 w-3 text-muted-foreground" />
                                        </CommandItem>
                                        <CommandItem onSelect={() => void clearSeoCache()} disabled={busy === "seo-cache"}>
                                                <RefreshCcw className="h-4 w-4 me-2 text-primary" />
                                                پاک‌سازی کش سئو و صفحات
                                                {busy === "seo-cache" && <span className="text-[10px] text-muted-foreground ms-1">در حال اجرا…</span>}
                                        </CommandItem>
                                        <CommandItem onSelect={() => void publishNext()} disabled={busy === "publish-next"}>
                                                <Newspaper className="h-4 w-4 me-2 text-primary" />
                                                انتشار مقالهٔ بعدی صف بلاگ
                                                {busy === "publish-next" && <span className="text-[10px] text-muted-foreground ms-1">در حال اجرا…</span>}
                                        </CommandItem>
                                        <CommandItem onSelect={() => handleTab("licenses", "ساخت لایسنس جدید")}>
                                                <KeyRound className="h-4 w-4 me-2 text-primary" />
                                                ساخت لایسنس جدید
                                                <span className="text-[10px] text-muted-foreground ms-auto me-2">رفتن به تب لایسنس‌ها</span>
                                                <ArrowLeft className="h-3 w-3 text-muted-foreground" />
                                        </CommandItem>
                                </CommandGroup>

                                <CommandSeparator />

                                {/* ─── ورود فوری به سازمان ─── */}
                                {tenants.length > 0 && (
                                        <CommandGroup heading="ورود فوری به سازمان">
                                                {tenants.slice(0, 12).map((t) => (
                                                        <CommandItem
                                                                key={t.id}
                                                                value={`ورود فوری ${t.name} tenant سازمان`}
                                                                onSelect={() => void quickLogin(t.id, t.name)}
                                                                disabled={busy === `login-${t.id}`}
                                                        >
                                                                <Zap className="h-4 w-4 me-2 text-warning" />
                                                                ورود فوری به «{t.name}»
                                                        </CommandItem>
                                                ))}
                                        </CommandGroup>
                                )}

                                <CommandSeparator />

                                {/* ─── ناوبری تب‌ها (۸۲ تب) — گروه‌بندی بر اساس دستهٔ جدید ─── */}
                                <CommandGroup heading="رفتن به تب">
                                        {navItems.map((it) => (
                                                <CommandItem
                                                        key={it.value}
                                                        value={navValue(it)}
                                                        onSelect={() => handleTab(it.value, it.label)}
                                                        className={recentTabs.includes(it.value) ? "opacity-90" : undefined}
                                                >
                                                        <Search className="h-3.5 w-3.5 me-2 text-muted-foreground" />
                                                        {it.label}
                                                        <span className="text-[9px] text-muted-foreground ms-auto me-2">{it.group}</span>
                                                        <ArrowLeft className="h-3 w-3 text-muted-foreground" />
                                                </CommandItem>
                                        ))}
                                </CommandGroup>
                        </CommandList>
                </CommandDialog>
        );
}
