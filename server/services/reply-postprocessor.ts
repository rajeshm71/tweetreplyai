/**
 * Postprocessing service for AI-generated replies
 * Applies specific cleaning rules in an optimized order
 */

// Configuration for removable start phrases - easily extensible
const START_PHRASES = ["Couldn't agree more", "Preach", "Spot on"];

// Configuration for filtered sentence starts - easily extensible
const FILTERED_SENTENCE_STARTS = ["Love", "That's", "Appreciate"];

// Configuration for words that disqualify sentences - easily extensible
const DISQUALIFYING_WORDS = ["simplification", "Can't wait to see"];

// Configuration for word replacements with random alternatives
const WORD_REPLACEMENTS: Record<string, string[]> = {
  "Congrats": ["Congrats", "Congratulation", "Congo", "Nice", "Great", "Awesome"],
  "key": ["key", "important", "essential", "crucial", "vital", "critical"]
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

// Maximum word count (from previous postprocessing)
const MAX_WORDS = 50;

// Minimum word count required for removal operations
const MIN_WORDS_FOR_REMOVAL = 5;

export class ReplyPostProcessor {
  /**
   * Light processing for improved drafts - skips aggressive rules that might remove improvements
   * Only applies basic cleanup: quotes, banned patterns, word count, format cleanup
   */
  processReplyLight(rawReply: string): string {
    // Step 1: Store original reply for fallback (handle null/undefined)
    if (!rawReply || typeof rawReply !== 'string') {
      return '';
    }
    const originalReply = rawReply.trim();

    // Step 2: Handle empty strings early
    if (!originalReply) {
      return '';
    }

    // Step 3: Start with original reply
    let processed = originalReply;

    // Step 4: Apply basic cleanup rules only (no aggressive removal)
    processed = this.removeWrapperQuotes(processed); // Remove quotes if AI wrapped response
    processed = this.removeBannedPatterns(processed); // Remove hashtags and banned phrases
    processed = this.limitWordCount(processed, MAX_WORDS); // Limit to 50 words
    
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
    processed = this.applyFormatCleanup(processed);

    // Step 7: Apply removal operations (only if original had >= 5 words)
    if (hasMinWords) {
      // First remove start phrases (Rule 1) - this handles phrases at the very start of reply
      processed = this.removeStartPhrases(processed);
      // Then filter sentences (Rule 3) - this handles sentences that start with filtered words
      processed = this.filterSentences(processed);
      // Also check if entire reply starts with filtered sentence starts and remove
      processed = this.removeFilteredStartWords(processed);
    }

    // Step 8: Remove ending punctuation and normalize whitespace
    processed = this.removeEndingPunctuation(processed);
    processed = this.normalizeWhitespace(processed);

    // Step 9: Final validation - check if processed has minimum words
    const processedWordCount = this.countWords(processed);
    if (processedWordCount < MIN_WORDS_FOR_REMOVAL) {
      // Return original with all cleanup applied (previous rules + new format cleanup)
      const originalWithBasicCleanup = this.limitWordCount(
        this.removeBannedPatterns(
          this.removeWrapperQuotes(originalReply)
        ),
        MAX_WORDS
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
   * Helper method: Apply all format cleanup rules
   * Centralizes format cleanup logic for reuse in fallback scenarios
   */
  private applyFormatCleanup(text: string): string {
    if (!text) {
      return text;
    }
    let cleaned = text;
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
  private removeEndingPunctuation(text: string): string {
    if (!text) {
      return text;
    }
    // Remove trailing punctuation marks
    return text.replace(/[.,!?:;]+$/, "");
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

