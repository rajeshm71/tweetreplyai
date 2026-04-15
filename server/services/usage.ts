// Import storage directly to avoid bundling issues with re-exports
import { storage } from "../storage-supabase.js";
import { PLANS } from "./dodo-payments.js";
import { whitelistService } from "./whitelistService.js";
import { getCreditCost } from "./credits.js";
import type { User, UsageCounter } from "../../shared/types.js";
import { deriveReplyUsageFromCredits } from "../../shared/usage-breakdown.js";
import crypto from "crypto";
import { PERIODS, WHITELIST } from "../config/constants.js";

interface UsageWindow {
  planCode: string;
  periodStart: Date;
  periodEnd: Date;
  limit: number;
  resetAt: Date;
  /** True when access is from a canceled sub still inside current_period_end (UI: "Ends" not "Resets"). */
  subscriptionCanceled?: boolean;
}

export interface UsageStatus {
  planCode: string;
  used: number;
  limit: number;
  resetAt: Date;
  status: 'active' | 'trial' | 'no_access';
  isWhitelisted?: boolean;
  /** When true, extension shows model dropdown (config + whitelist). */
  showModelSelect?: boolean;
  upgradeRequired?: boolean;
  upgradeMessage?: string;
  /** Paid access from canceled subscription until period end; clients show "Ends in …" instead of "Resets …". */
  subscriptionCanceled?: boolean;
  modeBreakdown?: {
    'single-sentence'?: { credits: number; replies?: number };
    'enhanced'?: { credits: number; replies?: number };
    'improve'?: { credits: number; replies?: number };
  };
}

export class UsageService {
  private getTodayStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
      end.setDate(end.getDate() + PERIODS.MONTHLY_DAYS);
    } else if (planCode === 'weekly' || planCode === 'trial') {
      end.setDate(end.getDate() + PERIODS.WEEKLY_DAYS);
    } else {
      end.setDate(end.getDate() + PERIODS.DAILY_DAYS);
    }
    return end;
  }

  async resolveActiveWindow(user: User): Promise<UsageWindow | null> {
    const now = new Date();

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
      return result;
    }

    // Check for active paid subscription
    const activeSubscription = await storage.getActiveSubscription(user.id);
    
    if (activeSubscription) {
      const subStatus = activeSubscription.status;
      const statusJson = JSON.stringify(subStatus);
      const statusLen = typeof subStatus === 'string' ? subStatus.length : null;
      console.log('[UsageDiag] resolveActiveWindow subscription row', {
        userId: user.id,
        subscriptionId: activeSubscription.id,
        planCode: activeSubscription.planCode,
        statusJson,
        statusLen,
        currentPeriodEndISO: activeSubscription.currentPeriodEnd.toISOString(),
        periodEndAfterNow: activeSubscription.currentPeriodEnd > now,
        strictEqualsCanceled: subStatus === 'canceled',
      });

      // If subscription is canceled and period has ended, user loses access (no trial fallback)
      if (activeSubscription.status === 'canceled' && activeSubscription.currentPeriodEnd <= now) {
        console.log('[UsageDiag] resolveActiveWindow branch canceled_period_expired_return_null', {
          userId: user.id,
        });
        return null;
      }
      
      // If subscription is active and period hasn't ended, grant access
      if (activeSubscription.currentPeriodEnd > now) {
        const plan = PLANS[activeSubscription.planCode];
        if (plan) {
          const result = {
            planCode: activeSubscription.planCode,
            periodStart: activeSubscription.currentPeriodStart,
            periodEnd: activeSubscription.currentPeriodEnd,
            limit: plan.credits, // CHANGED: Use credits instead of replies
            resetAt: activeSubscription.currentPeriodEnd,
            subscriptionCanceled: activeSubscription.status === 'canceled',
          };
          console.log('[UsageDiag] resolveActiveWindow return paid_window', {
            userId: user.id,
            planCode: result.planCode,
            subscriptionCanceled: result.subscriptionCanceled,
            resetAtISO: result.resetAt.toISOString(),
          });
          return result;
        }
        console.log('[UsageDiag] resolveActiveWindow branch unknown_plan_code_falling_through', {
          userId: user.id,
          planCode: activeSubscription.planCode,
        });
      } else {
        console.log('[UsageDiag] resolveActiveWindow branch subscription_period_end_not_after_now_falling_through', {
          userId: user.id,
          subscriptionId: activeSubscription.id,
        });
      }
      console.log('[UsageDiag] resolveActiveWindow falling_through_after_subscription_row', {
        userId: user.id,
      });
    }

    // FIRST: Check for active trial counter (before checking hasUsedTrial flag)
    // This allows users to continue their existing trial even if flag is set
    const activeTrialCounter = await storage.getActiveTrialCounter(user.id);
    if (activeTrialCounter && activeTrialCounter.periodEnd > now) {
      // Always use current config limit for trial (single source of truth); ignore stale counter.limit from DB
      const result = {
        planCode: 'trial',
        periodStart: activeTrialCounter.periodStart,
        periodEnd: activeTrialCounter.periodEnd,
        limit: whitelistService.getTrialLimit(),
        resetAt: activeTrialCounter.resetAt,
      };
      return result;
    }

    // ONLY THEN: Check if user has already used trial - if so, no access
    // This prevents new trials for users who have completed their trial
    if (user.hasUsedTrial) {
      return null;
    }

    // For regular users who haven't used trial, give trial limit from shared config (same as client display)
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
    return trialResult;
  }

  async getUsageStatus(userId: string): Promise<UsageStatus | null> {
    const user = await storage.getUser(userId);
    if (!user) return null;

    const window = await this.resolveActiveWindow(user);
    
    // resolveActiveWindow always returns a window, so this check is unnecessary
    // but keeping it for safety in case the method is modified in the future
    if (!window) {
      // Note: limit: 0 is intentional for "no_access" status (user has used trial and has no active subscription)
      return {
        planCode: 'none',
        used: 0,
        limit: 0, // Intentional: indicates no access
        resetAt: new Date(),
        status: 'no_access',
      };
    }

    // Get or create usage counter for this period
    // Note: window.periodStart comes from either:
    // 1. activeTrialCounter.periodStart (if active trial exists in resolveActiveWindow)
    // 2. getTodayStart() (if new trial is being created)
    // This ensures getUsageCounter() finds the correct counter or creates one with matching periodStart
    // Fix 3: For trial users, counter will be created with today's periodStart (first usage)
    // and periodEnd will be 7 days later (handled by getPeriodEnd in resolveActiveWindow)
    let counter = await storage.getUsageCounter(userId, window.periodStart);
    if (!counter) {
      if (window.limit <= 0) {
        console.error('[Usage] Invalid window limit:', window.limit);
        // Return no_access status instead of throwing to provide better UX
        return {
          planCode: 'none',
          used: 0,
          limit: 0,
          resetAt: new Date(),
          status: 'no_access',
        };
      }
      
      // Fix 3: For trial, periodStart is today (first usage), periodEnd is 7 days later
      counter = await storage.createUsageCounter({
        id: crypto.randomUUID(),
        userId,
        planCode: window.planCode,
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
        creditsUsed: 0,
        limit: window.limit,
        resetAt: window.resetAt,
        modeBreakdown: {}, // Initialize with empty breakdown object
      });
      
    } else {
      if (counter.limit !== window.limit && window.limit > 0 && counter.limit > 0) {
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

    if (!counter) {
      return {
        planCode: 'none',
        used: 0,
        limit: 0,
        resetAt: new Date(),
        status: 'no_access',
      };
    }

    const isWhitelisted = whitelistService.isWhitelisted(user.email);
    
    const currentCredits = counter.creditsUsed ?? 0;
    
    // Set hasUsedTrial flag when trial period ends OR limit is reached
    if (counter.planCode === 'trial' && !user.hasUsedTrial) {
      const now = new Date();
      const trialExpired = counter.periodEnd <= now;
      const trialLimit = whitelistService.getTrialLimit();
      const limitReached = (counter.creditsUsed ?? 0) >= trialLimit;
      
      // Mark trial as "used" when period expires OR limit is reached
      if (trialExpired || limitReached) {
        try {
          await storage.updateUser(userId, { hasUsedTrial: true });
        } catch (error) {
          console.error('[Usage] Failed to mark trial as used:', error);
          // Don't throw - allow user to continue, but log the error for monitoring
        }
      }
    }
    
    // For trial, always use config limit (single source of truth). Otherwise use counter/window limit.
    const finalLimit = window.planCode === 'trial'
      ? whitelistService.getTrialLimit()
      : (counter.limit > 0 ? counter.limit : window.limit);

    if (finalLimit <= 0) {
      console.error('[Usage] Both counter and window limits are invalid, treating as no_access', {
        counterLimit: counter.limit,
        windowLimit: window.limit,
      });
      return {
        planCode: 'none',
        used: 0,
        limit: 0,
        resetAt: new Date(),
        status: 'no_access',
      };
    }
    const upgradeRequired = !isWhitelisted && currentCredits >= finalLimit;
    // FIX: Pass credits instead of replies to upgrade message function
    const upgradeMessage = whitelistService.getUpgradeMessage(
      isWhitelisted,
      currentCredits,
      finalLimit
    );

    const derivedUsage = deriveReplyUsageFromCredits(counter.modeBreakdown);

    const result: UsageStatus = {
      planCode: window.planCode,
      used: counter.creditsUsed ?? 0,
      limit: finalLimit, // Use counter.limit (source of truth) with window.limit fallback
      resetAt: counter.resetAt,
      status: 'active',
      isWhitelisted,
      showModelSelect: WHITELIST.SHOW_MODEL_SELECT_FOR_WHITELIST && isWhitelisted,
      upgradeRequired,
      upgradeMessage,
      subscriptionCanceled: window.subscriptionCanceled === true,
      // Include per-mode derived replies for display while keeping credits authoritative for quota.
      modeBreakdown: derivedUsage.modeBreakdown,
    };

    console.log('[UsageDiag] getUsageStatus returning active', {
      userId,
      planCode: result.planCode,
      subscriptionCanceled: result.subscriptionCanceled,
      windowSubscriptionCanceled: window.subscriptionCanceled === true,
    });
    
    return result;
  }

  async canUseReply(userId: string): Promise<{ canUse: boolean; reason?: string }> {
    const user = await storage.getUser(userId);
    if (!user) {
      return { canUse: false, reason: 'user_not_found' };
    }

    const status = await this.getUsageStatus(userId);
    if (!status || status.status === 'no_access') {
      return { canUse: false, reason: 'payment_required' };
    }

    if (status.used >= status.limit) {
      return { canUse: false, reason: 'quota_exceeded' };
    }

    return { canUse: true };
  }

  async consumeReply(userId: string, replyMode?: string): Promise<UsageCounter> {
    const creditCost = getCreditCost(replyMode);
    const user = await storage.getUser(userId);
    if (!user) throw new Error('User not found');

    const window = await this.resolveActiveWindow(user);
    if (!window) throw new Error('No active usage window');
    let counter = await storage.getUsageCounter(userId, window.periodStart);
    if (!counter) {
      counter = await storage.createUsageCounter({
        id: crypto.randomUUID(),
        userId,
        planCode: window.planCode,
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
        creditsUsed: 0,
        limit: window.limit,
        resetAt: window.resetAt,
        modeBreakdown: {},
      });
    }

    const currentCredits = counter.creditsUsed ?? 0;
    if (currentCredits >= counter.limit) {
      throw new Error('402: Quota exceeded');
    }

    // Pass counter so storage updates by id, avoiding read-after-write when counter was just created
    return await storage.incrementUsage(userId, window.periodStart, creditCost, replyMode, counter);
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

  }
}

export const usageService = new UsageService();
