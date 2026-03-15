import { AuthManager } from '../utils/auth.js';
import { ApiClient } from '../utils/api.js';
import { TIMEOUTS, VALIDATION } from '../config/constants.js';

const LOG_PREFIX = '[LinkedInReply]';
const BUTTON_CLASS = 'li-ai-reply-btn';
const BUTTON_WRAPPER_CLASS = 'li-ai-reply-btn-wrapper';

function log(...args) {
  console.log(LOG_PREFIX, ...args);
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
      viewerIsOA: context.viewerIsOA,
      threadLength: context.threadContext?.threadLength,
    });

    this.setButtonState(btn, 'loading');

    try {
      let liPromptVariation = 'default';
      try {
        const stored = await chrome.storage?.local?.get(['liPromptVariation']);
        if (stored?.liPromptVariation) liPromptVariation = stored.liPromptVariation;
      } catch (e) {
        log('chrome.storage unavailable, using default variation');
      }

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
      const commentOnComment = !!(context.threadContext?.isReply && context.threadContext?.threadLength > 1);
      log('handleGenerateReply: payload summary', {
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

    log('extractContext: starting', { placeholder: editor.dataset?.placeholder?.substring(0, 40) });
    const postContainer = this.findPostContainer(editor);
    if (!postContainer) {
      log('extractContext: could not find post container from editor');
      return ctx;
    }
    log('extractContext: postContainer found', { tag: postContainer.tagName, urn: postContainer.getAttribute?.('data-urn')?.substring(0, 60) });

    ctx.postText = this.extractPostText(postContainer);
    ctx.postId = this.extractPostId(postContainer);
    ctx.authorName = this.extractAuthorName(postContainer);
    log('extractContext: post', { postTextLen: ctx.postText?.length ?? 0, postId: ctx.postId?.substring(0, 40), author: ctx.authorName?.substring(0, 30) });

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
          return safeTruncate(text, VALIDATION.MAX_POST_LENGTH);
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

  /**
   * Detects if the viewer is the original author of the post.
   * Can be wrong when the overflow menu was never opened (Edit/Delete not in DOM).
   * The "You" fallback is best-effort.
   */
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
        log('detectViewerIsOA: OA detected via Edit/Delete selector', sel);
        return true;
      }
    }

    // Fallback: "You" in the actor/header area (e.g. "You" as post author)
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
    const raw = (editor?.dataset?.placeholder ?? editor?.getAttribute?.('data-placeholder') ?? '').trim().toLowerCase();
    if (!raw) return null;
    if (raw.includes('reply') || raw.includes('répondre')) return 'reply';
    if (raw.includes('comment')) return 'comment';
    return null;
  }

  buildThreadContext(editor, postContainer) {
    const form = this.findCommentForm(editor);
    const formClass = form?.className ?? '(no form)';
    log('buildThreadContext: form', { hasForm: !!form, formClass: typeof formClass === 'string' ? formClass.substring(0, 80) : formClass });

    // --- Decide: reply to post vs reply to comment. Placeholder is the source of truth. ---
    const placeholderIntent = this.getPlaceholderIntent(editor);
    if (placeholderIntent === 'comment') {
      log('Detected: reply-to-post (comment on post)', { reason: 'placeholder indicates "Add a comment..."' });
      return null;
    }
    if (placeholderIntent === 'reply') {
      log('Detected: reply-to-comment', { reason: 'placeholder indicates "Add a reply..."' });
    }

    // If placeholder was unknown, fall back to DOM: commentItem, reply-box form, or --cr wrapper
    const commentItem =
      editor.closest('.comments-comment-item') ||
      editor.closest('[class*="reply-container"]');
    const isReplyBoxForm = !!(form?.classList?.contains?.('comments-reply-box__form') || form?.className?.includes?.('comments-reply-box'));
    const isCrWrapper = this.isReplyToCommentForm(form);
    const isReplyToCommentByDom = !!commentItem || isReplyBoxForm || isCrWrapper;

    if (placeholderIntent === null && !isReplyToCommentByDom) {
      log('Detected: reply-to-post', { reason: 'placeholder unknown and no reply DOM cues' });
      return null;
    }
    if (placeholderIntent === null && isReplyToCommentByDom) {
      log('Detected: reply-to-comment', {
        reason: commentItem ? 'editor inside comment item' : isReplyBoxForm ? 'reply-box form' : 'comments-comment-box--cr wrapper',
      });
    }
    log('buildThreadContext: commentItem', { found: !!commentItem, via: commentItem ? (editor.closest('.comments-comment-item') ? 'comments-comment-item' : 'reply-container') : 'none' });

    const commentBodySelectors = [
      '.comments-comment-item__main-content',
      '.comments-comment-item__description',
      '.comments-comment-item__content',
      '.comments-comment-item .update-components-text',
      '.feed-shared-main-content',
      '[class*="comment-item__main-content"]',
      '[class*="comment-item__description"]',
      '[class*="comment-item__content"]',
      '[class*="main-content"]',
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
      // Nuclear fallback: find the nearest .comments-comment-item, strip interactive
      // children (forms, buttons, editors), and read whatever text remains.
      const item = root.matches?.('.comments-comment-item')
        ? root
        : root.querySelector?.('.comments-comment-item');
      if (item) {
        const clone = item.cloneNode(true);
        clone.querySelectorAll('form, button, .ql-editor, .comments-comment-box').forEach(el => el.remove());
        const t = clone.textContent?.trim();
        if (t && t.length >= 5) return t;
      }
      return null;
    }

    let commentText = null;
    if (commentItem) {
      const commentContent =
        commentItem.querySelector('.comments-comment-item__main-content') ||
        commentItem.querySelector('.feed-shared-main-content') ||
        commentItem.previousElementSibling?.querySelector('.comments-comment-item__main-content');
      commentText = commentContent?.textContent?.trim();
      log('buildThreadContext: commentItem found', commentText ? `comment length ${commentText.length}` : 'no body');
    } else if (isReplyBoxForm) {
      log('buildThreadContext: reply-to-comment path (comments-reply-box); form class:', form?.className?.substring(0, 80));
      let searchRoot = form.previousElementSibling || form.parentElement;
      while (searchRoot && !commentText) {
        commentText = getCommentTextFromRoot(searchRoot);
        if (commentText) log('buildThreadContext: reply-box fallback found comment', commentText.length, 'chars');
        if (!commentText) searchRoot = searchRoot.parentElement;
      }
      if (!commentText) log('buildThreadContext: reply-box fallback could not find comment text');
    } else if (isCrWrapper) {
      // Reply box is inside comments-comment-box--cr. Parent comment is usually the previous sibling of that wrapper.
      const replyWrapper = this.getReplyWrapperElement(form);
      log('buildThreadContext: reply-to-comment path (--cr wrapper); replyWrapper:', !!replyWrapper);

      // Strategy 1: Comment block is the immediate previous sibling of the --cr wrapper (DOM: [comment][reply-form-wrapper])
      if (replyWrapper?.previousElementSibling) {
        commentText = getCommentTextFromRoot(replyWrapper.previousElementSibling);
        if (commentText) log('buildThreadContext: --cr found comment via wrapper.previousElementSibling', commentText.length, 'chars');
        if (!commentText) {
          const item = replyWrapper.previousElementSibling.querySelector?.('.comments-comment-item');
          if (item) commentText = getCommentTextFromRoot(item);
          if (commentText) log('buildThreadContext: --cr found comment via .comments-comment-item in previous sibling', commentText.length, 'chars');
        }
      }

      // Strategy 2: Walk previous siblings of form parents (original fallback)
      if (!commentText) {
        let searchRoot = form?.parentElement?.previousElementSibling ?? form?.previousElementSibling ?? replyWrapper ?? form?.parentElement;
        for (let steps = 0; steps < 8 && searchRoot && !commentText; steps++) {
          commentText = getCommentTextFromRoot(searchRoot);
          if (commentText) {
            log('buildThreadContext: --cr fallback found comment (walk)', commentText.length, 'chars');
            break;
          }
          const commentItemEl = searchRoot.querySelector?.('.comments-comment-item');
          if (commentItemEl) commentText = getCommentTextFromRoot(commentItemEl);
          if (commentText) {
            log('buildThreadContext: --cr fallback found comment via .comments-comment-item', commentText.length, 'chars');
            break;
          }
          searchRoot = searchRoot.previousElementSibling || searchRoot.parentElement;
        }
      }

      // Strategy 3 (out-of-box): Walk backward from reply wrapper to find the nearest comment block before it in DOM
      if (!commentText && replyWrapper) {
        let prev = replyWrapper.previousElementSibling;
        for (let w = 0; w < 12 && prev; w++) {
          const item = prev.classList?.contains?.('comments-comment-item') ? prev : prev.querySelector?.('.comments-comment-item');
          if (item) {
            commentText = getCommentTextFromRoot(item);
            if (commentText) {
              log('buildThreadContext: --cr found comment via walk-back from wrapper', commentText.length, 'chars');
              break;
            }
          }
          prev = prev.previousElementSibling;
        }
      }

      if (!commentText) {
        log('buildThreadContext: --cr all strategies failed; wrapper outerHTML prefix:',
          replyWrapper?.outerHTML?.substring(0, 400));
      }
    }

    if (!commentText || commentText.length < 5) {
      log('buildThreadContext: returning null', { reason: !commentText ? 'no commentText' : 'commentText too short', len: commentText?.length ?? 0 });
      return null;
    }

    const originalPostText = this.extractPostText(postContainer);

    // The thread_context wire format matches the Zod schema in routes.ts
    // which uses originalTweet/originalTweetAuthor as field names.
    // routes.ts maps these to the LinkedIn-internal originalPost/originalPostAuthor.
    const built = {
      isReply: true,
      originalTweet: originalPostText || null,
      originalTweetAuthor: null,
      threadChain: [
        { text: originalPostText || '', author: 'unknown', isOriginal: true, isCurrent: false },
        { text: safeTruncate(commentText, 300), author: 'unknown', isOriginal: false, isCurrent: true },
      ],
      currentTweetIndex: 1,
      threadLength: 2,
    };
    log('buildThreadContext: built thread (comment-on-comment recognized)', { threadLength: built.threadLength, commentPreviewLen: commentText.length });
    return built;
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
