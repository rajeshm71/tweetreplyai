import { storage } from "../storage.js";
import { PLANS } from "./stripe.js";
import { whitelistService } from "./whitelistService.js";
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
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  private getTodayEnd(): Date {
    const start = this.getTodayStart();
    return new Date(start.getTime() + 24 * 60 * 60 * 1000);
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
          limit: plan.replies,
          resetAt: activeSubscription.currentPeriodEnd,
        };
        console.log('Returning paid subscription window:', result);
        return result;
      }
    }

    // For regular users, give trial limit
    // Note: getTrialLimit() reads dynamically from TRIAL_LIMIT env var - can be updated without code changes
    const trialLimit = whitelistService.getTrialLimit();
    const trialResult = {
      planCode: 'trial',
      periodStart: this.getTodayStart(),
      periodEnd: this.getTodayEnd(),
      limit: trialLimit,
      resetAt: this.getTodayEnd(),
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
    let counter = await storage.getUsageCounter(userId, window.periodStart);
    if (!counter) {
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
    } else {
      // Fix: Update existing counter if limit doesn't match current config
      // This handles cases where old counters have outdated limits (e.g., 50000 from testing)
      if (counter.planCode === 'trial' || counter.planCode === 'testing') {
        const currentTrialLimit = whitelistService.getTrialLimit();
        if (counter.limit !== currentTrialLimit) {
          // Update the counter with the current trial limit
          await storage.updateUsageCounter(counter.id, {
            limit: currentTrialLimit,
            planCode: 'trial', // Ensure planCode is 'trial' not 'testing'
          });
          const updatedCounter = await storage.getUsageCounter(userId, window.periodStart);
          if (updatedCounter) {
            counter = updatedCounter;
          }
        }
      } else if (counter.planCode === 'bypass') {
        const currentBypassLimit = whitelistService.getBypassLimit();
        if (counter.limit !== currentBypassLimit) {
          // Update the counter with the current bypass limit
          await storage.updateUsageCounter(counter.id, {
            limit: currentBypassLimit,
          });
          const updatedCounter = await storage.getUsageCounter(userId, window.periodStart);
          if (updatedCounter) {
            counter = updatedCounter;
          }
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
    
    // Use window.limit to ensure we return the current config value, not the old database value
    // This ensures the frontend always sees the correct limit even if the counter hasn't been updated yet
    const upgradeRequired = !isWhitelisted && counter.repliesUsed >= window.limit;
    const upgradeMessage = whitelistService.getUpgradeMessage(
      isWhitelisted,
      counter.repliesUsed,
      window.limit
    );

    const result: UsageStatus = {
      planCode: window.planCode,
      used: counter.repliesUsed,
      limit: window.limit, // Use window.limit (current config) instead of counter.limit (may be outdated)
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
    
    // Fix: Add whitelist check for defense in depth
    // This ensures whitelisted users always pass, even if called directly
    const user = await storage.getUser(userId);
    if (!user) {
      return { canUse: false, reason: 'user_not_found' };
    }
    
    // Whitelisted users always can use replies
    if (whitelistService.isWhitelisted(user.email)) {
      console.log('canUseReply - whitelisted user, returning canUse: true');
      return { canUse: true };
    }
    
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

  async consumeReply(userId: string): Promise<UsageCounter> {
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Fix: Add whitelist check for defense in depth
    // Whitelisted users don't consume quota, return current status without incrementing
    if (whitelistService.isWhitelisted(user.email)) {
      const window = await this.resolveActiveWindow(user);
      if (!window) {
        throw new Error('No active usage window');
      }
      
      // Get or create usage counter without incrementing
      let counter = await storage.getUsageCounter(userId, window.periodStart);
      if (!counter) {
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
      }
      
      // Return current counter without incrementing for whitelisted users
      return counter;
    }

    const window = await this.resolveActiveWindow(user);
    if (!window) {
      throw new Error('No active usage window');
    }

    // Get or create usage counter
    let counter = await storage.getUsageCounter(userId, window.periodStart);
    if (!counter) {
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
    }

    // Check limit before incrementing
    if (counter.repliesUsed >= counter.limit) {
      throw new Error('Quota exceeded');
    }

    // Increment usage atomically
    return await storage.incrementUsage(userId, window.periodStart);
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
