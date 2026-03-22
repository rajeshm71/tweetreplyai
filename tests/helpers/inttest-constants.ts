/**
 * Stable ids and emails for JWT + DB integration tests.
 * Emails must match `inttest-%@example.com` so `cleanDatabase` removes related rows.
 */
export const INTEG_JWT_USER_IDS = {
  billing: "inttest-billing-user",
  subscription: "inttest-sub-user",
  ai: "inttest-ai-user",
  usage: "inttest-usage-user",
  aiReal: "inttest-ai-real-user",
  feedback: "inttest-feedback-user",
  preferences: "inttest-prefs-user",
  analytics: "inttest-analytics-user",
  extension: "inttest-extension-user",
  /** Dedicated user for 402 quota integration (exhausted trial counter). */
  quota402: "inttest-402-user",
  /** Webhook payment.succeeded integration — email must match mock event. */
  webhookPay: "inttest-webhook-pay-user",
  /** POST /api/suggest-improvements with AI + usage mocked. */
  suggest: "inttest-suggest-user",
} as const;

export const INTEG_EMAILS = {
  billing: "inttest-billing@example.com",
  subscription: "inttest-subscription@example.com",
  ai: "inttest-ai@example.com",
  usage: "inttest-usage@example.com",
  aiReal: "inttest-ai-real@example.com",
  feedback: "inttest-feedback@example.com",
  preferences: "inttest-prefs@example.com",
  analytics: "inttest-analytics@example.com",
  extension: "inttest-extension@example.com",
  quota402: "inttest-402@example.com",
  webhookPay: "inttest-webhook-pay@example.com",
  suggest: "inttest-suggest@example.com",
} as const;

export const STATIC_INTEST_USER_IDS: string[] = [...Object.values(INTEG_JWT_USER_IDS)];
