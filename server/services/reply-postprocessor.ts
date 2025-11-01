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

    // Step 5: Apply format cleanup (always executed)
    processed = this.replaceDashes(processed); // Rule 2
    processed = this.removeDoubleQuotes(processed); // Rule 4

    // Step 6: Apply removal operations (only if original had >= 5 words)
    if (hasMinWords) {
      processed = this.filterSentences(processed); // Rule 3
      processed = this.removeStartPhrases(processed); // Rule 1
    }

    // Step 7: Normalize whitespace
    processed = this.normalizeWhitespace(processed);

    // Step 8: Final validation - check if processed has minimum words
    const processedWordCount = this.countWords(processed);
    if (processedWordCount < MIN_WORDS_FOR_REMOVAL) {
      // Return original with format cleanup applied (rules 2, 4 only)
      const originalWithCleanup = this.normalizeWhitespace(
        this.removeDoubleQuotes(this.replaceDashes(originalReply))
      );
      return originalWithCleanup.trim() || originalReply;
    }

    // Step 9: Return processed reply
    return processed.trim() || originalReply;
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
   * Preserves dashes in hyphenated words (well-known, etc.)
   */
  private replaceDashes(text: string): string {
    if (!text) {
      return text;
    }

    // Replace em dash (—) and en dash (–) with space (these are always punctuation)
    let cleaned = text
      .replace(/—/g, " ") // Em dash
      .replace(/–/g, " "); // En dash

    // Replace regular dash (-) only when NOT part of a hyphenated word
    // Hyphenated words have pattern: word-char dash word-char (e.g., "well-known")
    // We preserve this pattern and only replace dashes that are clearly separators
    
    // Strategy: Replace dashes that are surrounded by spaces or at boundaries
    // This preserves hyphens in compound words like "well-known", "co-worker"
    
    // Replace dash between spaces: "word - word" → "word word"
    cleaned = cleaned.replace(/\s+-\s+/g, " ");
    
    // Replace dash at start followed by space: "- word" → "word"
    cleaned = cleaned.replace(/^-\s+/g, "");
    
    // Replace dash at end preceded by space: "word -" → "word"
    cleaned = cleaned.replace(/\s+-$/g, "");

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
        const startRegex = new RegExp(`^${this.escapeRegex(startWord)}\\b`, "i");
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

