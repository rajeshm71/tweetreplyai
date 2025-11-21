import { storage } from '../storage.js';
import { supabase } from '../supabase.js';

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
    let query = supabase
      .from('feedback')
      .select('rating, reply_events!inner(user_id)')
      .eq('reply_events.user_id', userId);

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching feedback stats:', error);
      return { upvotes: 0, downvotes: 0, upvote_percentage: 0 };
    }

    const upvotes = data?.filter((r: any) => r.rating === 'up').length || 0;
    const downvotes = data?.filter((r: any) => r.rating === 'down').length || 0;
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
    let query = supabase
      .from('feedback')
      .select('rating, reply_events!inner(user_id, model_key, latency_ms)')
      .eq('reply_events.user_id', userId);

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching model stats:', error);
      return {};
    }

    // Group by model
    const modelStats: Record<string, any> = {};
    
    for (const item of data || []) {
      const modelKey = item.reply_events?.model_key || 'unknown';
      const rating = item.rating;
      const latency = item.reply_events?.latency_ms || 0;
      
      if (!modelStats[modelKey]) {
        modelStats[modelKey] = {
          upvotes: 0,
          downvotes: 0,
          total_replies: 0,
          avg_latency: 0,
          latency_sum: 0
        };
      }
      
      if (rating === 'up') {
        modelStats[modelKey].upvotes++;
      } else if (rating === 'down') {
        modelStats[modelKey].downvotes++;
      }
      
      modelStats[modelKey].total_replies++;
      modelStats[modelKey].latency_sum += latency;
    }

    // Calculate percentages and average latency
    for (const model in modelStats) {
      const stats = modelStats[model];
      const total = stats.upvotes + stats.downvotes;
      stats.upvote_percentage = total > 0 ? Math.round((stats.upvotes / total) * 100) : 0;
      stats.avg_latency = stats.total_replies > 0 ? Math.round(stats.latency_sum / stats.total_replies) : 0;
      delete stats.latency_sum; // Clean up
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

      let query = supabase
        .from('feedback')
        .select('rating, reply_events!inner(user_id)')
        .eq('reply_events.user_id', userId)
        .gte('created_at', startOfDay.toISOString())
        .lt('created_at', endOfDay.toISOString());

      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching trends for date:', startOfDay.toISOString(), error);
        continue;
      }
      
      const upvotes = data?.filter((r: any) => r.rating === 'up').length || 0;
      const downvotes = data?.filter((r: any) => r.rating === 'down').length || 0;
      
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
    let query = supabase
      .from('reply_history')
      .select('quality_score, created_at')
      .eq('user_id', userId);

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching quality metrics:', error);
      return {
        avg_quality_score: 0,
        high_quality_replies: 0,
        low_quality_replies: 0,
        regeneration_rate: 0
      };
    }

    const scores = data?.map((r: any) => r.quality_score).filter((s: number) => s != null) || [];
    const avgQuality = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
    const highQuality = scores.filter((s: number) => s > 80).length;
    const lowQuality = scores.filter((s: number) => s < 60).length;
    const totalReplies = scores.length;

    // Calculate regeneration rate (this would need to be tracked in replyEvents)
    // For now, estimate based on quality scores
    const regenerationRate = lowQuality > 0 ? 
      Math.round((lowQuality / totalReplies) * 100) : 0;

    return {
      avg_quality_score: Math.round(avgQuality),
      high_quality_replies: highQuality,
      low_quality_replies: lowQuality,
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

  async getSimpleAnalytics(userId?: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Validate startDate
    if (isNaN(startDate.getTime())) {
      console.error('Invalid startDate created:', startDate);
      throw new Error('Invalid date range provided');
    }

    // Calculate previous period for trend comparison
    const previousPeriodStart = new Date(startDate);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - days);

    // Query reply history for the current period
    let currentQuery = supabase
      .from('reply_history')
      .select('id, quality_score, performance, created_at, original_tweet')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString());

    const { data: currentData, error: currentError } = await currentQuery;
    
    if (currentError) {
      console.error('Error fetching current period analytics:', currentError);
      return this.getEmptyAnalytics();
    }

    // Query reply history for the previous period (for trend)
    let previousQuery = supabase
      .from('reply_history')
      .select('quality_score')
      .eq('user_id', userId)
      .gte('created_at', previousPeriodStart.toISOString())
      .lt('created_at', startDate.toISOString());

    const { data: previousData, error: previousError } = await previousQuery;

    // Calculate summary metrics
    const scores = currentData?.map((r: any) => r.quality_score).filter((s: number) => s != null) || [];
    const avgQuality = scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;
    const totalReplies = currentData?.length || 0;
    const timeSavedMinutes = totalReplies * 2; // 2 minutes per reply estimate
    const highQualityCount = scores.filter((s: number) => s > 80).length;

    // Calculate quality trend
    const previousScores = previousData?.map((r: any) => r.quality_score).filter((s: number) => s != null) || [];
    const previousAvgQuality = previousScores.length > 0 ? Math.round(previousScores.reduce((a: number, b: number) => a + b, 0) / previousScores.length) : 0;
    const qualityTrend = avgQuality - previousAvgQuality;

    // Extract and aggregate quality parameters
    const parameterBreakdown = this.aggregateQualityParameters(currentData || []);

    // Calculate daily activity trend (last 7 days)
    const activityTrend = this.calculateActivityTrend(currentData || [], 7);

    // Generate user-focused insights
    const insights = this.generateUserInsights({
      avgQuality,
      qualityTrend,
      totalReplies,
      timeSavedMinutes,
      highQualityCount,
      activityTrend,
      days
    });

    return {
      summary: {
        avgQuality,
        qualityTrend,
        totalReplies,
        timeSavedMinutes,
        highQualityCount
      },
      parameterBreakdown,
      activityTrend,
      insights
    };
  }

  private getEmptyAnalytics() {
    return {
      summary: {
        avgQuality: 0,
        qualityTrend: 0,
        totalReplies: 0,
        timeSavedMinutes: 0,
        highQualityCount: 0
      },
      parameterBreakdown: [],
      activityTrend: [],
      insights: [{
        text: "Generate your first reply to see your analytics!",
        type: 'info' as const
      }]
    };
  }

  private aggregateQualityParameters(data: any[]): Array<{ name: string; avgScore: number }> {
    // Extract all quality parameters from performance field
    const parameterSums: Record<string, { total: number; count: number }> = {};
    
    for (const reply of data) {
      if (reply.performance && reply.performance.qualityParameters) {
        for (const param of reply.performance.qualityParameters) {
          if (!parameterSums[param.name]) {
            parameterSums[param.name] = { total: 0, count: 0 };
          }
          parameterSums[param.name].total += param.score || 0;
          parameterSums[param.name].count += 1;
        }
      }
    }

    // Calculate averages and sort by average score
    const breakdown = Object.entries(parameterSums)
      .map(([name, { total, count }]) => ({
        name,
        avgScore: Math.round((total / count) * 10) / 10 // Round to 1 decimal
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    return breakdown;
  }

  private calculateActivityTrend(data: any[], days: number): Array<{ date: string; count: number }> {
    const trend: Array<{ date: string; count: number }> = [];
    const countByDate: Record<string, number> = {};

    // Count replies by date
    for (const reply of data) {
      const date = new Date(reply.created_at).toISOString().split('T')[0];
      countByDate[date] = (countByDate[date] || 0) + 1;
    }

    // Generate trend for last N days
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      trend.push({
        date: dateStr,
        count: countByDate[dateStr] || 0
      });
    }

    return trend;
  }

  private generateUserInsights(stats: any): Array<{ text: string; type: 'success' | 'info' | 'streak' }> {
    const insights: Array<{ text: string; type: 'success' | 'info' | 'streak' }> = [];

    // Activity insight
    if (stats.totalReplies > 0) {
      insights.push({
        text: `You've generated ${stats.totalReplies} ${stats.totalReplies === 1 ? 'reply' : 'replies'} this ${stats.days === 7 ? 'week' : 'month'} - ${stats.totalReplies > 20 ? 'excellent' : 'great'} engagement!`,
        type: 'info'
      });
    }

    // Quality trend insight
    if (stats.qualityTrend > 5) {
      insights.push({
        text: `Your reply quality improved by ${stats.qualityTrend} points this period 📈`,
        type: 'success'
      });
    } else if (stats.qualityTrend < -5) {
      insights.push({
        text: `Quality dipped by ${Math.abs(stats.qualityTrend)} points - consider reviewing your replies`,
        type: 'info'
      });
    }

    // High quality milestone
    if (stats.highQualityCount > 0) {
      insights.push({
        text: `${stats.highQualityCount} high-quality ${stats.highQualityCount === 1 ? 'reply' : 'replies'} (80+) this period - excellent work!`,
        type: 'success'
      });
    }

    // Time saved insight
    if (stats.timeSavedMinutes > 0) {
      const hours = Math.floor(stats.timeSavedMinutes / 60);
      const minutes = stats.timeSavedMinutes % 60;
      const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes} minutes`;
      insights.push({
        text: `You've saved approximately ${timeStr} using TweetReply`,
        type: 'info'
      });
    }

    // Most productive day (from activity trend)
    if (stats.activityTrend && stats.activityTrend.length > 0) {
      const maxDay = stats.activityTrend.reduce((max: any, day: any) => 
        day.count > (max?.count || 0) ? day : max, null);
      
      if (maxDay && maxDay.count > 3) {
        const dayName = new Date(maxDay.date).toLocaleDateString('en-US', { weekday: 'long' });
        insights.push({
          text: `You're most productive on ${dayName}s (${maxDay.count} replies)`,
          type: 'info'
        });
      }
    }

    // Streak detection (consecutive days with replies)
    if (stats.activityTrend && stats.activityTrend.length > 0) {
      let currentStreak = 0;
      for (let i = stats.activityTrend.length - 1; i >= 0; i--) {
        if (stats.activityTrend[i].count > 0) {
          currentStreak++;
        } else {
          break;
        }
      }
      
      if (currentStreak >= 3) {
        insights.push({
          text: `${currentStreak}-day streak! Keep it going 🔥`,
          type: 'streak'
        });
      }
    }

    // If no insights, provide encouragement
    if (insights.length === 0) {
      insights.push({
        text: "Keep using TweetReply to unlock insights about your reply patterns!",
        type: 'info'
      });
    }

    return insights;
  }
}

export const feedbackAnalytics = new FeedbackAnalytics();
