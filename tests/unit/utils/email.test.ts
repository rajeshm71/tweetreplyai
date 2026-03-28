/**
 * Tests for the backward-compat wrappers in server/utils/email.ts.
 * The wrappers now delegate to emailService, which in turn uses emailTransport.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the emailService that email.ts now delegates to
// ---------------------------------------------------------------------------
const mockSendWelcome = vi.fn().mockResolvedValue(undefined);
const mockSendPasswordReset = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../server/services/emailService', () => ({
  sendWelcome: mockSendWelcome,
  sendPasswordReset: mockSendPasswordReset,
}));

// ---------------------------------------------------------------------------
// Mock storage so getUserByEmail can be resolved
// ---------------------------------------------------------------------------
const mockGetUserByEmail = vi.fn();

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserByEmail: mockGetUserByEmail,
  },
}));

const MOCK_USER = {
  id: 'user-xyz',
  email: 'user@example.com',
  firstName: 'Alice',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserByEmail.mockResolvedValue(MOCK_USER);
});

describe('Email Utils — backward-compat wrappers', () => {
  describe('sendWelcomeEmail', () => {
    it('delegates to emailService.sendWelcome with the provided userId', async () => {
      const { sendWelcomeEmail } = await import('../../../server/utils/email');
      // sendWelcomeEmail is now emailService.sendWelcome (takes userId)
      await sendWelcomeEmail('user-xyz');
      expect(mockSendWelcome).toHaveBeenCalledWith('user-xyz');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('looks up the user by email and delegates to emailService.sendPasswordReset', async () => {
      const { sendPasswordResetEmail } = await import('../../../server/utils/email');
      await sendPasswordResetEmail('user@example.com', 'tok123');
      expect(mockGetUserByEmail).toHaveBeenCalledWith('user@example.com');
      expect(mockSendPasswordReset).toHaveBeenCalledWith('user-xyz', 'tok123');
    });

    it('is a no-op when user is not found', async () => {
      mockGetUserByEmail.mockResolvedValue(undefined);
      const { sendPasswordResetEmail } = await import('../../../server/utils/email');
      await sendPasswordResetEmail('unknown@example.com', 'tok');
      expect(mockSendPasswordReset).not.toHaveBeenCalled();
    });
  });
});
