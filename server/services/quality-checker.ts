export interface QualityCheckResult {
  passed: boolean;
  score: number; // 0-100
  issues: string[];
  suggestions: string[];
}

export interface QualityMetrics {
  length: number;
  wordCount: number;
  hasEmojis: boolean;
  hasHashtags: boolean;
  hasMentions: boolean;
  sentiment: 'positive' | 'negative' | 'neutral';
  complexity: 'simple' | 'medium' | 'complex';
}

export class QualityChecker {
  private readonly BAD_PATTERNS = [
    // Generic responses
    /^(great|awesome|nice|cool|interesting|thanks?|thank you|good point|i agree|exactly|totally|absolutely|definitely|sure|right|yes|no)$/i,
    
    // AI-like responses
    /^(as an ai|i'm an ai|i'm a language model|i'm a bot|i'm an assistant)/i,
    /^(i can't|i cannot|i'm not able to|i'm unable to)/i,
    /^(i don't have|i don't possess|i don't know)/i,
    
    // Overly formal
    /^(i would like to|i would be happy to|i would be delighted to)/i,
    /^(please let me know|please feel free to|please don't hesitate to)/i,
    
    // Repetitive patterns
    /^(that's|this is|it's) (great|awesome|amazing|wonderful|fantastic|excellent|brilliant|perfect|incredible|outstanding)/i,
    
    // Question patterns that are too generic
    /^(what do you think|what's your opinion|how do you feel|what are your thoughts)/i,
    
    // Overly enthusiastic
    /^(wow|omg|amazing|incredible|mind-blowing|game-changing|revolutionary|groundbreaking)/i,
    
    // Too many exclamation marks
    /!{2,}/,
    
    // All caps
    /^[A-Z\s]{10,}$/,
    
    // Too many hashtags
    /#\w+.*#\w+.*#\w+/,
    
    // URLs in replies (usually not good)
    /https?:\/\/[^\s]+/,
    
    // Too long for Twitter
    /.{281,}/,
    
    // Empty or too short
    /^.{0,2}$/,
    
    // Only emojis
    /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\s]*$/u
  ];

  private readonly GOOD_PATTERNS = [
    // Personal responses
    /^(i|i've|i'm|i'll|i'd|my|me|myself)/i,
    
    // Specific reactions
    /^(this|that|here|there|now|then|so|but|and|or|because|since|although)/i,
    
    // Questions that show engagement
    /^(have you|did you|do you|are you|will you|can you|could you|would you)/i,
    
    // Casual language
    /^(yeah|yep|nope|nah|sure|ok|okay|alright|right|exactly|totally|absolutely)/i,
    
    // Short and direct
    /^.{10,50}$/,
    
    // Natural contractions
    /(don't|can't|won't|wouldn't|shouldn't|couldn't|isn't|aren't|wasn't|weren't)/i
  ];

  checkQuality(reply: string, originalTweet: string): QualityCheckResult {
    const metrics = this.analyzeMetrics(reply);
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    // Check for bad patterns
    for (const pattern of this.BAD_PATTERNS) {
      if (pattern.test(reply)) {
        issues.push(`Contains problematic pattern: ${pattern.source}`);
        score -= 20;
      }
    }

    // Check length appropriateness
    if (metrics.length < 10) {
      issues.push('Reply is too short');
      score -= 15;
      suggestions.push('Add more substance to your reply');
    } else if (metrics.length > 200) {
      issues.push('Reply is too long for Twitter');
      score -= 10;
      suggestions.push('Keep it under 200 characters');
    }

    // Check word count
    if (metrics.wordCount < 3) {
      issues.push('Too few words');
      score -= 20;
    } else if (metrics.wordCount > 30) {
      issues.push('Too many words for a casual reply');
      score -= 10;
      suggestions.push('Try to be more concise');
    }

    // Check for generic responses
    if (this.isGenericResponse(reply)) {
      issues.push('Response is too generic');
      score -= 25;
      suggestions.push('Add something specific or personal');
    }

    // Check for AI-like language
    if (this.isAILikeResponse(reply)) {
      issues.push('Response sounds too AI-like');
      score -= 30;
      suggestions.push('Use more natural, human language');
    }

    // Check for good patterns (bonus points)
    let hasGoodPatterns = false;
    for (const pattern of this.GOOD_PATTERNS) {
      if (pattern.test(reply)) {
        hasGoodPatterns = true;
        break;
      }
    }

    if (hasGoodPatterns) {
      score += 10;
    }

    // Check sentiment appropriateness
    if (this.isSentimentMismatch(reply, originalTweet)) {
      issues.push('Sentiment doesn\'t match the original tweet');
      score -= 15;
      suggestions.push('Match the tone of the original tweet');
    }

    // Check for engagement
    if (this.lacksEngagement(reply)) {
      issues.push('Response lacks engagement');
      score -= 10;
      suggestions.push('Ask a question or share an opinion');
    }

    // Ensure score is within bounds
    score = Math.max(0, Math.min(100, score));

    return {
      passed: score >= 60, // Minimum passing score
      score,
      issues,
      suggestions
    };
  }

  private analyzeMetrics(reply: string): QualityMetrics {
    const words = reply.split(/\s+/).filter(word => word.length > 0);
    
    return {
      length: reply.length,
      wordCount: words.length,
      hasEmojis: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(reply),
      hasHashtags: /#\w+/.test(reply),
      hasMentions: /@\w+/.test(reply),
      sentiment: this.analyzeSentiment(reply),
      complexity: this.analyzeComplexity(reply)
    };
  }

  private isGenericResponse(reply: string): boolean {
    const genericResponses = [
      'great', 'awesome', 'nice', 'cool', 'interesting', 'thanks', 'thank you',
      'good point', 'i agree', 'exactly', 'totally', 'absolutely', 'definitely',
      'sure', 'right', 'yes', 'no', 'wow', 'amazing', 'incredible'
    ];
    
    const lowerReply = reply.toLowerCase().trim();
    return genericResponses.includes(lowerReply);
  }

  private isAILikeResponse(reply: string): boolean {
    const aiPatterns = [
      /as an ai/i,
      /i'm an ai/i,
      /i'm a language model/i,
      /i'm a bot/i,
      /i'm an assistant/i,
      /i can't/i,
      /i cannot/i,
      /i'm not able to/i,
      /i'm unable to/i,
      /i don't have/i,
      /i don't possess/i,
      /i don't know/i,
      /i would like to/i,
      /i would be happy to/i,
      /i would be delighted to/i,
      /please let me know/i,
      /please feel free to/i,
      /please don't hesitate to/i
    ];
    
    return aiPatterns.some(pattern => pattern.test(reply));
  }

  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const positiveWords = ['great', 'awesome', 'love', 'amazing', 'fantastic', 'wonderful', 'brilliant', 'perfect', 'best', 'excellent'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'horrible', 'disgusting', 'stupid', 'annoying', 'frustrating'];
    
    const lowerText = text.toLowerCase();
    const positiveCount = positiveWords.reduce((count, word) => count + (lowerText.includes(word) ? 1 : 0), 0);
    const negativeCount = negativeWords.reduce((count, word) => count + (lowerText.includes(word) ? 1 : 0), 0);
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  private analyzeComplexity(reply: string): 'simple' | 'medium' | 'complex' {
    const words = reply.split(/\s+/);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    
    if (words.length < 5 || avgWordLength < 4) return 'simple';
    if (words.length > 15 || avgWordLength > 6) return 'complex';
    return 'medium';
  }

  private isSentimentMismatch(reply: string, originalTweet: string): boolean {
    const replySentiment = this.analyzeSentiment(reply);
    const originalSentiment = this.analyzeSentiment(originalTweet);
    
    // If original is negative and reply is overly positive, that's a mismatch
    if (originalSentiment === 'negative' && replySentiment === 'positive') {
      return reply.toLowerCase().includes('great') || reply.toLowerCase().includes('awesome');
    }
    
    return false;
  }

  private lacksEngagement(reply: string): boolean {
    // Check if reply has questions, opinions, or personal elements
    const hasQuestion = /\?/.test(reply);
    const hasOpinion = /^(i think|i believe|i feel|in my opinion|i would|i'd)/i.test(reply);
    const hasPersonal = /^(i|my|me|myself)/i.test(reply);
    const hasEngagement = /^(this|that|here|there|so|but|and|because)/i.test(reply);
    
    return !hasQuestion && !hasOpinion && !hasPersonal && !hasEngagement;
  }

  // Get suggestions for improving a reply
  getImprovementSuggestions(reply: string, originalTweet: string): string[] {
    const suggestions: string[] = [];
    const metrics = this.analyzeMetrics(reply);
    
    if (metrics.length < 20) {
      suggestions.push('Add more substance to make your reply more engaging');
    }
    
    if (metrics.wordCount < 5) {
      suggestions.push('Use more words to express your thoughts clearly');
    }
    
    if (!metrics.hasEmojis && originalTweet.includes('😀')) {
      suggestions.push('Consider using an emoji to match the tone');
    }
    
    if (this.isGenericResponse(reply)) {
      suggestions.push('Be more specific about what you found interesting');
    }
    
    if (this.lacksEngagement(reply)) {
      suggestions.push('Ask a question or share a personal experience');
    }
    
    if (reply.length > 150) {
      suggestions.push('Try to be more concise while keeping the key points');
    }
    
    return suggestions;
  }
}

export const qualityChecker = new QualityChecker();
