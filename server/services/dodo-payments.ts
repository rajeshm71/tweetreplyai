// Dodo Payments Service
import DodoPayments from 'dodopayments';

export interface PlanConfig {
  code: string;
  name: string;
  price: number;
  replies: number;
  credits: number;
  interval: 'week' | 'month';
  dodoPriceId: string;
}

export const PLANS: Record<string, PlanConfig> = {
  weekly: {
    code: 'weekly',
    name: 'Weekly Plan',
    price: 299,
    replies: 700,
    credits: 4000,
    interval: 'week',
    dodoPriceId: process.env.DODO_PRICE_WEEKLY || 'dodo_price_weekly_placeholder',
  },
  monthly: {
    code: 'monthly',
    name: 'Monthly Plan',
    price: 999,
    replies: 3000,
    credits: 20000,
    interval: 'month',
    dodoPriceId: process.env.DODO_PRICE_MONTHLY || 'dodo_price_monthly_placeholder',
  },
};

export class DodoPaymentsService {
  private client: DodoPayments;

  constructor() {
    const apiKey = process.env.DODO_PAYMENTS_API_KEY;
    if (!apiKey) {
      console.error('[Dodo Payments] ERROR: DODO_PAYMENTS_API_KEY environment variable is not set!');
      throw new Error('DODO_PAYMENTS_API_KEY is required');
    }
    
    const environment = process.env.DODO_PAYMENTS_ENVIRONMENT as 'live_mode' | 'test_mode' | undefined;
    const webhookKey = process.env.DODO_WEBHOOK_SECRET;
    
    console.log('[Dodo Payments] Environment:', environment);
    console.log('[Dodo Payments] Webhook key configured:', !!webhookKey);
    
    this.client = new DodoPayments({
      bearerToken: apiKey,
      environment: environment,
      webhookKey: webhookKey,
    });
  }

  async createCheckoutSession(
    planCode: string,
    userId: string,
    customerEmail: string,
    successUrl: string,
    cancelUrl: string
  ) {
    const plan = PLANS[planCode];
    
    if (!plan) {
      throw new Error(`Invalid plan code: ${planCode}`);
    }

    if (!process.env.DODO_PAYMENTS_API_KEY) {
      throw new Error('DODO_PAYMENTS_API_KEY environment variable is required');
    }

    console.log('[Dodo Payments] Creating checkout session:', {
      planCode,
      productId: plan.dodoPriceId,
      customerEmail: customerEmail.substring(0, 3) + '***',
    });

    try {
      const session = await this.client.checkoutSessions.create({
        product_cart: [
          { product_id: plan.dodoPriceId, quantity: 1 }
        ],
        customer: {
          email: customerEmail,
        },
        return_url: successUrl,
      });

      console.log('[Dodo Payments] Checkout session created successfully');
      console.log('[Dodo Payments] Checkout session:', session);
      console.log('[Dodo Payments] Checkout session URL:', session.checkout_url);

      return {
        id: (session as any).id || '',
        url: session.checkout_url,
        customerId: (session as any).customer_id,
      };
    } catch (error: any) {
      console.error('[Dodo Payments] API Error:', {
        status: error.status,
        message: error.message,
        apiKeySet: !!process.env.DODO_PAYMENTS_API_KEY,
        apiKeyLength: process.env.DODO_PAYMENTS_API_KEY?.length || 0,
        environment: process.env.DODO_PAYMENTS_ENVIRONMENT,
      });
      throw error;
    }
  }

  async getCheckoutSession(sessionId: string) {
    try {
      console.log('[Dodo Payments] Retrieving checkout session:', sessionId);
      const session = await this.client.checkoutSessions.retrieve(sessionId);
      console.log('[Dodo Payments] Checkout session retrieved:', session);
      return session;
    } catch (error: any) {
      console.error('[Dodo Payments] Error retrieving checkout session:', {
        status: error.status,
        message: error.message,
      });
      throw error;
    }
  }

  async createCustomerPortalSession(customerId: string, returnUrl: string) {
    throw new Error("Not implemented");
  }

  async getSubscription(subscriptionId: string) {
    try {
      console.log('[Dodo Payments] Retrieving subscription:', subscriptionId);
      const subscription = await this.client.subscriptions.retrieve(subscriptionId);
      console.log('[Dodo Payments] Subscription retrieved:', subscription);
      return subscription;
    } catch (error: any) {
      console.error('[Dodo Payments] Error retrieving subscription:', {
        status: error.status,
        message: error.message,
      });
      throw error;
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      // Use type assertion since SDK types may not include cancel method
      await (this.client.subscriptions as any).cancel(subscriptionId);
      console.log(`[Dodo Payments] Subscription canceled: ${subscriptionId}`);
    } catch (error: any) {
      console.error('[Dodo Payments] Cancel subscription error:', {
        subscriptionId,
        status: error.status,
        message: error.message,
      });
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }

  async constructWebhookEvent(
    payload: string | Buffer,
    webhookHeaders: {
      'webhook-id': string;
      'webhook-signature': string;
      'webhook-timestamp': string;
    }
  ) {
    try {
      if (!this.client) {
        throw new Error('DodoPayments client not initialized');
      }

      // Convert payload to string if it's a Buffer
      const payloadString = typeof payload === 'string' ? payload : payload.toString('utf-8');

      // Use Dodo Payments SDK's built-in webhook unwrap method
      // This handles signature verification automatically
      const unwrapped = this.client.webhooks.unwrap(payloadString, {
        headers: webhookHeaders,
      });

      console.log('[Dodo Payments] Webhook verified successfully');
      
      // The unwrapped event structure varies by event type
      // Extract event type from the unwrapped object
      const eventType = (unwrapped as any).event_type || (unwrapped as any).type || 'unknown';
      console.log('[Dodo Payments] Webhook event type:', eventType);

      return {
        type: eventType,
        data: unwrapped as any,
      };
    } catch (error: any) {
      console.error('[Dodo Payments] Webhook verification error:', error.message);
      throw new Error(`Webhook processing failed: ${error.message}`);
    }
  }

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
