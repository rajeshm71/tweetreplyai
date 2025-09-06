import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface UsageStatus {
  planCode: string;
  used: number;
  limit: number;
  resetAt: string;
  status: 'active' | 'trial' | 'no_access';
}

interface UsageBadgeProps {
  showDetails?: boolean;
}

export function UsageBadge({ showDetails = false }: UsageBadgeProps) {
  const { data: usage, isLoading, error } = useQuery<UsageStatus>({
    queryKey: ["/api/usage"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-2 h-2 bg-muted rounded-full animate-pulse" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (error || !usage) {
    return (
      <div className="flex items-center space-x-2">
        <AlertCircle className="w-4 h-4 text-destructive" />
        <span className="text-sm text-destructive">Error loading usage</span>
      </div>
    );
  }

  const isQuotaExceeded = usage.used >= usage.limit;
  const isTrialUser = usage.planCode === 'trial';
  const resetDistance = formatDistanceToNow(new Date(usage.resetAt), { addSuffix: true });

  if (showDetails) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {isTrialUser ? 'Free Trial' : `${usage.planCode.charAt(0).toUpperCase() + usage.planCode.slice(1)} Plan`}
              </span>
              <Badge variant={isQuotaExceeded ? "destructive" : "default"}>
                {usage.used} / {usage.limit}
              </Badge>
            </div>
            
            <div className="w-full bg-secondary rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all ${
                  isQuotaExceeded ? 'bg-destructive' : 'bg-primary'
                }`}
                style={{ width: `${Math.min((usage.used / usage.limit) * 100, 100)}%` }}
              />
            </div>
            
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>Resets {resetDistance}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex items-center space-x-2 text-sm" data-testid="usage-badge">
      <div className={`w-2 h-2 rounded-full ${
        isQuotaExceeded ? 'bg-destructive' : 'bg-primary'
      }`} />
      <span className="text-muted-foreground">
        {usage.used} / {usage.limit} • resets {resetDistance}
      </span>
    </div>
  );
}
