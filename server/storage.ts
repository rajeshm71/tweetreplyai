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
  UserPreferences,
  InsertUserPreferences,
  UserEmailPreferences,
  UpsertUserEmailPreferences,
  EmailSendLog,
  EmailCampaign,
  InsertEmailCampaign,
  XProfile,
  XFollowerState,
  XFollowEvent,
  XFollowStatsDaily,
  XFollowerSyncInput,
  XProfileSyncStatus,
  XFollowEventType,
} from "../shared/types.js";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleSub(googleSub: string): Promise<User | undefined>;
  setUserResetToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  clearUserResetToken(userId: string): Promise<void>;
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

  // Reply tokens operations
  createReplyTokens(entry: InsertReplyTokens): Promise<ReplyTokens>;

  // User preferences operations
  getUserPreferences(userId: string): Promise<UserPreferences | undefined>;
  upsertUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences>;

  // Email preferences operations
  getEmailPreferences(userId: string): Promise<UserEmailPreferences | null>;
  upsertEmailPreferences(data: UpsertUserEmailPreferences): Promise<UserEmailPreferences>;

  // Email send log (idempotency)
  logEmailSend(
    entry: Omit<EmailSendLog, 'id' | 'createdAt'>,
  ): Promise<'inserted' | 'claimed_failed_retry' | 'duplicate'>;
  updateEmailSendLog(idempotencyKey: string, updates: { status?: string; resendMessageId?: string }): Promise<void>;
  /** Update by Resend email id from webhooks; no-op if no row matches (do not throw). */
  updateEmailSendLogByResendMessageId(
    resendMessageId: string,
    updates: { status?: string }
  ): Promise<void>;
  countRecentEmails(userId: string, withinHours: number): Promise<number>;
  countMonthlyEmails(userId: string): Promise<number>;

  // Email campaigns
  createEmailCampaign(campaign: InsertEmailCampaign): Promise<EmailCampaign>;
  getEmailCampaign(id: string): Promise<EmailCampaign | null>;
  listEmailCampaigns(): Promise<EmailCampaign[]>;
  updateEmailCampaign(id: string, updates: Partial<EmailCampaign>): Promise<EmailCampaign>;
  deleteEmailCampaign(id: string): Promise<void>;
  getUsersForSegment(segment: EmailCampaign['segment']): Promise<User[]>;

  // Extension telemetry
  insertExtensionTelemetryEvents(events: InsertExtensionTelemetryEvent[]): Promise<number>;
  listExtensionTelemetryEvents(sinceMs: number, limit?: number): Promise<ExtensionTelemetryRow[]>;

  // X follower tracking
  getXProfileByUserId(userId: string): Promise<XProfile | undefined>;
  upsertXProfile(userId: string, xUsername: string): Promise<XProfile>;
  updateXProfile(profileId: string, updates: Partial<XProfile>): Promise<XProfile>;
  insertFollowerSyncStaging(
    syncJobId: string,
    xProfileId: string,
    followers: XFollowerSyncInput[],
  ): Promise<number>;
  getStagingFollowerIds(syncJobId: string): Promise<string[]>;
  getStagingFollowers(syncJobId: string): Promise<XFollowerSyncInput[]>;
  getActiveFollowerIds(xProfileId: string): Promise<string[]>;
  getActiveFollowerStatesByIds(
    xProfileId: string,
    followerXUserIds: string[],
  ): Promise<XFollowerState[]>;
  /** First sync: seed follower states without generating follow/unfollow events. */
  establishFollowerBaseline(
    xProfileId: string,
    followers: XFollowerSyncInput[],
    totalActive: number,
  ): Promise<void>;
  applyFollowerDiff(
    xProfileId: string,
    syncJobId: string,
    newFollows: XFollowerSyncInput[],
    unfollows: Array<{ followerXUserId: string; followerUsername: string; firstSeenAt?: Date }>,
    totalActive: number,
  ): Promise<{ newFollowers: number; unfollowers: number }>;
  clearFollowerSyncStaging(syncJobId: string): Promise<void>;
  getFollowEvents(
    xProfileId: string,
    options: { eventType?: XFollowEventType; since?: Date; limit?: number },
  ): Promise<XFollowEvent[]>;
  getFollowStatsDaily(
    xProfileId: string,
    since: Date,
  ): Promise<XFollowStatsDaily[]>;
  getFollowStatsDailyForDate(
    xProfileId: string,
    date: string,
  ): Promise<XFollowStatsDaily | undefined>;
  countActiveFollowers(xProfileId: string): Promise<number>;
  countFollowEventsSince(
    xProfileId: string,
    eventType: XFollowEventType,
    since: Date,
  ): Promise<number>;
  getUnfollowDayOfWeekPattern(xProfileId: string, since: Date): Promise<Array<{ day: number; count: number }>>;
  getAvgUnfollowDurationDays(xProfileId: string, since: Date): Promise<number | null>;
}

export interface InsertExtensionTelemetryEvent {
  userId?: string | null;
  eventType: string;
  surface?: string | null;
  extensionVersion?: string | null;
  route?: string | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  context?: Record<string, unknown> | null;
  clientTimestamp?: string | null;
}

export interface ExtensionTelemetryRow {
  id: number;
  userId: string | null;
  eventType: string;
  surface: string | null;
  extensionVersion: string | null;
  route: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  context: Record<string, unknown> | null;
  clientTimestamp: string | null;
  receivedAt: string;
}

// DatabaseStorage class removed - we now use Supabase JS client

// Use Supabase JS client instead of raw Postgres for serverless compatibility
import { storage as supabaseStorage } from './storage-supabase.js';
export const storage = supabaseStorage;
