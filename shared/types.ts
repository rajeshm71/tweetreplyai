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
  xUsername?: string | null;
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
  xUsername?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Subscription {
  id: string;
  userId: string;
  dodoSubscriptionId: string;
  planCode: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'failed';
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
  status: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'failed';
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
  /** Counter used for analytics/display only; quota enforcement is credits-based. */
  repliesUsed: number;
  creditsUsed: number;
  limit: number; // Now represents credits limit
  resetAt: Date;
  createdAt: Date;
  updatedAt: Date;
  modeBreakdown?: {
    'single-sentence'?: { credits: number; replies?: number };
    'enhanced'?: { credits: number; replies?: number };
    'improve'?: { credits: number; replies?: number };
    'reframe'?: { credits: number; replies?: number };
  };
}

export interface InsertUsageCounter {
  id: string;
  userId: string;
  planCode: string;
  periodStart: Date;
  periodEnd: Date;
  /** Counter used for analytics/display only; quota enforcement is credits-based. */
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
  userId: string;
  replyEventId: string;
  rating: 'up' | 'down';
  comment?: string;
  createdAt: Date;
}

export interface InsertFeedback {
  /** DB may auto-generate bigint id when omitted */
  id?: string;
  userId: string;
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

export interface ReplyTokensStageEntry {
  stage: string;
  modelKey: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
  cost: number;
  latencyMs?: number;
  rawUsage?: Record<string, unknown>;
}

export interface ReplyTokens {
  id: string;
  userId: string;
  replyHistoryId: string;
  stageBreakdown: ReplyTokensStageEntry[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCost: number;
  createdAt: Date;
}

export interface InsertReplyTokens {
  id?: string;
  userId: string;
  replyHistoryId: string;
  stageBreakdown: ReplyTokensStageEntry[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCost: number;
  createdAt?: Date;
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

export interface UserEmailPreferences {
  userId: string;
  usageAlerts: boolean;
  productTips: boolean;
  marketing: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertUserEmailPreferences {
  userId: string;
  usageAlerts?: boolean;
  productTips?: boolean;
  marketing?: boolean;
}

export interface EmailSendLog {
  id: string;
  userId: string;
  templateKey: string;
  idempotencyKey: string;
  status: string;
  resendMessageId?: string;
  abVariant?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  previewText?: string;
  templateKey: string;
  contentJson: Record<string, unknown>;
  segment: 'all' | 'paid' | 'trial' | 'inactive_7d';
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'canceled';
  resendBroadcastId?: string;
  scheduledAt?: Date;
  sentAt?: Date;
  recipientCount?: number;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertEmailCampaign {
  name: string;
  subject: string;
  previewText?: string;
  templateKey: string;
  contentJson: Record<string, unknown>;
  segment?: 'all' | 'paid' | 'trial' | 'inactive_7d';
  scheduledAt?: Date;
  createdBy?: string;
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
