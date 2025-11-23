import Stripe from "stripe";

// TODO: Set up payment provider (Stripe, Razorpay, PayPal, or DodoPay)
// Currently disabled until payment provider is configured
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-08-27.basil",
}) : null;

export interface PlanConfig {
  code: string;
  name: string;
  price: number; // in cents
  replies: number; // Keep for analytics/reference
  credits: number; // NEW - for limit enforcement
  interval: 'week' | 'month';
  stripePriceId: string;
}

export const PLANS: Record<string, PlanConfig> = {
  weekly: {
    code: 'weekly',
    name: 'Weekly Plan',
    price: 299, // $2.99
    replies: 700, // Keep for reference/analytics
    credits: 4000, // NEW - actual limit
    interval: 'week',
    stripePriceId: process.env.STRIPE_PRICE_WEEKLY || 'price_weekly_placeholder',
  },
  monthly: {
    code: 'monthly',
    name: 'Monthly Plan',
    price: 999, // $9.99
    replies: 3000, // Keep for reference/analytics
    credits: 20000, // NEW - actual limit
    interval: 'month',
    stripePriceId: process.env.STRIPE_PRICE_MONTHLY || 'price_monthly_placeholder',
  },
};

export class StripeService {
  async createCheckoutSession(
    planCode: string,
    userId: string,
    customerEmail: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<Stripe.Checkout.Session> {
    // TODO: Replace with chosen payment provider integration
    throw new Error("Payment processing not yet configured. Please set up Stripe, Razorpay, PayPal, or DodoPay first.");
    
    if (!stripe) {
      throw new Error("Payment provider not configured");
    }
    
    const plan = PLANS[planCode];
    if (!plan) {
      throw new Error(`Invalid plan code: ${planCode}`);
    }

    const session = await stripe!.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      customer_email: customerEmail,
      metadata: {
        userId,
        planCode,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
    });

    return session;
  }

  async createCustomerPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<Stripe.BillingPortal.Session> {
    // TODO: Replace with chosen payment provider portal
    throw new Error("Payment processing not yet configured. Please set up Stripe, Razorpay, PayPal, or DodoPay first.");
    
    if (!stripe) {
      throw new Error("Payment provider not configured");
    }
    
    const session = await stripe!.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return session;
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    // TODO: Replace with chosen payment provider subscription retrieval
    throw new Error("Payment processing not yet configured");
    
    if (!stripe) {
      throw new Error("Payment provider not configured");
    }
    
    return await stripe!.subscriptions.retrieve(subscriptionId);
  }

  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    // TODO: Replace with chosen payment provider subscription cancellation
    throw new Error("Payment processing not yet configured");
    
    if (!stripe) {
      throw new Error("Payment provider not configured");
    }
    
    return await stripe!.subscriptions.cancel(subscriptionId);
  }

  async constructWebhookEvent(
    payload: string | Buffer,
    signature: string
  ): Promise<Stripe.Event> {
    // TODO: Replace with chosen payment provider webhook handling
    throw new Error("Payment processing not yet configured");
    
    if (!stripe) {
      throw new Error("Payment provider not configured");
    }
    
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET environment variable is required");
    }

    return stripe!.webhooks.constructEvent(payload, signature, webhookSecret!);
  }

  planCodeFromPriceId(priceId: string): string | null {
    for (const [code, plan] of Object.entries(PLANS)) {
      if (plan.stripePriceId === priceId) {
        return code;
      }
    }
    return null;
  }
}

export const stripeService = new StripeService();
