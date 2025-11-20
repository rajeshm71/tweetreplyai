import type { Express } from "express";
import { storage } from "./storage.js";
import { setupLocalAuth } from "./localAuth.js";
import { setupGoogleAuth } from "./googleAuth.js";
import { aiRouter } from "./services/ai-router.js";
import { getAvailablePrompts } from "./services/prompts.js";
import { stripeService, PLANS } from "./services/stripe.js";
import { usageService } from "./services/usage.js";
import { whitelistService } from "./services/whitelistService.js";
import { z, ZodError } from "zod";
import passport from "passport";
import session from "express-session";
import jwt from "jsonwebtoken";
// Use crypto.randomUUID() instead of uuid package
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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
    const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'dev-secret');
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
  
  let sessionConfig: any = {
      secret: process.env.SESSION_SECRET || 'dev-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 1 week
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
        authProviders: user.authProviders || [],
        isWhitelisted: whitelistService.isWhitelisted(user.email),
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Local authentication routes
  app.post('/api/auth/register', (req, res, next) => {
    passport.authenticate('local-register', (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ message: 'Registration failed', error: err.message });
      }
      if (!user) {
        return res.status(400).json({ message: info?.message || 'Registration failed' });
      }
      req.logIn(user, (err) => {
        if (err) {
          return res.status(500).json({ message: 'Login after registration failed' });
        }
        // Generate JWT token for serverless environments
        const token = jwt.sign(
          { id: user.id, email: user.email },
          process.env.SESSION_SECRET || 'dev-secret',
          { expiresIn: '7d' }
        );
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict' });
        return res.json({ user, token, message: 'Registration successful' });
      });
    })(req, res, next);
  });

  app.post('/api/auth/login', (req, res, next) => {
    passport.authenticate('local-login', (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ message: 'Login failed', error: err.message });
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
          process.env.SESSION_SECRET || 'dev-secret',
          { expiresIn: '7d' }
        );
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict' });
        return res.json({ user, token, message: 'Login successful' });
      });
    })(req, res, next);
  });

  // Google OAuth routes
  app.get('/api/auth/google', (req, res, next) => {
    console.log('Request URL:', req.url);
    console.log('Request headers:', req.headers);
    console.log('Current callback URL from env:', process.env.GOOGLE_CALLBACK_URL);
    
    passport.authenticate('google', {
    scope: ['profile', 'email']
    })(req, res, next);
  });

  app.get('/api/auth/google/callback',
    (req, res, next) => {
      console.log('Callback URL received:', req.url);
      
      passport.authenticate('google', { 
        failureRedirect: '/login',
        failureMessage: true 
      })(req, res, next);
    },
    (req, res) => {
      console.log('Google auth successful, user:', req.user);
      // Generate JWT token for serverless environments
      const user = req.user as any;
      const token = jwt.sign(
        { id: user.id, email: user.email },
        process.env.SESSION_SECRET || 'dev-secret',
        { expiresIn: '7d' }
      );
      res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict' });
      res.redirect('/');
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
      console.log('Logout successful');
      res.clearCookie('token'); // Clear JWT token
      res.json({ success: true });
    });
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
            const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'dev-secret') as any;
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
        process.env.SESSION_SECRET || 'dev-secret',
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

      res.json(status);
    } catch (error) {
      console.error("[API-DEBUG] /api/usage - ERROR:", error);
      res.status(500).json({ message: "Failed to fetch usage" });
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

  // Reply generation route
  app.post('/api/generate-reply', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      // Validate request body
      const schema = z.object({
        tweet_text: z.string().min(1).max(2000),
        tweet_id: z.string().optional(),
        model_key: z.string().optional(),
        prompt_variation: z.string().optional(),
        reply_mode: z.enum(['single-sentence', 'base', 'enhanced']).optional().default('base'),
        author_info: z.object({
          username: z.string().optional(),
          verified: z.boolean().optional(),
          follower_count: z.number().optional(),
        }).optional(),
        thread_context: z.object({
          isReply: z.boolean(),
          // FIX: Apply max() before nullable() - Zod requires this order
          originalTweet: z.string().max(2000).nullable(),
          originalTweetAuthor: z.string().max(50).nullable(),
          threadChain: z.array(z.object({
            text: z.string().min(1).max(2000), // FIX: Add min/max length validation
            author: z.string().max(50), // FIX: Add max length validation
            isOriginal: z.boolean(),
            isCurrent: z.boolean(),
          })).max(20), // FIX: Limit array size to prevent abuse
          currentTweetIndex: z.number().int().min(0), // FIX: Ensure non-negative integer
          threadLength: z.number().int().min(0).max(20), // FIX: Ensure valid range
        }).optional(),
        conversation_context: z.array(z.string()).optional(), // Backward compatibility
        tweet_metadata: z.object({
          has_media: z.boolean().optional(),
          has_poll: z.boolean().optional(),
          timestamp: z.string().optional(),
        }).optional(),
      });

      const { 
        tweet_text, 
        tweet_id, 
        model_key, 
        prompt_variation,
        reply_mode,
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
      
      // Consume a reply from quota (applies to ALL users including whitelisted)
      console.log('[API-DEBUG] /api/generate-reply - About to call consumeReply for userId:', userId);
      const updatedCounter = await usageService.consumeReply(userId);
      console.log('[API-DEBUG] /api/generate-reply - After consumeReply, updatedCounter:', {
        repliesUsed: updatedCounter.repliesUsed,
        limit: updatedCounter.limit
      });

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
        tweetAnalysis, // Pass enriched analysis from agents
        authorInfo: author_info,
        threadContext: normalizedThreadContext, // NEW: Pass structured thread context
        conversationContext: conversationContextForTweetAnalyzer, // For backward compatibility
        tweetMetadata: tweet_metadata,
      });

      // Quality check with detailed parameters (new 10-parameter system)
      const { qualityChecker } = await import('./services/quality-checker.js');
      const qualityResult = qualityChecker.checkQuality(replyResponse.reply, tweet_text);
      
      if (!qualityResult.passed) {
        console.log(`⚠️ [Quality] Reply failed quality check (score: ${qualityResult.totalScore}/100)`);
        const lowScores = qualityResult.parameters.filter(p => p.score <= 4);
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
            tweetAnalysis, // Include enriched analysis in retry
            authorInfo: author_info,
            threadContext: normalizedThreadContext, // NEW: Pass structured thread context
            conversationContext: conversationContextForTweetAnalyzer, // For backward compatibility
            tweetMetadata: tweet_metadata,
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
        performance: {
          qualityParameters: finalQualityResult.parameters,
          latencyMs: replyResponse.latencyMs,
        },
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
        used: updatedCounter.repliesUsed,
        limit: updatedCounter.limit,
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

      // Return detailed error for debugging
      res.status(500).json({ 
        message: "Failed to generate reply",
        error: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      });
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

      // Use environment variable for domain or default to localhost for development
      const domain = process.env.DOMAIN || 'localhost:5000';
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
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      
      if (!user || !user.stripeCustomerId) {
        return res.status(400).json({ message: "No billing account found" });
      }

      // Use environment variable for domain or default to localhost for development
      const domain = process.env.DOMAIN || 'localhost:5000';
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
                id: crypto.randomUUID(),
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
                id: crypto.randomUUID(),
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
      const userId = getUserId(req);
      
      const schema = z.object({
        reply_event_id: z.number().optional(),
        rating: z.enum(['up', 'down']),
        comment: z.string().optional(),
      });

      const { reply_event_id, rating, comment } = schema.parse(req.body);

      await storage.createFeedback({
        id: crypto.randomUUID(),
        replyEventId: String(reply_event_id),
        rating,
        comment,
      });

      res.json({ success: true });

    } catch (error) {
      console.error("Error creating feedback:", error);

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
      const limit = parseInt(req.query.limit as string) || 50;
      
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
      const { id } = req.params;
      const { tweetUrl } = req.body;
      
      await storage.markReplyAsUsed(id, tweetUrl);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking reply as used:", error);
      res.status(500).json({ message: "Failed to mark reply as used" });
    }
  });

  app.get('/api/reply-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const history = await storage.getReplyHistory(userId, 20);
      
      // Extract successful replies as templates
      const templates = history
        .filter(entry => entry.wasUsed && entry.qualityScore && entry.qualityScore > 70)
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
  app.post('/api/suggest-improvements', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      // Get user to check whitelist status
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const schema = z.object({
        draft_reply: z.string().min(1).max(500),
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

      // Use AI to improve the draft
      // Fix: Removed redundant dynamic import - aiRouter is already imported at top
      const { qualityChecker } = await import('./services/quality-checker.js');
      
      let improvedReply = '';
      let aiError = null;
      
      try {
        // Use the new improveDraft method
        const improvementResponse = await aiRouter.improveDraft(
          original_tweet,
          draft_reply,
          'gpt-4o-mini'
        );
        improvedReply = improvementResponse.reply;
      } catch (error) {
        console.error('Error generating improvement:', error);
        aiError = error instanceof Error ? error.message : 'Unknown error';
        // Don't consume quota if AI generation fails
        return res.status(500).json({
          message: "Failed to generate improvement",
          error: aiError,
        });
      }

      // Consume usage quota after successful improvement
      let updatedCounter;
      if (!isWhitelisted) {
        updatedCounter = await usageService.consumeReply(userId);
      } else {
        // Whitelisted users don't consume quota
        const status = await usageService.getUsageStatus(userId);
        updatedCounter = {
          repliesUsed: status?.used || 0,
          limit: status?.limit || 0,
          resetAt: status?.resetAt || new Date(),
        };
      }
      
      // Analyze the draft for quality metrics with detailed breakdown
      const qualityResult = qualityChecker.checkQuality(draft_reply, original_tweet);
      const improvedQualityResult = qualityChecker.checkQuality(improvedReply, original_tweet);

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
          used: updatedCounter.repliesUsed,
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

  // For Vercel serverless, just return the app
  // No need to create an HTTP server
  return app;
}
