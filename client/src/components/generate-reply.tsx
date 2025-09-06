import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Sparkles, Copy, ThumbsUp, ThumbsDown, Clock, Zap } from "lucide-react";
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

export function GenerateReply() {
  const [tweetText, setTweetText] = useState("");
  const [generatedReply, setGeneratedReply] = useState<GenerateReplyResponse | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const generateMutation = useMutation({
    mutationFn: async (data: { tweet_text: string }) => {
      const response = await apiRequest("POST", "/api/generate-reply", data);
      return response.json();
    },
    onSuccess: (data: GenerateReplyResponse) => {
      setGeneratedReply(data);
      setFeedbackGiven(false);
      // Invalidate usage query to update the badge
      queryClient.invalidateQueries({ queryKey: ["/api/usage"] });
      toast({
        title: "Reply generated!",
        description: "Your AI-generated reply is ready to use.",
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

    generateMutation.mutate({ tweet_text: tweetText.trim() });
  };

  const handleCopy = async () => {
    if (!generatedReply) return;

    try {
      await navigator.clipboard.writeText(generatedReply.reply);
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

  const wordCount = generatedReply ? generatedReply.reply.split(/\s+/).length : 0;

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      {/* Input Section */}
      <div className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="tweet-input" className="text-sm font-medium">
              Tweet content
            </Label>
            <Textarea
              id="tweet-input"
              placeholder="Paste tweet text or URL here..."
              rows={4}
              value={tweetText}
              onChange={(e) => setTweetText(e.target.value)}
              className="mt-2 resize-none"
              data-testid="input-tweet-text"
            />
          </div>
          
          <Button 
            onClick={handleGenerate}
            disabled={generateMutation.isPending || !tweetText.trim()}
            className="w-full"
            data-testid="button-generate-reply"
          >
            {generateMutation.isPending ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate reply
              </>
            )}
          </Button>
        </div>

        {/* Usage Information */}
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Usage Information</span>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Replies are generated using advanced AI models</div>
              <div>Authentic, human-like responses under 25 words</div>
              <div>Usage counts against your plan quota</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Output Section */}
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">Suggested Reply</h2>
          <p className="text-muted-foreground">Your AI-generated reply will appear here</p>
        </div>

        {/* Reply Output */}
        <Card className="min-h-[120px] bg-muted/20" data-testid="reply-output">
          <CardContent className="p-4">
            {!generatedReply ? (
              <div className="text-muted-foreground italic text-center py-8">
                Click "Generate reply" to see your suggested response
              </div>
            ) : (
              <div>
                <div className="mb-4">
                  <p className="text-foreground" data-testid="text-generated-reply">
                    {generatedReply.reply}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                    <span data-testid="text-word-count">{wordCount} words</span>
                    <span data-testid="text-model-used">{generatedReply.meta.modelKey}</span>
                    <span data-testid="text-generation-time">{(generatedReply.meta.latencyMs / 1000).toFixed(1)}s</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleCopy}
                    data-testid="button-copy-reply"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Feedback Section */}
        {generatedReply && !feedbackGiven && (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium mb-3">How was this reply?</h3>
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFeedback('up')}
                  disabled={feedbackMutation.isPending}
                  data-testid="button-feedback-up"
                >
                  <ThumbsUp className="w-4 h-4 mr-2 text-green-600" />
                  Useful
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFeedback('down')}
                  disabled={feedbackMutation.isPending}
                  data-testid="button-feedback-down"
                >
                  <ThumbsDown className="w-4 h-4 mr-2 text-red-600" />
                  Not useful
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error States */}
        {generateMutation.error && generateMutation.error.message.includes("402") && (
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
        )}
      </div>
    </div>
  );
}
