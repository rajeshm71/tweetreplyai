# Tweet Hiding Feature Implementation Plan

## Problem

User wants a feature where:
- If user replies to **n** tweets from the same user within **x hours**, hide all future tweets from that user for **x hours**
- Default values: n=1, x=1 hour
- Must be configurable
- Works everywhere: home timeline, profile pages, search results, communities
- Must show which tweets are hidden and allow unhiding
- Visual feedback when tweets are hidden (optional)

## Requirements

1. **Reply Threshold**: Number of replies to same user before hiding (default: 1)
2. **Hide Duration**: Hours to hide tweets after threshold reached (default: 1 hour)
3. **Rolling Window**: Count resets after X hours (not midnight)
4. **Multiple Users**: Track each user separately
5. **Visual Indicator**: Show which tweets are hidden with unhide option
6. **Configuration UI**: Settings in popup to adjust threshold and duration
7. **Persistent**: Works across page navigations and browser sessions

## Solution Architecture

### 1) Storage Structure (Chrome Storage Local)

```javascript
{
  tweetHidingSettings: {
    replyThreshold: 1,        // Default: 1 reply
    hideDurationHours: 1       // Default: 1 hour
  },
  replyHistory: {
    "username1": {
      replies: [
        { timestamp: 1704123456000 },
        { timestamp: 1704123466000 }
      ],
      hidden: true,
      hideUntil: 1704127056000  // timestamp + hideDurationHours
    },
    "username2": {
      replies: [
        { timestamp: 1704123500000 }
      ],
      hidden: false
    }
  },
  unhiddenUsers: []  // Users manually unhidden (session-only, resets on page reload)
}
```

### 2) Components to Build

#### A. Storage & Configuration Manager (`extension/content/content.js`)

**Functions:**
- `getHidingSettings()` - Get threshold and duration from storage
- `setHidingSettings(settings)` - Save settings to storage
- `getReplyHistory()` - Get all reply history
- `trackReply(username)` - Track reply to a user, check threshold, hide if needed
- `cleanupExpiredHistory()` - Remove entries older than X hours
- `shouldHideUser(username)` - Check if user reached threshold and still in hiding period
- `unhideUser(username)` - Mark user as unhidden (session only)

#### B. Reply Tracking (`extension/content/content.js`)

**Function:**
- `setupReplyTracking()` - Listen for reply button clicks
- Extend existing `setupAutoLikeOnReply()` to also track replies
- Extract username from tweet article when reply clicked
- Call `trackReply(username)` on each reply

#### C. Tweet Hiding System (`extension/content/content.js`)

**Functions:**
- `setupTweetHiding()` - Main initialization
- `checkAndHideTweets()` - Check all tweets and hide if needed
- `hideTweetsFromUser(username)` - Hide all visible tweets from user
- `isTweetFromUser(tweetArticle, username)` - Check if tweet belongs to user
- `extractAuthorInfoFromTweet(tweetArticle)` - Extract username from specific tweet article
- `createHiddenTweetIndicator(tweetArticle, username)` - Create collapsed UI
- `observeTimeline()` - MutationObserver to watch for new tweets

#### D. Visual Components

**Hidden Tweet Indicator:**
- Collapsed bar showing "Hidden: @username" with Unhide button
- Replaces tweet content temporarily
- Click unhide restores tweet (session only)

**Optional Notification:**
- Toast notification when tweets are hidden
- Shows username and count of replies

#### E. Configuration UI (`extension/popup/`)

**Add to popup:**
- Reply threshold input (1-10, default: 1)
- Hide duration input (1-24 hours, default: 1)
- Save/load settings from chrome.storage.local

## Implementation Details

### File: `extension/content/content.js`

#### 1. Storage Helpers (Add to TwitterReplyInjector class)

```javascript
// Get hiding settings with defaults
async getHidingSettings() {
  try {
    const result = await chrome.storage.local.get(['tweetHidingSettings']);
    return result.tweetHidingSettings || {
      replyThreshold: 1,
      hideDurationHours: 1
    };
  } catch (error) {
    console.warn('[TweetReply] Failed to get hiding settings:', error);
    return { replyThreshold: 1, hideDurationHours: 1 };
  }
}

// Set hiding settings
async setHidingSettings(settings) {
  try {
    await chrome.storage.local.set({ tweetHidingSettings: settings });
  } catch (error) {
    console.error('[TweetReply] Failed to save hiding settings:', error);
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
  
  const history = await this.getReplyHistory();
  const settings = await this.getHidingSettings();
  const now = Date.now();
  
  if (!history[username]) {
    history[username] = { replies: [], hidden: false };
  }
  
  // Add reply timestamp
  history[username].replies.push({ timestamp: now });
  
  // Cleanup old replies (older than hideDurationHours)
  const cutoff = now - (settings.hideDurationHours * 60 * 60 * 1000);
  history[username].replies = history[username].replies.filter(
    r => r.timestamp > cutoff
  );
  
  // Check if threshold reached
  if (history[username].replies.length >= settings.replyThreshold) {
    const hideUntil = now + (settings.hideDurationHours * 60 * 60 * 1000);
    history[username].hidden = true;
    history[username].hideUntil = hideUntil;
    
    // Save updated history
    await chrome.storage.local.set({ replyHistory: history });
    
    // Trigger hiding
    await this.hideTweetsFromUser(username);
    
    // Show notification (optional)
    this.showHidingNotification(username, history[username].replies.length);
  } else {
    // Save updated history (even if not hiding yet)
    await chrome.storage.local.set({ replyHistory: history });
  }
}

// Check if user should be hidden
async shouldHideUser(username) {
  if (!username || username === 'unknown') return false;
  
  const history = await this.getReplyHistory();
  const userData = history[username];
  
  if (!userData || !userData.hidden) return false;
  
  // Check if still in hiding period
  const now = Date.now();
  if (userData.hideUntil && userData.hideUntil > now) {
    // Check if manually unhidden this session
    const unhidden = await chrome.storage.local.get(['unhiddenUsers']);
    if (unhidden.unhiddenUsers?.includes(username)) {
      return false; // Don't hide if manually unhidden
    }
    return true;
  }
  
  // Expired - auto-unhide
  if (userData.hideUntil && userData.hideUntil <= now) {
    userData.hidden = false;
    delete userData.hideUntil;
    await chrome.storage.local.set({ replyHistory: history });
  }
  
  return false;
}

// Unhide user (session only)
async unhideUser(username) {
  if (!username) return;
  
  const unhidden = await chrome.storage.local.get(['unhiddenUsers']);
  const unhiddenUsers = unhidden.unhiddenUsers || [];
  
  if (!unhiddenUsers.includes(username)) {
    unhiddenUsers.push(username);
    await chrome.storage.local.set({ unhiddenUsers });
    
    // Restore all hidden tweets from this user
    const tweets = document.querySelectorAll(`article[data-testid="tweet"][data-hidden-username="${username}"]`);
    tweets.forEach(tweet => {
      this.restoreTweet(tweet);
    });
  }
}

// Cleanup expired history
async cleanupExpiredHistory() {
  const history = await this.getReplyHistory();
  const settings = await this.getHidingSettings();
  const cutoff = Date.now() - (settings.hideDurationHours * 60 * 60 * 1000);
  
  for (const [username, data] of Object.entries(history)) {
    // Remove old replies
    data.replies = data.replies.filter(r => r.timestamp > cutoff);
    
    // Auto-unhide if expired
    if (data.hideUntil && data.hideUntil <= Date.now()) {
      data.hidden = false;
      delete data.hideUntil;
    }
    
    // Remove user if no replies left
    if (data.replies.length === 0 && !data.hidden) {
      delete history[username];
    }
  }
  
  await chrome.storage.local.set({ replyHistory: history });
}
```

#### 2. Reply Tracking (Extend existing auto-like method)

**Better approach**: Integrate with `setupAutoLikeOnReply()` to avoid duplicate event listeners:

```javascript
setupAutoLikeOnReply() {
  // Use event delegation to catch all Reply button clicks
  document.addEventListener('click', async (e) => {
    const target = e.target;
    if (!target) return;

    // Check if clicked element is a Reply button
    const isReplyButton = target.matches('[data-testid="reply"]') ||
                         target.closest('[data-testid="reply"]') ||
                         target.matches('button[aria-label*="Reply" i]') ||
                         target.closest('button[aria-label*="Reply" i]') ||
                         target.matches('[data-testid="tweetButtonInline"]') ||
                         target.closest('[data-testid="tweetButtonInline"]');

    if (!isReplyButton) return;

    // Find tweet article
    const replyButton = target.closest('[data-testid="reply"]') ||
                       target.closest('button[aria-label*="Reply" i]') ||
                       target.closest('[role="button"][aria-label*="Reply" i]') ||
                       target.closest('[data-testid="tweetButtonInline"]') ||
                       target;

    const tweetArticle = this.findTweetArticle(replyButton);
    if (!tweetArticle) return;

    // Track reply (for tweet hiding feature)
    const username = await this.extractUsernameFromTweet(tweetArticle);
    if (username && username !== 'unknown') {
      await this.trackReply(username);
    }

    // Existing auto-like logic continues here...
    const autoLikeEnabled = await this.isAutoLikeEnabled();
    if (autoLikeEnabled) {
      const likeButton = this.findLikeButton(tweetArticle);
      if (likeButton) {
        await this.performAutoLike(likeButton);
      }
    }
  }, true); // Use capture phase to catch before other handlers
}

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
```

#### 3. Tweet Hiding System

```javascript
setupTweetHiding() {
  // Initialize on load
  this.checkAndHideTweets();
  
  // Watch for new tweets
  this.observeTimeline();
  
  // Periodically cleanup and recheck
  setInterval(() => {
    this.cleanupExpiredHistory();
    this.checkAndHideTweets();
  }, 60000); // Every minute
}

async checkAndHideTweets() {
  const history = await this.getReplyHistory();
  const unhidden = await chrome.storage.local.get(['unhiddenUsers']);
  const unhiddenUsers = unhidden.unhiddenUsers || [];
  
  // Find all tweets
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  
  for (const tweet of tweets) {
    // Skip if already processed
    if (tweet.dataset.hidingProcessed === 'true') continue;
    tweet.dataset.hidingProcessed = 'true';
    
    // Extract username from tweet
    const username = await this.extractUsernameFromTweet(tweet);
    if (!username || username === 'unknown') continue;
    
    // Skip if manually unhidden
    if (unhiddenUsers.includes(username)) continue;
    
    // Check if should hide
    const shouldHide = await this.shouldHideUser(username);
    if (shouldHide) {
      this.hideTweet(tweet, username);
    }
  }
}

async hideTweetsFromUser(username) {
  // Check if manually unhidden
  const unhidden = await chrome.storage.local.get(['unhiddenUsers']);
  if (unhidden.unhiddenUsers?.includes(username)) {
    return; // Don't hide if manually unhidden
  }
  
  // Find all tweets from this user
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  tweets.forEach(tweet => {
    const tweetUsername = this.extractUsernameFromTweetSync(tweet);
    if (tweetUsername === username) {
      if (!tweet.dataset.hidingHidden) {
        this.hideTweet(tweet, username);
      }
    }
  });
}

hideTweet(tweetArticle, username) {
  // Skip if already hidden or manually unhidden
  if (tweetArticle.dataset.hidingHidden === 'true') return;
  
  // Mark as hidden
  tweetArticle.dataset.hidingHidden = 'true';
  tweetArticle.dataset.hiddenUsername = username;
  
  // Store original state for restore
  const originalDisplay = tweetArticle.style.display;
  tweetArticle.dataset.originalDisplay = originalDisplay || '';
  
  // Create indicator
  this.createHiddenTweetIndicator(tweetArticle, username);
}

createHiddenTweetIndicator(tweetArticle, username) {
  // Find tweet content container
  const tweetContent = tweetArticle.querySelector('[data-testid="tweetText"]')?.parentElement ||
                       tweetArticle.querySelector('div[lang]') ||
                       tweetArticle;
  
  // Hide tweet content
  const originalHeight = tweetArticle.offsetHeight;
  tweetArticle.style.opacity = '0.5';
  tweetArticle.style.pointerEvents = 'none';
  
  // Create indicator
  const indicator = document.createElement('div');
  indicator.className = 'tweet-hide-indicator';
  indicator.style.cssText = `
    padding: 12px;
    background: #1d9bf0;
    color: white;
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 8px 0;
    position: relative;
    z-index: 10;
  `;
  
  indicator.innerHTML = `
    <span style="font-weight: 500;">Hidden: @${username}</span>
    <button class="tweet-hide-unhide-btn" data-username="${username}" style="
      padding: 6px 12px;
      background: white;
      color: #1d9bf0;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
    ">Unhide</button>
  `;
  
  // Insert indicator
  if (tweetContent) {
    tweetContent.style.display = 'none';
    tweetContent.after(indicator);
  } else {
    tweetArticle.prepend(indicator);
  }
  
  // Add unhide click handler
  const unhideBtn = indicator.querySelector('.tweet-hide-unhide-btn');
  if (unhideBtn) {
    unhideBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await this.unhideUser(username);
      this.restoreTweet(tweetArticle);
    });
  }
}

restoreTweet(tweetArticle) {
  // Remove hidden state
  tweetArticle.dataset.hidingHidden = 'false';
  tweetArticle.style.opacity = '';
  tweetArticle.style.pointerEvents = '';
  
  // Remove indicator
  const indicator = tweetArticle.querySelector('.tweet-hide-indicator');
  if (indicator) {
    indicator.remove();
  }
  
  // Restore content
  const tweetContent = tweetArticle.querySelector('[data-testid="tweetText"]')?.parentElement ||
                       tweetArticle.querySelector('div[lang]');
  if (tweetContent) {
    tweetContent.style.display = '';
  }
  
  // Remove username attribute
  delete tweetArticle.dataset.hiddenUsername;
}

observeTimeline() {
  // Watch for new tweets being added
  const observer = new MutationObserver(async (mutations) => {
    // Debounce to avoid too many calls
    if (this.hidingCheckTimeout) {
      clearTimeout(this.hidingCheckTimeout);
    }
    
    this.hidingCheckTimeout = setTimeout(async () => {
      await this.checkAndHideTweets();
    }, 500);
  });
  
  // Observe timeline containers
  const timeline = document.querySelector('[data-testid="primaryColumn"]') ||
                   document.querySelector('[data-testid="homeTimeline"]') ||
                   document.querySelector('main') ||
                   document.body;
  
  if (timeline) {
    observer.observe(timeline, {
      childList: true,
      subtree: true
    });
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

// Optional: Show notification when hiding
showHidingNotification(username, replyCount) {
  // Create temporary toast notification
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #1d9bf0;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-size: 14px;
    font-weight: 500;
    animation: slideIn 0.3s ease-out;
  `;
  
  toast.textContent = `Hidden tweets from @${username} (${replyCount} replies)`;
  
  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(toast);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
```

#### 4. Initialize in initialize() method

**Modify existing `initialize()` method** (around line 298):

```javascript
async initialize() {
  // Check authentication status
  this.isAuthenticated = await this.authManager.isAuthenticated();
  
  if (this.isAuthenticated) {
    await this.loadUsageData();
  }
  
  // Start observing for reply composers
  this.startObserving();
  
  // Setup auto-like on Reply click (this will also track replies)
  this.setupAutoLikeOnReply();
  
  // Setup tweet hiding feature
  this.setupTweetHiding();
  
  // Listen for storage changes (sync across tabs)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.replyHistory || changes.tweetHidingSettings)) {
      // Re-check tweets when settings or history change
      this.checkAndHideTweets();
    }
  });
  
  // ... rest of existing code ...
}
```

**Note**: Reply tracking is now integrated into `setupAutoLikeOnReply()`, so no separate `setupReplyTracking()` needed.

### File: `extension/popup/popup.html` & `popup.js`

**Add to existing Settings Panel** (inside `<div id="settings-panel">` around line 149):

```html
<!-- Add to settings-content section in popup.html -->
<div class="settings-section" style="margin-top: 20px; padding: 16px 0; border-top: 1px solid #e1e8ed;">
  <h4 style="margin-bottom: 12px; font-size: 14px; font-weight: 600; color: #14171a;">Tweet Hiding</h4>
  <div style="margin-bottom: 16px;">
    <label style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 13px; color: #657786;">
      <span>Reply Threshold:</span>
      <input type="number" id="replyThreshold" min="1" max="10" value="1" 
             style="width: 50px; padding: 4px 8px; border: 1px solid #e1e8ed; border-radius: 4px; text-align: center;">
    </label>
    <small style="display: block; color: #657786; font-size: 11px; margin-top: 4px;">
      Hide tweets after replying to this many tweets from the same user
    </small>
  </div>
  <div style="margin-bottom: 16px;">
    <label style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 13px; color: #657786;">
      <span>Hide Duration (hours):</span>
      <input type="number" id="hideDuration" min="1" max="24" value="1" 
             style="width: 50px; padding: 4px 8px; border: 1px solid #e1e8ed; border-radius: 4px; text-align: center;">
    </label>
    <small style="display: block; color: #657786; font-size: 11px; margin-top: 4px;">
      How long to hide tweets after threshold is reached
    </small>
  </div>
  <button id="saveHidingSettings" style="
    width: 100%;
    padding: 10px 16px;
    background: #1d9bf0;
    color: white;
    border: none;
    border-radius: 20px;
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
    transition: background 0.2s;
  ">Save Settings</button>
  <div id="hiding-settings-saved" style="
    display: none;
    margin-top: 8px;
    padding: 8px;
    background: #10b981;
    color: white;
    border-radius: 4px;
    font-size: 12px;
    text-align: center;
  ">Settings saved!</div>
</div>
```

**Note**: This integrates with existing settings panel structure. Use existing popup.js patterns for event handling.

```javascript
// Add to popup.js

// Load settings on popup open
async function loadHidingSettings() {
  const result = await chrome.storage.local.get(['tweetHidingSettings']);
  const settings = result.tweetHidingSettings || {
    replyThreshold: 1,
    hideDurationHours: 1
  };
  
  document.getElementById('replyThreshold').value = settings.replyThreshold;
  document.getElementById('hideDuration').value = settings.hideDurationHours;
}

// Save settings
async function saveHidingSettings() {
  const replyThreshold = parseInt(document.getElementById('replyThreshold').value) || 1;
  const hideDuration = parseInt(document.getElementById('hideDuration').value) || 1;
  
  await chrome.storage.local.set({
    tweetHidingSettings: {
      replyThreshold: Math.max(1, Math.min(10, replyThreshold)),
      hideDurationHours: Math.max(1, Math.min(24, hideDuration))
    }
  });
  
  // Show success message
  const btn = document.getElementById('saveHidingSettings');
  const originalText = btn.textContent;
  btn.textContent = 'Saved!';
  btn.style.background = '#10b981';
  
  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.background = '#1d9bf0';
  }, 2000);
}

// Attach event listeners
document.addEventListener('DOMContentLoaded', () => {
  loadHidingSettings();
  
  const saveBtn = document.getElementById('saveHidingSettings');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveHidingSettings);
  }
});
```

## Files to Modify

1. **`extension/content/content.js`**
   - Add storage helpers (get/set settings, reply history)
   - Add reply tracking system
   - Add tweet hiding system
   - Add MutationObserver for timeline watching
   - Add hidden tweet UI components
   - Initialize in `initialize()` method

2. **`extension/popup/popup.html`** (if exists)
   - Add configuration UI section

3. **`extension/popup/popup.js`** (if exists)
   - Add settings save/load functionality

## Testing Checklist

- [ ] Reply to 1 tweet from user → Tweets hidden after 1 reply
- [ ] Reply to 2 tweets from same user → Tweets hidden after threshold
- [ ] Unhide button works and restores tweet
- [ ] Hiding expires after X hours
- [ ] Works in home timeline
- [ ] Works in profile pages
- [ ] Works in search results
- [ ] Works in communities
- [ ] Settings save/load correctly
- [ ] Multiple users tracked separately
- [ ] Unhidden users stay unhidden during session
- [ ] Expired hiding auto-unhides
- [ ] Notification shows when hiding (optional)
- [ ] MutationObserver detects new tweets

## Edge Cases to Handle

1. **User unhides → Don't re-hide** until new reply threshold or page reload
2. **Expired hiding → Auto-unhide** after duration
3. **Page navigation → Re-check** on load
4. **Dynamic loading → MutationObserver** handles it
5. **Multiple tabs → Storage synced** across tabs (need to listen for storage changes)
6. **Username extraction fails → Skip hiding** for that tweet
7. **Storage quota exceeded → Handle gracefully** with error logging
8. **Existing auto-like feature → Should not conflict** with reply tracking
9. **Tweet appears multiple times → Only hide once** (use data attribute)
10. **Username with special characters → Handle properly** in regex

## Improvements to Plan

### 1. Integrate with Existing Code

- **Reuse `extractAuthorInfo()` logic**: Instead of duplicating username extraction, create a scoped version `extractAuthorInfoFromTweet(tweetArticle)` that uses the same parsing logic
- **Combine with auto-like**: The reply tracking can be added to `setupAutoLikeOnReply()` method to avoid duplicate event listeners
- **Storage change listener**: Add listener for storage changes to sync across tabs

### 2. Popup Integration

- **Add to Settings Panel**: The hiding settings should be added to the existing settings panel (line 144-157 in popup.html)
- **Use existing popup structure**: Follow the same pattern as other settings sections

### 3. Performance Optimizations

- **Debounce MutationObserver**: Already included but add better debouncing (500ms)
- **Cache username per tweet**: Use `data-username` attribute to cache username extraction
- **Batch storage writes**: Group storage writes where possible

### 4. Visual Design

- **Match Twitter UI**: Use Twitter's color scheme (#1d9bf0 for primary, match their styling)
- **Minimal indicator**: Keep hidden tweet indicator compact and unobtrusive
- **Smooth transitions**: Add CSS transitions for show/hide

### 5. Error Handling

- **Try-catch blocks**: Wrap all async operations in try-catch
- **Fallback behavior**: If storage fails, continue without hiding (don't break functionality)
- **Logging**: Use consistent console.log pattern with `[TweetReply]` prefix

## Performance Considerations

1. **Debounce MutationObserver** to avoid excessive checks
2. **Cache username extraction** per tweet article
3. **Batch storage operations** where possible
4. **Cleanup expired history** periodically (every minute)

## Security & Privacy

1. **Local storage only** - No data sent to server
2. **User-specific** - Each user's settings are independent
3. **No tracking** - Only stores reply counts and timestamps
4. **Optional feature** - Can be disabled via settings

## Summary of Changes

### Files to Modify

1. **`extension/content/content.js`** (Main implementation)
   - Add storage helpers: `getHidingSettings()`, `setHidingSettings()`, `getReplyHistory()`, `trackReply()`, `shouldHideUser()`, `unhideUser()`, `cleanupExpiredHistory()`
   - Modify `setupAutoLikeOnReply()`: Add reply tracking logic (integrate with existing method)
   - Add tweet hiding system: `setupTweetHiding()`, `checkAndHideTweets()`, `hideTweetsFromUser()`, `hideTweet()`, `createHiddenTweetIndicator()`, `restoreTweet()`, `observeTimeline()`
   - Add username extraction: `extractUsernameFromTweet()`, `extractUsernameFromTweetSync()` (reuse existing parsing logic)
   - Add notification: `showHidingNotification()` (optional)
   - Modify `initialize()`: Add `setupTweetHiding()` and storage change listener

2. **`extension/popup/popup.html`** (UI)
   - Add tweet hiding settings section to existing settings panel (inside `<div id="settings-panel">`)

3. **`extension/popup/popup.js`** (Settings handling)
   - Add `loadHidingSettings()` function
   - Add `saveHidingSettings()` function
   - Add event listeners for save button
   - Initialize settings on popup open

### Key Design Decisions

1. **Integration over duplication**: Reuse `setupAutoLikeOnReply()` instead of creating separate listener
2. **Scoped extraction**: Create tweet-scoped version of `extractAuthorInfo()` logic
3. **Session-based unhide**: Unhidden users stay unhidden for current session only
4. **Rolling window**: Count resets after X hours, not at midnight
5. **Visual feedback**: Optional toast notification when hiding occurs
6. **Cross-tab sync**: Listen to storage changes for multi-tab support

### Implementation Order

1. **Phase 1**: Storage helpers and reply tracking
   - Add storage helper functions
   - Integrate reply tracking into `setupAutoLikeOnReply()`
   - Test reply tracking works correctly

2. **Phase 2**: Tweet hiding system
   - Add tweet hiding logic
   - Add MutationObserver for dynamic content
   - Test hiding works across different pages

3. **Phase 3**: UI components
   - Add hidden tweet indicator
   - Add unhide functionality
   - Test visual components

4. **Phase 4**: Configuration UI
   - Add settings to popup
   - Add save/load functionality
   - Test settings persistence

5. **Phase 5**: Polish and testing
   - Add notification (optional)
   - Test edge cases
   - Performance optimization

### Testing Strategy

1. **Unit testing**: Test each function independently
2. **Integration testing**: Test reply tracking → hiding flow
3. **UI testing**: Test visual indicators and unhide functionality
4. **Edge case testing**: Multiple users, expired hiding, storage failures
5. **Cross-page testing**: Home timeline, profile pages, search results, communities
6. **Cross-tab testing**: Verify storage sync works

### Success Criteria

- [ ] Replies are tracked correctly per user
- [ ] Tweets are hidden when threshold reached
- [ ] Hiding expires after X hours
- [ ] Unhide button works correctly
- [ ] Settings save/load properly
- [ ] Works across all Twitter pages
- [ ] No conflicts with existing features (auto-like)
- [ ] Performance is acceptable (no lag)
- [ ] Visual design matches Twitter UI
- [ ] Edge cases handled gracefully

## Plan Review Checklist

- [x] Storage structure defined
- [x] Integration with existing code considered
- [x] Reply tracking mechanism planned
- [x] Tweet hiding system designed
- [x] Visual components specified
- [x] Configuration UI planned
- [x] Edge cases identified
- [x] Performance considerations addressed
- [x] Error handling included
- [x] Testing strategy defined
- [x] Success criteria established

