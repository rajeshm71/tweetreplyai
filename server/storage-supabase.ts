import { supabase } from './supabase.js';
import type {
  User,
  UpsertUser,
  Subscription,
  InsertSubscription,
  UsageCounter,
  InsertUsageCounter,
  ReplyEvent,
  InsertReplyEvent,
  Feedback,
  InsertFeedback,
  ReplyHistory,
  InsertReplyHistory,
  UserPreferences,
  InsertUserPreferences,
} from "../shared/types.js";
import type { IStorage } from "./storage.js";

export class SupabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    console.log('=== SUPABASE: getUser called (line 23) ===');
    console.log('User ID:', id);
    
    const { data, error } = await supabase
      .from('users')
      .select('id, email, password_hash, google_sub, auth_providers, stripe_customer_id, created_at, updated_at')
      .eq('id', id)
      .single();
    
    console.log('Supabase query result - data:', data);
    console.log('Supabase query result - error:', error);
    
    if (error) {
      console.error('Supabase getUser error (line 31):', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      return undefined;
    }
    
    if (!data) {
      console.log('Supabase query returned no data - user not found');
      return undefined;
    }
    
    // Map database fields to our User interface
    // Note: Database column is still stripe_customer_id, will be migrated to dodo_customer_id
    const user = {
      id: data.id,
      email: data.email,
      password: data.password_hash,
      googleSub: data.google_sub,
      dodoCustomerId: data.stripe_customer_id, // Map from old column name
      authProviders: data.auth_providers || [],
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as User;
    
    console.log('Mapped user object:', user);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    console.log('=== SUPABASE: getUserByEmail called (line 49) ===');
    const { data, error } = await supabase
      .from('users')
      .select('id, email, password_hash, google_sub, auth_providers, stripe_customer_id, created_at, updated_at')
      .eq('email', email)
      .single();
    
    if (error) {
      if (error.code !== 'PGRST116') { // Not found error
        console.error('Supabase getUserByEmail error (line 58):', error);
      }
      return undefined;
    }
    
    // Map database fields to our User interface
    return {
      id: data.id,
      email: data.email,
      password: data.password_hash,
      googleSub: data.google_sub,
      dodoCustomerId: data.stripe_customer_id, // Map from old column name
      authProviders: data.auth_providers || [],
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as User;
  }

  async getUserByGoogleSub(googleSub: string): Promise<User | undefined> {
    console.log('=== SUPABASE: getUserByGoogleSub called (line 77) ===');
    const { data, error } = await supabase
      .from('users')
      .select('id, email, password_hash, google_sub, auth_providers, stripe_customer_id, created_at, updated_at')
      .eq('google_sub', googleSub)
      .single();
    
    if (error) {
      if (error.code !== 'PGRST116') { // Not found error
        console.error('Supabase getUserByGoogleSub error (line 86):', error);
      }
      return undefined;
    }
    
    // Map database fields to our User interface
    return {
      id: data.id,
      email: data.email,
      password: data.password_hash,
      googleSub: data.google_sub,
      dodoCustomerId: data.stripe_customer_id, // Map from old column name
      authProviders: data.auth_providers || [],
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as User;
  }


  async upsertUser(userData: UpsertUser): Promise<User> {
    console.log('=== SUPABASE: upsertUser called (line 132) ===');
    
    // Map our User interface fields to database fields
    const dbData = {
      id: userData.id,
      email: userData.email,
      password_hash: userData.password,
      google_sub: userData.googleSub,
      stripe_customer_id: userData.dodoCustomerId, // Map to old column name for now
      auth_providers: userData.authProviders || [],
      created_at: userData.createdAt || new Date(),
      updated_at: userData.updatedAt || new Date()
    };
    
    const { data, error } = await supabase
      .from('users')
      .upsert(dbData, { onConflict: 'id' })
      .select('id, email, password_hash, google_sub, auth_providers, stripe_customer_id, created_at, updated_at')
      .single();
    
    if (error) {
      console.error('Supabase upsertUser error (line 153):', error);
      throw error;
    }
    
    // Map database fields back to our User interface
    return {
      id: data.id,
      email: data.email,
      password: data.password_hash,
      googleSub: data.google_sub,
      dodoCustomerId: data.stripe_customer_id, // Map from old column name
      authProviders: data.auth_providers || [],
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as User;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    // Map our User interface fields to database fields
    const dbUpdates: any = {
      updated_at: new Date()
    };
    
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.password !== undefined) dbUpdates.password_hash = updates.password;
    if (updates.googleSub !== undefined) dbUpdates.google_sub = updates.googleSub;
    if (updates.authProviders !== undefined) dbUpdates.auth_providers = updates.authProviders;
    
    const { data, error } = await supabase
      .from('users')
      .update(dbUpdates)
      .eq('id', id)
      .select('id, email, password_hash, google_sub, auth_providers, created_at, updated_at')
      .single();
    
    if (error) {
      console.error('Supabase updateUser error (line 190):', error);
      throw error;
    }
    
    // Map database fields back to our User interface
    return {
      id: data.id,
      email: data.email,
      password: data.password_hash,
      googleSub: data.google_sub,
      authProviders: data.auth_providers || [],
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as User;
  }

  async addAuthProvider(userId: string, provider: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) return;
    
    const providers = user.authProviders || [];
    if (!providers.includes(provider)) {
      await this.updateUser(userId, {
        authProviders: [...providers, provider],
      });
    }
  }

  async removeAuthProvider(userId: string, provider: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) return;
    
    const providers = user.authProviders || [];
    await this.updateUser(userId, {
      authProviders: providers.filter(p => p !== provider),
    });
  }

  // Subscription operations
  async getActiveSubscription(userId: string): Promise<Subscription | undefined> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();
    
    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Supabase getActiveSubscription error (line 240):', error);
      }
      return undefined;
    }
    return data as Subscription;
  }

  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    // Map TypeScript interface to database columns
    const dbData = {
      id: subscription.id,
      user_id: subscription.userId,
      stripe_subscription_id: subscription.dodoSubscriptionId, // Map to old column name
      plan_code: subscription.planCode,
      status: subscription.status,
      current_period_start: subscription.currentPeriodStart.toISOString(),
      current_period_end: subscription.currentPeriodEnd.toISOString(),
      amount_paid: subscription.amountPaid,
      currency: subscription.currency,
      cancel_at: subscription.cancelAt?.toISOString(),
      cancel_reason: subscription.cancelReason,
      created_at: subscription.createdAt?.toISOString() || new Date().toISOString(),
      updated_at: subscription.updatedAt?.toISOString() || new Date().toISOString(),
    };
    
    const { data, error } = await supabase
      .from('subscriptions')
      .insert(dbData)
      .select()
      .single();
    
    if (error) {
      console.error('Supabase createSubscription error (line 255):', error);
      throw error;
    }
    
    // Map database fields back to TypeScript interface
    return {
      id: data.id,
      userId: data.user_id,
      dodoSubscriptionId: data.stripe_subscription_id, // Map from old column name
      planCode: data.plan_code,
      status: data.status,
      currentPeriodStart: new Date(data.current_period_start),
      currentPeriodEnd: new Date(data.current_period_end),
      amountPaid: data.amount_paid,
      currency: data.currency,
      cancelAt: data.cancel_at ? new Date(data.cancel_at) : undefined,
      cancelReason: data.cancel_reason,
      createdAt: data.created_at ? new Date(data.created_at) : new Date(),
      updatedAt: new Date(data.updated_at),
    } as Subscription;
  }

  async updateSubscription(subscriptionId: string, updates: Partial<Subscription>): Promise<void> {
    const { error } = await supabase
      .from('subscriptions')
      .update(updates)
      .eq('id', subscriptionId);
    
    if (error) {
      console.error('Supabase updateSubscription error (line 268):', error);
      throw error;
    }
  }

  async getSubscriptionByDodoId(dodoSubscriptionId: string): Promise<Subscription | undefined> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('stripe_subscription_id', dodoSubscriptionId) // Note: Database column name, will be migrated
      .single();
    
    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Supabase getSubscriptionByDodoId error:', error);
      }
      return undefined;
    }
    // Map database field to interface
    if (data) {
      return {
        ...data,
        dodoSubscriptionId: data.stripe_subscription_id, // Map from old column name
      } as Subscription;
    }
    return undefined;
  }

  // Usage counter operations
  async getUsageCounter(userId: string, periodStart: Date): Promise<UsageCounter | undefined> {
    const periodStartISO = periodStart.toISOString();
    console.log('[STORAGE-DEBUG] getUsageCounter - Query params:', {
      userId,
      periodStartISO,
      periodStartTime: periodStart.getTime()
    });
    
    const { data, error } = await supabase
      .from('usage_counters')
      .select('id, user_id, plan_code, period_start, period_end, replies_used, credits_used, limit, reset_at, created_at, updated_at')
      .eq('user_id', userId)
      .eq('period_start', periodStartISO)
      .single();

    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('[STORAGE-DEBUG] getUsageCounter - ERROR:', error);
      } else {
        console.log('[STORAGE-DEBUG] getUsageCounter - NOT FOUND (no matching counter)');
      }
      return undefined;
    }

    console.log('[STORAGE-DEBUG] getUsageCounter - FOUND:', {
      id: data.id,
      period_start: data.period_start,
      replies_used: data.replies_used,
      credits_used: data.credits_used,
      limit: data.limit,
      plan_code: data.plan_code
    });

    // Map database fields to our UsageCounter interface
    return {
      id: data.id,
      userId: data.user_id,
      planCode: data.plan_code,
      periodStart: new Date(data.period_start),
      periodEnd: new Date(data.period_end),
      repliesUsed: data.replies_used,
      creditsUsed: data.credits_used ?? (data.replies_used * 2), // FALLBACK: calculate if null
      limit: data.limit,
      resetAt: new Date(data.reset_at),
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as UsageCounter;
  }

  async createUsageCounter(usageCounter: InsertUsageCounter): Promise<UsageCounter> {
    // Map camelCase fields to snake_case database columns
    const dbUsageCounter = {
      id: usageCounter.id,
      user_id: usageCounter.userId,
      plan_code: usageCounter.planCode,
      period_start: usageCounter.periodStart.toISOString(),
      period_end: usageCounter.periodEnd.toISOString(),
      replies_used: usageCounter.repliesUsed ?? 0,
      credits_used: usageCounter.creditsUsed ?? 0, // NEW
      limit: usageCounter.limit,
      reset_at: usageCounter.resetAt.toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error} = await supabase
      .from('usage_counters')
      .insert(dbUsageCounter)
      .select('id, user_id, plan_code, period_start, period_end, replies_used, credits_used, limit, reset_at, created_at, updated_at')
      .single();
    
    if (error) {
      console.error('Supabase createUsageCounter error (line 315):', error);
      throw error;
    }

    // Map database fields back to our UsageCounter interface
    return {
      id: data.id,
      userId: data.user_id,
      planCode: data.plan_code,
      periodStart: new Date(data.period_start),
      periodEnd: new Date(data.period_end),
      repliesUsed: data.replies_used,
      creditsUsed: data.credits_used ?? (data.replies_used * 2), // FALLBACK
      limit: data.limit,
      resetAt: new Date(data.reset_at),
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as UsageCounter;
  }

  async updateUsageCounter(counterId: string, updates: Partial<UsageCounter>): Promise<void> {
    // Map camelCase fields to snake_case database columns
    const dbUpdates: any = {
      updated_at: new Date().toISOString()
    };
    
    if (updates.planCode !== undefined) dbUpdates.plan_code = updates.planCode;
    if (updates.limit !== undefined) dbUpdates.limit = updates.limit;
    if (updates.repliesUsed !== undefined) dbUpdates.replies_used = updates.repliesUsed;
    if (updates.creditsUsed !== undefined) dbUpdates.credits_used = updates.creditsUsed; // NEW
    if (updates.resetAt !== undefined) dbUpdates.reset_at = updates.resetAt.toISOString();
    
    const { error } = await supabase
      .from('usage_counters')
      .update(dbUpdates)
      .eq('id', counterId);
    
    if (error) {
      console.error('Supabase updateUsageCounter error:', error);
      throw error;
    }
  }

  async incrementUsage(userId: string, periodStart: Date, creditCost: number): Promise<UsageCounter> {
    console.log('[STORAGE-DEBUG] ========== incrementUsage START ==========');
    console.log('[STORAGE-DEBUG] incrementUsage - userId:', userId);
    console.log('[STORAGE-DEBUG] incrementUsage - periodStart:', periodStart.toISOString());
    console.log('[STORAGE-DEBUG] incrementUsage - creditCost:', creditCost);
    
    let counter = await this.getUsageCounter(userId, periodStart);
    
    if (!counter) {
      // This should not happen as getUsageStatus creates the counter if it doesn't exist
      console.error('[STORAGE-DEBUG] incrementUsage - COUNTER NOT FOUND!');
      throw new Error('Usage counter not found - this should be created by getUsageStatus first');
    } else {
      const currentCredits = counter.creditsUsed ?? (counter.repliesUsed * 2);
      console.log('[STORAGE-DEBUG] incrementUsage - Counter before update:', {
        id: counter.id,
        currentRepliesUsed: counter.repliesUsed,
        currentCreditsUsed: currentCredits,
        willBecomeReplies: counter.repliesUsed + 1,
        willBecomeCredits: currentCredits + creditCost
      });
      
      const periodStartISO = periodStart.toISOString();
      console.log('[STORAGE-DEBUG] incrementUsage - UPDATE query WHERE:', {
        user_id: userId,
        period_start: periodStartISO
      });
      
      const { data, error } = await supabase
        .from('usage_counters')
        .update({ 
          replies_used: counter.repliesUsed + 1,
          credits_used: currentCredits + creditCost, // Handle null with fallback
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('period_start', periodStartISO)
        .select('id, user_id, plan_code, period_start, period_end, replies_used, credits_used, limit, reset_at, created_at, updated_at')
        .single();
      
      if (error) {
        console.error('[STORAGE-DEBUG] incrementUsage - UPDATE FAILED:', error);
        throw error;
      }

      if (!data) {
        console.error('[STORAGE-DEBUG] incrementUsage - UPDATE returned NO DATA (no rows matched)');
        throw new Error('Failed to increment usage - no rows affected');
      }

      console.log('[STORAGE-DEBUG] incrementUsage - UPDATE SUCCESS:', {
        id: data.id,
        period_start: data.period_start,
        replies_used: data.replies_used,
        credits_used: data.credits_used,
        limit: data.limit
      });

      // Map database fields back to our UsageCounter interface
      counter = {
        id: data.id,
        userId: data.user_id,
        planCode: data.plan_code,
        periodStart: new Date(data.period_start),
        periodEnd: new Date(data.period_end),
        repliesUsed: data.replies_used,
        creditsUsed: data.credits_used ?? (data.replies_used * 2), // FALLBACK
        limit: data.limit,
        resetAt: new Date(data.reset_at),
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      } as UsageCounter;
    }
    
    console.log('[STORAGE-DEBUG] incrementUsage - Returning counter with repliesUsed:', counter.repliesUsed, 'creditsUsed:', counter.creditsUsed);
    console.log('[STORAGE-DEBUG] ========== incrementUsage END ==========');
    return counter;
  }

  // Reply event operations
  async createReplyEvent(replyEvent: InsertReplyEvent): Promise<ReplyEvent> {
    // Map camelCase fields to snake_case database columns
    const dbReplyEvent = {
      user_id: replyEvent.userId,
      model_key: replyEvent.modelKey,
      prompt_key: replyEvent.promptKey,
      latency_ms: replyEvent.latencyMs,
      tokens_used: replyEvent.tokensUsed,
      cost: replyEvent.cost,
      created_at: replyEvent.createdAt ? replyEvent.createdAt.toISOString() : new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('reply_events')
      .insert(dbReplyEvent)
      .select('id, user_id, model_key, prompt_key, latency_ms, tokens_used, cost, created_at')
      .single();
    
    if (error) {
      console.error('Supabase createReplyEvent error (line 358):', error);
      throw error;
    }

    // Map database fields back to our ReplyEvent interface
    return {
      id: data.id.toString(), // Convert bigint to string
      userId: data.user_id,
      modelKey: data.model_key,
      promptKey: data.prompt_key,
      latencyMs: data.latency_ms,
      tokensUsed: data.tokens_used,
      cost: data.cost,
      createdAt: new Date(data.created_at)
    } as ReplyEvent;
  }

  // Feedback operations
  async createFeedback(feedback: InsertFeedback): Promise<Feedback> {
    const { data, error } = await supabase
      .from('feedback')
      .insert(feedback)
      .select()
      .single();
    
    if (error) {
      console.error('Supabase createFeedback error (line 373):', error);
      throw error;
    }
    return data as Feedback;
  }

  // Reply history operations
  async createReplyHistory(replyHistory: InsertReplyHistory): Promise<ReplyHistory> {
    // Map camelCase fields to snake_case database columns
    const dbReplyHistory = {
      id: replyHistory.id,
      user_id: replyHistory.userId,
      original_tweet: replyHistory.originalTweet,
      generated_reply: replyHistory.generatedReply,
      model_key: replyHistory.modelKey,
      prompt_variation: replyHistory.promptKey || null,
      quality_score: replyHistory.qualityScore,
      was_used: replyHistory.wasUsed || false,
      used_at: replyHistory.usedAt ? replyHistory.usedAt.toISOString() : null,
      tweet_url: replyHistory.tweetUrl,
      performance: replyHistory.performance,
      created_at: replyHistory.createdAt ? replyHistory.createdAt.toISOString() : new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('reply_history')
      .insert(dbReplyHistory)
      .select('id, user_id, original_tweet, generated_reply, model_key, prompt_variation, quality_score, was_used, used_at, tweet_url, performance, created_at')
      .single();
    
    if (error) {
      console.error('Supabase createReplyHistory error (line 388):', error);
      throw error;
    }

    // Map database fields back to our ReplyHistory interface
    return {
      id: data.id,
      userId: data.user_id,
      originalTweet: data.original_tweet,
      generatedReply: data.generated_reply,
      modelKey: data.model_key,
      promptKey: data.prompt_variation,
      qualityScore: data.quality_score,
      wasUsed: data.was_used,
      usedAt: data.used_at ? new Date(data.used_at) : undefined,
      tweetUrl: data.tweet_url,
      performance: data.performance,
      createdAt: new Date(data.created_at)
    } as ReplyHistory;
  }

  async getReplyHistory(userId: string, limit: number = 50): Promise<ReplyHistory[]> {
    const { data, error } = await supabase
      .from('reply_history')
      .select('id, user_id, original_tweet, generated_reply, model_key, prompt_variation, quality_score, was_used, used_at, tweet_url, performance, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Supabase getReplyHistory error (line 404):', error);
      return [];
    }

    // Map database fields to our ReplyHistory interface
    return data.map(item => ({
      id: item.id,
      userId: item.user_id,
      originalTweet: item.original_tweet,
      generatedReply: item.generated_reply,
      modelKey: item.model_key,
      promptKey: item.prompt_variation,
      qualityScore: item.quality_score,
      wasUsed: item.was_used,
      usedAt: item.used_at ? new Date(item.used_at) : undefined,
      tweetUrl: item.tweet_url,
      performance: item.performance,
      createdAt: new Date(item.created_at)
    })) as ReplyHistory[];
  }

  async markReplyAsUsed(replyHistoryId: string, tweetUrl?: string): Promise<void> {
    const { error } = await supabase
      .from('reply_history')
      .update({ 
        was_used: true,
        tweet_url: tweetUrl,
      })
      .eq('id', replyHistoryId);
    
    if (error) {
      console.error('Supabase markReplyAsUsed error (line 420):', error);
      throw error;
    }
  }

  async updateReplyPerformance(replyHistoryId: string, performance: any): Promise<void> {
    const { error } = await supabase
      .from('reply_history')
      .update({ performance_metrics: performance })
      .eq('id', replyHistoryId);
    
    if (error) {
      console.error('Supabase updateReplyPerformance error (line 432):', error);
      throw error;
    }
  }

  // User preferences operations
  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Supabase getUserPreferences error (line 446):', error);
      }
      return undefined;
    }
    
    if (!data) return undefined;
    
    // Map database fields to TypeScript interface
    return {
      id: data.id,
      userId: data.user_id,
      tone: data.tone || 'default',
      length: data.length || 'default',
      style: data.style || 'default',
      topics: data.topics || [],
      promptStyleEnabled: data.prompt_style_enabled ?? false, // Default to false if null/undefined
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    } as UserPreferences;
  }

  async upsertUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences> {
    // Map TypeScript fields to database columns
    const dbPreferences = {
      id: preferences.id,
      user_id: preferences.userId,
      tone: preferences.tone,
      length: preferences.length,
      style: preferences.style,
      topics: preferences.topics,
      prompt_style_enabled: preferences.promptStyleEnabled ?? false, // Default to false if undefined
      created_at: preferences.createdAt?.toISOString() || new Date().toISOString(),
      updated_at: preferences.updatedAt?.toISOString() || new Date().toISOString(),
    };
    
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(dbPreferences, { onConflict: 'user_id' })
      .select()
      .single();
    
    if (error) {
      console.error('Supabase upsertUserPreferences error (line 461):', error);
      throw error;
    }
    
    // Map database fields back to TypeScript interface
    return {
      id: data.id,
      userId: data.user_id,
      tone: data.tone || 'default',
      length: data.length || 'default',
      style: data.style || 'default',
      topics: data.topics || [],
      promptStyleEnabled: data.prompt_style_enabled ?? false,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    } as UserPreferences;
  }
}

export const storage = new SupabaseStorage();

