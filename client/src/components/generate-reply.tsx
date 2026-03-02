import { useState, forwardRef, useImperativeHandle, useEffect, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Copy, Check, ThumbsUp, ThumbsDown, Clock, Zap, Send, User, Bot, Settings, Brain, Crown, X, TrendingUp, Feather, Wand2, PenTool, Type, FileText, MessageSquare } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import type { UserPreferences, SimpleAnalytics } from "@shared/types";
import { POLLING, UI, QUALITY_THRESHOLDS, INPUT_LIMITS } from "@/config/constants";

// Expose methods to parent components via ref
export interface GenerateReplyRef {
  openHistory: () => void;
  openAnalytics: () => void;
}

interface GenerateReplyResponse {
  reply: string;
  used: number;
  limit: number;
  resetAt: string;
  qualityScore?: number;
  meta: {
    modelKey: string;
    latencyMs: number;
  };
}

interface ModelInfo {
  key: string;
  name: string;
  provider: "openai" | "groq";
  inputCost: number;
  outputCost: number;
  contextWindow: number;
  description: string;
}

interface PromptInfo {
  name: string;
  description: string;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  qualityScore?: number;
  meta?: {
    modelKey?: string;
    latencyMs?: number;
    wordCount?: number;
  };
}

interface ReplyHistoryEntry {
  id: string;
  originalTweet: string;
  generatedReply: string;
  wasUsed: boolean;
  usedAt?: string;
  tweetUrl?: string;
  modelKey: string;
  promptVariation: string;
  qualityScore?: number;
  createdAt: string;
}

interface SuggestImprovementsResponse {
  original: string;
  improved: string;
  qualityScore?: number;
  issues?: string[];
  suggestions?: string[];
  analysis?: {
    wordCount: number;
    length: number;
    hasEmojis: boolean;
  };
  usage?: {
    used: number;
    limit: number;
    resetAt: string;
  };
}

interface FeedbackStats {
  totalFeedback: number;
  positiveCount: number;
  negativeCount: number;
  averageQualityScore: number;
  topModels: Array<{ modelKey: string; count: number }>;
  topPrompts: Array<{ promptVariation: string; count: number }>;
}

interface QualityMetrics {
  averageScore: number;
  totalReplies: number;
  highQualityCount: number;
  lowQualityCount: number;
}

export const GenerateReply = forwardRef<GenerateReplyRef>((props, ref) => {
  const [tweetText, setTweetText] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedPrompt, setSelectedPrompt] = useState<string>("default");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showImprove, setShowImprove] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [draftText, setDraftText] = useState("");
  // Fix: Separate state for improve modal tweet text to avoid mutating main input
  const [improveModalTweetText, setImproveModalTweetText] = useState("");
  const [dismissedUpgradeBanner, setDismissedUpgradeBanner] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  
  // Helper function to format time display
  const formatTimeDisplay = (hours: number) => {
    return hours >= 1 
      ? `${hours} ${hours === 1 ? 'hour' : 'hours'}`
      : `${Math.round(hours * 60)} minutes`;
  };
  
  // Fetch user preferences for Prompt Style visibility
  // Fix: Added error handling for preferences query failures
  const { data: userPreferences, error: preferencesError } = useQuery<UserPreferences>({
    queryKey: ["/api/user/preferences"],
    enabled: !!user,
    refetchOnWindowFocus: false,
    retry: 1, // Retry once on failure
    onError: (error) => {
      // Log error but don't break the UI - component will default to hidden (safe fallback)
      console.error('Failed to load user preferences:', error);
    },
  });

  // Expose methods to parent components via ref
  useImperativeHandle(ref, () => ({
    openHistory: () => setShowHistory(true),
    openAnalytics: () => setShowAnalytics(true),
  }));

  // Helper function to validate model structure
  const isValidModel = (model: any): model is ModelInfo => {
    return (
      model?.key &&
      typeof model.key === 'string' &&
      model?.name &&
      typeof model.name === 'string' &&
      typeof model?.inputCost === 'number'
    );
  };

  // Fetch available models
  const { data: modelsData, isLoading: modelsLoading, error: modelsError } = useQuery<{openai: ModelInfo[], groq: ModelInfo[]}>({
    queryKey: ["/api/models"],
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    select: (data) => {
      if (!data) {
        return { openai: [], groq: [] };
      }
      return {
        openai: Array.isArray(data.openai) ? data.openai : [],
        groq: Array.isArray(data.groq) ? data.groq : [],
      };
    },
    onError: (error) => {
      // Fix: Added error logging for debugging
      console.error('Failed to load models:', error);
    },
  });

  // Fetch available prompts
  const { data: promptsData, isLoading: promptsLoading } = useQuery<PromptInfo[]>({
    queryKey: ["/api/prompts"],
    refetchOnWindowFocus: false,
  });

  // Fix: Compute available model keys once (memoized for performance)
  const allAvailableModelKeys = useMemo(() => {
    if (!modelsData) return [];
    return [
      ...(modelsData.groq || []).filter(isValidModel).map(m => m.key),
      ...(modelsData.openai || []).filter(isValidModel).map(m => m.key),
    ];
  }, [modelsData]);

  // Fix: Synchronize selectedModel with available models after filtering
  useEffect(() => {
    if (modelsLoading || !modelsData) return;
    
    // If no models available, clear selection
    if (allAvailableModelKeys.length === 0) {
      setSelectedModel("");
      return;
    }
    
    // If selectedModel doesn't exist in available models, set to first available
    if (!selectedModel || !allAvailableModelKeys.includes(selectedModel)) {
      setSelectedModel(allAvailableModelKeys[0]);
    }
  }, [modelsData, modelsLoading, selectedModel, allAvailableModelKeys, setSelectedModel]);

  // Fix: Add error toast for model loading failures
  useEffect(() => {
    if (modelsError) {
      toast({
        title: "Error loading AI models",
        description: modelsError.message || "Failed to fetch available AI models. Please refresh the page.",
        variant: "destructive",
      });
    }
  }, [modelsError, toast]);

  // Fetch reply history
  const { data: historyData, refetch: refetchHistory } = useQuery<{ history: ReplyHistoryEntry[] }>({
    queryKey: ["/api/reply-history"],
    enabled: showHistory,
    refetchOnWindowFocus: false,
  });

  // Fetch simple analytics stats (optimized with usage_counters)
  const { data: simpleAnalyticsData } = useQuery<SimpleAnalytics>({
    queryKey: ["/api/analytics/simple"],
    enabled: showAnalytics,
    refetchOnWindowFocus: false,
  });

  // Fetch quality metrics
  const { data: metricsData } = useQuery<{ metrics: QualityMetrics; recommendations: string[] }>({
    queryKey: ["/api/quality/metrics"],
    enabled: showAnalytics,
    refetchOnWindowFocus: false,
  });

  // Fetch usage data for counter and upgrade banner
  interface UsageStatus {
    planCode: string;
    used: number;
    limit: number;
    resetAt: string;
    status: 'active' | 'trial' | 'no_access';
    isWhitelisted?: boolean;
    upgradeRequired?: boolean;
    upgradeMessage?: string;
    modeBreakdown?: {
      'single-sentence'?: { replies: number; credits: number };
      'enhanced'?: { replies: number; credits: number };
    };
  }

  const { data: usage } = useQuery<UsageStatus>({
    queryKey: ["/api/usage"],
    refetchInterval: POLLING.USAGE_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  // Reset dismissed banner when upgrade requirement changes
  useEffect(() => {
    if (usage && !usage.upgradeRequired) {
      setDismissedUpgradeBanner(false);
    }
  }, [usage?.upgradeRequired]);

  // Fix: Pre-populate improve modal tweet text when modal opens
  useEffect(() => {
    if (showImprove) {
      setImproveModalTweetText(tweetText);
    }
  }, [showImprove, tweetText]);

  // Copy handler for history items
  const handleCopyHistoryReply = async (replyText: string, entryId: string) => {
    try {
      await navigator.clipboard.writeText(replyText);
      setCopiedHistoryId(entryId);
      
      // Reset after 2 seconds
      setTimeout(() => setCopiedHistoryId(null), UI.COPY_FEEDBACK_DURATION_MS);
      
      toast({
        title: "Copied!",
        description: "Reply copied to clipboard",
      });
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const generateMutation = useMutation({
    mutationFn: async (data: { tweet_text: string; model_key?: string; prompt_variation?: string }) => {
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
        qualityScore: data.qualityScore,
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
        }, UI.REDIRECT_DELAY_MS);
        return;
      }

      // Handle quota errors
      if ((error as Error & { status?: number }).status === 402) {
        toast({
          title: "Quota exceeded",
          description: "You've reached your credit limit. Upgrade your plan to continue.",
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
        }, UI.REDIRECT_DELAY_MS);
        return;
      }

      toast({
        title: "Error",
        description: "Failed to submit feedback.",
        variant: "destructive",
      });
    },
  });

  const improveMutation = useMutation({
    mutationFn: async (data: { draft_reply: string; original_tweet: string }) => {
      const response = await apiRequest("POST", "/api/suggest-improvements", data);
      if (!response.ok) {
        // Fix: Improved error handling for non-JSON responses
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { message: response.statusText || "Unknown error" };
        }
        if (response.status === 402) {
          // Quota exceeded
          const error = new Error(errorData.message || "Quota exceeded");
          (error as any).status = 402;
          (error as any).data = errorData;
          throw error;
        }
        throw new Error(errorData.message || "Failed to generate improvements");
      }
      return response.json();
    },
    onSuccess: (data: SuggestImprovementsResponse) => {
      toast({
        title: "Improvements Generated",
        description: data.qualityScore !== undefined ? `Quality Score: ${data.qualityScore}/100` : "Draft improved successfully",
      });
      // Refresh usage data
      queryClient.invalidateQueries({ queryKey: ["/api/usage"] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => window.location.href = "/api/login", UI.REDIRECT_DELAY_MS);
        return;
      }
      
      // Handle quota exceeded
      if ((error as any).status === 402) {
        const errorData = (error as any).data;
        toast({
          title: "Quota Exceeded",
          description: errorData.upgradeMessage || "You've used all your credits. Upgrade to continue.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Error",
        description: error.message || "Failed to generate improvements.",
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
    
    // Generate AI reply with selected model and prompt
    generateMutation.mutate({ 
      tweet_text: tweetText.trim(),
      model_key: selectedModel,
      prompt_variation: selectedPrompt
    });
    
    // Clear input
    setTweetText("");
  };

  const handleCopy = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), UI.COPY_FEEDBACK_DURATION_MS);
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
    <Card className="card-modern-enhanced border border-primary/20 bg-gradient-to-br from-card to-card/50 min-h-[600px] max-h-[calc(100vh-12rem)] max-w-4xl mx-auto flex flex-col overflow-hidden">
      {/* Action Buttons Header - Sprint 1: Modernized, Sprint 3: Added accessibility */}
      <div className="border-b border-border/50 p-4 flex items-center justify-between bg-gradient-to-r from-background/50 to-background" role="toolbar" aria-label="Reply generation actions">
        <h2 className="text-lg font-semibold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">Generate Reply</h2>
        <div className="flex gap-2" role="group" aria-label="Action buttons">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(true)}
            className="rounded-lg transition-all duration-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid="button-show-history"
            aria-label="View reply history"
          >
            <Clock className="w-4 h-4 mr-2" aria-hidden="true" />
            History
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImprove(true)}
            className="rounded-lg transition-all duration-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid="button-show-improve"
            aria-label="Improve draft reply"
          >
            <Sparkles className="w-4 h-4 mr-2" aria-hidden="true" />
            Improve Draft
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAnalytics(true)}
            className="rounded-lg transition-all duration-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid="button-show-analytics"
            aria-label="View analytics and insights"
          >
            <Brain className="w-4 h-4 mr-2" aria-hidden="true" />
            Analytics
          </Button>
        </div>
      </div>
      {/* Chat Messages Area - Sprint 2: Modernized empty state, Sprint 3: Added accessibility */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6" role="log" aria-live="polite" aria-label="Reply generation messages">
        {messages.length === 0 ? (
          <div className="empty-state-modern" role="status" aria-label="Ready to generate replies">
            <div className="empty-state-icon" aria-hidden="true">
              <MessageSquare className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">Ready to Generate Replies!</h3>
            <p className="text-muted-foreground max-w-md">Paste a tweet text below and I'll create an authentic reply for you.</p>
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
                      {message.qualityScore && (
                        <Badge variant={message.qualityScore >= QUALITY_THRESHOLDS.HIGH ? "default" : message.qualityScore >= QUALITY_THRESHOLDS.MEDIUM ? "secondary" : "destructive"}>
                          Quality: {message.qualityScore}
                        </Badge>
                      )}
                      <span data-testid="text-word-count">{message.meta.wordCount} words</span>
                      <span data-testid="text-model-used">{message.meta.modelKey}</span>
                      <span data-testid="text-generation-time">{((message.meta.latencyMs || 0) / 1000).toFixed(1)}s</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs hover:bg-background/20"
                      onClick={() => handleCopy(message.content, message.id)}
                      data-testid="button-copy-reply"
                    >
                      {copiedId === message.id ? (
                        <>
                          <Check className="w-3 h-3 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 mr-1" />
                          Copy
                        </>
                      )}
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
        
        {/* Loading Message - Sprint 3: Added accessibility */}
        {generateMutation.isPending && (
          <div className="flex gap-3 justify-start" role="status" aria-live="polite" aria-label="Generating reply">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="bg-muted/50 text-foreground mr-12 rounded-2xl px-4 py-3">
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1" aria-hidden="true">
                  <div className={`w-2 h-2 bg-primary/60 rounded-full ${prefersReducedMotion ? '' : 'animate-bounce'}`} style={prefersReducedMotion ? {} : { animationDelay: '0ms' }} />
                  <div className={`w-2 h-2 bg-primary/60 rounded-full ${prefersReducedMotion ? '' : 'animate-bounce'}`} style={prefersReducedMotion ? {} : { animationDelay: '150ms' }} />
                  <div className={`w-2 h-2 bg-primary/60 rounded-full ${prefersReducedMotion ? '' : 'animate-bounce'}`} style={prefersReducedMotion ? {} : { animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-muted-foreground">Generating reply...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Upgrade Banner Above Input */}
      {usage && usage.upgradeRequired && !usage.isWhitelisted && !dismissedUpgradeBanner && (
        <div className="border-t border-border px-4 pt-3 pb-2 animate-in slide-in-from-top-2 duration-300">
          <Alert className="bg-gradient-to-r from-primary/10 via-purple-600/10 to-primary/10 border-primary/20">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-4 h-4 text-primary" />
                  <AlertDescription className="text-sm font-medium text-foreground m-0">
                    {usage.upgradeMessage || "You've used all your trial credits. Upgrade to continue generating replies."}
                  </AlertDescription>
                </div>
                <Button
                  onClick={() => setLocation('/pricing')}
                  size="sm"
                  className="mt-2 bg-primary hover:bg-primary/90 text-white font-semibold"
                >
                  <Crown className="w-3 h-3 mr-2" />
                  Upgrade to Pro
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={() => setDismissedUpgradeBanner(true)}
                aria-label="Dismiss upgrade banner"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </Alert>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-border p-4">
        {/* Model and Prompt Selection */}
        {/* Fix: Extracted grid layout logic for better readability */}
        {(() => {
          const showModels = user?.isWhitelisted ?? false;
          const showPromptStyle = userPreferences?.promptStyleEnabled ?? false;
          const gridCols = showModels && showPromptStyle ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1';
          return (
            <div className={`grid gap-4 mb-4 ${gridCols}`}>
              {/* Model Selection - Admin only */}
              {showModels && (
            <div>
              <Label htmlFor="model-select" className="text-sm font-medium mb-2 flex items-center">
                <Brain className="w-4 h-4 mr-2" />
                AI Model
              </Label>
          <Select 
            value={
              // Fix: Only set value if selectedModel exists in available models
              selectedModel && allAvailableModelKeys.includes(selectedModel) 
                ? selectedModel 
                : undefined
            }
            onValueChange={(value) => {
              // Fix: Validate value before setting state
              if (allAvailableModelKeys.includes(value)) {
                setSelectedModel(value);
              }
            }}
          >
            <SelectTrigger className="w-full" data-testid="select-ai-model">
              <SelectValue placeholder="Select AI model..." />
            </SelectTrigger>
            <SelectContent>
              {modelsLoading ? (
                <SelectItem value="loading" disabled>Loading models...</SelectItem>
              ) : modelsError ? (
                <SelectItem value="error" disabled>Failed to load models. Please refresh.</SelectItem>
              ) : (
                modelsData && (
                  <>
                    {[
                      ...(modelsData.groq || []),
                      ...(modelsData.openai || []),
                    ]
                      .filter(isValidModel)
                      .map((model) => (
                        <SelectItem key={model.key} value={model.key} data-testid={`model-${model.key}`}>
                          <div className="flex items-center justify-between w-full">
                            <div className="flex flex-col">
                              <span className="font-medium">{model.name || 'Unknown'}</span>
                              <span className="text-xs text-muted-foreground">{model.description || ''}</span>
                            </div>
                          </div>
                        </SelectItem>
                      ))}

                    {(!modelsData.openai || modelsData.openai.length === 0) &&
                     (!modelsData.groq || modelsData.groq.length === 0) && (
                      <SelectItem value="no-models" disabled>No models available</SelectItem>
                    )}
                  </>
                )
              )}
            </SelectContent>
          </Select>
            </div>
          )}
          
          {/* Prompt Selection - Enabled via settings */}
          {showPromptStyle && (
            <div>
              <Label htmlFor="prompt-select" className="text-sm font-medium mb-2 flex items-center">
                <Settings className="w-4 h-4 mr-2" />
                Prompt Style
              </Label>
            <Select value={selectedPrompt} onValueChange={setSelectedPrompt}>
              <SelectTrigger className="w-full" data-testid="select-prompt-style">
                <SelectValue placeholder="Select prompt style..." />
              </SelectTrigger>
              <SelectContent>
                {promptsLoading ? (
                  <SelectItem value="loading" disabled>Loading prompts...</SelectItem>
                ) : (
                  promptsData && promptsData.map((prompt, index) => (
                    <SelectItem key={index} value={prompt.name} data-testid={`prompt-${prompt.name}`}>
                      <div className="flex flex-col">
                        <span className="font-medium capitalize">{prompt.name.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span className="text-xs text-muted-foreground">{prompt.description}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            </div>
              )}
            </div>
          );
        })()}
        
        <div className="flex gap-3">
          <div className="flex-1">
            <Textarea
              placeholder="Paste tweet text here to generate a reply..."
              value={tweetText}
              onChange={(e) => setTweetText(e.target.value)}
              className="min-h-[60px] max-h-[120px] resize-none border-0 bg-muted/50 focus-visible:ring-1"
              data-testid="input-tweet-text"
              aria-label="Tweet text input"
              aria-describedby="tweet-input-help"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
            />
            <span id="tweet-input-help" className="sr-only">Press Enter to generate reply, Shift+Enter for new line</span>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending || !tweetText.trim()}
            size="icon"
            className="self-end h-[60px] w-[60px] rounded-xl bg-primary hover:bg-primary/90 transition-all duration-300 hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid="button-generate-reply"
            aria-label={generateMutation.isPending ? "Generating reply..." : "Generate reply"}
            aria-disabled={generateMutation.isPending || !tweetText.trim()}
          >
            {generateMutation.isPending ? (
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
        
        {/* Usage Info */}
        <div className="mt-2 text-xs text-muted-foreground text-center">
          Authentic replies • Press Enter to send
        </div>
      </div>

      {/* Error States */}
      {generateMutation.error && (generateMutation.error as Error & { status?: number }).status === 402 && (
        <div className="p-4 border-t border-border">
          <Alert variant="destructive">
            <AlertDescription>
              You've reached your credit limit. Your plan will reset soon, or you can upgrade for more credits.
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

      {/* Reply History Sheet */}
      <Sheet open={showHistory} onOpenChange={setShowHistory}>
        <SheetContent side="right" className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Reply History</SheetTitle>
            <SheetDescription>
              View your previously generated replies
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-8rem)] mt-4">
            {historyData?.history.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No reply history yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {historyData?.history.map((entry) => (
                  <Card key={entry.id}>
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {/* Header: Date and Quality */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.createdAt).toLocaleDateString()}
                          </span>
                          {entry.qualityScore && (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              ⭐ Quality: {entry.qualityScore}
                            </Badge>
                          )}
                        </div>
                        
                        {/* Original Tweet (italic, smaller) */}
                        <p className="text-xs text-muted-foreground italic bg-muted/50 p-2 rounded">
                          {entry.originalTweet}
                        </p>
                        
                        {/* Generated Reply */}
                        <p className="text-sm">
                          {entry.generatedReply}
                        </p>
                        
                        {/* Copy Button */}
                        <Button
                          variant={copiedHistoryId === entry.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleCopyHistoryReply(entry.generatedReply, entry.id)}
                          className="w-full"
                          aria-label={`Copy reply for ${entry.originalTweet.substring(0, 30)}...`}
                        >
                          {copiedHistoryId === entry.id ? (
                            <>
                              <Check className="w-4 h-4 mr-2" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4 mr-2" />
                              Copy
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Suggest Improvements Sheet */}
      <Sheet open={showImprove} onOpenChange={setShowImprove}>
        <SheetContent side="right" className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Improve Your Draft</SheetTitle>
            <SheetDescription>
              Get AI generated suggestions to improve your reply. Original tweet is required.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {/* Original Tweet */}
            <div>
              <Label htmlFor="tweet-text">Original Tweet *</Label>
              <Textarea
                id="tweet-text"
                placeholder="Paste the original tweet here..."
                value={improveModalTweetText}
                onChange={(e) => setImproveModalTweetText(e.target.value)}
                className="min-h-[80px]"
                readOnly={false}
              />
            </div>
            
            {/* Draft Reply */}
            <div>
              <Label htmlFor="draft-text">Your Draft Reply *</Label>
              <Textarea
                id="draft-text"
                placeholder="Paste your draft reply here..."
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
            
            <Button
              onClick={() => {
                // Fix: Added input length validation before API call
                if (!improveModalTweetText.trim()) {
                  toast({
                    title: "Tweet Required",
                    description: "Please enter the original tweet to improve your draft.",
                    variant: "destructive",
                  });
                  return;
                }
                if (improveModalTweetText.length > INPUT_LIMITS.MAX_TWEET_TEXT) {
                  toast({
                    title: "Tweet Too Long",
                    description: `Tweet text must be under ${INPUT_LIMITS.MAX_TWEET_TEXT} characters.`,
                    variant: "destructive",
                  });
                  return;
                }
                if (!draftText.trim()) {
                  toast({
                    title: "Draft Required",
                    description: "Please enter your draft reply.",
                    variant: "destructive",
                  });
                  return;
                }
                if (draftText.length > INPUT_LIMITS.MAX_DRAFT_REPLY) {
                  toast({
                    title: "Draft Too Long",
                    description: `Draft reply must be under ${INPUT_LIMITS.MAX_DRAFT_REPLY} characters.`,
                    variant: "destructive",
                  });
                  return;
                }
                improveMutation.mutate({ 
                  draft_reply: draftText,
                  original_tweet: improveModalTweetText
                });
              }}
              disabled={!draftText.trim() || !improveModalTweetText.trim() || improveMutation.isPending}
              className="w-full"
            >
              {improveMutation.isPending ? "Improving..." : "Get Improved Version"}
            </Button>
            
            {improveMutation.data && (
              <div className="space-y-4">
                {/* Side-by-Side Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Original Draft */}
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-semibold">Your Draft</Label>
                      </div>
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                        {improveMutation.data.original}
                      </div>
                    </CardContent>
                  </Card>
                  
                  {/* Improved Version */}
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-semibold">Improved Version</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            // Fix: Added loading state to prevent double-clicks
                            try {
                              await navigator.clipboard.writeText(improveMutation.data!.improved);
                              toast({
                                title: "Copied!",
                                description: "Improved version copied to clipboard",
                              });
                            } catch (error) {
                              toast({
                                title: "Error",
                                description: "Failed to copy to clipboard",
                                variant: "destructive",
                              });
                            }
                          }}
                          className="h-6 px-2"
                          disabled={!improveMutation.data?.improved}
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <div className="text-sm whitespace-pre-wrap break-words">
                        {improveMutation.data.improved}
                      </div>
                    </CardContent>
                  </Card>
                </div>
                
                {/* Use Improved Version Button */}
                <Button
                  onClick={() => {
                    setDraftText(improveMutation.data!.improved);
                    toast({
                      title: "Updated",
                      description: "Draft text updated with improved version",
                    });
                  }}
                  className="w-full"
                  variant="outline"
                >
                  Use Improved Version
                </Button>
                
                    {/* Quality Metrics */}
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        {improveMutation.data.qualityScore !== undefined && (
                          <div>
                            <p className="text-sm font-medium mb-1">Quality Score</p>
                            <Badge variant={improveMutation.data.qualityScore >= QUALITY_THRESHOLDS.IMPROVE_FEATURE ? "default" : "destructive"}>
                              {improveMutation.data.qualityScore}/100
                            </Badge>
                          </div>
                        )}
                    {improveMutation.data.issues && improveMutation.data.issues.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-1">Issues Found:</p>
                        <ul className="text-xs text-muted-foreground space-y-1">
                          {improveMutation.data.issues.map((issue, i) => (
                            <li key={i}>• {issue}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {improveMutation.data.suggestions && improveMutation.data.suggestions.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-1">Suggestions:</p>
                        <ul className="text-xs space-y-1">
                          {improveMutation.data.suggestions.map((suggestion, i) => (
                            <li key={i}>• {suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Analytics Sheet */}
      <Sheet open={showAnalytics} onOpenChange={setShowAnalytics}>
        <SheetContent side="right" className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Analytics & Insights</SheetTitle>
            <SheetDescription>
              Your reply generation statistics
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-8rem)] mt-4">
            <div className="space-y-6">
              {/* Summary Card */}
              {simpleAnalyticsData && simpleAnalyticsData.summary && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3">Summary</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Avg Quality</p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-bold">
                            {simpleAnalyticsData.summary.avgQuality}
                          </p>
                          {simpleAnalyticsData.summary.qualityTrend !== 0 && (
                            <span className={`text-xs font-medium ${
                              simpleAnalyticsData.summary.qualityTrend > 0 
                                ? 'text-green-600' 
                                : 'text-red-600'
                            }`}>
                              {simpleAnalyticsData.summary.qualityTrend > 0 ? '+' : ''}
                              {simpleAnalyticsData.summary.qualityTrend}
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Replies</p>
                        <p className="text-2xl font-bold">
                          {simpleAnalyticsData.summary.totalReplies}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Time Saved</p>
                        <p className="text-2xl font-bold text-blue-600">
                          {formatTimeDisplay(simpleAnalyticsData.summary.timeSavedHours)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">High Quality ({QUALITY_THRESHOLDS.HIGH}+)</p>
                        <p className="text-2xl font-bold text-green-600">
                          {simpleAnalyticsData.summary.highQualityCount}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Quality Parameters Card */}
              {simpleAnalyticsData && simpleAnalyticsData.parameterBreakdown && simpleAnalyticsData.parameterBreakdown.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3">Quality Parameters</h3>
                    <div className="space-y-2">
                      {simpleAnalyticsData.parameterBreakdown.map((param, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-sm">{param.name}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary rounded-full" 
                                style={{ width: `${(param.avgScore / 10) * 100}%` }}
                              />
                            </div>
                            <Badge variant="secondary" className="min-w-[3rem] justify-center">
                              {param.avgScore.toFixed(1)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Activity Trend Card */}
              {simpleAnalyticsData && simpleAnalyticsData.activityTrend && simpleAnalyticsData.activityTrend.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3">Recent Activity (Last 7 Days)</h3>
                    <div className="space-y-2">
                      {simpleAnalyticsData.activityTrend.slice(-7).map((day, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          <div className="flex items-center gap-3">
                            <span>{day.count} replies</span>
                            {day.avgQuality > 0 && (
                              <Badge variant="outline" className="min-w-[3rem] justify-center">
                                {day.avgQuality} avg
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Insights Card */}
              {simpleAnalyticsData && simpleAnalyticsData.insights && simpleAnalyticsData.insights.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3">Insights</h3>
                    <div className="space-y-3">
                      {simpleAnalyticsData.insights.map((insight, i) => (
                        <div key={i} className="flex items-start gap-2">
                          {insight.type === 'success' && (
                            <TrendingUp className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                          )}
                          {insight.type === 'info' && (
                            <Brain className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                          )}
                          {insight.type === 'streak' && (
                            <Zap className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                          )}
                          <p className="text-sm">{insight.text}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Empty State */}
              {!simpleAnalyticsData && (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Brain className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Generate your first reply to see analytics
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </Card>
  );
});

GenerateReply.displayName = "GenerateReply";
