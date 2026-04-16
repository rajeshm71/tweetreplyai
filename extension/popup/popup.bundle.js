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
  var DEFAULTS = {
    ANALYTICS_DAYS: 30,
    TRACKING_DAYS: 7,
    TRACKING_DAYS_MIN: 1,
    TRACKING_DAYS_MAX: 30,
    REPLY_HISTORY_LIMIT: 50,
    TELEMETRY_MAX_BUFFER: 100,
    TELEMETRY_DEDUPE_WINDOW_MS: 1e4,
    SNIPPET_LIBRARY_LIMIT: 20,
    SNIPPET_MAX_LENGTH: 500
  };
  var AUTH = {
    TOKEN_EXPIRY_MS: 7 * 24 * 60 * 60 * 1e3,
    ONE_DAY_MS: 24 * 60 * 60 * 1e3
  };
  var STORAGE = {
    RELATIONSHIP_HINTS_ENABLED: "relationshipHintsEnabled",
    FOLLOW_BADGE_ICON_STYLE: "followBadgeIconStyle"
  };
  var FOLLOW_BADGE_ICON_STYLE = {
    TEXT: "text",
    EMOJI: "emoji",
    ICON_ONLY: "icon_only"
  };
  var FOLLOW_BADGE_ICON_STYLE_DEFAULT = FOLLOW_BADGE_ICON_STYLE.TEXT;
  var FOLLOW_BADGE_ICON_STYLE_VALUES = [
    FOLLOW_BADGE_ICON_STYLE.TEXT,
    FOLLOW_BADGE_ICON_STYLE.EMOJI,
    FOLLOW_BADGE_ICON_STYLE.ICON_ONLY
  ];
  var CTA_STORAGE = {
    TEXT: "tweetreply_cta_text",
    AUTO_APPEND: "tweetreply_cta_auto_append"
  };
  var SNIPPET_STORAGE = {
    LIBRARY: "tweetreply_snippet_library",
    DEFAULT_ID: "tweetreply_snippet_default_id",
    AUTO_APPEND_ID: "tweetreply_snippet_auto_append_id",
    MIGRATED: "tweetreply_snippet_migrated_v1"
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
    /**
     * Reuse / Reframe an existing X tweet. Calls POST /api/reframe-tweet.
     * Only `source_tweet` and `degree` are required; the rest are best-effort hints.
     */
    async reframeTweet({
      source_tweet,
      degree,
      source_author,
      source_tweet_url,
      prompt_variation,
      model_key,
      allow_long
    }) {
      return this.makeRequest("/api/reframe-tweet", {
        method: "POST",
        body: {
          source_tweet,
          degree,
          source_author,
          source_tweet_url,
          prompt_variation,
          model_key,
          allow_long
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

  // extension/utils/telemetry.js
  var ALLOWED_EVENT_TYPES = /* @__PURE__ */ new Set([
    "auth_sync_failed",
    "api_request_failed",
    "api_timeout",
    "rate_limited",
    "credits_exhausted",
    "composer_injection_failed",
    "reply_insert_failed",
    "storage_read_failed",
    "storage_write_failed",
    "unknown_runtime_error",
    // Reuse / Reframe tweet feature
    "reuse_open",
    "reuse_generate_success",
    "reuse_generate_error",
    "reuse_post_to_compose",
    "reuse_post_to_compose_timeout"
  ]);
  var ALLOWED_SURFACES = /* @__PURE__ */ new Set(["content", "popup", "background"]);
  var dedupeMap = /* @__PURE__ */ new Map();
  function toSafeString(value, max = 200) {
    if (value === null || value === void 0) return "";
    const v = String(value);
    return v.length > max ? `${v.slice(0, max)}...` : v;
  }
  function normalizeTelemetryEvent(raw = {}) {
    const eventType = ALLOWED_EVENT_TYPES.has(raw.event_type) ? raw.event_type : "unknown_runtime_error";
    const surface = ALLOWED_SURFACES.has(raw.surface) ? raw.surface : "background";
    const extensionVersion = chrome.runtime?.getManifest?.()?.version || "unknown";
    return {
      event_type: eventType,
      timestamp: raw.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
      extension_version: extensionVersion,
      surface,
      route: toSafeString(raw.route, 120),
      http_status: Number.isFinite(Number(raw.http_status)) ? Number(raw.http_status) : null,
      error_code: toSafeString(raw.error_code, 120),
      context: {
        model_key: toSafeString(raw?.context?.model_key, 80),
        reply_mode: toSafeString(raw?.context?.reply_mode, 80),
        prompt_key: toSafeString(raw?.context?.prompt_key, 80),
        action: toSafeString(raw?.context?.action, 80),
        note: toSafeString(raw?.context?.note, 160)
      }
    };
  }
  function shouldDedupeEvent(event) {
    const key = [
      event.event_type,
      event.surface,
      event.route || "",
      event.http_status || "",
      event.error_code || ""
    ].join("|");
    const now = Date.now();
    const prev = dedupeMap.get(key);
    if (prev && now - prev < DEFAULTS.TELEMETRY_DEDUPE_WINDOW_MS) return true;
    dedupeMap.set(key, now);
    return false;
  }
  function emitTelemetry(rawEvent) {
    try {
      const event = normalizeTelemetryEvent(rawEvent);
      if (shouldDedupeEvent(event)) return;
      chrome.runtime.sendMessage({ action: "telemetryEvent", event }).catch?.(() => {
      });
    } catch {
    }
  }

  // extension/popup/popup.js
  var SETTINGS_TAB_IDS = ["account", "x", "cta", "billing", "tracking"];
  var SETTINGS_ACTIVE_TAB_KEY = "settingsActiveTab";
  var SNIPPET_FORM_AUTOSAVE_MS = 550;
  var TRACKING_DAYS_AUTOSAVE_MS = 350;
  globalThis.__tweetreplyaiExtLoggingAllowed = false;
  installConsoleGate(() => globalThis.__tweetreplyaiExtLoggingAllowed === true);
  var PopupManager = class {
    constructor() {
      this.authManager = new AuthManager();
      this.apiClient = new ApiClient();
      this.currentState = "loading";
      this.usageData = null;
      this.qualityMetrics = null;
      this.usageDataInterval = null;
      this.qualityMetricsInterval = null;
      this.analyticsRefreshInterval = null;
      this.focusHandler = null;
      this.visibilityHandler = null;
      this.beforeunloadHandler = null;
      this.initializeElements();
      this.checkoutInProgress = false;
      this.attachEventListeners();
      this.setupAuthListener();
      this.setupDataRefresh();
      this.initialize();
    }
    setupAuthListener() {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "authUpdated") {
          this.initialize();
        }
      });
    }
    setupDataRefresh() {
      this.startUsageDataRefresh();
      this.startQualityMetricsRefresh();
      this.setupFocusRefresh();
      this.setupUsageUpdateListener();
      this.setupCleanup();
    }
    startUsageDataRefresh() {
      if (this.usageDataInterval) {
        clearInterval(this.usageDataInterval);
      }
      this.usageDataInterval = setInterval(async () => {
        if (this.currentState === "authenticated") {
          try {
            await this.loadUsageData();
            this.updateUsageDisplay();
            this.updateQuickStats();
            this.loadQualityMetrics().catch((err) => console.error("Quality metrics refresh failed:", err));
          } catch (error) {
            console.error("Failed to refresh usage data:", error);
          }
        }
      }, POLLING.USAGE_REFRESH_MS);
    }
    startQualityMetricsRefresh() {
      if (this.qualityMetricsInterval) {
        clearInterval(this.qualityMetricsInterval);
      }
      this.qualityMetricsInterval = setInterval(async () => {
        if (this.currentState === "authenticated") {
          try {
            await this.loadQualityMetrics();
          } catch (error) {
            console.error("Failed to refresh quality metrics:", error);
          }
        }
      }, POLLING.ANALYTICS_REFRESH_MS);
    }
    setupFocusRefresh() {
      this.focusHandler = async () => {
        if (this.currentState === "authenticated") {
          try {
            await this.loadUsageData();
            this.updateUsageDisplay();
            this.updateQuickStats();
            this.loadQualityMetrics().catch((err) => console.error("Quality metrics refresh failed:", err));
          } catch (error) {
            console.error("Failed to refresh data on focus:", error);
          }
        }
      };
      this.visibilityHandler = async () => {
        if (!document.hidden && this.currentState === "authenticated") {
          try {
            await this.loadUsageData();
            this.updateUsageDisplay();
            this.updateQuickStats();
            this.loadQualityMetrics().catch((err) => console.error("Quality metrics refresh failed:", err));
          } catch (error) {
            console.error("Failed to refresh data on visibility change:", error);
          }
        }
      };
      window.addEventListener("focus", this.focusHandler);
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
    setupUsageUpdateListener() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "usageUpdated" || message.action === "replyGenerated") {
          this.loadUsageData().then(() => {
            this.updateUsageDisplay();
            this.updateQuickStats();
            this.loadQualityMetrics().catch((err) => console.error("Quality metrics refresh failed:", err));
          }).catch((error) => {
            console.error("Failed to refresh usage after reply generation:", error);
          });
        }
        return true;
      });
    }
    setupCleanup() {
      this.beforeunloadHandler = () => {
        this.cleanup();
      };
      window.addEventListener("beforeunload", this.beforeunloadHandler);
    }
    cleanup() {
      if (this.usageDataInterval) {
        clearInterval(this.usageDataInterval);
        this.usageDataInterval = null;
      }
      if (this.qualityMetricsInterval) {
        clearInterval(this.qualityMetricsInterval);
        this.qualityMetricsInterval = null;
      }
      if (this.analyticsRefreshInterval) {
        clearInterval(this.analyticsRefreshInterval);
        this.analyticsRefreshInterval = null;
      }
      if (this.focusHandler) {
        window.removeEventListener("focus", this.focusHandler);
        this.focusHandler = null;
      }
      if (this.visibilityHandler) {
        document.removeEventListener("visibilitychange", this.visibilityHandler);
        this.visibilityHandler = null;
      }
      if (this.beforeunloadHandler) {
        window.removeEventListener("beforeunload", this.beforeunloadHandler);
        this.beforeunloadHandler = null;
      }
    }
    initializeElements() {
      this.loadingState = document.getElementById("loading");
      this.notAuthenticatedState = document.getElementById("not-authenticated");
      this.authenticatedState = document.getElementById("authenticated");
      this.quotaExceededState = document.getElementById("quota-exceeded");
      this.signinBtn = document.getElementById("signin-btn");
      this.historyBtn = document.getElementById("history-btn");
      this.analyticsBtn = document.getElementById("analytics-btn");
      this.webAppBtn = document.getElementById("web-app-btn");
      this.billingBtn = document.getElementById("billing-btn");
      this.upgradeBtn = document.getElementById("upgrade-btn");
      this.logoutBtn = document.getElementById("logout-btn");
      this.settingsBtn = document.getElementById("settings-btn");
      this.signoutBtn = document.getElementById("signout-btn");
      this.closeSettingsBtn = document.getElementById("close-settings");
      this.upgradeCta = document.getElementById("upgrade-cta");
      this.closeHistoryBtn = document.getElementById("close-history");
      this.statusDot = document.getElementById("status-dot");
      this.statusText = document.getElementById("status-text");
      this.progressFill = document.getElementById("progress-fill");
      this.usageText = document.getElementById("usage-text");
      this.resetText = document.getElementById("reset-text");
      this.quotaResetText = document.getElementById("quota-reset-text");
      this.statusMessage = document.getElementById("status-message");
      this.quotaBanner = document.getElementById("quota-banner");
      this.quotaBannerUsed = document.getElementById("quota-banner-used");
      this.quotaBannerLimit = document.getElementById("quota-banner-limit");
      this.quotaBannerBtn = document.getElementById("quota-banner-btn");
      this.userName = document.getElementById("user-name");
      this.planBadge = document.getElementById("plan-badge");
      this.usagePercentage = document.getElementById("usage-percentage");
      this.todayReplies = document.getElementById("today-replies");
      this.successRate = document.getElementById("success-rate");
      this.timeSaved = document.getElementById("time-saved");
      this.settingsPanel = document.getElementById("settings-panel");
      this.userEmail = document.getElementById("user-email");
      this.historyPanel = document.getElementById("history-panel");
      this.analyticsPanel = document.getElementById("analytics-panel");
      this.analyticsBackBtn = document.getElementById("analytics-back-btn");
      this.analyticsLoading = document.getElementById("analytics-loading");
      this.analyticsError = document.getElementById("analytics-error");
      this.analyticsRetryBtn = document.getElementById("analytics-retry-btn");
      this.analyticsData = document.getElementById("analytics-data");
      this.analyticsSummary = document.getElementById("analytics-summary");
      this.activityTrend = document.getElementById("activity-trend");
      this.insightsPanel = document.getElementById("insights-panel");
    }
    attachEventListeners() {
      this.signinBtn?.addEventListener("click", () => this.handleSignIn());
      this.historyBtn?.addEventListener("click", () => this.showHistory());
      this.analyticsBtn?.addEventListener("click", () => this.showAnalytics());
      this.webAppBtn?.addEventListener("click", () => this.handleOpenWebApp());
      this.billingBtn?.addEventListener("click", () => this.handleManageBilling());
      this.upgradeBtn?.addEventListener("click", () => this.handleUpgrade());
      this.upgradeCta?.addEventListener("click", () => this.handleUpgrade());
      this.quotaBannerBtn?.addEventListener("click", () => this.handleUpgrade());
      this.logoutBtn?.addEventListener("click", () => this.handleSignOut());
      this.settingsBtn?.addEventListener("click", () => this.showSettings());
      this.signoutBtn?.addEventListener("click", () => this.handleSignOut());
      this.closeSettingsBtn?.addEventListener("click", () => this.hideSettings());
      this.closeHistoryBtn?.addEventListener("click", () => this.hideHistory());
      this.analyticsBackBtn?.addEventListener("click", () => this.hideAnalytics());
      this.analyticsRetryBtn?.addEventListener("click", () => this.loadAnalytics());
      const snippetLabelInput = document.getElementById("snippetLabelInput");
      const snippetTextInput = document.getElementById("snippetTextInput");
      snippetLabelInput?.addEventListener("input", () => this.scheduleSnippetFormAutoSave());
      snippetTextInput?.addEventListener("input", () => this.scheduleSnippetFormAutoSave());
      const defaultSnippetSelect = document.getElementById("defaultSnippetSelect");
      const autoAppendSnippetSelect = document.getElementById("autoAppendSnippetSelect");
      defaultSnippetSelect?.addEventListener("change", () => this.saveSnippetPreferences());
      autoAppendSnippetSelect?.addEventListener("change", () => this.saveSnippetPreferences());
      const trackingPeriodInput = document.getElementById("trackingPeriodDays");
      trackingPeriodInput?.addEventListener("input", () => this.scheduleTrackingDaysAutoSave());
      trackingPeriodInput?.addEventListener("change", () => {
        if (this._trackingDaysSaveTimer) {
          clearTimeout(this._trackingDaysSaveTimer);
          this._trackingDaysSaveTimer = null;
        }
        this.saveTrackingSettings();
      });
      const relationshipHintsEl = document.getElementById("relationshipHintsEnabled");
      if (relationshipHintsEl) {
        relationshipHintsEl.addEventListener("change", () => this.saveRelationshipHintsSetting());
      }
      const followBadgeIconStyleEl = document.getElementById("followBadgeIconStyle");
      if (followBadgeIconStyleEl) {
        followBadgeIconStyleEl.addEventListener("change", () => this.saveFollowBadgeIconStyleSetting());
      }
      this.setupKeyboardNavigation();
      this.initSettingsTabs();
      this.initializeDarkMode();
    }
    setupKeyboardNavigation() {
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          if (!this.settingsPanel?.classList.contains("hidden")) {
            this.hideSettings();
          } else if (!this.historyPanel?.classList.contains("hidden")) {
            this.hideHistory();
          } else if (!this.analyticsPanel?.classList.contains("hidden")) {
            this.hideAnalytics();
          }
        }
      });
    }
    initializeDarkMode() {
      chrome.storage.local.get(["theme"], (result) => {
        if (result.theme) {
          document.documentElement.setAttribute("data-theme", result.theme);
        } else {
          const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
          if (prefersDark) {
            document.documentElement.setAttribute("data-theme", "dark");
          }
        }
      });
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        chrome.storage.local.get(["theme"], (result) => {
          if (!result.theme) {
            document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
          }
        });
      });
    }
    async initialize() {
      try {
        this.setState("loading");
        this.authManager.setApiClient(this.apiClient);
        let isAuthenticated = await this.authManager.isAuthenticated(true);
        if (!isAuthenticated) {
          await this.tryAuthSync();
          isAuthenticated = await this.authManager.isAuthenticated(true);
        }
        if (!isAuthenticated) {
          this.setState("not-authenticated");
          return;
        }
        await this.loadUserData();
        await this.loadUsageData();
        this.loadQualityMetrics().catch((err) => console.error("Quality metrics load failed:", err));
        if (this.usageData) {
          if (this.usageData.status === "no_access") {
            this.setState("authenticated");
          } else if (this.usageData.status === "trial" || this.usageData.status === "active") {
            if (this.usageData.used >= this.usageData.limit || this.usageData.upgradeRequired) {
              this.setState("authenticated");
            } else {
              this.setState("authenticated");
            }
          } else {
            this.setState("authenticated");
          }
        } else {
          this.setState("authenticated");
        }
        this.updateUsageDisplay();
        this.updateQuickStats();
      } catch (error) {
        console.error("Failed to initialize popup:", error);
        this.reportTelemetry("unknown_runtime_error", error, "popup_initialize");
        this.setState("not-authenticated");
      }
    }
    async tryAuthSync() {
      try {
        const tabs = await chrome.tabs.query({ url: "https://tweetreplyai.vercel.app/*" });
        if (tabs.length > 0) {
          chrome.runtime.sendMessage({
            action: "syncAuthFromTab",
            tabId: tabs[0].id
          });
          await new Promise((resolve) => setTimeout(resolve, 1e3));
        }
      } catch (error) {
        console.error("Failed to sync auth:", error);
        this.reportTelemetry("auth_sync_failed", error, "popup_auth_sync");
      }
    }
    async loadUserData() {
      try {
        const user = await this.apiClient.getCurrentUser();
        if (user) {
          if (this.userEmail) {
            this.userEmail.textContent = user.email || "Unknown";
          }
          this.updateWelcomeMessage(user);
        }
      } catch (error) {
        console.error("Failed to load user data:", error);
        this.reportTelemetry("api_request_failed", error, "/api/auth/user");
      }
    }
    async loadUsageData() {
      try {
        this.usageData = await this.apiClient.getUsage();
      } catch (error) {
        console.error("Failed to load usage data:", error);
        this.reportTelemetry("api_request_failed", error, "/api/usage");
        const userFacing = this.getUserFacingError(error, "Something went wrong. Try again.");
        this.showStatusMessage(userFacing.message, "error");
        this.usageData = null;
      }
    }
    async loadQualityMetrics() {
      const startTime = Date.now();
      console.log("[LOG][Quality] loadQualityMetrics() invoked at", new Date(startTime).toISOString());
      try {
        console.log("[LOG][Quality] -> requesting /api/quality/metrics?days=30");
        const response = await this.apiClient.getQualityMetrics(DEFAULTS.ANALYTICS_DAYS);
        console.log("[LOG][Quality] <- response received in", Date.now() - startTime, "ms:", response);
        this.processQualityMetricsResponse(response);
        this.updateQuickStats();
        return response;
      } catch (error) {
        console.error("[ERROR][Quality] loadQualityMetrics failed:", error);
        console.error("[ERROR][Quality] stack:", error?.stack);
        this.reportTelemetry("api_request_failed", error, "/api/quality/metrics");
        this.processQualityMetricsResponse(null);
        return null;
      }
    }
    processQualityMetricsResponse(response) {
      this.qualityMetricsResponse = response;
      if (!response) {
        console.warn("[WARN][Quality] No quality metrics response available");
        this.qualityMetrics = null;
        this.qualityRecommendations = [];
        return;
      }
      const { metrics = null, recommendations = [] } = response;
      console.log("[LOG][Quality] Raw response payload:", response);
      if (metrics) {
        console.log("[LOG][Quality] Extracted metrics:", {
          avg: metrics.avg_quality_score,
          high: metrics.high_quality_replies,
          low: metrics.low_quality_replies,
          regen: metrics.regeneration_rate
        });
      } else {
        console.warn("[WARN][Quality] Metrics object missing in response");
      }
      console.log(
        "[LOG][Quality] Recommendations count:",
        Array.isArray(recommendations) ? recommendations.length : 0,
        "Sample:",
        Array.isArray(recommendations) ? recommendations.slice(0, 3) : recommendations
      );
      this.qualityMetrics = metrics;
      this.qualityRecommendations = Array.isArray(recommendations) ? recommendations : [];
      console.log("[DEBUG][Quality] Normalized metrics stored:", this.qualityMetrics);
      console.log("[DEBUG][Quality] Normalized recommendations stored:", this.qualityRecommendations);
    }
    setState(state) {
      this.loadingState?.classList.add("hidden");
      this.notAuthenticatedState?.classList.add("hidden");
      this.authenticatedState?.classList.add("hidden");
      this.quotaExceededState?.classList.add("hidden");
      this.settingsPanel?.classList.add("hidden");
      this.historyPanel?.classList.add("hidden");
      this.improvePanel?.classList.add("hidden");
      this.analyticsPanel?.classList.add("hidden");
      if (this.settingsPanel) this.settingsPanel.style.display = "none";
      if (this.historyPanel) this.historyPanel.style.display = "none";
      if (this.improvePanel) this.improvePanel.style.display = "none";
      if (this.analyticsPanel) this.analyticsPanel.style.display = "none";
      this.currentState = state;
      switch (state) {
        case "loading":
          this.loadingState?.classList.remove("hidden");
          this.logoutBtn?.classList.add("hidden");
          break;
        case "not-authenticated":
          this.notAuthenticatedState?.classList.remove("hidden");
          this.logoutBtn?.classList.add("hidden");
          break;
        case "authenticated":
          this.authenticatedState?.classList.remove("hidden");
          this.logoutBtn?.classList.remove("hidden");
          break;
        case "quota-exceeded":
          this.quotaExceededState?.classList.remove("hidden");
          this.logoutBtn?.classList.remove("hidden");
          break;
      }
    }
    updateUsageDisplay() {
      if (!this.usageData) return;
      const { used, limit, resetAt, status, planCode, upgradeRequired, subscriptionCanceled } = this.usageData;
      const subCanceled = !!subscriptionCanceled;
      const percentage = Math.min(used / limit * 100, 100);
      const isExceeded = used >= limit || !!upgradeRequired;
      if (this.progressFill) {
        this.progressFill.style.width = `${percentage}%`;
        this.progressFill.classList.toggle("exceeded", isExceeded);
      }
      const progressBar = document.querySelector('.usage-progress-bar[role="progressbar"]');
      if (progressBar) {
        progressBar.setAttribute("aria-valuenow", Math.round(percentage));
        progressBar.setAttribute("aria-valuetext", `${used} of ${limit} credits used`);
      }
      if (this.usageText) {
        this.usageText.textContent = `${used} / ${limit} credits`;
      }
      if (this.usagePercentage) {
        this.usagePercentage.textContent = `${Math.round(percentage)}%`;
      }
      if (this.statusDot && this.statusText) {
        this.statusDot.classList.toggle("active", !isExceeded);
        this.statusText.textContent = isExceeded ? "Limit reached" : "Active";
      }
      const resetDistance = this.formatTimeDistance(new Date(resetAt));
      const isTrial = planCode === "trial" || status === "trial";
      const timeVerb = subCanceled ? "Ends" : "Resets";
      const resetLine = !isExceeded ? `${timeVerb} ${resetDistance}` : isTrial ? "You've used all your trial credits: upgrade to continue." : `You've used all your credits. ${timeVerb} ${resetDistance}`;
      if (this.resetText) {
        this.resetText.textContent = resetLine;
      }
      if (this.quotaResetText) {
        this.quotaResetText.textContent = resetLine;
      }
      if (this.statusMessage) {
        if (isExceeded) {
          this.statusMessage.textContent = isTrial ? "You've used all your trial credits: upgrade to continue." : `You've used all your credits. ${timeVerb} ${resetDistance}`;
        } else {
          this.statusMessage.textContent = 'Click "Reply" on any X post to generate suggestions';
        }
      }
      if (this.quotaBanner) {
        if (isExceeded) {
          if (this.quotaBannerUsed) this.quotaBannerUsed.textContent = used;
          if (this.quotaBannerLimit) this.quotaBannerLimit.textContent = limit;
          this.quotaBanner.classList.remove("hidden");
        } else {
          this.quotaBanner.classList.add("hidden");
        }
      }
      this.updateModeBreakdown();
      this.updateQuickStats();
      this.updatePlanBadge();
    }
    // formatModeBreakdown() removed - no longer used after collapsible breakdown implementation
    updateModeBreakdown() {
      try {
        const toggle = document.getElementById("breakdown-toggle");
        const btn = document.getElementById("breakdown-btn");
        const content = document.getElementById("breakdown-content");
        const chevron = document.getElementById("breakdown-chevron");
        if (!toggle || !btn || !content || !chevron) return;
        if (!btn.dataset.initialized) {
          btn.setAttribute("aria-expanded", "false");
          btn.setAttribute("aria-controls", "breakdown-content");
          btn.addEventListener("click", () => {
            const isExpanded = content.style.display !== "none";
            const newState = !isExpanded;
            content.style.display = newState ? "block" : "none";
            chevron.classList.toggle("expanded", newState);
            btn.setAttribute("aria-expanded", String(newState));
          });
          btn.dataset.initialized = "true";
        }
        if (this.usageData) {
          const breakdown = this.usageData.modeBreakdown || {};
          const totalCredits = this.usageData.used || 0;
          const modes = [
            { key: "single-sentence", label: "Concise" },
            { key: "enhanced", label: "Enhanced" },
            { key: "improve", label: "Improve" }
          ];
          let totalReplies = 0;
          let hasAllReplyCounts = true;
          let rows = "";
          for (const mode of modes) {
            const data = breakdown[mode.key] || { credits: 0 };
            const credits = Number(data.credits) || 0;
            const replies = Number(data.replies);
            const derivedReplies = Number.isFinite(replies) ? Math.max(0, Math.floor(replies)) : null;
            if (derivedReplies === null) {
              hasAllReplyCounts = false;
            } else {
              totalReplies += derivedReplies;
            }
            rows += `
            <div class="breakdown-row">
              <span class="breakdown-label">${mode.label}:</span>
              <span class="breakdown-value">${derivedReplies ?? 0} replies, ${credits} credits</span>
            </div>
          `;
          }
          content.innerHTML = `
          ${rows}
          <div class="breakdown-total">
            Total: ${hasAllReplyCounts ? totalReplies : 0} replies, ${totalCredits} credits
          </div>
        `;
          toggle.style.display = "block";
        } else {
          toggle.style.display = "none";
        }
      } catch (error) {
        console.error("[Popup] Failed to update breakdown:", error);
        const toggle = document.getElementById("breakdown-toggle");
        if (toggle) {
          toggle.style.display = "none";
        }
      }
    }
    formatTimeDistance(date) {
      const now = /* @__PURE__ */ new Date();
      const diffMs = date.getTime() - now.getTime();
      if (diffMs <= 0) return "soon";
      const days = Math.floor(diffMs / (1e3 * 60 * 60 * 24));
      const hours = Math.floor(diffMs % (1e3 * 60 * 60 * 24) / (1e3 * 60 * 60));
      const minutes = Math.floor(diffMs % (1e3 * 60 * 60) / (1e3 * 60));
      const parts = [];
      if (days > 0) {
        parts.push(`${days}d`);
      }
      if (hours > 0) {
        parts.push(`${hours}h`);
      }
      if (minutes > 0 || parts.length === 0) {
        parts.push(`${minutes}m`);
      }
      return `in ${parts.join(" ")}`;
    }
    async handleSignIn() {
      try {
        const domains = await this.getDomains();
        const domain = domains[0] || "tweetreplyai.vercel.app";
        const protocol = domain.includes("localhost") ? "http" : "https";
        const loginUrl = `${protocol}://${domain}/login`;
        chrome.tabs.create({ url: loginUrl });
        window.close();
      } catch (error) {
        console.error("Failed to handle sign in:", error);
      }
    }
    // NOTE: handleSuggestReply() method removed - Generate Reply button was removed from UI
    // Reply generation is now handled directly in content script via Twitter UI buttons
    async handleOpenWebApp() {
      try {
        const domains = await this.getDomains();
        const domain = domains[0] || "tweetreplyai.vercel.app";
        const protocol = domain.includes("localhost") ? "http" : "https";
        const webAppUrl = `${protocol}://${domain}/app`;
        chrome.tabs.create({ url: webAppUrl });
        window.close();
      } catch (error) {
        console.error("Failed to open web app:", error);
      }
    }
    async handleManageBilling() {
      try {
        const portalUrl = await this.apiClient.createBillingPortal();
        chrome.tabs.create({ url: portalUrl });
        window.close();
      } catch (error) {
        console.error("Failed to open billing portal:", error);
        this.reportTelemetry("api_request_failed", error, "/api/billing/portal");
        this.showStatusMessage(this.getUserFacingError(error, "Something went wrong. Try again.").message, "error");
      }
    }
    async handleUpgrade() {
      try {
        const domains = await this.getDomains();
        const domain = domains[0] || "tweetreplyai.vercel.app";
        const protocol = domain.includes("localhost") ? "http" : "https";
        const pricingUrl = `${protocol}://${domain}/pricing`;
        chrome.tabs.create({ url: pricingUrl });
        window.close();
      } catch (error) {
        console.error("Failed to open pricing:", error);
      }
    }
    async handleSignOut() {
      try {
        try {
          const domains = await this.getDomains();
          const domain = domains[0] || "tweetreplyai.vercel.app";
          const protocol = domain.includes("localhost") ? "http" : "https";
          await fetch(`${protocol}://${domain}/api/auth/logout`, {
            method: "POST",
            credentials: "include"
          });
        } catch (error) {
          console.error("Failed to logout from web app:", error);
        }
        await this.authManager.signOut();
        this.setState("not-authenticated");
        this.hideSettings();
      } catch (error) {
        console.error("Failed to sign out:", error);
      }
    }
    initSettingsTabs() {
      if (this._settingsTabsInitialized) return;
      const tabs = this.settingsPanel?.querySelectorAll('[role="tab"][data-settings-tab]');
      tabs?.forEach((tab) => {
        tab.addEventListener("click", () => this.setSettingsTab(tab.dataset.settingsTab));
      });
      this._settingsTabsInitialized = true;
    }
    getFirstFocusableIn(container) {
      if (!container) return null;
      const sel = 'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
      return container.querySelector(sel);
    }
    scheduleSnippetFormAutoSave() {
      if (this._snippetFormSaveTimer) {
        clearTimeout(this._snippetFormSaveTimer);
      }
      this._snippetFormSaveTimer = setTimeout(() => {
        this._snippetFormSaveTimer = null;
        this.tryAutoSaveSnippetForm();
      }, SNIPPET_FORM_AUTOSAVE_MS);
    }
    scheduleTrackingDaysAutoSave() {
      if (this._trackingDaysSaveTimer) {
        clearTimeout(this._trackingDaysSaveTimer);
      }
      this._trackingDaysSaveTimer = setTimeout(() => {
        this._trackingDaysSaveTimer = null;
        this.saveTrackingSettings();
      }, TRACKING_DAYS_AUTOSAVE_MS);
    }
    async tryAutoSaveSnippetForm() {
      const labelEl = document.getElementById("snippetLabelInput");
      const textEl = document.getElementById("snippetTextInput");
      const label = (labelEl?.value || "").trim();
      const text = (textEl?.value || "").trim();
      if (!label || !text) return;
      try {
        const r = await chrome.storage.local.get([SNIPPET_STORAGE.LIBRARY]);
        const library = Array.isArray(r[SNIPPET_STORAGE.LIBRARY]) ? r[SNIPPET_STORAGE.LIBRARY] : [];
        if (library.length >= DEFAULTS.SNIPPET_LIBRARY_LIMIT) {
          this.showStatusMessage(`Max ${DEFAULTS.SNIPPET_LIBRARY_LIMIT} snippets allowed.`, "error");
          return;
        }
        if (library.some((s) => String(s.label).toLowerCase() === label.toLowerCase())) {
          this.showStatusMessage("Snippet label must be unique.", "error");
          return;
        }
        library.push({
          id: `snippet_${Date.now()}`,
          label: label.slice(0, 60),
          text: text.slice(0, DEFAULTS.SNIPPET_MAX_LENGTH),
          updatedAt: Date.now()
        });
        await chrome.storage.local.set({ [SNIPPET_STORAGE.LIBRARY]: library, [SNIPPET_STORAGE.MIGRATED]: true });
        if (labelEl) labelEl.value = "";
        if (textEl) textEl.value = "";
        const savedMsg = document.getElementById("cta-settings-saved");
        if (savedMsg) {
          savedMsg.textContent = "CTA added.";
          savedMsg.style.display = "block";
          setTimeout(() => {
            savedMsg.style.display = "none";
          }, 1600);
        }
        await this.loadSnippetSettings();
      } catch (error) {
        this.reportTelemetry("storage_write_failed", error, "save_snippet");
        this.showStatusMessage("Something went wrong. Try again.", "error");
      }
    }
    setSettingsTab(key) {
      const normalized = key === "snippets" ? "cta" : key;
      const k = SETTINGS_TAB_IDS.includes(normalized) ? normalized : "account";
      SETTINGS_TAB_IDS.forEach((id) => {
        const tab = document.getElementById(`settings-tab-${id}`);
        const panel = document.getElementById(`settings-panel-${id}`);
        const selected = id === k;
        if (tab) {
          tab.setAttribute("aria-selected", selected ? "true" : "false");
          tab.tabIndex = selected ? 0 : -1;
        }
        if (panel) {
          if (selected) {
            panel.removeAttribute("hidden");
            panel.setAttribute("aria-hidden", "false");
          } else {
            panel.setAttribute("hidden", "");
            panel.setAttribute("aria-hidden", "true");
          }
        }
      });
      chrome.storage.local.set({ [SETTINGS_ACTIVE_TAB_KEY]: k }).catch(() => {
      });
    }
    async showSettings() {
      this.settingsPanel?.classList.remove("hidden");
      if (this.settingsPanel) {
        this.settingsPanel.style.display = "";
        this.settingsPanel.setAttribute("aria-hidden", "false");
        this.settingsBtn?.setAttribute("aria-expanded", "true");
        this.loadTrackingSettings();
        this.loadRelationshipHintsSettings();
        this.loadSnippetSettings();
        this.loadPlansSection();
        let tab = "account";
        try {
          const r = await chrome.storage.local.get(SETTINGS_ACTIVE_TAB_KEY);
          let stored = r[SETTINGS_ACTIVE_TAB_KEY];
          if (stored === "snippets") stored = "cta";
          if (SETTINGS_TAB_IDS.includes(stored)) tab = stored;
        } catch {
        }
        this.setSettingsTab(tab);
        requestAnimationFrame(() => {
          const panel = document.getElementById(`settings-panel-${tab}`);
          this.getFirstFocusableIn(panel)?.focus();
        });
      }
    }
    hideSettings() {
      if (this._snippetFormSaveTimer) {
        clearTimeout(this._snippetFormSaveTimer);
        this._snippetFormSaveTimer = null;
      }
      if (this._trackingDaysSaveTimer) {
        clearTimeout(this._trackingDaysSaveTimer);
        this._trackingDaysSaveTimer = null;
      }
      this.settingsPanel?.classList.add("hidden");
      if (this.settingsPanel) {
        this.settingsPanel.style.display = "none";
        this.settingsPanel.setAttribute("aria-hidden", "true");
        this.settingsBtn?.setAttribute("aria-expanded", "false");
      }
      this.settingsBtn?.focus();
    }
    async loadRelationshipHintsSettings() {
      try {
        const r = await chrome.storage.sync.get([
          STORAGE.RELATIONSHIP_HINTS_ENABLED,
          STORAGE.FOLLOW_BADGE_ICON_STYLE
        ]);
        const el = document.getElementById("relationshipHintsEnabled");
        if (el) el.checked = r[STORAGE.RELATIONSHIP_HINTS_ENABLED] !== false;
        const sel = document.getElementById("followBadgeIconStyle");
        if (sel) {
          const raw = r[STORAGE.FOLLOW_BADGE_ICON_STYLE];
          const v = typeof raw === "string" && FOLLOW_BADGE_ICON_STYLE_VALUES.includes(raw) ? raw : FOLLOW_BADGE_ICON_STYLE_DEFAULT;
          sel.value = v;
        }
      } catch (error) {
        console.error("Failed to load relationship hints setting:", error);
      }
    }
    async saveFollowBadgeIconStyleSetting() {
      try {
        const sel = document.getElementById("followBadgeIconStyle");
        if (!sel) return;
        const v = FOLLOW_BADGE_ICON_STYLE_VALUES.includes(sel.value) ? sel.value : FOLLOW_BADGE_ICON_STYLE_DEFAULT;
        if (sel.value !== v) sel.value = v;
        await chrome.storage.sync.set({ [STORAGE.FOLLOW_BADGE_ICON_STYLE]: v });
      } catch (error) {
        console.error("Failed to save follow badge icon style:", error);
      }
    }
    async saveRelationshipHintsSetting() {
      try {
        const el = document.getElementById("relationshipHintsEnabled");
        if (!el) return;
        await chrome.storage.sync.set({ [STORAGE.RELATIONSHIP_HINTS_ENABLED]: el.checked });
      } catch (error) {
        console.error("Failed to save relationship hints setting:", error);
      }
    }
    // Load reply tracking settings
    async loadTrackingSettings() {
      try {
        const result = await chrome.storage.local.get(["replyTrackingSettings"]);
        const settings = result.replyTrackingSettings || {
          trackingPeriodDays: 7
        };
        const trackingPeriodInput = document.getElementById("trackingPeriodDays");
        if (trackingPeriodInput) {
          trackingPeriodInput.value = settings.trackingPeriodDays || 7;
        }
      } catch (error) {
        console.error("Failed to load tracking settings:", error);
      }
    }
    reportTelemetry(eventType, error, route = "", context = {}) {
      emitTelemetry({
        event_type: eventType,
        surface: "popup",
        route,
        error_code: error?.message || eventType,
        context
      });
    }
    // Snippet library + legacy CTA migration
    async loadSnippetSettings() {
      try {
        const r = await chrome.storage.local.get([
          SNIPPET_STORAGE.LIBRARY,
          SNIPPET_STORAGE.DEFAULT_ID,
          SNIPPET_STORAGE.AUTO_APPEND_ID,
          SNIPPET_STORAGE.MIGRATED,
          CTA_STORAGE.TEXT,
          CTA_STORAGE.AUTO_APPEND
        ]);
        let library = Array.isArray(r[SNIPPET_STORAGE.LIBRARY]) ? r[SNIPPET_STORAGE.LIBRARY] : [];
        let defaultId = r[SNIPPET_STORAGE.DEFAULT_ID] || "";
        let autoAppendId = r[SNIPPET_STORAGE.AUTO_APPEND_ID] || "";
        if (!r[SNIPPET_STORAGE.MIGRATED] && !library.length && typeof r[CTA_STORAGE.TEXT] === "string" && r[CTA_STORAGE.TEXT].trim()) {
          const migratedId = `snippet_${Date.now()}`;
          library = [{ id: migratedId, label: "My CTA", text: r[CTA_STORAGE.TEXT].trim(), updatedAt: Date.now() }];
          defaultId = migratedId;
          autoAppendId = r[CTA_STORAGE.AUTO_APPEND] ? migratedId : "";
          await chrome.storage.local.set({
            [SNIPPET_STORAGE.LIBRARY]: library,
            [SNIPPET_STORAGE.DEFAULT_ID]: defaultId,
            [SNIPPET_STORAGE.AUTO_APPEND_ID]: autoAppendId,
            [SNIPPET_STORAGE.MIGRATED]: true
          });
        }
        this.renderSnippetLibrary(library, defaultId, autoAppendId);
      } catch (error) {
        this.reportTelemetry("storage_read_failed", error, "snippet_settings");
        console.error("Failed to load snippet settings:", error);
      }
    }
    renderSnippetLibrary(library, defaultId, autoAppendId) {
      const list = document.getElementById("snippetLibraryList");
      const defaultSel = document.getElementById("defaultSnippetSelect");
      const autoSel = document.getElementById("autoAppendSnippetSelect");
      if (list) {
        list.innerHTML = "";
        if (!library.length) {
          const hint = document.createElement("p");
          hint.className = "snippet-empty-hint";
          hint.textContent = "No CTAs yet. Add a label and text below.";
          list.appendChild(hint);
        }
        library.forEach((snippet) => {
          const row = document.createElement("div");
          row.className = "snippet-item";
          row.innerHTML = `<div><strong>${this.escapeHtml(snippet.label)}</strong><div class="snippet-item-text">${this.escapeHtml(this.truncate(snippet.text, 90))}</div></div>`;
          const del = document.createElement("button");
          del.className = "snippet-delete-btn";
          del.textContent = "Delete";
          del.addEventListener("click", () => this.deleteSnippet(snippet.id));
          row.appendChild(del);
          list.appendChild(row);
        });
      }
      if (defaultSel && autoSel) {
        const makeOptions = (select, includeNone) => {
          select.innerHTML = includeNone ? '<option value="">None</option>' : "";
          library.forEach((s) => {
            const option = document.createElement("option");
            option.value = s.id;
            option.textContent = s.label;
            select.appendChild(option);
          });
        };
        makeOptions(defaultSel, true);
        makeOptions(autoSel, true);
        defaultSel.value = defaultId || "";
        autoSel.value = autoAppendId || "";
      }
    }
    async deleteSnippet(snippetId) {
      try {
        const r = await chrome.storage.local.get([
          SNIPPET_STORAGE.LIBRARY,
          SNIPPET_STORAGE.DEFAULT_ID,
          SNIPPET_STORAGE.AUTO_APPEND_ID
        ]);
        const inUse = r[SNIPPET_STORAGE.DEFAULT_ID] === snippetId || r[SNIPPET_STORAGE.AUTO_APPEND_ID] === snippetId;
        if (inUse) {
          const ok = confirm(
            "This snippet is set as your default or auto-append snippet. Delete it anyway?"
          );
          if (!ok) return;
        }
        const library = (Array.isArray(r[SNIPPET_STORAGE.LIBRARY]) ? r[SNIPPET_STORAGE.LIBRARY] : []).filter((s) => s.id !== snippetId);
        const updates = { [SNIPPET_STORAGE.LIBRARY]: library };
        if (r[SNIPPET_STORAGE.DEFAULT_ID] === snippetId) updates[SNIPPET_STORAGE.DEFAULT_ID] = "";
        if (r[SNIPPET_STORAGE.AUTO_APPEND_ID] === snippetId) updates[SNIPPET_STORAGE.AUTO_APPEND_ID] = "";
        await chrome.storage.local.set(updates);
        await this.loadSnippetSettings();
      } catch (error) {
        this.reportTelemetry("storage_write_failed", error, "delete_snippet");
      }
    }
    async saveSnippetPreferences() {
      try {
        const defaultSel = document.getElementById("defaultSnippetSelect");
        const autoSel = document.getElementById("autoAppendSnippetSelect");
        await chrome.storage.local.set({
          [SNIPPET_STORAGE.DEFAULT_ID]: defaultSel?.value || "",
          [SNIPPET_STORAGE.AUTO_APPEND_ID]: autoSel?.value || "",
          [SNIPPET_STORAGE.MIGRATED]: true
        });
        const savedMsg = document.getElementById("cta-settings-saved");
        if (savedMsg) {
          savedMsg.textContent = "Defaults saved.";
          savedMsg.style.display = "block";
          setTimeout(() => {
            savedMsg.style.display = "none";
          }, 1600);
        }
      } catch (error) {
        this.reportTelemetry("storage_write_failed", error, "save_snippet_preferences");
      }
    }
    async loadPlansSection() {
      const plansList = document.getElementById("plansList");
      if (!plansList) return;
      plansList.innerHTML = '<div class="snippet-item-text">Loading plans...</div>';
      try {
        const response = await this.apiClient.getPlans();
        const plans = Array.isArray(response?.plans) ? response.plans : Array.isArray(response) ? response : [];
        if (!plans.length) {
          plansList.innerHTML = "";
          const msg = document.createElement("div");
          msg.className = "snippet-item-text";
          msg.textContent = "Plans unavailable here.";
          plansList.appendChild(msg);
          const pricing = document.createElement("a");
          pricing.className = "settings-web-link";
          pricing.textContent = "View pricing on the web";
          const domains = await this.getDomains();
          const domain = domains[0] || "tweetreplyai.vercel.app";
          const protocol = domain.includes("localhost") ? "http" : "https";
          pricing.href = `${protocol}://${domain}/pricing`;
          pricing.target = "_blank";
          pricing.rel = "noopener noreferrer";
          plansList.appendChild(pricing);
          return;
        }
        plansList.innerHTML = "";
        const currentPlan = (this.usageData?.planCode || "trial").toString().toLowerCase();
        const planLabels = {
          trial: "Free Trial",
          weekly: "Weekly Plan",
          monthly: "Monthly Plan",
          bypass: "Pro Plan"
        };
        const currentBanner = document.createElement("div");
        currentBanner.className = "plan-current-banner";
        currentBanner.textContent = `Current plan: ${planLabels[currentPlan] || planLabels.trial}`;
        plansList.appendChild(currentBanner);
        plans.forEach((plan) => {
          const item = document.createElement("div");
          item.className = "plan-item";
          const label = document.createElement("span");
          const code = (plan.code || plan.planCode || "").toString().toLowerCase();
          const name = plan.name || plan.code || code;
          label.textContent = name;
          const btn = document.createElement("button");
          btn.className = "secondary-btn";
          btn.textContent = code === currentPlan ? "Current" : "Choose";
          btn.disabled = code === currentPlan;
          if (code !== currentPlan) {
            btn.addEventListener("click", () => this.startCheckout(plan.code || plan.planCode));
          }
          item.appendChild(label);
          item.appendChild(btn);
          plansList.appendChild(item);
        });
      } catch (error) {
        this.reportTelemetry("api_request_failed", error, "/api/plans");
        plansList.innerHTML = "";
        const err = document.createElement("div");
        err.className = "snippet-item-text";
        err.textContent = "Unable to load plans right now.";
        plansList.appendChild(err);
        const pricing = document.createElement("a");
        pricing.className = "settings-web-link";
        pricing.textContent = "View pricing on the web";
        pricing.target = "_blank";
        pricing.rel = "noopener noreferrer";
        try {
          const domains = await this.getDomains();
          const domain = domains[0] || "tweetreplyai.vercel.app";
          const protocol = domain.includes("localhost") ? "http" : "https";
          pricing.href = `${protocol}://${domain}/pricing`;
        } catch {
          pricing.href = "https://tweetreplyai.vercel.app/pricing";
        }
        plansList.appendChild(pricing);
      }
    }
    async startCheckout(planCode) {
      if (!planCode || this.checkoutInProgress) return;
      this.checkoutInProgress = true;
      try {
        const checkout = await this.apiClient.createCheckout(planCode);
        const checkoutUrl = checkout?.checkout_url || checkout?.url;
        if (!checkoutUrl) throw new Error("Missing checkout url");
        chrome.tabs.create({ url: checkoutUrl });
        this.showStatusMessage("Checkout started. Return after payment.", "success");
      } catch (error) {
        this.reportTelemetry("api_request_failed", error, "/api/checkout", { action: "create_checkout" });
        const userFacing = this.getUserFacingError(error);
        this.showStatusMessage(userFacing.message, "error");
      } finally {
        this.checkoutInProgress = false;
      }
    }
    async saveTrackingSettings() {
      try {
        const trackingPeriodInput = document.getElementById("trackingPeriodDays");
        const savedMsg = document.getElementById("tracking-settings-saved");
        if (!trackingPeriodInput) return;
        const trackingPeriod = parseInt(trackingPeriodInput.value, 10) || 7;
        const clampedPeriod = Math.max(
          DEFAULTS.TRACKING_DAYS_MIN,
          Math.min(DEFAULTS.TRACKING_DAYS_MAX, trackingPeriod)
        );
        if (String(trackingPeriodInput.value) !== "" && clampedPeriod !== trackingPeriod) {
          trackingPeriodInput.value = String(clampedPeriod);
        }
        await chrome.storage.local.set({
          replyTrackingSettings: {
            trackingPeriodDays: clampedPeriod
          }
        });
        if (savedMsg) {
          savedMsg.style.display = "block";
          setTimeout(() => {
            savedMsg.style.display = "none";
          }, 1600);
        }
      } catch (error) {
        console.error("Failed to save tracking settings:", error);
        alert("Failed to save settings. Please try again.");
      }
    }
    showHistory() {
      this.hideAllPanels();
      this.historyPanel?.classList.remove("hidden");
      if (this.historyPanel) {
        this.historyPanel.style.display = "flex";
        this.historyPanel.setAttribute("aria-hidden", "false");
        this.closeHistoryBtn?.focus();
      }
      this.loadReplyHistory();
    }
    hideHistory() {
      this.historyPanel?.classList.add("hidden");
      if (this.historyPanel) {
        this.historyPanel.style.display = "none";
        this.historyPanel.setAttribute("aria-hidden", "true");
      }
      this.historyBtn?.focus();
    }
    showAnalytics() {
      this.hideAllPanels();
      this.analyticsPanel?.classList.remove("hidden");
      if (this.analyticsPanel) {
        this.analyticsPanel.style.display = "flex";
        this.analyticsPanel.setAttribute("aria-hidden", "false");
        this.analyticsBackBtn?.focus();
      }
      this.loadAnalytics();
      this.startAnalyticsAutoRefresh();
    }
    hideAnalytics() {
      this.analyticsPanel?.classList.add("hidden");
      if (this.analyticsPanel) {
        this.analyticsPanel.style.display = "none";
        this.analyticsPanel.setAttribute("aria-hidden", "true");
      }
      this.stopAnalyticsAutoRefresh();
      this.analyticsBtn?.focus();
    }
    startAnalyticsAutoRefresh() {
      if (this.analyticsRefreshInterval) {
        clearInterval(this.analyticsRefreshInterval);
      }
      this.analyticsRefreshInterval = setInterval(async () => {
        if (this.analyticsPanel && !this.analyticsPanel.classList.contains("hidden")) {
          try {
            await this.loadAnalytics();
          } catch (error) {
            console.error("Failed to auto-refresh analytics:", error);
          }
        }
      }, 3e4);
    }
    stopAnalyticsAutoRefresh() {
      if (this.analyticsRefreshInterval) {
        clearInterval(this.analyticsRefreshInterval);
        this.analyticsRefreshInterval = null;
      }
    }
    hideAllPanels() {
      this.settingsPanel?.classList.add("hidden");
      this.historyPanel?.classList.add("hidden");
      this.analyticsPanel?.classList.add("hidden");
      if (this.settingsPanel) {
        this.settingsPanel.style.display = "none";
        this.settingsPanel.setAttribute("aria-hidden", "true");
      }
      if (this.historyPanel) {
        this.historyPanel.style.display = "none";
        this.historyPanel.setAttribute("aria-hidden", "true");
      }
      if (this.analyticsPanel) {
        this.analyticsPanel.style.display = "none";
        this.analyticsPanel.setAttribute("aria-hidden", "true");
      }
    }
    async loadReplyHistory() {
      try {
        const history = await this.apiClient.getReplyHistory(20);
        this.displayHistory(history.history);
      } catch (error) {
        console.error("Failed to load history:", error);
      }
    }
    displayHistory(entries) {
      const listElement = document.getElementById("history-list");
      if (!listElement) return;
      listElement.innerHTML = "";
      if (!entries || entries.length === 0) {
        listElement.innerHTML = '<div class="empty-state">No reply history found</div>';
        return;
      }
      entries.forEach((entry) => {
        const item = document.createElement("div");
        item.className = "history-item";
        const header = document.createElement("div");
        header.className = "history-header";
        const dateEl = document.createElement("span");
        dateEl.className = "history-date";
        dateEl.textContent = new Date(entry.createdAt).toLocaleDateString();
        header.appendChild(dateEl);
        if (entry.qualityScore) {
          const qualityEl = document.createElement("span");
          qualityEl.className = "quality-badge";
          qualityEl.textContent = `Quality: ${entry.qualityScore}`;
          header.appendChild(qualityEl);
        }
        const tweetEl = document.createElement("div");
        tweetEl.className = "history-tweet";
        tweetEl.textContent = this.truncate(String(entry.originalTweet ?? ""), 80);
        const replyEl = document.createElement("div");
        replyEl.className = "history-reply";
        replyEl.textContent = String(entry.generatedReply ?? "");
        const copyBtn = document.createElement("button");
        copyBtn.className = "copy-btn";
        copyBtn.textContent = "Copy";
        copyBtn.addEventListener("click", () => {
          navigator.clipboard.writeText(String(entry.generatedReply ?? ""));
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = "Copy";
          }, 1e3);
        });
        item.appendChild(header);
        item.appendChild(tweetEl);
        item.appendChild(replyEl);
        item.appendChild(copyBtn);
        listElement.appendChild(item);
      });
    }
    async loadAnalytics(forceRefresh = false) {
      console.log("[Analytics] ========== Loading analytics START ==========");
      console.log("[Analytics] DOM elements check:", {
        loading: !!this.analyticsLoading,
        error: !!this.analyticsError,
        data: !!this.analyticsData,
        summary: !!this.analyticsSummary,
        trend: !!this.activityTrend,
        insights: !!this.insightsPanel
      });
      if (this.analyticsLoading) {
        this.analyticsLoading.classList.remove("hidden");
        console.log("[Analytics] Showing loading state");
      }
      if (this.analyticsError) this.analyticsError.classList.add("hidden");
      if (this.analyticsData) this.analyticsData.classList.add("hidden");
      try {
        console.log("[Analytics] Calling API: /api/analytics/simple?days=30");
        const response = await this.apiClient.getSimpleAnalytics(DEFAULTS.ANALYTICS_DAYS);
        console.log("[Analytics] \u2713 API Response received:", JSON.stringify(response, null, 2));
        if (!response || !response.summary) {
          throw new Error("Invalid response structure: missing summary");
        }
        console.log("[Analytics] Response structure valid");
        if (this.analyticsLoading) this.analyticsLoading.classList.add("hidden");
        if (this.analyticsData) {
          this.analyticsData.classList.remove("hidden");
          console.log("[Analytics] Showing data container");
        }
        console.log("[Analytics] Rendering summary...");
        this.renderAnalyticsSummary(response.summary);
        console.log("[Analytics] Rendering activity trend...");
        this.renderActivityTrend(response.activityTrend);
        console.log("[Analytics] Rendering insights...");
        this.renderInsights(response.insights);
        console.log("[Analytics] ========== Loading analytics COMPLETE ==========");
      } catch (error) {
        console.error("[Analytics] \u274C FAILED to load analytics");
        console.error("[Analytics] Error type:", error.constructor.name);
        console.error("[Analytics] Error message:", error.message);
        console.error("[Analytics] Error stack:", error.stack);
        if (this.analyticsLoading) this.analyticsLoading.classList.add("hidden");
        if (this.analyticsError) {
          this.analyticsError.classList.remove("hidden");
          console.log("[Analytics] Showing error state");
        }
        if (this.analyticsData) this.analyticsData.classList.add("hidden");
      }
    }
    renderAnalyticsSummary(summary) {
      if (!this.analyticsSummary) return;
      const { avgQuality, qualityTrend, totalReplies, timeSavedHours, highQualityCount } = summary;
      const trendIndicator = qualityTrend > 0 ? `<span class="trend-indicator positive">+${qualityTrend} from last period</span>` : qualityTrend < 0 ? `<span class="trend-indicator negative">${qualityTrend} from last period</span>` : "";
      const timeDisplay = timeSavedHours >= 1 ? `${timeSavedHours}h` : `${Math.round(timeSavedHours * 60)}m`;
      this.analyticsSummary.innerHTML = `
      <h3>Summary</h3>
      <div class="analytics-summary-grid">
        <div class="analytics-summary-card">
          <div class="metric-value">${avgQuality}</div>
          <div class="metric-label">Avg Quality</div>
          ${trendIndicator}
        </div>
        <div class="analytics-summary-card">
          <div class="metric-value">${totalReplies}</div>
          <div class="metric-label">Total Replies</div>
        </div>
        <div class="analytics-summary-card">
          <div class="metric-value">${timeDisplay}</div>
          <div class="metric-label">Time Saved</div>
        </div>
      </div>
    `;
    }
    renderActivityTrend(trend) {
      if (!this.activityTrend) return;
      if (trend.length === 0) {
        this.activityTrend.innerHTML = `
        <h3>Activity Trend</h3>
        <p class="empty-state">No activity data available yet</p>
      `;
        return;
      }
      const maxCount = Math.max(...trend.map((d) => d.count), 1);
      const width = 320;
      const height = 180;
      const leftPad = 28;
      const rightPad = 12;
      const topPad = 22;
      const bottomPad = 26;
      const chartWidth = width - leftPad - rightPad;
      const chartHeight = height - topPad - bottomPad;
      const chartBottom = height - bottomPad;
      const chartTop = topPad;
      const yTicks = (() => {
        const ticks = [0];
        if (maxCount <= 0) return ticks;
        const step = maxCount <= 5 ? 1 : maxCount <= 20 ? Math.ceil(maxCount / 4) : Math.ceil(maxCount / 4 / 10) * 10;
        for (let v = step; v < maxCount; v += step) ticks.push(v);
        if (maxCount > 0 && ticks[ticks.length - 1] !== maxCount) ticks.push(maxCount);
        return ticks;
      })();
      const getX = (i) => leftPad + (trend.length <= 1 ? 0 : i / (trend.length - 1) * chartWidth);
      const getY = (count) => chartBottom - count / maxCount * chartHeight;
      const points = trend.map((d, i) => `${getX(i)},${getY(d.count)}`).join(" ");
      const xLabels = trend.map((d, i) => {
        const x = getX(i);
        const dayLabel = (/* @__PURE__ */ new Date(d.date + "T12:00:00")).toLocaleDateString("en-US", { weekday: "short" });
        return `<text x="${x}" y="${chartBottom + 14}" text-anchor="middle" class="activity-chart-axis" font-size="10">${dayLabel}</text>`;
      }).join("");
      const yLabels = yTicks.map((val) => {
        const y = chartBottom - val / maxCount * chartHeight;
        return `<text x="${leftPad - 4}" y="${y + 4}" text-anchor="end" class="activity-chart-axis" font-size="10">${val}</text>`;
      }).join("");
      const countLabels = trend.map((d, i) => {
        const x = getX(i);
        const y = getY(d.count);
        return `<text x="${x}" y="${y - 6}" text-anchor="middle" class="activity-chart-count" font-size="11" font-weight="600">${d.count}</text>`;
      }).join("");
      this.activityTrend.innerHTML = `
      <h3>Activity Trend (Last 7 Days)</h3>
      <div class="activity-chart">
        <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="activityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:#3B82F6;stop-opacity:0.5" />
              <stop offset="100%" style="stop-color:#3B82F6;stop-opacity:0" />
            </linearGradient>
          </defs>
          <!-- Y-axis grid -->
          ${yTicks.map((val) => {
        const y = chartBottom - val / maxCount * chartHeight;
        return `<line x1="${leftPad}" y1="${y}" x2="${width - rightPad}" y2="${y}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="2,2"/>`;
      }).join("")}
          <!-- X-axis grid -->
          ${trend.map((_, i) => {
        const x = getX(i);
        return `<line x1="${x}" y1="${chartTop}" x2="${x}" y2="${chartBottom}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="2,2"/>`;
      }).join("")}
          <!-- Axes -->
          <line x1="${leftPad}" y1="${chartTop}" x2="${leftPad}" y2="${chartBottom}" stroke="#94a3b8" stroke-width="1"/>
          <line x1="${leftPad}" y1="${chartBottom}" x2="${width - rightPad}" y2="${chartBottom}" stroke="#94a3b8" stroke-width="1"/>
          <!-- Y-axis labels -->
          ${yLabels}
          <!-- X-axis labels -->
          ${xLabels}
          <!-- Area fill -->
          <polygon points="${leftPad},${chartBottom} ${points} ${width - rightPad},${chartBottom}" fill="url(#activityGradient)" opacity="0.3"/>
          <!-- Line -->
          <polyline points="${points}" fill="none" stroke="#3B82F6" stroke-width="2"/>
          <!-- Count at each day -->
          ${countLabels}
          <!-- Points -->
          ${trend.map((d, i) => {
        const x = getX(i);
        const y = getY(d.count);
        return `<circle cx="${x}" cy="${y}" r="3" fill="#3B82F6"/>`;
      }).join("")}
        </svg>
      </div>
    `;
    }
    renderInsights(insights) {
      if (!this.insightsPanel) return;
      if (insights.length === 0) {
        this.insightsPanel.innerHTML = `
        <h3>Insights</h3>
        <p class="empty-state">Generate more replies to unlock insights!</p>
      `;
        return;
      }
      const iconMap = {
        success: "\u2713",
        info: "\u2139",
        streak: "\u{1F525}"
      };
      const allowedTypes = new Set(Object.keys(iconMap));
      const insightItems = insights.map((insight) => {
        const safeType = allowedTypes.has(insight.type) ? insight.type : "info";
        const icon = iconMap[safeType] || "\u2139";
        return `
        <div class="insight-item">
          <div class="insight-icon ${safeType}">${icon}</div>
          <div class="insight-text">${this.escapeHtml(insight.text)}</div>
        </div>
      `;
      }).join("");
      this.insightsPanel.innerHTML = `
      <h3>Insights</h3>
      <div class="insights-list">
        ${insightItems}
      </div>
    `;
    }
    truncate(text, maxLength) {
      if (!text) return "";
      return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
    }
    escapeHtml(text) {
      if (!text) return "";
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
    showStatusMessage(message, type = "info") {
      const existingMessage = document.querySelector(".temp-status");
      if (existingMessage) {
        existingMessage.remove();
      }
      const messageEl = document.createElement("div");
      messageEl.className = `temp-status ${type === "error" ? "error-message" : "success-message"}`;
      messageEl.textContent = message;
      const firstState = document.querySelector(".state:not(.hidden)");
      if (firstState) {
        firstState.insertBefore(messageEl, firstState.firstChild);
      }
      setTimeout(() => {
        messageEl?.remove();
      }, 3e3);
    }
    async getDomains() {
      try {
        const result = await chrome.storage.local.get(["apiDomain"]);
        if (result.apiDomain) {
          return [result.apiDomain];
        }
        return ["tweetreplyai.vercel.app"];
      } catch (error) {
        console.error("Failed to get domains:", error);
        return ["tweetreplyai.vercel.app"];
      }
    }
    // New methods for enhanced UI
    updateWelcomeMessage(user) {
      if (this.userName) {
        console.log("User object for welcome message:", user);
        let name = user.name || user.displayName || user.fullName || (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName);
        if (!name && user.email) {
          const emailPrefix = user.email.split("@")[0];
          const cleanedName = emailPrefix.replace(/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g, "");
          if (cleanedName.length >= 2) {
            name = cleanedName;
          } else {
            name = emailPrefix;
          }
        }
        name = (name || "").trim().split(/\s+/)[0] || name || "there";
        if (!name) {
          name = "there";
        }
        const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        this.userName.textContent = capitalizedName;
      }
    }
    updatePlanBadge() {
      if (this.planBadge && this.usageData) {
        const planCode = (this.usageData.planCode || "trial").toString().toLowerCase();
        const planLabels = {
          "trial": "Free Trial",
          "weekly": "Weekly Plan",
          "monthly": "Monthly Plan",
          "bypass": "Pro Plan"
        };
        this.planBadge.textContent = planLabels[planCode] || "Free Plan";
        this.planBadge.className = "plan-badge" + (planCode === "bypass" ? " plan-badge--pro" : planCode === "weekly" || planCode === "monthly" ? " plan-badge--paid" : "");
        this.planBadge.style.background = "";
        this.planBadge.style.color = "";
        const isPaidPlan = planCode === "bypass" || planCode === "weekly" || planCode === "monthly";
        if (this.upgradeCta) {
          this.upgradeCta.style.display = isPaidPlan ? "none" : "";
        }
        const footerActions = this.upgradeCta?.closest(".footer-actions");
        if (footerActions) {
          footerActions.style.display = isPaidPlan ? "none" : "";
        }
      }
    }
    updateQuickStats() {
      const breakdown = this.usageData?.modeBreakdown || {};
      let hasAllReplyCounts = true;
      const totalReplies = ["single-sentence", "enhanced", "improve"].reduce((sum, key) => {
        const explicitReplies = Number(breakdown[key]?.replies);
        if (!Number.isFinite(explicitReplies)) {
          hasAllReplyCounts = false;
          return sum;
        }
        const replies = Math.max(0, Math.floor(explicitReplies));
        return sum + replies;
      }, 0);
      const todayRepliesValue = hasAllReplyCounts ? String(totalReplies) : "0";
      if (this.todayReplies) {
        this.todayReplies.textContent = todayRepliesValue;
        console.log("[LOG][QuickStats] Today replies updated to", todayRepliesValue);
      } else {
        console.warn("[WARN][QuickStats] todayReplies element missing");
      }
      if (this.successRate) {
        console.log("[LOG][QuickStats] updateQuickStats invoked with metrics:", this.qualityMetrics);
        console.log("[LOG][QuickStats] usageData derived replies:", todayRepliesValue);
        console.log("[LOG][QuickStats] successRate element exists?", !!this.successRate);
        if (this.qualityMetrics && this.qualityMetrics.avg_quality_score !== void 0 && this.qualityMetrics.avg_quality_score !== null) {
          const score = Math.round(this.qualityMetrics.avg_quality_score);
          console.log("[LOG][QuickStats] Displaying quality score:", score);
          this.successRate.textContent = score.toString();
        } else {
          console.warn("[WARN][QuickStats] No quality metrics available, falling back to --");
          this.successRate.textContent = "--";
        }
        console.log("[LOG][QuickStats] successRate text now:", this.successRate.textContent);
      }
      if (this.timeSaved) {
        this.timeSaved.textContent = "--";
      }
    }
    formatTimeSaved(minutes) {
      if (minutes < 60) {
        return `${minutes}m`;
      } else {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
      }
    }
    /**
     * Formats quality score as percentage.
     * Handles both decimal (0-1) and percentage (0-100) formats.
     * Returns '--' for null/undefined values.
     * @param {number|null|undefined} avgScore - The average quality score
     * @returns {string} Formatted score as percentage or '--'
     */
    formatQualityScore(avgScore) {
      if (avgScore === null || avgScore === void 0) {
        return "--";
      }
      return avgScore < 1 ? `${Math.round(avgScore * 100)}%` : `${Math.round(avgScore)}%`;
    }
  };
  document.addEventListener("DOMContentLoaded", () => {
    new PopupManager();
  });
})();
