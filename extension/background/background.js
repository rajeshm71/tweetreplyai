import { API, TIMEOUTS } from '../config/constants.js';

class BackgroundManager {
  constructor() {
    this.debug = false; // Set to true for development debugging
    this.setupInstallHandler();
    this.setupMessageHandlers();
    this.setupAuthHandlers();
  }

  log(message, ...args) {
    if (this.debug) {
      console.log(message, ...args);
    }
  }

  setupInstallHandler() {
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        this.log('TweetReply extension installed');
        
        // Open welcome page
        this.openWelcomePage();
        
        // Set up initial storage
        chrome.storage.local.set({
          installDate: Date.now(),
          version: chrome.runtime.getManifest().version
        });
      } else if (details.reason === 'update') {
        this.log('TweetReply extension updated');
      }
    });
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'getAuthStatus':
          this.handleGetAuthStatus(sendResponse);
          return true; // Will respond asynchronously
          
        case 'clearAuth':
          this.handleClearAuth(sendResponse);
          return true;
          
        case 'storeToken':
          this.handleStoreToken(message.token, sendResponse);
          return true;
          
        case 'getApiDomain':
          this.handleGetApiDomain(sendResponse);
          return true;
          
        case 'syncAuthFromTab':
          this.handleSyncAuthFromTab(message.tabId, sendResponse);
          return true;
          
        case 'apiRequest':
          this.handleApiRequest(message, sendResponse);
          return true; // Keep channel open for async response
          
        case 'openLoginPage':
          this.handleOpenLoginPage(message.url, sendResponse);
          return true;
          
        default:
          this.log('Unknown message action:', message.action);
      }
    });
  }

  async handleSyncAuthFromTab(tabId, sendResponse) {
    try {
      await this.requestAuthFromWebApp(tabId);
      sendResponse({ success: true });
    } catch (error) {
      console.error('Failed to sync auth from tab:', error);
      sendResponse({ success: false });
    }
  }

  setupAuthHandlers() {
    // Listen for auth completion from web app - monitor ALL tweetreplyai.vercel.app tabs
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        // Only monitor our web app domain
        if (tab.url.includes(API.DEFAULT_DOMAIN)) {
          this.checkForAuthCompletion(tab.url, tabId);
        }
      }
    });
  }

  async checkForAuthCompletion(url, tabId) {
    // Build domain-based patterns from config so domain change requires no code edit
    const escaped = API.DEFAULT_DOMAIN.replace(/\./g, '\\.');
    const authSuccessPatterns = [
      new RegExp(`${escaped}\\/$`),              // Redirected to home after login
      new RegExp(`${escaped}\\/app`),            // Redirected to app after login
      new RegExp(`${escaped}\\/\\?.*success`),   // Success query param
      /\/app\?/,                                  // Old pattern (backward compatibility)
      /\/\?session_id=/,                          // Session ID param
      /auth.*success/i                            // Generic success
    ];

    const isAuthSuccess = authSuccessPatterns.some(pattern => pattern.test(url));
    
    if (isAuthSuccess) {
      try {
        // Add delay to ensure cookies are set
        await new Promise(resolve => setTimeout(resolve, TIMEOUTS.AUTH_SYNC_DELAY_MS));
        
        // Try to get auth token from the tab's context
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          function: this.extractAuthFromPage
        });
        
        if (results[0]?.result?.token) {
          // Store the token
          await chrome.storage.local.set({
            authToken: results[0].result.token,
            authTime: Date.now()
          });
          
          // Broadcast auth update to all extension contexts
          chrome.runtime.sendMessage({ action: 'authUpdated' }).catch(() => {});
          
          this.log('Auth token stored from successful login');
        } else {
          // If we can't extract token directly, try to get it via API
          await this.requestAuthFromWebApp(tabId);
        }
      } catch (error) {
        console.error('Failed to extract auth token:', error);
      }
    }
  }

  async requestAuthFromWebApp(tabId) {
    try {
      // Execute script in the web app context to call our extension auth endpoint
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        function: async () => {
          try {
            const response = await fetch('/api/extension/auth', {
              credentials: 'include' // Include httpOnly cookies
            });
            if (response.ok) {
              const data = await response.json();
              return data;
            }
          } catch (error) {
            console.error('Failed to get auth from web app:', error);
          }
          return null;
        }
      });
      
      if (results[0]?.result?.token) {
        await chrome.storage.local.set({
          authToken: results[0].result.token,
          authTime: Date.now()
        });
        
        // Broadcast auth update to all extension contexts
        chrome.runtime.sendMessage({ action: 'authUpdated' }).catch(() => {});
        
        this.log('Auth token obtained from web app API');
      }
    } catch (error) {
      console.error('Failed to request auth from web app:', error);
    }
  }

  // This function runs in the page context to extract auth info
  extractAuthFromPage() {
    // Try to get token from localStorage, sessionStorage, or cookies
    const sources = [
      () => localStorage.getItem('auth_token'),
      () => localStorage.getItem('jwt_token'),
      () => localStorage.getItem('token'),
      () => sessionStorage.getItem('auth_token'),
      () => sessionStorage.getItem('jwt_token'),
      () => sessionStorage.getItem('token'),
      () => {
        // Try to extract from cookies
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'auth_token' || name === 'jwt_token' || name === 'token') {
            return value;
          }
        }
        return null;
      },
      () => {
        // Try to extract JWT from meta tags (alternative approach)
        const metaToken = document.querySelector('meta[name="jwt-token"]');
        return metaToken ? metaToken.getAttribute('content') : null;
      }
    ];
    
    for (const getToken of sources) {
      try {
        const token = getToken();
        if (token) {
          return { token };
        }
      } catch (error) {
        continue;
      }
    }
    
    return { token: null };
  }

  async handleGetAuthStatus(sendResponse) {
    try {
      const result = await chrome.storage.local.get(['authToken', 'authTime']);
      const hasToken = !!(result.authToken && result.authTime);
      const tokenAge = hasToken ? Date.now() - result.authTime : 0;
      
      // Consider token expired after 7 days
      const isExpired = tokenAge > 7 * 24 * 60 * 60 * 1000;
      
      sendResponse({
        authenticated: hasToken && !isExpired
      });
    } catch (error) {
      console.error('Failed to get auth status:', error);
      sendResponse({ authenticated: false });
    }
  }

  async handleClearAuth(sendResponse) {
    try {
      await chrome.storage.local.remove(['authToken', 'authTime']);
      sendResponse({ success: true });
    } catch (error) {
      console.error('Failed to clear auth:', error);
      sendResponse({ success: false });
    }
  }

  async handleStoreToken(token, sendResponse) {
    try {
      await chrome.storage.local.set({
        authToken: token,
        authTime: Date.now()
      });
      sendResponse({ success: true });
    } catch (error) {
      console.error('Failed to store token:', error);
      sendResponse({ success: false });
    }
  }

  async handleGetApiDomain(sendResponse) {
    try {
      const result = await chrome.storage.local.get(['apiDomain']);
      let domain = result.apiDomain;
      
      if (!domain) {
        // Default to production API domain
        domain = API.DEFAULT_DOMAIN;
        
        // Store the default domain for future use
        await chrome.storage.local.set({ apiDomain: domain });
      }
      
      sendResponse({ domain });
    } catch (error) {
      console.error('Failed to get API domain:', error);
      sendResponse({ domain: API.DEFAULT_DOMAIN });
    }
  }

  async handleApiRequest(message, sendResponse) {
    try {
      const { endpoint, method, body, headers } = message;
      const domain = await this.getApiDomain();
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const url = `${protocol}://${domain}${endpoint}`;
      
      // Get token from storage
      const result = await chrome.storage.local.get(['authToken']);
      const token = result.authToken;
      
      const requestHeaders = {
        'Content-Type': 'application/json',
        ...headers
      };
      
      if (token) {
        requestHeaders['Authorization'] = `Bearer ${token}`;
      }
      
      const requestOptions = {
        method: method || 'GET',
        headers: requestHeaders,
        credentials: 'include'
      };
      
      if (body && method !== 'GET') {
        requestOptions.body = JSON.stringify(body);
      }
      
      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        sendResponse({
          success: false,
          status: response.status,
          error: errorText || response.statusText
        });
        return;
      }
      
      const contentType = response.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }
      
      sendResponse({
        success: true,
        status: response.status,
        data: data
      });
      
    } catch (error) {
      if (this.debug) {
        console.error('Background API request failed:', error);
      }
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }

  async getApiDomain() {
    return new Promise((resolve) => {
      this.handleGetApiDomain((response) => resolve(response.domain));
    });
  }

  async openWelcomePage() {
    try {
      const { domain } = await new Promise(resolve => 
        this.handleGetApiDomain(resolve)
      );
      
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const welcomeUrl = `${protocol}://${domain}/?utm_source=extension&utm_medium=install`;
      
      chrome.tabs.create({ url: welcomeUrl });
    } catch (error) {
      console.error('Failed to open welcome page:', error);
    }
  }

  handleOpenLoginPage(url, sendResponse) {
    try {
      const loginUrl = url || API.LOGIN_URL;
      chrome.tabs.create({ url: loginUrl });
      // Call sendResponse immediately after synchronous operation
      sendResponse({ success: true });
    } catch (error) {
      console.error('Failed to open login page:', error);
      // Always send response, even on error
      sendResponse({ success: false, error: error.message });
    }
  }
}

// Initialize background manager
new BackgroundManager();
