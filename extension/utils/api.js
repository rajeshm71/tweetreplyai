import { AuthManager } from './auth.js';

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
      
      const domain = response.domain || 'tweetreplyai.vercel.app';
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
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (!response) {
            reject(new Error('No response from background script'));
            return;
          }
          
          if (!response.success) {
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
    return this.makeRequest('/api/auth/user');
  }

  async getExtensionAuth() {
    return this.makeRequest('/api/extension/auth');
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

  async getModels() {
    return this.makeRequest('/api/models');
  }

  async getPrompts() {
    return this.makeRequest('/api/prompts');
  }

  async getAnalytics(days = 30) {
    return this.makeRequest(`/api/analytics/feedback-stats?days=${days}`);
  }

  async getQualityMetrics(days = 30) {
    return this.makeRequest(`/api/quality/metrics?days=${days}`);
  }

  async getSimpleAnalytics(days = 30) {
    console.log(`[ApiClient] getSimpleAnalytics called with days=${days}`);
    const result = await this.makeRequest(`/api/analytics/simple?days=${days}`);
    console.log('[ApiClient] getSimpleAnalytics result:', result);
    return result;
  }
}
