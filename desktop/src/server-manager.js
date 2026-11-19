'use strict';

/**
 * server-manager.js — مدیر سرور محلی «حسابداری افق پلاس» (بازسازی R17-A)
 * ============================================================================
 * این فایل قلب نسخهٔ دسکتاپ است. مسئولیت‌ها:
 *
 *  ۱) پیدا کردن مسیرهای نصب (resources/server و resources/node) — هم در حالت
 *     packaged و هم dev.
 *  ۲) کپی «یک‌بارهٔ» دیتابیس به پوشهٔ قابل‌نوشتن کاربر (userData/data) —
 *     چون Program Files برای کاربر عادی read-only است.
 *  ۳) ساخت JWT_SECRET پایدار (بدون آن سرور Next در production کرش می‌کند).
 *  ۴) اجرای seed.cjs (ساخت کاربر admin اگر دیتابیس خالی باشد).
 *  ۵) انتخاب پورت آزاد در بازهٔ 3456..3460 و spawn کردن node.exe کاملاً مخفی
 *     (windowsHide + detached:false ⇒ بدون پنجرهٔ CMD).
 *  ۶) poll کردن /api/health تا ۹۰ ثانیه — اما اگر پروسهٔ node زودتر بمیرد،
 *     «همان لحظه» با علت دقیق (کد خروج + آخرین خطوط لاگ) شکست می‌خوریم؛
 *     نه اینکه کاربر ۹۰ ثانیه به splash زل بزند. (رفع باگ قدیمی)
 *  ۷) ری‌استارت خودکار اگر پروسهٔ node بعد از آماده شدن کرش کند (۳ بار با
 *     backoff نمایی ۱/۲/۴ ثانیه + جابه‌جایی به پورت بعدی).
 *  ۸) لاگ چرخشی: هر فایل حداکثر ۲ مگابایت × ۳ نسخه (server.log، server.1.log،
 *     server.2.log) در userData/logs — دیگر لاگ‌ها دیسک را پر نمی‌کنند.
 *  ۹) خروجیِ سرور از طریق pipe خوانده و در حافظه (۱۶KB آخر) نگه داشته می‌شود
 *     تا صفحهٔ خطا «آخرین خطوط لاگ» را با علت واقعی نشان دهد.
 * ۱۰) کشتن مطمئن پروسهٔ node هنگام خروج (taskkill /T /F در ویندوز) — حتی
 *     وقتی سرور شکست خورده (رفع «پروسهٔ یتیم»).
 * ۱۱) diagnose() — چک‌لیست سلامت برای منوی «کمک ← تشخیص مشکلات».
 *
 * سازگار با Electron 22 (Node 16.17) و Electron مدرن (Node 20+) — بدون
 * سینتکس/API جدید.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { EventEmitter } = require('events');

const PORT_RANGE_START = 3456;
const PORT_RANGE_SIZE = 5; // 3456..3460
const HEALTH_TIMEOUT_MS = 90 * 1000; // بوت سرد روی هارد دیسک‌های قدیمی ویندوز ۷
const HEALTH_POLL_INTERVAL_MS = 500;
const SEED_TIMEOUT_MS = 60 * 1000;
const MAX_CRASH_RETRIES = 3;
const LOG_MAX_BYTES = 2 * 1024 * 1024; // ۲ مگابایت
const LOG_KEEP = 3; // ×۳ فایل
const TAIL_BUFFER_BYTES = 16 * 1024; // ۱۶KB آخر خروجی سرور برای صفحهٔ خطا

class ServerManager extends EventEmitter {
  constructor() {
    super();
    this.child = null;
    this.seedChild = null;
    this.port = null;
    this.runningServerDir = null;
    this.status = 'idle'; // idle | starting | ready | failed | stopped
    this.stopping = false;
    this.crashRetries = 0;
    this.lastError = null;
    this._pollTimer = null;
    this._startPromise = null;
    this._serverLogFd = null;
    this._serverLogPath = null;
    this._tailBuf = ''; // آخرین خروجی سرور (برای پیام خطای دقیق)
    this._childExitInfo = null; // اگر پروسهٔ node قبل از ready بمیرد: {code, signal}
  }

  /* ─────────────────────────── مسیرها ─────────────────────────── */

  get isPackaged() {
    try {
      const { app } = require('electron');
      return app.isPackaged;
    } catch (e) {
      return false;
    }
  }

  /** پوشهٔ resources (در بستهٔ نصبی) یا desktop/resources (در dev) */
  get resourcesDir() {
    if (this.isPackaged) {
      return process.resourcesPath; // <نصب>/resources
    }
    return path.join(__dirname, '..', 'resources');
  }

  get serverDir() {
    return path.join(this.resourcesDir, 'server');
  }

  get nodeDir() {
    return path.join(this.resourcesDir, 'node');
  }

  get userDataDir() {
    const { app } = require('electron');
    return app.getPath('userData');
  }

  get dataDir() {
    return path.join(this.userDataDir, 'data');
  }

  get logsDir() {
    return path.join(this.userDataDir, 'logs');
  }

  get dbPath() {
    return path.join(this.dataDir, 'custom.db');
  }

  get configPath() {
    return path.join(this.userDataDir, 'config.json');
  }

  get baseUrl() {
    return this.port ? 'http://127.0.0.1:' + this.port : null;
  }

  /* ─────────────────────── لاگ چرخشی ─────────────────────── */

  /** اگر فایل از ۲MB گذشت: قدیمی‌ترین حذف، بقیه یک پله عقب (×۳ فایل) */
  _rotateIfNeeded(base) {
    try {
      if (!fs.existsSync(base)) return;
      if (fs.statSync(base).size < LOG_MAX_BYTES) return;
      const b = base.slice(0, -4); // حذف پسوند .log
      try {
        fs.unlinkSync(b + '.' + (LOG_KEEP - 1) + '.log');
      } catch (e) {
        /* شاید نباشد */
      }
      for (let i = LOG_KEEP - 2; i >= 1; i--) {
        try {
          fs.renameSync(b + '.' + i + '.log', b + '.' + (i + 1) + '.log');
        } catch (e) {
          /* شاید نباشد */
        }
      }
      try {
        fs.renameSync(base, b + '.1.log');
      } catch (e) {
        /* ignore */
      }
    } catch (e) {
      /* چرخش لاگ هرگز برنامه را نمی‌شکند */
    }
  }

  _appendLog(name, line) {
    try {
      fs.mkdirSync(this.logsDir, { recursive: true });
      const file = path.join(this.logsDir, name);
      this._rotateIfNeeded(file);
      fs.appendFileSync(file, '[' + new Date().toISOString() + '] ' + line + '\n', 'utf8');
    } catch (e) {
      /* لاگ‌نوشتن نباید خودش برنامه را بکشد */
    }
  }

  _log(line) {
    this._appendLog('server-manager.log', line);
    try {
      console.log('[server-manager] ' + line);
    } catch (e) {
      /* ignore */
    }
  }

  _emitProgress(msg) {
    this._log(msg);
    this.emit('progress', msg);
  }

  _readJsonSafe(filePath, fallback) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      return fallback;
    }
  }

  /** کپی بازگشتی دستی (بدون وابستگی به fs.cpSync) */
  _copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (let i = 0; i < entries.length; i++) {
      const s = path.join(src, entries[i].name);
      const d = path.join(dest, entries[i].name);
      if (entries[i].isDirectory()) {
        this._copyDirRecursive(s, d);
      } else if (entries[i].isFile()) {
        fs.copyFileSync(s, d);
      }
    }
  }

  _readVersionFile(dir) {
    try {
      return fs.readFileSync(path.join(dir, 'VERSION'), 'utf8').trim();
    } catch (e) {
      return '';
    }
  }

  /* ─────────────── مرحلهٔ ۱: پوشه‌ها + دیتابیس + config ─────────────── */

  _ensureDirsAndDb() {
    fs.mkdirSync(this.userDataDir, { recursive: true });
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(this.logsDir, { recursive: true });

    // config.json — شامل JWT_SECRET پایدار (بدون آن Next در production کرش می‌کند)
    let cfg = this._readJsonSafe(this.configPath, null);
    if (!cfg || !cfg.jwtSecret || typeof cfg.jwtSecret !== 'string' || cfg.jwtSecret.length < 32) {
      cfg = cfg || {};
      cfg.jwtSecret = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(this.configPath, JSON.stringify(cfg, null, 2), 'utf8');
      this._log('JWT_SECRET جدید ساخته شد (یک‌بار برای همیشه در config.json ذخیره می‌شود).');
    }

    // دیتابیس: در نصب per-machine پوشهٔ نصب read-only است ⇒ db باید در userData باشد
    if (!fs.existsSync(this.dbPath)) {
      const templateDb = path.join(this.serverDir, 'db', 'custom.db');
      if (fs.existsSync(templateDb)) {
        this._emitProgress('در حال آماده‌سازی دیتابیس محلی…');
        let lastErr = null;
        // سه تلاش — آنتی‌ویروس‌ها گاهی لحظه‌ای فایل تازه‌ساخته را قفل می‌کنند
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            fs.copyFileSync(templateDb, this.dbPath);
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            this._log('تلاش ' + (attempt + 1) + ' برای کپی دیتابیس شکست خورد: ' + (e && e.message));
            try {
              fs.unlinkSync(this.dbPath);
            } catch (e2) {
              /* ignore */
            }
          }
        }
        if (lastErr) {
          throw new Error('کپی دیتابیس اولیه ممکن نشد: ' + (lastErr.message || lastErr));
        }
      } else {
        this._log('هشدار: دیتابیس قالب (resources/server/db/custom.db) پیدا نشد — دیتابیس خالی.');
      }
    }

    return cfg;
  }

  /* ───── مرحلهٔ ۲: اگر پوشهٔ نصب read-only بود، سرور را به userData کپی کن ───── */

  _ensureWritableServerDir() {
    const testFile = path.join(this.serverDir, '.write-test-' + Date.now());
    let writable = false;
    try {
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      writable = true;
    } catch (e) {
      writable = false;
    }
    if (writable) {
      return this.serverDir; // مسیر سریع — نصب per-user (پیش‌فرض نسخهٔ مدرن)
    }

    // مسیر کند ولی مطمئن — نصب per-machine در Program Files (نسخهٔ Legacy)
    this._emitProgress('نصب در پوشهٔ محافظت‌شده است؛ یک‌بار در حال آماده‌سازی فایل‌های برنامه…');
    const target = path.join(this.userDataDir, 'server');
    const staging = path.join(this.userDataDir, 'server-staging');
    const srcVersion = this._readVersionFile(this.serverDir) || 'unknown';

    if (
      this._readVersionFile(target) === srcVersion &&
      fs.existsSync(path.join(target, 'server.js'))
    ) {
      this._log('نسخهٔ ' + srcVersion + ' قبلاً در userData کپی شده — از همان استفاده می‌شود.');
      return target;
    }

    try {
      try {
        fs.rmSync(staging, { recursive: true, force: true });
      } catch (e) {
        /* شاید وجود نداشته باشد */
      }
      this._copyDirRecursive(this.serverDir, staging);
      fs.writeFileSync(path.join(staging, 'VERSION'), srcVersion, 'utf8');
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch (e) {
        /* ignore */
      }
      fs.renameSync(staging, target);
      this._log('سرور در ' + target + ' آماده شد (نسخهٔ ' + srcVersion + ').');
      return target;
    } catch (e) {
      this._log('کپی سرور به userData شکست خورد: ' + (e && e.message));
      return this.serverDir; // آخرین تلاش: همان پوشهٔ اصلی
    }
  }

  /* ───────── مرحلهٔ ۳: انتخاب موتور اجرا (node) ───────── */
  /*
   * اولویت‌ها (پس از بازسازی R17-A):
   *   ۱) node.exe باندل‌شده (resources/node) — فقط اگر واقعاً اجرا شود؛
   *      اگر VC++ Runtime نصب نباشد node.exe با «VCRUNTIME140.dll not found»
   *      می‌میرد؛ همین‌جا با یک probe سبک (اجرای --version) کشف می‌شود و
   *      به گزینهٔ بعدی می‌رویم — نه اینکه سه بار کرش-ریتری بخوریم.
   *   ۲) خودِ باینری برنامه با ELECTRON_RUN_AS_NODE=1 — همیشه موجود، همیشه
   *      هم‌معماری با ویندوزِ کاربر و بدون هیچ وابستگی به VC++ (کرومیم CRT
   *      را استاتیک لینک می‌کند). این مسیرِ نجاتِ ویندوزهای تمیز است.
   *   ۳) در حالت dev همین مسیر ۲.
   */

  _resolveNode() {
    const nodeDir = this.nodeDir;

    const isTrue32BitWindows =
      process.platform === 'win32' &&
      process.arch === 'ia32' &&
      process.env.PROCESSOR_ARCHITEW6432 !== 'AMD64';

    // کاندیدها به ترتیب اولویت
    const candidates = [];
    if (isTrue32BitWindows) {
      const ia32 = path.join(nodeDir, 'node-ia32.exe');
      if (fs.existsSync(ia32)) candidates.push(ia32);
    }
    const main = path.join(nodeDir, 'node.exe');
    if (fs.existsSync(main)) candidates.push(main);

    // فایل NODE_VERSION (اگر build نوشته باشد) — فقط برای لاگ؛ نسخهٔ واقعی
    // را خودمان probe می‌کنیم چون فایل ممکن است فراموش شده باشد.
    let declaredVersion = '';
    try {
      declaredVersion = fs.readFileSync(path.join(nodeDir, 'NODE_VERSION'), 'utf8').trim();
    } catch (e) {
      declaredVersion = '';
    }

    for (let i = 0; i < candidates.length; i++) {
      const exePath = candidates[i];
      const probe = this._probeNodeBinary(exePath);
      if (probe.ok) {
        return { exe: exePath, version: probe.version || declaredVersion };
      }
      this._log(
        'node.exe باندل‌شده قابل اجرا نیست (' + exePath + '): ' + probe.reason +
          ' — احتمالاً VC++ Runtime نصب نیست؛ به موتور داخلی برنامه سوئیچ می‌شود.'
      );
    }

    // مسیر نجات — باینری خود برنامه در حالت Node
    this._log(
      'استفاده از موتور داخلی برنامه (ELECTRON_RUN_AS_NODE) نسخهٔ ' +
        (process.versions.node || 'نامشخص') + '.'
    );
    return { exe: process.execPath, version: process.versions.node || '', electronAsNode: true };
  }

  /** probe سبک: آیا این باینری واقعاً اجرا می‌شود؟ (کشف نبودِ VCRUNTIME140.dll) */
  _probeNodeBinary(exePath) {
    try {
      const r = spawnSync(exePath, ['--version'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 15000,
        encoding: 'utf8',
      });
      if (r && r.error) {
        return { ok: false, version: '', reason: r.error.message || 'spawn error' };
      }
      const out = ((r && r.stdout) || '').trim();
      if (/^v?\d+\./.test(out)) {
        return { ok: true, version: out, reason: '' };
      }
      return {
        ok: false,
        version: '',
        reason: 'خروجی نامعتبر (کد ' + (r && r.status) + ')' + (out ? ': ' + out.slice(0, 120) : ''),
      };
    } catch (e) {
      return { ok: false, version: '', reason: e && e.message ? e.message : String(e) };
    }
  }

  /* ───────── مرحلهٔ ۴: seed (کاربر admin پیش‌فرض) ───────── */

  _runSeed(serverDir, env, nodeInfo, extraArgs) {
    const self = this;
    return new Promise((resolve) => {
      const seedPath = path.join(serverDir, 'seed.cjs');
      if (!fs.existsSync(seedPath)) {
        self._log('seed.cjs پیدا نشد — رد شد (دیتابیس از قبل داده دارد).');
        resolve(true);
        return;
      }
      self._emitProgress('بررسی کاربر پیش‌فرض…');
      const args = extraArgs.slice();
      if (nodeInfo.electronAsNode) args.push('--experimental-fetch');
      args.push(seedPath);
      const child = spawn(nodeInfo.exe, args, {
        cwd: serverDir,
        env: env,
        windowsHide: true, // هیچ پنجرهٔ CMD باز نمی‌شود
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      self.seedChild = child;
      let out = '';
      const collect = (chunk) => {
        out += chunk.toString('utf8');
        if (out.length > 8000) out = out.slice(-8000);
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);

      const timer = setTimeout(() => {
        self._log('seed بیش از حد طول کشید — می‌بندیم و ادامه می‌دهیم.');
        try {
          child.kill();
        } catch (e) {
          /* ignore */
        }
      }, SEED_TIMEOUT_MS);

      child.on('error', (err) => {
        clearTimeout(timer);
        self._log('اجرای seed شکست خورد: ' + (err && err.message));
        self.seedChild = null;
        resolve(false);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        self.seedChild = null;
        self._appendLog('seed.log', 'seed تمام شد (کد ' + code + ') ' + (out ? out.replace(/\s+/g, ' ').slice(0, 2000) : ''));
        // حتی اگر seed شکست بخورد ادامه می‌دهیم — دیتابیس ممکن است از قبل کاربر داشته باشد
        resolve(true);
      });
    });
  }

  /* ───────── مرحلهٔ ۵: پورت آزاد ───────── */

  _checkPortFree(port) {
    return new Promise((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => {
        srv.close(() => resolve(true));
      });
      srv.listen(port, '127.0.0.1');
    });
  }

  /** آیا روی این پورت سرورِ «ما» نشسته؟ (پروسهٔ یتیم از اجرای قبلی) */
  _probeOurHealth(port) {
    return new Promise((resolve) => {
      const req = http.get(
        { host: '127.0.0.1', port: port, path: '/api/health', timeout: 1500, agent: false },
        (res) => {
          let body = '';
          res.on('data', (c) => {
            body += c;
          });
          res.on('end', () => {
            resolve({ health: res.statusCode === 200, body: body.slice(0, 200) });
          });
          res.resume();
        }
      );
      req.on('error', () => resolve({ health: false, body: '' }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ health: false, body: '' });
      });
    });
  }

  _findFreePort(startOffset) {
    const self = this;
    return new Promise((resolve, reject) => {
      let i = typeof startOffset === 'number' ? startOffset : 0;
      const busyPorts = [];
      const tryNext = () => {
        if (i >= PORT_RANGE_SIZE) {
          let hint = '';
          if (busyPorts.length) {
            hint =
              ' (پورت‌های اشغال‌شده: ' + busyPorts.join('، ') +
              ' — احتمالاً نمونهٔ قبلی برنامه یا برنامهٔ دیگری در پس‌زمینه است؛' +
              ' ویندوز را ری‌استارت کنید یا از منوی کنار ساعت «خروج کامل» بزنید)';
          }
          reject(
            new Error(
              'هیچ پورت آزادی در بازهٔ ' + PORT_RANGE_START + '-' +
                (PORT_RANGE_START + PORT_RANGE_SIZE - 1) + ' پیدا نشد.' + hint
            )
          );
          return;
        }
        const port = PORT_RANGE_START + i;
        i++;
        self._checkPortFree(port).then((free) => {
          if (free) {
            resolve(port);
            return;
          }
          busyPorts.push(port);
          // اگر پورت را سرورِ خودِ ما (یتیم) گرفته، فقط لاگ — راهنمای دقیق‌تر
          self._probeOurHealth(port).then((p) => {
            if (p.health) {
              self._log('پورت ' + port + ' در اختیار سرور افق پلاسِ قبل است (یتیم) — رد شد.');
            } else {
              self._log('پورت ' + port + ' اشغال است — بعدی…');
            }
            tryNext();
          });
        });
      };
      tryNext();
    });
  }

  /* ───────── مرحلهٔ ۶: health-check ───────── */

  _ping(port) {
    return new Promise((resolve) => {
      const req = http.get(
        {
          host: '127.0.0.1',
          port: port,
          path: '/api/health',
          timeout: 3000,
          agent: false,
        },
        (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * انتظار برای سلامت — دو شرط پایان دارد:
   *   پاسخ 200 (موفق) یا مرگِ زودهنگام پروسهٔ node (شکست فوری با علت دقیق)
   */
  _waitForHealth(port) {
    const self = this;
    return new Promise((resolve) => {
      const deadline = Date.now() + HEALTH_TIMEOUT_MS;
      const tick = () => {
        if (self.stopping) {
          resolve(false);
          return;
        }
        if (self._childExitInfo) {
          // پروسهٔ node قبل از آماده شدن مرده — ۹۰ ثانیه معطل نمی‌مانیم
          resolve(false);
          return;
        }
        self._ping(port).then((ok) => {
          if (ok) {
            resolve(true);
            return;
          }
          if (Date.now() >= deadline) {
            resolve(false);
            return;
          }
          self._pollTimer = setTimeout(tick, HEALTH_POLL_INTERVAL_MS);
        });
      };
      tick();
    });
  }

  /* ─────────────────────────── START ─────────────────────────── */

  start(portOffset) {
    const self = this;

    // جلوگیری از استارتِ دوباره در حین استارت (دابل‌کلیک روی «تلاش دوباره»)
    if (self.status === 'starting' && self._startPromise) {
      self._log('start در جریان است — درخواست تکراری نادیده گرفته شد.');
      return self._startPromise;
    }

    if (typeof portOffset !== 'number') portOffset = 0;
    self.stopping = false;
    self.status = 'starting';
    self.lastError = null;
    self._childExitInfo = null;
    self._tailBuf = '';

    self._startPromise = Promise.resolve()
      .then(() => {
        /* ۱) پوشه‌ها، دیتابیس و JWT_SECRET */
        self._emitProgress('آماده‌سازی داده‌های برنامه…');
        const cfg = self._ensureDirsAndDb();

        /* ۲) پوشهٔ سرورِ قابل‌نوشتن */
        const serverDir = self._ensureWritableServerDir();
        self.runningServerDir = serverDir;
        const serverEntry = path.join(serverDir, 'server.js');
        if (!fs.existsSync(serverEntry)) {
          throw new Error(
            'فایل موتور برنامه (server.js) پیدا نشد (' + serverEntry + ') — نصب ناقص است؛ ' +
              'برنامه را حذف و دوباره نصب کنید.'
          );
        }

        /* ۳) node.exe */
        const nodeInfo = self._resolveNode();
        self._log('node انتخاب‌شده: ' + nodeInfo.exe + ' (نسخهٔ ' + (nodeInfo.version || 'نامشخص') + ')');

        /* ۴) محیط اجرا — NODE_OPTIONS عمداً پاک می‌شود (مسیرهای دارای فاصله
              در ویندوز درست parse نمی‌شوند؛ همه‌چیز به‌صورت آرگومان مستقیم
              به spawn داده می‌شود) */
        const dbUrl = 'file:' + self.dbPath.replace(/\\/g, '/');
        const env = Object.assign({}, process.env, {
          HOSTNAME: '127.0.0.1',
          NODE_ENV: 'production',
          DATABASE_URL: dbUrl,
          JWT_SECRET: cfg.jwtSecret,
          NEXT_TELEMETRY_DISABLED: '1',
          NEXT_DESKTOP: '1',
          BUN_QUIET_DEBUG_LOGS: '1',
        });
        delete env.NODE_OPTIONS;
        delete env.ELECTRON_RUN_AS_NODE; // فقط برای حالت electron-as-node دوباره ست می‌شود

        /* ۵) آرگومان‌های node — مستقیم، نه NODE_OPTIONS
              Node 16 (نسخهٔ Legacy): پالی‌فیل‌ها + fetch آزمایشی + سقف حافظهٔ امن */
        const isNode16 = /^v?16\./.test(nodeInfo.version || '');
        const nodeArgs = [];
        if (isNode16) {
          const polyfills = path.join(serverDir, 'node16-polyfills.cjs');
          if (fs.existsSync(polyfills)) {
            nodeArgs.push('--require', polyfills);
          }
          nodeArgs.push('--experimental-fetch');
          nodeArgs.push('--max-old-space-size=512');
          self._log('Node 16 تشخیص داده شد: پالی‌فیل‌ها + --experimental-fetch + سقف حافظهٔ 512MB فعال شدند.');
        }

        /* ۶) seed */
        return self._runSeed(serverDir, env, nodeInfo, nodeArgs).then(() => ({
          serverDir,
          serverEntry,
          env,
          nodeInfo,
          nodeArgs,
        }));
      })
      .then((ctx) => {
        /* ۷) پورت آزاد + spawn */
        return self._findFreePort(portOffset).then((port) => {
          self.port = port;
          ctx.env.PORT = String(port);
          self._emitProgress('راه‌اندازی موتور برنامه (پورت ' + port + ')…');
          self._openServerLog();
          self._spawnServer(ctx.nodeInfo, ctx.serverEntry, ctx.env, ctx.serverDir, ctx.nodeArgs);

          /* ۸) health-check */
          self._emitProgress('بارگذاری حسابداری افق پلاس… (اولین اجرا ممکن است کمی طول بکشد)');
          return self._waitForHealth(port);
        });
      })
      .then((healthy) => {
        if (self.stopping) return null; // در میانهٔ کار خروج رخ داده
        if (!healthy) {
          // پروسهٔ مرده یا تایم‌اوت — در هر دو حالت پروسه باید کشته شود تا
          // «یتیم» نماند و پورت را نگه ندارد
          self._killChild(self.child);
          self.child = null;

          if (self._childExitInfo) {
            throw new Error(
              'موتور برنامه بلافاصله بعد از راه‌اندازی متوقف شد' +
                ' (کد خروج ' + self._childExitInfo.code + '، سیگنال ' + self._childExitInfo.signal + ').' +
                ' آخرین پیام موتور:\n' + self.tailServerLog(1500)
            );
          }
          throw new Error(
            'موتور برنامه طی ' + (HEALTH_TIMEOUT_MS / 1000) + ' ثانیه پاسخ نداد.' +
              ' آخرین پیام موتور:\n' + self.tailServerLog(1500)
          );
        }
        self.status = 'ready';
        self._emitProgress('آماده');
        self.emit('ready', self.baseUrl);
        return self.baseUrl;
      })
      .catch((err) => {
        self.status = 'failed';
        self.lastError = (err && err.message) || String(err);
        self._log('شکست: ' + self.lastError);
        self.emit('failed', self.lastError);
        return null;
      })
      .then((result) => {
        self._startPromise = null;
        return result;
      });

    return self._startPromise;
  }

  _openServerLog() {
    try {
      fs.mkdirSync(this.logsDir, { recursive: true });
      this._serverLogPath = path.join(this.logsDir, 'server.log');
      this._rotateIfNeeded(this._serverLogPath);
      this._serverLogFd = fs.openSync(this._serverLogPath, 'a');
      const header =
        '\n===== ' + new Date().toISOString() + ' | pid:' + process.pid +
        ' | port:' + this.port + ' =====\n';
      fs.writeSync(this._serverLogFd, header);
    } catch (e) {
      this._serverLogPath = null;
      this._serverLogFd = null;
      this._log('نمی‌توان فایل لاگ سرور را باز کرد: ' + (e && e.message));
    }
  }

  /** نوشتن خروجی سرور در فایل + نگه‌داشتن انتهای آن در حافظه برای پیام خطا */
  _writeServerLog(chunk) {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    // بافر انتهایی (برای صفحهٔ خطا)
    this._tailBuf = (this._tailBuf + text);
    if (this._tailBuf.length > TAIL_BUFFER_BYTES) {
      this._tailBuf = this._tailBuf.slice(this._tailBuf.length - TAIL_BUFFER_BYTES);
    }
    // فایل — با چرخشِ در حین اجرا (برخلاف fd ثابت)
    this._appendRaw(this._serverLogPath, text);
  }

  _appendRaw(file, text) {
    try {
      if (!file) return;
      // چرخشِ سبک: فقط وقتی از حد گذشت فایل فعلی را ببند، بچرخان، باز کن
      try {
        if (this._serverLogFd !== null && fs.statSync(file).size > LOG_MAX_BYTES) {
          fs.closeSync(this._serverLogFd);
          this._rotateIfNeeded(file);
          this._serverLogFd = fs.openSync(file, 'a');
        }
      } catch (e) {
        /* ignore */
      }
      if (this._serverLogFd === null) {
        this._serverLogFd = fs.openSync(file, 'a');
      }
      fs.writeSync(this._serverLogFd, text);
    } catch (e) {
      /* ignore */
    }
  }

  /** آخرین خطوط خروجی سرور — برای نمایش علت دقیق در صفحهٔ خطا */
  tailServerLog(maxChars) {
    const max = typeof maxChars === 'number' ? maxChars : 4000;
    let t = (this._tailBuf || '').replace(/\r/g, '');
    if (t.length > max) t = t.slice(t.length - max);
    return t.trim();
  }

  _spawnServer(nodeInfo, serverEntry, env, serverDir, nodeArgs) {
    const args = nodeArgs.slice();
    if (nodeInfo.electronAsNode) {
      // electron خودِ dev را به node تبدیل می‌کنیم
      env.ELECTRON_RUN_AS_NODE = '1';
    }
    args.push(serverEntry);

    // خروجی از طریق pipe خوانده می‌شود (نه fd ثابت) تا:
    //   ۱) چرخش لاگ در حین اجرا ممکن باشد
    //   ۲) انتهای خروجی برای پیام خطا در حافظه بماند
    const child = spawn(nodeInfo.exe, args, {
      cwd: serverDir,
      env: env,
      windowsHide: true, // ← هیچ پنجرهٔ CMD/PowerShell باز نمی‌شود
      detached: false, // فرزندِ عادی — به‌علاوهٔ taskkill دستی هنگام خروج
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    this._childExitInfo = null;

    child.stdout.on('data', (c) => this._writeServerLog(c));
    child.stderr.on('data', (c) => this._writeServerLog(c));

    child.on('error', (err) => {
      this._log('خطای spawn: ' + (err && err.message));
      this._childExitInfo = { code: 'spawn-error', signal: String((err && err.message) || err) };
      // اگر خودِ spawn شکست بخورد، پروسه‌ای برای exit event وجود ندارد
      this._handleCrash(new Error('اجرای موتور ممکن نشد: ' + (err && err.message)));
    });

    child.on('exit', (code, signal) => {
      this._log('پروسهٔ node تمام شد (code=' + code + ' signal=' + signal + ')');
      if (this.child === child) this.child = null;
      if (this.stopping || this.status === 'stopped') return;
      if (this.status === 'starting') {
        // قبل از ready مرده — _waitForHealth همان لحظه شکست می‌خورد (fail-fast)
        this._childExitInfo = { code: code === null ? '?' : code, signal: signal || '-' };
        return;
      }
      if (this.status === 'ready') {
        // سرورِ آماده کرش کرده — ری‌استارت با backoff
        this.status = 'starting';
        this._handleCrash(new Error('پروسهٔ سرور به‌طور غیرمنتظره بسته شد (code=' + code + ')'));
      }
    });

    return child;
  }

  _handleCrash(reason) {
    if (this.stopping) return;
    if (this.crashRetries >= MAX_CRASH_RETRIES) {
      this.status = 'failed';
      this.lastError =
        'موتور برنامه چند بار (بیش از ' + MAX_CRASH_RETRIES + ' بار) متوقف شد: ' +
        (reason && reason.message ? reason.message : reason) +
        '\nآخرین پیام موتور:\n' + this.tailServerLog(1500);
      this._log(this.lastError);
      this.emit('failed', this.lastError);
      return;
    }
    const backoffMs = 1000 * Math.pow(2, this.crashRetries); // 1s, 2s, 4s
    this.crashRetries++;
    this._log('ری‌استارت خودکار ' + this.crashRetries + '/' + MAX_CRASH_RETRIES + ' تا ' + backoffMs + 'ms دیگر…');
    this.emit('progress', 'راه‌اندازی مجدد خودکار سرور…');
    setTimeout(() => {
      if (this.stopping) return;
      // پورت بعدی را امتحان می‌کنیم (شاید قبلی در دست یک پروسهٔ زامبی مانده باشد)
      const nextOffset = Math.min(this.crashRetries, PORT_RANGE_SIZE - 1);
      this.start(nextOffset);
    }, backoffMs);
  }

  /* ─────────────────────────── diagnose ─────────────────────────── */

  /**
   * چک‌لیست سلامت برای منوی «کمک ← تشخیص مشکلات»
   * خروجی: [{title, status: ok|warn|fail, detail, fix}]
   */
  diagnose() {
    const self = this;
    const checks = [];
    const mb = (n) => (n / (1024 * 1024)).toFixed(1) + ' MB';

    // ۱) server.js
    try {
      const dir = self.runningServerDir || self.serverDir;
      const entry = path.join(dir, 'server.js');
      const ok = fs.existsSync(entry);
      checks.push({
        title: 'فایل موتور برنامه (server.js)',
        status: ok ? 'ok' : 'fail',
        detail: entry,
        fix: ok ? '' : 'نصب ناقص است. برنامه را از کنترل پنل حذف و دوباره از فایل Setup نصب کنید.',
      });
    } catch (e) {
      checks.push({ title: 'فایل موتور برنامه (server.js)', status: 'fail', detail: String(e.message), fix: '' });
    }

    // ۲) node.exe
    try {
      const info = self._resolveNode();
      checks.push({
        title: 'موتور اجرا (node.exe)',
        status: 'ok',
        detail: info.exe + (info.version ? ' — ' + info.version : ''),
        fix: '',
      });
    } catch (e) {
      checks.push({
        title: 'موتور اجرا (node.exe)',
        status: 'fail',
        detail: String(e.message),
        fix: 'نصب ناقص یا آنتی‌ویروس فایل را حذف کرده است. برنامه را دوباره نصب کنید و پوشهٔ نصب را در استثنائات آنتی‌ویروس بگذارید.',
      });
    }

    // ۳) دیتابیس
    try {
      if (fs.existsSync(self.dbPath)) {
        const size = fs.statSync(self.dbPath).size;
        // قابل نوشتن؟
        const probe = path.join(self.dataDir, '.write-probe-' + Date.now());
        fs.writeFileSync(probe, 'ok');
        fs.unlinkSync(probe);
        checks.push({
          title: 'دیتابیس حسابداری',
          status: size > 1024 ? 'ok' : 'warn',
          detail: self.dbPath + ' (' + mb(size) + ')',
          fix: size > 1024 ? '' : 'دیتابیس تقریباً خالی است. اگر دادهٔ قبلی داشته‌اید، فایل custom.db قبلی را در این مسیر قرار دهید.',
        });
      } else {
        checks.push({
          title: 'دیتابیس حسابداری',
          status: 'fail',
          detail: self.dbPath + ' وجود ندارد',
          fix: 'فایل دیتابیس ساخته نشد — احتمالاً آنتی‌ویروس یا کمبود فضا. «تلاش دوباره» بزنید.',
        });
      }
    } catch (e) {
      checks.push({
        title: 'دیتابیس حسابداری',
        status: 'fail',
        detail: String(e.message),
        fix: 'پوشهٔ ' + self.dataDir + ' باید قابل نوشتن باشد. آنتی‌ویروس را بررسی کنید.',
      });
    }

    // ۴) کلید امنیتی
    try {
      const cfg = self._readJsonSafe(self.configPath, null);
      const ok = cfg && typeof cfg.jwtSecret === 'string' && cfg.jwtSecret.length >= 32;
      checks.push({
        title: 'کلید امنیتی نشست‌ها (config.json)',
        status: ok ? 'ok' : 'fail',
        detail: self.configPath,
        fix: ok ? '' : 'فایل config.json معتبر نیست — آن را حذف کنید و برنامه را دوباره باز کنید (خودکار ساخته می‌شود).',
      });
    } catch (e) {
      checks.push({ title: 'کلید امنیتی نشست‌ها', status: 'fail', detail: String(e.message), fix: '' });
    }

    // ۵) لاگ‌ها قابل نوشتن؟
    try {
      fs.mkdirSync(self.logsDir, { recursive: true });
      const probe = path.join(self.logsDir, '.write-probe-' + Date.now());
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      checks.push({ title: 'پوشهٔ لاگ‌ها', status: 'ok', detail: self.logsDir, fix: '' });
    } catch (e) {
      checks.push({
        title: 'پوشهٔ لاگ‌ها',
        status: 'fail',
        detail: String(e.message),
        fix: 'پوشهٔ ' + self.logsDir + ' باید قابل نوشتن باشد.',
      });
    }

    // ۶) فضای دیسک (fs.statfs از Node 18.15+ — در Electron 22 قدیمی‌تر نیست)
    try {
      if (typeof fs.statfsSync === 'function') {
        const st = fs.statfsSync(self.userDataDir);
        const freeMb = Math.floor((st.bsize * st.bavail) / (1024 * 1024));
        checks.push({
          title: 'فضای آزاد دیسک',
          status: freeMb < 100 ? 'fail' : freeMb < 500 ? 'warn' : 'ok',
          detail: freeMb + ' MB آزاد در درایو داده‌ها',
          fix: freeMb < 500 ? 'حداقل ۵۰۰ مگابایت فضا آزاد کنید (فایل‌های موقت ویندوز را پاک کنید).' : '',
        });
      } else {
        checks.push({
          title: 'فضای آزاد دیسک',
          status: 'warn',
          detail: 'در این نسخهٔ ویندوز/برنامه قابل اندازه‌گیری نیست',
          fix: 'مطمئن شوید حداقل ۵۰۰ مگابایت فضای آزاد دارید.',
        });
      }
    } catch (e) {
      checks.push({ title: 'فضای آزاد دیسک', status: 'warn', detail: String(e.message), fix: '' });
    }

    // ۷) پورت‌ها — async
    const portChecks = [];
    for (let i = 0; i < PORT_RANGE_SIZE; i++) {
      const port = PORT_RANGE_START + i;
      portChecks.push(
        self._checkPortFree(port).then((free) => ({ port: port, free: free }))
      );
    }

    // ۸) وضعیت فعلی سرور
    const statusFa = { idle: 'آماده به کار', starting: 'در حال راه‌اندازی', ready: 'در حال اجرا', failed: 'شکست‌خورده', stopped: 'متوقف' };
    checks.push({
      title: 'وضعیت موتور برنامه',
      status: self.status === 'ready' ? 'ok' : self.status === 'failed' ? 'fail' : 'warn',
      detail: (statusFa[self.status] || self.status) + (self.port ? ' — پورت ' + self.port : '') +
        (self.status === 'failed' && self.lastError ? ' — ' + self.lastError : ''),
      fix: self.status === 'failed' ? 'دکمهٔ «تلاش دوباره» را در پنجرهٔ خطا بزنید.' : '',
    });

    return Promise.all(portChecks).then((results) => {
      const busy = [];
      for (let i = 0; i < results.length; i++) {
        if (!results[i].free) busy.push(results[i].port);
      }
      if (busy.length === 0) {
        checks.push({
          title: 'پورت‌های شبکه (' + PORT_RANGE_START + ' تا ' + (PORT_RANGE_START + PORT_RANGE_SIZE - 1) + ')',
          status: 'ok',
          detail: 'همه آزادند',
          fix: '',
        });
      } else if (busy.length >= PORT_RANGE_SIZE) {
        checks.push({
          title: 'پورت‌های شبکه (' + PORT_RANGE_START + ' تا ' + (PORT_RANGE_START + PORT_RANGE_SIZE - 1) + ')',
          status: 'fail',
          detail: 'همه اشغال‌اند: ' + busy.join('، '),
          fix: 'نمونهٔ قبلی برنامه در حافظه مانده است. ویندوز را ری‌استارت کنید یا از منوی کنار ساعت «خروج کامل» بزنید.',
        });
      } else {
        checks.push({
          title: 'پورت‌های شبکه (' + PORT_RANGE_START + ' تا ' + (PORT_RANGE_START + PORT_RANGE_SIZE - 1) + ')',
          status: 'warn',
          detail: 'اشغال: ' + busy.join('، ') + ' — بقیه آزادند',
          fix: 'برنامه از پورت آزاد استفاده می‌کند؛ اقدام لازم نیست.',
        });
      }
      return checks;
    });
  }

  /* ─────────────────────────── STOP ─────────────────────────── */

  stop() {
    this.stopping = true;
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    this._killChild(this.seedChild);
    this.seedChild = null;
    this._killChild(this.child);
    this.child = null;
    if (this._serverLogFd !== null) {
      try {
        fs.closeSync(this._serverLogFd);
      } catch (e) {
        /* ignore */
      }
      this._serverLogFd = null;
    }
    if (this.status !== 'failed') this.status = 'stopped';
  }

  _killChild(child) {
    if (!child || !child.pid) return;
    try {
      if (process.platform === 'win32') {
        // taskkill با windowsHide ⇒ بدون فلش پنجرهٔ کنسول؛ /T فرزندان، /F قطعی
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      } else {
        try {
          child.kill('SIGTERM');
        } catch (e) {
          try {
            child.kill('SIGKILL');
          } catch (e2) {
            /* ignore */
          }
        }
      }
    } catch (e) {
      this._log('خطا هنگام بستن پروسهٔ ' + child.pid + ': ' + (e && e.message));
    }
  }

  /** ری‌استارت کامل (دکمهٔ «تلاش مجدد» صفحهٔ خطا) */
  restart() {
    this._log('ری‌استارت دستی…');
    this.crashRetries = 0;
    this.stop();
    this.stopping = false;
    this.status = 'idle';
    return this.start(0);
  }
}

/* خروجی singleton — main.js همین را require می‌کند */
const manager = new ServerManager();

/* حتی اگر main.js نتوانست، هنگام exit پروسه‌ها بسته شوند — کمربندِ نجات */
process.on('exit', () => {
  try {
    manager.stop();
  } catch (e) {
    /* ignore */
  }
});

module.exports = manager;
module.exports.ServerManager = ServerManager;
