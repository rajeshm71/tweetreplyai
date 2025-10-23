import { storage } from '../storage';
import { db } from '../db';
import { feedback, replyEvents, replyHistory } from '@shared/schema';
import { eq, and, desc, gte, sql, count, avg } from 'drizzle-orm';

export interface FeedbackStats {
  overall_quality: {
    upvotes: number;
    downvotes: number;
    upvote_percentage: number;
  };
  by_prompt: Record<string, {
    upvotes: number;
    downvotes: number;
    upvote_percentage: number;
    total_replies: number;
  }>;
  by_model: Record<string, {
    upvotes: number;
    downvotes: number;
    upvote_percentage: number;
    total_replies: number;
    avg_latency: number;
  }>;
  recent_trends: {
    date: string;
    upvotes: number;
    downvotes: number;
    total_replies: number;
  }[];
  quality_metrics: {
    avg_quality_score: number;
    high_quality_replies: number; // > 80 score
    low_quality_replies: number; // < 60 score
    regeneration_rate: number; // % of replies that needed regeneration
  };
}

export interface QualityMetrics {
  avg_quality_score: number;
  high_quality_replies: number;
  low_quality_replies: number;
  regeneration_rate: number;
  avg_latency: number;
  cost_efficiency: number; // replies per dollar
}

export class FeedbackAnalytics {
  async getFeedbackStats(userId?: string, days: number = 30): Promise<FeedbackStats> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Validate startDate
    if (isNaN(startDate.getTime())) {
      console.error('Invalid startDate created:', startDate);
      throw new Error('Invalid date range provided');
    }

    // Get overall feedback stats
    const overallStats = await this.getOverallFeedbackStats(userId, startDate);
    
    // Get stats by prompt variation
    const byPrompt = await this.getStatsByPrompt(userId, startDate);
    
    // Get stats by model
    const byModel = await this.getStatsByModel(userId, startDate);
    
    // Get recent trends (daily for last 7 days)
    const recentTrends = await this.getRecentTrends(userId, 7);
    
    // Get quality metrics
    const qualityMetrics = await this.getQualityMetrics(userId, startDate);

    return {
      overall_quality: overallStats,
      by_prompt: byPrompt,
      by_model: byModel,
      recent_trends: recentTrends,
      quality_metrics: qualityMetrics
    };
  }

  private async getOverallFeedbackStats(userId?: string, startDate?: Date) {
    let query = db
      .select({
        rating: feedback.rating,
        count: count()
      })
      .from(feedback)
      .innerJoin(replyEvents, eq(feedback.replyEventId, replyEvents.id));

    if (userId) {
      query = query.where(eq(replyEvents.userId, userId));
    }

    if (startDate) {
      query = query.where(gte(feedback.createdAt, startDate));
    }

    const results = await query.groupBy(feedback.rating);

    const upvotes = results.find((r: any) => r.rating === 'up')?.count || 0;
    const downvotes = results.find((r: any) => r.rating === 'down')?.count || 0;
    const total = upvotes + downvotes;

    return {
      upvotes,
      downvotes,
      upvote_percentage: total > 0 ? Math.round((upvotes / total) * 100) : 0
    };
  }

  private async getStatsByPrompt(userId?: string, startDate?: Date) {
    // This would need to be implemented based on how you track prompt variations
    // For now, return empty object as prompt tracking needs to be added to replyEvents
    return {};
  }

  private async getStatsByModel(userId?: string, startDate?: Date) {
    let query = db
      .select({
        modelKey: replyEvents.modelKey,
        rating: feedback.rating,
        count: count(),
        avg_latency: avg(replyEvents.latencyMs)
      })
      .from(feedback)
      .innerJoin(replyEvents, eq(feedback.replyEventId, replyEvents.id));

    if (userId) {
      query = query.where(eq(replyEvents.userId, userId));
    }

    if (startDate) {
      query = query.where(gte(feedback.createdAt, startDate));
    }

    const results = await query.groupBy(replyEvents.modelKey, feedback.rating);

    // Group by model
    const modelStats: Record<string, any> = {};
    
    for (const result of results) {
      if (!modelStats[result.modelKey]) {
        modelStats[result.modelKey] = {
          upvotes: 0,
          downvotes: 0,
          total_replies: 0,
          avg_latency: 0
        };
      }
      
      if (result.rating === 'up') {
        modelStats[result.modelKey].upvotes = result.count;
      } else if (result.rating === 'down') {
        modelStats[result.modelKey].downvotes = result.count;
      }
      
      modelStats[result.modelKey].total_replies += result.count;
      modelStats[result.modelKey].avg_latency = result.avg_latency || 0;
    }

    // Calculate percentages
    for (const model in modelStats) {
      const stats = modelStats[model];
      const total = stats.upvotes + stats.downvotes;
      stats.upvote_percentage = total > 0 ? Math.round((stats.upvotes / total) * 100) : 0;
    }

    return modelStats;
  }

  private async getRecentTrends(userId?: string, days: number = 7) {
    const trends = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      
      // Validate dates before using them
      if (isNaN(startOfDay.getTime()) || isNaN(endOfDay.getTime())) {
        console.error('Invalid date created:', { date, startOfDay, endOfDay });
        continue;
      }

      let query = db
        .select({
          rating: feedback.rating,
          count: count()
        })
        .from(feedback)
        .innerJoin(replyEvents, eq(feedback.replyEventId, replyEvents.id))
        .where(
          and(
            gte(feedback.createdAt, startOfDay),
            sql`${feedback.createdAt} < ${endOfDay}`
          )
        );

      if (userId) {
        query = query.where(eq(replyEvents.userId, userId));
      }

      const results = await query.groupBy(feedback.rating);
      
      const upvotes = results.find((r: any) => r.rating === 'up')?.count || 0;
      const downvotes = results.find((r: any) => r.rating === 'down')?.count || 0;
      
      trends.push({
        date: startOfDay.toISOString().split('T')[0],
        upvotes,
        downvotes,
        total_replies: upvotes + downvotes
      });
    }

    return trends;
  }

  async getQualityMetrics(userId?: string, startDate?: Date) {
    let query = db
      .select({
        avg_quality: avg(replyHistory.qualityScore),
        high_quality: count(sql`CASE WHEN ${replyHistory.qualityScore} > 80 THEN 1 END`),
        low_quality: count(sql`CASE WHEN ${replyHistory.qualityScore} < 60 THEN 1 END`),
        total_replies: count()
      })
      .from(replyHistory);

    if (userId) {
      query = query.where(eq(replyHistory.userId, userId));
    }

    if (startDate) {
      query = query.where(gte(replyHistory.createdAt, startDate));
    }

    const [result] = await query;

    // Calculate regeneration rate (this would need to be tracked in replyEvents)
    // For now, estimate based on quality scores
    const regenerationRate = result.low_quality > 0 ? 
      Math.round((result.low_quality / result.total_replies) * 100) : 0;

    return {
      avg_quality_score: Math.round(result.avg_quality || 0),
      high_quality_replies: result.high_quality,
      low_quality_replies: result.low_quality,
      regeneration_rate: regenerationRate
    };
  }


  async getLowPerformingPatterns(userId?: string, days: number = 30): Promise<string[]> {
    // This would analyze feedback comments and downvoted replies to find patterns
    // For now, return common issues
    return [
      'Too generic responses',
      'Overly formal language',
      'AI-like phrasing',
      'Too short or too long',
      'Sentiment mismatch'
    ];
  }

  async getRecommendations(userId?: string): Promise<string[]> {
    const stats = await this.getFeedbackStats(userId, 30);
    const recommendations: string[] = [];

    if (stats.overall_quality.upvote_percentage < 70) {
      recommendations.push('Consider using more specific and engaging language');
    }

    if (stats.quality_metrics.regeneration_rate > 20) {
      recommendations.push('Quality checker is regenerating too many replies - consider prompt improvements');
    }

    if (stats.quality_metrics.avg_quality_score < 75) {
      recommendations.push('Focus on improving reply quality through better context analysis');
    }

    return recommendations;
  }
}

export const feedbackAnalytics = new FeedbackAnalytics();
