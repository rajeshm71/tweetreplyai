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
  ReplyTokens,
  InsertReplyTokens,
  ReplyTokensStageEntry,
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
      .select('id, email, password_hash, google_sub, first_name, last_name, profile_image_url, auth_providers, stripe_customer_id, has_used_trial, handle, created_at, updated_at')
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
      firstName: data.first_name || undefined,
      lastName: data.last_name || undefined,
      profileImageUrl: data.profile_image_url || undefined,
      dodoCustomerId: data.stripe_customer_id, // Map from old column name
      authProviders: data.auth_providers || [],
      hasUsedTrial: data.has_used_trial || false,
      xUsername: data.handle ?? null,
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
      .select('id, email, password_hash, google_sub, first_name, last_name, profile_image_url, auth_providers, stripe_customer_id, has_used_trial, handle, created_at, updated_at')
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
      firstName: data.first_name || undefined,
      lastName: data.last_name || undefined,
      profileImageUrl: data.profile_image_url || undefined,
      dodoCustomerId: data.stripe_customer_id, // Map from old column name
      authProviders: data.auth_providers || [],
      hasUsedTrial: data.has_used_trial || false,
      xUsername: data.handle ?? null,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as User;
  }

  async getUserByGoogleSub(googleSub: string): Promise<User | undefined> {
    console.log('=== SUPABASE: getUserByGoogleSub called (line 77) ===');
    const { data, error } = await supabase
      .from('users')
      .select('id, email, password_hash, google_sub, first_name, last_name, profile_image_url, auth_providers, stripe_customer_id, has_used_trial, handle, created_at, updated_at')
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
      firstName: data.first_name || undefined,
      lastName: data.last_name || undefined,
      profileImageUrl: data.profile_image_url || undefined,
      dodoCustomerId: data.stripe_customer_id, // Map from old column name
      authProviders: data.auth_providers || [],
      hasUsedTrial: data.has_used_trial || false,
      xUsername: data.handle ?? null,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as User;
  }

  async setUserResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({
        reset_token: token,
        reset_token_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (error) {
      console.error('Supabase setUserResetToken error:', error);
      throw error;
    }
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('users')
      .select('id, email, password_hash, google_sub, first_name, last_name, profile_image_url, auth_providers, stripe_customer_id, has_used_trial, handle, created_at, updated_at')
      .eq('reset_token', token)
      .gt('reset_token_expires_at', now)
      .single();
    if (error || !data) {
      if (error && error.code !== 'PGRST116') {
        console.error('Supabase getUserByResetToken error:', error);
      }
      return undefined;
    }
    return {
      id: data.id,
      email: data.email,
      password: data.password_hash,
      googleSub: data.google_sub,
      firstName: data.first_name || undefined,
      lastName: data.last_name || undefined,
      profileImageUrl: data.profile_image_url || undefined,
      dodoCustomerId: data.stripe_customer_id,
      authProviders: data.auth_providers || [],
      hasUsedTrial: data.has_used_trial || false,
      xUsername: data.handle ?? null,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as User;
  }

  async clearUserResetToken(userId: string): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({
        reset_token: null,
        reset_token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (error) {
      console.error('Supabase clearUserResetToken error:', error);
      throw error;
    }
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    console.log('=== SUPABASE: upsertUser called (line 132) ===');
    
    // Map our User interface fields to database fields
    const dbData: any = {
      id: userData.id,
      email: userData.email,
      password_hash: userData.password,
      google_sub: userData.googleSub,
      stripe_customer_id: userData.dodoCustomerId, // Map to old column name for now
      auth_providers: userData.authProviders || [],
      created_at: userData.createdAt || new Date(),
      updated_at: userData.updatedAt || new Date()
    };
    
    // Include name fields if provided
    if (userData.firstName !== undefined) {
      dbData.first_name = userData.firstName;
    }
    if (userData.lastName !== undefined) {
      dbData.last_name = userData.lastName;
    }
    if (userData.profileImageUrl !== undefined) {
      dbData.profile_image_url = userData.profileImageUrl;
    }
    
    // Include has_used_trial if provided
    if (userData.hasUsedTrial !== undefined) {
      dbData.has_used_trial = userData.hasUsedTrial;
    }
    if (userData.xUsername !== undefined) {
      dbData.handle = userData.xUsername;
    }
    
    const { data, error } = await supabase
      .from('users')
      .upsert(dbData, { onConflict: 'id' })
      .select('id, email, password_hash, google_sub, first_name, last_name, profile_image_url, auth_providers, stripe_customer_id, has_used_trial, handle, created_at, updated_at')
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
      firstName: data.first_name || undefined,
      lastName: data.last_name || undefined,
      profileImageUrl: data.profile_image_url || undefined,
      dodoCustomerId: data.stripe_customer_id, // Map from old column name
      authProviders: data.auth_providers || [],
      hasUsedTrial: data.has_used_trial || false,
      xUsername: data.handle ?? null,
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
    if (updates.firstName !== undefined) dbUpdates.first_name = updates.firstName;
    if (updates.lastName !== undefined) dbUpdates.last_name = updates.lastName;
    if (updates.profileImageUrl !== undefined) dbUpdates.profile_image_url = updates.profileImageUrl;
    if (updates.authProviders !== undefined) dbUpdates.auth_providers = updates.authProviders;
    if (updates.hasUsedTrial !== undefined) dbUpdates.has_used_trial = updates.hasUsedTrial;
    if (updates.xUsername !== undefined) dbUpdates.handle = updates.xUsername;
    
    const { data, error } = await supabase
      .from('users')
      .update(dbUpdates)
      .eq('id', id)
      .select('id, email, password_hash, google_sub, first_name, last_name, profile_image_url, auth_providers, stripe_customer_id, has_used_trial, handle, created_at, updated_at')
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
      firstName: data.first_name || undefined,
      lastName: data.last_name || undefined,
      profileImageUrl: data.profile_image_url || undefined,
      dodoCustomerId: data.stripe_customer_id,
      authProviders: data.auth_providers || [],
      hasUsedTrial: data.has_used_trial || false,
      xUsername: data.handle ?? null,
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
    const now = new Date().toISOString();
    
    // Get the most recent subscription (active or canceled) that hasn't expired
    // Include canceled subscriptions because users should retain access until period ends
    // Use .limit(1).maybeSingle() to handle multiple subscriptions gracefully
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'canceled']) // Include canceled subscriptions within their paid period
      .gt('current_period_end', now) // Only get subscriptions that haven't expired
      .order('created_at', { ascending: false }) // Get most recent first
      .limit(1)
      .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 or 1 results
    
    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Supabase getActiveSubscription error:', error);
      }
      return undefined;
    }
    
    if (!data) {
      return undefined;
    }
    
    // Map database fields to interface
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
    // Map TypeScript interface properties (camelCase) to database columns (snake_case)
    const dbUpdates: any = {};
    
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.currentPeriodStart !== undefined) {
      dbUpdates.current_period_start = updates.currentPeriodStart.toISOString();
    }
    if (updates.currentPeriodEnd !== undefined) {
      dbUpdates.current_period_end = updates.currentPeriodEnd.toISOString();
    }
    if (updates.amountPaid !== undefined) dbUpdates.amount_paid = updates.amountPaid;
    if (updates.currency !== undefined) dbUpdates.currency = updates.currency;
    if (updates.cancelAt !== undefined) {
      dbUpdates.cancel_at = updates.cancelAt?.toISOString() || null;
    }
    if (updates.cancelReason !== undefined) dbUpdates.cancel_reason = updates.cancelReason;
    if (updates.updatedAt !== undefined) {
      dbUpdates.updated_at = updates.updatedAt.toISOString();
    }
    
    const { error } = await supabase
      .from('subscriptions')
      .update(dbUpdates)
      .eq('id', subscriptionId);
    
    if (error) {
      console.error('Supabase updateSubscription error:', error);
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

  async getUserSubscriptions(userId: string): Promise<Subscription[]> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Supabase getUserSubscriptions error:', error);
      return [];
    }
    
    return (data || []).map(item => ({
      id: item.id,
      userId: item.user_id,
      dodoSubscriptionId: item.stripe_subscription_id,
      planCode: item.plan_code,
      status: item.status,
      currentPeriodStart: new Date(item.current_period_start),
      currentPeriodEnd: new Date(item.current_period_end),
      amountPaid: item.amount_paid,
      currency: item.currency,
      cancelAt: item.cancel_at ? new Date(item.cancel_at) : undefined,
      cancelReason: item.cancel_reason,
      createdAt: item.created_at ? new Date(item.created_at) : new Date(),
      updatedAt: new Date(item.updated_at),
    } as Subscription));
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
      .select('id, user_id, plan_code, period_start, period_end, replies_used, credits_used, limit, reset_at, mode_breakdown, created_at, updated_at')
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
      modeBreakdown: data.mode_breakdown || undefined, // Map JSONB to TypeScript object
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as UsageCounter;
  }

  async getActiveTrialCounter(userId: string): Promise<UsageCounter | undefined> {
    const now = new Date().toISOString();
    console.log('[STORAGE-DEBUG] getActiveTrialCounter - Query params:', { userId, now });
    
    const { data, error } = await supabase
      .from('usage_counters')
      .select('id, user_id, plan_code, period_start, period_end, replies_used, credits_used, limit, reset_at, mode_breakdown, created_at, updated_at')
      .eq('user_id', userId)
      .eq('plan_code', 'trial')
      .gt('period_end', now) // Trial period not expired
      .order('created_at', { ascending: false }) // Get most recent first
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('[STORAGE-DEBUG] getActiveTrialCounter - ERROR:', error);
      } else {
        console.log('[STORAGE-DEBUG] getActiveTrialCounter - NOT FOUND (no active trial counter)');
      }
      return undefined;
    }

    if (!data) {
      console.log('[STORAGE-DEBUG] getActiveTrialCounter - NOT FOUND');
      return undefined;
    }

    console.log('[STORAGE-DEBUG] getActiveTrialCounter - FOUND:', {
      id: data.id,
      period_start: data.period_start,
      period_end: data.period_end,
      credits_used: data.credits_used,
      limit: data.limit
    });

    // Map database fields to our UsageCounter interface
    return {
      id: data.id,
      userId: data.user_id,
      planCode: data.plan_code,
      periodStart: new Date(data.period_start),
      periodEnd: new Date(data.period_end),
      repliesUsed: data.replies_used,
      creditsUsed: data.credits_used ?? (data.replies_used * 2),
      limit: data.limit,
      resetAt: new Date(data.reset_at),
      modeBreakdown: data.mode_breakdown || undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as UsageCounter;
  }

  async createUsageCounter(usageCounter: InsertUsageCounter): Promise<UsageCounter> {
    // Map camelCase fields to snake_case database columns
    const dbUsageCounter: any = {
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

    // Include mode_breakdown if provided, otherwise default to empty object
    if (usageCounter.modeBreakdown !== undefined) {
      dbUsageCounter.mode_breakdown = usageCounter.modeBreakdown;
    } else {
      dbUsageCounter.mode_breakdown = {};
    }

    const { data, error} = await supabase
      .from('usage_counters')
      .insert(dbUsageCounter)
      .select('id, user_id, plan_code, period_start, period_end, replies_used, credits_used, limit, reset_at, mode_breakdown, created_at, updated_at')
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
      modeBreakdown: data.mode_breakdown || undefined, // Map JSONB to TypeScript object
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
    if (updates.modeBreakdown !== undefined) dbUpdates.mode_breakdown = updates.modeBreakdown;
    
    const { error } = await supabase
      .from('usage_counters')
      .update(dbUpdates)
      .eq('id', counterId);
    
    if (error) {
      console.error('Supabase updateUsageCounter error:', error);
      throw error;
    }
  }

  async incrementUsage(userId: string, periodStart: Date, creditCost: number, replyMode?: string, existingCounter?: UsageCounter): Promise<UsageCounter> {
    console.log('[STORAGE-DEBUG] ========== incrementUsage START ==========');
    console.log('[STORAGE-DEBUG] incrementUsage - userId:', userId);
    console.log('[STORAGE-DEBUG] incrementUsage - periodStart:', periodStart.toISOString());
    console.log('[STORAGE-DEBUG] incrementUsage - creditCost:', creditCost);
    console.log('[STORAGE-DEBUG] incrementUsage - replyMode:', replyMode);

    // When existingCounter is provided, skip lookup to avoid read-after-write issues (counter may have been just created)
    let counter: UsageCounter | undefined = existingCounter;
    if (!counter) {
      counter = await this.getUsageCounter(userId, periodStart);
      if (!counter) {
        console.error('[STORAGE-DEBUG] incrementUsage - COUNTER NOT FOUND!');
        throw new Error('Usage counter not found - this should be created by getUsageStatus first');
      }
    }

    const currentCredits = counter.creditsUsed ?? (counter.repliesUsed * 2);

    // Update mode breakdown if replyMode is provided
    let updatedBreakdown = counter.modeBreakdown || {};
    if (replyMode) {
      const validModes: Array<'single-sentence' | 'enhanced' | 'improve'> = ['single-sentence', 'enhanced', 'improve'];
      if (validModes.includes(replyMode as any)) {
        const modeKey = replyMode as 'single-sentence' | 'enhanced' | 'improve';
        if (!updatedBreakdown[modeKey]) {
          updatedBreakdown[modeKey] = { replies: 0, credits: 0 };
        }
        updatedBreakdown[modeKey] = {
          replies: (updatedBreakdown[modeKey]?.replies || 0) + 1,
          credits: (updatedBreakdown[modeKey]?.credits || 0) + creditCost
        };
      } else {
        console.warn(`[STORAGE-DEBUG] Invalid replyMode: ${replyMode}, skipping breakdown update`);
      }
    }

    if (updatedBreakdown && typeof updatedBreakdown === 'object') {
      for (const [key, value] of Object.entries(updatedBreakdown)) {
        if (value && (typeof value !== 'object' || typeof value.replies !== 'number' || typeof value.credits !== 'number')) {
          console.error(`[STORAGE-DEBUG] Invalid breakdown entry for ${key}:`, value);
          delete updatedBreakdown[key as keyof typeof updatedBreakdown];
        }
      }
    }

    console.log('[STORAGE-DEBUG] incrementUsage - Counter before update:', {
      id: counter.id,
      currentRepliesUsed: counter.repliesUsed,
      currentCreditsUsed: currentCredits,
      willBecomeReplies: counter.repliesUsed + 1,
      willBecomeCredits: currentCredits + creditCost,
      modeBreakdown: updatedBreakdown
    });

    const updateData: any = {
      replies_used: counter.repliesUsed + 1,
      credits_used: currentCredits + creditCost,
      updated_at: new Date().toISOString(),
      mode_breakdown: updatedBreakdown
    };

    // Update by primary key when counter was passed in (avoids read-after-write); otherwise by user_id + period_start
    const query = supabase
      .from('usage_counters')
      .update(updateData);
    if (existingCounter) {
      console.log('[STORAGE-DEBUG] incrementUsage - UPDATE by id (existing counter):', { id: existingCounter.id });
      query.eq('id', existingCounter.id);
    } else {
      console.log('[STORAGE-DEBUG] incrementUsage - UPDATE query WHERE:', { user_id: userId, period_start: periodStart.toISOString() });
      query.eq('user_id', userId).eq('period_start', periodStart.toISOString());
    }

    const { data, error } = await query
      .select('id, user_id, plan_code, period_start, period_end, replies_used, credits_used, limit, reset_at, mode_breakdown, created_at, updated_at')
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
      limit: data.limit,
      mode_breakdown: data.mode_breakdown
    });

    const result: UsageCounter = {
      id: data.id,
      userId: data.user_id,
      planCode: data.plan_code,
      periodStart: new Date(data.period_start),
      periodEnd: new Date(data.period_end),
      repliesUsed: data.replies_used,
      creditsUsed: data.credits_used ?? (data.replies_used * 2),
      limit: data.limit,
      resetAt: new Date(data.reset_at),
      modeBreakdown: data.mode_breakdown || undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as UsageCounter;

    console.log('[STORAGE-DEBUG] incrementUsage - Returning counter with repliesUsed:', result.repliesUsed, 'creditsUsed:', result.creditsUsed);
    console.log('[STORAGE-DEBUG] ========== incrementUsage END ==========');
    return result;
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
    const LOG_PREFIX = '[createReplyHistory]';

    // Diagnostic: incoming payload (safe, no huge strings)
    const incomingKeys = Object.keys(replyHistory);
    const perfType = typeof replyHistory.performance;
    let perfStringify: string;
    try {
      perfStringify = replyHistory.performance != null ? JSON.stringify(replyHistory.performance) : 'null';
    } catch (e) {
      perfStringify = 'stringify error';
    }
    const originalTweetLen = typeof replyHistory.originalTweet === 'string' ? replyHistory.originalTweet.length : 0;
    const generatedReplyLen = typeof replyHistory.generatedReply === 'string' ? replyHistory.generatedReply.length : 0;
    console.log(LOG_PREFIX, 'incoming', {
      keys: incomingKeys,
      types: Object.fromEntries(incomingKeys.map((k) => [k, typeof (replyHistory as unknown as Record<string, unknown>)[k]])),
      performance: { typeof: perfType, stringifyLen: perfStringify.length, stringifyPrefix: perfStringify.substring(0, 200) },
      originalTweetLen,
      generatedReplyLen,
    });

    // Normalize performance to valid JSON for jsonb column (avoid PGRST102 "Empty or invalid json")
    let performanceJson: Record<string, unknown> | null = null;
    if (replyHistory.performance != null && typeof replyHistory.performance === 'object') {
      try {
        performanceJson = JSON.parse(JSON.stringify(replyHistory.performance)) as Record<string, unknown>;
      } catch {
        performanceJson = {};
      }
    }

    // Map camelCase fields to snake_case database columns
    const dbReplyHistory = {
      id: replyHistory.id,
      user_id: replyHistory.userId,
      original_tweet: replyHistory.originalTweet ?? '',
      generated_reply: replyHistory.generatedReply ?? '',
      model_key: replyHistory.modelKey,
      prompt_variation: replyHistory.promptKey || null,
      quality_score: replyHistory.qualityScore ?? null,
      was_used: replyHistory.wasUsed ?? false,
      used_at: replyHistory.usedAt ? replyHistory.usedAt.toISOString() : null,
      tweet_url: replyHistory.tweetUrl ?? null,
      performance: performanceJson,
      reply_mode: replyHistory.replyMode ?? 'enhanced',
      created_at: replyHistory.createdAt ? replyHistory.createdAt.toISOString() : new Date().toISOString()
    };

    // Diagnostic: payload we send to Supabase
    let payloadStringifyOk = false;
    let payloadStringLen = 0;
    let payloadStringPrefix = '';
    try {
      const payloadStr = JSON.stringify(dbReplyHistory);
      payloadStringifyOk = true;
      payloadStringLen = payloadStr.length;
      payloadStringPrefix = payloadStr.substring(0, 300);
    } catch (e) {
      console.log(LOG_PREFIX, 'JSON.stringify(dbReplyHistory) threw', e);
    }
    const perfJsonType = typeof dbReplyHistory.performance;
    let perfJsonStr = '';
    try {
      perfJsonStr = dbReplyHistory.performance != null ? JSON.stringify(dbReplyHistory.performance) : 'null';
    } catch {
      perfJsonStr = 'stringify error';
    }
    console.log(LOG_PREFIX, 'payload', {
      stringifyOk: payloadStringifyOk,
      payloadStringLen,
      payloadPrefix: payloadStringPrefix,
      performance: { typeof: perfJsonType, stringifyLen: perfJsonStr.length, stringifyPrefix: perfJsonStr.substring(0, 200) },
    });

    const { data, error } = await supabase
      .from('reply_history')
      .insert(dbReplyHistory)
      .select('id, user_id, original_tweet, generated_reply, model_key, prompt_variation, quality_score, was_used, used_at, tweet_url, performance, reply_mode, created_at')
      .single();

    if (error) {
      console.error('Supabase createReplyHistory error:', error);
      console.log(LOG_PREFIX, 'on error diagnostic', {
        incomingKeys,
        originalTweetLen,
        generatedReplyLen,
        payloadStringifyOk,
        payloadStringLen,
        performanceType: perfJsonType,
      });
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
      replyMode: data.reply_mode,
      createdAt: new Date(data.created_at)
    } as ReplyHistory;
  }

  async getReplyHistory(userId: string, limit: number = 50): Promise<ReplyHistory[]> {
    const { data, error } = await supabase
      .from('reply_history')
      .select('id, user_id, original_tweet, generated_reply, model_key, prompt_variation, quality_score, was_used, used_at, tweet_url, performance, reply_mode, created_at')
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
      replyMode: item.reply_mode,
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

  async createReplyTokens(entry: InsertReplyTokens): Promise<ReplyTokens> {
    const stageBreakdownDb = (entry.stageBreakdown || []).map((s: ReplyTokensStageEntry) => ({
      stage: s.stage,
      model_key: s.modelKey,
      prompt_tokens: s.promptTokens,
      completion_tokens: s.completionTokens,
      total_tokens: s.totalTokens ?? s.promptTokens + s.completionTokens,
      cost: s.cost,
      latency_ms: s.latencyMs ?? null,
      raw_usage: s.rawUsage ?? null,
    }));
    const dbRow = {
      ...(entry.id && { id: entry.id }),
      user_id: entry.userId,
      reply_history_id: entry.replyHistoryId,
      stage_breakdown: stageBreakdownDb,
      total_prompt_tokens: entry.totalPromptTokens,
      total_completion_tokens: entry.totalCompletionTokens,
      total_tokens: entry.totalTokens,
      total_cost: entry.totalCost,
      ...(entry.createdAt && { created_at: entry.createdAt.toISOString() }),
    };
    const { data, error } = await supabase
      .from('reply_tokens')
      .insert(dbRow)
      .select('id, user_id, reply_history_id, stage_breakdown, total_prompt_tokens, total_completion_tokens, total_tokens, total_cost, created_at')
      .single();
    if (error) {
      console.error('Supabase createReplyTokens error:', error);
      throw error;
    }
    return {
      id: data.id,
      userId: data.user_id,
      replyHistoryId: data.reply_history_id,
      stageBreakdown: (data.stage_breakdown || []).map((s: any) => ({
        stage: s.stage,
        modelKey: s.model_key,
        promptTokens: s.prompt_tokens,
        completionTokens: s.completion_tokens,
        totalTokens: s.total_tokens,
        cost: Number(s.cost),
        latencyMs: s.latency_ms ?? undefined,
        rawUsage: s.raw_usage,
      })),
      totalPromptTokens: data.total_prompt_tokens,
      totalCompletionTokens: data.total_completion_tokens,
      totalTokens: data.total_tokens,
      totalCost: Number(data.total_cost),
      createdAt: new Date(data.created_at),
    } as ReplyTokens;
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

