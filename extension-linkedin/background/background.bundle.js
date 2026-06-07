"use strict";
(() => {
  // extension-linkedin/config/constants.js
  var API = {
    DEFAULT_DOMAIN: "tweetreplyai.vercel.app",
    LOGIN_URL: "https://tweetreplyai.vercel.app/login",
    TAB_PATTERN: "https://tweetreplyai.vercel.app/*"
  };
  var TIMEOUTS = {
    USAGE_LOAD_MS: 1e4,
    AUTH_SYNC_DELAY_MS: 500,
    DOM_DEBOUNCE_MS: 150,
    BUTTON_THROTTLE_MS: 200,
    PLACEMENT_OBSERVER_MS: 200
  };
  var AUTH = {
    TOKEN_EXPIRY_MS: 7 * 24 * 60 * 60 * 1e3,
    ONE_DAY_MS: 24 * 60 * 60 * 1e3
  };
  var LI_REPLY_MODES = [
    { value: "single-sentence", label: "Concise", tooltip: "Fast one-sentence reply" },
    { value: "enhanced", label: "Enhanced", tooltip: "Context-aware with deep analysis" }
  ];
  var LI_PROMPT_OPTIONS = [
    { value: "default", label: "Default" },
    { value: "professional", label: "Professional" },
    { value: "insightful", label: "Insightful" },
    { value: "conversational", label: "Conversational" },
    { value: "supportive", label: "Supportive" },
    { value: "direct", label: "Direct" },
    { value: "x_default", label: "X Default", popupLabel: "X Default (same as Twitter)" }
  ];
  var VALID_REPLY_MODE_VALUES = new Set(LI_REPLY_MODES.map((m) => m.value));
  var VALID_PROMPT_VALUES = new Set(LI_PROMPT_OPTIONS.map((p) => p.value));

  // extension-linkedin/background/background.js
  var BackgroundManager = class {
    constructor() {
      this.debug = false;
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
        if (details.reason === "install") {
          this.log("LinkedIn Reply AI extension installed");
          this.openWelcomePage();
          chrome.storage.local.set({
            installDate: Date.now(),
            version: chrome.runtime.getManifest().version
          });
        } else if (details.reason === "update") {
          this.log("LinkedIn Reply AI extension updated");
        }
      });
    }
    setupMessageHandlers() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.action) {
          case "getAuthStatus":
            this.handleGetAuthStatus(sendResponse);
            return true;
          // Will respond asynchronously
          case "clearAuth":
            this.handleClearAuth(sendResponse);
            return true;
          case "storeToken":
            this.handleStoreToken(message.token, sendResponse);
            return true;
          case "getApiDomain":
            this.handleGetApiDomain(sendResponse);
            return true;
          case "syncAuthFromTab":
            this.handleSyncAuthFromTab(message.tabId, sendResponse);
            return true;
          case "apiRequest":
            this.handleApiRequest(message, sendResponse);
            return true;
          // Keep channel open for async response
          case "openLoginPage":
            this.handleOpenLoginPage(message.url, sendResponse);
            return true;
          default:
            this.log("Unknown message action:", message.action);
        }
      });
    }
    async handleSyncAuthFromTab(tabId, sendResponse) {
      try {
        await this.requestAuthFromWebApp(tabId);
        sendResponse({ success: true });
      } catch (error) {
        console.error("Failed to sync auth from tab:", error);
        sendResponse({ success: false });
      }
    }
    setupAuthHandlers() {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === "complete" && tab.url) {
          if (tab.url.includes(API.DEFAULT_DOMAIN)) {
            this.checkForAuthCompletion(tab.url, tabId);
          }
        }
      });
    }
    async checkForAuthCompletion(url, tabId) {
      const escaped = API.DEFAULT_DOMAIN.replace(/\./g, "\\.");
      const authSuccessPatterns = [
        new RegExp(`${escaped}\\/$`),
        // Redirected to home after login
        new RegExp(`${escaped}\\/app`),
        // Redirected to app after login
        new RegExp(`${escaped}\\/\\?.*success`),
        // Success query param
        /\/app\?/,
        // Old pattern (backward compatibility)
        /\/\?session_id=/,
        // Session ID param
        /auth.*success/i
        // Generic success
      ];
      const isAuthSuccess = authSuccessPatterns.some((pattern) => pattern.test(url));
      if (isAuthSuccess) {
        try {
          await new Promise((resolve) => setTimeout(resolve, TIMEOUTS.AUTH_SYNC_DELAY_MS));
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            function: this.extractAuthFromPage
          });
          if (results[0]?.result?.token) {
            await chrome.storage.local.set({
              authToken: results[0].result.token,
              authTime: Date.now()
            });
            chrome.runtime.sendMessage({ action: "authUpdated" }).catch(() => {
            });
            this.log("Auth token stored from successful login");
          } else {
            await this.requestAuthFromWebApp(tabId);
          }
        } catch (error) {
          console.error("Failed to extract auth token:", error);
        }
      }
    }
    async requestAuthFromWebApp(tabId) {
      try {
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        const tabUrl = tab?.url || "";
        if (!tabUrl || tabUrl.startsWith("chrome-extension://")) return;
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          function: async () => {
            try {
              if (window.location.protocol === "chrome-extension:") return null;
              const origin = window.location.origin || "";
              if (!origin || origin.startsWith("chrome-extension:")) return null;
              const response = await fetch("/api/extension/auth", {
                credentials: "include"
                // Include httpOnly cookies
              });
              if (response.ok) {
                const data = await response.json();
                return data;
              }
            } catch (error) {
              console.error("Failed to get auth from web app:", error);
            }
            return null;
          }
        });
        if (results[0]?.result?.token) {
          await chrome.storage.local.set({
            authToken: results[0].result.token,
            authTime: Date.now()
          });
          chrome.runtime.sendMessage({ action: "authUpdated" }).catch(() => {
          });
          this.log("Auth token obtained from web app API");
        }
      } catch (error) {
        console.error("Failed to request auth from web app:", error);
      }
    }
    // This function runs in the page context to extract auth info
    extractAuthFromPage() {
      const sources = [
        () => localStorage.getItem("auth_token"),
        () => localStorage.getItem("jwt_token"),
        () => localStorage.getItem("token"),
        () => sessionStorage.getItem("auth_token"),
        () => sessionStorage.getItem("jwt_token"),
        () => sessionStorage.getItem("token"),
        () => {
          const cookies = document.cookie.split(";");
          for (const cookie of cookies) {
            const [name, value] = cookie.trim().split("=");
            if (name === "auth_token" || name === "jwt_token" || name === "token") {
              return value;
            }
          }
          return null;
        },
        () => {
          const metaToken = document.querySelector('meta[name="jwt-token"]');
          return metaToken ? metaToken.getAttribute("content") : null;
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
        const result = await chrome.storage.local.get(["authToken", "authTime"]);
        const hasToken = !!(result.authToken && result.authTime);
        const tokenAge = hasToken ? Date.now() - result.authTime : 0;
        const isExpired = tokenAge > 7 * 24 * 60 * 60 * 1e3;
        sendResponse({
          authenticated: hasToken && !isExpired,
          token: result.authToken || null
        });
      } catch (error) {
        console.error("Failed to get auth status:", error);
        sendResponse({ authenticated: false, token: null });
      }
    }
    async handleClearAuth(sendResponse) {
      try {
        await chrome.storage.local.remove(["authToken", "authTime"]);
        sendResponse({ success: true });
      } catch (error) {
        console.error("Failed to clear auth:", error);
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
        console.error("Failed to store token:", error);
        sendResponse({ success: false });
      }
    }
    async handleGetApiDomain(sendResponse) {
      try {
        const result = await chrome.storage.local.get(["apiDomain"]);
        let domain = result.apiDomain;
        if (!domain) {
          domain = API.DEFAULT_DOMAIN;
          await chrome.storage.local.set({ apiDomain: domain });
        }
        sendResponse({ domain });
      } catch (error) {
        console.error("Failed to get API domain:", error);
        sendResponse({ domain: API.DEFAULT_DOMAIN });
      }
    }
    async handleApiRequest(message, sendResponse) {
      try {
        const { endpoint, method, body, headers } = message;
        const domain = await this.getApiDomain();
        const protocol = domain.includes("localhost") ? "http" : "https";
        const url = `${protocol}://${domain}${endpoint}`;
        const result = await chrome.storage.local.get(["authToken"]);
        const token = result.authToken;
        const requestHeaders = {
          "Content-Type": "application/json",
          ...headers
        };
        if (token) {
          requestHeaders["Authorization"] = `Bearer ${token}`;
        }
        const requestOptions = {
          method: method || "GET",
          headers: requestHeaders,
          credentials: "include"
        };
        if (body && method !== "GET") {
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
        const contentType = response.headers.get("content-type");
        let data;
        if (contentType && contentType.includes("application/json")) {
          data = await response.json();
        } else {
          data = await response.text();
        }
        sendResponse({
          success: true,
          status: response.status,
          data
        });
      } catch (error) {
        if (this.debug) {
          console.error("Background API request failed:", error);
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
        const { domain } = await new Promise(
          (resolve) => this.handleGetApiDomain(resolve)
        );
        const protocol = domain.includes("localhost") ? "http" : "https";
        const welcomeUrl = `${protocol}://${domain}/?utm_source=extension&utm_medium=install`;
        chrome.tabs.create({ url: welcomeUrl });
      } catch (error) {
        console.error("Failed to open welcome page:", error);
      }
    }
    handleOpenLoginPage(url, sendResponse) {
      try {
        const loginUrl = url || API.LOGIN_URL;
        chrome.tabs.create({ url: loginUrl });
        sendResponse({ success: true });
      } catch (error) {
        console.error("Failed to open login page:", error);
        sendResponse({ success: false, error: error.message });
      }
    }
  };
  new BackgroundManager();
})();
