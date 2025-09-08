import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Sparkles, Copy, ThumbsUp, ThumbsDown, Clock, Zap, Send, User, Bot } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";

interface GenerateReplyResponse {
  reply: string;
  used: number;
  limit: number;
  resetAt: string;
  meta: {
    modelKey: string;
    latencyMs: number;
  };
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  meta?: {
    modelKey?: string;
    latencyMs?: number;
    wordCount?: number;
  };
}

export function GenerateReply() {
  const [tweetText, setTweetText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const generateMutation = useMutation({
    mutationFn: async (data: { tweet_text: string }) => {
      const response = await apiRequest("POST", "/api/generate-reply", data);
      return response.json();
    },
    onSuccess: (data: GenerateReplyResponse) => {
      // Add AI reply to messages
      const aiReply: ChatMessage = {
        id: `ai-${Date.now()}`,
        type: 'assistant',
        content: data.reply,
        timestamp: new Date(),
        meta: {
          modelKey: data.meta.modelKey,
          latencyMs: data.meta.latencyMs,
          wordCount: data.reply.split(/\s+/).length,
        }
      };
      setMessages(prev => [...prev, aiReply]);
      setFeedbackGiven(false);
      // Invalidate usage query to update the badge
      queryClient.invalidateQueries({ queryKey: ["/api/usage"] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }

      // Handle quota errors
      if (error.message.includes("402")) {
        toast({
          title: "Quota exceeded",
          description: "You've reached your reply limit. Upgrade your plan to continue.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Error",
        description: "Failed to generate reply. Please try again.",
        variant: "destructive",
      });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async (data: { rating: 'up' | 'down'; comment?: string }) => {
      await apiRequest("POST", "/api/feedback", data);
    },
    onSuccess: () => {
      setFeedbackGiven(true);
      toast({
        title: "Thank you!",
        description: "Your feedback helps us improve.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }

      toast({
        title: "Error",
        description: "Failed to submit feedback.",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!tweetText.trim()) {
      toast({
        title: "Error",
        description: "Please enter some tweet text to generate a reply.",
        variant: "destructive",
      });
      return;
    }

    // Add user message to chat
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: tweetText.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    
    // Generate AI reply
    generateMutation.mutate({ tweet_text: tweetText.trim() });
    
    // Clear input
    setTweetText("");
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({
        title: "Copied!",
        description: "Reply copied to clipboard.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard.",
        variant: "destructive",
      });
    }
  };

  const handleFeedback = (rating: 'up' | 'down') => {
    feedbackMutation.mutate({ rating });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-4xl mx-auto">
      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <Bot className="w-12 h-12 mx-auto mb-4 text-primary/50" />
            <h3 className="text-lg font-medium mb-2">Ready to Generate Replies!</h3>
            <p>Paste a tweet text below and I'll create an authentic reply for you.</p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              {/* AI Avatar */}
              {message.type === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              
              {/* Message Bubble */}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.type === 'user' 
                  ? 'bg-primary text-primary-foreground ml-12' 
                  : 'bg-muted/50 text-foreground mr-12'
              }`}>
                <p className="text-sm leading-relaxed" data-testid={message.type === 'assistant' ? 'text-generated-reply' : 'text-user-message'}>
                  {message.content}
                </p>
                
                {/* Metadata for AI messages */}
                {message.type === 'assistant' && message.meta && (
                  <div className="mt-3 pt-2 border-t border-border/20 flex items-center justify-between">
                    <div className="flex items-center space-x-3 text-xs text-muted-foreground">
                      <span data-testid="text-word-count">{message.meta.wordCount} words</span>
                      <span data-testid="text-model-used">{message.meta.modelKey}</span>
                      <span data-testid="text-generation-time">{((message.meta.latencyMs || 0) / 1000).toFixed(1)}s</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs hover:bg-background/20"
                      onClick={() => handleCopy(message.content)}
                      data-testid="button-copy-reply"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                )}
              </div>
              
              {/* User Avatar */}
              {message.type === 'user' && (
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
              )}
            </div>
          ))
        )}
        
        {/* Loading Message */}
        {generateMutation.isPending && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="bg-muted/50 text-foreground mr-12 rounded-2xl px-4 py-3">
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-muted-foreground">Generating reply...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border p-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <Textarea
              placeholder="Paste tweet text here to generate a reply..."
              value={tweetText}
              onChange={(e) => setTweetText(e.target.value)}
              className="min-h-[60px] max-h-[120px] resize-none border-0 bg-muted/50 focus-visible:ring-1"
              data-testid="input-tweet-text"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
            />
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending || !tweetText.trim()}
            size="icon"
            className="self-end h-[60px] w-[60px] rounded-xl"
            data-testid="button-generate-reply"
          >
            {generateMutation.isPending ? (
              <div className="animate-spin w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
        
        {/* Usage Info */}
        <div className="mt-2 text-xs text-muted-foreground text-center">
          <Sparkles className="w-3 h-3 inline mr-1" />
          Powered by AI • Authentic replies under 25 words • Press Enter to send
        </div>
      </div>

      {/* Error States */}
      {generateMutation.error && generateMutation.error.message.includes("402") && (
        <div className="p-4 border-t border-border">
          <Alert variant="destructive">
            <AlertDescription>
              You've reached your quota limit. Your plan will reset soon, or you can upgrade for more replies.
              <Button
                size="sm"
                className="mt-2 ml-2"
                onClick={() => window.location.href = '/pricing'}
              >
                Upgrade plan
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
