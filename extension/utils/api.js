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
      
      const domain = response.domain || 'localhost:5000';
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      this.baseUrl = `${protocol}://${domain}`;
    }
    
    return this.baseUrl;
  }

  async makeRequest(endpoint, options = {}) {
    const baseUrl = await this.getBaseUrl();
    const url = `${baseUrl}${endpoint}`;
    
    const token = await this.authManager.getToken();
    
    const defaultHeaders = {
      'Content-Type': 'application/json',
    };

    if (token) {
      defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    const requestOptions = {
      method: options.method || 'GET',
      headers: { ...defaultHeaders, ...options.headers },
      credentials: 'include',
      ...options
    };

    if (options.body && requestOptions.method !== 'GET') {
      requestOptions.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, requestOptions);
      
      // Handle auth errors
      if (response.status === 401) {
        this.authManager.clearCache();
        throw new Error('401: Unauthorized');
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status}: ${errorText || response.statusText}`);
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
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
}
