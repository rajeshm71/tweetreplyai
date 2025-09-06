import { AuthManager } from '../utils/auth.js';
import { ApiClient } from '../utils/api.js';

class TwitterReplyInjector {
  constructor() {
    this.authManager = new AuthManager();
    this.apiClient = new ApiClient();
    this.isAuthenticated = false;
    this.usageData = null;
    this.injectedButtons = new Set();
    
    this.initialize();
  }

  async initialize() {
    // Check authentication status
    this.isAuthenticated = await this.authManager.isAuthenticated();
    
    if (this.isAuthenticated) {
      await this.loadUsageData();
    }
    
    // Start observing for reply composers
    this.startObserving();
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'suggestReply') {
        this.handleSuggestReplyFromPopup();
      }
    });
    
    // Refresh usage data periodically
    setInterval(() => {
      if (this.isAuthenticated) {
        this.loadUsageData();
      }
    }, 30000);
  }

  async loadUsageData() {
    try {
      this.usageData = await this.apiClient.getUsage();
    } catch (error) {
      console.error('Failed to load usage data:', error);
      this.usageData = null;
    }
  }

  startObserving() {
    // Observer for new reply composers
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

    // Also check existing composers
    this.checkForReplyComposers(document.body);
  }

  checkForReplyComposers(container) {
    // Twitter/X reply composer selectors (may need updates as platform evolves)
    const composerSelectors = [
      '[data-testid="tweetTextarea_0"]',
      '[data-testid="tweetTextarea_1"]',
      '[aria-label*="reply" i][contenteditable="true"]',
      '[aria-label*="post" i][contenteditable="true"]',
      '.public-DraftEditor-content',
      '.DraftEditor-editorContainer',
    ];

    composerSelectors.forEach(selector => {
      const composers = container.querySelectorAll ? container.querySelectorAll(selector) : [];
      composers.forEach(composer => this.injectSuggestButton(composer));
    });
  }

  injectSuggestButton(composer) {
    if (!composer || this.injectedButtons.has(composer)) return;

    // Find the composer's toolbar area
    let toolbar = null;
    
    // Try different approaches to find the toolbar
    const parent = composer.closest('[data-testid="tweetComposer"]') || 
                  composer.closest('.tweet-composer') || 
                  composer.closest('[role="dialog"]') ||
                  composer.parentElement;

    if (parent) {
      // Look for existing toolbars
      toolbar = parent.querySelector('[data-testid="toolBar"]') ||
                parent.querySelector('.toolbar') ||
                parent.querySelector('[role="toolbar"]');
      
      // If no toolbar found, look for button containers
      if (!toolbar) {
        const buttonContainers = parent.querySelectorAll('div');
        for (const container of buttonContainers) {
          if (container.querySelectorAll('button').length >= 2) {
            toolbar = container;
            break;
          }
        }
      }
    }

    if (!toolbar) {
      // Create our own toolbar if none exists
      toolbar = this.createToolbar(composer);
    }

    if (toolbar) {
      const button = this.createSuggestButton(composer);
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

  createSuggestButton(composer) {
    const button = document.createElement('button');
    button.className = 'tweetreply-suggest-btn';
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
        <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z"/>
      </svg>
      <span>Suggest reply</span>
    `;

    // Update button state based on authentication and usage
    this.updateButtonState(button);

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleSuggestReply(composer, button);
    });

    return button;
  }

  updateButtonState(button) {
    const canUse = this.isAuthenticated && 
                   this.usageData && 
                   this.usageData.used < this.usageData.limit;

    button.disabled = !canUse;
    
    if (!this.isAuthenticated) {
      button.title = 'Sign in to use TweetReply';
    } else if (this.usageData && this.usageData.used >= this.usageData.limit) {
      button.title = `Quota exceeded. Resets ${this.formatTimeDistance(new Date(this.usageData.resetAt))}`;
    } else {
      button.title = 'Generate an AI reply suggestion';
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

  async handleSuggestReply(composer, button) {
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

    // Show loading state
    button.disabled = true;
    const originalText = button.innerHTML;
    button.innerHTML = `
      <div class="tweetreply-spinner" style="width: 14px; height: 14px; border: 2px solid #1d9bf0; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 4px;"></div>
      <span>Generating...</span>
    `;

    try {
      const response = await this.apiClient.generateReply({
        tweet_text: tweetText,
        tweet_id: this.extractTweetId()
      });

      // Insert the reply into the composer
      this.insertReplyIntoComposer(composer, response.reply);
      
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
      
      if (error.message.includes('401')) {
        this.isAuthenticated = false;
        this.showMessage(composer, 'Please sign in again', 'error');
      } else if (error.message.includes('402')) {
        this.showMessage(composer, 'Quota exceeded', 'error');
      } else {
        this.showMessage(composer, 'Failed to generate reply', 'error');
      }
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
    // Try to find the tweet being replied to
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
          return text;
        }
      }
    }

    // Fallback: try to find any text that looks like a tweet
    const allText = document.body.textContent;
    const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 20);
    return sentences[0]?.trim() || null;
  }

  extractTweetId() {
    // Try to extract tweet ID from URL
    const urlMatch = window.location.href.match(/status\/(\d+)/);
    return urlMatch ? urlMatch[1] : null;
  }

  insertReplyIntoComposer(composer, replyText) {
    // Different approaches for different composer types
    if (composer.contentEditable === 'true') {
      // For contenteditable composers
      composer.focus();
      composer.textContent = replyText;
      
      // Trigger input event to notify Twitter
      const inputEvent = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        data: replyText
      });
      composer.dispatchEvent(inputEvent);
      
    } else if (composer.tagName === 'TEXTAREA') {
      // For textarea composers
      composer.focus();
      composer.value = replyText;
      
      const inputEvent = new Event('input', { bubbles: true });
      composer.dispatchEvent(inputEvent);
      
    } else {
      // Try to find nested input elements
      const input = composer.querySelector('textarea, [contenteditable="true"]');
      if (input) {
        this.insertReplyIntoComposer(input, replyText);
      }
    }
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
