import { Crown } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { POLLING } from "@/config/constants";

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
    'improve'?: { replies: number; credits: number };
  };
}

export function FloatingUpgradeButton() {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  
  const { data: usage } = useQuery<UsageStatus>({
    queryKey: ["/api/usage"],
    refetchInterval: POLLING.USAGE_REFETCH_INTERVAL_MS,
    enabled: isAuthenticated,
  });

  // Don't show if user is not authenticated, whitelisted, or already on pricing page
  if (!isAuthenticated || !user || usage?.isWhitelisted || window.location.pathname === '/pricing') {
    return null;
  }

  const handleUpgrade = () => {
    setLocation('/pricing');
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Button
        onClick={handleUpgrade}
        size="lg"
        className="rounded-full shadow-2xl bg-primary hover:bg-primary/90 text-white font-semibold px-6 py-6 h-auto transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Upgrade to Pro"
      >
        <Crown className="w-5 h-5 mr-2" />
        <span className="hidden sm:inline">Upgrade to Pro</span>
        <span className="sm:hidden">Upgrade</span>
      </Button>
    </div>
  );
}

