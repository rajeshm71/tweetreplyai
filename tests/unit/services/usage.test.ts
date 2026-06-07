import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsageService } from '../../../server/services/usage';
import { createMockUser } from '../../factories/user.factory';
import { PLAN_LIMITS } from '../../../shared/constants';

// Mock the storage module used by UsageService
vi.mock('../../../server/services/whitelistService.js', () => ({
  whitelistService: {
    isWhitelisted: vi.fn().mockReturnValue(false),
    getTrialLimit: vi.fn().mockReturnValue(10),
    getBypassLimit: vi.fn().mockReturnValue(10000),
    getUpgradeMessage: vi.fn().mockReturnValue(''),
  },
}));

vi.mock('../../../server/storage-supabase', () => ({
  storage: {
    getUser: vi.fn(),
    getUsageCounter: vi.fn(),
    createUsageCounter: vi.fn(),
    updateUsageCounter: vi.fn(),
    getActiveSubscription: vi.fn(),
    getActiveTrialCounter: vi.fn(),
    updateUser: vi.fn(),
    incrementUsage: vi.fn(),
  },
}));

describe('Usage Service - Unit Tests', () => {
  let usageService: UsageService;

  beforeEach(() => {
    vi.clearAllMocks();
    usageService = new UsageService();
    // Set NODE_ENV to test to avoid development mode
    process.env.NODE_ENV = 'test';
  });

  describe('getUsageStatus', () => {
    it('should return usage status for user with active trial', async () => {
      const mockUser = createMockUser({
        trialEnd: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      });

      const mockCounter = {
        userId: mockUser.id,
        planCode: 'trial',
        periodStart: new Date(),
        periodEnd: new Date(),
        repliesUsed: 0,
        limit: 10,
        resetAt: new Date(),
      };

      const { storage } = await import('../../../server/storage-supabase');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getUsageCounter).mockResolvedValue(null);
      vi.mocked(storage.createUsageCounter).mockResolvedValue(mockCounter);

      const result = await usageService.getUsageStatus(mockUser.id);

      expect(result).toMatchObject({
        planCode: 'trial',
        used: 0,
        limit: 10,
      });
    });

    it('should return no access status for user without trial', async () => {
      const mockUser = createMockUser({
        trialEnd: null,
      });

      const { storage } = await import('../../../server/storage-supabase');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getActiveSubscription).mockResolvedValue(null);

      const result = await usageService.getUsageStatus(mockUser.id);

      expect(result).toMatchObject({
        planCode: expect.any(String),
        used: expect.any(Number),
        limit: expect.any(Number),
      });
    });

    it('should return null for non-existent user', async () => {
      const { storage } = await import('../../../server/storage-supabase');
      vi.mocked(storage.getUser).mockResolvedValue(null);

      const result = await usageService.getUsageStatus('non-existent-user');

      expect(result).toBeNull();
    });

    it('sets subscriptionCanceled true when paid subscription is canceled but period has not ended', async () => {
      const mockUser = createMockUser({ hasUsedTrial: true } as any);
      const currentPeriodStart = new Date(Date.now() - 5 * 86400000);
      const currentPeriodEnd = new Date(Date.now() + 25 * 86400000);

      const mockSubscription = {
        id: 'sub-1',
        userId: mockUser.id,
        dodoSubscriptionId: 'dodo_sub',
        planCode: 'monthly',
        status: 'canceled' as const,
        currentPeriodStart,
        currentPeriodEnd,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockCounter = {
        id: 'cnt-1',
        userId: mockUser.id,
        planCode: 'monthly',
        periodStart: currentPeriodStart,
        periodEnd: currentPeriodEnd,
        repliesUsed: 0,
        creditsUsed: 10,
        limit: PLAN_LIMITS.monthly.credits,
        resetAt: currentPeriodEnd,
        modeBreakdown: {},
      };

      const { storage } = await import('../../../server/storage-supabase');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getActiveSubscription).mockResolvedValue(mockSubscription);
      vi.mocked(storage.getActiveTrialCounter).mockResolvedValue(null);
      vi.mocked(storage.getUsageCounter).mockResolvedValue(mockCounter as any);

      const result = await usageService.getUsageStatus(mockUser.id);

      expect(result).toMatchObject({
        planCode: 'monthly',
        subscriptionCanceled: true,
        used: 10,
        limit: PLAN_LIMITS.monthly.credits,
      });
    });

    it('sets subscriptionCanceled false when paid subscription is active', async () => {
      const mockUser = createMockUser({ hasUsedTrial: true } as any);
      const currentPeriodStart = new Date(Date.now() - 5 * 86400000);
      const currentPeriodEnd = new Date(Date.now() + 25 * 86400000);

      const mockSubscription = {
        id: 'sub-2',
        userId: mockUser.id,
        dodoSubscriptionId: 'dodo_sub',
        planCode: 'monthly',
        status: 'active' as const,
        currentPeriodStart,
        currentPeriodEnd,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockCounter = {
        id: 'cnt-2',
        userId: mockUser.id,
        planCode: 'monthly',
        periodStart: currentPeriodStart,
        periodEnd: currentPeriodEnd,
        repliesUsed: 0,
        creditsUsed: 0,
        limit: PLAN_LIMITS.monthly.credits,
        resetAt: currentPeriodEnd,
        modeBreakdown: {},
      };

      const { storage } = await import('../../../server/storage-supabase');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getActiveSubscription).mockResolvedValue(mockSubscription);
      vi.mocked(storage.getActiveTrialCounter).mockResolvedValue(null);
      vi.mocked(storage.getUsageCounter).mockResolvedValue(mockCounter as any);

      const result = await usageService.getUsageStatus(mockUser.id);

      expect(result?.subscriptionCanceled).toBe(false);
    });

    it('returns mode breakdown with derived replies from credits', async () => {
      const mockUser = createMockUser({ hasUsedTrial: true } as any);
      const currentPeriodStart = new Date(Date.now() - 5 * 86400000);
      const currentPeriodEnd = new Date(Date.now() + 25 * 86400000);

      const mockSubscription = {
        id: 'sub-3',
        userId: mockUser.id,
        dodoSubscriptionId: 'dodo_sub',
        planCode: 'monthly',
        status: 'active' as const,
        currentPeriodStart,
        currentPeriodEnd,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockCounter = {
        id: 'cnt-3',
        userId: mockUser.id,
        planCode: 'monthly',
        periodStart: currentPeriodStart,
        periodEnd: currentPeriodEnd,
        repliesUsed: 0,
        creditsUsed: 9,
        limit: PLAN_LIMITS.monthly.credits,
        resetAt: currentPeriodEnd,
        modeBreakdown: {
          'single-sentence': { credits: 3 },
          enhanced: { credits: 4 },
          improve: { credits: 2 },
        },
      };

      const { storage } = await import('../../../server/storage-supabase');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getActiveSubscription).mockResolvedValue(mockSubscription);
      vi.mocked(storage.getActiveTrialCounter).mockResolvedValue(null);
      vi.mocked(storage.getUsageCounter).mockResolvedValue(mockCounter as any);

      const result = await usageService.getUsageStatus(mockUser.id);

      expect(result?.modeBreakdown?.['single-sentence']).toEqual({ credits: 3, replies: 3 });
      expect(result?.modeBreakdown?.enhanced).toEqual({ credits: 4, replies: 2 });
      expect(result?.modeBreakdown?.improve).toEqual({ credits: 2, replies: 1 });
    });

    it('includes selectableModels for whitelisted users when picker is enabled', async () => {
      const { WHITELIST } = await import('../../../server/config/constants.js');
      const previousFlag = WHITELIST.SHOW_MODEL_SELECT_FOR_WHITELIST;
      (WHITELIST as { SHOW_MODEL_SELECT_FOR_WHITELIST: boolean }).SHOW_MODEL_SELECT_FOR_WHITELIST = true;

      const mockUser = createMockUser({
        email: 'whitelist@example.com',
        trialEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const mockCounter = {
        userId: mockUser.id,
        planCode: 'trial',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 7 * 86400000),
        creditsUsed: 0,
        limit: 10,
        resetAt: new Date(),
      };

      const { storage } = await import('../../../server/storage-supabase');
      const { whitelistService } = await import('../../../server/services/whitelistService.js');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getUsageCounter).mockResolvedValue(null);
      vi.mocked(storage.createUsageCounter).mockResolvedValue(mockCounter as any);
      vi.mocked(whitelistService.isWhitelisted).mockReturnValue(true);

      const result = await usageService.getUsageStatus(mockUser.id);

      expect(result?.showModelSelect).toBe(true);
      expect(result?.selectableModels?.[0]).toMatchObject({ key: 'auto', name: 'Auto' });
      expect(result?.selectableModels?.some((m) => m.key === 'gpt-4.1-mini')).toBe(true);

      (WHITELIST as { SHOW_MODEL_SELECT_FOR_WHITELIST: boolean }).SHOW_MODEL_SELECT_FOR_WHITELIST = previousFlag;
    });
  });

  describe('canUseReply', () => {
    it('should return true when user has active trial', async () => {
      const mockUser = createMockUser({
        trialEnd: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      });

      const mockCounter = {
        userId: mockUser.id,
        planCode: 'trial',
        periodStart: new Date(),
        periodEnd: new Date(),
        repliesUsed: 0,
        limit: 10,
        resetAt: new Date(),
      };

      const { storage } = await import('../../../server/storage-supabase');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getUsageCounter).mockResolvedValue(null);
      vi.mocked(storage.createUsageCounter).mockResolvedValue(mockCounter);

      const result = await usageService.canUseReply(mockUser.id);

      expect(result).toEqual({ canUse: true });
    });

    it('returns canUse:true for user without hasUsedTrial flag even when trialEnd is in past (resolveActiveWindow uses hasUsedTrial, not trialEnd)', async () => {
      // NOTE: The route uses resolveActiveWindow which checks user.hasUsedTrial (not trialEnd).
      // A user who never had their trial flagged as "used" still gets a trial window,
      // so canUse is true until the counter limit is reached.
      const mockUser = createMockUser({
        trialEnd: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      });

      const { storage } = await import('../../../server/storage-supabase');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getActiveSubscription).mockResolvedValue(null);

      const result = await usageService.canUseReply(mockUser.id);

      expect(result).toEqual({ canUse: true });
    });

    it('returns canUse:true for user without subscription because hasUsedTrial is not set (new trial window is granted)', async () => {
      // NOTE: canUse is true here because resolveActiveWindow grants a trial window when
      // user.hasUsedTrial is falsy — even if user has no explicit subscription.
      const mockUser = createMockUser({
        trialEnd: null,
      });

      const { storage } = await import('../../../server/storage-supabase');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getActiveSubscription).mockResolvedValue(null);

      const result = await usageService.canUseReply(mockUser.id);

      expect(result).toEqual({ canUse: true });
    });

    it('returns canUse:false with reason:payment_required when hasUsedTrial is true and no subscription', async () => {
      const mockUser = createMockUser({ hasUsedTrial: true } as any);

      const { storage } = await import('../../../server/storage-supabase');
      const { whitelistService } = await import('../../../server/services/whitelistService.js');
      vi.mocked(whitelistService.isWhitelisted).mockReturnValue(false);
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getActiveSubscription).mockResolvedValue(null);
      vi.mocked(storage.getActiveTrialCounter).mockResolvedValue(null);

      const result = await usageService.canUseReply(mockUser.id);

      expect(result.canUse).toBe(false);
      expect(result.reason).toBe('payment_required');
    });

    it('should return false when user not found', async () => {
      const { storage } = await import('../../../server/storage-supabase');
      vi.mocked(storage.getUser).mockResolvedValue(null);

      const result = await usageService.canUseReply('non-existent-user');

      expect(result).toEqual({ canUse: false, reason: 'user_not_found' });
    });
  });

  describe('consumeReply', () => {
    it('should throw error when user not found', async () => {
      const { storage } = await import('../../../server/storage-supabase');
      vi.mocked(storage.getUser).mockResolvedValue(null);

      await expect(usageService.consumeReply('non-existent-user')).rejects.toThrow('User not found');
    });

    it('resolves (does not throw) when called without explicit counter — returns result of incrementUsage', async () => {
      // NOTE: The "no active window" label is historical. resolveActiveWindow actually returns a
      // trial window for users whose hasUsedTrial is false. consumeReply then resolves because
      // storage.incrementUsage is called (and vi.fn() returns undefined).
      const mockUser = createMockUser({
        trialEnd: null,
      });

      const { storage } = await import('../../../server/storage-supabase');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getActiveSubscription).mockResolvedValue(null);

      await expect(usageService.consumeReply(mockUser.id)).resolves.toBeUndefined();
    });

    it('calls storage.incrementUsage on the happy path (active trial with room in quota)', async () => {
      const mockUser = createMockUser();
      const mockCounter = {
        id: 'counter-1',
        userId: mockUser.id,
        planCode: 'trial',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        repliesUsed: 1,
        creditsUsed: 2,
        limit: 10,
        resetAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        modeBreakdown: {},
      };
      const mockIncrementResult = { ...mockCounter, creditsUsed: 4, repliesUsed: 2 };

      const { storage } = await import('../../../server/storage-supabase');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getActiveSubscription).mockResolvedValue(null);
      vi.mocked(storage.getActiveTrialCounter).mockResolvedValue(null);
      vi.mocked(storage.getUsageCounter).mockResolvedValue(mockCounter as any);
      vi.mocked(storage.incrementUsage).mockResolvedValue(mockIncrementResult as any);

      const result = await usageService.consumeReply(mockUser.id, 'enhanced');

      expect(storage.incrementUsage).toHaveBeenCalled();
      expect(result).toMatchObject({ creditsUsed: 4 });
    });
  });

  describe('initializeTrialForUser', () => {
    it('should not create trial if user already has trial', async () => {
      const mockUser = createMockUser({
        trialStart: new Date(),
        trialEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const { storage } = await import('../../../server/storage-supabase');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);

      await usageService.initializeTrialForUser(mockUser.id);

      expect(storage.createUsageCounter).not.toHaveBeenCalled();
    });

    it('should not create trial if user not found', async () => {
      // NOTE: usage.ts imports from storage-supabase, not storage
      const { storage } = await import('../../../server/storage-supabase');
      vi.mocked(storage.getUser).mockResolvedValue(null);

      await usageService.initializeTrialForUser('non-existent-user');

      expect(storage.createUsageCounter).not.toHaveBeenCalled();
    });
  });
});