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

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleSub(googleSub: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  
  // Subscription operations
  getActiveSubscription(userId: string): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(subscriptionId: string, updates: Partial<Subscription>): Promise<void>;
  getSubscriptionByDodoId(dodoSubscriptionId: string): Promise<Subscription | undefined>;
  getUserSubscriptions(userId: string): Promise<Subscription[]>;
  
  // Usage counter operations
  getUsageCounter(userId: string, periodStart: Date): Promise<UsageCounter | undefined>;
  getActiveTrialCounter(userId: string): Promise<UsageCounter | undefined>;
  createUsageCounter(usageCounter: InsertUsageCounter): Promise<UsageCounter>;
  updateUsageCounter(counterId: string, updates: Partial<UsageCounter>): Promise<void>;
  incrementUsage(userId: string, periodStart: Date, creditCost: number, replyMode?: string, existingCounter?: UsageCounter): Promise<UsageCounter>;
  
  // Reply event operations
  createReplyEvent(replyEvent: InsertReplyEvent): Promise<ReplyEvent>;
  
  // Feedback operations
  createFeedback(feedback: InsertFeedback): Promise<Feedback>;
  
  // Reply history operations
  createReplyHistory(replyHistory: InsertReplyHistory): Promise<ReplyHistory>;
  getReplyHistory(userId: string, limit?: number): Promise<ReplyHistory[]>;
  markReplyAsUsed(replyHistoryId: string, tweetUrl?: string): Promise<void>;
  
  // User preferences operations
  getUserPreferences(userId: string): Promise<UserPreferences | undefined>;
  upsertUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences>;
}

// DatabaseStorage class removed - we now use Supabase JS client

// Use Supabase JS client instead of raw Postgres for serverless compatibility
import { storage as supabaseStorage } from './storage-supabase.js';
export const storage = supabaseStorage;
