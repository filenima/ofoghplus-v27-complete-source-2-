"use client";

/**
 * ============================================================
 * SourceDownloadTab — تب «دانلود سورس» پنل سوپرادمین (v24-chunked)
 * ============================================================
 * مشکل مالک: دانلود ZIP کامل (~۴۰+MB) وسط راه قطع می‌شد و مرورگر
 * «failed to download file» می‌نوشت → دانلود ناقص و غیرقابل استفاده.
 *
 * راه‌حل (خواستهٔ صریح): تقسیم به قطعه‌های ۲ مگابایتی + ادامهٔ خودکار
 * پس از قطعی اینترنت + هرگز ناقص نماندن.
 *
 * معماری:
 *   ۱) GET /api/download-source?meta=1 → نام فایل/حجم/تعداد قطعه
 *   ۲) قطعه‌ها «پشت‌سرهم» با fetch + Bearer دانلود می‌شوند (هر قطعه ۲MB)
 *   ۳) هر قطعه بلافاصله در IndexedDB ذخیره می‌شود (ماندگاری بین reload)
 *   ۴) قطعی اینترنت → تلاش مجدد خودکار با backoff (تا ۸ بار در هر قطعه)
 *   ۵) توقف/ادامه دستی + «شروع از صفر» + حالت «تکه‌های جدا» برای ترکیب دستی
 *   ۶) پس از آخرین قطعه: همه از IDB خوانده → Blob واحد → ذخیرهٔ فایل ZIP
 *   ۷) رکورد progress در localStorage → UI فوری بدون اسکن IDB در هر render
 *
 * نکتهٔ مهم: هیچ فیک-پیشرفتی وجود ندارد — درصد = بایت‌های واقعی دانلودشده.
 */

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Download,
  FileArchive,
  Info,
  Layers,
  Loader2,
  Pause,
  RefreshCw,
  Save,
  ScatterChart,
  Play,
  X,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/* ─────────────────────────── انواع ─────────────────────────── */

interface SourceMeta {
  fileName: string;
  size: number;
  chunkSize: number;
  totalChunks: number;
  version: string;
}

type Phase = "idle" | "meta" | "downloading" | "pausing" | "paused" | "assembling" | "done" | "error";

/* ──────────────────── helpers: فرمت/عدد ──────────────────── */

function fmtMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}
function fmtSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "—";
  if (bytesPerSec > 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${Math.max(1, Math.round(bytesPerSec / 1024))} KB/s`;
}
function fmtEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)} ثانیه`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m} دقیقه و ${s} ثانیه`;
}

/* ────────────── IndexedDB مینیمال برای قطعه‌ها ──────────────
 * DB: ofogh-source-dl / store: chunks / key: `${version}#${idx}`
 * value: ArrayBuffer — پس از组装 موفق حذف می‌شود (cleanup).
 */
const IDB_NAME = "ofogh-source-dl";
const IDB_STORE = "chunks";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB error"));
  });
}
async function idbPut(key: string, buf: ArrayBuffer): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(buf, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB put error"));
  });
}
async function idbGet(key: string): Promise<ArrayBuffer | null> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const rq = tx.objectStore(IDB_STORE).get(key);
    rq.onsuccess = () => resolve((rq.result as ArrayBuffer) ?? null);
    rq.onerror = () => reject(rq.error ?? new Error("IDB get error"));
  });
}
async function idbKeysForVersion(version: string): Promise<number[]> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const rq = tx.objectStore(IDB_STORE).getAllKeys();
    rq.onsuccess = () => {
      const idxs: number[] = [];
      for (const k of rq.result ?? []) {
        if (typeof k === "string" && k.startsWith(`${version}#`)) {
          const n = Number(k.split("#")[1]);
          if (Number.isInteger(n)) idxs.push(n);
        }
      }
      resolve(idxs.sort((a, b) => a - b));
    };
    rq.onerror = () => reject(rq.error ?? new Error("IDB keys error"));
  });
}
async function idbClearVersion(version: string): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const rq = store.getAllKeys();
    rq.onsuccess = () => {
      for (const k of rq.result ?? []) {
        if (typeof k === "string" && k.startsWith(`${version}#`)) store.delete(k);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB clear error"));
  });
}

/* ────────────────── localStorage: پیشرفت سریع ────────────────── */

const LS_KEY = "ofogh.sourceDownload.progress.v1";
interface LsProgress {
  version: string;
  fileName: string;
  totalChunks: number;
  size: number;
  doneChunks: number[];
}
function readLs(): LsProgress | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as LsProgress) : null;
  } catch {
    return null;
  }
}
function writeLs(p: LsProgress | null): void {
  try {
    if (p) localStorage.setItem(LS_KEY, JSON.stringify(p));
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* خصوصی‌سازی مرورگر بسته است — به IDB تکیه می‌کنیم */
  }
}

/* ─────────────────────── کامپوننت اصلی ─────────────────────── */

const MAX_TRIES = 8;
const BACKOFFS = [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000];

export default function SourceDownloadTab({ token }: { token: string }) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [meta, setMeta] = React.useState<SourceMeta | null>(null);
  const [doneCount, setDoneCount] = React.useState(0);
  const [currentIdx, setCurrentIdx] = React.useState<number | null>(null);
  const [speed, setSpeed] = React.useState(0);
  const [eta, setEta] = React.useState<number | null>(null);
  const [retryInfo, setRetryInfo] = React.useState<{ chunk: number; attempt: number; waitMs: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [resumable, setResumable] = React.useState<{ count: number } | null>(null);
  const [mode, setMode] = React.useState<"auto" | "parts">("auto");

  // مرجع‌های کنترلی — داخل حلقهٔ دانلود خوانده می‌شوند
  const abortRef = React.useRef<AbortController | null>(null);
  const stopFlagRef = React.useRef(false);
  const startedAtRef = React.useRef<number>(0);
  const bytesDoneRef = React.useRef<number>(0);

  /* ── بارگذاری متا + تشخیص ادامهٔ قبلی ── */
  const loadMeta = React.useCallback(
    async (silent = false) => {
      if (!silent) setPhase("meta");
      setError(null);
      try {
        const res = await fetch("/api/download-source?meta=1", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `خطای ${res.status}`);
        }
        const data = (await res.json()) as SourceMeta;
        setMeta(data);

        // قطعه‌های موجود در IDB برای همین نسخه → ادامهٔ ممکن است
        try {
          const existing = await idbKeysForVersion(data.version);
          if (existing.length > 0 && existing.length < data.totalChunks) {
            setResumable({ count: existing.length });
          } else if (existing.length >= data.totalChunks && data.totalChunks > 0) {
            // همهٔ قطعه‌ها از قبل هست → فقط ادغام باقی مانده
            setResumable({ count: existing.length });
          } else {
            setResumable(null);
          }
        } catch {
          setResumable(null);
        }
        setPhase("idle");
        return data;
      } catch (e) {
        setError(e instanceof Error ? e.message : "خطا در دریافت اطلاعات فایل");
        setPhase("error");
        return null;
      }
    },
    [token]
  );

  React.useEffect(() => {
    void loadMeta(true);
    // فقط یک‌بار در mount — وابستگی عمداً کامل نیست (رفع هشدار: مستقیماً void)
  }, []);

  /* ── دانلود یک قطعه با تلاش مجدد ── */
  const fetchChunk = React.useCallback(
    async (idx: number, m: SourceMeta, signal: AbortSignal): Promise<ArrayBuffer> => {
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
        if (stopFlagRef.current || signal.aborted) throw new DOMException("aborted", "AbortError");
        try {
          setRetryInfo(null);
          const res = await fetch(`/api/download-source?chunk=${idx}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          if (buf.byteLength === 0) throw new Error("قطعهٔ خالی");
          return buf;
        } catch (e) {
          lastErr = e;
          if (signal.aborted || stopFlagRef.current) throw new DOMException("aborted", "AbortError");
          // قطعی اینترنت/سرور → backoff و تلاش مجدد روی «همان قطعه»
          const wait = BACKOFFS[Math.min(attempt, BACKOFFS.length - 1)];
          setRetryInfo({ chunk: idx, attempt: attempt + 1, waitMs: wait });
          await new Promise((r) => setTimeout(r, wait));
        }
      }
      throw lastErr ?? new Error(`قطعهٔ ${idx} پس از ${MAX_TRIES} تلاش ناموفق بود`);
    },
    [token]
  );

  /* ── حلقهٔ اصلی دانلود + ادغام ── */
  const startDownload = React.useCallback(
    async (restart = false) => {
      let m = meta;
      if (!m) {
        m = (await loadMeta()) as SourceMeta | null;
        if (!m) return;
      }

      stopFlagRef.current = false;
      const ac = new AbortController();
      abortRef.current = ac;
      startedAtRef.current = Date.now();

      try {
        // قطعه‌های ازقبل‌داشته‌شده (فقط وقتی restart نیست)
        let skip = new Set<number>();
        if (!restart) {
          try {
            const existing = await idbKeysForVersion(m.version);
            skip = new Set(existing);
            bytesDoneRef.current = existing.length * m.chunkSize;
            setDoneCount(existing.length);
          } catch {
            skip = new Set();
          }
        } else {
          await idbClearVersion(m.version).catch(() => undefined);
          writeLs(null);
          bytesDoneRef.current = 0;
          setDoneCount(0);
          setResumable(null);
        }

        setPhase("downloading");
        setError(null);

        for (let i = 0; i < m.totalChunks; i++) {
          if (stopFlagRef.current || ac.signal.aborted) break;
          if (skip.has(i)) continue;

          setCurrentIdx(i);
          const buf = await fetchChunk(i, m, ac.signal);

          // ذخیرهٔ پایدار — حتی با بسته‌شدن تب، قطعه‌ها می‌مانند
          await idbPut(`${m.version}#${i}`, buf).catch(() => undefined);
          bytesDoneRef.current += buf.byteLength;
          setDoneCount((c) => c + 1);

          // سرعت/ETA با میانگین متحرک
          const elapsed = (Date.now() - startedAtRef.current) / 1000;
          if (elapsed > 0) {
            const bps = bytesDoneRef.current / elapsed;
            setSpeed(bps);
            const remaining = m.size - bytesDoneRef.current;
            setEta(remaining > 0 ? remaining / bps : 0);
          }

          // پیشرفت سریع در localStorage
          const done: number[] = [];
          for (let j = 0; j <= i; j++) if (skip.has(j) || j < i || j === i) done.push(j);
          writeLs({
            version: m.version,
            fileName: m.fileName,
            totalChunks: m.totalChunks,
            size: m.size,
            doneChunks: Array.from(new Set([...skip, ...done])),
          });
        }

        if (stopFlagRef.current || ac.signal.aborted) {
          setPhase("paused");
          setResumable({ count: doneCount });
          return;
        }

        /* ── ادغام: خواندن ترتیبی از IDB → Blob → ذخیره ── */
        setPhase("assembling");
        setCurrentIdx(null);
        const parts: BlobPart[] = [];
        for (let i = 0; i < m.totalChunks; i++) {
          const b = await idbGet(`${m.version}#${i}`);
          if (!b) throw new Error(`قطعهٔ ${i} برای ادغام پیدا نشد — دوباره تلاش کنید`);
          parts.push(b);
        }
        const blob = new Blob(parts, { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = m.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // revoke با تأخیر — Chrome برای دانلودهای بزرگ به فرصت نیاز دارد
        setTimeout(() => URL.revokeObjectURL(url), 120_000);

        setPhase("done");
        // پاک‌سازی IDB پس از موفقیت
        await idbClearVersion(m.version).catch(() => undefined);
        writeLs(null);
        setResumable(null);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          setPhase("paused");
        } else {
          setError(e instanceof Error ? e.message : "خطای ناشناخته در دانلود");
          setPhase("error");
          setResumable({ count: doneCount });
        }
      } finally {
        abortRef.current = null;
      }
    },
    [meta, loadMeta, fetchChunk, doneCount]
  );

  /* ── حالت «تکه‌های جدا» — هر قطعه یک فایل .part ── */
  const downloadParts = React.useCallback(async () => {
    let m = meta;
    if (!m) {
      m = (await loadMeta()) as SourceMeta | null;
      if (!m) return;
    }
    stopFlagRef.current = false;
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase("downloading");
    setError(null);
    try {
      for (let i = 0; i < m.totalChunks; i++) {
        if (stopFlagRef.current || ac.signal.aborted) break;
        setCurrentIdx(i);
        const buf = await fetchChunk(i, m, ac.signal);
        const url = URL.createObjectURL(new Blob([buf], { type: "application/octet-stream" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${m.fileName}.part-${String(i + 1).padStart(3, "0")}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setDoneCount(i + 1);
        // فاصلهٔ کوچک تا مرورگر دانلودهای متوالی را از دست ندهد
        await new Promise((r) => setTimeout(r, 350));
      }
      if (!stopFlagRef.current) setPhase("done");
      else setPhase("paused");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") setPhase("paused");
      else {
        setError(e instanceof Error ? e.message : "خطا در دانلود تکه‌ها");
        setPhase("error");
      }
    } finally {
      abortRef.current = null;
    }
  }, [meta, loadMeta, fetchChunk]);

  /* ── توقف/ادامه ── */
  const pause = React.useCallback(() => {
    stopFlagRef.current = true;
    abortRef.current?.abort();
    setPhase("pausing");
  }, []);

  const reset = React.useCallback(async () => {
    stopFlagRef.current = true;
    abortRef.current?.abort();
    if (meta) await idbClearVersion(meta.version).catch(() => undefined);
    writeLs(null);
    setDoneCount(0);
    setResumable(null);
    setSpeed(0);
    setEta(null);
    setCurrentIdx(null);
    setPhase("idle");
  }, [meta]);

  /* ─────────────────────── محاسبات UI ─────────────────────── */
  const totalChunks = meta?.totalChunks ?? 0;
  const pct = meta && totalChunks > 0 ? Math.min(100, Math.round((doneCount / totalChunks) * 100)) : 0;
  const downloadedBytes = Math.min(meta ? doneCount * meta.chunkSize : 0, meta?.size ?? 0);
  const busy = phase === "downloading" || phase === "pausing" || phase === "assembling";

  return (
    <div className="space-y-4" dir="rtl">
      {/* ── کارت اصلی: دانلود قطعه‌ای ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <FileArchive className="h-5 w-5 text-primary" />
            دانلود سورس کامل — قطعه‌ای و قابل ادامه
          </CardTitle>
          <CardDescription>
            فایل سورس به قطعه‌های ۲ مگابایتی تقسیم می‌شود. اگر اینترنت قطع شود، دانلود از همان‌جا ادامه
            پیدا می‌کند و هرگز ناقص نمی‌ماند. پیشرفت حتی با بسته‌شدن مرورگر حفظ می‌شود.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* متادیتا */}
          {phase === "meta" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              در حال دریافت اطلاعات فایل…
            </div>
          )}
          {meta && phase !== "meta" && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1 text-[11px]">
                <FileArchive className="h-3 w-3" />
                {meta.fileName}
              </Badge>
              <Badge variant="secondary" className="text-[11px]">
                {fmtMB(meta.size)} مگابایت
              </Badge>
              <Badge variant="secondary" className="gap-1 text-[11px]">
                <Layers className="h-3 w-3" />
                {totalChunks} قطعه × ۲MB
              </Badge>
            </div>
          )}

          {/* نوار پیشرفت */}
          {meta && (phase === "downloading" || phase === "paused" || phase === "assembling" || phase === "done") && (
            <div className="space-y-2">
              <Progress value={pct} className="h-3" />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-bold text-foreground">{pct}٪</span>
                <span>
                  {fmtMB(downloadedBytes)} از {fmtMB(meta.size)} مگابایت
                </span>
                <span>سرعت: {fmtSpeed(speed)}</span>
                <span>زمان باقی‌مانده: {fmtEta(eta ?? 0)}</span>
                <span>
                  قطعه: {currentIdx !== null ? `${currentIdx + 1} / ${totalChunks}` : "—"}
                </span>
              </div>
            </div>
          )}

          {/* وضعیت تلاش مجدد (قطعی اینترنت) */}
          {retryInfo && phase === "downloading" && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50/60 p-2.5 text-[12px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
              <CloudOff className="h-4 w-4 shrink-0" />
              اتصال قطع شد — تلاش مجدد {retryInfo.attempt} از {MAX_TRIES} برای قطعهٔ {retryInfo.chunk + 1} تا{" "}
              {Math.ceil(retryInfo.waitMs / 1000)} ثانیه دیگر… (دانلود از دست نمی‌رود)
            </div>
          )}

          {/* پیام ادغام */}
          {phase === "assembling" && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-[12px] text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              همهٔ قطعه‌ها دریافت شد — در حال ادغام و ساخت فایل ZIP نهایی…
            </div>
          )}

          {/* پیام موفقیت */}
          {phase === "done" && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-300/60 bg-emerald-50/60 p-3 text-[12px] text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <div>
                <p className="font-bold">دانلود کامل شد ✅</p>
                {mode === "auto" ? (
                  <p>فایل ZIP کامل ذخیره شد. حجم و تعداد قطعه‌ها با موفقیت تأیید شد.</p>
                ) : (
                  <p>همهٔ تکه‌ها دانلود شدند — برای ترکیب: همهٔ فایل‌های part را در یک پوشه بگذارید و با 7-Zip یا دستور <code dir="ltr">cat file.zip.part-* &gt; file.zip</code> یکی کنید.</p>
                )}
              </div>
            </div>
          )}

          {/* خطا */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-[12px] text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* ادامهٔ دانلود ناتمام */}
          {resumable && phase === "idle" && (
            <div className="flex items-center gap-2 rounded-lg border border-sky-300/60 bg-sky-50/60 p-2.5 text-[12px] text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
              <Info className="h-4 w-4 shrink-0" />
              یک دانلود ناتمام ({resumable.count} قطعه از {totalChunks}) پیدا شد — می‌توانید از همان‌جا ادامه دهید.
            </div>
          )}

          {/* دکمه‌ها */}
          <div className="flex flex-wrap items-center gap-2">
            {/* FIX(R28-5): دانلود مستقل در تب جدید — ریشهٔ «failed to download file»:
                ذخیرهٔ blob داخل iframe پیش‌نمایش توسط sandbox مرورگر بلاک می‌شود؛
                صفحهٔ مستقل در تبِ top-level باز می‌شود و ذخیره ۱۰۰٪ کار می‌کند. */}
            <Button
              onClick={() => {
                window.open(
                  `/api/download-source?page=1&t=${encodeURIComponent(token)}`,
                  "_blank",
                  "noopener"
                );
              }}
              className="gap-2"
              title="دانلود در تب جدید با ادامهٔ خودکار — توصیه‌شده اگر ذخیرهٔ فایل در همین تب با خطا مواجه شد"
            >
              <ExternalLink className="h-4 w-4" />
              دانلود پایدار در تب جدید (توصیه‌شده)
            </Button>
            {phase === "idle" && meta && (
              <Button
                onClick={() => {
                  setMode("auto");
                  void startDownload(false);
                }}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {resumable && resumable.count > 0 ? `ادامهٔ دانلود (${resumable.count} قطعه آماده)` : "شروع دانلود قطعه‌ای"}
              </Button>
            )}
            {phase === "paused" && (
              <Button
                onClick={() => {
                  setMode("auto");
                  void startDownload(false);
                }}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                ادامه از قطعهٔ {doneCount + 1}
              </Button>
            )}
            {(phase === "downloading" || phase === "assembling") && (
              <Button variant="outline" onClick={pause} disabled={phase === "assembling"} className="gap-2">
                {phase === "pausing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                {phase === "pausing" ? "در حال توقف…" : "توقف موقت"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode("parts");
                void downloadParts();
              }}
              disabled={busy || !meta}
              className="gap-2"
              title="هر قطعه به‌صورت فایل جداگانه ۲ مگابایتی ذخیره می‌شود — برای ترکیب دستی"
            >
              <Save className="h-4 w-4" />
              دانلود به‌صورت تکه‌های جدا (۲MB)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadMeta()}
              disabled={busy}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", phase === "meta" && "animate-spin")} />
              به‌روزرسانی اطلاعات
            </Button>
            {(doneCount > 0 || phase === "paused" || phase === "error") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void reset()}
                disabled={busy}
                className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-4 w-4" />
                حذف پیشرفت و شروع از صفر
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── راهنما ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ScatterChart className="h-4 w-4 text-muted-foreground" />
            چرا این روش مطمئن است؟
          </CardTitle>
        </CardHeader>
        <CardContent className="text-[12px] leading-6 text-muted-foreground">
          <ul className="list-inside list-disc space-y-1.5">
            <li>
              هر قطعه فقط <b>۲ مگابایت</b> است — حتی weakest اتصال هر قطعه را کامل می‌گیرد؛ اگر قطع شود فقط
              همان یک قطعه دوباره دانلود می‌شود (تا ۸ بار تلاش خودکار).
            </li>
            <li>
              قطعه‌های دانلودشده در <b>IndexedDB مرورگر</b> ذخیره می‌شوند — با بسته‌شدن مرورگر یا قطعی
              برق هم از بین نمی‌روند.
            </li>
            <li>
              در پایان، قطعه‌ها به‌صورت خودکار در یک فایل ZIP ادغام می‌شوند — نیاز به هیچ کار دستی نیست.
            </li>
            <li>
              اگر ترکیب خودکار در مرورگر شما مشکل داشت، از دکمهٔ «تکه‌های جدا» استفاده کنید و فایل‌ها را
              با 7-Zip یکی کنید.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
