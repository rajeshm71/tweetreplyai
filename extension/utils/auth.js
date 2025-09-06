export class AuthManager {
  constructor() {
    this.token = null;
    this.authStatusCache = null;
    this.cacheExpiry = 0;
  }

  async isAuthenticated() {
    // Use cached result if available and fresh (cache for 30 seconds)
    if (this.authStatusCache && Date.now() < this.cacheExpiry) {
      return this.authStatusCache;
    }

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getAuthStatus' }, resolve);
      });

      this.authStatusCache = response.authenticated;
      this.cacheExpiry = Date.now() + 30000; // 30 seconds cache
      this.token = response.token;

      return response.authenticated;
    } catch (error) {
      console.error('Failed to check auth status:', error);
      this.authStatusCache = false;
      return false;
    }
  }

  async getToken() {
    if (!this.token) {
      await this.isAuthenticated(); // This will set the token
    }
    return this.token;
  }

  async signOut() {
    try {
      // Clear local storage
      this.token = null;
      this.authStatusCache = false;
      this.cacheExpiry = 0;

      // Clear from extension storage
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'clearAuth' }, resolve);
      });

      return true;
    } catch (error) {
      console.error('Failed to sign out:', error);
      return false;
    }
  }

  async storeToken(token) {
    try {
      this.token = token;
      this.authStatusCache = true;
      this.cacheExpiry = Date.now() + 30000;

      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
          action: 'storeToken', 
          token 
        }, resolve);
      });

      return true;
    } catch (error) {
      console.error('Failed to store token:', error);
      return false;
    }
  }

  // Clear cache to force re-check
  clearCache() {
    this.authStatusCache = null;
    this.cacheExpiry = 0;
  }
}
