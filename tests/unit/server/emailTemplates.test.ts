import { describe, expect, it } from 'vitest';
import { renderPasswordResetEmail, renderWelcomeEmail } from '../../../server/emailTemplates';

describe('emailTemplates (React Email)', () => {
  it('renderWelcomeEmail includes app URL and name', async () => {
    const { html, text, subject } = await renderWelcomeEmail({
      firstName: 'Alex',
      appUrl: 'https://example.com/',
    });
    expect(subject).toBe('Welcome to TweetReply');
    expect(html).toContain('https://example.com');
    expect(html).toContain('Alex');
    expect(text).toMatch(/Alex/);
    expect(text.length).toBeGreaterThan(0);
  });

  it('renderWelcomeEmail uses "there" when firstName is empty', async () => {
    const { html, text } = await renderWelcomeEmail({
      appUrl: 'https://example.com',
    });
    expect(html).toContain('there');
    expect(text).toMatch(/there/);
  });

  it('renderPasswordResetEmail includes reset URL in html and text', async () => {
    const url = 'https://example.com/reset-password?token=abc';
    const { html, text, subject } = await renderPasswordResetEmail({ resetUrl: url });
    expect(subject).toBe('Reset your password');
    expect(html).toContain('reset-password?token=abc');
    expect(text).toContain('abc');
  });
});
