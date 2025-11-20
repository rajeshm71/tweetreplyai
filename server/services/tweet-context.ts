export interface TweetContext {
  sentiment: 'positive' | 'negative' | 'neutral' | 'sarcastic';
  category: 'question' | 'announcement' | 'opinion' | 'meme' | 'tech' | 'personal' | 'news' | 'other';
  topics: string[];
  entities: {
    hashtags: string[];
    mentions: string[];
    urls: string[];
  };
  complexity: 'simple' | 'medium' | 'complex';
  hasMedia: boolean;
  hasPoll: boolean;
  emojiCount: number;
  language: string;
  timestamp?: Date;
}

export interface AuthorInfo {
  username: string;
  verified: boolean;
  followerCount: number;
}

export interface ConversationContext {
  parentTweets: string[];
  threadLength: number;
  isThread: boolean;
  originalTweet?: string | null;
  originalTweetAuthor?: string | null;
  threadChain?: Array<{
    text: string;
    author: string;
    isOriginal: boolean;
    isCurrent: boolean;
  }>;
  currentTweetIndex?: number;
}

export class TweetContextAnalyzer {
  private readonly SENTIMENT_KEYWORDS = {
    positive: ['great', 'amazing', 'love', 'awesome', 'fantastic', 'excellent', 'wonderful', 'brilliant', 'perfect', 'best'],
    negative: ['bad', 'terrible', 'awful', 'hate', 'worst', 'horrible', 'disgusting', 'stupid', 'annoying', 'frustrating'],
    sarcastic: ['sure', 'right', 'totally', 'obviously', 'clearly', 'of course', 'definitely', 'absolutely']
  };

  private readonly CATEGORY_PATTERNS = {
    question: /\?|what|how|why|when|where|who|which|can|could|should|would|is|are|do|does|did/gi,
    announcement: /announcing|launching|released|introducing|proud to|excited to|thrilled to/gi,
    opinion: /think|believe|feel|opinion|view|perspective|agree|disagree|support|oppose/gi,
    meme: /😂|🤣|💀|lol|lmao|rofl|haha|joke|meme|funny|hilarious/gi,
    tech: /ai|artificial intelligence|machine learning|blockchain|crypto|programming|coding|software|tech|technology/gi,
    personal: /i|me|my|myself|personal|life|living|family|friends|home|work/gi,
    news: /breaking|update|reports|according to|sources say|confirmed|official/gi
  };

  private readonly COMPLEXITY_INDICATORS = {
    simple: {
      maxLength: 50,
      maxWords: 10,
      patterns: [/^[a-z\s]+$/i] // Simple words only
    },
    complex: {
      minLength: 200,
      minWords: 30,
      patterns: [/[A-Z]{3,}/, /\b\w{10,}\b/, /[^\w\s]{2,}/] // Acronyms, long words, special chars
    }
  };

  analyzeTweet(tweetText: string, authorInfo?: AuthorInfo, conversationContext?: ConversationContext): TweetContext {
    const text = tweetText.trim();
    
    return {
      sentiment: this.analyzeSentiment(text),
      category: this.analyzeCategory(text),
      topics: this.extractTopics(text),
      entities: this.extractEntities(text),
      complexity: this.analyzeComplexity(text),
      hasMedia: this.detectMedia(text),
      hasPoll: this.detectPoll(text),
      emojiCount: this.countEmojis(text),
      language: this.detectLanguage(text),
      timestamp: new Date()
    };
  }

  private analyzeSentiment(text: string): TweetContext['sentiment'] {
    const lowerText = text.toLowerCase();
    
    // Check for sarcastic indicators first
    const sarcasticScore = this.SENTIMENT_KEYWORDS.sarcastic.reduce((score, keyword) => {
      return score + (lowerText.includes(keyword) ? 1 : 0);
    }, 0);
    
    if (sarcasticScore >= 2) {
      return 'sarcastic';
    }
    
    // Check for positive/negative sentiment
    const positiveScore = this.SENTIMENT_KEYWORDS.positive.reduce((score, keyword) => {
      return score + (lowerText.includes(keyword) ? 1 : 0);
    }, 0);
    
    const negativeScore = this.SENTIMENT_KEYWORDS.negative.reduce((score, keyword) => {
      return score + (lowerText.includes(keyword) ? 1 : 0);
    }, 0);
    
    if (positiveScore > negativeScore && positiveScore > 0) {
      return 'positive';
    } else if (negativeScore > positiveScore && negativeScore > 0) {
      return 'negative';
    }
    
    return 'neutral';
  }

  private analyzeCategory(text: string): TweetContext['category'] {
    const lowerText = text.toLowerCase();
    
    for (const [category, pattern] of Object.entries(this.CATEGORY_PATTERNS)) {
      if (pattern.test(lowerText)) {
        return category as TweetContext['category'];
      }
    }
    
    return 'other';
  }

  private extractTopics(text: string): string[] {
    const topics: string[] = [];
    
    // Extract hashtags as topics
    const hashtags = text.match(/#\w+/g) || [];
    topics.push(...hashtags.map(tag => tag.substring(1).toLowerCase()));
    
    // Extract common tech/business terms
    const commonTopics = [
      'ai', 'artificial intelligence', 'machine learning', 'blockchain', 'crypto', 'bitcoin',
      'programming', 'coding', 'software', 'tech', 'technology', 'startup', 'business',
      'marketing', 'social media', 'twitter', 'x', 'elon', 'musk', 'tesla', 'spacex'
    ];
    
    const lowerText = text.toLowerCase();
    commonTopics.forEach(topic => {
      if (lowerText.includes(topic)) {
        topics.push(topic);
      }
    });
    
    return [...new Set(topics)]; // Remove duplicates
  }

  private extractEntities(text: string): TweetContext['entities'] {
    return {
      hashtags: (text.match(/#\w+/g) || []).map(tag => tag.substring(1)),
      mentions: (text.match(/@\w+/g) || []).map(mention => mention.substring(1)),
      urls: (text.match(/https?:\/\/[^\s]+/g) || [])
    };
  }

  private analyzeComplexity(text: string): TweetContext['complexity'] {
    const words = text.split(/\s+/).length;
    const length = text.length;
    
    // Check for simple indicators
    if (length <= this.COMPLEXITY_INDICATORS.simple.maxLength && 
        words <= this.COMPLEXITY_INDICATORS.simple.maxWords &&
        this.COMPLEXITY_INDICATORS.simple.patterns.some(pattern => pattern.test(text))) {
      return 'simple';
    }
    
    // Check for complex indicators
    if (length >= this.COMPLEXITY_INDICATORS.complex.minLength &&
        words >= this.COMPLEXITY_INDICATORS.complex.minWords &&
        this.COMPLEXITY_INDICATORS.complex.patterns.some(pattern => pattern.test(text))) {
      return 'complex';
    }
    
    return 'medium';
  }

  private detectMedia(text: string): boolean {
    // Check for media indicators
    const mediaPatterns = [
      /📷|📸|🖼️|🎥|📹|🎬|📺|📱|💻|🖥️/, // Media emojis
      /photo|image|picture|video|gif|meme|screenshot/gi, // Media keywords
      /\.(jpg|jpeg|png|gif|mp4|mov|avi)/gi // File extensions
    ];
    
    return mediaPatterns.some(pattern => pattern.test(text));
  }

  private detectPoll(text: string): boolean {
    const pollPatterns = [
      /poll|vote|survey|questionnaire/gi,
      /option [1-9]|choice [a-z]/gi,
      /🗳️|📊|📈|📉/ // Poll-related emojis
    ];
    
    return pollPatterns.some(pattern => pattern.test(text));
  }

  private countEmojis(text: string): number {
    // Simple emoji detection - matches most common emojis
    const emojiPattern = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const matches = text.match(emojiPattern);
    return matches ? matches.length : 0;
  }

  private detectLanguage(text: string): string {
    // Simple language detection based on common patterns
    const patterns = {
      'en': /[a-z]/i,
      'es': /[ñáéíóúü]/i,
      'fr': /[àâäéèêëïîôöùûüÿç]/i,
      'de': /[äöüß]/i,
      'it': /[àèéìíîòóù]/i,
      'pt': /[ãõç]/i
    };
    
    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        return lang;
      }
    }
    
    return 'en'; // Default to English
  }

  // Helper method to generate context-aware prompt additions
  generateContextPrompt(tweetContext: TweetContext, authorInfo?: AuthorInfo, conversationContext?: ConversationContext): string {
    const contextParts: string[] = [];
    
    // Add sentiment context
    if (tweetContext.sentiment !== 'neutral') {
      contextParts.push(`The tweet has a ${tweetContext.sentiment} tone.`);
    }
    
    // Add category context
    if (tweetContext.category !== 'other') {
      contextParts.push(`This is a ${tweetContext.category} tweet.`);
    }
    
    // Add complexity context
    if (tweetContext.complexity === 'complex') {
      contextParts.push('The tweet is complex and technical.');
    } else if (tweetContext.complexity === 'simple') {
      contextParts.push('The tweet is simple and straightforward.');
    }
    
    // Add author context
    if (authorInfo) {
      if (authorInfo.verified) {
        contextParts.push(`Replying to a verified account (@${authorInfo.username}).`);
      }
      if (authorInfo.followerCount > 100000) {
        contextParts.push('This is a high-profile account with many followers.');
      }
    }
    
    // ENHANCED THREAD CONTEXT (NEW - Most Important)
    if (conversationContext && conversationContext.isThread) {
      // If we have original tweet, make it prominent
      if (conversationContext.originalTweet) {
        contextParts.push(`\n=== CONVERSATION CONTEXT ===`);
        contextParts.push(`ORIGINAL TWEET (that started this conversation): "${conversationContext.originalTweet}"`);
        
        if (conversationContext.originalTweetAuthor) {
          contextParts.push(`Original tweet author: @${conversationContext.originalTweetAuthor}`);
        }
      }
      
      // Show full thread chain if available
      if (conversationContext.threadChain && conversationContext.threadChain.length > 1) {
        contextParts.push(`\nCONVERSATION THREAD (${conversationContext.threadLength} tweets):`);
        conversationContext.threadChain.forEach((tweet, index) => {
          const label = tweet.isOriginal ? '→ Original' : 
                       tweet.isCurrent ? '→ Current (you are replying to this)' :
                       `→ Reply ${index}`;
          const authorLabel = tweet.author !== 'unknown' ? ` (@${tweet.author})` : '';
          contextParts.push(`${label}${authorLabel}: "${tweet.text}"`);
        });
      }
      
      // Critical instruction for AI
      contextParts.push(`\nIMPORTANT: You are replying to a tweet that is part of a conversation thread.`);
      contextParts.push(`Consider the full conversation context, especially the original tweet, when crafting your reply.`);
      contextParts.push(`Your reply should make sense in the context of the entire conversation, not just the immediate tweet.`);
    }
    
    // Add media context
    if (tweetContext.hasMedia) {
      contextParts.push('The tweet includes media (image/video).');
    }
    
    if (tweetContext.hasPoll) {
      contextParts.push('The tweet includes a poll.');
    }
    
    // Add topic context
    if (tweetContext.topics.length > 0) {
      contextParts.push(`Topics mentioned: ${tweetContext.topics.slice(0, 3).join(', ')}.`);
    }
    
    return contextParts.length > 0 ? `Context: ${contextParts.join(' ')}` : '';
  }
}

export const tweetContextAnalyzer = new TweetContextAnalyzer();
