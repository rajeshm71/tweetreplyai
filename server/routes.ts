import type { Express } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import type { UsageCounter } from "../shared/types.js";
import { storage } from "./storage.js";
import { setupLocalAuth } from "./localAuth.js";
import { setupGoogleAuth } from "./googleAuth.js";
import { aiRouter } from "./services/ai-router.js";
import { getAvailablePrompts } from "./services/prompts.js";
import { dodoPaymentsService, PLANS } from "./services/dodo-payments.js";
import { usageService } from "./services/usage.js";
import { whitelistService } from "./services/whitelistService.js";
import { runGuardrail, generateGuardrailFriendlyReply, type GuardrailResult } from "./services/guardrail.js";
import { ANALYTICS, PERIODS, QUALITY, RATE_LIMIT, VALIDATION } from "./config/constants.js";
import { getSessionSecret, getClientErrorBody, isProduction } from "./config/env.js";
// Static import: avoids per-request dynamic import; LinkedIn pipeline remains isolated from Twitter path.
import { generateLinkedInReply } from "./services/linkedin-ai-service.js";
import { z, ZodError } from "zod";
import passport from "passport";
import session from "express-session";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { hashPassword, verifyPassword, validatePasswordStrength } from "./utils/password.js";
// FIX: sendWelcomeEmail removed (unused after switching to emailService.sendWelcome in registration block below)
import { sendPasswordResetEmail } from "./utils/email.js";
import * as emailService from "./services/emailService.js";
import {
  getIdempotencyKeyFromResendWebhookData,
  getRecipientEmailFromResendWebhookData,
} from "./utils/resendWebhook.js";
// Use crypto.randomUUID() instead of uuid package
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

// Shared helpers to keep validation responses consistent across routes.
const toValidationErrorResponse = (error: ZodError) => ({
  message: "Validation error",
  errors: error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
  })),
});

const handleZodError = (res: any, error: unknown) => {
  if (error instanceof ZodError) {
    return res.status(400).json(toValidationErrorResponse(error));
  }
  return null;
};

// JWT-based authentication for serverless environments
const jwtIsAuthenticated = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;
  
  if (!token) {
    // Fallback to session-based auth
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    return next();
  }

  try {
    const decoded = jwt.verify(token, getSessionSecret());
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};


const localGetUserId = (req: any): string => {
  const user = req.user;
  if (!user) {
    throw new Error("User not authenticated");
  }
  return user.id;
};

// Use JWT-based auth for serverless environments
const isAuthenticated = jwtIsAuthenticated;
const getUserId = localGetUserId;

// Export alias for tests
export const setupRoutes = registerRoutes;

export async function registerRoutes(app: Express): Promise<Express> {
  // Auth middleware - using local auth only
  // Use persistent session store for production, memory store for development
  
  getSessionSecret(); // Fail fast in production if SESSION_SECRET is missing
  let sessionConfig: any = {
      secret: getSessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
      },
  };

  // Use memory store for sessions since we're using JWT for serverless
  console.log('Using memory store for sessions (JWT-based auth for serverless)');

  app.use(session(sessionConfig));
    
    app.use(passport.initialize());
    app.use(passport.session());
    
    // Setup passport serialization for local development
    passport.serializeUser((user: any, cb) => {
      console.log('Serializing user:', user.id);
      cb(null, { id: user.id, type: 'local' });
    });
    
    passport.deserializeUser(async (sessionUser: any, cb) => {
      try {
        console.log('Deserializing user:', sessionUser.id);
        const user = await storage.getUser(sessionUser.id);
        cb(null, user);
      } catch (error) {
        console.error('Deserialization error:', error);
        cb(error, null);
      }
    });
  
  setupLocalAuth();
  setupGoogleAuth();

  // Auth rate limiter: 15 min window, max 10 requests per IP (login, register, forgot-password)
  const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: 'Too many attempts. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    // Integration tests (vitest.integration.config.ts) set SKIP_AUTH_RATE_LIMIT=1 to avoid flaky 429s
    skip: () => process.env.SKIP_AUTH_RATE_LIMIT === '1',
  });

  // Global API rate limit (all /api/* except webhook)
  const globalApiLimiter = rateLimit({
    windowMs: RATE_LIMIT.GLOBAL_API_WINDOW_MS,
    max: RATE_LIMIT.GLOBAL_API_MAX,
    message: { message: 'Too many requests. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    // Dodo webhook must not be rate-limited (signature-verified provider callbacks)
    skip: (req) =>
      req.path === '/api/dodo/webhook' || (req.originalUrl?.startsWith?.('/api/dodo/webhook') ?? false),
  });
  app.use('/api', globalApiLimiter);

  // Generate-reply rate limit: per user (after auth), same used for suggest-improvements
  const generateReplyLimiter = rateLimit({
    windowMs: RATE_LIMIT.GENERATE_REPLY_WINDOW_MS,
    max: RATE_LIMIT.GENERATE_REPLY_MAX,
    message: { message: 'Too many requests. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as any).user?.id ?? req.ip ?? 'anonymous',
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Return consistent user data for frontend
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        authProviders: user.authProviders || [],
        isWhitelisted: whitelistService.isWhitelisted(user.email),
        xUsername: user.xUsername ?? null,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // X username (complete profile) - require auth
  app.post('/api/user/x-username', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({ xUsername: z.string().min(1).max(100) });
      const { xUsername: raw } = schema.parse(req.body);
      const normalized = raw.trim().replace(/^@+/, '');
      if (!normalized) {
        return res.status(400).json({ message: 'X username is required' });
      }
      await storage.updateUser(userId, { xUsername: normalized });
      return res.status(200).json({ success: true, xUsername: normalized });
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json(toValidationErrorResponse(err));
      }
      console.error('Error updating X username:', err);
      return res.status(500).json({ message: 'Failed to update X username' });
    }
  });

  // Local authentication routes
  app.post('/api/auth/register', authRateLimiter, (req, res, next) => {
    try {
      const schema = z.object({
        email: z.string().min(1, 'Email is required.').email('Invalid email format.'),
        password: z.string().min(1, 'Password is required.'),
      });

      schema.parse(req.body);
    } catch (error) {
      const handled = handleZodError(res, error);
      if (handled) return handled;
      throw error;
    }

    passport.authenticate('local-register', (err: any, user: any, info: any) => {
      if (err) {
        console.error('Registration error:', err);
        return res.status(500).json(getClientErrorBody(err, 'Registration failed'));
      }
      if (!user) {
        return res.status(400).json({ message: info?.message || 'Registration failed' });
      }
      req.logIn(user, (err) => {
        if (err) {
          return res.status(500).json({ message: 'Login after registration failed' });
        }
        // Fire-and-forget welcome email + Resend contact sync
        emailService.sendWelcome(user.id).catch((error) => {
          console.error('[welcome-email] failed for userId:', user.id, 'error:', error);
        });
        emailService.syncContactToResend({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        }).catch(() => {});
        // Generate JWT token for serverless environments
        const token = jwt.sign(
          { id: user.id, email: user.email },
          getSessionSecret(),
          { expiresIn: '7d' }
        );
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict' });
        return res.json({ user, token, message: 'Registration successful' });
      });
    })(req, res, next);
  });

  app.post('/api/auth/login', authRateLimiter, (req, res, next) => {
    try {
      const schema = z.object({
        email: z.string().min(1, 'Email is required.').email('Invalid email format.'),
        password: z.string().min(1, 'Password is required.'),
      });

      schema.parse(req.body);
    } catch (error) {
      const handled = handleZodError(res, error);
      if (handled) return handled;
      throw error;
    }

    passport.authenticate('local-login', (err: any, user: any, info: any) => {
      if (err) {
        console.error('Login error:', err);
        return res.status(500).json(getClientErrorBody(err, 'Login failed'));
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || 'Invalid credentials' });
      }
      req.logIn(user, (err) => {
        if (err) {
          return res.status(500).json({ message: 'Login failed' });
        }
        // Generate JWT token for serverless environments
        const token = jwt.sign(
          { id: user.id, email: user.email },
          getSessionSecret(),
          { expiresIn: '7d' }
        );
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict' });
        return res.json({ user, token, message: 'Login successful' });
      });
    })(req, res, next);
  });

  // Google OAuth routes - returnUrl passed as query, forwarded as state so callback can redirect (review: Step 2a)
  const ALLOWED_RETURN_PATHS = ['/', '/app', '/app/pricing', '/profile', '/settings'];

  function validateReturnUrl(raw: string | undefined): string {
    if (!raw || typeof raw !== 'string') return '/';
    try {
      const pathWithQuery = raw.startsWith('http') ? new URL(raw).pathname + new URL(raw).search : (raw.startsWith('/') ? raw : new URL(raw, 'http://localhost').pathname + new URL(raw, 'http://localhost').search);
      const pathOnly = pathWithQuery.split('?')[0];
      if (!ALLOWED_RETURN_PATHS.includes(pathOnly)) return '/';
      return pathWithQuery;
    } catch {
      return '/';
    }
  }

  app.get('/api/auth/google', (req, res, next) => {
    console.log('Request URL:', req.url);
    // Avoid logging raw headers (can contain cookies/authorization tokens).
    console.log('[Google OAuth] callbackConfigured:', !!process.env.GOOGLE_CALLBACK_URL);
    const returnUrl = validateReturnUrl(req.query?.returnUrl as string | undefined);
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      state: returnUrl,
    })(req, res, next);
  });

  app.get('/api/auth/google/callback',
    (req, res, next) => {
      console.log('Callback URL received:', req.url);
      passport.authenticate('google', {
        failureRedirect: '/login',
        failureMessage: true,
      })(req, res, next);
    },
    (req, res) => {
      // Avoid logging the full user object (can contain profile/PII). Log only an identifier.
      console.log('[Google OAuth] success, userId:', (req.user as any)?.id);
      const user = req.user as any;
      const token = jwt.sign(
        { id: user.id, email: user.email },
        getSessionSecret(),
        { expiresIn: '7d' }
      );
      res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict' });
      // Review fix: redirect to returnUrl from state (validated) instead of always '/'
      const stateReturnUrl = validateReturnUrl(req.query?.state as string | undefined);
      res.redirect(stateReturnUrl || '/');
    }
  );

  // Logout route for local development
  app.post('/api/auth/logout', (req, res) => {
    console.log('Logout requested');
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ message: 'Logout failed' });
      }
      // Destroy session so the same Cookie header cannot keep /api/auth/user authenticated
      const finish = () => {
        // Must match options used in login/register `res.cookie('token', ...)` or the cookie may persist
        res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
        res.clearCookie('connect.sid', { path: '/' }); // default express-session name
        console.log('Logout successful');
        res.json({ success: true });
      };
      if (req.session) {
        req.session.destroy((destroyErr) => {
          if (destroyErr) {
            console.error('Session destroy error:', destroyErr);
          }
          finish();
        });
      } else {
        finish();
      }
    });
  });

  // Forgot password: send reset email if user exists and uses password auth
  app.post('/api/auth/forgot-password', authRateLimiter, async (req: any, res) => {
    try {
      const schema = z.object({
        email: z.string().min(1, 'Email is required.').email('Invalid email format.'),
      });

      const { email: rawEmail } = schema.parse(req.body);
      const email = rawEmail.trim();

      console.log('[forgot-password] request email:', email || '(empty)');
      const user = await storage.getUserByEmail(email);
      if (!user) {
        console.log('[forgot-password] no user found for email:', email);
        return res.status(404).json({ message: 'No account found with that email.' });
      }
      if (!user.password) {
        console.log('[forgot-password] user has no password (e.g. Google-only), userId:', user.id);
        return res.status(400).json({ message: 'This account does not use password login. Use Continue with Google instead.' });
      }
      const usesPasswordLogin = !!user.password && (
        !user.authProviders ||
        user.authProviders.includes('password') ||
        user.authProviders.includes('local')
      );
      if (!usesPasswordLogin) {
        console.log('[forgot-password] user does not use password login, authProviders:', user.authProviders);
        return res.status(400).json({ message: 'This account does not use password login. Use Continue with Google instead.' });
      }
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await storage.setUserResetToken(user.id, token, expiresAt);
      console.log('[forgot-password] token set for userId:', user.id, ', sending reset email to:', user.email);
      await sendPasswordResetEmail(user.email, token);
      console.log('[forgot-password] reset email sent successfully to:', user.email);
      return res.status(200).json({ message: 'Password reset email sent.' });
    } catch (err) {
      console.error('[forgot-password] error:', err);
      if (err instanceof ZodError) {
        return res.status(400).json(toValidationErrorResponse(err));
      }
      return res.status(500).json({ message: 'Failed to start password reset. Try again later.' });
    }
  });

  // Reset password: validate token, set new password, clear token
  app.post('/api/auth/reset-password', authRateLimiter, async (req: any, res) => {
    try {
      const schema = z.object({
        token: z.string().min(1, 'Token is required.'),
        newPassword: z.string().min(1, 'New password is required.'),
      });

      const { token: rawToken, newPassword } = schema.parse(req.body);
      const token = rawToken.trim();

      const user = await storage.getUserByResetToken(token);
      if (!user) {
        return res.status(400).json({ message: 'Invalid or expired reset link. Request a new one.' });
      }
      const strength = validatePasswordStrength(newPassword);
      if (!strength.isValid) {
        return res.status(400).json({ message: strength.errors[0] || 'Invalid password.' });
      }
      const hashed = await hashPassword(newPassword);
      await storage.updateUser(user.id, { password: hashed });
      await storage.clearUserResetToken(user.id);
      return res.status(200).json({ message: 'Password reset successfully. You can sign in now.' });
    } catch (err) {
      console.error('Reset password error:', err);
      if (err instanceof ZodError) {
        return res.status(400).json(toValidationErrorResponse(err));
      }
      return res.status(500).json({ message: 'Failed to reset password.' });
    }
  });

  // Change password (authenticated): verify current, set new
  app.post('/api/auth/change-password', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({
        currentPassword: z.string().min(1, 'Current password is required.'),
        newPassword: z.string().min(1, 'New password is required.'),
      });

      const { currentPassword, newPassword } = schema.parse(req.body);

      const user = await storage.getUser(userId);
      if (!user?.password) {
        return res.status(400).json({ message: 'Account does not use password login.' });
      }
      const valid = await verifyPassword(currentPassword, user.password);
      if (!valid) {
        return res.status(400).json({ message: 'Current password is incorrect.' });
      }
      const strength = validatePasswordStrength(newPassword);
      if (!strength.isValid) {
        return res.status(400).json({ message: strength.errors[0] || 'Invalid new password.' });
      }
      const hashed = await hashPassword(newPassword);
      await storage.updateUser(userId, { password: hashed });
      return res.status(200).json({ message: 'Password changed successfully.' });
    } catch (err) {
      console.error('Change password error:', err);
      return res.status(500).json({ message: 'Failed to change password.' });
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

  // Extension authentication endpoint (no auth required - extension calls from web app page)
  app.get('/api/extension/auth', async (req: any, res) => {
    try {
      // Check if user is authenticated via session or JWT
      let user = null;
      
      // Try to get user from session (Passport)
      if (req.user) {
        user = await storage.getUser(req.user.id);
      } else {
        // Try to get user from JWT token in cookie
        const token = req.cookies?.token;
        if (token) {
          try {
            const decoded = jwt.verify(token, getSessionSecret()) as any;
            user = await storage.getUser(decoded.id);
          } catch (error) {
            // Token invalid or expired
          }
        }
      }
      
      if (!user) {
        return res.status(401).json({ 
          authenticated: false,
          message: "Not authenticated" 
        });
      }
      
      // Generate a fresh JWT token for extension use
      const extensionToken = jwt.sign(
        { id: user.id, email: user.email },
        getSessionSecret(),
        { expiresIn: '7d' }
      );
      
      res.json({ 
        authenticated: true,
        token: extensionToken,
        user: {
          id: user.id,
          email: user.email,
          authProviders: user.authProviders || [],
        }
      });
    } catch (error) {
      console.error("Error getting extension auth:", error);
      res.status(500).json({ message: "Failed to get auth status" });
    }
  });

  // Subscription status route
  app.get('/api/subscription/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const subscription = await storage.getActiveSubscription(userId);
      
      if (!subscription) {
        return res.json({ 
          hasSubscription: false,
          planCode: null,
          status: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
        });
      }
      
      if (subscription.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const plan = PLANS[subscription.planCode];
      return res.json({
        hasSubscription: true,
        planCode: (subscription.planCode || '').toLowerCase(),
        planName: plan?.name || subscription.planCode,
        status: (subscription.status || '').toLowerCase(),
        currentPeriodStart: subscription.currentPeriodStart.toISOString(),
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        dodoSubscriptionId: subscription.dodoSubscriptionId,
      });
    } catch (error) {
      console.error('[Subscription Status] Error:', error);
      res.status(500).json({ message: "Failed to fetch subscription status" });
    }
  });

  // Usage and quota routes
  app.get('/api/usage', isAuthenticated, async (req: any, res) => {
    try {
      console.log('[API-DEBUG] ========== GET /api/usage START ==========');
      const userId = getUserId(req);
      console.log('[API-DEBUG] /api/usage - userId:', userId);
      
      const user = await storage.getUser(userId);
      
      if (!user) {
        console.log('[API-DEBUG] /api/usage - User not found');
        return res.status(404).json({ message: "User not found" });
      }

      console.log('[API-DEBUG] /api/usage - user email:', user.email);
      const status = await usageService.getUsageStatus(userId);
      
      if (!status) {
        console.log('[API-DEBUG] /api/usage - Status not found');
        return res.status(404).json({ message: "User not found" });
      }

      console.log('[API-DEBUG] /api/usage - Returning status:', {
        planCode: status.planCode,
        used: status.used,
        limit: status.limit,
        status: status.status
      });
      console.log('[API-DEBUG] ========== GET /api/usage END ==========');

      // Serialize Date objects to ISO strings for JSON response
      const serializedStatus = {
        ...status,
        resetAt: status.resetAt instanceof Date ? status.resetAt.toISOString() : status.resetAt,
      };

      res.json(serializedStatus);
    } catch (error: any) {
      console.error("[API-DEBUG] /api/usage - ERROR:", error);
      console.error("[API-DEBUG] /api/usage - ERROR stack:", error?.stack);
      res.status(500).json(getClientErrorBody(error, "Failed to fetch usage"));
    }
  });

  // User preferences routes
  app.get('/api/user/preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      let preferences = await storage.getUserPreferences(userId);
      
      // Create default preferences if none exist
      if (!preferences) {
        preferences = await storage.upsertUserPreferences({
          id: generateId(),
          userId,
          tone: 'default',
          length: 'default',
          style: 'default',
          topics: [],
          promptStyleEnabled: false, // Default to false
        });
        console.log(`[User Preferences] Created default preferences for user ${userId}`);
      }
      
      res.json(preferences);
    } catch (error) {
      console.error("Error fetching user preferences:", error);
      res.status(500).json({ message: "Failed to fetch user preferences" });
    }
  });

  app.put('/api/user/preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({
        tone: z.string().optional(),
        length: z.string().optional(),
        style: z.string().optional(),
        topics: z.array(z.string()).optional(),
        promptStyleEnabled: z.boolean().optional(),
      });
      
      const updates = schema.parse(req.body);
      const existing = await storage.getUserPreferences(userId);
      
      // Merge existing preferences with updates
      const updated = await storage.upsertUserPreferences({
        id: existing?.id || generateId(),
        userId,
        tone: updates.tone ?? existing?.tone ?? 'default',
        length: updates.length ?? existing?.length ?? 'default',
        style: updates.style ?? existing?.style ?? 'default',
        topics: updates.topics ?? existing?.topics ?? [],
        promptStyleEnabled: updates.promptStyleEnabled ?? existing?.promptStyleEnabled ?? false,
      });
      
      console.log(`[User Preferences] Updated preferences for user ${userId}`, { fields: Object.keys(updates) });
      res.json(updated);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      console.error("Error updating user preferences:", error);
      res.status(500).json({ message: "Failed to update user preferences" });
    }
  });

  // Email preferences routes
  app.get('/api/user/email-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const prefs = await storage.getEmailPreferences(userId);
      if (!prefs) {
        return res.json({ usageAlerts: true, productTips: true, marketing: false });
      }
      res.json(prefs);
    } catch (error) {
      console.error('GET /api/user/email-preferences error:', error);
      res.status(500).json({ message: 'Failed to get email preferences' });
    }
  });

  app.patch('/api/user/email-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({
        usageAlerts: z.boolean().optional(),
        productTips: z.boolean().optional(),
        marketing: z.boolean().optional(),
      });
      const updates = schema.parse(req.body);
      const prefs = await storage.upsertEmailPreferences({ userId, ...updates });
      res.json(prefs);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json(toValidationErrorResponse(error));
      }
      console.error('PATCH /api/user/email-preferences error:', error);
      res.status(500).json({ message: 'Failed to update email preferences' });
    }
  });

  // Reply generation route
  app.post('/api/generate-reply', isAuthenticated, generateReplyLimiter, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      // Validate request body
      const schema = z.object({
        tweet_text: z.string().min(1).max(VALIDATION.MAX_TWEET_LENGTH),
        tweet_id: z.string().optional(),
        model_key: z.string().optional(),
        prompt_variation: z.string().optional(),
        reply_mode: z.enum(['single-sentence', 'enhanced']).optional().default('enhanced'),
        author_info: z.object({
          username: z.string().optional(),
          verified: z.boolean().optional(),
          follower_count: z.number().optional(),
        }).optional(),
        thread_context: z.object({
          isReply: z.boolean(),
          // FIX: Apply max() before nullable() - Zod requires this order
          originalTweet: z.string().max(VALIDATION.MAX_TWEET_LENGTH).nullable(),
          originalTweetAuthor: z.string().max(50).nullable(),
          threadChain: z.array(z.object({
            text: z.string().min(1).max(VALIDATION.MAX_TWEET_LENGTH),
            author: z.string().max(50),
            isOriginal: z.boolean(),
            isCurrent: z.boolean(),
          })).max(VALIDATION.MAX_THREAD_CHAIN),
          currentTweetIndex: z.number().int().min(0),
          threadLength: z.number().int().min(0).max(VALIDATION.MAX_THREAD_INDEX),
        }).optional(),
        conversation_context: z.array(z.string()).optional(), // Backward compatibility
        tweet_metadata: z.object({
          has_media: z.boolean().optional(),
          has_poll: z.boolean().optional(),
          timestamp: z.string().optional(),
        }).optional(),
        platform: z.enum(['twitter', 'linkedin']).optional().default('twitter'),
        viewer_is_original_author: z.boolean().optional(),
      });

      const { 
        tweet_text, 
        tweet_id, 
        model_key, 
        prompt_variation,
        reply_mode,
        platform,
        viewer_is_original_author,
        author_info,
        thread_context,
        conversation_context,
        tweet_metadata
      } = schema.parse(req.body);

      // Normalize thread context (use new format if available, fallback to old)
      let normalizedThreadContext = null;
      if (thread_context) {
        normalizedThreadContext = thread_context;
        console.log('[API] Using new thread_context format:', {
          isReply: thread_context.isReply,
          hasOriginal: !!thread_context.originalTweet,
          threadLength: thread_context.threadLength
        });
        
        // LOG: Display original tweet and full thread chain together
        if (thread_context.isReply && thread_context.originalTweet) {
          console.log('[API] 📋 ORIGINAL TWEET & THREAD CHAIN:');
          console.log('[API] ┌─────────────────────────────────────────────────────────┐');
          console.log('[API] │ ORIGINAL TWEET:', thread_context.originalTweetAuthor ? `@${thread_context.originalTweetAuthor}` : 'unknown author');
          console.log('[API] │', thread_context.originalTweet);
          console.log('[API] ├─────────────────────────────────────────────────────────┤');
          console.log('[API] │ FULL THREAD CHAIN (' + thread_context.threadLength + ' tweets):');
          thread_context.threadChain.forEach((tweet, idx) => {
            const marker = tweet.isOriginal ? '🔵 ORIGINAL' : tweet.isCurrent ? '🟢 CURRENT (replying to)' : `⚪ Reply ${idx}`;
            const author = tweet.author !== 'unknown' ? `@${tweet.author}` : 'unknown';
            console.log('[API] │ [' + marker + '] ' + author + ':');
            console.log('[API] │   "' + tweet.text.substring(0, 100) + (tweet.text.length > 100 ? '...' : '') + '"');
          });
          console.log('[API] └─────────────────────────────────────────────────────────┘');
        }
      } else if (conversation_context && conversation_context.length > 0) {
        // Convert old format to new format for backward compatibility
        normalizedThreadContext = {
          isReply: true,
          originalTweet: conversation_context[0] || null,
          originalTweetAuthor: null,
          threadChain: conversation_context.map((text, idx) => ({
            text,
            author: 'unknown',
            isOriginal: idx === 0,
            isCurrent: idx === conversation_context.length - 1
          })),
          currentTweetIndex: conversation_context.length - 1,
          threadLength: conversation_context.length
        };
        console.log('[API] Converted old conversation_context to thread_context format');
        
        // LOG: Display converted thread context
        if (normalizedThreadContext && normalizedThreadContext.originalTweet) {
          console.log('[API] 📋 CONVERTED THREAD CONTEXT:');
          console.log('[API] ┌─────────────────────────────────────────────────────────┐');
          console.log('[API] │ ORIGINAL TWEET:', normalizedThreadContext.originalTweet);
          console.log('[API] ├─────────────────────────────────────────────────────────┤');
          console.log('[API] │ THREAD CHAIN (' + normalizedThreadContext.threadLength + ' tweets):');
          normalizedThreadContext.threadChain.forEach((tweet, idx) => {
            const marker = tweet.isOriginal ? '🔵 ORIGINAL' : tweet.isCurrent ? '🟢 CURRENT' : `⚪ Reply ${idx}`;
            console.log('[API] │ [' + marker + ']:', tweet.text.substring(0, 100) + (tweet.text.length > 100 ? '...' : ''));
          });
          console.log('[API] └─────────────────────────────────────────────────────────┘');
        }
      }

      // Get user for validation
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check if user can generate reply (applies to ALL users including whitelisted)
      const { canUse, reason } = await usageService.canUseReply(userId);
      if (!canUse) {
        const status = await usageService.getUsageStatus(userId);
        return res.status(402).json({
          error: reason,
          message: reason === 'payment_required' ? 'No active plan' : 'Quota exceeded',
          used: status?.used || 0,
          limit: status?.limit || 0,
          resetAt: status?.resetAt || new Date(),
          upgradeRequired: true,
          upgradeMessage: whitelistService.getUpgradeMessage(false, status?.used || 0, status?.limit || 0),
        });
      }

      // Run guardrail check on all user-facing text that will reach LLMs
      let guardrailResult: GuardrailResult | null = null;
      let guardrailViolation = false;
      try {
        const guardrailParts: string[] = [];
        guardrailParts.push(`Tweet: ${tweet_text}`);
        if (normalizedThreadContext?.originalTweet) {
          guardrailParts.push(`Original tweet: ${normalizedThreadContext.originalTweet}`);
        }
        if (normalizedThreadContext?.threadChain?.length) {
          guardrailParts.push(
            `Thread chain:\n` +
              normalizedThreadContext.threadChain
                .map((t, idx) => `#${idx + 1}: "${t.text}"`)
                .join("\n"),
          );
        }
        const guardrailInput = guardrailParts.join("\n\n");
        guardrailResult = await runGuardrail(guardrailInput);
        console.log("[Guardrail] /api/generate-reply result:", {
          violation: guardrailResult.violation,
          category: guardrailResult.category,
        });
        guardrailViolation = guardrailResult?.violation === 1;
      } catch (error) {
        console.error("[Guardrail] Error running guardrail for /api/generate-reply:", error);
      }

      const guardrailClassificationStage: Array<{ stage: string; modelKey: string; promptTokens: number; completionTokens: number; totalTokens: number; cost: number; latencyMs: number }> =
        guardrailResult?.usage
          ? [
              {
                stage: "guardrail_classification",
                modelKey: guardrailResult.usage.modelKey,
                promptTokens: guardrailResult.usage.promptTokens,
                completionTokens: guardrailResult.usage.completionTokens,
                totalTokens: guardrailResult.usage.promptTokens + guardrailResult.usage.completionTokens,
                cost: aiRouter.estimateCost(guardrailResult.usage.modelKey, guardrailResult.usage.promptTokens, guardrailResult.usage.completionTokens),
                latencyMs: guardrailResult.usage.latencyMs,
              },
            ]
          : [];

      // Consume credits from quota (applies to ALL users including whitelisted)
      console.log('[API-DEBUG] /api/generate-reply - About to call consumeReply for userId:', userId, 'reply_mode:', reply_mode);
      const updatedCounter = await usageService.consumeReply(userId, reply_mode);
      console.log('[API-DEBUG] /api/generate-reply - After consumeReply, updatedCounter:', {
        repliesUsed: updatedCounter.repliesUsed,
        creditsUsed: updatedCounter.creditsUsed,
        limit: updatedCounter.limit
      });
      // Fire usage threshold + conversion emails (idempotent — safe on every reply)
      const creditPct = updatedCounter.limit > 0
        ? Math.floor((updatedCounter.creditsUsed / updatedCounter.limit) * 100)
        : 0;
      if (creditPct >= 100) {
        emailService.sendUsageThreshold(userId, 100, updatedCounter).catch(() => {});
        emailService.sendConversionStage(userId, 1, updatedCounter).catch(() => {});
      } else if (creditPct >= 80) {
        emailService.sendUsageThreshold(userId, 80, updatedCounter).catch(() => {});
      }

      // If guardrail detected a violation, generate a friendly refusal reply and return early
      if (guardrailViolation && guardrailResult) {
        console.log('[Guardrail] Violation detected; routing to friendly guardrail_violation prompt.', {
          category: guardrailResult.category,
        });

        const guardrailReply = await generateGuardrailFriendlyReply(tweet_text, guardrailResult.rationale);

        // Log the reply event
        await storage.createReplyEvent({
          id: crypto.randomUUID(),
          userId,
          modelKey: guardrailReply.modelKey,
          promptKey: 'guardrail_violation',
          latencyMs: guardrailReply.latencyMs,
          tokensUsed: (guardrailReply.tokensIn || 0) + (guardrailReply.tokensOut || 0),
          cost: 0,
        });

        // Save to reply history with safety metadata
        const historyEntry = await storage.createReplyHistory({
          id: crypto.randomUUID(),
          userId,
          originalTweet: tweet_text,
          generatedReply: guardrailReply.reply,
          modelKey: guardrailReply.modelKey,
          promptKey: 'guardrail_violation',
          replyMode: reply_mode,
          performance: {
            safetyOutcome: 'violation_friendly_reply',
            guardrailCategory: guardrailResult.category,
            guardrailRationale: guardrailResult.rationale,
            latencyMs: guardrailReply.latencyMs,
          },
        });

        // Persist reply_tokens: guardrail_classification (when usage present) + guardrail_violation (friendly reply)
        const replyTokensIn = guardrailReply.tokensIn ?? 0;
        const replyTokensOut = guardrailReply.tokensOut ?? 0;
        const replyCost = aiRouter.estimateCost(guardrailReply.modelKey, replyTokensIn, replyTokensOut);
        const stageBreakdown = [
          ...guardrailClassificationStage,
          {
            stage: "guardrail_violation",
            modelKey: guardrailReply.modelKey,
            promptTokens: replyTokensIn,
            completionTokens: replyTokensOut,
            totalTokens: replyTokensIn + replyTokensOut,
            cost: replyCost,
            latencyMs: guardrailReply.latencyMs,
          },
        ];

        const totalPromptTokens = stageBreakdown.reduce((s, e) => s + e.promptTokens, 0);
        const totalCompletionTokens = stageBreakdown.reduce((s, e) => s + e.completionTokens, 0);
        const totalTokens = stageBreakdown.reduce((s, e) => s + e.totalTokens, 0);
        const totalCost = stageBreakdown.reduce((s, e) => s + e.cost, 0);

        await storage.createReplyTokens({
          id: crypto.randomUUID(),
          userId,
          replyHistoryId: historyEntry.id,
          stageBreakdown,
          totalPromptTokens,
          totalCompletionTokens,
          totalTokens,
          totalCost,
        });

        return res.json({
          reply: guardrailReply.reply,
          qualityScore: null,
          used: updatedCounter.creditsUsed ?? (updatedCounter.repliesUsed * 2),
          limit: updatedCounter.limit,
          resetAt: updatedCounter.resetAt,
          analysis: null,
          meta: {
            modelKey: guardrailReply.modelKey,
            latencyMs: guardrailReply.latencyMs,
            qualityBreakdown: [],
            safetyOutcome: 'violation_friendly_reply',
            guardrailCategory: guardrailResult.category,
          },
        });
      }

      // --- LinkedIn independent pipeline (bypasses all Twitter-specific analysis) ---
      if (platform === 'linkedin') {
        const commentOnComment = !!(
          normalizedThreadContext?.isReply &&
          normalizedThreadContext?.threadLength != null &&
          normalizedThreadContext.threadLength > 1
        );
        console.log("[API] [LinkedIn] Request:", {
          viewer_is_original_author: viewer_is_original_author ?? false,
          isOther: !(viewer_is_original_author ?? false),
          hasThreadContext: !!normalizedThreadContext,
          threadContext: normalizedThreadContext
            ? {
                isReply: normalizedThreadContext.isReply,
                threadLength: normalizedThreadContext.threadLength,
                hasOriginalPost: !!normalizedThreadContext.originalTweet,
                threadChainLength: normalizedThreadContext.threadChain?.length ?? 0,
                currentTweetIndex: normalizedThreadContext.currentTweetIndex,
              }
            : null,
          commentOnCommentRecognized: commentOnComment,
        });
        const linkedInResponse = await generateLinkedInReply({
          postText: tweet_text,
          postId: tweet_id,
          promptVariation: prompt_variation,
          viewerIsOriginalAuthor: viewer_is_original_author ?? false,
          authorInfo: author_info,
          // Map shared normalizedThreadContext (uses Twitter field names) to the
          // LinkedIn-specific interface that uses originalPost/originalPostAuthor.
          threadContext: normalizedThreadContext
            ? {
                isReply: normalizedThreadContext.isReply,
                originalPost: normalizedThreadContext.originalTweet,
                originalPostAuthor: normalizedThreadContext.originalTweetAuthor,
                threadChain: normalizedThreadContext.threadChain,
                currentTweetIndex: normalizedThreadContext.currentTweetIndex,
                threadLength: normalizedThreadContext.threadLength,
              }
            : undefined,
        });

        await storage.createReplyEvent({
          id: crypto.randomUUID(),
          userId,
          modelKey: linkedInResponse.modelKey,
          promptKey: prompt_variation || 'default',
          latencyMs: linkedInResponse.latencyMs,
          tokensUsed: (linkedInResponse.tokensIn || 0) + (linkedInResponse.tokensOut || 0),
          cost: 0,
        });

        console.log('[API] createReplyHistory (LinkedIn)', {
          platform: 'linkedin',
          tweetTextLen: typeof tweet_text === 'string' ? tweet_text.length : 0,
          replyLen: typeof linkedInResponse?.reply === 'string' ? linkedInResponse.reply.length : 0,
        });
        const historyEntry = await storage.createReplyHistory({
          id: crypto.randomUUID(),
          userId,
          originalTweet: tweet_text,
          generatedReply: linkedInResponse.reply,
          modelKey: linkedInResponse.modelKey,
          promptKey: prompt_variation || 'default',
          qualityScore: 0,
          replyMode: 'enhanced',
          performance: {
            qualityParameters: [],
            latencyMs: linkedInResponse.latencyMs,
          },
        });

        const liTokensIn = linkedInResponse.tokensIn ?? 0;
        const liTokensOut = linkedInResponse.tokensOut ?? 0;
        const liCost = aiRouter.estimateCost(linkedInResponse.modelKey, liTokensIn, liTokensOut);
        const liStageBreakdown = [
          ...guardrailClassificationStage,
          {
            stage: 'reply_generation',
            modelKey: linkedInResponse.modelKey,
            promptTokens: liTokensIn,
            completionTokens: liTokensOut,
            totalTokens: liTokensIn + liTokensOut,
            cost: liCost,
            latencyMs: linkedInResponse.latencyMs,
          },
        ];

        await storage.createReplyTokens({
          id: crypto.randomUUID(),
          userId,
          replyHistoryId: historyEntry.id,
          stageBreakdown: liStageBreakdown,
          totalPromptTokens: liTokensIn,
          totalCompletionTokens: liTokensOut,
          totalTokens: liTokensIn + liTokensOut,
          totalCost: liCost,
        });

        return res.json({
          reply: linkedInResponse.reply,
          qualityScore: null,
          used: updatedCounter.creditsUsed ?? (updatedCounter.repliesUsed * 2),
          limit: updatedCounter.limit,
          resetAt: updatedCounter.resetAt,
          analysis: null,
          meta: {
            modelKey: linkedInResponse.modelKey,
            latencyMs: linkedInResponse.latencyMs,
            qualityBreakdown: [],
          },
        });
      }
      // --- End LinkedIn pipeline ---

      // Prepare author info for analysis
      const authorInfo = author_info && author_info.username ? {
        username: author_info.username,
        verified: author_info.verified || false,
        followerCount: author_info.follower_count || 0
      } : undefined;

      // Run AI-powered tweet analysis agents (only for enhanced mode)
      let tweetAnalysis = null;
      
      if (reply_mode === 'enhanced') {
        const analysisStartTime = Date.now();
        console.log('[API] ========== TWEET ANALYSIS START (ENHANCED MODE) ==========');
        console.log('[API] Tweet text length:', tweet_text.length);
        console.log('[API] Author:', authorInfo?.username || 'unknown');
        console.log('[API] Thread context:', normalizedThreadContext ? 
          `Thread with ${normalizedThreadContext.threadLength} tweets (isReply: ${normalizedThreadContext.isReply})` : 
          'None');
        
        try {
          const { tweetAnalysisOrchestrator } = await import('./services/tweet-analysis-agents.js');
          // Convert normalized thread context to ConversationContext format for analysis
          const conversationContextForAnalysis = normalizedThreadContext ? {
            parentTweets: normalizedThreadContext.threadChain.map(t => t.text),
            threadLength: normalizedThreadContext.threadLength,
            isThread: normalizedThreadContext.isReply,
            originalTweet: normalizedThreadContext.originalTweet,
            originalTweetAuthor: normalizedThreadContext.originalTweetAuthor,
            threadChain: normalizedThreadContext.threadChain,
            currentTweetIndex: normalizedThreadContext.currentTweetIndex
          } : undefined;
          
          console.log('[API] Calling tweetAnalysisOrchestrator.analyzeTweet()...');
          tweetAnalysis = await tweetAnalysisOrchestrator.analyzeTweet(
            tweet_text,
            authorInfo,
            conversationContextForAnalysis
          );
          
          const analysisLatency = Date.now() - analysisStartTime;
          
          if (tweetAnalysis) {
            console.log('[API] ✅ Successfully obtained enriched tweet analysis');
            console.log('[API] Analysis latency:', analysisLatency, 'ms');
            console.log('[API] Analysis tone:', tweetAnalysis.understanding?.tone || 'unknown');
            console.log('[API] Analysis sentiment:', tweetAnalysis.understanding?.sentiment || 'unknown');
            const intentionPreview = tweetAnalysis.intention?.intention 
              ? tweetAnalysis.intention.intention.substring(0, 100) + '...'
              : 'N/A';
            console.log('[API] Analysis intention:', intentionPreview);
          } else {
            console.log('[API] ⚠️ Tweet analysis returned null, falling back to basic context');
            console.log('[API] Analysis latency:', analysisLatency, 'ms');
          }
          console.log('[API] ========== TWEET ANALYSIS END ==========');
        } catch (error: any) {
          const analysisLatency = Date.now() - analysisStartTime;
          console.error('[API] ❌ Error running tweet analysis agents:', error.message);
          console.error('[API] Error stack:', error.stack);
          console.log('[API] Analysis latency before error:', analysisLatency, 'ms');
          console.log('[API] Falling back to basic tweet context analysis');
          console.log('[API] ========== TWEET ANALYSIS END (ERROR) ==========');
        }
      } else {
        console.log(`[API] Skipping tweet analysis (reply_mode: ${reply_mode})`);
      }

      // Analyze tweet context (fallback or additional context)
      const { tweetContextAnalyzer } = await import('./services/tweet-context.js');
      // Convert normalized thread context to ConversationContext format
      const conversationContextForTweetAnalyzer = normalizedThreadContext ? {
        parentTweets: normalizedThreadContext.threadChain.map(t => t.text),
        threadLength: normalizedThreadContext.threadLength,
        isThread: normalizedThreadContext.isReply,
        originalTweet: normalizedThreadContext.originalTweet,
        originalTweetAuthor: normalizedThreadContext.originalTweetAuthor,
        threadChain: normalizedThreadContext.threadChain,
        currentTweetIndex: normalizedThreadContext.currentTweetIndex
      } : undefined;
      const tweetContext = tweetContextAnalyzer.analyzeTweet(
        tweet_text,
        authorInfo,
        conversationContextForTweetAnalyzer
      );

      // Derive viewerIsOriginalAuthor: reply author is the original tweet author
      const userHandle = (user?.xUsername ?? '').trim().replace(/^@+/, '').toLowerCase();
      const rawOriginalAuthor = (normalizedThreadContext?.originalTweetAuthor ?? '').trim().replace(/^@+/, '').toLowerCase();
      const handlePattern = /^[a-z0-9_]+$/;
      const originalAuthor = handlePattern.test(rawOriginalAuthor) ? rawOriginalAuthor : '';
      const viewerIsOriginalAuthor = !!userHandle && !!originalAuthor && userHandle === originalAuthor;
      console.log('[API] Authors: original:', originalAuthor || 'unknown', '| reply (viewer):', userHandle || 'unknown', '| same:', viewerIsOriginalAuthor);

      // Handles used only for internal role disambiguation in prompts
      const replyAuthorHandle = (user?.xUsername ?? '').trim().replace(/^@+/, '') || undefined;
      const targetAuthorHandle = author_info?.username
        ? author_info.username.trim().replace(/^@+/, '')
        : undefined;

      // Generate the reply with enriched analysis and context
      // Log analysis data being passed to AI router
      if (tweetAnalysis) {
        console.log('[API] 📤 Passing analysis to AI router:', {
          hasAnalysis: !!tweetAnalysis,
          hasEnrichedPrompt: !!tweetAnalysis.enrichedContextPrompt,
          enrichedPromptLength: tweetAnalysis.enrichedContextPrompt?.length || 0,
          tone: tweetAnalysis.understanding?.tone || 'unknown',
          sentiment: tweetAnalysis.understanding?.sentiment || 'unknown',
          modelPreference: model_key || 'auto'
        });
      } else {
        console.log('[API] ⚠️ No analysis data to pass to AI router (using basic context only)');
      }
      
      let replyResponse = await aiRouter.generateReply({
        tweetText: tweet_text,
        tweetId: tweet_id,
        modelPreference: model_key,
        promptVariation: prompt_variation,
        replyMode: reply_mode, // Pass reply mode for prompt modification
        tweetContext,
        tweetAnalysis: tweetAnalysis ?? undefined, // Pass enriched analysis from agents
        authorInfo: author_info,
        threadContext: normalizedThreadContext ?? undefined, // NEW: Pass structured thread context
        conversationContext: conversationContextForTweetAnalyzer, // For backward compatibility
        tweetMetadata: tweet_metadata,
        viewerIsOriginalAuthor,
        replyAuthorHandle,
        targetAuthorHandle,
      });

      // Quality check with detailed parameters (new 10-parameter system)
      const { qualityChecker } = await import('./services/quality-checker.js');
      const qualityResult = qualityChecker.checkQuality(replyResponse.reply, tweet_text);
      
      if (!qualityResult.passed) {
        console.log(`⚠️ [Quality] Reply failed quality check (score: ${qualityResult.totalScore}/100)`);
        const lowScores = qualityResult.parameters.filter(p => p.score <= QUALITY.LOW_PARAMETER_SCORE);
        if (lowScores.length > 0) {
          console.log(`🔧 [Quality] Low scores: ${lowScores.map(p => `${p.name}(${p.score})`).join(', ')}`);
        }
        
        // Try to regenerate with a different approach
        // Fix: Include tweetAnalysis in retry to maintain enriched context
        try {
          const retryResponse = await aiRouter.generateReply({
            tweetText: tweet_text,
            tweetId: tweet_id,
            modelPreference: model_key,
            promptVariation: prompt_variation === 'default' ? 'direct' : 'default', // Try different prompt
            replyMode: reply_mode, // Pass reply mode for prompt modification
            tweetContext,
            tweetAnalysis: tweetAnalysis ?? undefined, // Include enriched analysis in retry
            authorInfo: author_info,
            threadContext: normalizedThreadContext ?? undefined, // NEW: Pass structured thread context
            conversationContext: conversationContextForTweetAnalyzer, // For backward compatibility
            tweetMetadata: tweet_metadata,
            viewerIsOriginalAuthor,
            replyAuthorHandle,
            targetAuthorHandle,
          });
          
          const retryQualityResult = qualityChecker.checkQuality(retryResponse.reply, tweet_text);
          if (retryQualityResult.totalScore > qualityResult.totalScore) {
            console.log(`✅ [Quality] Retry improved quality (${retryQualityResult.totalScore} vs ${qualityResult.totalScore})`);
            replyResponse = retryResponse;
          }
        } catch (retryError) {
          console.log(`❌ [Quality] Retry failed, using original reply`);
        }
      } else {
        console.log(`✅ [Quality] Reply passed quality check (score: ${qualityResult.totalScore}/100)`);
      }

      // Log the reply event
      await storage.createReplyEvent({
        id: crypto.randomUUID(),
        userId,
        modelKey: replyResponse.modelKey,
        promptKey: 'default',
        latencyMs: replyResponse.latencyMs,
        tokensUsed: (replyResponse.tokensIn || 0) + (replyResponse.tokensOut || 0),
        cost: 0,
      });

      // Re-check quality for the final reply (in case it was retried)
      const finalQualityResult = qualityChecker.checkQuality(replyResponse.reply, tweet_text);

      // Save to reply history with detailed quality breakdown
      const historyEntry = await storage.createReplyHistory({
        id: crypto.randomUUID(),
        userId,
        originalTweet: tweet_text,
        generatedReply: replyResponse.reply,
        modelKey: replyResponse.modelKey,
        promptKey: prompt_variation || 'default',
        qualityScore: finalQualityResult.totalScore,
        replyMode: reply_mode,
        performance: {
          qualityParameters: finalQualityResult.parameters,
          latencyMs: replyResponse.latencyMs,
        },
      });

      // Build stage_breakdown (one entry per LLM call) and persist reply_tokens
      const tokensIn = replyResponse.tokensIn ?? 0;
      const tokensOut = replyResponse.tokensOut ?? 0;
      const replyGenCost = aiRouter.estimateCost(replyResponse.modelKey, tokensIn, tokensOut);
      const analysisStages: Array<{ stage: string; modelKey: string; promptTokens: number; completionTokens: number; totalTokens: number; cost: number; latencyMs: number }> = [];
      if (tweetAnalysis?.stageUsage?.tweet_understanding) {
        const u = tweetAnalysis.stageUsage.tweet_understanding;
        console.log('[API] stage_breakdown tweet_understanding model_key:', u.modelKey);
        analysisStages.push({
          stage: 'tweet_understanding',
          modelKey: u.modelKey,
          promptTokens: u.promptTokens,
          completionTokens: u.completionTokens,
          totalTokens: u.promptTokens + u.completionTokens,
          cost: aiRouter.estimateCost(u.modelKey, u.promptTokens, u.completionTokens),
          latencyMs: u.latencyMs,
        });
      }
      if (tweetAnalysis?.stageUsage?.tweet_intention) {
        const u = tweetAnalysis.stageUsage.tweet_intention;
        console.log('[API] stage_breakdown tweet_intention model_key:', u.modelKey);
        analysisStages.push({
          stage: 'tweet_intention',
          modelKey: u.modelKey,
          promptTokens: u.promptTokens,
          completionTokens: u.completionTokens,
          totalTokens: u.promptTokens + u.completionTokens,
          cost: aiRouter.estimateCost(u.modelKey, u.promptTokens, u.completionTokens),
          latencyMs: u.latencyMs,
        });
      }
      const stageBreakdown = [
        ...guardrailClassificationStage,
        ...analysisStages,
        {
          stage: "reply_generation",
          modelKey: replyResponse.modelKey,
          promptTokens: tokensIn,
          completionTokens: tokensOut,
          totalTokens: tokensIn + tokensOut,
          cost: replyGenCost,
          latencyMs: replyResponse.latencyMs,
        },
      ];
      const totalPromptTokens = stageBreakdown.reduce((s, e) => s + e.promptTokens, 0);
      const totalCompletionTokens = stageBreakdown.reduce((s, e) => s + e.completionTokens, 0);
      const totalTokens = stageBreakdown.reduce((s, e) => s + e.totalTokens, 0);
      const totalCost = stageBreakdown.reduce((s, e) => s + e.cost, 0);
      console.log("[API] stage_breakdown stages:", stageBreakdown.map((s) => ({ stage: s.stage, model_key: s.modelKey })));
      await storage.createReplyTokens({
        id: crypto.randomUUID(),
        userId,
        replyHistoryId: historyEntry.id,
        stageBreakdown,
        totalPromptTokens,
        totalCompletionTokens,
        totalTokens,
        totalCost,
      });

      // Return response with updated usage and quality details
      // Safely include analysis data for client-side logging
      let analysisData = null;
      if (tweetAnalysis && tweetAnalysis.understanding && tweetAnalysis.intention) {
        try {
          analysisData = {
            tone: tweetAnalysis.understanding.tone || 'unknown',
            sentiment: tweetAnalysis.understanding.sentiment || 'unknown',
            style: tweetAnalysis.understanding.style || 'unknown',
            intention: tweetAnalysis.intention.intention || 'Unknown intention'
          };
        } catch (analysisError: any) {
          console.error('[API] Error serializing analysis data:', analysisError.message);
          // Continue without analysis data if serialization fails
        }
      }

      res.json({
        reply: replyResponse.reply,
        qualityScore: finalQualityResult.totalScore,
        used: updatedCounter.creditsUsed ?? (updatedCounter.repliesUsed * 2), // Credits
        limit: updatedCounter.limit, // Credits
        resetAt: updatedCounter.resetAt,
        analysis: analysisData,
        meta: {
          modelKey: replyResponse.modelKey,
          latencyMs: replyResponse.latencyMs,
          qualityBreakdown: finalQualityResult.parameters,
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error(`❌ [API] Error generating reply: ${errorMessage}`);
      if (errorStack) {
        console.error(`❌ [API] Error stack:`, errorStack);
      }
      console.error(`❌ [API] Full error object:`, error);
      
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Validation error",
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      
      if (errorMessage.includes('User not found')) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (errorMessage === 'No active usage window' || errorMessage === 'Quota exceeded') {
        const status = await usageService.getUsageStatus(getUserId(req));
        return res.status(402).json({
          error: 'quota_exceeded',
          message: errorMessage,
          used: status?.used || 0,
          limit: status?.limit || 0,
          resetAt: status?.resetAt || new Date(),
        });
      }

      res.status(500).json(getClientErrorBody(error, "Failed to generate reply"));
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
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      
      if (!user || !user.email) {
        return res.status(400).json({ message: "User email required" });
      }

      const schema = z.object({
        plan_code: z.enum(['weekly', 'monthly']),
      });

      const { plan_code } = schema.parse(req.body);

      // Get domain from request headers (for production) or environment variables
      // In Vercel, req.headers.host gives the actual domain the user is accessing
      // This handles both custom domains and vercel.app domains correctly
      const requestHost = req.headers.host;
      const domain = process.env.DOMAIN || requestHost || process.env.VERCEL_URL || 'localhost:5000';
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      
      // Redirect to root URL - Dodo Payments will add subscription_id and status as query params
      const successUrl = `${protocol}://${domain}/`;
      const cancelUrl = `${protocol}://${domain}/pricing`;

      const session = await dodoPaymentsService.createCheckoutSession(
        plan_code,
        userId,
        user.email,
        successUrl,
        cancelUrl
      );

      res.json({ checkout_url: session.url });

    } catch (error) {
      console.error("Error creating checkout session:", error);

      const handled = handleZodError(res, error);
      if (handled) return handled;

      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // Checkout success callback route
  // Dodo Payments redirects to root URL with subscription_id and status as query params
  // This route is always called via client-side fetch() — never by direct browser navigation.
  // All responses are JSON so the client can read outcomes without redirect-following issues.
  app.get('/api/checkout/success', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      // Dodo Payments provides subscription_id directly in query params, not session_id
      const subscriptionId = req.query.subscription_id as string;
      const queryStatus = req.query.status as string; // Renamed to avoid conflict with subscription status variable
      
      if (!subscriptionId) {
        console.error('[Checkout Success] No subscription_id in query params');
        return res.status(400).json({ success: false, error: 'no_subscription' });
      }

      console.log('[Checkout Success] Processing subscription:', subscriptionId, 'query status:', queryStatus);

      // Get user
      const user = await storage.getUser(userId);
      if (!user) {
        console.error('[Checkout Success] User not found:', userId);
        return res.status(404).json({ success: false, error: 'user_not_found' });
      }

      // Get subscription details from Dodo Payments
      let subscription;
      try {
        subscription = await dodoPaymentsService.getSubscription(subscriptionId);
      } catch (error: any) {
        console.error('[Checkout Success] Failed to retrieve subscription:', {
          subscriptionId,
          error: error.message,
          status: error.status,
        });
        if (error.status === 404) {
          return res.status(404).json({ success: false, error: 'subscription_not_found' });
        }
        if (error.status === 401 || error.status === 403) {
          return res.status(error.status).json({ success: false, error: 'unauthorized' });
        }
        return res.status(500).json({ success: false, error: 'checkout_failed' });
      }
      const subData = subscription as any;

      // Extract customer information from subscription
      const customerId = subData.customer_id || subData.customer?.id;
      const customerEmail = subData.customer?.email || subData.customer_email;

      // Update user with Dodo Payments customer ID if not already set
      if (!user.dodoCustomerId && customerId) {
        await storage.upsertUser({
          ...user,
          dodoCustomerId: customerId,
        });
      }

      // Extract plan information
      console.log('[Checkout Success] Subscription data structure:', JSON.stringify(subData, null, 2).substring(0, 1000));
      
      const productId = subData.product_id 
        || subData.items?.[0]?.price?.product 
        || subData.items?.[0]?.product_id
        || subData.product?.id
        || subData.price?.product;
      
      console.log('[Checkout Success] Extracted product ID:', productId);
      console.log('[Checkout Success] Available product IDs in config:', {
        weekly: PLANS.weekly.dodoPriceId,
        monthly: PLANS.monthly.dodoPriceId,
      });
      
      const planCode = dodoPaymentsService.planCodeFromPriceId(productId);

      if (!planCode) {
        console.error('[Checkout Success] Unknown product ID:', productId);
        console.error('[Checkout Success] Full subscription data:', JSON.stringify(subData, null, 2));
        return res.status(400).json({ success: false, error: 'unknown_plan' });
      }

      console.log('[Checkout Success] Mapped to plan code:', planCode);

      const plan = PLANS[planCode];
      if (!plan) {
        console.error('[Checkout Success] Plan not found:', planCode);
        return res.status(400).json({ success: false, error: 'plan_not_found' });
      }

      // Helper function to parse Dodo Payments date (handles seconds, milliseconds, or ISO strings)
      const parseDodoDate = (dateValue: any, fallback: Date): Date => {
        if (!dateValue) return fallback;
        if (typeof dateValue === 'number') {
          // Check if it's seconds (< 1e12) or milliseconds (>= 1e12)
          return new Date(dateValue > 1e12 ? dateValue : dateValue * 1000);
        }
        if (typeof dateValue === 'string') {
          const parsed = new Date(dateValue);
          return isNaN(parsed.getTime()) ? fallback : parsed;
        }
        return fallback;
      };

      // Calculate period dates with proper parsing
      const now = new Date();
      const periodStart = parseDodoDate(subData.current_period_start, now);
      const periodEnd = parseDodoDate(subData.current_period_end, (() => {
        const end = new Date(periodStart);
        if (planCode === 'monthly') {
          end.setDate(end.getDate() + PERIODS.MONTHLY_DAYS);
        } else {
          end.setDate(end.getDate() + PERIODS.WEEKLY_DAYS);
        }
        return end;
      })());

      // Validate subscription status — never default to 'active' to avoid false activation
      // 'failed' = hard payment rejection (card declined); Dodo will NOT retry — distinct from
      // 'past_due' which is overdue but may recover via dunning retries.
      const validStatuses = ['active', 'canceled', 'past_due', 'unpaid', 'failed'] as const;
      const rawStatus = subData.status ?? 'past_due';
      const status = (validStatuses.includes(rawStatus as typeof validStatuses[number])
        ? rawStatus
        : 'past_due') as typeof validStatuses[number];

      // Always log what Dodo returned so we can correlate with their dashboard
      console.log('[Checkout Success] Dodo subscription status resolved', {
        subscriptionId,
        resolvedStatus: status,
        rawStatus: subData.status,
        userId: user.id,
        planCode,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });

      if (status !== 'active') {
        console.warn('[Checkout Success] Non-active subscription status — NOT activating subscription', {
          subscriptionId,
          status,
          rawStatus: subData.status,
          userId: user.id,
          planCode,
        });
      }

      // Hard payment failure — Dodo will not retry; user must start a new checkout.
      // Skip all DB writes to avoid orphaned records, return error JSON immediately.
      if (status === 'failed') {
        console.warn('[Checkout Success] Payment definitively failed — skipping DB write', {
          subscriptionId,
          status,
          rawStatus: subData.status,
          userId: user.id,
          planCode,
        });
        return res.status(402).json({ success: false, error: 'payment_failed' });
      }

      // Extract currency from response or use plan default
      const currency = subData.currency || subData.amount_currency || 'usd';

      // Check if subscription already exists (idempotency check)
      const existingSubscription = await storage.getSubscriptionByDodoId(subscriptionId);
      
      if (existingSubscription) {
        // Update existing subscription (idempotent operation)
        console.log('[Checkout Success] Subscription already exists, updating:', subscriptionId);
        console.log('[Checkout Success] Existing subscription:', {
          id: existingSubscription.id,
          userId: existingSubscription.userId,
          planCode: existingSubscription.planCode,
          status: existingSubscription.status,
        });
        
        try {
          await storage.updateSubscription(existingSubscription.id, {
            status,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            amountPaid: subData.amount_paid || plan.price,
            currency,
          });
          console.log('[Checkout Success] Subscription updated successfully');
          // Note: if existingSubscription was past_due and is now active (e.g. bank approved
          // immediately after the webhook created the row), the usage counter will be created
          // by the subsequent subscription.updated webhook from Dodo. We intentionally do not
          // create it here to avoid duplicate counters.
        } catch (updateError: any) {
          console.error('[Checkout Success] Failed to update subscription:', updateError);
          throw updateError;
        }
      } else {
        // Create new subscription record regardless of status so we have a DB record to update later
        console.log('[Checkout Success] Creating new subscription:', {
          userId: user.id,
          planCode,
          status,
          subscriptionId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        });
        
        try {
          const newSubscription = await storage.createSubscription({
            id: crypto.randomUUID(),
            userId: user.id,
            planCode,
            status,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            dodoSubscriptionId: subscriptionId,
            amountPaid: subData.amount_paid || plan.price,
            currency,
          });

          // Only activate credits and notify the user when payment actually succeeded
          if (status === 'active') {
            // Cancel any existing active subscriptions for this user
            const existingSubscriptions = await storage.getUserSubscriptions(userId);
            for (const oldSub of existingSubscriptions) {
              if (oldSub.id !== newSubscription.id && oldSub.status === 'active') {
                try {
                  await dodoPaymentsService.cancelSubscription(oldSub.dodoSubscriptionId);
                  await storage.updateSubscription(oldSub.id, {
                    status: 'canceled',
                    cancelAt: new Date(),
                    cancelReason: 'upgraded_to_new_plan',
                  });
                  console.log(`[Checkout Success] Canceled old subscription: ${oldSub.id}`);
                } catch (error) {
                  console.error(`[Checkout Success] Failed to cancel old subscription ${oldSub.id}:`, error);
                }
              }
            }

            // Create usage counter for new subscription period
            try {
              await storage.createUsageCounter({
                id: crypto.randomUUID(),
                userId: user.id,
                planCode,
                periodStart,
                periodEnd,
                repliesUsed: 0,
                creditsUsed: 0,
                limit: plan.credits,
                resetAt: periodEnd,
              });
            } catch (counterError: any) {
              console.error('[Checkout Success] Failed to create usage counter:', counterError);
            }

            // Subscription active email: checkout redirect usually runs before webhook, so DB row exists
            // when subscription.created fires and the webhook skips sendSubscriptionActive (update-only path).
            emailService
              .sendSubscriptionActive(
                user.id,
                subscriptionId,
                planCode,
                periodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
              )
              .catch((err: unknown) => console.error('[Checkout Success] sendSubscriptionActive error:', err));
          }
        } catch (createError: any) {
          console.error('[Checkout Success] Failed to create subscription:', createError);
          console.error('[Checkout Success] Error details:', {
            message: createError.message,
            stack: createError.stack,
            code: createError.code,
          });
          throw createError;
        }
      }

      if (status === 'active') {
        console.log('[Checkout Success] Subscription activated successfully');
        return res.json({ success: true });
      } else {
        console.log('[Checkout Success] Subscription not activated — returning payment failed');
        return res.status(402).json({ success: false, error: 'payment_failed' });
      }

    } catch (error: any) {
      console.error('[Checkout Success] Error:', error);
      const errorCode = error.status === 404 ? 'subscription_not_found' : 
                       error.status === 401 || error.status === 403 ? 'unauthorized' : 'checkout_failed';
      return res.status(error.status || 500).json({ success: false, error: errorCode });
    }
  });

  // Customer portal route
  app.post('/api/billing/portal', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      
      if (!user || !user.dodoCustomerId) {
        return res.status(400).json({ message: "No billing account found" });
      }

      // Get domain from request headers (for production) or environment variables
      // In Vercel, req.headers.host gives the actual domain the user is accessing
      const requestHost = req.headers.host;
      const domain = process.env.DOMAIN || requestHost || process.env.VERCEL_URL || 'localhost:5000';
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const returnUrl = `${protocol}://${domain}/app/pricing`;

      const session = await dodoPaymentsService.createCustomerPortalSession(
        user.dodoCustomerId,
        returnUrl
      ) as any;

      res.json({ portal_url: session.url });

    } catch (error) {
      console.error("Error creating portal session:", error);
      res.status(500).json({ message: "Failed to create portal session" });
    }
  });

  // Get subscription details
  app.get('/api/subscription', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const subscription = await storage.getActiveSubscription(userId);
      const usageStatus = await usageService.getUsageStatus(userId);
      
      if (!usageStatus) {
        return res.status(404).json({ message: "Usage status not found" });
      }

      // Determine plan details
      let planDetails = null;
      if (subscription) {
        planDetails = PLANS[subscription.planCode];
      } else if (usageStatus.planCode === 'trial') {
        planDetails = {
          code: 'trial',
          name: 'Free Trial',
          price: 0,
          replies: 0,
          credits: usageStatus.limit,
          interval: 'week' as const,
        };
      } else if (usageStatus.planCode === 'bypass') {
        planDetails = {
          code: 'bypass',
          name: 'Pro Plan',
          price: 0,
          replies: 0,
          credits: usageStatus.limit,
          interval: 'month' as const,
        };
      } else {
        planDetails = {
          code: 'free',
          name: 'Free Plan',
          price: 0,
          replies: 0,
          credits: usageStatus.limit,
          interval: 'month' as const,
        };
      }

      // Serialize subscription dates to ISO strings for JSON response
      const serializedSubscription = subscription ? {
        ...subscription,
        currentPeriodStart: subscription.currentPeriodStart instanceof Date ? subscription.currentPeriodStart.toISOString() : subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd instanceof Date ? subscription.currentPeriodEnd.toISOString() : subscription.currentPeriodEnd,
        cancelAt: subscription.cancelAt instanceof Date ? subscription.cancelAt.toISOString() : subscription.cancelAt,
        createdAt: subscription.createdAt instanceof Date ? subscription.createdAt.toISOString() : subscription.createdAt,
        updatedAt: subscription.updatedAt instanceof Date ? subscription.updatedAt.toISOString() : subscription.updatedAt,
      } : null;

      res.json({
        subscription: serializedSubscription,
        planDetails,
        usageStatus: {
          planCode: usageStatus.planCode,
          used: usageStatus.used,
          limit: usageStatus.limit,
          status: usageStatus.status,
        },
      });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  // Cancel subscription
  app.post('/api/subscription/cancel', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const subscription = await storage.getActiveSubscription(userId);
      
      if (!subscription) {
        return res.status(404).json({ message: "No active subscription found" });
      }

      if (subscription.status === 'canceled') {
        return res.status(400).json({ message: "Subscription is already canceled" });
      }

      const accessUntil = subscription.currentPeriodEnd
        ? subscription.currentPeriodEnd.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })
        : 'the end of your billing period';

      // Cancel subscription via Dodo Payments
      await dodoPaymentsService.cancelSubscription(subscription.dodoSubscriptionId);

      // Update subscription status in database
      await storage.updateSubscription(subscription.id, {
        status: 'canceled',
        cancelAt: new Date(),
      });

      emailService
        .sendSubscriptionCanceled(
          userId,
          subscription.dodoSubscriptionId,
          subscription.planCode,
          accessUntil,
        )
        .catch((err: unknown) => console.error('[API subscription/cancel] sendSubscriptionCanceled error:', err));

      // Fetch updated subscription to return complete data
      const updatedSubscription = await storage.getActiveSubscription(userId);
      
      // Serialize subscription dates to ISO strings for JSON response
      const subscriptionToReturn = updatedSubscription || subscription;
      const serializedSubscription = subscriptionToReturn ? {
        ...subscriptionToReturn,
        status: 'canceled' as const,
        currentPeriodStart: subscriptionToReturn.currentPeriodStart.toISOString(),
        currentPeriodEnd: subscriptionToReturn.currentPeriodEnd.toISOString(),
        cancelAt: new Date().toISOString(),
        createdAt: subscriptionToReturn.createdAt.toISOString(),
        updatedAt: subscriptionToReturn.updatedAt.toISOString(),
      } : null;
      
      res.json({ 
        message: "Subscription canceled successfully",
        subscription: serializedSubscription,
      });
    } catch (error: any) {
      console.error("Error canceling subscription:", error);
      res.status(500).json(getClientErrorBody(error, "Failed to cancel subscription"));
    }
  });

  // Dodo Payments webhook
  // Note: Raw body parser is applied in index.ts before express.json() for this route
  // Uses Dodo Payments SDK's built-in webhook verification
  app.post('/api/dodo/webhook', async (req, res) => {
    // Extract webhook headers
    const webhookId = req.headers['webhook-id'] as string;
    const webhookTimestamp = req.headers['webhook-timestamp'] as string;
    const webhookSignature = req.headers['webhook-signature'] as string;
    
    console.log('[Webhook] Received webhook request');
    console.log('[Webhook] Webhook ID:', webhookId);
    console.log('[Webhook] Webhook Timestamp:', webhookTimestamp);
    console.log('[Webhook] Signature header found:', !!webhookSignature);
    
    try {
      // Get raw body buffer for webhook verification
      const rawBody = req.body;
      
      // Verify webhook signature and unwrap payload using Dodo Payments SDK
      const event = await dodoPaymentsService.constructWebhookEvent(
        rawBody,
        {
          'webhook-id': webhookId || '',
          'webhook-signature': webhookSignature || '',
          'webhook-timestamp': webhookTimestamp || '',
        }
      );

      const eventType = event.type;
      const eventData = event.data as any;

      console.log(`[Webhook] Received Dodo Payments webhook: ${eventType}`);
      console.log(`[Webhook] Event data structure:`, JSON.stringify(eventData, null, 2).substring(0, 500));

      // Handle payment.succeeded or payment_intent.succeeded
      if (eventType === 'payment.succeeded' || eventType === 'payment_intent.succeeded') {
        // Extract customer email from various possible locations
        // The SDK unwrap() returns the event directly, so check multiple possible structures
        const customerEmail = eventData.customer?.email 
          || eventData.customer_email
          || eventData.billing_details?.email 
          || eventData.billing?.email
          || eventData.data?.object?.customer_email
          || eventData.data?.object?.customer?.email
          || eventData.data?.customer_email
          || eventData.email
          || (eventData.data && typeof eventData.data === 'object' && (eventData.data as any).email);

        if (!customerEmail) {
          console.error('[Webhook] No customer email found in payment.succeeded event');
          return res.json({ received: true });
        }

        // Find user by email
        const user = await storage.getUserByEmail(customerEmail);
        if (!user) {
          console.error(`[Webhook] User not found for email: ${customerEmail}`);
          return res.json({ received: true });
        }

        // Update user with Dodo Payments customer ID if available
        const customerId = eventData.customer?.id || eventData.data?.object?.customer;
        if (!user.dodoCustomerId && customerId) {
          await storage.upsertUser({
            ...user,
            dodoCustomerId: customerId,
          });
        }

        // If metadata indicates subscription, handle subscription creation
        const metadata = eventData.metadata || eventData.data?.object?.metadata || {};
        if (metadata.subscription_id || eventData.subscription_id) {
          // Subscription will be handled by subscription.created event
          console.log('[Webhook] Payment succeeded for subscription, waiting for subscription.created event');
        }
      }

      // Handle subscription.created or customer.subscription.created
      else if (eventType === 'subscription.created' || eventType === 'customer.subscription.created') {
        // Extract customer email from various possible locations
        const customerEmail = eventData.customer?.email 
          || eventData.customer_email
          || eventData.data?.object?.customer_email
          || eventData.data?.object?.customer?.email
          || eventData.data?.customer_email
          || eventData.billing_details?.email
          || eventData.billing?.email
          || eventData.email
          || (eventData.data && typeof eventData.data === 'object' && (eventData.data as any).email);

        if (!customerEmail) {
          console.error('[Webhook] No customer email found in subscription.created event');
          return res.json({ received: true });
        }

        // Find user by email
        const user = await storage.getUserByEmail(customerEmail);
        if (!user) {
          console.error(`[Webhook] User not found for email: ${customerEmail}`);
          return res.json({ received: true });
        }

        // Extract subscription ID
        const subscriptionId = eventData.subscription_id 
          || eventData.id 
          || eventData.data?.object?.id;

        if (!subscriptionId) {
          console.error('[Webhook] No subscription_id found in subscription.created event');
          return res.json({ received: true });
        }

        // Extract plan from metadata or product_id
        const metadata = eventData.metadata || eventData.data?.object?.metadata || {};
        const productId = metadata.product_id 
          || eventData.product_id 
          || eventData.data?.object?.product_id
          || eventData.items?.[0]?.price?.product;

        const planCode = productId 
          ? dodoPaymentsService.planCodeFromPriceId(productId)
          : null;

        if (!planCode) {
          console.error(`[Webhook] Unknown product ID: ${productId}`);
          return res.json({ received: true });
        }

        const plan = PLANS[planCode];
        if (!plan) {
          console.error(`[Webhook] Plan not found: ${planCode}`);
          return res.json({ received: true });
        }

        // Helper function to parse Dodo Payments date (handles seconds, milliseconds, or ISO strings)
        const parseDodoDate = (dateValue: any, fallback: Date): Date => {
          if (!dateValue) return fallback;
          if (typeof dateValue === 'number') {
            // Check if it's seconds (< 1e12) or milliseconds (>= 1e12)
            return new Date(dateValue > 1e12 ? dateValue : dateValue * 1000);
          }
          if (typeof dateValue === 'string') {
            const parsed = new Date(dateValue);
            return isNaN(parsed.getTime()) ? fallback : parsed;
          }
          return fallback;
        };

        // Calculate period dates with proper parsing
        const now = new Date();
        const periodStart = parseDodoDate(
          eventData.current_period_start || eventData.data?.object?.current_period_start,
          now
        );
        const periodEnd = parseDodoDate(
          eventData.current_period_end || eventData.data?.object?.current_period_end,
          (() => {
            const end = new Date(periodStart);
            if (planCode === 'monthly') {
              end.setDate(end.getDate() + PERIODS.MONTHLY_DAYS);
            } else {
              end.setDate(end.getDate() + PERIODS.WEEKLY_DAYS);
            }
            return end;
          })()
        );

        // Validate subscription status — never default to 'active' to avoid false activation
        // 'failed' = hard payment rejection (card declined); Dodo will NOT retry — distinct from
        // 'past_due' which is overdue but may recover via dunning retries.
        const validStatuses = ['active', 'canceled', 'past_due', 'unpaid', 'failed'] as const;
        const rawStatus = eventData.status ?? eventData.data?.object?.status ?? 'past_due';
        const status = (validStatuses.includes(rawStatus as typeof validStatuses[number])
          ? rawStatus
          : 'past_due') as typeof validStatuses[number];

        // Extract currency from response
        const currency = eventData.currency 
          || eventData.data?.object?.currency 
          || eventData.amount_currency 
          || 'usd';

        // Check if subscription already exists (idempotency check)
        const existingSubscription = await storage.getSubscriptionByDodoId(subscriptionId);

        // Always log key details so the full lifecycle is visible in server logs
        console.log('[Webhook] subscription.created received', {
          subscriptionId,
          resolvedStatus: status,
          rawStatus,
          planCode,
          userId: user.id,
          customerEmail,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          isExistingSubscription: !!existingSubscription,
        });

        if (status !== 'active') {
          console.warn('[Webhook] subscription.created — non-active status, NOT activating credits or sending active email', {
            subscriptionId,
            status,
            rawStatus,
            userId: user.id,
            rawEventData: JSON.stringify(eventData).substring(0, 2000),
          });
        }

        // Hard payment failure — Dodo will not retry this subscription.
        // Skip DB write entirely; user must start a new checkout (new subscription_id).
        if (status === 'failed') {
          console.warn('[Webhook] subscription.created with failed status — skipping DB write', {
            subscriptionId,
            userId: user.id,
          });
          return res.json({ received: true });
        }
        
        if (existingSubscription) {
          // Update existing subscription (idempotent operation)
          console.log(`[Webhook] Subscription already exists, updating: ${subscriptionId}`);
          await storage.updateSubscription(existingSubscription.id, {
            status,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
          });
        } else {
          // Create new subscription record regardless of status so we have a row to update later
          await storage.createSubscription({
            id: crypto.randomUUID(),
            userId: user.id,
            planCode,
            status,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            dodoSubscriptionId: subscriptionId,
            amountPaid: eventData.amount_paid || plan.price,
            currency,
          });

          // Only activate credits and send email when payment actually succeeded
          if (status === 'active') {
            // Cancel any existing active subscriptions for this user
            const existingSubscriptions = await storage.getUserSubscriptions(user.id);
            for (const oldSub of existingSubscriptions) {
              if (oldSub.dodoSubscriptionId !== subscriptionId && oldSub.status === 'active') {
                try {
                  await dodoPaymentsService.cancelSubscription(oldSub.dodoSubscriptionId);
                  await storage.updateSubscription(oldSub.id, {
                    status: 'canceled',
                    cancelAt: new Date(),
                    cancelReason: 'upgraded_to_new_plan',
                  });
                  console.log(`[Webhook] Canceled old subscription: ${oldSub.id}`);
                } catch (error) {
                  console.error(`[Webhook] Failed to cancel old subscription ${oldSub.id}:`, error);
                }
              }
            }

            // Create usage counter for new subscription period
            await storage.createUsageCounter({
              id: crypto.randomUUID(),
              userId: user.id,
              planCode,
              periodStart,
              periodEnd,
              repliesUsed: 0,
              creditsUsed: 0,
              limit: plan.credits,
              resetAt: periodEnd,
            });

            console.log(`[Webhook] Created subscription and usage counter for user: ${user.id}`);

            // Send subscription active email
            emailService.sendSubscriptionActive(
              user.id,
              subscriptionId,
              planCode,
              periodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            ).catch((err: unknown) => console.error('[Webhook] sendSubscriptionActive error:', err));
          }
        }
      }

      // Handle subscription.updated or customer.subscription.updated
      else if (eventType === 'subscription.updated' || eventType === 'customer.subscription.updated') {
        // Extract customer email from various possible locations
        const customerEmail = eventData.customer?.email 
          || eventData.customer_email
          || eventData.data?.object?.customer_email
          || eventData.data?.object?.customer?.email
          || eventData.data?.customer_email
          || eventData.billing_details?.email
          || eventData.billing?.email
          || eventData.email
          || (eventData.data && typeof eventData.data === 'object' && (eventData.data as any).email);

        if (!customerEmail) {
          console.error('[Webhook] No customer email found in subscription.updated event');
          return res.json({ received: true });
        }

        // Find user by email
        const user = await storage.getUserByEmail(customerEmail);
        if (!user) {
          console.error(`[Webhook] User not found for email: ${customerEmail}`);
          return res.json({ received: true });
        }

        // Extract subscription ID
        const subscriptionId = eventData.subscription_id 
          || eventData.id 
          || eventData.data?.object?.id;

        if (!subscriptionId) {
          console.error('[Webhook] No subscription_id found in subscription.updated event');
          return res.json({ received: true });
        }

        // Get existing subscription
        const existingSubscription = await storage.getSubscriptionByDodoId(subscriptionId);
        if (!existingSubscription) {
          console.error(`[Webhook] Subscription not found: ${subscriptionId}`);
          return res.json({ received: true });
        }

        // Validate and extract status
        const validStatuses = ['active', 'canceled', 'past_due', 'unpaid'] as const;
        const rawStatus = eventData.status || eventData.data?.object?.status;
        const status = rawStatus && validStatuses.includes(rawStatus as typeof validStatuses[number])
          ? (rawStatus as typeof validStatuses[number])
          : existingSubscription.status; // Keep existing status if invalid
        
        // Helper function to parse Dodo Payments date
        const parseDodoDate = (dateValue: any): Date | undefined => {
          if (!dateValue) return undefined;
          if (typeof dateValue === 'number') {
            return new Date(dateValue > 1e12 ? dateValue : dateValue * 1000);
          }
          if (typeof dateValue === 'string') {
            const parsed = new Date(dateValue);
            return isNaN(parsed.getTime()) ? undefined : parsed;
          }
          return undefined;
        };
        
        // Update subscription
        const updates: any = {};
        if (status && status !== existingSubscription.status) {
          updates.status = status;
        }

        // Update period dates if provided
        const periodStart = parseDodoDate(eventData.current_period_start || eventData.data?.object?.current_period_start);
        const periodEnd = parseDodoDate(eventData.current_period_end || eventData.data?.object?.current_period_end);
        if (periodStart) {
          updates.currentPeriodStart = periodStart;
        }
        if (periodEnd) {
          updates.currentPeriodEnd = periodEnd;
        }

        await storage.updateSubscription(existingSubscription.id, updates);

        // Log after the DB write so the entry only appears when the update actually succeeded
        console.log('[Webhook] subscription.updated processed', {
          subscriptionId,
          previousStatus: existingSubscription.status,
          newStatus: status,
          rawStatus,
          userId: user.id,
          customerEmail,
          updates,
        });

        // Canceled via subscription.updated (some providers omit dedicated subscription.canceled)
        if (status === 'canceled' && existingSubscription.status !== 'canceled') {
          const periodEndForAccess = updates.currentPeriodEnd ?? existingSubscription.currentPeriodEnd;
          const accessUntil = periodEndForAccess
            ? new Date(periodEndForAccess).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })
            : 'the end of your billing period';
          emailService
            .sendSubscriptionCanceled(user.id, subscriptionId, existingSubscription.planCode, accessUntil)
            .catch((err: unknown) => console.error('[Webhook] sendSubscriptionCanceled (updated) error:', err));
        }

        // If status changed to active, reset usage counter
        if (status === 'active' && existingSubscription.status !== 'active') {
          const plan = PLANS[existingSubscription.planCode];
          if (plan) {
            // Create new usage counter for reactivated subscription
            await storage.createUsageCounter({
              id: crypto.randomUUID(),
              userId: user.id,
              planCode: existingSubscription.planCode,
              periodStart: updates.currentPeriodStart || existingSubscription.currentPeriodStart,
              periodEnd: updates.currentPeriodEnd || existingSubscription.currentPeriodEnd,
              repliesUsed: 0,
              creditsUsed: 0,
              limit: plan.credits,
              resetAt: updates.currentPeriodEnd || existingSubscription.currentPeriodEnd,
            });
          }
        }

        // FIX: Fire payment-failed email when status transitions to past_due or unpaid
        if (
          (status === 'past_due' || status === 'unpaid') &&
          existingSubscription.status !== status
        ) {
          emailService.sendPaymentFailed(user.id, subscriptionId)
            .catch((err: unknown) => console.error('[Webhook] sendPaymentFailed error:', err));
        }
      }

      // Handle subscription.canceled or subscription.deleted
      else if (eventType === 'subscription.canceled' || eventType === 'subscription.deleted') {
        // Extract customer email from various possible locations
        const customerEmail = eventData.customer?.email 
          || eventData.customer_email
          || eventData.data?.object?.customer_email
          || eventData.data?.object?.customer?.email
          || eventData.data?.customer_email
          || eventData.billing_details?.email
          || eventData.billing?.email
          || eventData.email
          || (eventData.data && typeof eventData.data === 'object' && (eventData.data as any).email);

        if (!customerEmail) {
          console.error('[Webhook] No customer email found in subscription.canceled event');
          return res.json({ received: true });
        }

        // Extract subscription ID
        const subscriptionId = eventData.subscription_id 
          || eventData.id 
          || eventData.data?.object?.id;

        if (!subscriptionId) {
          console.error('[Webhook] No subscription_id found in subscription.canceled event');
          return res.json({ received: true });
        }

        // Get existing subscription
        const existingSubscription = await storage.getSubscriptionByDodoId(subscriptionId);
        if (existingSubscription) {
          console.log('[Webhook] subscription.canceled received', {
            subscriptionId,
            userId: existingSubscription.userId,
            customerEmail,
            previousStatus: existingSubscription.status,
            planCode: existingSubscription.planCode,
          });

          await storage.updateSubscription(existingSubscription.id, {
            status: 'canceled',
            cancelAt: new Date(),
            cancelReason: 'customer_cancelled',
          });
          console.log(`[Webhook] Subscription canceled: ${subscriptionId}`);

          // Find user to send cancellation email
          const canceledUser = await storage.getUser(existingSubscription.userId);
          if (canceledUser) {
            const accessUntil = existingSubscription.currentPeriodEnd
              ? new Date(existingSubscription.currentPeriodEnd).toLocaleDateString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric',
                })
              : 'the end of your billing period';
            emailService.sendSubscriptionCanceled(
              canceledUser.id,
              subscriptionId,
              existingSubscription.planCode,
              accessUntil
            ).catch((err: unknown) => console.error('[Webhook] sendSubscriptionCanceled error:', err));
          }
        } else {
          console.error(`[Webhook] Subscription not found for cancellation: ${subscriptionId}`);
        }
      }

      res.json({ received: true });

    } catch (error: any) {
      console.error('[Webhook] Dodo Payments webhook error:', error);
      console.error('[Webhook] Error stack:', error.stack);
      console.error('[Webhook] Error message:', error.message);
      res.status(500).json({ received: true, ...getClientErrorBody(error, 'Webhook handler failed') });
    }
  });

  // Feedback route
  app.post('/api/feedback', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      const schema = z.object({
        reply_event_id: z.coerce.number().int().positive('reply_event_id is required'),
        rating: z.enum(['up', 'down']),
        comment: z.string().optional(),
      });

      const { reply_event_id, rating, comment } = schema.parse(req.body);

      await storage.createFeedback({
        userId,
        replyEventId: String(reply_event_id),
        rating,
        comment,
      });

      res.json({ success: true });

    } catch (error) {
      console.error("Error creating feedback:", error);

      const handled = handleZodError(res, error);
      if (handled) return handled;

      res.status(500).json({ message: "Failed to create feedback" });
    }
  });

  // Initialize trial for new users
  app.post('/api/auth/initialize-trial', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      await usageService.initializeTrialForUser(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error initializing trial:", error);
      res.status(500).json({ message: "Failed to initialize trial" });
    }
  });

  // Reply history endpoints
  app.get('/api/reply-history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const limit = parseInt(req.query.limit as string) || ANALYTICS.DEFAULT_REPLY_HISTORY_LIMIT;
      
      const history = await storage.getReplyHistory(userId, limit);
      res.json({ history });
    } catch (error) {
      console.error("Error fetching reply history:", error);
      res.status(500).json({ message: "Failed to fetch reply history" });
    }
  });

  app.post('/api/reply-history/:id/mark-used', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const paramsSchema = z.object({
        id: z.string().uuid('Invalid reply history id.'),
      });

      const bodySchema = z.object({
        tweetUrl: z.string().optional(),
      });

      const { id } = paramsSchema.parse(req.params);
      const { tweetUrl } = bodySchema.parse(req.body ?? {});
      
      await storage.markReplyAsUsed(id, tweetUrl);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking reply as used:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      res.status(500).json({ message: "Failed to mark reply as used" });
    }
  });

  app.get('/api/reply-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const history = await storage.getReplyHistory(userId, ANALYTICS.TEMPLATE_LIMIT);
      
      // Extract successful replies as templates
      const templates = history
        .filter(entry => entry.wasUsed && entry.qualityScore && entry.qualityScore > QUALITY.TEMPLATE_SCORE)
        .map(entry => ({
          id: entry.id,
          template: entry.generatedReply,
          originalTweet: entry.originalTweet,
          qualityScore: entry.qualityScore,
          createdAt: entry.createdAt,
        }));
      
      res.json({ templates });
    } catch (error) {
      console.error("Error fetching reply templates:", error);
      res.status(500).json({ message: "Failed to fetch reply templates" });
    }
  });

  // Suggest improvements endpoint
  app.post('/api/suggest-improvements', isAuthenticated, generateReplyLimiter, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      // Get user to check whitelist status
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const schema = z.object({
        draft_reply: z.string().min(1).max(VALIDATION.MAX_DRAFT_LENGTH),
        original_tweet: z.string().min(1, "Original tweet is required"), // Required, not optional
      });

      const { draft_reply, original_tweet } = schema.parse(req.body);

      // Check usage quota before processing
      const isWhitelisted = whitelistService.isWhitelisted(user.email);
      if (!isWhitelisted) {
        const { canUse, reason } = await usageService.canUseReply(userId);
        if (!canUse) {
          const status = await usageService.getUsageStatus(userId);
          return res.status(402).json({
            error: reason,
            message: reason === 'payment_required' ? 'No active plan' : 'Quota exceeded',
            used: status?.used || 0,
            limit: status?.limit || 0,
            resetAt: status?.resetAt || new Date(),
            upgradeRequired: true,
            upgradeMessage: whitelistService.getUpgradeMessage(false, status?.used || 0, status?.limit || 0),
          });
        }
      }

      // Run guardrail check on all user-facing text (original tweet + draft)
      let guardrailResult: GuardrailResult | null = null;
      let guardrailViolation = false;
      try {
        const guardrailInput = `Original tweet: ${original_tweet}

User draft reply: ${draft_reply}`;
        guardrailResult = await runGuardrail(guardrailInput);
        console.log("[Guardrail] /api/suggest-improvements result:", {
          violation: guardrailResult.violation,
          category: guardrailResult.category,
        });
        guardrailViolation = guardrailResult?.violation === 1;
      } catch (error) {
        console.error("[Guardrail] Error running guardrail for /api/suggest-improvements:", error);
      }

      const guardrailClassificationStageSuggest: Array<{ stage: string; modelKey: string; promptTokens: number; completionTokens: number; totalTokens: number; cost: number; latencyMs: number }> =
        guardrailResult?.usage
          ? [
              {
                stage: "guardrail_classification",
                modelKey: guardrailResult.usage.modelKey,
                promptTokens: guardrailResult.usage.promptTokens,
                completionTokens: guardrailResult.usage.completionTokens,
                totalTokens: guardrailResult.usage.promptTokens + guardrailResult.usage.completionTokens,
                cost: aiRouter.estimateCost(guardrailResult.usage.modelKey, guardrailResult.usage.promptTokens, guardrailResult.usage.completionTokens),
                latencyMs: guardrailResult.usage.latencyMs,
              },
            ]
          : [];

      // If guardrail fires, generate a friendly refusal reply instead of improving the draft
      if (guardrailViolation && guardrailResult) {
        const guardrailReply = await generateGuardrailFriendlyReply(
          `Original tweet: ${original_tweet}\nUser draft reply: ${draft_reply}`,
          guardrailResult.rationale,
        );

        const { qualityChecker } = await import('./services/quality-checker.js');

        // Consume credits after successful friendly reply
        const updatedCounter = await usageService.consumeReply(userId, 'improve');

        // Analyze quality for analytics (same as normal flow)
        const qualityResult = qualityChecker.checkQuality(draft_reply, original_tweet);
        const improvedQualityResult = qualityChecker.checkQuality(guardrailReply.reply, original_tweet);

        const historyEntry = await storage.createReplyHistory({
          id: crypto.randomUUID(),
          userId,
          originalTweet: original_tweet,
          generatedReply: guardrailReply.reply,
          modelKey: guardrailReply.modelKey,
          promptKey: 'guardrail_violation',
          qualityScore: improvedQualityResult.totalScore,
          replyMode: 'improve',
          performance: {
            safetyOutcome: 'violation_friendly_reply',
            guardrailCategory: guardrailResult.category,
            guardrailRationale: guardrailResult.rationale,
            latencyMs: guardrailReply.latencyMs,
          },
        });

        const replyTokensIn = guardrailReply.tokensIn ?? 0;
        const replyTokensOut = guardrailReply.tokensOut ?? 0;
        const replyCost = aiRouter.estimateCost(guardrailReply.modelKey, replyTokensIn, replyTokensOut);
        const stageBreakdown = [
          ...guardrailClassificationStageSuggest,
          {
            stage: "guardrail_violation",
            modelKey: guardrailReply.modelKey,
            promptTokens: replyTokensIn,
            completionTokens: replyTokensOut,
            totalTokens: replyTokensIn + replyTokensOut,
            cost: replyCost,
            latencyMs: guardrailReply.latencyMs,
          },
        ];

        const totalPromptTokens = stageBreakdown.reduce((s, e) => s + e.promptTokens, 0);
        const totalCompletionTokens = stageBreakdown.reduce((s, e) => s + e.completionTokens, 0);
        const totalTokens = stageBreakdown.reduce((s, e) => s + e.totalTokens, 0);
        const totalCost = stageBreakdown.reduce((s, e) => s + e.cost, 0);

        await storage.createReplyTokens({
          id: crypto.randomUUID(),
          userId,
          replyHistoryId: historyEntry.id,
          stageBreakdown,
          totalPromptTokens,
          totalCompletionTokens,
          totalTokens,
          totalCost,
        });

        return res.json({
          original: draft_reply,
          improved: guardrailReply.reply,
          qualityScore: qualityResult.totalScore,
          improvedQualityScore: improvedQualityResult.totalScore,
          qualityParameters: qualityResult.parameters,
          suggestions: qualityResult.suggestions,
          analysis: {
            wordCount: draft_reply.split(/\s+/).length,
            length: draft_reply.length,
            hasEmojis: /[😀😁😂😃😄😅😆😇😈😉😊😋😌😍😎😏😐😑😒😓😔😕😖😗😘😙😚😛😜😝😞😟😠😡😢😣😤😥😦😧😨😩😪😫😬😭😮😯😰😱😲😳😴😵😶😷🙁🙂🙃🙄🙅🙆🙇🙈🙉🙊🙋🙌🙍🙎🙏]/.test(draft_reply),
          },
          usage: {
            used: updatedCounter.creditsUsed ?? (updatedCounter.repliesUsed * 2),
            limit: updatedCounter.limit,
            resetAt: updatedCounter.resetAt,
          },
        });
      }

      // Use AI to improve the draft
      // Fix: Removed redundant dynamic import - aiRouter is already imported at top
      const { qualityChecker } = await import('./services/quality-checker.js');
      
      let improvedReply = '';
      let improvementResponse: { reply: string; modelKey: string; tokensIn?: number; tokensOut?: number; latencyMs: number } | null = null;
      
      try {
        // Use the new improveDraft method
        improvementResponse = await aiRouter.improveDraft(
          original_tweet,
          draft_reply
        );
        improvedReply = improvementResponse.reply;
      } catch (error) {
        console.error('Error generating improvement:', error);
        return res.status(500).json(getClientErrorBody(error, "Failed to generate improvement"));
      }

      // Consume credits after successful improvement
      const updatedCounter = await usageService.consumeReply(userId, 'improve');
      
      // Analyze the draft for quality metrics with detailed breakdown
      const qualityResult = qualityChecker.checkQuality(draft_reply, original_tweet);
      const improvedQualityResult = qualityChecker.checkQuality(improvedReply, original_tweet);

      // Create reply_history (mode 'improve') and reply_tokens for this improve-draft reply
      if (improvementResponse) {
        const historyEntry = await storage.createReplyHistory({
          id: crypto.randomUUID(),
          userId,
          originalTweet: original_tweet,
          generatedReply: improvedReply,
          modelKey: improvementResponse.modelKey,
          promptKey: 'improve',
          qualityScore: improvedQualityResult.totalScore,
          replyMode: 'improve',
          performance: { latencyMs: improvementResponse.latencyMs },
        });
        const tokensIn = improvementResponse.tokensIn ?? 0;
        const tokensOut = improvementResponse.tokensOut ?? 0;
        const improveCost = aiRouter.estimateCost(improvementResponse.modelKey, tokensIn, tokensOut);
        const stageBreakdown = [
          {
            stage: 'improve_draft',
            modelKey: improvementResponse.modelKey,
            promptTokens: tokensIn,
            completionTokens: tokensOut,
            totalTokens: tokensIn + tokensOut,
            cost: improveCost,
            latencyMs: improvementResponse.latencyMs,
          },
        ];
        await storage.createReplyTokens({
          id: crypto.randomUUID(),
          userId,
          replyHistoryId: historyEntry.id,
          stageBreakdown,
          totalPromptTokens: tokensIn,
          totalCompletionTokens: tokensOut,
          totalTokens: tokensIn + tokensOut,
          totalCost: improveCost,
        });
      }

      res.json({
        original: draft_reply,
        improved: improvedReply,
        qualityScore: qualityResult.totalScore,
        improvedQualityScore: improvedQualityResult.totalScore,
        qualityParameters: qualityResult.parameters,
        suggestions: qualityResult.suggestions,
        analysis: {
          wordCount: draft_reply.split(/\s+/).length,
          length: draft_reply.length,
          hasEmojis: /[😀😁😂😃😄😅😆😇😈😉😊😋😌😍😎😏😐😑😒😓😔😕😖😗😘😙😚😛😜😝😞😟😠😡😢😣😤😥😦😧😨😩😪😫😬😭😮😯😰😱😲😳😴😵😶😷🙁🙂🙃🙄🙅🙆🙇🙈🙉🙊🙋🙌🙍🙎🙏]/.test(draft_reply),
        },
        usage: {
          // FIX: Return credits instead of repliesUsed to match credits-based system
          used: updatedCounter.creditsUsed ?? (updatedCounter.repliesUsed * 2),
          limit: updatedCounter.limit,
          resetAt: updatedCounter.resetAt,
        }
      });
    } catch (error) {
      console.error("Error suggesting improvements:", error);
      
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      
      res.status(500).json({ message: "Failed to suggest improvements" });
    }
  });

  // Simple analytics endpoint (user-focused)
  app.get('/api/analytics/simple', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const days = parseInt(req.query.days as string) || 30;
      
      // Validate days parameter
      if (days < 1 || days > 365) {
        return res.status(400).json({ message: "Days must be between 1 and 365" });
      }
      
      const { feedbackAnalytics } = await import('./services/feedback-analytics.js');
      const analytics = await feedbackAnalytics.getSimpleAnalytics(userId, days);
      
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching simple analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Feedback analytics endpoint
  app.get('/api/analytics/feedback-stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const days = parseInt(req.query.days as string) || 30;
      
      // Validate days parameter
      if (days < 1 || days > 365) {
        return res.status(400).json({ message: "Days must be between 1 and 365" });
      }
      
      const { feedbackAnalytics } = await import('./services/feedback-analytics.js');
      const stats = await feedbackAnalytics.getFeedbackStats(userId, days);
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching feedback stats:", error);
      res.status(500).json({ message: "Failed to fetch feedback stats" });
    }
  });

  // Quality metrics endpoint
  app.get('/api/quality/metrics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const days = parseInt(req.query.days as string) || 30;
      
      // Validate days parameter
      if (days < 1 || days > 365) {
        return res.status(400).json({ message: "Days must be between 1 and 365" });
      }
      
      const { feedbackAnalytics } = await import('./services/feedback-analytics.js');
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const metrics = await feedbackAnalytics.getQualityMetrics(userId, startDate);
      const recommendations = await feedbackAnalytics.getRecommendations(userId);
      
      res.json({
        metrics,
        recommendations
      });
    } catch (error) {
      console.error("Error fetching quality metrics:", error);
      res.status(500).json({ message: "Failed to fetch quality metrics" });
    }
  });

  // ---------------------------------------------------------------------------
  // FIX (fix7): Reusable cron auth middleware — extracted from duplicated inline blocks.
  // CRON_SECRET is REQUIRED in production (returns 503 when unset).
  // In development the check is advisory only (logs a warning and continues).
  // ---------------------------------------------------------------------------
  const requireCronAuth = (req: any, res: any, next: any) => {
    const cronSecret = process.env.CRON_SECRET;
    const isProd = process.env.NODE_ENV === 'production';

    if (!cronSecret) {
      if (isProd) {
        return res.status(503).json({ message: 'Cron not configured: CRON_SECRET missing' });
      }
      console.warn('[cron] CRON_SECRET not set — running unauthenticated (dev only)');
      return next();
    }

    const authHeader = req.headers['authorization'] ?? '';
    const provided = String(authHeader).replace(/^Bearer\s+/i, '').trim();
    if (provided !== cronSecret) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    next();
  };

  // ---------------------------------------------------------------------------
  // Cron: email nudges (Vercel Cron — Hobby: once daily; see vercel.json schedule)
  // ---------------------------------------------------------------------------
  app.get('/api/cron/email-nudges', requireCronAuth, async (req: any, res) => {
    try {

      const { supabase } = await import('./supabase.js');

      // FIX: Activation nudge — query users registered > 30 min ago who have ZERO reply history,
      // not last_login_at which conflates "logged in but no replies" with "never came back".
      const nudgeThresholdMs = 30 * 60 * 1000; // 30 min
      const winbackThresholdMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      const conversionStage2DelayMs = 24 * 60 * 60 * 1000; // 24 h after limit hit
      const conversionStage3DelayMs = 48 * 60 * 60 * 1000; // 48 h after limit hit
      const now = Date.now();
      const dayOfWeek = new Date().getDay(); // 0=Sun 1=Mon…

      const { data: allUsers } = await supabase
        .from('users')
        .select('id, created_at, last_login_at');

      let nudgeSent = 0;
      let winbackSent = 0;
      let weeklySent = 0;
      let convStage2Sent = 0;
      let convStage3Sent = 0;

      for (const u of allUsers ?? []) {
        const createdAt = new Date(u.created_at).getTime();
        const lastLogin = u.last_login_at ? new Date(u.last_login_at).getTime() : createdAt;
        const ageMs = now - createdAt;
        const inactiveMs = now - lastLogin;

        // FIX: Activation nudge — only send if account is > 30 min old AND user has 0 reply events.
        // Using reply_history count (the user-facing history) as the "first reply" signal.
        if (ageMs > nudgeThresholdMs) {
          const { count: replyCount } = await supabase
            .from('reply_history')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', u.id);
          if ((replyCount ?? 0) === 0) {
            emailService.sendActivationNudge(u.id).catch(() => {});
            nudgeSent++;
          }
        }

        // Win-back: last login > 7 days ago (login-based is correct here — user went cold)
        if (inactiveMs > winbackThresholdMs) {
          emailService.sendWinBack(u.id).catch(() => {});
          winbackSent++;
        }

        // Weekly value: every Monday
        if (dayOfWeek === 1) {
          emailService.sendWeeklyValue(u.id).catch(() => {});
          weeklySent++;
        }
      }

      // Conversion stages 2 & 3 — delayed sends after a user hits their credit limit.
      // We use email_send_log to find users who received stage-1 24h / 48h ago
      // and have not yet received stage-2 / stage-3 for that period.
      const stage1Cutoff24h = new Date(now - conversionStage2DelayMs).toISOString();
      const stage1Cutoff48h = new Date(now - conversionStage3DelayMs).toISOString();
      // FIX (fix5): Cap lookback at 7 days to prevent query growing unbounded as the user base scales.
      // After 7 days with no conversion, stage-2/3 are no longer actionable.
      const stage1LookbackFloor = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Stage 2: users who got stage-1 in the window [now-7d, now-24h]
      const { data: stage1Rows24h } = await supabase
        .from('email_send_log')
        .select('user_id, idempotency_key, created_at')
        .like('template_key', 'conversion_stage_1')
        .eq('status', 'sent')
        .lte('created_at', stage1Cutoff24h)
        .gte('created_at', stage1LookbackFloor); // FIX (fix5): lower bound

      for (const row of stage1Rows24h ?? []) {
        // Idempotency key format: conversion.up1:{userId}:{periodStartIso}
        // split(':') → [0]='conversion.up1', [1]=userId, [2]=periodStartIso
        const parts = (row.idempotency_key as string).split(':');
        // FIX (fix1): was parts[3] which is always undefined — correct index is parts[2]
        const periodStartIso = parts[2] ?? new Date().toISOString().slice(0, 10);
        const counter = { periodStart: new Date(periodStartIso) };
        emailService.sendConversionStage(row.user_id, 2, counter).catch(() => {});
        convStage2Sent++;
      }

      // Stage 3: users who got stage-1 in the window [now-7d, now-48h]
      const { data: stage1Rows48h } = await supabase
        .from('email_send_log')
        .select('user_id, idempotency_key, created_at')
        .like('template_key', 'conversion_stage_1')
        .eq('status', 'sent')
        .lte('created_at', stage1Cutoff48h)
        .gte('created_at', stage1LookbackFloor); // FIX (fix5): lower bound

      for (const row of stage1Rows48h ?? []) {
        const parts = (row.idempotency_key as string).split(':');
        // FIX (fix1): was parts[3] which is always undefined — correct index is parts[2]
        const periodStartIso = parts[2] ?? new Date().toISOString().slice(0, 10);
        const counter = { periodStart: new Date(periodStartIso) };
        emailService.sendConversionStage(row.user_id, 3, counter).catch(() => {});
        convStage3Sent++;
      }

      res.json({ ok: true, nudgeSent, winbackSent, weeklySent, convStage2Sent, convStage3Sent });
    } catch (error) {
      console.error('[cron/email-nudges] error:', error);
      res.status(500).json({ message: 'Cron job failed' });
    }
  });

  // ---------------------------------------------------------------------------
  // Resend webhook — delivery tracking + unsubscribe handling
  // Dashboard: subscribe to email.delivered, email.bounced, email.complained,
  // email.failed, email.delivery_delayed (optional), contact.updated — not contact.unsubscribed (removed by Resend).
  // Payload shape: https://resend.com/docs/webhooks/emails/delivered
  // ---------------------------------------------------------------------------
  app.post('/api/webhooks/resend', express.raw({ type: 'application/json' }), async (req: any, res) => {
    try {
      const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
      let payload: any;

      if (webhookSecret) {
        // Verify Resend signature (Resend uses svix under the hood)
        try {
          const { Webhook } = await import('svix');
          const wh = new Webhook(webhookSecret);
          payload = wh.verify(req.body, {
            'svix-id': req.headers['svix-id'] as string,
            'svix-timestamp': req.headers['svix-timestamp'] as string,
            'svix-signature': req.headers['svix-signature'] as string,
          });
        } catch (err) {
          console.error('[resend-webhook] signature verification failed:', err);
          return res.status(400).json({ message: 'Invalid signature' });
        }
      } else {
        payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      }

      const { type, data } = payload ?? {};

      async function applyEmailSendLogStatus(status: string) {
        const emailId = typeof data?.email_id === 'string' ? data.email_id : undefined;
        if (emailId) {
          await storage.updateEmailSendLogByResendMessageId(emailId, { status });
          return;
        }
        const idem = getIdempotencyKeyFromResendWebhookData(data ?? {});
        if (idem) {
          await storage.updateEmailSendLog(idem, { status });
        }
      }

      switch (type) {
        case 'email.delivered':
          await applyEmailSendLogStatus('delivered');
          break;

        case 'email.bounced':
          await applyEmailSendLogStatus('bounced');
          break;

        case 'email.complained':
          await applyEmailSendLogStatus('complained');
          {
            const recipient = getRecipientEmailFromResendWebhookData(data ?? {});
            if (recipient) {
              const complainedUser = await storage.getUserByEmail(recipient);
              if (complainedUser) {
                await storage.upsertEmailPreferences({
                  userId: complainedUser.id,
                  marketing: false,
                  productTips: false,
                });
              }
            }
          }
          break;

        case 'email.failed':
          await applyEmailSendLogStatus('failed');
          break;

        case 'email.delivery_delayed':
          await applyEmailSendLogStatus('delivery_delayed');
          break;

        case 'email.sent':
          // We already set status sent after successful API response; webhook is redundant.
          break;

        // Resend dashboard lists contact.updated (not contact.unsubscribed). Fires on any contact
        // change; only sync when they globally unsubscribed.
        case 'contact.updated':
          if (data?.email && data?.unsubscribed === true) {
            const unsubUser = await storage.getUserByEmail(data.email);
            if (unsubUser) {
              await storage.upsertEmailPreferences({ userId: unsubUser.id, marketing: false });
            }
            await emailService.unsubscribeContactInResend(data.email);
          }
          break;

        // Legacy event name if an old webhook config still sends it
        case 'contact.unsubscribed':
          if (data?.email) {
            const unsubUser = await storage.getUserByEmail(data.email);
            if (unsubUser) {
              await storage.upsertEmailPreferences({ userId: unsubUser.id, marketing: false });
            }
            await emailService.unsubscribeContactInResend(data.email);
          }
          break;

        default:
          console.log('[resend-webhook] unhandled event type:', type);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('[resend-webhook] error:', error);
      res.status(500).json({ message: 'Webhook handler failed' });
    }
  });

  // ---------------------------------------------------------------------------
  // Admin campaign routes (protected by ADMIN_SECRET bearer token)
  // ---------------------------------------------------------------------------
  const adminAuth = (req: any, res: any, next: any) => {
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) return res.status(503).json({ message: 'Admin API not configured' });
    const provided = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '').trim();
    if (provided !== adminSecret) return res.status(401).json({ message: 'Unauthorized' });
    next();
  };

  app.get('/api/admin/campaigns', adminAuth, async (_req, res) => {
    try {
      const campaigns = await storage.listEmailCampaigns();
      res.json(campaigns);
    } catch (error) {
      console.error('GET /api/admin/campaigns error:', error);
      res.status(500).json({ message: 'Failed to list campaigns' });
    }
  });

  app.post('/api/admin/campaigns', adminAuth, async (req: any, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        subject: z.string().min(1),
        previewText: z.string().optional(),
        templateKey: z.enum(['feature_update', 'promo_discount', 'newsletter']),
        contentJson: z.record(z.unknown()),
        segment: z.enum(['all', 'paid', 'trial', 'inactive_7d']).optional(),
        scheduledAt: z.string().datetime().optional(),
        createdBy: z.string().optional(),
      });
      const body = schema.parse(req.body);
      const campaign = await storage.createEmailCampaign({
        ...body,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      });
      res.status(201).json(campaign);
    } catch (error) {
      if (error instanceof ZodError) return res.status(400).json(toValidationErrorResponse(error));
      console.error('POST /api/admin/campaigns error:', error);
      res.status(500).json({ message: 'Failed to create campaign' });
    }
  });

  app.get('/api/admin/campaigns/:id', adminAuth, async (req: any, res) => {
    try {
      const campaign = await storage.getEmailCampaign(req.params.id);
      if (!campaign) return res.status(404).json({ message: 'Campaign not found' });

      // Also render a preview that matches what recipients will see (including the
      // FIX (fix6): pass settingsUrl so the "Manage preferences" footer link is rendered
      const { renderCampaignEmail } = await import('./emailTemplates.js');
      const settingsUrl = `${(process.env.APP_URL || process.env.DOMAIN || '').replace(/\/$/, '')}/settings`;
      const preview = await renderCampaignEmail(
        campaign.templateKey as 'feature_update' | 'promo_discount' | 'newsletter',
        campaign.subject,
        campaign.previewText ?? '',
        campaign.contentJson,
        settingsUrl
      );
      res.json({ campaign, preview });
    } catch (error) {
      console.error('GET /api/admin/campaigns/:id error:', error);
      res.status(500).json({ message: 'Failed to get campaign' });
    }
  });

  app.patch('/api/admin/campaigns/:id', adminAuth, async (req: any, res) => {
    try {
      const schema = z.object({
        name: z.string().optional(),
        subject: z.string().optional(),
        previewText: z.string().optional(),
        contentJson: z.record(z.unknown()).optional(),
        segment: z.enum(['all', 'paid', 'trial', 'inactive_7d']).optional(),
        scheduledAt: z.string().datetime().optional(),
      });
      const body = schema.parse(req.body);
      const updated = await storage.updateEmailCampaign(req.params.id, {
        ...body,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      });
      res.json(updated);
    } catch (error) {
      if (error instanceof ZodError) return res.status(400).json(toValidationErrorResponse(error));
      console.error('PATCH /api/admin/campaigns/:id error:', error);
      res.status(500).json({ message: 'Failed to update campaign' });
    }
  });

  app.post('/api/admin/campaigns/:id/send', adminAuth, async (req: any, res) => {
    try {
      const result = await emailService.sendCampaignBatch(req.params.id);
      res.json(result);
    } catch (error: any) {
      console.error('POST /api/admin/campaigns/:id/send error:', error);
      res.status(500).json({ message: error.message || 'Failed to send campaign' });
    }
  });

  app.delete('/api/admin/campaigns/:id', adminAuth, async (req: any, res) => {
    try {
      const campaign = await storage.getEmailCampaign(req.params.id);
      if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
      if (campaign.status !== 'draft') {
        return res.status(400).json({ message: 'Only draft campaigns can be deleted' });
      }
      await storage.deleteEmailCampaign(req.params.id);
      res.json({ deleted: true });
    } catch (error) {
      console.error('DELETE /api/admin/campaigns/:id error:', error);
      res.status(500).json({ message: 'Failed to delete campaign' });
    }
  });

  // Scheduled campaign dispatch — Vercel Cron (Hobby: once daily; see vercel.json)
  app.get('/api/cron/dispatch-campaigns', requireCronAuth, async (_req, res) => {
    try {
      const campaigns = await storage.listEmailCampaigns();
      const now = new Date();
      let dispatched = 0;

      for (const campaign of campaigns) {
        if (
          campaign.status === 'scheduled' &&
          campaign.scheduledAt &&
          campaign.scheduledAt <= now
        ) {
          emailService.sendCampaignBatch(campaign.id).catch((err: unknown) =>
            console.error('[cron/dispatch-campaigns] error for campaign', campaign.id, err)
          );
          dispatched++;
        }
      }

      res.json({ ok: true, dispatched });
    } catch (error) {
      console.error('[cron/dispatch-campaigns] error:', error);
      res.status(500).json({ message: 'Dispatch cron failed' });
    }
  });

  // For Vercel serverless, just return the app
  // No need to create an HTTP server
  return app;
}
