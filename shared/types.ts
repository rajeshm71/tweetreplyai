// Type definitions only - no drizzle-orm imports
export interface User {
  id: string;
  email: string;
  password?: string;
  googleSub?: string;
  stripeCustomerId?: string;
  authProviders?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertUser {
  id: string;
  email: string;
  password?: string;
  googleSub?: string;
  stripeCustomerId?: string;
  authProviders?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Subscription {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  planCode: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  amountPaid?: number;
  currency?: string;
  cancelAt?: Date;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertSubscription {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  planCode: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  amountPaid?: number;
  currency?: string;
  cancelAt?: Date;
  cancelReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UsageCounter {
  id: string;
  userId: string;
  planCode: string;
  periodStart: Date;
  periodEnd: Date;
  repliesUsed: number;
  limit: number;
  resetAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertUsageCounter {
  id: string;
  userId: string;
  planCode: string;
  periodStart: Date;
  periodEnd: Date;
  repliesUsed: number;
  limit: number;
  resetAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ReplyEvent {
  id: string;
  userId: string;
  modelKey: string;
  promptKey: string;
  latencyMs: number;
  tokensUsed: number;
  cost: number;
  createdAt: Date;
}

export interface InsertReplyEvent {
  id: string;
  userId: string;
  modelKey: string;
  promptKey: string;
  latencyMs: number;
  tokensUsed: number;
  cost: number;
  createdAt?: Date;
}

export interface Feedback {
  id: string;
  replyEventId: string;
  rating: 'up' | 'down';
  comment?: string;
  createdAt: Date;
}

export interface InsertFeedback {
  id: string;
  replyEventId: string;
  rating: 'up' | 'down';
  comment?: string;
  createdAt?: Date;
}

export interface ReplyHistory {
  id: string;
  userId: string;
  originalTweet: string;
  generatedReply: string;
  promptKey: string;
  modelKey: string;
  qualityScore?: number;
  wasUsed: boolean;
  usedAt?: Date;
  tweetUrl?: string;
  performance?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertReplyHistory {
  id: string;
  userId: string;
  originalTweet: string;
  generatedReply: string;
  promptKey: string;
  modelKey: string;
  qualityScore?: number;
  wasUsed?: boolean;
  usedAt?: Date;
  tweetUrl?: string;
  performance?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserPreferences {
  id: string;
  userId: string;
  tone: string;
  length: string;
  style: string;
  topics: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertUserPreferences {
  id: string;
  userId: string;
  tone: string;
  length: string;
  style: string;
  topics: string[];
  createdAt?: Date;
  updatedAt?: Date;
}
