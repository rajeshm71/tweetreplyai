import { AuthManager } from '../utils/auth.js';
import { ApiClient } from '../utils/api.js';
import { POLLING, DEFAULTS } from '../config/constants.js';

class PopupManager {
  constructor() {
    this.authManager = new AuthManager();
    this.apiClient = new ApiClient();
    this.currentState = 'loading';
    this.usageData = null;
    this.qualityMetrics = null;
    
    // Refresh intervals for periodic data updates
    this.usageDataInterval = null;
    this.qualityMetricsInterval = null;
    this.analyticsRefreshInterval = null;
    
    // Event handler references for proper cleanup (fix: prevent memory leaks)
    this.focusHandler = null;
    this.visibilityHandler = null;
    this.beforeunloadHandler = null;
    
    this.initializeElements();
    this.attachEventListeners();
    this.setupAuthListener();
    this.setupDataRefresh();
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

  setupDataRefresh() {
    // Setup periodic refresh for usage data (every 30 seconds)
    this.startUsageDataRefresh();
    
    // Setup periodic refresh for quality metrics (every 30 seconds)
    this.startQualityMetricsRefresh();
    
    // Setup window focus listener to refresh data when popup is reopened
    this.setupFocusRefresh();
    
    // Setup message listener for usage updates from content script
    this.setupUsageUpdateListener();
    
    // Setup cleanup on popup close
    this.setupCleanup();
  }

  startUsageDataRefresh() {
    // Clear existing interval if any
    if (this.usageDataInterval) {
      clearInterval(this.usageDataInterval);
    }
    
    // Refresh usage data every 30 seconds
    this.usageDataInterval = setInterval(async () => {
      if (this.currentState === 'authenticated') {
        try {
          await this.loadUsageData();
          this.updateUsageDisplay();
          // Fix: Update quick stats cards (Today card) after usage refresh
          this.updateQuickStats();
          // Also refresh quality metrics after usage updates
          this.loadQualityMetrics().catch(err => console.error('Quality metrics refresh failed:', err));
        } catch (error) {
          console.error('Failed to refresh usage data:', error);
        }
      }
    }, POLLING.USAGE_REFRESH_MS);
  }

  startQualityMetricsRefresh() {
    // Clear existing interval if any
    if (this.qualityMetricsInterval) {
      clearInterval(this.qualityMetricsInterval);
    }
    
    // Refresh quality metrics every 30 seconds
    this.qualityMetricsInterval = setInterval(async () => {
      if (this.currentState === 'authenticated') {
        try {
          await this.loadQualityMetrics();
        } catch (error) {
          console.error('Failed to refresh quality metrics:', error);
        }
      }
    }, POLLING.ANALYTICS_REFRESH_MS);
  }

  setupFocusRefresh() {
    // Fix: Store handler references for proper cleanup to prevent memory leaks
    this.focusHandler = async () => {
      if (this.currentState === 'authenticated') {
        try {
          await this.loadUsageData();
          this.updateUsageDisplay();
          // Fix: Update quick stats cards (Today card) after usage refresh
          this.updateQuickStats();
          // Refresh quality metrics as well
          this.loadQualityMetrics().catch(err => console.error('Quality metrics refresh failed:', err));
        } catch (error) {
          console.error('Failed to refresh data on focus:', error);
        }
      }
    };
    
    // Fix: Store handler reference for proper cleanup
    this.visibilityHandler = async () => {
      if (!document.hidden && this.currentState === 'authenticated') {
        try {
          await this.loadUsageData();
          this.updateUsageDisplay();
          // Fix: Update quick stats cards (Today card) after usage refresh
          this.updateQuickStats();
          this.loadQualityMetrics().catch(err => console.error('Quality metrics refresh failed:', err));
        } catch (error) {
          console.error('Failed to refresh data on visibility change:', error);
        }
      }
    };
    
    // Refresh data when popup regains focus (user reopens it)
    window.addEventListener('focus', this.focusHandler);
    
    // Also listen for visibility changes (when popup is shown/hidden)
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  setupUsageUpdateListener() {
    // Listen for usage update messages from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'usageUpdated' || message.action === 'replyGenerated') {
        // Immediately refresh usage data when reply is generated
        this.loadUsageData().then(() => {
          this.updateUsageDisplay();
          // Fix: Update quick stats cards (Today card) after usage refresh
          this.updateQuickStats();
          // Also refresh quality metrics since new replies affect quality
          this.loadQualityMetrics().catch(err => console.error('Quality metrics refresh failed:', err));
        }).catch(error => {
          console.error('Failed to refresh usage after reply generation:', error);
        });
      }
      return true; // Keep message channel open for async response
    });
  }

  setupCleanup() {
    // Fix: Store handler reference for proper cleanup
    this.beforeunloadHandler = () => {
      this.cleanup();
    };
    
    // Cleanup intervals when popup is closed
    // Note: beforeunload may not fire reliably in Chrome extension popups,
    // but we set it up as a best-effort cleanup mechanism
    window.addEventListener('beforeunload', this.beforeunloadHandler);
    
    // Fix: Removed redundant visibility listener - setupFocusRefresh() already handles visibility changes
    // The visibility handler in setupFocusRefresh() is sufficient for refresh logic
  }

  cleanup() {
    // Clear all intervals
    if (this.usageDataInterval) {
      clearInterval(this.usageDataInterval);
      this.usageDataInterval = null;
    }
    if (this.qualityMetricsInterval) {
      clearInterval(this.qualityMetricsInterval);
      this.qualityMetricsInterval = null;
    }
    if (this.analyticsRefreshInterval) {
      clearInterval(this.analyticsRefreshInterval);
      this.analyticsRefreshInterval = null;
    }
    
    // Fix: Remove event listeners to prevent memory leaks
    if (this.focusHandler) {
      window.removeEventListener('focus', this.focusHandler);
      this.focusHandler = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.beforeunloadHandler) {
      window.removeEventListener('beforeunload', this.beforeunloadHandler);
      this.beforeunloadHandler = null;
    }
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
    this.logoutBtn = document.getElementById('logout-btn');
    this.settingsBtn = document.getElementById('settings-btn');
    this.signoutBtn = document.getElementById('signout-btn');
    this.closeSettingsBtn = document.getElementById('close-settings');
    this.upgradeCta = document.getElementById('upgrade-cta');
    
    // Panel close buttons
    this.closeHistoryBtn = document.getElementById('close-history');
    
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
    // Breakdown toggle is accessed via getElementById in updateModeBreakdown()
    
    // Settings
    this.settingsPanel = document.getElementById('settings-panel');
    this.userEmail = document.getElementById('user-email');
    
    // Panels
    this.historyPanel = document.getElementById('history-panel');
    this.analyticsPanel = document.getElementById('analytics-panel');
    
    // Analytics panel elements
    this.analyticsBackBtn = document.getElementById('analytics-back-btn');
    this.analyticsLoading = document.getElementById('analytics-loading');
    this.analyticsError = document.getElementById('analytics-error');
    this.analyticsRetryBtn = document.getElementById('analytics-retry-btn');
    this.analyticsData = document.getElementById('analytics-data');
    this.analyticsSummary = document.getElementById('analytics-summary');
    this.activityTrend = document.getElementById('activity-trend');
    this.insightsPanel = document.getElementById('insights-panel');
  }

  attachEventListeners() {
    this.signinBtn?.addEventListener('click', () => this.handleSignIn());
    this.historyBtn?.addEventListener('click', () => this.showHistory());
    this.analyticsBtn?.addEventListener('click', () => this.showAnalytics());
    this.webAppBtn?.addEventListener('click', () => this.handleOpenWebApp());
    this.billingBtn?.addEventListener('click', () => this.handleManageBilling());
    this.upgradeBtn?.addEventListener('click', () => this.handleUpgrade());
    this.upgradeCta?.addEventListener('click', () => this.handleUpgrade());
    this.logoutBtn?.addEventListener('click', () => this.handleSignOut());
    this.settingsBtn?.addEventListener('click', () => this.showSettings());
    this.signoutBtn?.addEventListener('click', () => this.handleSignOut());
    this.closeSettingsBtn?.addEventListener('click', () => this.hideSettings());
    
    // Panel close buttons
    this.closeHistoryBtn?.addEventListener('click', () => this.hideHistory());
    this.analyticsBackBtn?.addEventListener('click', () => this.hideAnalytics());
    this.analyticsRetryBtn?.addEventListener('click', () => this.loadAnalytics());
    
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
      
      // Set apiClient in authManager for server validation
      this.authManager.setApiClient(this.apiClient);
      
      // Validate authentication with server to catch cases where user logged out from web app
      let isAuthenticated = await this.authManager.isAuthenticated(true);
      
      // If not authenticated, try to sync from web app
      if (!isAuthenticated) {
        await this.tryAuthSync();
        // Check auth again after sync attempt (validate with server)
        isAuthenticated = await this.authManager.isAuthenticated(true);
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
      
      // Check usage status - distinguish between "no access" and "quota exceeded"
      if (this.usageData) {
        // If status is 'no_access', user has no trial/subscription access
        if (this.usageData.status === 'no_access') {
          // Don't show quota-exceeded for no_access - show authenticated state with upgrade message
          // The upgrade message will guide user to subscribe
          this.setState('authenticated');
        } else if (this.usageData.status === 'trial' || this.usageData.status === 'active') {
          // User has trial or active subscription access
          if (this.usageData.used >= this.usageData.limit) {
            // User has access but quota is exceeded (within trial/subscription period)
            this.setState('quota-exceeded');
          } else {
            // User has access and quota available
            this.setState('authenticated');
          }
        } else {
          // Unknown status - default to authenticated state
          this.setState('authenticated');
        }
      } else {
        // No usage data - default to authenticated state
        this.setState('authenticated');
      }
      
      this.updateUsageDisplay();
      // Fix: Update quick stats cards (Today card) after usage refresh
      this.updateQuickStats();
      
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
    const startTime = Date.now();
    console.log('[LOG][Quality] loadQualityMetrics() invoked at', new Date(startTime).toISOString());
    try {
      console.log('[LOG][Quality] -> requesting /api/quality/metrics?days=30');
      const response = await this.apiClient.getQualityMetrics(DEFAULTS.ANALYTICS_DAYS);
      console.log('[LOG][Quality] <- response received in', Date.now() - startTime, 'ms:', response);
      this.processQualityMetricsResponse(response);
      // Update quick stats after loading quality metrics
      this.updateQuickStats();
      return response;
    } catch (error) {
      console.error('[ERROR][Quality] loadQualityMetrics failed:', error);
      console.error('[ERROR][Quality] stack:', error?.stack);
      this.processQualityMetricsResponse(null);
      return null;
    }
  }

  processQualityMetricsResponse(response) {
    this.qualityMetricsResponse = response;

    if (!response) {
      console.warn('[WARN][Quality] No quality metrics response available');
      this.qualityMetrics = null;
      this.qualityRecommendations = [];
      return;
    }

    const { metrics = null, recommendations = [] } = response;
    console.log('[LOG][Quality] Raw response payload:', response);
    if (metrics) {
      console.log('[LOG][Quality] Extracted metrics:', {
        avg: metrics.avg_quality_score,
        high: metrics.high_quality_replies,
        low: metrics.low_quality_replies,
        regen: metrics.regeneration_rate
      });
    } else {
      console.warn('[WARN][Quality] Metrics object missing in response');
    }
    console.log('[LOG][Quality] Recommendations count:', Array.isArray(recommendations) ? recommendations.length : 0,
      'Sample:', Array.isArray(recommendations) ? recommendations.slice(0, 3) : recommendations);

    this.qualityMetrics = metrics;
    this.qualityRecommendations = Array.isArray(recommendations) ? recommendations : [];

    console.log('[DEBUG][Quality] Normalized metrics stored:', this.qualityMetrics);
    console.log('[DEBUG][Quality] Normalized recommendations stored:', this.qualityRecommendations);
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
        this.logoutBtn?.classList.add('hidden');
        break;
      case 'not-authenticated':
        this.notAuthenticatedState?.classList.remove('hidden');
        this.logoutBtn?.classList.add('hidden');
        break;
      case 'authenticated':
        this.authenticatedState?.classList.remove('hidden');
        this.logoutBtn?.classList.remove('hidden');
        break;
      case 'quota-exceeded':
        this.quotaExceededState?.classList.remove('hidden');
        this.logoutBtn?.classList.remove('hidden');
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
      progressBar.setAttribute('aria-valuetext', `${used} of ${limit} credits used`);
    }

    // Update usage numbers (show credits for limits)
    if (this.usageText) {
      this.usageText.textContent = `${used} / ${limit} credits`;
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

    // Update mode breakdown
    this.updateModeBreakdown();

    // Update quick stats
    this.updateQuickStats();
    
    // Update plan badge after usage data is loaded
    this.updatePlanBadge();
  }

  // formatModeBreakdown() removed - no longer used after collapsible breakdown implementation

  updateModeBreakdown() {
    try {
      const toggle = document.getElementById('breakdown-toggle');
      const btn = document.getElementById('breakdown-btn');
      const content = document.getElementById('breakdown-content');
      const chevron = document.getElementById('breakdown-chevron');
      
      if (!toggle || !btn || !content || !chevron) return;
      
      // Setup click handler (once) - Fix: Added accessibility attributes
      if (!btn.dataset.initialized) {
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', 'breakdown-content');
        
        btn.addEventListener('click', () => {
          const isExpanded = content.style.display !== 'none';
          const newState = !isExpanded;
          content.style.display = newState ? 'block' : 'none';
          chevron.classList.toggle('expanded', newState);
          // Fix: Update aria-expanded for accessibility
          btn.setAttribute('aria-expanded', String(newState));
        });
        btn.dataset.initialized = 'true';
      }
      
      if (this.usageData) {
        const breakdown = this.usageData.modeBreakdown || {};
        const totalCredits = this.usageData.used || 0;
        
        // Build breakdown rows - Fix: Using numeric conversion for XSS safety
        const modes = [
          { key: 'single-sentence', label: 'Concise' },
          { key: 'base', label: 'Balanced' },
          { key: 'enhanced', label: 'Enhanced' },
          { key: 'improve', label: 'Improve' }
        ];
        
        let totalReplies = 0;
        let rows = '';
        
        for (const mode of modes) {
          const data = breakdown[mode.key] || { replies: 0, credits: 0 };
          // Fix: Ensure numeric values to prevent XSS
          const replies = Number(data.replies) || 0;
          const credits = Number(data.credits) || 0;
          totalReplies += replies;
          
          // Fix: Mode label is static, numeric values are safe
          rows += `
            <div class="breakdown-row">
              <span class="breakdown-label">${mode.label}:</span>
              <span class="breakdown-value">${replies} replies, ${credits} credits</span>
            </div>
          `;
        }
        
        // Fix: innerHTML is safe here - mode.label is static, values are numeric
        content.innerHTML = `
          ${rows}
          <div class="breakdown-total">
            Total: ${totalReplies} replies, ${totalCredits} credits
          </div>
        `;
        
        toggle.style.display = 'block';
      } else {
        toggle.style.display = 'none';
      }
    } catch (error) {
      // Fix: Added error handling to prevent crashes
      console.error('[Popup] Failed to update breakdown:', error);
      const toggle = document.getElementById('breakdown-toggle');
      if (toggle) {
        toggle.style.display = 'none';
      }
    }
  }

  formatTimeDistance(date) {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'soon';
    
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    const parts = [];
    if (days > 0) {
      parts.push(`${days}d`);
    }
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0 || parts.length === 0) {
      parts.push(`${minutes}m`);
    }
    
    return `in ${parts.join(' ')}`;
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
      this.settingsPanel.style.display = '';
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
      // Focus back button
      this.analyticsBackBtn?.focus();
    }
    this.loadAnalytics();
    // Start auto-refresh for analytics panel when it's open
    this.startAnalyticsAutoRefresh();
  }

  hideAnalytics() {
    this.analyticsPanel?.classList.add('hidden');
    if (this.analyticsPanel) {
      this.analyticsPanel.style.display = 'none';
      this.analyticsPanel.setAttribute('aria-hidden', 'true');
    }
    // Stop auto-refresh when panel is closed
    this.stopAnalyticsAutoRefresh();
    // Return focus to analytics button
    this.analyticsBtn?.focus();
  }

  startAnalyticsAutoRefresh() {
    // Clear existing interval if any
    if (this.analyticsRefreshInterval) {
      clearInterval(this.analyticsRefreshInterval);
    }
    
    // Refresh analytics data every 30 seconds while panel is open
    this.analyticsRefreshInterval = setInterval(async () => {
      // Only refresh if panel is visible (not hidden)
      if (this.analyticsPanel && !this.analyticsPanel.classList.contains('hidden')) {
        try {
          await this.loadAnalytics();
        } catch (error) {
          console.error('Failed to auto-refresh analytics:', error);
        }
      }
    }, 30000); // 30 seconds
  }

  stopAnalyticsAutoRefresh() {
    if (this.analyticsRefreshInterval) {
      clearInterval(this.analyticsRefreshInterval);
      this.analyticsRefreshInterval = null;
    }
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

  async loadAnalytics(forceRefresh = false) {
    console.log('[Analytics] ========== Loading analytics START ==========');
    console.log('[Analytics] DOM elements check:', {
      loading: !!this.analyticsLoading,
      error: !!this.analyticsError,
      data: !!this.analyticsData,
      summary: !!this.analyticsSummary,
      trend: !!this.activityTrend,
      insights: !!this.insightsPanel
    });
    
    // Show loading state
    if (this.analyticsLoading) {
      this.analyticsLoading.classList.remove('hidden');
      console.log('[Analytics] Showing loading state');
    }
    if (this.analyticsError) this.analyticsError.classList.add('hidden');
    if (this.analyticsData) this.analyticsData.classList.add('hidden');
    
    try {
      console.log('[Analytics] Calling API: /api/analytics/simple?days=30');
      const response = await this.apiClient.getSimpleAnalytics(DEFAULTS.ANALYTICS_DAYS);
      console.log('[Analytics] ✓ API Response received:', JSON.stringify(response, null, 2));
      
      // Validate response structure
      if (!response || !response.summary) {
        throw new Error('Invalid response structure: missing summary');
      }
      
      console.log('[Analytics] Response structure valid');
      
      // Hide loading, show data
      if (this.analyticsLoading) this.analyticsLoading.classList.add('hidden');
      if (this.analyticsData) {
        this.analyticsData.classList.remove('hidden');
        console.log('[Analytics] Showing data container');
      }
      
      // Render all sections
      console.log('[Analytics] Rendering summary...');
      this.renderAnalyticsSummary(response.summary);
      
      console.log('[Analytics] Rendering activity trend...');
      this.renderActivityTrend(response.activityTrend);
      
      console.log('[Analytics] Rendering insights...');
      this.renderInsights(response.insights);
      
      console.log('[Analytics] ========== Loading analytics COMPLETE ==========');
    } catch (error) {
      console.error('[Analytics] ❌ FAILED to load analytics');
      console.error('[Analytics] Error type:', error.constructor.name);
      console.error('[Analytics] Error message:', error.message);
      console.error('[Analytics] Error stack:', error.stack);
      
      // Show error state
      if (this.analyticsLoading) this.analyticsLoading.classList.add('hidden');
      if (this.analyticsError) {
        this.analyticsError.classList.remove('hidden');
        console.log('[Analytics] Showing error state');
      }
      if (this.analyticsData) this.analyticsData.classList.add('hidden');
    }
  }

  renderAnalyticsSummary(summary) {
    if (!this.analyticsSummary) return;
    
    const { avgQuality, qualityTrend, totalReplies, timeSavedHours, highQualityCount } = summary;
    
    const trendIndicator = qualityTrend > 0 ? 
      `<span class="trend-indicator positive">+${qualityTrend} from last period</span>` :
      qualityTrend < 0 ?
      `<span class="trend-indicator negative">${qualityTrend} from last period</span>` :
      '';
    
    // Format time display: show hours if >= 1, otherwise show minutes
    const timeDisplay = timeSavedHours >= 1 
      ? `${timeSavedHours}h` 
      : `${Math.round(timeSavedHours * 60)}m`;
    
    this.analyticsSummary.innerHTML = `
      <h3>Summary</h3>
      <div class="analytics-summary-grid">
        <div class="analytics-summary-card">
          <div class="metric-value">${avgQuality}</div>
          <div class="metric-label">Avg Quality</div>
          ${trendIndicator}
        </div>
        <div class="analytics-summary-card">
          <div class="metric-value">${totalReplies}</div>
          <div class="metric-label">Total Replies</div>
        </div>
        <div class="analytics-summary-card">
          <div class="metric-value">${timeDisplay}</div>
          <div class="metric-label">Time Saved</div>
        </div>
      </div>
    `;
  }

  renderActivityTrend(trend) {
    if (!this.activityTrend) return;
    
    if (trend.length === 0) {
      this.activityTrend.innerHTML = `
        <h3>Activity Trend</h3>
        <p class="empty-state">No activity data available yet</p>
      `;
      return;
    }
    
    // Simple line chart using SVG with axes and count labels
    const maxCount = Math.max(...trend.map(d => d.count), 1);
    const width = 320;
    const height = 180;
    const leftPad = 28;
    const rightPad = 12;
    const topPad = 22;
    const bottomPad = 26;
    const chartWidth = width - leftPad - rightPad;
    const chartHeight = height - topPad - bottomPad;
    const chartBottom = height - bottomPad;
    const chartTop = topPad;

    // Y-axis tick values (0 and a few steps up to maxCount)
    const yTicks = (() => {
      const ticks = [0];
      if (maxCount <= 0) return ticks;
      const step = maxCount <= 5 ? 1 : maxCount <= 20 ? Math.ceil(maxCount / 4) : Math.ceil(maxCount / 4 / 10) * 10;
      for (let v = step; v < maxCount; v += step) ticks.push(v);
      if (maxCount > 0 && ticks[ticks.length - 1] !== maxCount) ticks.push(maxCount);
      return ticks;
    })();

    // Generate points for line (y is count, so 0 at bottom, maxCount at top)
    const getX = (i) => leftPad + (trend.length <= 1 ? 0 : (i / (trend.length - 1)) * chartWidth);
    const getY = (count) => chartBottom - (count / maxCount) * chartHeight;
    const points = trend.map((d, i) => `${getX(i)},${getY(d.count)}`).join(' ');

    const xLabels = trend.map((d, i) => {
      const x = getX(i);
      const dayLabel = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
      return `<text x="${x}" y="${chartBottom + 14}" text-anchor="middle" class="activity-chart-axis" font-size="10">${dayLabel}</text>`;
    }).join('');

    const yLabels = yTicks.map((val) => {
      const y = chartBottom - (val / maxCount) * chartHeight;
      return `<text x="${leftPad - 4}" y="${y + 4}" text-anchor="end" class="activity-chart-axis" font-size="10">${val}</text>`;
    }).join('');

    const countLabels = trend.map((d, i) => {
      const x = getX(i);
      const y = getY(d.count);
      return `<text x="${x}" y="${y - 6}" text-anchor="middle" class="activity-chart-count" font-size="11" font-weight="600">${d.count}</text>`;
    }).join('');

    this.activityTrend.innerHTML = `
      <h3>Activity Trend (Last 7 Days)</h3>
      <div class="activity-chart">
        <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="activityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:#3B82F6;stop-opacity:0.5" />
              <stop offset="100%" style="stop-color:#3B82F6;stop-opacity:0" />
            </linearGradient>
          </defs>
          <!-- Y-axis grid -->
          ${yTicks.map((val) => {
            const y = chartBottom - (val / maxCount) * chartHeight;
            return `<line x1="${leftPad}" y1="${y}" x2="${width - rightPad}" y2="${y}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="2,2"/>`;
          }).join('')}
          <!-- X-axis grid -->
          ${trend.map((_, i) => {
            const x = getX(i);
            return `<line x1="${x}" y1="${chartTop}" x2="${x}" y2="${chartBottom}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="2,2"/>`;
          }).join('')}
          <!-- Axes -->
          <line x1="${leftPad}" y1="${chartTop}" x2="${leftPad}" y2="${chartBottom}" stroke="#94a3b8" stroke-width="1"/>
          <line x1="${leftPad}" y1="${chartBottom}" x2="${width - rightPad}" y2="${chartBottom}" stroke="#94a3b8" stroke-width="1"/>
          <!-- Y-axis labels -->
          ${yLabels}
          <!-- X-axis labels -->
          ${xLabels}
          <!-- Area fill -->
          <polygon points="${leftPad},${chartBottom} ${points} ${width - rightPad},${chartBottom}" fill="url(#activityGradient)" opacity="0.3"/>
          <!-- Line -->
          <polyline points="${points}" fill="none" stroke="#3B82F6" stroke-width="2"/>
          <!-- Count at each day -->
          ${countLabels}
          <!-- Points -->
          ${trend.map((d, i) => {
            const x = getX(i);
            const y = getY(d.count);
            return `<circle cx="${x}" cy="${y}" r="3" fill="#3B82F6"/>`;
          }).join('')}
        </svg>
      </div>
    `;
  }

  renderInsights(insights) {
    if (!this.insightsPanel) return;
    
    if (insights.length === 0) {
      this.insightsPanel.innerHTML = `
        <h3>Insights</h3>
        <p class="empty-state">Generate more replies to unlock insights!</p>
      `;
      return;
    }
    
    const iconMap = {
      success: '✓',
      info: 'ℹ',
      streak: '🔥'
    };
    
    const insightItems = insights.map(insight => {
      const icon = iconMap[insight.type] || 'ℹ';
      return `
        <div class="insight-item">
          <div class="insight-icon ${insight.type}">${icon}</div>
          <div class="insight-text">${this.escapeHtml(insight.text)}</div>
        </div>
      `;
    }).join('');
    
    this.insightsPanel.innerHTML = `
      <h3>Insights</h3>
      <div class="insights-list">
        ${insightItems}
      </div>
    `;
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
      
      // Fix: Prioritize full name (firstName + lastName) over firstName alone
      // Try to extract name from various possible fields
      let name = user.name || user.displayName || user.fullName || 
                 (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName);
      
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

      // Show only first name (first word) in greeting
      name = (name || '').trim().split(/\s+/)[0] || name || 'there';

      // Final fallback
      if (!name) {
        name = 'there';
      }

      // Capitalize first letter only (don't change rest of the name)
      const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
      this.userName.textContent = capitalizedName;
    }
  }

  updatePlanBadge() {
    if (this.planBadge && this.usageData) {
      // Use planCode from usage data (source of truth)
      const planCode = this.usageData.planCode || 'trial';
      const planLabels = {
        'trial': 'Free Trial',
        'weekly': 'Weekly Plan',
        'monthly': 'Monthly Plan',
        'bypass': 'Pro Plan'
      };
      this.planBadge.textContent = planLabels[planCode] || 'Free Plan';
      
      // Update styling based on plan
      this.planBadge.className = 'plan-badge';
      if (planCode === 'weekly' || planCode === 'monthly') {
        this.planBadge.style.background = 'linear-gradient(135deg, #10B981, #059669)';
      } else if (planCode === 'bypass') {
        this.planBadge.style.background = 'linear-gradient(135deg, #8B5CF6, #7C3AED)';
      } else {
        // Ensure free plan uses CSS default (remove any inline styles)
        this.planBadge.style.background = '';
      }

      // Hide "Upgrade to Pro" when user is on a Pro plan
      if (this.upgradeCta) {
        this.upgradeCta.style.display = (planCode === 'bypass' || planCode === 'weekly' || planCode === 'monthly') ? 'none' : '';
      }
    }
  }

  updateQuickStats() {
    // Update today's replies - show 0 if usageData is null
    const used = this.usageData?.used ?? 0;
    if (this.todayReplies) {
      this.todayReplies.textContent = used;
      console.log('[LOG][QuickStats] Today replies updated to', used);
    } else {
      console.warn('[WARN][QuickStats] todayReplies element missing');
    }

    // Update success rate from quality metrics (50-100 scale)
    if (this.successRate) {
      console.log('[LOG][QuickStats] updateQuickStats invoked with metrics:', this.qualityMetrics);
      console.log('[LOG][QuickStats] usageData used replies:', used);
      console.log('[LOG][QuickStats] successRate element exists?', !!this.successRate);
      
      if (this.qualityMetrics && this.qualityMetrics.avg_quality_score !== undefined &&
          this.qualityMetrics.avg_quality_score !== null) {
        // Display as integer (50-100 scale) - even 0 is valid
        const score = Math.round(this.qualityMetrics.avg_quality_score);
        console.log('[LOG][QuickStats] Displaying quality score:', score);
        this.successRate.textContent = score.toString();
      } else {
        console.warn('[WARN][QuickStats] No quality metrics available, falling back to --');
        this.successRate.textContent = '--';
      }

      console.log('[LOG][QuickStats] successRate text now:', this.successRate.textContent);
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
