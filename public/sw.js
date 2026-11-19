/* ============================================================================
 * افق پلاس — Service Worker (نسخهٔ ۲۶ — R26 «۱۰۰٪ آفلاین بی‌سروصدا»)
 * ============================================================================
 * بازطراحی کامل بر اساس درخواست مالک: «یک‌بار سایت باز شود → همه‌چیز کش شود →
 * با قطع اینترنت «همه‌چیز» از جمله فاکتور زدن کار کند».
 *
 * R26:
 *  ▸ هر GET موفق /api (JSON) علاوه بر Cache API، «آینهٔ ساختاریافته» در
 *    IndexedDB (ofogh-offline-mirror/api-responses، کلید = مسیر+کوئری)
 *    ذخیره می‌شود — داده آفلاین قابل پرس‌وجو و بازخوانی مستقیم (apiFetch).
 *  ▸ /api/dashboard هم SWR شد (داشبورد آفلاین).
 *  ▸ نسخهٔ کش‌ها bumped → کلاینت‌های قدیمی خودکار به‌روز می‌شوند.
 *
 * استراتژی‌ها:
 *  ▸ precache پوسته: /offline.html + آیکون‌ها + manifest + مستندات API محلی؛
 *    روت «/» (داشبورد) در اولین activate کش می‌شود (شورتکات PWA آفلاین).
 *  ▸ استاتیک (/_next/static، فونت‌ها، تصاویر، CSS/JS): cache-first — تغییرناپذیرند.
 *  ▸ ناوبری صفحات: آنلاین → شبکهٔ زنده (۴ ثانیه) → کش؛ آفلاین → کش فوری
 *    (SWR) با {ignoreSearch:true} → نسخهٔ بی‌query → روت → پوستهٔ آفلاین هوشمند.
 *  ▸ API دادهٔ حیاتی (GET /api/products، /api/parties، /api/invoices،
 *    /api/accounting/form-data): stale-while-revalidate — پاسخ کش لحظه‌ای سرو
 *    می‌شود و در پس‌زمینه تازه می‌شود (کاتالوگ آفلاین فاکتور).
 *  ▸ API GET دیگر: network-first (۸ ثانیه) → کش → پاسخ آرام خالی.
 *  ▸ API تغییردهنده (POST/PUT/…): SW دخالت نمی‌کند — صف‌سازی و بازپخش
 *    سمت کلاینت است (lib/offline-fetch.ts + lib/offline/sync-engine.ts).
 *    به‌ویژه POST /api/ai/* هرگز کش/رداری نمی‌شود.
 *
 * Background Sync (تخلیهٔ صف توسط کلاینت، اینجا فقط اعلان):
 *  ▸ تگ «ofogh-invoice-sync» (R24-5 — صف فاکتورهای آفلاین) و تگ قدیمی
 *    «hoosh-bg-sync» → broadcast {type:'FORCE_SYNC'}؛ شنونده‌ها (use-offline-sync
 *    برای صف قدیمی و sync-engine برای صف جدید) صف را تخلیه می‌کنند.
 *  ▸ نتیجهٔ تخلیه از کلاینت ({type:'SYNC_FLUSH_RESULT'}) → broadcast
 *    BG_SYNC_DONE → توست «همگام‌سازی انجام شد» (sw-register).
 *
 * Push: handler پایه — نمایش نوتیفیکیشن فارسی RTL + کلیک → فوکوس/باز کردن اپ.
 *
 * پروتکل پیام با کلاینت (پایبند به نسخه‌های قبل):
 *  - activate → postMessage {type:'SW_ACTIVATED', version}
 *  - GET_VERSION → پاسخ روی port {type:'GET_VERSION', version}
 *  - "hoosh-clear-api-cache" → پاک‌سازی کش API (بعد از موتاسیون موفق)
 *  - SKIP_WAITING / "hoosh-skip-waiting" → فعال‌سازی فوری SW جدید
 *  - FORCE_SYNC (از کلاینت) → broadcast به همهٔ کلاینت‌ها
 * ============================================================================ */

const VERSION = "ofogh-v26"; // R26 — کش‌های نسخه‌دار؛ تغییر نسخه = پاک‌سازی کل کش قدیمی
const STATIC_CACHE = `${VERSION}-static`;
const PAGES_CACHE = `${VERSION}-pages`;
const API_CACHE = `${VERSION}-api`;

/** precache پوستهٔ آفلاین — همهٔ محلی، بدون CDN */
const PRECACHE = [
  "/offline.html",
  "/logo.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-192-maskable.png",
  "/icon-512-maskable.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
  "/api-docs/openapi.json",
  "/api-docs/vendor/swagger-ui.css",
  "/api-docs/vendor/swagger-ui-bundle.js",
];

/** APIهایی که هرگز کش نمی‌شوند (نشست/احراز هویت/کرون) */
function isApiNeverCache(pathname) {
  return (
    pathname.startsWith("/api/auth/") ||
    pathname.includes("/session") ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/platform/login") ||
    pathname.startsWith("/api/platform/logout")
  );
}

/** اندپوینت سلامت سرور — آفلاین → ۵۰۳ صریح با serverDown:true (نه ۲۰۰ جعلی) */
function isHealthEndpoint(pathname) {
  return pathname === "/api/health" || pathname === "/api/ping";
}

/**
 * API دادهٔ حیاتی برای SWR (کاتالوگ آفلاین فاکتور + لیست‌ها).
 * فقط GET لیست‌ها؛ جزئیات تک‌مورد هم اجازه دارند (مشاهدهٔ آفلاین فاکتور).
 */
function isDataApi(pathname) {
  return (
    pathname === "/api/products" ||
    pathname === "/api/parties" ||
    pathname === "/api/invoices" ||
    pathname.startsWith("/api/invoices/") ||
    pathname === "/api/dashboard" ||
    pathname === "/api/accounting/form-data" ||
    pathname === "/api/accounting/invoices" ||
    pathname === "/api/warehouses"
  );
}

/** آیا این درخواست ناوبری صفحه است؟ */
function isNavigation(request) {
  return (
    request.mode === "navigate" ||
    (request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html"))
  );
}

/** منبع استاتیک تغییرناپذیر — cache-first */
function isImmutableStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/pos-bridge/") ||
    /\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico|woff2?|ttf|css|js|map|webmanifest|json)$/i.test(
      url.pathname
    )
  );
}

/** آیا سرویس‌ورکر الان آفلاین است؟ (برای تصمیم SWR فوری) */
function isOffline() {
  try {
    return self.navigator.onLine === false;
  } catch {
    return false;
  }
}

/** fetch با مهلت زمانی */
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, ms);
    fetch(request, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/** پاسخ آفلاین JSON — آرام، بدون متن «خطا» */
function offlineJson(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Hoosh-Offline": "1",
      "Cache-Control": "no-store",
    },
  });
}

/** «سرور پایین است» — ۵۰۳ صریح تا UI حالت server-down را بفهمد */
function serverDownJson() {
  return new Response(
    JSON.stringify({ success: false, offline: true, serverDown: true, data: null }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Hoosh-Offline": "1",
        "X-Hoosh-Server-Down": "1",
        "Cache-Control": "no-store",
      },
    }
  );
}

/* ─── R26: آینهٔ ساختاریافتهٔ API GET در IndexedDB (کلید = مسیر+کوئری) ───
 * همان DB/store که سمت کلاینت (lib/offline-db.ts) استفاده می‌شود:
 *   DB «ofogh-offline-mirror» v2 → store «api-responses»
 * سمت کلاینت apiFetch در حالت آفلاین مستقیم از همین آینه می‌خواند؛
 * داده آفلاین «ساختاریافته و قابل پرس‌وجو» است (نه فقط blob کش). */
const MIRROR_DB_NAME = "ofogh-offline-mirror";
const MIRROR_DB_VERSION = 2;
const MIRROR_STORE = "api-responses";
const MIRROR_MAX_BODY = 2 * 1024 * 1024; // بدنهٔ بزرگ‌تر از ۲MB آینه نمی‌شود

let mirrorDbPromise = null;

function openMirrorDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!mirrorDbPromise) {
    mirrorDbPromise = new Promise(function (resolve) {
      try {
        const req = indexedDB.open(MIRROR_DB_NAME, MIRROR_DB_VERSION);
        req.onupgradeneeded = function () {
          const db = req.result;
          try {
            if (!db.objectStoreNames.contains("mirrors")) db.createObjectStore("mirrors");
            if (!db.objectStoreNames.contains("pending-invoices")) {
              db.createObjectStore("pending-invoices", { keyPath: "tempId" });
            }
            if (!db.objectStoreNames.contains(MIRROR_STORE)) db.createObjectStore(MIRROR_STORE);
          } catch (e) {
            /* ساخت store شکست خورد — آینه غیرفعال می‌ماند */
          }
        };
        req.onsuccess = function () {
          resolve(req.result);
        };
        req.onerror = function () {
          resolve(null);
        };
        req.onblocked = function () {
          resolve(null);
        };
      } catch (e) {
        resolve(null);
      }
    });
  }
  return mirrorDbPromise;
}

/**
 * نوشتن پاسخ API در آینهٔ IDB — fire-and-forget، هرگز جریان را نمی‌شکند.
 * فقط پاسخ 2xx با Content-Type JSON و بدنهٔ < 2MB آینه می‌شود.
 */
function mirrorApiJson(request, response, url) {
  try {
    if (!response || !response.ok) return;
    const ct = response.headers.get("content-type") || "";
    if (ct.indexOf("json") === -1) return;
    const key = url.pathname + (url.search || "");
    if (!key.startsWith("/api/")) return;
    void openMirrorDb().then(function (db) {
      if (!db) return;
      response
        .text()
        .then(function (text) {
          if (!text || text.length > MIRROR_MAX_BODY) return;
          let body = null;
          try {
            body = JSON.parse(text);
          } catch (e) {
            return;
          }
          try {
            const tx = db.transaction(MIRROR_STORE, "readwrite");
            tx.objectStore(MIRROR_STORE).put(
              {
                url: key,
                body: body,
                contentType: ct,
                status: response.status,
                savedAt: Date.now(),
              },
              key
            );
            tx.onabort = function () {
              /* ignore */
            };
          } catch (e) {
            /* ignore */
          }
        })
        .catch(function () {
          /* ignore */
        });
    });
  } catch (e) {
    /* ignore */
  }
}

/** ارسال پیام به همهٔ کلاینت‌ها — Promise برای waitUntil */
function broadcast(message) {
  try {
    return self.clients
      .matchAll({ includeUncontrolled: true })
      .then((clients) => {
        for (const c of clients) {
          try {
            c.postMessage(message);
          } catch {}
        }
      })
      .catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}

/** سرو پاسخ کش‌شده با نشان آفلاین (وقتی مرورگر آفلاین است) */
async function serveCachedWithFlag(cached) {
  if (!isOffline()) return cached;
  try {
    const headers = new Headers(cached.headers);
    headers.set("X-Hoosh-Offline", "1");
    return new Response(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers,
    });
  } catch {
    return cached;
  }
}

/** تولید offline.html با مسیر بازگشت تزریق‌شده (قرارداد v3+) */
async function offlineShellWithReturn(returnPath) {
  const shell = await caches.match("/offline.html", { ignoreSearch: true });
  if (!shell) {
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>افق پلاس — آفلاین</title>` +
        `<p style="font-family:Tahoma;padding:24px">در حالت آفلاین هستید.</p>` +
        `<a href="/">بازگشت به برنامه</a>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  try {
    const html = await shell.text();
    const inject =
      `<script>window.HOOSH_RETURN_PATH = ${JSON.stringify(returnPath)};</script>`;
    return new Response(html.replace("</head>", `${inject}</head>`), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return shell;
  }
}

/* ─── نصب: precache پوسته ─── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        // FIX(R25-C): cache.addAll اتمی است — اگر حتی یکی از URLها شکست
        // بخورد (مثلاً ۵۰۰ گذرای manifest در لحظهٔ نصب) «هیچ‌چیز» کش نمی‌شود
        // و پوستهٔ آفلاین بی‌صدا از دست می‌رفت (ریشهٔ «آفلاین کار نمی‌کند»).
        // کش تک‌به‌تک با allSettled: خطای یک فایل، بقیه را از کار نمی‌اندازد.
        Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  );
});

/* ─── فعال‌سازی: پاک‌سازی نسخه‌های قبل + preload + تسخیر + کش روت ─── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        if (self.registration.navigationPreload) {
          await self.registration.navigationPreload.enable();
        }
      } catch {}

      // حذف کش‌های همهٔ نسخه‌های دیگر
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      );

      await self.clients.claim();
      broadcast({ type: "SW_ACTIVATED", version: VERSION });

      // روت «/» را در اولین فعال‌سازی بگیر — شورتکات PWA و start_url آفلاین
      try {
        const rootCached =
          (await caches.match(new Request(self.location.origin + "/"), {
            ignoreSearch: true,
          })) !== undefined;
        if (!rootCached) {
          const res = await fetch(self.location.origin + "/", { cache: "no-store" });
          if (res && res.ok) {
            const cache = await caches.open(PAGES_CACHE);
            await cache.put(self.location.origin + "/", res);
          }
        }
      } catch {}
    })()
  );
});

/* ─── پیام از کلاینت (پروتکل نسخه‌های قبل — دست نزنید) ─── */
self.addEventListener("message", (event) => {
  const data = event.data;
  const type = typeof data === "string" ? data : data?.type;

  if (type === "hoosh-skip-waiting" || type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  // بعد از موتاسیون موفق → کش API باطل تا دادهٔ تازه بیاید
  if (type === "hoosh-clear-api-cache") {
    try {
      event.waitUntil(caches.delete(API_CACHE).catch(() => undefined));
    } catch {
      caches.delete(API_CACHE).catch(() => undefined);
    }
  }

  if (type === "GET_VERSION") {
    const ports = event.ports || [];
    if (ports.length > 0) {
      try {
        ports[0].postMessage({ type: "GET_VERSION", version: VERSION });
      } catch {}
    } else {
      broadcast({ type: "GET_VERSION", version: VERSION });
    }
  }

  if (type === "FORCE_SYNC") {
    broadcast({ type: "FORCE_SYNC" });
  }

  if (type === "SYNC_FLUSH_RESULT") {
    const sent = Number(data?.sent || 0);
    const failed = Number(data?.failed || 0);
    broadcast({
      type: "BG_SYNC_DONE",
      processed: sent,
      remaining: failed,
    });
  }
});

/* ─── Background Sync — هر دو تگ → اعلان تخلیهٔ صف به کلاینت‌ها ───
 * صف‌ها در IndexedDB سمت کلاینت هستند (ofogh-offline + hoosh-offline)؛
 * بازپخش auth دار است و در صفحه انجام می‌شود (توکن در localStorage SW نیست). */
self.addEventListener("sync", (event) => {
  if (event.tag === "ofogh-invoice-sync" || event.tag === "hoosh-bg-sync") {
    event.waitUntil(broadcast({ type: "FORCE_SYNC" }));
  }
});

/* ─── Push — نوتیفیکیشن پایه (پرچم push-permission-banner سمت کلاینت) ─── */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: typeof event.data?.text === "function" ? event.data.text() : "" };
  }
  const title = String(data.title || "افق پلاس");
  event.waitUntil(
    self.registration.showNotification(title, {
      body: String(data.body || ""),
      icon: "/icon-192.png",
      badge: "/icon-192-maskable.png",
      dir: "rtl",
      lang: "fa",
      tag: String(data.tag || "ofogh-push"),
      renotify: true,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("focus" in client) return client.focus();
        }
        return self.clients.openWindow(url);
      })
  );
});

/* ─── fetch ─── */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // فقط همان مبدا — درخواست‌های خارجی (پل کارتخوان، tgju و…) دست‌نخورده
  if (url.origin !== self.location.origin) return;

  /* سلامت سرور: آفلاین → ۵۰۳ صریح */
  if (isHealthEndpoint(url.pathname)) {
    event.respondWith(fetch(request).catch(() => serverDownJson()));
    return;
  }

  /* ─── API GET ─── */
  if (url.pathname.startsWith("/api/") && request.method === "GET") {
    if (isApiNeverCache(url.pathname)) {
      event.respondWith(
        fetch(request).catch(() =>
          offlineJson({ success: true, offline: true, data: null })
        )
      );
      return;
    }

    // دادهٔ حیاتی (کاتالوگ/فاکتورها) → stale-while-revalidate
    if (isDataApi(url.pathname)) {
      event.respondWith(handleDataApiSWR(request));
      return;
    }

    // سایر APIها → network-first با کش
    event.respondWith(handleApiNetworkFirst(request));
    return;
  }

  // API تغییردهنده — SW کاملاً رد می‌شود (صف‌سازی سمت کلاینت)
  if (url.pathname.startsWith("/api/")) return;

  /* ناوبری صفحات */
  if (isNavigation(request)) {
    event.respondWith(handleNavigation(event, request, url));
    return;
  }

  /* استاتیک: cache-first */
  if (isImmutableStatic(url)) {
    event.respondWith(handleStatic(request));
  }
});

/**
 * SWR برای API دادهٔ حیاتی:
 *  ۱) کش هست → همین لحظه سرو + به‌روزرسانی پس‌زمینه (فقط اگر آنلاینیم)
 *  ۲) کش نیست → شبکه → کش؛ آفلاین → پاسخ آرام خالی
 */
async function handleDataApiSWR(request) {
  const url = new URL(request.url);
  const cached = await caches.match(request);
  if (cached) {
    // به‌روزرسانی پس‌زمینه — جریان پاسخ را بلاک نمی‌کند
    if (!isOffline()) {
      void (async () => {
        try {
          const res = await fetchWithTimeout(request, 10000);
          if (res && res.ok) {
            const cache = await caches.open(API_CACHE);
            await cache.put(request, res.clone());
            // R26 — آینهٔ ساختاریافتهٔ IDB موازی با Cache API
            mirrorApiJson(request, res, url);
          }
        } catch {}
      })();
    }
    return serveCachedWithFlag(cached);
  }

  try {
    const response = await fetchWithTimeout(request, 8000);
    if (response.ok) {
      try {
        const copy = response.clone();
        const cache = await caches.open(API_CACHE);
        await cache.put(request, copy);
        // R26 — آینهٔ ساختاریافتهٔ IDB موازی با Cache API
        mirrorApiJson(request, response.clone(), url);
      } catch {}
    }
    return response;
  } catch {
    return offlineJson({ success: true, offline: true, data: null, empty: true });
  }
}

/** network-first برای سایر API GETها: شبکه (۸ ثانیه) → کش → آرام خالی */
async function handleApiNetworkFirst(request) {
  const url = new URL(request.url);
  try {
    const response = await fetchWithTimeout(request, 8000);
    if (response.ok) {
      try {
        const copy = response.clone();
        const cache = await caches.open(API_CACHE);
        await cache.put(request, copy);
        // R26 — آینهٔ ساختاریافتهٔ IDB موازی با Cache API
        mirrorApiJson(request, response.clone(), url);
      } catch {}
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return serveCachedWithFlag(cached);
    return offlineJson({ success: true, offline: true, data: null, empty: true });
  }
}

/** استاتیک: cache-first → شبکه (برای دفعات بعد) */
async function handleStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === "basic") {
      try {
        const copy = response.clone();
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(request, copy);
      } catch {}
    }
    return response;
  } catch {
    return cached || Response.error();
  }
}

/**
 * ناوبری — «stale-while-revalidate به سبک افق پلاس»:
 *  ▸ مرورگر آفلاین است → کش فوری (بدون مکث شبکه) → زنجیرهٔ هوشمند → پوسته
 *  ▸ مرورگر آنلاین است → شبکهٔ زنده (preload یا ۴ ثانیه) → کش؛ اگر شبکه
 *    جواب نداد (lie-fi) → همان لحظه کش (SWR) → زنجیره → پوستهٔ آفلاین
 * زنجیرهٔ کش هوشمند: کلید کامل (ignoreSearch) → نسخهٔ بی‌query → روت «/»
 */
async function handleNavigation(event, request, url) {
  const returnPath = url.pathname + (url.search || "");

  /* ─── آفلاین: کش فوری (SWR) ─── */
  if (isOffline()) {
    const cached = await matchPageSmart(request, url);
    if (cached) return cached;
    return offlineShellWithReturn(returnPath);
  }

  /* ─── آنلاین: شبکه (preload) با مهلت کوتاه ─── */
  try {
    if (event.preloadResponse) {
      const preload = await event.preloadResponse;
      if (preload && preload.ok) {
        try {
          const copy = preload.clone();
          const cache = await caches.open(PAGES_CACHE);
          await cache.put(request, copy);
        } catch {}
        return preload;
      }
    }
  } catch {}

  try {
    const response = await fetchWithTimeout(request, 4000);
    if (response && response.ok) {
      try {
        const copy = response.clone();
        const cache = await caches.open(PAGES_CACHE);
        // هم کلید کامل (با query) هم کلید بی‌query (fallback هوشمند)
        await cache.put(request, copy.clone());
        if (url.search) {
          await cache.put(new Request(url.origin + url.pathname), copy);
        }
      } catch {}
    }
    return response;
  } catch {}

  /* ─── شبکه جواب نداد (lie-fi/قطع لحظه‌ای) → کش بی‌درنگ ─── */
  const cached = await matchPageSmart(request, url);
  if (cached) return cached;

  return offlineShellWithReturn(returnPath);
}

/** زنجیرهٔ تطبیق صفحه: کلید کامل (ignoreSearch) → بی‌query → روت داشبورد */
async function matchPageSmart(request, url) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  if (url.search) {
    const bare = await caches.match(new Request(url.origin + url.pathname), {
      ignoreSearch: true,
    });
    if (bare) return bare;
  }
  if (url.pathname === "/" || url.searchParams.has("module")) {
    const root = await caches.match(new Request(url.origin + "/"), {
      ignoreSearch: true,
    });
    if (root) return root;
  }
  return null;
}
