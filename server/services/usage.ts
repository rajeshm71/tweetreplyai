import { storage } from "../storage.js";
import { PLANS } from "./stripe.js";
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

    // Check for active paid subscription first
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

    // For all other users (trial, no trial, etc.), give a very high limit for testing
    const fallbackResult = {
      planCode: 'testing',
      periodStart: this.getTodayStart(),
      periodEnd: this.getTodayEnd(),
      limit: 50000, // Very high limit for testing
      resetAt: this.getTodayEnd(),
    };
    console.log('Returning fallback testing window:', fallbackResult);
    return fallbackResult;
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
    }

    const result: UsageStatus = {
      planCode: window.planCode,
      used: counter.repliesUsed,
      limit: counter.limit,
      resetAt: counter.resetAt,
      status: 'active',
    };
    
    console.log('Returning usage status:', result);
    return result;
  }

  async canUseReply(userId: string): Promise<{ canUse: boolean; reason?: string }> {
    const status = await this.getUsageStatus(userId);
    
    if (!status || status.status === 'no_access') {
      return { canUse: false, reason: 'payment_required' };
    }

    if (status.used >= status.limit) {
      return { canUse: false, reason: 'quota_exceeded' };
    }

    return { canUse: true };
  }

  async consumeReply(userId: string): Promise<UsageCounter> {
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
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
