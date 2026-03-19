export class AuthManager {
  constructor() {
    this.token = null;
    this.isWhitelisted = false;
    this.authStatusCache = null;
    this.cacheExpiry = 0;
    this.apiClient = null; // Will be set by caller if needed for validation
    globalThis.__tweetreplyaiExtLoggingAllowed = false;
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

      const isAuthenticated = !!response?.authenticated;
      if (isAuthenticated) {
        const tokenResult = await chrome.storage.local.get(['authToken']);
        this.token = tokenResult.authToken || null;
      } else {
        this.token = null;
      }

      // If no token in storage, not authenticated
      if (!isAuthenticated) {
        this.authStatusCache = false;
        this.cacheExpiry = Date.now() + 30000;
        this.isWhitelisted = false;
        globalThis.__tweetreplyaiExtLoggingAllowed = false;
        return false;
      }

      // If validateWithServer is true and we have apiClient, validate token with server
      if (validateWithServer && this.apiClient) {
        try {
          // Validate token by calling /api/auth/user
          const user = await this.apiClient.getCurrentUser();
          this.isWhitelisted = !!user?.isWhitelisted;
          globalThis.__tweetreplyaiExtLoggingAllowed = this.isWhitelisted;
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
            this.isWhitelisted = false;
            globalThis.__tweetreplyaiExtLoggingAllowed = false;
            return false;
          }
          // Other errors - assume not authenticated
          this.authStatusCache = false;
          this.cacheExpiry = Date.now() + 30000;
          this.isWhitelisted = false;
          globalThis.__tweetreplyaiExtLoggingAllowed = false;
          return false;
        }
      }

      // If not validating with server, just return storage check result
      this.authStatusCache = isAuthenticated;
      this.cacheExpiry = Date.now() + 30000;
      return isAuthenticated;
    } catch (error) {
      console.error('Failed to check auth status:', error);
      this.authStatusCache = false;
      this.isWhitelisted = false;
      globalThis.__tweetreplyaiExtLoggingAllowed = false;
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
      this.isWhitelisted = false;
      this.authStatusCache = false;
      this.cacheExpiry = 0;
      globalThis.__tweetreplyaiExtLoggingAllowed = false;

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
