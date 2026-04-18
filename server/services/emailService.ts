import crypto from 'crypto';
import { storage } from '../storage.js';
import { sendEmail } from '../utils/emailTransport.js';
import {
  buildEmailUnsubscribeUrl,
  listUnsubscribeHeaders,
  type EmailUnsubscribeScope,
} from '../utils/emailUnsubscribeToken.js';
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
  renderTrialExpiringEmail,
  renderPaymentReceiptEmail,
} from '../emailTemplates.js';
import type { UsageCounter, User, EmailCampaign } from '../../shared/types.js';

const APP_URL = (process.env.APP_URL || process.env.DOMAIN || 'http://localhost:5000').replace(/\/$/, '');
const UPGRADE_URL = `${APP_URL}/pricing`;
const SETTINGS_URL = `${APP_URL}/settings`;

/** Categories that are never rate-limited or preference-gated */
const ALWAYS_SEND = new Set(['security', 'transactional', 'billing']);

const MONTHLY_EMAIL_MAX = 15;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function toDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
}

function idempotencyKeyForLog(key: string): string {
  return key.length > 80 ? `${key.slice(0, 80)}…` : key;
}

function emailRecipientForLog(email: string): string {
  const at = email.indexOf('@');
  return at === -1 ? '(invalid)' : `***@${email.slice(at + 1)}`;
}

/**
 * FIX: Handle non-hex user IDs (varchar) that make parseInt(...,16) yield NaN.
 * Fall back to a djb2-style hash of the full string so the split is always 50/50.
 */
function abVariant(userId: string): 'A' | 'B' {
  const lastChar = userId.slice(-1);
  const parsed = parseInt(lastChar, 16);
  const bucket = Number.isNaN(parsed)
    ? userId.split('').reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0)
    : parsed;
  return bucket % 2 === 0 ? 'A' : 'B';
}

function unsubscribeScopeForCategory(category: string): EmailUnsubscribeScope | undefined {
  if (category === 'usage_alerts' || category === 'conversion') return 'usage_alerts';
  if (category === 'engagement') return 'product_tips';
  return undefined;
}

type EmailRenderContext = { unsubscribeUrl?: string };

/** Core send flow: dedup → pref check → rate limit → render → send → log */
async function dispatch({
  userId,
  toEmail,
  templateKey,
  idempotencyKey,
  category,
  render,
  abVariantValue,
}: {
  userId: string;
  toEmail: string;
  templateKey: string;
  idempotencyKey: string;
  category: string;
  render: (ctx: EmailRenderContext) => Promise<{ subject: string; html: string; text: string }>;
  abVariantValue?: 'A' | 'B';
}): Promise<void> {
  // 1. Idempotency — insert log row first; duplicate + prior `failed` reclaims slot for Resend retry
  const slot = await storage.logEmailSend({
    userId,
    templateKey,
    idempotencyKey,
    status: 'pending',
    abVariant: abVariantValue,
  });

  if (slot === 'duplicate') {
    console.log('[emailService] dispatch skipped: duplicate idempotency', {
      templateKey,
      idempotencyKey: idempotencyKeyForLog(idempotencyKey),
      userId,
    });
    return;
  }

  if (slot === 'claimed_failed_retry') {
    console.log('[emailService] dispatch: retry after prior Resend failure', {
      templateKey,
      idempotencyKey: idempotencyKeyForLog(idempotencyKey),
      userId,
    });
  }

  // 2. Preference gate (non-critical categories only)
  if (!ALWAYS_SEND.has(category)) {
    const prefs = await storage.getEmailPreferences(userId);
    const defaults = { usageAlerts: true, productTips: true, marketing: true };
    // Guard against partially-populated rows (e.g. NULL columns) by defaulting per-field.
    const effective = {
      usageAlerts: prefs?.usageAlerts ?? defaults.usageAlerts,
      productTips: prefs?.productTips ?? defaults.productTips,
      marketing: prefs?.marketing ?? defaults.marketing,
    };

    if (
      (category === 'usage_alerts' || category === 'conversion') &&
      !effective.usageAlerts
    ) {
      await storage.updateEmailSendLog(idempotencyKey, { status: 'skipped_pref' });
      return;
    }
    if (category === 'engagement' && !effective.productTips) {
      await storage.updateEmailSendLog(idempotencyKey, { status: 'skipped_pref' });
      return;
    }
    if (category === 'marketing' && !effective.marketing) {
      await storage.updateEmailSendLog(idempotencyKey, { status: 'skipped_pref' });
      return;
    }
  }

  // 3. Rate limiting: max 1 engagement email per user per 24 h
  if (category === 'engagement') {
    const dailyCount = await storage.countRecentEmails(userId, 24);
    // FIX (fix2): countRecentEmails now filters status IN ('sent','delivered') so the
    // pending row we just inserted is NOT included. Check > 0 (any sent email today).
    if (dailyCount > 0) {
      console.log(`[emailService] rate limit (daily engagement): ${userId}`);
      await storage.updateEmailSendLog(idempotencyKey, { status: 'skipped_rate' });
      return;
    }
  }

  // 4. Monthly global cap (non-critical categories)
  if (!ALWAYS_SEND.has(category)) {
    const monthlyCount = await storage.countMonthlyEmails(userId);
    if (monthlyCount > MONTHLY_EMAIL_MAX) {
      console.warn(`[emailService] monthly cap reached for user ${userId}`);
      await storage.updateEmailSendLog(idempotencyKey, { status: 'skipped_rate' });
      return;
    }
  }

  const scope = unsubscribeScopeForCategory(category);
  const unsubscribeUrl =
    !ALWAYS_SEND.has(category) && scope
      ? buildEmailUnsubscribeUrl(userId, scope, APP_URL)
      : undefined;

  // 5. Render
  const { subject, html, text } = await render({ unsubscribeUrl });

  // 6. Send — Resend Idempotency-Key header + email_id on webhooks correlate to resend_message_id (no custom tags; tag values disallow colons)
  let messageId: string | null = null;
  console.log('[emailService] dispatch sending', {
    templateKey,
    idempotencyKey: idempotencyKeyForLog(idempotencyKey),
    to: emailRecipientForLog(toEmail),
  });
  try {
    messageId = await sendEmail({
      to: toEmail,
      subject,
      html,
      text,
      idempotencyKey,
      headers: unsubscribeUrl ? listUnsubscribeHeaders(unsubscribeUrl) : undefined,
    });
  } catch (err) {
    console.error('[emailService] dispatch resend_failed', {
      templateKey,
      idempotencyKey: idempotencyKeyForLog(idempotencyKey),
      error: err instanceof Error ? err.message : String(err),
    });
    await storage.updateEmailSendLog(idempotencyKey, { status: 'failed' });
    throw err;
  }

  // 7. Update log with Resend message ID
  await storage.updateEmailSendLog(idempotencyKey, {
    status: 'sent',
    resendMessageId: messageId ?? undefined,
  });

  console.log('[emailService] dispatch sent', {
    templateKey,
    resendMessageId: messageId ?? null,
  });
}

// ---------------------------------------------------------------------------
// Public send methods
// ---------------------------------------------------------------------------

export async function sendWelcome(userId: string): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user) return;

  await dispatch({
    userId,
    toEmail: user.email,
    templateKey: 'welcome',
    idempotencyKey: `welcome:${userId}`,
    category: 'transactional',
    render: (_ctx) => renderWelcomeEmail({ firstName: user.firstName, appUrl: APP_URL }),
  });
}

export async function sendPasswordReset(userId: string, token: string): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user) return;
  const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;

  await dispatch({
    userId,
    toEmail: user.email,
    templateKey: 'password_reset',
    idempotencyKey: `reset:${userId}:${hashToken(token)}`,
    category: 'security',
    render: (_ctx) => renderPasswordResetEmail({ resetUrl }),
  });
}

export async function sendSubscriptionActive(
  userId: string,
  subId: string,
  planCode: string,
  nextBillingDate: string
): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user) return;

  await dispatch({
    userId,
    toEmail: user.email,
    templateKey: 'subscription_active',
    idempotencyKey: `subscription.created:${subId}`,
    category: 'transactional',
    render: (_ctx) =>
      renderSubscriptionActiveEmail({
        firstName: user.firstName,
        planName: planCode,
        nextBillingDate,
        appUrl: APP_URL,
      }),
  });
}

export async function sendSubscriptionCanceled(
  userId: string,
  subId: string,
  planCode: string,
  accessUntil: string
): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user) return;

  await dispatch({
    userId,
    toEmail: user.email,
    templateKey: 'subscription_canceled',
    idempotencyKey: `subscription.canceled:${subId}`,
    category: 'billing',
    render: (_ctx) =>
      renderSubscriptionCanceledEmail({
        firstName: user.firstName,
        planName: planCode,
        accessUntil,
        appUrl: APP_URL,
      }),
  });
}

export async function sendPaymentFailed(userId: string, subId: string): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user) return;
  const dateIso = toDateIso(new Date());

  await dispatch({
    userId,
    toEmail: user.email,
    templateKey: 'payment_failed',
    // Keyed by sub + date so only one email per day per subscription
    idempotencyKey: `payment.failed:${subId}:${dateIso}`,
    category: 'billing',
    render: (_ctx) =>
      renderPaymentFailedEmail({ firstName: user.firstName, portalUrl: UPGRADE_URL }),
  });
}

export async function sendUsageThreshold(
  userId: string,
  pct: 80 | 100,
  counter: Pick<UsageCounter, 'creditsUsed' | 'limit' | 'periodStart'>
): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user) return;
  const periodStartIso = toDateIso(new Date(counter.periodStart));
  const resetAt = new Date(counter.periodStart);
  resetAt.setMonth(resetAt.getMonth() + 1);

  await dispatch({
    userId,
    toEmail: user.email,
    templateKey: `usage_threshold_${pct}`,
    idempotencyKey: `usage.threshold:${pct}:${userId}:${periodStartIso}`,
    category: 'usage_alerts',
    render: (ctx) =>
      renderUsageThresholdEmail({
        firstName: user.firstName,
        pct,
        used: counter.creditsUsed,
        limit: counter.limit,
        resetAt: resetAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        upgradeUrl: UPGRADE_URL,
        appUrl: APP_URL,
        settingsUrl: SETTINGS_URL,
        unsubscribeUrl: ctx.unsubscribeUrl,
      }),
  });
}

export async function sendConversionStage(
  userId: string,
  stage: 1 | 2 | 3,
  counter: Pick<UsageCounter, 'periodStart'>
): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user) return;
  const periodStartIso = toDateIso(new Date(counter.periodStart));
  const variant = abVariant(userId);

  await dispatch({
    userId,
    toEmail: user.email,
    templateKey: `conversion_stage_${stage}`,
    idempotencyKey: `conversion.up${stage}:${userId}:${periodStartIso}`,
    category: 'conversion',
    abVariantValue: variant,
    render: (ctx) =>
      renderConversionEmail({
        firstName: user.firstName,
        stage,
        upgradeUrl: UPGRADE_URL,
        settingsUrl: SETTINGS_URL,
        unsubscribeUrl: ctx.unsubscribeUrl,
      }),
  });
}

export async function sendPaymentReceipt(
  userId: string,
  params: {
    paymentId: string;
    amountFormatted: string;
    planName: string;
    receiptDate: string;
    invoiceNumber?: string;
  },
): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user) return;

  await dispatch({
    userId,
    toEmail: user.email,
    templateKey: 'payment_receipt',
    // One email per unique payment id; safe to re-run webhook.
    idempotencyKey: `payment.receipt:${params.paymentId}`,
    category: 'billing',
    render: (_ctx) =>
      renderPaymentReceiptEmail({
        firstName: user.firstName,
        amountFormatted: params.amountFormatted,
        planName: params.planName,
        receiptDate: params.receiptDate,
        invoiceNumber: params.invoiceNumber,
        billingUrl: `${APP_URL}/settings`,
      }),
  });
}

export async function sendTrialExpiring(
  userId: string,
  daysRemaining: number,
  counter: Pick<UsageCounter, 'periodStart' | 'creditsUsed' | 'limit'>,
): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user) return;
  const periodStartIso = toDateIso(new Date(counter.periodStart));

  await dispatch({
    userId,
    toEmail: user.email,
    templateKey: 'trial_expiring',
    // One email per user per trial period per reminder day.
    idempotencyKey: `trial.expiring:${userId}:${periodStartIso}:d${daysRemaining}`,
    category: 'conversion',
    render: (ctx) =>
      renderTrialExpiringEmail({
        firstName: user.firstName,
        daysRemaining,
        used: counter.creditsUsed,
        limit: counter.limit,
        upgradeUrl: UPGRADE_URL,
        settingsUrl: SETTINGS_URL,
        unsubscribeUrl: ctx.unsubscribeUrl,
      }),
  });
}

export async function sendActivationNudge(userId: string): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user) return;
  const dateIso = toDateIso(new Date());

  await dispatch({
    userId,
    toEmail: user.email,
    templateKey: 'activation_nudge',
    idempotencyKey: `activation.nudge:${userId}:${dateIso}`,
    category: 'engagement',
    render: (ctx) =>
      renderActivationNudgeEmail({
        firstName: user.firstName,
        appUrl: APP_URL,
        settingsUrl: SETTINGS_URL,
        unsubscribeUrl: ctx.unsubscribeUrl,
      }),
  });
}

export async function sendWeeklyValue(userId: string): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user) return;
  const weekIso = isoWeek(new Date());

  const defaultTips = [
    {
      headline: 'Ask a polarizing question',
      body: 'Replies that end with a question get 2–3× more replies themselves. Try "Agree or disagree?"',
    },
    {
      headline: 'Share a contrarian take',
      body: "Challenge conventional wisdom in your niche. Controversy sparks engagement — as long as it's grounded.",
    },
    {
      headline: 'Add social proof',
      body: 'Reference results, numbers, or outcomes in your reply. "After 90 days of doing X, I saw Y."',
    },
    {
      headline: 'Use the "Yes, and…" framework',
      body: "Agree with the tweet, then add your own insight. It shows you're collaborative, not combative.",
    },
    {
      headline: 'Be specific, not vague',
      body: 'Instead of "Great point!", say "Great point — especially the part about X because Y."',
    },
  ];

  await dispatch({
    userId,
    toEmail: user.email,
    templateKey: 'weekly_value',
    idempotencyKey: `weekly:${userId}:${weekIso}`,
    category: 'engagement',
    render: (ctx) =>
      renderWeeklyValueEmail({
        firstName: user.firstName,
        tips: defaultTips,
        appUrl: APP_URL,
        settingsUrl: SETTINGS_URL,
        unsubscribeUrl: ctx.unsubscribeUrl,
      }),
  });
}

export async function sendWinBack(userId: string): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user) return;
  const weekIso = isoWeek(new Date());

  await dispatch({
    userId,
    toEmail: user.email,
    templateKey: 'win_back',
    idempotencyKey: `winback:${userId}:${weekIso}`,
    category: 'engagement',
    render: (ctx) =>
      renderWinBackEmail({
        firstName: user.firstName,
        appUrl: APP_URL,
        settingsUrl: SETTINGS_URL,
        unsubscribeUrl: ctx.unsubscribeUrl,
      }),
  });
}

// ---------------------------------------------------------------------------
// Campaign / broadcast
// ---------------------------------------------------------------------------

/**
 * FIX: Campaign batch improvements:
 * - Gate paid/trial/inactive segments with marketing preference (not just 'all')
 * - Persist `skipped` count to campaign row
 * - Only mark status='sending' when transitioning from draft/scheduled
 */
export async function sendCampaignBatch(
  campaignId: string
): Promise<{ sent: number; skipped: number }> {
  const campaign = await storage.getEmailCampaign(campaignId);
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    throw new Error(`Campaign ${campaignId} is not in a sendable state: ${campaign.status}`);
  }

  await storage.updateEmailCampaign(campaignId, { status: 'sending' });

  const users = await storage.getUsersForSegment(campaign.segment);

  const filteredUsers: User[] = [];
  for (const user of users) {
    const prefs = await storage.getEmailPreferences(user.id);
    const marketingOn = prefs?.marketing ?? true;
    if (!marketingOn) continue;
    filteredUsers.push(user);
  }

  let sent = 0;
  let skipped = 0;

  // Performance: avoid expensive React-email rendering per recipient by rendering once with a placeholder
  // then swapping in the signed unsubscribe URL for each user.
  const UNSUB_PLACEHOLDER = '[[UNSUBSCRIBE_URL]]';
  const basePayload = await renderCampaignEmail(
    campaign.templateKey as 'feature_update' | 'promo_discount' | 'newsletter',
    campaign.subject,
    campaign.previewText ?? '',
    campaign.contentJson,
    SETTINGS_URL,
    UNSUB_PLACEHOLDER,
  );

  // Batch send in chunks of 50 to avoid overwhelming Resend rate limits
  const CHUNK = 50;
  for (let i = 0; i < filteredUsers.length; i += CHUNK) {
    const chunk = filteredUsers.slice(i, i + CHUNK);
    const results = await Promise.allSettled(
      chunk.map(async (user): Promise<'sent' | 'skipped'> => {
        // FIX (fix4): Per-recipient idempotency key prevents duplicate sends if the admin
        // clicks send twice or the cron fires before the campaign status transitions to 'sent'.
        const recipientKey = `campaign:${campaignId}:${user.id}`;
        const slot = await storage.logEmailSend({
          userId: user.id,
          templateKey: `campaign_${campaign.templateKey}`,
          idempotencyKey: recipientKey,
          status: 'pending',
        });

        if (slot === 'duplicate') {
          return 'skipped';
        }

        const unsubscribeUrl = buildEmailUnsubscribeUrl(user.id, 'marketing', APP_URL);
        const payload = {
          subject: basePayload.subject,
          html: basePayload.html.replaceAll(UNSUB_PLACEHOLDER, unsubscribeUrl),
          text: basePayload.text.replaceAll(UNSUB_PLACEHOLDER, unsubscribeUrl),
        };

        try {
          const messageId = await sendEmail({
            to: user.email,
            subject: payload.subject,
            html: payload.html,
            text: payload.text,
            idempotencyKey: recipientKey,
            headers: unsubscribeUrl ? listUnsubscribeHeaders(unsubscribeUrl) : undefined,
          });
          await storage.updateEmailSendLog(recipientKey, {
            status: 'sent',
            resendMessageId: messageId ?? undefined,
          });
          return 'sent';
        } catch (err) {
          await storage.updateEmailSendLog(recipientKey, { status: 'failed' });
          throw err; // re-throw so Promise.allSettled records it as 'rejected'
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value === 'sent') sent++;
        else skipped++;
      } else {
        console.error(`[emailService] campaign send failed:`, result.reason);
        skipped++;
      }
    }
  }

  await storage.updateEmailCampaign(campaignId, {
    status: 'sent',
    sentAt: new Date(),
    recipientCount: sent,
  });

  console.log(`[emailService] campaign ${campaignId} sent: ${sent}, skipped: ${skipped}`);
  return { sent, skipped };
}

/**
 * Sync a user's contact to Resend's Global Contacts.
 * NOTE: Resend deprecated Audiences (audience_id) in Nov 2025. Contacts are now
 * global entities — no audience_id needed. create() is idempotent by email address.
 */
export async function syncContactToResend(user: {
  email: string;
  firstName?: string;
  lastName?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    await resend.contacts.create({
      email: user.email,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      unsubscribed: false,
    });
  } catch (err) {
    console.error('[emailService] syncContactToResend error:', err);
  }
}

/**
 * Mark a contact as globally unsubscribed in Resend.
 * NOTE: New API supports update-by-email directly — no need to list contacts first.
 */
export async function unsubscribeContactInResend(email: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    await resend.contacts.update({
      email,
      unsubscribed: true,
    });
  } catch (err) {
    console.error('[emailService] unsubscribeContactInResend error:', err);
  }
}
