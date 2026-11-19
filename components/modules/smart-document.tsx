"use client";

import * as React from "react";
import {
  Sparkles,
  FileSpreadsheet,
  UploadCloud,
  Loader2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Settings2,
  ChevronDown,
  ChevronLeft,
  RefreshCw,
  ArrowLeft,
  FileCheck2,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ux/empty-state";
import { toast } from "sonner";
import { toPersianDigits, formatCompactToman } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

/**
 * ============ سند هوشمند (Task R14-C) ============
 * حسابدار فایل‌های اکسل/CSV خود را (صورتحساب بانک، لیست فروش/خرید/هزینه،
 * دفتر کل، خروجی هلو/سپیدار) یکجا آپلود می‌کند؛ سیستم ستون‌ها را تشخیص
 * می‌دهد، هر ردیف را به حساب کدینگ نگاشت می‌کند و پیش‌نمایش ترازشده
 * نشان می‌دهد. با تأیید کاربر، به‌ازای هر فایل یک سند «پیش‌نویس» ثبت
 * می‌شود که در هستهٔ حسابداری بازبینی و قطعی می‌شود.
 */

// ============ انواع (قرارداد API: /api/accounting/smart-doc) ============

type ColumnRole =
  | "date"
  | "description"
  | "debit"
  | "credit"
  | "amount"
  | "reference"
  | "account";

const ROLE_LABEL: Record<ColumnRole, string> = {
  date: "تاریخ",
  description: "شرح",
  debit: "بدهکار / برداشت",
  credit: "بستانکار / واریز",
  amount: "مبلغ",
  reference: "شماره سند / پیگیری",
  account: "حساب",
};

interface AccountOption {
  id: string;
  code: string;
  name: string;
  nature: string;
  groupName: string | null;
}

interface SampleRow {
  rowNo: number;
  dateJalali: string;
  description: string;
  debitToman: number;
  creditToman: number;
  accountName: string | null;
  accountCode: string | null;
  ruleLabel: string | null;
  mapped: boolean;
}

interface BreakdownItem {
  ruleId: string | null;
  ruleLabel: string | null;
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  count: number;
  totalToman: number;
}

interface FilePreview {
  fileName: string;
  fileSize: number;
  sheetName: string;
  docType: string;
  docTypeLabel: string;
  headers: string[];
  detectedColumns: Partial<Record<ColumnRole, string>>;
  rowCount: number;
  skippedRows: number;
  unmappedCount: number;
  totalDebitToman: number;
  totalCreditToman: number;
  balanced: boolean;
  warnings: string[];
  sampleRows: SampleRow[];
  accountBreakdown: BreakdownItem[];
  suggestedCounterAccountId: string | null;
  counterAccountName: string | null;
  entryDateISO: string | null;
  lineCount: number;
  error?: string;
}

interface PreviewResponse {
  success: boolean;
  error?: string;
  amountUnit?: string;
  fallbackAccountId?: string | null;
  accounts?: AccountOption[];
  files?: FilePreview[];
}

interface CommitResponse {
  success: boolean;
  error?: string;
  message?: string;
  created?: Array<{
    fileName: string;
    entryId: string;
    number: number;
    lineCount: number;
    dateISO: string;
    description: string;
  }>;
  skipped?: Array<{ fileName: string; reason: string }>;
}

const DOC_TYPE_STYLE: Record<string, string> = {
  bank: "bg-success/10 text-success border-success/30",
  ledger: "bg-primary/10 text-primary border-primary/30",
  sales: "bg-success/10 text-success border-success/30",
  purchase: "bg-warning/10 text-warning border-warning/30",
  expense: "bg-destructive/10 text-destructive border-destructive/30",
  holoo: "bg-primary/10 text-primary border-primary/30",
  generic: "bg-muted text-muted-foreground border-border",
};

const MAX_FILES = 10;
const ALLOWED_EXT = [".xlsx", ".xls", ".csv"];

function formatTomanCompact(n: number): string {
  return formatCompactToman(n);
}

function fileSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
  }
  return `${toPersianDigits(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
}

export function SmartDocument() {
  const [files, setFiles] = React.useState<File[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const [previews, setPreviews] = React.useState<FilePreview[] | null>(null);
  const [accounts, setAccounts] = React.useState<AccountOption[]>([]);
  const [fallbackAccountId, setFallbackAccountId] = React.useState<string>("");
  const [defaultDescription, setDefaultDescription] = React.useState("");
  const [dragOver, setDragOver] = React.useState(false);
  const [expandedFile, setExpandedFile] = React.useState<string | null>(null);
  const [expandedMap, setExpandedMap] = React.useState<string | null>(null);

  // overrideهای کاربر (کلید = نام فایل)
  const [columnOverrides, setColumnOverrides] = React.useState<
    Record<string, Partial<Record<ColumnRole, string>>>
  >({});
  const [accountOverrides, setAccountOverrides] = React.useState<
    Record<string, Record<string, string>>
  >({});
  const [counterOverrides, setCounterOverrides] = React.useState<Record<string, string>>({});
  const [fallbackOverrides, setFallbackOverrides] = React.useState<Record<string, string>>({});
  const [dirty, setDirty] = React.useState(false);
  const [commitResult, setCommitResult] = React.useState<CommitResponse | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ---------- ساخت payload مشترک preview/commit ----------
  const buildOptions = React.useCallback(() => {
    const filesCfg: Record<
      string,
      {
        columnOverrides?: Record<string, string>;
        accountOverrides?: Record<string, string>;
        counterAccountId?: string;
        fallbackAccountId?: string;
      }
    > = {};
    for (const f of files) {
      filesCfg[f.name] = {
        ...(columnOverrides[f.name]
          ? { columnOverrides: columnOverrides[f.name] as Record<string, string> }
          : {}),
        ...(accountOverrides[f.name]
          ? { accountOverrides: accountOverrides[f.name] }
          : {}),
        ...(counterOverrides[f.name] ? { counterAccountId: counterOverrides[f.name] } : {}),
        ...(fallbackOverrides[f.name]
          ? { fallbackAccountId: fallbackOverrides[f.name] }
          : {}),
      };
    }
    return {
      defaultDescription: defaultDescription.trim() || undefined,
      fallbackAccountId: fallbackAccountId || undefined,
      files: filesCfg,
    };
  }, [
    files,
    columnOverrides,
    accountOverrides,
    counterOverrides,
    fallbackOverrides,
    fallbackAccountId,
    defaultDescription,
  ]);

  // ---------- فراخوانی preview ----------
  const analyze = React.useCallback(
    async (fileList: File[]) => {
      if (fileList.length === 0) return;
      setLoading(true);
      setCommitResult(null);
      try {
        const fd = new FormData();
        fd.append("mode", "preview");
        fd.append("options", JSON.stringify(buildOptions()));
        for (const f of fileList) fd.append("files", f, f.name);
        const res = await authFetch("/api/accounting/smart-doc", {
          method: "POST",
          body: fd,
        });
        const json = (await res.json().catch(() => ({}))) as PreviewResponse;
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "خطا در تحلیل فایل‌ها");
        }
        setPreviews(json.files ?? []);
        setAccounts(json.accounts ?? []);
        if (json.fallbackAccountId) setFallbackAccountId(json.fallbackAccountId);
        setDirty(false);
        const withError = (json.files ?? []).filter((f) => f.error);
        if (withError.length > 0) {
          toast.warning(
            `${toPersianDigits(withError.length)} فایل قابل خواندن نبود — جزئیات در کارت مربوطه`
          );
        } else {
          toast.success(
            `${toPersianDigits((json.files ?? []).length)} فایل تحلیل شد — پیش‌نمایش را بازبینی کنید`
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "خطای ناشناخته");
        setPreviews(null);
      } finally {
        setLoading(false);
      }
    },
    [buildOptions]
  );

  // ---------- افزودن فایل ----------
  const addFiles = React.useCallback(
    (incoming: FileList | File[]) => {
      const arr = Array.from(incoming);
      const valid: File[] = [];
      for (const f of arr) {
        const lower = f.name.toLowerCase();
        if (!ALLOWED_EXT.some((ext) => lower.endsWith(ext))) {
          toast.error(`فرمت «${f.name}» پشتیبانی نمی‌شود — فقط xlsx/xls/csv`);
          continue;
        }
        if (f.size > 5 * 1024 * 1024) {
          toast.error(`حجم «${f.name}» بیش از ۵ مگابایت است`);
          continue;
        }
        valid.push(f);
      }
      if (valid.length === 0) return;
      // نام تکراری → جایگزین
      const merged = [...files.filter((f) => !valid.some((v) => v.name === f.name)), ...valid];
      if (merged.length > MAX_FILES) {
        toast.error(`حداکثر ${toPersianDigits(MAX_FILES)} فایل — برخی فایل‌ها اضافه نشدند`);
      }
      const limited = merged.slice(0, MAX_FILES);
      setFiles(limited);
      void analyze(limited);
    },
    [files, analyze]
  );

  // ---------- حذف فایل ----------
  const removeFile = React.useCallback(
    (name: string) => {
      const next = files.filter((f) => f.name !== name);
      setFiles(next);
      setColumnOverrides((o) => {
        const c = { ...o };
        delete c[name];
        return c;
      });
      setAccountOverrides((o) => {
        const c = { ...o };
        delete c[name];
        return c;
      });
      setCounterOverrides((o) => {
        const c = { ...o };
        delete c[name];
        return c;
      });
      setFallbackOverrides((o) => {
        const c = { ...o };
        delete c[name];
        return c;
      });
      if (next.length === 0) {
        setPreviews(null);
        setCommitResult(null);
        return;
      }
      void analyze(next);
    },
    [files, analyze]
  );

  // ---------- ثبت نهایی ----------
  const commit = React.useCallback(async () => {
    if (files.length === 0 || committing) return;
    const balancedCount = (previews ?? []).filter((p) => p.balanced && !p.error).length;
    if (balancedCount === 0) {
      toast.error("هیچ فایل ترازشده‌ای برای ثبت وجود ندارد");
      return;
    }
    setCommitting(true);
    try {
      const fd = new FormData();
      fd.append("mode", "commit");
      fd.append("options", JSON.stringify(buildOptions()));
      for (const f of files) fd.append("files", f, f.name);
      const res = await authFetch("/api/accounting/smart-doc", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as CommitResponse;
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "خطا در ثبت اسناد");
      }
      setCommitResult(json);
      if ((json.created ?? []).length > 0) {
        toast.success(
          json.message ?? `${toPersianDigits(json.created?.length ?? 0)} سند پیش‌نویس ثبت شد`
        );
      } else {
        toast.error("هیچ سندی ثبت نشد — فایل‌های ردشده را بازبینی کنید");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطای ناشناخته");
    } finally {
      setCommitting(false);
    }
  }, [files, committing, previews, buildOptions]);

  // ---------- رفتن به هستهٔ حسابداری ----------
  const goToCoreAccounting = React.useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("hoshhesab:navigate-link", { detail: "/core" })
    );
  }, []);

  // ---------- تغییر نقش ستون ----------
  const setColumnRole = React.useCallback(
    (fileName: string, role: ColumnRole, header: string) => {
      setColumnOverrides((prev) => ({
        ...prev,
        [fileName]: { ...(prev[fileName] ?? {}), [role]: header },
      }));
      setDirty(true);
    },
    []
  );

  // ---------- تغییر حساب قاعده ----------
  const setRuleAccount = React.useCallback(
    (fileName: string, ruleId: string | null, accountId: string) => {
      const key = ruleId ?? "unmapped";
      setAccountOverrides((prev) => ({
        ...prev,
        [fileName]: { ...(prev[fileName] ?? {}), [key]: accountId },
      }));
      setDirty(true);
    },
    []
  );

  const balancedPreviews = (previews ?? []).filter((p) => p.balanced && !p.error);
  const unbalancedPreviews = (previews ?? []).filter((p) => !p.balanced && !p.error);
  const totalLines = balancedPreviews.reduce((s, p) => s + p.lineCount, 0);
  const createdEntries = commitResult?.created ?? [];

  const accountLabel = React.useCallback(
    (a: AccountOption) => `${a.code} — ${a.name}`,
    []
  );

  return (
    <div className="space-y-6" dir="rtl">
      {/* ================= سربرگ ================= */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">سند هوشمند</h2>
            <Badge className="text-[10px] bg-primary/10 text-primary border-primary/30">
              جدید
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            فایل اکسل یا CSV حسابداری خود را (صورتحساب بانک، لیست فروش/خرید/هزینه، دفتر کل،
            خروجی هلو/سپیدار) بگذارید — سیستم ستون‌ها و حساب‌ها را تشخیص می‌دهد و سند
            ترازشده می‌سازد.
          </p>
        </div>
      </div>

      {/* ================= ناحیهٔ رها کردن فایل ================= */}
      <Card className="card-hover">
        <CardContent className="p-4 sm:p-6">
          <div
            role="button"
            tabIndex={0}
            aria-label="آپلود فایل‌های اکسل یا CSV"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 sm:p-10 text-center transition-colors cursor-pointer min-h-44 ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm font-medium">در حال تحلیل هوشمند فایل‌ها…</p>
                <p className="text-xs text-muted-foreground">
                  تشخیص نوع سند، ستون‌ها و نگاشت حساب‌ها
                </p>
              </>
            ) : (
              <>
                <div className="rounded-full bg-primary/10 p-3">
                  <UploadCloud className="h-7 w-7 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    فایل‌ها را اینجا رها کنید یا کلیک کنید
                  </p>
                  <p className="text-xs text-muted-foreground">
                    فرمت‌های xlsx / xls / csv — هر تعداد فایل؛ همه با هم پردازش می‌شوند (حداکثر{" "}
                    {toPersianDigits(MAX_FILES)} فایل × ۵ مگابایت)
                  </p>
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              multiple
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {/* چیپ فایل‌ها */}
          {files.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {files.map((f) => (
                <div
                  key={f.name}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium max-w-40 truncate">{f.name}</span>
                  <span className="text-muted-foreground">{fileSizeLabel(f.size)}</span>
                  <button
                    type="button"
                    aria-label={`حذف ${f.name}`}
                    onClick={() => removeFile(f.name)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {previews && dirty && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-7"
                  onClick={() => void analyze(files)}
                  disabled={loading}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  بازتحلیل با تنظیمات جدید
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================= تنظیمات عمومی ================= */}
      {previews && previews.length > 0 && (
        <Card className="card-hover">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" />
              تنظیمات کلی اسناد
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="smart-desc" className="text-xs">
                شرح پیش‌فرض سند (اختیاری)
              </Label>
              <Input
                id="smart-desc"
                value={defaultDescription}
                onChange={(e) => {
                  setDefaultDescription(e.target.value);
                  setDirty(true);
                }}
                placeholder="مثلاً: اسناد ایمپورت‌شده از اکسل — فروردین ۱۴۰۴"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                حساب موقت (برای قلم‌های شناسایی‌نشده)
              </Label>
              <Select
                value={fallbackAccountId || undefined}
                onValueChange={(v) => {
                  setFallbackAccountId(v);
                  setDirty(true);
                }}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="انتخاب حساب" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-xs">
                      {accountLabel(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================= بنر خلاصه ================= */}
      {previews && previews.length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
          <Scale className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">
              {toPersianDigits(previews.length)} فایل →{" "}
              {toPersianDigits(balancedPreviews.length)} سند پیش‌نویس با{" "}
              {toPersianDigits(totalLines.toLocaleString("en-US"))} قلم
              {unbalancedPreviews.length > 0
                ? ` — ${toPersianDigits(unbalancedPreviews.length)} فایل تراز نیست و ثبت نمی‌شود`
                : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              پس از بررسی در «هسته حسابداری»، سند را قطعی کنید. ثبت نهایی به‌صورت پیش‌نویس
              (DRAFT) انجام می‌شود.
            </p>
          </div>
        </div>
      )}

      {/* ================= کارت‌های پیش‌نمایش هر فایل ================= */}
      {previews &&
        previews.map((p) => (
          <Card key={p.fileName} className="card-hover">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                  <CardTitle className="text-base truncate">{p.fileName}</CardTitle>
                  <Badge
                    variant="outline"
                    className={`text-[10px] shrink-0 ${DOC_TYPE_STYLE[p.docType] ?? DOC_TYPE_STYLE.generic}`}
                  >
                    {p.docTypeLabel}
                  </Badge>
                  {p.sheetName && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">
                      شیت: {p.sheetName}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {p.error ? (
                    <Badge className="text-[10px] bg-destructive/10 text-destructive">
                      خطا در خواندن
                    </Badge>
                  ) : p.balanced ? (
                    <Badge className="text-[10px] gap-1 bg-success/10 text-success">
                      <CheckCircle2 className="h-3 w-3" />
                      تراز است
                    </Badge>
                  ) : (
                    <Badge className="text-[10px] gap-1 bg-destructive/10 text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      تراز نیست
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    aria-label={`حذف فایل ${p.fileName}`}
                    onClick={() => removeFile(p.fileName)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {p.error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {p.error}
                </div>
              ) : (
              <>
                {/* آمار فایل */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-lg bg-muted/40 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">ردیف‌ها</p>
                    <p className="font-bold text-lg tnum">
                      {toPersianDigits(p.rowCount)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">جمع بدهکار</p>
                    <p className="font-bold text-sm tnum">
                      {formatTomanCompact(p.totalDebitToman)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">جمع بستانکار</p>
                    <p className="font-bold text-sm tnum">
                      {formatTomanCompact(p.totalCreditToman)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">حساب متقابل</p>
                    <p className="font-bold text-xs tnum truncate" title={p.counterAccountName ?? undefined}>
                      {p.counterAccountName ?? "—"}
                    </p>
                  </div>
                </div>

                {/* هشدارها */}
                {p.warnings.length > 0 && (
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-1.5">
                    {p.warnings.slice(0, 6).map((w, i) => (
                      <p key={i} className="text-xs text-warning flex items-start gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        {w}
                      </p>
                    ))}
                    {p.warnings.length > 6 && (
                      <p className="text-[10px] text-muted-foreground">
                        و {toPersianDigits(p.warnings.length - 6)} هشدار دیگر…
                      </p>
                    )}
                  </div>
                )}

                {/* ستون‌های تشخیص‌داده‌شده */}
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(p.detectedColumns).map(([role, header]) => (
                    <Badge
                      key={role}
                      variant="secondary"
                      className="text-[10px] gap-1 font-normal"
                    >
                      <span className="font-semibold">
                        {ROLE_LABEL[role as ColumnRole] ?? role}:
                      </span>
                      {header}
                    </Badge>
                  ))}
                </div>

                {/* تنظیم ستون‌ها (بازشو) */}
                <div className="rounded-lg border border-border/60">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setExpandedFile(expandedFile === p.fileName ? null : p.fileName)
                    }
                    aria-expanded={expandedFile === p.fileName}
                  >
                    <span className="flex items-center gap-1.5">
                      <Settings2 className="h-3.5 w-3.5" />
                      تنظیم ستون‌ها (در صورت تشخیص اشتباه، اصلاح کنید)
                    </span>
                    {expandedFile === p.fileName ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronLeft className="h-4 w-4" />
                    )}
                  </button>
                  {expandedFile === p.fileName && (
                    <div className="border-t border-border/60 p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {(Object.keys(ROLE_LABEL) as ColumnRole[]).map((role) => (
                        <div key={role} className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">
                            {ROLE_LABEL[role]}
                          </Label>
                          <Select
                            value={
                              (columnOverrides[p.fileName]?.[role] ??
                                p.detectedColumns[role] ??
                                "none") as string
                            }
                            onValueChange={(v) => setColumnRole(p.fileName, role, v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-64">
                              <SelectItem value="none" className="text-xs">
                                — بدون این نقش —
                              </SelectItem>
                              {p.headers
                                .filter((h) => h.trim() !== "")
                                .map((h) => (
                                  <SelectItem key={h} value={h} className="text-xs">
                                    {h}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* تنظیم نگاشت حساب‌ها (بازشو) */}
                <div className="rounded-lg border border-border/60">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setExpandedMap(expandedMap === p.fileName ? null : p.fileName)
                    }
                    aria-expanded={expandedMap === p.fileName}
                  >
                    <span className="flex items-center gap-1.5">
                      <Scale className="h-3.5 w-3.5" />
                      تنظیم نگاشت حساب‌ها
                      {p.unmappedCount > 0 && (
                        <Badge className="text-[9px] bg-warning/10 text-warning">
                          {toPersianDigits(p.unmappedCount)} قلم بدون حساب
                        </Badge>
                      )}
                    </span>
                    {expandedMap === p.fileName ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronLeft className="h-4 w-4" />
                    )}
                  </button>
                  {expandedMap === p.fileName && (
                    <div className="border-t border-border/60 p-3 space-y-3">
                      {/* حساب متقابل */}
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">
                            حساب متقابل (بانک/صندوق)
                          </Label>
                          <Select
                            value={
                              counterOverrides[p.fileName] ??
                              p.suggestedCounterAccountId ??
                              "none"
                            }
                            onValueChange={(v) => {
                              setCounterOverrides((prev) => ({
                                ...prev,
                                [p.fileName]: v === "none" ? "" : v,
                              }));
                              setDirty(true);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="خودکار" />
                            </SelectTrigger>
                            <SelectContent className="max-h-64">
                              <SelectItem value="none" className="text-xs">
                                — خودکار —
                              </SelectItem>
                              {accounts.map((a) => (
                                <SelectItem key={a.id} value={a.id} className="text-xs">
                                  {accountLabel(a)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">
                            حساب موقت این فایل
                          </Label>
                          <Select
                            value={
                              fallbackOverrides[p.fileName] ?? fallbackAccountId ?? "none"
                            }
                            onValueChange={(v) => {
                              setFallbackOverrides((prev) => ({
                                ...prev,
                                [p.fileName]: v === "none" ? "" : v,
                              }));
                              setDirty(true);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="پیش‌فرض کلی" />
                            </SelectTrigger>
                            <SelectContent className="max-h-64">
                              <SelectItem value="none" className="text-xs">
                                — پیش‌فرض کلی —
                              </SelectItem>
                              {accounts.map((a) => (
                                <SelectItem key={a.id} value={a.id} className="text-xs">
                                  {accountLabel(a)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* نگاشت قواعد → حساب */}
                      <div className="space-y-1.5 max-h-72 overflow-y-auto pl-1">
                        {p.accountBreakdown.map((b, i) => {
                          const overrideKey = b.ruleId ?? "unmapped";
                          const currentAccountId =
                            accountOverrides[p.fileName]?.[overrideKey] ??
                            b.accountId ??
                            "";
                          return (
                            <div
                              key={`${b.ruleId}-${b.accountId}-${i}`}
                              className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${
                                b.accountId
                                  ? "border-border/60 bg-muted/20"
                                  : "border-warning/40 bg-warning/5"
                              }`}
                            >
                              <div className="flex-1 min-w-40">
                                <p className="text-xs font-medium">
                                  {b.ruleLabel ?? "بدون قاعده (شناسایی‌نشده)"}
                                  {b.ruleId && !b.accountId && (
                                    <Badge className="mr-1.5 text-[9px] bg-warning/10 text-warning">
                                      حساب متناظر یافت نشد
                                    </Badge>
                                  )}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {toPersianDigits(b.count)} قلم —{" "}
                                  {formatTomanCompact(b.totalToman)}
                                  {b.accountName ? ` — ${b.accountName}` : ""}
                                </p>
                              </div>
                              <Select
                                value={currentAccountId || undefined}
                                onValueChange={(v) =>
                                  setRuleAccount(p.fileName, b.ruleId, v)
                                }
                              >
                                <SelectTrigger className="h-8 text-xs w-full sm:w-56">
                                  <SelectValue placeholder="انتخاب حساب…" />
                                </SelectTrigger>
                                <SelectContent className="max-h-64">
                                  {accounts.map((a) => (
                                    <SelectItem key={a.id} value={a.id} className="text-xs">
                                      {accountLabel(a)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          );
                        })}
                        {p.accountBreakdown.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-4">
                            قلم نگاشت‌پذیری برای این فایل یافت نشد
                          </p>
                        )}
                      </div>
                      {dirty && (
                        <p className="text-[10px] text-warning flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          برای اعمال تغییرات، «بازتحلیل با تنظیمات جدید» را بزنید
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* جدول نمونه ردیف‌ها */}
                <div className="overflow-x-auto rounded-lg border border-border/60">
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr className="text-muted-foreground">
                          <th className="px-3 py-2 text-start font-medium">#</th>
                          <th className="px-3 py-2 text-start font-medium">تاریخ</th>
                          <th className="px-3 py-2 text-start font-medium">شرح</th>
                          <th className="px-3 py-2 text-end font-medium">بدهکار</th>
                          <th className="px-3 py-2 text-end font-medium">بستانکار</th>
                          <th className="px-3 py-2 text-start font-medium">حساب</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.sampleRows.map((s, i) => (
                          <tr
                            key={i}
                            className={`border-t border-border/40 ${
                              s.mapped ? "" : "bg-warning/5"
                            }`}
                          >
                            <td className="px-3 py-2 text-muted-foreground tnum">
                              {toPersianDigits(s.rowNo)}
                            </td>
                            <td className="px-3 py-2 tnum whitespace-nowrap">
                              {s.dateJalali || "—"}
                            </td>
                            <td className="px-3 py-2 max-w-52 truncate" title={s.description}>
                              {s.description || "—"}
                            </td>
                            <td className="px-3 py-2 text-end tnum whitespace-nowrap">
                              {s.debitToman > 0 ? formatTomanCompact(s.debitToman) : "—"}
                            </td>
                            <td className="px-3 py-2 text-end tnum whitespace-nowrap">
                              {s.creditToman > 0 ? formatTomanCompact(s.creditToman) : "—"}
                            </td>
                            <td className="px-3 py-2">
                              {s.mapped ? (
                                <span className="inline-flex items-center gap-1">
                                  <span className="text-[10px] text-muted-foreground tnum">
                                    {s.accountCode ?? ""}
                                  </span>
                                  <span className="font-medium">{s.accountName}</span>
                                </span>
                              ) : (
                                <Badge className="text-[9px] bg-warning/10 text-warning">
                                  شناسایی نشد — از «تنظیم نگاشت حساب‌ها»
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {p.rowCount > p.sampleRows.length && (
                    <p className="border-t border-border/40 px-3 py-1.5 text-[10px] text-muted-foreground">
                      نمایش {toPersianDigits(p.sampleRows.length)} ردیف از{" "}
                      {toPersianDigits(p.rowCount)} — بقیه در سند نهایی ثبت می‌شوند
                    </p>
                  )}
                </div>
              </>
              )}
            </CardContent>
          </Card>
        ))}

      {/* ================= دکمهٔ ثبت ================= */}
      {previews && previews.length > 0 && !commitResult && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground">
            {balancedPreviews.length > 0
              ? unbalancedPreviews.length > 0
                ? `فایل‌های ترازنشده (${toPersianDigits(unbalancedPreviews.length)} مورد) از ثبت حذف می‌شوند`
                : "همه فایل‌ها ترازند و آمادهٔ ثبت‌اند"
              : "هیچ فایل ترازشده‌ای برای ثبت وجود ندارد"}
          </p>
          <Button
            className="gap-1.5"
            disabled={committing || loading || balancedPreviews.length === 0}
            onClick={() => void commit()}
          >
            {committing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {committing ? "در حال ثبت اسناد…" : "تأیید و ثبت اسناد"}
          </Button>
        </div>
      )}

      {/* ================= کارت موفقیت پس از ثبت ================= */}
      {commitResult && (
        <Card className="border-success/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-success">
              <FileCheck2 className="h-4 w-4" />
              {createdEntries.length > 0
                ? `${toPersianDigits(createdEntries.length)} سند پیش‌نویس ثبت شد`
                : "هیچ سندی ثبت نشد"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {commitResult.message ?? "عملیات ثبت کامل شد."}
            </p>
            {createdEntries.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr className="text-muted-foreground">
                      <th className="px-3 py-2 text-start font-medium">فایل</th>
                      <th className="px-3 py-2 text-start font-medium">شماره سند</th>
                      <th className="px-3 py-2 text-start font-medium">تاریخ</th>
                      <th className="px-3 py-2 text-end font-medium">اقلام</th>
                      <th className="px-3 py-2 text-start font-medium">شرح</th>
                    </tr>
                  </thead>
                  <tbody>
                    {createdEntries.map((c) => (
                      <tr key={c.entryId} className="border-t border-border/40">
                        <td className="px-3 py-2 max-w-40 truncate" title={c.fileName}>
                          {c.fileName}
                        </td>
                        <td className="px-3 py-2 font-semibold tnum">
                          {toPersianDigits(c.number)}
                        </td>
                        <td className="px-3 py-2 tnum">{c.dateISO}</td>
                        <td className="px-3 py-2 text-end tnum">
                          {toPersianDigits(c.lineCount)}
                        </td>
                        <td className="px-3 py-2 max-w-52 truncate" title={c.description}>
                          {c.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(commitResult.skipped ?? []).length > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-1">
                {(commitResult.skipped ?? []).map((s, i) => (
                  <p key={i} className="text-xs text-warning flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      <strong>{s.fileName}:</strong> {s.reason}
                    </span>
                  </p>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button className="gap-1.5" onClick={goToCoreAccounting}>
                <ArrowLeft className="h-4 w-4" />
                مشاهده در هسته حسابداری
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  setFiles([]);
                  setPreviews(null);
                  setCommitResult(null);
                  setColumnOverrides({});
                  setAccountOverrides({});
                  setCounterOverrides({});
                  setFallbackOverrides({});
                  setDefaultDescription("");
                  setDirty(false);
                }}
              >
                <UploadCloud className="h-4 w-4" />
                فایل‌های جدید
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================= حالت خالی ================= */}
      {files.length === 0 && !previews && !loading && (
        <Card className="card-hover">
          <CardContent className="p-0">
            <EmptyState
              icon={FileSpreadsheet}
              title="فایلی انتخاب نشده است"
              description="فایل اکسل یا CSV خود را در کادر بالا رها کنید؛ مثلاً صورتحساب بانکی با ستون‌های تاریخ، شرح، بدهکار و بستانکار. سیستم به‌طور خودکار نوع سند و حساب‌های متناظر را تشخیص می‌دهد."
              className="py-8"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
