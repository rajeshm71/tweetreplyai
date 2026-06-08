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
  var LI_STORAGE_KEYS = {
    REPLY_MODE: "liReplyMode",
    PROMPT_VARIATION: "liPromptVariation",
    MODEL_KEY: "liReplyModel"
  };
  var VALID_REPLY_MODE_VALUES = new Set(LI_REPLY_MODES.map((m) => m.value));
  var VALID_PROMPT_VALUES = new Set(LI_PROMPT_OPTIONS.map((p) => p.value));
  function normalizeReplyMode(value) {
    if (typeof value === "string" && VALID_REPLY_MODE_VALUES.has(value)) return value;
    return "enhanced";
  }
  function normalizePromptVariation(value) {
    if (typeof value === "string" && VALID_PROMPT_VALUES.has(value)) return value;
    return "default";
  }

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
      this.usageData = null;
      this.usageDataInterval = null;
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
      if (this.isAuthenticated) {
        void this.loadUsageData().catch((e) => {
          log("loadUsageData failed on init:", e.message);
        });
      }
      if (this.usageDataInterval) {
        clearInterval(this.usageDataInterval);
      }
      this.usageDataInterval = setInterval(() => {
        if (this.isAuthenticated) {
          this.loadUsageData().catch(() => {
          });
        }
      }, POLLING.USAGE_REFRESH_MS);
      chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "authUpdated") {
          this.authManager.clearCache();
          this.authManager.isAuthenticated().then(async (isAuth) => {
            this.isAuthenticated = isAuth;
            if (isAuth) {
              try {
                await this.loadUsageData();
              } catch (_) {
              }
            } else {
              this.usageData = null;
            }
          });
        }
      });
      injectLog("initialize: authenticated =", this.isAuthenticated);
      this.startObserving();
      this.bindCommentBoxInteractionHooks();
      this.scanForEditors();
    }
    /** LinkedIn mounts the Quill editor only after the user focuses the comment box. */
    bindCommentBoxInteractionHooks() {
      const scheduleScan = () => {
        this.scanForEditors();
        window.setTimeout(() => this.scanForEditors(), 120);
        window.setTimeout(() => this.scanForEditors(), 400);
      };
      document.addEventListener(
        "focusin",
        (event) => {
          const t = event.target;
          if (!(t instanceof Element)) return;
          if (t.closest(".ql-editor") || t.closest('[class*="comment-box"]') || t.closest('[data-placeholder*="comment" i]') || t.closest('[aria-label*="comment" i]')) {
            scheduleScan();
          }
        },
        true
      );
      document.addEventListener(
        "click",
        (event) => {
          const t = event.target;
          if (!(t instanceof Element)) return;
          if (t.closest('[class*="comment-box"]') || t.closest('[data-placeholder*="comment" i]') || t.closest('[aria-label*="comment" i]')) {
            scheduleScan();
          }
        },
        true
      );
    }
    async loadUsageData() {
      this.usageData = await this.apiClient.getUsage();
      this.maybeInjectModelSelectIntoLiveWrappers();
      this.scanForEditors();
      return this.usageData;
    }
    /** Usage can load after the bar is injected — add model picker to existing wrappers. */
    maybeInjectModelSelectIntoLiveWrappers() {
      if (!this.usageData?.showModelSelect) return;
      document.querySelectorAll(`.${BUTTON_WRAPPER_CLASS}`).forEach((wrapper) => {
        if (wrapper.querySelector(".li-ai-model-select")) return;
        const controls = wrapper.querySelector(".li-ai-bar-controls") || wrapper;
        const generateBtn = controls.querySelector(`.${BUTTON_CLASS}`);
        if (!generateBtn) return;
        const modelSelect = this.createModelSelect();
        controls.insertBefore(modelSelect, generateBtn);
        const replyModeSelect = controls.querySelector(".li-ai-reply-mode-select");
        const toneSelect = controls.querySelector(".li-ai-tone-select");
        void this.restoreBarControlsFromStorage(replyModeSelect, toneSelect, generateBtn, modelSelect);
      });
    }
    getModelSelectOptgroupLabel(tierId) {
      if (tierId === "auto") return "Auto";
      if (tierId === "primary") return "Tier 1";
      if (tierId === "secondary") return "Tier 2";
      if (tierId === "tertiary") return "Groq";
      return "Models";
    }
    populateModelSelectFromUsage(select, savedModelKey) {
      const models = this.usageData?.selectableModels;
      if (!models || !Array.isArray(models) || models.length === 0) {
        const autoOpt = document.createElement("option");
        autoOpt.value = "auto";
        autoOpt.textContent = "Auto";
        select.appendChild(autoOpt);
        select.value = "auto";
        return;
      }
      const groups = /* @__PURE__ */ new Map();
      for (const model of models) {
        const tierId = model.tierId || "secondary";
        if (!groups.has(tierId)) groups.set(tierId, []);
        groups.get(tierId).push(model);
      }
      const tierOrder = ["auto", "primary", "secondary", "tertiary"];
      for (const tierId of tierOrder) {
        const entries = groups.get(tierId);
        if (!entries?.length) continue;
        const optgroup = document.createElement("optgroup");
        optgroup.label = this.getModelSelectOptgroupLabel(tierId);
        for (const model of entries) {
          const option = document.createElement("option");
          option.value = model.key;
          option.textContent = model.name;
          optgroup.appendChild(option);
        }
        select.appendChild(optgroup);
      }
      const options = Array.from(select.querySelectorAll("option"));
      if (savedModelKey && options.some((o) => o.value === savedModelKey)) {
        select.value = savedModelKey;
      } else {
        select.value = "auto";
      }
    }
    createModelSelect() {
      const select = document.createElement("select");
      select.className = "li-ai-bar-select li-ai-model-select";
      select.title = "Choose AI model";
      const applyOptions = (savedModelKey) => {
        select.replaceChildren();
        this.populateModelSelectFromUsage(select, savedModelKey);
      };
      try {
        chrome.storage?.local?.get([LI_STORAGE_KEYS.MODEL_KEY], (data) => {
          const saved = data && typeof data[LI_STORAGE_KEYS.MODEL_KEY] === "string" ? data[LI_STORAGE_KEYS.MODEL_KEY] : "auto";
          applyOptions(saved === "" ? "auto" : saved);
        });
      } catch (_) {
        applyOptions("auto");
      }
      select.addEventListener("change", () => {
        try {
          chrome.storage?.local?.set({
            [LI_STORAGE_KEYS.MODEL_KEY]: select.value || "auto"
          });
        } catch (_) {
        }
      });
      return select;
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
    collectCommentEditors() {
      const selectors = [
        '.comments-comment-box .ql-editor[contenteditable="true"]',
        '.comments-reply-box__form .ql-editor[contenteditable="true"]',
        '[class*="comment-box"] .ql-editor[contenteditable="true"]',
        '.ql-editor[contenteditable="true"]',
        '[class*="comment-box"] [contenteditable="true"]'
      ];
      const seen = /* @__PURE__ */ new Set();
      const editors = [];
      for (const selector of selectors) {
        for (const editor of document.querySelectorAll(selector)) {
          if (seen.has(editor)) continue;
          if (!editor.isConnected || editor.closest("[hidden]")) continue;
          seen.add(editor);
          editors.push(editor);
        }
      }
      return editors;
    }
    scanForEditors() {
      const editors = this.collectCommentEditors();
      const qlAny = document.querySelectorAll(".ql-editor");
      const textEditorWrappers = document.querySelectorAll(
        '.comments-comment-box-comment__text-editor, [class*="comment-box-comment"][class*="text-editor"]'
      );
      let skippedNoForm = 0;
      let skippedAlready = 0;
      let injected = 0;
      let firstNoFormEditor = null;
      for (const editor of editors) {
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
        try {
          this.injectButton(editor, form);
          injected += 1;
        } catch (e) {
          log("injectButton failed:", e.message);
        }
      }
      injectLog(
        "scan:",
        `qlEditable=${editors.length} qlAny=${qlAny.length} wrappers=${textEditorWrappers.length} noForm=${skippedNoForm} already=${skippedAlready} injected=${injected}`
      );
      if (editors.length === 0) {
        injectLog(
          'hint: no .ql-editor[contenteditable="true"] - open/focus a comment box; if qlAny>0, editor may not be editable yet'
        );
      }
      if (qlAny.length > 0 && editors.length < qlAny.length) {
        injectLog(
          "hint: some .ql-editor exist but are not contenteditable=true yet:",
          qlAny.length - editors.length
        );
      }
      if (skippedNoForm > 0 && firstNoFormEditor) {
        injectLog("findCommentForm=null; first editor chain:", describeEditorChain(firstNoFormEditor));
        injectLog(
          'expected ancestor selector one of: .comments-comment-box__form | .comments-reply-box__form | form | [class*="comment-box"]'
        );
      }
    }
    findCommentForm(editor) {
      return editor.closest(".comments-comment-box__form") || editor.closest(".comments-reply-box__form") || editor.closest("form") || editor.closest('[class*="comment-box"]') || editor.closest('[class*="comments-comment-box"]');
    }
    // ─── Button Injection ────────────────────────────────────────────────────────
    createReplyModeSelect() {
      const select = document.createElement("select");
      select.className = "li-ai-bar-select li-ai-reply-mode-select";
      select.title = "Choose reply generation mode";
      select.setAttribute("aria-label", "Reply generation mode");
      for (const mode of LI_REPLY_MODES) {
        const option = document.createElement("option");
        option.value = mode.value;
        option.textContent = mode.label;
        option.title = mode.tooltip;
        select.appendChild(option);
      }
      select.value = "enhanced";
      return select;
    }
    createToneSelect() {
      const select = document.createElement("select");
      select.className = "li-ai-bar-select li-ai-tone-select";
      select.title = "Choose reply tone";
      select.setAttribute("aria-label", "Reply tone");
      for (const tone of LI_PROMPT_OPTIONS) {
        const option = document.createElement("option");
        option.value = tone.value;
        option.textContent = tone.label;
        select.appendChild(option);
      }
      select.value = "default";
      return select;
    }
    /** Await storage before enabling controls — avoids race where first click ignores saved prefs. */
    async restoreBarControlsFromStorage(replyModeSelect, toneSelect, generateBtn, modelSelect) {
      replyModeSelect.disabled = true;
      toneSelect.disabled = true;
      generateBtn.disabled = true;
      if (modelSelect) modelSelect.disabled = true;
      try {
        const keys = [LI_STORAGE_KEYS.REPLY_MODE, LI_STORAGE_KEYS.PROMPT_VARIATION];
        if (modelSelect) keys.push(LI_STORAGE_KEYS.MODEL_KEY);
        const stored = await chrome.storage?.local?.get(keys);
        replyModeSelect.value = normalizeReplyMode(stored?.[LI_STORAGE_KEYS.REPLY_MODE]);
        toneSelect.value = normalizePromptVariation(stored?.[LI_STORAGE_KEYS.PROMPT_VARIATION]);
        if (modelSelect) {
          const saved = stored?.[LI_STORAGE_KEYS.MODEL_KEY];
          const normalized = typeof saved === "string" && saved !== "" ? saved : "auto";
          const options = Array.from(modelSelect.querySelectorAll("option"));
          if (options.some((o) => o.value === normalized)) {
            modelSelect.value = normalized;
          }
        }
      } catch (e) {
        log("restoreBarControlsFromStorage failed, using defaults:", e.message);
      } finally {
        replyModeSelect.disabled = false;
        toneSelect.disabled = false;
        generateBtn.disabled = false;
        if (modelSelect) modelSelect.disabled = false;
      }
    }
    setBarSelectsDisabled(wrapper, disabled) {
      wrapper?.querySelectorAll(".li-ai-bar-select").forEach((select) => {
        select.disabled = disabled;
      });
    }
    injectButton(editor, form) {
      const wrapper = document.createElement("div");
      wrapper.className = BUTTON_WRAPPER_CLASS;
      const replyModeSelect = this.createReplyModeSelect();
      const toneSelect = this.createToneSelect();
      let modelSelect = null;
      if (this.usageData?.showModelSelect) {
        modelSelect = this.createModelSelect();
      }
      replyModeSelect.addEventListener("change", () => {
        try {
          chrome.storage?.local?.set({
            [LI_STORAGE_KEYS.REPLY_MODE]: normalizeReplyMode(replyModeSelect.value)
          });
        } catch (_) {
        }
      });
      toneSelect.addEventListener("change", () => {
        try {
          chrome.storage?.local?.set({
            [LI_STORAGE_KEYS.PROMPT_VARIATION]: normalizePromptVariation(toneSelect.value)
          });
        } catch (_) {
        }
      });
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
        this.handleGenerateReply(editor, btn, wrapper, {
          replyMode: replyModeSelect.value,
          promptVariation: toneSelect.value,
          modelKey: modelSelect ? modelSelect.value : "auto"
        });
      });
      const controls = document.createElement("div");
      controls.className = "li-ai-bar-controls";
      controls.appendChild(replyModeSelect);
      controls.appendChild(toneSelect);
      if (modelSelect) {
        controls.appendChild(modelSelect);
      }
      controls.appendChild(btn);
      wrapper.appendChild(controls);
      void this.restoreBarControlsFromStorage(replyModeSelect, toneSelect, btn, modelSelect);
      try {
        this.placeControlBar(wrapper, form);
      } catch (e) {
        log("placeControlBar failed, using form.appendChild:", e.message);
        form.appendChild(wrapper);
      }
      log("Button injected for editor placeholder:", editor.dataset.placeholder || "comment box");
    }
    /**
     * Place next to Post. Must insert into submitBtn.parentElement — insertBefore on a
     * distant actionRow ancestor throws when Post is nested (regression from edcb731).
     */
    placeControlBar(wrapper, form) {
      const submitBtn = form.querySelector('button[type="submit"]') || form.querySelector(".comments-comment-box__submit-button") || form.querySelector('[class*="submit-button"]');
      if (submitBtn?.parentElement) {
        submitBtn.parentElement.insertBefore(wrapper, submitBtn);
        injectLog(
          "placed before submit:",
          submitBtn.className?.slice?.(0, 80) || submitBtn.tagName
        );
        return;
      }
      const actionRow = form.querySelector(".comments-comment-box__form-actions") || form.querySelector('[class*="comment-box"][class*="actions"]');
      if (actionRow) {
        actionRow.appendChild(wrapper);
        injectLog(
          "placed in action row:",
          actionRow.className?.slice?.(0, 80) || actionRow.tagName
        );
        return;
      }
      form.appendChild(wrapper);
      injectLog("placed via form.appendChild (no submit anchor found)");
    }
    // ─── Reply Generation ────────────────────────────────────────────────────────
    async handleGenerateReply(editor, btn, controlWrapper, options = {}) {
      if (!this.isAuthenticated) {
        this.isAuthenticated = await this.authManager.isAuthenticated();
      }
      if (!this.isAuthenticated) {
        this.setButtonState(btn, controlWrapper, "error", "Sign in required");
        return;
      }
      const context = this.extractContext(editor);
      if (!context.postText || context.postText.length < VALIDATION.MIN_POST_LENGTH) {
        log("Post text not found or too short:", context.postText?.length ?? 0);
        this.setButtonState(btn, controlWrapper, "error", "Post text not found");
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
      this.setButtonState(btn, controlWrapper, "loading");
      try {
        let replyMode = normalizeReplyMode(options.replyMode);
        let promptVariation = normalizePromptVariation(options.promptVariation);
        if (!options.replyMode || !options.promptVariation) {
          try {
            const stored = await chrome.storage?.local?.get([
              LI_STORAGE_KEYS.REPLY_MODE,
              LI_STORAGE_KEYS.PROMPT_VARIATION
            ]);
            if (!options.replyMode) {
              replyMode = normalizeReplyMode(stored?.[LI_STORAGE_KEYS.REPLY_MODE]);
            }
            if (!options.promptVariation) {
              promptVariation = normalizePromptVariation(stored?.[LI_STORAGE_KEYS.PROMPT_VARIATION]);
            }
          } catch (e) {
            log("chrome.storage unavailable, using defaults");
          }
        }
        const modelKey = options.modelKey || "auto";
        const payload = {
          tweet_text: context.postText,
          tweet_id: context.postId || "",
          author_info: { username: context.authorName },
          prompt_variation: promptVariation,
          reply_mode: replyMode,
          viewer_is_original_author: context.viewerIsOA
        };
        if (modelKey && modelKey !== "auto") {
          payload.model_key = modelKey;
        }
        if (context.threadContext) {
          payload.thread_context = context.threadContext;
        }
        const commentOnComment = !!(context.threadContext?.isReply && context.threadContext?.threadLength > 1);
        log("handleGenerateReply: payload summary", {
          reply_mode: payload.reply_mode,
          prompt_variation: payload.prompt_variation,
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
          this.setButtonState(btn, controlWrapper, "done", "Reply Added \u2713");
          setTimeout(() => this.setButtonState(btn, controlWrapper, "default"), 2500);
        } else {
          this.setButtonState(btn, controlWrapper, "error", "No reply generated");
        }
      } catch (error) {
        log("Error generating reply:", error.message);
        if (error.message?.includes("402")) {
          this.setButtonState(btn, controlWrapper, "error", "Quota exceeded");
        } else if (error.message?.includes("401")) {
          this.isAuthenticated = false;
          this.authManager.clearCache();
          this.setButtonState(btn, controlWrapper, "error", "Sign in required");
        } else {
          this.setButtonState(btn, controlWrapper, "error", "Error \u2014 try again");
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
    /**
     * Extract post author display name from the post container (DOM-aligned with LINKEDIN-DOM-SCAN).
     * Scoped to container so we get the author of the specific post, not another card/comment.
     */
    extractAuthorName(container) {
      if (!container) return "";
      let name = "";
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
      const navLink = document.querySelector('[class*="global-nav__me"] a[href*="/in/"]');
      const navImg = document.querySelector('[class*="global-nav__me"] img') || document.querySelector(".global-nav__me-photo");
      if (navLink) {
        link = navLink;
        const raw = link.href || "";
        profileUrl = raw.split("?")[0] || null;
        slug = profileUrl && profileUrl.match(/\/in\/([^/?]+)/) ? profileUrl.match(/\/in\/([^/?]+)/)[1] : null;
        if (navImg && navImg.alt) name = navImg.alt.trim();
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
      const profileLink = actorEl?.querySelector('a[href*="/in/"], a[href*="/company/"]');
      if (!profileLink || !profileLink.href) return { slug: null, profileUrl: null, isCompany: false };
      const rawUrl = profileLink.href;
      const cleanUrl = rawUrl.split("?")[0];
      const slug = cleanUrl.match(/\/in\/([^/?]+)/)?.[1] || null;
      const isCompany = rawUrl.includes("/company/");
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
      const me = this.getLoggedInUserFromDOM();
      const postAuthor = this.getPostAuthorProfileFromContainer(container);
      const postAuthorName = this.extractAuthorName(container);
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
      let commentText = null;
      if (placeholderIntent === "reply" || isReplyToCommentByDom) {
        const commentArticle = editor.closest("article.comments-comment-entity");
        if (commentArticle) {
          const textEl = commentArticle.querySelector("span.comments-comment-item__main-content");
          const t = textEl?.textContent?.trim();
          if (t && t.length >= 5) {
            commentText = t;
            log("buildThreadContext: found comment via article.comments-comment-entity", commentText.length, "chars");
          }
        }
      }
      const commentBodySelectors = [
        ".comments-comment-item__main-content",
        ".comments-comment-item_main-content",
        // single underscore - actual LinkedIn class
        ".feed-shared-main-content--comment",
        "section.comments-comment-entity__content",
        ".feed-shared-inline-show-more-text",
        ".comments-comment-item__inline-show-more-text",
        // double underscore (current LinkedIn DOM)
        ".comments-comment-item_inline-show-more-text",
        '[class*="comment-item_main-content"]',
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
        const contentSection = root.matches?.("section.comments-comment-entity__content") ? root : root.querySelector?.("section.comments-comment-entity__content");
        if (contentSection) {
          const clone = contentSection.cloneNode(true);
          clone.querySelectorAll("form, button, .ql-editor, .comments-comment-box").forEach((el) => el.remove());
          const t = clone.textContent?.trim();
          if (t && t.length >= 5) return t;
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
      if (!commentText && commentItem) {
        const commentContent = commentItem.querySelector(".comments-comment-item__main-content") || commentItem.querySelector(".feed-shared-main-content") || commentItem.previousElementSibling?.querySelector(".comments-comment-item__main-content");
        commentText = commentContent?.textContent?.trim();
        log("buildThreadContext: commentItem found", commentText ? `comment length ${commentText.length}` : "no body");
      } else if (!commentText && isReplyBoxForm) {
        log("buildThreadContext: reply-to-comment path (comments-reply-box); form class:", form?.className?.substring(0, 80));
        let searchRoot = form.previousElementSibling || form.parentElement;
        while (searchRoot && !commentText) {
          commentText = getCommentTextFromRoot(searchRoot);
          if (commentText) log("buildThreadContext: reply-box fallback found comment", commentText.length, "chars");
          if (!commentText) searchRoot = searchRoot.parentElement;
        }
        if (!commentText) log("buildThreadContext: reply-box fallback could not find comment text");
      } else if (!commentText && isCrWrapper) {
        const replyWrapper = this.getReplyWrapperElement(form);
        log("buildThreadContext: reply-to-comment path (--cr wrapper); replyWrapper:", !!replyWrapper);
        const replyThreadItem = replyWrapper?.closest?.(".comments-thread-item");
        const commentThreadItem = replyThreadItem?.previousElementSibling;
        if (replyThreadItem && commentThreadItem) {
          commentText = getCommentTextFromRoot(commentThreadItem);
          if (commentText) log("buildThreadContext: --cr found comment via comments-thread-item previous sibling", commentText.length, "chars");
        }
        if (!commentText && replyWrapper?.previousElementSibling) {
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
      const postAuthorName = this.extractAuthorName(postContainer);
      const originalTweetAuthor = postAuthorName && postAuthorName.trim() ? postAuthorName.trim().slice(0, 50) : null;
      const authorLabel = originalTweetAuthor || "unknown";
      const built = {
        isReply: true,
        originalTweet: originalPostText || null,
        originalTweetAuthor,
        threadChain: [
          { text: originalPostText || "", author: authorLabel, isOriginal: true, isCurrent: false },
          { text: safeTruncate(commentText, 300), author: "unknown", isOriginal: false, isCurrent: true }
        ],
        currentTweetIndex: 1,
        threadLength: 2
      };
      log("buildThreadContext: built thread (comment-on-comment recognized)", { threadLength: built.threadLength, commentPreviewLen: commentText.length });
      return built;
    }
    // ─── Text Insertion ──────────────────────────────────────────────────────────
    // Strip reply prefixes from generated text (same as X extension)
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
    insertTextIntoEditor(editor, text) {
      const cleanText = this.stripReplyPrefix(String(text).replace(/<[^>]*>/g, ""));
      editor.focus();
      const quill = this.getQuillInstance(editor);
      if (quill) {
        try {
          quill.setText(cleanText);
          quill.setSelection(cleanText.length, 0);
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
        const inserted = document.execCommand("insertText", false, cleanText);
        if (inserted) {
          log("Text inserted via execCommand");
          return;
        }
      } catch (e) {
        log("execCommand failed:", e.message);
      }
      editor.innerHTML = `<p>${cleanText}</p>`;
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
    setButtonState(btn, controlWrapper, state, message) {
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
          this.setBarSelectsDisabled(controlWrapper, true);
          btn.classList.add(`${BUTTON_CLASS}--loading`);
          break;
        case "done":
          if (textEl) textEl.textContent = message || "Reply Added \u2713";
          this.setBarSelectsDisabled(controlWrapper, false);
          btn.classList.add(`${BUTTON_CLASS}--done`);
          break;
        case "error":
          if (textEl) textEl.textContent = message || "Error \u2014 try again";
          this.setBarSelectsDisabled(controlWrapper, false);
          btn.classList.add(`${BUTTON_CLASS}--error`);
          setTimeout(() => this.setButtonState(btn, controlWrapper, "default"), 3e3);
          break;
        default:
          if (textEl) textEl.textContent = "Generate Reply";
          this.setBarSelectsDisabled(controlWrapper, false);
      }
    }
    destroy() {
      this.observer?.disconnect();
      if (this._scanTimer) clearTimeout(this._scanTimer);
    }
  };
  new LinkedInReplyInjector();
})();
