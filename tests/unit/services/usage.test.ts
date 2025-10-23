import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsageService } from '../../../server/services/usage';
import { createMockUser } from '../../factories/user.factory';

// Mock the storage module
vi.mock('../../../server/storage', () => ({
  storage: {
    getUser: vi.fn(),
    getUsageCounter: vi.fn(),
    createUsageCounter: vi.fn(),
    updateUsageCounter: vi.fn(),
    getActiveSubscription: vi.fn(),
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

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getUsageCounter).mockResolvedValue(null);
      vi.mocked(storage.createUsageCounter).mockResolvedValue(mockCounter);

      const result = await usageService.getUsageStatus(mockUser.id);

      expect(result).toEqual({
        planCode: 'trial',
        used: 0,
        limit: 10,
        resetAt: expect.any(Date),
        status: 'trial',
      });
    });

    it('should return no access status for user without trial', async () => {
      const mockUser = createMockUser({
        trialEnd: null,
      });

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getActiveSubscription).mockResolvedValue(null);

      const result = await usageService.getUsageStatus(mockUser.id);

      expect(result).toEqual({
        planCode: 'none',
        used: 0,
        limit: 0,
        resetAt: expect.any(Date),
        status: 'no_access',
      });
    });

    it('should return null for non-existent user', async () => {
      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(null);

      const result = await usageService.getUsageStatus('non-existent-user');

      expect(result).toBeNull();
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

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getUsageCounter).mockResolvedValue(null);
      vi.mocked(storage.createUsageCounter).mockResolvedValue(mockCounter);

      const result = await usageService.canUseReply(mockUser.id);

      expect(result).toEqual({ canUse: true });
    });

    it('should return false when trial expired', async () => {
      const mockUser = createMockUser({
        trialEnd: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      });

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getActiveSubscription).mockResolvedValue(null);

      const result = await usageService.canUseReply(mockUser.id);

      expect(result).toEqual({ canUse: false, reason: 'payment_required' });
    });

    it('should return false when no trial and no subscription', async () => {
      const mockUser = createMockUser({
        trialEnd: null,
      });

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getActiveSubscription).mockResolvedValue(null);

      const result = await usageService.canUseReply(mockUser.id);

      expect(result).toEqual({ canUse: false, reason: 'payment_required' });
    });

    it('should return false when user not found', async () => {
      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(null);

      const result = await usageService.canUseReply('non-existent-user');

      expect(result).toEqual({ canUse: false, reason: 'payment_required' });
    });
  });

  describe('consumeReply', () => {
    it('should throw error when user not found', async () => {
      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(null);

      await expect(usageService.consumeReply('non-existent-user')).rejects.toThrow('User not found');
    });

    it('should throw error when no active window', async () => {
      const mockUser = createMockUser({
        trialEnd: null,
      });

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);
      vi.mocked(storage.getActiveSubscription).mockResolvedValue(null);

      await expect(usageService.consumeReply(mockUser.id)).rejects.toThrow('No active usage window');
    });
  });

  describe('initializeTrialForUser', () => {
    it('should not create trial if user already has trial', async () => {
      const mockUser = createMockUser({
        trialStart: new Date(),
        trialEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser);

      await usageService.initializeTrialForUser(mockUser.id);

      expect(storage.createUsageCounter).not.toHaveBeenCalled();
    });

    it('should not create trial if user not found', async () => {
      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(null);

      await usageService.initializeTrialForUser('non-existent-user');

      expect(storage.createUsageCounter).not.toHaveBeenCalled();
    });
  });
});