import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  uuid,
  integer,
  numeric,
  bigserial,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  emailVerified: boolean("email_verified").default(false),
  emailVerifiedAt: timestamp("email_verified_at"),
  
  passwordHash: varchar("password_hash"),
  replitSub: varchar("replit_sub").unique(),
  googleSub: varchar("google_sub").unique(),
  twitterId: varchar("twitter_id").unique(),
  
  authProviders: text("auth_providers").array(),
  primaryAuthProvider: varchar("primary_auth_provider"),
  
  stripeCustomerId: varchar("stripe_customer_id"),
  handle: varchar("handle"),
  avatarUrl: varchar("avatar_url"),
  lastLoginAt: timestamp("last_login_at"),
  trialStart: timestamp("trial_start"),
  trialEnd: timestamp("trial_end"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  planCode: varchar("plan_code").notNull(), // 'weekly', 'monthly'
  status: varchar("status").notNull(),
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  stripeSubscriptionId: varchar("stripe_subscription_id").unique(),
  amountPaid: integer("amount_paid"), // in cents
  currency: varchar("currency"),
  cancelAt: timestamp("cancel_at"),
  cancelReason: text("cancel_reason"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Usage counters table
export const usageCounters = pgTable("usage_counters", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  planCode: varchar("plan_code").notNull(), // 'trial', 'weekly', 'monthly'
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  repliesUsed: integer("replies_used").default(0).notNull(),
  limit: integer("limit").notNull(),
  resetAt: timestamp("reset_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Reply events table for logging
export const replyEvents = pgTable("reply_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  tweetId: varchar("tweet_id"),
  modelKey: varchar("model_key").notNull(),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  latencyMs: integer("latency_ms"),
  costEstimate: numeric("cost_estimate", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Feedback table for quality tracking
export const feedback = pgTable("feedback", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  replyEventId: integer("reply_event_id").references(() => replyEvents.id),
  rating: varchar("rating").notNull(), // 'up' or 'down'
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Zod schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  updatedAt: true,
});

export const insertUsageCounterSchema = createInsertSchema(usageCounters).omit({
  id: true,
  createdAt: true,
});

export const insertReplyEventSchema = createInsertSchema(replyEvents).omit({
  id: true,
  createdAt: true,
});

export const insertFeedbackSchema = createInsertSchema(feedback).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type UsageCounter = typeof usageCounters.$inferSelect;
export type InsertUsageCounter = z.infer<typeof insertUsageCounterSchema>;
export type ReplyEvent = typeof replyEvents.$inferSelect;
export type InsertReplyEvent = z.infer<typeof insertReplyEventSchema>;
export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
