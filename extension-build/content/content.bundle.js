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
      const baseUrl = await this.getBaseUrl();
      const url = `${baseUrl}${endpoint}`;
      const token = await this.authManager.getToken();
      const defaultHeaders = {
        "Content-Type": "application/json"
      };
      if (token) {
        defaultHeaders["Authorization"] = `Bearer ${token}`;
      }
      const requestOptions = {
        method: options.method || "GET",
        headers: { ...defaultHeaders, ...options.headers },
        credentials: "include",
        ...options
      };
      if (options.body && requestOptions.method !== "GET") {
        requestOptions.body = JSON.stringify(options.body);
      }
      try {
        const response = await fetch(url, requestOptions);
        if (response.status === 401) {
          this.authManager.clearCache();
          throw new Error("401: Unauthorized");
        }
        if (response.status === 402) {
          throw new Error("402: Payment required - quota exceeded");
        }
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`${response.status}: ${errorText || response.statusText}`);
        }
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          return await response.json();
        } else {
          return await response.text();
        }
      } catch (error) {
        console.error(`API request failed: ${endpoint}`, error);
        if (error.name === "TypeError" && error.message.includes("fetch")) {
          throw new Error("Network error - please check your connection");
        }
        throw error;
      }
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
        }
      });
      setInterval(() => {
        if (this.isAuthenticated) {
          this.loadUsageData();
        }
      }, 3e4);
    }
    async loadUsageData() {
      try {
        this.usageData = await this.apiClient.getUsage();
      } catch (error) {
        console.error("Failed to load usage data:", error);
        this.usageData = null;
      }
    }
    startObserving() {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.checkForReplyComposers(node);
            }
          });
        });
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      this.checkForReplyComposers(document.body);
    }
    checkForReplyComposers(container) {
      const composerSelectors = [
        '[data-testid="tweetTextarea_0"]',
        '[data-testid="tweetTextarea_1"]',
        '[data-testid="tweetTextarea_2"]',
        '[aria-label*="reply" i][contenteditable="true"]',
        '[aria-label*="post" i][contenteditable="true"]',
        '[aria-label*="tweet" i][contenteditable="true"]',
        ".public-DraftEditor-content",
        ".DraftEditor-editorContainer",
        '[data-testid="toolBar"] ~ div [contenteditable="true"]',
        // Fallback selectors for different Twitter layouts
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-testid]'
      ];
      composerSelectors.forEach((selector) => {
        try {
          const composers = container.querySelectorAll ? container.querySelectorAll(selector) : [];
          composers.forEach((composer) => this.injectSuggestButton(composer));
        } catch (error) {
          console.error("Error checking selectors:", selector, error);
        }
      });
    }
    injectSuggestButton(composer) {
      if (!composer || this.injectedButtons.has(composer)) return;
      let toolbar = null;
      const parent = composer.closest('[data-testid="tweetComposer"]') || composer.closest(".tweet-composer") || composer.closest('[role="dialog"]') || composer.parentElement;
      if (parent) {
        toolbar = parent.querySelector('[data-testid="toolBar"]') || parent.querySelector(".toolbar") || parent.querySelector('[role="toolbar"]');
        if (!toolbar) {
          const buttonContainers = parent.querySelectorAll("div");
          for (const container of buttonContainers) {
            if (container.querySelectorAll("button").length >= 2) {
              toolbar = container;
              break;
            }
          }
        }
      }
      if (!toolbar) {
        toolbar = this.createToolbar(composer);
      }
      if (toolbar) {
        const button = this.createSuggestButton(composer);
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
    createSuggestButton(composer) {
      const container = document.createElement("div");
      container.className = "tweetreply-button-container";
      const modelSelect = this.createModelSelect();
      container.appendChild(modelSelect);
      const promptSelect = this.createPromptSelect();
      container.appendChild(promptSelect);
      const button = document.createElement("button");
      button.className = "tweetreply-suggest-btn";
      button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
        <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z"/>
      </svg>
      <span>Suggest reply</span>
    `;
      this.updateButtonState(button);
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleSuggestReply(composer, button, {
          modelKey: modelSelect.value,
          promptVariation: promptSelect.value
        });
      });
      container.appendChild(button);
      return container;
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
      const canUse = this.isAuthenticated && this.usageData && this.usageData.used < this.usageData.limit;
      button.disabled = !canUse;
      if (!this.isAuthenticated) {
        button.title = "Sign in to use TweetReply";
      } else if (this.usageData && this.usageData.used >= this.usageData.limit) {
        button.title = `Quota exceeded. Resets ${this.formatTimeDistance(new Date(this.usageData.resetAt))}`;
      } else {
        button.title = "Generate an AI reply suggestion";
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
        this.showMessage(composer, "Quota exceeded. Upgrade your plan to continue.", "error");
        return;
      }
      const tweetText = this.extractTweetText();
      if (!tweetText) {
        this.showMessage(composer, "Could not find the tweet to reply to", "error");
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
        const response = await this.apiClient.generateReply({
          tweet_text: tweetText,
          tweet_id: this.extractTweetId(),
          model_key: options.modelKey,
          prompt_variation: options.promptVariation,
          author_info: authorInfo,
          conversation_context: conversationContext,
          tweet_metadata: tweetMetadata
        });
        this.insertReplyIntoComposer(composer, {
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
        if (error.message.includes("401")) {
          this.isAuthenticated = false;
          this.showMessage(composer, "Please sign in again", "error");
        } else if (error.message.includes("402")) {
          this.showMessage(composer, "Quota exceeded - upgrade your plan", "error");
        } else if (error.message.includes("Network error")) {
          this.showMessage(composer, "Network error - check your connection", "error");
        } else {
          this.showMessage(composer, `Failed to generate reply: ${error.message}`, "error");
        }
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
      return urlMatch ? urlMatch[1] : null;
    }
    extractAuthorInfo() {
      try {
        const authorElement = document.querySelector('[data-testid="User-Name"]');
        if (!authorElement) return null;
        const username = authorElement.textContent?.trim() || "";
        const verifiedIcon = authorElement.querySelector('[data-testid="icon-verified"]');
        const isVerified = !!verifiedIcon;
        let followerCount = null;
        const bioElement = document.querySelector('[data-testid="UserDescription"]');
        if (bioElement) {
          const followerMatch = bioElement.textContent?.match(/(\d+(?:\.\d+)?[KMB]?)\s*followers?/i);
          if (followerMatch) {
            followerCount = followerMatch[1];
          }
        }
        return {
          username,
          verified: isVerified,
          follower_count: followerCount
        };
      } catch (error) {
        console.error("Failed to extract author info:", error);
        return null;
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
    insertReplyIntoComposer(composer, replyData) {
      const replyText = typeof replyData === "string" ? replyData : replyData.reply;
      const qualityScore = typeof replyData === "object" ? replyData.qualityScore : null;
      if (composer.contentEditable === "true") {
        composer.focus();
        composer.textContent = replyText;
        const inputEvent = new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          data: replyText
        });
        composer.dispatchEvent(inputEvent);
      } else if (composer.tagName === "TEXTAREA") {
        composer.focus();
        composer.value = replyText;
        const inputEvent = new Event("input", { bubbles: true });
        composer.dispatchEvent(inputEvent);
      } else {
        const input = composer.querySelector('textarea, [contenteditable="true"]');
        if (input) {
          this.insertReplyIntoComposer(input, replyData);
        }
      }
      if (qualityScore) {
        this.showQualityBadge(composer, qualityScore);
      }
    }
    showQualityBadge(composer, score) {
      const existingBadge = composer.parentElement?.querySelector(".tweetreply-quality-badge");
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
