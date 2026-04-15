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
  var DEBUG_INJECTION = true;
  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }
  function injectLog(...args) {
    if (DEBUG_INJECTION) console.log(LOG_PREFIX, "[inject]", ...args);
  }
  function describeEditorChain(editor, depth = 4) {
    const parts = [];
    let el = editor;
    for (let i = 0; i < depth && el; i += 1) {
      const cls = el.className ? String(el.className).trim().split(/\s+/).slice(0, 4).join(".") : "";
      parts.push(`${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`);
      el = el.parentElement;
    }
    return parts.join(" <- ");
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
      this._loggedInUser = null;
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
      injectLog("initialize: authenticated =", this.isAuthenticated);
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
      const tiptapWrappers = document.querySelectorAll('[data-testid="ui-core-tiptap-text-editor-wrapper"]');
      const qlEditable = document.querySelectorAll('.ql-editor[contenteditable="true"]');
      const qlAny = document.querySelectorAll(".ql-editor");
      const editorSet = /* @__PURE__ */ new Set();
      for (const wrapper of tiptapWrappers) {
        const inner = wrapper.querySelector('[role="textbox"][contenteditable="true"]');
        if (inner) editorSet.add(inner);
      }
      for (const ql of qlEditable) {
        editorSet.add(ql);
      }
      let skippedNoForm = 0;
      let skippedAlready = 0;
      let injected = 0;
      let firstNoFormEditor = null;
      for (const editor of editorSet) {
        const form = this.findCommentForm(editor);
        if (!form) {
          skippedNoForm += 1;
          if (!firstNoFormEditor) firstNoFormEditor = editor;
          continue;
        }
        if (form.querySelector(`.${BUTTON_CLASS}`)) {
          skippedAlready += 1;
          continue;
        }
        this.injectButton(editor, form);
        injected += 1;
      }
      injectLog(
        "scan:",
        `tiptap=${tiptapWrappers.length} matched=${editorSet.size} qlEditable=${qlEditable.length} qlAny=${qlAny.length} noForm=${skippedNoForm} already=${skippedAlready} injected=${injected}`
      );
      if (editorSet.size === 0) {
        injectLog(
          "hint: no editors found \u2014 open/focus a comment box to activate the TipTap or Quill editor"
        );
      }
      if (skippedNoForm > 0 && firstNoFormEditor) {
        injectLog("findCommentForm=null; first editor chain:", describeEditorChain(firstNoFormEditor));
      }
    }
    findCommentForm(editor) {
      const tiptapWrapper = editor.closest('[data-testid="ui-core-tiptap-text-editor-wrapper"]');
      if (tiptapWrapper) return tiptapWrapper.parentElement;
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
      const submitBtn = form.querySelector('button[type="submit"]') || form.querySelector(".comments-comment-box__submit-button") || form.querySelector('button[aria-label*="Post"]') || form.querySelector('button[aria-label*="Reply"]') || form.querySelector('[class*="submit-button"]') || [...form.querySelectorAll("button")].find(
        (b) => (b.innerText?.trim() === "Post" || b.innerText?.trim() === "Reply") && !b.closest('[data-testid="ui-core-tiptap-text-editor-wrapper"]')
      );
      if (submitBtn?.parentElement) {
        submitBtn.parentElement.insertBefore(wrapper, submitBtn);
        injectLog(
          "placed before submit:",
          submitBtn.className?.slice?.(0, 80) || submitBtn.getAttribute?.("data-test-id") || "submit"
        );
      } else {
        form.appendChild(wrapper);
        injectLog("placed via form.appendChild (no submit anchor found)");
      }
      log("Button injected for editor placeholder:", editor.getAttribute("aria-label") || editor.dataset?.placeholder || "comment box");
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
      log("extractContext: starting", { placeholder: (editor.getAttribute("aria-label") || editor.dataset?.placeholder || "")?.substring(0, 40) });
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
      if (ctx.authorName) log("extractContext: post author", { author: ctx.authorName.substring(0, 40) });
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
     * Returns true only for post-level URNs (activity or ugcPost). Rejects comment URNs.
     * LinkedIn uses urn:li:activity: for articles/shares and urn:li:ugcPost: for regular posts.
     */
    isActivityUrn(urn) {
      if (!urn || typeof urn !== "string") return false;
      if (urn.includes("comment") || urn.includes("fsd_comment")) return false;
      return urn.startsWith("urn:li:activity:") || urn.startsWith("urn:li:ugcPost:");
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
      let tiptapEl = editor.parentElement;
      while (tiptapEl && tiptapEl !== document.body) {
        const fp = tiptapEl.querySelector('[data-testid*="ReactionFacepileCollection-urn:li:"]');
        if (fp) {
          let postCard = fp.closest("div");
          while (postCard && postCard !== tiptapEl && !postCard.querySelector('[data-testid="expandable-text-box"]')) {
            postCard = postCard.parentElement;
          }
          if (!postCard || postCard === tiptapEl) {
            const directChildWithFp = [...tiptapEl.children].find(
              (c) => c.querySelector('[data-testid*="ReactionFacepileCollection-urn:li:"]')
            );
            if (directChildWithFp) {
              if (directChildWithFp.tagName === "A" && directChildWithFp.parentElement) {
                postCard = directChildWithFp.parentElement;
              } else {
                postCard = directChildWithFp;
              }
            } else {
              postCard = tiptapEl;
            }
          }
          const container = postCard || tiptapEl;
          log("findPostContainer: found via ReactionFacepile boundary", {
            ancestorTag: tiptapEl.tagName,
            narrowedTag: container.tagName,
            narrowed: container !== tiptapEl
          });
          return container;
        }
        tiptapEl = tiptapEl.parentElement;
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
        '[data-testid="expandable-text-box"]',
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
          if (el.closest('[data-testid="ui-core-tiptap-text-editor-wrapper"]')) continue;
          const text = el.textContent?.trim();
          if (text && text.length > 10) {
            log("extractPostText: matched", { selector: sel, preview: text.substring(0, 80) });
            return safeTruncate(text, VALIDATION.MAX_POST_LENGTH);
          }
        }
      }
      log("extractPostText: no selector matched \u2014 returning empty string");
      return "";
    }
    extractPostId(container) {
      const facepile = container.querySelector('[data-testid*="ReactionFacepileCollection-urn:li:activity:"]');
      if (facepile) {
        const urn = facepile.getAttribute("data-testid")?.replace("ReactionFacepileCollection-", "");
        if (urn) return urn;
      }
      const urnEl = container.hasAttribute("data-urn") ? container : container.querySelector("[data-urn]");
      if (urnEl) return urnEl.getAttribute("data-urn");
      const idEl = container.querySelector("[data-id]");
      if (idEl) return idEl.getAttribute("data-id");
      return null;
    }
    /**
     * Extract post author display name from the post container (DOM-aligned with LINKEDIN-DOM-SCAN).
     * Scoped to container so we get the author of the specific post, not another card/comment.
     */
    extractAuthorName(container) {
      if (!container) return "";
      let name = "";
      const tiptapAuthorLink = [...container.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')].find((a) => a.innerText?.trim().length > 0);
      if (tiptapAuthorLink) {
        const firstLine = tiptapAuthorLink.innerText.trim().split("\n")[0]?.trim();
        if (firstLine && firstLine.length > 1 && !firstLine.startsWith("http")) {
          name = firstLine;
        }
      }
      if (name) return name;
      const actorEl = container.querySelector('[class*="update-components-actor"]') || container.querySelector(".feed-shared-actor");
      if (actorEl) {
        const nameSpan = [...actorEl.querySelectorAll("span")].find((el) => {
          if (el.getAttribute("aria-hidden") !== "true") return false;
          if (el.children.length !== 0) return false;
          const t = el.innerText?.trim();
          if (!t || t.length === 0) return false;
          const cls = typeof el.className === "string" ? el.className : "";
          if (cls.includes("visually-hidden")) return false;
          return true;
        });
        if (nameSpan) {
          const t = (nameSpan.innerText?.trim() || "").split("\n")[0]?.trim();
          if (t) name = t;
        }
        if (!name) {
          const profileLink = actorEl.querySelector('a[href*="/in/"], a[href*="/company/"]');
          const ariaLabel = profileLink?.getAttribute("aria-label")?.trim();
          if (ariaLabel) {
            const cleaned = ariaLabel.replace(/^View\s+/, "").replace(/'s\s+.*$/i, "").trim();
            if (cleaned) name = cleaned;
          }
        }
      }
      if (!name) {
        const selectors = [
          '.update-components-actor__name span[dir="ltr"]',
          '.feed-shared-actor__name span[dir="ltr"]',
          ".update-components-actor__name",
          ".feed-shared-actor__name"
        ];
        for (const sel of selectors) {
          const el = container.querySelector(sel);
          if (el) {
            const text = (el.firstChild?.nodeType === Node.TEXT_NODE ? el.firstChild.textContent : el.textContent)?.trim().split("\n")[0]?.trim();
            if (text) {
              name = text;
              break;
            }
          }
        }
      }
      return name || "";
    }
    /**
     * Get logged-in user from DOM (LINKEDIN-DOM-SCAN getLoggedInUser strategies, DOM-only).
     * Cached on instance for OA detection. Used to compare with post author.
     */
    getLoggedInUserFromDOM() {
      if (this._loggedInUser !== null) return this._loggedInUser;
      let name = "";
      let slug = null;
      let profileUrl = null;
      let link = null;
      const selfAvatar = [...document.querySelectorAll('img[src*="profile-displayphoto"]')].find((img) => img.alt?.length > 0 && !img.alt.startsWith("View"));
      if (selfAvatar) {
        const avatarName = selfAvatar.alt.trim();
        let avatarEl = selfAvatar.parentElement;
        for (let d = 0; d < 8; d++) {
          const lnk = (avatarEl?.matches?.('a[href*="/in/"]') ? avatarEl : null) ?? avatarEl?.querySelector('a[href*="/in/"]');
          if (lnk) {
            const raw = lnk.href || "";
            profileUrl = raw.split("?")[0] || null;
            slug = profileUrl?.match(/\/in\/([^/?]+)/)?.[1] || null;
            log("getLoggedInUserFromDOM: Strategy 0 (avatar) succeeded", { name: avatarName, slug, profileUrl: profileUrl?.substring(0, 50) });
            this._loggedInUser = { name: avatarName, slug, profileUrl };
            return this._loggedInUser;
          }
          avatarEl = avatarEl?.parentElement;
        }
      }
      const navLink = document.querySelector('[class*="global-nav__me"] a[href*="/in/"]');
      const navImg = document.querySelector('[class*="global-nav__me"] img') || document.querySelector(".global-nav__me-photo");
      if (navLink) {
        link = navLink;
        const raw = link.href || "";
        profileUrl = raw.split("?")[0] || null;
        slug = profileUrl && profileUrl.match(/\/in\/([^/?]+)/) ? profileUrl.match(/\/in\/([^/?]+)/)[1] : null;
        if (navImg && navImg.alt) name = navImg.alt.trim();
        log("getLoggedInUserFromDOM: Strategy 1 (nav) found link", { slug, name, profileUrl: profileUrl?.substring(0, 50) });
      }
      if (!link) {
        const withImg = [...document.querySelectorAll('a[href*="/in/"]')].filter((a) => a.querySelector("img"));
        const selfLink = withImg[0];
        if (selfLink) {
          link = selfLink;
          const raw = link.href || "";
          profileUrl = raw.split("?")[0] || null;
          slug = profileUrl && profileUrl.match(/\/in\/([^/?]+)/) ? profileUrl.match(/\/in\/([^/?]+)/)[1] : null;
          const selfImg = selfLink.querySelector("img");
          if (!name && selfImg && selfImg.alt)
            name = selfImg.alt.replace(/^Photo of\s+/i, "").trim();
        }
      }
      if (!link) {
        log("getLoggedInUserFromDOM: no strategy found logged-in user \u2014 returning null");
        this._loggedInUser = null;
        return null;
      }
      if (!name) name = "";
      const result = { name, slug, profileUrl };
      this._loggedInUser = result;
      return result;
    }
    /**
     * Get post author profile (slug, profileUrl) from post container for OA comparison.
     */
    getPostAuthorProfileFromContainer(container) {
      if (!container) return { slug: null, profileUrl: null, isCompany: false };
      const actorEl = container.querySelector('[class*="update-components-actor"]') || container.querySelector(".feed-shared-actor");
      let profileLink = actorEl?.querySelector('a[href*="/in/"], a[href*="/company/"]') || null;
      if (!profileLink) {
        const candidates = [...container.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')];
        profileLink = candidates.find((a) => {
          if (!a.innerText?.trim()) return false;
          if (a.href?.includes("/feed/")) return false;
          if (a.closest('[aria-label*="View more options for"]')) return false;
          return true;
        }) || null;
      }
      if (!profileLink || !profileLink.href) {
        log("getPostAuthorProfileFromContainer:", { profileLinkFound: false, href: "(none)", slug: null, isCompany: false });
        return { slug: null, profileUrl: null, isCompany: false };
      }
      const rawUrl = profileLink.href;
      const cleanUrl = rawUrl.split("?")[0];
      const slug = cleanUrl.match(/\/in\/([^/?]+)/)?.[1] || null;
      const isCompany = rawUrl.includes("/company/");
      log("getPostAuthorProfileFromContainer:", {
        profileLinkFound: true,
        href: rawUrl.substring(0, 60),
        slug,
        isCompany
      });
      return { slug, profileUrl: cleanUrl, isCompany };
    }
    /**
     * Detects if the viewer is the original author of the post.
     * Uses Edit/Delete, "You", then logged-in user vs post author comparison (slug/url/name).
     */
    detectViewerIsOA(container) {
      const indicators = [
        '[aria-label*="Edit post"]',
        '[aria-label*="Delete post"]',
        '[aria-label*="Edit article"]'
      ];
      for (const sel of indicators) {
        if (container.querySelector(sel)) {
          log("detectViewerIsOA: OA via Edit/Delete");
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
            log("detectViewerIsOA: OA via You");
            return true;
          }
        }
      }
      const authorLinkOA = container.querySelector('a[href*="/in/"]');
      const innerLines = authorLinkOA?.innerText?.trim().split("\n").map((l) => l.trim()) || [];
      log("detectViewerIsOA: step 2b TipTap innerText lines", {
        linkFound: !!authorLinkOA,
        href: authorLinkOA?.href?.substring(0, 60) ?? "(none)",
        lines: innerLines.slice(0, 5)
      });
      if (innerLines.some((l) => /^[•·]\s*You$/i.test(l))) {
        log('detectViewerIsOA: OA via innerText degree line "\u2022 You"');
        return true;
      }
      const me = this.getLoggedInUserFromDOM();
      const postAuthor = this.getPostAuthorProfileFromContainer(container);
      const postAuthorName = this.extractAuthorName(container);
      log("detectViewerIsOA: step 3 comparison", {
        me: me ? { name: me.name, slug: me.slug } : null,
        postAuthor: { slug: postAuthor.slug, isCompany: postAuthor.isCompany },
        postAuthorName: postAuthorName?.substring(0, 40)
      });
      const normalizeUrl = (url) => url && typeof url === "string" ? url.trim().toLowerCase().replace(/\/$/, "") : "";
      const normalizeName = (n) => n && typeof n === "string" ? n.trim().toLowerCase().replace(/\s+/g, " ") : "";
      if (me) {
        if (postAuthor.slug && me.slug && postAuthor.slug.toLowerCase() === me.slug.toLowerCase()) {
          log("detectViewerIsOA: OA via slug match");
          return true;
        }
        if (postAuthor.profileUrl && me.profileUrl && normalizeUrl(postAuthor.profileUrl) === normalizeUrl(me.profileUrl)) {
          log("detectViewerIsOA: OA via profileUrl match");
          return true;
        }
        if (me.name && postAuthorName && normalizeName(postAuthorName) === normalizeName(me.name)) {
          log("detectViewerIsOA: OA via name match");
          return true;
        }
      }
      log("detectViewerIsOA: not OA (no match)");
      return false;
    }
    /**
     * Returns true if the form is inside LinkedIn's "comment reply" wrapper (comments-comment-box--cr).
     */
    isReplyToCommentForm(form) {
      return !!this.getReplyWrapperElement(form);
    }
    getReplyWrapperElement(form) {
      if (!form) return null;
      let el = form.parentElement;
      for (let d = 0; d < 15; d++) {
        if (!el || el === document.body) break;
        const parent = el.parentElement;
        if (!parent) break;
        const siblings = [...parent.children].filter((c) => c !== el);
        const commentSibling = siblings.find(
          (sib) => sib.querySelector('button[aria-label*="View more options for"]') && !sib.querySelector('[data-testid*="ReactionFacepileCollection"]')
        );
        if (commentSibling) {
          if (d <= 8) {
            log("getReplyWrapperElement: \u2705 reply confirmed", {
              depth: d,
              siblingAuthor: commentSibling.querySelector('button[aria-label*="View more options for"]')?.getAttribute("aria-label")?.replace(/^View more options for\s+/, "")?.replace(/[\u2018\u2019\u0060'`]s comment\.?$/i, "")?.trim()
            });
            return el;
          } else {
            log("getReplyWrapperElement: depth > 8 \u2014 top-level", { depth: d });
          }
        }
        el = el.parentElement;
      }
      let legacyEl = form.parentElement;
      for (let i = 0; i < 15 && legacyEl; i++) {
        const cls = typeof legacyEl.className === "string" ? legacyEl.className : "";
        if (cls.includes("comments-comment-box--cr") || cls.includes("comment-box--cr")) {
          log("getReplyWrapperElement: legacy --cr");
          return legacyEl;
        }
        legacyEl = legacyEl.parentElement;
      }
      log("getReplyWrapperElement: not a reply \u2014 top-level");
      return null;
    }
    /**
     * Uses the editor placeholder to decide: "Add a comment..." = comment on post, "Add a reply..." = reply to comment.
     * Returns 'comment' | 'reply' | null (null = unknown, fall back to DOM).
     */
    getPlaceholderIntent(editor) {
      let source = "none";
      const raw = (() => {
        if (editor?.dataset?.placeholder != null) {
          source = "data.placeholder";
          return editor.dataset.placeholder;
        }
        const dp = editor?.getAttribute?.("data-placeholder");
        if (dp != null) {
          source = "data-placeholder attr";
          return dp;
        }
        const al = editor?.getAttribute?.("aria-label");
        if (al != null) {
          source = "aria-label";
          return al;
        }
        return "";
      })().trim().toLowerCase();
      let intent = null;
      if (!raw) intent = null;
      else if (raw.includes("reply") || raw.includes("r\xE9pondre")) intent = "reply";
      else if (raw.includes("comment")) intent = "comment";
      log("getPlaceholderIntent:", { source, raw: raw.substring(0, 60), intent });
      return intent;
    }
    buildThreadContext(editor, postContainer) {
      const form = this.findCommentForm(editor);
      log("buildThreadContext: start", {
        editorLabel: editor.getAttribute("aria-label")?.substring(0, 40)
      });
      const replyBox = this.getReplyWrapperElement(form);
      const isReplyToComment = !!replyBox;
      log("buildThreadContext: detection", { isReplyToComment });
      if (!isReplyToComment) {
        log("buildThreadContext: top-level comment \u2014 null");
        return null;
      }
      const tiptapWrapper = form.querySelector(
        '[data-testid="ui-core-tiptap-text-editor-wrapper"]'
      );
      const editorTextbox = tiptapWrapper?.querySelector('[role="textbox"]');
      const mentionName = editorTextbox?.innerText?.trim() || "";
      log("buildThreadContext: mention", { mentionName: mentionName.slice(0, 60) });
      const parent = replyBox.parentElement;
      const siblings = [...parent?.children || []];
      let commentContainer = null;
      if (mentionName) {
        const firstName = mentionName.split(" ")[0]?.toLowerCase();
        commentContainer = siblings.find((sib) => {
          if (sib === replyBox) return false;
          const optBtn = sib.querySelector(
            'button[aria-label*="View more options for"]'
          );
          if (!optBtn) return false;
          const author = optBtn.getAttribute("aria-label")?.replace(/^View more options for\s+/, "")?.replace(/[\u2018\u2019\u0060'`]s comment\.?$/i, "")?.trim() || "";
          return mentionName.toLowerCase().startsWith(
            author.split(" ")[0]?.toLowerCase()
          );
        });
        if (commentContainer) {
          log("buildThreadContext: \u2705 comment found via @mention match");
        }
      }
      if (!commentContainer) {
        let prev = replyBox.previousElementSibling;
        for (let s = 0; s < 5 && prev; s++) {
          if (prev.querySelector('button[aria-label*="View more options for"]')) {
            commentContainer = prev;
            log("buildThreadContext: comment found via prevSibling fallback", { steps: s });
            break;
          }
          prev = prev.previousElementSibling;
        }
      }
      if (!commentContainer) {
        const article = editor.closest("article.comments-comment-entity");
        if (article) {
          log("buildThreadContext: legacy article fallback");
          return this._buildThread(article, postContainer);
        }
      }
      if (!commentContainer) {
        log("buildThreadContext: no comment container \u2014 null");
        return null;
      }
      return this._buildThread(commentContainer, postContainer);
    }
    _buildThread(commentContainer, postContainer) {
      const commentAuthor = commentContainer.querySelector('button[aria-label*="View more options for"]')?.getAttribute("aria-label")?.replace(/^View more options for\s+/, "")?.replace(/[\u2018\u2019\u0060'`]s comment\.?$/i, "")?.trim() || "unknown";
      let commentText = null;
      const textBox = [...commentContainer.querySelectorAll(
        '[data-testid="expandable-text-box"]'
      )].find(
        (el) => !el.closest('[data-testid="ui-core-tiptap-text-editor-wrapper"]')
      );
      commentText = textBox?.textContent?.trim() || null;
      if (!commentText) {
        commentText = commentContainer.querySelector("span.comments-comment-item__main-content")?.textContent?.trim() || null;
        if (commentText) log("_buildThread: text via legacy selector");
      }
      if (!commentText) {
        try {
          const clone = commentContainer.cloneNode(true);
          clone.querySelectorAll(
            '[data-testid="ui-core-tiptap-text-editor-wrapper"], button, img, svg, [role="img"]'
          ).forEach((el) => el.remove());
          const lines = clone.textContent?.split("\n").map((l) => l.trim()).filter(Boolean) || [];
          const skipPatterns = [
            /^(1st|2nd|3rd|You|Following)$/i,
            /^\d+[mhd]$/,
            /^\d+$/,
            /^(Like|Reply|React)$/i,
            /^(Author|Premium|Verified)$/i,
            /^•/
          ];
          const contentLines = lines.filter((line, idx) => {
            if (idx === 0) return false;
            if (skipPatterns.some((p) => p.test(line))) return false;
            if (line.length < 3) return false;
            return true;
          });
          if (contentLines.length > 0) {
            commentText = contentLines.join(" ");
            log("_buildThread: text via nuclear fallback", {
              preview: commentText.slice(0, 80)
            });
          }
        } catch (e) {
          log("_buildThread: nuclear fallback error", e.message);
        }
      }
      if (!commentText || commentText.length < 5) {
        log("_buildThread: no text \u2014 null", { len: commentText?.length ?? 0 });
        return null;
      }
      log("_buildThread: \u2705 done", {
        author: commentAuthor,
        preview: commentText.substring(0, 80)
      });
      const originalPostText = this.extractPostText(postContainer);
      const postAuthorName = this.extractAuthorName(postContainer);
      return {
        isReply: true,
        originalTweet: originalPostText || null,
        originalTweetAuthor: postAuthorName?.trim() || null,
        threadChain: [
          {
            text: originalPostText || "",
            author: postAuthorName?.trim() || "unknown",
            isOriginal: true,
            isCurrent: false
          },
          {
            text: safeTruncate(commentText, 300),
            author: commentAuthor,
            isOriginal: false,
            isCurrent: true
          }
        ],
        currentTweetIndex: 1,
        threadLength: 2
      };
    }
    // ─── Text Insertion ──────────────────────────────────────────────────────────
    insertTextIntoEditor(editor, text) {
      editor.focus();
      try {
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        const beforePaste = editor.textContent?.trim() || "";
        editor.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
        );
        const afterPaste = editor.textContent?.trim() || "";
        if (afterPaste.length > 0 && afterPaste !== beforePaste) {
          log("Text inserted via ClipboardEvent paste");
          return;
        }
      } catch (e) {
        log("ClipboardEvent paste failed:", e.message);
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
      const quill = this.getQuillInstance(editor);
      if (quill) {
        try {
          quill.setText(text);
          quill.setSelection(text.length, 0);
          log("Text inserted via Quill API");
          return;
        } catch (e) {
          log("Quill API failed:", e.message);
        }
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
