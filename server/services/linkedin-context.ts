import type { LinkedInPostAnalysis } from "./linkedin-analysis-agents.js";

/**
 * LinkedIn context prompt builder. Analysis is performed by linkedin-analysis-agents;
 * this module only assembles the context string for system prompts (viewer role, thread, etc.).
 */
export class LinkedInContextAnalyzer {
  generateContextPrompt(
    analysis: LinkedInPostAnalysis,
    viewerIsOriginalAuthor: boolean,
    threadContext?: {
      isReply: boolean;
      threadLength: number;
      originalPost?: string | null;
    }
  ): string {
    const parts: string[] = [];
    const commentOnComment = !!(threadContext?.isReply && threadContext.threadLength > 1);
    console.log("[LinkedIn] linkedInContextAnalyzer.generateContextPrompt:", {
      viewerIsOriginalAuthor,
      isOther: !viewerIsOriginalAuthor,
      hasThreadContext: !!threadContext,
      threadLength: threadContext?.threadLength ?? 0,
      commentOnCommentContextAdded: commentOnComment,
    });

    if (analysis.enrichedContextPrompt) {
      parts.push(analysis.enrichedContextPrompt);
    }

    if (!viewerIsOriginalAuthor) {
      parts.push('\nYou are writing a comment or reply on behalf of the logged-in user.');
      parts.push('Write from their point of view, engaging professionally with the author of the LinkedIn post.');
    }

    if (threadContext?.isReply && threadContext.threadLength > 1) {
      parts.push('\nIMPORTANT: You are replying to a comment on a LinkedIn post, not to the post itself.');
      parts.push('Your reply should directly address the comment, while being aware of the original post context.');
    }

    return parts.join('\n');
  }
}

export const linkedInContextAnalyzer = new LinkedInContextAnalyzer();
