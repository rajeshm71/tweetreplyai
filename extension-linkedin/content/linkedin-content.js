import { AuthManager } from '../utils/auth.js';
import { ApiClient } from '../utils/api.js';
import { TIMEOUTS, VALIDATION } from '../config/constants.js';

const LOG_PREFIX = '[LinkedInReply]';
const BUTTON_CLASS = 'li-ai-reply-btn';
const BUTTON_WRAPPER_CLASS = 'li-ai-reply-btn-wrapper';

function log(...args) {
  console.log(LOG_PREFIX, ...args);
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

    // Re-check auth whenever the popup signals a login/logout
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'authUpdated') {
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
    // LinkedIn's comment boxes all use a Quill editor with this selector
    const editors = document.querySelectorAll('.ql-editor[contenteditable="true"]');
    for (const editor of editors) {
      const form = this.findCommentForm(editor);
      if (!form) continue;
      // Skip forms that already have our button
      if (form.querySelector(`.${BUTTON_CLASS}`)) continue;
      this.injectButton(editor, form);
    }
  }

  findCommentForm(editor) {
    // Walk up to find the nearest comment form container
    return (
      editor.closest('.comments-comment-box__form') ||
      editor.closest('.comments-reply-box__form') ||
      editor.closest('form') ||
      editor.closest('[class*="comment-box"]')
    );
  }

  // ─── Button Injection ────────────────────────────────────────────────────────

  injectButton(editor, form) {
    const wrapper = document.createElement('div');
    wrapper.className = BUTTON_WRAPPER_CLASS;

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
      this.handleGenerateReply(editor, btn);
    });

    wrapper.appendChild(btn);

    // Place wrapper before the submit/Post button for natural button ordering
    const submitBtn =
      form.querySelector('button[type="submit"]') ||
      form.querySelector('.comments-comment-box__submit-button') ||
      form.querySelector('[class*="submit-button"]');

    if (submitBtn?.parentElement) {
      submitBtn.parentElement.insertBefore(wrapper, submitBtn);
    } else {
      form.appendChild(wrapper);
    }

    log('Button injected for editor placeholder:', editor.dataset.placeholder || 'comment box');
  }

  // ─── Reply Generation ────────────────────────────────────────────────────────

  async handleGenerateReply(editor, btn) {
    // Re-validate auth on each click — uses cache so no network hit on most clicks
    if (!this.isAuthenticated) {
      this.isAuthenticated = await this.authManager.isAuthenticated();
    }
    if (!this.isAuthenticated) {
      this.setButtonState(btn, 'error', 'Sign in required');
      return;
    }

    const context = this.extractContext(editor);

    if (!context.postText || context.postText.length < VALIDATION.MIN_POST_LENGTH) {
      log('Post text not found or too short:', context.postText?.length ?? 0);
      this.setButtonState(btn, 'error', 'Post text not found');
      return;
    }

    log('Context extracted:', {
      preview: context.postText.substring(0, 80),
      postId: context.postId,
      author: context.authorName,
      isOA: context.viewerIsOA,
      hasThread: !!context.threadContext,
    });

    this.setButtonState(btn, 'loading');

    try {
      const { liPromptVariation = 'default' } = await chrome.storage.local.get(['liPromptVariation']);

      // Build payload — api.js automatically appends platform: 'linkedin'
      const payload = {
        tweet_text: context.postText,
        tweet_id: context.postId || '',
        author_info: { username: context.authorName },
        prompt_variation: liPromptVariation,
        viewer_is_original_author: context.viewerIsOA,
      };

      if (context.threadContext) {
        payload.thread_context = context.threadContext;
      }

      const response = await this.apiClient.generateReply(payload);
      const reply = response?.reply || response?.tweet;

      if (reply) {
        this.insertTextIntoEditor(editor, reply);
        this.setButtonState(btn, 'done', 'Reply Added ✓');
        setTimeout(() => this.setButtonState(btn, 'default'), 2500);
      } else {
        this.setButtonState(btn, 'error', 'No reply generated');
      }
    } catch (error) {
      log('Error generating reply:', error.message);
      if (error.message?.includes('402')) {
        this.setButtonState(btn, 'error', 'Quota exceeded');
      } else if (error.message?.includes('401')) {
        this.isAuthenticated = false;
        this.authManager.clearCache();
        this.setButtonState(btn, 'error', 'Sign in required');
      } else {
        this.setButtonState(btn, 'error', 'Error — try again');
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

    const postContainer = this.findPostContainer(editor);
    if (!postContainer) {
      log('Could not find post container from editor');
      return ctx;
    }

    ctx.postText = this.extractPostText(postContainer);
    ctx.postId = this.extractPostId(postContainer);
    ctx.authorName = this.extractAuthorName(postContainer);
    ctx.viewerIsOA = this.detectViewerIsOA(postContainer);
    ctx.threadContext = this.buildThreadContext(editor, postContainer);

    return ctx;
  }

  findPostContainer(editor) {
    // Walk up from the editor to find the element with a LinkedIn data-urn attribute.
    // LinkedIn wraps each feed post in an element with data-urn="urn:li:activity:..."
    let el = editor.parentElement;
    while (el && el !== document.body) {
      if (
        el.hasAttribute('data-urn') ||
        el.classList.contains('feed-shared-update-v2') ||
        el.classList.contains('occludable-update') ||
        el.classList.contains('main-feed-activity-card')
      ) {
        return el;
      }
      el = el.parentElement;
    }

    // Fallback: search all data-urn containers and find the one that contains this editor
    const allUrns = document.querySelectorAll('[data-urn]');
    for (const urn of allUrns) {
      if (urn.contains(editor)) return urn;
    }

    return editor.closest('article') || document.querySelector('main');
  }

  extractPostText(container) {
    // LinkedIn has changed its class structure over time — try all known selectors
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
      if (el) {
        const text = el.textContent?.trim();
        if (text && text.length > 10) {
          return text.substring(0, VALIDATION.MAX_POST_LENGTH);
        }
      }
    }

    return '';
  }

  extractPostId(container) {
    // Prefer data-urn which is the canonical LinkedIn post identifier
    const urnEl = container.hasAttribute('data-urn') ? container : container.querySelector('[data-urn]');
    if (urnEl) return urnEl.getAttribute('data-urn');

    const idEl = container.querySelector('[data-id]');
    if (idEl) return idEl.getAttribute('data-id');

    return null;
  }

  extractAuthorName(container) {
    const selectors = [
      '.update-components-actor__name span[dir="ltr"]',
      '.feed-shared-actor__name span[dir="ltr"]',
      '.update-components-actor__name',
      '.feed-shared-actor__name',
    ];

    for (const sel of selectors) {
      const el = container.querySelector(sel);
      if (el) {
        // Use only the primary text node to avoid picking up sub-element text
        const text = (
          el.firstChild?.nodeType === Node.TEXT_NODE
            ? el.firstChild.textContent
            : el.textContent
        )?.trim().split('\n')[0];
        if (text) return text;
      }
    }

    return '';
  }

  detectViewerIsOA(container) {
    // LinkedIn only renders edit/delete controls when the viewer is the post author.
    // These aria-labels are present in the DOM even when the overflow menu is closed.
    const indicators = [
      '[aria-label*="Edit post"]',
      '[aria-label*="Delete post"]',
      '[aria-label*="Edit article"]',
    ];

    for (const sel of indicators) {
      if (container.querySelector(sel)) {
        log('OA detected via selector:', sel);
        return true;
      }
    }

    return false;
  }

  buildThreadContext(editor, postContainer) {
    // Detect nested reply: when replying to a comment, LinkedIn opens a reply editor
    // inside or adjacent to the comment's DOM node (.comments-comment-item).
    const commentItem =
      editor.closest('.comments-comment-item') ||
      editor.closest('[class*="reply-container"]');

    if (!commentItem) return null;

    // Find the comment text being replied to (the content of the parent comment)
    const commentContent =
      commentItem.querySelector('.comments-comment-item__main-content') ||
      commentItem.querySelector('.feed-shared-main-content') ||
      commentItem.previousElementSibling?.querySelector('.comments-comment-item__main-content');

    const commentText = commentContent?.textContent?.trim();
    if (!commentText || commentText.length < 5) return null;

    const originalPostText = this.extractPostText(postContainer);

    // The thread_context wire format matches the Zod schema in routes.ts
    // which uses originalTweet/originalTweetAuthor as field names.
    // routes.ts maps these to the LinkedIn-internal originalPost/originalPostAuthor.
    return {
      isReply: true,
      originalTweet: originalPostText || null,
      originalTweetAuthor: null,
      threadChain: [
        { text: originalPostText || '', author: 'unknown', isOriginal: true, isCurrent: false },
        { text: commentText.substring(0, 300), author: 'unknown', isOriginal: false, isCurrent: true },
      ],
      currentTweetIndex: 1,
      threadLength: 2,
    };
  }

  // ─── Text Insertion ──────────────────────────────────────────────────────────

  insertTextIntoEditor(editor, text) {
    editor.focus();

    // Method 1: Try Quill's internal JavaScript API (most reliable for LinkedIn)
    const quill = this.getQuillInstance(editor);
    if (quill) {
      try {
        quill.setText(text);
        quill.setSelection(text.length, 0);
        log('Text inserted via Quill API');
        return;
      } catch (e) {
        log('Quill API failed, trying execCommand:', e.message);
      }
    }

    // Method 2: execCommand — widely supported for contenteditable elements
    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);

      const inserted = document.execCommand('insertText', false, text);
      if (inserted) {
        log('Text inserted via execCommand');
        return;
      }
    } catch (e) {
      log('execCommand failed:', e.message);
    }

    // Method 3: Direct innerHTML as last resort — fires input events to notify Quill
    editor.innerHTML = `<p>${text}</p>`;
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
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

  setButtonState(btn, state, message) {
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
        btn.classList.add(`${BUTTON_CLASS}--loading`);
        break;
      case 'done':
        if (textEl) textEl.textContent = message || 'Reply Added ✓';
        btn.classList.add(`${BUTTON_CLASS}--done`);
        break;
      case 'error':
        if (textEl) textEl.textContent = message || 'Error — try again';
        btn.classList.add(`${BUTTON_CLASS}--error`);
        // Auto-reset after 3 seconds so the user can try again
        setTimeout(() => this.setButtonState(btn, 'default'), 3000);
        break;
      default: // 'default'
        if (textEl) textEl.textContent = 'Generate Reply';
    }
  }

  destroy() {
    this.observer?.disconnect();
    if (this._scanTimer) clearTimeout(this._scanTimer);
  }
}

new LinkedInReplyInjector();
