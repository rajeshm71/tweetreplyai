import { PLAN_LIMITS, PLAN_PERIODS_DAYS } from "@shared/constants";

export interface PricingOffer {
  active: boolean;
  label: string; // e.g., "_ 50% off"
  percent?: number;
  startsAt?: string; // ISO date
  endsAt?: string;   // ISO date
}

export interface PricingTierConfig {
  code: 'trial' | 'weekly' | 'monthly';
  name: string;
  billingCycle: 'trial' | 'weekly' | 'monthly';
  price: number; // USD per cycle (discounted price if offer active)
  originalPrice?: number; // USD per cycle (original price before discount)
  repliesLimit: number; // Keep for analytics display
  creditsLimit: number; // NEW - actual limit for enforcement
  features: string[];
  badge?: { text: string; colorClass: string };
  offer?: PricingOffer;
  buttonCta?: string;
}

export const PRICING_CONFIG = {
  trial: {
    code: 'trial',
    name: 'Free Trial',
    billingCycle: 'trial',
    price: 0,
    repliesLimit: PLAN_LIMITS.trial.replies,
    creditsLimit: PLAN_LIMITS.trial.credits,
    features: [
      `${PLAN_LIMITS.trial.credits} credits during trial`,
      'Chrome extension access',
      'Mobile web interface',
      'AI generated replies',
    ],
    buttonCta: 'Subscribe',
  },
  weekly: {
    code: 'weekly',
    name: 'Weekly',
    billingCycle: 'weekly',
    price: 3.99,
    originalPrice: 7.99,
    repliesLimit: PLAN_LIMITS.weekly.replies,
    creditsLimit: PLAN_LIMITS.weekly.credits,
    features: [
      'All trial features',
      'Priority AI model access',
      'Email support',
    ],
    offer: {
      active: (import.meta as any).env?.VITE_SHOW_OFFERS !== 'false',
      label: '_ 50% off',
      percent: 50,
    },
    buttonCta: 'Subscribe',
  },
  monthly: {
    code: 'monthly',
    name: 'Monthly',
    billingCycle: 'monthly',
    price: 9.99,
    originalPrice: 19.99,
    repliesLimit: PLAN_LIMITS.monthly.replies,
    creditsLimit: PLAN_LIMITS.monthly.credits,
    features: [
      'All weekly features',
      'Best value per reply',
      'Priority support',
    ],
    offer: {
      active: (import.meta as any).env?.VITE_SHOW_OFFERS !== 'false',
      label: '_ 50% off',
      percent: 50,
    },
    buttonCta: 'Subscribe',
  },
} as const satisfies Record<string, PricingTierConfig>;

export function formatRepliesLimit(n: number): string {
  return `${n.toLocaleString()} replies`;
}

export function formatCreditsLimit(n: number): string {
  return `${n.toLocaleString()} credits`;
}

export function repliesPerCycleLabel(cfg: PricingTierConfig): string {
  if (cfg.billingCycle === 'weekly') return `${formatRepliesLimit(cfg.repliesLimit)} per week`;
  if (cfg.billingCycle === 'monthly') return `${formatRepliesLimit(cfg.repliesLimit)} per month`;
  return `${formatRepliesLimit(cfg.repliesLimit)} per day for 7 days`;
}

export function creditsPerCycleLabel(cfg: PricingTierConfig): string {
  if (cfg.billingCycle === 'weekly') return `${formatCreditsLimit(cfg.creditsLimit)} per week`;
  if (cfg.billingCycle === 'monthly') return `${formatCreditsLimit(cfg.creditsLimit)} per month`;
  return `${formatCreditsLimit(cfg.creditsLimit)} for trial`;
}

export function repliesEveryPeriodBullet(cfg: PricingTierConfig): string {
  if (cfg.billingCycle === 'weekly') return `${formatRepliesLimit(cfg.repliesLimit)} every ${PLAN_PERIODS_DAYS.weekly} days`;
  if (cfg.billingCycle === 'monthly') return `${formatRepliesLimit(cfg.repliesLimit)} every ${PLAN_PERIODS_DAYS.monthly} days`;
  return `${formatCreditsLimit(cfg.creditsLimit)} during trial`;
}

/** Credits-based period bullet (single source for quota display). Use instead of repliesEveryPeriodBullet for plan limits. */
export function creditsEveryPeriodBullet(cfg: PricingTierConfig): string {
  if (cfg.billingCycle === 'weekly') return `${formatCreditsLimit(cfg.creditsLimit)} every ${PLAN_PERIODS_DAYS.weekly} days`;
  if (cfg.billingCycle === 'monthly') return `${formatCreditsLimit(cfg.creditsLimit)} every ${PLAN_PERIODS_DAYS.monthly} days`;
  return `${formatCreditsLimit(cfg.creditsLimit)} during trial`;
}

/**
 * Single source of truth for quota FAQ copy.
 * Uses PLAN_LIMITS and PLAN_PERIODS_DAYS so changes propagate automatically.
 */
export function getQuotaSummaryText(): string {
  const trialCredits = formatCreditsLimit(PLAN_LIMITS.trial.credits);
  const weeklyCredits = formatCreditsLimit(PLAN_LIMITS.weekly.credits);
  const monthlyCredits = formatCreditsLimit(PLAN_LIMITS.monthly.credits);

  return `Your quota resets automatically based on your plan. Trial users get ${trialCredits} for trial, weekly subscribers get ${weeklyCredits} every ${PLAN_PERIODS_DAYS.weekly} days, and monthly subscribers get ${monthlyCredits} every ${PLAN_PERIODS_DAYS.monthly} days.`;
}

/**
 * Helper for plan quota bullets (e.g., Terms page).
 * Returns human-readable bullet strings for each plan.
 */
export function getPlanQuotaBullets(): string[] {
  const trialCredits = formatCreditsLimit(PLAN_LIMITS.trial.credits);
  const weeklyCredits = formatCreditsLimit(PLAN_LIMITS.weekly.credits);
  const monthlyCredits = formatCreditsLimit(PLAN_LIMITS.monthly.credits);

  return [
    `Free Trial: ${trialCredits} for trial`,
    `Weekly Plan: ${weeklyCredits} every ${PLAN_PERIODS_DAYS.weekly} days`,
    `Monthly Plan: ${monthlyCredits} every ${PLAN_PERIODS_DAYS.monthly} days`,
  ];
}
