import { AuthManager } from '../utils/auth.js';
import { ApiClient } from '../utils/api.js';

class PopupManager {
  constructor() {
    this.authManager = new AuthManager();
    this.apiClient = new ApiClient();
    this.currentState = 'loading';
    this.usageData = null;
    
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
    this.suggestBtn = document.getElementById('suggest-btn');
    this.historyBtn = document.getElementById('history-btn');
    this.improveBtn = document.getElementById('improve-btn');
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
    this.closeImproveBtn = document.getElementById('close-improve');
    this.closeAnalyticsBtn = document.getElementById('close-analytics');
    
    // Draft improvement elements
    this.analyzeBtn = document.getElementById('analyze-btn');
    this.draftInput = document.getElementById('draft-input');
    
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
    this.improvePanel = document.getElementById('improve-panel');
    this.analyticsPanel = document.getElementById('analytics-panel');
  }

  attachEventListeners() {
    this.signinBtn?.addEventListener('click', () => this.handleSignIn());
    this.suggestBtn?.addEventListener('click', () => this.handleSuggestReply());
    this.historyBtn?.addEventListener('click', () => this.showHistory());
    this.improveBtn?.addEventListener('click', () => this.showImprove());
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
    this.closeImproveBtn?.addEventListener('click', () => this.hideImprove());
    this.closeAnalyticsBtn?.addEventListener('click', () => this.hideAnalytics());
    
    // Draft improvement
    this.analyzeBtn?.addEventListener('click', () => this.handleAnalyzeDraft());
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
    
    // Update suggest button state
    if (this.suggestBtn) {
      this.suggestBtn.disabled = isExceeded;
      if (isExceeded) {
        this.suggestBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z"/>
          </svg>
          <span>Daily limit reached</span>
        `;
      } else {
        this.suggestBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z"/>
          </svg>
          <span>Generate Reply</span>
          <span class="shortcut-hint">⌘K</span>
        `;
      }
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

  async handleSuggestReply() {
    try {
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || (!tab.url.includes('twitter.com') && !tab.url.includes('x.com'))) {
        this.showStatusMessage('Please navigate to X/Twitter to use this feature', 'error');
        return;
      }
      
      // Send message to content script to trigger reply generation
      chrome.tabs.sendMessage(tab.id, { action: 'suggestReply' });
      
      // Close popup
      window.close();
      
    } catch (error) {
      console.error('Failed to suggest reply:', error);
      this.showStatusMessage('Failed to suggest reply', 'error');
    }
  }

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
  }

  hideSettings() {
    this.settingsPanel?.classList.add('hidden');
  }

  showHistory() {
    this.hideAllPanels();
    this.historyPanel?.classList.remove('hidden');
    this.loadReplyHistory();
  }

  hideHistory() {
    this.historyPanel?.classList.add('hidden');
  }

  showImprove() {
    this.hideAllPanels();
    this.improvePanel?.classList.remove('hidden');
  }

  hideImprove() {
    this.improvePanel?.classList.add('hidden');
  }

  showAnalytics() {
    this.hideAllPanels();
    this.analyticsPanel?.classList.remove('hidden');
    this.loadAnalytics();
  }

  hideAnalytics() {
    this.analyticsPanel?.classList.add('hidden');
  }

  hideAllPanels() {
    this.settingsPanel?.classList.add('hidden');
    this.historyPanel?.classList.add('hidden');
    this.improvePanel?.classList.add('hidden');
    this.analyticsPanel?.classList.add('hidden');
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

  async handleAnalyzeDraft() {
    const draftText = this.draftInput?.value;
    if (!draftText?.trim()) return;
    
    try {
      this.analyzeBtn.disabled = true;
      this.analyzeBtn.textContent = 'Analyzing...';
      
      const result = await this.apiClient.suggestImprovements(draftText, '');
      this.displayImprovementResults(result);
    } catch (error) {
      console.error('Failed to analyze draft:', error);
      this.showStatusMessage('Failed to analyze draft', 'error');
    } finally {
      this.analyzeBtn.disabled = false;
      this.analyzeBtn.textContent = 'Analyze';
    }
  }

  displayImprovementResults(result) {
    const resultsDiv = document.getElementById('improvement-results');
    if (!resultsDiv) return;
    
    resultsDiv.classList.remove('hidden');
    
    // Display quality score
    const qualityDisplay = resultsDiv.querySelector('.quality-score-display');
    if (qualityDisplay) {
      qualityDisplay.innerHTML = `
        <h4>Quality Score: ${result.qualityScore}/100</h4>
      `;
    }
    
    // Display issues
    const issuesList = resultsDiv.querySelector('.issues-list');
    if (issuesList && result.issues && result.issues.length > 0) {
      issuesList.innerHTML = `
        <h4>Issues:</h4>
        <ul>${result.issues.map(issue => `<li>${issue}</li>`).join('')}</ul>
      `;
    } else if (issuesList) {
      issuesList.innerHTML = '';
    }
    
    // Display suggestions
    const suggestionsList = resultsDiv.querySelector('.suggestions-list');
    if (suggestionsList && result.suggestions && result.suggestions.length > 0) {
      suggestionsList.innerHTML = `
        <h4>Suggestions:</h4>
        <ul>${result.suggestions.map(sug => `<li>${sug}</li>`).join('')}</ul>
      `;
    } else if (suggestionsList) {
      suggestionsList.innerHTML = '';
    }
  }

  async loadAnalytics() {
    try {
      const metrics = await this.apiClient.getQualityMetrics();
      this.displayAnalytics(metrics);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  }

  displayAnalytics(data) {
    if (data.metrics) {
      const avgQuality = document.getElementById('avg-quality');
      const totalReplies = document.getElementById('total-replies');
      const highQuality = document.getElementById('high-quality');
      
      if (avgQuality) avgQuality.textContent = data.metrics.averageScore || '-';
      if (totalReplies) totalReplies.textContent = data.metrics.totalReplies || '-';
      if (highQuality) highQuality.textContent = data.metrics.highQualityCount || '-';
    }
    
    // Display recommendations
    const recommendationsList = document.getElementById('recommendations-list');
    if (recommendationsList && data.recommendations && data.recommendations.length > 0) {
      recommendationsList.innerHTML = `
        <h4>Recommendations:</h4>
        <ul>${data.recommendations.map(rec => `<li>${rec}</li>`).join('')}</ul>
      `;
    } else if (recommendationsList) {
      recommendationsList.innerHTML = '';
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
      const name = user.name || user.email?.split('@')[0] || 'there';
      this.userName.textContent = name;
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
      if (plan === 'pro') {
        this.planBadge.style.background = 'linear-gradient(135deg, #10B981, #059669)';
      } else if (plan === 'premium') {
        this.planBadge.style.background = 'linear-gradient(135deg, #8B5CF6, #7C3AED)';
      }
    }
  }

  updateQuickStats() {
    if (!this.usageData) return;

    const { used } = this.usageData;
    
    // Update today's replies
    if (this.todayReplies) {
      this.todayReplies.textContent = used;
    }

    // Update success rate (placeholder - would need actual data)
    if (this.successRate) {
      this.successRate.textContent = '--';
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
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});
