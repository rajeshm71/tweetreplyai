"use strict";
(() => {
  // extension/utils/auth.js
  var AuthManager = class {
    constructor() {
      this.token = null;
      this.isWhitelisted = false;
      this.authStatusCache = null;
      this.cacheExpiry = 0;
      this.apiClient = null;
      globalThis.__tweetreplyaiExtLoggingAllowed = false;
    }
    setApiClient(apiClient) {
      this.apiClient = apiClient;
    }
    async isAuthenticated(validateWithServer = false) {
      if (!validateWithServer && this.authStatusCache && Date.now() < this.cacheExpiry) {
        return this.authStatusCache;
      }
      try {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "getAuthStatus" }, resolve);
        });
        const isAuthenticated = !!response?.authenticated;
        if (isAuthenticated) {
          const tokenResult = await chrome.storage.local.get(["authToken"]);
          this.token = tokenResult.authToken || null;
        } else {
          this.token = null;
        }
        if (!isAuthenticated) {
          this.authStatusCache = false;
          this.cacheExpiry = Date.now() + 3e4;
          this.isWhitelisted = false;
          globalThis.__tweetreplyaiExtLoggingAllowed = false;
          return false;
        }
        if (validateWithServer && this.apiClient) {
          try {
            const user = await this.apiClient.getCurrentUser();
            this.isWhitelisted = !!user?.isWhitelisted;
            globalThis.__tweetreplyaiExtLoggingAllowed = this.isWhitelisted;
            this.authStatusCache = true;
            this.cacheExpiry = Date.now() + 3e4;
            return true;
          } catch (error) {
            if (error.message && error.message.includes("401")) {
              console.log("[Auth] Token validation failed (401), auto-logging out");
              await this.signOut();
              this.authStatusCache = false;
              this.cacheExpiry = Date.now() + 3e4;
              this.isWhitelisted = false;
              globalThis.__tweetreplyaiExtLoggingAllowed = false;
              return false;
            }
            this.authStatusCache = false;
            this.cacheExpiry = Date.now() + 3e4;
            this.isWhitelisted = false;
            globalThis.__tweetreplyaiExtLoggingAllowed = false;
            return false;
          }
        }
        this.authStatusCache = isAuthenticated;
        this.cacheExpiry = Date.now() + 3e4;
        return isAuthenticated;
      } catch (error) {
        console.error("Failed to check auth status:", error);
        this.authStatusCache = false;
        this.isWhitelisted = false;
        globalThis.__tweetreplyaiExtLoggingAllowed = false;
        return false;
      }
    }
    async getToken() {
      if (!this.token) {
        await this.isAuthenticated();
      }
      return this.token;
    }
    async signOut() {
      try {
        this.token = null;
        this.isWhitelisted = false;
        this.authStatusCache = false;
        this.cacheExpiry = 0;
        globalThis.__tweetreplyaiExtLoggingAllowed = false;
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "clearAuth" }, resolve);
        });
        return true;
      } catch (error) {
        console.error("Failed to sign out:", error);
        return false;
      }
    }
    async storeToken(token) {
      try {
        this.token = token;
        this.authStatusCache = true;
        this.cacheExpiry = Date.now() + 3e4;
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            action: "storeToken",
            token
          }, resolve);
        });
        return true;
      } catch (error) {
        console.error("Failed to store token:", error);
        return false;
      }
    }
    // Clear cache to force re-check
    clearCache() {
      this.authStatusCache = null;
      this.cacheExpiry = 0;
    }
  };

  // extension/config/constants.js
  var API = {
    DEFAULT_DOMAIN: "tweetreplyai.vercel.app",
    LOGIN_URL: "https://tweetreplyai.vercel.app/login",
    TAB_PATTERN: "https://tweetreplyai.vercel.app/*"
  };
  var POLLING = {
    USAGE_REFRESH_MS: 3e4,
    ANALYTICS_REFRESH_MS: 3e4,
    URL_TRACKING_MS: 300,
    TRACKING_CLEANUP_MS: 6e4
  };
  var TIMEOUTS = {
    USAGE_LOAD_MS: 1e4,
    AUTH_SYNC_DELAY_MS: 500,
    DOM_DEBOUNCE_MS: 100,
    BUTTON_THROTTLE_MS: 200,
    PLACEMENT_OBSERVER_MS: 150
  };
  var DEFAULTS = {
    ANALYTICS_DAYS: 30,
    TRACKING_DAYS: 7,
    TRACKING_DAYS_MIN: 1,
    TRACKING_DAYS_MAX: 30,
    REPLY_HISTORY_LIMIT: 50
  };
  var VALIDATION = {
    MIN_TWEET_LENGTH: 20,
    MAX_TWEET_LENGTH: 500,
    MAX_THREAD_CHAIN: 4,
    MAX_THREAD_CHARS: 2e3
  };
  var AUTH = {
    TOKEN_EXPIRY_MS: 7 * 24 * 60 * 60 * 1e3,
    ONE_DAY_MS: 24 * 60 * 60 * 1e3
  };

  // extension/utils/api.js
  var ApiClient = class {
    constructor() {
      this.authManager = new AuthManager();
      this.baseUrl = null;
    }
    async getBaseUrl() {
      if (!this.baseUrl) {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "getApiDomain" }, resolve);
        });
        const domain = response.domain || API.DEFAULT_DOMAIN;
        const protocol = domain.includes("localhost") ? "http" : "https";
        this.baseUrl = `${protocol}://${domain}`;
      }
      return this.baseUrl;
    }
    async makeRequest(endpoint, options = {}) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: "apiRequest",
            endpoint,
            method: options.method || "GET",
            body: options.body,
            headers: options.headers || {}
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!response) {
              reject(new Error("No response from background script"));
              return;
            }
            if (!response.success) {
              if (response.status === 401) {
                this.authManager.signOut().catch((err) => {
                  console.error("Failed to sign out on 401:", err);
                });
                reject(new Error("401: Unauthorized"));
                return;
              }
              if (response.status === 402) {
                reject(new Error("402: Payment required - quota exceeded"));
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
      return this.makeRequest("/api/auth/user");
    }
    async getExtensionAuth() {
      return this.makeRequest("/api/extension/auth");
    }
    async getUsage() {
      return this.makeRequest("/api/usage");
    }
    async generateReply(data) {
      return this.makeRequest("/api/generate-reply", {
        method: "POST",
        body: data
      });
    }
    async createBillingPortal() {
      const response = await this.makeRequest("/api/billing/portal", {
        method: "POST"
      });
      return response.portal_url;
    }
    async submitFeedback(data) {
      return this.makeRequest("/api/feedback", {
        method: "POST",
        body: data
      });
    }
    async getPlans() {
      return this.makeRequest("/api/plans");
    }
    async createCheckout(planCode) {
      return this.makeRequest("/api/checkout", {
        method: "POST",
        body: { plan_code: planCode }
      });
    }
    async getReplyHistory(limit = 50) {
      return this.makeRequest(`/api/reply-history?limit=${limit}`);
    }
    async markReplyAsUsed(id, tweetUrl) {
      return this.makeRequest(`/api/reply-history/${id}/mark-used`, {
        method: "POST",
        body: { tweetUrl }
      });
    }
    async suggestImprovements(draftReply, originalTweet) {
      return this.makeRequest("/api/suggest-improvements", {
        method: "POST",
        body: {
          draft_reply: draftReply,
          original_tweet: originalTweet
        }
      });
    }
    async getModels() {
      return this.makeRequest("/api/models");
    }
    async getPrompts() {
      return this.makeRequest("/api/prompts");
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
      console.log("[ApiClient] getSimpleAnalytics result:", result);
      return result;
    }
  };

  // extension/utils/consoleGate.js
  var GLOBAL_FLAG_KEY = "__tweetreplyaiExtLoggingAllowed";
  var GLOBAL_STATE_KEY = "__tweetreplyaiConsoleGateState";
  function installConsoleGate(getAllowed) {
    const state = globalThis[GLOBAL_STATE_KEY];
    if (state?.installed) {
      state.getAllowed = getAllowed;
      return;
    }
    const originals = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      info: console.info.bind(console),
      debug: console.debug.bind(console)
    };
    const sharedState = {
      installed: true,
      getAllowed,
      originals
    };
    globalThis[GLOBAL_STATE_KEY] = sharedState;
    const allowed = () => {
      try {
        return sharedState.getAllowed?.() === true;
      } catch {
        return false;
      }
    };
    console.log = (...args) => {
      if (allowed()) originals.log(...args);
    };
    console.warn = (...args) => {
      if (allowed()) originals.warn(...args);
    };
    console.error = (...args) => {
      if (allowed()) originals.error(...args);
    };
    console.info = (...args) => {
      if (allowed()) originals.info(...args);
    };
    console.debug = (...args) => {
      if (allowed()) originals.debug(...args);
    };
  }
  if (typeof globalThis[GLOBAL_FLAG_KEY] !== "boolean") {
    globalThis[GLOBAL_FLAG_KEY] = false;
  }

  // extension/content/content.js
  globalThis.__tweetreplyaiExtLoggingAllowed = false;
  installConsoleGate(() => globalThis.__tweetreplyaiExtLoggingAllowed === true);
  var DIAGNOSE_THREAD_SELECTION = true;
  var TwitterReplyInjector = class {
    constructor() {
      if (window.__tweetReplyInjector) {
        const existing = window.__tweetReplyInjector;
        if (document.readyState === "complete" && !existing.initialized) {
          existing.initialize();
          existing.initialized = true;
        }
        return existing;
      }
      this.authManager = new AuthManager();
      this.apiClient = new ApiClient();
      this.isAuthenticated = false;
      this.usageData = null;
      this.injectedButtons = /* @__PURE__ */ new Set();
      this.injectedContainers = /* @__PURE__ */ new Set();
      this.followStatusByUser = /* @__PURE__ */ new Map();
      this.followBadgeRefreshTimer = null;
      this.followStatusMessageHandler = null;
      this.currentReplyTargetArticle = null;
      this._replyTargetClearTimer = null;
      this.pendingReplyTarget = null;
      this._originalTweetCache = null;
      this.lastNonComposePath = window.location.pathname;
      this.urlTrackingInterval = setInterval(() => {
        const path = window.location.pathname;
        if (!/\/compose\//.test(path)) {
          this.lastNonComposePath = path;
        }
        this.tryEagerCacheOriginalTweet();
      }, POLLING.URL_TRACKING_MS);
      window.__tweetReplyInjector = this;
      this.beforeUnloadHandler = () => this.destroy();
      window.addEventListener("beforeunload", this.beforeUnloadHandler);
      this.initialized = false;
      this.initialize();
      this.initialized = true;
    }
    // Helper to get React Fiber node from DOM element
    getReactInstance(element) {
      for (const key in element) {
        if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
          return element[key];
        }
      }
      return element._reactInternalFiber || element._reactInternalInstance || null;
    }
    // Helper to find React component from fiber
    getReactComponent(fiber) {
      if (!fiber) return null;
      let node = fiber;
      while (node) {
        if (node.stateNode && node.stateNode.forceUpdate) {
          return node.stateNode;
        }
        node = node.return;
      }
      return null;
    }
    // Sleep helper method
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    // Strip reply prefixes from generated text (based on inject.js)
    stripReplyPrefix(text) {
      const prefixes = [
        "Question",
        "Supportive",
        "Disagree",
        "Enhance",
        "Smart",
        "Controversial",
        "Marketing",
        "Product-marketing"
      ];
      let cleaned = text.trim();
      for (const prefix of prefixes) {
        const regex = new RegExp(`^\\b${prefix}\\b\\s*[^\\w\\s]*\\s*`, "i");
        if (regex.test(cleaned)) {
          cleaned = cleaned.replace(regex, "").trim();
          break;
        }
      }
      const punctuationRegex = /^([A-Z][a-z]+)([\-:.,!]+)\s+/;
      if (punctuationRegex.test(cleaned) && !cleaned.match(/^[A-Za-z]+,\s/)) {
        cleaned = cleaned.replace(punctuationRegex, "").trim();
      }
      return cleaned;
    }
    // Find closest text area to a button element (based on inject.js)
    findClosestTextArea(buttonElement) {
      console.log("[TweetReply] \u{1F50D} Finding closest text area to button...");
      const textAreaSelectors = [
        'div[data-testid="tweetTextarea_0"]',
        'div[data-testid="tweetTextarea_1"]',
        'div[data-testid="tweetTextarea_2"]',
        'div.public-DraftEditor-content[contenteditable="true"]',
        "div.DraftEditor-root textarea",
        'div[data-testid="reply-to-tweet"] div[contenteditable="true"]'
      ];
      let closestElement = null;
      let closestDistance = Infinity;
      for (const selector of textAreaSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          const buttonRect = buttonElement.getBoundingClientRect();
          for (const element of Array.from(elements)) {
            const elementRect = element.getBoundingClientRect();
            const distance = Math.abs(elementRect.top - buttonRect.top);
            if (distance < closestDistance) {
              closestDistance = distance;
              closestElement = element;
            }
          }
        }
      }
      if (closestElement) {
        console.log("[TweetReply] \u2705 Found closest text area:", closestElement.tagName, closestElement.className);
      } else {
        console.warn("[TweetReply] \u274C No text area found");
      }
      return closestElement;
    }
    // Find Twitter text area within an element
    findTwitterTextArea(element) {
      const textArea = element.querySelector('div[data-testid^="tweetTextarea_"][role="textbox"]');
      return textArea || (element.parentElement ? this.findTwitterTextArea(element.parentElement) : null);
    }
    // Insert text using proven Twitter approach
    async insertTextTwitterMethod(textArea, composer, text) {
      composer.click();
      const dataTextSpan = textArea.querySelector('[data-text="true"]');
      const targetElement = dataTextSpan ? dataTextSpan.parentElement : textArea;
      if (targetElement) {
        const span = document.createElement("span");
        span.dataset.text = "true";
        span.textContent = text;
        if (typeof targetElement.replaceChildren === "function") {
          targetElement.replaceChildren(span);
        } else {
          while (targetElement.firstChild) {
            targetElement.removeChild(targetElement.firstChild);
          }
          targetElement.appendChild(span);
        }
        targetElement.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          cancelable: true
        }));
      }
    }
    // Auto-like functionality
    async isAutoLikeEnabled() {
      try {
        const result = await chrome.storage.local.get(["tweetreply_auto_like"]);
        return result.tweetreply_auto_like !== false;
      } catch (error) {
        console.warn("[TweetReply] Failed to check auto-like setting:", error);
        return true;
      }
    }
    findTweetArticle(element) {
      if (!element) return null;
      let current = element;
      let depth = 0;
      while (current && depth < 10) {
        if (current.tagName === "ARTICLE" && (current.getAttribute("data-testid") === "tweet" || current.querySelector('[data-testid="tweet"]'))) {
          return current.getAttribute("data-testid") === "tweet" ? current : current.querySelector('[data-testid="tweet"]')?.closest("article") || current;
        }
        current = current.parentElement;
        depth++;
      }
      const article = element.closest("article");
      return article || null;
    }
    getTweetIdFromArticle(tweetArticle) {
      if (!tweetArticle) return null;
      const id = tweetArticle.getAttribute("data-tweet-id");
      if (id) return id;
      const ariaLabel = tweetArticle.getAttribute("aria-labelledby");
      if (ariaLabel) {
        const match = ariaLabel.match(/(\d{15,})/);
        if (match) return match[1];
      }
      const link = tweetArticle.querySelector('a[href*="/status/"]');
      if (link && link.href) {
        const linkMatch = link.href.match(/status\/(\d+)/);
        if (linkMatch) return linkMatch[1];
      }
      return null;
    }
    findLikeButton(tweetArticle) {
      if (!tweetArticle) return null;
      const isAlreadyLikedOrUnlike = (btn) => {
        if (!btn) return true;
        if (btn.getAttribute("data-testid") === "unlike") return true;
        const label = (btn.getAttribute("aria-label") || "").toLowerCase();
        if (label.includes("unlike")) return true;
        if (btn.getAttribute("aria-pressed") === "true") return true;
        return false;
      };
      let likeBtn = tweetArticle.querySelector('[data-testid="like"]');
      if (likeBtn) {
        const isLiked = !!tweetArticle.querySelector('[data-testid="unlike"]') || likeBtn.getAttribute("aria-pressed") === "true";
        if (isLiked) return null;
        if (isAlreadyLikedOrUnlike(likeBtn)) return null;
        return likeBtn;
      }
      const buttons = tweetArticle.querySelectorAll('button[aria-label*="Like" i], [role="button"][aria-label*="Like" i]');
      for (const btn of buttons) {
        const ariaLabel = btn.getAttribute("aria-label") || "";
        if (/like/i.test(ariaLabel) && !/unlike/i.test(ariaLabel)) {
          const isLiked = btn.getAttribute("aria-pressed") === "true" || btn.querySelector('[data-testid="unlike"]');
          if (!isLiked && !isAlreadyLikedOrUnlike(btn)) return btn;
        }
      }
      const heartButtons = tweetArticle.querySelectorAll('button, [role="button"]');
      for (const btn of heartButtons) {
        const hasHeartIcon = btn.querySelector('svg path[d*="M12"]') || btn.querySelector('[class*="heart"]') || btn.innerHTML.includes("M20.884 13.19");
        if (hasHeartIcon) {
          const isLiked = btn.getAttribute("aria-pressed") === "true" || btn.querySelector('[data-testid="unlike"]') || btn.classList.contains("liked");
          if (!isLiked && !isAlreadyLikedOrUnlike(btn)) return btn;
        }
      }
      return null;
    }
    async performAutoLike(likeButton) {
      if (!likeButton) return false;
      try {
        likeButton.click();
        await new Promise((resolve) => setTimeout(resolve, TIMEOUTS.DOM_DEBOUNCE_MS));
        return true;
      } catch (error) {
        console.warn("[TweetReply] Failed to auto-like:", error);
        try {
          const event = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window
          });
          likeButton.dispatchEvent(event);
          await new Promise((resolve) => setTimeout(resolve, TIMEOUTS.DOM_DEBOUNCE_MS));
          return true;
        } catch (e) {
          console.warn("[TweetReply] MouseEvent simulation failed:", e);
          return false;
        }
      }
    }
    setupAutoLikeOnReply() {
      if (this.autoLikeClickHandler) return;
      if (!this.autoLikedTweetIds) this.autoLikedTweetIds = /* @__PURE__ */ new Set();
      this.autoLikeClickHandler = async (e) => {
        try {
          const target = e.target;
          if (!target) return;
          const composerContainer = target.closest('[data-testid="tweetComposer"]');
          const submitButton = target.closest('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]');
          if (composerContainer && submitButton && composerContainer.contains(submitButton) && this.isReplyComposer(composerContainer)) {
            const pending = this.pendingReplyTarget;
            const maxAgeMs = 10 * 60 * 1e3;
            if (pending && pending.username && pending.username !== "unknown" && Date.now() - pending.setAt < maxAgeMs) {
              this.trackReply(pending.username).catch((err) => {
                console.warn("[TweetReply] Reply tracking failed:", err);
              });
              setTimeout(() => this.updateReplyCountsOnTweets(), 600);
            }
            this.pendingReplyTarget = null;
            return;
          }
          const dialog = target.closest('[role="dialog"]');
          const sendBtnInDialog = target.closest('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]');
          if (dialog && sendBtnInDialog && dialog.contains(sendBtnInDialog)) {
            let usernameToTrack = null;
            const pending = this.pendingReplyTarget;
            const maxAgeMs = 10 * 60 * 1e3;
            if (pending && pending.username && pending.username !== "unknown" && Date.now() - pending.setAt < maxAgeMs) {
              usernameToTrack = pending.username;
            }
            if (!usernameToTrack) {
              const replyTargetArticle = dialog.querySelector('article[data-testid="tweet"]');
              if (replyTargetArticle) {
                usernameToTrack = this.extractUsernameFromTweetSync(replyTargetArticle);
              }
            }
            if (usernameToTrack && usernameToTrack !== "unknown") {
              this.trackReply(usernameToTrack).catch((err) => {
                console.warn("[TweetReply] Reply tracking failed:", err);
              });
              setTimeout(() => this.updateReplyCountsOnTweets(), 600);
            }
            this.pendingReplyTarget = null;
            return;
          }
          const isReplyButton = target.matches('[data-testid="reply"]') || target.closest('[data-testid="reply"]') || target.matches('button[aria-label*="Reply" i]') || target.closest('button[aria-label*="Reply" i]') || target.matches('[role="button"][aria-label*="Reply" i]') || target.closest('[role="button"][aria-label*="Reply" i]') || target.matches('[data-testid="tweetButtonInline"]') || target.closest('[data-testid="tweetButtonInline"]');
          if (!isReplyButton) return;
          const replyButton = target.closest('[data-testid="reply"]') || target.closest('button[aria-label*="Reply" i]') || target.closest('[role="button"][aria-label*="Reply" i]') || target.closest('[data-testid="tweetButtonInline"]') || target;
          const tweetArticle = this.findTweetArticle(replyButton);
          if (!tweetArticle) {
            return;
          }
          this.currentReplyTargetArticle = tweetArticle;
          if (this._replyTargetClearTimer) clearTimeout(this._replyTargetClearTimer);
          this._replyTargetClearTimer = setTimeout(() => {
            this.currentReplyTargetArticle = null;
            this._replyTargetClearTimer = null;
          }, 2500);
          const tweetId = this.getTweetIdFromArticle(tweetArticle);
          const username = this.extractUsernameFromTweetSync(tweetArticle);
          if (username && username !== "unknown") {
            this.pendingReplyTarget = { username, tweetId: tweetId || null, setAt: Date.now() };
          }
          this.isAutoLikeEnabled().then((autoLikeEnabled) => {
            if (autoLikeEnabled) {
              setTimeout(() => {
                const tweetId2 = this.getTweetIdFromArticle(tweetArticle);
                if (tweetId2 !== null && this.autoLikedTweetIds.has(tweetId2)) {
                  return;
                }
                const likeButton = this.findLikeButton(tweetArticle);
                if (likeButton) {
                  this.performAutoLike(likeButton).then(() => {
                    if (tweetId2 !== null) this.autoLikedTweetIds.add(tweetId2);
                  }).catch((err) => {
                    console.warn("[TweetReply] Auto-like execution failed:", err);
                  });
                }
              }, 50);
            }
          }).catch((err) => {
            console.warn("[TweetReply] Failed to check auto-like setting:", err);
          });
        } catch (error) {
          console.error("[TweetReply] Auto-like handler error:", error);
        }
      };
      document.addEventListener("click", this.autoLikeClickHandler, true);
    }
    async initialize() {
      this.authManager.setApiClient(this.apiClient);
      this.isAuthenticated = await this.authManager.isAuthenticated(true);
      if (this.isAuthenticated) {
        await this.loadUsageData();
      }
      this.startObserving();
      this.setupFollowStatusFromNetwork();
      this.setupAutoLikeOnReply();
      this.setupReplyCountDisplay();
      if (!this.runtimeMessageHandler) {
        this.runtimeMessageHandler = (message, sender, sendResponse) => {
          if (message.action === "suggestReply") {
            this.handleSuggestReplyFromPopup();
          } else if (message.action === "authUpdated") {
            this.refreshAuthState();
          }
        };
        chrome.runtime.onMessage.addListener(this.runtimeMessageHandler);
      }
      if (!this.storageChangeHandler) {
        this.storageChangeHandler = (changes, areaName) => {
          if (areaName === "local") {
            if (changes.token) {
              this.refreshAuthState();
            }
            if (changes.replyHistory || changes.replyTrackingSettings) {
              this.updateReplyCountsOnTweets();
            }
          }
        };
        chrome.storage.onChanged.addListener(this.storageChangeHandler);
      }
      if (this.usageDataInterval) {
        clearInterval(this.usageDataInterval);
      }
      this.usageDataInterval = setInterval(() => {
        if (this.isAuthenticated) {
          this.loadUsageData();
        }
      }, POLLING.USAGE_REFRESH_MS);
    }
    async refreshAuthState() {
      const wasAuthenticated = this.isAuthenticated;
      this.isAuthenticated = await this.authManager.isAuthenticated(true);
      if (this.isAuthenticated && !wasAuthenticated) {
        await this.loadUsageData();
      }
      this.updateAllButtonStates();
    }
    async loadUsageData() {
      try {
        this.usageData = await this.apiClient.getUsage();
      } catch (error) {
        console.error("[TweetReply] Failed to load usage data:", error);
        this.usageData = null;
        throw error;
      }
    }
    // ============================================================================
    // FOLLOW STATUS — main-world interceptor → postMessage → cache → badge
    // ============================================================================
    setupFollowStatusFromNetwork() {
      if (this.followStatusMessageHandler) return;
      this.followStatusMessageHandler = (event) => {
        if (event.source !== window) return;
        const d = event.data;
        if (!d || d.type !== "TWEETREPLY_FOLLOW_STATUS") return;
        if (!d.hasRelationshipData) return;
        this.followStatusByUser.set(String(d.username).toLowerCase(), {
          followedBy: !!d.followedBy,
          following: !!d.following,
          hasRelationshipData: true
        });
        this.scheduleFollowBadgeRefresh();
      };
      window.addEventListener("message", this.followStatusMessageHandler);
      window.postMessage({ type: "TWEETREPLY_REQUEST_BUFFER_REPLAY" }, "*");
    }
    scheduleFollowBadgeRefresh() {
      if (this.followBadgeRefreshTimer) clearTimeout(this.followBadgeRefreshTimer);
      this.followBadgeRefreshTimer = setTimeout(() => {
        this.followBadgeRefreshTimer = null;
        this.updateFollowBadgesOnPage();
      }, 150);
    }
    updateFollowBadgesOnPage() {
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      articles.forEach((article) => {
        const username = this.extractUsernameFromTweetSync(article);
        const existing = article.querySelector(".tweetreply-follow-badge");
        if (existing) existing.remove();
        if (!username || username === "unknown") return;
        const key = username.toLowerCase();
        const entry = this.followStatusByUser.get(key);
        if (!entry || !entry.hasRelationshipData) return;
        const userNameElement = article.querySelector('[data-testid="User-Name"]');
        if (!userNameElement || !userNameElement.isConnected) return;
        const span = document.createElement("span");
        span.className = entry.followedBy ? "tweetreply-follow-badge tweetreply-follow-badge--follows" : "tweetreply-follow-badge tweetreply-follow-badge--not";
        span.setAttribute("data-tweetreply-follow-badge", "1");
        span.textContent = entry.followedBy ? "Follows you" : "Not Follows you";
        const timeEl = userNameElement.querySelector("time");
        if (timeEl && timeEl.parentNode) {
          timeEl.after(span);
        } else {
          userNameElement.appendChild(document.createTextNode(" "));
          userNameElement.appendChild(span);
        }
      });
    }
    startObserving() {
      if (this.mainObserver) return;
      this.mainObserverDebounceTimer = null;
      const addedNodes = /* @__PURE__ */ new Set();
      this.mainObserver = new MutationObserver((mutations) => {
        clearTimeout(this.mainObserverDebounceTimer);
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              addedNodes.add(node);
            }
          });
        });
        this.mainObserverDebounceTimer = setTimeout(() => {
          addedNodes.forEach((node) => {
            this.checkForReplyComposers(node);
          });
          addedNodes.clear();
          this.scheduleFollowBadgeRefresh();
          if (this.countDisplayInitialized) {
            if (this.countUpdateTimeout) {
              clearTimeout(this.countUpdateTimeout);
            }
            this.countUpdateTimeout = setTimeout(async () => {
              try {
                await this.updateReplyCountsOnTweets();
              } catch (error) {
                console.error("[TweetReply] Error updating reply counts:", error);
              }
            }, TIMEOUTS.AUTH_SYNC_DELAY_MS);
          }
        }, TIMEOUTS.DOM_DEBOUNCE_MS);
      });
      this.mainObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
      this.checkForReplyComposers(document.body);
    }
    checkForReplyComposers(container) {
      const specificSelectors = [
        '[data-testid="tweetTextarea_0"]',
        '[data-testid="tweetTextarea_1"]',
        '[data-testid="tweetTextarea_2"]'
      ];
      const genericSelectors = [
        '[aria-label*="reply" i][contenteditable="true"]',
        '[aria-label*="post" i][contenteditable="true"]',
        '[aria-label*="tweet" i][contenteditable="true"]',
        ".public-DraftEditor-content",
        ".DraftEditor-editorContainer",
        '[data-testid="toolBar"] ~ div [contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-testid]'
      ];
      let found = false;
      for (const selector of specificSelectors) {
        try {
          const composers = container.querySelectorAll ? container.querySelectorAll(selector) : [];
          if (composers.length > 0) {
            composers.forEach((composer) => this.injectSuggestButton(composer));
            found = true;
          }
        } catch (error) {
          console.error("Error checking selector:", selector, error);
        }
      }
      if (!found) {
        for (const selector of genericSelectors) {
          try {
            const composers = container.querySelectorAll ? container.querySelectorAll(selector) : [];
            composers.forEach((composer) => this.injectSuggestButton(composer));
          } catch (error) {
            console.error("Error checking selector:", selector, error);
          }
        }
      }
    }
    injectSuggestButton(composer) {
      if (!composer || this.injectedButtons.has(composer)) return;
      let composerContainer = composer.closest('[data-testid="tweetComposer"]') || composer.closest('[role="dialog"]') || composer.closest("div[data-testid]");
      if (!composerContainer) return;
      const topTweetComposer = composerContainer.closest('[data-testid="tweetComposer"]');
      if (topTweetComposer) composerContainer = topTweetComposer;
      const inDialog = composerContainer.closest('[role="dialog"]');
      if (inDialog) {
        if (inDialog.querySelector(".tweetreply-button-container")) {
          this.injectedButtons.add(composer);
          return;
        }
      } else {
        let ancestor = composerContainer.parentElement;
        while (ancestor) {
          if (ancestor.querySelector && ancestor.querySelector(".tweetreply-button-container")) {
            this.injectedButtons.add(composer);
            return;
          }
          ancestor = ancestor.parentElement;
        }
      }
      let containerId = composerContainer.dataset.tweetreplyContainerId;
      if (!containerId) {
        containerId = `tweetreply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        composerContainer.dataset.tweetreplyContainerId = containerId;
      }
      if (composerContainer.querySelector(".tweetreply-button-container") || this.injectedContainers.has(containerId)) {
        this.injectedButtons.add(composer);
        return;
      }
      this.injectedContainers.add(containerId);
      const ctx = this.getComposerContext(composerContainer);
      if (ctx.type === "post") {
        return;
      }
      if (this.isTweetDetailPage() && !composerContainer.closest('[role="dialog"]')) {
        const replyBtn = this.findReplyButton(composerContainer);
        if (replyBtn) {
          const replyRow = replyBtn.parentElement;
          if (replyRow) {
            const controlsRow = this.createSuggestButton(composer, containerId);
            controlsRow.hidden = ctx.type === "post";
            replyRow.parentNode.insertBefore(controlsRow, replyRow);
            const display = replyRow.style.display || getComputedStyle(replyRow).display;
            if (display !== "flex" && display !== "inline-flex" && display !== "grid" && display !== "inline-grid") {
              replyRow.style.display = "flex";
              replyRow.style.alignItems = "center";
            }
            this.injectedButtons.add(composer);
            return;
          }
        }
      }
      let toolbar = composerContainer.querySelector('[data-testid="toolBar"]') || composerContainer.querySelector(".toolbar") || composerContainer.querySelector('[role="toolbar"]');
      if (!toolbar) {
        const buttonContainers = composerContainer.querySelectorAll("div");
        for (const container of buttonContainers) {
          if (container.querySelectorAll("button").length >= 2) {
            toolbar = container;
            break;
          }
        }
      }
      if (!toolbar) {
        toolbar = this.createToolbar(composer);
      }
      if (toolbar && !toolbar.querySelector(".tweetreply-button-container")) {
        const controlsRow = this.createSuggestButton(composer, containerId);
        controlsRow.hidden = ctx.type === "post";
        if (toolbar.parentNode) {
          toolbar.parentNode.insertBefore(controlsRow, toolbar);
        } else {
          this.insertButtonInToolbar(toolbar, controlsRow);
        }
        this.injectedButtons.add(composer);
      }
    }
    createToolbar(composer) {
      const toolbar = document.createElement("div");
      toolbar.className = "tweetreply-toolbar";
      toolbar.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding: 8px 0;
    `;
      const parent = composer.parentElement;
      if (parent) {
        parent.insertBefore(toolbar, composer.nextSibling);
      }
      return toolbar;
    }
    // Determine whether an element belongs to a reply composer (not main tweet box)
    isReplyComposer(containerEl) {
      if (!containerEl) return false;
      const hasReplyPlaceholder = !!Array.from(containerEl.querySelectorAll('[data-testid^="tweetTextarea_"], [contenteditable="true"]')).find((el) => /post your reply/i.test(el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.textContent || ""));
      const toolbar = containerEl.querySelector('[data-testid="toolBar"], [role="toolbar"]') || containerEl;
      const replyBtn = this.findReplyButton(toolbar);
      return !!(hasReplyPlaceholder || replyBtn);
    }
    // Determine if this is the main tweet composer ("What's happening?")
    isMainComposer(containerEl) {
      const textareas = containerEl.querySelectorAll('[data-testid^="tweetTextarea_"], [contenteditable="true"]');
      for (const el of textareas) {
        const hint = (el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").toLowerCase();
        if (hint.includes("what's happening") || hint.includes("what\u2019s happening")) return true;
        if (/^post\s*text$/i.test(hint) && !containerEl.closest('[role="dialog"], article')) return true;
      }
      const hasPost = !!(containerEl.querySelector('[data-testid="tweetButton"]') || Array.from(containerEl.querySelectorAll('div[role="button"], button')).some((btn) => /^(post|tweet)$/i.test((btn.getAttribute("aria-label") || btn.textContent || "").trim())));
      const hasReply = !!this.findReplyButton(containerEl);
      if (!hasReply && hasPost) return true;
      const globalInlineBtn = document.querySelector('[data-testid="tweetButtonInline"]');
      const globalInlineText = globalInlineBtn?.textContent?.trim() || "";
      if (/^post$/i.test(globalInlineText) && !containerEl.closest('[role="dialog"], article')) return true;
      return hasPost && !hasReply;
    }
    // Classify composer container context
    getComposerContext(containerEl) {
      if (!containerEl) return { type: "unknown" };
      if (this.isMainComposer(containerEl)) return { type: "post" };
      if (this.isReplyComposer(containerEl)) {
        const article = containerEl.closest("article");
        const hasDetailsHeader = !!document.querySelector("article time");
        return { type: article ? "inline" : "detail" };
      }
      return { type: "unknown" };
    }
    isTweetDetailPage() {
      const currentPath = window.location.pathname;
      const effectivePath = /\/compose\//.test(currentPath) ? this.lastNonComposePath : currentPath;
      return /\/status\/\d+/.test(effectivePath);
    }
    /**
     * Get the status ID from the tweet details page URL (source of truth for which tweet this page is about).
     * Uses same path logic as isTweetDetailPage (lastNonComposePath when on /compose/).
     * @returns {string|null} Status ID or null if not a detail page
     */
    getStatusIdFromDetailPageUrl() {
      const currentPath = window.location.pathname;
      const effectivePath = /\/compose\//.test(currentPath) ? this.lastNonComposePath : currentPath;
      const match = effectivePath.match(/\/status\/(\d+)/);
      return match ? match[1] : null;
    }
    /**
     * Extract original tweet info from page meta / URL — never virtualized, survives any scrolling.
     * Author handle comes from the URL path; text from og:description or document.title.
     * @returns {{ statusId: string, text: string|null, author: string }|null}
     */
    getOriginalTweetFromPageMeta() {
      const path = /\/compose\//.test(window.location.pathname) ? this.lastNonComposePath : window.location.pathname;
      const pathMatch = path.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)/);
      if (!pathMatch) return null;
      const author = pathMatch[1];
      const statusId = pathMatch[2];
      const ogUrl = document.querySelector('meta[property="og:url"]')?.content || "";
      if (!ogUrl || !ogUrl.includes("/status/" + statusId)) return null;
      let text = null;
      const ogDesc = document.querySelector('meta[property="og:description"]')?.content?.trim();
      if (ogDesc && ogDesc.length > 10) text = ogDesc;
      if (!text) {
        const titleMatch = document.title.match(/:\s+"(.+?)"\s*\/\s*X\s*$/i);
        if (titleMatch) text = titleMatch[1].trim();
      }
      return { statusId, text, author };
    }
    /**
     * Get a tweet article's own status ID via the timestamp link.
     * The <time> element is always wrapped in the tweet's own permalink, never a "Replying to" link.
     * @param {Element} article
     * @returns {string|null}
     */
    getOwnStatusIdFromArticle(article) {
      if (!article) return null;
      const timeLink = article.querySelector("time")?.closest('a[href*="/status/"]');
      if (timeLink) {
        const href = timeLink.getAttribute("href") || timeLink.href || "";
        const m = href.match(/\/status\/(\d+)/);
        if (m) return m[1];
      }
      return null;
    }
    /**
     * Proactively populate _originalTweetCache for the current detail page.
     * Called every URL_TRACKING_MS so the cache is ready before the user scrolls.
     */
    tryEagerCacheOriginalTweet() {
      try {
        const statusId = this.getStatusIdFromDetailPageUrl();
        if (!statusId) return;
        if (this._originalTweetCache?.statusId === statusId && this._originalTweetCache.fromDom) return;
        if (this._originalTweetCache && this._originalTweetCache.statusId !== statusId) {
          this._originalTweetCache = null;
        }
        const article = this.findOriginalTweetArticleByStatusId(statusId);
        if (article) {
          const data = this.extractTextAndAuthorFromArticle(article);
          if (data) {
            this._originalTweetCache = { statusId, text: data.text, author: data.author, fromDom: true };
          }
        }
      } catch (e) {
      }
    }
    /**
     * Extract text and author from a single tweet article (same logic as extractTweetsFromContainer).
     * @param {Element} article - article[data-testid="tweet"]
     * @returns {{ text: string, author: string }|null}
     */
    extractTextAndAuthorFromArticle(article) {
      if (!article) return null;
      const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
      if (!tweetTextEl) return null;
      const text = tweetTextEl.textContent?.trim();
      if (!text || text.length < 10) return null;
      let author = "unknown";
      const userNameEl = article.querySelector('[data-testid="User-Name"]');
      if (userNameEl) {
        const fullText = userNameEl.textContent?.trim() || "";
        const handleMatch = fullText.match(/@([A-Za-z0-9_]+)/);
        if (handleMatch) author = handleMatch[1];
      }
      if (author === "unknown" && userNameEl) {
        const profileLink = userNameEl.querySelector("a[href]");
        if (profileLink) {
          const href = profileLink.getAttribute("href") || "";
          const hrefMatch = href.match(/^\/([A-Za-z0-9_]+)$/);
          if (hrefMatch) author = hrefMatch[1];
        }
      }
      if (author === "unknown") {
        const links = article.querySelectorAll("a[href]");
        const reservedPaths = /* @__PURE__ */ new Set(["status", "search", "intent", "i", "home", "hashtag", "compose", "settings", "explore", "notifications", "messages"]);
        for (const link of links) {
          const href = link.getAttribute("href") || "";
          const hrefMatch = href.match(/^\/([A-Za-z0-9_]+)$/);
          if (hrefMatch && !reservedPaths.has(hrefMatch[1].toLowerCase())) {
            author = hrefMatch[1];
            break;
          }
        }
      }
      return { text, author };
    }
    /**
     * Find the article that owns the given status ID (the tweet's own permalink, not "Replying to" or quoted).
     * @param {string} statusId - Status ID from URL
     * @returns {Element|null} The article element or null
     */
    findOriginalTweetArticleByStatusId(statusId) {
      if (!statusId) return null;
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      const statusPath = "/status/" + statusId;
      for (const article of articles) {
        const links = article.querySelectorAll('a[href*="' + statusPath + '"]');
        for (const link of links) {
          const href = (link.getAttribute("href") || link.href || "").split("?")[0];
          if (!href.includes(statusPath)) continue;
          if (href.includes("/analytics")) continue;
          let node = link;
          let insideReplyingTo = false;
          while (node && node !== article) {
            const text = (node.textContent || "").trim();
            if (/^replying to @/i.test(text) || node !== link && /replying to/i.test(text)) {
              insideReplyingTo = true;
              break;
            }
            node = node.parentElement;
          }
          if (!insideReplyingTo) {
            const ownId = this.getOwnStatusIdFromArticle(article);
            if (ownId === statusId) return article;
          }
        }
      }
      return null;
    }
    /**
     * When the reply composer modal is open (/compose/post), the tweet shown above the composer
     * is the one we're replying to. Return that article so tweetId and current tweet text match the UI.
     * @returns {Element|null}
     */
    getReplyTargetArticleFromComposerDialog() {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      for (const dialog of dialogs) {
        const hasComposer = dialog.querySelector('[data-testid^="tweetTextarea_"]');
        const tweetArticle = dialog.querySelector('article[data-testid="tweet"]');
        if (hasComposer && tweetArticle) return tweetArticle;
      }
      return null;
    }
    // Find the native Reply button inside toolbar
    findReplyButton(toolbarEl) {
      if (!toolbarEl) return null;
      const byTestId = toolbarEl.querySelector('[data-testid="tweetButtonInline"]');
      if (byTestId) return byTestId;
      const candidates = Array.from(toolbarEl.querySelectorAll('div[role="button"], button'));
      let found = candidates.find((btn) => /reply/i.test(btn.getAttribute("aria-label") || ""));
      if (found) return found;
      found = candidates.find((btn) => /reply/i.test((btn.textContent || "").trim()));
      if (found) return found;
      const globalInlineBtn = document.querySelector('[data-testid="tweetButtonInline"]');
      if (globalInlineBtn && /reply/i.test(globalInlineBtn.textContent || "")) return globalInlineBtn;
      return null;
    }
    // Place our Suggest button immediately to the left of the native Reply button
    placeSuggestButtonLeftOfReply(toolbarEl, controlsRow) {
      const replyBtn = this.findReplyButton(toolbarEl);
      if (!replyBtn) return false;
      const suggestBtn = controlsRow.querySelector(".tweetreply-suggest-btn");
      if (!suggestBtn) return;
      if (toolbarEl.contains(suggestBtn)) return true;
      suggestBtn.style.marginRight = "8px";
      const parent = replyBtn.parentElement || toolbarEl;
      if (parent) {
        parent.insertBefore(suggestBtn, replyBtn);
      }
      return true;
    }
    // Observe toolbar for changes and retry placement until success
    observePlacement(toolbarEl, controlsRow) {
      let attempts = 0;
      const tryPlace = () => {
        if (this.placeSuggestButtonLeftOfReply(toolbarEl, controlsRow)) {
          observer.disconnect();
        } else if (++attempts >= 8) {
          observer.disconnect();
        }
      };
      const observer = new MutationObserver(() => {
        tryPlace();
      });
      observer.observe(toolbarEl, { childList: true, subtree: true });
      setTimeout(tryPlace, TIMEOUTS.PLACEMENT_OBSERVER_MS);
    }
    // Ensure Suggest stays left of Reply across focus/typing/renders
    ensureSuggestLeftOfReply(toolbarEl, controlsRow, containerEl, opts = {}) {
      if (!this.placeSuggestButtonLeftOfReply(toolbarEl, controlsRow)) {
        this.observePlacement(toolbarEl, controlsRow);
      }
      if (!opts.skipReplacementListeners) {
        let last = 0;
        const throttleMs = TIMEOUTS.BUTTON_THROTTLE_MS;
        const maybePlace = () => {
          const now = Date.now();
          if (now - last < throttleMs) return;
          last = now;
          this.placeSuggestButtonLeftOfReply(toolbarEl, controlsRow);
        };
        const events = ["focusin", "input", "keyup"];
        events.forEach((ev) => {
          containerEl.addEventListener(ev, maybePlace, { passive: true });
        });
      }
    }
    createSuggestButton(composer, containerId) {
      const container = document.createElement("div");
      container.className = "tweetreply-button-container";
      container.dataset.containerId = containerId;
      container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 6px 0 6px 0;
      position: relative;
      z-index: 1;
    `;
      let modelSelect = null;
      if (this.usageData?.showModelSelect) {
        modelSelect = this.createModelSelect();
        container.appendChild(modelSelect);
      }
      const replyModeSelect = this.createReplyModeSelect();
      container.appendChild(replyModeSelect);
      const promptSelect = this.createPromptSelect();
      container.appendChild(promptSelect);
      const suggestButton = document.createElement("button");
      suggestButton.className = "tweetreply-suggest-btn";
      suggestButton.dataset.authPending = "true";
      suggestButton.disabled = true;
      suggestButton.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.416" stroke-dashoffset="31.416">
          <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416;0 31.416" repeatCount="indefinite"/>
          <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416;-31.416" repeatCount="indefinite"/>
        </circle>
      </svg>
      <span>Checking...</span>
    `;
      suggestButton.title = "Checking authentication...";
      this.updateButtonStateAsync(suggestButton);
      suggestButton.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (suggestButton.dataset.authPending === "true") {
          await this.updateButtonStateAsync(suggestButton);
        }
        if (!this.isAuthenticated) {
          await this.openLoginPage();
          return;
        }
        if (suggestButton.dataset.loadError === "true") {
          console.log("[TweetReply] Retrying button initialization...");
          delete suggestButton.dataset.loadError;
          suggestButton.dataset.authPending = "true";
          this.updateButtonState(suggestButton);
          await this.updateButtonStateAsync(suggestButton);
          return;
        }
        const actualComposer = composer.querySelector('[contenteditable="true"]') || composer.querySelector(".public-DraftEditor-content") || composer;
        console.log("[TweetReply] Button click - Composer container:", composer.getAttribute("data-testid"));
        console.log("[TweetReply] Button click - Actual composer:", actualComposer.contentEditable, actualComposer.className);
        this.handleSuggestReply(actualComposer, suggestButton, {
          modelKey: modelSelect ? modelSelect.value : "auto",
          replyMode: replyModeSelect.value,
          promptVariation: promptSelect.value
        });
      });
      const improveButton = this.createImproveButton(composer);
      container.appendChild(suggestButton);
      container.appendChild(improveButton);
      return container;
    }
    async updateButtonStateAsync(button) {
      try {
        console.log("[TweetReply] Initializing button state...");
        if (!this.isAuthenticated) {
          this.isAuthenticated = await this.authManager.isAuthenticated(true);
          console.log("[TweetReply] Auth status:", this.isAuthenticated);
        }
        if (this.isAuthenticated && !this.usageData) {
          console.log("[TweetReply] Loading usage data...");
          try {
            await Promise.race([
              this.loadUsageData(),
              new Promise(
                (_, reject) => setTimeout(() => reject(new Error("Timeout after 10 seconds")), TIMEOUTS.USAGE_LOAD_MS)
              )
            ]);
            console.log("[TweetReply] Usage data loaded:", this.usageData);
          } catch (error) {
            console.warn("[TweetReply] Failed to load usage data, using fallback:", error);
            this.usageData = {
              used: 0,
              limit: 999,
              resetAt: new Date(Date.now() + AUTH.ONE_DAY_MS).toISOString()
            };
          }
        }
        delete button.dataset.authPending;
        delete button.dataset.loadError;
        this.updateButtonState(button);
      } catch (error) {
        console.error("[TweetReply] Critical error initializing button:", error);
        delete button.dataset.authPending;
        button.dataset.loadError = "true";
        this.updateButtonState(button);
      }
    }
    createModelSelect() {
      const select = document.createElement("select");
      select.className = "tweetreply-model-select";
      select.title = "Choose AI model";
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "Auto";
      select.appendChild(defaultOption);
      let savedModelKey = null;
      try {
        chrome.storage?.local?.get(["tweetreply_model"], (data) => {
          if (data && typeof data.tweetreply_model === "string") {
            savedModelKey = data.tweetreply_model;
          }
        });
      } catch (_) {
      }
      this.loadModels().then((models) => {
        if (models && models.openai) {
          models.openai.forEach((model) => {
            const option = document.createElement("option");
            option.value = model.key;
            option.textContent = model.name;
            select.appendChild(option);
          });
        }
        if (models && models.groq) {
          models.groq.forEach((model) => {
            const option = document.createElement("option");
            option.value = model.key;
            option.textContent = model.name;
            select.appendChild(option);
          });
        }
        const options = Array.from(select.querySelectorAll("option"));
        if (savedModelKey && options.some((o) => o.value === savedModelKey)) {
          select.value = savedModelKey;
        } else {
          const preferred = options.length > 1 ? options[1] : null;
          if (preferred && preferred !== defaultOption) {
            select.insertBefore(preferred, select.children[1] || null);
            select.value = preferred.value;
          }
        }
      }).catch((error) => {
        console.error("Failed to load models:", error);
      });
      select.addEventListener("change", () => {
        try {
          chrome.storage?.local?.set({ tweetreply_model: select.value });
        } catch (_) {
        }
      });
      return select;
    }
    createPromptSelect() {
      const select = document.createElement("select");
      select.className = "tweetreply-prompt-select";
      select.title = "Choose reply style";
      let savedPrompt = null;
      try {
        chrome.storage?.local?.get(["tweetreply_prompt"], (data) => {
          if (data && typeof data.tweetreply_prompt === "string") {
            savedPrompt = data.tweetreply_prompt;
          }
        });
      } catch (_) {
      }
      this.loadPrompts().then((prompts) => {
        if (prompts && Array.isArray(prompts)) {
          prompts.forEach((prompt) => {
            if (prompt.key === "improve" || prompt.key === "guardrail_violation") return;
            const option = document.createElement("option");
            option.value = prompt.key;
            const label = prompt.key === "conversational" ? "Chat" : prompt.name;
            option.textContent = label;
            select.appendChild(option);
          });
        }
        const options = Array.from(select.querySelectorAll("option"));
        if (savedPrompt && options.some((o) => o.value === savedPrompt)) {
          select.value = savedPrompt;
        } else {
          const preferred = options.find((o) => /direct/i.test(o.textContent || "")) || null;
          if (preferred) {
            select.insertBefore(preferred, select.children[0] || null);
            select.value = preferred.value;
          }
        }
      }).catch((error) => {
        console.error("Failed to load prompts:", error);
      });
      select.addEventListener("change", () => {
        try {
          chrome.storage?.local?.set({ tweetreply_prompt: select.value });
        } catch (_) {
        }
      });
      return select;
    }
    createReplyModeSelect() {
      const select = document.createElement("select");
      select.className = "tweetreply-reply-mode-select";
      select.title = "Choose reply generation mode";
      const modes = [
        { value: "single-sentence", label: "\u26A1 Concise", tooltip: "Fast one-sentence reply" },
        { value: "enhanced", label: "\u{1F9E0} Enhanced", tooltip: "Context-aware with deep analysis" }
      ];
      modes.forEach((mode) => {
        const option = document.createElement("option");
        option.value = mode.value;
        option.textContent = mode.label;
        option.title = mode.tooltip;
        select.appendChild(option);
      });
      select.value = "enhanced";
      try {
        chrome.storage?.local?.get(["tweetreply_reply_mode"], (data) => {
          if (data && typeof data.tweetreply_reply_mode === "string") {
            const savedMode = data.tweetreply_reply_mode;
            if (modes.some((m) => m.value === savedMode)) {
              select.value = savedMode;
              console.log("[TweetReply] Restored reply mode from storage:", savedMode);
            } else {
              select.value = "enhanced";
              try {
                chrome.storage?.local?.set({ tweetreply_reply_mode: "enhanced" });
              } catch (_) {
              }
              console.log("[TweetReply] Saved reply mode not valid, using default");
            }
          }
        });
      } catch (error) {
        console.warn("[TweetReply] Failed to restore reply mode from storage:", error);
      }
      select.addEventListener("change", () => {
        try {
          chrome.storage?.local?.set({ tweetreply_reply_mode: select.value });
          console.log("[TweetReply] Reply mode changed to:", select.value);
        } catch (_) {
        }
      });
      return select;
    }
    async loadModels() {
      try {
        return await this.apiClient.getModels();
      } catch (error) {
        console.error("Failed to load models:", error);
        return null;
      }
    }
    async loadPrompts() {
      try {
        return await this.apiClient.getPrompts();
      } catch (error) {
        console.error("Failed to load prompts:", error);
        return null;
      }
    }
    createImproveButton(composer) {
      const button = document.createElement("button");
      button.className = "tweetreply-improve-btn";
      button.dataset.authPending = "true";
      button.setAttribute("aria-label", "Improve current draft reply");
      button.disabled = true;
      button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.416" stroke-dashoffset="31.416">
          <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416;0 31.416" repeatCount="indefinite"/>
          <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416;-31.416" repeatCount="indefinite"/>
        </circle>
      </svg>
      <span>Checking...</span>
    `;
      button.title = "Checking authentication...";
      this.updateButtonStateAsync(button);
      button.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (button.dataset.authPending === "true") {
          await this.updateButtonStateAsync(button);
        }
        if (!this.isAuthenticated) {
          await this.openLoginPage();
          return;
        }
        if (button.dataset.loadError === "true") {
          console.log("[TweetReply] Retrying improve button initialization...");
          delete button.dataset.loadError;
          button.dataset.authPending = "true";
          this.updateButtonState(button);
          await this.updateButtonStateAsync(button);
          return;
        }
        const actualComposer = composer.querySelector('[contenteditable="true"]') || composer.querySelector(".public-DraftEditor-content") || composer;
        this.handleImproveReply(actualComposer, button);
      });
      return button;
    }
    updateButtonState(button) {
      if (button.dataset.authPending === "true") {
        return;
      }
      if (button.dataset.loadError === "true") {
        button.disabled = false;
        button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z" opacity="0.8"/>
        </svg>
        <span>\u26A0\uFE0F Retry</span>
      `;
        button.title = "Failed to load. Click to retry.";
        button.style.opacity = "0.8";
        return;
      }
      if (!this.isAuthenticated) {
        button.disabled = false;
        button.dataset.requiresAuth = "true";
        button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z" opacity="0.6"/>
        </svg>
        <span>\u{1F512} Sign in to use</span>
      `;
        button.title = "Click to sign in to TweetReply";
        button.style.opacity = "0.85";
        return;
      }
      if (!this.usageData) {
        button.disabled = true;
        button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.416" stroke-dashoffset="31.416">
            <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416;0 31.416" repeatCount="indefinite"/>
            <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416;-31.416" repeatCount="indefinite"/>
          </circle>
        </svg>
        <span>\u23F3 Loading...</span>
      `;
        button.title = "Loading usage data...";
        button.style.opacity = "1";
        return;
      }
      if (this.usageData.used >= this.usageData.limit) {
        const container2 = button.closest(".tweetreply-button-container");
        const improveBtn2 = container2?.querySelector(".tweetreply-improve-btn");
        if (button.classList.contains("tweetreply-improve-btn")) {
          button.style.display = "none";
          return;
        }
        button.disabled = false;
        button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M7 2v11h3v9l7-12h-4l4-8z"/>
        </svg>
        <span>Upgrade to unlock replies</span>
      `;
        button.title = `You've used all ${this.usageData.limit} credits: upgrade now to keep replying!`;
        button.style.opacity = "1";
        button.style.background = "#3b82f6";
        button.style.color = "#ffffff";
        button.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const domain = API.DEFAULT_DOMAIN;
          const protocol = domain.includes("localhost") ? "http" : "https";
          chrome.runtime.sendMessage({ action: "openLoginPage", url: `${protocol}://${domain}/pricing` });
        };
        if (improveBtn2) improveBtn2.style.display = "none";
        return;
      }
      const isImproveButton = button.classList.contains("tweetreply-improve-btn");
      button.disabled = false;
      delete button.dataset.requiresAuth;
      const container = button.closest(".tweetreply-button-container");
      const improveBtn = container?.querySelector(".tweetreply-improve-btn");
      if (improveBtn) improveBtn.style.removeProperty("display");
      if (!isImproveButton) {
        button.onclick = null;
        button.style.removeProperty("background");
        button.style.removeProperty("color");
      }
      if (isImproveButton) {
        button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        <span>Improve reply</span>
      `;
        button.title = "Improve the current draft reply";
      } else {
        button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z"/>
        </svg>
        <span>Suggest reply</span>
      `;
        button.title = "Generate an AI reply suggestion";
      }
      button.style.opacity = "1";
    }
    async openLoginPage() {
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: "getApiDomain" }, (response2) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(response2);
          });
        });
        const domain = response?.domain || API.DEFAULT_DOMAIN;
        const protocol = domain.includes("localhost") ? "http" : "https";
        const loginUrl = `${protocol}://${domain}/login`;
        chrome.runtime.sendMessage({
          action: "openLoginPage",
          url: loginUrl
        }, (response2) => {
          if (chrome.runtime.lastError) {
            console.error("[TweetReply] Failed to open login page:", chrome.runtime.lastError.message);
          }
        });
      } catch (error) {
        console.error("[TweetReply] Failed to get API domain, using fallback:", error);
        const loginUrl = API.LOGIN_URL;
        chrome.runtime.sendMessage({
          action: "openLoginPage",
          url: loginUrl
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("[TweetReply] Failed to open login page:", chrome.runtime.lastError.message);
          }
        });
      }
    }
    insertButtonInToolbar(toolbar, button) {
      if (toolbar.firstChild) {
        toolbar.insertBefore(button, toolbar.firstChild);
      } else {
        toolbar.appendChild(button);
      }
    }
    async handleSuggestReply(composer, button, options = {}) {
      if (!this.isAuthenticated) {
        this.showMessage(composer, "Please sign in to use TweetReply", "error");
        return;
      }
      if (!this.usageData || this.usageData.used >= this.usageData.limit) {
        this.showMessage(composer, "You've used all your credits! Upgrade to keep the replies flowing.", "info");
        return;
      }
      const tweetText = this.extractTweetText();
      if (!tweetText) {
        this.showMessage(composer, "Could not find the tweet to reply to", "error");
        return;
      }
      const tweetId = this.extractTweetId();
      if (!tweetId) {
        console.error("[TweetReply] Failed to extract tweet ID");
        this.showMessage(composer, "Could not identify the tweet. Try refreshing the page.", "error");
        return;
      }
      if (DIAGNOSE_THREAD_SELECTION) {
        const statusIdFromUrl = this.getStatusIdFromDetailPageUrl();
        console.log("[TweetReply] DIAG URL pathname:", window.location.pathname);
        console.log("[TweetReply] DIAG lastNonComposePath:", this.lastNonComposePath);
        console.log("[TweetReply] DIAG isTweetDetailPage:", this.isTweetDetailPage());
        console.log("[TweetReply] DIAG URL statusId:", statusIdFromUrl ?? "null");
        console.log("[TweetReply] DIAG reply-target tweetId (API):", tweetId);
        if (statusIdFromUrl && tweetId) {
          console.log("[TweetReply] DIAG statusId === tweetId?", statusIdFromUrl === tweetId);
        }
      }
      button.disabled = true;
      const originalText = button.innerHTML;
      button.innerHTML = `
      <div class="tweetreply-spinner" style="width: 14px; height: 14px; border: 2px solid #1d9bf0; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 4px;"></div>
      <span>Generating...</span>
    `;
      try {
        const authorInfo = this.extractAuthorInfo();
        const threadContext = this.extractThreadContext();
        const tweetMetadata = this.extractTweetMetadata();
        console.log("[TweetReply] \u{1F4CA} Thread Context Summary:", {
          isReply: threadContext?.isReply || false,
          hasOriginalTweet: !!threadContext?.originalTweet,
          originalTweetAuthor: threadContext?.originalTweetAuthor || "none",
          threadLength: threadContext?.threadLength || 0,
          currentTweetIndex: threadContext?.currentTweetIndex || 0
        });
        if (threadContext?.isReply && threadContext?.originalTweet) {
          console.log("[TweetReply] \u{1F4CB} QUICK THREAD PREVIEW:");
          console.log("[TweetReply] Original:", threadContext.originalTweet.substring(0, 100) + (threadContext.originalTweet.length > 100 ? "..." : ""));
          if (threadContext.threadChain && threadContext.threadChain.length > 0) {
            console.log("[TweetReply] Thread chain:", threadContext.threadChain.map(
              (t) => (t.isOriginal ? "\u{1F535}" : t.isCurrent ? "\u{1F7E2}" : "\u26AA") + " " + t.text.substring(0, 60) + (t.text.length > 60 ? "..." : "")
            ));
          }
        }
        console.log("[TweetReply] Generating reply with data:", {
          tweet_id: tweetId,
          tweet_text_length: tweetText.length,
          author_info_username: authorInfo?.username || "unknown",
          model_key: options.modelKey || "auto",
          prompt_variation: options.promptVariation || "default",
          is_reply: threadContext?.isReply || false,
          thread_length: threadContext?.threadLength || 0
        });
        console.log("[TweetReply] \u{1F916} Starting AI-powered tweet analysis (server-side)...");
        const conversationContext = threadContext?.threadChain?.map((t) => t.text) || null;
        const response = await this.apiClient.generateReply({
          tweet_text: tweetText,
          tweet_id: tweetId,
          // Now guaranteed to be non-null
          model_key: options.modelKey,
          reply_mode: options.replyMode,
          // Reply generation mode
          prompt_variation: options.promptVariation,
          author_info: authorInfo,
          // Now guaranteed to have follower_count as number
          thread_context: threadContext,
          // NEW: Structured thread data
          conversation_context: conversationContext,
          // Backward compatibility
          tweet_metadata: tweetMetadata
        });
        if (response.analysis) {
          console.log("[TweetReply] \u2705 Tweet analysis completed:", {
            tone: response.analysis.tone || "unknown",
            sentiment: response.analysis.sentiment || "unknown",
            style: response.analysis.style || "unknown",
            intention: response.analysis.intention ? response.analysis.intention.substring(0, 80) + "..." : "N/A"
          });
        } else {
          console.log("[TweetReply] \u2139\uFE0F No analysis data in response (using basic context)");
        }
        await this.insertReplyIntoComposer(composer, {
          reply: response.reply,
          qualityScore: response.qualityScore
        });
        this.usageData = {
          ...this.usageData,
          used: response.used,
          limit: response.limit,
          resetAt: response.resetAt
        };
        try {
          chrome.runtime.sendMessage({ action: "usageUpdated" }).catch(() => {
          });
        } catch (error) {
        }
        this.showMessage(composer, "\u2713 Reply inserted", "success");
        this.updateAllButtonStates();
      } catch (error) {
        console.error("Failed to generate reply:", error);
        let errorMessage = "Failed to generate reply";
        if (error.message.includes("400")) {
          errorMessage = "Invalid request. Please try again or refresh the page.";
        } else if (error.message.includes("401")) {
          this.authManager.signOut().catch((err) => {
            console.error("Failed to sign out on 401:", err);
          });
          this.isAuthenticated = false;
          errorMessage = "You have been logged out. Please sign in again.";
        } else if (error.message.includes("402")) {
          errorMessage = "Credits used up: upgrade to continue!";
        } else if (error.message.includes("Network error")) {
          errorMessage = "Network error - check your connection";
        } else if (error.message) {
          errorMessage = `Failed to generate reply: ${error.message}`;
        }
        this.showMessage(composer, errorMessage, "error");
      } finally {
        button.innerHTML = originalText;
        button.disabled = false;
        this.updateButtonState(button);
      }
    }
    async handleSuggestReplyFromPopup() {
      const composers = document.querySelectorAll('[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea_1"]');
      for (const composer of composers) {
        if (this.isComposerVisible(composer)) {
          const button = this.findButtonForComposer(composer);
          if (button && !button.disabled) {
            await this.handleSuggestReply(composer, button);
            break;
          }
        }
      }
    }
    async handleImproveReply(composer, button) {
      if (!this.isAuthenticated) {
        this.showMessage(composer, "Please sign in to use TweetReply", "error");
        return;
      }
      if (!this.usageData || this.usageData.used >= this.usageData.limit) {
        this.showMessage(composer, "You've used all your credits! Upgrade to keep the replies flowing.", "info");
        return;
      }
      let draftText = "";
      const dataTextSpans = composer.querySelectorAll('[data-text="true"]');
      if (dataTextSpans.length > 0) {
        draftText = Array.from(dataTextSpans).map((span) => span.textContent || span.innerText).join(" ").trim();
      }
      if (!draftText || draftText.length === 0) {
        draftText = composer.textContent || composer.innerText || "";
      }
      if (!draftText || draftText.length === 0) {
        const contentEditable = composer.querySelector('[contenteditable="true"]');
        if (contentEditable) {
          draftText = contentEditable.textContent || contentEditable.innerText || "";
        }
      }
      draftText = draftText.trim();
      if (!draftText || draftText.length === 0) {
        this.showMessage(composer, "Please write a draft reply first", "info");
        return;
      }
      button.disabled = true;
      const originalText = button.innerHTML;
      button.innerHTML = `
      <div class="tweetreply-spinner" style="width: 14px; height: 14px; border: 2px solid #3b82f6; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 4px;"></div>
      <span>Improving...</span>
    `;
      try {
        const originalTweetText = this.extractTweetText() || "";
        console.log("[TweetReply] Improving draft:", {
          draftLength: draftText.length,
          originalTweetLength: originalTweetText.length
        });
        const response = await this.apiClient.suggestImprovements(draftText, originalTweetText);
        console.log("[TweetReply] API response received:", response);
        console.log("[TweetReply] Response keys:", Object.keys(response || {}));
        let improvedDraft = "";
        if (response && response.improved) {
          improvedDraft = response.improved;
        } else if (typeof response === "string") {
          improvedDraft = response;
        } else if (response && response.improvedDraft) {
          improvedDraft = response.improvedDraft;
        } else if (response && response.improved_reply) {
          improvedDraft = response.improved_reply;
        } else if (response && response.reply) {
          improvedDraft = response.reply;
        } else if (response && response.suggestion) {
          improvedDraft = response.suggestion;
        } else {
          improvedDraft = Object.values(response).find((v) => typeof v === "string") || draftText;
        }
        console.log("[TweetReply] Extracted improved draft:", improvedDraft);
        if (!improvedDraft || improvedDraft.trim().length === 0) {
          throw new Error("No improved draft received from API");
        }
        await this.insertReplyIntoComposer(composer, improvedDraft);
        this.showMessage(composer, "\u2713 Reply improved", "success");
        if (response.usage) {
          this.usageData = {
            ...this.usageData,
            used: response.usage.used,
            limit: response.usage.limit || this.usageData.limit,
            resetAt: response.usage.resetAt || this.usageData.resetAt
          };
        } else if (response.used !== void 0) {
          this.usageData = {
            ...this.usageData,
            used: response.used,
            limit: response.limit || this.usageData.limit,
            resetAt: response.resetAt || this.usageData.resetAt
          };
        }
        if (response.usage || response.used !== void 0) {
          try {
            chrome.runtime.sendMessage({ action: "usageUpdated" }).catch(() => {
            });
          } catch (error) {
          }
        }
        this.updateAllButtonStates();
      } catch (error) {
        console.error("[TweetReply] Failed to improve reply:", error);
        console.error("[TweetReply] Error details:", {
          message: error.message,
          stack: error.stack,
          response: error.response
        });
        let errorMessage = "Failed to improve reply";
        if (error.message.includes("400")) {
          errorMessage = "Invalid request. Please try again or refresh the page.";
        } else if (error.message.includes("401")) {
          this.authManager.signOut().catch((err) => {
            console.error("Failed to sign out on 401:", err);
          });
          this.isAuthenticated = false;
          errorMessage = "You have been logged out. Please sign in again.";
        } else if (error.message.includes("402")) {
          errorMessage = "Credits used up: upgrade to continue!";
        } else if (error.message.includes("Network error")) {
          errorMessage = "Network error - check your connection";
        } else if (error.message) {
          errorMessage = `Failed to improve reply: ${error.message}`;
        }
        this.showMessage(composer, errorMessage, "error");
      } finally {
        button.innerHTML = originalText;
        button.disabled = false;
        this.updateButtonState(button);
      }
    }
    isComposerVisible(composer) {
      const rect = composer.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
    }
    findButtonForComposer(composer) {
      const container = composer.closest('[data-testid="tweetComposer"]') || composer.parentElement;
      return container?.querySelector(".tweetreply-suggest-btn");
    }
    extractTweetText() {
      if (/\/compose\/post/.test(window.location.pathname)) {
        const dialogArticle = this.getReplyTargetArticleFromComposerDialog();
        if (dialogArticle) {
          const tweetTextEl = dialogArticle.querySelector('[data-testid="tweetText"]');
          if (tweetTextEl) {
            const text = tweetTextEl.textContent?.trim();
            if (text && text.length > 10) return text;
          }
        }
      }
      if (this.currentReplyTargetArticle && document.contains(this.currentReplyTargetArticle)) {
        const tweetTextEl = this.currentReplyTargetArticle.querySelector('[data-testid="tweetText"]');
        if (tweetTextEl) {
          const text = tweetTextEl.textContent?.trim();
          if (text && text.length > 10) return text;
        }
      }
      if (this.isTweetDetailPage()) {
        const statusId = this.getStatusIdFromDetailPageUrl();
        if (statusId) {
          const focalArticle = this.findOriginalTweetArticleByStatusId(statusId);
          if (focalArticle) {
            const data = this.extractTextAndAuthorFromArticle(focalArticle);
            if (data?.text && data.text.length > 10) return data.text;
          }
        }
      }
      const tweetSelectors = [
        '[data-testid="tweet"] [data-testid="tweetText"]',
        ".tweet-text",
        "[lang] span"
        // Twitter uses lang attribute on tweet text
      ];
      for (const selector of tweetSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const text = element.textContent?.trim();
          if (text && text.length > 10) return text;
        }
      }
      try {
        const draftSpans = document.querySelectorAll('span[data-text="true"]');
        if (draftSpans.length > 0) {
          const text = Array.from(draftSpans).map((span) => span.textContent || "").join(" ").trim();
          if (text && text.length > 10) return text;
        }
      } catch (error) {
        console.warn("[TweetReply] Draft.js span extraction failed:", error);
      }
      try {
        const contentEditables = document.querySelectorAll('[contenteditable="true"]');
        for (const element of contentEditables) {
          if (element.getAttribute("data-testid")?.includes("tweetTextarea") || element.classList.contains("public-DraftEditor-content")) {
            continue;
          }
          const text = element.textContent?.trim();
          if (text && text.length > VALIDATION.MIN_TWEET_LENGTH && text.length < VALIDATION.MAX_TWEET_LENGTH) {
            console.log("[TweetReply] \u2705 Tweet text found via contentEditable");
            return text;
          }
        }
      } catch (error) {
        console.warn("[TweetReply] contentEditable extraction failed:", error);
      }
      try {
        const draftBlocks = document.querySelectorAll(".public-DraftStyleDefault-block");
        if (draftBlocks.length > 0) {
          const text = Array.from(draftBlocks).map((block) => block.textContent || "").join("\n").trim();
          if (text && text.length > 10) {
            console.log("[TweetReply] \u2705 Tweet text found via Draft.js blocks");
            return text;
          }
        }
      } catch (error) {
        console.warn("[TweetReply] Draft.js block extraction failed:", error);
      }
      try {
        const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
        for (const tweet of tweetElements) {
          let currentElement = tweet;
          for (let i = 0; i < 3 && currentElement; i++) {
            const spans = currentElement.querySelectorAll('span[data-text="true"]');
            if (spans.length > 0) {
              const text = Array.from(spans).map((span) => span.textContent || "").join(" ").trim();
              if (text && text.length > 10) {
                console.log("[TweetReply] \u2705 Tweet text found via parent traversal");
                return text;
              }
            }
            currentElement = currentElement.parentElement;
          }
        }
      } catch (error) {
        console.warn("[TweetReply] Parent traversal extraction failed:", error);
      }
      try {
        const allText = document.body.textContent;
        const sentences = allText.split(/[.!?]+/).filter((s) => s.trim().length > VALIDATION.MIN_TWEET_LENGTH);
        if (sentences.length > 0) {
          console.log("[TweetReply] \u2705 Tweet text found via sentence detection");
          return sentences[0]?.trim() || null;
        }
      } catch (error) {
        console.warn("[TweetReply] Sentence detection failed:", error);
      }
      console.warn("[TweetReply] \u274C Failed to extract tweet text from any method");
      return null;
    }
    extractTweetId() {
      if (/\/compose\/post/.test(window.location.pathname)) {
        const dialogArticle = this.getReplyTargetArticleFromComposerDialog();
        if (dialogArticle) {
          const ownId = this.getOwnStatusIdFromArticle(dialogArticle);
          if (ownId) {
            console.log("[TweetReply] Tweet ID extracted from composer dialog:", ownId);
            return ownId;
          }
        }
      }
      const urlMatch = window.location.href.match(/status\/(\d+)/);
      if (urlMatch) {
        console.log("[TweetReply] Tweet ID extracted from URL:", urlMatch[1]);
        return urlMatch[1];
      }
      const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
      for (const tweet of tweetElements) {
        const tweetId = tweet.getAttribute("data-tweet-id");
        if (tweetId) {
          console.log("[TweetReply] Tweet ID extracted from data-tweet-id:", tweetId);
          return tweetId;
        }
        const ariaLabel = tweet.getAttribute("aria-labelledby");
        if (ariaLabel) {
          const match = ariaLabel.match(/(\d{15,})/);
          if (match) {
            console.log("[TweetReply] Tweet ID extracted from aria-labelledby:", match[1]);
            return match[1];
          }
        }
        const tweetLink = tweet.querySelector('a[href*="/status/"]');
        if (tweetLink) {
          const linkMatch = tweetLink.href.match(/status\/(\d+)/);
          if (linkMatch) {
            console.log("[TweetReply] Tweet ID extracted from tweet link:", linkMatch[1]);
            return linkMatch[1];
          }
        }
      }
      const statusLinks = document.querySelectorAll('a[href*="/status/"]');
      for (const link of statusLinks) {
        const linkMatch = link.href.match(/status\/(\d+)/);
        if (linkMatch) {
          console.log("[TweetReply] Tweet ID extracted from status link:", linkMatch[1]);
          return linkMatch[1];
        }
      }
      console.warn("[TweetReply] Failed to extract tweet ID from any source");
      return null;
    }
    parseFollowerCount(countStr) {
      if (!countStr) return 0;
      const multipliers = { K: 1e3, M: 1e6, B: 1e9 };
      const match = countStr.match(/^([\d.]+)([KMB])?$/i);
      if (!match) return 0;
      const num = parseFloat(match[1]);
      const suffix = match[2]?.toUpperCase();
      return Math.round(num * (multipliers[suffix] || 1));
    }
    extractAuthorInfo() {
      try {
        const authorElement = document.querySelector('[data-testid="User-Name"]');
        if (!authorElement) {
          console.log("[TweetReply] No author element found, using defaults");
          return {
            username: "unknown",
            verified: false,
            follower_count: 0
            // Fallback value
          };
        }
        const fullText = authorElement.textContent?.trim() || "unknown";
        let username = "unknown";
        let displayName = null;
        let postedTime = null;
        let match = fullText.match(/^(.+?)@([^\u00B7·.\s]+)\s*[\u00B7·.]\s*(.+)$/);
        if (match) {
          [, displayName, username, postedTime] = match;
          username = username.trim();
          displayName = displayName.trim();
          postedTime = postedTime.trim();
        } else {
          match = fullText.match(/^@([^\u00B7·.\s]+)\s*[\u00B7·.]\s*(.+)$/);
          if (match) {
            [, username, postedTime] = match;
            username = username.trim();
            postedTime = postedTime.trim();
          } else {
            username = fullText;
          }
        }
        const verifiedIcon = authorElement.querySelector('[data-testid="icon-verified"]');
        const isVerified = !!verifiedIcon;
        let followerCount = 0;
        const tweetArticle = authorElement.closest('article[data-testid="tweet"]') || authorElement.closest("article");
        if (tweetArticle) {
          const followerMatch = tweetArticle.textContent?.match(/(\d+(?:\.\d+)?[KMB]?)\s*followers?/i);
          if (followerMatch) {
            followerCount = this.parseFollowerCount(followerMatch[1]);
            console.log("[TweetReply] Follower count extracted from tweet article:", followerCount);
          }
        }
        if (followerCount === 0) {
          const bioElement = document.querySelector('[data-testid="UserDescription"]');
          if (bioElement) {
            const followerMatch = bioElement.textContent?.match(/(\d+(?:\.\d+)?[KMB]?)\s*followers?/i);
            if (followerMatch) {
              followerCount = this.parseFollowerCount(followerMatch[1]);
              console.log("[TweetReply] Follower count extracted from bio:", followerCount);
            }
          }
        }
        if (followerCount === 0) {
          const hoverCard = document.querySelector('[data-testid="HoverCard"]');
          if (hoverCard) {
            const followerMatch = hoverCard.textContent?.match(/(\d+(?:\.\d+)?[KMB]?)\s*followers?/i);
            if (followerMatch) {
              followerCount = this.parseFollowerCount(followerMatch[1]);
              console.log("[TweetReply] Follower count extracted from hover card:", followerCount);
            }
          }
        }
        console.log("[TweetReply] Author info extracted:", {
          username,
          display_name: displayName,
          posted_time: postedTime,
          verified: isVerified,
          follower_count: followerCount
        });
        return {
          username,
          verified: isVerified,
          follower_count: followerCount
          // Always returns a number
        };
      } catch (error) {
        console.error("[TweetReply] Failed to extract author info:", error);
        return {
          username: "unknown",
          verified: false,
          follower_count: 0
        };
      }
    }
    // ============================================================================
    // REPLY TRACKING & COUNT DISPLAY - Storage & Configuration Helpers
    // ============================================================================
    // Get tracking settings with defaults
    async getTrackingSettings() {
      try {
        const result = await chrome.storage.local.get(["replyTrackingSettings"]);
        const settings = result.replyTrackingSettings || {
          trackingPeriodDays: DEFAULTS.TRACKING_DAYS
        };
        return {
          trackingPeriodDays: Math.max(DEFAULTS.TRACKING_DAYS_MIN, Math.min(DEFAULTS.TRACKING_DAYS_MAX, parseInt(settings.trackingPeriodDays) || DEFAULTS.TRACKING_DAYS))
        };
      } catch (error) {
        console.warn("[TweetReply] Failed to get tracking settings:", error);
        return { trackingPeriodDays: DEFAULTS.TRACKING_DAYS };
      }
    }
    // Set tracking settings
    async setTrackingSettings(settings) {
      try {
        await chrome.storage.local.set({ replyTrackingSettings: settings });
      } catch (error) {
        console.error("[TweetReply] Failed to save tracking settings:", error);
      }
    }
    // Get reply history
    async getReplyHistory() {
      try {
        const result = await chrome.storage.local.get(["replyHistory"]);
        return result.replyHistory || {};
      } catch (error) {
        console.warn("[TweetReply] Failed to get reply history:", error);
        return {};
      }
    }
    // Track reply to a user
    async trackReply(username) {
      if (!username || username === "unknown") return;
      const lockKey = `tracking_${username}`;
      if (this[lockKey]) {
        return;
      }
      this[lockKey] = true;
      try {
        const history = await this.getReplyHistory();
        const settings = await this.getTrackingSettings();
        const now = Date.now();
        if (!history[username]) {
          history[username] = { replies: [] };
        }
        if (history[username].hidden !== void 0) {
          delete history[username].hidden;
        }
        if (history[username].hideUntil !== void 0) {
          delete history[username].hideUntil;
        }
        const recentReply = history[username].replies.find(
          (r) => Math.abs(r.timestamp - now) < 1e3
        );
        if (recentReply) {
          return;
        }
        history[username].replies.push({ timestamp: now });
        const cutoff = now - settings.trackingPeriodDays * AUTH.ONE_DAY_MS;
        history[username].replies = history[username].replies.filter(
          (r) => r.timestamp > cutoff
        );
        await chrome.storage.local.set({ replyHistory: history });
        await this.updateReplyCountsOnTweets();
      } catch (error) {
        console.error("[TweetReply] Error tracking reply:", error);
      } finally {
        delete this[lockKey];
      }
    }
    // Cleanup expired history
    async cleanupExpiredHistory() {
      const history = await this.getReplyHistory();
      const settings = await this.getTrackingSettings();
      const cutoff = Date.now() - settings.trackingPeriodDays * AUTH.ONE_DAY_MS;
      let hasChanges = false;
      for (const [username, data] of Object.entries(history)) {
        const originalCount = data.replies?.length || 0;
        data.replies = (data.replies || []).filter((r) => r.timestamp > cutoff);
        if (data.hidden !== void 0) {
          delete data.hidden;
          hasChanges = true;
        }
        if (data.hideUntil !== void 0) {
          delete data.hideUntil;
          hasChanges = true;
        }
        if (data.replies.length === 0) {
          delete history[username];
          hasChanges = true;
        } else if (data.replies.length !== originalCount) {
          hasChanges = true;
        }
      }
      if (hasChanges) {
        await chrome.storage.local.set({ replyHistory: history });
        await this.updateReplyCountsOnTweets();
      }
    }
    // ============================================================================
    // REPLY TRACKING & COUNT DISPLAY - Username Extraction from Tweet
    // ============================================================================
    // Extract username from specific tweet article
    async extractUsernameFromTweet(tweetArticle) {
      try {
        const authorElement = tweetArticle.querySelector('[data-testid="User-Name"]');
        if (!authorElement) return null;
        const fullText = authorElement.textContent?.trim() || "";
        let match = fullText.match(/^(.+?)@([^\u00B7·.\s]+)\s*[\u00B7·.]\s*(.+)$/);
        if (match) {
          return match[2].trim();
        }
        match = fullText.match(/^@([^\u00B7·.\s]+)\s*[\u00B7·.]\s*(.+)$/);
        if (match) {
          return match[1].trim();
        }
        const usernameMatch = fullText.match(/@([^\s\u00B7·.]+)/);
        if (usernameMatch) {
          return usernameMatch[1];
        }
        return null;
      } catch (error) {
        console.warn("[TweetReply] Failed to extract username from tweet:", error);
        return null;
      }
    }
    // Sync version for immediate checks
    extractUsernameFromTweetSync(tweetArticle) {
      try {
        const authorElement = tweetArticle.querySelector('[data-testid="User-Name"]');
        if (!authorElement) return null;
        const fullText = authorElement.textContent?.trim() || "";
        let match = fullText.match(/^(.+?)@([^\u00B7·.\s]+)\s*[\u00B7·.]\s*(.+)$/);
        if (match) {
          return match[2].trim();
        }
        match = fullText.match(/^@([^\u00B7·.\s]+)\s*[\u00B7·.]\s*(.+)$/);
        if (match) {
          return match[1].trim();
        }
        const usernameMatch = fullText.match(/@([^\s\u00B7·.]+)/);
        if (usernameMatch) {
          return usernameMatch[1];
        }
        return null;
      } catch (error) {
        return null;
      }
    }
    // ============================================================================
    // REPLY TRACKING & COUNT DISPLAY - Reply Count Display System
    // ============================================================================
    // Get reply count for a user within last N days
    async getReplyCountForUser(username, days) {
      if (!username || username === "unknown") return 0;
      try {
        const history = await this.getReplyHistory();
        const userData = history[username];
        if (!userData || !userData.replies || userData.replies.length === 0) {
          return 0;
        }
        const now = Date.now();
        const cutoff = now - days * AUTH.ONE_DAY_MS;
        const count = userData.replies.filter((r) => r.timestamp > cutoff).length;
        return count;
      } catch (error) {
        console.error("[TweetReply] Error getting reply count:", error);
        return 0;
      }
    }
    // Get color for reply count badge based on count (gradient from light to dark blue)
    getReplyCountColor(count) {
      if (count === 1) return "#60A5FA";
      if (count <= 3) return "#2563EB";
      if (count <= 5) return "#1E40AF";
      return "#1E3A8A";
    }
    // Show reply count on a tweet near username/author info
    async showReplyCountOnTweet(tweetArticle, username, count = null) {
      if (!tweetArticle || !username || username === "unknown") return;
      const existingIndicator = tweetArticle.querySelector(".tweetreply-reply-count");
      if (existingIndicator) {
        existingIndicator.remove();
      }
      if (count === null) {
        const settings = await this.getTrackingSettings();
        count = await this.getReplyCountForUser(username, settings.trackingPeriodDays);
      }
      if (count <= 0) return;
      const userNameElement = tweetArticle.querySelector('[data-testid="User-Name"]');
      if (!userNameElement || !userNameElement.isConnected) return;
      if (!tweetArticle.isConnected) {
        return;
      }
      const color = this.getReplyCountColor(count);
      const indicator = document.createElement("span");
      indicator.className = "tweetreply-reply-count";
      indicator.setAttribute("data-username", username);
      indicator.style.cssText = `
      margin-left: 6px;
      padding: 3px 10px;
      background: ${color};
      color: white;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      display: inline-block;
      transition: background-color 0.2s ease;
    `;
      indicator.textContent = `${count} ${count === 1 ? "reply" : "replies"}`;
      let inserted = false;
      try {
        const timeElement = userNameElement.querySelector("time") || tweetArticle.querySelector("time");
        if (timeElement && timeElement.isConnected) {
          const timeParent = timeElement.parentNode;
          if (!timeParent || !timeParent.isConnected) {
          } else {
            const nextSibling = timeElement.nextSibling;
            if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent.trim() === "") {
              if (nextSibling.nextSibling) {
                timeParent.insertBefore(indicator, nextSibling.nextSibling);
              } else {
                timeParent.appendChild(indicator);
              }
            } else {
              const spaceText = document.createTextNode(" ");
              if (nextSibling) {
                timeParent.insertBefore(spaceText, nextSibling);
                timeParent.insertBefore(indicator, nextSibling);
              } else {
                timeParent.appendChild(spaceText);
                timeParent.appendChild(indicator);
              }
            }
            inserted = true;
          }
        } else {
          const userNameText = userNameElement.textContent || "";
          const timeMatch = userNameText.match(/[\u00B7·.]\s*(\d+[hmsdw]?)\b/i);
          if (timeMatch) {
            const walker = document.createTreeWalker(
              userNameElement,
              NodeFilter.SHOW_TEXT,
              null
            );
            let textNode;
            while (textNode = walker.nextNode()) {
              if (textNode.textContent && textNode.textContent.includes(timeMatch[1])) {
                const textParent = textNode.parentElement || textNode.parentNode;
                if (textParent && textParent.isConnected) {
                  const parentContainer = textParent.parentNode;
                  if (parentContainer && parentContainer.isConnected) {
                    const nextSibling = textParent.nextSibling;
                    if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent.trim() === "") {
                      if (nextSibling.nextSibling) {
                        parentContainer.insertBefore(indicator, nextSibling.nextSibling);
                      } else {
                        parentContainer.appendChild(indicator);
                      }
                    } else {
                      const spaceText = document.createTextNode(" ");
                      if (nextSibling) {
                        parentContainer.insertBefore(spaceText, nextSibling);
                        parentContainer.insertBefore(indicator, nextSibling);
                      } else {
                        parentContainer.appendChild(spaceText);
                        parentContainer.appendChild(indicator);
                      }
                    }
                    inserted = true;
                    break;
                  }
                }
              }
            }
            if (!inserted && userNameElement.isConnected) {
              const container = userNameElement.parentElement || userNameElement.parentNode;
              if (container && container.isConnected) {
                const nextSibling = userNameElement.nextSibling;
                if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent.trim() === "") {
                  if (nextSibling.nextSibling) {
                    container.insertBefore(indicator, nextSibling.nextSibling);
                  } else {
                    container.appendChild(indicator);
                  }
                } else {
                  const spaceText = document.createTextNode(" ");
                  if (nextSibling) {
                    container.insertBefore(spaceText, nextSibling);
                    container.insertBefore(indicator, nextSibling);
                  } else {
                    container.appendChild(spaceText);
                    container.appendChild(indicator);
                  }
                }
                inserted = true;
              }
            }
          }
        }
        if (!inserted && userNameElement.isConnected) {
          const parent = userNameElement.parentNode;
          if (parent && parent.isConnected) {
            const nextSibling = userNameElement.nextSibling;
            if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent.trim() === "") {
              if (nextSibling.nextSibling) {
                parent.insertBefore(indicator, nextSibling.nextSibling);
              } else {
                parent.appendChild(indicator);
              }
            } else {
              const spaceText = document.createTextNode(" ");
              if (nextSibling) {
                parent.insertBefore(spaceText, nextSibling);
                parent.insertBefore(indicator, nextSibling);
              } else {
                parent.appendChild(spaceText);
                parent.appendChild(indicator);
              }
            }
            inserted = true;
          }
        }
      } catch (error) {
        try {
          if (!userNameElement.isConnected || !tweetArticle.isConnected) {
            return;
          }
          const parent = userNameElement.parentElement || userNameElement.parentNode;
          if (parent && parent.isConnected) {
            const lastChild = parent.lastChild;
            if (lastChild && lastChild.nodeType === Node.TEXT_NODE && lastChild.textContent.trim() === "") {
              parent.insertBefore(indicator, lastChild);
            } else {
              const spaceText = document.createTextNode(" ");
              parent.appendChild(spaceText);
              parent.appendChild(indicator);
            }
          } else {
            if (userNameElement.isConnected) {
              userNameElement.appendChild(indicator);
            }
          }
        } catch (e) {
          console.warn("[TweetReply] Could not insert reply count indicator:", e);
        }
      }
    }
    // Update reply counts on all visible tweets
    async updateReplyCountsOnTweets() {
      if (this.checkingTweets) {
        return;
      }
      this.checkingTweets = true;
      try {
        const settings = await this.getTrackingSettings();
        const tweets = document.querySelectorAll('article[data-testid="tweet"]');
        for (const tweet of tweets) {
          if (!tweet.isConnected) continue;
          const username = this.extractUsernameFromTweetSync(tweet);
          if (username && username !== "unknown") {
            const count = await this.getReplyCountForUser(username, settings.trackingPeriodDays);
            if (!tweet.isConnected) continue;
            if (count > 0) {
              await this.showReplyCountOnTweet(tweet, username, count);
            } else {
              const existingIndicator = tweet.querySelector(".tweetreply-reply-count");
              if (existingIndicator && existingIndicator.isConnected) {
                existingIndicator.remove();
              }
            }
          }
        }
      } catch (error) {
        console.error("[TweetReply] Error updating reply counts:", error);
      } finally {
        this.checkingTweets = false;
      }
    }
    // Setup reply count display system
    setupReplyCountDisplay() {
      if (this.countDisplayInitialized) return;
      this.countDisplayInitialized = true;
      this.updateReplyCountsOnTweets();
      if (this.trackingCleanupInterval) {
        clearInterval(this.trackingCleanupInterval);
      }
      this.trackingCleanupInterval = setInterval(() => {
        this.cleanupExpiredHistory();
        this.updateReplyCountsOnTweets();
      }, POLLING.TRACKING_CLEANUP_MS);
    }
    extractConversationContext() {
      try {
        const tweets = document.querySelectorAll('[data-testid="tweet"]');
        const parentTweets = [];
        for (let i = 0; i < Math.min(tweets.length, 4); i++) {
          const tweet = tweets[i];
          const tweetText = tweet.querySelector('[data-testid="tweetText"]');
          if (tweetText) {
            const text = tweetText.textContent?.trim();
            if (text && text.length > 10) {
              parentTweets.push(text);
            }
          }
        }
        return parentTweets.length > 0 ? parentTweets : null;
      } catch (error) {
        console.error("Failed to extract conversation context:", error);
        return null;
      }
    }
    /**
     * Extract comprehensive thread context including original tweet and full thread chain
     * Returns structured data about the conversation thread
     */
    extractThreadContext() {
      const DEBUG_THREAD_CONTEXT = false;
      try {
        if (DEBUG_THREAD_CONTEXT) {
          console.log("[TweetReply] \u{1F50D} ========== EXTRACTING THREAD CONTEXT ==========");
          console.log("[TweetReply] \u{1F50D} Starting thread context extraction...");
        }
        const currentTweetText = this.extractTweetText();
        if (DEBUG_THREAD_CONTEXT) console.log("[TweetReply] \u{1F50D} Current tweet text length:", currentTweetText?.length || 0);
        if (!currentTweetText) {
          console.warn("[TweetReply] \u26A0\uFE0F No current tweet found, returning standalone context");
          return {
            isReply: false,
            originalTweet: null,
            originalTweetAuthor: null,
            threadChain: [],
            currentTweetIndex: 0,
            threadLength: 0
          };
        }
        const isDetailPage = this.isTweetDetailPage();
        if (DIAGNOSE_THREAD_SELECTION) {
          const currentPath = window.location.pathname;
          const effectivePath = /\/compose\//.test(currentPath) ? this.lastNonComposePath : currentPath;
          const statusIdHere = this.getStatusIdFromDetailPageUrl();
          console.log("[TweetReply] DIAG extractThreadContext path:", currentPath, "| lastNonComposePath:", this.lastNonComposePath, "| effectivePath:", effectivePath);
          console.log("[TweetReply] DIAG statusId:", statusIdHere ?? "null");
          console.log("[TweetReply] DIAG currentTweetText preview:", (currentTweetText || "").substring(0, 80) + (currentTweetText && currentTweetText.length > 80 ? "..." : ""));
          console.log("[TweetReply] DIAG currentReplyTargetArticle set?", !!this.currentReplyTargetArticle);
        }
        if (!isDetailPage) {
          if (DEBUG_THREAD_CONTEXT) console.log("[TweetReply] Not on detail page, using single-tweet context only");
          const authorInfo = this.extractAuthorInfo();
          return {
            isReply: true,
            originalTweet: currentTweetText,
            originalTweetAuthor: authorInfo?.username || "unknown",
            threadChain: [{
              text: currentTweetText,
              author: authorInfo?.username || "unknown",
              isOriginal: true,
              isCurrent: true
            }],
            currentTweetIndex: 0,
            threadLength: 1
          };
        }
        const isReply = this.detectReplyContext();
        if (DEBUG_THREAD_CONTEXT) console.log("[TweetReply] Reply context detected:", isReply);
        if (!isReply) {
          return {
            isReply: false,
            originalTweet: null,
            originalTweetAuthor: null,
            threadChain: [{
              text: currentTweetText,
              author: this.extractAuthorInfo()?.username || "unknown",
              isOriginal: true,
              isCurrent: true
            }],
            currentTweetIndex: 0,
            threadLength: 1
          };
        }
        const threadContainer = this.findThreadContainer();
        if (DIAGNOSE_THREAD_SELECTION) {
          if (!threadContainer) {
            console.log("[TweetReply] DIAG findThreadContainer: null");
          } else {
            const articles = threadContainer.querySelectorAll('article[data-testid="tweet"]');
            const desc = threadContainer.tagName.toLowerCase() + (threadContainer.className ? "." + (typeof threadContainer.className === "string" ? threadContainer.className.split(/\s+/)[0] : "") : "") + (threadContainer.getAttribute?.("data-testid") ? '[data-testid="' + threadContainer.getAttribute("data-testid") + '"]' : "");
            console.log("[TweetReply] DIAG findThreadContainer: element=", desc, "| tweet count=", articles.length);
            if (articles.length >= 1) {
              const firstAuthor = (articles[0].querySelector('[data-testid="User-Name"]')?.textContent || "").match(/@([A-Za-z0-9_]+)/);
              const lastAuthor = articles.length > 1 ? (articles[articles.length - 1].querySelector('[data-testid="User-Name"]')?.textContent || "").match(/@([A-Za-z0-9_]+)/) : null;
              console.log("[TweetReply] DIAG container first author:", firstAuthor ? "@" + firstAuthor[1] : "unknown", "| last author:", lastAuthor ? "@" + lastAuthor[1] : "n/a");
            }
          }
        }
        if (!threadContainer) {
          console.log("[TweetReply] \u26A0\uFE0F Thread container not found, using current tweet only");
          return {
            isReply: true,
            originalTweet: null,
            originalTweetAuthor: null,
            threadChain: [{
              text: currentTweetText,
              author: this.extractAuthorInfo()?.username || "unknown",
              isOriginal: false,
              isCurrent: true
            }],
            currentTweetIndex: 0,
            threadLength: 1
          };
        }
        const threadTweets = this.extractTweetsFromContainer(threadContainer);
        if (DEBUG_THREAD_CONTEXT) console.log("[TweetReply] Found", threadTweets.length, "tweets in thread");
        if (DIAGNOSE_THREAD_SELECTION && threadTweets.length > 0) {
          threadTweets.forEach((t, i) => {
            const preview = (t.text || "").substring(0, 50) + (t.text && t.text.length > 50 ? "..." : "");
            console.log("[TweetReply] DIAG threadTweets[" + i + "]: author=@" + (t.author || "unknown") + " statusId=" + (t.statusId ?? "null") + ' text="' + preview + '"');
          });
        }
        if (threadTweets.length === 0) {
          return {
            isReply: true,
            originalTweet: null,
            originalTweetAuthor: null,
            threadChain: [{
              text: currentTweetText,
              author: this.extractAuthorInfo()?.username || "unknown",
              isOriginal: false,
              isCurrent: true
            }],
            currentTweetIndex: 0,
            threadLength: 1
          };
        }
        const statusId = this.getStatusIdFromDetailPageUrl();
        let originalTweet = null;
        let tierUsed = null;
        if (statusId) {
          if (this._originalTweetCache && this._originalTweetCache.statusId !== statusId) {
            this._originalTweetCache = null;
          }
          const urlOriginalArticle = this.findOriginalTweetArticleByStatusId(statusId);
          if (urlOriginalArticle) {
            const domOriginal = this.extractTextAndAuthorFromArticle(urlOriginalArticle);
            if (domOriginal) {
              originalTweet = domOriginal;
              tierUsed = "Tier 1 DOM";
              this._originalTweetCache = { statusId, text: domOriginal.text, author: domOriginal.author, fromDom: true };
            }
          }
          if (!originalTweet && this._originalTweetCache?.statusId === statusId && this._originalTweetCache.fromDom) {
            originalTweet = { text: this._originalTweetCache.text, author: this._originalTweetCache.author };
            tierUsed = "Tier 1b cache";
          }
          if (!originalTweet) {
            const byId = threadTweets.find((t) => t.statusId === statusId);
            if (byId) {
              originalTweet = { text: byId.text, author: byId.author };
              tierUsed = "Tier 2 threadList";
              this._originalTweetCache = { statusId, text: byId.text, author: byId.author, fromDom: true };
            }
          }
          if (!originalTweet) {
            const meta = this.getOriginalTweetFromPageMeta();
            if (meta?.statusId === statusId) {
              originalTweet = { text: meta.text, author: meta.author };
              tierUsed = "Tier 3 meta";
              if (!this._originalTweetCache) {
                this._originalTweetCache = { statusId, text: meta.text, author: meta.author, fromDom: false };
              }
            }
          }
          if (!originalTweet) {
            const pathMatch = (/\/compose\//.test(window.location.pathname) ? this.lastNonComposePath : window.location.pathname).match(/^\/([A-Za-z0-9_]+)\/status\/\d+/);
            originalTweet = { text: null, author: pathMatch ? pathMatch[1] : "unknown" };
            tierUsed = "lastResort";
          }
        } else {
          originalTweet = threadTweets[0] || { text: null, author: "unknown" };
          tierUsed = "threadTweets[0]";
        }
        let originalWasOverridden = false;
        if (originalTweet?.text && currentTweetText && originalTweet.text.trim() === currentTweetText.trim()) {
          const ancestor = threadTweets.find(
            (t) => t.text && t.text.trim() !== currentTweetText.trim()
          );
          if (ancestor) {
            originalTweet = { text: ancestor.text, author: ancestor.author };
            originalWasOverridden = true;
          }
        }
        if (DIAGNOSE_THREAD_SELECTION && tierUsed) {
          const otPreview = (originalTweet?.text || "").substring(0, 60) + (originalTweet?.text && originalTweet.text.length > 60 ? "..." : "");
          console.log("[TweetReply] DIAG originalTweet from:", tierUsed, "| author=@" + (originalTweet?.author || "unknown"), '| text="' + otPreview + '"');
          if (originalWasOverridden) {
            console.log("[TweetReply] DIAG same-tweet override: new author=@" + (originalTweet?.author || "unknown"), '| text="' + otPreview + '"');
          }
        }
        let currentTweetIndex = this.findCurrentTweetIndex(threadTweets, currentTweetText);
        if (currentTweetIndex < 0) {
          currentTweetIndex = threadTweets.length - 1;
          console.warn("[TweetReply] \u26A0\uFE0F Current tweet not found in thread, defaulting to last tweet");
        }
        if (DIAGNOSE_THREAD_SELECTION) {
          const ct = threadTweets[currentTweetIndex];
          const ctPreview = ct ? (ct.text || "").substring(0, 50) + (ct.text && ct.text.length > 50 ? "..." : "") : "n/a";
          console.log("[TweetReply] DIAG currentTweetIndex:", currentTweetIndex, "| author=", ct ? "@" + (ct.author || "unknown") : "n/a", '| text="' + ctPreview + '"');
        }
        const threadChain = threadTweets.map((tweet, index) => ({
          text: tweet.text,
          author: tweet.author || "unknown",
          isOriginal: !originalWasOverridden && statusId && tweet.statusId === statusId || !!originalTweet.text && tweet.text === originalTweet.text && (tweet.author || "unknown") === (originalTweet.author || "unknown"),
          isCurrent: index === currentTweetIndex
        }));
        let limitedChain = threadChain;
        let totalChars = threadChain.reduce((sum, t) => sum + t.text.length, 0);
        if (threadChain.length > VALIDATION.MAX_THREAD_CHAIN || totalChars > VALIDATION.MAX_THREAD_CHARS) {
          let originalIndex = !originalWasOverridden && statusId ? threadTweets.findIndex((t) => t.statusId === statusId) : -1;
          if (originalIndex < 0 && originalTweet.text) {
            originalIndex = threadTweets.findIndex((t) => t.text === originalTweet.text && (t.author || "unknown") === (originalTweet.author || "unknown"));
          }
          const keepIndices = /* @__PURE__ */ new Set([...originalIndex >= 0 ? [originalIndex] : [], currentTweetIndex]);
          const recentIndices = [];
          for (let i = Math.max(1, threadChain.length - 2); i < threadChain.length; i++) {
            if (i !== currentTweetIndex) recentIndices.push(i);
          }
          recentIndices.slice(0, 2).forEach((idx) => keepIndices.add(idx));
          limitedChain = threadChain.filter((_, idx) => keepIndices.has(idx));
        }
        let recalculatedCurrentIndex = limitedChain.findIndex((tweet) => tweet.isCurrent);
        if (recalculatedCurrentIndex < 0) {
          const currentTextPrefix = currentTweetText.substring(0, 50).toLowerCase();
          recalculatedCurrentIndex = limitedChain.findIndex(
            (tweet) => tweet.text === currentTweetText || tweet.text.substring(0, 50).toLowerCase() === currentTextPrefix
          );
        }
        if (recalculatedCurrentIndex < 0) {
          recalculatedCurrentIndex = limitedChain.length - 1;
          console.warn("[TweetReply] \u26A0\uFE0F Could not find current tweet in limited chain, using last tweet");
        }
        const result = {
          isReply: true,
          originalTweet: originalTweet.text || null,
          originalTweetAuthor: originalTweet.author || null,
          threadChain: limitedChain,
          currentTweetIndex: recalculatedCurrentIndex,
          // FIX: Use recalculated index
          threadLength: limitedChain.length
        };
        if (DIAGNOSE_THREAD_SELECTION) {
          const origPreview = (result.originalTweet || "").substring(0, 80) + (result.originalTweet && result.originalTweet.length > 80 ? "..." : "");
          console.log("[TweetReply] DIAG final chain: originalTweetAuthor=@" + (result.originalTweetAuthor || "none") + ' | originalTweet="' + origPreview + '" | currentTweetIndex=' + result.currentTweetIndex + " | threadLength=" + result.threadLength);
          result.threadChain.forEach((t, i) => {
            const preview = (t.text || "").substring(0, 50) + (t.text && t.text.length > 50 ? "..." : "");
            console.log("[TweetReply] DIAG final chain[" + i + "]: author=@" + (t.author || "unknown") + " isOriginal=" + t.isOriginal + " isCurrent=" + t.isCurrent + ' text="' + preview + '"');
          });
        }
        if (DEBUG_THREAD_CONTEXT) {
          console.log("[TweetReply] \u2705 Thread context extracted:", {
            isReply: result.isReply,
            originalTweetLength: result.originalTweet?.length || 0,
            threadLength: result.threadLength,
            currentIndex: result.currentTweetIndex
          });
          if (result.isReply && result.originalTweet) {
            console.log("[TweetReply] \u{1F4CB} ORIGINAL TWEET & THREAD CHAIN:");
            console.log("[TweetReply] \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510");
            console.log("[TweetReply] \u2502 ORIGINAL TWEET:", result.originalTweetAuthor ? `@${result.originalTweetAuthor}` : "unknown author");
            console.log("[TweetReply] \u2502", result.originalTweet);
            console.log("[TweetReply] \u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524");
            console.log("[TweetReply] \u2502 FULL THREAD CHAIN (" + result.threadLength + " tweets):");
            result.threadChain.forEach((tweet, idx) => {
              const marker = tweet.isOriginal ? "\u{1F535} ORIGINAL" : tweet.isCurrent ? "\u{1F7E2} CURRENT (replying to)" : `\u26AA Reply ${idx}`;
              const author = tweet.author !== "unknown" ? `@${tweet.author}` : "unknown";
              console.log("[TweetReply] \u2502 [" + marker + "] " + author + ":");
              console.log('[TweetReply] \u2502   "' + tweet.text.substring(0, 100) + (tweet.text.length > 100 ? "..." : "") + '"');
            });
            console.log("[TweetReply] \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518");
          }
        }
        return result;
      } catch (error) {
        console.error("[TweetReply] \u274C Failed to extract thread context:", error);
        const currentTweetText = this.extractTweetText();
        return {
          isReply: false,
          originalTweet: null,
          originalTweetAuthor: null,
          threadChain: currentTweetText ? [{
            text: currentTweetText,
            author: this.extractAuthorInfo()?.username || "unknown",
            isOriginal: true,
            isCurrent: true
          }] : [],
          currentTweetIndex: 0,
          threadLength: currentTweetText ? 1 : 0
        };
      }
    }
    /**
     * Detect if we're in a reply context by looking for reply indicators
     */
    detectReplyContext() {
      try {
        const composerContainer = document.querySelector('[data-testid^="tweetTextarea_"]')?.closest('div[role="dialog"], div[data-testid="cellInnerDiv"]') || document;
        const replyIndicators = composerContainer.querySelectorAll('span[dir="ltr"], span[dir="auto"]');
        for (const span of replyIndicators) {
          const text = span.textContent?.trim() || "";
          if (/^replying to @/i.test(text)) {
            return true;
          }
        }
        const composers = document.querySelectorAll('[data-testid^="tweetTextarea_"], [contenteditable="true"]');
        for (const composer of composers) {
          let parent = composer.parentElement;
          for (let i = 0; i < 10 && parent; i++) {
            if (parent.querySelector('[data-testid="reply"], [aria-label*="reply" i]')) {
              return true;
            }
            if (parent.textContent && /replying to/i.test(parent.textContent)) {
              return true;
            }
            parent = parent.parentElement;
          }
        }
        const threadContainer = this.findThreadContainer();
        if (threadContainer) {
          const tweets = threadContainer.querySelectorAll('article[data-testid="tweet"]');
          return tweets.length > 1;
        }
        return false;
      } catch (error) {
        console.warn("[TweetReply] Error detecting reply context:", error);
        return false;
      }
    }
    /**
     * Find the thread container that holds multiple tweets
     */
    findThreadContainer() {
      try {
        const allTweets = document.querySelectorAll('article[data-testid="tweet"]');
        if (allTweets.length < 2) {
          return null;
        }
        let commonAncestor = allTweets[0].parentElement;
        for (let i = 0; i < 10 && commonAncestor; i++) {
          const tweetsInContainer = commonAncestor.querySelectorAll('article[data-testid="tweet"]');
          if (tweetsInContainer.length >= 2) {
            return commonAncestor;
          }
          commonAncestor = commonAncestor.parentElement;
        }
        const threadSelectors = [
          'div[data-testid="cellInnerDiv"]',
          'section[role="region"]',
          'div[role="article"]'
        ];
        for (const selector of threadSelectors) {
          const containers = document.querySelectorAll(selector);
          for (const container of containers) {
            const tweets = container.querySelectorAll('article[data-testid="tweet"]');
            if (tweets.length >= 2) {
              return container;
            }
          }
        }
        const threadIndicators = document.querySelectorAll("span, div");
        for (const indicator of threadIndicators) {
          const text = indicator.textContent?.trim() || "";
          if (/show.*thread|view.*thread/i.test(text)) {
            let container = indicator.parentElement;
            for (let i = 0; i < 5 && container; i++) {
              const tweets = container.querySelectorAll('article[data-testid="tweet"]');
              if (tweets.length >= 2) {
                return container;
              }
              container = container.parentElement;
            }
          }
        }
        return null;
      } catch (error) {
        console.warn("[TweetReply] Error finding thread container:", error);
        return null;
      }
    }
    /**
     * Extract all tweets from a thread container
     */
    extractTweetsFromContainer(container) {
      try {
        const tweets = container.querySelectorAll('article[data-testid="tweet"]');
        const extractedTweets = [];
        for (const tweet of tweets) {
          const tweetTextEl = tweet.querySelector('[data-testid="tweetText"]');
          if (!tweetTextEl) continue;
          const text = tweetTextEl.textContent?.trim();
          if (!text || text.length < 10) continue;
          let author = "unknown";
          const userNameEl = tweet.querySelector('[data-testid="User-Name"]');
          if (userNameEl) {
            const fullText = userNameEl.textContent?.trim() || "";
            const handleMatch = fullText.match(/@([A-Za-z0-9_]+)/);
            if (handleMatch) {
              author = handleMatch[1];
            }
          }
          if (author === "unknown" && userNameEl) {
            const profileLink = userNameEl.querySelector("a[href]");
            if (profileLink) {
              const href = profileLink.getAttribute("href") || "";
              const hrefMatch = href.match(/^\/([A-Za-z0-9_]+)$/);
              if (hrefMatch) {
                author = hrefMatch[1];
              }
            }
          }
          if (author === "unknown") {
            const links = tweet.querySelectorAll("a[href]");
            const reservedPaths = /* @__PURE__ */ new Set(["status", "search", "intent", "i", "home", "hashtag", "compose", "settings", "explore", "notifications", "messages"]);
            for (const link of links) {
              const href = link.getAttribute("href") || "";
              const hrefMatch = href.match(/^\/([A-Za-z0-9_]+)$/);
              if (hrefMatch && !reservedPaths.has(hrefMatch[1].toLowerCase())) {
                author = hrefMatch[1];
                break;
              }
            }
          }
          extractedTweets.push({ text, author, statusId: this.getOwnStatusIdFromArticle(tweet) });
        }
        return extractedTweets;
      } catch (error) {
        console.warn("[TweetReply] Error extracting tweets from container:", error);
        return [];
      }
    }
    /**
     * Find the index of the current tweet in the thread chain
     * @param {Array} threadTweets - Array of tweet objects with text property
     * @param {string} currentTweetText - The text of the tweet being replied to
     * @returns {number} Index of current tweet, or -1 if not found (caller should handle fallback)
     * 
     * FIX: Returns -1 when not found instead of defaulting to last tweet.
     * This allows caller to implement appropriate fallback logic based on context.
     */
    findCurrentTweetIndex(threadTweets, currentTweetText) {
      if (!currentTweetText || !threadTweets || threadTweets.length === 0) return -1;
      for (let i = 0; i < threadTweets.length; i++) {
        if (threadTweets[i].text === currentTweetText) {
          return i;
        }
      }
      const currentPrefix = currentTweetText.substring(0, 50).toLowerCase();
      for (let i = 0; i < threadTweets.length; i++) {
        const tweetPrefix = threadTweets[i].text.substring(0, 50).toLowerCase();
        if (tweetPrefix === currentPrefix) {
          return i;
        }
      }
      return -1;
    }
    extractTweetMetadata() {
      try {
        const hasMedia = !!document.querySelector('[data-testid="tweetPhoto"], [data-testid="videoPlayer"]');
        const hasPoll = !!document.querySelector('[data-testid="poll"]');
        const timeElement = document.querySelector("time");
        const timestamp = timeElement ? timeElement.getAttribute("datetime") : null;
        return {
          has_media: hasMedia,
          has_poll: hasPoll,
          timestamp
        };
      } catch (error) {
        console.error("Failed to extract tweet metadata:", error);
        return null;
      }
    }
    // Enhanced text insertion method based on inject.js proven approach
    // Handles multiple Twitter input types with comprehensive fallbacks
    async insertReplyIntoComposer(composer, replyData) {
      try {
        console.log("[TweetReply] \u{1F680} Starting Twitter text insertion method");
        if (!composer || !replyData) {
          console.log("[TweetReply] \u274C Invalid parameters");
          return;
        }
        const replyText = typeof replyData === "string" ? replyData : replyData.reply;
        const qualityScore = typeof replyData === "object" ? replyData.qualityScore : null;
        if (!replyText) {
          return;
        }
        const cleanText = this.stripReplyPrefix(replyText.replace(/<[^>]*>/g, ""));
        if (composer.contentEditable === "true" || composer.getAttribute("data-testid")?.startsWith("tweetTextarea_") || composer.getAttribute("role") === "textbox") {
          try {
            const toolbar = document.querySelector('[data-testid="toolBar"]');
            if (toolbar) {
              const textArea = this.findTwitterTextArea(toolbar);
              if (textArea) {
                await this.insertTextTwitterMethod(textArea, toolbar, cleanText);
                return;
              }
            }
          } catch (error) {
            console.warn("[TweetReply] Twitter method failed:", error);
          }
        }
        if (composer.classList && composer.classList.contains("ql-editor")) {
          try {
            composer.innerHTML = "";
            cleanText.split("\n").forEach((line) => {
              if (line.trim()) {
                const p = document.createElement("p");
                p.textContent = line;
                composer.appendChild(p);
              } else {
                const p = document.createElement("p");
                p.innerHTML = "<br>";
                composer.appendChild(p);
              }
            });
            if (composer.childNodes.length === 0) {
              const p = document.createElement("p");
              p.innerHTML = "<br>";
              composer.appendChild(p);
            }
            composer.dispatchEvent(new Event("input", { bubbles: true }));
            return;
          } catch (error) {
            console.warn("[TweetReply] Quill editor method failed:", error);
          }
        }
        if (composer.getAttribute("data-testid") === "dmComposerTextInput" || composer.classList.contains("public-DraftEditor-content") || composer.classList.contains("DraftEditor-editorContainer")) {
          try {
            document.execCommand("insertText", false, cleanText);
            return;
          } catch (error) {
            console.warn("[TweetReply] execCommand failed:", error);
          }
          try {
            const contentDiv = composer.querySelector('[data-contents="true"]');
            if (contentDiv) {
              const blocks = contentDiv.querySelectorAll('[data-block="true"]');
              if (blocks.length > 0) {
                const textBlock = blocks[0].querySelector(".public-DraftStyleDefault-block");
                if (textBlock) {
                  textBlock.textContent = cleanText;
                  composer.dispatchEvent(new InputEvent("input", {
                    bubbles: true,
                    cancelable: true
                  }));
                  return;
                }
              }
            }
          } catch (error) {
            console.warn("[TweetReply] Draft.js DOM manipulation failed:", error);
          }
          try {
            composer.dispatchEvent(new InputEvent("beforeinput", {
              inputType: "insertText",
              data: cleanText,
              bubbles: true,
              cancelable: true
            }));
            composer.dispatchEvent(new InputEvent("input", {
              bubbles: true,
              cancelable: true
            }));
            return;
          } catch (error) {
            console.warn("[TweetReply] Draft.js input events failed:", error);
          }
        }
        if (composer.tagName === "TEXTAREA") {
          composer.value = cleanText;
          composer.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
        if (composer.contentEditable === "true") {
          const dataTextSpan = composer.querySelector('[data-text="true"]');
          const targetElement = dataTextSpan ? dataTextSpan.parentElement : composer;
          composer.click();
          await this.sleep(20);
          const span = document.createElement("span");
          span.dataset.text = "true";
          span.textContent = cleanText;
          if (typeof targetElement.replaceChildren === "function") {
            targetElement.replaceChildren(span);
          } else {
            while (targetElement.firstChild) {
              targetElement.removeChild(targetElement.firstChild);
            }
            targetElement.appendChild(span);
          }
          targetElement.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            cancelable: true
          }));
          return;
        }
        const nestedInput = composer.querySelector('textarea, [contenteditable="true"]');
        if (nestedInput) {
          await this.insertReplyIntoComposer(nestedInput, replyData);
          return;
        }
        if (composer.value !== void 0) {
          composer.value = cleanText;
          composer.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (composer.textContent !== void 0) {
          composer.textContent = cleanText;
          composer.dispatchEvent(new Event("input", { bubbles: true }));
        }
        composer.focus();
        if (typeof qualityScore === "number") {
          this.showQualityBadge(composer, qualityScore);
        }
      } catch (error) {
        console.error("[TweetReply] \u274C Error during text insertion:", error);
      }
    }
    showQualityBadge(composer, score) {
      try {
        const numericScore = typeof score === "number" ? score : Number(score);
        if (Number.isNaN(numericScore)) {
          return;
        }
        if (!composer || !composer.parentElement) {
          console.warn("[TweetReply] Cannot show quality badge: composer or parent not found");
          return;
        }
        const existingBadge = composer.parentElement.querySelector(".tweetreply-quality-badge");
        if (existingBadge) {
          existingBadge.remove();
        }
        const badge = document.createElement("div");
        badge.className = "tweetreply-quality-badge";
        const label = document.createElement("span");
        label.className = "quality-label";
        label.textContent = "Quality:";
        const scoreEl = document.createElement("span");
        scoreEl.className = `quality-score quality-${this.getQualityClass(numericScore)}`;
        scoreEl.textContent = String(numericScore);
        badge.appendChild(label);
        badge.appendChild(scoreEl);
        const parent = composer.parentElement;
        if (parent) {
          parent.insertBefore(badge, composer.nextSibling);
        }
      } catch (error) {
        console.error("[TweetReply] Error showing quality badge:", error);
      }
    }
    getQualityClass(score) {
      if (score >= 80) return "high";
      if (score >= 60) return "medium";
      return "low";
    }
    updateAllButtonStates() {
      document.querySelectorAll(".tweetreply-suggest-btn, .tweetreply-improve-btn").forEach((button) => {
        this.updateButtonState(button);
      });
    }
    showMessage(composer, message, type = "info") {
      const existingMessage = composer.parentElement?.querySelector(".tweetreply-message");
      if (existingMessage) {
        existingMessage.remove();
      }
      const messageEl = document.createElement("div");
      messageEl.className = `tweetreply-message tweetreply-message--${type}`;
      messageEl.textContent = message;
      const parent = composer.parentElement;
      if (parent) {
        parent.insertBefore(messageEl, composer.nextSibling);
      }
      setTimeout(() => {
        messageEl?.remove();
      }, 3e3);
    }
    formatTimeDistance(date) {
      const now = /* @__PURE__ */ new Date();
      const diffMs = date.getTime() - now.getTime();
      if (diffMs <= 0) return "soon";
      const hours = Math.floor(diffMs / (1e3 * 60 * 60));
      const minutes = Math.floor(diffMs % (1e3 * 60 * 60) / (1e3 * 60));
      if (hours > 0) {
        return `in ${hours}h`;
      } else {
        return `in ${minutes}m`;
      }
    }
    // ============================================================================
    // CLEANUP & DESTRUCTION
    // ============================================================================
    destroy() {
      if (this.mainObserver) {
        this.mainObserver.disconnect();
        this.mainObserver = null;
      }
      if (this.countUpdateTimeout) {
        clearTimeout(this.countUpdateTimeout);
        this.countUpdateTimeout = null;
      }
      if (this.autoLikeClickHandler) {
        document.removeEventListener("click", this.autoLikeClickHandler, true);
        this.autoLikeClickHandler = null;
      }
      if (this.usageDataInterval) {
        clearInterval(this.usageDataInterval);
        this.usageDataInterval = null;
      }
      if (this.trackingCleanupInterval) {
        clearInterval(this.trackingCleanupInterval);
        this.trackingCleanupInterval = null;
      }
      if (this.urlTrackingInterval) {
        clearInterval(this.urlTrackingInterval);
        this.urlTrackingInterval = null;
      }
      if (this.mainObserverDebounceTimer) {
        clearTimeout(this.mainObserverDebounceTimer);
        this.mainObserverDebounceTimer = null;
      }
      if (this.followStatusMessageHandler) {
        window.removeEventListener("message", this.followStatusMessageHandler);
        this.followStatusMessageHandler = null;
      }
      if (this.followBadgeRefreshTimer) {
        clearTimeout(this.followBadgeRefreshTimer);
        this.followBadgeRefreshTimer = null;
      }
      if (this.beforeUnloadHandler) {
        window.removeEventListener("beforeunload", this.beforeUnloadHandler);
        this.beforeUnloadHandler = null;
      }
      if (this.storageChangeHandler) {
        chrome.storage.onChanged.removeListener(this.storageChangeHandler);
        this.storageChangeHandler = null;
      }
      this.countDisplayInitialized = false;
      delete window.__tweetReplyInjector;
    }
  };
  if (!window.__tweetReplyInjector) {
    new TwitterReplyInjector();
  }
})();
