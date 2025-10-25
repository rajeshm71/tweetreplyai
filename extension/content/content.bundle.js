"use strict";
(() => {
  // extension/utils/auth.js
  var AuthManager = class {
    constructor() {
      this.token = null;
      this.authStatusCache = null;
      this.cacheExpiry = 0;
    }
    async isAuthenticated() {
      if (this.authStatusCache && Date.now() < this.cacheExpiry) {
        return this.authStatusCache;
      }
      try {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "getAuthStatus" }, resolve);
        });
        this.authStatusCache = response.authenticated;
        this.cacheExpiry = Date.now() + 3e4;
        this.token = response.token;
        return response.authenticated;
      } catch (error) {
        console.error("Failed to check auth status:", error);
        this.authStatusCache = false;
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
        this.authStatusCache = false;
        this.cacheExpiry = 0;
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
        const domain = response.domain || "tweetreplyai.vercel.app";
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
                this.authManager.clearCache();
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
    async getAnalytics(days = 30) {
      return this.makeRequest(`/api/analytics/feedback-stats?days=${days}`);
    }
    async getQualityMetrics(days = 30) {
      return this.makeRequest(`/api/quality/metrics?days=${days}`);
    }
  };

  // extension/content/content.js
  var TwitterReplyInjector = class {
    constructor() {
      this.authManager = new AuthManager();
      this.apiClient = new ApiClient();
      this.isAuthenticated = false;
      this.usageData = null;
      this.injectedButtons = /* @__PURE__ */ new Set();
      this.injectedContainers = /* @__PURE__ */ new Set();
      this.initialize();
    }
    async initialize() {
      this.isAuthenticated = await this.authManager.isAuthenticated();
      if (this.isAuthenticated) {
        await this.loadUsageData();
      }
      this.startObserving();
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "suggestReply") {
          this.handleSuggestReplyFromPopup();
        } else if (message.action === "authUpdated") {
          this.refreshAuthState();
        }
      });
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === "local" && changes.token) {
          this.refreshAuthState();
        }
      });
      setInterval(() => {
        if (this.isAuthenticated) {
          this.loadUsageData();
        }
      }, 3e4);
    }
    async refreshAuthState() {
      const wasAuthenticated = this.isAuthenticated;
      this.isAuthenticated = await this.authManager.isAuthenticated();
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
    startObserving() {
      let debounceTimer = null;
      const addedNodes = /* @__PURE__ */ new Set();
      const observer = new MutationObserver((mutations) => {
        clearTimeout(debounceTimer);
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              addedNodes.add(node);
            }
          });
        });
        debounceTimer = setTimeout(() => {
          addedNodes.forEach((node) => {
            this.checkForReplyComposers(node);
          });
          addedNodes.clear();
        }, 100);
      });
      observer.observe(document.body, {
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
      const composerContainer = composer.closest('[data-testid="tweetComposer"]') || composer.closest('[role="dialog"]') || composer.closest("div[data-testid]");
      if (!composerContainer) return;
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
        const button = this.createSuggestButton(composer, containerId);
        this.insertButtonInToolbar(toolbar, button);
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
    createSuggestButton(composer, containerId) {
      const container = document.createElement("div");
      container.className = "tweetreply-button-container";
      container.dataset.containerId = containerId;
      const modelSelect = this.createModelSelect();
      container.appendChild(modelSelect);
      const promptSelect = this.createPromptSelect();
      container.appendChild(promptSelect);
      const button = document.createElement("button");
      button.className = "tweetreply-suggest-btn";
      button.dataset.authPending = "true";
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
        if (button.dataset.loadError === "true") {
          console.log("[TweetReply] Retrying button initialization...");
          delete button.dataset.loadError;
          button.dataset.authPending = "true";
          this.updateButtonState(button);
          await this.updateButtonStateAsync(button);
          return;
        }
        this.handleSuggestReply(composer, button, {
          modelKey: modelSelect.value,
          promptVariation: promptSelect.value
        });
      });
      container.appendChild(button);
      return container;
    }
    async updateButtonStateAsync(button) {
      try {
        console.log("[TweetReply] Initializing button state...");
        if (!this.isAuthenticated) {
          this.isAuthenticated = await this.authManager.isAuthenticated();
          console.log("[TweetReply] Auth status:", this.isAuthenticated);
        }
        if (this.isAuthenticated && !this.usageData) {
          console.log("[TweetReply] Loading usage data...");
          try {
            await Promise.race([
              this.loadUsageData(),
              new Promise(
                (_, reject) => setTimeout(() => reject(new Error("Timeout after 10 seconds")), 1e4)
              )
            ]);
            console.log("[TweetReply] Usage data loaded:", this.usageData);
          } catch (error) {
            console.warn("[TweetReply] Failed to load usage data, using fallback:", error);
            this.usageData = {
              used: 0,
              limit: 999,
              resetAt: new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString()
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
      this.loadModels().then((models) => {
        if (models && models.openai) {
          models.openai.forEach((model) => {
            const option = document.createElement("option");
            option.value = model.key;
            option.textContent = model.name;
            select.appendChild(option);
          });
        }
        if (models && models.gemini) {
          models.gemini.forEach((model) => {
            const option = document.createElement("option");
            option.value = model.key;
            option.textContent = model.name;
            select.appendChild(option);
          });
        }
      }).catch((error) => {
        console.error("Failed to load models:", error);
      });
      return select;
    }
    createPromptSelect() {
      const select = document.createElement("select");
      select.className = "tweetreply-prompt-select";
      select.title = "Choose reply style";
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "Default";
      select.appendChild(defaultOption);
      this.loadPrompts().then((prompts) => {
        if (prompts && Array.isArray(prompts)) {
          prompts.forEach((prompt) => {
            const option = document.createElement("option");
            option.value = prompt.name;
            option.textContent = prompt.name;
            select.appendChild(option);
          });
        }
      }).catch((error) => {
        console.error("Failed to load prompts:", error);
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
        button.disabled = true;
        button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z" opacity="0.6"/>
        </svg>
        <span>\u{1F512} Sign in to use</span>
      `;
        button.title = "Click to sign in to TweetReply";
        button.style.opacity = "0.6";
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
        button.disabled = true;
        button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z" opacity="0.6"/>
        </svg>
        <span>\u26A0\uFE0F Quota exceeded</span>
      `;
        button.title = `Quota exceeded. Resets ${this.formatTimeDistance(new Date(this.usageData.resetAt))}`;
        button.style.opacity = "0.6";
        return;
      }
      button.disabled = false;
      button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
        <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z"/>
      </svg>
      <span>Suggest reply</span>
    `;
      button.title = "Generate an AI reply suggestion";
      button.style.opacity = "1";
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
        this.showMessage(composer, "Quota exceeded. Upgrade your plan to continue.", "error");
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
      button.disabled = true;
      const originalText = button.innerHTML;
      button.innerHTML = `
      <div class="tweetreply-spinner" style="width: 14px; height: 14px; border: 2px solid #1d9bf0; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 4px;"></div>
      <span>Generating...</span>
    `;
      try {
        const authorInfo = this.extractAuthorInfo();
        const conversationContext = this.extractConversationContext();
        const tweetMetadata = this.extractTweetMetadata();
        console.log("[TweetReply] Generating reply with data:", {
          tweet_id: tweetId,
          tweet_text_length: tweetText.length,
          author_info_username: authorInfo?.username || "unknown",
          model_key: options.modelKey || "auto",
          prompt_variation: options.promptVariation || "default"
        });
        const response = await this.apiClient.generateReply({
          tweet_text: tweetText,
          tweet_id: tweetId,
          // Now guaranteed to be non-null
          model_key: options.modelKey,
          prompt_variation: options.promptVariation,
          author_info: authorInfo,
          // Now guaranteed to have follower_count as number
          conversation_context: conversationContext,
          tweet_metadata: tweetMetadata
        });
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
        this.showMessage(composer, "\u2713 Reply inserted", "success");
        this.updateAllButtonStates();
      } catch (error) {
        console.error("Failed to generate reply:", error);
        let errorMessage = "Failed to generate reply";
        if (error.message.includes("400")) {
          errorMessage = "Invalid request. Please try again or refresh the page.";
        } else if (error.message.includes("401")) {
          this.isAuthenticated = false;
          errorMessage = "Please sign in again";
        } else if (error.message.includes("402")) {
          errorMessage = "Quota exceeded - upgrade your plan";
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
    isComposerVisible(composer) {
      const rect = composer.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
    }
    findButtonForComposer(composer) {
      const container = composer.closest('[data-testid="tweetComposer"]') || composer.parentElement;
      return container?.querySelector(".tweetreply-suggest-btn");
    }
    extractTweetText() {
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
          if (text && text.length > 10) {
            return text;
          }
        }
      }
      const allText = document.body.textContent;
      const sentences = allText.split(/[.!?]+/).filter((s) => s.trim().length > 20);
      return sentences[0]?.trim() || null;
    }
    extractTweetId() {
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
        const username = authorElement.textContent?.trim() || "unknown";
        const verifiedIcon = authorElement.querySelector('[data-testid="icon-verified"]');
        const isVerified = !!verifiedIcon;
        let followerCount = 0;
        const bioElement = document.querySelector('[data-testid="UserDescription"]');
        if (bioElement) {
          const followerMatch = bioElement.textContent?.match(/(\d+(?:\.\d+)?[KMB]?)\s*followers?/i);
          if (followerMatch) {
            followerCount = this.parseFollowerCount(followerMatch[1]);
            console.log("[TweetReply] Follower count extracted from bio:", followerCount);
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
        console.log("[TweetReply] Author info extracted:", { username, verified: isVerified, follower_count: followerCount });
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
    extractConversationContext() {
      try {
        const tweets = document.querySelectorAll('[data-testid="tweet"]');
        const parentTweets = [];
        for (let i = 0; i < Math.min(tweets.length, 3); i++) {
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
    // Replace whatever is in the Twitter reply composer with new text
    // Works with Draft/React by mimicking a real paste and restoring a valid caret.
    // Minimal, stable, and Draft-friendly.
    // No innerHTML, no synthetic clipboard events, no fake keypresses.
    // Replaces the composer text and makes it 100% editable (Backspace/Enter work)
    // Minimal, stable, and Draft-friendly.
    // No innerHTML, no synthetic clipboard events, no fake keypresses.
    // Minimal, stable, and Draft-friendly.
    // No innerHTML, no synthetic clipboard events, no fake keypresses.
    // Replace whatever is in the Twitter reply composer with new text
    // Works with Draft/React by mimicking a real paste and restoring a valid caret.
    // Stable replace: visible text, Reply active, Backspace/Enter work
    async insertReplyIntoComposer(composer, replyData) {
      try {
        console.log("[TweetReply] \u{1F680} Starting insertReplyIntoComposer");
        console.log("[TweetReply] Composer:", composer);
        console.log("[TweetReply] ReplyData:", replyData);
        if (!composer || !replyData) {
          console.log("[TweetReply] \u274C Invalid parameters - composer or replyData missing");
          return;
        }
        const replyText = typeof replyData === "string" ? replyData : replyData.reply;
        const qualityScore = typeof replyData === "object" ? replyData.qualityScore : null;
        console.log("[TweetReply] Reply text:", replyText);
        console.log("[TweetReply] Quality score:", qualityScore);
        if (!replyText) {
          console.log("[TweetReply] \u274C No reply text to insert");
          return;
        }
        if (composer.contentEditable === "true") {
          console.log("[TweetReply] \u2705 Using Qura AI method: innerHTML + data-text span");
          const dataTextSpan = composer.querySelector('[data-text="true"]');
          const targetElement = dataTextSpan ? dataTextSpan.parentElement : composer;
          console.log("[TweetReply] Data-text span found:", !!dataTextSpan);
          console.log("[TweetReply] Target element:", targetElement === composer ? "composer" : "parent");
          console.log("[TweetReply] Target element content before:", targetElement.innerHTML);
          console.log("[TweetReply] \u{1F3AF} Focusing composer...");
          composer.focus();
          await this.sleep(30);
          console.log("[TweetReply] \u{1F4DD} Step 1: Selecting all existing content...");
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(targetElement);
          sel.removeAllRanges();
          sel.addRange(range);
          console.log("[TweetReply] Selection range:", sel.toString());
          console.log("[TweetReply] \u{1F5D1}\uFE0F Step 2: Dispatching delete events...");
          const beforeDel = new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "deleteByCut",
            // delete selection
            data: null
          });
          targetElement.dispatchEvent(beforeDel);
          console.log("[TweetReply] Dispatched beforeinput deleteByCut");
          const delEvt = new InputEvent("input", {
            bubbles: true,
            cancelable: true,
            inputType: "deleteContentBackward",
            data: null
          });
          targetElement.dispatchEvent(delEvt);
          console.log("[TweetReply] Dispatched input deleteContentBackward");
          console.log("[TweetReply] \u{1F9F9} Step 3: Clearing DOM to match internal state...");
          targetElement.innerHTML = "";
          console.log("[TweetReply] DOM cleared, content now:", targetElement.innerHTML);
          await this.sleep(20);
          console.log("[TweetReply] \u270F\uFE0F Step 4: Inserting new content...");
          targetElement.innerHTML = `<span data-text="true">${replyText}</span>`;
          console.log("[TweetReply] New content inserted:", targetElement.innerHTML);
          console.log("[TweetReply] \u{1F4E4} Step 5: Dispatching insert events...");
          const insEvt = new InputEvent("input", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: replyText
          });
          targetElement.dispatchEvent(insEvt);
          console.log("[TweetReply] Dispatched input insertText to target element");
          if (targetElement !== composer) {
            console.log("[TweetReply] \u{1F4E4} Step 6: Notifying outer composer...");
            composer.dispatchEvent(new InputEvent("input", {
              bubbles: true,
              cancelable: true,
              inputType: "insertText",
              data: replyText
            }));
            console.log("[TweetReply] Dispatched input insertText to composer");
          } else {
            console.log("[TweetReply] \u23ED\uFE0F Step 6: Skipping composer notification (same as target)");
          }
          console.log("[TweetReply] \u23F3 Waiting for React to process...");
          await this.sleep(60);
          console.log("[TweetReply] \u{1F3AF} Final focus...");
          composer.focus();
          console.log("[TweetReply] \u2705 Text replaced using Qura AI method");
          console.log("[TweetReply] Final content:", targetElement.innerHTML);
        } else if (composer.tagName === "TEXTAREA") {
          console.log("[TweetReply] \u{1F4DD} Using TEXTAREA method");
          console.log("[TweetReply] Textarea value before:", composer.value);
          composer.focus();
          composer.setSelectionRange(0, composer.value.length);
          console.log("[TweetReply] Selected all text in textarea");
          console.log("[TweetReply] \u{1F5D1}\uFE0F Dispatching delete events for textarea...");
          composer.dispatchEvent(new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "deleteByCut"
          }));
          composer.value = "";
          console.log("[TweetReply] Cleared textarea value");
          composer.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            cancelable: true,
            inputType: "deleteContentBackward"
          }));
          composer.value = replyText;
          console.log("[TweetReply] Set new textarea value:", replyText);
          composer.dispatchEvent(new Event("input", { bubbles: true }));
          console.log("[TweetReply] \u2705 Textarea text replaced");
        } else {
          console.log("[TweetReply] \u{1F50D} Looking for nested input elements...");
          const input = composer.querySelector('textarea, [contenteditable="true"]');
          if (input) {
            console.log("[TweetReply] Found nested input, recursing...");
            await this.insertReplyIntoComposer(input, replyData);
          } else {
            console.log("[TweetReply] \u274C No suitable input element found");
          }
        }
        if (typeof qualityScore === "number") {
          console.log("[TweetReply] \u{1F3C6} Showing quality badge:", qualityScore);
          this.showQualityBadge(composer, qualityScore);
        }
        console.log("[TweetReply] \u{1F389} insertReplyIntoComposer completed successfully");
      } catch (error) {
        console.error("[TweetReply] \u274C Error during text insertion:", error);
        console.error("[TweetReply] Error stack:", error.stack);
      }
    }
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    showQualityBadge(composer, score) {
      try {
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
        badge.innerHTML = `
        <span class="quality-label">Quality:</span>
        <span class="quality-score quality-${this.getQualityClass(score)}">${score}</span>
      `;
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
      document.querySelectorAll(".tweetreply-suggest-btn").forEach((button) => {
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
  };
  new TwitterReplyInjector();
})();
