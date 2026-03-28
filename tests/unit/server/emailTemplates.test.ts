import { describe, expect, it } from 'vitest';
import {
  renderWelcomeEmail,
  renderPasswordResetEmail,
  renderSubscriptionActiveEmail,
  renderSubscriptionCanceledEmail,
  renderPaymentFailedEmail,
  renderUsageThresholdEmail,
  renderConversionEmail,
  renderActivationNudgeEmail,
  renderWeeklyValueEmail,
  renderWinBackEmail,
  renderCampaignEmail,
} from '../../../server/emailTemplates';

// ---------------------------------------------------------------------------
// Welcome + Password Reset (existing)
// ---------------------------------------------------------------------------

describe('renderWelcomeEmail', () => {
  it('includes app URL and firstName', async () => {
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

  it('uses "there" when firstName is omitted', async () => {
    const { html, text } = await renderWelcomeEmail({ appUrl: 'https://example.com' });
    expect(html).toContain('there');
    expect(text).toMatch(/there/);
  });
});

describe('renderPasswordResetEmail', () => {
  it('includes reset URL in html and text', async () => {
    const url = 'https://example.com/reset-password?token=abc';
    const { html, text, subject } = await renderPasswordResetEmail({ resetUrl: url });
    expect(subject).toBe('Reset your password');
    expect(html).toContain('reset-password?token=abc');
    expect(text).toContain('abc');
  });
});

// ---------------------------------------------------------------------------
// Billing templates
// ---------------------------------------------------------------------------

describe('renderSubscriptionActiveEmail', () => {
  it('contains planName and nextBillingDate', async () => {
    const { html, text, subject } = await renderSubscriptionActiveEmail({
      firstName: 'Bob',
      planName: 'Pro',
      nextBillingDate: 'April 1, 2026',
      appUrl: 'https://app.example.com',
    });
    expect(subject).toContain('Pro');
    expect(html).toContain('Pro');
    expect(html).toContain('April 1, 2026');
    expect(text.length).toBeGreaterThan(0);
  });
});

describe('renderSubscriptionCanceledEmail', () => {
  it('contains accessUntil date', async () => {
    const { html, text } = await renderSubscriptionCanceledEmail({
      firstName: 'Carol',
      planName: 'Starter',
      accessUntil: 'March 31, 2026',
      appUrl: 'https://app.example.com',
    });
    expect(html).toContain('March 31, 2026');
    expect(text.length).toBeGreaterThan(0);
  });
});

describe('renderPaymentFailedEmail', () => {
  it('contains portal URL', async () => {
    const { html, text, subject } = await renderPaymentFailedEmail({
      firstName: 'Dave',
      portalUrl: 'https://billing.example.com/portal',
    });
    expect(subject).toContain('payment failed');
    expect(html).toContain('billing.example.com/portal');
    expect(text.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Usage / alert templates
// ---------------------------------------------------------------------------

describe('renderUsageThresholdEmail', () => {
  const base = {
    firstName: 'Eve',
    used: 80,
    limit: 100,
    resetAt: 'April 30, 2026',
    upgradeUrl: 'https://example.com/pricing',
    appUrl: 'https://example.com',
    settingsUrl: 'https://example.com/settings',
  };

  it('80% threshold subject and content', async () => {
    const { html, text, subject } = await renderUsageThresholdEmail({ ...base, pct: 80 });
    expect(subject).toContain('80%');
    expect(html).toContain('80');
    expect(text.length).toBeGreaterThan(0);
  });

  it('100% limit hit subject and content', async () => {
    const { html, subject } = await renderUsageThresholdEmail({ ...base, pct: 100 });
    expect(subject).toContain('limit');
    expect(html).toContain('100');
  });
});

describe('renderConversionEmail', () => {
  it('stage 1 has correct subject', async () => {
    const { subject } = await renderConversionEmail({
      firstName: 'Frank',
      stage: 1,
      upgradeUrl: 'https://example.com/pricing',
    });
    expect(subject).toContain('pro');
  });

  it('stage 3 has "Last chance" subject', async () => {
    const { subject } = await renderConversionEmail({
      firstName: 'Frank',
      stage: 3,
      upgradeUrl: 'https://example.com/pricing',
    });
    expect(subject).toContain('Last chance');
  });
});

// ---------------------------------------------------------------------------
// Engagement templates
// ---------------------------------------------------------------------------

describe('renderActivationNudgeEmail', () => {
  it('generates valid html and text', async () => {
    const { html, text, subject } = await renderActivationNudgeEmail({
      firstName: 'Grace',
      appUrl: 'https://example.com',
    });
    expect(subject).toContain('first reply');
    expect(html.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
  });
});

describe('renderWeeklyValueEmail', () => {
  it('renders all tips', async () => {
    const tips = [
      { headline: 'Tip 1', body: 'Body 1' },
      { headline: 'Tip 2', body: 'Body 2' },
    ];
    const { html, text } = await renderWeeklyValueEmail({
      firstName: 'Heidi',
      tips,
      appUrl: 'https://example.com',
    });
    expect(html).toContain('Tip 1');
    expect(html).toContain('Tip 2');
    expect(text).toContain('Tip 1');
  });
});

describe('renderWinBackEmail', () => {
  it('generates valid html and text', async () => {
    const { html, text, subject } = await renderWinBackEmail({
      firstName: 'Ivan',
      appUrl: 'https://example.com',
    });
    expect(subject).toContain('viral');
    expect(html.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Campaign templates
// ---------------------------------------------------------------------------

describe('renderCampaignEmail', () => {
  it('feature_update renders headline and body', async () => {
    const { html, text } = await renderCampaignEmail(
      'feature_update',
      'New Feature!',
      'Check out the new feature',
      { headline: 'LinkedIn Support', body: 'You can now reply to LinkedIn posts.', cta_label: 'Try it', cta_url: 'https://example.com' }
    );
    expect(html).toContain('LinkedIn Support');
    expect(text.toLowerCase()).toContain('linkedin support');
  });

  it('promo_discount renders discount code', async () => {
    const { html } = await renderCampaignEmail(
      'promo_discount',
      '30% Off',
      'Limited time',
      { headline: 'Save 30%', discount_code: 'SAVE30', offer_expires: 'April 5, 2026', cta_label: 'Claim', cta_url: 'https://example.com/pricing' }
    );
    expect(html).toContain('SAVE30');
  });

  it('newsletter renders issue number and tips', async () => {
    const { html } = await renderCampaignEmail(
      'newsletter',
      'Weekly Newsletter',
      'Issue #5',
      {
        issue_number: '5',
        tips: [{ headline: 'Hook #1', body: 'Use strong hooks.' }],
        cta_label: 'Reply Now',
        cta_url: 'https://example.com',
      }
    );
    expect(html).toContain('Hook #1');
    expect(html).toContain('#5');
  });

  it('throws for unknown templateKey', async () => {
    await expect(
      renderCampaignEmail(
        'unknown_key' as any,
        'Subject',
        'Preview',
        {}
      )
    ).rejects.toThrow(/unknown_key/i);
  });
});
