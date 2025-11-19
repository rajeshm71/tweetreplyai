// New interfaces for detailed quality scoring
export interface QualityParameter {
  name: string;
  score: number; // 5-10 (minimum 5 points per parameter)
  maxScore: number; // Always 10
  reason: string;
}

export interface DetailedQualityCheckResult {
  totalScore: number; // 50-100 (10 parameters × 5-10 points)
  passed: boolean; // >= 60
  parameters: QualityParameter[];
  issues: string[]; // Reasons for low scores
  suggestions: string[]; // Improvement recommendations
}

// Legacy interface for backward compatibility
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
  // ========== PERFORMANCE OPTIMIZATIONS: Static Constants ==========
  // FIX: Move regex patterns to class level to avoid recreation on each call (Review Issue #1)
  private static readonly EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  private static readonly URL_REGEX = /https?:\/\/[^\s]+/;
  private static readonly MENTION_REGEX = /@\w+/;
  private static readonly HASHTAG_REGEX = /#\w+/;
  private static readonly QUESTION_REGEX = /\?/;
  private static readonly CONTRACTION_REGEX = /(don't|can't|won't|wouldn't|shouldn't|couldn't|isn't|aren't|wasn't|weren't|i'm|you're|they're|we're)/i;
  
  // FIX: Move stopWords to static constant to avoid recreation (Review Issue #3)
  private static readonly STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 
    'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 
    'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 
    'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 
    'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 
    'other', 'some', 'such'
  ]);

  // ========== PARAMETER 1: Length Appropriateness ==========
  // Score range: 5-10 points (minimum 5)
  private scoreLengthAppropriateness(reply: string): QualityParameter {
    const length = reply.length;
    let score = 5; // Minimum score
    let reason = '';

    if (length >= 40 && length <= 200) {
      score = 10;
      reason = 'Perfect length for engagement';
    } else if ((length >= 20 && length < 40) || (length > 200 && length <= 250)) {
      score = 8;
      reason = 'Good length but could be optimized';
    } else if ((length >= 10 && length < 20) || (length > 250 && length <= 280)) {
      score = 6;
      reason = length < 20 ? 'Reply is too short' : 'Reply is getting too long';
    } else {
      score = 5;
      reason = length < 10 ? 'Reply is way too short' : 'Reply exceeds Twitter character limit';
    }

    return {
      name: 'Length Appropriateness',
      score,
      maxScore: 10,
      reason
    };
  }

  // ========== PARAMETER 2: Sentiment Appropriateness ==========
  // Score range: 5-10 points (minimum 5)
  private scoreSentimentAppropriateness(reply: string, originalTweet: string): QualityParameter {
    const replySentiment = this.analyzeSentiment(reply);
    const originalSentiment = this.analyzeSentiment(originalTweet);
    
    let score = 5; // Minimum score
    let reason = '';

    if (replySentiment === originalSentiment) {
      score = 10;
      reason = 'Sentiment perfectly matches original tweet';
    } else if (
      (replySentiment === 'neutral' && originalSentiment !== 'neutral') ||
      (replySentiment !== 'neutral' && originalSentiment === 'neutral')
    ) {
      score = 8;
      reason = 'Sentiment slightly mismatched but acceptable';
    } else if (
      (replySentiment === 'positive' && originalSentiment === 'negative') ||
      (replySentiment === 'negative' && originalSentiment === 'positive')
    ) {
      // Check if it's constructive criticism or supportive response
      const isConstructive = /\b(however|but|although|instead|could|might|try)\b/i.test(reply);
      if (isConstructive) {
        score = 6;
        reason = 'Opposite sentiment but constructive';
      } else {
        score = 5;
        reason = 'Sentiment completely opposite and inappropriate';
      }
    }

    return {
      name: 'Sentiment Appropriateness',
      score,
      maxScore: 10,
      reason
    };
  }

  // ========== PARAMETER 3: Relevance to Topic ==========
  // Score range: 5-10 points (minimum 5)
  private scoreRelevanceToTopic(reply: string, originalTweet: string): QualityParameter {
    const replyWords = this.extractKeywords(reply.toLowerCase());
    const tweetWords = this.extractKeywords(originalTweet.toLowerCase());
    
    // Calculate keyword overlap
    const commonWords = replyWords.filter(word => tweetWords.includes(word));
    const overlapRatio = commonWords.length / Math.max(tweetWords.length, 1);
    
    let score = 5; // Minimum score
    let reason = '';

    if (overlapRatio >= 0.5 || commonWords.length >= 5) {
      score = 10;
      reason = 'Highly relevant to original topic';
    } else if (overlapRatio >= 0.3 || commonWords.length >= 3) {
      score = 8;
      reason = 'Related and on-topic';
    } else if (overlapRatio >= 0.1 || commonWords.length >= 2) {
      score = 6;
      reason = 'Loosely connected to topic';
    } else {
      score = 5;
      reason = 'Off-topic or too generic';
    }

    return {
      name: 'Relevance to Topic',
      score,
      maxScore: 10,
      reason
    };
  }

  // ========== PARAMETER 4: Grammar & Clarity ==========
  private scoreGrammarAndClarity(reply: string): QualityParameter {
    let errorCount = 0;
    let issues: string[] = [];

    // Check for basic grammar issues
    // Multiple spaces
    if (/\s{2,}/.test(reply)) {
      errorCount++;
      issues.push('multiple spaces');
    }

    // Missing space after punctuation
    if (/[.,!?][a-zA-Z]/.test(reply)) {
      errorCount++;
      issues.push('missing space after punctuation');
    }

    // All lowercase (unless intentional style)
    if (reply.length > 20 && reply === reply.toLowerCase() && !/^(yeah|nah|ok|lol|wow|omg)/.test(reply.toLowerCase())) {
      errorCount++;
      issues.push('all lowercase');
    }

    // Multiple punctuation marks
    if (/[!?]{3,}/.test(reply)) {
      errorCount++;
      issues.push('excessive punctuation');
    }

    // Incomplete sentences (no ending punctuation for long replies)
    if (reply.length > 50 && !/[.!?]$/.test(reply)) {
      errorCount += 0.5; // Half error
      issues.push('missing ending punctuation');
    }

    // Score range: 5-10 points (minimum 5)
    let score = 5; // Minimum score
    let reason = '';

    if (errorCount === 0) {
      score = 10;
      reason = 'Perfect grammar and clarity';
    } else if (errorCount <= 2) {
      score = 8;
      reason = '1-2 minor errors';
    } else if (errorCount <= 4) {
      score = 6;
      reason = '3-4 grammar or clarity issues';
    } else {
      score = 5;
      reason = 'Multiple errors affecting readability';
    }

    return {
      name: 'Grammar & Clarity',
      score,
      maxScore: 10,
      reason
    };
  }

  // ========== PARAMETER 5: Engagement Potential ==========
  private scoreEngagementPotential(reply: string): QualityParameter {
    let engagementScore = 0;
    const features: string[] = [];

    // Has question
    if (/\?/.test(reply)) {
      engagementScore += 4;
      features.push('asks question');
    }

    // Shares unique insight or opinion
    if (/\b(i think|i believe|i feel|in my opinion|seems like|looks like|interesting that|what if)\b/i.test(reply)) {
      engagementScore += 3;
      features.push('shares insight');
    }

    // Personal experience
    if (/\b(i('ve| have| had)|my|when i|for me)\b/i.test(reply)) {
      engagementScore += 2;
      features.push('personal touch');
    }

    // Adds specific value (numbers, examples, data)
    if (/\b\d+%|\b\d+x\b|\$\d+|(\d+,\d+)/. test(reply)) {
      engagementScore += 3;
      features.push('includes data');
    }

    // Check if it's just a generic response
    const isGeneric = /^(nice|great|awesome|cool|thanks?|good|yes|no|exactly|totally|absolutely|wow)!*$/i.test(reply.trim());
    if (isGeneric) {
      engagementScore = 0;
      features.push('generic response');
    }

    // Score range: 5-10 points (minimum 5)
    let score = Math.min(10, Math.max(5, 5 + engagementScore / 2)); // Scale to 5-10 range
    let reason = '';

    if (engagementScore >= 8) {
      score = 10;
      reason = `High engagement: ${features.join(', ')}`;
    } else if (engagementScore >= 5) {
      score = 8;
      reason = `Good engagement potential: ${features.join(', ')}`;
    } else if (engagementScore >= 2) {
      score = 6;
      reason = `Minimal engagement: ${features.join(', ')}`;
    } else {
      score = 5;
      reason = 'Dead-end response with no engagement value';
    }

    return {
      name: 'Engagement Potential',
      score,
      maxScore: 10,
      reason
    };
  }

  // ========== PARAMETER 6: Authenticity ==========
  // Score range: 5-10 points (minimum 5)
  private scoreAuthenticity(reply: string): QualityParameter {
    let score = 10;
    let issues: string[] = [];

    // Check for AI-like phrases
    const aiPatterns = [
      { pattern: /\b(as an ai|i'm an ai|i'm a language model|i'm a bot|i'm an assistant)\b/i, deduction: 5, issue: 'AI self-identification' },
      { pattern: /\b(i (can't|cannot|am not able to|unable to) (help|assist|provide))\b/i, deduction: 5, issue: 'AI limitation statement' },
      { pattern: /\b(i (don't|do not) have (access|information|knowledge|the ability))\b/i, deduction: 5, issue: 'AI disclaimer' },
      { pattern: /\b(i would (like to|be happy to|be delighted to))\b/i, deduction: 2, issue: 'overly formal' },
      { pattern: /\b(please (let me know|feel free to|don't hesitate to))\b/i, deduction: 2, issue: 'robotic politeness' },
      { pattern: /\b(furthermore|moreover|additionally|in conclusion|in summary)\b/i, deduction: 1, issue: 'formal transitions' },
    ];

    for (const { pattern, deduction, issue } of aiPatterns) {
      if (pattern.test(reply)) {
        score -= deduction;
        issues.push(issue);
      }
    }

    // Bonus for natural contractions and casual language
    const hasContractions = QualityChecker.CONTRACTION_REGEX.test(reply);
    if (hasContractions && score === 10) {
      issues.push('natural contractions');
    }

    // Minimum score: 5 points
    score = Math.max(5, score);
    let reason = '';

    if (score >= 9) {
      reason = 'Very natural and human-like';
    } else if (score >= 7) {
      reason = 'Slightly formal but acceptable';
    } else if (score >= 6) {
      reason = `Somewhat robotic: ${issues.join(', ')}`;
    } else {
      reason = `Clearly AI-generated: ${issues.join(', ')}`;
    }

    return {
      name: 'Authenticity',
      score,
      maxScore: 10,
      reason
    };
  }

  // ========== PARAMETER 7: Value Addition ==========
  // Score range: 5-10 points (minimum 5)
  private scoreValueAddition(reply: string, originalTweet: string): QualityParameter {
    let rawScore = 0;
    let valueTypes: string[] = [];

    // Provides new information
    if (/\b(actually|in fact|interestingly|also|additionally|another|furthermore)\b/i.test(reply)) {
      rawScore += 4;
      valueTypes.push('adds information');
    }

    // Shares perspective
    if (/\b(i think|i believe|my view|from my perspective|in my experience|seems to me)\b/i.test(reply)) {
      rawScore += 3;
      valueTypes.push('shares perspective');
    }

    // Offers actionable advice
    if (/\b(try|consider|check out|look into|might want to|could|should|recommend)\b/i.test(reply)) {
      rawScore += 4;
      valueTypes.push('offers advice');
    }

    // Includes specific examples or data
    if (/\b(for example|such as|like|e\.g\.|specifically|\d+%|\d+x)\b/i.test(reply)) {
      rawScore += 3;
      valueTypes.push('includes examples');
    }

    // Check if it just restates obvious or agrees generically
    const isRestating = /^(that's|this is|it's|you're) (right|correct|true|exactly|absolutely|definitely)/i.test(reply);
    const isGenericAgreement = /^(i agree|exactly|totally|absolutely|yes|true|right|correct)!*$/i.test(reply.trim());
    
    if (isRestating || isGenericAgreement) {
      rawScore = 0;
      valueTypes = ['generic agreement'];
    }

    // Map to 5-10 scale
    let score = 5; // Minimum
    if (rawScore >= 10) {
      score = 10;
    } else if (rawScore >= 7) {
      score = 8;
    } else if (rawScore >= 4) {
      score = 7;
    } else if (rawScore >= 2) {
      score = 6;
    }

    let reason = '';
    if (score >= 9) {
      reason = `High value: ${valueTypes.join(', ')}`;
    } else if (score >= 7) {
      reason = `Adds some value: ${valueTypes.join(', ')}`;
    } else if (score >= 6) {
      reason = `Minor value: ${valueTypes.join(', ')}`;
    } else {
      reason = 'No meaningful value added';
    }

    return {
      name: 'Value Addition',
      score,
      maxScore: 10,
      reason
    };
  }

  // ========== PARAMETER 8: Emotional Intelligence ==========
  // Score range: 5-10 points (minimum 5)
  private scoreEmotionalIntelligence(reply: string, originalTweet: string): QualityParameter {
    let score = 7; // Start with neutral
    let traits: string[] = [];

    const originalSentiment = this.analyzeSentiment(originalTweet);

    // Shows empathy
    if (/\b(understand|feel|sorry|appreciate|tough|difficult|challenging|glad|happy for you|proud)\b/i.test(reply)) {
      score += 3;
      traits.push('empathetic');
    }

    // Appropriate emotional tone
    if (originalSentiment === 'negative') {
      // Check if reply is supportive
      if (/\b(hope|hang in there|you('ll| will) get through|it gets better|here for you)\b/i.test(reply)) {
        score += 2;
        traits.push('supportive');
      }
      // Avoid being overly cheerful to negative posts
      if (/\b(haha|lol|lmao|😂|🤣)/i.test(reply)) {
        score -= 3;
        traits.push('tone-deaf');
      }
    }

    // Aggressive or inappropriate
    if (/\b(stupid|idiot|dumb|moron|shut up|wrong|ridiculous|nonsense)\b/i.test(reply)) {
      score -= 4;
      traits.push('aggressive/inappropriate');
    }

    // Overly aggressive punctuation
    if (/[!]{3,}/.test(reply)) {
      score -= 1;
      traits.push('overly aggressive');
    }

    // Minimum score: 5 points
    score = Math.max(5, Math.min(10, score));
    let reason = '';

    if (score >= 9) {
      reason = `High EQ: ${traits.join(', ')}`;
    } else if (score >= 7) {
      reason = 'Appropriate emotional tone';
    } else if (score >= 6) {
      reason = `Slightly tone-deaf: ${traits.join(', ')}`;
    } else {
      reason = `Inappropriate: ${traits.join(', ')}`;
    }

    return {
      name: 'Emotional Intelligence',
      score,
      maxScore: 10,
      reason
    };
  }

  // ========== PARAMETER 9: Conciseness ==========
  // Score range: 5-10 points (minimum 5)
  private scoreConciseness(reply: string): QualityParameter {
    const length = reply.length;
    const wordCount = reply.split(/\s+/).length;
    const avgWordLength = reply.replace(/\s/g, '').length / wordCount;

    let score = 5; // Minimum score
    let reason = '';

    // Check information density
    const hasSubstance = wordCount >= 5 && !/^(nice|great|awesome|cool|wow|ok|yes|no|thanks?|exactly|totally)$/i.test(reply.trim());

    if (length < 120 && hasSubstance && avgWordLength < 6) {
      score = 10;
      reason = 'High information density - concise and substantial';
    } else if (length >= 120 && length <= 180) {
      score = 8;
      reason = 'Good balance of detail and brevity';
    } else if (length > 180 && length <= 250) {
      score = 6;
      reason = 'Somewhat verbose, could be more concise';
    } else if (length > 250 || !hasSubstance) {
      score = 5;
      reason = length > 250 ? 'Extremely wordy' : 'Too brief without substance';
    }

    return {
      name: 'Conciseness',
      score,
      maxScore: 10,
      reason
    };
  }

  // ========== PARAMETER 10: Emoji Appropriateness ==========
  // Score range: 5-10 points (minimum 5)
  private scoreEmojiAppropriateness(reply: string): QualityParameter {
    // FIX: Use static regex constant (Review Issue #1)
    const emojis = reply.match(QualityChecker.EMOJI_REGEX) || [];
    const emojiCount = emojis.length;

    let score = 5; // Minimum score
    let reason = '';

    // Check if reply is professional/technical (less need for emojis)
    const isProfessional = /\b(analysis|research|data|study|report|technical|business|professional)\b/i.test(reply);

    if (emojiCount === 0) {
      if (isProfessional) {
        score = 10;
        reason = 'No emojis - appropriate for professional context';
      } else {
        score = 8;
        reason = 'No emojis but acceptable';
      }
    } else if (emojiCount >= 1 && emojiCount <= 3) {
      score = 10;
      reason = '1-3 relevant emojis enhance message';
    } else if (emojiCount >= 4 && emojiCount <= 5) {
      score = 7;
      reason = '4-5 emojis - acceptable but could be reduced';
    } else if (emojiCount >= 6 && emojiCount <= 8) {
      score = 6;
      reason = 'Too many emojis - looks spammy';
    } else {
      score = 5;
      reason = 'Excessive emojis - unprofessional';
    }

    return {
      name: 'Emoji Appropriateness',
      score,
      maxScore: 10,
      reason
    };
  }

  // ========== MAIN QUALITY CHECK METHOD ==========
  checkQuality(reply: string, originalTweet: string): DetailedQualityCheckResult {
    const parameters = [
      this.scoreLengthAppropriateness(reply),
      this.scoreSentimentAppropriateness(reply, originalTweet),
      this.scoreRelevanceToTopic(reply, originalTweet),
      this.scoreGrammarAndClarity(reply),
      this.scoreEngagementPotential(reply),
      this.scoreAuthenticity(reply),
      this.scoreValueAddition(reply, originalTweet),
      this.scoreEmotionalIntelligence(reply, originalTweet),
      this.scoreConciseness(reply),
      this.scoreEmojiAppropriateness(reply),
    ];

    const totalScore = parameters.reduce((sum, p) => sum + p.score, 0);
    const issues = parameters.filter(p => p.score < p.maxScore).map(p => p.reason);
    const suggestions = this.generateSuggestions(parameters);

    return {
      totalScore,
      passed: totalScore >= 60,
      parameters,
      issues,
      suggestions
    };
  }

  // Generate suggestions based on low-scoring parameters
  private generateSuggestions(parameters: QualityParameter[]): string[] {
    const suggestions: string[] = [];

    for (const param of parameters) {
      if (param.score <= 4) {
        // Add suggestions for low-scoring parameters
        switch (param.name) {
          case 'Length Appropriateness':
            suggestions.push('Adjust length to 40-200 characters for optimal engagement');
            break;
          case 'Sentiment Appropriateness':
            suggestions.push('Match the emotional tone of the original tweet');
            break;
          case 'Relevance to Topic':
            suggestions.push('Stay focused on the main topic and use related keywords');
            break;
          case 'Grammar & Clarity':
            suggestions.push('Review grammar, punctuation, and sentence structure');
            break;
          case 'Engagement Potential':
            suggestions.push('Ask a question or share a unique perspective');
            break;
          case 'Authenticity':
            suggestions.push('Use natural, conversational language - avoid robotic phrases');
            break;
          case 'Value Addition':
            suggestions.push('Add specific examples, insights, or actionable advice');
            break;
          case 'Emotional Intelligence':
            suggestions.push('Show empathy and use an appropriate emotional tone');
            break;
          case 'Conciseness':
            suggestions.push('Be more concise while maintaining substance');
            break;
          case 'Emoji Appropriateness':
            suggestions.push('Use 1-2 relevant emojis, or none for professional contexts');
            break;
        }
      }
    }

    return suggestions;
  }

  // ========== HELPER METHODS ==========
  private extractKeywords(text: string): string[] {
    // FIX: Add defensive null check (Review Issue #2)
    if (!text || typeof text !== 'string') {
      return [];
    }
    
    // FIX: Use static STOP_WORDS constant (Review Issue #3)
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !QualityChecker.STOP_WORDS.has(word));
    
    return [...new Set(words)]; // Return unique words
  }

  /**
   * Analyzes sentiment of text using simple word counting.
   * FIX: Document limitations (Review Issue #4)
   * 
   * LIMITATIONS:
   * - No context awareness (e.g., "not great" counted as positive)
   * - No negation handling ("not bad" should be positive)
   * - No intensity modifiers ("very good" vs "good")
   * - Limited word lists
   * 
   * TODO: Future enhancements:
   * 1. Add negation detection
   * 2. Add intensity modifiers
   * 3. Use more sophisticated NLP library
   */
  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    // FIX: Add defensive null check (Review Issue #2)
    if (!text || typeof text !== 'string') {
      return 'neutral';
    }
    
    const positiveWords = ['great', 'awesome', 'love', 'amazing', 'fantastic', 'wonderful', 'brilliant', 'perfect', 'best', 'excellent', 'good', 'nice', 'happy', 'excited', 'thrilled', 'glad', 'pleased', 'impressive', 'outstanding', 'superb'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'horrible', 'disgusting', 'stupid', 'annoying', 'frustrating', 'disappointing', 'poor', 'fail', 'wrong', 'sad', 'angry', 'upset', 'concerned', 'worried', 'unfortunately'];
    
    const lowerText = text.toLowerCase();
    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of positiveWords) {
      if (new RegExp(`\\b${word}\\b`).test(lowerText)) positiveCount++;
    }

    for (const word of negativeWords) {
      if (new RegExp(`\\b${word}\\b`).test(lowerText)) negativeCount++;
    }
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  // Legacy method for backward compatibility
  private analyzeMetrics(reply: string): QualityMetrics {
    const words = reply.split(/\s+/).filter(word => word.length > 0);
    
    return {
      length: reply.length,
      wordCount: words.length,
      // FIX: Use static regex constants (Review Issue #1)
      hasEmojis: QualityChecker.EMOJI_REGEX.test(reply),
      hasHashtags: QualityChecker.HASHTAG_REGEX.test(reply),
      hasMentions: QualityChecker.MENTION_REGEX.test(reply),
      sentiment: this.analyzeSentiment(reply),
      complexity: this.analyzeComplexity(reply)
    };
  }

  private analyzeComplexity(reply: string): 'simple' | 'medium' | 'complex' {
    const words = reply.split(/\s+/);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    
    if (words.length < 5 || avgWordLength < 4) return 'simple';
    if (words.length > 15 || avgWordLength > 6) return 'complex';
    return 'medium';
  }

  // Get improvement suggestions (legacy method)
  getImprovementSuggestions(reply: string, originalTweet: string): string[] {
    const result = this.checkQuality(reply, originalTweet);
    return result.suggestions;
  }
}

export const qualityChecker = new QualityChecker();
