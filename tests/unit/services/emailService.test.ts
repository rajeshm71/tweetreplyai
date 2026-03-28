import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Storage mock
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn();
const mockGetEmailPreferences = vi.fn();
const mockLogEmailSend = vi.fn();
const mockUpdateEmailSendLog = vi.fn();
const mockCountRecentEmails = vi.fn();
const mockCountMonthlyEmails = vi.fn();

vi.mock('../../../server/storage', () => ({
  storage: {
    getUser: mockGetUser,
    getEmailPreferences: mockGetEmailPreferences,
    logEmailSend: mockLogEmailSend,
    updateEmailSendLog: mockUpdateEmailSendLog,
    countRecentEmails: mockCountRecentEmails,
    countMonthlyEmails: mockCountMonthlyEmails,
  },
}));

// ---------------------------------------------------------------------------
// emailTransport mock
// ---------------------------------------------------------------------------
const mockSendEmail = vi.fn().mockResolvedValue('msg-id-123');

vi.mock('../../../server/utils/emailTransport', () => ({
  sendEmail: mockSendEmail,
}));

// ---------------------------------------------------------------------------
// emailTemplates mock
// ---------------------------------------------------------------------------
vi.mock('../../../server/emailTemplates', () => ({
  renderWelcomeEmail: vi.fn().mockResolvedValue({ subject: 'Welcome to TweetReply', html: '<p>Welcome</p>', text: 'Welcome' }),
  renderPasswordResetEmail: vi.fn().mockResolvedValue({ subject: 'Reset your password', html: '<p>Reset</p>', text: 'Reset' }),
  renderSubscriptionActiveEmail: vi.fn().mockResolvedValue({ subject: 'Sub active', html: '<p>Sub active</p>', text: 'Sub active' }),
  renderSubscriptionCanceledEmail: vi.fn().mockResolvedValue({ subject: 'Canceled', html: '<p>Canceled</p>', text: 'Canceled' }),
  renderPaymentFailedEmail: vi.fn().mockResolvedValue({ subject: 'Payment failed', html: '<p>Failed</p>', text: 'Failed' }),
  renderUsageThresholdEmail: vi.fn().mockResolvedValue({ subject: '80% used', html: '<p>80%</p>', text: '80%' }),
  renderConversionEmail: vi.fn().mockResolvedValue({ subject: 'Upgrade', html: '<p>Upgrade</p>', text: 'Upgrade' }),
  renderActivationNudgeEmail: vi.fn().mockResolvedValue({ subject: 'Activate', html: '<p>Activate</p>', text: 'Activate' }),
  renderWeeklyValueEmail: vi.fn().mockResolvedValue({ subject: 'Weekly', html: '<p>Weekly</p>', text: 'Weekly' }),
  renderWinBackEmail: vi.fn().mockResolvedValue({ subject: 'Win back', html: '<p>Win back</p>', text: 'Win back' }),
  renderCampaignEmail: vi.fn().mockResolvedValue({ subject: 'Campaign', html: '<p>Campaign</p>', text: 'Campaign' }),
}));

const MOCK_USER = {
  id: 'user-abc',
  email: 'test@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue(MOCK_USER);
  // null → service uses defaults: usageAlerts=true, productTips=true, marketing=false
  mockGetEmailPreferences.mockResolvedValue(null);
  mockLogEmailSend.mockResolvedValue(true);
  mockUpdateEmailSendLog.mockResolvedValue(undefined);
  mockCountRecentEmails.mockResolvedValue(0);
  mockCountMonthlyEmails.mockResolvedValue(0);
});

describe('emailService', () => {
  // -------------------------------------------------------------------------
  describe('sendWelcome', () => {
    it('sends the welcome email with correct idempotency key', async () => {
      const { sendWelcome } = await import('../../../server/services/emailService');
      await sendWelcome('user-abc');

      expect(mockLogEmailSend).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: 'welcome:user-abc' })
      );
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Welcome to TweetReply',
          idempotencyKey: 'welcome:user-abc',
        })
      );
    });

    it('skips send if idempotency log returns false (duplicate)', async () => {
      mockLogEmailSend.mockResolvedValue(false);
      const { sendWelcome } = await import('../../../server/services/emailService');
      await sendWelcome('user-abc');
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('returns early when user not found', async () => {
      mockGetUser.mockResolvedValue(undefined);
      const { sendWelcome } = await import('../../../server/services/emailService');
      await sendWelcome('nonexistent');
      expect(mockLogEmailSend).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('sendPasswordReset', () => {
    it('bypasses preference gate for security category', async () => {
      mockGetEmailPreferences.mockResolvedValue({
        usageAlerts: false,
        productTips: false,
        marketing: false,
      });
      const { sendPasswordReset } = await import('../../../server/services/emailService');
      await sendPasswordReset('user-abc', 'tok123');
      expect(mockSendEmail).toHaveBeenCalledOnce();
    });

    it('sends even when no preferences record exists', async () => {
      const { sendPasswordReset } = await import('../../../server/services/emailService');
      await sendPasswordReset('user-abc', 'tok456');
      expect(mockSendEmail).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('sendPaymentFailed', () => {
    it('sends billing email bypassing preference gate', async () => {
      // FIX: payment-failed is 'billing' category — must fire even with all prefs false
      mockGetEmailPreferences.mockResolvedValue({
        usageAlerts: false,
        productTips: false,
        marketing: false,
      });
      const { sendPaymentFailed } = await import('../../../server/services/emailService');
      await sendPaymentFailed('user-abc', 'sub-99');
      expect(mockSendEmail).toHaveBeenCalledOnce();
    });

    it('idempotency key includes subscription id and date', async () => {
      const { sendPaymentFailed } = await import('../../../server/services/emailService');
      await sendPaymentFailed('user-abc', 'sub-99');
      expect(mockLogEmailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: expect.stringContaining('payment.failed:sub-99'),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('sendUsageThreshold', () => {
    const counter = { creditsUsed: 8, limit: 10, periodStart: new Date('2026-01-01') };

    it('sends when usageAlerts is true (default)', async () => {
      const { sendUsageThreshold } = await import('../../../server/services/emailService');
      await sendUsageThreshold('user-abc', 80, counter);
      expect(mockSendEmail).toHaveBeenCalledOnce();
    });

    it('skips when usageAlerts is false', async () => {
      mockGetEmailPreferences.mockResolvedValue({ usageAlerts: false, productTips: true, marketing: false });
      const { sendUsageThreshold } = await import('../../../server/services/emailService');
      await sendUsageThreshold('user-abc', 80, counter);
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockUpdateEmailSendLog).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'skipped_pref' })
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('sendActivationNudge', () => {
    it('sends when productTips is true (default)', async () => {
      const { sendActivationNudge } = await import('../../../server/services/emailService');
      await sendActivationNudge('user-abc');
      expect(mockSendEmail).toHaveBeenCalledOnce();
    });

    it('skips when productTips is false', async () => {
      mockGetEmailPreferences.mockResolvedValue({ usageAlerts: true, productTips: false, marketing: false });
      const { sendActivationNudge } = await import('../../../server/services/emailService');
      await sendActivationNudge('user-abc');
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('skips when daily engagement rate limit is hit', async () => {
      // countRecentEmails now filters to 'sent'/'delivered' only (excludes the pending row),
      // so the check is > 0. Returning 1 means one email was already sent today.
      mockCountRecentEmails.mockResolvedValue(1);
      const { sendActivationNudge } = await import('../../../server/services/emailService');
      await sendActivationNudge('user-abc');
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockUpdateEmailSendLog).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'skipped_rate' })
      );
    });

    it('skips when monthly email cap is exceeded', async () => {
      mockCountMonthlyEmails.mockResolvedValue(20); // > 15 cap
      const { sendActivationNudge } = await import('../../../server/services/emailService');
      await sendActivationNudge('user-abc');
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('deduplication', () => {
    it('does not send twice for the same idempotency key', async () => {
      const { sendWelcome } = await import('../../../server/services/emailService');

      mockLogEmailSend.mockResolvedValueOnce(true);
      await sendWelcome('user-abc');
      expect(mockSendEmail).toHaveBeenCalledTimes(1);

      // Second call: duplicate — DB unique constraint returns false
      mockLogEmailSend.mockResolvedValueOnce(false);
      await sendWelcome('user-abc');
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('sendSubscriptionActive', () => {
    it('bypasses all preference gates (transactional category)', async () => {
      mockGetEmailPreferences.mockResolvedValue({ usageAlerts: false, productTips: false, marketing: false });
      const { sendSubscriptionActive } = await import('../../../server/services/emailService');
      await sendSubscriptionActive('user-abc', 'sub-1', 'Pro Plan', 'April 1, 2026');
      expect(mockSendEmail).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  describe('sendConversionStage', () => {
    const counter = { periodStart: new Date('2026-01-01') };

    it('sends stage 1 with correct idempotency key', async () => {
      const { sendConversionStage } = await import('../../../server/services/emailService');
      await sendConversionStage('user-abc', 1, counter);
      expect(mockLogEmailSend).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: expect.stringContaining('conversion.up1') })
      );
      expect(mockSendEmail).toHaveBeenCalledOnce();
    });

    it('assigns A/B variant deterministically — always A or B, never undefined', async () => {
      const { sendConversionStage } = await import('../../../server/services/emailService');
      await sendConversionStage('user-abc', 2, counter);
      expect(mockLogEmailSend).toHaveBeenCalledWith(
        expect.objectContaining({ abVariant: expect.stringMatching(/^[AB]$/) })
      );
    });

    // FIX: abVariant must not produce NaN bucket for non-hex UUIDs
    it('A/B variant handles non-hex user ID without NaN (uuid-style)', async () => {
      const uuidUser = { ...MOCK_USER, id: 'b3f2e1a0-9999-4abc-8def-111122223333' };
      mockGetUser.mockResolvedValue(uuidUser);
      const { sendConversionStage } = await import('../../../server/services/emailService');
      await sendConversionStage(uuidUser.id, 1, counter);
      const call = mockLogEmailSend.mock.calls[0]?.[0];
      expect(call?.abVariant).toMatch(/^[AB]$/);
    });
  });
});
