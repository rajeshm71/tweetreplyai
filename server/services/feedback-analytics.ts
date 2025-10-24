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
}

export const feedbackAnalytics = new FeedbackAnalytics();
