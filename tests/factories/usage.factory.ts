import type { UsageCounter, InsertUsageCounter } from '../../shared/schema';

export const createMockUsageCounter = (overrides: Partial<InsertUsageCounter> = {}): InsertUsageCounter => ({
  userId: `test-user-${Date.now()}`,
  planCode: 'trial',
  periodStart: new Date(),
  periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  repliesUsed: 0,
  limit: 10,
  resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  ...overrides,
});

export const createMockTrialUsage = (overrides: Partial<InsertUsageCounter> = {}): InsertUsageCounter => ({
  ...createMockUsageCounter(overrides),
  planCode: 'trial',
  limit: 10,
});

export const createMockWeeklyUsage = (overrides: Partial<InsertUsageCounter> = {}): InsertUsageCounter => ({
  ...createMockUsageCounter(overrides),
  planCode: 'weekly',
  limit: 50,
});

export const createMockMonthlyUsage = (overrides: Partial<InsertUsageCounter> = {}): InsertUsageCounter => ({
  ...createMockUsageCounter(overrides),
  planCode: 'monthly',
  limit: 200,
});

export const createMockUsageStatus = (overrides: any = {}) => ({
  used: 5,
  limit: 10,
  resetAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  planCode: 'trial',
  status: 'active',
  ...overrides,
});
