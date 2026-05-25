import { API } from '../config/constants.js';

const BATCH_SIZE = 250;
const LOG_PREFIX = '[TweetReply Followers][background]';

function parseApiError(error, status) {
  if (!error) return 'API request failed';
  const raw = String(error);
  try {
    const parsed = JSON.parse(raw);
    const message = parsed.message || raw;
    if (message === 'Please wait before syncing again' && typeof parsed.retryAfterMs === 'number') {
      const mins = Math.ceil(parsed.retryAfterMs / 60000);
      if (mins >= 60) {
        const hours = Math.ceil(mins / 60);
        return `Sync cooldown active. Try again in about ${hours} hour(s).`;
      }
      return `Sync cooldown active. Try again in about ${mins} minute(s).`;
    }
    return message;
  } catch (_e) {
    if (status === 429) return 'Too many requests. Please wait and try again.';
    return raw;
  }
}

function log(stage, message, data) {
  try {
    if (data !== undefined) console.log(LOG_PREFIX, stage + ':', message, data);
    else console.log(LOG_PREFIX, stage + ':', message);
  } catch (_e) {}
}

export class FollowerSyncManager {
  constructor(backgroundManager) {
    this.bg = backgroundManager;
    this.activeJob = null;
  }

  async apiRequest(endpoint, method, body) {
    log('api-request', `${method || 'GET'} ${endpoint}`, body ? { bodyKeys: Object.keys(body) } : undefined);
    return new Promise((resolve, reject) => {
      this.bg.handleApiRequest(
        { endpoint, method: method || 'GET', body, headers: {} },
        (response) => {
          if (!response || !response.success) {
            const errMsg = parseApiError(response?.error, response?.status);
            log('api-error', `${method || 'GET'} ${endpoint} failed`, { error: errMsg, status: response?.status });
            reject(new Error(errMsg));
            return;
          }
          log('api-success', `${method || 'GET'} ${endpoint} ok`);
          resolve(response.data);
        },
      );
    });
  }

  broadcastProgress(payload) {
    log('progress', 'Broadcasting', { status: payload.status, syncJobId: payload.syncJobId });
    try {
      chrome.runtime.sendMessage(Object.assign({ action: 'followerSyncProgress' }, payload));
    } catch (_e) {}
  }

  async getLoggedInXUsername(tabId) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
        if (link) {
          const href = link.getAttribute('href') || '';
          const match = href.match(/^\/([^/?]+)/);
          if (match && match[1] && match[1] !== 'home') return match[1];
        }
        const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
        if (switcher) {
          const text = switcher.textContent || '';
          const at = text.match(/@([A-Za-z0-9_]+)/);
          if (at) return at[1];
        }
        return null;
      },
    });
    log('auth-check', 'Logged-in X user from tab', { username: result || null });
    return result || null;
  }

  async findOrOpenXTab() {
    const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
    if (tabs.length) {
      log('tab', 'Using existing X tab', { tabId: tabs[0].id, url: tabs[0].url });
      return tabs[0];
    }
    log('tab', 'Opening new X tab');
    return chrome.tabs.create({ url: 'https://x.com/home', active: false });
  }

  async waitForTabLoad(tabId, timeoutMs = 20000) {
    log('tab-load', 'Waiting for tab load', { tabId, timeoutMs });
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') {
        log('tab-load', 'Tab loaded', { tabId, elapsedMs: Date.now() - start });
        return tab;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    log('tab-load', 'Tab load timeout', { tabId, elapsedMs: Date.now() - start });
    return chrome.tabs.get(tabId);
  }

  async waitForFollowersPageReady(tabId, xUsername, timeoutMs = 20000) {
    const followersPath = `/${xUsername}/followers`.toLowerCase();
    log('page-ready', 'Waiting for followers page', { tabId, followersPath, timeoutMs });
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (expectedPath) => {
          const onFollowersPage = location.pathname.toLowerCase() === expectedPath;
          const hasCells = !!document.querySelector('[data-testid="UserCell"]');
          const hasPrimary = !!document.querySelector('[data-testid="primaryColumn"]');
          return { onFollowersPage, hasCells, hasPrimary };
        },
        args: [followersPath],
      });
      if (result?.onFollowersPage && (result?.hasCells || result?.hasPrimary)) {
        log('page-ready', 'Followers page ready', { ...result, elapsedMs: Date.now() - start });
        return true;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    log('page-ready', 'Followers page timeout', { elapsedMs: Date.now() - start });
    return false;
  }

  async focusSyncTab(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      await chrome.tabs.update(tabId, { active: true });
      if (tab.windowId != null) {
        try {
          await chrome.windows.update(tab.windowId, { focused: true });
        } catch (_e) {
          // windows.focus may fail without extra permission; tab activation is enough.
        }
      }
      log('tab', 'Focused sync tab', { tabId, windowId: tab.windowId });
    } catch (err) {
      log('tab', 'Could not focus sync tab', { tabId, error: err.message });
    }
  }

  async sendRunFollowerSync(tabId, payload, retryOnDisconnect = true) {
    log('content-message', 'Sending runFollowerSync', {
      tabId,
      syncJobId: payload.syncJobId,
      xUsername: payload.xUsername,
      retryOnDisconnect,
    });
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          action: 'runFollowerSync',
          syncJobId: payload.syncJobId,
          xUsername: payload.xUsername,
          batchSize: BATCH_SIZE,
        },
        async (response) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message || '';
            log('content-message', 'sendMessage failed', { error: errMsg, retryOnDisconnect });
            if (
              retryOnDisconnect &&
              (errMsg.includes('Receiving end') || errMsg.includes('Could not establish'))
            ) {
              try {
                log('content-message', 'Reloading tab and retrying', { tabId });
                await chrome.tabs.reload(tabId);
                await this.waitForTabLoad(tabId, 25000);
                await this.waitForFollowersPageReady(tabId, payload.xUsername, 20000);
                await new Promise((r) => setTimeout(r, 3000));
                resolve(await this.sendRunFollowerSync(tabId, payload, false));
                return;
              } catch (_e) {
                resolve({ success: false, error: errMsg });
                return;
              }
            }
            resolve({ success: false, error: errMsg });
            return;
          }
          log('content-message', 'runFollowerSync response', response || {});
          resolve(response || { success: false, error: 'No response from content script' });
        },
      );
    });
  }

  async startSync() {
    if (this.activeJob) {
      log('start', 'Rejected — sync already in progress', this.activeJob);
      return { success: false, error: 'Sync already in progress' };
    }

    log('start', 'Sync requested');
    try {
      const user = await this.apiRequest('/api/auth/user', 'GET');
      if (!user?.xUsername) {
        log('start', 'Failed — no X username in settings');
        return { success: false, error: 'Set your X username in TweetReply settings first.' };
      }
      log('start', 'User loaded', { xUsername: user.xUsername });

      const tab = await this.findOrOpenXTab();
      await this.waitForTabLoad(tab.id);
      const loggedInXUsername = await this.getLoggedInXUsername(tab.id);
      if (!loggedInXUsername) {
        log('start', 'Failed — X login not detected');
        return { success: false, error: 'Log into X in your browser, then try again.' };
      }

      const startData = await this.apiRequest('/api/x-followers/sync/start', 'POST', {
        loggedInXUsername,
      });
      log('start', 'API sync job created', { syncJobId: startData.syncJobId, xUsername: startData.xUsername });

      this.activeJob = {
        syncJobId: startData.syncJobId,
        xUsername: startData.xUsername,
        tabId: tab.id,
      };

      this.broadcastProgress({
        syncJobId: startData.syncJobId,
        status: 'starting',
        xUsername: startData.xUsername,
      });

      await this.focusSyncTab(tab.id);
      let response = await this.sendRunFollowerSync(tab.id, startData);
      if (response.navigating) {
        log('start', 'Navigating to followers page, waiting…');
        await this.waitForTabLoad(tab.id, 25000);
        await this.waitForFollowersPageReady(tab.id, startData.xUsername, 20000);
        await new Promise((r) => setTimeout(r, 4500));
        await this.focusSyncTab(tab.id);
        response = await this.sendRunFollowerSync(tab.id, startData);
      }

      if (!response.success) {
        log('start', 'Failed to start content sync', { error: response.error });
        await this.failSync(startData.syncJobId, response.error);
        return { success: false, error: response.error };
      }

      log('start', 'Content sync started successfully', { syncJobId: startData.syncJobId });
      return { success: true, syncJobId: startData.syncJobId };
    } catch (err) {
      log('start', 'Unexpected error', { error: err.message });
      if (this.activeJob?.syncJobId) {
        await this.failSync(this.activeJob.syncJobId, err.message);
      }
      this.activeJob = null;
      return { success: false, error: err.message || 'Failed to start sync' };
    }
  }

  async uploadBatch(message) {
    if (!this.activeJob || this.activeJob.syncJobId !== message.syncJobId) {
      log('batch', 'Rejected — no active job', {
        syncJobId: message.syncJobId,
        activeJob: this.activeJob?.syncJobId || null,
      });
      return { success: false, error: 'No active sync job' };
    }
    try {
      log('batch', 'Uploading batch', {
        syncJobId: message.syncJobId,
        chunkIndex: message.chunkIndex,
        count: message.followers?.length || 0,
      });
      await this.apiRequest('/api/x-followers/sync-batch', 'POST', {
        syncJobId: message.syncJobId,
        chunkIndex: message.chunkIndex,
        followers: message.followers,
        isFinal: !!message.isFinal,
      });
      this.broadcastProgress({
        syncJobId: message.syncJobId,
        status: 'uploading',
        uploaded: message.chunkIndex * BATCH_SIZE + (message.followers?.length || 0),
        collected: message.collected,
      });
      log('batch', 'Batch uploaded');
      return { success: true };
    } catch (err) {
      log('batch', 'Batch upload failed', { error: err.message });
      await this.failSync(message.syncJobId, err.message);
      return { success: false, error: err.message };
    }
  }

  async completeSync(message) {
    if (!this.activeJob || this.activeJob.syncJobId !== message.syncJobId) {
      log('complete', 'Rejected — no active job', {
        syncJobId: message.syncJobId,
        activeJob: this.activeJob?.syncJobId || null,
      });
      return { success: false, error: 'No active sync job' };
    }
    try {
      log('complete', 'Completing sync', {
        syncJobId: message.syncJobId,
        followerCount: message.followerCount,
        profileFollowerCount: message.profileFollowerCount,
        syncedCount: message.syncedCount,
      });
      const result = await this.apiRequest('/api/x-followers/sync/complete', 'POST', {
        syncJobId: message.syncJobId,
        followerCount: message.followerCount,
        profileFollowerCount: message.profileFollowerCount,
        syncedCount: message.syncedCount,
      });
      this.activeJob = null;
      this.broadcastProgress({
        syncJobId: message.syncJobId,
        status: 'completed',
        result,
      });
      log('complete', 'Sync completed', { result });
      return { success: true, result };
    } catch (err) {
      log('complete', 'Complete failed', { error: err.message });
      await this.failSync(message.syncJobId, err.message);
      return { success: false, error: err.message };
    }
  }

  async failSync(syncJobId, error) {
    log('fail', 'Sync failed', { syncJobId, error });
    this.activeJob = null;
    try {
      await this.apiRequest('/api/x-followers/sync/fail', 'POST', { syncJobId, error });
    } catch (e) {
      log('fail', 'Failed to report sync failure to API', { error: e.message });
    }
    this.broadcastProgress({ syncJobId, status: 'error', error });
  }
}
