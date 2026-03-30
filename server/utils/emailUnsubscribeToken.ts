import crypto from 'crypto';

/** Matches preference gates in emailService.dispatch */
export type EmailUnsubscribeScope = 'marketing' | 'product_tips' | 'usage_alerts';

const TTL_MS = 365 * 24 * 60 * 60 * 1000;

function getSecret(): string | undefined {
  const s = process.env.EMAIL_UNSUBSCRIBE_SECRET ?? process.env.SESSION_SECRET;
  if (!s || s.length < 8) return undefined;
  return s;
}

export function buildEmailUnsubscribeUrl(
  userId: string,
  scope: EmailUnsubscribeScope,
  appUrl: string,
): string | undefined {
  const secret = getSecret();
  if (!secret) return undefined;
  const token = signToken(userId, scope, secret);
  const base = appUrl.replace(/\/$/, '');
  return `${base}/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

function signToken(userId: string, scope: EmailUnsubscribeScope, secret: string): string {
  const exp = Date.now() + TTL_MS;
  const payload = JSON.stringify({ u: userId, s: scope, exp });
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function isValidScope(s: string): s is EmailUnsubscribeScope {
  return s === 'marketing' || s === 'product_tips' || s === 'usage_alerts';
}

/** RFC 2369 + RFC 8058 headers for Resend / mailbox one-click unsubscribe. */
export function listUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export function verifyEmailUnsubscribeToken(
  token: string,
): { userId: string; scope: EmailUnsubscribeScope } | null {
  const secret = getSecret();
  if (!secret) return null;
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  if (!timingSafeEqualStr(sig, expectedSig)) return null;
  let parsed: { u?: string; s?: string; exp?: number };
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!parsed.u || !parsed.s || typeof parsed.exp !== 'number') return null;
  if (!isValidScope(parsed.s)) return null;
  if (Date.now() > parsed.exp) return null;
  return { userId: parsed.u, scope: parsed.s };
}
