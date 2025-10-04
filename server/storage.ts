import {
  users,
  subscriptions,
  usageCounters,
  replyEvents,
  feedback,
  type User,
  type UpsertUser,
  type Subscription,
  type InsertSubscription,
  type UsageCounter,
  type InsertUsageCounter,
  type ReplyEvent,
  type InsertReplyEvent,
  type Feedback,
  type InsertFeedback,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lt, sql, or } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleSub(googleSub: string): Promise<User | undefined>;
  getUserByReplitSub(replitSub: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  addAuthProvider(userId: string, provider: string): Promise<void>;
  removeAuthProvider(userId: string, provider: string): Promise<void>;
  
  // Subscription operations
  getActiveSubscription(userId: string): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(subscriptionId: string, updates: Partial<Subscription>): Promise<void>;
  getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | undefined>;
  
  // Usage counter operations
  getUsageCounter(userId: string, periodStart: Date): Promise<UsageCounter | undefined>;
  createUsageCounter(usageCounter: InsertUsageCounter): Promise<UsageCounter>;
  incrementUsage(userId: string, periodStart: Date): Promise<UsageCounter>;
  
  // Reply event operations
  createReplyEvent(replyEvent: InsertReplyEvent): Promise<ReplyEvent>;
  
  // Feedback operations
  createFeedback(feedback: InsertFeedback): Promise<Feedback>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByGoogleSub(googleSub: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleSub, googleSub));
    return user;
  }

  async getUserByReplitSub(replitSub: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.replitSub, replitSub));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async addAuthProvider(userId: string, provider: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) throw new Error('User not found');
    
    const providers = user.authProviders || [];
    if (!providers.includes(provider)) {
      await db
        .update(users)
        .set({ 
          authProviders: [...providers, provider],
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));
    }
  }

  async removeAuthProvider(userId: string, provider: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) throw new Error('User not found');
    
    const providers = user.authProviders || [];
    await db
      .update(users)
      .set({ 
        authProviders: providers.filter(p => p !== provider),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  // Subscription operations
  async getActiveSubscription(userId: string): Promise<Subscription | undefined> {
    const now = new Date();
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active'),
          gte(subscriptions.currentPeriodEnd, now)
        )
      )
      .orderBy(desc(subscriptions.currentPeriodEnd))
      .limit(1);
    return subscription;
  }

  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const [newSubscription] = await db
      .insert(subscriptions)
      .values(subscription)
      .returning();
    return newSubscription;
  }

  async updateSubscription(subscriptionId: string, updates: Partial<Subscription>): Promise<void> {
    await db
      .update(subscriptions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(subscriptions.id, subscriptionId));
  }

  async getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | undefined> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
    return subscription;
  }

  // Usage counter operations
  async getUsageCounter(userId: string, periodStart: Date): Promise<UsageCounter | undefined> {
    const [counter] = await db
      .select()
      .from(usageCounters)
      .where(
        and(
          eq(usageCounters.userId, userId),
          eq(usageCounters.periodStart, periodStart)
        )
      );
    return counter;
  }

  async createUsageCounter(usageCounter: InsertUsageCounter): Promise<UsageCounter> {
    const [newCounter] = await db
      .insert(usageCounters)
      .values(usageCounter)
      .returning();
    return newCounter;
  }

  async incrementUsage(userId: string, periodStart: Date): Promise<UsageCounter> {
    const [counter] = await db
      .update(usageCounters)
      .set({
        repliesUsed: sql`${usageCounters.repliesUsed} + 1`,
      })
      .where(
        and(
          eq(usageCounters.userId, userId),
          eq(usageCounters.periodStart, periodStart)
        )
      )
      .returning();
    return counter;
  }

  // Reply event operations
  async createReplyEvent(replyEvent: InsertReplyEvent): Promise<ReplyEvent> {
    const [newEvent] = await db
      .insert(replyEvents)
      .values(replyEvent)
      .returning();
    return newEvent;
  }

  // Feedback operations
  async createFeedback(feedbackData: InsertFeedback): Promise<Feedback> {
    const [newFeedback] = await db
      .insert(feedback)
      .values(feedbackData)
      .returning();
    return newFeedback;
  }
}

export const storage = new DatabaseStorage();
