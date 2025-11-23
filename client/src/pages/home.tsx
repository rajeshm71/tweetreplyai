import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Download, X, Chrome, Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { FloatingUpgradeButton } from "@/components/floating-upgrade-button";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useRef } from "react";
// Sprint 4: Lazy load heavy component
import { lazy, Suspense } from "react";
import type { GenerateReplyRef } from "@/components/generate-reply";
const GenerateReply = lazy(() => import("@/components/generate-reply").then(module => ({ default: module.GenerateReply })));
// Removed framer-motion imports - animations removed except for Upgrade to Pro button
import { formatDistanceToNow } from "date-fns";

type Usage = {
  today: number;
  thisWeek: number;
  thisMonth: number;
};

type UsageStatus = {
  planCode: string;
  used: number;
  limit: number;
  resetAt: string;
  status: 'active' | 'trial' | 'no_access';
  isWhitelisted?: boolean;
  upgradeRequired?: boolean;
  upgradeMessage?: string;
};

const CHROME_EXTENSION_URL = "https://chromewebstore.google.com/detail/tweetreply-ai-powered-twi/nhpilcnghmcdhcbhndmemiggfekmdgem";

export default function Home() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const generateReplyRef = useRef<GenerateReplyRef>(null);
  
  // Fix: Add localStorage error handling for SSR safety
  const [isBannerDismissed, setIsBannerDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('chrome-extension-banner-dismissed') === 'true';
      } catch (error) {
        console.warn('Failed to read localStorage:', error);
        return false;
      }
    }
    return false;
  });

  const { data: usage } = useQuery<Usage>({
    queryKey: ["/api/usage"],
    retry: false,
    enabled: !!user,
  });

  // Fetch usage status for the counter
  const { data: usageStatus } = useQuery<UsageStatus>({
    queryKey: ["/api/usage"],
    refetchInterval: 30000, // Refetch every 30 seconds
    refetchOnWindowFocus: true,
    enabled: !!user,
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [user, isLoading, toast]);

  // Fix: Add localStorage error handling
  const handleDismissBanner = () => {
    setIsBannerDismissed(true);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('chrome-extension-banner-dismissed', 'true');
      } catch (error) {
        console.warn('Failed to save to localStorage:', error);
        // Still dismiss the banner even if localStorage fails
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-6" />
          <p className="text-lg font-medium text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sprint 3: Skip to content link for accessibility */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      <AppHeader />

      {/* Chrome Extension Download Banner - Sprint 1: Modernized with better integration */}
      {!isBannerDismissed && (
        <div className="bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 text-white border-b border-blue-400/30 shadow-lg">
          <div className="container mx-auto px-4 py-3 sm:py-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 w-full sm:w-auto">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                  <Chrome className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-xs sm:text-sm md:text-base truncate">
                    Generate replies directly on X/Twitter
                  </p>
                  <p className="text-[10px] sm:text-xs md:text-sm text-white/90 opacity-90 truncate">
                    Install our Chrome extension for seamless integration
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 w-full sm:w-auto justify-end">
                <Button 
                  onClick={() => window.open(CHROME_EXTENSION_URL, '_blank')}
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700 font-semibold h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm flex-1 sm:flex-initial rounded-lg shadow-md"
                  data-testid="button-chrome-extension-banner"
                >
                  <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  Add to Chrome
                </Button>
                <Button 
                  variant="ghost"
                  size="icon"
                  onClick={handleDismissBanner}
                  className="text-white hover:bg-white/20 h-8 w-8 sm:h-9 sm:w-9 rounded-lg"
                  aria-label="Dismiss banner"
                >
                  <X className="w-3 h-3 sm:w-4 sm:h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Dashboard Content - Sprint 3: Added main landmark for accessibility */}
      <main id="main-content" className="container mx-auto px-4 py-8 max-w-7xl" role="main">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8">
          {/* Left Column: GenerateReply Component (70% on desktop) - Fix: Use ref to trigger sheets */}
          <div className="min-w-0" data-generate-reply>
            <Suspense fallback={
              <div className="min-h-[600px] flex items-center justify-center" role="status" aria-label="Loading reply generator">
                <div className="flex flex-col items-center gap-4">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">Loading reply generator...</p>
                </div>
              </div>
            }>
              <GenerateReply ref={generateReplyRef} />
            </Suspense>
          </div>

          {/* Right Column: Quick Stats + Quick Access (30% on desktop) */}
          <div className="space-y-6">
            {/* Usage Counter - Visually Stunning Design */}
            {usageStatus && (
              <div>
                <Card className="card-modern-enhanced border border-primary/20 bg-gradient-to-br from-primary/5 via-purple-600/5 to-primary/5 overflow-hidden relative">
                  {/* Background Gradient */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-purple-600/10 to-primary/10 opacity-50" />
                  
                  <CardContent className="p-6 relative z-10">
                    {/* Header with Icon */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary via-purple-600 to-primary flex items-center justify-center shadow-lg relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
                        <Zap className="w-5 h-5 text-white relative z-10" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                          Usage Limit
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {usageStatus.planCode === 'trial' ? 'Free Trial' : `${usageStatus.planCode.charAt(0).toUpperCase() + usageStatus.planCode.slice(1)} Plan`}
                        </p>
                      </div>
                    </div>

                    {/* Usage Numbers */}
                    <div className="mb-4">
                      <div className="flex items-baseline justify-between mb-2">
                        <span className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                          {usageStatus.used}
                        </span>
                        <span className="text-lg font-semibold text-muted-foreground">
                          / {usageStatus.limit}
                        </span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="relative w-full h-3 bg-secondary/50 rounded-full overflow-hidden backdrop-blur-sm">
                        <div
                          style={{ width: `${Math.min((usageStatus.used / usageStatus.limit) * 100, 100)}%` }}
                          className={`h-full rounded-full relative overflow-hidden ${
                            usageStatus.used >= usageStatus.limit 
                              ? 'bg-gradient-to-r from-destructive to-red-600' 
                              : usageStatus.used / usageStatus.limit >= 0.8 
                              ? 'bg-gradient-to-r from-yellow-500 to-orange-500' 
                              : 'bg-gradient-to-r from-primary via-purple-600 to-primary'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Reset Time */}
                    <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border/50">
                      <Clock className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="text-sm text-muted-foreground">
                        Resets {formatDistanceToNow(new Date(usageStatus.resetAt), { addSuffix: true })}
                      </span>
                    </div>

                    {/* Upgrade CTA (if needed) */}
                    {usageStatus.upgradeRequired && !usageStatus.isWhitelisted && (
                      <div className="mt-4">
                        <Button
                          onClick={() => setLocation('/pricing')}
                          className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 text-white font-semibold shadow-lg"
                        >
                          <TrendingUp className="w-4 h-4 mr-2" />
                          Upgrade to Pro
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Quick Stats - Sprint 2: Modernized with enhanced styling */}
            {usage && (
              <div>
                <Card className="card-modern-enhanced border border-primary/20 bg-gradient-to-br from-card to-card/50">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-md">
                        <TrendingUp className="w-4 h-4 text-white" />
                      </div>
                      <h3 className="font-semibold text-lg">Quick Stats</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-4 bg-gradient-to-br from-muted/50 to-muted/30 rounded-xl border border-border/50">
                        <div>
                          <p className="text-sm text-muted-foreground font-medium">Today</p>
                          <p className="text-2xl font-bold text-primary mt-1">{usage.today}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-gradient-to-br from-muted/50 to-muted/30 rounded-xl border border-border/50">
                        <div>
                          <p className="text-sm text-muted-foreground font-medium">This Week</p>
                          <p className="text-2xl font-bold text-primary mt-1">{usage.thisWeek}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-gradient-to-br from-muted/50 to-muted/30 rounded-xl border border-border/50">
                        <div>
                          <p className="text-sm text-muted-foreground font-medium">This Month</p>
                          <p className="text-2xl font-bold text-primary mt-1">{usage.thisMonth}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>
      
      {/* Floating Upgrade Button */}
      <FloatingUpgradeButton />
    </div>
  );
}
