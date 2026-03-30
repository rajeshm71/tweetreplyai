import crypto from 'crypto';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  tags?: { name: string; value: string }[];
  /**
   * Custom headers (e.g. RFC 2369 List-Unsubscribe + RFC 8058 one-click).
   */
  headers?: Record<string, string>;
  /**
   * Sent as Resend `Idempotency-Key` header (max 256 chars per Resend docs).
   * Longer keys are hashed to SHA-256 hex (64 chars).
   */
  idempotencyKey?: string;
}

/** Resend Idempotency-Key max length — trim via hash when longer. */
const RESEND_IDEMPOTENCY_KEY_MAX = 256;

export function toResendIdempotencyKeyHeader(internalKey: string): string {
  if (internalKey.length <= RESEND_IDEMPOTENCY_KEY_MAX) return internalKey;
  return crypto.createHash('sha256').update(internalKey, 'utf8').digest('hex');
}

/**
 * Thin Resend transport layer — handles the actual wire call.
 * Returns the Resend message ID on success, null when sending is disabled.
 */
export async function sendEmail(params: SendEmailParams): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.warn('[emailTransport]', {
      action: 'resend_disabled_missing_env',
      missingResendApiKey: !apiKey,
      missingResendFromEmail: !fromEmail,
    });
    return null;
  }

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);

  const payload: Parameters<typeof resend.emails.send>[0] = {
    from: fromEmail,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  };

  if (params.tags && params.tags.length > 0) {
    payload.tags = params.tags;
  }

  if (params.headers && Object.keys(params.headers).length > 0) {
    payload.headers = params.headers;
  }

  const sendOptions =
    params.idempotencyKey !== undefined
      ? { idempotencyKey: toResendIdempotencyKeyHeader(params.idempotencyKey) }
      : undefined;

  const { data, error } = await resend.emails.send(payload, sendOptions);

  if (error) {
    console.error('[emailTransport] Resend API error:', error);
    throw error;
  }

  const id = data?.id ?? null;
  if (!id) {
    console.warn('[emailTransport]', { action: 'resend_accepted_no_message_id' });
  }

  return id;
}
