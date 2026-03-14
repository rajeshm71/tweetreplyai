import { AuthManager } from './auth.js';
import { API, DEFAULTS, LINKEDIN } from '../config/constants.js';

export class ApiClient {
  constructor() {
    this.authManager = new AuthManager();
    this.baseUrl = null;
  }

  async getBaseUrl() {
    if (!this.baseUrl) {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getApiDomain' }, resolve);
      });

      const domain = response.domain || API.DEFAULT_DOMAIN;
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      this.baseUrl = `${protocol}://${domain}`;
    }

    return this.baseUrl;
  }

  async makeRequest(endpoint, options = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: 'apiRequest',
          endpoint: endpoint,
          method: options.method || 'GET',
          body: options.body,
          headers: options.headers || {},
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!response) {
            reject(new Error('No response from background script'));
            return;
          }

          if (!response.success) {
            if (response.status === 401) {
              this.authManager.signOut().catch((err) => {
                console.error('Failed to sign out on 401:', err);
              });
              reject(new Error('401: Unauthorized'));
              return;
            }

            if (response.status === 402) {
              reject(new Error('402: Payment required - quota exceeded'));
              return;
            }

            reject(new Error(`${response.status}: ${response.error}`));
            return;
          }

          resolve(response.data);
        },
      );
    });
  }

  async getCurrentUser() {
    return this.makeRequest('/api/auth/user');
  }

  async getUsage() {
    return this.makeRequest('/api/usage');
  }

  async generateReply(data) {
    return this.makeRequest('/api/generate-reply', {
      method: 'POST',
      body: { ...data, platform: LINKEDIN.PLATFORM },
    });
  }

  async createBillingPortal() {
    const response = await this.makeRequest('/api/billing/portal', {
      method: 'POST',
    });
    return response.portal_url;
  }

  async getPlans() {
    return this.makeRequest('/api/plans');
  }

  async createCheckout(planCode) {
    return this.makeRequest('/api/checkout', {
      method: 'POST',
      body: { plan_code: planCode },
    });
  }

  async getReplyHistory(limit = DEFAULTS.REPLY_HISTORY_LIMIT) {
    return this.makeRequest(`/api/reply-history?limit=${limit}`);
  }
}
