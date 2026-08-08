import { AuthManager } from '../utils/auth.js';
import { ApiClient } from '../utils/api.js';
import {
  TIMEOUTS,
  POLLING,
  VALIDATION,
  LI_REPLY_MODES,
  LI_PROMPT_OPTIONS,
  LI_STORAGE_KEYS,
  normalizeReplyMode,
  normalizePromptVariation,
} from '../config/constants.js';

const LOG_PREFIX = '[LinkedInReply]';
const BUTTON_CLASS = 'li-ai-reply-btn';
const BUTTON_WRAPPER_CLASS = 'li-ai-reply-btn-wrapper';
const DEBUG_INJECTION = true;

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

function injectLog(...args) {
  if (DEBUG_INJECTION) console.log(LOG_PREFIX, '[inject]', ...args);
}

function describeEditorChain(editor, depth = 4) {
  const parts = [];
  let el = editor;
  for (let i = 0; i < depth && el; i += 1) {
    const ck = el.getAttribute?.('componentkey');
    const cls = el.className
      ? String(el.className)
          .trim()
          .split(/\s+/)
          .slice(0, 4)
          .join('.')
      : '';
    const ckPart = ck ? `[ck=${ck.slice(0, 40)}]` : '';
    parts.push(`${el.tagName.toLowerCase()}${ckPart}${cls ? `.${cls}` : ''}`);
    el = el.parentElement;
  }
  return parts.join(' <- ');
}

const TIPTAP_WRAPPER_SELECTOR = '[data-testid="ui-core-tiptap-text-editor-wrapper"]';

function isCommentBoxComponentKey(componentKey) {
  return typeof componentKey === 'string' && componentKey.startsWith('commentBox-');
}

/** Collect Quill + TipTap comment editors (LinkedIn migrated comments to TipTap in 2026). */
function findCommentEditors() {
  const editors = new Set();
  const add = (el) => {
    if (el?.isContentEditable) editors.add(el);
  };

  document.querySelectorAll(`${TIPTAP_WRAPPER_SELECTOR} [role="textbox"][contenteditable="true"]`).forEach(add);
  document.querySelectorAll('div.tiptap.ProseMirror[contenteditable="true"]').forEach(add);
  document.querySelectorAll('[role="textbox"][aria-label*="Text editor for creating"][contenteditable="true"]').forEach(add);
  document.querySelectorAll('.ql-editor[contenteditable="true"]').forEach(add);

  return editors;
}

function isInsideTiptapWrapper(el) {
  return !!el?.closest?.(TIPTAP_WRAPPER_SELECTOR);
}

/** Find Post/Reply submit control within an inject scope (legacy BEM + SDUI hashed classes). */
function findSubmitButton(scope) {
  if (!scope) return null;

  const candidates = [
    scope.querySelector('button[type="submit"]'),
    scope.querySelector('.comments-comment-box__submit-button'),
    scope.querySelector('[class*="submit-button"]'),
    scope.querySelector('button[aria-label*="Post"]'),
    scope.querySelector('button[aria-label*="Reply"]'),
  ].filter(Boolean);

  for (const btn of candidates) {
    if (!isInsideTiptapWrapper(btn)) return btn;
  }

  return [...scope.querySelectorAll('button')].find(
    (b) =>
      !isInsideTiptapWrapper(b) &&
      (b.innerText?.trim() === 'Post' || b.innerText?.trim() === 'Reply'),
  ) || null;
}

function dispatchEditorInputEvents(editor) {
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, cancelable: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  editor.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
}

/** True when el sits inside a comment row or active comment/reply editor — not post body. */
function isInsideCommentSubtree(el) {
  if (!el) return false;
  return !!(
    el.closest('[componentkey^="replaceableComment_"]') ||
    el.closest('[componentkey^="commentBox-"]') ||
    el.closest(TIPTAP_WRAPPER_SELECTOR)
  );
}

function isPostBodyTextElement(el) {
  if (!el || isInsideCommentSubtree(el)) return false;
  if (el.closest('[componentkey^="replaceableComment_"]')) return false;
  return true;
}

function findReplaceableCommentRoot(el) {
  if (!el) return null;
  const ck = el.getAttribute?.('componentkey') || '';
  if (ck.startsWith('replaceableComment_')) return el;
  return el.querySelector?.('[componentkey^="replaceableComment_"]') || null;
}

function parseCommentAuthorFromAriaLabel(ariaLabel) {
  if (!ariaLabel) return '';
  return ariaLabel
    .replace(/^View more options for\s+/, '')
    .replace(/[\u2018\u2019\u0060'`]s comment\.?$/i, '')
    .trim();
}

/**
 * Truncate a string to `maxLen` UTF-16 code units without splitting surrogate pairs.
 * Supplementary Unicode characters (e.g. LinkedIn bold letters) each occupy 2 code units;
 * naive substring() can leave a lone surrogate that PostgreSQL rejects as invalid JSON.
 */
function safeTruncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str;
  const code = str.charCodeAt(maxLen - 1);
  if (code >= 0xD800 && code <= 0xDBFF) maxLen -= 1;
  return str.substring(0, maxLen);
}

class LinkedInReplyInjector {
  constructor() {
    // Singleton guard: SPA navigation may re-execute the script
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
    this._loggedInUser = null; // cache for getLoggedInUserFromDOM (OA detection)

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

    // Usage for whitelist model picker — must not block comment bar injection.
    if (this.isAuthenticated) {
      void this.loadUsageData().catch((e) => {
        log('loadUsageData failed on init:', e.message);
      });
    }

    if (this.usageDataInterval) {
      clearInterval(this.usageDataInterval);
    }
    this.usageDataInterval = setInterval(() => {
      if (this.isAuthenticated) {
        this.loadUsageData().catch(() => {});
      }
    }, POLLING.USAGE_REFRESH_MS);

    // Re-check auth whenever the popup signals a login/logout
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'authUpdated') {
        this.authManager.clearCache();
        this.authManager.isAuthenticated().then(async (isAuth) => {
          this.isAuthenticated = isAuth;
          if (isAuth) {
            try {
              await this.loadUsageData();
            } catch (_) {}
          } else {
            this.usageData = null;
          }
        });
      }
    });

    injectLog('initialize: authenticated =', this.isAuthenticated);
    this.startObserving();
    this.bindEditorFocusRescan();
    this.scanForEditors();
  }

  bindEditorFocusRescan() {
    document.addEventListener(
      'focusin',
      (e) => {
        const target = e.target;
        if (
          target?.closest?.(TIPTAP_WRAPPER_SELECTOR) ||
          target?.closest?.('.ql-editor') ||
          target?.matches?.('[role="textbox"][contenteditable="true"]')
        ) {
          setTimeout(() => this.scanForEditors(), 50);
        }
      },
      true,
    );
  }

  async loadUsageData() {
    this.usageData = await this.apiClient.getUsage();
    this.maybeInjectModelSelectIntoLiveWrappers();
    return this.usageData;
  }

  /** Bars inject before /api/usage returns — add model dropdown to existing wrappers. */
  maybeInjectModelSelectIntoLiveWrappers() {
    if (!this.usageData?.showModelSelect) return;

    document.querySelectorAll(`.${BUTTON_WRAPPER_CLASS}`).forEach((wrapper) => {
      if (wrapper.querySelector('.li-ai-model-select')) return;

      const generateBtn = wrapper.querySelector(`.${BUTTON_CLASS}`);
      if (!generateBtn) return;

      const modelSelect = this.createModelSelect();
      wrapper.insertBefore(modelSelect, wrapper.firstChild);

      const replyModeSelect = wrapper.querySelector('.li-ai-reply-mode-select');
      const toneSelect = wrapper.querySelector('.li-ai-tone-select');
      void this.restoreBarControlsFromStorage(replyModeSelect, toneSelect, generateBtn, modelSelect);
    });
  }

  getModelSelectOptgroupLabel(tierId) {
    if (tierId === 'auto') return 'Auto';
    if (tierId === 'primary') return 'Tier 1';
    if (tierId === 'secondary') return 'Tier 2';
    if (tierId === 'tertiary') return 'Groq';
    return 'Models';
  }

  populateModelSelectFromUsage(select, savedModelKey) {
    const models = this.usageData?.selectableModels;
    if (!models || !Array.isArray(models) || models.length === 0) {
      const autoOpt = document.createElement('option');
      autoOpt.value = 'auto';
      autoOpt.textContent = 'Auto';
      select.appendChild(autoOpt);
      select.value = 'auto';
      return;
    }

    const groups = new Map();
    for (const model of models) {
      const tierId = model.tierId || 'secondary';
      if (!groups.has(tierId)) groups.set(tierId, []);
      groups.get(tierId).push(model);
    }

    const tierOrder = ['auto', 'primary', 'secondary', 'tertiary'];
    for (const tierId of tierOrder) {
      const entries = groups.get(tierId);
      if (!entries?.length) continue;
      const optgroup = document.createElement('optgroup');
      optgroup.label = this.getModelSelectOptgroupLabel(tierId);
      for (const model of entries) {
        const option = document.createElement('option');
        option.value = model.key;
        option.textContent = model.name;
        optgroup.appendChild(option);
      }
      select.appendChild(optgroup);
    }

    const options = Array.from(select.querySelectorAll('option'));
    if (savedModelKey && options.some((o) => o.value === savedModelKey)) {
      select.value = savedModelKey;
    } else {
      select.value = 'auto';
    }
  }

  createModelSelect() {
    const select = document.createElement('select');
    select.className = 'li-ai-bar-select li-ai-model-select';
    select.title = 'Choose AI model';

    const applyOptions = (savedModelKey) => {
      select.replaceChildren();
      this.populateModelSelectFromUsage(select, savedModelKey);
    };

    try {
      chrome.storage?.local?.get([LI_STORAGE_KEYS.MODEL_KEY], (data) => {
        const saved =
          data && typeof data[LI_STORAGE_KEYS.MODEL_KEY] === 'string'
            ? data[LI_STORAGE_KEYS.MODEL_KEY]
            : 'auto';
        applyOptions(saved === '' ? 'auto' : saved);
      });
    } catch (_) {
      applyOptions('auto');
    }

    select.addEventListener('change', () => {
      try {
        chrome.storage?.local?.set({
          [LI_STORAGE_KEYS.MODEL_KEY]: select.value || 'auto',
        });
      } catch (_) {}
    });

    return select;
  }

  // ─── DOM Observation ─────────────────────────────────────────────────────────

  startObserving() {
    this.observer = new MutationObserver(() => {
      // Debounce: LinkedIn's virtual DOM triggers many rapid mutations
      if (this._scanTimer) clearTimeout(this._scanTimer);
      this._scanTimer = setTimeout(() => {
        this.scanForEditors();
        this._scanTimer = null;
      }, TIMEOUTS.DOM_DEBOUNCE_MS);
    });

    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  scanForEditors() {
    const editorSet = findCommentEditors();
    const qlAny = document.querySelectorAll('.ql-editor');
    const tiptapWrappers = document.querySelectorAll(TIPTAP_WRAPPER_SELECTOR);
    let skippedNoForm = 0;
    let skippedAlready = 0;
    let injected = 0;
    let firstNoFormEditor = null;

    for (const editor of editorSet) {
      const scope = this.findCommentForm(editor);
      if (!scope) {
        skippedNoForm += 1;
        if (!firstNoFormEditor) firstNoFormEditor = editor;
        continue;
      }
      // One bar per inject scope (post comment vs nested reply-to-comment).
      if (scope.querySelector(`.${BUTTON_WRAPPER_CLASS}`)) {
        skippedAlready += 1;
        continue;
      }
      try {
        this.injectButton(editor, scope);
        injected += 1;
      } catch (e) {
        log('injectButton failed:', e.message);
      }
    }

    injectLog(
      'scan:',
      `tiptap=${tiptapWrappers.length} matched=${editorSet.size} qlAny=${qlAny.length} noForm=${skippedNoForm} already=${skippedAlready} injected=${injected}`,
    );
    if (editorSet.size === 0) {
      injectLog(
        'hint: no comment editors found — open/focus a comment box (TipTap or Quill)',
      );
    }
    if (skippedNoForm > 0 && firstNoFormEditor) {
      injectLog('findCommentForm=null; first editor chain:', describeEditorChain(firstNoFormEditor, 8));
      injectLog(
        'expected ancestor: componentkey^="commentBox-" | TipTap wrapper parent | legacy comment-box form',
      );
    }
  }

  findCommentForm(editor) {
    // Innermost scope first — reply boxes use comments-comment-box--cr and must not
    // resolve to the outer post-level comment form (which may already have a bar).
    if (!editor) return null;

    for (let el = editor.parentElement; el && el !== document.body; el = el.parentElement) {
      const ck = el.getAttribute?.('componentkey') || '';
      const cls = typeof el.className === 'string' ? el.className : '';

      if (isCommentBoxComponentKey(ck)) {
        return el;
      }
      if (cls.includes('comments-comment-box--cr') || cls.includes('comment-box--cr')) {
        return el;
      }
      if (cls.includes('comments-reply-box')) {
        return el;
      }
      if (el.tagName === 'FORM') {
        return el;
      }
      if (cls.includes('comments-reply-box__form') || cls.includes('comments-comment-box__form')) {
        return el;
      }
    }

    const tiptapWrapper = editor.closest(TIPTAP_WRAPPER_SELECTOR);
    if (tiptapWrapper?.parentElement) {
      const parentCk = tiptapWrapper.parentElement.getAttribute?.('componentkey') || '';
      if (isCommentBoxComponentKey(parentCk)) {
        return tiptapWrapper.parentElement;
      }
      if (tiptapWrapper.parentElement.parentElement) {
        const grandCk = tiptapWrapper.parentElement.parentElement.getAttribute?.('componentkey') || '';
        if (isCommentBoxComponentKey(grandCk)) {
          return tiptapWrapper.parentElement.parentElement;
        }
      }
      return tiptapWrapper.parentElement;
    }

    return (
      editor.closest('.comments-reply-box__form') ||
      editor.closest('.comments-comment-box__form') ||
      editor.closest('form') ||
      editor.closest('[class*="comment-box"]')
    );
  }

  // ─── Button Injection ────────────────────────────────────────────────────────

  createReplyModeSelect() {
    const select = document.createElement('select');
    select.className = 'li-ai-bar-select li-ai-reply-mode-select';
    select.title = 'Choose reply generation mode';
    select.setAttribute('aria-label', 'Reply generation mode');

    for (const mode of LI_REPLY_MODES) {
      const option = document.createElement('option');
      option.value = mode.value;
      option.textContent = mode.label;
      option.title = mode.tooltip;
      select.appendChild(option);
    }

    select.value = 'enhanced';
    return select;
  }

  createToneSelect() {
    const select = document.createElement('select');
    select.className = 'li-ai-bar-select li-ai-tone-select';
    select.title = 'Choose reply tone';
    select.setAttribute('aria-label', 'Reply tone');

    for (const tone of LI_PROMPT_OPTIONS) {
      const option = document.createElement('option');
      option.value = tone.value;
      option.textContent = tone.label;
      select.appendChild(option);
    }

    select.value = 'default';
    return select;
  }

  /** Await storage before enabling controls — avoids race where first click ignores saved prefs. */
  async restoreBarControlsFromStorage(replyModeSelect, toneSelect, generateBtn, modelSelect) {
    if (replyModeSelect) replyModeSelect.disabled = true;
    if (toneSelect) toneSelect.disabled = true;
    if (generateBtn) generateBtn.disabled = true;
    if (modelSelect) modelSelect.disabled = true;

    try {
      const keys = [LI_STORAGE_KEYS.REPLY_MODE, LI_STORAGE_KEYS.PROMPT_VARIATION];
      if (modelSelect) keys.push(LI_STORAGE_KEYS.MODEL_KEY);
      const stored = await chrome.storage?.local?.get(keys);
      if (replyModeSelect) {
        replyModeSelect.value = normalizeReplyMode(stored?.[LI_STORAGE_KEYS.REPLY_MODE]);
      }
      if (toneSelect) {
        toneSelect.value = normalizePromptVariation(stored?.[LI_STORAGE_KEYS.PROMPT_VARIATION]);
      }
      if (modelSelect) {
        const saved = stored?.[LI_STORAGE_KEYS.MODEL_KEY];
        const normalized = typeof saved === 'string' && saved !== '' ? saved : 'auto';
        const options = Array.from(modelSelect.querySelectorAll('option'));
        if (options.some((o) => o.value === normalized)) {
          modelSelect.value = normalized;
        }
      }
    } catch (e) {
      log('restoreBarControlsFromStorage failed, using defaults:', e.message);
    } finally {
      if (replyModeSelect) replyModeSelect.disabled = false;
      if (toneSelect) toneSelect.disabled = false;
      if (generateBtn) generateBtn.disabled = false;
      if (modelSelect) modelSelect.disabled = false;
    }
  }

  setBarSelectsDisabled(wrapper, disabled) {
    wrapper?.querySelectorAll('.li-ai-bar-select').forEach((select) => {
      select.disabled = disabled;
    });
  }

  injectButton(editor, scope) {
    const wrapper = document.createElement('div');
    wrapper.className = BUTTON_WRAPPER_CLASS;

    const replyModeSelect = this.createReplyModeSelect();
    const toneSelect = this.createToneSelect();
    let modelSelect = null;
    if (this.usageData?.showModelSelect) {
      modelSelect = this.createModelSelect();
    }

    replyModeSelect.addEventListener('change', () => {
      try {
        chrome.storage?.local?.set({
          [LI_STORAGE_KEYS.REPLY_MODE]: normalizeReplyMode(replyModeSelect.value),
        });
      } catch (_) {}
    });
    toneSelect.addEventListener('change', () => {
      try {
        chrome.storage?.local?.set({
          [LI_STORAGE_KEYS.PROMPT_VARIATION]: normalizePromptVariation(toneSelect.value),
        });
      } catch (_) {}
    });

    const btn = document.createElement('button');
    btn.className = BUTTON_CLASS;
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-label', 'Generate AI reply with LinkedIn Reply AI');
    btn.innerHTML = `
      <span class="li-ai-btn-icon" aria-hidden="true">✨</span>
      <span class="li-ai-btn-text">Generate Reply</span>
    `;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleGenerateReply(editor, btn, wrapper, {
        replyMode: replyModeSelect.value,
        promptVariation: toneSelect.value,
        modelKey: modelSelect ? modelSelect.value : 'auto',
      });
    });

    if (modelSelect) {
      wrapper.appendChild(modelSelect);
    }
    wrapper.appendChild(replyModeSelect);
    wrapper.appendChild(toneSelect);
    wrapper.appendChild(btn);

    void this.restoreBarControlsFromStorage(replyModeSelect, toneSelect, btn, modelSelect);

    // Place controls in the same row as Post/Reply — prefer LinkedIn's submit/action flex container
    const submitBtn = findSubmitButton(scope);

    const actionRow =
      submitBtn?.closest('.comments-comment-box__form-actions') ||
      submitBtn?.closest('[class*="comment-box"][class*="actions"]') ||
      submitBtn?.parentElement;

    if (actionRow) {
      if (submitBtn && actionRow.contains(submitBtn)) {
        try {
          actionRow.insertBefore(wrapper, submitBtn);
        } catch (_) {
          submitBtn.parentElement?.insertBefore(wrapper, submitBtn);
        }
      } else {
        actionRow.appendChild(wrapper);
      }
      injectLog(
        'placed in action row:',
        actionRow.className?.slice?.(0, 80) || actionRow.tagName,
      );
    } else {
      scope.appendChild(wrapper);
      injectLog('placed via scope.appendChild (no submit anchor found)');
    }

    log(
      'Button injected for editor:',
      editor.getAttribute('aria-label') || editor.dataset?.placeholder || 'comment box',
    );
  }

  // ─── Reply Generation ────────────────────────────────────────────────────────

  async handleGenerateReply(editor, btn, controlWrapper, options = {}) {
    // Re-validate auth on each click — uses cache so no network hit on most clicks
    if (!this.isAuthenticated) {
      this.isAuthenticated = await this.authManager.isAuthenticated();
    }
    if (!this.isAuthenticated) {
      this.setButtonState(btn, controlWrapper, 'error', 'Sign in required');
      return;
    }

    const context = this.extractContext(editor);

    if (!context.postText || context.postText.length < VALIDATION.MIN_POST_LENGTH) {
      log('Post text not found or too short:', context.postText?.length ?? 0);
      this.setButtonState(btn, controlWrapper, 'error', 'Post text not found');
      return;
    }

    log('Context extracted:', {
      preview: context.postText.substring(0, 80),
      postId: context.postId,
      author: context.authorName,
      isOA: context.viewerIsOA,
      hasThread: !!context.threadContext,
      viewerIsOA: context.viewerIsOA,
      threadLength: context.threadContext?.threadLength,
    });

    this.setButtonState(btn, controlWrapper, 'loading');

    try {
      let replyMode = normalizeReplyMode(options.replyMode);
      let promptVariation = normalizePromptVariation(options.promptVariation);

      if (!options.replyMode || !options.promptVariation) {
        try {
          const stored = await chrome.storage?.local?.get([
            LI_STORAGE_KEYS.REPLY_MODE,
            LI_STORAGE_KEYS.PROMPT_VARIATION,
          ]);
          if (!options.replyMode) {
            replyMode = normalizeReplyMode(stored?.[LI_STORAGE_KEYS.REPLY_MODE]);
          }
          if (!options.promptVariation) {
            promptVariation = normalizePromptVariation(stored?.[LI_STORAGE_KEYS.PROMPT_VARIATION]);
          }
        } catch (e) {
          log('chrome.storage unavailable, using defaults');
        }
      }

      // Build payload — api.js automatically appends platform: 'linkedin'
      const modelKey = options.modelKey || 'auto';
      const payload = {
        tweet_text: context.postText,
        tweet_id: context.postId || '',
        author_info: { username: context.authorName },
        prompt_variation: promptVariation,
        reply_mode: replyMode,
        viewer_is_original_author: context.viewerIsOA,
      };
      if (modelKey && modelKey !== 'auto') {
        payload.model_key = modelKey;
      }

      if (context.threadContext) {
        payload.thread_context = context.threadContext;
      }
      const commentOnComment = !!(context.threadContext?.isReply && context.threadContext?.threadLength > 1);
      log('handleGenerateReply: payload summary', {
        reply_mode: payload.reply_mode,
        prompt_variation: payload.prompt_variation,
        viewer_is_original_author: payload.viewer_is_original_author,
        isOther: !payload.viewer_is_original_author,
        hasThreadContext: !!payload.thread_context,
        threadContext: payload.thread_context ? { isReply: payload.thread_context.isReply, threadLength: payload.thread_context.threadLength, chainLen: payload.thread_context.threadChain?.length } : null,
        commentOnCommentRecognized: commentOnComment,
      });

      const response = await this.apiClient.generateReply(payload);
      const reply = response?.reply || response?.tweet;

      if (reply) {
        this.insertTextIntoEditor(editor, reply);
        this.setButtonState(btn, controlWrapper, 'done', 'Reply Added ✓');
        setTimeout(() => this.setButtonState(btn, controlWrapper, 'default'), 2500);
      } else {
        this.setButtonState(btn, controlWrapper, 'error', 'No reply generated');
      }
    } catch (error) {
      log('Error generating reply:', error.message);
      if (error.message?.includes('402')) {
        this.setButtonState(btn, controlWrapper, 'error', 'Quota exceeded');
      } else if (error.message?.includes('401')) {
        this.isAuthenticated = false;
        this.authManager.clearCache();
        this.setButtonState(btn, controlWrapper, 'error', 'Sign in required');
      } else {
        this.setButtonState(btn, controlWrapper, 'error', 'Error — try again');
      }
    }
  }

  // ─── Context Extraction ──────────────────────────────────────────────────────

  extractContext(editor) {
    const ctx = {
      postText: '',
      postId: null,
      authorName: '',
      viewerIsOA: false,
      threadContext: null,
    };

    log('extractContext: starting', { placeholder: editor.dataset?.placeholder?.substring(0, 40) });
    const postContainer = this.findPostContainer(editor);
    if (!postContainer) {
      log('extractContext: could not find post container from editor');
      return ctx;
    }
    log('extractContext: postContainer found', { tag: postContainer.tagName, urn: postContainer.getAttribute?.('data-urn')?.substring(0, 60) });

    ctx.postText = this.extractPostText(postContainer);
    if (!ctx.postText || ctx.postText.length < VALIDATION.MIN_POST_LENGTH) {
      const walked = this.extractPostTextWalkFromEditor(editor);
      if (walked) {
        log('extractContext: post text via editor walk-up', walked.substring(0, 80));
        ctx.postText = walked;
      }
    }
    ctx.postId = this.extractPostId(postContainer);
    ctx.authorName = this.extractAuthorName(postContainer);
    log('extractContext: post', { postTextLen: ctx.postText?.length ?? 0, postId: ctx.postId?.substring(0, 40), author: ctx.authorName?.substring(0, 30) });
    if (ctx.authorName) log('extractContext: post author', { author: ctx.authorName.substring(0, 40) });

    ctx.viewerIsOA = this.detectViewerIsOA(postContainer);
    log('extractContext: viewerIsOA (is other = !viewerIsOA)', { viewerIsOA: ctx.viewerIsOA, isOther: !ctx.viewerIsOA });

    ctx.threadContext = this.buildThreadContext(editor, postContainer);
    log('extractContext: threadContext', {
      hasThread: !!ctx.threadContext,
      threadLength: ctx.threadContext?.threadLength ?? 0,
      isReply: ctx.threadContext?.isReply ?? false,
      commentOnCommentRecognized: !!(ctx.threadContext?.isReply && ctx.threadContext?.threadLength > 1),
    });

    return ctx;
  }

  /**
   * Returns true only for activity URNs (feed posts). Rejects comment URNs so we don't
   * treat a comment container as the post when replying to a comment.
   */
  isActivityUrn(urn) {
    if (!urn || typeof urn !== 'string') return false;
    if (!urn.startsWith('urn:li:activity:')) return false;
    if (urn.includes('comment') || urn.includes('fsd_comment')) return false;
    return true;
  }

  findPostContainer(editor) {
    // Walk up from the editor to find the element with a LinkedIn activity data-urn.
    // Only treat a node as the post if its URN is activity-like; skip comment URNs.
    let el = editor.parentElement;
    while (el && el !== document.body) {
      const ck = el.getAttribute?.('componentkey') || '';
      if (ck.includes('FeedType')) {
        log('findPostContainer: found FeedType componentkey (walk-up)', ck.substring(0, 50));
        return el;
      }
      if (el.getAttribute?.('data-view-name') === 'feed-full-update') {
        log('findPostContainer: found feed-full-update (walk-up)');
        return el;
      }
      if (
        el.hasAttribute('data-urn') ||
        el.classList.contains('feed-shared-update-v2') ||
        el.classList.contains('occludable-update') ||
        el.classList.contains('main-feed-activity-card')
      ) {
        const urnEl = el.hasAttribute('data-urn') ? el : el.querySelector('[data-urn]');
        const urn = urnEl?.getAttribute('data-urn');
        if (this.isActivityUrn(urn)) {
          log('findPostContainer: found activity URN (walk-up)', urn?.substring(0, 50));
          return el;
        }
        log('findPostContainer: skipping non-activity URN', urn?.substring(0, 50));
      }
      el = el.parentElement;
    }

    // Fallback: search all data-urn containers and find one with activity URN that contains this editor
    const allUrns = document.querySelectorAll('[data-urn]');
    for (const urnEl of allUrns) {
      const urn = urnEl.getAttribute('data-urn');
      if (this.isActivityUrn(urn) && urnEl.contains(editor)) {
        log('findPostContainer: found activity URN (fallback)', urn?.substring(0, 50));
        return urnEl;
      }
    }

    // SDUI: narrow to post card via reaction facepile (post body sits above comments in same card)
    let walkEl = editor.parentElement;
    while (walkEl && walkEl !== document.body) {
      const facepile = walkEl.querySelector('[data-testid*="ReactionFacepileCollection-urn:li:"]');
      if (facepile) {
        let postCard = facepile.closest('div');
        while (
          postCard &&
          postCard !== walkEl &&
          !this.hasPostBodyMarker(postCard)
        ) {
          postCard = postCard.parentElement;
        }
        if (!postCard || postCard === walkEl) {
          const directChildWithFp = [...walkEl.children].find((c) =>
            c.querySelector('[data-testid*="ReactionFacepileCollection-urn:li:"]'),
          );
          if (directChildWithFp) {
            postCard =
              directChildWithFp.tagName === 'A' && directChildWithFp.parentElement
                ? directChildWithFp.parentElement
                : directChildWithFp;
          } else {
            postCard = walkEl;
          }
        }
        const container = postCard || walkEl;
        log('findPostContainer: found via ReactionFacepile boundary', {
          ancestorTag: walkEl.tagName,
          narrowedTag: container.tagName,
        });
        return container;
      }
      walkEl = walkEl.parentElement;
    }

    // Walk up for smallest ancestor that contains post commentary (not comment rows)
    let commentaryWalk = editor.parentElement;
    while (commentaryWalk && commentaryWalk !== document.body) {
      if (this.hasPostBodyMarker(commentaryWalk)) {
        log('findPostContainer: found via post-body marker walk-up');
        return commentaryWalk;
      }
      commentaryWalk = commentaryWalk.parentElement;
    }

    const articleOrMain = editor.closest('article') || document.querySelector('main');
    log('findPostContainer: using article/main fallback', !!articleOrMain);
    if (!articleOrMain) {
      let chain = [];
      let p = editor.parentElement;
      for (let i = 0; i < 8 && p; i++) {
        chain.push(p.tagName + (p.className && typeof p.className === 'string' ? '.' + p.className.split(/\s+/).slice(0, 2).join('.') : ''));
        p = p.parentElement;
      }
      log('findPostContainer: no container; parent chain', chain.join(' <- '));
    }
    return articleOrMain;
  }

  hasPostBodyMarker(container) {
    if (!container) return false;
    for (const el of container.querySelectorAll(
      '[componentkey^="feed-commentary_"], [data-view-name="feed-commentary"], [data-testid="expandable-text-box"]',
    )) {
      if (isPostBodyTextElement(el)) return true;
    }
    return false;
  }

  extractPostTextWalkFromEditor(editor) {
    let el = editor.parentElement;
    while (el && el !== document.body) {
      const text = this.extractPostText(el);
      if (text && text.length >= VALIDATION.MIN_POST_LENGTH) return text;
      el = el.parentElement;
    }
    return '';
  }

  extractPostText(container) {
    if (!container) return '';

    // SDUI: post body lives in feed-commentary_ wrapper
    for (const commentary of container.querySelectorAll('[componentkey^="feed-commentary_"]')) {
      if (!isPostBodyTextElement(commentary)) continue;
      const leaf = commentary.querySelector('[data-testid="expandable-text-box"]');
      const text = (leaf?.textContent || commentary.textContent)?.trim();
      if (text && text.length > 10) {
        log('extractPostText: matched feed-commentary_', { preview: text.substring(0, 80) });
        return safeTruncate(text, VALIDATION.MAX_POST_LENGTH);
      }
    }

    for (const el of container.querySelectorAll('[data-view-name="feed-commentary"]')) {
      if (!isPostBodyTextElement(el)) continue;
      const text = el.textContent?.trim();
      if (text && text.length > 10) {
        log('extractPostText: matched feed-commentary view', { preview: text.substring(0, 80) });
        return safeTruncate(text, VALIDATION.MAX_POST_LENGTH);
      }
    }

    // Pick longest expandable-text-box outside comment subtrees (post body is usually longest)
    let bestText = '';
    for (const el of container.querySelectorAll('[data-testid="expandable-text-box"]')) {
      if (!isPostBodyTextElement(el)) continue;
      const text = el.textContent?.trim();
      if (text && text.length > bestText.length) bestText = text;
    }
    if (bestText.length > 10) {
      log('extractPostText: matched expandable-text-box', { preview: bestText.substring(0, 80) });
      return safeTruncate(bestText, VALIDATION.MAX_POST_LENGTH);
    }

    // LinkedIn has changed its class structure over time — try legacy selectors
    const selectors = [
      '.feed-shared-update-v2__description .break-words',
      '.update-components-text .break-words',
      '.feed-shared-text-view .break-words',
      '.feed-shared-update-v2__description',
      '.update-components-text',
      '.feed-shared-inline-show-more-text .break-words',
      '.attributed-text-segment-list__content',
      '[data-test-id="main-feed-activity-card__commentary"]',
    ];

    for (const sel of selectors) {
      const el = container.querySelector(sel);
      if (el && isPostBodyTextElement(el)) {
        const text = el.textContent?.trim();
        if (text && text.length > 10) {
          log('extractPostText: matched legacy', { selector: sel, preview: text.substring(0, 80) });
          return safeTruncate(text, VALIDATION.MAX_POST_LENGTH);
        }
      }
    }

    // Last resort: post body appears above the reaction facepile in the same card
    const facepile = container.querySelector('[data-testid*="ReactionFacepileCollection-urn:li:"]');
    if (facepile) {
      const candidates = [
        ...container.querySelectorAll(
          '[componentkey^="feed-commentary_"], [data-view-name="feed-commentary"], [data-testid="expandable-text-box"]',
        ),
      ].filter((el) => {
        if (!isPostBodyTextElement(el)) return false;
        return (el.compareDocumentPosition(facepile) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      });
      let best = '';
      for (const el of candidates) {
        const text = el.textContent?.trim();
        if (text && text.length > best.length) best = text;
      }
      if (best.length > 10) {
        log('extractPostText: matched pre-facepile candidate', { preview: best.substring(0, 80) });
        return safeTruncate(best, VALIDATION.MAX_POST_LENGTH);
      }
    }

    log('extractPostText: no selector matched — returning empty string');
    return '';
  }

  extractPostId(container) {
    const facepile = container.querySelector('[data-testid*="ReactionFacepileCollection-urn:li:activity:"]');
    if (facepile) {
      const urn = facepile.getAttribute('data-testid')?.replace('ReactionFacepileCollection-', '');
      if (urn) return urn;
    }

    // SDUI posts use componentkey (Feb 2026+)
    const ckEl = container.hasAttribute('componentkey')
      ? container
      : container.querySelector('[componentkey*="FeedType"]');
    const componentKey = ckEl?.getAttribute('componentkey');
    if (componentKey) {
      const expandedMatch = componentKey.match(/^expanded(.+?)FeedType/);
      if (expandedMatch) return expandedMatch[1];
    }

    // Prefer data-urn which is the canonical LinkedIn post identifier
    const urnEl = container.hasAttribute('data-urn') ? container : container.querySelector('[data-urn]');
    if (urnEl) return urnEl.getAttribute('data-urn');

    const idEl = container.querySelector('[data-id]');
    if (idEl) return idEl.getAttribute('data-id');

    return null;
  }

  /**
   * Extract post author display name from the post container (DOM-aligned with LINKEDIN-DOM-SCAN).
   * Scoped to container so we get the author of the specific post, not another card/comment.
   */
  extractAuthorName(container) {
    if (!container) return '';

    let name = '';

    // SDUI feed: actor image link is the most stable post-author anchor
    const actorImageEl = container.querySelector('[data-view-name="feed-actor-image"]');
    if (actorImageEl) {
      const actorLink =
        actorImageEl.closest('a[href*="/in/"], a[href*="/company/"]') ||
        actorImageEl.querySelector('a[href*="/in/"], a[href*="/company/"]');
      if (actorLink) {
        const ariaLabel = actorLink.getAttribute('aria-label')?.trim();
        if (ariaLabel) {
          const cleaned = ariaLabel.replace(/^View\s+/, '').replace(/'s\s+.*$/i, '').trim();
          if (cleaned) name = cleaned;
        }
        if (!name) {
          const firstLine = actorLink.textContent?.trim().split('\n')[0]?.trim();
          if (firstLine && firstLine.length > 1) name = firstLine.split('•')[0]?.trim() || firstLine;
        }
      }
    }

    // TipTap-era cards: first profile link with visible text in the post card
    if (!name) {
      const profileLink = [...container.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')].find((a) => {
        if (a.closest('[componentkey^="replaceableComment_"]')) return false;
        if (a.closest('[componentkey^="commentBox-"]')) return false;
        const t = a.textContent?.trim();
        return t && t.length > 1 && !t.startsWith('http');
      });
      if (profileLink) {
        const firstLine = profileLink.textContent.trim().split('\n')[0]?.trim();
        if (firstLine && firstLine.length > 1) {
          name = firstLine.split('•')[0]?.trim() || firstLine;
        }
      }
    }

    // Step 1: Find actor element scoped to post container
    const actorEl = container.querySelector('[class*="update-components-actor"]')
      || container.querySelector('.feed-shared-actor');

    if (actorEl) {
      // Primary (scan-style): first span with aria-hidden, no children, non-empty text, not visually-hidden
      const nameSpan = [...actorEl.querySelectorAll('span')].find(el => {
        if (el.getAttribute('aria-hidden') !== 'true') return false;
        if (el.children.length !== 0) return false;
        const t = el.innerText?.trim();
        if (!t || t.length === 0) return false;
        const cls = typeof el.className === 'string' ? el.className : '';
        if (cls.includes('visually-hidden')) return false;
        return true;
      });
      if (nameSpan) {
        const t = (nameSpan.innerText?.trim() || '').split('\n')[0]?.trim();
        if (t) name = t;
      }

      // Fallback (scan-style): profile link aria-label "View X's ..." -> "X"
      if (!name) {
        const profileLink = actorEl.querySelector('a[href*="/in/"], a[href*="/company/"]');
        const ariaLabel = profileLink?.getAttribute('aria-label')?.trim();
        if (ariaLabel) {
          const cleaned = ariaLabel.replace(/^View\s+/, '').replace(/'s\s+.*$/i, '').trim();
          if (cleaned) name = cleaned;
        }
      }
    }

    // Fallback (existing): keep current selectors without requiring actor wrapper
    if (!name) {
      const selectors = [
        '.update-components-actor__name span[dir="ltr"]',
        '.feed-shared-actor__name span[dir="ltr"]',
        '.update-components-actor__name',
        '.feed-shared-actor__name',
      ];
      for (const sel of selectors) {
        const el = container.querySelector(sel);
        if (el) {
          const text = (
            el.firstChild?.nodeType === Node.TEXT_NODE
              ? el.firstChild.textContent
              : el.textContent
          )?.trim().split('\n')[0]?.trim();
          if (text) {
            name = text;
            break;
          }
        }
      }
    }

    return name || '';
  }

  /**
   * Get logged-in user from DOM (LINKEDIN-DOM-SCAN getLoggedInUser strategies, DOM-only).
   * Cached on instance for OA detection. Used to compare with post author.
   */
  getLoggedInUserFromDOM() {
    if (this._loggedInUser !== null) return this._loggedInUser;

    let name = '';
    let slug = null;
    let profileUrl = null;
    let link = null;

    // Strategy 1: Nav (most reliable)
    const navLink = document.querySelector('[class*="global-nav__me"] a[href*="/in/"]');
    const navImg = document.querySelector('[class*="global-nav__me"] img') ||
      document.querySelector('.global-nav__me-photo');
    if (navLink) {
      link = navLink;
      const raw = link.href || '';
      profileUrl = raw.split('?')[0] || null;
      slug = (profileUrl && profileUrl.match(/\/in\/([^/?]+)/)) ? profileUrl.match(/\/in\/([^/?]+)/)[1] : null;
      if (navImg && navImg.alt) name = navImg.alt.trim();
    }

    // Strategy 2: First profile link with image (doc Strategy 1)
    if (!link) {
      const withImg = [...document.querySelectorAll('a[href*="/in/"]')].filter(a => a.querySelector('img'));
      const selfLink = withImg[0];
      if (selfLink) {
        link = selfLink;
        const raw = link.href || '';
        profileUrl = raw.split('?')[0] || null;
        slug = (profileUrl && profileUrl.match(/\/in\/([^/?]+)/)) ? profileUrl.match(/\/in\/([^/?]+)/)[1] : null;
        const selfImg = selfLink.querySelector('img');
        if (!name && selfImg && selfImg.alt)
          name = selfImg.alt.replace(/^Photo of\s+/i, '').trim();
      }
    }

    if (!link) {
      this._loggedInUser = null;
      return null;
    }

    if (!name) name = '';
    const result = { name, slug, profileUrl };
    this._loggedInUser = result;
    return result;
  }

  /**
   * Get post author profile (slug, profileUrl) from post container for OA comparison.
   */
  getPostAuthorProfileFromContainer(container) {
    if (!container) return { slug: null, profileUrl: null, isCompany: false };
    const actorEl = container.querySelector('[class*="update-components-actor"]') ||
      container.querySelector('.feed-shared-actor');
    const profileLink = actorEl?.querySelector('a[href*="/in/"], a[href*="/company/"]');
    if (!profileLink || !profileLink.href) return { slug: null, profileUrl: null, isCompany: false };
    const rawUrl = profileLink.href;
    const cleanUrl = rawUrl.split('?')[0];
    const slug = cleanUrl.match(/\/in\/([^/?]+)/)?.[1] || null;
    const isCompany = rawUrl.includes('/company/');
    return { slug, profileUrl: cleanUrl, isCompany };
  }

  /**
   * Detects if the viewer is the original author of the post.
   * Uses Edit/Delete, "You", then logged-in user vs post author comparison (slug/url/name).
   */
  detectViewerIsOA(container) {
    // 1. Edit/Delete (fast, reliable when present)
    const indicators = [
      '[aria-label*="Edit post"]',
      '[aria-label*="Delete post"]',
      '[aria-label*="Edit article"]',
    ];
    for (const sel of indicators) {
      if (container.querySelector(sel)) {
        log('detectViewerIsOA: OA via Edit/Delete');
        return true;
      }
    }

    // 2. "You" in actor (post author name)
    const actorSelectors = [
      '.update-components-actor__name span[dir="ltr"]',
      '.feed-shared-actor__name span[dir="ltr"]',
      '.update-components-actor__name',
      '.feed-shared-actor__name',
    ];
    for (const sel of actorSelectors) {
      const el = container.querySelector(sel);
      if (el) {
        const text = (el.firstChild?.nodeType === Node.TEXT_NODE ? el.firstChild.textContent : el.textContent)?.trim().split('\n')[0] ?? '';
        if (text === 'You' || /^You\b/.test(text)) {
          log('detectViewerIsOA: OA via You');
          return true;
        }
      }
    }

    // 3. Logged-in user vs post author (slug / profileUrl / name)
    const me = this.getLoggedInUserFromDOM();
    const postAuthor = this.getPostAuthorProfileFromContainer(container);
    const postAuthorName = this.extractAuthorName(container);

    const normalizeUrl = (url) => (url && typeof url === 'string') ? url.trim().toLowerCase().replace(/\/$/, '') : '';
    const normalizeName = (n) => (n && typeof n === 'string') ? n.trim().toLowerCase().replace(/\s+/g, ' ') : '';

    if (me) {
      if (postAuthor.slug && me.slug && postAuthor.slug.toLowerCase() === me.slug.toLowerCase()) {
        log('detectViewerIsOA: OA via slug match');
        return true;
      }
      if (postAuthor.profileUrl && me.profileUrl && normalizeUrl(postAuthor.profileUrl) === normalizeUrl(me.profileUrl)) {
        log('detectViewerIsOA: OA via profileUrl match');
        return true;
      }
      if (me.name && postAuthorName && normalizeName(postAuthorName) === normalizeName(me.name)) {
        log('detectViewerIsOA: OA via name match');
        return true;
      }
    }

    log('detectViewerIsOA: not OA (no match)');
    return false;
  }

  isReplyToCommentForm(form, editor) {
    return !!this.getReplyWrapperElement(form, editor);
  }

  /**
   * Returns the reply-box scope when replying to a comment (not the top-level post comment).
   * Used to find the parent comment via previousElementSibling of this wrapper.
   */
  getReplyWrapperElement(form, editor = null) {
    if (!form) return null;

    const formCk = form.getAttribute?.('componentkey') || '';
    if (isCommentBoxComponentKey(formCk)) {
      const mentionText = (editor?.textContent || editor?.innerText || '').trim();
      if (mentionText.startsWith('@')) {
        return form;
      }

      let prev = form.previousElementSibling;
      for (let s = 0; s < 8 && prev; s++) {
        const prevCk = prev.getAttribute?.('componentkey') || '';
        if (
          prevCk.startsWith('replaceableComment_') ||
          findReplaceableCommentRoot(prev) ||
          prev.querySelector?.('button[aria-label*="View more options for"]')
        ) {
          return form;
        }
        prev = prev.previousElementSibling;
      }

      // commentBox nested inside the comment row being replied to
      const parentReplaceable = form.parentElement?.closest?.('[componentkey^="replaceableComment_"]');
      if (parentReplaceable?.contains(form) && parentReplaceable !== form) {
        return form;
      }
    }

    let el = form.parentElement;
    for (let i = 0; i < 15 && el; i++) {
      const cls = el.className && typeof el.className === 'string' ? el.className : '';
      if (cls.includes('comments-comment-box--cr') || cls.includes('comment-box--cr')) return el;
      el = el.parentElement;
    }
    return null;
  }

  /**
   * Uses the editor placeholder to decide: "Add a comment..." = comment on post, "Add a reply..." = reply to comment.
   * Returns 'comment' | 'reply' | null (null = unknown, fall back to DOM).
   */
  getPlaceholderIntent(editor) {
    const ariaLabel = (editor?.getAttribute?.('aria-label') ?? '').trim().toLowerCase();
    if (ariaLabel.includes('reply')) return 'reply';
    if (ariaLabel.includes('comment')) return 'comment';

    const raw = (editor?.dataset?.placeholder ?? editor?.getAttribute?.('data-placeholder') ?? '').trim().toLowerCase();
    if (!raw) return null;
    if (raw.includes('reply') || raw.includes('répondre')) return 'reply';
    if (raw.includes('comment')) return 'comment';
    return null;
  }

  buildThreadContext(editor, postContainer) {
    const form = this.findCommentForm(editor);
    log('buildThreadContext: start', {
      editorLabel: editor.getAttribute('aria-label')?.substring(0, 40),
      hasForm: !!form,
      formCk: form?.getAttribute?.('componentkey')?.substring(0, 40),
    });

    const placeholderIntent = this.getPlaceholderIntent(editor);
    if (placeholderIntent === 'comment') {
      log('buildThreadContext: top-level comment on post — null');
      return null;
    }

    const replyBox = this.getReplyWrapperElement(form, editor);
    const isReplyToComment = placeholderIntent === 'reply' || !!replyBox;
    log('buildThreadContext: detection', {
      isReplyToComment,
      placeholderIntent,
      hasReplyBox: !!replyBox,
    });

    if (!isReplyToComment) {
      log('buildThreadContext: top-level comment — null');
      return null;
    }

    const mentionName = (editor.textContent || editor.innerText || '').trim();
    log('buildThreadContext: mention', { mentionName: mentionName.slice(0, 60) });

    let commentContainer = this.findParentCommentContainer(replyBox || form, mentionName);

    if (!commentContainer) {
      const article = editor.closest('article.comments-comment-entity');
      if (article) {
        log('buildThreadContext: legacy article fallback');
        commentContainer = article;
      }
    }

    if (!commentContainer) {
      log('buildThreadContext: no comment container — null');
      return null;
    }

    return this._buildThread(commentContainer, postContainer);
  }

  findParentCommentContainer(replyBox, mentionName = '') {
    if (!replyBox) return null;

    const parent = replyBox.parentElement;
    const siblings = [...parent?.children || []];

    if (mentionName.startsWith('@')) {
      const mentionFirst = mentionName.slice(1).split(/\s+/)[0]?.toLowerCase();
      const byMention = siblings.find((sib) => {
        if (sib === replyBox) return false;
        const root = findReplaceableCommentRoot(sib) || sib;
        const optBtn = root.querySelector?.('button[aria-label*="View more options for"]');
        if (!optBtn) return false;
        const author = parseCommentAuthorFromAriaLabel(optBtn.getAttribute('aria-label'));
        return mentionFirst && author.split(/\s+/)[0]?.toLowerCase() === mentionFirst;
      });
      if (byMention) {
        log('buildThreadContext: comment found via @mention match');
        return findReplaceableCommentRoot(byMention) || byMention;
      }
    }

    let prev = replyBox.previousElementSibling;
    for (let s = 0; s < 8 && prev; s++) {
      const replaceable = findReplaceableCommentRoot(prev);
      if (replaceable) {
        log('buildThreadContext: comment found via replaceableComment prevSibling', { steps: s });
        return replaceable;
      }
      if (prev.querySelector?.('button[aria-label*="View more options for"]')) {
        log('buildThreadContext: comment found via options button prevSibling', { steps: s });
        return prev;
      }
      prev = prev.previousElementSibling;
    }

    const parentReplaceable = replyBox.parentElement?.closest?.('[componentkey^="replaceableComment_"]');
    if (parentReplaceable?.contains(replyBox) && parentReplaceable !== replyBox) {
      log('buildThreadContext: comment found via parent replaceableComment (nested reply box)');
      return parentReplaceable;
    }

    return null;
  }

  extractCommentAuthorFromContainer(commentContainer) {
    const optBtn = commentContainer.querySelector('button[aria-label*="View more options for"]');
    if (optBtn) {
      const author = parseCommentAuthorFromAriaLabel(optBtn.getAttribute('aria-label'));
      if (author) return author;
    }

    const profileLink = [...commentContainer.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')].find((a) => {
      if (a.closest('[componentkey^="commentBox-"]')) return false;
      const t = a.textContent?.trim();
      return t && t.length > 1;
    });
    if (profileLink) {
      const firstLine = profileLink.textContent.trim().split('\n')[0]?.trim();
      if (firstLine) return firstLine.split('•')[0]?.trim() || firstLine;
    }

    return 'unknown';
  }

  extractCommentTextFromContainer(commentContainer) {
    const textBox = [...commentContainer.querySelectorAll('[data-testid="expandable-text-box"]')].find(
      (el) => !el.closest(TIPTAP_WRAPPER_SELECTOR),
    );
    if (textBox?.textContent?.trim()?.length >= 5) {
      return textBox.textContent.trim();
    }

    const legacySelectors = [
      '.comments-comment-item__main-content',
      '.comments-comment-item_main-content',
      'section.comments-comment-entity__content',
      '.feed-shared-main-content--comment',
      '[class*="comment-item__main-content"]',
      '[class*="comment-item_main-content"]',
    ];
    for (const sel of legacySelectors) {
      const el = commentContainer.querySelector(sel);
      const t = el?.textContent?.trim();
      if (t && t.length >= 5) return t;
    }

    try {
      const clone = commentContainer.cloneNode(true);
      clone.querySelectorAll(
        `${TIPTAP_WRAPPER_SELECTOR}, button, img, svg, [role="img"], [componentkey^="commentBox-"]`,
      ).forEach((el) => el.remove());
      const lines = clone.textContent?.split('\n').map((l) => l.trim()).filter(Boolean) || [];
      const skipPatterns = [
        /^(1st|2nd|3rd|You|Following)$/i,
        /^\d+[mhd]$/,
        /^\d+$/,
        /^(Like|Reply|React)$/i,
        /^(Author|Premium|Verified)$/i,
        /^•/,
        /^@\w+/,
      ];
      const contentLines = lines.filter((line, idx) => {
        if (idx === 0) return false;
        if (skipPatterns.some((p) => p.test(line))) return false;
        if (line.length < 3) return false;
        return true;
      });
      if (contentLines.length > 0) {
        return contentLines.join(' ');
      }

      // SDUI: longest text leaf among p/span (comments lack expandable-text-box)
      let best = '';
      for (const el of clone.querySelectorAll('p, span')) {
        const t = el.textContent?.trim();
        if (t && t.length > best.length && t.length >= 5) best = t;
      }
      if (best.length >= 5) return best;
    } catch (e) {
      log('extractCommentTextFromContainer: fallback error', e.message);
    }

    return null;
  }

  _buildThread(commentContainer, postContainer) {
    const commentAuthor = this.extractCommentAuthorFromContainer(commentContainer);
    const commentText = this.extractCommentTextFromContainer(commentContainer);

    if (!commentText || commentText.length < 5) {
      log('_buildThread: no text — null', { len: commentText?.length ?? 0 });
      return null;
    }

    log('_buildThread: done', {
      author: commentAuthor,
      preview: commentText.substring(0, 80),
    });

    const originalPostText = this.extractPostText(postContainer);
    const postAuthorName = this.extractAuthorName(postContainer);

    return {
      isReply: true,
      originalTweet: originalPostText || null,
      originalTweetAuthor: postAuthorName?.trim() || null,
      threadChain: [
        {
          text: originalPostText || '',
          author: postAuthorName?.trim() || 'unknown',
          isOriginal: true,
          isCurrent: false,
        },
        {
          text: safeTruncate(commentText, 300),
          author: commentAuthor,
          isOriginal: false,
          isCurrent: true,
        },
      ],
      currentTweetIndex: 1,
      threadLength: 2,
    };
  }

  // ─── Text Insertion ──────────────────────────────────────────────────────────

  // Strip reply prefixes from generated text (same as X extension)
  stripReplyPrefix(text) {
    const prefixes = [
      'Question', 'Supportive', 'Disagree', 'Enhance', 'Smart',
      'Controversial', 'Marketing', 'Product-marketing',
    ];

    let cleaned = text.trim();

    for (const prefix of prefixes) {
      const regex = new RegExp(`^\\b${prefix}\\b\\s*[^\\w\\s]*\\s*`, 'i');
      if (regex.test(cleaned)) {
        cleaned = cleaned.replace(regex, '').trim();
        break;
      }
    }

    const punctuationRegex = /^([A-Z][a-z]+)([\-:.,!]+)\s+/;
    if (punctuationRegex.test(cleaned) && !cleaned.match(/^[A-Za-z]+,\s/)) {
      cleaned = cleaned.replace(punctuationRegex, '').trim();
    }

    return cleaned;
  }

  insertTextIntoEditor(editor, text) {
    const cleanText = this.stripReplyPrefix(String(text).replace(/<[^>]*>/g, ''));
    editor.focus();

    // Method 1: Try Quill's internal JavaScript API (legacy LinkedIn comment boxes)
    const quill = this.getQuillInstance(editor);
    if (quill) {
      try {
        quill.setText(cleanText);
        quill.setSelection(cleanText.length, 0);
        log('Text inserted via Quill API');
        return;
      } catch (e) {
        log('Quill API failed, trying execCommand:', e.message);
      }
    }

    // Method 2: execCommand — works for TipTap/ProseMirror contenteditable
    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);

      const inserted = document.execCommand('insertText', false, cleanText);
      if (inserted) {
        dispatchEditorInputEvents(editor);
        log('Text inserted via execCommand');
        return;
      }
    } catch (e) {
      log('execCommand failed:', e.message);
    }

    // Method 3: Direct DOM update — notify TipTap/Quill via input events
    editor.innerHTML = `<p>${cleanText}</p>`;
    dispatchEditorInputEvents(editor);
    log('Text inserted via innerHTML fallback');
  }

  getQuillInstance(editor) {
    // Quill attaches itself as __quill on the .ql-container element
    const container = editor.closest('.ql-container');
    if (!container) return null;

    if (container.__quill) return container.__quill;

    const parent = container.parentElement;
    if (parent?.__quill) return parent.__quill;

    return null;
  }

  // ─── Button States ───────────────────────────────────────────────────────────

  setButtonState(btn, controlWrapper, state, message) {
    const textEl = btn.querySelector('.li-ai-btn-text');
    btn.disabled = false;
    btn.classList.remove(
      `${BUTTON_CLASS}--loading`,
      `${BUTTON_CLASS}--done`,
      `${BUTTON_CLASS}--error`,
    );

    switch (state) {
      case 'loading':
        if (textEl) textEl.textContent = 'Generating…';
        btn.disabled = true;
        this.setBarSelectsDisabled(controlWrapper, true);
        btn.classList.add(`${BUTTON_CLASS}--loading`);
        break;
      case 'done':
        if (textEl) textEl.textContent = message || 'Reply Added ✓';
        this.setBarSelectsDisabled(controlWrapper, false);
        btn.classList.add(`${BUTTON_CLASS}--done`);
        break;
      case 'error':
        if (textEl) textEl.textContent = message || 'Error — try again';
        this.setBarSelectsDisabled(controlWrapper, false);
        btn.classList.add(`${BUTTON_CLASS}--error`);
        setTimeout(() => this.setButtonState(btn, controlWrapper, 'default'), 3000);
        break;
      default: // 'default'
        if (textEl) textEl.textContent = 'Generate Reply';
        this.setBarSelectsDisabled(controlWrapper, false);
    }
  }

  destroy() {
    this.observer?.disconnect();
    if (this._scanTimer) clearTimeout(this._scanTimer);
  }
}

new LinkedInReplyInjector();
