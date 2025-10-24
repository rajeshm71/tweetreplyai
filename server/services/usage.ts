import { storage } from "../storage.js";
import { PLANS } from "./stripe.js";
import type { User, UsageCounter } from "../../shared/types.js";

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

    // Check for active paid subscription first
    const activeSubscription = await storage.getActiveSubscription(user.id);
    if (activeSubscription && activeSubscription.currentPeriodEnd > now) {
      const plan = PLANS[activeSubscription.planCode];
      if (plan) {
        return {
          planCode: activeSubscription.planCode,
          periodStart: activeSubscription.currentPeriodStart,
          periodEnd: activeSubscription.currentPeriodEnd,
          limit: plan.replies,
          resetAt: activeSubscription.currentPeriodEnd,
        };
      }
    }

    // For all other users (trial, no trial, etc.), give a very high limit for testing
    return {
      planCode: 'testing',
      periodStart: this.getTodayStart(),
      periodEnd: this.getTodayEnd(),
      limit: 50000, // Very high limit for testing
      resetAt: this.getTodayEnd(),
    };
  }

  async getUsageStatus(userId: string): Promise<UsageStatus | null> {
    console.log('=== USAGE: getUsageStatus called ===');
    const user = await storage.getUser(userId);
    if (!user) {
      console.log('User not found');
      return null;
    }

    console.log('User found:', user.id);
    const window = await this.resolveActiveWindow(user);
    console.log('Active window:', window);
    
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
        userId,
        planCode: window.planCode,
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
        repliesUsed: 0,
        limit: window.limit,
        resetAt: window.resetAt,
      });
    }

    const result = {
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
    if (!user || user.trialStart) {
      return; // Trial already initialized or user not found
    }

    const now = new Date();
    const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await storage.upsertUser({
      ...user,
      trialStart: now,
      trialEnd,
    });
  }
}

export const usageService = new UsageService();
