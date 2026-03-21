import { describe, expect, it, vi, afterEach } from 'vitest';

const mockEmailsSend = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockEmailsSend };
    constructor(_key: string) {}
  },
}));

vi.mock('../../../server/emailTemplates', () => ({
  buildWelcomeEmail: vi.fn().mockReturnValue({
    subject: 'Welcome!',
    html: '<p>Welcome HTML</p>',
  }),
}));

const savedResendKey = process.env.RESEND_API_KEY;
const savedAppUrl = process.env.APP_URL;

describe('Email Utils - Unit Tests', () => {
  afterEach(() => {
    if (savedResendKey !== undefined) {
      process.env.RESEND_API_KEY = savedResendKey;
    } else {
      delete process.env.RESEND_API_KEY;
    }
    if (savedAppUrl !== undefined) {
      process.env.APP_URL = savedAppUrl;
    } else {
      delete process.env.APP_URL;
    }
    vi.clearAllMocks();
  });

  describe('sendWelcomeEmail', () => {
    it('is a no-op when RESEND_API_KEY is not set', async () => {
      delete process.env.RESEND_API_KEY;
      vi.resetModules();
      const { sendWelcomeEmail } = await import('../../../server/utils/email');

      await expect(sendWelcomeEmail('user@example.com')).resolves.toBeUndefined();
      expect(mockEmailsSend).not.toHaveBeenCalled();
    });

    it('calls resend.emails.send with correct to/from/subject when API key is set', async () => {
      process.env.RESEND_API_KEY = 'test-resend-key';
      vi.resetModules();
      vi.mock('resend', () => ({ Resend: class { emails = { send: mockEmailsSend }; constructor(_k: string) {} } }));
      mockEmailsSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null });

      const { sendWelcomeEmail } = await import('../../../server/utils/email');
      await sendWelcomeEmail('user@example.com', 'Alice');

      expect(mockEmailsSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Welcome!',
        })
      );
    });

    it('does NOT throw when Resend API returns an error', async () => {
      process.env.RESEND_API_KEY = 'test-resend-key';
      vi.resetModules();
      mockEmailsSend.mockResolvedValue({ data: null, error: new Error('Resend 500') });

      const { sendWelcomeEmail } = await import('../../../server/utils/email');

      await expect(sendWelcomeEmail('user@example.com')).resolves.toBeUndefined();
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('is a no-op when RESEND_API_KEY is not set', async () => {
      delete process.env.RESEND_API_KEY;
      vi.resetModules();
      const { sendPasswordResetEmail } = await import('../../../server/utils/email');

      await expect(sendPasswordResetEmail('user@example.com', 'tok123')).resolves.toBeUndefined();
      expect(mockEmailsSend).not.toHaveBeenCalled();
    });

    it('calls resend.emails.send with reset URL containing token', async () => {
      process.env.RESEND_API_KEY = 'test-resend-key';
      process.env.APP_URL = 'https://myapp.com';
      vi.resetModules();
      mockEmailsSend.mockResolvedValue({ data: { id: 'msg-2' }, error: null });

      const { sendPasswordResetEmail } = await import('../../../server/utils/email');
      await sendPasswordResetEmail('user@example.com', 'abc123token');

      const callArgs = mockEmailsSend.mock.calls[0]?.[0];
      expect(callArgs?.html).toContain('abc123token');
      expect(callArgs?.html).toContain('myapp.com');
      expect(callArgs?.to).toBe('user@example.com');
    });

    it('THROWS when Resend API returns an error (asymmetric behavior vs sendWelcomeEmail)', async () => {
      process.env.RESEND_API_KEY = 'test-resend-key';
      vi.resetModules();
      const apiError = new Error('Resend error');
      mockEmailsSend.mockResolvedValue({ data: null, error: apiError });

      const { sendPasswordResetEmail } = await import('../../../server/utils/email');

      await expect(sendPasswordResetEmail('user@example.com', 'tok')).rejects.toThrow();
    });
  });
});
