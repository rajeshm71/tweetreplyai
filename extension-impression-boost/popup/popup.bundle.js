"use strict";
(() => {
  // extension-impression-boost/config/constants.js
  var AUTO_REFRESH = {
    CONFIG_VERSION: 2,
    STORAGE_KEYS: {
      enabled: "ibAutoRefreshEnabled",
      urlPrefix: "ibAutoRefreshUrlPrefix",
      shortDelayMinSec: "ibAutoRefreshShortDelayMinSec",
      shortDelayMaxSec: "ibAutoRefreshShortDelayMaxSec",
      longPauseMinSec: "ibAutoRefreshLongPauseMinSec",
      longPauseMaxSec: "ibAutoRefreshLongPauseMaxSec",
      reloadBurstMin: "ibAutoRefreshReloadBurstMin",
      reloadBurstMax: "ibAutoRefreshReloadBurstMax",
      reloadsDoneInBurst: "ibAutoRefreshReloadsDoneInBurst",
      currentBurstTargetN: "ibAutoRefreshCurrentBurstTargetN",
      configVersion: "ibAutoRefreshConfigVersion",
      readingSimEnabled: "ibReadingSimEnabled",
      readingIntervalMin: "ibReadingIntervalMin",
      readingIntervalMax: "ibReadingIntervalMax",
      reloadsSinceReading: "ibReloadsSinceReading",
      readingThresholdN: "ibReadingThresholdN"
    },
    DEFAULTS: {
      shortDelayMinSec: 1,
      shortDelayMaxSec: 10,
      longPauseMinSec: 120,
      longPauseMaxSec: 180,
      reloadBurstMin: 5,
      reloadBurstMax: 20,
      readingSimEnabled: true,
      readingIntervalMin: 10,
      readingIntervalMax: 10
    },
    LIMITS: {
      shortDelayMinSec: 1,
      shortDelayMaxSec: 600,
      longPauseMinSec: 30,
      longPauseMaxSec: 3600,
      reloadBurstMin: 1,
      reloadBurstMax: 200,
      readingIntervalMin: 1,
      readingIntervalMax: 200
    },
    /** Flip to true locally to verbose-log scheduler steps in content script. */
    DEBUG: false
  };
  var AUTO_REFRESH_STORAGE_QUERY_KEYS = Object.values(AUTO_REFRESH.STORAGE_KEYS);
  function randomIntInclusive(min, max) {
    const a = Math.ceil(Number(min));
    const b = Math.floor(Number(max));
    if (b < a) return a;
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  // extension-impression-boost/popup/popup.js
  var PopupManager = class {
    constructor() {
      this.initializeElements();
      this.attachEventListeners();
      this.loadSettings();
    }
    initializeElements() {
      this.enabledEl = document.getElementById("ib-enabled");
      this.urlEl = document.getElementById("ib-url");
      this.shortMinEl = document.getElementById("ib-short-min");
      this.shortMaxEl = document.getElementById("ib-short-max");
      this.longMinEl = document.getElementById("ib-long-min");
      this.longMaxEl = document.getElementById("ib-long-max");
      this.burstMinEl = document.getElementById("ib-burst-min");
      this.burstMaxEl = document.getElementById("ib-burst-max");
      this.readingEnabledEl = document.getElementById("ib-reading-enabled");
      this.readingIntervalMinEl = document.getElementById("ib-reading-interval-min");
      this.readingIntervalMaxEl = document.getElementById("ib-reading-interval-max");
      this.statusEl = document.getElementById("ib-status");
      this.saveBtn = document.getElementById("ib-save");
    }
    attachEventListeners() {
      this.saveBtn?.addEventListener("click", () => this.saveSettings());
    }
    async loadSettings() {
      const k = AUTO_REFRESH.STORAGE_KEYS;
      const d = AUTO_REFRESH.DEFAULTS;
      const result = await chrome.storage.local.get([
        k.enabled,
        k.urlPrefix,
        k.shortDelayMinSec,
        k.shortDelayMaxSec,
        k.longPauseMinSec,
        k.longPauseMaxSec,
        k.reloadBurstMin,
        k.reloadBurstMax,
        k.readingSimEnabled,
        k.readingIntervalMin,
        k.readingIntervalMax
      ]);
      if (this.enabledEl) this.enabledEl.checked = Boolean(result[k.enabled]);
      if (this.urlEl) this.urlEl.value = result[k.urlPrefix] || "https://x.com/home";
      if (this.shortMinEl) this.shortMinEl.value = String(result[k.shortDelayMinSec] ?? d.shortDelayMinSec);
      if (this.shortMaxEl) this.shortMaxEl.value = String(result[k.shortDelayMaxSec] ?? d.shortDelayMaxSec);
      if (this.longMinEl) this.longMinEl.value = String(result[k.longPauseMinSec] ?? d.longPauseMinSec);
      if (this.longMaxEl) this.longMaxEl.value = String(result[k.longPauseMaxSec] ?? d.longPauseMaxSec);
      if (this.burstMinEl) this.burstMinEl.value = String(result[k.reloadBurstMin] ?? d.reloadBurstMin);
      if (this.burstMaxEl) this.burstMaxEl.value = String(result[k.reloadBurstMax] ?? d.reloadBurstMax);
      if (this.readingEnabledEl) {
        this.readingEnabledEl.checked = Boolean(result[k.readingSimEnabled] ?? d.readingSimEnabled);
      }
      if (this.readingIntervalMinEl) {
        this.readingIntervalMinEl.value = String(result[k.readingIntervalMin] ?? d.readingIntervalMin);
      }
      if (this.readingIntervalMaxEl) {
        this.readingIntervalMaxEl.value = String(result[k.readingIntervalMax] ?? d.readingIntervalMax);
      }
      this.setStatus("");
    }
    parsePositiveInt(value, fallback) {
      const n = parseInt(String(value), 10);
      return Number.isFinite(n) ? n : fallback;
    }
    validateNumericFields() {
      const L = AUTO_REFRESH.LIMITS;
      const d = AUTO_REFRESH.DEFAULTS;
      const shortMin = this.parsePositiveInt(this.shortMinEl?.value, d.shortDelayMinSec);
      const shortMax = this.parsePositiveInt(this.shortMaxEl?.value, d.shortDelayMaxSec);
      const longMin = this.parsePositiveInt(this.longMinEl?.value, d.longPauseMinSec);
      const longMax = this.parsePositiveInt(this.longMaxEl?.value, d.longPauseMaxSec);
      const burstMin = this.parsePositiveInt(this.burstMinEl?.value, d.reloadBurstMin);
      const burstMax = this.parsePositiveInt(this.burstMaxEl?.value, d.reloadBurstMax);
      const readingMin = this.parsePositiveInt(this.readingIntervalMinEl?.value, d.readingIntervalMin);
      const readingMax = this.parsePositiveInt(this.readingIntervalMaxEl?.value, d.readingIntervalMax);
      if (shortMin < L.shortDelayMinSec || shortMin > L.shortDelayMaxSec || shortMax < L.shortDelayMinSec || shortMax > L.shortDelayMaxSec) {
        return { ok: false, error: `Short delay: ${L.shortDelayMinSec}\u2013${L.shortDelayMaxSec}s.` };
      }
      if (shortMin > shortMax) {
        return { ok: false, error: "Short delay min must be \u2264 max." };
      }
      if (longMin < L.longPauseMinSec || longMin > L.longPauseMaxSec || longMax < L.longPauseMinSec || longMax > L.longPauseMaxSec) {
        return { ok: false, error: `Long pause: ${L.longPauseMinSec}\u2013${L.longPauseMaxSec}s.` };
      }
      if (longMin > longMax) {
        return { ok: false, error: "Long pause min must be \u2264 max." };
      }
      if (burstMin < L.reloadBurstMin || burstMin > L.reloadBurstMax || burstMax < L.reloadBurstMin || burstMax > L.reloadBurstMax) {
        return { ok: false, error: `Burst count: ${L.reloadBurstMin}\u2013${L.reloadBurstMax}.` };
      }
      if (burstMin > burstMax) {
        return { ok: false, error: "Burst min must be \u2264 max." };
      }
      if (readingMin < L.readingIntervalMin || readingMin > L.readingIntervalMax || readingMax < L.readingIntervalMin || readingMax > L.readingIntervalMax) {
        return { ok: false, error: `Reading interval N: ${L.readingIntervalMin}\u2013${L.readingIntervalMax}.` };
      }
      if (readingMin > readingMax) {
        return { ok: false, error: "Reading interval min must be \u2264 max." };
      }
      return {
        ok: true,
        shortMin,
        shortMax,
        longMin,
        longMax,
        burstMin,
        burstMax,
        readingMin,
        readingMax
      };
    }
    normalizeUrlPrefix(raw) {
      const trimmed = String(raw || "").trim();
      if (!trimmed) return { ok: false, error: "URL prefix is required when auto-refresh is enabled." };
      let u;
      try {
        u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
      } catch {
        return { ok: false, error: "Invalid URL." };
      }
      if (u.protocol !== "https:") return { ok: false, error: "URL must use https." };
      const host = u.hostname.toLowerCase();
      const allowed = [
        "x.com",
        "www.x.com",
        "twitter.com",
        "www.twitter.com",
        "linkedin.com",
        "www.linkedin.com"
      ];
      if (!allowed.includes(host)) {
        return { ok: false, error: "Host must be x.com, twitter.com, or linkedin.com." };
      }
      if (host === "www.x.com") u.hostname = "x.com";
      if (host === "www.twitter.com") u.hostname = "twitter.com";
      if (host === "linkedin.com") u.hostname = "www.linkedin.com";
      let value = u.toString();
      if (value.endsWith("/") && u.pathname === "/") value = value.slice(0, -1);
      return { ok: true, value };
    }
    setStatus(message, isError = false) {
      if (!this.statusEl) return;
      this.statusEl.textContent = message || "";
      this.statusEl.classList.toggle("error", Boolean(isError));
    }
    async saveSettings() {
      const k = AUTO_REFRESH.STORAGE_KEYS;
      const enabled = Boolean(this.enabledEl?.checked);
      const numeric = this.validateNumericFields();
      if (!numeric.ok) {
        this.setStatus(numeric.error, true);
        return;
      }
      const readingPayload = {
        [k.readingSimEnabled]: Boolean(this.readingEnabledEl?.checked),
        [k.readingIntervalMin]: numeric.readingMin,
        [k.readingIntervalMax]: numeric.readingMax
      };
      if (enabled) {
        const urlNorm = this.normalizeUrlPrefix(this.urlEl?.value);
        if (!urlNorm.ok) {
          this.setStatus(urlNorm.error, true);
          return;
        }
        await chrome.storage.local.set({
          [k.configVersion]: AUTO_REFRESH.CONFIG_VERSION,
          [k.enabled]: true,
          [k.urlPrefix]: urlNorm.value,
          [k.shortDelayMinSec]: numeric.shortMin,
          [k.shortDelayMaxSec]: numeric.shortMax,
          [k.longPauseMinSec]: numeric.longMin,
          [k.longPauseMaxSec]: numeric.longMax,
          [k.reloadBurstMin]: numeric.burstMin,
          [k.reloadBurstMax]: numeric.burstMax,
          [k.reloadsDoneInBurst]: 0,
          [k.currentBurstTargetN]: randomIntInclusive(numeric.burstMin, numeric.burstMax),
          [k.reloadsSinceReading]: 0,
          ...readingPayload
        });
        await chrome.storage.local.remove(k.readingThresholdN);
        this.setStatus("Saved. Auto-refresh is on for matching URLs.");
      } else {
        const urlNorm = this.normalizeUrlPrefix(this.urlEl?.value || "");
        const payload = {
          [k.configVersion]: AUTO_REFRESH.CONFIG_VERSION,
          [k.enabled]: false,
          [k.shortDelayMinSec]: numeric.shortMin,
          [k.shortDelayMaxSec]: numeric.shortMax,
          [k.longPauseMinSec]: numeric.longMin,
          [k.longPauseMaxSec]: numeric.longMax,
          [k.reloadBurstMin]: numeric.burstMin,
          [k.reloadBurstMax]: numeric.burstMax,
          ...readingPayload
        };
        if (urlNorm.ok) payload[k.urlPrefix] = urlNorm.value;
        await chrome.storage.local.set(payload);
        this.setStatus("Auto-refresh off. Other settings saved.");
      }
    }
  };
  new PopupManager();
})();
