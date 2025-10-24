import type { User, UpsertUser } from '../../shared/types';

export const createMockUser = (overrides: Partial<UpsertUser> = {}): UpsertUser => ({
  id: `test-user-${Date.now()}`,
  email: `test-${Date.now()}@example.com`,
  firstName: 'Test',
  lastName: 'User',
  authProviders: ['local'],
  emailVerified: true,
  passwordHash: '$2b$10$test.hash',
  ...overrides,
});

export const createMockUserWithGoogle = (overrides: Partial<UpsertUser> = {}): UpsertUser => ({
  ...createMockUser(overrides),
  authProviders: ['google'],
  googleSub: `google-${Date.now()}`,
  profileImageUrl: 'https://example.com/avatar.jpg',
});

export const createMockUserWithReplit = (overrides: Partial<UpsertUser> = {}): UpsertUser => ({
  ...createMockUser(overrides),
  authProviders: ['replit'],
  replitSub: `replit-${Date.now()}`,
});

export const createMockUserWithStripe = (overrides: Partial<UpsertUser> = {}): UpsertUser => ({
  ...createMockUser(overrides),
  stripeCustomerId: `cus_test_${Date.now()}`,
});

export const createMockUserResponse = (overrides: Partial<User> = {}): Partial<User> => ({
  id: `test-user-${Date.now()}`,
  email: `test-${Date.now()}@example.com`,
  firstName: 'Test',
  lastName: 'User',
  profileImageUrl: null,
  authProviders: ['local'],
  emailVerified: true,
  ...overrides,
});
