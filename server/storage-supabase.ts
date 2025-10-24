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
    console.log('=== SUPABASE: getUser called ===');
    const { data, error } = await supabase
      .from('users')
      .select('id, email, password_hash, google_sub, replit_sub, auth_providers, created_at, updated_at')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Supabase getUser error:', error);
      return undefined;
    }
    
    // Map database fields to our User interface
    return {
      id: data.id,
      email: data.email,
      password: data.password_hash,
      googleSub: data.google_sub,
      replitSub: data.replit_sub,
      authProviders: data.auth_providers || [],
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as User;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    console.log('=== SUPABASE: getUserByEmail called ===');
    const { data, error } = await supabase
      .from('users')
      .select('id, email, password_hash, google_sub, replit_sub, auth_providers, created_at, updated_at')
      .eq('email', email)
      .single();
    
    if (error) {
      if (error.code !== 'PGRST116') { // Not found error
        console.error('Supabase getUserByEmail error:', error);
      }
      return undefined;
    }
    
    // Map database fields to our User interface
    return {
      id: data.id,
      email: data.email,
      password: data.password_hash,
      googleSub: data.google_sub,
      replitSub: data.replit_sub,
      authProviders: data.auth_providers || [],
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as User;
  }

  async getUserByGoogleSub(googleSub: string): Promise<User | undefined> {
    console.log('=== SUPABASE: getUserByGoogleSub called ===');
    const { data, error } = await supabase
      .from('users')
      .select('id, email, password_hash, google_sub, replit_sub, auth_providers, created_at, updated_at')
      .eq('google_sub', googleSub)
      .single();
    
    if (error) {
      if (error.code !== 'PGRST116') { // Not found error
        console.error('Supabase getUserByGoogleSub error:', error);
      }
      return undefined;
    }
    
    // Map database fields to our User interface
    return {
      id: data.id,
      email: data.email,
      password: data.password_hash,
      googleSub: data.google_sub,
      replitSub: data.replit_sub,
      authProviders: data.auth_providers || [],
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as User;
  }

  async getUserByReplitSub(replitSub: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('replit_sub', replitSub)
      .single();
    
    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Supabase getUserByReplitSub error:', error);
      }
      return undefined;
    }
    return data as User;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    console.log('=== SUPABASE: upsertUser called ===');
    
    // Map our User interface fields to database fields
    const dbData = {
      id: userData.id,
      email: userData.email,
      password_hash: userData.password,
      google_sub: userData.googleSub,
      replit_sub: userData.replitSub,
      auth_providers: userData.authProviders || [],
      created_at: userData.createdAt || new Date(),
      updated_at: userData.updatedAt || new Date()
    };
    
    const { data, error } = await supabase
      .from('users')
      .upsert(dbData, { onConflict: 'id' })
      .select('id, email, password_hash, google_sub, replit_sub, auth_providers, created_at, updated_at')
      .single();
    
    if (error) {
      console.error('Supabase upsertUser error:', error);
      throw error;
    }
    
    // Map database fields back to our User interface
    return {
      id: data.id,
      email: data.email,
      password: data.password_hash,
      googleSub: data.google_sub,
      replitSub: data.replit_sub,
      authProviders: data.auth_providers || [],
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    } as User;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .update({ ...updates, updated_at: new Date() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Supabase updateUser error:', error);
      throw error;
    }
    return data as User;
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
        console.error('Supabase getActiveSubscription error:', error);
      }
      return undefined;
    }
    return data as Subscription;
  }

  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const { data, error } = await supabase
      .from('subscriptions')
      .insert(subscription)
      .select()
      .single();
    
    if (error) {
      console.error('Supabase createSubscription error:', error);
      throw error;
    }
    return data as Subscription;
  }

  async updateSubscription(subscriptionId: string, updates: Partial<Subscription>): Promise<void> {
    const { error } = await supabase
      .from('subscriptions')
      .update(updates)
      .eq('id', subscriptionId);
    
    if (error) {
      console.error('Supabase updateSubscription error:', error);
      throw error;
    }
  }

  async getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | undefined> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('stripe_subscription_id', stripeSubscriptionId)
      .single();
    
    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Supabase getSubscriptionByStripeId error:', error);
      }
      return undefined;
    }
    return data as Subscription;
  }

  // Usage counter operations
  async getUsageCounter(userId: string, periodStart: Date): Promise<UsageCounter | undefined> {
    const { data, error } = await supabase
      .from('usage_counters')
      .select('*')
      .eq('user_id', userId)
      .eq('period_start', periodStart.toISOString())
      .single();
    
    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Supabase getUsageCounter error:', error);
      }
      return undefined;
    }
    return data as UsageCounter;
  }

  async createUsageCounter(usageCounter: InsertUsageCounter): Promise<UsageCounter> {
    const { data, error} = await supabase
      .from('usage_counters')
      .insert(usageCounter)
      .select()
      .single();
    
    if (error) {
      console.error('Supabase createUsageCounter error:', error);
      throw error;
    }
    return data as UsageCounter;
  }

  async incrementUsage(userId: string, periodStart: Date): Promise<UsageCounter> {
    let counter = await this.getUsageCounter(userId, periodStart);
    
    if (!counter) {
      counter = await this.createUsageCounter({
        userId,
        periodStart,
        repliesGenerated: 1,
      });
    } else {
      const { data, error } = await supabase
        .from('usage_counters')
        .update({ replies_generated: counter.repliesGenerated + 1 })
        .eq('user_id', userId)
        .eq('period_start', periodStart.toISOString())
        .select()
        .single();
      
      if (error) {
        console.error('Supabase incrementUsage error:', error);
        throw error;
      }
      counter = data as UsageCounter;
    }
    
    return counter;
  }

  // Reply event operations
  async createReplyEvent(replyEvent: InsertReplyEvent): Promise<ReplyEvent> {
    const { data, error } = await supabase
      .from('reply_events')
      .insert(replyEvent)
      .select()
      .single();
    
    if (error) {
      console.error('Supabase createReplyEvent error:', error);
      throw error;
    }
    return data as ReplyEvent;
  }

  // Feedback operations
  async createFeedback(feedback: InsertFeedback): Promise<Feedback> {
    const { data, error } = await supabase
      .from('feedback')
      .insert(feedback)
      .select()
      .single();
    
    if (error) {
      console.error('Supabase createFeedback error:', error);
      throw error;
    }
    return data as Feedback;
  }

  // Reply history operations
  async createReplyHistory(replyHistory: InsertReplyHistory): Promise<ReplyHistory> {
    const { data, error } = await supabase
      .from('reply_history')
      .insert(replyHistory)
      .select()
      .single();
    
    if (error) {
      console.error('Supabase createReplyHistory error:', error);
      throw error;
    }
    return data as ReplyHistory;
  }

  async getReplyHistory(userId: string, limit: number = 50): Promise<ReplyHistory[]> {
    const { data, error } = await supabase
      .from('reply_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Supabase getReplyHistory error:', error);
      return [];
    }
    return data as ReplyHistory[];
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
      console.error('Supabase markReplyAsUsed error:', error);
      throw error;
    }
  }

  async updateReplyPerformance(replyHistoryId: string, performance: any): Promise<void> {
    const { error } = await supabase
      .from('reply_history')
      .update({ performance_metrics: performance })
      .eq('id', replyHistoryId);
    
    if (error) {
      console.error('Supabase updateReplyPerformance error:', error);
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
        console.error('Supabase getUserPreferences error:', error);
      }
      return undefined;
    }
    return data as UserPreferences;
  }

  async upsertUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences> {
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(preferences, { onConflict: 'user_id' })
      .select()
      .single();
    
    if (error) {
      console.error('Supabase upsertUserPreferences error:', error);
      throw error;
    }
    return data as UserPreferences;
  }
}

export const storage = new SupabaseStorage();

