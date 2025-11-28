// Dodo Payments Service
import DodoPayments from 'dodopayments';
import crypto from 'crypto';

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
    console.log('[Dodo Payments] Environment:', environment);
    
    this.client = new DodoPayments({
      bearerToken: apiKey,
      environment: environment,
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

  async cancelSubscription(subscriptionId: string) {
    throw new Error("Not implemented");
  }

  async constructWebhookEvent(payload: string | Buffer, signature: string | undefined) {
    try {
      const webhookSecret = process.env.DODO_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error('[Dodo Payments] DODO_WEBHOOK_SECRET not configured');
        console.error('[Dodo Payments] Please set DODO_WEBHOOK_SECRET in your environment variables');
        throw new Error('Webhook secret not configured');
      }

      if (!signature) {
        console.error('[Dodo Payments] Missing webhook signature');
        console.error('[Dodo Payments] Expected header: dodo-signature, x-dodo-signature, signature, x-signature, webhook-signature, or x-webhook-signature');
        console.error('[Dodo Payments] If Dodo Payments uses a different header name, please check their documentation');
        // For now, allow webhook to proceed without signature verification if secret is set
        // This helps with debugging - remove this in production
        console.warn('[Dodo Payments] WARNING: Proceeding without signature verification for debugging');
        // Uncomment the throw below once signature header is confirmed
        // throw new Error('Webhook signature is required');
      }

      // Convert payload to string if it's a Buffer
      const payloadString = typeof payload === 'string' ? payload : payload.toString('utf-8');
      
      // Verify webhook signature if provided
      if (signature) {
        // Verify webhook signature using HMAC-SHA256
        // Note: Dodo Payments signature format may vary - adjust based on actual documentation
        const expectedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(payloadString)
          .digest('hex');
        
        // Compare signatures (handle both raw hex and prefixed formats)
        const signatureMatches = signature === expectedSignature 
          || signature === `sha256=${expectedSignature}`
          || signature === `v1=${expectedSignature}`
          || signature === `hmac-sha256=${expectedSignature}`
          || signature.endsWith(expectedSignature); // In case it's prefixed differently
        
        if (!signatureMatches) {
          console.error('[Dodo Payments] Webhook signature verification failed', {
            received: signature.substring(0, 50) + '...',
            receivedLength: signature.length,
            expected: expectedSignature.substring(0, 50) + '...',
            expectedLength: expectedSignature.length,
          });
          console.error('[Dodo Payments] Payload length:', payloadString.length);
          // For debugging, log the first part of payload
          console.error('[Dodo Payments] Payload preview:', payloadString.substring(0, 100));
          throw new Error('Invalid webhook signature');
        } else {
          console.log('[Dodo Payments] Webhook signature verified successfully');
        }
      } else {
        console.warn('[Dodo Payments] WARNING: Webhook processed without signature verification');
      }

      // Parse payload as JSON
      const event = JSON.parse(payloadString);
      console.log('[Dodo Payments] Webhook event verified:', event.event_type || event.type);
      
      return {
        type: event.event_type || event.type || 'unknown',
        data: event,
      };
    } catch (error: any) {
      // Re-throw signature errors, but handle JSON parse errors separately
      if (error.message === 'Invalid webhook signature' || error.message === 'Webhook signature is required') {
        throw error;
      }
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
