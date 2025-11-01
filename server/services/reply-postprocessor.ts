/**
 * Postprocessing service for AI-generated replies
 * Applies specific cleaning rules in an optimized order
 */

// Configuration for removable start phrases - easily extensible
const START_PHRASES = ["Couldn't agree more", "Preach"];

// Configuration for filtered sentence starts - easily extensible
const FILTERED_SENTENCE_STARTS = ["Love", "That's"];

// Configuration for words that disqualify sentences - easily extensible
const DISQUALIFYING_WORDS = ["simplification"];

// Configuration for banned patterns (from previous postprocessing) - easily extensible
const BANNED_PATTERNS = [
  /#\w+/g, // Hashtags
  /Check out my/gi,
  /The future is here/gi,
  /This changes everything/gi,
  /Revolutionary/gi,
  /Game-changing/gi,
];

// Maximum word count (from previous postprocessing)
const MAX_WORDS = 50;

// Minimum word count required for removal operations
const MIN_WORDS_FOR_REMOVAL = 5;

export class ReplyPostProcessor {
  /**
   * Main processing function - applies all rules in optimized order
   */
  processReply(rawReply: string): string {
    // Step 1: Store original reply for fallback (handle null/undefined)
    if (!rawReply || typeof rawReply !== 'string') {
      return '';
    }
    const originalReply = rawReply.trim();

    // Step 2: Handle empty strings early
    if (!originalReply) {
      return '';
    }

    // Step 3: Check if original has minimum words for removal operations
    const hasMinWords = this.hasMinimumWords(originalReply, MIN_WORDS_FOR_REMOVAL);

    // Step 4: Start with original reply
    let processed = originalReply;

    // Step 5: Apply previous postprocessing rules (always executed)
    processed = this.removeWrapperQuotes(processed); // Previous rule: Remove quotes if AI wrapped response
    processed = this.removeBannedPatterns(processed); // Previous rule: Remove hashtags and banned phrases
    processed = this.limitWordCount(processed, MAX_WORDS); // Previous rule: Limit to 50 words
    
    // Step 6: Apply new format cleanup rules (always executed)
    processed = this.replaceDashes(processed); // Rule 2
    processed = this.removeDoubleQuotes(processed); // Rule 4

    // Step 7: Apply removal operations (only if original had >= 5 words)
    if (hasMinWords) {
      // First remove start phrases (Rule 1) - this handles phrases at the very start of reply
      processed = this.removeStartPhrases(processed);
      // Then filter sentences (Rule 3) - this handles sentences that start with filtered words
      processed = this.filterSentences(processed);
      // Also check if entire reply starts with filtered sentence starts and remove
      processed = this.removeFilteredStartWords(processed);
    }

    // Step 8: Normalize whitespace
    processed = this.normalizeWhitespace(processed);

    // Step 9: Final validation - check if processed has minimum words
    const processedWordCount = this.countWords(processed);
    if (processedWordCount < MIN_WORDS_FOR_REMOVAL) {
      // Return original with all cleanup applied (previous rules + new format cleanup)
      const originalWithCleanup = this.normalizeWhitespace(
        this.removeDoubleQuotes(
          this.replaceDashes(
            this.limitWordCount(
              this.removeBannedPatterns(
                this.removeWrapperQuotes(originalReply)
              ),
              MAX_WORDS
            )
          )
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
   */
  private replaceDashes(text: string): string {
    if (!text) {
      return text;
    }

    // Replace em dash (—) and en dash (–) with space (these are always punctuation)
    let cleaned = text
      .replace(/—/g, " ") // Em dash
      .replace(/–/g, " "); // En dash

    // Replace regular dash (-) that appears between word characters
    // Pattern: word-char dash word-char (e.g., "short-term" → "short term")
    // This matches dashes between letters/numbers, which covers hyphenated words
    
    // Replace dash between word characters: "short-term" → "short term"
    // Use word boundary to ensure we're replacing dashes between words
    cleaned = cleaned.replace(/(\w)-(\w)/g, "$1 $2");
    
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
   * Checks if the entire reply (not just sentences) starts with filtered words
   */
  private removeFilteredStartWords(text: string): string {
    if (!text || !text.trim()) {
      return text;
    }
    
    let cleaned = text.trim();
    
    for (const startWord of FILTERED_SENTENCE_STARTS) {
      const escaped = this.escapeRegex(startWord);
      // Match word at start of entire reply, followed by space, punctuation, or end
      const startRegex = new RegExp(`^${escaped}(\\s|[.,!?:;]|$)`, "i");
      if (startRegex.test(cleaned)) {
        // Remove the word and following punctuation/space
        cleaned = cleaned.replace(startRegex, "").trim();
        break; // Only remove first matching word
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

    // Split on period followed by space, or period at end of string
    // Use a regex that properly handles period at end without space
    const sentences: Array<{ text: string; hasPeriod: boolean }> = [];
    
    // Split by period, but keep track of whether period was followed by space or at end
    let lastIndex = 0;
    const periodRegex = /\.(\s+|$)/g;
    let match;
    
    while ((match = periodRegex.exec(text)) !== null) {
      const sentenceText = text.substring(lastIndex, match.index).trim();
      if (sentenceText) {
        const hasPeriod = true; // We matched a period
        sentences.push({ text: sentenceText, hasPeriod });
      }
      lastIndex = periodRegex.lastIndex;
    }
    
    // Handle remaining text after last period
    if (lastIndex < text.length) {
      const remaining = text.substring(lastIndex).trim();
      if (remaining) {
        sentences.push({ text: remaining, hasPeriod: false });
      }
    }
    
    // If no periods found, treat entire text as one sentence
    if (sentences.length === 0 && text.trim()) {
      sentences.push({ text: text.trim(), hasPeriod: false });
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

      // Check if sentence contains disqualifying words
      if (!shouldRemove) {
        for (const word of DISQUALIFYING_WORDS) {
          const wordRegex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, "i");
          if (wordRegex.test(sentenceText)) {
            shouldRemove = true;
            break;
          }
        }
      }

      if (!shouldRemove) {
        // Add period back if it was there originally
        filtered.push(sentenceText + (sentenceObj.hasPeriod ? "." : ""));
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
   * Escape special regex characters
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

// Export singleton instance
export const replyPostProcessor = new ReplyPostProcessor();

