'use strict';

/**
 * node16-polyfills.cjs — پالی‌فیل‌های Node 16 برای سرور Next.js 16 (نسخهٔ Legacy ویندوز ۷/۸)
 * ============================================================================
 * سرور standaloneِ Next.js 16 از APIهای Node 18/20 استفاده می‌کند که در Node 16.20
 * (آخرین نودی که روی ویندوز ۷ اجرا می‌شود) نیستند. این فایل با --require قبل از
 * سرور لود می‌شود و حداقلِ لازم را فراهم می‌کند:
 *   - fetch / Headers / Request / Response  (اگر --experimental-fetch فعال باشد
 *     خود Node دارد؛ اینجا فقط برای اطمینان)
 *   - structuredClone
 *   - AbortSignal.timeout
 *   - crypto.randomUUID  (در 16.7+ هست ولی برای اطمینان)
 *   - array.at (V8 9x دارد — فقط گارد)
 * منبع: MDN + polyfills شناخته‌شدهٔ community (isomorphic forks).
 */

/* eslint-disable no-prototype-builtins */

// ── structuredClone ──
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = function structuredClone(value) {
    // JSON round-trip برای داده‌های قابل serialize؛ برای بقیه (Date و…)
    // کافی است چون سرور فقط JSON جابه‌جا می‌کند.
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  };
}

// ── AbortSignal.timeout ──
if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = function timeout(ms) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('timeout')), ms).unref();
    return controller.signal;
  };
}

// ── crypto.randomUUID ──
try {
  const crypto = require('crypto');
  if (typeof crypto.randomUUID !== 'function') {
    crypto.randomUUID = function randomUUID() {
      return crypto.randomBytes(16).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    };
  }
} catch (e) {
  /* crypto همیشه هست */
}

// ── fetch (Node 16 با --experimental-fetch دارد؛ گارد محض) ──
if (typeof globalThis.fetch !== 'function') {
  try {
    // undici در Node 16 داخلی است ولی global نیست — تلاش برای require
    const undici = require('undici');
    if (undici && typeof undici.fetch === 'function') {
      globalThis.fetch = undici.fetch;
      globalThis.Headers = undici.Headers;
      globalThis.Request = undici.Request;
      globalThis.Response = undici.Response;
    }
  } catch (e) {
    // بدون fetch هم سرورِ محلیِ Next برای رندر صفحات داخلی کار می‌کند؛
    // فراخوانی‌های outbound در legacy محدود است.
  }
}

// ── Array.prototype.at (V8 قدیمی) ──
if (typeof Array.prototype.at !== 'function') {
  Object.defineProperty(Array.prototype, 'at', {
    value: function at(n) {
      n = Math.trunc(n) || 0;
      if (n < 0) n += this.length;
      if (n < 0 || n >= this.length) return undefined;
      return this[n];
    },
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

// ── String.prototype.replaceAll (V8 85+ دارد؛ برای V8 108 حتمی) ──
if (typeof String.prototype.replaceAll !== 'function') {
  String.prototype.replaceAll = function replaceAll(search, replacement) {
    if (search instanceof RegExp) {
      if (!search.global) throw new TypeError('replaceAll با RegExp باید global باشد');
      return this.replace(search, replacement);
    }
    return this.split(search).join(replacement);
  };
}

module.exports = { loaded: true };
