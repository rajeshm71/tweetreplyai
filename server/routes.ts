import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { aiRouter } from "./services/ai-router";
import { getAvailablePrompts } from "./services/prompts";
import { stripeService, PLANS } from "./services/stripe";
import { usageService } from "./services/usage";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Models route - get available AI models
  app.get('/api/models', (req, res) => {
    try {
      const modelsByProvider = aiRouter.getModelsByProvider();
      res.json(modelsByProvider);
    } catch (error) {
      console.error("Error fetching models:", error);
      res.status(500).json({ message: "Failed to fetch models" });
    }
  });

  // Prompts route - get available prompt variations
  app.get('/api/prompts', (req, res) => {
    try {
      const prompts = getAvailablePrompts();
      res.json(prompts);
    } catch (error) {
      console.error("Error fetching prompts:", error);
      res.status(500).json({ message: "Failed to fetch prompts" });
    }
  });

  // Usage and quota routes
  app.get('/api/usage', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const status = await usageService.getUsageStatus(userId);
      
      if (!status) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(status);
    } catch (error) {
      console.error("Error fetching usage:", error);
      res.status(500).json({ message: "Failed to fetch usage" });
    }
  });

  // Reply generation route
  app.post('/api/generate-reply', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body
      const schema = z.object({
        tweet_text: z.string().min(1).max(2000),
        tweet_id: z.string().optional(),
        model_key: z.string().optional(),
        prompt_variation: z.string().optional(),
      });

      const { tweet_text, tweet_id, model_key, prompt_variation } = schema.parse(req.body);

      // Check if user can use a reply
      const { canUse, reason } = await usageService.canUseReply(userId);
      if (!canUse) {
        const status = await usageService.getUsageStatus(userId);
        return res.status(402).json({
          error: reason,
          message: reason === 'payment_required' ? 'No active plan' : 'Quota exceeded',
          used: status?.used || 0,
          limit: status?.limit || 0,
          resetAt: status?.resetAt || new Date(),
        });
      }

      // Consume a reply from quota
      const updatedCounter = await usageService.consumeReply(userId);

      // Generate the reply
      const replyResponse = await aiRouter.generateReply({
        tweetText: tweet_text,
        tweetId: tweet_id,
        modelPreference: model_key,
        promptVariation: prompt_variation,
      });

      // Log the reply event
      await storage.createReplyEvent({
        userId,
        tweetId: tweet_id,
        modelKey: replyResponse.modelKey,
        tokensIn: replyResponse.tokensIn,
        tokensOut: replyResponse.tokensOut,
        latencyMs: replyResponse.latencyMs,
      });

      // Return response with updated usage
      res.json({
        reply: replyResponse.reply,
        used: updatedCounter.repliesUsed,
        limit: updatedCounter.limit,
        resetAt: updatedCounter.resetAt,
        meta: {
          modelKey: replyResponse.modelKey,
          latencyMs: replyResponse.latencyMs,
        },
      });

    } catch (error) {
      console.error("Error generating reply:", error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage === 'User not found') {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (errorMessage === 'No active usage window' || errorMessage === 'Quota exceeded') {
        const status = await usageService.getUsageStatus(req.user.claims.sub);
        return res.status(402).json({
          error: 'quota_exceeded',
          message: errorMessage,
          used: status?.used || 0,
          limit: status?.limit || 0,
          resetAt: status?.resetAt || new Date(),
        });
      }

      res.status(500).json({ message: "Failed to generate reply" });
    }
  });

  // Plans route
  app.get('/api/plans', (req, res) => {
    const plans = Object.values(PLANS).map(plan => ({
      code: plan.code,
      name: plan.name,
      price: plan.price,
      replies: plan.replies,
      interval: plan.interval,
    }));
    
    res.json({ plans });
  });

  // Checkout route
  app.post('/api/checkout', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.email) {
        return res.status(400).json({ message: "User email required" });
      }

      const schema = z.object({
        plan_code: z.enum(['weekly', 'monthly']),
      });

      const { plan_code } = schema.parse(req.body);

      const domains = process.env.REPLIT_DOMAINS?.split(',') || ['localhost:5000'];
      const domain = domains[0];
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      
      const successUrl = `${protocol}://${domain}/app?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${protocol}://${domain}/pricing`;

      const session = await stripeService.createCheckoutSession(
        plan_code,
        userId,
        user.email,
        successUrl,
        cancelUrl
      );

      res.json({ checkout_url: session.url });

    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // Customer portal route
  app.post('/api/billing/portal', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.stripeCustomerId) {
        return res.status(400).json({ message: "No billing account found" });
      }

      const domains = process.env.REPLIT_DOMAINS?.split(',') || ['localhost:5000'];
      const domain = domains[0];
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const returnUrl = `${protocol}://${domain}/app`;

      const session = await stripeService.createCustomerPortalSession(
        user.stripeCustomerId,
        returnUrl
      );

      res.json({ portal_url: session.url });

    } catch (error) {
      console.error("Error creating portal session:", error);
      res.status(500).json({ message: "Failed to create portal session" });
    }
  });

  // Stripe webhook
  app.post('/api/stripe/webhook', async (req, res) => {
    const signature = req.headers['stripe-signature'] as string;
    
    try {
      const event = await stripeService.constructWebhookEvent(
        req.body,
        signature
      );

      console.log(`Received Stripe webhook: ${event.type}`);

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as any;
          const { userId, planCode } = session.metadata;
          
          if (!userId || !planCode) {
            console.error('Missing metadata in checkout session');
            break;
          }

          const user = await storage.getUser(userId);
          if (!user) {
            console.error(`User not found: ${userId}`);
            break;
          }

          // Update user with Stripe customer ID if not already set
          if (!user.stripeCustomerId && session.customer) {
            await storage.upsertUser({
              ...user,
              stripeCustomerId: session.customer,
            });
          }

          break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object as any;
          
          // Find user by stripe customer ID
          const users = await storage.getUser(subscription.customer);
          // Note: This is a simplified approach. In production, you'd want a proper lookup
          
          const priceId = subscription.items.data[0]?.price?.id;
          const planCode = stripeService.planCodeFromPriceId(priceId);
          
          if (!planCode) {
            console.error(`Unknown price ID: ${priceId}`);
            break;
          }

          const plan = PLANS[planCode];
          const periodStart = new Date(subscription.current_period_start * 1000);
          const periodEnd = new Date(subscription.current_period_end * 1000);

          // Create or update subscription record
          const existingSubscription = await storage.getSubscriptionByStripeId(subscription.id);
          
          if (existingSubscription) {
            await storage.updateSubscription(existingSubscription.id, {
              status: subscription.status,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              amountPaid: subscription.items.data[0]?.price?.unit_amount,
              currency: subscription.items.data[0]?.price?.currency,
            });
          } else {
            // Find user by customer ID (simplified - in production use proper lookup)
            const user = await storage.getUser(subscription.customer);
            if (user) {
              await storage.createSubscription({
                userId: user.id,
                planCode,
                status: subscription.status,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                stripeSubscriptionId: subscription.id,
                amountPaid: subscription.items.data[0]?.price?.unit_amount,
                currency: subscription.items.data[0]?.price?.currency,
              });

              // Create usage counter for new period
              await storage.createUsageCounter({
                userId: user.id,
                planCode,
                periodStart,
                periodEnd,
                repliesUsed: 0,
                limit: plan.replies,
                resetAt: periodEnd,
              });
            }
          }

          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as any;
          
          const existingSubscription = await storage.getSubscriptionByStripeId(subscription.id);
          if (existingSubscription) {
            await storage.updateSubscription(existingSubscription.id, {
              status: 'canceled',
              cancelAt: new Date(),
              cancelReason: 'customer_cancelled',
            });
          }

          break;
        }
      }

      res.json({ received: true });

    } catch (error) {
      console.error('Stripe webhook error:', error);
      res.status(400).json({ message: 'Webhook error' });
    }
  });

  // Feedback route
  app.post('/api/feedback', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const schema = z.object({
        reply_event_id: z.number().optional(),
        rating: z.enum(['up', 'down']),
        comment: z.string().optional(),
      });

      const { reply_event_id, rating, comment } = schema.parse(req.body);

      await storage.createFeedback({
        userId,
        replyEventId: reply_event_id,
        rating,
        comment,
      });

      res.json({ success: true });

    } catch (error) {
      console.error("Error creating feedback:", error);
      res.status(500).json({ message: "Failed to create feedback" });
    }
  });

  // Initialize trial for new users
  app.post('/api/auth/initialize-trial', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await usageService.initializeTrialForUser(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error initializing trial:", error);
      res.status(500).json({ message: "Failed to initialize trial" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
