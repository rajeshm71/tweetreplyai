import { API } from '../config/constants.js';

const BATCH_SIZE = 500;

export class FollowerSyncManager {
  constructor(backgroundManager) {
    this.bg = backgroundManager;
    this.activeJob = null;
  }

  async apiRequest(endpoint, method, body) {
    return new Promise((resolve, reject) => {
      this.bg.handleApiRequest(
        { endpoint, method: method || 'GET', body, headers: {} },
        (response) => {
          if (!response || !response.success) {
            reject(new Error(response?.error || 'API request failed'));
            return;
          }
          resolve(response.data);
        },
      );
    });
  }

  broadcastProgress(payload) {
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
    return result || null;
  }

  async findOrOpenXTab() {
    const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
    if (tabs.length) return tabs[0];
    return chrome.tabs.create({ url: 'https://x.com/home', active: false });
  }

  async waitForTabLoad(tabId, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') return tab;
      await new Promise((r) => setTimeout(r, 400));
    }
    return chrome.tabs.get(tabId);
  }

  async sendRunFollowerSync(tabId, payload) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          action: 'runFollowerSync',
          syncJobId: payload.syncJobId,
          xUsername: payload.xUsername,
          batchSize: BATCH_SIZE,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { success: false, error: 'No response from content script' });
        },
      );
    });
  }

  async startSync() {
    if (this.activeJob) {
      return { success: false, error: 'Sync already in progress' };
    }

    try {
      const user = await this.apiRequest('/api/auth/user', 'GET');
      if (!user?.xUsername) {
        return { success: false, error: 'Set your X username in TweetReply settings first.' };
      }

      const tab = await this.findOrOpenXTab();
      await this.waitForTabLoad(tab.id);
      const loggedInXUsername = await this.getLoggedInXUsername(tab.id);
      if (!loggedInXUsername) {
        return { success: false, error: 'Log into X in your browser, then try again.' };
      }

      const startData = await this.apiRequest('/api/x-followers/sync/start', 'POST', {
        loggedInXUsername,
      });

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

      let response = await this.sendRunFollowerSync(tab.id, startData);
      if (response.navigating) {
        await this.waitForTabLoad(tab.id, 25000);
        await new Promise((r) => setTimeout(r, 2000));
        response = await this.sendRunFollowerSync(tab.id, startData);
      }

      if (!response.success) {
        await this.failSync(startData.syncJobId, response.error);
        return { success: false, error: response.error };
      }

      return { success: true, syncJobId: startData.syncJobId };
    } catch (err) {
      if (this.activeJob?.syncJobId) {
        await this.failSync(this.activeJob.syncJobId, err.message);
      }
      this.activeJob = null;
      return { success: false, error: err.message || 'Failed to start sync' };
    }
  }

  async uploadBatch(message) {
    if (!this.activeJob || this.activeJob.syncJobId !== message.syncJobId) {
      return { success: false, error: 'No active sync job' };
    }
    try {
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
      return { success: true };
    } catch (err) {
      await this.failSync(message.syncJobId, err.message);
      return { success: false, error: err.message };
    }
  }

  async completeSync(message) {
    if (!this.activeJob || this.activeJob.syncJobId !== message.syncJobId) {
      return { success: false, error: 'No active sync job' };
    }
    try {
      const result = await this.apiRequest('/api/x-followers/sync/complete', 'POST', {
        syncJobId: message.syncJobId,
        followerCount: message.followerCount,
      });
      this.activeJob = null;
      this.broadcastProgress({
        syncJobId: message.syncJobId,
        status: 'completed',
        result,
      });
      return { success: true, result };
    } catch (err) {
      await this.failSync(message.syncJobId, err.message);
      return { success: false, error: err.message };
    }
  }

  async failSync(syncJobId, error) {
    this.activeJob = null;
    try {
      await this.apiRequest('/api/x-followers/sync/fail', 'POST', { syncJobId, error });
    } catch (_e) {}
    this.broadcastProgress({ syncJobId, status: 'error', error });
  }
}
