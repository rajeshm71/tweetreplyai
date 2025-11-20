import { AuthManager } from '../utils/auth.js';
import { ApiClient } from '../utils/api.js';

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
    console.log('[TweetReply] 🔍 Finding closest text area to button...');
    
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
      console.log('[TweetReply] ✅ Found closest text area:', closestElement.tagName, closestElement.className);
    } else {
      console.warn('[TweetReply] ❌ No text area found');
    }

    return closestElement;
  }

  // Find Twitter text area within an element
  findTwitterTextArea(element) {
    const textArea = element.querySelector('div[data-testid^="tweetTextarea_"][role="textbox"]');
    return textArea || (element.parentElement ? this.findTwitterTextArea(element.parentElement) : null);
  }

  // Insert text using proven Twitter approach
  async insertTextTwitterMethod(textArea, composer, text) {
    composer.click();
    const dataTextSpan = textArea.querySelector('[data-text="true"]');
    const targetElement = dataTextSpan ? dataTextSpan.parentElement : textArea;
    
    if (targetElement) {
      targetElement.innerHTML = `<span data-text="true">${text}</span>`;
      targetElement.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        cancelable: true
      }));
    }
  }

  // Auto-like functionality
  async isAutoLikeEnabled() {
    try {
      const result = await chrome.storage.local.get(['tweetreply_auto_like']);
      // Default to enabled if not set
      return result.tweetreply_auto_like !== false;
    } catch (error) {
      console.warn('[TweetReply] Failed to check auto-like setting:', error);
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

  findLikeButton(tweetArticle) {
    if (!tweetArticle) return null;

    // Strategy 1: data-testid="like" (primary)
    let likeBtn = tweetArticle.querySelector('[data-testid="like"]');
    if (likeBtn) {
      // Check if already liked
      const isLiked = !!tweetArticle.querySelector('[data-testid="unlike"]') ||
                     likeBtn.getAttribute('aria-pressed') === 'true';
      if (isLiked) return null; // Already liked, don't auto-like
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
        if (!isLiked) return btn;
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
        if (!isLiked) return btn;
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
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return true;
    } catch (error) {
      console.warn('[TweetReply] Failed to auto-like:', error);
      
      // Method 2: Try MouseEvent simulation
      try {
        const event = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        likeButton.dispatchEvent(event);
        await new Promise(resolve => setTimeout(resolve, 100));
        return true;
      } catch (e) {
        console.warn('[TweetReply] MouseEvent simulation failed:', e);
        return false;
      }
    }
  }

  setupAutoLikeOnReply() {
    // Don't add if already added (prevent accumulation on re-execution)
    if (this.autoLikeClickHandler) return;
    
    // Use event delegation to catch all Reply button clicks
    this.autoLikeClickHandler = async (e) => {
      try {
        const target = e.target;
        if (!target) return;

        // Check if clicked element is a Reply button
        const isReplyButton = target.matches('[data-testid="reply"]') ||
                             target.closest('[data-testid="reply"]') ||
                             target.matches('button[aria-label*="Reply" i]') ||
                             target.closest('button[aria-label*="Reply" i]') ||
                             target.matches('[role="button"][aria-label*="Reply" i]') ||
                             target.closest('[role="button"][aria-label*="Reply" i]') ||
                             target.matches('[data-testid="tweetButtonInline"]') ||
                             target.closest('[data-testid="tweetButtonInline"]');

        if (!isReplyButton) return;

        // Find the actual Reply button element
        const replyButton = target.closest('[data-testid="reply"]') ||
                           target.closest('button[aria-label*="Reply" i]') ||
                           target.closest('[role="button"][aria-label*="Reply" i]') ||
                           target.closest('[data-testid="tweetButtonInline"]') ||
                           target;

        // Find tweet article
        const tweetArticle = this.findTweetArticle(replyButton);
        if (!tweetArticle) {
          return; // Couldn't find tweet article
        }

        // Track reply in background (non-blocking, fire-and-forget)
        // Don't await - execute in parallel with auto-like so tracking doesn't block auto-like
        // Fire and forget - execute asynchronously without blocking
        this.extractUsernameFromTweet(tweetArticle).then(username => {
          if (username && username !== 'unknown') {
            this.trackReply(username).catch(err => {
              console.warn('[TweetReply] Reply tracking failed:', err);
            });
          }
        }).catch(error => {
          // Silently fail - tracking shouldn't block auto-like
          console.warn('[TweetReply] Failed to extract username for tracking:', error);
        });

        // Execute auto-like asynchronously (don't wait for tracking)
        // Use setTimeout to defer slightly and avoid race conditions with Twitter's handlers
        this.isAutoLikeEnabled().then(autoLikeEnabled => {
          if (autoLikeEnabled) {
            // Small delay to let Twitter process the reply click first
            setTimeout(() => {
              const likeButton = this.findLikeButton(tweetArticle);
              if (likeButton) {
                // Fire and forget - don't await
                this.performAutoLike(likeButton).catch(err => {
                  console.warn('[TweetReply] Auto-like execution failed:', err);
                });
              }
            }, 50); // Small delay to avoid race conditions
          }
        }).catch(err => {
          console.warn('[TweetReply] Failed to check auto-like setting:', err);
        });
      } catch (error) {
        // Log errors but don't break the event handler
        // Note: If auto-like execution failed, it has already failed, but we prevent unhandled exceptions
        console.error('[TweetReply] Auto-like handler error:', error);
      }
    }; // End of handler function
    
    // Add event listener
    document.addEventListener('click', this.autoLikeClickHandler, true); // Use capture phase to catch before other handlers
  }

  async initialize() {
    // Check authentication status
    this.isAuthenticated = await this.authManager.isAuthenticated();
    
    if (this.isAuthenticated) {
      await this.loadUsageData();
    }
    
    // Start observing for reply composers
    this.startObserving();
    
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
        if (areaName === 'local') {
          // Auth state updates
          if (changes.token) {
        this.refreshAuthState();
      }
          // Reply tracking sync across tabs - update counts when history changes
          if (changes.replyHistory || changes.replyTrackingSettings) {
            this.updateReplyCountsOnTweets();
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
    }, 30000);
  }

  async refreshAuthState() {
    const wasAuthenticated = this.isAuthenticated;
    this.isAuthenticated = await this.authManager.isAuthenticated();
    
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
      console.error('[TweetReply] Failed to load usage data:', error);
      this.usageData = null;
      throw error; // Re-throw so caller can handle
    }
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
        });
        addedNodes.clear();
        
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
              console.error('[TweetReply] Error updating reply counts:', error);
            }
          }, 500);
        }
      }, 100);
    });

    this.mainObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also check existing composers
    this.checkForReplyComposers(document.body);
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
    const composerContainer = composer.closest('[data-testid="tweetComposer"]') || 
                              composer.closest('[role="dialog"]') ||
                              composer.closest('div[data-testid]');
    
    if (!composerContainer) return;

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
      // Insert our controls row ABOVE the native toolbar so emoji/media stay in place
      if (toolbar.parentNode) {
        toolbar.parentNode.insertBefore(controlsRow, toolbar);
      } else {
        // Fallback to previous behavior if no parent (shouldn't happen normally)
        this.insertButtonInToolbar(toolbar, controlsRow);
      }

      // Move the actual Suggest button into the native toolbar, just left of Reply
      try {
        this.ensureSuggestLeftOfReply(toolbar, controlsRow, composerContainer);
      } catch (err) {
        console.warn('[TweetReply] Could not place Suggest button next to Reply:', err);
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
    setTimeout(tryPlace, 150);
  }

  // Ensure Suggest stays left of Reply across focus/typing/renders
  ensureSuggestLeftOfReply(toolbarEl, controlsRow, containerEl) {
    // Initial placement + observer
    if (!this.placeSuggestButtonLeftOfReply(toolbarEl, controlsRow)) {
      this.observePlacement(toolbarEl, controlsRow);
    }

    // Throttled re-placement on user interaction
    let last = 0;
    const throttleMs = 200;
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
    
    // Model dropdown
    const modelSelect = this.createModelSelect();
    container.appendChild(modelSelect);
    
    // Prompt dropdown
    const promptSelect = this.createPromptSelect();
    container.appendChild(promptSelect);
    
    // Create button group container for vertical stacking
    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'tweetreply-button-group';
    buttonGroup.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 6px;
    `;
    
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
      
      // Check if in error state - retry loading
      if (suggestButton.dataset.loadError === 'true') {
        console.log('[TweetReply] Retrying button initialization...');
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

      console.log('[TweetReply] Button click - Composer container:', composer.getAttribute('data-testid'));
      console.log('[TweetReply] Button click - Actual composer:', actualComposer.contentEditable, actualComposer.className);

      this.handleSuggestReply(actualComposer, suggestButton, {
        modelKey: modelSelect.value,
        promptVariation: promptSelect.value
      });
    });

    // Create Improve Reply button
    const improveButton = this.createImproveButton(composer);
    
    // Add both buttons to button group - IMPROVE FIRST so it appears above Suggest Reply
    buttonGroup.appendChild(improveButton);
    buttonGroup.appendChild(suggestButton);
    
    // Add button group to container
    container.appendChild(buttonGroup);
    return container;
  }

  async updateButtonStateAsync(button) {
    try {
      console.log('[TweetReply] Initializing button state...');
      
      // Re-check auth if needed
      if (!this.isAuthenticated) {
        this.isAuthenticated = await this.authManager.isAuthenticated();
        console.log('[TweetReply] Auth status:', this.isAuthenticated);
      }
      
      // Load usage with timeout
      if (this.isAuthenticated && !this.usageData) {
        console.log('[TweetReply] Loading usage data...');
        
        try {
          await Promise.race([
            this.loadUsageData(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout after 10 seconds')), 10000)
            )
          ]);
          
          console.log('[TweetReply] Usage data loaded:', this.usageData);
        } catch (error) {
          console.warn('[TweetReply] Failed to load usage data, using fallback:', error);
          
          // Graceful degradation: assume user has quota, let backend validate
          this.usageData = { 
            used: 0, 
            limit: 999, 
            resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          };
        }
      }
      
      // Success: remove pending flag
      delete button.dataset.authPending;
      delete button.dataset.loadError;
      this.updateButtonState(button);
      
    } catch (error) {
      console.error('[TweetReply] Critical error initializing button:', error);
      
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
      if (models && models.gemini) {
        models.gemini.forEach(model => {
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
        // Move "LLama Scout" (case-insensitive) to top and select it
        const preferred = options.find(o => /llama\s*scout/i.test(o.textContent || ''))
          || options.find(o => /llama/i.test(o.textContent || ''))
          || null;
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
    
    // Default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Default';
    select.appendChild(defaultOption);
    
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
          const option = document.createElement('option');
          option.value = prompt.name;
          option.textContent = prompt.name;
          select.appendChild(option);
        });
      }

      const options = Array.from(select.querySelectorAll('option'));
      if (savedPrompt && options.some(o => (o.value === savedPrompt))) {
        select.value = savedPrompt;
      } else {
        // Move "Direct response" to top and select it
        const preferred = options.find(o => /direct\s*response/i.test(o.textContent || '')) || null;
        if (preferred && preferred !== defaultOption) {
          select.insertBefore(preferred, select.children[1] || null);
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
      
      // Check if in error state - retry loading
      if (button.dataset.loadError === 'true') {
        console.log('[TweetReply] Retrying improve button initialization...');
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

  updateButtonState(button) {
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
      button.disabled = true;
      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z" opacity="0.6"/>
        </svg>
        <span>🔒 Sign in to use</span>
      `;
      button.title = 'Click to sign in to TweetReply';
      button.style.opacity = '0.6';
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

    // Quota exceeded state
    if (this.usageData.used >= this.usageData.limit) {
      button.disabled = true;
      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z" opacity="0.6"/>
        </svg>
        <span>⚠️ Quota exceeded</span>
      `;
      button.title = `Quota exceeded. Resets ${this.formatTimeDistance(new Date(this.usageData.resetAt))}`;
      button.style.opacity = '0.6';
      return;
    }

    // Active state - check if this is an improve button or suggest button
    const isImproveButton = button.classList.contains('tweetreply-improve-btn');
    button.disabled = false;
    
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

  insertButtonInToolbar(toolbar, button) {
    // Try to insert at the beginning of the toolbar
    if (toolbar.firstChild) {
      toolbar.insertBefore(button, toolbar.firstChild);
    } else {
      toolbar.appendChild(button);
    }
  }

  async handleSuggestReply(composer, button, options = {}) {
    if (!this.isAuthenticated) {
      this.showMessage(composer, 'Please sign in to use TweetReply', 'error');
      return;
    }

    if (!this.usageData || this.usageData.used >= this.usageData.limit) {
      this.showMessage(composer, 'Quota exceeded. Upgrade your plan to continue.', 'error');
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
      console.error('[TweetReply] Failed to extract tweet ID');
      this.showMessage(composer, 'Could not identify the tweet. Try refreshing the page.', 'error');
      return;
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
      const conversationContext = this.extractConversationContext();
      const tweetMetadata = this.extractTweetMetadata();

      // Log what we're sending for debugging (safely)
      console.log('[TweetReply] Generating reply with data:', {
        tweet_id: tweetId,
        tweet_text_length: tweetText.length,
        author_info_username: authorInfo?.username || 'unknown',
        model_key: options.modelKey || 'auto',
        prompt_variation: options.promptVariation || 'default'
      });
      console.log('[TweetReply] 🤖 Starting AI-powered tweet analysis (server-side)...');

      const response = await this.apiClient.generateReply({
        tweet_text: tweetText,
        tweet_id: tweetId, // Now guaranteed to be non-null
        model_key: options.modelKey,
        prompt_variation: options.promptVariation,
        author_info: authorInfo, // Now guaranteed to have follower_count as number
        conversation_context: conversationContext,
        tweet_metadata: tweetMetadata
      });

      // Log analysis results if available
      if (response.analysis) {
        console.log('[TweetReply] ✅ Tweet analysis completed:', {
          tone: response.analysis.understanding?.tone,
          sentiment: response.analysis.understanding?.sentiment,
          intention: response.analysis.intention?.intention?.substring(0, 80) + '...'
        });
      } else {
        console.log('[TweetReply] ℹ️ No analysis data in response (using basic context)');
      }

      // Insert the reply into the composer with quality score
      await this.insertReplyIntoComposer(composer, {
        reply: response.reply,
        qualityScore: response.qualityScore
      });
      
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

      // Show success message
      this.showMessage(composer, '✓ Reply inserted', 'success');

      // Update all button states
      this.updateAllButtonStates();

    } catch (error) {
      console.error('Failed to generate reply:', error);
      
      // Parse error message
      let errorMessage = 'Failed to generate reply';
      if (error.message.includes('400')) {
        errorMessage = 'Invalid request. Please try again or refresh the page.';
      } else if (error.message.includes('401')) {
        this.isAuthenticated = false;
        errorMessage = 'Please sign in again';
      } else if (error.message.includes('402')) {
        errorMessage = 'Quota exceeded - upgrade your plan';
      } else if (error.message.includes('Network error')) {
        errorMessage = 'Network error - check your connection';
      } else if (error.message) {
        errorMessage = `Failed to generate reply: ${error.message}`;
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

  async handleImproveReply(composer, button) {
    if (!this.isAuthenticated) {
      this.showMessage(composer, 'Please sign in to use TweetReply', 'error');
      return;
    }

    if (!this.usageData || this.usageData.used >= this.usageData.limit) {
      this.showMessage(composer, 'Quota exceeded. Upgrade your plan to continue.', 'error');
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
      
      console.log('[TweetReply] Improving draft:', {
        draftLength: draftText.length,
        originalTweetLength: originalTweetText.length
      });
      
      // Call API to improve draft
      const response = await this.apiClient.suggestImprovements(draftText, originalTweetText);
      
      console.log('[TweetReply] API response received:', response);
      console.log('[TweetReply] Response keys:', Object.keys(response || {}));
      
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
      
      console.log('[TweetReply] Extracted improved draft:', improvedDraft);
      
      if (!improvedDraft || improvedDraft.trim().length === 0) {
        throw new Error('No improved draft received from API');
      }
      
      // Insert improved text into composer
      await this.insertReplyIntoComposer(composer, improvedDraft);
      
      // Show success message
      this.showMessage(composer, '✓ Reply improved', 'success');
      
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
      console.error('[TweetReply] Failed to improve reply:', error);
      console.error('[TweetReply] Error details:', {
        message: error.message,
        stack: error.stack,
        response: error.response
      });
      
      // Parse error message
      let errorMessage = 'Failed to improve reply';
      if (error.message.includes('400')) {
        errorMessage = 'Invalid request. Please try again or refresh the page.';
      } else if (error.message.includes('401')) {
        this.isAuthenticated = false;
        errorMessage = 'Please sign in again';
      } else if (error.message.includes('402')) {
        errorMessage = 'Quota exceeded - upgrade your plan';
      } else if (error.message.includes('Network error')) {
        errorMessage = 'Network error - check your connection';
      } else if (error.message) {
        errorMessage = `Failed to improve reply: ${error.message}`;
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
    // Enhanced tweet text extraction based on inject.js approach
    console.log('[TweetReply] 🔍 Extracting tweet text...');
    
    // Method 1: Look for tweet text in tweet elements (most reliable)
    const tweetSelectors = [
      '[data-testid="tweet"] [data-testid="tweetText"]',
      '.tweet-text',
      '[lang] span', // Twitter uses lang attribute on tweet text
    ];

    for (const selector of tweetSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const text = element.textContent?.trim();
        if (text && text.length > 10) {
          console.log('[TweetReply] ✅ Tweet text found via selector:', selector);
          return text;
        }
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
        if (text && text.length > 10) {
          console.log('[TweetReply] ✅ Tweet text found via Draft.js spans');
          return text;
        }
      }
    } catch (error) {
      console.warn('[TweetReply] Draft.js span extraction failed:', error);
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
        if (text && text.length > 20 && text.length < 500) {
          console.log('[TweetReply] ✅ Tweet text found via contentEditable');
          return text;
        }
      }
    } catch (error) {
      console.warn('[TweetReply] contentEditable extraction failed:', error);
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
          console.log('[TweetReply] ✅ Tweet text found via Draft.js blocks');
          return text;
        }
      }
    } catch (error) {
      console.warn('[TweetReply] Draft.js block extraction failed:', error);
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
              console.log('[TweetReply] ✅ Tweet text found via parent traversal');
              return text;
            }
          }
          currentElement = currentElement.parentElement;
        }
      }
    } catch (error) {
      console.warn('[TweetReply] Parent traversal extraction failed:', error);
    }

    // Method 6: Fallback to sentence detection from body text
    try {
    const allText = document.body.textContent;
    const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 20);
      if (sentences.length > 0) {
        console.log('[TweetReply] ✅ Tweet text found via sentence detection');
    return sentences[0]?.trim() || null;
      }
    } catch (error) {
      console.warn('[TweetReply] Sentence detection failed:', error);
    }

    console.warn('[TweetReply] ❌ Failed to extract tweet text from any method');
    return null;
  }

  extractTweetId() {
    // Method 1: From URL (works on /status/123 pages)
    const urlMatch = window.location.href.match(/status\/(\d+)/);
    if (urlMatch) {
      console.log('[TweetReply] Tweet ID extracted from URL:', urlMatch[1]);
      return urlMatch[1];
    }
    
    // Method 2: From tweet element data attributes
    const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
    for (const tweet of tweetElements) {
      // Check for data-tweet-id attribute
      const tweetId = tweet.getAttribute('data-tweet-id');
      if (tweetId) {
        console.log('[TweetReply] Tweet ID extracted from data-tweet-id:', tweetId);
        return tweetId;
      }
      
      // Check aria-labelledby (format: "id__tweet-text-123456")
      const ariaLabel = tweet.getAttribute('aria-labelledby');
      if (ariaLabel) {
        const match = ariaLabel.match(/(\d{15,})/); // Tweet IDs are 15+ digits
        if (match) {
          console.log('[TweetReply] Tweet ID extracted from aria-labelledby:', match[1]);
          return match[1];
        }
      }
      
      // Check for links to the tweet
      const tweetLink = tweet.querySelector('a[href*="/status/"]');
      if (tweetLink) {
        const linkMatch = tweetLink.href.match(/status\/(\d+)/);
        if (linkMatch) {
          console.log('[TweetReply] Tweet ID extracted from tweet link:', linkMatch[1]);
          return linkMatch[1];
        }
      }
    }
    
    // Method 3: From any status link on the page
    const statusLinks = document.querySelectorAll('a[href*="/status/"]');
    for (const link of statusLinks) {
      const linkMatch = link.href.match(/status\/(\d+)/);
      if (linkMatch) {
        console.log('[TweetReply] Tweet ID extracted from status link:', linkMatch[1]);
        return linkMatch[1];
      }
    }
    
    console.warn('[TweetReply] Failed to extract tweet ID from any source');
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
        console.log('[TweetReply] No author element found, using defaults');
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
          console.log('[TweetReply] Follower count extracted from tweet article:', followerCount);
        }
      }
      
      // Method 2: From profile page bio (fallback)
      if (followerCount === 0) {
      const bioElement = document.querySelector('[data-testid="UserDescription"]');
      if (bioElement) {
        const followerMatch = bioElement.textContent?.match(/(\d+(?:\.\d+)?[KMB]?)\s*followers?/i);
        if (followerMatch) {
          followerCount = this.parseFollowerCount(followerMatch[1]);
          console.log('[TweetReply] Follower count extracted from bio:', followerCount);
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
            console.log('[TweetReply] Follower count extracted from hover card:', followerCount);
          }
        }
      }

      console.log('[TweetReply] Author info extracted:', { 
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
      console.error('[TweetReply] Failed to extract author info:', error);
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
        trackingPeriodDays: 7
      };
      
      // Validate and clamp values
      return {
        trackingPeriodDays: Math.max(1, Math.min(30, parseInt(settings.trackingPeriodDays) || 7))
      };
    } catch (error) {
      console.warn('[TweetReply] Failed to get tracking settings:', error);
      return { trackingPeriodDays: 7 };
    }
  }

  // Set tracking settings
  async setTrackingSettings(settings) {
    try {
      await chrome.storage.local.set({ replyTrackingSettings: settings });
    } catch (error) {
      console.error('[TweetReply] Failed to save tracking settings:', error);
    }
  }

  // Get reply history
  async getReplyHistory() {
    try {
      const result = await chrome.storage.local.get(['replyHistory']);
      return result.replyHistory || {};
    } catch (error) {
      console.warn('[TweetReply] Failed to get reply history:', error);
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
      const cutoff = now - (settings.trackingPeriodDays * 24 * 60 * 60 * 1000);
      history[username].replies = history[username].replies.filter(
        r => r.timestamp > cutoff
      );
      
      // Save updated history
      await chrome.storage.local.set({ replyHistory: history });
      
      // Update reply counts display
      await this.updateReplyCountsOnTweets();
    } catch (error) {
      console.error('[TweetReply] Error tracking reply:', error);
    } finally {
      // Unlock after completion
      delete this[lockKey];
    }
  }


  // Cleanup expired history
  async cleanupExpiredHistory() {
    const history = await this.getReplyHistory();
    const settings = await this.getTrackingSettings();
    const cutoff = Date.now() - (settings.trackingPeriodDays * 24 * 60 * 60 * 1000);
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
      console.warn('[TweetReply] Failed to extract username from tweet:', error);
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
      const cutoff = now - (days * 24 * 60 * 60 * 1000);
      
      const count = userData.replies.filter(r => r.timestamp > cutoff).length;
      return count;
    } catch (error) {
      console.error('[TweetReply] Error getting reply count:', error);
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
        console.warn('[TweetReply] Could not insert reply count indicator:', e);
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
      console.error('[TweetReply] Error updating reply counts:', error);
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
    }, 60000); // Every minute
  }

  extractConversationContext() {
    try {
      const tweets = document.querySelectorAll('[data-testid="tweet"]');
      const parentTweets = [];
      
      // Get up to 3 parent tweets for context
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
      console.error('Failed to extract conversation context:', error);
      return null;
    }
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
      console.log('[TweetReply] 🚀 Starting Twitter text insertion method');
      
      if (!composer || !replyData) {
        console.log('[TweetReply] ❌ Invalid parameters');
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
          // Find the actual Twitter toolbar
          const toolbar = document.querySelector('[data-testid="toolBar"]');
          
          if (toolbar) {
            const textArea = this.findTwitterTextArea(toolbar);
            if (textArea) {
              await this.insertTextTwitterMethod(textArea, toolbar, cleanText);
          return;
            }
          }
        } catch (error) {
          console.warn('[TweetReply] Twitter method failed:', error);
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
          console.warn('[TweetReply] Quill editor method failed:', error);
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
          console.warn('[TweetReply] execCommand failed:', error);
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
          console.warn('[TweetReply] Draft.js DOM manipulation failed:', error);
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
          console.warn('[TweetReply] Draft.js input events failed:', error);
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
        
        // Replace innerHTML directly
        targetElement.innerHTML = `<span data-text="true">${cleanText}</span>`;
        
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
      console.error('[TweetReply] ❌ Error during text insertion:', error);
    }
  }













  showQualityBadge(composer, score) {
    try {
      // Safety check
      if (!composer || !composer.parentElement) {
        console.warn('[TweetReply] Cannot show quality badge: composer or parent not found');
        return;
      }

      // Remove existing badge
      const existingBadge = composer.parentElement.querySelector('.tweetreply-quality-badge');
      if (existingBadge) {
        existingBadge.remove();
      }

      const badge = document.createElement('div');
      badge.className = 'tweetreply-quality-badge';
      badge.innerHTML = `
        <span class="quality-label">Quality:</span>
        <span class="quality-score quality-${this.getQualityClass(score)}">${score}</span>
      `;

      const parent = composer.parentElement;
      if (parent) {
        parent.insertBefore(badge, composer.nextSibling);
      }
    } catch (error) {
      console.error('[TweetReply] Error showing quality badge:', error);
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

    // Auto-hide after 3 seconds
    setTimeout(() => {
      messageEl?.remove();
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
    
    // Clear timeouts
    if (this.mainObserverDebounceTimer) {
      clearTimeout(this.mainObserverDebounceTimer);
      this.mainObserverDebounceTimer = null;
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
