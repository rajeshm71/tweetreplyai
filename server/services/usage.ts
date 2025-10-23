import { storage } from "../storage.js";
import { PLANS } from "./stripe.js";
import type { User, UsageCounter } from "../../shared/schema.js";

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

    // Check for active trial
    if (user.trialEnd && user.trialEnd > now) {
      return {
        planCode: 'trial',
        periodStart: this.getTodayStart(),
        periodEnd: this.getTodayEnd(),
        limit: 10,
        resetAt: this.getTodayEnd(),
      };
    }

    // No access
    return null;
  }

  async getUsageStatus(userId: string): Promise<UsageStatus | null> {
    const user = await storage.getUser(userId);
    if (!user) {
      return null;
    }

    // In development mode, return unlimited usage
    if (process.env.NODE_ENV === 'development') {
      return {
        planCode: 'development',
        used: 0,
        limit: 999999,
        resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'active',
      };
    }

    const window = await this.resolveActiveWindow(user);
    if (!window) {
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

    return {
      planCode: window.planCode,
      used: counter.repliesUsed,
      limit: counter.limit,
      resetAt: counter.resetAt,
      status: window.planCode === 'trial' ? 'trial' : 'active',
    };
  }

  async canUseReply(userId: string): Promise<{ canUse: boolean; reason?: string }> {
    // In development mode, allow unlimited usage for testing
    if (process.env.NODE_ENV === 'development') {
      return { canUse: true };
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

  async consumeReply(userId: string): Promise<UsageCounter> {
    // In development mode, return a mock counter without actually tracking usage
    if (process.env.NODE_ENV === 'development') {
      return {
        id: 'dev-counter',
        userId,
        planCode: 'development',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
        repliesUsed: 0,
        limit: 999999,
        resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };
    }

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
