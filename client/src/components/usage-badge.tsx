import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Warning, Crown, CaretDown, CaretUp } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { POLLING } from "@/config/constants";

interface UsageStatus {
  planCode: string;
  used: number;
  limit: number;
  resetAt: string;
  status: 'active' | 'trial' | 'no_access';
  /** Canceled sub still in paid period — show "Ends" instead of "Resets". */
  subscriptionCanceled?: boolean;
  isWhitelisted?: boolean;
  upgradeRequired?: boolean;
  upgradeMessage?: string;
  modeBreakdown?: {
    'single-sentence'?: { credits: number };
    'enhanced'?: { credits: number };
    'improve'?: { credits: number };
  };
}

interface UsageBadgeProps {
  showDetails?: boolean;
}

export function UsageBadge({ showDetails = false }: UsageBadgeProps) {
  const [, setLocation] = useLocation();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const { data: usage, isLoading, error } = useQuery<UsageStatus>({
    queryKey: ["/api/usage"],
    refetchInterval: POLLING.USAGE_REFETCH_INTERVAL_MS,
  });

  useEffect(() => {
    if (!import.meta.env.DEV || !usage) return;
    console.debug("[UsageDiag] badge /api/usage payload", {
      subscriptionCanceled: usage.subscriptionCanceled,
      planCode: usage.planCode,
      resetAt: usage.resetAt,
    });
  }, [usage]);

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-2 h-2 bg-muted rounded-full" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (error || !usage) {
    return (
      <div className="flex items-center space-x-2">
        <Warning className="w-4 h-4 text-destructive" />
        <span className="text-sm text-destructive">Error loading usage</span>
      </div>
    );
  }

  const isQuotaExceeded = usage.used >= usage.limit;
  const usageQuotaExhausted = isQuotaExceeded || !!usage.upgradeRequired;
  const isTrialUser = usage.planCode === 'trial';
  const resetDistance = formatDistanceToNow(new Date(usage.resetAt), { addSuffix: true });
  const timeVerb = usage.subscriptionCanceled ? 'Ends' : 'Resets';
  const resetLine = usageQuotaExhausted
    ? isTrialUser
      ? "You've used all your trial credits: upgrade to continue."
      : `You've used all your credits. ${timeVerb} ${resetDistance}.`
    : `${timeVerb} ${resetDistance}`;
  const showUpgrade = usage.upgradeRequired && !usage.isWhitelisted;

  if (showDetails) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {isTrialUser ? 'Free Trial' : `${usage.planCode.charAt(0).toUpperCase() + usage.planCode.slice(1)} Plan`}
              </span>
              <Badge variant={usageQuotaExhausted ? "destructive" : "default"}>
                {usage.used} / {usage.limit}
              </Badge>
            </div>
            
            <div className="w-full bg-secondary rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all ${
                  usageQuotaExhausted ? 'bg-destructive' : 'bg-primary'
                }`}
                style={{ width: `${Math.min((usage.used / usage.limit) * 100, 100)}%` }}
              />
            </div>
            
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{resetLine}</span>
            </div>

            {/* Credit Breakdown Section */}
            {usage.modeBreakdown && (
              <div className="border-t pt-3">
                <button
                  onClick={() => setShowBreakdown(!showBreakdown)}
                  className="flex items-center justify-between w-full text-sm font-medium text-foreground hover:text-primary transition-colors"
                >
                  <span>Credit Breakdown</span>
                  {showBreakdown ? (
                    <CaretUp className="w-4 h-4" />
                  ) : (
                    <CaretDown className="w-4 h-4" />
                  )}
                </button>
                
                {showBreakdown && (
                  <div className="mt-3 space-y-2">
                    {usage.modeBreakdown['single-sentence'] && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Concise:</span>
                        <span className="font-medium">
                          {usage.modeBreakdown['single-sentence'].credits} credits
                        </span>
                      </div>
                    )}
                    {usage.modeBreakdown['enhanced'] && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Enhanced:</span>
                        <span className="font-medium">
                          {usage.modeBreakdown['enhanced'].credits} credits
                        </span>
                      </div>
                    )}
                    {usage.modeBreakdown['improve'] && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Improve:</span>
                        <span className="font-medium">
                          {usage.modeBreakdown['improve'].credits} credits
                        </span>
                      </div>
                    )}
                    <div className="pt-2 border-t text-xs font-semibold text-foreground">
                      Total: {usage.used} credits
                    </div>
                  </div>
                )}
              </div>
            )}

            {showUpgrade && (
              <Button
                onClick={() => setLocation('/app/pricing')}
                size="sm"
                className="w-full bg-primary hover:bg-primary/90"
              >
                <Crown className="w-3 h-3 mr-2" />
                Upgrade to Pro
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex items-center space-x-2 text-sm" data-testid="usage-badge">
      <div className={`w-2 h-2 rounded-full ${
        usageQuotaExhausted ? 'bg-destructive' : 'bg-primary'
      }`} />
      <span className="text-muted-foreground">
        {usage.used} / {usage.limit} •{' '}
        {usageQuotaExhausted && isTrialUser
          ? 'upgrade to continue'
          : `${usage.subscriptionCanceled ? 'ends' : 'resets'} ${resetDistance}`}
      </span>
    </div>
  );
}
