import { AuthManager } from '../utils/auth.js';
import { ApiClient } from '../utils/api.js';

class PopupManager {
  constructor() {
    this.authManager = new AuthManager();
    this.apiClient = new ApiClient();
    this.currentState = 'loading';
    this.usageData = null;
    this.qualityMetrics = null;
    
    this.initializeElements();
    this.attachEventListeners();
    this.setupAuthListener();
    this.initialize();
  }

  setupAuthListener() {
    // Listen for auth updates from background script
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'authUpdated') {
        this.initialize(); // Refresh UI when auth syncs
      }
    });
  }

  initializeElements() {
    // States
    this.loadingState = document.getElementById('loading');
    this.notAuthenticatedState = document.getElementById('not-authenticated');
    this.authenticatedState = document.getElementById('authenticated');
    this.quotaExceededState = document.getElementById('quota-exceeded');
    
    // Buttons
    this.signinBtn = document.getElementById('signin-btn');
    this.historyBtn = document.getElementById('history-btn');
    this.analyticsBtn = document.getElementById('analytics-btn');
    this.webAppBtn = document.getElementById('web-app-btn');
    this.billingBtn = document.getElementById('billing-btn');
    this.upgradeBtn = document.getElementById('upgrade-btn');
    this.settingsBtn = document.getElementById('settings-btn');
    this.signoutBtn = document.getElementById('signout-btn');
    this.closeSettingsBtn = document.getElementById('close-settings');
    this.upgradeCta = document.getElementById('upgrade-cta');
    
    // Panel close buttons
    this.closeHistoryBtn = document.getElementById('close-history');
    this.closeAnalyticsBtn = document.getElementById('close-analytics');
    
    // Usage elements
    this.statusDot = document.getElementById('status-dot');
    this.statusText = document.getElementById('status-text');
    this.progressFill = document.getElementById('progress-fill');
    this.usageText = document.getElementById('usage-text');
    this.resetText = document.getElementById('reset-text');
    this.quotaResetText = document.getElementById('quota-reset-text');
    this.statusMessage = document.getElementById('status-message');
    
    // New UI elements
    this.userName = document.getElementById('user-name');
    this.planBadge = document.getElementById('plan-badge');
    this.usagePercentage = document.getElementById('usage-percentage');
    this.todayReplies = document.getElementById('today-replies');
    this.successRate = document.getElementById('success-rate');
    this.timeSaved = document.getElementById('time-saved');
    
    // Settings
    this.settingsPanel = document.getElementById('settings-panel');
    this.userEmail = document.getElementById('user-email');
    
    // Panels
    this.historyPanel = document.getElementById('history-panel');
    this.analyticsPanel = document.getElementById('analytics-panel');
  }

  attachEventListeners() {
    this.signinBtn?.addEventListener('click', () => this.handleSignIn());
    this.historyBtn?.addEventListener('click', () => this.showHistory());
    this.analyticsBtn?.addEventListener('click', () => this.showAnalytics());
    this.webAppBtn?.addEventListener('click', () => this.handleOpenWebApp());
    this.billingBtn?.addEventListener('click', () => this.handleManageBilling());
    this.upgradeBtn?.addEventListener('click', () => this.handleUpgrade());
    this.upgradeCta?.addEventListener('click', () => this.handleUpgrade());
    this.settingsBtn?.addEventListener('click', () => this.showSettings());
    this.signoutBtn?.addEventListener('click', () => this.handleSignOut());
    this.closeSettingsBtn?.addEventListener('click', () => this.hideSettings());
    
    // Panel close buttons
    this.closeHistoryBtn?.addEventListener('click', () => this.hideHistory());
    this.closeAnalyticsBtn?.addEventListener('click', () => this.hideAnalytics());
    
    // Reply tracking settings
    const saveTrackingSettingsBtn = document.getElementById('saveTrackingSettings');
    if (saveTrackingSettingsBtn) {
      saveTrackingSettingsBtn.addEventListener('click', () => this.saveTrackingSettings());
    }
    
    // Keyboard navigation
    this.setupKeyboardNavigation();
    
    // Dark mode initialization
    this.initializeDarkMode();
  }
  
  setupKeyboardNavigation() {
    // Escape key to close panels
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.settingsPanel?.classList.contains('hidden')) {
          this.hideSettings();
        } else if (!this.historyPanel?.classList.contains('hidden')) {
          this.hideHistory();
        } else if (!this.analyticsPanel?.classList.contains('hidden')) {
          this.hideAnalytics();
        }
      }
    });
    
  }
  
  initializeDarkMode() {
    // Check for saved theme preference
    chrome.storage.local.get(['theme'], (result) => {
      if (result.theme) {
        document.documentElement.setAttribute('data-theme', result.theme);
      } else {
        // Use system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      }
    });
    
    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      chrome.storage.local.get(['theme'], (result) => {
        // Only update if user hasn't manually set a theme
        if (!result.theme) {
          document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
      });
    });
  }

  async initialize() {
    try {
      // Start with loading state
      this.setState('loading');
      
      let isAuthenticated = await this.authManager.isAuthenticated();
      
      // If not authenticated, try to sync from web app
      if (!isAuthenticated) {
        await this.tryAuthSync();
        // Check auth again after sync attempt
        isAuthenticated = await this.authManager.isAuthenticated();
      }
      
      if (!isAuthenticated) {
        this.setState('not-authenticated');
        return;
      }

      // Load user data and usage
      await this.loadUserData();
      await this.loadUsageData();
      // Load quality metrics in parallel (don't block on it)
      this.loadQualityMetrics().catch(err => console.error('Quality metrics load failed:', err));
      
      // Check if quota is exceeded
      if (this.usageData && this.usageData.used >= this.usageData.limit) {
        this.setState('quota-exceeded');
      } else {
        this.setState('authenticated');
      }
      
      this.updateUsageDisplay();
      
    } catch (error) {
      console.error('Failed to initialize popup:', error);
      this.setState('not-authenticated');
    }
  }

  async tryAuthSync() {
    try {
      // Try to get auth from any open tweetreplyai.vercel.app tab
      const tabs = await chrome.tabs.query({ url: 'https://tweetreplyai.vercel.app/*' });
      if (tabs.length > 0) {
        // Request auth sync from background script
        chrome.runtime.sendMessage({ 
          action: 'syncAuthFromTab', 
          tabId: tabs[0].id 
        });
        // Wait for sync to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('Failed to sync auth:', error);
    }
  }

  async loadUserData() {
    try {
      const user = await this.apiClient.getCurrentUser();
      if (user) {
        // Update settings panel email
        if (this.userEmail) {
          this.userEmail.textContent = user.email || 'Unknown';
        }
        
        // Update welcome message
        this.updateWelcomeMessage(user);
        
        // Update plan badge
        this.updatePlanBadge(user);
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  }

  async loadUsageData() {
    try {
      this.usageData = await this.apiClient.getUsage();
    } catch (error) {
      console.error('Failed to load usage data:', error);
      this.usageData = null;
    }
  }

  async loadQualityMetrics() {
    try {
      this.qualityMetrics = await this.apiClient.getQualityMetrics(30);
      // Update quick stats after loading quality metrics
      this.updateQuickStats();
    } catch (error) {
      console.error('Failed to load quality metrics:', error);
      this.qualityMetrics = null;
    }
  }

  setState(state) {
    // Hide all states
    this.loadingState?.classList.add('hidden');
    this.notAuthenticatedState?.classList.add('hidden');
    this.authenticatedState?.classList.add('hidden');
    this.quotaExceededState?.classList.add('hidden');
    
    // Hide all panels
    this.settingsPanel?.classList.add('hidden');
    this.historyPanel?.classList.add('hidden');
    this.improvePanel?.classList.add('hidden');
    this.analyticsPanel?.classList.add('hidden');
    
    // Force hide panels with inline styles as backup
    if (this.settingsPanel) this.settingsPanel.style.display = 'none';
    if (this.historyPanel) this.historyPanel.style.display = 'none';
    if (this.improvePanel) this.improvePanel.style.display = 'none';
    if (this.analyticsPanel) this.analyticsPanel.style.display = 'none';
    
    // Show the current state
    this.currentState = state;
    switch (state) {
      case 'loading':
        this.loadingState?.classList.remove('hidden');
        break;
      case 'not-authenticated':
        this.notAuthenticatedState?.classList.remove('hidden');
        break;
      case 'authenticated':
        this.authenticatedState?.classList.remove('hidden');
        break;
      case 'quota-exceeded':
        this.quotaExceededState?.classList.remove('hidden');
        break;
    }
  }

  updateUsageDisplay() {
    if (!this.usageData) return;

    const { used, limit, resetAt, status } = this.usageData;
    const percentage = Math.min((used / limit) * 100, 100);
    const isExceeded = used >= limit;
    
    // Update progress bar
    if (this.progressFill) {
      this.progressFill.style.width = `${percentage}%`;
      this.progressFill.classList.toggle('exceeded', isExceeded);
    }
    
    // Update progress bar ARIA attributes
    const progressBar = document.querySelector('.usage-progress-bar[role="progressbar"]');
    if (progressBar) {
      progressBar.setAttribute('aria-valuenow', Math.round(percentage));
      progressBar.setAttribute('aria-valuetext', `${used} of ${limit} replies used`);
    }
    
    // Update usage numbers
    if (this.usageText) {
      this.usageText.textContent = `${used} / ${limit} replies`;
    }

    // Update usage percentage
    if (this.usagePercentage) {
      this.usagePercentage.textContent = `${Math.round(percentage)}%`;
    }
    
    // Update status indicator
    if (this.statusDot && this.statusText) {
      this.statusDot.classList.toggle('active', !isExceeded);
      this.statusText.textContent = isExceeded ? 'Limit reached' : 'Active';
    }
    
    // Update reset time
    const resetDistance = this.formatTimeDistance(new Date(resetAt));
    if (this.resetText) {
      this.resetText.textContent = `Resets ${resetDistance}`;
    }
    if (this.quotaResetText) {
      this.quotaResetText.textContent = `Resets ${resetDistance}`;
    }
    
    
    // Update status message
    if (this.statusMessage) {
      if (isExceeded) {
        this.statusMessage.textContent = `Daily limit reached. Resets ${resetDistance}`;
      } else {
        this.statusMessage.textContent = 'Click "Reply" on any X post to generate suggestions';
      }
    }

    // Update quick stats
    this.updateQuickStats();
  }

  formatTimeDistance(date) {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'soon';
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `in ${hours}h ${minutes}m`;
    } else {
      return `in ${minutes}m`;
    }
  }

  async handleSignIn() {
    try {
      // Open the web app for authentication
      const domains = await this.getDomains();
      const domain = domains[0] || 'tweetreplyai.vercel.app';
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const loginUrl = `${protocol}://${domain}/login`;
      
      chrome.tabs.create({ url: loginUrl });
      
      // Close the popup
      window.close();
    } catch (error) {
      console.error('Failed to handle sign in:', error);
    }
  }

  // NOTE: handleSuggestReply() method removed - Generate Reply button was removed from UI
  // Reply generation is now handled directly in content script via Twitter UI buttons

  async handleOpenWebApp() {
    try {
      const domains = await this.getDomains();
      const domain = domains[0] || 'tweetreplyai.vercel.app';
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const webAppUrl = `${protocol}://${domain}/app`;
      
      chrome.tabs.create({ url: webAppUrl });
      window.close();
    } catch (error) {
      console.error('Failed to open web app:', error);
    }
  }

  async handleManageBilling() {
    try {
      const portalUrl = await this.apiClient.createBillingPortal();
      chrome.tabs.create({ url: portalUrl });
      window.close();
    } catch (error) {
      console.error('Failed to open billing portal:', error);
      this.showStatusMessage('Failed to open billing portal', 'error');
    }
  }

  async handleUpgrade() {
    try {
      const domains = await this.getDomains();
      const domain = domains[0] || 'tweetreplyai.vercel.app';
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const pricingUrl = `${protocol}://${domain}/pricing`;
      
      chrome.tabs.create({ url: pricingUrl });
      window.close();
    } catch (error) {
      console.error('Failed to open pricing:', error);
    }
  }

  async handleSignOut() {
    try {
      // Call API to logout from web app as well
      try {
        const domains = await this.getDomains();
        const domain = domains[0] || 'tweetreplyai.vercel.app';
        const protocol = domain.includes('localhost') ? 'http' : 'https';
        await fetch(`${protocol}://${domain}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include'
        });
      } catch (error) {
        console.error('Failed to logout from web app:', error);
      }
      
      // Clear extension token
      await this.authManager.signOut();
      this.setState('not-authenticated');
      this.hideSettings();
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  }

  showSettings() {
    this.settingsPanel?.classList.remove('hidden');
    if (this.settingsPanel) {
      // CSS now handles display: flex, so we don't need inline style
      this.settingsPanel.setAttribute('aria-hidden', 'false');
      this.settingsBtn?.setAttribute('aria-expanded', 'true');
      // Load tracking settings when settings panel is shown
      this.loadTrackingSettings();
      // Focus first focusable element
      const firstInput = this.settingsPanel.querySelector('input, button');
      firstInput?.focus();
    }
  }

  hideSettings() {
    this.settingsPanel?.classList.add('hidden');
    if (this.settingsPanel) {
      this.settingsPanel.style.display = 'none';
      this.settingsPanel.setAttribute('aria-hidden', 'true');
      this.settingsBtn?.setAttribute('aria-expanded', 'false');
    }
  }

  // Load reply tracking settings
  async loadTrackingSettings() {
    try {
      const result = await chrome.storage.local.get(['replyTrackingSettings']);
      const settings = result.replyTrackingSettings || {
        trackingPeriodDays: 7
      };
      
      const trackingPeriodInput = document.getElementById('trackingPeriodDays');
      
      if (trackingPeriodInput) {
        trackingPeriodInput.value = settings.trackingPeriodDays || 7;
      }
    } catch (error) {
      console.error('Failed to load tracking settings:', error);
    }
  }

  // Save reply tracking settings
  async saveTrackingSettings() {
    try {
      const trackingPeriodInput = document.getElementById('trackingPeriodDays');
      const saveBtn = document.getElementById('saveTrackingSettings');
      const savedMsg = document.getElementById('tracking-settings-saved');
      
      if (!trackingPeriodInput) return;
      
      const trackingPeriod = parseInt(trackingPeriodInput.value) || 7;
      
      // Clamp values to valid ranges
      const clampedPeriod = Math.max(1, Math.min(30, trackingPeriod));
      
      await chrome.storage.local.set({
        replyTrackingSettings: {
          trackingPeriodDays: clampedPeriod
        }
      });
      
      // Show success message
      if (savedMsg) {
        savedMsg.style.display = 'block';
        setTimeout(() => {
          savedMsg.style.display = 'none';
        }, 2000);
      }
      
      // Update button text temporarily
      if (saveBtn) {
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Saved!';
        saveBtn.style.background = '#10b981';
        
        setTimeout(() => {
          saveBtn.textContent = originalText;
          saveBtn.style.background = '#1d9bf0';
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to save tracking settings:', error);
      alert('Failed to save settings. Please try again.');
    }
  }

  showHistory() {
    this.hideAllPanels();
    this.historyPanel?.classList.remove('hidden');
    if (this.historyPanel) {
      this.historyPanel.style.display = 'flex';
      this.historyPanel.setAttribute('aria-hidden', 'false');
      // Focus close button
      this.closeHistoryBtn?.focus();
    }
    this.loadReplyHistory();
  }

  hideHistory() {
    this.historyPanel?.classList.add('hidden');
    if (this.historyPanel) {
      this.historyPanel.style.display = 'none';
      this.historyPanel.setAttribute('aria-hidden', 'true');
    }
    // Return focus to history button
    this.historyBtn?.focus();
  }

  showAnalytics() {
    this.hideAllPanels();
    this.analyticsPanel?.classList.remove('hidden');
    if (this.analyticsPanel) {
      this.analyticsPanel.style.display = 'flex';
      this.analyticsPanel.setAttribute('aria-hidden', 'false');
      // Focus close button
      this.closeAnalyticsBtn?.focus();
    }
    this.loadAnalytics();
  }

  hideAnalytics() {
    this.analyticsPanel?.classList.add('hidden');
    if (this.analyticsPanel) {
      this.analyticsPanel.style.display = 'none';
      this.analyticsPanel.setAttribute('aria-hidden', 'true');
    }
    // Return focus to analytics button
    this.analyticsBtn?.focus();
  }

  hideAllPanels() {
    this.settingsPanel?.classList.add('hidden');
    this.historyPanel?.classList.add('hidden');
    this.analyticsPanel?.classList.add('hidden');
    
    // Force hide with inline styles
    if (this.settingsPanel) {
      this.settingsPanel.style.display = 'none';
      this.settingsPanel.setAttribute('aria-hidden', 'true');
    }
    if (this.historyPanel) {
      this.historyPanel.style.display = 'none';
      this.historyPanel.setAttribute('aria-hidden', 'true');
    }
    if (this.analyticsPanel) {
      this.analyticsPanel.style.display = 'none';
      this.analyticsPanel.setAttribute('aria-hidden', 'true');
    }
  }

  async loadReplyHistory() {
    try {
      const history = await this.apiClient.getReplyHistory(20);
      this.displayHistory(history.history);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  }

  displayHistory(entries) {
    const listElement = document.getElementById('history-list');
    if (!listElement) return;
    
    listElement.innerHTML = '';
    
    if (!entries || entries.length === 0) {
      listElement.innerHTML = '<div class="empty-state">No reply history found</div>';
      return;
    }
    
    entries.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML = `
        <div class="history-header">
          <span class="history-date">${new Date(entry.createdAt).toLocaleDateString()}</span>
          ${entry.qualityScore ? `<span class="quality-badge">Quality: ${entry.qualityScore}</span>` : ''}
        </div>
        <div class="history-tweet">${this.truncate(entry.originalTweet, 80)}</div>
        <div class="history-reply">${entry.generatedReply}</div>
        <button class="copy-btn" data-text="${this.escapeHtml(entry.generatedReply)}">Copy</button>
      `;
      
      // Add copy functionality
      const copyBtn = item.querySelector('.copy-btn');
      copyBtn?.addEventListener('click', () => {
        navigator.clipboard.writeText(entry.generatedReply);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 1000);
      });
      
      listElement.appendChild(item);
    });
  }

  async loadAnalytics() {
    try {
      // Fix: Use consistent 30-day parameter to match loadQualityMetrics()
      const metrics = await this.apiClient.getQualityMetrics(30);
      this.displayAnalytics(metrics);
    } catch (error) {
      console.error('Failed to load analytics:', error);
      // Fix: Show empty state on error instead of leaving stale data
      this.displayAnalytics({ metrics: {}, recommendations: [] });
    }
  }

  displayAnalytics(data) {
    // Handle null/undefined data
    if (!data) {
      data = {};
    }

    const avgQuality = document.getElementById('avg-quality');
    const totalReplies = document.getElementById('total-replies');
    const highQuality = document.getElementById('high-quality');
    
    // Safely extract metrics with fallback values
    const metrics = data.metrics || {};
    
    // Format average score - handle both decimal (0-1) and percentage (0-100) formats
    if (avgQuality) {
      // Fix: Use extracted helper method to eliminate code duplication
      // Note: displayAnalytics uses '-' for empty, but formatQualityScore returns '--'
      // Using formatQualityScore for consistency, but could normalize if needed
      const formatted = this.formatQualityScore(metrics.averageScore);
      avgQuality.textContent = formatted === '--' ? '-' : formatted;
    }
    
    // Display total replies
    if (totalReplies) {
      totalReplies.textContent = metrics.totalReplies ?? '-';
    }
    
    // Display high quality count
    if (highQuality) {
      highQuality.textContent = metrics.highQualityCount ?? '-';
    }
    
    // Display recommendations
    const recommendationsList = document.getElementById('recommendations-list');
    if (recommendationsList) {
      if (data.recommendations && Array.isArray(data.recommendations) && data.recommendations.length > 0) {
        recommendationsList.innerHTML = `
          <h4>Recommendations:</h4>
          <ul>${data.recommendations.map(rec => `<li>${this.escapeHtml(rec)}</li>`).join('')}</ul>
        `;
      } else {
        recommendationsList.innerHTML = '';
      }
    }
  }

  truncate(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showStatusMessage(message, type = 'info') {
    // Create and show a temporary status message
    const existingMessage = document.querySelector('.temp-status');
    if (existingMessage) {
      existingMessage.remove();
    }
    
    const messageEl = document.createElement('div');
    messageEl.className = `temp-status ${type === 'error' ? 'error-message' : 'success-message'}`;
    messageEl.textContent = message;
    
    const firstState = document.querySelector('.state:not(.hidden)');
    if (firstState) {
      firstState.insertBefore(messageEl, firstState.firstChild);
    }
    
    setTimeout(() => {
      messageEl?.remove();
    }, 3000);
  }

  async getDomains() {
    try {
      // Try to get domains from storage or environment
      const result = await chrome.storage.local.get(['apiDomain']);
      if (result.apiDomain) {
        return [result.apiDomain];
      }
      
      // Fallback to production domain
      return ['tweetreplyai.vercel.app'];
    } catch (error) {
      console.error('Failed to get domains:', error);
      return ['tweetreplyai.vercel.app'];
    }
  }

  // New methods for enhanced UI
  updateWelcomeMessage(user) {
    if (this.userName) {
      // Debug: Log user object to see what fields are available
      console.log('User object for welcome message:', user);
      
      // Try to extract name from various possible fields
      let name = user.name || user.displayName || user.fullName || 
                 user.firstName || (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : null);
      
      // If no name field exists, extract from email more intelligently
      if (!name && user.email) {
        const emailPrefix = user.email.split('@')[0];
        // Remove numbers and special characters that look like usernames
        // e.g., "rajeshmane711" -> "rajeshmane" -> "Rajeshmane"
        const cleanedName = emailPrefix.replace(/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g, '');
        // If cleaned name is reasonable length (at least 2 chars), use it
        if (cleanedName.length >= 2) {
          name = cleanedName;
        } else {
          // Fallback to full email prefix if cleaning removed too much
          name = emailPrefix;
        }
      }
      
      // Final fallback
      if (!name) {
        name = 'there';
      }
      
      // Capitalize first letter only (don't change rest of the name)
      const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
      this.userName.textContent = capitalizedName;
    }
  }

  updatePlanBadge(user) {
    if (this.planBadge) {
      // Determine plan based on user data
      const plan = user.subscription?.plan || 'free';
      const planLabels = {
        'free': 'Free Plan',
        'pro': 'Pro Plan',
        'premium': 'Premium Plan'
      };
      this.planBadge.textContent = planLabels[plan] || 'Free Plan';
      
      // Update styling based on plan
      this.planBadge.className = 'plan-badge';
      // Free plan uses CSS default (emerald/green gradient)
      // Only override for pro and premium plans
      if (plan === 'pro') {
        this.planBadge.style.background = 'linear-gradient(135deg, #10B981, #059669)';
      } else if (plan === 'premium') {
        this.planBadge.style.background = 'linear-gradient(135deg, #8B5CF6, #7C3AED)';
      } else {
        // Ensure free plan uses CSS default (remove any inline styles)
        this.planBadge.style.background = '';
      }
    }
  }

  updateQuickStats() {
    // Update today's replies - show 0 if usageData is null
    const used = this.usageData?.used ?? 0;
    if (this.todayReplies) {
      this.todayReplies.textContent = used;
    }

    // Update success rate from quality metrics
    if (this.successRate) {
      if (this.qualityMetrics && this.qualityMetrics.metrics) {
        // Fix: Use extracted helper method to eliminate code duplication
        this.successRate.textContent = this.formatQualityScore(this.qualityMetrics.metrics.averageScore);
      } else {
        this.successRate.textContent = '--';
      }
    }

    // Update time saved (placeholder - would need actual data)
    if (this.timeSaved) {
      this.timeSaved.textContent = '--';
    }
  }

  formatTimeSaved(minutes) {
    if (minutes < 60) {
      return `${minutes}m`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }
  }

  /**
   * Formats quality score as percentage.
   * Handles both decimal (0-1) and percentage (0-100) formats.
   * Returns '--' for null/undefined values.
   * @param {number|null|undefined} avgScore - The average quality score
   * @returns {string} Formatted score as percentage or '--'
   */
  formatQualityScore(avgScore) {
    if (avgScore === null || avgScore === undefined) {
      return '--';
    }
    // Format as percentage if it's a decimal (0-1), otherwise show as-is
    return avgScore < 1 ? `${Math.round(avgScore * 100)}%` : `${Math.round(avgScore)}%`;
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});
