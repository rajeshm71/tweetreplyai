/**
 * WhitelistService manages email whitelist for bypassing subscription requirements.
 * Reads whitelisted emails from BYPASS_EMAILS environment variable.
 *
 * You can update BYPASS_EMAILS and BYPASS_USER_LIMIT without code changes (env vars).
 * Trial limit is read from shared config (PLAN_LIMITS.trial.credits), same as client display.
 * For whitelist email changes, restart the server to reload the email list.
 */
import { WHITELIST } from "../config/constants.js";
import { PLAN_LIMITS } from "../../shared/constants.js";

class WhitelistService {
  private whitelistedEmails: Set<string>;
  private lastEmailReload: number = 0;
  private readonly EMAIL_RELOAD_INTERVAL = WHITELIST.EMAIL_RELOAD_INTERVAL_MS;
  
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
   * @returns Number of credits allowed per period for whitelisted users (BYPASS_USER_LIMIT now represents credits, not replies)
   */
  getBypassLimit(): number {
    // BYPASS_USER_LIMIT now represents credits, not replies
    const limit = parseInt(process.env.BYPASS_USER_LIMIT || '10000', 10);
    // Validate limit is positive and not zero
    if (isNaN(limit) || limit < 0) {
      console.warn('[WhitelistService] Invalid BYPASS_USER_LIMIT, using default 10000');
      return 10000;
    }
    // Explicitly prevent returning 0 (even if env var is explicitly set to "0") - FIX: Added for consistency with getTrialLimit()
    if (limit === 0) {
      console.warn('[WhitelistService] BYPASS_USER_LIMIT is 0, using default 10000');
      return 10000;
    }
    return limit;
  }

  /**
   * Gets the trial limit for regular users from shared config (single source with client display).
   * @returns Number of credits allowed per period for trial users (PLAN_LIMITS.trial.credits)
   */
  getTrialLimit(): number {
    return PLAN_LIMITS.trial.credits;
  }
  
  /**
   * Generates an upgrade message based on usage status.
   * @param isWhitelisted - Whether the user is whitelisted
   * @param used - Number of credits used (FIX: Updated from replies to credits)
   * @param limit - Total credit limit (FIX: Updated from reply limit to credit limit)
   * @returns Upgrade message string, or empty string if no message needed
   */
  getUpgradeMessage(isWhitelisted: boolean, used: number, limit: number): string {
    if (isWhitelisted) {
      return '';
    }
    
    if (used >= limit) {
      // FIX: Updated message to say "credits" instead of "replies"
      return 'You\'ve used all your credits. Upgrade to continue generating replies.';
    }
    
    const remaining = limit - used;
    if (remaining <= WHITELIST.LOW_CREDITS_WARNING_THRESHOLD) {
      // FIX: Updated message to say "credits" instead of "replies"
      return `Only ${remaining} credits left in your trial. Upgrade for unlimited access.`;
    }
    
    return '';
  }
}

export const whitelistService = new WhitelistService();

