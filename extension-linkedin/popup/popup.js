import { AuthManager } from '../utils/auth.js';
import { ApiClient } from '../utils/api.js';
import { POLLING, DEFAULTS } from '../config/constants.js';

class LinkedInPopupManager {
  constructor() {
    this.authManager = new AuthManager();
    this.apiClient = new ApiClient();
    this.currentState = 'loading';
    this.usageData = null;
    this.usageDataInterval = null;
    this.focusHandler = null;
    this.beforeunloadHandler = null;

    this.initializeElements();
    this.attachEventListeners();
    this.setupAuthListener();
    this.setupDataRefresh();
    this.initialize();
  }

  setupAuthListener() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'authUpdated') {
        this.initialize();
      }
    });
  }

  setupDataRefresh() {
    this.startUsageDataRefresh();
    this.setupFocusRefresh();
    this.setupCleanup();
  }

  /** Returns false if the extension context is invalid (e.g. after reload). */
  isExtensionContextValid() {
    try {
      void chrome.runtime?.id;
      return true;
    } catch {
      return false;
    }
  }

  /** True if the error indicates we should stop the refresh loop (context dead or unreachable). */
  shouldStopRefreshLoop(error) {
    const msg = (error?.message || String(error)).toLowerCase();
    return (
      msg.includes('extension context invalidated') ||
      msg.includes('invalid') ||
      msg.includes('could not establish connection') ||
      msg.includes('receiving end does not exist') ||
      msg.includes('err_failed') ||
      msg.includes('failed to fetch')
    );
  }

  startUsageDataRefresh() {
    if (this.usageDataInterval) clearInterval(this.usageDataInterval);

    this.usageDataInterval = setInterval(async () => {
      if (!this.isExtensionContextValid()) {
        if (this.usageDataInterval) clearInterval(this.usageDataInterval);
        this.usageDataInterval = null;
        return;
      }
      if (this.currentState === 'authenticated') {
        try {
          await this.loadUsageData();
          this.updateUsageDisplay();
        } catch (error) {
          console.error('[LinkedInPopup] Failed to refresh usage data:', error);
          if (this.shouldStopRefreshLoop(error)) {
            if (this.usageDataInterval) clearInterval(this.usageDataInterval);
            this.usageDataInterval = null;
          }
        }
      }
    }, POLLING.USAGE_REFRESH_MS);
  }

  setupFocusRefresh() {
    this.focusHandler = async () => {
      if (this.currentState === 'authenticated') {
        try {
          await this.loadUsageData();
          this.updateUsageDisplay();
        } catch (error) {
          console.error('[LinkedInPopup] Focus refresh failed:', error);
        }
      }
    };
    window.addEventListener('focus', this.focusHandler);
  }

  setupCleanup() {
    this.beforeunloadHandler = () => {
      if (this.usageDataInterval) clearInterval(this.usageDataInterval);
      if (this.focusHandler) window.removeEventListener('focus', this.focusHandler);
    };
    window.addEventListener('beforeunload', this.beforeunloadHandler);
  }

  initializeElements() {
    this.elements = {
      notAuthenticated: document.getElementById('not-authenticated'),
      loading: document.getElementById('loading'),
      authenticated: document.getElementById('authenticated'),
      signinBtn: document.getElementById('signin-btn'),
      logoutBtn: document.getElementById('logout-btn'),
      settingsBtn: document.getElementById('settings-btn'),
      settingsPanel: document.getElementById('settings-panel'),
      userName: document.getElementById('user-name'),
      planBadge: document.getElementById('plan-badge'),
      usageFill: document.getElementById('usage-fill'),
      usageUsed: document.getElementById('usage-used'),
      usageLimit: document.getElementById('usage-limit'),
      usageResetTime: document.getElementById('usage-reset-time'),
      quotaBanner: document.getElementById('quota-banner'),
      quotaBannerUsed: document.getElementById('quota-banner-used'),
      quotaBannerLimit: document.getElementById('quota-banner-limit'),
      quotaBannerBtn: document.getElementById('quota-banner-btn'),
      promptSelect: document.getElementById('prompt-select'),
      upgradeBtn: document.getElementById('upgrade-btn'),
      settingsPlanName: document.getElementById('settings-plan-name'),
      openLinkedInBtn: document.getElementById('open-linkedin-btn'),
    };
  }

  attachEventListeners() {
    this.elements.signinBtn?.addEventListener('click', () => this.handleSignIn());
    this.elements.logoutBtn?.addEventListener('click', () => this.handleLogout());
    this.elements.settingsBtn?.addEventListener('click', () => this.toggleSettings());
    this.elements.upgradeBtn?.addEventListener('click', () => this.handleUpgrade());
    this.elements.quotaBannerBtn?.addEventListener('click', () => this.handleUpgrade());
    this.elements.openLinkedInBtn?.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://www.linkedin.com/feed/' });
    });

    this.elements.promptSelect?.addEventListener('change', (e) => {
      chrome.storage.local.set({ liPromptVariation: e.target.value });
    });
  }

  async initialize() {
    this.showState('loading');

    try {
      this.authManager.setApiClient(this.apiClient);
      const isAuth = await this.authManager.isAuthenticated(true);

      if (!isAuth) {
        this.showState('not-authenticated');
        return;
      }

      await this.loadUserData();
      await this.loadUsageData();
      await this.loadSavedSettings();
      this.updateUsageDisplay();
      this.showState('authenticated');
    } catch (error) {
      console.error('[LinkedInPopup] Initialization failed:', error);
      this.showState('not-authenticated');
    }
  }

  async loadUserData() {
    try {
      const user = await this.apiClient.getCurrentUser();
      if (this.elements.userName) {
        this.elements.userName.textContent =
          user?.displayName || user?.name || user?.email?.split('@')[0] || 'there';
      }

      const planName = user?.plan?.name || user?.planCode || 'Free';
      if (this.elements.planBadge) {
        this.elements.planBadge.textContent = `${planName} Plan`;
      }
      if (this.elements.settingsPlanName) {
        this.elements.settingsPlanName.textContent = planName;
      }

      const isPaid = planName.toLowerCase() !== 'free';
      this.elements.upgradeBtn?.classList.toggle('hidden', isPaid);
    } catch (error) {
      console.error('[LinkedInPopup] Failed to load user data:', error);
    }
  }

  async loadUsageData() {
    try {
      this.usageData = await this.apiClient.getUsage();
    } catch (error) {
      console.error('[LinkedInPopup] Failed to load usage data:', error);
    }
  }

  async loadSavedSettings() {
    const result = await chrome.storage.local.get(['liPromptVariation']);
    if (result.liPromptVariation && this.elements.promptSelect) {
      this.elements.promptSelect.value = result.liPromptVariation;
    }
  }

  updateUsageDisplay() {
    if (!this.usageData) return;

    const used = this.usageData.creditsUsed ?? this.usageData.used ?? 0;
    const limit = this.usageData.limit ?? 0;
    const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    const nearLimit = percentage >= 80;
    const atLimit = percentage >= 100;

    if (this.elements.usageUsed) this.elements.usageUsed.textContent = used;
    if (this.elements.usageLimit) this.elements.usageLimit.textContent = limit;

    if (this.elements.usageFill) {
      this.elements.usageFill.style.width = `${percentage}%`;
      this.elements.usageFill.style.backgroundColor = atLimit
        ? 'var(--color-error)'
        : nearLimit
          ? 'var(--color-warning)'
          : 'var(--color-primary-500)';
    }

    if (this.usageData.resetAt) {
      const resetDate = new Date(this.usageData.resetAt);
      const now = new Date();
      const diffMs = resetDate - now;
      const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
      if (this.elements.usageResetTime) {
        this.elements.usageResetTime.textContent =
          diffHours <= 1 ? 'in <1 hour' : diffHours <= 24 ? `in ${diffHours}h` : resetDate.toLocaleDateString();
      }
    }

    if (this.elements.quotaBanner) {
      const showBanner = atLimit || nearLimit;
      this.elements.quotaBanner.classList.toggle('hidden', !showBanner);
      if (this.elements.quotaBannerUsed) this.elements.quotaBannerUsed.textContent = used;
      if (this.elements.quotaBannerLimit) this.elements.quotaBannerLimit.textContent = limit;
    }
  }

  toggleSettings() {
    const isHidden = this.elements.settingsPanel?.classList.contains('hidden');
    this.elements.settingsPanel?.classList.toggle('hidden', !isHidden);
    this.elements.settingsBtn?.setAttribute('aria-expanded', String(isHidden));
  }

  async handleSignIn() {
    chrome.runtime.sendMessage({ action: 'openLoginPage' });
  }

  async handleLogout() {
    await this.authManager.signOut();
    this.showState('not-authenticated');
  }

  async handleUpgrade() {
    try {
      const portalUrl = await this.apiClient.createBillingPortal();
      if (portalUrl) {
        chrome.tabs.create({ url: portalUrl });
      }
    } catch (error) {
      chrome.tabs.create({ url: 'https://tweetreplyai.vercel.app/pricing' });
    }
  }

  showState(state) {
    this.currentState = state;
    const states = {
      'not-authenticated': this.elements.notAuthenticated,
      loading: this.elements.loading,
      authenticated: this.elements.authenticated,
    };

    Object.entries(states).forEach(([key, el]) => {
      el?.classList.toggle('hidden', key !== state);
    });

    if (state === 'authenticated') {
      this.elements.logoutBtn?.classList.remove('hidden');
    } else {
      this.elements.logoutBtn?.classList.add('hidden');
    }
  }
}

new LinkedInPopupManager();
