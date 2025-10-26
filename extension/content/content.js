import { AuthManager } from '../utils/auth.js';
import { ApiClient } from '../utils/api.js';

class TwitterReplyInjector {
  constructor() {
    this.authManager = new AuthManager();
    this.apiClient = new ApiClient();
    this.isAuthenticated = false;
    this.usageData = null;
    this.injectedButtons = new Set();
    this.injectedContainers = new Set(); // Track injected container IDs
    
    this.initialize();
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

  async initialize() {
    // Check authentication status
    this.isAuthenticated = await this.authManager.isAuthenticated();
    
    if (this.isAuthenticated) {
      await this.loadUsageData();
    }
    
    // Start observing for reply composers
    this.startObserving();
    
    // Listen for messages from popup and background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'suggestReply') {
        this.handleSuggestReplyFromPopup();
      } else if (message.action === 'authUpdated') {
        // Refresh auth state when background detects login
        this.refreshAuthState();
      }
    });
    
    // Listen for storage changes (auth state updates)
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.token) {
        this.refreshAuthState();
      }
    });
    
    // Refresh usage data periodically
    setInterval(() => {
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
    // Debounced observer to reduce redundant checks
    let debounceTimer = null;
    const addedNodes = new Set();
    
    const observer = new MutationObserver((mutations) => {
      clearTimeout(debounceTimer);
      
      // Collect all added nodes
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            addedNodes.add(node);
          }
        });
      });
      
      // Debounce: Wait 100ms for DOM to settle before processing
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
      const button = this.createSuggestButton(composer, containerId);
      this.insertButtonInToolbar(toolbar, button);
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

  createSuggestButton(composer, containerId) {
    const container = document.createElement('div');
    container.className = 'tweetreply-button-container';
    container.dataset.containerId = containerId;
    
    // Model dropdown
    const modelSelect = this.createModelSelect();
    container.appendChild(modelSelect);
    
    // Prompt dropdown
    const promptSelect = this.createPromptSelect();
    container.appendChild(promptSelect);
    
    // Suggest button
    const button = document.createElement('button');
    button.className = 'tweetreply-suggest-btn';
    button.dataset.authPending = 'true'; // Mark as pending initialization

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
        console.log('[TweetReply] Retrying button initialization...');
        delete button.dataset.loadError;
        button.dataset.authPending = 'true';
        this.updateButtonState(button); // Show loading
        await this.updateButtonStateAsync(button); // Retry
        return;
      }
      
      // Normal suggest reply flow
      // CRITICAL FIX: Find the actual contenteditable element inside the container
      const actualComposer = composer.querySelector('[contenteditable="true"]') || 
                             composer.querySelector('.public-DraftEditor-content') ||
                             composer;

      console.log('[TweetReply] Button click - Composer container:', composer.getAttribute('data-testid'));
      console.log('[TweetReply] Button click - Actual composer:', actualComposer.contentEditable, actualComposer.className);

      this.handleSuggestReply(actualComposer, button, {
        modelKey: modelSelect.value,
        promptVariation: promptSelect.value
      });
    });

    container.appendChild(button);
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
    }).catch(error => {
      console.error('Failed to load models:', error);
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
    }).catch(error => {
      console.error('Failed to load prompts:', error);
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

    // Active state
    button.disabled = false;
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
        <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z"/>
      </svg>
      <span>Suggest reply</span>
    `;
    button.title = 'Generate an AI reply suggestion';
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

      const response = await this.apiClient.generateReply({
        tweet_text: tweetText,
        tweet_id: tweetId, // Now guaranteed to be non-null
        model_key: options.modelKey,
        prompt_variation: options.promptVariation,
        author_info: authorInfo, // Now guaranteed to have follower_count as number
        conversation_context: conversationContext,
        tweet_metadata: tweetMetadata
      });

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

      const username = authorElement.textContent?.trim() || 'unknown';
      const verifiedIcon = authorElement.querySelector('[data-testid="icon-verified"]');
      const isVerified = !!verifiedIcon;

      // Try to get follower count - use 0 as fallback
      let followerCount = 0;
      
      // Method 1: From profile page bio
      const bioElement = document.querySelector('[data-testid="UserDescription"]');
      if (bioElement) {
        const followerMatch = bioElement.textContent?.match(/(\d+(?:\.\d+)?[KMB]?)\s*followers?/i);
        if (followerMatch) {
          followerCount = this.parseFollowerCount(followerMatch[1]);
          console.log('[TweetReply] Follower count extracted from bio:', followerCount);
        }
      }
      
      // Method 2: From hover card (if visible)
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

      console.log('[TweetReply] Author info extracted:', { username, verified: isVerified, follower_count: followerCount });

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
      console.log('[TweetReply] 🚀 Starting enhanced text insertion (inject.js method)');
      
      if (!composer || !replyData) {
        console.log('[TweetReply] ❌ Invalid parameters');
        return;
      }
      
      const replyText = typeof replyData === 'string' ? replyData : replyData.reply;
      const qualityScore = typeof replyData === 'object' ? replyData.qualityScore : null;
      
      if (!replyText) {
        console.log('[TweetReply] ❌ No reply text to insert');
        return;
      }

      // Clean the text (remove HTML tags and strip prefixes)
      const cleanText = this.stripReplyPrefix(replyText.replace(/<[^>]*>/g, ""));
      console.log('[TweetReply] Clean text:', cleanText);

      // Focus the composer first
      composer.focus();

      // Strategy 0: Quora AI Method for Twitter (HIGHEST PRIORITY)
      // This should execute first for Twitter's tweetTextarea composers
      if (composer.contentEditable === 'true') {
        console.log('[TweetReply] 📝 Using Quora AI Twitter method (Priority)');
        
        try {
          // Step 1: Find [data-text="true"] span's parent (Twitter's Draft.js structure)
          // The structure is: contentEditable DIV > DIV > [multiple nested divs] > SPAN[data-text]
          // We need to find the closest editable ancestor, not just immediate parent
          const dataTextSpan = composer.querySelector('[data-text="true"]');
          
          // Find the actual editable container by going up from the data-text span
          let targetElement = composer;
          if (dataTextSpan) {
            // Go up the tree to find a DIV that's a direct child of the contentEditable
            let parent = dataTextSpan.parentElement;
            while (parent && parent !== composer) {
              // Look for the div that contains all the Draft.js content
              // It's usually the first div child of the contentEditable
              if (parent.parentElement === composer || 
                  (parent.tagName === 'DIV' && parent.getAttribute('data-contents') === 'true')) {
                targetElement = parent;
                break;
              }
              parent = parent.parentElement;
            }
          }
          
          console.log('[TweetReply] Found data-text span:', !!dataTextSpan);
          console.log('[TweetReply] Target element:', targetElement.tagName, targetElement.className);
          console.log('[TweetReply] Target element has data-contents:', targetElement.getAttribute('data-contents'));
          
          // Step 2: Click composer to ensure focus and Draft.js initialization
          composer.click();
          await this.sleep(20);
          
          // Step 3: Log current state before replacement
          console.log('[TweetReply] Current content before replace:', targetElement.textContent);
          console.log('[TweetReply] Current innerHTML before replace:', targetElement.innerHTML.substring(0, 100));
          
          // Step 4: Use execCommand to properly clear and insert text
          // This triggers all Draft.js internal events correctly
          
          // First, select all content in the composer
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(composer);
          selection.removeAllRanges();
          selection.addRange(range);
          
          console.log('[TweetReply] Current content before replace:', composer.textContent);
          
          // Delete all selected content (clears the composer)
          document.execCommand('delete', false, null);
          await this.sleep(10);
          
          // Insert the new text using execCommand (maintains Draft.js state)
          document.execCommand('insertText', false, cleanText);
          
          console.log('[TweetReply] New content after replace:', composer.textContent);
          console.log('[TweetReply] Content length:', composer.textContent.length);
          
          // Step 5: Ensure cursor is at the end
          await this.sleep(20);
          const endRange = document.createRange();
          const textNode = composer.querySelector('[data-text="true"]');
          
          if (textNode && textNode.firstChild) {
            endRange.setStart(textNode.firstChild, textNode.firstChild.length);
            endRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(endRange);
          }
          
          // Step 6: Final focus
          composer.focus();
          
          console.log('[TweetReply] ✅ Quora AI method completed');
          
          // Show quality badge
          if (typeof qualityScore === 'number') {
            this.showQualityBadge(composer, qualityScore);
          }
          
          return; // Success - exit early
        } catch (error) {
          console.warn('[TweetReply] Quora AI method failed, falling back:', error);
          // Fall through to other strategies
        }
      }

      // Strategy 1: Handle Quill editor
      if (composer.classList && composer.classList.contains("ql-editor")) {
        console.log('[TweetReply] 📝 Using Quill editor method');
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
          console.log('[TweetReply] ✅ Quill editor text inserted');
          return;
        } catch (error) {
          console.warn('[TweetReply] Quill editor method failed:', error);
        }
      }

      // Strategy 2: Handle Twitter Draft.js editor (DMs and other Draft.js editors)
      // Note: tweetTextarea_0/1/2 should have been handled by Strategy 0
      if (composer.getAttribute("data-testid") === "dmComposerTextInput" ||
          composer.classList.contains("public-DraftEditor-content") ||
          composer.classList.contains("DraftEditor-editorContainer")) {
        console.log('[TweetReply] 📝 Using Twitter Draft.js method');
        
        //Try execCommand first
        try {
          document.execCommand("insertText", false, cleanText);
          console.log('[TweetReply] ✅ Draft.js execCommand successful');
          return;
        } catch (error) {
          console.warn('[TweetReply] execCommand failed:', error);
        }
        
        //Fallback: Direct DOM manipulation
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
                console.log('[TweetReply] ✅ Draft.js DOM manipulation successful');
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
          console.log('[TweetReply] ✅ Draft.js input events dispatched');
          return;
        } catch (error) {
          console.warn('[TweetReply] Draft.js input events failed:', error);
        }
      }

      // Strategy 3: Handle regular textarea
      if (composer.tagName === 'TEXTAREA') {
        console.log('[TweetReply] 📝 Using TEXTAREA method');
        composer.value = cleanText;
        composer.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('[TweetReply] ✅ Textarea text replaced');
        return;
      }

      // Strategy 4: Handle regular contentEditable (if not already handled by Strategy 0)
      // This is a fallback for non-Twitter contentEditable elements
      if (composer.contentEditable === 'true') {
        console.log('[TweetReply] 📝 Using contentEditable method (fallback)');
        
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
        console.log('[TweetReply] ✅ contentEditable text inserted');
        return;
      }

      // Strategy 5: Look for nested input elements
      console.log('[TweetReply] 🔍 Looking for nested input elements...');
      const nestedInput = composer.querySelector('textarea, [contenteditable="true"]');
      if (nestedInput) {
        await this.insertReplyIntoComposer(nestedInput, replyData);
        return;
      }

      // Strategy 6: Direct value/textContent assignment
      if (composer.value !== undefined) {
        composer.value = cleanText;
        composer.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('[TweetReply] ✅ Direct value assignment successful');
      } else if (composer.textContent !== undefined) {
        composer.textContent = cleanText;
        composer.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('[TweetReply] ✅ Direct textContent assignment successful');
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
    document.querySelectorAll('.tweetreply-suggest-btn').forEach(button => {
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
}

// Initialize the injector
new TwitterReplyInjector();
