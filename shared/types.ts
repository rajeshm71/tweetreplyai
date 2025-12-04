// Type definitions only - no drizzle-orm imports
export interface User {
  id: string;
  email: string;
  password?: string;
  googleSub?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  dodoCustomerId?: string;
  authProviders?: string[];
  hasUsedTrial?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertUser {
  id: string;
  email: string;
  password?: string;
  googleSub?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  dodoCustomerId?: string;
  authProviders?: string[];
  hasUsedTrial?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Subscription {
  id: string;
  userId: string;
  dodoSubscriptionId: string;
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
  dodoSubscriptionId: string;
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
  repliesUsed: number; // Keep for analytics
  creditsUsed: number; // NEW - for limit tracking
  limit: number; // Now represents credits limit
  resetAt: Date;
  createdAt: Date;
  updatedAt: Date;
  modeBreakdown?: {
    'single-sentence'?: { replies: number; credits: number };
    'base'?: { replies: number; credits: number };
    'enhanced'?: { replies: number; credits: number };
  };
}

export interface InsertUsageCounter {
  id: string;
  userId: string;
  planCode: string;
  periodStart: Date;
  periodEnd: Date;
  repliesUsed?: number;
  creditsUsed?: number; // NEW
  limit: number;
  resetAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
  modeBreakdown?: UsageCounter['modeBreakdown'];
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
  replyMode?: string;
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
  replyMode?: string;
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
  promptStyleEnabled: boolean;
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
  promptStyleEnabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SimpleAnalytics {
  summary: {
    avgQuality: number;
    qualityTrend: number; // +/- vs previous period
    totalReplies: number;
    timeSavedHours: number; // Changed from minutes to hours
    highQualityCount: number; // score > 80
  };
  parameterBreakdown: Array<{
    name: string;
    avgScore: number;
  }>;
  activityTrend: Array<{
    date: string;
    count: number;
    avgQuality: number;
  }>;
  insights: Array<{
    text: string;
    type: 'success' | 'info' | 'streak'; // for icon/color
  }>;
}
