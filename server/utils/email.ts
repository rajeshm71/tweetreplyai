import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const appBaseUrl = process.env.APP_URL || process.env.DOMAIN || 'http://localhost:5000';
const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

/**
 * Send password reset email with link to /reset-password?token=<token>.
 * No-op if RESEND_API_KEY is not set (logs warning).
 */
export async function sendPasswordResetEmail(toEmail: string, token: string): Promise<void> {
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY not set; skipping password reset email');
    return;
  }
  const resend = new Resend(resendApiKey);
  const resetUrl = `${appBaseUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  const { error } = await resend.emails.send({
    from: fromEmail,
    to: toEmail,
    subject: 'Reset your password',
    html: `<!DOCTYPE html><html><body><p>You requested a password reset.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p></body></html>`,
  });
  if (error) {
    console.error('Resend sendPasswordResetEmail error:', error);
    throw error;
  }
}
