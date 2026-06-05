import { AuthManager } from '../utils/auth.js';
import { ApiClient } from '../utils/api.js';
import { installConsoleGate } from '../utils/consoleGate.js';
import {
  APP_DISPLAY_NAME,
  API,
  POLLING,
  TIMEOUTS,
  DEFAULTS,
  VALIDATION,
  AUTH,
  STORAGE,
  CTA_STORAGE,
  SNIPPET_STORAGE,
  FOLLOW_BADGE_ICON_STYLE,
  FOLLOW_BADGE_ICON_STYLE_DEFAULT,
  FOLLOW_BADGE_ICON_STYLE_VALUES,
  REUSE,
} from '../config/constants.js';
import { emitTelemetry } from '../utils/telemetry.js';
import { getUserFacingError } from '../utils/userFacingErrors.js';
import { initExtensionSentry } from '../utils/sentry.js';

initExtensionSentry({ scope: 'content' });
import { extractCanonicalComposerText, combineReplyAndCta } from './helpers/composer-text.js';
import { injectReuseButtonsImpl } from './helpers/reuse-inject.js';
import { createReuseModal } from './helpers/reuse-modal.js';
import { postReframedToComposeImpl } from './helpers/post-to-compose.js';
import { extractTweetPlainText } from './helpers/tweet-text-extract.js';
import { writeDraftBlocksToContentRoot } from './helpers/draft-blocks.js';

globalThis.__tweetreplyaiExtLoggingAllowed = false;
installConsoleGate(() => globalThis.__tweetreplyaiExtLoggingAllowed === true);

/** Set false to disable thread/original-tweet diagnostic logs (wrong originalTweetAuthor debugging). */
const DIAGNOSE_THREAD_SELECTION = true;

class TwitterReplyInjector {
  constructor() {
    // Return existing instance if already created (SPA navigation guard)
    if (window.__tweetReplyInjector) {
      const existing = window.__tweetReplyInjector;
      // Re-initialize if needed (e.g., after page navigation or DOM ready)
      // Only re-initialize if DOM is ready and not already initialized
      if (document.readyState === 'complete' && !existing.initialized) {
        existing.initialize();
        existing.initialized = true;
      }
      return existing;
    }
    
    this.authManager = new AuthManager();
    this.apiClient = new ApiClient();
    this.isAuthenticated = false;
    this.usageData = null;
    this.injectedButtons = new Set();
    this.injectedContainers = new Set(); // Track injected container IDs
    /** Dedupe set for the Reuse button injection (one button per article element). */
    this.injectedReuseButtons = new WeakSet();
    /** Active Reuse modal handle ({ element, close }) or null. */
    this._reuseModal = null;
    /** @type {Map<string, { followedBy: boolean, following: boolean, hasRelationshipData: boolean }>} */
    this.followStatusByUser = new Map();
    this.followBadgeRefreshTimer = null;
    this.followStatusMessageHandler = null;
    /** Follow chips on X; default on. Synced via chrome.storage.sync (see popup Settings). */
    this.relationshipHintsEnabled = true;
    /** @type {string} One of FOLLOW_BADGE_ICON_STYLE */
    this.followBadgeIconStyle = FOLLOW_BADGE_ICON_STYLE_DEFAULT;
    this.currentReplyTargetArticle = null; // Tweet article when user clicked Reply (for scoped current-tweet extraction)
    this._replyTargetClearTimer = null;
    this.autoLikeEnabled = true; // cached; updated by initialize() and storageChangeHandler
    this.pendingReplyTarget = null; // { username, tweetId, setAt } — for counting reply only on Send click
    this._originalTweetCache = null; // { statusId, text, author, fromDom } — survives DOM virtualization
    this.lastNonComposePath = window.location.pathname;
    this.urlTrackingInterval = setInterval(() => {
      const path = window.location.pathname;
      if (!/\/compose\//.test(path)) {
        this.lastNonComposePath = path;
      }
      // Proactively cache the original tweet for the current detail page before the user scrolls
      this.tryEagerCacheOriginalTweet();
    }, POLLING.URL_TRACKING_MS);

    // Store global reference
    window.__tweetReplyInjector = this;
    
    // Cleanup on page unload
    this.beforeUnloadHandler = () => this.destroy();
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    
    this.initialized = false;
    this.initialize();
    this.initialized = true;
  }

  // Helper to get React Fiber node from DOM element
  getReactInstance(element) {
    // React 16+ stores fiber in __reactFiber$ prefixed keys
    for (const key in element) {
      if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
        return element[key];
      }
    }
    
    // Fallback: check common React property names
    return element._reactInternalFiber || 
           element._reactInternalInstance || 
           null;
  }

  // Helper to find React component from fiber
  getReactComponent(fiber) {
    if (!fiber) return null;
    
    // Traverse up to find component with state
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
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Strip reply prefixes from generated text (based on inject.js)
  stripReplyPrefix(text) {
    const prefixes = [
      "Question", "Supportive", "Disagree", "Enhance", "Smart", 
      "Controversial", "Marketing", "Product-marketing"
    ];
    
    let cleaned = text.trim();
    
    // Remove style prefixes
    for (const prefix of prefixes) {
      const regex = new RegExp(`^\\b${prefix}\\b\\s*[^\\w\\s]*\\s*`, "i");
      if (regex.test(cleaned)) {
        cleaned = cleaned.replace(regex, "").trim();
        break;
      }
    }
    
    // Remove extra punctuation patterns like "Supportive: " or "Smart, "
    const punctuationRegex = /^([A-Z][a-z]+)([\-:.,!]+)\s+/;
    if (punctuationRegex.test(cleaned) && !cleaned.match(/^[A-Za-z]+,\s/)) {
      cleaned = cleaned.replace(punctuationRegex, "").trim();
    }
    
    return cleaned;
  }

  // Find closest text area to a button element (based on inject.js)
  findClosestTextArea(buttonElement) {
    console.log('[TweetReplyAI] 🔍 Finding closest text area to button...');
    
    // Array of selectors to try for finding text input areas
    const textAreaSelectors = [
      'div[data-testid="tweetTextarea_0"]',
      'div[data-testid="tweetTextarea_1"]',
      'div[data-testid="tweetTextarea_2"]',
      'div.public-DraftEditor-content[contenteditable="true"]',
      'div.DraftEditor-root textarea',
      'div[data-testid="reply-to-tweet"] div[contenteditable="true"]'
    ];

    let closestElement = null;
    let closestDistance = Infinity;

    // Try each selector
    for (const selector of textAreaSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        const buttonRect = buttonElement.getBoundingClientRect();
        
        // Find the element closest to the button
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
      console.log('[TweetReplyAI] ✅ Found closest text area:', closestElement.tagName, closestElement.className);
    } else {
      console.warn('[TweetReplyAI] ❌ No text area found');
    }

    return closestElement;
  }

  // Find Twitter text area within an element
  findTwitterTextArea(element) {
    const textArea = element.querySelector('div[data-testid^="tweetTextarea_"][role="textbox"]');
    return textArea || (element.parentElement ? this.findTwitterTextArea(element.parentElement) : null);
  }

  getComposerRequestKey(composer) {
    if (!composer) return 'unknown';
    if (!composer.dataset.tweetreplyComposerKey) {
      composer.dataset.tweetreplyComposerKey = `trai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    return composer.dataset.tweetreplyComposerKey;
  }

  nextComposerRequestVersion(composer, kind) {
    const mapKey = `${kind}:${this.getComposerRequestKey(composer)}`;
    const next = (this.composerRequestVersions.get(mapKey) || 0) + 1;
    this.composerRequestVersions.set(mapKey, next);
    return next;
  }

  isLatestComposerRequest(composer, kind, version) {
    const mapKey = `${kind}:${this.getComposerRequestKey(composer)}`;
    return this.composerRequestVersions.get(mapKey) === version;
  }

  getScopedTwitterInsertionTargets(composer) {
    const textAreaSelector = 'div[data-testid^="tweetTextarea_"][role="textbox"]';
    const textArea = composer.matches?.(textAreaSelector)
      ? composer
      : composer.querySelector?.(textAreaSelector) || composer.closest?.(textAreaSelector);

    // Scope toolbar resolution to composer neighborhood to avoid cross-composer writes.
    const scopeRoot =
      composer.closest?.('[role="dialog"], [data-testid="tweetComposer"], article') ||
      composer.parentElement ||
      document.body;
    const toolbar = scopeRoot.querySelector?.('[data-testid="toolBar"]') || composer.closest?.('[data-testid="toolBar"]');

    return { textArea, toolbar };
  }

  async insertTextTwitterMethod(textArea, composer, text) {
    console.log('[TRAI] insertTextTwitterMethod — connected:', textArea?.isConnected, 'len:', text?.length);
    try { composer?.click?.(); } catch {}
    try { textArea?.focus?.(); } catch {}
    await this.sleep(20);

    // Primary: delegate React fiber walk to MAIN world via postMessage.
    // Content scripts run in an isolated JS world where __reactFiber$ keys on DOM elements
    // are not enumerable. follow-network-interceptor.js runs in MAIN world and handles
    // 'TRAI_INSERT_TEXT' messages, walks the fiber, and calls props.onChange(newEditorState).
    try {
      const markerId = 'trai-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      textArea.dataset.traiMarker = markerId;

      const result = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          window.removeEventListener('message', handler);
          resolve({ success: false, reason: 'timeout' });
        }, 3000);
        function handler(event) {
          if (event.data?.type === 'TRAI_INSERT_TEXT_RESULT' && event.data?.markerId === markerId) {
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        }
        window.addEventListener('message', handler);
        window.postMessage({ type: 'TRAI_INSERT_TEXT', text, markerId }, '*');
      });

      delete textArea.dataset.traiMarker;

      if (result.success) {
        await this.sleep(100);
        console.log('[TRAI] React fiber insert done via MAIN world');
        return;
      }
      console.warn('[TRAI] MAIN world fiber insert failed:', result.reason, 'hops:', result.hops);
    } catch (e) {
      console.warn('[TRAI] postMessage fiber approach threw:', e);
    }

    // Fallback: DOM rewrite, no input event (no crash, but Reply button may stay disabled).
    const contentRoot = textArea?.querySelector?.('[data-contents="true"]');
    if (contentRoot) {
      writeDraftBlocksToContentRoot(contentRoot, text);
      return;
    }

    const span = document.createElement('span');
    span.dataset.text = 'true';
    span.textContent = text;
    if (typeof textArea?.replaceChildren === 'function') {
      textArea.replaceChildren(span);
    }
  }

  extractComposerPlainText(composer) {
    return extractCanonicalComposerText(composer);
  }

  async appendCtaSnippetToComposer(composer, snippet) {
    const trimmed = String(snippet || '').trim();
    if (!trimmed) {
      this.showMessage(composer, 'Set your CTA in extension Settings', 'info');
      return;
    }
    const existing = this.extractComposerPlainText(composer);
    const combined = combineReplyAndCta(existing, trimmed);
    try {
      await this.insertReplyIntoComposer(composer, combined);
    } catch (error) {
      emitTelemetry({
        event_type: 'reply_insert_failed',
        surface: 'content',
        error_code: error?.message || 'append_snippet_failed',
        context: { action: 'append_snippet' },
      });
      throw error;
    }
  }

  async getSnippetLibraryState() {
    const r = await chrome.storage.local.get([
      SNIPPET_STORAGE.LIBRARY,
      SNIPPET_STORAGE.DEFAULT_ID,
      SNIPPET_STORAGE.AUTO_APPEND_ID,
      CTA_STORAGE.TEXT,
      CTA_STORAGE.AUTO_APPEND,
    ]);
    const library = Array.isArray(r[SNIPPET_STORAGE.LIBRARY]) ? r[SNIPPET_STORAGE.LIBRARY] : [];
    const byId = new Map(library.map((s) => [s.id, s]));
    const defaultSnippet = byId.get(r[SNIPPET_STORAGE.DEFAULT_ID] || '');
    const autoSnippet = byId.get(r[SNIPPET_STORAGE.AUTO_APPEND_ID] || '');
    const legacyText = typeof r[CTA_STORAGE.TEXT] === 'string' ? r[CTA_STORAGE.TEXT].trim() : '';
    return { defaultSnippet, autoSnippet, legacyText, legacyAutoAppend: r[CTA_STORAGE.AUTO_APPEND] === true };
  }

  async maybeAutoAppendCtaAfterAiInsert(composer) {
    const { autoSnippet, legacyText, legacyAutoAppend } = await this.getSnippetLibraryState();
    if (autoSnippet?.text) {
      await this.appendCtaSnippetToComposer(composer, String(autoSnippet.text));
      return;
    }
    if (legacyAutoAppend && legacyText) {
      await this.appendCtaSnippetToComposer(composer, legacyText);
    }
  }

  // Auto-like functionality
  async isAutoLikeEnabled() {
    try {
      const result = await chrome.storage.local.get(['tweetreply_auto_like']);
      // Default to enabled if not set
      return result.tweetreply_auto_like !== false;
    } catch (error) {
      console.warn('[TweetReplyAI] Failed to check auto-like setting:', error);
      return true; // Default enabled
    }
  }

  findTweetArticle(element) {
    if (!element) return null;
    
    // Traverse up to find article[data-testid="tweet"]
    let current = element;
    let depth = 0;
    while (current && depth < 10) {
      if (current.tagName === 'ARTICLE' && 
          (current.getAttribute('data-testid') === 'tweet' || 
           current.querySelector('[data-testid="tweet"]'))) {
        return current.getAttribute('data-testid') === 'tweet' 
          ? current 
          : current.querySelector('[data-testid="tweet"]')?.closest('article') || current;
      }
      current = current.parentElement;
      depth++;
    }
    
    // Fallback: look for any article
    const article = element.closest('article');
    return article || null;
  }

  getTweetIdFromArticle(tweetArticle) {
    if (!tweetArticle) return null;
    const id = tweetArticle.getAttribute('data-tweet-id');
    if (id) return id;
    const ariaLabel = tweetArticle.getAttribute('aria-labelledby');
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
      if (btn.getAttribute('data-testid') === 'unlike') return true;
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('unlike')) return true;
      if (btn.getAttribute('aria-pressed') === 'true') return true;
      return false;
    };

    // Strategy 1: data-testid="like" (primary)
    let likeBtn = tweetArticle.querySelector('[data-testid="like"]');
    if (likeBtn) {
      // Check if already liked
      const isLiked = !!tweetArticle.querySelector('[data-testid="unlike"]') ||
                     likeBtn.getAttribute('aria-pressed') === 'true';
      if (isLiked) return null; // Already liked, don't auto-like
      if (isAlreadyLikedOrUnlike(likeBtn)) return null;
      return likeBtn;
    }

    // Strategy 2: button with aria-label containing "Like"
    const buttons = tweetArticle.querySelectorAll('button[aria-label*="Like" i], [role="button"][aria-label*="Like" i]');
    for (const btn of buttons) {
      const ariaLabel = btn.getAttribute('aria-label') || '';
      if (/like/i.test(ariaLabel) && !/unlike/i.test(ariaLabel)) {
        // Check if already liked
        const isLiked = btn.getAttribute('aria-pressed') === 'true' ||
                       btn.querySelector('[data-testid="unlike"]');
        if (!isLiked && !isAlreadyLikedOrUnlike(btn)) return btn;
      }
    }

    // Strategy 3: Look for heart icon button
    const heartButtons = tweetArticle.querySelectorAll('button, [role="button"]');
    for (const btn of heartButtons) {
      const hasHeartIcon = btn.querySelector('svg path[d*="M12"]') ||
                          btn.querySelector('[class*="heart"]') ||
                          btn.innerHTML.includes('M20.884 13.19');
      if (hasHeartIcon) {
        const isLiked = btn.getAttribute('aria-pressed') === 'true' ||
                       btn.querySelector('[data-testid="unlike"]') ||
                       btn.classList.contains('liked');
        if (!isLiked && !isAlreadyLikedOrUnlike(btn)) return btn;
      }
    }

    return null;
  }

  async performAutoLike(likeButton) {
    if (!likeButton) return false;

    try {
      // Method 1: Direct click
      likeButton.click();
      
      // Wait a bit to ensure Twitter's handler processes it
      await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DOM_DEBOUNCE_MS));
      
      return true;
    } catch (error) {
      console.warn('[TweetReplyAI] Failed to auto-like:', error);
      
      // Method 2: Try MouseEvent simulation
      try {
        const event = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        likeButton.dispatchEvent(event);
        await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DOM_DEBOUNCE_MS));
        return true;
      } catch (e) {
        console.warn('[TweetReplyAI] MouseEvent simulation failed:', e);
        return false;
      }
    }
  }

  setupAutoLikeOnReply() {
    // Don't add if already added (prevent accumulation on re-execution)
    if (this.autoLikeClickHandler) return;
    if (!this.autoLikedTweetIds) this.autoLikedTweetIds = new Set();

    // Use event delegation to catch all Reply button clicks
    this.autoLikeClickHandler = async (e) => {
      try {
        const target = e.target;
        if (!target) return;

        // Branch 1: Send button in reply composer — count reply only when user actually sends
        // 1a: Legacy path when X uses tweetComposer (e.g. inline reply)
        const composerContainer = target.closest('[data-testid="tweetComposer"]');
        const submitButton = target.closest('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]');
        if (composerContainer && submitButton && composerContainer.contains(submitButton) && this.isReplyComposer(composerContainer)) {
          const pending = this.pendingReplyTarget;
          const maxAgeMs = 10 * 60 * 1000; // 10 minutes
          if (pending && pending.username && pending.username !== 'unknown' && (Date.now() - pending.setAt) < maxAgeMs) {
            this.trackReply(pending.username).catch(err => {
              console.warn('[TweetReplyAI] Reply tracking failed:', err);
            });
            setTimeout(() => this.updateReplyCountsOnTweets(), 600);
          }
          this.pendingReplyTarget = null;
          return;
        }

        // 1b: Modal reply — X uses role="dialog" (no tweetComposer). Send button is tweetButton inside dialog.
        const dialog = target.closest('[role="dialog"]');
        const sendBtnInDialog = target.closest('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]');
        if (dialog && sendBtnInDialog && dialog.contains(sendBtnInDialog)) {
          let usernameToTrack = null;
          const pending = this.pendingReplyTarget;
          const maxAgeMs = 10 * 60 * 1000; // 10 minutes
          if (pending && pending.username && pending.username !== 'unknown' && (Date.now() - pending.setAt) < maxAgeMs) {
            usernameToTrack = pending.username;
          }
          if (!usernameToTrack) {
            const replyTargetArticle = dialog.querySelector('article[data-testid="tweet"]');
            if (replyTargetArticle) {
              usernameToTrack = this.extractUsernameFromTweetSync(replyTargetArticle);
            }
          }
          if (usernameToTrack && usernameToTrack !== 'unknown') {
            this.trackReply(usernameToTrack).catch(err => {
              console.warn('[TweetReplyAI] Reply tracking failed:', err);
            });
            setTimeout(() => this.updateReplyCountsOnTweets(), 600);
          }
          this.pendingReplyTarget = null;
          return;
        }

        // Check if clicked element is a Reply button
        const isReplyButton = target.matches('[data-testid="reply"]') ||
                             target.closest('[data-testid="reply"]') ||
                             target.matches('button[aria-label*="Reply" i]') ||
                             target.closest('button[aria-label*="Reply" i]') ||
                             target.matches('[role="button"][aria-label*="Reply" i]') ||
                             target.closest('[role="button"][aria-label*="Reply" i]');

        if (!isReplyButton) return;

        // Find the actual Reply button element
        const replyButton = target.closest('[data-testid="reply"]') ||
                           target.closest('button[aria-label*="Reply" i]') ||
                           target.closest('[role="button"][aria-label*="Reply" i]') ||
                           target;

        // Find tweet article
        const tweetArticle = this.findTweetArticle(replyButton);
        if (!tweetArticle) {
          return; // Couldn't find tweet article
        }

        // Store for scoped "current tweet" extraction when building reply prompt
        this.currentReplyTargetArticle = tweetArticle;
        if (this._replyTargetClearTimer) clearTimeout(this._replyTargetClearTimer);
        this._replyTargetClearTimer = setTimeout(() => {
          this.currentReplyTargetArticle = null;
          this._replyTargetClearTimer = null;
        }, 2500);

        // Store pending reply target synchronously so it is set before user can click Send
        const tweetId = this.getTweetIdFromArticle(tweetArticle);
        const username = this.extractUsernameFromTweetSync(tweetArticle);
        if (username && username !== 'unknown') {
          this.pendingReplyTarget = { username, tweetId: tweetId || null, setAt: Date.now() };
        }

        // Execute auto-like synchronously (setting is cached) then defer the DOM work
        // so X.com's own reply-click handlers run first and the modal is open
        if (this.autoLikeEnabled) {
          setTimeout(() => {
            const tweetId = this.getTweetIdFromArticle(tweetArticle);
            if (tweetId !== null && this.autoLikedTweetIds.has(tweetId)) {
              return; // Already auto-liked this tweet this session
            }

            // X.com's virtual list may remove the article from the DOM when opening the
            // reply modal. Re-find it from the live DOM to avoid clicking a detached element.
            let liveArticle = tweetArticle;
            if (!tweetArticle.isConnected) {
              liveArticle = null;
              if (tweetId) {
                const articles = document.querySelectorAll('article[data-testid="tweet"]');
                for (const a of articles) {
                  if (this.getTweetIdFromArticle(a) === tweetId) { liveArticle = a; break; }
                }
              }
              if (!liveArticle) {
                // Fallback: original tweet shown inside the reply dialog
                liveArticle = document.querySelector('[role="dialog"] article[data-testid="tweet"]');
              }
              if (!liveArticle) return; // Can't find a connected article, give up
            }

            const likeButton = this.findLikeButton(liveArticle);
            if (likeButton) {
              this.performAutoLike(likeButton).then(() => {
                if (tweetId !== null) this.autoLikedTweetIds.add(tweetId);
              }).catch(err => {
                console.warn('[TweetReplyAI] Auto-like execution failed:', err);
              });
            }
          }, 150); // 150ms: enough for X.com to mount the reply modal
        }
      } catch (error) {
        // Log errors but don't break the event handler
        // Note: If auto-like execution failed, it has already failed, but we prevent unhandled exceptions
        console.error('[TweetReplyAI] Auto-like handler error:', error);
      }
    }; // End of handler function
    
    // Add event listener
    document.addEventListener('click', this.autoLikeClickHandler, true); // Use capture phase to catch before other handlers
  }

  async initialize() {
    // Set apiClient in authManager for server validation
    this.authManager.setApiClient(this.apiClient);
    
    await this.loadRelationshipHintsSetting();

    // Check authentication status (validate with server to catch web app logout)
    this.isAuthenticated = await this.authManager.isAuthenticated(true);
    
    if (this.isAuthenticated) {
      await this.loadUsageData();
    }
    
    // Start observing for reply composers
    this.startObserving();

    this.setupFollowStatusFromNetwork();
    
    // Pre-load auto-like setting into cache so the click handler path is synchronous
    this.autoLikeEnabled = await this.isAutoLikeEnabled();

    // Setup auto-like on Reply click (this also tracks replies for count display)
    this.setupAutoLikeOnReply();
    
    // Setup reply count display feature
    this.setupReplyCountDisplay();
    
    // Listen for messages from popup and background
    // Only add if not already added (prevent accumulation)
    // Note: chrome.runtime.onMessage doesn't have removeListener, but Chrome manages cleanup
    // on content script re-execution. However, we still guard to avoid duplicate handlers.
    if (!this.runtimeMessageHandler) {
      this.runtimeMessageHandler = (message, sender, sendResponse) => {
      if (message.action === 'suggestReply') {
        this.handleSuggestReplyFromPopup();
      } else if (message.action === 'shortcutCommand') {
        this.handleShortcutCommand(message.command);
      } else if (message.action === 'authUpdated') {
        // Refresh auth state when background detects login
        this.refreshAuthState();
      }
      };
      chrome.runtime.onMessage.addListener(this.runtimeMessageHandler);
    }
    
    // Listen for storage changes (auth state updates and reply tracking sync)
    // Only add if not already added (prevent accumulation)
    if (!this.storageChangeHandler) {
      this.storageChangeHandler = (changes, areaName) => {
        if (areaName === 'sync') {
          if (changes[STORAGE.RELATIONSHIP_HINTS_ENABLED]) {
            const nv = changes[STORAGE.RELATIONSHIP_HINTS_ENABLED].newValue;
            this.relationshipHintsEnabled = nv !== false;
            if (!this.relationshipHintsEnabled) {
              this.removeRelationshipBadgesFromDom();
            } else {
              this.scheduleFollowBadgeRefresh();
            }
          }
          if (changes[STORAGE.FOLLOW_BADGE_ICON_STYLE]) {
            this.followBadgeIconStyle = this.normalizeFollowBadgeIconStyle(
              changes[STORAGE.FOLLOW_BADGE_ICON_STYLE].newValue,
            );
            this.scheduleFollowBadgeRefresh();
          }
        }
        if (areaName === 'local') {
          // Auth state updates
          if (changes.token) {
        this.refreshAuthState();
      }
          // Reply tracking sync across tabs - update counts when history changes
          if (changes.replyHistory || changes.replyTrackingSettings) {
            this.updateReplyCountsOnTweets();
          }
          // Keep auto-like cache in sync
          if ('tweetreply_auto_like' in changes) {
            this.autoLikeEnabled = changes.tweetreply_auto_like.newValue !== false;
          }
        }
      };
      chrome.storage.onChanged.addListener(this.storageChangeHandler);
    }
    
    // Refresh usage data periodically
    // Clear existing interval if any (prevent accumulation)
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
    // Validate with server to catch web app logout
    this.isAuthenticated = await this.authManager.isAuthenticated(true);
    
    if (this.isAuthenticated && !wasAuthenticated) {
      // Just logged in, reload usage data
      await this.loadUsageData();
    }
    
    // Update all button states
    this.updateAllButtonStates();
  }

  async loadUsageData() {
    try {
      this.usageData = await this.apiClient.getUsage();
    } catch (error) {
      console.error('[TweetReplyAI] Failed to load usage data:', error);
      this.usageData = null;
      throw error; // Re-throw so caller can handle
    }
  }

  normalizeFollowBadgeIconStyle(value) {
    if (typeof value === 'string' && FOLLOW_BADGE_ICON_STYLE_VALUES.includes(value)) {
      return value;
    }
    return FOLLOW_BADGE_ICON_STYLE_DEFAULT;
  }

  /**
   * @returns {{ iconChar: string | null, label: string, ariaLabel: string }}
   */
  getFollowBadgeParts(followedBy) {
    const followsLabel = 'Follows you';
    const notLabel = "Doesn't follow you";
    const style = this.followBadgeIconStyle;

    if (style === FOLLOW_BADGE_ICON_STYLE.EMOJI) {
      const iconChar = followedBy ? '\u2713' : '\u2717';
      const label = followedBy ? followsLabel : notLabel;
      return {
        iconChar,
        label,
        ariaLabel: `${iconChar} ${label}`,
      };
    }
    if (style === FOLLOW_BADGE_ICON_STYLE.ICON_ONLY) {
      const iconChar = followedBy ? '\u2713' : '\u2717';
      return {
        iconChar,
        label: '',
        ariaLabel: followedBy ? followsLabel : notLabel,
      };
    }
    return {
      iconChar: null,
      label: followedBy ? followsLabel : notLabel,
      ariaLabel: followedBy ? followsLabel : notLabel,
    };
  }

  populateFollowBadgeElement(span, followedBy) {
    const parts = this.getFollowBadgeParts(followedBy);
    span.classList.toggle(
      'tweetreply-follow-badge--icon-only',
      this.followBadgeIconStyle === FOLLOW_BADGE_ICON_STYLE.ICON_ONLY,
    );
    span.setAttribute('title', parts.ariaLabel);
    span.setAttribute('aria-label', parts.ariaLabel);
    if (parts.iconChar) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'tweetreply-follow-badge__icon';
      iconSpan.setAttribute('aria-hidden', 'true');
      iconSpan.textContent = parts.iconChar;
      span.appendChild(iconSpan);
    }
    if (parts.label) {
      span.appendChild(document.createTextNode(parts.label));
    }
  }

  findHandleAnchorElement(userNameElement) {
    if (!userNameElement) return null;
    const links = userNameElement.querySelectorAll('a[href^="/"]');
    for (const link of links) {
      const text = (link.textContent || '').trim();
      if (text.startsWith('@')) return link;
    }
    return null;
  }

  async loadRelationshipHintsSetting() {
    try {
      const r = await chrome.storage.sync.get([
        STORAGE.RELATIONSHIP_HINTS_ENABLED,
        STORAGE.FOLLOW_BADGE_ICON_STYLE,
      ]);
      this.relationshipHintsEnabled = r[STORAGE.RELATIONSHIP_HINTS_ENABLED] !== false;
      this.followBadgeIconStyle = this.normalizeFollowBadgeIconStyle(r[STORAGE.FOLLOW_BADGE_ICON_STYLE]);
    } catch {
      this.relationshipHintsEnabled = true;
      this.followBadgeIconStyle = FOLLOW_BADGE_ICON_STYLE_DEFAULT;
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
      if (!d || d.type !== 'TWEETREPLY_FOLLOW_STATUS') return;
      if (!d.hasRelationshipData) return;
      this.followStatusByUser.set(String(d.username).toLowerCase(), {
        followedBy: !!d.followedBy,
        following: !!d.following,
        hasRelationshipData: true,
      });
      this.scheduleFollowBadgeRefresh();
    };
    window.addEventListener('message', this.followStatusMessageHandler);
    window.postMessage({ type: 'TWEETREPLY_REQUEST_BUFFER_REPLAY' }, '*');
  }

  removeRelationshipBadgesFromDom() {
    document.querySelectorAll('[data-tweetreply-follow-badge="1"]').forEach((n) => n.remove());
    document.querySelectorAll('.tweetreply-firstline-badge-cluster').forEach((cluster) => {
      if (cluster.querySelector('[data-tweetreply-follow-badge="1"]')) return;
      const parent = cluster.parentNode;
      if (!parent) return;
      while (cluster.firstChild) parent.insertBefore(cluster.firstChild, cluster);
      cluster.remove();
    });
  }

  scheduleFollowBadgeRefresh() {
    if (this.followBadgeRefreshTimer) clearTimeout(this.followBadgeRefreshTimer);
    this.followBadgeRefreshTimer = setTimeout(() => {
      this.followBadgeRefreshTimer = null;
      this.updateFollowBadgesOnPage();
    }, 150);
  }

  updateFollowBadgesOnPage() {
    if (!this.relationshipHintsEnabled) {
      this.removeRelationshipBadgesFromDom();
      return;
    }
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    articles.forEach((article) => {
      const username = this.extractUsernameFromTweetSync(article);
      const existing = article.querySelector('.tweetreply-follow-badge');
      if (existing) existing.remove();
      if (!username || username === 'unknown') return;
      const key = username.toLowerCase();
      const entry = this.followStatusByUser.get(key);
      if (!entry || !entry.hasRelationshipData) return;
      const userNameElement = article.querySelector('[data-testid="User-Name"]');
      if (!userNameElement || !userNameElement.isConnected) return;
      const span = document.createElement('span');
      span.className = entry.followedBy
        ? 'tweetreply-follow-badge tweetreply-follow-badge--follows'
        : 'tweetreply-follow-badge tweetreply-follow-badge--not';
      span.setAttribute('data-tweetreply-follow-badge', '1');
      this.populateFollowBadgeElement(span, entry.followedBy);
      const timeEl = userNameElement.querySelector('time');
      if (timeEl && timeEl.parentNode) {
        timeEl.after(document.createTextNode(' '), span);
        return;
      }
      const handleEl = this.findHandleAnchorElement(userNameElement);
      if (handleEl && handleEl.parentNode) {
        handleEl.after(document.createTextNode(' '), span);
        return;
      }
      userNameElement.appendChild(document.createTextNode(' '));
      userNameElement.appendChild(span);
    });
  }

  startObserving() {
    // Don't create if already exists (prevent accumulation)
    if (this.mainObserver) return;
    
    // Debounced observer to reduce redundant checks
    // Store debounce timer as instance property for cleanup
    this.mainObserverDebounceTimer = null;
    const addedNodes = new Set();
    
    this.mainObserver = new MutationObserver((mutations) => {
      clearTimeout(this.mainObserverDebounceTimer);
      
      // Collect all added nodes
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            addedNodes.add(node);
          }
        });
      });
      
      // Debounce: Wait 100ms for DOM to settle before processing
      this.mainObserverDebounceTimer = setTimeout(() => {
        addedNodes.forEach((node) => {
          this.checkForReplyComposers(node);
          this.injectReuseButtons(node);
        });
        addedNodes.clear();

        this.scheduleFollowBadgeRefresh();
        
        // Also update reply counts for new tweets (if count display is initialized)
        if (this.countDisplayInitialized) {
          // Debounce reply count update
          if (this.countUpdateTimeout) {
            clearTimeout(this.countUpdateTimeout);
          }
          this.countUpdateTimeout = setTimeout(async () => {
            try {
              await this.updateReplyCountsOnTweets();
            } catch (error) {
              console.error('[TweetReplyAI] Error updating reply counts:', error);
            }
          }, TIMEOUTS.AUTH_SYNC_DELAY_MS);
        }
      }, TIMEOUTS.DOM_DEBOUNCE_MS);
    });

    this.mainObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also check existing composers
    this.checkForReplyComposers(document.body);
    this.injectReuseButtons(document.body);
  }

  checkForReplyComposers(container) {
    // Separate specific vs generic selectors to avoid duplicate matches
    const specificSelectors = [
      '[data-testid="tweetTextarea_0"]',
      '[data-testid="tweetTextarea_1"]',
      '[data-testid="tweetTextarea_2"]',
    ];

    const genericSelectors = [
      '[aria-label*="reply" i][contenteditable="true"]',
      '[aria-label*="post" i][contenteditable="true"]',
      '[aria-label*="tweet" i][contenteditable="true"]',
      '.public-DraftEditor-content',
      '.DraftEditor-editorContainer',
      '[data-testid="toolBar"] ~ div [contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"][data-testid]',
    ];

    // Try specific selectors first
    let found = false;
    for (const selector of specificSelectors) {
      try {
        const composers = container.querySelectorAll ? container.querySelectorAll(selector) : [];
        if (composers.length > 0) {
          composers.forEach(composer => this.injectSuggestButton(composer));
          found = true;
        }
      } catch (error) {
        console.error('Error checking selector:', selector, error);
      }
    }

    // Only use generic selectors if specific ones didn't match
    if (!found) {
      for (const selector of genericSelectors) {
        try {
      const composers = container.querySelectorAll ? container.querySelectorAll(selector) : [];
      composers.forEach(composer => this.injectSuggestButton(composer));
        } catch (error) {
          console.error('Error checking selector:', selector, error);
        }
      }
    }
  }

  injectSuggestButton(composer) {
    if (!composer || this.injectedButtons.has(composer)) return;

    // Find the composer's unique container
    let composerContainer = composer.closest('[data-testid="tweetComposer"]') ||
                              composer.closest('[role="dialog"]') ||
                              composer.closest('div[data-testid]');

    if (!composerContainer) return;

    // Normalize to top-level tweetComposer when present so composers from added subtrees
    // (e.g. after reply insertion) reuse the same container and avoid duplicate injection.
    const topTweetComposer = composerContainer.closest('[data-testid="tweetComposer"]');
    if (topTweetComposer) composerContainer = topTweetComposer;

    // Skip if we already have our controls in this reply context; scope by dialog so the reply dialog gets its own controls.
    const inDialog = composerContainer.closest('[role="dialog"]');
    if (inDialog) {
      if (inDialog.querySelector('.tweetreply-button-container')) {
        this.injectedButtons.add(composer);
        return;
      }
    } else {
      let ancestor = composerContainer.parentElement;
      while (ancestor) {
        if (ancestor.querySelector && ancestor.querySelector('.tweetreply-button-container')) {
          this.injectedButtons.add(composer);
          return;
        }
        ancestor = ancestor.parentElement;
      }
    }

    // Create a unique ID for this container
    let containerId = composerContainer.dataset.tweetreplyContainerId;
    if (!containerId) {
      containerId = `tweetreply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      composerContainer.dataset.tweetreplyContainerId = containerId;
    }

    // Check if button already exists IN THIS CONTAINER (not entire document)
    if (composerContainer.querySelector('.tweetreply-button-container') || 
        this.injectedContainers.has(containerId)) {
      this.injectedButtons.add(composer);
      return;
    }

    // Mark this container as injected
    this.injectedContainers.add(containerId);

    // Determine composer context (detail / inline / post)
    const ctx = this.getComposerContext(composerContainer);

    // Note: Do not block based on page-level inline button text; rely on container-level checks

    // Strictly skip main Post/Tweet composer
    if (ctx.type === 'post') {
      return;
    }

    // Temporary product decision: hide TweetReply controls on detail-page inline composers.
    // Keep dialog composers enabled even when URL is /status/:id.
    if (this.isTweetDetailPage() && !composerContainer.closest('[role="dialog"]')) {
      this.injectedButtons.add(composer);
      return;
    }

    // Find the composer's toolbar area
    let toolbar = composerContainer.querySelector('[data-testid="toolBar"]') ||
                  composerContainer.querySelector('.toolbar') ||
                  composerContainer.querySelector('[role="toolbar"]');

      if (!toolbar) {
      // Look for button containers with 2+ buttons (Twitter's native toolbar)
      const buttonContainers = composerContainer.querySelectorAll('div');
        for (const container of buttonContainers) {
          if (container.querySelectorAll('button').length >= 2) {
            toolbar = container;
            break;
        }
      }
    }

    // If still no toolbar, create our own
    if (!toolbar) {
      toolbar = this.createToolbar(composer);
    }

    if (toolbar && !toolbar.querySelector('.tweetreply-button-container')) {
      const controlsRow = this.createSuggestButton(composer, containerId);
      // Hide controls for non-reply contexts as a safety net
      controlsRow.hidden = (ctx.type === 'post');
      // Insert our controls row ABOVE the toolbar (not inside it) so Suggest stays in line with Concise, Direct, Improve
      if (toolbar.parentNode) {
        toolbar.parentNode.insertBefore(controlsRow, toolbar);
      } else {
        this.insertButtonInToolbar(toolbar, controlsRow);
      }
      this.injectedButtons.add(composer);
    }
  }

  createToolbar(composer) {
    const toolbar = document.createElement('div');
    toolbar.className = 'tweetreply-toolbar';
    toolbar.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding: 8px 0;
    `;

    // Insert after the composer
    const parent = composer.parentElement;
    if (parent) {
      parent.insertBefore(toolbar, composer.nextSibling);
    }

    return toolbar;
  }

  // Determine whether an element belongs to a reply composer (not main tweet box)
  isReplyComposer(containerEl) {
    if (!containerEl) return false;
    // Heuristic 1: Reply placeholder present
    const hasReplyPlaceholder = !!Array.from(containerEl.querySelectorAll('[data-testid^="tweetTextarea_"], [contenteditable="true"]'))
      .find(el => /post your reply/i.test(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.textContent || ''));

    // Heuristic 2: Native Reply button nearby
    const toolbar = containerEl.querySelector('[data-testid="toolBar"], [role="toolbar"]') || containerEl;
    const replyBtn = this.findReplyButton(toolbar);

    return !!(hasReplyPlaceholder || replyBtn);
  }

  // Determine if this is the main tweet composer ("What's happening?")
  isMainComposer(containerEl) {
    const textareas = containerEl.querySelectorAll('[data-testid^="tweetTextarea_"], [contenteditable="true"]');
    for (const el of textareas) {
      const hint = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').toLowerCase();
      if (hint.includes("what's happening") || hint.includes('what’s happening')) return true;
      // Treat aria "Post text" as Post composer only when not inside a dialog or article (reply contexts)
      if (/^post\s*text$/i.test(hint) && !containerEl.closest('[role="dialog"], article')) return true;
    }
    // Also check for Post/Tweet primary button without Reply
    const hasPost = !!(containerEl.querySelector('[data-testid="tweetButton"]') ||
      Array.from(containerEl.querySelectorAll('div[role="button"], button'))
        .some(btn => /^(post|tweet)$/i.test((btn.getAttribute('aria-label') || btn.textContent || '').trim())));
    const hasReply = !!this.findReplyButton(containerEl);
    if (!hasReply && hasPost) return true;

    // If the global inline button reads "Post" and this container is not a dialog/article, treat as Post composer
    const globalInlineBtn = document.querySelector('[data-testid="tweetButtonInline"]');
    const globalInlineText = globalInlineBtn?.textContent?.trim() || '';
    if (/^post$/i.test(globalInlineText) && !containerEl.closest('[role="dialog"], article')) return true;
    return hasPost && !hasReply;
  }

  // Classify composer container context
  getComposerContext(containerEl) {
    if (!containerEl) return { type: 'unknown' };
    if (this.isMainComposer(containerEl)) return { type: 'post' };
    if (this.isReplyComposer(containerEl)) {
      // Try to distinguish inline vs detail using article hierarchy
      const article = containerEl.closest('article')
      const hasDetailsHeader = !!document.querySelector('article time');
      // Heuristic: on detail page there is a single large composer under main tweet
      return { type: (article ? 'inline' : 'detail') };
    }
    return { type: 'unknown' };
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

    // Guard against stale SPA meta: og:url must exist and contain the same statusId as the current URL.
    // If og:url is absent, treat as stale and return null so DOM tiers are used instead.
    const ogUrl = document.querySelector('meta[property="og:url"]')?.content || '';
    if (!ogUrl || !ogUrl.includes('/status/' + statusId)) return null;

    let text = null;
    // og:description is fullest (set by Twitter SSR and updated on SPA navigation)
    const ogDesc = document.querySelector('meta[property="og:description"]')?.content?.trim();
    if (ogDesc && ogDesc.length > 10) text = ogDesc;
    // Fallback: parse title "DisplayName on X: "text..." / X"
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
    const timeLink = article.querySelector('time')?.closest('a[href*="/status/"]');
    if (timeLink) {
      const href = timeLink.getAttribute('href') || timeLink.href || '';
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
      // Already have a DOM-quality cache for this tweet — nothing to do
      if (this._originalTweetCache?.statusId === statusId && this._originalTweetCache.fromDom) return;
      // Invalidate cache when navigated to a different tweet
      if (this._originalTweetCache && this._originalTweetCache.statusId !== statusId) {
        this._originalTweetCache = null;
      }
      // Try DOM article (best quality); skip meta fallback to avoid stale SPA data
      const article = this.findOriginalTweetArticleByStatusId(statusId);
      if (article) {
        const data = this.extractTextAndAuthorFromArticle(article);
        if (data) {
          this._originalTweetCache = { statusId, text: data.text, author: data.author, fromDom: true };
        }
      }
    } catch (e) {
      // Non-critical background task; swallow silently
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
    const text = extractTweetPlainText(tweetTextEl);
    if (!text || text.length < 10) return null;
    let author = 'unknown';
    const userNameEl = article.querySelector('[data-testid="User-Name"]');
    if (userNameEl) {
      const fullText = userNameEl.textContent?.trim() || '';
      const handleMatch = fullText.match(/@([A-Za-z0-9_]+)/);
      if (handleMatch) author = handleMatch[1];
    }
    if (author === 'unknown' && userNameEl) {
      const profileLink = userNameEl.querySelector('a[href]');
      if (profileLink) {
        const href = profileLink.getAttribute('href') || '';
        const hrefMatch = href.match(/^\/([A-Za-z0-9_]+)$/);
        if (hrefMatch) author = hrefMatch[1];
      }
    }
    if (author === 'unknown') {
      const links = article.querySelectorAll('a[href]');
      const reservedPaths = new Set(['status', 'search', 'intent', 'i', 'home', 'hashtag', 'compose', 'settings', 'explore', 'notifications', 'messages']);
      for (const link of links) {
        const href = link.getAttribute('href') || '';
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
   * Extract the canonical tweet permalink (/{user}/status/{id}) from an
   * article. Returns an absolute URL or undefined. Used by the Reuse feature
   * because extractTextAndAuthorFromArticle intentionally returns only text+author.
   */
  extractTweetUrlFromArticle(article) {
    if (!article) return undefined;
    try {
      const timeEl = article.querySelector('a[role="link"] time');
      const anchor = (timeEl && timeEl.closest('a[href*="/status/"]'))
        || article.querySelector('a[href*="/status/"]');
      if (!anchor) return undefined;
      const href = anchor.getAttribute('href') || '';
      if (!href) return undefined;
      return new URL(href, window.location.origin).toString();
    } catch {
      return undefined;
    }
  }

  /**
   * Inject a Reuse button onto every X tweet article in the given container.
   * Delegates to the pure helper `injectReuseButtonsImpl` with DI.
   */
  injectReuseButtons(container) {
    try {
      injectReuseButtonsImpl(container, {
        injected: this.injectedReuseButtons,
        onClick: (payload) => this.openReuseModal(payload),
        extractText: (article) => this.extractTextAndAuthorFromArticle(article),
        extractTweetUrl: (article) => this.extractTweetUrlFromArticle(article),
        minSourceLen: REUSE.MIN_SOURCE_LEN,
        buttonClass: REUSE.BUTTON_CLASS,
        buttonTitle: REUSE.BUTTON_TITLE,
      });
    } catch (error) {
      console.warn('[TweetReplyAI] injectReuseButtons failed:', error);
    }
  }

  /**
   * Open (or refocus) the Reuse modal for the given source tweet. Only one
   * modal is mounted at a time; a second invocation closes the previous one.
   */
  openReuseModal(payload) {
    try {
      if (this._reuseModal) {
        try { this._reuseModal.close(); } catch {}
        this._reuseModal = null;
      }
      this._reuseModal = createReuseModal(payload, {
        apiClient: this.apiClient,
        postToCompose: (text) => this.postReframedToCompose(text),
        onUsageUpdated: () => {
          try { chrome.runtime.sendMessage({ action: 'usageUpdated' }); } catch {}
        },
        emitTelemetry,
        getUserFacingError,
        constants: REUSE,
        loginUrl: API.LOGIN_URL,
      });
    } catch (error) {
      console.error('[TweetReplyAI] Failed to open Reuse modal:', error);
    }
  }

  /**
   * Navigate to X's native compose dialog and insert the reframed text. Never
   * auto-submits; the user reviews and posts manually. Pure logic lives in
   * `helpers/post-to-compose.js` so it can be unit-tested without the full
   * injector.
   */
  async postReframedToCompose(text) {
    return postReframedToComposeImpl(text, {
      insertText: (ta, tb, t) => this.insertTextTwitterMethod(ta, tb, t),
      emitTelemetry,
      config: {
        composePath: REUSE.COMPOSE_URL_PATH || '/compose/post',
        pollMs: REUSE.COMPOSE_POLL_MS,
        timeoutMs: REUSE.COMPOSE_POLL_TIMEOUT_MS,
      },
    });
  }

  /**
   * Find the article that owns the given status ID (the tweet's own permalink, not "Replying to" or quoted).
   * @param {string} statusId - Status ID from URL
   * @returns {Element|null} The article element or null
   */
  findOriginalTweetArticleByStatusId(statusId) {
    if (!statusId) return null;
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    const statusPath = '/status/' + statusId;
    for (const article of articles) {
      const links = article.querySelectorAll('a[href*="' + statusPath + '"]');
      for (const link of links) {
        const href = (link.getAttribute('href') || link.href || '').split('?')[0];
        if (!href.includes(statusPath)) continue;
        if (href.includes('/analytics')) continue;
        // Own permalink: not inside a "Replying to" node
        let node = link;
        let insideReplyingTo = false;
        while (node && node !== article) {
          const text = (node.textContent || '').trim();
          if (/^replying to @/i.test(text) || (node !== link && /replying to/i.test(text))) {
            insideReplyingTo = true;
            break;
          }
          node = node.parentElement;
        }
        if (!insideReplyingTo) {
          // Only return the article if it actually owns this status ID (timestamp permalink).
          // Otherwise we can return a reply tweet that merely links to statusId in "Replying to".
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
    // Prefer explicit testid if available
    const byTestId = toolbarEl.querySelector('[data-testid="tweetButtonInline"]');
    if (byTestId) return byTestId;
    const candidates = Array.from(toolbarEl.querySelectorAll('div[role="button"], button'));
    // aria-label contains Reply
    let found = candidates.find(btn => /reply/i.test(btn.getAttribute('aria-label') || ''));
    if (found) return found;
    // visible text contains Reply
    found = candidates.find(btn => /reply/i.test((btn.textContent || '').trim()));
    if (found) return found;
    // Fallback: look globally for inline button with text Reply
    const globalInlineBtn = document.querySelector('[data-testid="tweetButtonInline"]');
    if (globalInlineBtn && /reply/i.test(globalInlineBtn.textContent || '')) return globalInlineBtn;
    return null;
  }

  // Place our Suggest button immediately to the left of the native Reply button
  placeSuggestButtonLeftOfReply(toolbarEl, controlsRow) {
    const replyBtn = this.findReplyButton(toolbarEl);
    if (!replyBtn) return false; // Not a reply composer or structure changed

    const suggestBtn = controlsRow.querySelector('.tweetreply-suggest-btn');
    if (!suggestBtn) return;

    // Avoid duplicate placement
    if (toolbarEl.contains(suggestBtn)) return true;

    // Ensure minimal spacing consistent with toolbar
    suggestBtn.style.marginRight = '8px';

    // Insert just before native Reply button
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
    // Initial placement + observer
    if (!this.placeSuggestButtonLeftOfReply(toolbarEl, controlsRow)) {
      this.observePlacement(toolbarEl, controlsRow);
    }

    // Throttled re-placement on user interaction (optional)
    if (!opts.skipReplacementListeners) {
      let last = 0;
      const throttleMs = TIMEOUTS.BUTTON_THROTTLE_MS;
      const maybePlace = () => {
        const now = Date.now();
        if (now - last < throttleMs) return;
        last = now;
        this.placeSuggestButtonLeftOfReply(toolbarEl, controlsRow);
      };

      const events = ['focusin', 'input', 'keyup'];
      events.forEach(ev => {
        containerEl.addEventListener(ev, maybePlace, { passive: true });
      });
    }
  }

  createSuggestButton(composer, containerId) {
    const container = document.createElement('div');
    container.className = 'tweetreply-button-container';
    container.dataset.containerId = containerId;
    // Ensure visible and properly spaced above toolbar on tweet detail page
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 6px 0 6px 0;
      position: relative;
      z-index: 1;
    `;
    
    // Model dropdown: only for whitelisted users when config allows (usageData.showModelSelect)
    let modelSelect = null;
    if (this.usageData?.showModelSelect) {
      modelSelect = this.createModelSelect();
      container.appendChild(modelSelect);
    }
    
    // Reply mode dropdown (between model and prompt)
    const replyModeSelect = this.createReplyModeSelect();
    container.appendChild(replyModeSelect);
    
    // Prompt dropdown
    const promptSelect = this.createPromptSelect();
    container.appendChild(promptSelect);
    
    // Suggest button
    const suggestButton = document.createElement('button');
    suggestButton.className = 'tweetreply-suggest-btn';
    suggestButton.dataset.authPending = 'true'; // Mark as pending initialization

    // Set initial loading state
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
    suggestButton.title = 'Checking authentication...';

    // Async button state initialization
    this.updateButtonStateAsync(suggestButton);

    suggestButton.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Wait for async initialization to complete if still pending
      // This prevents race condition where click happens before auth check completes
      if (suggestButton.dataset.authPending === 'true') {
        await this.updateButtonStateAsync(suggestButton);
      }
      
      // Check if user is not authenticated - open login page
      // Note: Only check isAuthenticated, not requiresAuth flag (it's just visual state)
      if (!this.isAuthenticated) {
        await this.openLoginPage();
        return;
      }
      
      // Check if in error state - retry loading
      if (suggestButton.dataset.loadError === 'true') {
        console.log('[TweetReplyAI] Retrying button initialization...');
        delete suggestButton.dataset.loadError;
        suggestButton.dataset.authPending = 'true';
        this.updateButtonState(suggestButton); // Show loading
        await this.updateButtonStateAsync(suggestButton); // Retry
        return;
      }
      
      // Normal suggest reply flow
      // CRITICAL FIX: Find the actual contenteditable element inside the container
      const actualComposer = composer.querySelector('[contenteditable="true"]') || 
                             composer.querySelector('.public-DraftEditor-content') ||
                             composer;

      console.log('[TweetReplyAI] Button click - Composer container:', composer.getAttribute('data-testid'));
      console.log('[TweetReplyAI] Button click - Actual composer:', actualComposer.contentEditable, actualComposer.className);

      this.handleSuggestReply(actualComposer, suggestButton, {
        modelKey: modelSelect ? modelSelect.value : 'auto',
        replyMode: replyModeSelect.value,
        promptVariation: promptSelect.value
      });
    });

    // Create Improve Reply button
    const improveButton = this.createImproveButton(composer);
    
    // Append Suggest then Improve directly to container so controls are on one line
    container.appendChild(suggestButton);
    container.appendChild(improveButton);
    // Product requirement: CTA should not appear on tweet detail pages (/status/:id).
    if (!this.isTweetDetailPage()) {
      container.appendChild(this.createCtaButton(composer));
    }
    return container;
  }

  async updateButtonStateAsync(button) {
    try {
      console.log('[TweetReplyAI] Initializing button state...');
      
      // Re-check auth if needed (validate with server to catch web app logout)
      if (!this.isAuthenticated) {
        this.isAuthenticated = await this.authManager.isAuthenticated(true);
        console.log('[TweetReplyAI] Auth status:', this.isAuthenticated);
      }
      
      // Load usage with timeout
      if (this.isAuthenticated && !this.usageData) {
        console.log('[TweetReplyAI] Loading usage data...');
        
        try {
          await Promise.race([
            this.loadUsageData(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout after 10 seconds')), TIMEOUTS.USAGE_LOAD_MS)
            )
          ]);
          
          console.log('[TweetReplyAI] Usage data loaded:', this.usageData);
        } catch (error) {
          console.warn('[TweetReplyAI] Failed to load usage data, using fallback:', error);
          
          // Graceful degradation: assume user has quota, let backend validate
          this.usageData = { 
            used: 0, 
            limit: 999, 
            resetAt: new Date(Date.now() + AUTH.ONE_DAY_MS).toISOString()
          };
        }
      }
      
      // Success: remove pending flag
      delete button.dataset.authPending;
      delete button.dataset.loadError;
      this.updateButtonState(button);
      
    } catch (error) {
      console.error('[TweetReplyAI] Critical error initializing button:', error);
      
      // Set error state
      delete button.dataset.authPending;
      button.dataset.loadError = 'true';
      this.updateButtonState(button);
    }
  }

  createModelSelect() {
    const select = document.createElement('select');
    select.className = 'tweetreply-model-select';
    select.title = 'Choose AI model';
    
    // Default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Auto';
    select.appendChild(defaultOption);
    
    // Try to restore previously selected model
    let savedModelKey = null;
    try {
      chrome.storage?.local?.get(['tweetreply_model'], data => {
        if (data && typeof data.tweetreply_model === 'string') {
          savedModelKey = data.tweetreply_model;
          // If options are already loaded later we will apply this
        }
      });
    } catch (_) {}
    
    // Load models from API
    this.loadModels().then(models => {
      if (models && models.openai) {
        models.openai.forEach(model => {
          const option = document.createElement('option');
          option.value = model.key;
          option.textContent = model.name;
          select.appendChild(option);
        });
      }
      if (models && models.groq) {
        models.groq.forEach(model => {
          const option = document.createElement('option');
          option.value = model.key;
          option.textContent = model.name;
          select.appendChild(option);
        });
      }

      // Apply default/preferred ordering and selection
      const options = Array.from(select.querySelectorAll('option'));
      // Prefer saved value if present
      if (savedModelKey && options.some(o => o.value === savedModelKey)) {
        select.value = savedModelKey;
      } else {
        const preferred = options.length > 1 ? options[1] : null;
        if (preferred && preferred !== defaultOption) {
          select.insertBefore(preferred, select.children[1] || null);
          select.value = preferred.value;
        }
      }
    }).catch(error => {
      console.error('Failed to load models:', error);
    });

    // Persist selection when user changes it
    select.addEventListener('change', () => {
      try { chrome.storage?.local?.set({ tweetreply_model: select.value }); } catch (_) {}
    });
    
    return select;
  }

  createPromptSelect() {
    const select = document.createElement('select');
    select.className = 'tweetreply-prompt-select';
    select.title = 'Choose reply style';
    
    // Try to restore previously selected prompt/style
    let savedPrompt = null;
    try {
      chrome.storage?.local?.get(['tweetreply_prompt'], data => {
        if (data && typeof data.tweetreply_prompt === 'string') {
          savedPrompt = data.tweetreply_prompt;
        }
      });
    } catch (_) {}
    
    // Load prompts from API
    this.loadPrompts().then(prompts => {
      if (prompts && Array.isArray(prompts)) {
        prompts.forEach(prompt => {
          // Hide internal-only prompts from the UI
          if (prompt.key === 'improve' || prompt.key === 'guardrail_violation') return;

          const option = document.createElement('option');
          option.value = prompt.key;

          // Use a shorter label for the conversational style
          const label = prompt.key === 'conversational' ? 'Chat' : prompt.name;
          option.textContent = label;

          select.appendChild(option);
        });
      }

      const options = Array.from(select.querySelectorAll('option'));
      if (savedPrompt && options.some(o => (o.value === savedPrompt))) {
        select.value = savedPrompt;
      } else {
        // Move "Direct & Opinionated" to top and select it
        const preferred = options.find(o => /direct/i.test(o.textContent || '')) || null;
        if (preferred) {
          select.insertBefore(preferred, select.children[0] || null);
          select.value = preferred.value;
        }
      }
    }).catch(error => {
      console.error('Failed to load prompts:', error);
    });

    // Persist selection when user changes it
    select.addEventListener('change', () => {
      try { chrome.storage?.local?.set({ tweetreply_prompt: select.value }); } catch (_) {}
    });
    
    return select;
  }

  createReplyModeSelect() {
    const select = document.createElement('select');
    select.className = 'tweetreply-reply-mode-select';
    select.title = 'Choose reply generation mode';
    
    // Create options - Centralized labels for easy updates
    const modes = [
      { value: 'single-sentence', label: '⚡ Concise', tooltip: 'Fast one-sentence reply' },
      { value: 'enhanced', label: '🧠 Enhanced', tooltip: 'Context-aware with deep analysis' }
    ];
    
    modes.forEach(mode => {
      const option = document.createElement('option');
      option.value = mode.value;
      option.textContent = mode.label;
      option.title = mode.tooltip;
      select.appendChild(option);
    });
    
    // FIX: Set default immediately to prevent race condition
    select.value = 'enhanced';
    
    // Try to restore previously selected reply mode (async)
    try {
      chrome.storage?.local?.get(['tweetreply_reply_mode'], data => {
        if (data && typeof data.tweetreply_reply_mode === 'string') {
          const savedMode = data.tweetreply_reply_mode;
          if (modes.some(m => m.value === savedMode)) {
            select.value = savedMode;
            console.log('[TweetReplyAI] Restored reply mode from storage:', savedMode);
          } else {
            select.value = 'enhanced';
            try { chrome.storage?.local?.set({ tweetreply_reply_mode: 'enhanced' }); } catch (_) {}
            console.log('[TweetReplyAI] Saved reply mode not valid, using default');
          }
        }
      });
    } catch (error) {
      console.warn('[TweetReplyAI] Failed to restore reply mode from storage:', error);
    }
    
    // Persist selection when user changes it
    select.addEventListener('change', () => {
      try { 
        chrome.storage?.local?.set({ tweetreply_reply_mode: select.value }); 
        console.log('[TweetReplyAI] Reply mode changed to:', select.value);
      } catch (_) {}
    });
    
    return select;
  }

  async loadModels() {
    try {
      return await this.apiClient.getModels();
    } catch (error) {
      console.error('Failed to load models:', error);
      return null;
    }
  }

  async loadPrompts() {
    try {
      return await this.apiClient.getPrompts();
    } catch (error) {
      console.error('Failed to load prompts:', error);
      return null;
    }
  }

  createImproveButton(composer) {
    const button = document.createElement('button');
    button.className = 'tweetreply-improve-btn';
    button.dataset.authPending = 'true'; // Mark as pending initialization
    button.setAttribute('aria-label', 'Improve current draft reply');
    
    // Set initial loading state
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
    button.title = 'Checking authentication...';

    // Async button state initialization
    this.updateButtonStateAsync(button);

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Wait for async initialization to complete if still pending
      // This prevents race condition where click happens before auth check completes
      if (button.dataset.authPending === 'true') {
        await this.updateButtonStateAsync(button);
      }
      
      // Check if user is not authenticated - open login page
      // Note: Only check isAuthenticated, not requiresAuth flag (it's just visual state)
      if (!this.isAuthenticated) {
        await this.openLoginPage();
        return;
      }
      
      // Check if in error state - retry loading
      if (button.dataset.loadError === 'true') {
        console.log('[TweetReplyAI] Retrying improve button initialization...');
        delete button.dataset.loadError;
        button.dataset.authPending = 'true';
        this.updateButtonState(button); // Show loading
        await this.updateButtonStateAsync(button); // Retry
        return;
      }
      
      // Find the actual contenteditable element
      const actualComposer = composer.querySelector('[contenteditable="true"]') || 
                             composer.querySelector('.public-DraftEditor-content') ||
                             composer;

      this.handleImproveReply(actualComposer, button);
    });

    return button;
  }

  createCtaButton(composer) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tweetreply-cta-btn';
    button.setAttribute('aria-label', 'Append saved CTA to reply');
    button.title = 'Append saved CTA to reply';
    button.textContent = 'CTA';

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const actualComposer =
        composer.querySelector('[contenteditable="true"]') ||
        composer.querySelector('.public-DraftEditor-content') ||
        composer;

      try {
        const { defaultSnippet, legacyText } = await this.getSnippetLibraryState();
        const t = defaultSnippet?.text || legacyText;
        if (!t || !String(t).trim()) {
          this.showMessage(actualComposer, 'Set your CTA in extension Settings', 'info');
          return;
        }
        await this.appendCtaSnippetToComposer(actualComposer, String(t));
      } catch (err) {
        console.error('[TweetReplyAI] CTA append failed:', err);
        emitTelemetry({
          event_type: 'storage_read_failed',
          surface: 'content',
          error_code: err?.message || 'cta_append_failed',
          context: { action: 'cta_click' },
        });
        this.showMessage(actualComposer, 'Could not add CTA', 'error');
      }
    });

    return button;
  }

  updateButtonState(button) {
    // Fix: keyboard shortcuts pass only real DOM buttons — plain objects would crash on .classList / .closest.
    if (!button || typeof button.closest !== 'function' || typeof button.classList === 'undefined') {
      return;
    }
    // Don't update if still pending
    if (button.dataset.authPending === 'true') {
      return;
    }

    // Error state (failed to load)
    if (button.dataset.loadError === 'true') {
      button.disabled = false; // Allow retry
      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z" opacity="0.8"/>
        </svg>
        <span>⚠️ Retry</span>
      `;
      button.title = 'Failed to load. Click to retry.';
      button.style.opacity = '0.8';
      return;
    }

    // Unauthenticated state
    if (!this.isAuthenticated) {
      button.disabled = false; // Make button clickable
      button.dataset.requiresAuth = 'true'; // Mark as requiring auth
      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z" opacity="0.6"/>
        </svg>
        <span>🔒 Sign in to use</span>
      `;
      button.title = `Click to sign in to ${APP_DISPLAY_NAME}`;
      button.style.opacity = '0.85'; // Make it look active but distinct
      return;
    }

    // Loading state (authenticated but usage data not loaded)
    if (!this.usageData) {
      button.disabled = true;
      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.416" stroke-dashoffset="31.416">
            <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416;0 31.416" repeatCount="indefinite"/>
            <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416;-31.416" repeatCount="indefinite"/>
          </circle>
        </svg>
        <span>⏳ Loading...</span>
      `;
      button.title = 'Loading usage data...';
      button.style.opacity = '1';
      return;
    }

    // Quota exceeded: single FOMO upgrade button on Suggest only; hide Improve
    if (this.usageData.used >= this.usageData.limit) {
      const container = button.closest('.tweetreply-button-container');
      const improveBtn = container?.querySelector('.tweetreply-improve-btn');

      if (button.classList.contains('tweetreply-improve-btn')) {
        button.style.display = 'none';
        return;
      }

      // Suggest button: show upgrade CTA and hide Improve
      button.disabled = false;
      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M7 2v11h3v9l7-12h-4l4-8z"/>
        </svg>
        <span>Upgrade to unlock replies</span>
      `;
      // Plan: replace em dash with colon for consistency (dash/em-dash replacement)
      button.title = `You've used all ${this.usageData.limit} credits: upgrade now to keep replying!`;
      button.style.opacity = '1';
      button.style.background = '#3b82f6';
      button.style.color = '#ffffff';
      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const domain = API.DEFAULT_DOMAIN;
        const protocol = domain.includes('localhost') ? 'http' : 'https';
        chrome.runtime.sendMessage({ action: 'openLoginPage', url: `${protocol}://${domain}/pricing` });
      };
      if (improveBtn) improveBtn.style.display = 'none';
      return;
    }

    // Active state - check if this is an improve button or suggest button
    const isImproveButton = button.classList.contains('tweetreply-improve-btn');
    button.disabled = false;
    delete button.dataset.requiresAuth; // Clear auth requirement flag

    // Restore Improve button visibility when quota is available
    const container = button.closest('.tweetreply-button-container');
    const improveBtn = container?.querySelector('.tweetreply-improve-btn');
    if (improveBtn) improveBtn.style.removeProperty('display');

    // Clear upgrade-only state from Suggest (onclick and inline styles)
    if (!isImproveButton) {
      button.onclick = null;
      button.style.removeProperty('background');
      button.style.removeProperty('color');
    }

    if (isImproveButton) {
      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        <span>Improve reply</span>
      `;
      button.title = 'Improve the current draft reply';
    } else {
      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z"/>
        </svg>
        <span>Suggest reply</span>
      `;
      button.title = 'Generate an AI reply suggestion';
    }
    button.style.opacity = '1';
  }

  async openLoginPage() {
    try {
      // Get API domain from background script
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getApiDomain' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      });
      
      const domain = response?.domain || API.DEFAULT_DOMAIN;
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const loginUrl = `${protocol}://${domain}/login`;
      
      // Open login page in new tab via background script
      chrome.runtime.sendMessage({ 
        action: 'openLoginPage', 
        url: loginUrl 
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[TweetReplyAI] Failed to open login page:', chrome.runtime.lastError.message);
        }
      });
    } catch (error) {
      console.error('[TweetReplyAI] Failed to get API domain, using fallback:', error);
      // Fallback: use default domain
      const loginUrl = API.LOGIN_URL;
      chrome.runtime.sendMessage({ 
        action: 'openLoginPage', 
        url: loginUrl 
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[TweetReplyAI] Failed to open login page:', chrome.runtime.lastError.message);
        }
      });
    }
  }

  insertButtonInToolbar(toolbar, button) {
    // Try to insert at the beginning of the toolbar
    if (toolbar.firstChild) {
      toolbar.insertBefore(button, toolbar.firstChild);
    } else {
      toolbar.appendChild(button);
    }
  }

  truncateToMaxChars(value, max = 1000) {
    if (typeof value !== 'string') return value;
    return value.length > max ? value.slice(0, max) : value;
  }

  sanitizeThreadContextForApi(threadContext, max = 1000) {
    if (!threadContext || typeof threadContext !== 'object') return threadContext;

    const safeOriginalTweet =
      threadContext.originalTweet === null || threadContext.originalTweet === undefined
        ? null
        : this.truncateToMaxChars(threadContext.originalTweet, max);

    const safeThreadChain = Array.isArray(threadContext.threadChain)
      ? threadContext.threadChain.map((item) => {
          if (!item || typeof item !== 'object') return item;
          return {
            ...item,
            text:
              typeof item.text === 'string'
                ? this.truncateToMaxChars(item.text, max)
                : item.text,
          };
        })
      : threadContext.threadChain;

    return {
      ...threadContext,
      originalTweet: safeOriginalTweet,
      threadChain: safeThreadChain,
    };
  }

  async handleSuggestReply(composer, button, options = {}) {
    if (!this.isAuthenticated) {
      this.showMessage(composer, `Please sign in to use ${APP_DISPLAY_NAME}`, 'error');
      return;
    }

    if (!this.usageData || this.usageData.used >= this.usageData.limit) {
      this.showMessage(composer, "You've used all your credits! Upgrade to keep the replies flowing.", 'info');
      return;
    }

    // Get the tweet text being replied to
    const tweetText = this.extractTweetText();
    
    if (!tweetText) {
      this.showMessage(composer, 'Could not find the tweet to reply to', 'error');
      return;
    }

    // Extract tweet ID with validation
    const tweetId = this.extractTweetId();
    if (!tweetId) {
      console.error('[TweetReplyAI] Failed to extract tweet ID');
      this.showMessage(composer, 'Could not identify the tweet. Try refreshing the page.', 'error');
      return;
    }

    // Diagnostic logging for wrong originalTweetAuthor / thread selection
    if (DIAGNOSE_THREAD_SELECTION) {
      const statusIdFromUrl = this.getStatusIdFromDetailPageUrl();
      console.log('[TweetReplyAI] DIAG URL pathname:', window.location.pathname);
      console.log('[TweetReplyAI] DIAG lastNonComposePath:', this.lastNonComposePath);
      console.log('[TweetReplyAI] DIAG isTweetDetailPage:', this.isTweetDetailPage());
      console.log('[TweetReplyAI] DIAG URL statusId:', statusIdFromUrl ?? 'null');
      console.log('[TweetReplyAI] DIAG reply-target tweetId (API):', tweetId);
      if (statusIdFromUrl && tweetId) {
        console.log('[TweetReplyAI] DIAG statusId === tweetId?', statusIdFromUrl === tweetId);
      }
    }

    // Show loading state
    button.disabled = true;
    const originalText = button.innerHTML;
    button.innerHTML = `
      <div class="tweetreply-spinner" style="width: 14px; height: 14px; border: 2px solid #1d9bf0; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 4px;"></div>
      <span>Generating...</span>
    `;

    try {
      // Extract additional context
      const authorInfo = this.extractAuthorInfo();
      const threadContext = this.extractThreadContext();
      const tweetMetadata = this.extractTweetMetadata();

      // LOG: Show thread context immediately after extraction
      console.log('[TweetReplyAI] 📊 Thread Context Summary:', {
        isReply: threadContext?.isReply || false,
        hasOriginalTweet: !!threadContext?.originalTweet,
        originalTweetAuthor: threadContext?.originalTweetAuthor || 'none',
        threadLength: threadContext?.threadLength || 0,
        currentTweetIndex: threadContext?.currentTweetIndex || 0
      });
      
      if (threadContext?.isReply && threadContext?.originalTweet) {
        console.log('[TweetReplyAI] 📋 QUICK THREAD PREVIEW:');
        console.log('[TweetReplyAI] Original:', threadContext.originalTweet.substring(0, 100) + (threadContext.originalTweet.length > 100 ? '...' : ''));
        if (threadContext.threadChain && threadContext.threadChain.length > 0) {
          console.log('[TweetReplyAI] Thread chain:', threadContext.threadChain.map(t => 
            (t.isOriginal ? '🔵' : t.isCurrent ? '🟢' : '⚪') + ' ' + t.text.substring(0, 60) + (t.text.length > 60 ? '...' : '')
          ));
        }
      }

      // Log what we're sending for debugging (safely)
      console.log('[TweetReplyAI] Generating reply with data:', {
        tweet_id: tweetId,
        tweet_text_length: tweetText.length,
        author_info_username: authorInfo?.username || 'unknown',
        model_key: options.modelKey || 'auto',
        prompt_variation: options.promptVariation || 'default',
        is_reply: threadContext?.isReply || false,
        thread_length: threadContext?.threadLength || 0
      });
      console.log('[TweetReplyAI] 🤖 Starting AI-powered tweet analysis (server-side)...');

      // Maintain backward compatibility with conversation_context
      const sanitizedThreadContext = this.sanitizeThreadContextForApi(threadContext, 1000);
      const conversationContext = sanitizedThreadContext?.threadChain?.map(t => t.text) || null;

      const response = await this.apiClient.generateReply({
        tweet_text: tweetText,
        tweet_id: tweetId, // Now guaranteed to be non-null
        model_key: options.modelKey,
        reply_mode: options.replyMode, // Reply generation mode
        prompt_variation: options.promptVariation,
        author_info: authorInfo, // Now guaranteed to have follower_count as number
        thread_context: sanitizedThreadContext, // NEW: Structured thread data
        conversation_context: conversationContext, // Backward compatibility
        tweet_metadata: tweetMetadata
      });

      // Log analysis results if available
      // Fix: Backend sends flat structure: { tone, sentiment, style, intention }
      if (response.analysis) {
        console.log('[TweetReplyAI] ✅ Tweet analysis completed:', {
          tone: response.analysis.tone || 'unknown',
          sentiment: response.analysis.sentiment || 'unknown',
          style: response.analysis.style || 'unknown',
          intention: response.analysis.intention ? response.analysis.intention.substring(0, 80) + '...' : 'N/A'
        });
      } else {
        console.log('[TweetReplyAI] ℹ️ No analysis data in response (using basic context)');
      }

      // Insert the reply into the composer with quality score
      await this.insertReplyIntoComposer(composer, {
        reply: response.reply,
        qualityScore: response.qualityScore
      });

      try {
        await this.maybeAutoAppendCtaAfterAiInsert(composer);
      } catch (ctaErr) {
        console.warn('[TweetReplyAI] Auto-append CTA failed:', ctaErr);
      }
      
      // Update usage data
      this.usageData = {
        ...this.usageData,
        used: response.used,
        limit: response.limit,
        resetAt: response.resetAt
      };

      // Notify popup about usage update so it can refresh
      try {
        chrome.runtime.sendMessage({ action: 'usageUpdated' }).catch(() => {
          // Ignore errors if popup is not open
        });
      } catch (error) {
        // Ignore errors if popup is not open
      }

      // Update all button states
      this.updateAllButtonStates();

    } catch (error) {
      console.error('Failed to generate reply:', error);
      emitTelemetry({
        event_type: 'api_request_failed',
        surface: 'content',
        route: '/api/generate-reply',
        error_code: error?.message || 'generate_reply_failed',
      });
      if (error?.message?.includes('401')) {
        this.authManager.signOut().catch(err => {
          console.error('Failed to sign out on 401:', err);
        });
        this.isAuthenticated = false;
      }
      const { message: baseMessage } = getUserFacingError(
        error,
        'Something went wrong. Try again.',
      );
      let errorMessage = baseMessage;
      if (error?.message?.includes('400')) {
        errorMessage = 'Invalid request. Please try again or refresh the page.';
      }
      this.showMessage(composer, errorMessage, 'error');
    } finally {
      // Restore button
      button.innerHTML = originalText;
      button.disabled = false;
      this.updateButtonState(button);
    }
  }

  async handleSuggestReplyFromPopup() {
    // Find the currently focused composer or the first visible one
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

  /**
   * Fix: prefer focused composer, then first visible reply box (plan: active composer, not random query).
   */
  findActiveReplyComposer() {
    const candidates = document.querySelectorAll(
      '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea_1"], [data-testid="tweetTextarea_2"]',
    );
    const active = document.activeElement;
    for (const el of Array.from(candidates)) {
      if (active && (el === active || el.contains(active))) {
        return el;
      }
    }
    for (const el of Array.from(candidates)) {
      if (this.isComposerVisible(el)) return el;
    }
    return null;
  }

  /** Toolbar scope for locating injected TweetReply buttons (same as findButtonForComposer). */
  findComposerButtonContainer(composer) {
    return composer?.closest?.('[data-testid="tweetComposer"]') || composer?.parentElement || null;
  }

  findImproveButtonForComposer(composer) {
    const container = this.findComposerButtonContainer(composer);
    return container?.querySelector('.tweetreply-improve-btn') || null;
  }

  /**
   * Fix: plan UX — minimal hint when no composer (cannot use showMessage without a composer parent).
   */
  showTransientPageMessage(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `tweetreply-message tweetreply-message--${type}`;
    el.setAttribute('role', 'status');
    el.textContent = message;
    el.style.cssText =
      'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483646;max-width:90vw;padding:10px 14px;border-radius:8px;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.25);';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  async handleShortcutCommand(command) {
    const composer = this.findActiveReplyComposer();
    if (!composer) {
      emitTelemetry({
        event_type: 'composer_injection_failed',
        surface: 'content',
        error_code: 'shortcut_no_composer',
        context: { action: command },
      });
      this.showTransientPageMessage('Open a reply composer on X first, then try the shortcut again.');
      return;
    }
    const actualComposer =
      composer.querySelector?.('[contenteditable="true"]') ||
      composer.querySelector?.('.public-DraftEditor-content') ||
      composer;

    if (command === 'suggest_reply') {
      const suggestBtn = this.findButtonForComposer(composer);
      if (!suggestBtn) {
        emitTelemetry({
          event_type: 'composer_injection_failed',
          surface: 'content',
          error_code: 'shortcut_no_suggest_button',
          context: { action: command },
        });
        this.showMessage(
          actualComposer,
          'Wait for TweetReply buttons to appear on this composer, then try again.',
          'info',
        );
        return;
      }
      await this.handleSuggestReply(composer, suggestBtn);
      return;
    }
    if (command === 'improve_draft') {
      const improveBtn = this.findImproveButtonForComposer(composer);
      if (!improveBtn) {
        emitTelemetry({
          event_type: 'composer_injection_failed',
          surface: 'content',
          error_code: 'shortcut_no_improve_button',
          context: { action: command },
        });
        this.showMessage(
          actualComposer,
          'Wait for TweetReply buttons to appear on this composer, then try again.',
          'info',
        );
        return;
      }
      await this.handleImproveReply(composer, improveBtn);
      return;
    }
    if (command === 'insert_default_snippet') {
      const { defaultSnippet, legacyText } = await this.getSnippetLibraryState();
      const snippetText = defaultSnippet?.text || legacyText;
      if (!snippetText) {
        this.showMessage(actualComposer, 'No default snippet set in extension settings.', 'info');
        return;
      }
      await this.appendCtaSnippetToComposer(actualComposer, snippetText);
    }
  }

  async handleImproveReply(composer, button) {
    if (!this.isAuthenticated) {
      this.showMessage(composer, `Please sign in to use ${APP_DISPLAY_NAME}`, 'error');
      return;
    }

    if (!this.usageData || this.usageData.used >= this.usageData.limit) {
      this.showMessage(composer, "You've used all your credits! Upgrade to keep the replies flowing.", 'info');
      return;
    }

    // Extract current draft text from composer
    let draftText = '';
    
    // Try multiple methods to extract text
    // Method 1: Twitter's Draft.js structure with data-text spans
    const dataTextSpans = composer.querySelectorAll('[data-text="true"]');
    if (dataTextSpans.length > 0) {
      draftText = Array.from(dataTextSpans)
        .map(span => span.textContent || span.innerText)
        .join(' ')
        .trim();
    }
    
    // Method 2: Direct textContent or innerText
    if (!draftText || draftText.length === 0) {
      draftText = composer.textContent || composer.innerText || '';
    }
    
    // Method 3: Try to get from contenteditable div
    if (!draftText || draftText.length === 0) {
      const contentEditable = composer.querySelector('[contenteditable="true"]');
      if (contentEditable) {
        draftText = contentEditable.textContent || contentEditable.innerText || '';
      }
    }
    
    // Clean up the text
    draftText = draftText.trim();
    
    // Validate draft is not empty
    if (!draftText || draftText.length === 0) {
      this.showMessage(composer, 'Please write a draft reply first', 'info');
      return;
    }
    
    // Show loading state
    button.disabled = true;
    const originalText = button.innerHTML;
    button.innerHTML = `
      <div class="tweetreply-spinner" style="width: 14px; height: 14px; border: 2px solid #3b82f6; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 4px;"></div>
      <span>Improving...</span>
    `;

    try {
      // Extract original tweet text
      const originalTweetText = this.extractTweetText() || '';
      
      console.log('[TweetReplyAI] Improving draft:', {
        draftLength: draftText.length,
        originalTweetLength: originalTweetText.length
      });
      
      // Call API to improve draft
      const response = await this.apiClient.suggestImprovements(draftText, originalTweetText);
      
      console.log('[TweetReplyAI] API response received:', response);
      console.log('[TweetReplyAI] Response keys:', Object.keys(response || {}));
      
      // Extract improved draft from response
      // Backend returns: { improved: string, original: string, qualityScore: number, ... }
      let improvedDraft = '';
      if (response && response.improved) {
        // This is the correct field name from backend
        improvedDraft = response.improved;
      } else if (typeof response === 'string') {
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
        // Fallback: try to get first string value from response
        improvedDraft = Object.values(response).find(v => typeof v === 'string') || draftText;
      }
      
      console.log('[TweetReplyAI] Extracted improved draft:', improvedDraft);
      
      if (!improvedDraft || improvedDraft.trim().length === 0) {
        throw new Error('No improved draft received from API');
      }
      
      // Insert improved text into composer
      await this.insertReplyIntoComposer(composer, improvedDraft);

      try {
        await this.maybeAutoAppendCtaAfterAiInsert(composer);
      } catch (ctaErr) {
        console.warn('[TweetReplyAI] Auto-append CTA failed:', ctaErr);
      }
      
      // Update usage data if provided
      // Backend returns usage data in response.usage object
      if (response.usage) {
        this.usageData = {
          ...this.usageData,
          used: response.usage.used,
          limit: response.usage.limit || this.usageData.limit,
          resetAt: response.usage.resetAt || this.usageData.resetAt
        };
      } else if (response.used !== undefined) {
        // Fallback for backward compatibility
        this.usageData = {
          ...this.usageData,
          used: response.used,
          limit: response.limit || this.usageData.limit,
          resetAt: response.resetAt || this.usageData.resetAt
        };
      }
      
      // Notify popup about usage update so it can refresh
      if (response.usage || response.used !== undefined) {
        try {
          chrome.runtime.sendMessage({ action: 'usageUpdated' }).catch(() => {
            // Ignore errors if popup is not open
          });
        } catch (error) {
          // Ignore errors if popup is not open
        }
      }
      
      // Update all button states
      this.updateAllButtonStates();

    } catch (error) {
      console.error('[TweetReplyAI] Failed to improve reply:', error);
      emitTelemetry({
        event_type: 'api_request_failed',
        surface: 'content',
        route: '/api/suggest-improvements',
        error_code: error?.message || 'improve_reply_failed',
      });
      console.error('[TweetReplyAI] Error details:', {
        message: error?.message,
        stack: error?.stack,
        response: error?.response,
      });
      if (error?.message?.includes('401')) {
        this.authManager.signOut().catch(err => {
          console.error('Failed to sign out on 401:', err);
        });
        this.isAuthenticated = false;
      }
      const { message: baseMessage } = getUserFacingError(
        error,
        'Something went wrong. Try again.',
      );
      let errorMessage = baseMessage;
      if (error?.message?.includes('400')) {
        errorMessage = 'Invalid request. Please try again or refresh the page.';
      }
      this.showMessage(composer, errorMessage, 'error');
    } finally {
      // Restore button
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
    return container?.querySelector('.tweetreply-suggest-btn');
  }

  extractTweetText() {
    // When reply composer modal is open, the tweet shown in the dialog is the one we're replying to.
    if (/\/compose\/post/.test(window.location.pathname)) {
      const dialogArticle = this.getReplyTargetArticleFromComposerDialog();
      if (dialogArticle) {
        const tweetTextEl = dialogArticle.querySelector('[data-testid="tweetText"]');
        if (tweetTextEl) {
          const text = extractTweetPlainText(tweetTextEl);
          if (text && text.length > 10) return text;
        }
      }
    }

    // Method 0: When user clicked Reply, use the stored tweet article so "current tweet" is unambiguous
    if (this.currentReplyTargetArticle && document.contains(this.currentReplyTargetArticle)) {
      const tweetTextEl = this.currentReplyTargetArticle.querySelector('[data-testid="tweetText"]');
      if (tweetTextEl) {
        const text = extractTweetPlainText(tweetTextEl);
        if (text && text.length > 10) return text;
      }
    }

    // Method 0.5: On detail page with no reply target, default to the focal tweet (URL tweet).
    // Avoids returning the first tweet on the whole page, which can be wrong when Suggest is used without clicking Reply.
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

    // Method 1: Look for tweet text in tweet elements (fallback)
    const tweetSelectors = [
      '[data-testid="tweet"] [data-testid="tweetText"]',
      '.tweet-text',
      '[lang] span', // Twitter uses lang attribute on tweet text
    ];
    for (const selector of tweetSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const text = element.textContent?.trim();
        if (text && text.length > 10) return text;
      }
    }

    // Method 2: Extract from Draft.js spans (inject.js method)
    try {
      const draftSpans = document.querySelectorAll('span[data-text="true"]');
      if (draftSpans.length > 0) {
        const text = Array.from(draftSpans)
          .map(span => span.textContent || "")
          .join(" ")
          .trim();
        if (text && text.length > 10) return text;
      }
    } catch (error) {
      console.warn('[TweetReplyAI] Draft.js span extraction failed:', error);
    }

    // Method 3: Look for any contentEditable with tweet-like content
    try {
      const contentEditables = document.querySelectorAll('[contenteditable="true"]');
      for (const element of contentEditables) {
        // Skip composer elements
        if (element.getAttribute('data-testid')?.includes('tweetTextarea') ||
            element.classList.contains('public-DraftEditor-content')) {
          continue;
        }
        
        const text = element.textContent?.trim();
        if (text && text.length > VALIDATION.MIN_TWEET_LENGTH && text.length < VALIDATION.MAX_TWEET_LENGTH) {
          console.log('[TweetReplyAI] ✅ Tweet text found via contentEditable');
          return text;
        }
      }
    } catch (error) {
      console.warn('[TweetReplyAI] contentEditable extraction failed:', error);
    }

    // Method 4: Look for Draft.js blocks
    try {
      const draftBlocks = document.querySelectorAll('.public-DraftStyleDefault-block');
      if (draftBlocks.length > 0) {
        const text = Array.from(draftBlocks)
          .map(block => block.textContent || "")
          .join("\n")
          .trim();
        if (text && text.length > 10) {
          console.log('[TweetReplyAI] ✅ Tweet text found via Draft.js blocks');
          return text;
        }
      }
    } catch (error) {
      console.warn('[TweetReplyAI] Draft.js block extraction failed:', error);
    }

    // Method 5: Parent element traversal (inject.js method)
    try {
      const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
      for (const tweet of tweetElements) {
        let currentElement = tweet;
        for (let i = 0; i < 3 && currentElement; i++) {
          const spans = currentElement.querySelectorAll('span[data-text="true"]');
          if (spans.length > 0) {
            const text = Array.from(spans)
              .map(span => span.textContent || "")
              .join(" ")
              .trim();
            if (text && text.length > 10) {
              console.log('[TweetReplyAI] ✅ Tweet text found via parent traversal');
              return text;
            }
          }
          currentElement = currentElement.parentElement;
        }
      }
    } catch (error) {
      console.warn('[TweetReplyAI] Parent traversal extraction failed:', error);
    }

    // Method 6: Fallback to sentence detection from body text
    try {
    const allText = document.body.textContent;
    const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > VALIDATION.MIN_TWEET_LENGTH);
      if (sentences.length > 0) {
        console.log('[TweetReplyAI] ✅ Tweet text found via sentence detection');
    return sentences[0]?.trim() || null;
      }
    } catch (error) {
      console.warn('[TweetReplyAI] Sentence detection failed:', error);
    }

    console.warn('[TweetReplyAI] ❌ Failed to extract tweet text from any method');
    return null;
  }

  extractTweetId() {
    // When reply composer modal is open, use the tweet in the dialog (the one we're replying to).
    if (/\/compose\/post/.test(window.location.pathname)) {
      const dialogArticle = this.getReplyTargetArticleFromComposerDialog();
      if (dialogArticle) {
        const ownId = this.getOwnStatusIdFromArticle(dialogArticle);
        if (ownId) {
          console.log('[TweetReplyAI] Tweet ID extracted from composer dialog:', ownId);
          return ownId;
        }
      }
    }

    // Method 1: From URL (works on /status/123 pages)
    const urlMatch = window.location.href.match(/status\/(\d+)/);
    if (urlMatch) {
      console.log('[TweetReplyAI] Tweet ID extracted from URL:', urlMatch[1]);
      return urlMatch[1];
    }

    // Method 2: From tweet element data attributes
    const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
    for (const tweet of tweetElements) {
      // Check for data-tweet-id attribute
      const tweetId = tweet.getAttribute('data-tweet-id');
      if (tweetId) {
        console.log('[TweetReplyAI] Tweet ID extracted from data-tweet-id:', tweetId);
        return tweetId;
      }
      
      // Check aria-labelledby (format: "id__tweet-text-123456")
      const ariaLabel = tweet.getAttribute('aria-labelledby');
      if (ariaLabel) {
        const match = ariaLabel.match(/(\d{15,})/); // Tweet IDs are 15+ digits
        if (match) {
          console.log('[TweetReplyAI] Tweet ID extracted from aria-labelledby:', match[1]);
          return match[1];
        }
      }
      
      // Check for links to the tweet
      const tweetLink = tweet.querySelector('a[href*="/status/"]');
      if (tweetLink) {
        const linkMatch = tweetLink.href.match(/status\/(\d+)/);
        if (linkMatch) {
          console.log('[TweetReplyAI] Tweet ID extracted from tweet link:', linkMatch[1]);
          return linkMatch[1];
        }
      }
    }
    
    // Method 3: From any status link on the page
    const statusLinks = document.querySelectorAll('a[href*="/status/"]');
    for (const link of statusLinks) {
      const linkMatch = link.href.match(/status\/(\d+)/);
      if (linkMatch) {
        console.log('[TweetReplyAI] Tweet ID extracted from status link:', linkMatch[1]);
        return linkMatch[1];
      }
    }
    
    console.warn('[TweetReplyAI] Failed to extract tweet ID from any source');
    return null;
  }

  parseFollowerCount(countStr) {
    if (!countStr) return 0;
    
    // Convert "1.2K" → 1200, "5M" → 5000000, etc.
    const multipliers = { K: 1000, M: 1000000, B: 1000000000 };
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
        console.log('[TweetReplyAI] No author element found, using defaults');
        return {
          username: 'unknown',
          verified: false,
          follower_count: 0 // Fallback value
        };
      }

      // Parse username string: "Display Name@username · time" (e.g., "Jules Mesh@jules_mesh · 7h")
      const fullText = authorElement.textContent?.trim() || 'unknown';
      let username = 'unknown';
      let displayName = null;
      let postedTime = null;

      // Pattern: "Display Name@username · time" or "@username · time"
      // Middle dot can be Unicode U+00B7 (·), regular period (.), or · character
      // Match with display name first
      let match = fullText.match(/^(.+?)@([^\u00B7·.\s]+)\s*[\u00B7·.]\s*(.+)$/);
      if (match) {
        [, displayName, username, postedTime] = match;
        username = username.trim();
        displayName = displayName.trim();
        postedTime = postedTime.trim();
      } else {
        // Try without display name: "@username · time"
        match = fullText.match(/^@([^\u00B7·.\s]+)\s*[\u00B7·.]\s*(.+)$/);
        if (match) {
          [, username, postedTime] = match;
          username = username.trim();
          postedTime = postedTime.trim();
        } else {
          // Fallback: if no match, use full text as username
          username = fullText;
        }
      }

      const verifiedIcon = authorElement.querySelector('[data-testid="icon-verified"]');
      const isVerified = !!verifiedIcon;

      // Try to get follower count - use 0 as fallback
      let followerCount = 0;
      
      // Method 1: From tweet article context (most likely place)
      const tweetArticle = authorElement.closest('article[data-testid="tweet"]') || authorElement.closest('article');
      if (tweetArticle) {
        const followerMatch = tweetArticle.textContent?.match(/(\d+(?:\.\d+)?[KMB]?)\s*followers?/i);
        if (followerMatch) {
          followerCount = this.parseFollowerCount(followerMatch[1]);
          console.log('[TweetReplyAI] Follower count extracted from tweet article:', followerCount);
        }
      }
      
      // Method 2: From profile page bio (fallback)
      if (followerCount === 0) {
      const bioElement = document.querySelector('[data-testid="UserDescription"]');
      if (bioElement) {
        const followerMatch = bioElement.textContent?.match(/(\d+(?:\.\d+)?[KMB]?)\s*followers?/i);
        if (followerMatch) {
          followerCount = this.parseFollowerCount(followerMatch[1]);
          console.log('[TweetReplyAI] Follower count extracted from bio:', followerCount);
          }
        }
      }
      
      // Method 3: From hover card (if visible) - fallback
      if (followerCount === 0) {
        const hoverCard = document.querySelector('[data-testid="HoverCard"]');
        if (hoverCard) {
          const followerMatch = hoverCard.textContent?.match(/(\d+(?:\.\d+)?[KMB]?)\s*followers?/i);
          if (followerMatch) {
            followerCount = this.parseFollowerCount(followerMatch[1]);
            console.log('[TweetReplyAI] Follower count extracted from hover card:', followerCount);
          }
        }
      }

      console.log('[TweetReplyAI] Author info extracted:', { 
        username, 
        display_name: displayName, 
        posted_time: postedTime,
        verified: isVerified, 
        follower_count: followerCount 
      });

      return {
        username,
        verified: isVerified,
        follower_count: followerCount // Always returns a number
      };
    } catch (error) {
      console.error('[TweetReplyAI] Failed to extract author info:', error);
      return {
        username: 'unknown',
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
      const result = await chrome.storage.local.get(['replyTrackingSettings']);
      const settings = result.replyTrackingSettings || {
        trackingPeriodDays: DEFAULTS.TRACKING_DAYS
      };
      
      // Validate and clamp values
      return {
        trackingPeriodDays: Math.max(DEFAULTS.TRACKING_DAYS_MIN, Math.min(DEFAULTS.TRACKING_DAYS_MAX, parseInt(settings.trackingPeriodDays) || DEFAULTS.TRACKING_DAYS))
      };
    } catch (error) {
      console.warn('[TweetReplyAI] Failed to get tracking settings:', error);
      return { trackingPeriodDays: DEFAULTS.TRACKING_DAYS };
    }
  }

  // Set tracking settings
  async setTrackingSettings(settings) {
    try {
      await chrome.storage.local.set({ replyTrackingSettings: settings });
    } catch (error) {
      console.error('[TweetReplyAI] Failed to save tracking settings:', error);
    }
  }

  // Get reply history
  async getReplyHistory() {
    try {
      const result = await chrome.storage.local.get(['replyHistory']);
      return result.replyHistory || {};
    } catch (error) {
      console.warn('[TweetReplyAI] Failed to get reply history:', error);
      return {};
    }
  }

  // Track reply to a user
  async trackReply(username) {
    if (!username || username === 'unknown') return;
    
    // Prevent concurrent tracking for same username
    const lockKey = `tracking_${username}`;
    if (this[lockKey]) {
      return; // Already tracking this user
    }
    this[lockKey] = true;
    
    try {
      const history = await this.getReplyHistory();
      const settings = await this.getTrackingSettings();
      const now = Date.now();
      
      if (!history[username]) {
        history[username] = { replies: [] };
      }
      
      // Cleanup legacy hiding fields if they exist (migration)
      if (history[username].hidden !== undefined) {
        delete history[username].hidden;
      }
      if (history[username].hideUntil !== undefined) {
        delete history[username].hideUntil;
      }
      
      // Check if this exact reply already exists (within 1 second - same click)
      // Prevents duplicate tracking from rapid clicks
      const recentReply = history[username].replies.find(
        r => Math.abs(r.timestamp - now) < 1000
      );
      if (recentReply) {
        return; // Already tracked this reply - unlock handled in finally
      }
      
      // Add reply timestamp
      history[username].replies.push({ timestamp: now });
      
      // Cleanup old replies (older than trackingPeriodDays)
      const cutoff = now - (settings.trackingPeriodDays * AUTH.ONE_DAY_MS);
      history[username].replies = history[username].replies.filter(
        r => r.timestamp > cutoff
      );
      
      // Save updated history
      await chrome.storage.local.set({ replyHistory: history });
      
      // Update reply counts display
      await this.updateReplyCountsOnTweets();
    } catch (error) {
      console.error('[TweetReplyAI] Error tracking reply:', error);
    } finally {
      // Unlock after completion
      delete this[lockKey];
    }
  }


  // Cleanup expired history
  async cleanupExpiredHistory() {
    const history = await this.getReplyHistory();
    const settings = await this.getTrackingSettings();
    const cutoff = Date.now() - (settings.trackingPeriodDays * AUTH.ONE_DAY_MS);
    let hasChanges = false;
    
    for (const [username, data] of Object.entries(history)) {
      // Remove old reply entries
      const originalCount = data.replies?.length || 0;
      data.replies = (data.replies || []).filter(r => r.timestamp > cutoff);
      
      // Remove legacy hiding fields if they exist (migration cleanup)
      if (data.hidden !== undefined) {
        delete data.hidden;
        hasChanges = true;
      }
      if (data.hideUntil !== undefined) {
        delete data.hideUntil;
        hasChanges = true;
      }
      
      // Remove user if no replies left
      if (data.replies.length === 0) {
        delete history[username];
        hasChanges = true;
      } else if (data.replies.length !== originalCount) {
        hasChanges = true;
      }
    }
    
    // Only save if there were changes
    if (hasChanges) {
      await chrome.storage.local.set({ replyHistory: history });
      
      // Update reply counts display after cleanup
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
      
      // Use same parsing logic as extractAuthorInfo()
      const fullText = authorElement.textContent?.trim() || '';
      
      // Pattern: "Display Name@username · time" or "@username · time"
      let match = fullText.match(/^(.+?)@([^\u00B7·.\s]+)\s*[\u00B7·.]\s*(.+)$/);
      if (match) {
        return match[2].trim(); // username
      }
      
      // Try without display name: "@username · time"
      match = fullText.match(/^@([^\u00B7·.\s]+)\s*[\u00B7·.]\s*(.+)$/);
      if (match) {
        return match[1].trim(); // username
      }
      
      // Fallback: try to extract from @username pattern
      const usernameMatch = fullText.match(/@([^\s\u00B7·.]+)/);
      if (usernameMatch) {
        return usernameMatch[1];
      }
      
      return null;
    } catch (error) {
      console.warn('[TweetReplyAI] Failed to extract username from tweet:', error);
      return null;
    }
  }

  // Sync version for immediate checks
  extractUsernameFromTweetSync(tweetArticle) {
    try {
      const authorElement = tweetArticle.querySelector('[data-testid="User-Name"]');
      if (!authorElement) return null;
      
      const fullText = authorElement.textContent?.trim() || '';
      
      // Pattern: "Display Name@username · time" or "@username · time"
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
    if (!username || username === 'unknown') return 0;
    
    try {
      const history = await this.getReplyHistory();
      const userData = history[username];
      
      if (!userData || !userData.replies || userData.replies.length === 0) {
        return 0;
      }
      
      const now = Date.now();
      const cutoff = now - (days * AUTH.ONE_DAY_MS);
      
      const count = userData.replies.filter(r => r.timestamp > cutoff).length;
      return count;
    } catch (error) {
      console.error('[TweetReplyAI] Error getting reply count:', error);
      return 0;
    }
  }

  // Get color for reply count badge based on count (gradient from light to dark blue)
  getReplyCountColor(count) {
    if (count === 1) return '#60A5FA';      // Light blue
    if (count <= 3) return '#2563EB';       // Medium blue
    if (count <= 5) return '#1E40AF';       // Darker blue
    return '#1E3A8A';                        // Darkest blue
  }

  // Show reply count on a tweet near username/author info
  async showReplyCountOnTweet(tweetArticle, username, count = null) {
    if (!tweetArticle || !username || username === 'unknown') return;
    
    // Remove existing indicator if present (prevent duplicates)
    const existingIndicator = tweetArticle.querySelector('.tweetreply-reply-count');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    // Get count if not provided (for performance, avoid duplicate calls)
    if (count === null) {
      const settings = await this.getTrackingSettings();
      count = await this.getReplyCountForUser(username, settings.trackingPeriodDays);
    }
    
    // Only show if count > 0
    if (count <= 0) return;
    
    // Find User-Name element (try again in case DOM changed during async operations)
    const userNameElement = tweetArticle.querySelector('[data-testid="User-Name"]');
    if (!userNameElement || !userNameElement.isConnected) return;
    
    // Check if tweet is still connected to DOM
    if (!tweetArticle.isConnected) {
      return; // Tweet was removed
    }
    
    // Get color based on count
    const color = this.getReplyCountColor(count);
    
    // Create count indicator with modern styling
    const indicator = document.createElement('span');
    indicator.className = 'tweetreply-reply-count';
    indicator.setAttribute('data-username', username);
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
    indicator.textContent = `${count} ${count === 1 ? 'reply' : 'replies'}`;
    
    // Find time element and insert right after it (multiple strategies)
    let inserted = false;
    
    try {
      // Strategy 1: Look for <time> element within the User-Name container or tweet
      const timeElement = userNameElement.querySelector('time') || tweetArticle.querySelector('time');
      
      if (timeElement && timeElement.isConnected) {
        // Re-check parent exists (DOM might have changed during async operations)
        const timeParent = timeElement.parentNode;
        if (!timeParent || !timeParent.isConnected) {
          // Parent removed, skip this strategy
        } else {
          // Insert right after time element with space
          // Check if space already exists
          const nextSibling = timeElement.nextSibling;
          if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent.trim() === '') {
            // Space already exists, insert after it
            if (nextSibling.nextSibling) {
              timeParent.insertBefore(indicator, nextSibling.nextSibling);
            } else {
              timeParent.appendChild(indicator);
            }
          } else {
            // No space exists, create one
            const spaceText = document.createTextNode(' ');
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
        // Strategy 2: Find time pattern in User-Name text and insert after it
        const userNameText = userNameElement.textContent || '';
        // Match time pattern (e.g., "11h", "17h", "1h", "2d", "3w", "1m", "30s", etc.)
        // Pattern: middle dot followed by optional space, then digits, then time unit (h/m/s/d/w)
        const timeMatch = userNameText.match(/[\u00B7·.]\s*(\d+[hmsdw]?)\b/i);
        
        if (timeMatch) {
          // Find the text node containing the time or the element containing it
          const walker = document.createTreeWalker(
            userNameElement,
            NodeFilter.SHOW_TEXT,
            null
          );
          
          let textNode;
          while ((textNode = walker.nextNode())) {
            if (textNode.textContent && textNode.textContent.includes(timeMatch[1])) {
              // Found text node with time, insert after its parent element
              const textParent = textNode.parentElement || textNode.parentNode;
              if (textParent && textParent.isConnected) {
                const parentContainer = textParent.parentNode;
                if (parentContainer && parentContainer.isConnected) {
                  // Check if space already exists after text parent
                  const nextSibling = textParent.nextSibling;
                  if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent.trim() === '') {
                    // Space already exists, insert after it
                    if (nextSibling.nextSibling) {
                      parentContainer.insertBefore(indicator, nextSibling.nextSibling);
                    } else {
                      parentContainer.appendChild(indicator);
                    }
                  } else {
                    // No space exists, create one
                    const spaceText = document.createTextNode(' ');
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
              // If insertion failed, continue to next text node (might have multiple matches)
            }
          }
          
          // If text node approach didn't work, try to insert after User-Name element
          if (!inserted && userNameElement.isConnected) {
            // Find container that likely holds the time
            // Time is usually the last part after middle dot
            const container = userNameElement.parentElement || userNameElement.parentNode;
            if (container && container.isConnected) {
              // Check if space already exists
              const nextSibling = userNameElement.nextSibling;
              if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent.trim() === '') {
                // Space already exists, insert after it
                if (nextSibling.nextSibling) {
                  container.insertBefore(indicator, nextSibling.nextSibling);
                } else {
                  container.appendChild(indicator);
                }
              } else {
                // No space exists, create one
                const spaceText = document.createTextNode(' ');
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
      
      // Strategy 3: Fallback - Insert after User-Name element with space
      if (!inserted && userNameElement.isConnected) {
        const parent = userNameElement.parentNode;
        if (parent && parent.isConnected) {
          // Check if space already exists
          const nextSibling = userNameElement.nextSibling;
          if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent.trim() === '') {
            // Space already exists, insert after it
            if (nextSibling.nextSibling) {
              parent.insertBefore(indicator, nextSibling.nextSibling);
            } else {
              parent.appendChild(indicator);
            }
          } else {
            // No space exists, create one
            const spaceText = document.createTextNode(' ');
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
      // Strategy 4: Last resort fallback - append to User-Name parent
      try {
        // Re-check if elements still connected after error
        if (!userNameElement.isConnected || !tweetArticle.isConnected) {
          return; // DOM changed, abort
        }
        
        const parent = userNameElement.parentElement || userNameElement.parentNode;
        if (parent && parent.isConnected) {
          // Check if space already exists at end
          const lastChild = parent.lastChild;
          if (lastChild && lastChild.nodeType === Node.TEXT_NODE && lastChild.textContent.trim() === '') {
            // Space exists, insert before it
            parent.insertBefore(indicator, lastChild);
          } else {
            // No space, create one
            const spaceText = document.createTextNode(' ');
            parent.appendChild(spaceText);
            parent.appendChild(indicator);
          }
        } else {
          // Absolute last resort - only if still connected
          if (userNameElement.isConnected) {
            userNameElement.appendChild(indicator);
          }
        }
      } catch (e) {
        console.warn('[TweetReplyAI] Could not insert reply count indicator:', e);
      }
    }
  }

  // Update reply counts on all visible tweets
  async updateReplyCountsOnTweets() {
    // Prevent concurrent execution
    if (this.checkingTweets) {
      return;
    }
    this.checkingTweets = true;
    
    try {
      const settings = await this.getTrackingSettings();
      const tweets = document.querySelectorAll('article[data-testid="tweet"]');
      
      for (const tweet of tweets) {
        // Check if tweet is still connected (may have been removed during async operations)
        if (!tweet.isConnected) continue;
        
        const username = this.extractUsernameFromTweetSync(tweet);
        if (username && username !== 'unknown') {
          const count = await this.getReplyCountForUser(username, settings.trackingPeriodDays);
          
          // Re-check tweet is still connected before DOM manipulation
          if (!tweet.isConnected) continue;
          
          if (count > 0) {
            // Pass count to avoid duplicate lookup
            await this.showReplyCountOnTweet(tweet, username, count);
          } else {
            // Remove indicator if count is 0
            const existingIndicator = tweet.querySelector('.tweetreply-reply-count');
            if (existingIndicator && existingIndicator.isConnected) {
              existingIndicator.remove();
            }
          }
        }
      }
    } catch (error) {
      console.error('[TweetReplyAI] Error updating reply counts:', error);
    } finally {
      this.checkingTweets = false;
    }
  }

  // Setup reply count display system
  setupReplyCountDisplay() {
    // Don't setup if already initialized
    if (this.countDisplayInitialized) return;
    this.countDisplayInitialized = true;
    
    // Initialize on load
    this.updateReplyCountsOnTweets();
    
    // Periodically cleanup and update counts
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
      
      // Get up to 4 parent tweets for context
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
      console.error('Failed to extract conversation context:', error);
      return null;
    }
  }

  /**
   * Extract comprehensive thread context including original tweet and full thread chain
   * Returns structured data about the conversation thread
   */
  extractThreadContext() {
    const DEBUG_THREAD_CONTEXT = false; // Set true for debugging thread extraction
    try {
      if (DEBUG_THREAD_CONTEXT) {
        console.log('[TweetReplyAI] 🔍 ========== EXTRACTING THREAD CONTEXT ==========');
        console.log('[TweetReplyAI] 🔍 Starting thread context extraction...');
      }

      // Get current tweet text (the one being replied to)
      const currentTweetText = this.extractTweetText();
      if (DEBUG_THREAD_CONTEXT) console.log('[TweetReplyAI] 🔍 Current tweet text length:', currentTweetText?.length || 0);
      if (!currentTweetText) {
        console.warn('[TweetReplyAI] ⚠️ No current tweet found, returning standalone context');
        return {
          isReply: false,
          originalTweet: null,
          originalTweetAuthor: null,
          threadChain: [],
          currentTweetIndex: 0,
          threadLength: 0
        };
      }

      // Only extract full conversation context on tweet detail pages (URL containing /status/<digits>)
      const isDetailPage = this.isTweetDetailPage();

      // Diagnostic logging for wrong originalTweetAuthor / thread selection (see DIAGNOSE_THREAD_SELECTION).
      if (DIAGNOSE_THREAD_SELECTION) {
        const currentPath = window.location.pathname;
        const effectivePath = /\/compose\//.test(currentPath) ? this.lastNonComposePath : currentPath;
        const statusIdHere = this.getStatusIdFromDetailPageUrl();
        console.log('[TweetReplyAI] DIAG extractThreadContext path:', currentPath, '| lastNonComposePath:', this.lastNonComposePath, '| effectivePath:', effectivePath);
        console.log('[TweetReplyAI] DIAG statusId:', statusIdHere ?? 'null');
        console.log('[TweetReplyAI] DIAG currentTweetText preview:', (currentTweetText || '').substring(0, 80) + (currentTweetText && currentTweetText.length > 80 ? '...' : ''));
        console.log('[TweetReplyAI] DIAG currentReplyTargetArticle set?', !!this.currentReplyTargetArticle);
      }

      if (!isDetailPage) {
        if (DEBUG_THREAD_CONTEXT) console.log('[TweetReplyAI] Not on detail page, using single-tweet context only');
        const authorInfo = this.extractAuthorInfo();
        return {
          isReply: true,
          originalTweet: currentTweetText,
          originalTweetAuthor: authorInfo?.username || 'unknown',
          threadChain: [{
            text: currentTweetText,
            author: authorInfo?.username || 'unknown',
            isOriginal: true,
            isCurrent: true
          }],
          currentTweetIndex: 0,
          threadLength: 1
        };
      }

      // Step 1: Detect if we're in a reply context
      const isReply = this.detectReplyContext();
      if (DEBUG_THREAD_CONTEXT) console.log('[TweetReplyAI] Reply context detected:', isReply);

      if (!isReply) {
        // Standalone tweet - not part of a thread
        return {
          isReply: false,
          originalTweet: null,
          originalTweetAuthor: null,
          threadChain: [{
            text: currentTweetText,
            author: this.extractAuthorInfo()?.username || 'unknown',
            isOriginal: true,
            isCurrent: true
          }],
          currentTweetIndex: 0,
          threadLength: 1
        };
      }

      // Step 2: Find thread container
      const threadContainer = this.findThreadContainer();
      if (DIAGNOSE_THREAD_SELECTION) {
        if (!threadContainer) {
          console.log('[TweetReplyAI] DIAG findThreadContainer: null');
        } else {
          const articles = threadContainer.querySelectorAll('article[data-testid="tweet"]');
          const desc = threadContainer.tagName.toLowerCase() + (threadContainer.className ? '.' + (typeof threadContainer.className === 'string' ? threadContainer.className.split(/\s+/)[0] : '') : '') + (threadContainer.getAttribute?.('data-testid') ? '[data-testid="' + threadContainer.getAttribute('data-testid') + '"]' : '');
          console.log('[TweetReplyAI] DIAG findThreadContainer: element=', desc, '| tweet count=', articles.length);
          if (articles.length >= 1) {
            const firstAuthor = (articles[0].querySelector('[data-testid="User-Name"]')?.textContent || '').match(/@([A-Za-z0-9_]+)/);
            const lastAuthor = articles.length > 1 ? (articles[articles.length - 1].querySelector('[data-testid="User-Name"]')?.textContent || '').match(/@([A-Za-z0-9_]+)/) : null;
            console.log('[TweetReplyAI] DIAG container first author:', firstAuthor ? '@' + firstAuthor[1] : 'unknown', '| last author:', lastAuthor ? '@' + lastAuthor[1] : 'n/a');
          }
        }
      }
      if (!threadContainer) {
        console.log('[TweetReplyAI] ⚠️ Thread container not found, using current tweet only');
        return {
          isReply: true,
          originalTweet: null,
          originalTweetAuthor: null,
          threadChain: [{
            text: currentTweetText,
            author: this.extractAuthorInfo()?.username || 'unknown',
            isOriginal: false,
            isCurrent: true
          }],
          currentTweetIndex: 0,
          threadLength: 1
        };
      }

      // Step 3: Extract all tweets from thread container
      const threadTweets = this.extractTweetsFromContainer(threadContainer);
      if (DEBUG_THREAD_CONTEXT) console.log('[TweetReplyAI] Found', threadTweets.length, 'tweets in thread');

      if (DIAGNOSE_THREAD_SELECTION && threadTweets.length > 0) {
        threadTweets.forEach((t, i) => {
          const preview = (t.text || '').substring(0, 50) + ((t.text && t.text.length > 50) ? '...' : '');
          console.log('[TweetReplyAI] DIAG threadTweets[' + i + ']: author=@' + (t.author || 'unknown') + ' statusId=' + (t.statusId ?? 'null') + ' text="' + preview + '"');
        });
      }

      if (threadTweets.length === 0) {
        return {
          isReply: true,
          originalTweet: null,
          originalTweetAuthor: null,
          threadChain: [{
            text: currentTweetText,
            author: this.extractAuthorInfo()?.username || 'unknown',
            isOriginal: false,
            isCurrent: true
          }],
          currentTweetIndex: 0,
          threadLength: 1
        };
      }

      // Step 4: Three-tier original tweet resolution
      // On a detail page the status ID in the URL is the ground truth; never fall back to threadTweets[0].
      const statusId = this.getStatusIdFromDetailPageUrl();
      let originalTweet = null;
      let tierUsed = null;

      if (statusId) {
        // Invalidate cache when the user navigated to a different tweet
        if (this._originalTweetCache && this._originalTweetCache.statusId !== statusId) {
          this._originalTweetCache = null;
        }

        // Tier 1 (DOM article) — highest quality, full text; also updates cache
        const urlOriginalArticle = this.findOriginalTweetArticleByStatusId(statusId);
        if (urlOriginalArticle) {
          const domOriginal = this.extractTextAndAuthorFromArticle(urlOriginalArticle);
          if (domOriginal) {
            originalTweet = domOriginal;
            tierUsed = 'Tier 1 DOM';
            this._originalTweetCache = { statusId, text: domOriginal.text, author: domOriginal.author, fromDom: true };
          }
        }

        // Tier 1b (cache) — article is no longer in DOM (scrolled/virtualized) but was seen before
        if (!originalTweet && this._originalTweetCache?.statusId === statusId && this._originalTweetCache.fromDom) {
          originalTweet = { text: this._originalTweetCache.text, author: this._originalTweetCache.author };
          tierUsed = 'Tier 1b cache';
        }

        // Tier 2 (thread list by own status ID) — root still in container but article lookup missed
        if (!originalTweet) {
          const byId = threadTweets.find(t => t.statusId === statusId);
          if (byId) {
            originalTweet = { text: byId.text, author: byId.author };
            tierUsed = 'Tier 2 threadList';
            this._originalTweetCache = { statusId, text: byId.text, author: byId.author, fromDom: true };
          }
        }

        // Tier 3 (meta/URL) — og:description + URL path; text may be truncated but author is always accurate
        if (!originalTweet) {
          const meta = this.getOriginalTweetFromPageMeta();
          if (meta?.statusId === statusId) {
            originalTweet = { text: meta.text, author: meta.author };
            tierUsed = 'Tier 3 meta';
            if (!this._originalTweetCache) {
              this._originalTweetCache = { statusId, text: meta.text, author: meta.author, fromDom: false };
            }
          }
        }

        // Last resort: we know the author from the URL even if text is not available
        if (!originalTweet) {
          const pathMatch = (/\/compose\//.test(window.location.pathname) ? this.lastNonComposePath : window.location.pathname)
            .match(/^\/([A-Za-z0-9_]+)\/status\/\d+/);
          originalTweet = { text: null, author: pathMatch ? pathMatch[1] : 'unknown' };
          tierUsed = 'lastResort';
        }
      } else {
        // Not a detail page: use first tweet in thread as original (existing behaviour)
        originalTweet = threadTweets[0] || { text: null, author: 'unknown' };
        tierUsed = 'threadTweets[0]';
      }

      // Step 4b: Same-tweet conflict — the URL-focal tweet is also the one being replied to.
      // Example: User navigated Sahil→Bill and is replying to Bill. Bill's ID is in the URL so
      // originalTweet resolves to Bill, but currentTweetText is also Bill. In this case the
      // true "original" should be the earliest ancestor (Sahil), not Bill.
      let originalWasOverridden = false;
      if (
        originalTweet?.text &&
        currentTweetText &&
        originalTweet.text.trim() === currentTweetText.trim()
      ) {
        // Find the first threadTweet that is NOT the current tweet (i.e. the true ancestor)
        const ancestor = threadTweets.find(
          t => t.text && t.text.trim() !== currentTweetText.trim()
        );
        if (ancestor) {
          originalTweet = { text: ancestor.text, author: ancestor.author };
          originalWasOverridden = true;
        }
      }

      if (DIAGNOSE_THREAD_SELECTION && tierUsed) {
        const otPreview = (originalTweet?.text || '').substring(0, 60) + ((originalTweet?.text && originalTweet.text.length > 60) ? '...' : '');
        console.log('[TweetReplyAI] DIAG originalTweet from:', tierUsed, '| author=@' + (originalTweet?.author || 'unknown'), '| text="' + otPreview + '"');
        if (originalWasOverridden) {
          console.log('[TweetReplyAI] DIAG same-tweet override: new author=@' + (originalTweet?.author || 'unknown'), '| text="' + otPreview + '"');
        }
      }

      let currentTweetIndex = this.findCurrentTweetIndex(threadTweets, currentTweetText);
      if (currentTweetIndex < 0) {
        currentTweetIndex = threadTweets.length - 1;
        console.warn('[TweetReplyAI] ⚠️ Current tweet not found in thread, defaulting to last tweet');
      }

      if (DIAGNOSE_THREAD_SELECTION) {
        const ct = threadTweets[currentTweetIndex];
        const ctPreview = ct ? ((ct.text || '').substring(0, 50) + ((ct.text && ct.text.length > 50) ? '...' : '')) : 'n/a';
        console.log('[TweetReplyAI] DIAG currentTweetIndex:', currentTweetIndex, '| author=', ct ? '@' + (ct.author || 'unknown') : 'n/a', '| text="' + ctPreview + '"');
      }

      // Step 5: Build thread chain.
      // When originalWasOverridden the statusId no longer matches the new originalTweet, so skip
      // the statusId-based isOriginal check and rely solely on text+author matching.
      const threadChain = threadTweets.map((tweet, index) => ({
        text: tweet.text,
        author: tweet.author || 'unknown',
        isOriginal: (!originalWasOverridden && statusId && tweet.statusId === statusId) ||
          (!!originalTweet.text && tweet.text === originalTweet.text && (tweet.author || 'unknown') === (originalTweet.author || 'unknown')),
        isCurrent: index === currentTweetIndex
      }));

      // Limit thread chain to 4 tweets or 2000 chars
      let limitedChain = threadChain;
      let totalChars = threadChain.reduce((sum, t) => sum + t.text.length, 0);
      if (threadChain.length > VALIDATION.MAX_THREAD_CHAIN || totalChars > VALIDATION.MAX_THREAD_CHARS) {
        // When originalWasOverridden, statusId points at focal tweet (e.g. Bill), not the true original (Sahil).
        // Skip statusId lookup so we resolve the ancestor's index by text+author match.
        let originalIndex = (!originalWasOverridden && statusId)
          ? threadTweets.findIndex(t => t.statusId === statusId)
          : -1;
        if (originalIndex < 0 && originalTweet.text) {
          originalIndex = threadTweets.findIndex(t => t.text === originalTweet.text && (t.author || 'unknown') === (originalTweet.author || 'unknown'));
        }
        const keepIndices = new Set([...(originalIndex >= 0 ? [originalIndex] : []), currentTweetIndex]);
        const recentIndices = [];
        for (let i = Math.max(1, threadChain.length - 2); i < threadChain.length; i++) {
          if (i !== currentTweetIndex) recentIndices.push(i);
        }
        recentIndices.slice(0, 2).forEach(idx => keepIndices.add(idx));
        limitedChain = threadChain.filter((_, idx) => keepIndices.has(idx));
      }

      // FIX: Recalculate currentTweetIndex after filtering to ensure it points to correct tweet in limitedChain
      // The original index may no longer be valid after filtering
      let recalculatedCurrentIndex = limitedChain.findIndex(tweet => tweet.isCurrent);
      if (recalculatedCurrentIndex < 0) {
        // Fallback: find by text match (first 50 chars for fuzzy matching)
        const currentTextPrefix = currentTweetText.substring(0, 50).toLowerCase();
        recalculatedCurrentIndex = limitedChain.findIndex(tweet => 
          tweet.text === currentTweetText || 
          tweet.text.substring(0, 50).toLowerCase() === currentTextPrefix
        );
      }
      // Last resort: use last tweet in chain if still not found
      if (recalculatedCurrentIndex < 0) {
        recalculatedCurrentIndex = limitedChain.length - 1;
        console.warn('[TweetReplyAI] ⚠️ Could not find current tweet in limited chain, using last tweet');
      }

      const result = {
        isReply: true,
        originalTweet: originalTweet.text || null,
        originalTweetAuthor: originalTweet.author || null,
        threadChain: limitedChain,
        currentTweetIndex: recalculatedCurrentIndex, // FIX: Use recalculated index
        threadLength: limitedChain.length
      };

      if (DIAGNOSE_THREAD_SELECTION) {
        const origPreview = (result.originalTweet || '').substring(0, 80) + ((result.originalTweet && result.originalTweet.length > 80) ? '...' : '');
        console.log('[TweetReplyAI] DIAG final chain: originalTweetAuthor=@' + (result.originalTweetAuthor || 'none') + ' | originalTweet="' + origPreview + '" | currentTweetIndex=' + result.currentTweetIndex + ' | threadLength=' + result.threadLength);
        result.threadChain.forEach((t, i) => {
          const preview = (t.text || '').substring(0, 50) + ((t.text && t.text.length > 50) ? '...' : '');
          console.log('[TweetReplyAI] DIAG final chain[' + i + ']: author=@' + (t.author || 'unknown') + ' isOriginal=' + t.isOriginal + ' isCurrent=' + t.isCurrent + ' text="' + preview + '"');
        });
      }

      if (DEBUG_THREAD_CONTEXT) {
        console.log('[TweetReplyAI] ✅ Thread context extracted:', {
          isReply: result.isReply,
          originalTweetLength: result.originalTweet?.length || 0,
          threadLength: result.threadLength,
          currentIndex: result.currentTweetIndex
        });
        if (result.isReply && result.originalTweet) {
          console.log('[TweetReplyAI] 📋 ORIGINAL TWEET & THREAD CHAIN:');
          console.log('[TweetReplyAI] ┌─────────────────────────────────────────────────────────┐');
          console.log('[TweetReplyAI] │ ORIGINAL TWEET:', result.originalTweetAuthor ? `@${result.originalTweetAuthor}` : 'unknown author');
          console.log('[TweetReplyAI] │', result.originalTweet);
          console.log('[TweetReplyAI] ├─────────────────────────────────────────────────────────┤');
          console.log('[TweetReplyAI] │ FULL THREAD CHAIN (' + result.threadLength + ' tweets):');
          result.threadChain.forEach((tweet, idx) => {
            const marker = tweet.isOriginal ? '🔵 ORIGINAL' : tweet.isCurrent ? '🟢 CURRENT (replying to)' : `⚪ Reply ${idx}`;
            const author = tweet.author !== 'unknown' ? `@${tweet.author}` : 'unknown';
            console.log('[TweetReplyAI] │ [' + marker + '] ' + author + ':');
            console.log('[TweetReplyAI] │   "' + tweet.text.substring(0, 100) + (tweet.text.length > 100 ? '...' : '') + '"');
          });
          console.log('[TweetReplyAI] └─────────────────────────────────────────────────────────┘');
        }
      }

      return result;
    } catch (error) {
      console.error('[TweetReplyAI] ❌ Failed to extract thread context:', error);
      // Fallback to current tweet only
      const currentTweetText = this.extractTweetText();
      return {
        isReply: false,
        originalTweet: null,
        originalTweetAuthor: null,
        threadChain: currentTweetText ? [{
          text: currentTweetText,
          author: this.extractAuthorInfo()?.username || 'unknown',
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
      // Method 1: Look for "Replying to @username" text (OPTIMIZED: Scope to composer area)
      // FIX: Instead of querying all spans on page, scope to composer container for better performance
      const composerContainer = document.querySelector('[data-testid^="tweetTextarea_"]')?.closest('div[role="dialog"], div[data-testid="cellInnerDiv"]') || document;
      const replyIndicators = composerContainer.querySelectorAll('span[dir="ltr"], span[dir="auto"]');
      for (const span of replyIndicators) {
        const text = span.textContent?.trim() || '';
        if (/^replying to @/i.test(text)) {
          return true;
        }
      }

      // Method 2: Look for reply button or reply indicators near composer
      const composers = document.querySelectorAll('[data-testid^="tweetTextarea_"], [contenteditable="true"]');
      for (const composer of composers) {
        // Check if composer is in a reply context
        let parent = composer.parentElement;
        for (let i = 0; i < 10 && parent; i++) {
          // Look for reply indicators in parent tree
          if (parent.querySelector('[data-testid="reply"], [aria-label*="reply" i]')) {
            return true;
          }
          // Look for "Replying to" text
          if (parent.textContent && /replying to/i.test(parent.textContent)) {
            return true;
          }
          parent = parent.parentElement;
        }
      }

      // Method 3: Check if there are multiple tweets in a thread structure
      const threadContainer = this.findThreadContainer();
      if (threadContainer) {
        const tweets = threadContainer.querySelectorAll('article[data-testid="tweet"]');
        return tweets.length > 1;
      }

      return false;
    } catch (error) {
      console.warn('[TweetReplyAI] Error detecting reply context:', error);
      return false;
    }
  }

  /**
   * Find the thread container that holds multiple tweets
   */
  findThreadContainer() {
    try {
      // Method 1: Look for thread container with multiple tweets
      const allTweets = document.querySelectorAll('article[data-testid="tweet"]');
      if (allTweets.length < 2) {
        return null;
      }

      // Find common ancestor that contains multiple tweets
      let commonAncestor = allTweets[0].parentElement;
      for (let i = 0; i < 10 && commonAncestor; i++) {
        const tweetsInContainer = commonAncestor.querySelectorAll('article[data-testid="tweet"]');
        if (tweetsInContainer.length >= 2) {
          // Check if this looks like a thread (tweets are in order)
          return commonAncestor;
        }
        commonAncestor = commonAncestor.parentElement;
      }

      // Method 2: Look for specific thread containers
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

      // Method 3: Look for "Show this thread" or thread indicators
      const threadIndicators = document.querySelectorAll('span, div');
      for (const indicator of threadIndicators) {
        const text = indicator.textContent?.trim() || '';
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
      console.warn('[TweetReplyAI] Error finding thread container:', error);
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
        // Extract tweet text
        const tweetTextEl = tweet.querySelector('[data-testid="tweetText"]');
        if (!tweetTextEl) continue;

        const text = extractTweetPlainText(tweetTextEl);
        if (!text || text.length < 10) continue;

        // Extract author @handle from the tweet
        let author = 'unknown';
        const userNameEl = tweet.querySelector('[data-testid="User-Name"]');

        // Strategy A: extract @handle from User-Name textContent via regex
        if (userNameEl) {
          const fullText = userNameEl.textContent?.trim() || '';
          const handleMatch = fullText.match(/@([A-Za-z0-9_]+)/);
          if (handleMatch) {
            author = handleMatch[1];
          }
        }

        // Strategy B: extract handle from profile link href inside User-Name
        if (author === 'unknown' && userNameEl) {
          const profileLink = userNameEl.querySelector('a[href]');
          if (profileLink) {
            const href = profileLink.getAttribute('href') || '';
            const hrefMatch = href.match(/^\/([A-Za-z0-9_]+)$/);
            if (hrefMatch) {
              author = hrefMatch[1];
            }
          }
        }

        // Strategy C: scan profile-path hrefs in the article (last resort)
        if (author === 'unknown') {
          const links = tweet.querySelectorAll('a[href]');
          const reservedPaths = new Set(['status', 'search', 'intent', 'i', 'home', 'hashtag', 'compose', 'settings', 'explore', 'notifications', 'messages']);
          for (const link of links) {
            const href = link.getAttribute('href') || '';
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
      console.warn('[TweetReplyAI] Error extracting tweets from container:', error);
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

    // Try exact match first
    for (let i = 0; i < threadTweets.length; i++) {
      if (threadTweets[i].text === currentTweetText) {
        return i;
      }
    }

    // Try fuzzy match (first 50 chars) for cases where text might be slightly modified
    const currentPrefix = currentTweetText.substring(0, 50).toLowerCase();
    for (let i = 0; i < threadTweets.length; i++) {
      const tweetPrefix = threadTweets[i].text.substring(0, 50).toLowerCase();
      if (tweetPrefix === currentPrefix) {
        return i;
      }
    }

    // FIX: Return -1 instead of defaulting, let caller decide fallback strategy
    // This is safer as the caller has more context about what fallback makes sense
    return -1;
  }

  extractTweetMetadata() {
    try {
      const hasMedia = !!document.querySelector('[data-testid="tweetPhoto"], [data-testid="videoPlayer"]');
      const hasPoll = !!document.querySelector('[data-testid="poll"]');
      
      // Get timestamp
      const timeElement = document.querySelector('time');
      const timestamp = timeElement ? timeElement.getAttribute('datetime') : null;

      return {
        has_media: hasMedia,
        has_poll: hasPoll,
        timestamp: timestamp
      };
    } catch (error) {
      console.error('Failed to extract tweet metadata:', error);
      return null;
    }
  }

  // Enhanced text insertion method based on inject.js proven approach
  // Handles multiple Twitter input types with comprehensive fallbacks
  async insertReplyIntoComposer(composer, replyData) {
    try {
      console.log('[TweetReplyAI] 🚀 Starting Twitter text insertion method');
      
      if (!composer || !replyData) {
        console.log('[TweetReplyAI] ❌ Invalid parameters');
        return;
      }

      const replyText = typeof replyData === 'string' ? replyData : replyData.reply;
      const qualityScore = typeof replyData === 'object' ? replyData.qualityScore : null;

      if (!replyText) {
        return;
      }

      // Clean the text (remove HTML tags and strip prefixes)
      const cleanText = this.stripReplyPrefix(replyText.replace(/<[^>]*>/g, ""));

      // Strategy 1: Twitter Method (PRIMARY METHOD)
      if (composer.contentEditable === 'true' ||
          composer.getAttribute('data-testid')?.startsWith('tweetTextarea_') ||
          composer.getAttribute('role') === 'textbox') {

        try {
          const toolbar = composer.closest('[data-testid="toolBar"]') || composer;
          await this.insertTextTwitterMethod(composer, toolbar, cleanText);
          return;
        } catch (error) {
          console.warn('[TweetReplyAI] Twitter method failed:', error);
        }
      }

      // Strategy 2: Fallback to inject.js multi-strategy approach

      // Strategy 2a: Handle Quill editor
      if (composer.classList && composer.classList.contains("ql-editor")) {
        try {
          composer.innerHTML = "";
          cleanText.split("\n").forEach(line => {
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
          
          composer.dispatchEvent(new Event("input", {bubbles: true}));
          return;
        } catch (error) {
          console.warn('[TweetReplyAI] Quill editor method failed:', error);
        }
      }

      // Strategy 2b: Handle Twitter Draft.js editor
      if (composer.getAttribute("data-testid") === "dmComposerTextInput" ||
          composer.classList.contains("public-DraftEditor-content") ||
          composer.classList.contains("DraftEditor-editorContainer")) {
        
        // Try execCommand first
        try {
          document.execCommand("insertText", false, cleanText);
          return;
        } catch (error) {
          console.warn('[TweetReplyAI] execCommand failed:', error);
        }
        
        // Fallback: Direct DOM manipulation
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
          console.warn('[TweetReplyAI] Draft.js DOM manipulation failed:', error);
        }
        
        // Final fallback: Input events
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
          console.warn('[TweetReplyAI] Draft.js input events failed:', error);
        }
      }

      // Strategy 2c: Handle regular textarea
      if (composer.tagName === 'TEXTAREA') {
        composer.value = cleanText;
        composer.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      // Strategy 2d: Handle regular contentEditable (fallback)
      if (composer.contentEditable === 'true') {
        
        // Try to find existing text spans
        const dataTextSpan = composer.querySelector('[data-text="true"]');
        const targetElement = dataTextSpan ? dataTextSpan.parentElement : composer;
        
        // Click composer to ensure focus
        composer.click();
        await this.sleep(20);
        
        const span = document.createElement('span');
        span.dataset.text = 'true';
        span.textContent = cleanText;
        if (typeof targetElement.replaceChildren === 'function') {
          targetElement.replaceChildren(span);
        } else {
          while (targetElement.firstChild) {
            targetElement.removeChild(targetElement.firstChild);
          }
          targetElement.appendChild(span);
        }
        
        // Dispatch input event
        targetElement.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          cancelable: true
        }));
        return;
      }

      // Strategy 2e: Look for nested input elements
      const nestedInput = composer.querySelector('textarea, [contenteditable="true"]');
      if (nestedInput) {
        await this.insertReplyIntoComposer(nestedInput, replyData);
        return;
      }

      // Strategy 2f: Direct value/textContent assignment
      if (composer.value !== undefined) {
        composer.value = cleanText;
        composer.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (composer.textContent !== undefined) {
        composer.textContent = cleanText;
        composer.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Ensure focus
      composer.focus();

      if (typeof qualityScore === 'number') {
        this.showQualityBadge(composer, qualityScore);
      }
      
    } catch (error) {
      console.error('[TweetReplyAI] ❌ Error during text insertion:', error);
    }
  }













  showQualityBadge(composer, score) {
    try {
      const numericScore = typeof score === 'number' ? score : Number(score);
      if (Number.isNaN(numericScore)) {
        return;
      }

      // Safety check
      if (!composer || !composer.parentElement) {
        console.warn('[TweetReplyAI] Cannot show quality badge: composer or parent not found');
        return;
      }

      // Remove existing badge
      const existingBadge = composer.parentElement.querySelector('.tweetreply-quality-badge');
      if (existingBadge) {
        existingBadge.remove();
      }

      const badge = document.createElement('div');
      badge.className = 'tweetreply-quality-badge';
      const label = document.createElement('span');
      label.className = 'quality-label';
      label.textContent = 'Quality:';

      const scoreEl = document.createElement('span');
      scoreEl.className = `quality-score quality-${this.getQualityClass(numericScore)}`;
      scoreEl.textContent = String(numericScore);

      badge.appendChild(label);
      badge.appendChild(scoreEl);

      const parent = composer.parentElement;
      if (parent) {
        parent.insertBefore(badge, composer.nextSibling);
      }
    } catch (error) {
      console.error('[TweetReplyAI] Error showing quality badge:', error);
    }
  }

  getQualityClass(score) {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  }

  updateAllButtonStates() {
    document.querySelectorAll('.tweetreply-suggest-btn, .tweetreply-improve-btn').forEach(button => {
      this.updateButtonState(button);
    });
  }

  showMessage(composer, message, type = 'info') {
    // Remove existing messages
    const existingMessage = composer.parentElement?.querySelector('.tweetreply-message');
    if (existingMessage) {
      existingMessage.remove();
    }

    // Create message element
    const messageEl = document.createElement('div');
    messageEl.className = `tweetreply-message tweetreply-message--${type}`;
    messageEl.textContent = message;

    // Insert after composer
    const parent = composer.parentElement;
    if (parent) {
      parent.insertBefore(messageEl, composer.nextSibling);
    }

    // Auto-hide after 3s with a slideOut exit animation so the toolbar below
    // doesn't snap back. Fallback timeout removes the node if animationend
    // never fires (e.g. element detached before animation runs).
    setTimeout(() => {
      if (!messageEl.isConnected) return;
      let removed = false;
      const finalize = () => {
        if (removed) return;
        removed = true;
        messageEl.remove();
      };
      messageEl.addEventListener('animationend', finalize, { once: true });
      messageEl.classList.add('tweetreply-message--leaving');
      setTimeout(finalize, 400);
    }, 3000);
  }

  formatTimeDistance(date) {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'soon';
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
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
    // Tear down the Reuse modal first so it doesn't outlive the injector.
    if (this._reuseModal) {
      try { this._reuseModal.close(); } catch {}
      this._reuseModal = null;
    }
    this.injectedReuseButtons = new WeakSet();

    // Disconnect observers
    if (this.mainObserver) {
      this.mainObserver.disconnect();
      this.mainObserver = null;
    }
    // Clear count update timeout
    if (this.countUpdateTimeout) {
      clearTimeout(this.countUpdateTimeout);
      this.countUpdateTimeout = null;
    }
    
    // Remove event listeners
    if (this.autoLikeClickHandler) {
      document.removeEventListener('click', this.autoLikeClickHandler, true);
      this.autoLikeClickHandler = null;
    }
    
    // Clear intervals
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
    
    // Clear timeouts
    if (this.mainObserverDebounceTimer) {
      clearTimeout(this.mainObserverDebounceTimer);
      this.mainObserverDebounceTimer = null;
    }
    
    if (this.followStatusMessageHandler) {
      window.removeEventListener('message', this.followStatusMessageHandler);
      this.followStatusMessageHandler = null;
    }
    if (this.followBadgeRefreshTimer) {
      clearTimeout(this.followBadgeRefreshTimer);
      this.followBadgeRefreshTimer = null;
    }
    // Remove beforeunload listener
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
    
    // Remove storage listener
    if (this.storageChangeHandler) {
      chrome.storage.onChanged.removeListener(this.storageChangeHandler);
      this.storageChangeHandler = null;
    }

    // Clear flags
    this.countDisplayInitialized = false;
    
    // Remove global reference
    delete window.__tweetReplyInjector;
  }
}

// Initialize the injector (with SPA guard to prevent multiple instances)
if (!window.__tweetReplyInjector) {
new TwitterReplyInjector();
}
