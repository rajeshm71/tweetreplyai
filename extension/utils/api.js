import { AuthManager } from './auth.js';
import { API, DEFAULTS } from '../config/constants.js';
import { captureExtensionError, setExtensionUser } from './sentry.js';

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
    // Send request through background script to avoid CORS
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: 'apiRequest',
          endpoint: endpoint,
          method: options.method || 'GET',
          body: options.body,
          headers: options.headers || {}
        },
        (response) => {
          if (chrome.runtime.lastError) {
            const msg = chrome.runtime.lastError.message;
            captureExtensionError(new Error(msg), {
              tags: {
                endpoint: String(endpoint),
                surface: 'api_client',
                kind: 'runtime_last_error',
              },
            });
            reject(new Error(msg));
            return;
          }
          
          if (!response) {
            captureExtensionError(new Error('No response from background script'), {
              tags: {
                endpoint: String(endpoint),
                surface: 'api_client',
                kind: 'empty_response',
              },
            });
            reject(new Error('No response from background script'));
            return;
          }
          
          if (!response.success) {
            const st = response.status;
            // HTTP 5xx is already reported in background/handleApiRequest — skip here to avoid duplicate Sentry events per request.
            // Transport failures (lastError / empty response) still report above; background has no chrome.runtime.lastError.
            // Handle specific error codes
            if (response.status === 401) {
              // Auto-logout on 401 (unauthorized) - token is invalid or user logged out from web app
              this.authManager.signOut().catch(err => {
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
        }
      );
    });
  }

  async getCurrentUser() {
    const user = await this.makeRequest('/api/auth/user');
    if (user?.id) setExtensionUser(String(user.id));
    return user;
  }

  async getExtensionAuth() {
    const data = await this.makeRequest('/api/extension/auth');
    if (data?.user?.id) setExtensionUser(String(data.user.id));
    return data;
  }

  async getUsage() {
    return this.makeRequest('/api/usage');
  }

  async generateReply(data) {
    return this.makeRequest('/api/generate-reply', {
      method: 'POST',
      body: data
    });
  }

  async createBillingPortal() {
    const response = await this.makeRequest('/api/billing/portal', {
      method: 'POST'
    });
    return response.portal_url;
  }

  async submitFeedback(data) {
    return this.makeRequest('/api/feedback', {
      method: 'POST',
      body: data
    });
  }

  async getPlans() {
    return this.makeRequest('/api/plans');
  }

  async createCheckout(planCode) {
    return this.makeRequest('/api/checkout', {
      method: 'POST',
      body: { plan_code: planCode }
    });
  }

  async getReplyHistory(limit = 50) {
    return this.makeRequest(`/api/reply-history?limit=${limit}`);
  }

  async markReplyAsUsed(id, tweetUrl) {
    return this.makeRequest(`/api/reply-history/${id}/mark-used`, {
      method: 'POST',
      body: { tweetUrl }
    });
  }

  async suggestImprovements(draftReply, originalTweet) {
    return this.makeRequest('/api/suggest-improvements', {
      method: 'POST',
      body: { 
        draft_reply: draftReply,
        original_tweet: originalTweet
      }
    });
  }

  /**
   * Reuse / Reframe an existing X tweet. Calls POST /api/reframe-tweet.
   * Only `source_tweet` and `degree` are required; the rest are best-effort hints.
   */
  async reframeTweet({
    source_tweet,
    degree,
    source_author,
    source_tweet_url,
    model_key,
    allow_long,
  }) {
    return this.makeRequest('/api/reframe-tweet', {
      method: 'POST',
      body: {
        source_tweet,
        degree,
        source_author,
        source_tweet_url,
        model_key,
        allow_long,
      },
    });
  }

  async getModels() {
    return this.makeRequest('/api/models');
  }

  async getPrompts() {
    return this.makeRequest('/api/prompts');
  }

  async getAnalytics(days = DEFAULTS.ANALYTICS_DAYS) {
    return this.makeRequest(`/api/analytics/feedback-stats?days=${days}`);
  }

  async getQualityMetrics(days = DEFAULTS.ANALYTICS_DAYS) {
    return this.makeRequest(`/api/quality/metrics?days=${days}`);
  }

  async getSimpleAnalytics(days = DEFAULTS.ANALYTICS_DAYS) {
    console.log(`[ApiClient] getSimpleAnalytics called with days=${days}`);
    const result = await this.makeRequest(`/api/analytics/simple?days=${days}`);
    console.log('[ApiClient] getSimpleAnalytics result:', result);
    return result;
  }
}
