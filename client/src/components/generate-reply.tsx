import { useState } from "react";
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
import { Sparkles, Copy, Check, ThumbsUp, ThumbsDown, Clock, Zap, Send, User, Bot, Settings, Brain } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";

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
  provider: "openai" | "gemini";
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
  qualityScore: number;
  issues: string[];
  suggestions: string[];
  analysis: {
    wordCount: number;
    length: number;
    hasEmojis: boolean;
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

export function GenerateReply() {
  const [tweetText, setTweetText] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>("gpt-4o-mini");
  const [selectedPrompt, setSelectedPrompt] = useState<string>("default");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showImprove, setShowImprove] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [draftText, setDraftText] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available models
  const { data: modelsData, isLoading: modelsLoading } = useQuery<{openai: ModelInfo[], gemini: ModelInfo[]}>({
    queryKey: ["/api/models"],
    refetchOnWindowFocus: false,
  });

  // Fetch available prompts
  const { data: promptsData, isLoading: promptsLoading } = useQuery<PromptInfo[]>({
    queryKey: ["/api/prompts"],
    refetchOnWindowFocus: false,
  });

  // Fetch reply history
  const { data: historyData, refetch: refetchHistory } = useQuery<{ history: ReplyHistoryEntry[] }>({
    queryKey: ["/api/reply-history"],
    enabled: showHistory,
    refetchOnWindowFocus: false,
  });

  // Fetch analytics stats
  const { data: analyticsData } = useQuery<FeedbackStats>({
    queryKey: ["/api/analytics/feedback-stats"],
    enabled: showAnalytics,
    refetchOnWindowFocus: false,
  });

  // Fetch quality metrics
  const { data: metricsData } = useQuery<{ metrics: QualityMetrics; recommendations: string[] }>({
    queryKey: ["/api/quality/metrics"],
    enabled: showAnalytics,
    refetchOnWindowFocus: false,
  });

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

  const improveMutation = useMutation({
    mutationFn: async (data: { draft_reply: string; original_tweet?: string }) => {
      const response = await apiRequest("POST", "/api/suggest-improvements", data);
      return response.json();
    },
    onSuccess: (data: SuggestImprovementsResponse) => {
      toast({
        title: "Improvements Generated",
        description: `Quality Score: ${data.qualityScore}/100`,
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => window.location.href = "/api/login", 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to generate improvements.",
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
      setTimeout(() => setCopiedId(null), 1500);
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
      {/* Action Buttons Header */}
      <div className="border-b border-border p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Generate Reply</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(true)}
            data-testid="button-show-history"
          >
            <Clock className="w-4 h-4 mr-2" />
            History
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImprove(true)}
            data-testid="button-show-improve"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Improve Draft
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAnalytics(true)}
            data-testid="button-show-analytics"
          >
            <Brain className="w-4 h-4 mr-2" />
            Analytics
          </Button>
        </div>
      </div>
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
                      {message.qualityScore && (
                        <Badge variant={message.qualityScore >= 80 ? "default" : message.qualityScore >= 60 ? "secondary" : "destructive"}>
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
        {/* Model and Prompt Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Model Selection */}
          <div>
            <Label htmlFor="model-select" className="text-sm font-medium mb-2 flex items-center">
              <Brain className="w-4 h-4 mr-2" />
              AI Model
            </Label>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="w-full" data-testid="select-ai-model">
              <SelectValue placeholder="Select AI model..." />
            </SelectTrigger>
            <SelectContent>
              {modelsLoading ? (
                <SelectItem value="loading" disabled>Loading models...</SelectItem>
              ) : (
                modelsData && (
                  <>
                    {/* OpenAI Models */}
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">OpenAI</div>
                    {modelsData.openai.map((model) => (
                      <SelectItem key={model.key} value={model.key} data-testid={`model-${model.key}`}>
                        <div className="flex items-center justify-between w-full">
                          <div className="flex flex-col">
                            <span className="font-medium">{model.name}</span>
                            <span className="text-xs text-muted-foreground">{model.description}</span>
                          </div>
                          <Badge variant="outline" className="ml-2 text-xs">
                            ${model.inputCost.toFixed(2)}/1M
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                    
                    {/* Gemini Models */}
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground mt-2">Google Gemini</div>
                    {modelsData.gemini.map((model) => (
                      <SelectItem key={model.key} value={model.key} data-testid={`model-${model.key}`}>
                        <div className="flex items-center justify-between w-full">
                          <div className="flex flex-col">
                            <span className="font-medium">{model.name}</span>
                            <span className="text-xs text-muted-foreground">{model.description}</span>
                          </div>
                          <Badge variant="outline" className="ml-2 text-xs">
                            ${model.inputCost.toFixed(2)}/1M
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                    
                    {/* Groq Models */}
                    {modelsData.groq && modelsData.groq.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground mt-2">Groq</div>
                        {modelsData.groq.map((model) => (
                          <SelectItem key={model.key} value={model.key} data-testid={`model-${model.key}`}>
                            <div className="flex items-center justify-between w-full">
                              <div className="flex flex-col">
                                <span className="font-medium">{model.name}</span>
                                <span className="text-xs text-muted-foreground">{model.description}</span>
                              </div>
                              <Badge variant="outline" className="ml-2 text-xs">
                                ${model.inputCost.toFixed(2)}/1M
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </>
                )
              )}
            </SelectContent>
          </Select>
          </div>
          
          {/* Prompt Selection */}
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
        </div>
        
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
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <Badge variant={entry.wasUsed ? "default" : "secondary"}>
                            {entry.wasUsed ? "Used" : "Generated"}
                          </Badge>
                          {entry.qualityScore && (
                            <Badge variant="outline">Score: {entry.qualityScore}</Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium">Original Tweet:</p>
                        <p className="text-xs text-muted-foreground">{entry.originalTweet}</p>
                        <p className="text-sm font-medium mt-2">Generated Reply:</p>
                        <p className="text-sm">{entry.generatedReply}</p>
                        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                          <span>{entry.modelKey}</span>
                          <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
                        </div>
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
              Get AI-powered suggestions to improve your reply
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="draft-text">Your Draft Reply</Label>
              <Textarea
                id="draft-text"
                placeholder="Paste your draft reply here..."
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
            <Button
              onClick={() => improveMutation.mutate({ draft_reply: draftText })}
              disabled={!draftText.trim() || improveMutation.isPending}
              className="w-full"
            >
              {improveMutation.isPending ? "Analyzing..." : "Get Suggestions"}
            </Button>
            
            {improveMutation.data && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium mb-1">Quality Score</p>
                    <Badge variant={improveMutation.data.qualityScore >= 70 ? "default" : "destructive"}>
                      {improveMutation.data.qualityScore}/100
                    </Badge>
                  </div>
                  {improveMutation.data.issues.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-1">Issues Found:</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {improveMutation.data.issues.map((issue, i) => (
                          <li key={i}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {improveMutation.data.suggestions.length > 0 && (
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
              {/* Quality Metrics */}
              {metricsData && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3">Quality Metrics</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Average Score</p>
                        <p className="text-2xl font-bold">{metricsData.metrics.averageScore.toFixed(0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Replies</p>
                        <p className="text-2xl font-bold">{metricsData.metrics.totalReplies}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">High Quality</p>
                        <p className="text-2xl font-bold text-green-600">{metricsData.metrics.highQualityCount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Low Quality</p>
                        <p className="text-2xl font-bold text-red-600">{metricsData.metrics.lowQualityCount}</p>
                      </div>
                    </div>
                    {metricsData.recommendations.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-medium mb-2">Recommendations:</p>
                        <ul className="text-xs space-y-1">
                          {metricsData.recommendations.map((rec, i) => (
                            <li key={i}>• {rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              
              {/* Feedback Stats */}
              {analyticsData && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3">Feedback Summary</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Total Feedback</span>
                        <Badge>{analyticsData.totalFeedback}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Positive</span>
                        <Badge variant="default">{analyticsData.positiveCount}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Negative</span>
                        <Badge variant="destructive">{analyticsData.negativeCount}</Badge>
                      </div>
                    </div>
                    
                    {analyticsData.topModels.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-medium mb-2">Top Models:</p>
                        {analyticsData.topModels.map((model, i) => (
                          <div key={i} className="flex justify-between text-xs mb-1">
                            <span>{model.modelKey}</span>
                            <span className="text-muted-foreground">{model.count} uses</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
