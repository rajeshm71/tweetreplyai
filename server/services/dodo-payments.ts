// Dodo Payments Service
// TODO: Implement actual Dodo Payments integration
// Currently using placeholder values

export interface PlanConfig {
  code: string;
  name: string;
  price: number; // in cents
  replies: number; // Keep for analytics/reference
  credits: number; // For limit enforcement
  interval: 'week' | 'month';
  dodoPriceId: string; // Dodo Payments price/product ID
}

export const PLANS: Record<string, PlanConfig> = {
  weekly: {
    code: 'weekly',
    name: 'Weekly Plan',
    price: 299, // $2.99
    replies: 700, // Keep for reference/analytics
    credits: 4000, // Actual limit
    interval: 'week',
    dodoPriceId: process.env.DODO_PRICE_WEEKLY || 'dodo_price_weekly_placeholder',
  },
  monthly: {
    code: 'monthly',
    name: 'Monthly Plan',
    price: 999, // $9.99
    replies: 3000, // Keep for reference/analytics
    credits: 20000, // Actual limit
    interval: 'month',
    dodoPriceId: process.env.DODO_PRICE_MONTHLY || 'dodo_price_monthly_placeholder',
  },
};

// Placeholder interfaces for Dodo Payments
export interface DodoCheckoutSession {
  id: string;
  url: string;
  customerId?: string;
}

export interface DodoBillingPortalSession {
  url: string;
}

export interface DodoSubscription {
  id: string;
  customerId: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

export interface DodoWebhookEvent {
  type: string;
  data: {
    object: any;
  };
}

export class DodoPaymentsService {
  /**
   * Creates a checkout session for subscription
   * TODO: Implement actual Dodo Payments API integration
   */
  async createCheckoutSession(
    planCode: string,
    userId: string,
    customerEmail: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<DodoCheckoutSession> {
    // TODO: Replace with actual Dodo Payments API call
    throw new Error("Dodo Payments integration not yet configured. Please set up Dodo Payments API first.");
    
    const plan = PLANS[planCode];
    if (!plan) {
      throw new Error(`Invalid plan code: ${planCode}`);
    }

    // Placeholder implementation
    // In production, this would call Dodo Payments API:
    // const session = await dodoPayments.checkout.create({
    //   planId: plan.dodoPriceId,
    //   customerEmail,
    //   metadata: { userId, planCode },
    //   successUrl,
    //   cancelUrl,
    // });

    return {
      id: 'dodo_session_placeholder',
      url: `${successUrl}?session_id=dodo_session_placeholder`,
    };
  }

  /**
   * Creates a billing portal session for customer management
   * TODO: Implement actual Dodo Payments portal integration
   */
  async createCustomerPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<DodoBillingPortalSession> {
    // TODO: Replace with actual Dodo Payments portal API call
    throw new Error("Dodo Payments integration not yet configured. Please set up Dodo Payments API first.");
    
    // Placeholder implementation
    // In production, this would call Dodo Payments API:
    // const session = await dodoPayments.portal.create({
    //   customerId,
    //   returnUrl,
    // });

    return {
      url: returnUrl, // Placeholder
    };
  }

  /**
   * Retrieves subscription details
   * TODO: Implement actual Dodo Payments subscription retrieval
   */
  async getSubscription(subscriptionId: string): Promise<DodoSubscription> {
    // TODO: Replace with actual Dodo Payments API call
    throw new Error("Dodo Payments integration not yet configured");
    
    // Placeholder implementation
    throw new Error("Not implemented");
  }

  /**
   * Cancels a subscription
   * TODO: Implement actual Dodo Payments subscription cancellation
   */
  async cancelSubscription(subscriptionId: string): Promise<DodoSubscription> {
    // TODO: Replace with actual Dodo Payments API call
    throw new Error("Dodo Payments integration not yet configured");
    
    // Placeholder implementation
    throw new Error("Not implemented");
  }

  /**
   * Constructs and validates webhook event
   * TODO: Implement actual Dodo Payments webhook verification
   */
  async constructWebhookEvent(
    payload: string | Buffer,
    signature: string
  ): Promise<DodoWebhookEvent> {
    // TODO: Replace with actual Dodo Payments webhook verification
    throw new Error("Dodo Payments integration not yet configured");
    
    // Placeholder implementation
    // In production, this would verify the webhook signature:
    // return dodoPayments.webhooks.verify(payload, signature, webhookSecret);

    const webhookSecret = process.env.DODO_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("DODO_WEBHOOK_SECRET environment variable is required");
    }

    // Placeholder - would verify signature in production
    return {
      type: 'subscription.updated',
      data: { object: {} },
    };
  }

  /**
   * Maps Dodo Payments price/product ID to plan code
   */
  planCodeFromPriceId(priceId: string): string | null {
    for (const [code, plan] of Object.entries(PLANS)) {
      if (plan.dodoPriceId === priceId) {
        return code;
      }
    }
    return null;
  }
}

export const dodoPaymentsService = new DodoPaymentsService();

