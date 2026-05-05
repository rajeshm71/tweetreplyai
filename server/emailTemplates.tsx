import * as React from 'react';
import { render } from '@react-email/render';
import { APP_DISPLAY_NAME } from '../shared/constants.js';
import WelcomeEmail from './emails/WelcomeEmail.js';
import PasswordResetEmail from './emails/PasswordResetEmail.js';
import SubscriptionActiveEmail from './emails/SubscriptionActiveEmail.js';
import SubscriptionCanceledEmail from './emails/SubscriptionCanceledEmail.js';
import PaymentFailedEmail from './emails/PaymentFailedEmail.js';
import UsageThresholdEmail from './emails/UsageThresholdEmail.js';
import ActivationNudgeEmail from './emails/ActivationNudgeEmail.js';
import ConversionEmail from './emails/ConversionEmail.js';
import WeeklyValueEmail from './emails/WeeklyValueEmail.js';
import WinBackEmail from './emails/WinBackEmail.js';
import TrialExpiringEmail from './emails/TrialExpiringEmail.js';
import PaymentReceiptEmail from './emails/PaymentReceiptEmail.js';
import FeatureUpdateEmail from './emails/FeatureUpdateEmail.js';
import PromoDiscountEmail from './emails/PromoDiscountEmail.js';
import NewsletterEmail from './emails/NewsletterEmail.js';

export interface TransactionalEmailPayload {
  subject: string;
  html: string;
  text: string;
}

async function renderBoth(element: React.ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(element, { pretty: true }),
    render(element, { plainText: true }),
  ]);
  return { html, text };
}

// ---------------------------------------------------------------------------
// Existing templates
// ---------------------------------------------------------------------------

export async function renderWelcomeEmail({
  firstName,
  appUrl,
}: {
  firstName?: string;
  appUrl: string;
}): Promise<TransactionalEmailPayload> {
  const { html, text } = await renderBoth(
    <WelcomeEmail firstName={firstName} appUrl={appUrl.replace(/\/$/, '')} />
  );
  return { subject: `Welcome to ${APP_DISPLAY_NAME}`, html, text };
}

export async function renderPasswordResetEmail({
  resetUrl,
}: {
  resetUrl: string;
}): Promise<TransactionalEmailPayload> {
  const { html, text } = await renderBoth(<PasswordResetEmail resetUrl={resetUrl} />);
  return { subject: 'Reset your password', html, text };
}

// ---------------------------------------------------------------------------
// Billing templates
// ---------------------------------------------------------------------------

export async function renderSubscriptionActiveEmail(params: {
  firstName?: string;
  planName: string;
  nextBillingDate: string;
  appUrl: string;
}): Promise<TransactionalEmailPayload> {
  const { html, text } = await renderBoth(<SubscriptionActiveEmail {...params} />);
  return { subject: `Your ${params.planName} plan is now active`, html, text };
}

export async function renderSubscriptionCanceledEmail(params: {
  firstName?: string;
  planName: string;
  accessUntil: string;
  appUrl: string;
}): Promise<TransactionalEmailPayload> {
  const { html, text } = await renderBoth(<SubscriptionCanceledEmail {...params} />);
  return { subject: `Your ${APP_DISPLAY_NAME} subscription is canceled`, html, text };
}

export async function renderPaymentFailedEmail(params: {
  firstName?: string;
  portalUrl: string;
}): Promise<TransactionalEmailPayload> {
  const { html, text } = await renderBoth(<PaymentFailedEmail {...params} />);
  return { subject: `Action required: your ${APP_DISPLAY_NAME} payment failed`, html, text };
}

// ---------------------------------------------------------------------------
// Usage / alert templates
// ---------------------------------------------------------------------------

export async function renderUsageThresholdEmail(params: {
  firstName?: string;
  pct: 80 | 100;
  used: number;
  limit: number;
  resetAt: string;
  upgradeUrl: string;
  appUrl: string;
  settingsUrl?: string;
  unsubscribeUrl?: string;
}): Promise<TransactionalEmailPayload> {
  const subject =
    params.pct >= 100
      ? "You've hit your limit, here's what to do"
      : "You've used 80% of your credits, heads up";
  const { html, text } = await renderBoth(<UsageThresholdEmail {...params} />);
  return { subject, html, text };
}

export async function renderConversionEmail(params: {
  firstName?: string;
  stage: 1 | 2 | 3;
  upgradeUrl: string;
  settingsUrl?: string;
  unsubscribeUrl?: string;
}): Promise<TransactionalEmailPayload> {
  const subjects: Record<1 | 2 | 3, string> = {
    1: "You're replying like a pro 🎯",
    2: "Don't lose your momentum",
    3: 'Last chance: upgrade and keep going',
  };
  const { html, text } = await renderBoth(<ConversionEmail {...params} />);
  return { subject: subjects[params.stage], html, text };
}

// ---------------------------------------------------------------------------
// Engagement templates
// ---------------------------------------------------------------------------

export async function renderActivationNudgeEmail(params: {
  firstName?: string;
  appUrl: string;
  settingsUrl?: string;
  unsubscribeUrl?: string;
}): Promise<TransactionalEmailPayload> {
  const { html, text } = await renderBoth(<ActivationNudgeEmail {...params} />);
  return { subject: "You haven't generated your first reply yet...", html, text };
}

export async function renderWeeklyValueEmail(params: {
  firstName?: string;
  tips: { headline: string; body: string }[];
  appUrl: string;
  settingsUrl?: string;
  unsubscribeUrl?: string;
}): Promise<TransactionalEmailPayload> {
  const { html, text } = await renderBoth(<WeeklyValueEmail {...params} />);
  return { subject: '5 reply frameworks that actually work this week', html, text };
}

export async function renderWinBackEmail(params: {
  firstName?: string;
  appUrl: string;
  settingsUrl?: string;
  unsubscribeUrl?: string;
}): Promise<TransactionalEmailPayload> {
  const { html, text } = await renderBoth(<WinBackEmail {...params} />);
  return { subject: 'We saved some viral opportunities for you', html, text };
}

export async function renderPaymentReceiptEmail(params: {
  firstName?: string;
  amountFormatted: string;
  planName: string;
  receiptDate: string;
  invoiceNumber?: string;
  billingUrl: string;
}): Promise<TransactionalEmailPayload> {
  const { html, text } = await renderBoth(<PaymentReceiptEmail {...params} />);
  return {
    subject: `Your ${APP_DISPLAY_NAME} receipt, ${params.amountFormatted}`,
    html,
    text,
  };
}

export async function renderTrialExpiringEmail(params: {
  firstName?: string;
  daysRemaining: number;
  used: number;
  limit: number;
  upgradeUrl: string;
  settingsUrl?: string;
  unsubscribeUrl?: string;
}): Promise<TransactionalEmailPayload> {
  const { html, text } = await renderBoth(<TrialExpiringEmail {...params} />);
  const dayWord = params.daysRemaining === 1 ? 'day' : 'days';
  return {
    subject: `Your ${APP_DISPLAY_NAME} trial ends in ${params.daysRemaining} ${dayWord}`,
    html,
    text,
  };
}

// ---------------------------------------------------------------------------
// Campaign / broadcast templates
// ---------------------------------------------------------------------------

export async function renderCampaignEmail(
  templateKey: 'feature_update' | 'promo_discount' | 'newsletter',
  subject: string,
  previewText: string,
  contentJson: Record<string, unknown>,
  settingsUrl?: string,
  unsubscribeUrl?: string,
): Promise<TransactionalEmailPayload> {
  let element: React.ReactElement;

  switch (templateKey) {
    case 'feature_update':
      element = (
        <FeatureUpdateEmail
          headline={String(contentJson.headline ?? '')}
          body={String(contentJson.body ?? '')}
          ctaLabel={String(contentJson.cta_label ?? 'Learn More')}
          ctaUrl={String(contentJson.cta_url ?? '')}
          settingsUrl={settingsUrl}
          unsubscribeUrl={unsubscribeUrl}
        />
      );
      break;
    case 'promo_discount':
      element = (
        <PromoDiscountEmail
          headline={String(contentJson.headline ?? '')}
          discountCode={String(contentJson.discount_code ?? '')}
          offerExpires={String(contentJson.offer_expires ?? '')}
          ctaLabel={String(contentJson.cta_label ?? 'Claim Now')}
          ctaUrl={String(contentJson.cta_url ?? '')}
          settingsUrl={settingsUrl}
          unsubscribeUrl={unsubscribeUrl}
        />
      );
      break;
    case 'newsletter': {
      const tips = (contentJson.tips as { headline: string; body: string }[]) ?? [];
      element = (
        <NewsletterEmail
          issueNumber={String(contentJson.issue_number ?? '1')}
          tips={tips}
          ctaLabel={String(contentJson.cta_label ?? 'Generate a Reply Now')}
          ctaUrl={String(contentJson.cta_url ?? '')}
          settingsUrl={settingsUrl}
          unsubscribeUrl={unsubscribeUrl}
        />
      );
      break;
    }
    default:
      throw new Error(`Unknown campaign templateKey: ${templateKey}`);
  }

  const { html, text } = await renderBoth(element);
  return { subject, html, text };
}
