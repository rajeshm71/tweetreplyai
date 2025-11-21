export class AuthManager {
  constructor() {
    this.token = null;
    this.authStatusCache = null;
    this.cacheExpiry = 0;
    this.apiClient = null; // Will be set by caller if needed for validation
  }

  setApiClient(apiClient) {
    this.apiClient = apiClient;
  }

  async isAuthenticated(validateWithServer = false) {
    // Use cached result if available and fresh (cache for 30 seconds)
    // But skip cache if we need to validate with server
    if (!validateWithServer && this.authStatusCache && Date.now() < this.cacheExpiry) {
      return this.authStatusCache;
    }

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getAuthStatus' }, resolve);
      });

      const hasToken = response.authenticated;
      this.token = response.token;

      // If no token in storage, not authenticated
      if (!hasToken) {
        this.authStatusCache = false;
        this.cacheExpiry = Date.now() + 30000;
        return false;
      }

      // If validateWithServer is true and we have apiClient, validate token with server
      if (validateWithServer && this.apiClient) {
        try {
          // Validate token by calling /api/auth/user
          await this.apiClient.getCurrentUser();
          // If successful, user is authenticated
          this.authStatusCache = true;
          this.cacheExpiry = Date.now() + 30000;
          return true;
        } catch (error) {
          // If 401, token is invalid - auto-logout
          if (error.message && error.message.includes('401')) {
            console.log('[Auth] Token validation failed (401), auto-logging out');
            await this.signOut();
            this.authStatusCache = false;
            this.cacheExpiry = Date.now() + 30000;
            return false;
          }
          // Other errors - assume not authenticated
          this.authStatusCache = false;
          this.cacheExpiry = Date.now() + 30000;
          return false;
        }
      }

      // If not validating with server, just return storage check result
      this.authStatusCache = hasToken;
      this.cacheExpiry = Date.now() + 30000;
      return hasToken;
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
