/**
 * Postprocessing service for AI-generated replies
 * Applies specific cleaning rules in an optimized order
 */
import { REPLY_LIMITS } from "../config/constants.js";

// Configuration for removable start phrases - easily extensible
const START_PHRASES = [
  "I'm particularly glad you highlighted",
  "I'm particularly glad you mentioned",
  "I'm glad you highlighted",
  "I'm glad you mentioned",
  "Thanks for highlighting",
  "Thanks for mentioning",
  "I particularly appreciate the emphasis on",
  "I particularly appreciate",
  "I appreciate the emphasis on",
  "I appreciate the point on",
  "I appreciate the focus on",
  "I appreciate the emphasis",
  "I appreciate the point",
  "I appreciate the focus",
  "I'm particularly glad",
  "Couldn't agree more",
  "Preach",
  "Spot on",
  "Sounds like",
  "Feels like",
  "Looks like",
  "Seems like",
  "makes sense",
  "I agree",
  "I completely agree",
  "This resonates",
  "In my experience",
  "In our experience",
  "We've seen",
  "We have seen",
];

// Configuration for filtered sentence starts - easily extensible
const FILTERED_SENTENCE_STARTS = [
  "I particularly appreciate",
  "I appreciate the",
  "I'm particularly glad",
  "I'm glad you",
  "Thanks for highlighting",
  "Thanks for mentioning",
  "Love",
  "That's",
  "Appreciate",
  "I've",
  "I agree",
  "I completely",
  "This resonates",
  "In my",
  "In our",
  "We have",
  "Spot on",
];

// Configuration for words that disqualify sentences - easily extensible
const DISQUALIFYING_WORDS = ["simplification", "Can't wait to see"];

// Configuration for word replacements with random alternatives
const WORD_REPLACEMENTS: Record<string, string[]> = {
  "Congrats": ["Congrats", "Congratulation", "Congo", "Nice", "Great", "Awesome"],
  "key": ["key", "important", "essential", "crucial", "vital", "critical"],
  "game changer": ["huge", "impactful", "significant"],
  "game-changer": ["huge", "impactful", "significant"]
};

// Configuration for banned patterns (from previous postprocessing) - easily extensible
const BANNED_PATTERNS = [
  /#\w+/g, // Hashtags
  /Check out my/gi,
  /The future is here/gi,
  /This changes everything/gi,
  /Revolutionary/gi,
  /Game-changing/gi,
];

export class ReplyPostProcessor {
  /**
   * Light processing for improved drafts - skips aggressive rules that might remove improvements
   * Only applies basic cleanup: quotes, banned patterns, word count, format cleanup
   * @param maxWordsOverride - Optional cap (e.g. OA dynamic reply length); never exceeds POST_PROCESSOR_MAX_WORDS
   */
  processReplyLight(rawReply: string, maxWordsOverride?: number): string {
    // Step 1: Store original reply for fallback (handle null/undefined)
    if (!rawReply || typeof rawReply !== 'string') {
      return '';
    }
    const originalReply = rawReply.trim();

    // Step 2: Handle empty strings early
    if (!originalReply) {
      return '';
    }

    const effectiveMaxWords = maxWordsOverride != null
      ? Math.min(maxWordsOverride, REPLY_LIMITS.POST_PROCESSOR_MAX_WORDS)
      : REPLY_LIMITS.POST_PROCESSOR_MAX_WORDS;

    // Step 3: Start with original reply
    let processed = originalReply;

    // Step 3.5: Remove meta-commentary FIRST (before other processing)
    processed = this.removeMetaCommentary(processed);

    // Step 4: Apply basic cleanup rules only (no aggressive removal)
    processed = this.removeWrapperQuotes(processed); // Remove quotes if AI wrapped response
    processed = this.removeBannedPatterns(processed); // Remove hashtags and banned phrases
    processed = this.limitWordCount(processed, effectiveMaxWords);
    
    // Step 5: Apply format cleanup rules
    processed = this.applyFormatCleanup(processed);

    // Step 6: Remove ending punctuation and normalize whitespace
    processed = this.removeEndingPunctuation(processed);
    processed = this.normalizeWhitespace(processed);

    // Step 7: Return processed reply
    return processed.trim() || originalReply;
  }

  /**
   * Main processing function - applies all rules in optimized order
   * @param rawReply - The raw reply text to process
   * @param replyMode - Optional reply mode: 'single-sentence' | 'enhanced'
   * @param maxWordsOverride - Optional cap (e.g. OA dynamic reply length); never exceeds POST_PROCESSOR_MAX_WORDS
   */
  processReply(rawReply: string, replyMode?: string, maxWordsOverride?: number): string {
    // Step 1: Store original reply for fallback (handle null/undefined)
    if (!rawReply || typeof rawReply !== 'string') {
      return '';
    }
    const originalReply = rawReply.trim();

    // Step 2: Handle empty strings early
    if (!originalReply) {
      return '';
    }

    const isSingleSentence = replyMode === 'single-sentence';
    let effectiveMaxWords = maxWordsOverride != null
      ? Math.min(maxWordsOverride, REPLY_LIMITS.POST_PROCESSOR_MAX_WORDS)
      : REPLY_LIMITS.POST_PROCESSOR_MAX_WORDS;
    if (isSingleSentence && maxWordsOverride != null) {
      effectiveMaxWords = Math.min(effectiveMaxWords, REPLY_LIMITS.SINGLE_SENTENCE_MAX_WORDS);
    }

    // Step 3: Check if original has minimum words for removal operations
    const hasMinWords = this.hasMinimumWords(originalReply, REPLY_LIMITS.POST_PROCESSOR_MIN_WORDS);

    // Step 4: Start with original reply
    let processed = originalReply;

    // Step 4.5: Remove meta-commentary FIRST (before other processing)
    processed = this.removeMetaCommentary(processed);

    // Step 5: Apply previous postprocessing rules (always executed)
    processed = this.removeWrapperQuotes(processed); // Previous rule: Remove quotes if AI wrapped response
    processed = this.removeBannedPatterns(processed); // Previous rule: Remove hashtags and banned phrases
    processed = this.limitWordCount(processed, effectiveMaxWords);
    
    // Step 6: Apply new format cleanup rules (always executed)
    processed = this.applyFormatCleanup(processed);

    // Step 7: Apply removal operations (only if original had >= 5 words AND not single-sentence mode)
    if (hasMinWords && !isSingleSentence) {
      // First remove start phrases (Rule 1) - this handles phrases at the very start of reply
      processed = this.removeStartPhrases(processed);
      // Then filter sentences (Rule 3) - this handles sentences that start with filtered words
      processed = this.filterSentences(processed);
      // Also check if entire reply starts with filtered sentence starts and remove
      processed = this.removeFilteredStartWords(processed);
    }

    // Step 7.5: For single-sentence mode, truncate at first sentence ending
    if (isSingleSentence) {
      processed = this.truncateToFirstSentence(processed);
    }

    // Step 8: Remove ending punctuation and normalize whitespace
    processed = this.removeEndingPunctuation(processed);
    processed = this.normalizeWhitespace(processed);

    // Step 9: Final validation - check if processed has minimum words
    const processedWordCount = this.countWords(processed);
    if (processedWordCount < REPLY_LIMITS.POST_PROCESSOR_MIN_WORDS) {
      // Return original with all cleanup applied (previous rules + new format cleanup)
      const originalWithBasicCleanup = this.limitWordCount(
        this.removeBannedPatterns(
          this.removeWrapperQuotes(originalReply)
        ),
        effectiveMaxWords
      );
      const originalWithCleanup = this.normalizeWhitespace(
        this.removeEndingPunctuation(
          this.applyFormatCleanup(originalWithBasicCleanup)
        )
      );
      return originalWithCleanup.trim() || originalReply;
    }

    // Step 10: Return processed reply
    return processed.trim() || originalReply;
  }

  /**
   * Previous Rule: Remove wrapper quotes
   * Removes quotes if the AI wrapped the entire response
   */
  private removeWrapperQuotes(text: string): string {
    if (!text) {
      return text;
    }
    let processed = text.trim();
    
    // Remove quotes if the AI wrapped the response
    if (processed.startsWith('"') && processed.endsWith('"')) {
      processed = processed.slice(1, -1);
    }
    if (processed.startsWith("'") && processed.endsWith("'")) {
      processed = processed.slice(1, -1);
    }
    
    return processed.trim();
  }

  /**
   * Safe Meta-Commentary Remover
   * Removes clearly identifiable meta-commentary patterns at the start of text only
   * Very conservative - only removes patterns that are clearly meta-commentary
   * Preserves legitimate reply content that might contain similar phrases
   */
  private removeMetaCommentary(text: string): string {
    if (!text || typeof text !== 'string') {
      return text;
    }

    // Only process if text is long enough (avoid processing very short replies)
    if (text.length < REPLY_LIMITS.MIN_TEXT_LENGTH_FOR_PROCESSING) {
      return text;
    }

    let processed = text.trim();
    const original = processed;

    // Patterns to remove (ONLY at start, case-insensitive)
    const metaPatterns = [
      /^here's a possible reply:?\s*/i,
      /^here's a reply:?\s*/i,
      /^possible reply:?\s*/i,
      /^suggested reply:?\s*/i,
    ];

    // Check for meta-commentary patterns at the start
    let foundPattern = false;
    let matchedPattern: RegExp | null = null;

    for (const pattern of metaPatterns) {
      if (pattern.test(processed)) {
        foundPattern = true;
        matchedPattern = pattern;
        break;
      }
    }

    // If no pattern found, return original unchanged
    if (!foundPattern || !matchedPattern) {
      return original;
    }

    // Remove the meta-commentary pattern
    const patternMatch = processed.match(matchedPattern)?.[0] || '';
    processed = processed.replace(matchedPattern, '').trim();

    // Log for debugging (can be removed in production if needed)
    if (patternMatch) {
      console.log(`[PostProcessor] Removed meta-commentary pattern: "${patternMatch}"`);
    }

    // Try to extract the actual reply after the meta-commentary
    // Look for reply after colon, newline, or in quotes
    let extractedReply = processed;

    // Pattern 1: After colon with quotes: ": "actual reply"" (precise match)
    const colonQuoteMatch = processed.match(/^:\s*"([^"]+)"/);
    if (colonQuoteMatch && colonQuoteMatch[1]) {
      extractedReply = colonQuoteMatch[1].trim();
    } else {
      // Pattern 1b: After colon without quotes: ": actual reply" (non-greedy, stops at newline or end)
      const colonMatch = processed.match(/^:\s*(.+?)(?:\n|$)/s);
      if (colonMatch && colonMatch[1]) {
        const colonText = colonMatch[1].trim();
        // Only use if it's longer than what we already have
        if (colonText.length > extractedReply.length) {
          extractedReply = colonText;
        }
      }
    }

    // Pattern 2: After newline
    const newlineMatch = processed.match(/\n\s*(.+)/s);
    if (newlineMatch && newlineMatch[1]) {
      const newlineText = newlineMatch[1].trim();
      // Only use if it's longer than what we already have
      if (newlineText.length > extractedReply.length) {
        extractedReply = newlineText;
      }
    }

    // Pattern 3: Text in quotes
    const quoteMatch = processed.match(/"([^"]+)"/);
    if (quoteMatch && quoteMatch[1]) {
      const quotedText = quoteMatch[1].trim();
      // Only use if it's longer than what we already have
      if (quotedText.length > extractedReply.length) {
        extractedReply = quotedText;
      }
    }

    // Safety check: If extracted reply is too short, return original
    if (extractedReply.length < REPLY_LIMITS.MIN_EXTRACTED_LENGTH) {
      console.log(`[PostProcessor] Extracted reply too short (${extractedReply.length} < ${REPLY_LIMITS.MIN_EXTRACTED_LENGTH}), returning original`);
      return original;
    }

    // Safety check: If extracted reply is significantly shorter than original (more than threshold),
    // it might be wrong extraction, so return original
    // Use both percentage AND fixed minimum to handle edge cases
    const lengthReduction = 1 - (extractedReply.length / original.length);
    if (lengthReduction > REPLY_LIMITS.MAX_LENGTH_REDUCTION_PERCENT && extractedReply.length < REPLY_LIMITS.MIN_EXTRACTED_LENGTH * 2) {
      console.log(`[PostProcessor] Extracted reply too short relative to original (${Math.round(lengthReduction * 100)}% reduction), returning original`);
      return original;
    }

    // Remove conservative bullet points (only if clearly meta-commentary)
    extractedReply = this.removeMetaBulletPoints(extractedReply, original);

    return extractedReply.trim() || original;
  }

  /**
   * Remove bullet points that are clearly meta-commentary (very conservative)
   * Only removes if ALL conditions are met:
   * - Bullet points appear in first 200 chars
   * - They contain meta-words
   * - They're followed by actual reply content
   */
  private removeMetaBulletPoints(text: string, original: string): string {
    if (!text || text.length < 50) {
      return text;
    }

    // Only check first 200 characters
    const first200 = text.substring(0, 200);
    const lines = first200.split('\n');

    // Check if we have bullet points in the first few lines
    const bulletLines: string[] = [];
    let foundBullets = false;
    let replyStartIndex = -1;

    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const line = lines[i].trim();
      // Check for bullet points: *, -, •, or numbered lists (1., 2., etc.)
      // FIX: Separate checks for symbol bullets and numbered lists for accurate detection
      const isSymbolBullet = /^[\*\-\•]\s+/.test(line);
      const isNumberedList = /^\d+\.\s+/.test(line);
      if (isSymbolBullet || isNumberedList) {
        bulletLines.push(line);
        foundBullets = true;
      } else if (foundBullets && line.length > 10) {
        // Found non-bullet line after bullets - this might be the actual reply
        replyStartIndex = i;
        break;
      }
    }

    // Only remove if we found bullets AND they contain meta-words AND there's content after
    if (!foundBullets || bulletLines.length === 0 || replyStartIndex === -1) {
      return text;
    }

    // Check if bullets contain meta-words
    const metaWords = ['aims', 'response', 'reply', 'tone', 'humorous', 'keep', 'acknowledge', 'intention', 'purpose'];
    const bulletText = bulletLines.join(' ').toLowerCase();
    const hasMetaWords = metaWords.some(word => bulletText.includes(word));

    if (!hasMetaWords) {
      // Bullets don't contain meta-words - they might be part of the reply, preserve them
      return text;
    }

    // Remove bullet lines and return text starting from reply
    const replyStart = lines.slice(replyStartIndex).join('\n');
    return replyStart.trim() || text;
  }

  /**
   * Previous Rule: Remove banned patterns
   * Removes hashtags and promotional phrases
   */
  private removeBannedPatterns(text: string): string {
    if (!text) {
      return text;
    }
    let processed = text;
    
    // Remove all banned patterns
    for (const pattern of BANNED_PATTERNS) {
      processed = processed.replace(pattern, "");
    }
    
    return processed;
  }

  /**
   * Previous Rule: Limit word count
   * Ensures reply is under maximum word limit
   */
  private limitWordCount(text: string, maxWords: number): string {
    if (!text) {
      return text;
    }
    const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
    if (words.length > maxWords) {
      return words.slice(0, maxWords).join(" ");
    }
    return text;
  }

  /**
   * Rule 1: Remove start phrases with punctuation
   * Removes entire phrases at the start if they match configured words
   * Handles punctuation attached to the phrase (., !, ?, etc.)
   */
  private removeStartPhrases(text: string): string {
    if (!text || !text.trim()) {
      return text;
    }
    
    let cleaned = text.trim();

    for (const phrase of START_PHRASES) {
      // Case-insensitive check if text starts with phrase
      // Match phrase, optional whitespace, then optional punctuation (one or more), then optional whitespace
      // This handles: "Preach!", "Preach.", "Couldn't agree more, ", etc.
      const regex = new RegExp(`^${this.escapeRegex(phrase)}\\s*[.,!?:;]+\\s*`, "i");
      if (regex.test(cleaned)) {
        cleaned = cleaned.replace(regex, "").trim();
        break; // Only remove first matching phrase
      }
      
      // Also check without punctuation (just phrase followed by space/comma)
      const regexNoPunct = new RegExp(`^${this.escapeRegex(phrase)}\\s+`, "i");
      if (regexNoPunct.test(cleaned)) {
        cleaned = cleaned.replace(regexNoPunct, "").trim();
        break;
      }
    }

    return cleaned;
  }

  /**
   * Rule 2: Replace dashes/em dashes with spaces
   * Finds - or — between words and replaces with space
   * Replaces ALL dashes between words, including in hyphenated words
   * Preserves dashes between two digits (e.g., "9-5" stays "9-5")
   */
  private replaceDashes(text: string): string {
    if (!text) {
      return text;
    }

    // First: Replace em dash (—) and en dash (–) between digits with regular dash
    // Pattern: digit[—–]digit → digit-digit (e.g., "9—5" → "9-5")
    let cleaned = text
      .replace(/(\d)[—–](\d)/g, "$1-$2"); // Em/en dash between digits

    // Replace remaining em dash (—) and en dash (–) with space (these are always punctuation)
    cleaned = cleaned
      .replace(/—/g, " ") // Em dash
      .replace(/–/g, " "); // En dash

    // Replace regular dash (-) that appears between word characters
    // BUT preserve dashes between two digits (e.g., "9-5" stays "9-5")
    // Pattern: word-char dash word-char, but exclude digit-digit pattern
    cleaned = cleaned.replace(/(\w)-(\w)/g, (match, before, after) => {
      // If both are digits, preserve the dash
      if (/\d/.test(before) && /\d/.test(after)) {
        return match; // Keep "9-5" as is
      }
      // Otherwise replace with space
      return `${before} ${after}`;
    });
    
    // Replace dash between spaces: "word - word" → "word word"
    cleaned = cleaned.replace(/\s+-\s+/g, " ");
    
    // Replace dash at start followed by space: "- word" → "word"
    cleaned = cleaned.replace(/^-\s+/g, "");
    
    // Replace dash at end preceded by space: "word -" → "word"
    cleaned = cleaned.replace(/\s+-$/g, "");

    return cleaned;
  }

  /**
   * Remove filtered start words at the beginning of entire reply
   * Removes the entire first sentence if it starts with filtered words (e.g., "That's", "Love")
   */
  private removeFilteredStartWords(text: string): string {
    if (!text || !text.trim()) {
      return text;
    }
    
    let cleaned = text.trim();
    
    // Check if reply starts with any filtered word (case-insensitive)
    for (const startWord of FILTERED_SENTENCE_STARTS) {
      const lowerCleaned = cleaned.toLowerCase();
      const lowerStartWord = startWord.toLowerCase();
      
      if (lowerCleaned.startsWith(lowerStartWord)) {
        // Check what follows the word - must be space, punctuation, or nothing
        const afterWord = cleaned.substring(startWord.length);
        if (afterWord.length === 0 || /^[\s.,!?:;]/.test(afterWord)) {
          // Find the first sentence boundary (period, exclamation, question mark)
          // followed by space or end of string
          const sentenceEndRegex = /[.!?](\s+|$)/;
          const match = cleaned.match(sentenceEndRegex);
          
          if (match && match.index !== undefined) {
            // Remove entire first sentence including punctuation
            // Match.index is the position of the punctuation, + match[0].length includes the space
            cleaned = cleaned.substring(match.index + match[0].length).trim();
          } else {
            // No sentence-ending punctuation found, remove everything
            cleaned = '';
          }
          break; // Only remove first matching sentence
        }
      }
    }
    
    return cleaned;
  }

  /**
   * Rule 3: Filter sentences
   * Splits on periods, removes sentences starting with filtered words or containing disqualifying words
   */
  private filterSentences(text: string): string {
    if (!text || !text.trim()) {
      return text;
    }

    // Split on sentence-ending punctuation (. ! ?) followed by space, or at end of string
    // Use a regex that properly handles punctuation at end without space
    const sentences: Array<{ text: string; punctuation: string }> = [];
    
    // Split by sentence-ending punctuation, but keep track of which punctuation was used
    let lastIndex = 0;
    const sentenceEndRegex = /[.!?](\s+|$)/g;
    let match;
    
    while ((match = sentenceEndRegex.exec(text)) !== null) {
      const sentenceText = text.substring(lastIndex, match.index).trim();
      if (sentenceText) {
        // Capture which punctuation was matched (., !, or ?)
        const punctuation = text[match.index];
        sentences.push({ text: sentenceText, punctuation });
      }
      lastIndex = sentenceEndRegex.lastIndex;
    }
    
    // Handle remaining text after last sentence-ending punctuation
    if (lastIndex < text.length) {
      const remaining = text.substring(lastIndex).trim();
      if (remaining) {
        sentences.push({ text: remaining, punctuation: "" });
      }
    }
    
    // If no sentence-ending punctuation found, treat entire text as one sentence
    if (sentences.length === 0 && text.trim()) {
      sentences.push({ text: text.trim(), punctuation: "" });
    }

    const filtered: string[] = [];

    // Process each sentence
    for (const sentenceObj of sentences) {
      const sentenceText = sentenceObj.text.trim();
      
      // Skip empty strings
      if (!sentenceText) {
        continue;
      }

      // Check if sentence starts with filtered start words
      let shouldRemove = false;

      for (const startWord of FILTERED_SENTENCE_STARTS) {
        // Escape the word for regex (handles apostrophes, special chars, etc.)
        const escaped = this.escapeRegex(startWord);
        // Match word at start, followed by: space, punctuation, or end of string
        // This handles "That's", "Love", etc. reliably without word boundary issues
        // Pattern: ^word followed by (space OR punctuation OR end)
        const startRegex = new RegExp(`^${escaped}(\\s|[.,!?:;]|$)`, "i");
        if (startRegex.test(sentenceText)) {
          shouldRemove = true;
          break;
        }
      }

      // Check if sentence contains disqualifying words or phrases
      if (!shouldRemove) {
        for (const word of DISQUALIFYING_WORDS) {
          // For multi-word phrases, use simple case-insensitive contains check
          // For single words, use word boundary
          if (word.includes(" ")) {
            // Multi-word phrase (e.g., "Can't wait to see")
            const phraseRegex = new RegExp(this.escapeRegex(word), "i");
            if (phraseRegex.test(sentenceText)) {
              shouldRemove = true;
              break;
            }
          } else {
            // Single word - use word boundary
            const wordRegex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, "i");
            if (wordRegex.test(sentenceText)) {
              shouldRemove = true;
              break;
            }
          }
        }
      }

      if (!shouldRemove) {
        // Add punctuation back if it was there originally
        filtered.push(sentenceText + sentenceObj.punctuation);
      }
    }

    // If all sentences were filtered, return empty string (will be handled by final validation)
    if (filtered.length === 0) {
      return '';
    }

    // Rejoin sentences with spaces
    let result = filtered.join(" ");
    
    // Clean up multiple periods
    result = result.replace(/\.{2,}/g, ".");
    
    // Clean up extra spaces
    result = result.replace(/\s+/g, " ").trim();
    
    return result;
  }

  /**
   * Replace exclamation marks with periods (Twitter post-processing)
   */
  private replaceExclamationWithPeriod(text: string): string {
    if (!text) {
      return text;
    }
    return text.replace(/!/g, ".");
  }

  /**
   * Strip " on [phrase]," after Congrat(s)/Congratulation(s) to reduce repetitive template.
   * E.g. "Congratulation on finally seeing some MRR, that's awesome." -> "Congratulation, that's awesome."
   */
  private stripCongratsOnPhrase(text: string): string {
    if (!text) {
      return text;
    }
    return text.replace(/\b(Congrat(?:ulation)?s?)\s+on\s+[^,.]+,\s*/gi, "$1, ");
  }

  /**
   * Helper method: Apply all format cleanup rules
   * Centralizes format cleanup logic for reuse in fallback scenarios
   */
  private applyFormatCleanup(text: string): string {
    if (!text) {
      return text;
    }
    let cleaned = text;
    cleaned = this.replaceExclamationWithPeriod(cleaned); // Replace ! with . (Twitter)
    cleaned = this.stripCongratsOnPhrase(cleaned); // Strip "Congrats on [X], " template
    cleaned = this.replaceDashes(cleaned); // Rule 2: Replace dashes, preserve digits
    cleaned = this.replaceSemicolons(cleaned); // Replace semicolons with commas
    cleaned = this.removeSingleQuotes(cleaned); // Remove quotes around words
    cleaned = this.replaceWordsRandomly(cleaned); // Replace Congrats/key randomly
    cleaned = this.replaceAmpersands(cleaned); // Replace & with 'and' if 2+ occurrences
    cleaned = this.removeDoubleQuotes(cleaned); // Rule 4: Remove double quotes
    return cleaned;
  }

  /**
   * Rule 4: Remove double quotes
   * Removes all " characters from the reply
   */
  private removeDoubleQuotes(text: string): string {
    if (!text) {
      return text;
    }
    return text.replace(/"/g, "");
  }

  /**
   * Replace semicolons with commas
   */
  private replaceSemicolons(text: string): string {
    if (!text) {
      return text;
    }
    return text.replace(/;/g, ",");
  }

  /**
   * Remove single quotes around words
   * Removes single quotes that enclose words (e.g., 'curious' → curious)
   * Safely avoids matching apostrophes in contractions like "don't" or "it's"
   * 
   * Pattern ensures quotes are surrounded by non-word characters (spaces, punctuation, start/end)
   * This prevents matching apostrophes inside contractions where letters are adjacent
   */
  private removeSingleQuotes(text: string): string {
    if (!text) {
      return text;
    }
    // Match 'word' where:
    // - Before first quote: start of string, space, or punctuation (not a letter)
    // - After second quote: end of string, space, or punctuation (not a letter)
    // This ensures we're matching complete quoted words, not apostrophes in contractions
    // Pattern: (start|space|punctuation) quote word quote (end|space|punctuation)
    return text.replace(/(?<=^|\s|[.,!?:;])'(\w+)'(?=$|\s|[.,!?:;])/g, "$1");
  }

  /**
   * Replace words with random alternatives
   * Randomly replaces occurrences of words in WORD_REPLACEMENTS with alternatives
   */
  private replaceWordsRandomly(text: string): string {
    if (!text) {
      return text;
    }

    let cleaned = text;

    for (const [word, alternatives] of Object.entries(WORD_REPLACEMENTS)) {
      // Create regex with word boundary to avoid partial matches (case-insensitive)
      const wordRegex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, "gi");
      
      // Replace each occurrence with a random alternative
      cleaned = cleaned.replace(wordRegex, () => {
        const randomIndex = Math.floor(Math.random() * alternatives.length);
        return alternatives[randomIndex];
      });
    }

    return cleaned;
  }

  /**
   * Replace ampersands with 'and' if there are 2+ occurrences
   * Excludes HTML entities like &amp;, &lt;, &gt; from count and replacement
   */
  private replaceAmpersands(text: string): string {
    if (!text) {
      return text;
    }

    // Count standalone & (not part of HTML entities like &amp;)
    // Negative lookahead: & not followed by alphanumeric characters and semicolon
    const ampersandRegex = /&(?![a-zA-Z]+;)/g;
    const ampersandMatches = text.match(ampersandRegex);
    const ampersandCount = ampersandMatches ? ampersandMatches.length : 0;
    
    // If 2 or more, replace only standalone & with 'and' (preserve HTML entities)
    if (ampersandCount >= 2) {
      return text.replace(ampersandRegex, "and");
    }

    return text;
  }

  /**
   * Remove ending punctuation
   * Removes trailing punctuation marks (., !, ?, :, ;, ,)
   */
  /**
   * Truncate text to first sentence (for single-sentence mode)
   * Finds the first sentence ending (. ! ?) and returns only that sentence
   * FIX: Added fallback for text without punctuation to ensure single sentence
   */
  private truncateToFirstSentence(text: string): string {
    if (!text) {
      return text;
    }
    
    // Find the first sentence ending punctuation
    const sentenceEndMatch = text.match(/[.!?]/);
    
    if (sentenceEndMatch && sentenceEndMatch.index !== undefined) {
      // Return text up to and including the first sentence ending
      return text.substring(0, sentenceEndMatch.index + 1);
    }
    
    // FIX: Fallback for unpunctuated text - limit by word count
    const words = text.split(/\s+/).filter(w => w.length > 0);
    
    // If more than 20 words, truncate and add period
    if (words.length > 20) {
      return words.slice(0, 20).join(' ') + '.';
    }
    
    // If reasonable length but no punctuation, add period
    if (text.length > 5) {
      return text.trim() + '.';
    }
    
    // Return as-is for very short text
    return text;
  }

  private removeEndingPunctuation(text: string): string {
    if (!text) {
      return text;
    }
    // Remove trailing punctuation marks (but preserve question marks at the end)
    return text.replace(/[.,!:;]+$/, "");
  }

  /**
   * Check if text has minimum word count
   */
  private hasMinimumWords(text: string, minWords: number): boolean {
    return this.countWords(text) >= minWords;
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    if (!text || !text.trim()) {
      return 0;
    }
    const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
    return words.length;
  }

  /**
   * Normalize whitespace
   * Trims and replaces multiple spaces with single space
   */
  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }

  /**
   * Collapse runs of horizontal whitespace while preserving newlines.
   * Used by the reframe (Reuse tweet) flow where tweet line-break structure
   * is meaningful and must not be flattened.
   */
  private normalizeHorizontalWhitespace(text: string): string {
    return text
      .replace(/[ \t\f\v\u00A0]+/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Lightweight post-processor for the reframe / "Reuse tweet" flow.
   *
   * Unlike `processReply` / `processReplyLight`, this path preserves line
   * breaks in the model output (tweets often rely on stanza-like structure).
   * It skips:
   *  - `applyFormatCleanup` (its trailing `normalizeWhitespace` eats \n)
   *  - `removeEndingPunctuation` (rewritten tweets may legitimately end
   *    with `.` or `?`)
   *  - `limitWordCount` (char-limit is enforced by the reframe prompt and
   *    the word-split can merge paragraphs).
   *
   * It keeps meta-commentary / wrapper-quote / banned-pattern removal since
   * those operate on prefixes and do not touch interior newlines.
   */
  processReframe(rawReply: string): string {
    if (!rawReply || typeof rawReply !== "string") {
      return "";
    }
    const original = rawReply.trim();
    if (!original) return "";

    let processed = original;
    processed = this.removeMetaCommentary(processed);
    processed = this.removeWrapperQuotes(processed);
    processed = this.removeBannedPatterns(processed);
    processed = this.normalizeHorizontalWhitespace(processed);
    return processed.trim() || original;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

// Export singleton instance
export const replyPostProcessor = new ReplyPostProcessor();

