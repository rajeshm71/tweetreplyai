import { API, DEFAULTS, TIMEOUTS } from '../config/constants.js';
import { installConsoleGate } from '../utils/consoleGate.js';
import { normalizeTelemetryEvent, shouldDedupeEvent } from '../utils/telemetry.js';
import {
  initExtensionSentry,
  captureExtensionError,
  setExtensionUser,
} from '../utils/sentry.js';
import { FollowerSyncManager } from './follower-sync.js';

initExtensionSentry({ scope: 'background' });

globalThis.__tweetreplyaiExtLoggingAllowed = false;
installConsoleGate(() => globalThis.__tweetreplyaiExtLoggingAllowed === true);

class BackgroundManager {
  constructor() {
    this.debug = false; // Set to true for development debugging
    this.debugAllowed = false;
    this.setupInstallHandler();
    this.setupMessageHandlers();
    this.setupCommandHandlers();
    this.setupAuthHandlers();
    this.refreshDebugAllowed();
    this.telemetryFlushTimer = null;
    this.followerSyncManager = new FollowerSyncManager(this);
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

        case 'telemetryEvent':
          void this.handleTelemetryEvent(message.event, sendResponse);
          return true;

        case 'startFollowerSync':
          void this.followerSyncManager.startSync().then(sendResponse);
          return true;

        case 'followerSyncBatch':
          void this.followerSyncManager.uploadBatch(message).then(sendResponse);
          return true;

        case 'followerSyncComplete':
          void this.followerSyncManager.completeSync(message).then(sendResponse);
          return true;

        case 'followerSyncFail':
          void this.followerSyncManager.failSync(message.syncJobId, message.error).then(() => sendResponse({ success: true }));
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
      this.enqueueTelemetry({
        event_type: 'auth_sync_failed',
        surface: 'background',
        error_code: 'sync_auth_from_tab_failed',
      });
      sendResponse({ success: false });
    }
  }

  async handleTelemetryEvent(event, sendResponse) {
    try {
      // Fix: await queue write so sendResponse reflects persistence (best-effort).
      await this.enqueueTelemetry({ ...event, surface: event?.surface || 'background' });
      sendResponse({ success: true });
    } catch {
      sendResponse({ success: false });
    }
  }

  async enqueueTelemetry(rawEvent) {
    try {
      const event = normalizeTelemetryEvent(rawEvent);
      if (shouldDedupeEvent(event)) return;
      const result = await chrome.storage.local.get(['extensionTelemetryQueue']);
      const queue = Array.isArray(result.extensionTelemetryQueue) ? result.extensionTelemetryQueue : [];
      queue.push(event);
      while (queue.length > DEFAULTS.TELEMETRY_MAX_BUFFER) queue.shift();
      await chrome.storage.local.set({ extensionTelemetryQueue: queue });
      this.scheduleTelemetryFlush();
    } catch {
      // silent
    }
  }

  scheduleTelemetryFlush() {
    if (this.telemetryFlushTimer) clearTimeout(this.telemetryFlushTimer);
    this.telemetryFlushTimer = setTimeout(() => {
      this.telemetryFlushTimer = null;
      this.flushTelemetryQueue().catch(() => {});
    }, TIMEOUTS.TELEMETRY_FLUSH_DEBOUNCE_MS);
  }

  async flushTelemetryQueue() {
    const result = await chrome.storage.local.get(['extensionTelemetryQueue', 'authToken']);
    const queue = Array.isArray(result.extensionTelemetryQueue) ? result.extensionTelemetryQueue : [];
    if (queue.length === 0) return;

    const domain = await this.getApiDomain();
    const protocol = domain.includes('localhost') ? 'http' : 'https';
    const url = `${protocol}://${domain}/api/extension/telemetry`;
    const headers = { 'Content-Type': 'application/json' };
    if (result.authToken) headers['Authorization'] = `Bearer ${result.authToken}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ events: queue }),
      });
      if (resp.ok) {
        await chrome.storage.local.set({ extensionTelemetryQueue: [] });
      }
    } catch {
      // keep queue for retry
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

  setupCommandHandlers() {
    chrome.commands?.onCommand?.addListener(async (command) => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];
        if (!activeTab?.id || !activeTab?.url) return;
        if (!activeTab.url.includes('x.com') && !activeTab.url.includes('twitter.com')) return;
        chrome.tabs.sendMessage(activeTab.id, { action: 'shortcutCommand', command }).catch(() => {});
      } catch (error) {
        this.enqueueTelemetry({
          event_type: 'unknown_runtime_error',
          surface: 'background',
          error_code: error?.message || 'shortcut_dispatch_failed',
          context: { action: command },
        });
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
          await this.refreshDebugAllowed();
          
          // Broadcast auth update to all extension contexts
          chrome.runtime.sendMessage({ action: 'authUpdated' }).catch(() => {});
          
          this.log('Auth token stored from successful login');
        } else {
          // If we can't extract token directly, try to get it via API
          await this.requestAuthFromWebApp(tabId);
        }
      } catch (error) {
        console.error('Failed to extract auth token:', error);
        this.enqueueTelemetry({
          event_type: 'auth_sync_failed',
          surface: 'background',
          error_code: 'extract_auth_failed',
        });
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
        await this.refreshDebugAllowed();
        
        // Broadcast auth update to all extension contexts
        chrome.runtime.sendMessage({ action: 'authUpdated' }).catch(() => {});
        
        this.log('Auth token obtained from web app API');
      }
    } catch (error) {
      console.error('Failed to request auth from web app:', error);
      this.enqueueTelemetry({
        event_type: 'auth_sync_failed',
        surface: 'background',
        error_code: 'request_auth_from_webapp_failed',
      });
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
      this.debugAllowed = false;
      globalThis.__tweetreplyaiExtLoggingAllowed = false;
      setExtensionUser(null);
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
      await this.refreshDebugAllowed();
      sendResponse({ success: true });
    } catch (error) {
      console.error('Failed to store token:', error);
      sendResponse({ success: false });
    }
  }

  async refreshDebugAllowed() {
    try {
      const result = await chrome.storage.local.get(['authToken', 'apiDomain']);
      const token = result.authToken;
      if (!token) {
        this.debugAllowed = false;
        globalThis.__tweetreplyaiExtLoggingAllowed = false;
        return;
      }

      const domain = result.apiDomain || API.DEFAULT_DOMAIN;
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const response = await fetch(`${protocol}://${domain}/api/auth/user`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        this.debugAllowed = false;
        globalThis.__tweetreplyaiExtLoggingAllowed = false;
        setExtensionUser(null);
        return;
      }

      const user = await response.json();
      this.debugAllowed = !!user?.isWhitelisted;
      globalThis.__tweetreplyaiExtLoggingAllowed = this.debugAllowed;
      if (user?.id) setExtensionUser(String(user.id));
    } catch {
      this.debugAllowed = false;
      globalThis.__tweetreplyaiExtLoggingAllowed = false;
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
        this.enqueueTelemetry({
          event_type: response.status === 429
            ? 'rate_limited'
            : response.status === 402
              ? 'credits_exhausted'
              : 'api_request_failed',
          surface: 'background',
          route: endpoint,
          http_status: response.status,
          error_code: response.statusText || 'http_error',
        });
        if (response.status >= 500) {
          captureExtensionError(new Error(`HTTP ${response.status}`), {
            tags: {
              scope: 'background',
              endpoint: String(endpoint),
              http_status: String(response.status),
            },
          });
        }
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
      this.enqueueTelemetry({
        event_type: String(error?.message || '').toLowerCase().includes('timeout')
          ? 'api_timeout'
          : 'api_request_failed',
        surface: 'background',
        route: message?.endpoint || '',
        error_code: error?.message || 'api_request_exception',
      });
      const errObj =
        error instanceof Error ? error : new Error(String(error?.message ?? error));
      // User-driven fetch aborts are not actionable Sentry signal (code review).
      if (errObj.name !== 'AbortError') {
        captureExtensionError(errObj, {
          tags: {
            scope: 'background',
            endpoint: String(message?.endpoint || ''),
            kind: 'fetch_exception',
          },
        });
      }
      sendResponse({
        success: false,
        error: errObj.message,
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
