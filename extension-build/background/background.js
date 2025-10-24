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
          
        default:
          this.log('Unknown message action:', message.action);
      }
    });
  }

  setupAuthHandlers() {
    // Listen for auth completion from web app
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.checkForAuthCompletion(tab.url, tabId);
      }
    });
  }

  async checkForAuthCompletion(url, tabId) {
    // Check if this is a successful auth redirect
    const authSuccessPatterns = [
      /\/app\?/,
      /\/\?session_id=/,
      /auth.*success/i
    ];
    
    const isAuthSuccess = authSuccessPatterns.some(pattern => pattern.test(url));
    
    if (isAuthSuccess) {
      try {
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
              credentials: 'include'
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
        authenticated: hasToken && !isExpired,
        token: result.authToken || null
      });
    } catch (error) {
      console.error('Failed to get auth status:', error);
      sendResponse({ authenticated: false, token: null });
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
        domain = 'tweetreplyai.vercel.app'; // Default for production
        
        // Store the default domain for future use
        await chrome.storage.local.set({ apiDomain: domain });
      }
      
      sendResponse({ domain });
    } catch (error) {
      console.error('Failed to get API domain:', error);
      sendResponse({ domain: 'tweetreplyai.vercel.app' });
    }
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
}

// Initialize background manager
new BackgroundManager();
