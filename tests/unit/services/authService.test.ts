import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createMockUser } from '../../factories/user.factory';

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserByGoogleSub: vi.fn(),
    getUserByEmail: vi.fn(),
    getUser: vi.fn(),
    upsertUser: vi.fn(),
    updateUser: vi.fn(),
    addAuthProvider: vi.fn(),
    removeAuthProvider: vi.fn(),
  },
}));

describe('AuthService - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findOrCreateUser — Google OAuth', () => {
    it('returns existing user when Google sub is found', async () => {
      const { storage } = await import('../../../server/storage');
      const { authService } = await import('../../../server/services/authService');

      const mockUser = createMockUser({ id: 'user-1', authProviders: ['google'] });
      vi.mocked(storage.getUserByGoogleSub).mockResolvedValue(mockUser as any);
      vi.mocked(storage.getUser).mockResolvedValue(mockUser as any);
      vi.mocked(storage.updateUser).mockResolvedValue(mockUser as any);

      const result = await authService.findOrCreateUser({
        provider: 'google',
        providerId: 'google-sub-123',
        email: mockUser.email,
      });

      expect(result.id).toBe('user-1');
      expect(storage.getUserByGoogleSub).toHaveBeenCalledWith('google-sub-123');
    });

    it('links account to existing email user when Google sub not found', async () => {
      const { storage } = await import('../../../server/storage');
      const { authService } = await import('../../../server/services/authService');

      const existingUser = createMockUser({ id: 'user-2', authProviders: ['password'] });
      vi.mocked(storage.getUserByGoogleSub).mockResolvedValue(null);
      vi.mocked(storage.getUserByEmail).mockResolvedValue(existingUser as any);
      vi.mocked(storage.addAuthProvider).mockResolvedValue(undefined as any);
      vi.mocked(storage.updateUser).mockResolvedValue({ ...existingUser, authProviders: ['password', 'google'] } as any);

      const result = await authService.findOrCreateUser({
        provider: 'google',
        providerId: 'new-google-sub',
        email: existingUser.email,
      });

      expect(storage.addAuthProvider).toHaveBeenCalledWith('user-2', 'google');
      expect(result).toBeDefined();
    });

    it('creates new user when no matching Google sub or email', async () => {
      const { storage } = await import('../../../server/storage');
      const { authService } = await import('../../../server/services/authService');

      const newUser = createMockUser({ id: 'user-3' });
      vi.mocked(storage.getUserByGoogleSub).mockResolvedValue(null);
      vi.mocked(storage.getUserByEmail).mockResolvedValue(null);
      vi.mocked(storage.upsertUser).mockResolvedValue(newUser as any);

      const result = await authService.findOrCreateUser({
        provider: 'google',
        providerId: 'brand-new-sub',
        email: 'newuser@example.com',
        firstName: 'New',
        lastName: 'User',
      });

      expect(storage.upsertUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'newuser@example.com',
          googleSub: 'brand-new-sub',
          authProviders: ['google'],
          firstName: 'New',
          lastName: 'User',
        })
      );
      expect(result.id).toBe('user-3');
    });

    it('propagates storage errors', async () => {
      const { storage } = await import('../../../server/storage');
      const { authService } = await import('../../../server/services/authService');

      vi.mocked(storage.getUserByGoogleSub).mockRejectedValue(new Error('DB connection failed'));

      await expect(
        authService.findOrCreateUser({ provider: 'google', providerId: 'sub', email: 'user@x.com' })
      ).rejects.toThrow('DB connection failed');
    });
  });

  describe('unlinkProvider', () => {
    it('throws when user not found', async () => {
      const { storage } = await import('../../../server/storage');
      const { authService } = await import('../../../server/services/authService');

      vi.mocked(storage.getUser).mockResolvedValue(null);

      await expect(authService.unlinkProvider('user-1', 'google')).rejects.toThrow('User not found');
    });

    it('throws when trying to unlink last auth method', async () => {
      const { storage } = await import('../../../server/storage');
      const { authService } = await import('../../../server/services/authService');

      vi.mocked(storage.getUser).mockResolvedValue({ id: 'user-1', authProviders: ['password'] } as any);

      await expect(authService.unlinkProvider('user-1', 'password')).rejects.toThrow('last authentication method');
    });

    it('throws when provider not linked', async () => {
      const { storage } = await import('../../../server/storage');
      const { authService } = await import('../../../server/services/authService');

      vi.mocked(storage.getUser).mockResolvedValue({ id: 'user-1', authProviders: ['password', 'google'] } as any);

      await expect(authService.unlinkProvider('user-1', 'replit')).rejects.toThrow('Provider not linked');
    });
  });
});
