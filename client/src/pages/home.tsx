import { useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, ExternalLink, Settings, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UsageBadge } from "@/components/usage-badge";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";

export default function Home() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading && user) {
      // Initialize trial for new users
      apiRequest('POST', '/api/auth/initialize-trial')
        .catch((error) => {
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
          // Silently fail - trial might already be initialized
        });
    }
  }, [user, isLoading, toast]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
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
  }, [user, isLoading, toast]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground text-lg">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                <MessageCircle className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold tracking-tight">TweetReply</span>
            </div>
            <div className="flex items-center space-x-4">
              <UsageBadge />
              <Button 
                variant="ghost" 
                onClick={() => window.location.href = '/api/logout'}
                data-testid="button-logout"
                className="smooth-transition hover:bg-muted/50"
              >
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Welcome Section */}
      <div className="container section-padding">
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-bold mb-6 gradient-text">
            Welcome back{(user as any)?.firstName ? `, ${(user as any).firstName}` : ''}!
          </h1>
          <p className="text-xl text-muted-foreground content-max leading-relaxed">
            Ready to generate some authentic replies? Choose how you'd like to get started.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid lg:grid-cols-2 gap-8 mb-16 max-w-4xl mx-auto">
          <Card className="group border-2 smooth-transition hover:shadow-xl hover:border-primary/20 hover:scale-[1.02]">
            <CardContent className="p-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/25 group-hover:shadow-xl group-hover:shadow-primary/30 smooth-transition">
                  <MessageCircle className="w-8 h-8 text-primary-foreground" />
                </div>
                <h3 className="text-2xl font-semibold mb-3">Web App</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Paste any tweet text or URL and get instant reply suggestions
                </p>
                <Button asChild className="w-full h-12 text-lg shadow-lg">
                  <Link href="/app" data-testid="link-web-app">
                    Open Web App
                    <ExternalLink className="ml-2 w-5 h-5" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="group border-2 smooth-transition hover:shadow-xl hover:border-muted-foreground/20 hover:scale-[1.02]">
            <CardContent className="p-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-muted-foreground to-muted-foreground/80 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-muted-foreground/25">
                  <svg className="w-8 h-8 text-background" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold mb-3">Chrome Extension</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Get suggestions directly in X/Twitter with our Chrome extension
                </p>
                <Button variant="secondary" className="w-full h-12 text-lg" disabled>
                  Coming Soon
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Current Plan */}
        <Card className="mb-16 border-2 bg-gradient-to-br from-background to-muted/30">
          <CardContent className="p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <TrendingUp className="w-6 h-6 text-primary" />
                  <h3 className="text-xl font-semibold">Current Plan</h3>
                </div>
                <UsageBadge showDetails />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" asChild className="smooth-transition hover:bg-muted/50">
                  <Link href="/pricing" data-testid="link-upgrade">
                    <Settings className="mr-2 w-4 h-4" />
                    Manage Plan
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Tips */}
        <Card className="border-2 bg-gradient-to-br from-primary/5 to-background">
          <CardContent className="p-8">
            <h3 className="text-xl font-semibold mb-6">Pro Tips for Better Engagement</h3>
            <div className="grid sm:grid-cols-3 gap-6">
              <div className="text-center group">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 smooth-transition">
                  <div className="w-3 h-3 bg-primary rounded-full" />
                </div>
                <div className="space-y-1">
                  <div className="font-semibold">Keep it authentic</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    Our AI generates human-like replies under 25 words
                  </div>
                </div>
              </div>
              <div className="text-center group">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 smooth-transition">
                  <div className="w-3 h-3 bg-primary rounded-full" />
                </div>
                <div className="space-y-1">
                  <div className="font-semibold">No editing needed</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    Most users post our suggestions without changes
                  </div>
                </div>
              </div>
              <div className="text-center group">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 smooth-transition">
                  <div className="w-3 h-3 bg-primary rounded-full" />
                </div>
                <div className="space-y-1">
                  <div className="font-semibold">Stay on brand</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    Replies match the tone and context of the original tweet
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
