/**
 * WhitelistService manages email whitelist for bypassing subscription requirements.
 * Reads whitelisted emails from BYPASS_EMAILS environment variable.
 * 
 * IMPORTANT: All configuration values are read dynamically from environment variables.
 * You can update BYPASS_EMAILS, BYPASS_USER_LIMIT, and TRIAL_LIMIT without code changes.
 * For whitelist email changes, restart the server to reload the email list.
 * For limit changes, the new values are read on each request (no restart needed).
 */
class WhitelistService {
  private whitelistedEmails: Set<string>;
  private lastEmailReload: number = 0;
  private readonly EMAIL_RELOAD_INTERVAL = 60000; // Reload emails every 60 seconds
  
  constructor() {
    this.reloadWhitelistEmails();
  }
  
  /**
   * Reloads whitelist emails from environment variable.
   * This allows updating BYPASS_EMAILS without code changes (restart required for immediate effect).
   * For runtime updates, emails are auto-reloaded every 60 seconds.
   */
  private reloadWhitelistEmails(): void {
    const emails = (process.env.BYPASS_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(e => e.length > 0);
    
    // Fix: Add email validation to ensure only valid emails are whitelisted
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails = emails.filter(e => emailRegex.test(e));
    
    if (emails.length !== validEmails.length) {
      const invalidCount = emails.length - validEmails.length;
      console.warn(`[WhitelistService] ${invalidCount} invalid email(s) found in BYPASS_EMAILS and filtered out`);
    }
    
    this.whitelistedEmails = new Set(validEmails);
    this.lastEmailReload = Date.now();
  }
  
  /**
   * Checks if an email is whitelisted to bypass subscription requirements.
   * Automatically reloads email list if more than 60 seconds have passed.
   * @param email - User email address to check
   * @returns true if email is in whitelist, false otherwise
   */
  isWhitelisted(email: string): boolean {
    if (!email) return false;
    
    // Auto-reload emails periodically to support runtime config updates
    const now = Date.now();
    if (now - this.lastEmailReload > this.EMAIL_RELOAD_INTERVAL) {
      this.reloadWhitelistEmails();
    }
    
    return this.whitelistedEmails.has(email.toLowerCase().trim());
  }
  
  /**
   * Gets the bypass limit for whitelisted users.
   * Reads dynamically from BYPASS_USER_LIMIT environment variable.
   * Can be updated without code changes (no restart needed).
   * @returns Number of replies allowed per period for whitelisted users
   */
  getBypassLimit(): number {
    const limit = parseInt(process.env.BYPASS_USER_LIMIT || '10000', 10);
    // Validate limit is positive
    if (isNaN(limit) || limit < 0) {
      console.warn('[WhitelistService] Invalid BYPASS_USER_LIMIT, using default 10000');
      return 10000;
    }
    return limit;
  }
  
  /**
   * Gets the trial limit for regular users.
   * Reads dynamically from TRIAL_LIMIT environment variable.
   * Can be updated without code changes (no restart needed).
   * @returns Number of replies allowed per period for trial users
   */
  getTrialLimit(): number {
    const limit = parseInt(process.env.TRIAL_LIMIT || '50', 10);
    // Validate limit is positive
    if (isNaN(limit) || limit < 0) {
      console.warn('[WhitelistService] Invalid TRIAL_LIMIT, using default 50');
      return 50;
    }
    return limit;
  }
  
  /**
   * Generates an upgrade message based on usage status.
   * @param isWhitelisted - Whether the user is whitelisted
   * @param used - Number of replies used
   * @param limit - Total reply limit
   * @returns Upgrade message string, or empty string if no message needed
   */
  getUpgradeMessage(isWhitelisted: boolean, used: number, limit: number): string {
    if (isWhitelisted) {
      return '';
    }
    
    if (used >= limit) {
      return 'You\'ve used all your trial replies. Upgrade to continue generating replies.';
    }
    
    const remaining = limit - used;
    if (remaining <= 10) {
      return `Only ${remaining} replies left in your trial. Upgrade for unlimited access.`;
    }
    
    return '';
  }
}

export const whitelistService = new WhitelistService();

