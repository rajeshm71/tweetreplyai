"use strict";
(() => {
  // extension-linkedin/utils/auth.js
  var AuthManager = class {
    constructor() {
      this.token = null;
      this.authStatusCache = null;
      this.cacheExpiry = 0;
      this.apiClient = null;
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
        const hasToken = response.authenticated;
        this.token = response.token;
        if (!hasToken) {
          this.authStatusCache = false;
          this.cacheExpiry = Date.now() + 3e4;
          return false;
        }
        if (validateWithServer && this.apiClient) {
          try {
            await this.apiClient.getCurrentUser();
            this.authStatusCache = true;
            this.cacheExpiry = Date.now() + 3e4;
            return true;
          } catch (error) {
            if (error.message && error.message.includes("401")) {
              console.log("[Auth] Token validation failed (401), auto-logging out");
              await this.signOut();
              this.authStatusCache = false;
              this.cacheExpiry = Date.now() + 3e4;
              return false;
            }
            this.authStatusCache = false;
            this.cacheExpiry = Date.now() + 3e4;
            return false;
          }
        }
        this.authStatusCache = hasToken;
        this.cacheExpiry = Date.now() + 3e4;
        return hasToken;
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
  var DEFAULTS = {
    ANALYTICS_DAYS: 30,
    REPLY_HISTORY_LIMIT: 50
  };
  var VALIDATION = {
    MIN_POST_LENGTH: 20,
    MAX_POST_LENGTH: 700
  };
  var AUTH = {
    TOKEN_EXPIRY_MS: 7 * 24 * 60 * 60 * 1e3,
    ONE_DAY_MS: 24 * 60 * 60 * 1e3
  };
  var LINKEDIN = {
    PLATFORM: "linkedin",
    MAX_REPLY_WORDS: 60
  };

  // extension-linkedin/utils/api.js
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
    async getUsage() {
      return this.makeRequest("/api/usage");
    }
    async generateReply(data) {
      return this.makeRequest("/api/generate-reply", {
        method: "POST",
        body: { ...data, platform: LINKEDIN.PLATFORM }
      });
    }
    async createBillingPortal() {
      const response = await this.makeRequest("/api/billing/portal", {
        method: "POST"
      });
      return response.portal_url;
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
    async getReplyHistory(limit = DEFAULTS.REPLY_HISTORY_LIMIT) {
      return this.makeRequest(`/api/reply-history?limit=${limit}`);
    }
  };

  // extension-linkedin/content/linkedin-content.js
  var LOG_PREFIX = "[LinkedInReply]";
  var BUTTON_CLASS = "li-ai-reply-btn";
  var BUTTON_WRAPPER_CLASS = "li-ai-reply-btn-wrapper";
  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }
  function safeTruncate(str, maxLen) {
    if (!str || str.length <= maxLen) return str;
    const code = str.charCodeAt(maxLen - 1);
    if (code >= 55296 && code <= 56319) maxLen -= 1;
    return str.substring(0, maxLen);
  }
  var LinkedInReplyInjector = class {
    constructor() {
      if (window.__linkedInReplyInjector) {
        return window.__linkedInReplyInjector;
      }
      this.authManager = new AuthManager();
      this.apiClient = new ApiClient();
      this.isAuthenticated = false;
      this.observer = null;
      this._scanTimer = null;
      window.__linkedInReplyInjector = this;
      this.initialize();
    }
    // ─── Initialization ──────────────────────────────────────────────────────────
    async initialize() {
      try {
        this.isAuthenticated = await this.authManager.isAuthenticated();
      } catch (_) {
        this.isAuthenticated = false;
      }
      chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "authUpdated") {
          this.authManager.clearCache();
          this.authManager.isAuthenticated().then((isAuth) => {
            this.isAuthenticated = isAuth;
          });
        }
      });
      this.startObserving();
      this.scanForEditors();
    }
    // ─── DOM Observation ─────────────────────────────────────────────────────────
    startObserving() {
      this.observer = new MutationObserver(() => {
        if (this._scanTimer) clearTimeout(this._scanTimer);
        this._scanTimer = setTimeout(() => {
          this.scanForEditors();
          this._scanTimer = null;
        }, TIMEOUTS.DOM_DEBOUNCE_MS);
      });
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
    scanForEditors() {
      const editors = document.querySelectorAll('.ql-editor[contenteditable="true"]');
      for (const editor of editors) {
        const form = this.findCommentForm(editor);
        if (!form) continue;
        if (form.querySelector(`.${BUTTON_CLASS}`)) continue;
        this.injectButton(editor, form);
      }
    }
    findCommentForm(editor) {
      return editor.closest(".comments-comment-box__form") || editor.closest(".comments-reply-box__form") || editor.closest("form") || editor.closest('[class*="comment-box"]');
    }
    // ─── Button Injection ────────────────────────────────────────────────────────
    injectButton(editor, form) {
      const wrapper = document.createElement("div");
      wrapper.className = BUTTON_WRAPPER_CLASS;
      const btn = document.createElement("button");
      btn.className = BUTTON_CLASS;
      btn.setAttribute("type", "button");
      btn.setAttribute("aria-label", "Generate AI reply with LinkedIn Reply AI");
      btn.innerHTML = `
      <span class="li-ai-btn-icon" aria-hidden="true">\u2728</span>
      <span class="li-ai-btn-text">Generate Reply</span>
    `;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleGenerateReply(editor, btn);
      });
      wrapper.appendChild(btn);
      const submitBtn = form.querySelector('button[type="submit"]') || form.querySelector(".comments-comment-box__submit-button") || form.querySelector('[class*="submit-button"]');
      if (submitBtn?.parentElement) {
        submitBtn.parentElement.insertBefore(wrapper, submitBtn);
      } else {
        form.appendChild(wrapper);
      }
      log("Button injected for editor placeholder:", editor.dataset.placeholder || "comment box");
    }
    // ─── Reply Generation ────────────────────────────────────────────────────────
    async handleGenerateReply(editor, btn) {
      if (!this.isAuthenticated) {
        this.isAuthenticated = await this.authManager.isAuthenticated();
      }
      if (!this.isAuthenticated) {
        this.setButtonState(btn, "error", "Sign in required");
        return;
      }
      const context = this.extractContext(editor);
      if (!context.postText || context.postText.length < VALIDATION.MIN_POST_LENGTH) {
        log("Post text not found or too short:", context.postText?.length ?? 0);
        this.setButtonState(btn, "error", "Post text not found");
        return;
      }
      log("Context extracted:", {
        preview: context.postText.substring(0, 80),
        postId: context.postId,
        author: context.authorName,
        isOA: context.viewerIsOA,
        hasThread: !!context.threadContext,
        viewerIsOA: context.viewerIsOA,
        threadLength: context.threadContext?.threadLength
      });
      this.setButtonState(btn, "loading");
      try {
        let liPromptVariation = "default";
        try {
          const stored = await chrome.storage?.local?.get(["liPromptVariation"]);
          if (stored?.liPromptVariation) liPromptVariation = stored.liPromptVariation;
        } catch (e) {
          log("chrome.storage unavailable, using default variation");
        }
        const payload = {
          tweet_text: context.postText,
          tweet_id: context.postId || "",
          author_info: { username: context.authorName },
          prompt_variation: liPromptVariation,
          viewer_is_original_author: context.viewerIsOA
        };
        if (context.threadContext) {
          payload.thread_context = context.threadContext;
        }
        const commentOnComment = !!(context.threadContext?.isReply && context.threadContext?.threadLength > 1);
        log("handleGenerateReply: payload summary", {
          viewer_is_original_author: payload.viewer_is_original_author,
          isOther: !payload.viewer_is_original_author,
          hasThreadContext: !!payload.thread_context,
          threadContext: payload.thread_context ? { isReply: payload.thread_context.isReply, threadLength: payload.thread_context.threadLength, chainLen: payload.thread_context.threadChain?.length } : null,
          commentOnCommentRecognized: commentOnComment
        });
        const response = await this.apiClient.generateReply(payload);
        const reply = response?.reply || response?.tweet;
        if (reply) {
          this.insertTextIntoEditor(editor, reply);
          this.setButtonState(btn, "done", "Reply Added \u2713");
          setTimeout(() => this.setButtonState(btn, "default"), 2500);
        } else {
          this.setButtonState(btn, "error", "No reply generated");
        }
      } catch (error) {
        log("Error generating reply:", error.message);
        if (error.message?.includes("402")) {
          this.setButtonState(btn, "error", "Quota exceeded");
        } else if (error.message?.includes("401")) {
          this.isAuthenticated = false;
          this.authManager.clearCache();
          this.setButtonState(btn, "error", "Sign in required");
        } else {
          this.setButtonState(btn, "error", "Error \u2014 try again");
        }
      }
    }
    // ─── Context Extraction ──────────────────────────────────────────────────────
    extractContext(editor) {
      const ctx = {
        postText: "",
        postId: null,
        authorName: "",
        viewerIsOA: false,
        threadContext: null
      };
      log("extractContext: starting", { placeholder: editor.dataset?.placeholder?.substring(0, 40) });
      const postContainer = this.findPostContainer(editor);
      if (!postContainer) {
        log("extractContext: could not find post container from editor");
        return ctx;
      }
      log("extractContext: postContainer found", { tag: postContainer.tagName, urn: postContainer.getAttribute?.("data-urn")?.substring(0, 60) });
      ctx.postText = this.extractPostText(postContainer);
      ctx.postId = this.extractPostId(postContainer);
      ctx.authorName = this.extractAuthorName(postContainer);
      log("extractContext: post", { postTextLen: ctx.postText?.length ?? 0, postId: ctx.postId?.substring(0, 40), author: ctx.authorName?.substring(0, 30) });
      ctx.viewerIsOA = this.detectViewerIsOA(postContainer);
      log("extractContext: viewerIsOA (is other = !viewerIsOA)", { viewerIsOA: ctx.viewerIsOA, isOther: !ctx.viewerIsOA });
      ctx.threadContext = this.buildThreadContext(editor, postContainer);
      log("extractContext: threadContext", {
        hasThread: !!ctx.threadContext,
        threadLength: ctx.threadContext?.threadLength ?? 0,
        isReply: ctx.threadContext?.isReply ?? false,
        commentOnCommentRecognized: !!(ctx.threadContext?.isReply && ctx.threadContext?.threadLength > 1)
      });
      return ctx;
    }
    /**
     * Returns true only for activity URNs (feed posts). Rejects comment URNs so we don't
     * treat a comment container as the post when replying to a comment.
     */
    isActivityUrn(urn) {
      if (!urn || typeof urn !== "string") return false;
      if (!urn.startsWith("urn:li:activity:")) return false;
      if (urn.includes("comment") || urn.includes("fsd_comment")) return false;
      return true;
    }
    findPostContainer(editor) {
      let el = editor.parentElement;
      while (el && el !== document.body) {
        if (el.hasAttribute("data-urn") || el.classList.contains("feed-shared-update-v2") || el.classList.contains("occludable-update") || el.classList.contains("main-feed-activity-card")) {
          const urnEl = el.hasAttribute("data-urn") ? el : el.querySelector("[data-urn]");
          const urn = urnEl?.getAttribute("data-urn");
          if (this.isActivityUrn(urn)) {
            log("findPostContainer: found activity URN (walk-up)", urn?.substring(0, 50));
            return el;
          }
          log("findPostContainer: skipping non-activity URN", urn?.substring(0, 50));
        }
        el = el.parentElement;
      }
      const allUrns = document.querySelectorAll("[data-urn]");
      for (const urnEl of allUrns) {
        const urn = urnEl.getAttribute("data-urn");
        if (this.isActivityUrn(urn) && urnEl.contains(editor)) {
          log("findPostContainer: found activity URN (fallback)", urn?.substring(0, 50));
          return urnEl;
        }
      }
      const articleOrMain = editor.closest("article") || document.querySelector("main");
      log("findPostContainer: using article/main fallback", !!articleOrMain);
      if (!articleOrMain) {
        let chain = [];
        let p = editor.parentElement;
        for (let i = 0; i < 8 && p; i++) {
          chain.push(p.tagName + (p.className && typeof p.className === "string" ? "." + p.className.split(/\s+/).slice(0, 2).join(".") : ""));
          p = p.parentElement;
        }
        log("findPostContainer: no container; parent chain", chain.join(" <- "));
      }
      return articleOrMain;
    }
    extractPostText(container) {
      const selectors = [
        ".feed-shared-update-v2__description .break-words",
        ".update-components-text .break-words",
        ".feed-shared-text-view .break-words",
        ".feed-shared-update-v2__description",
        ".update-components-text",
        ".feed-shared-inline-show-more-text .break-words",
        ".attributed-text-segment-list__content",
        '[data-test-id="main-feed-activity-card__commentary"]'
      ];
      for (const sel of selectors) {
        const el = container.querySelector(sel);
        if (el) {
          const text = el.textContent?.trim();
          if (text && text.length > 10) {
            return safeTruncate(text, VALIDATION.MAX_POST_LENGTH);
          }
        }
      }
      return "";
    }
    extractPostId(container) {
      const urnEl = container.hasAttribute("data-urn") ? container : container.querySelector("[data-urn]");
      if (urnEl) return urnEl.getAttribute("data-urn");
      const idEl = container.querySelector("[data-id]");
      if (idEl) return idEl.getAttribute("data-id");
      return null;
    }
    extractAuthorName(container) {
      const selectors = [
        '.update-components-actor__name span[dir="ltr"]',
        '.feed-shared-actor__name span[dir="ltr"]',
        ".update-components-actor__name",
        ".feed-shared-actor__name"
      ];
      for (const sel of selectors) {
        const el = container.querySelector(sel);
        if (el) {
          const text = (el.firstChild?.nodeType === Node.TEXT_NODE ? el.firstChild.textContent : el.textContent)?.trim().split("\n")[0];
          if (text) return text;
        }
      }
      return "";
    }
    /**
     * Detects if the viewer is the original author of the post.
     * Can be wrong when the overflow menu was never opened (Edit/Delete not in DOM).
     * The "You" fallback is best-effort.
     */
    detectViewerIsOA(container) {
      const indicators = [
        '[aria-label*="Edit post"]',
        '[aria-label*="Delete post"]',
        '[aria-label*="Edit article"]'
      ];
      for (const sel of indicators) {
        if (container.querySelector(sel)) {
          log("detectViewerIsOA: OA detected via Edit/Delete selector", sel);
          return true;
        }
      }
      const actorSelectors = [
        '.update-components-actor__name span[dir="ltr"]',
        '.feed-shared-actor__name span[dir="ltr"]',
        ".update-components-actor__name",
        ".feed-shared-actor__name"
      ];
      for (const sel of actorSelectors) {
        const el = container.querySelector(sel);
        if (el) {
          const text = (el.firstChild?.nodeType === Node.TEXT_NODE ? el.firstChild.textContent : el.textContent)?.trim().split("\n")[0] ?? "";
          if (text === "You" || /^You\b/.test(text)) {
            log('detectViewerIsOA: OA detected via actor "You" fallback');
            return true;
          }
        }
      }
      log('detectViewerIsOA: not OA (viewer is "other")', { checkedEditDelete: true, checkedYouFallback: true });
      return false;
    }
    /**
     * Returns true if the form is inside LinkedIn's "comment reply" wrapper (comments-comment-box--cr).
     */
    isReplyToCommentForm(form) {
      return !!this.getReplyWrapperElement(form);
    }
    /**
     * Returns the ancestor element that has comments-comment-box--cr (the reply wrapper).
     * Used to find the parent comment via previousElementSibling of this wrapper.
     */
    getReplyWrapperElement(form) {
      if (!form) return null;
      let el = form.parentElement;
      for (let i = 0; i < 15 && el; i++) {
        const cls = el.className && typeof el.className === "string" ? el.className : "";
        if (cls.includes("comments-comment-box--cr") || cls.includes("comment-box--cr")) return el;
        el = el.parentElement;
      }
      return null;
    }
    /**
     * Uses the editor placeholder to decide: "Add a comment..." = comment on post, "Add a reply..." = reply to comment.
     * Returns 'comment' | 'reply' | null (null = unknown, fall back to DOM).
     */
    getPlaceholderIntent(editor) {
      const raw = (editor?.dataset?.placeholder ?? editor?.getAttribute?.("data-placeholder") ?? "").trim().toLowerCase();
      if (!raw) return null;
      if (raw.includes("reply") || raw.includes("r\xE9pondre")) return "reply";
      if (raw.includes("comment")) return "comment";
      return null;
    }
    buildThreadContext(editor, postContainer) {
      const form = this.findCommentForm(editor);
      const formClass = form?.className ?? "(no form)";
      log("buildThreadContext: form", { hasForm: !!form, formClass: typeof formClass === "string" ? formClass.substring(0, 80) : formClass });
      const placeholderIntent = this.getPlaceholderIntent(editor);
      if (placeholderIntent === "comment") {
        log("Detected: reply-to-post (comment on post)", { reason: 'placeholder indicates "Add a comment..."' });
        return null;
      }
      if (placeholderIntent === "reply") {
        log("Detected: reply-to-comment", { reason: 'placeholder indicates "Add a reply..."' });
      }
      const commentItem = editor.closest(".comments-comment-item") || editor.closest('[class*="reply-container"]');
      const isReplyBoxForm = !!(form?.classList?.contains?.("comments-reply-box__form") || form?.className?.includes?.("comments-reply-box"));
      const isCrWrapper = this.isReplyToCommentForm(form);
      const isReplyToCommentByDom = !!commentItem || isReplyBoxForm || isCrWrapper;
      if (placeholderIntent === null && !isReplyToCommentByDom) {
        log("Detected: reply-to-post", { reason: "placeholder unknown and no reply DOM cues" });
        return null;
      }
      if (placeholderIntent === null && isReplyToCommentByDom) {
        log("Detected: reply-to-comment", {
          reason: commentItem ? "editor inside comment item" : isReplyBoxForm ? "reply-box form" : "comments-comment-box--cr wrapper"
        });
      }
      log("buildThreadContext: commentItem", { found: !!commentItem, via: commentItem ? editor.closest(".comments-comment-item") ? "comments-comment-item" : "reply-container" : "none" });
      const commentBodySelectors = [
        ".comments-comment-item__main-content",
        ".comments-comment-item__description",
        ".comments-comment-item__content",
        ".comments-comment-item .update-components-text",
        ".feed-shared-main-content",
        '[class*="comment-item__main-content"]',
        '[class*="comment-item__description"]',
        '[class*="comment-item__content"]',
        '[class*="main-content"]'
      ];
      function getCommentTextFromRoot(root) {
        if (!root) return null;
        for (const sel of commentBodySelectors) {
          const el = root.querySelector?.(sel) || (root.matches?.(sel) ? root : null);
          if (el) {
            const t = el.textContent?.trim();
            if (t && t.length >= 5) return t;
          }
        }
        const item = root.matches?.(".comments-comment-item") ? root : root.querySelector?.(".comments-comment-item");
        if (item) {
          const clone = item.cloneNode(true);
          clone.querySelectorAll("form, button, .ql-editor, .comments-comment-box").forEach((el) => el.remove());
          const t = clone.textContent?.trim();
          if (t && t.length >= 5) return t;
        }
        return null;
      }
      let commentText = null;
      if (commentItem) {
        const commentContent = commentItem.querySelector(".comments-comment-item__main-content") || commentItem.querySelector(".feed-shared-main-content") || commentItem.previousElementSibling?.querySelector(".comments-comment-item__main-content");
        commentText = commentContent?.textContent?.trim();
        log("buildThreadContext: commentItem found", commentText ? `comment length ${commentText.length}` : "no body");
      } else if (isReplyBoxForm) {
        log("buildThreadContext: reply-to-comment path (comments-reply-box); form class:", form?.className?.substring(0, 80));
        let searchRoot = form.previousElementSibling || form.parentElement;
        while (searchRoot && !commentText) {
          commentText = getCommentTextFromRoot(searchRoot);
          if (commentText) log("buildThreadContext: reply-box fallback found comment", commentText.length, "chars");
          if (!commentText) searchRoot = searchRoot.parentElement;
        }
        if (!commentText) log("buildThreadContext: reply-box fallback could not find comment text");
      } else if (isCrWrapper) {
        const replyWrapper = this.getReplyWrapperElement(form);
        log("buildThreadContext: reply-to-comment path (--cr wrapper); replyWrapper:", !!replyWrapper);
        if (replyWrapper?.previousElementSibling) {
          commentText = getCommentTextFromRoot(replyWrapper.previousElementSibling);
          if (commentText) log("buildThreadContext: --cr found comment via wrapper.previousElementSibling", commentText.length, "chars");
          if (!commentText) {
            const item = replyWrapper.previousElementSibling.querySelector?.(".comments-comment-item");
            if (item) commentText = getCommentTextFromRoot(item);
            if (commentText) log("buildThreadContext: --cr found comment via .comments-comment-item in previous sibling", commentText.length, "chars");
          }
        }
        if (!commentText) {
          let searchRoot = form?.parentElement?.previousElementSibling ?? form?.previousElementSibling ?? replyWrapper ?? form?.parentElement;
          for (let steps = 0; steps < 8 && searchRoot && !commentText; steps++) {
            commentText = getCommentTextFromRoot(searchRoot);
            if (commentText) {
              log("buildThreadContext: --cr fallback found comment (walk)", commentText.length, "chars");
              break;
            }
            const commentItemEl = searchRoot.querySelector?.(".comments-comment-item");
            if (commentItemEl) commentText = getCommentTextFromRoot(commentItemEl);
            if (commentText) {
              log("buildThreadContext: --cr fallback found comment via .comments-comment-item", commentText.length, "chars");
              break;
            }
            searchRoot = searchRoot.previousElementSibling || searchRoot.parentElement;
          }
        }
        if (!commentText && replyWrapper) {
          let prev = replyWrapper.previousElementSibling;
          for (let w = 0; w < 12 && prev; w++) {
            const item = prev.classList?.contains?.("comments-comment-item") ? prev : prev.querySelector?.(".comments-comment-item");
            if (item) {
              commentText = getCommentTextFromRoot(item);
              if (commentText) {
                log("buildThreadContext: --cr found comment via walk-back from wrapper", commentText.length, "chars");
                break;
              }
            }
            prev = prev.previousElementSibling;
          }
        }
        if (!commentText) {
          log(
            "buildThreadContext: --cr all strategies failed; wrapper outerHTML prefix:",
            replyWrapper?.outerHTML?.substring(0, 400)
          );
        }
      }
      if (!commentText || commentText.length < 5) {
        log("buildThreadContext: returning null", { reason: !commentText ? "no commentText" : "commentText too short", len: commentText?.length ?? 0 });
        return null;
      }
      const originalPostText = this.extractPostText(postContainer);
      const built = {
        isReply: true,
        originalTweet: originalPostText || null,
        originalTweetAuthor: null,
        threadChain: [
          { text: originalPostText || "", author: "unknown", isOriginal: true, isCurrent: false },
          { text: safeTruncate(commentText, 300), author: "unknown", isOriginal: false, isCurrent: true }
        ],
        currentTweetIndex: 1,
        threadLength: 2
      };
      log("buildThreadContext: built thread (comment-on-comment recognized)", { threadLength: built.threadLength, commentPreviewLen: commentText.length });
      return built;
    }
    // ─── Text Insertion ──────────────────────────────────────────────────────────
    insertTextIntoEditor(editor, text) {
      editor.focus();
      const quill = this.getQuillInstance(editor);
      if (quill) {
        try {
          quill.setText(text);
          quill.setSelection(text.length, 0);
          log("Text inserted via Quill API");
          return;
        } catch (e) {
          log("Quill API failed, trying execCommand:", e.message);
        }
      }
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        selection.removeAllRanges();
        selection.addRange(range);
        const inserted = document.execCommand("insertText", false, text);
        if (inserted) {
          log("Text inserted via execCommand");
          return;
        }
      } catch (e) {
        log("execCommand failed:", e.message);
      }
      editor.innerHTML = `<p>${text}</p>`;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      log("Text inserted via innerHTML fallback");
    }
    getQuillInstance(editor) {
      const container = editor.closest(".ql-container");
      if (!container) return null;
      if (container.__quill) return container.__quill;
      const parent = container.parentElement;
      if (parent?.__quill) return parent.__quill;
      return null;
    }
    // ─── Button States ───────────────────────────────────────────────────────────
    setButtonState(btn, state, message) {
      const textEl = btn.querySelector(".li-ai-btn-text");
      btn.disabled = false;
      btn.classList.remove(
        `${BUTTON_CLASS}--loading`,
        `${BUTTON_CLASS}--done`,
        `${BUTTON_CLASS}--error`
      );
      switch (state) {
        case "loading":
          if (textEl) textEl.textContent = "Generating\u2026";
          btn.disabled = true;
          btn.classList.add(`${BUTTON_CLASS}--loading`);
          break;
        case "done":
          if (textEl) textEl.textContent = message || "Reply Added \u2713";
          btn.classList.add(`${BUTTON_CLASS}--done`);
          break;
        case "error":
          if (textEl) textEl.textContent = message || "Error \u2014 try again";
          btn.classList.add(`${BUTTON_CLASS}--error`);
          setTimeout(() => this.setButtonState(btn, "default"), 3e3);
          break;
        default:
          if (textEl) textEl.textContent = "Generate Reply";
      }
    }
    destroy() {
      this.observer?.disconnect();
      if (this._scanTimer) clearTimeout(this._scanTimer);
    }
  };
  new LinkedInReplyInjector();
})();
