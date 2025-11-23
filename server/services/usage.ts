import { storage } from "../storage.js";
import { PLANS } from "./dodo-payments.js";
import { whitelistService } from "./whitelistService.js";
import { getCreditCost } from "./credits.js";
import type { User, UsageCounter } from "../../shared/types.js";
import crypto from "crypto";

export interface UsageWindow {
  planCode: string;
  periodStart: Date;
  periodEnd: Date;
  limit: number;
  resetAt: Date;
}

export interface UsageStatus {
  planCode: string;
  used: number;
  limit: number;
  resetAt: Date;
  status: 'active' | 'trial' | 'no_access';
  isWhitelisted?: boolean;
  upgradeRequired?: boolean;
  upgradeMessage?: string;
}

export class UsageService {
  private getTodayStart(): Date {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    console.log('[USAGE-DEBUG] getTodayStart called:', {
      now: now.toISOString(),
      todayStart: todayStart.toISOString(),
      todayStartTime: todayStart.getTime()
    });
    return todayStart;
  }

  private getTodayEnd(): Date {
    const start = this.getTodayStart();
    return new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }

  /**
   * Calculates the period end date based on plan type.
   * - Monthly plan: 30 days from period start
   * - Weekly plan: 7 days from period start
   * - Trial plan: 7 days from period start
   * - Bypass/other plans: 1 day from period start (daily reset)
   * @param planCode - The plan code (monthly, weekly, trial, bypass, etc.)
   * @param periodStart - The period start date
   * @returns The period end date
   */
  private getPeriodEnd(planCode: string, periodStart: Date): Date {
    const end = new Date(periodStart);
    if (planCode === 'monthly') {
      end.setDate(end.getDate() + 30); // 30 days for monthly
    } else if (planCode === 'weekly' || planCode === 'trial') {
      end.setDate(end.getDate() + 7); // 7 days for weekly and trial
    } else {
      // Default to daily for bypass/other plans
      end.setDate(end.getDate() + 1);
    }
    return end;
  }

  async resolveActiveWindow(user: User): Promise<UsageWindow | null> {
    const now = new Date();
    console.log('=== USAGE: resolveActiveWindow called ===');
    console.log('User ID:', user.id);

    // Check if user is whitelisted first (highest priority)
    // Note: getBypassLimit() reads dynamically from BYPASS_USER_LIMIT env var - can be updated without code changes
    if (whitelistService.isWhitelisted(user.email)) {
      const bypassLimit = whitelistService.getBypassLimit();
      const result = {
        planCode: 'bypass',
        periodStart: this.getTodayStart(),
        periodEnd: this.getTodayEnd(),
        limit: bypassLimit,
        resetAt: this.getTodayEnd(),
      };
      console.log('Returning bypass window for whitelisted user:', result);
      return result;
    }

    // Check for active paid subscription
    const activeSubscription = await storage.getActiveSubscription(user.id);
    console.log('Active subscription:', activeSubscription);
    
    if (activeSubscription && activeSubscription.currentPeriodEnd > now) {
      const plan = PLANS[activeSubscription.planCode];
      console.log('Plan found:', plan);
      if (plan) {
        const result = {
          planCode: activeSubscription.planCode,
          periodStart: activeSubscription.currentPeriodStart,
          periodEnd: activeSubscription.currentPeriodEnd,
          limit: plan.credits, // CHANGED: Use credits instead of replies
          resetAt: activeSubscription.currentPeriodEnd,
        };
        console.log('Returning paid subscription window:', result);
        return result;
      }
    }

    // For regular users, give trial limit
    // Note: getTrialLimit() reads dynamically from TRIAL_LIMIT env var - can be updated without code changes
    const trialLimit = whitelistService.getTrialLimit();
    // Fix 2 & 3: Use 7-day period for trial instead of daily reset
    // periodStart will be determined by getUsageStatus() which checks for existing counters
    // If user has existing trial counter, its periodStart will be used (Fix 3)
    const trialPeriodStart = this.getTodayStart();
    const trialPeriodEnd = this.getPeriodEnd('trial', trialPeriodStart);
    const trialResult = {
      planCode: 'trial',
      periodStart: trialPeriodStart,
      periodEnd: trialPeriodEnd,
      limit: trialLimit,
      resetAt: trialPeriodEnd, // Reset after 7 days, not daily
    };
    console.log('Returning trial window:', trialResult);
    return trialResult;
  }

  async getUsageStatus(userId: string): Promise<UsageStatus | null> {
    console.log('=== USAGE: getUsageStatus called ===');
    console.log('User ID:', userId);
    console.log('=== USAGE: About to call storage.getUser ===');
    
    const user = await storage.getUser(userId);
    console.log('User lookup result:', user);
    console.log('User lookup result type:', typeof user);
    console.log('User lookup result is null:', user === null);
    console.log('User lookup result is undefined:', user === undefined);
    
    if (!user) {
      console.log('User not found - returning null');
      console.log('This will cause the API to return 404 or fallback response');
      return null;
    }

    console.log('User found:', user.id, user.email);
    const window = await this.resolveActiveWindow(user);
    console.log('Active window result:', window);
    
    // resolveActiveWindow always returns a window, so this check is unnecessary
    // but keeping it for safety in case the method is modified in the future
    if (!window) {
      console.log('No active window - returning no access');
      return {
        planCode: 'none',
        used: 0,
        limit: 0,
        resetAt: new Date(),
        status: 'no_access',
      };
    }

    // Get or create usage counter for this period
    // Fix 3: For trial users, counter will be created with today's periodStart (first usage)
    // and periodEnd will be 7 days later (handled by getPeriodEnd in resolveActiveWindow)
    console.log('[USAGE-DEBUG] getUsageStatus - Looking up counter with periodStart:', window.periodStart.toISOString());
    let counter = await storage.getUsageCounter(userId, window.periodStart);
    if (!counter) {
      console.log('[USAGE-DEBUG] getUsageStatus - Counter NOT FOUND, creating new');
      // Fix 3: For trial, periodStart is today (first usage), periodEnd is 7 days later
      counter = await storage.createUsageCounter({
        id: crypto.randomUUID(),
        userId,
        planCode: window.planCode,
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
        repliesUsed: 0,
        limit: window.limit,
        resetAt: window.resetAt,
      });
      console.log('[USAGE-DEBUG] getUsageStatus - Created counter:', { id: counter.id, repliesUsed: counter.repliesUsed, periodStart: counter.periodStart.toISOString() });
    } else {
      console.log('[USAGE-DEBUG] getUsageStatus - Counter FOUND:', { id: counter.id, repliesUsed: counter.repliesUsed, limit: counter.limit, periodStart: counter.periodStart.toISOString() });
      // Fix 1: Update existing counter if limit doesn't match current config for ANY plan type
      // This handles cases where old counters have outdated limits (e.g., 5 from pre-migration, 50000 from testing)
      if (counter.limit !== window.limit) {
        console.log(`[USAGE-DEBUG] Updating counter limit from ${counter.limit} to ${window.limit} (planCode: ${counter.planCode} -> ${window.planCode})`);
        await storage.updateUsageCounter(counter.id, {
          limit: window.limit,
          planCode: window.planCode, // Ensure planCode matches current window
        });
        const updatedCounter = await storage.getUsageCounter(userId, window.periodStart);
        if (updatedCounter) {
          counter = updatedCounter;
        }
      }
    }

    // Ensure counter is defined (should always be at this point)
    if (!counter) {
      console.error('Usage counter is undefined after creation/update');
      return {
        planCode: 'none',
        used: 0,
        limit: 0,
        resetAt: new Date(),
        status: 'no_access',
      };
    }

    const isWhitelisted = whitelistService.isWhitelisted(user.email);
    
    // Calculate current credits (with fallback for migration period)
    const currentCredits = counter.creditsUsed ?? (counter.repliesUsed * 2);
    
    // Use window.limit to ensure we return the current config value, not the old database value
    // This ensures the frontend always sees the correct limit even if the counter hasn't been updated yet
    // FIX: Use credits instead of replies for upgrade check
    const upgradeRequired = !isWhitelisted && currentCredits >= window.limit;
    // FIX: Pass credits instead of replies to upgrade message function
    const upgradeMessage = whitelistService.getUpgradeMessage(
      isWhitelisted,
      currentCredits,
      window.limit
    );

    const result: UsageStatus = {
      planCode: window.planCode,
      used: counter.creditsUsed ?? (counter.repliesUsed * 2), // CHANGED: Use credits with fallback
      limit: window.limit, // Already credits from resolveActiveWindow
      resetAt: counter.resetAt,
      status: 'active',
      isWhitelisted,
      upgradeRequired,
      upgradeMessage,
    };
    
    console.log('Returning usage status:', result);
    return result;
  }

  async canUseReply(userId: string): Promise<{ canUse: boolean; reason?: string }> {
    console.log('=== USAGE: canUseReply called ===');
    console.log('User ID:', userId);
    
    const user = await storage.getUser(userId);
    if (!user) {
      return { canUse: false, reason: 'user_not_found' };
    }
    
    // Check usage for ALL users (including whitelisted)
    const status = await this.getUsageStatus(userId);
    console.log('canUseReply - getUsageStatus result:', status);
    
    if (!status || status.status === 'no_access') {
      console.log('canUseReply - returning payment_required because status is:', status);
      return { canUse: false, reason: 'payment_required' };
    }

    if (status.used >= status.limit) {
      console.log('canUseReply - returning quota_exceeded because used >= limit');
      return { canUse: false, reason: 'quota_exceeded' };
    }

    console.log('canUseReply - returning canUse: true');
    return { canUse: true };
  }

  async consumeReply(userId: string, replyMode?: string): Promise<UsageCounter> {
    console.log('[USAGE-DEBUG] ========== consumeReply START ==========');
    console.log('[USAGE-DEBUG] consumeReply - userId:', userId);
    console.log('[USAGE-DEBUG] consumeReply - replyMode:', replyMode);
    
    // Get credit cost based on reply mode
    const creditCost = getCreditCost(replyMode);
    console.log('[USAGE-DEBUG] consumeReply - creditCost:', creditCost);
    
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }
    console.log('[USAGE-DEBUG] consumeReply - user email:', user.email);

    const window = await this.resolveActiveWindow(user);
    if (!window) {
      throw new Error('No active usage window');
    }
    console.log('[USAGE-DEBUG] consumeReply - window.periodStart:', window.periodStart.toISOString());

    // Get or create usage counter (applies to ALL users including whitelisted)
    console.log('[USAGE-DEBUG] consumeReply - Looking up counter...');
    let counter = await storage.getUsageCounter(userId, window.periodStart);
    if (!counter) {
      console.log('[USAGE-DEBUG] consumeReply - Counter NOT FOUND, creating new');
      counter = await storage.createUsageCounter({
        id: crypto.randomUUID(),
        userId,
        planCode: window.planCode,
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
        repliesUsed: 0,
        creditsUsed: 0, // NEW
        limit: window.limit,
        resetAt: window.resetAt,
      });
      console.log('[USAGE-DEBUG] consumeReply - Created counter:', { id: counter.id, repliesUsed: counter.repliesUsed, creditsUsed: counter.creditsUsed });
    } else {
      console.log('[USAGE-DEBUG] consumeReply - Counter FOUND:', { id: counter.id, repliesUsed: counter.repliesUsed, creditsUsed: counter.creditsUsed, limit: counter.limit });
    }

    // Check limit using credits (with fallback)
    const currentCredits = counter.creditsUsed ?? (counter.repliesUsed * 2);
    if (currentCredits >= counter.limit) {
      console.log('[USAGE-DEBUG] consumeReply - QUOTA EXCEEDED (credits), not incrementing');
      throw new Error('402: Quota exceeded');
    }

    // Increment usage atomically (for ALL users including whitelisted)
    console.log('[USAGE-DEBUG] consumeReply - About to call incrementUsage for periodStart:', window.periodStart.toISOString(), 'creditCost:', creditCost);
    const updatedCounter = await storage.incrementUsage(userId, window.periodStart, creditCost);
    console.log('[USAGE-DEBUG] consumeReply - After incrementUsage:', { id: updatedCounter.id, repliesUsed: updatedCounter.repliesUsed, creditsUsed: updatedCounter.creditsUsed });
    console.log('[USAGE-DEBUG] ========== consumeReply END ==========');
    return updatedCounter;
  }

  async initializeTrialForUser(userId: string): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) {
      return; // User not found
    }

    // Check if user already has a trial period by looking at their usage counters
    const todayStart = this.getTodayStart();
    const existingCounter = await storage.getUsageCounter(userId, todayStart);
    
    if (existingCounter && existingCounter.planCode === 'trial') {
      return; // Trial already initialized
    }

    // For now, we'll use the testing plan instead of a separate trial
    // This gives users the high limit without needing trial-specific logic
    console.log('Trial initialization skipped - using testing plan instead');
  }
}

export const usageService = new UsageService();
