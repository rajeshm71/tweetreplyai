import type { Subscription, InsertSubscription } from '../../shared/types';

export const createMockSubscription = (overrides: Partial<InsertSubscription> = {}): InsertSubscription => ({
  id: `sub-row-${Date.now()}`,
  userId: `test-user-${Date.now()}`,
  planCode: 'monthly',
  status: 'active',
  currentPeriodStart: new Date(),
  currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  dodoSubscriptionId: `sub_test_${Date.now()}`,
  amountPaid: 999,
  currency: 'usd',
  ...overrides,
});

export const createMockWeeklySubscription = (overrides: Partial<InsertSubscription> = {}): InsertSubscription => ({
  ...createMockSubscription(overrides),
  planCode: 'weekly',
  amountPaid: 399,
});

export const createMockMonthlySubscription = (overrides: Partial<InsertSubscription> = {}): InsertSubscription => ({
  ...createMockSubscription(overrides),
  planCode: 'monthly',
  amountPaid: 999,
});

export const createMockCanceledSubscription = (overrides: Partial<InsertSubscription> = {}): InsertSubscription => ({
  ...createMockSubscription(overrides),
  status: 'canceled',
  cancelAt: new Date(),
  cancelReason: 'customer_cancelled',
});

export const createMockPastDueSubscription = (overrides: Partial<InsertSubscription> = {}): InsertSubscription => ({
  ...createMockSubscription(overrides),
  status: 'past_due',
});
