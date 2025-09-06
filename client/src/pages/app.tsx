import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UsageBadge } from "@/components/usage-badge";
import { GenerateReply } from "@/components/generate-reply";
import { isUnauthorizedError } from "@/lib/authUtils";

export default function AppPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
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
  }, [isAuthenticated, isLoading, toast]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* App Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 py-4 sm:px-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold">TweetReply</span>
            </div>
            <div className="flex items-center space-x-4">
              <UsageBadge />
              <Button 
                variant="ghost" 
                size="sm"
                onClick={async () => {
                  try {
                    const response = await fetch('/api/billing/portal', {
                      method: 'POST',
                      credentials: 'include',
                    });
                    
                    if (response.status === 401) {
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
                    
                    if (!response.ok) {
                      throw new Error('Failed to create portal session');
                    }
                    
                    const data = await response.json();
                    window.open(data.portal_url, '_blank');
                  } catch (error) {
                    toast({
                      title: "Error",
                      description: "Failed to open billing portal",
                      variant: "destructive",
                    });
                  }
                }}
                data-testid="button-manage-billing"
              >
                Manage billing
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main App Interface */}
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-2">Generate Reply</h1>
          <p className="text-muted-foreground">
            Paste a tweet text or URL to generate an authentic reply
          </p>
        </div>

        <GenerateReply />
      </div>
    </div>
  );
}
