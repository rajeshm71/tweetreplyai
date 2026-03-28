import {
  AUTO_REFRESH,
  AUTO_REFRESH_STORAGE_QUERY_KEYS,
  randomIntInclusive,
} from '../config/constants.js';

(function initImpressionBoostAutoRefresh() {
  if (window.__ibAutoRefreshInit) return;
  window.__ibAutoRefreshInit = true;

  const LOG = '[ImpressionBoost]';
  const k = AUTO_REFRESH.STORAGE_KEYS;
  const D = AUTO_REFRESH.DEFAULTS;
  const LIM = AUTO_REFRESH.LIMITS;
  let pendingTimer = null;

  function debug(...args) {
    if (AUTO_REFRESH.DEBUG) console.log(LOG, ...args);
  }

  function clearPending() {
    if (pendingTimer != null) { clearTimeout(pendingTimer); pendingTimer = null; }
  }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function getBounds(data) {
    return {
      shortMin: clamp(Number(data[k.shortDelayMinSec] ?? D.shortDelayMinSec), LIM.shortDelayMinSec, LIM.shortDelayMaxSec),
      shortMax: clamp(Number(data[k.shortDelayMaxSec] ?? D.shortDelayMaxSec), LIM.shortDelayMinSec, LIM.shortDelayMaxSec),
      longMin:  clamp(Number(data[k.longPauseMinSec]  ?? D.longPauseMinSec),  LIM.longPauseMinSec,  LIM.longPauseMaxSec),
      longMax:  clamp(Number(data[k.longPauseMaxSec]  ?? D.longPauseMaxSec),  LIM.longPauseMinSec,  LIM.longPauseMaxSec),
      burstMin: clamp(Number(data[k.reloadBurstMin]   ?? D.reloadBurstMin),   LIM.reloadBurstMin,   LIM.reloadBurstMax),
      burstMax: clamp(Number(data[k.reloadBurstMax]   ?? D.reloadBurstMax),   LIM.reloadBurstMin,   LIM.reloadBurstMax),
    };
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function simulateReading() {
    const stepCount = randomIntInclusive(4, 9);
    let totalScrolled = 0;
    for (let i = 0; i < stepCount; i++) {
      const stepPx = randomIntInclusive(55, 130);
      window.scrollBy({ top: stepPx, behavior: 'smooth' });
      totalScrolled += stepPx;
      await sleep(randomIntInclusive(700, 3200));
    }
    if (Math.random() < 0.55) {
      const backPx = randomIntInclusive(
        Math.floor(totalScrolled * 0.25),
        Math.floor(totalScrolled * 0.6),
      );
      window.scrollBy({ top: -backPx, behavior: 'smooth' });
      await sleep(randomIntInclusive(500, 1400));
    }
  }

  function readingIntervalBounds(snap) {
    let imin = clamp(
      Number(snap[k.readingIntervalMin] ?? D.readingIntervalMin),
      LIM.readingIntervalMin,
      LIM.readingIntervalMax,
    );
    let imax = clamp(
      Number(snap[k.readingIntervalMax] ?? D.readingIntervalMax),
      LIM.readingIntervalMin,
      LIM.readingIntervalMax,
    );
    const lo = Math.min(imin, imax);
    const hi = Math.max(imin, imax);
    return { lo, hi };
  }

  async function scheduleShortGap(bounds) {
    const smin = Math.min(bounds.shortMin, bounds.shortMax);
    const smax = Math.max(bounds.shortMin, bounds.shortMax);
    const s = randomIntInclusive(smin, smax);
    pendingTimer = setTimeout(async () => {
      pendingTimer = null;
      try {
        const snap = await chrome.storage.local.get(AUTO_REFRESH_STORAGE_QUERY_KEYS);
        if (!snap[k.enabled]) return;

        const readingOn = Boolean(snap[k.readingSimEnabled] ?? D.readingSimEnabled);
        const done = Number(snap[k.reloadsDoneInBurst] ?? 0) + 1;
        const payload = { [k.reloadsDoneInBurst]: done };

        if (readingOn) {
          const { lo, hi } = readingIntervalBounds(snap);
          let threshold = snap[k.readingThresholdN];
          if (threshold == null) {
            threshold = randomIntInclusive(lo, hi);
          } else {
            threshold = clamp(Number(threshold), lo, hi);
          }
          const nextSince = Number(snap[k.reloadsSinceReading] ?? 0) + 1;
          let nextSinceOut = nextSince;
          let nextThreshold = threshold;
          if (nextSince >= threshold) {
            debug('simulateReading before reload');
            await simulateReading();
            nextSinceOut = 0;
            nextThreshold = randomIntInclusive(lo, hi);
          }
          payload[k.reloadsSinceReading] = nextSinceOut;
          payload[k.readingThresholdN] = nextThreshold;
        }

        await chrome.storage.local.set(payload);
        location.reload();
      } catch (e) {
        console.error(LOG, 'short gap error:', e?.message || e);
      }
    }, s * 1000);
  }

  async function run() {
    clearPending();
    // Guard: extension context may be invalidated after extension reload
    try { void chrome.runtime?.id; } catch { return; }

    let data;
    try { data = await chrome.storage.local.get(AUTO_REFRESH_STORAGE_QUERY_KEYS); } catch { return; }

    if (!data[k.enabled]) return;
    const prefix = String(data[k.urlPrefix] || '').trim();
    if (!prefix || !location.href.startsWith(prefix)) return;

    const bounds = getBounds(data);
    if (bounds.shortMin > bounds.shortMax || bounds.longMin > bounds.longMax || bounds.burstMin > bounds.burstMax) {
      debug('invalid bounds, skipping'); return;
    }

    // Reset burst state if config version changed
    if (Number(data[k.configVersion] ?? 0) !== AUTO_REFRESH.CONFIG_VERSION) {
      await chrome.storage.local.set({
        [k.configVersion]:       AUTO_REFRESH.CONFIG_VERSION,
        [k.reloadsDoneInBurst]:  0,
        [k.currentBurstTargetN]: randomIntInclusive(bounds.burstMin, bounds.burstMax),
        [k.reloadsSinceReading]: 0,
      });
      try {
        await chrome.storage.local.remove(k.readingThresholdN);
      } catch { /* ignore */ }
      data = await chrome.storage.local.get(AUTO_REFRESH_STORAGE_QUERY_KEYS);
    }

    let done   = Number(data[k.reloadsDoneInBurst] ?? 0);
    let target = data[k.currentBurstTargetN];

    if (target == null) {
      target = randomIntInclusive(bounds.burstMin, bounds.burstMax);
      await chrome.storage.local.set({ [k.currentBurstTargetN]: target });
      done = Number((await chrome.storage.local.get(k.reloadsDoneInBurst))[k.reloadsDoneInBurst] ?? 0);
    }
    target = clamp(Number(target), Math.min(bounds.burstMin, bounds.burstMax), Math.max(bounds.burstMin, bounds.burstMax));

    if (done >= target) {
      const Lsec = randomIntInclusive(Math.min(bounds.longMin, bounds.longMax), Math.max(bounds.longMin, bounds.longMax));
      debug(`long pause ${Lsec}s (burst done ${done}/${target})`);
      pendingTimer = setTimeout(async () => {
        pendingTimer = null;
        try {
          const snap = await chrome.storage.local.get(AUTO_REFRESH_STORAGE_QUERY_KEYS);
          if (!snap[k.enabled]) return;
          const b = getBounds(snap);
          const newTarget = randomIntInclusive(Math.min(b.burstMin, b.burstMax), Math.max(b.burstMin, b.burstMax));
          await chrome.storage.local.set({ [k.reloadsDoneInBurst]: 0, [k.currentBurstTargetN]: newTarget });
          debug(`new burst target ${newTarget}`);
          await scheduleShortGap(b);
        } catch (e) { console.error(LOG, 'long pause error:', e?.message || e); }
      }, Lsec * 1000);
      return;
    }

    debug(`short gap (burst ${done}/${target})`);
    await scheduleShortGap(bounds);
  }

  // Re-run when user saves new settings from popup.
  // Intentionally does NOT react to reloadsDoneInBurst / currentBurstTargetN —
  // those are written by the scheduler itself; reacting would cancel the pending reload.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const relevant = changes[k.enabled] || changes[k.urlPrefix] ||
      changes[k.shortDelayMinSec] || changes[k.shortDelayMaxSec] ||
      changes[k.longPauseMinSec]  || changes[k.longPauseMaxSec]  ||
      changes[k.reloadBurstMin]   || changes[k.reloadBurstMax]   ||
      changes[k.readingSimEnabled] || changes[k.readingIntervalMin] || changes[k.readingIntervalMax];
    if (!relevant) return;
    clearPending();
    void run();
  });

  void run();
})();
