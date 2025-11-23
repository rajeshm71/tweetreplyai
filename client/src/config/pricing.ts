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
    repliesLimit: 10, // Keep for analytics display
    creditsLimit: 50, // NEW - actual limit (from TRIAL_LIMIT env)
    features: [
      '70 total replies during trial',
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
    repliesLimit: 2000, // Keep for analytics
    creditsLimit: 4000, // NEW - actual limit
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
    repliesLimit: 10000, // Keep for analytics
    creditsLimit: 20000, // NEW - actual limit
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
  if (cfg.billingCycle === 'weekly') return `${formatRepliesLimit(cfg.repliesLimit)} every 7 days`;
  if (cfg.billingCycle === 'monthly') return `${formatRepliesLimit(cfg.repliesLimit)} every 30 days`;
  return '70 total replies during trial';
}


