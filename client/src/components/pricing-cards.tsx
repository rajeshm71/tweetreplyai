import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconCheck, IconSparkles, IconRocket, IconCrown } from "@tabler/icons-react";
import { apiRequest } from "@/lib/queryClient";
import { PRICING_CONFIG, creditsPerCycleLabel, formatCreditsLimit } from "@/config/pricing";
import { isUnauthorizedError } from "@/lib/authUtils";
import { ManageSubscriptionModal } from "@/components/manage-subscription-modal";

interface SubscriptionStatus {
  hasSubscription: boolean;
  planCode: string | null;
  planName?: string;
  status: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

const ALLOWED_AUTO_PLANS = ["weekly", "monthly"] as const;

/**
 * Pricing cards for trial, weekly, and monthly plans.
 * @param usagePlanCode - Current usage plan from parent (e.g. /api/subscription usageStatus.planCode). Used when authenticated to show "Current plan" vs "Trial already used" on the trial card. Omit on landing.
 */
export function PricingCards({
  initialPlanCode,
  autoCheckout = false,
  usagePlanCode,
}: {
  initialPlanCode?: (typeof ALLOWED_AUTO_PLANS)[number];
  autoCheckout?: boolean;
  usagePlanCode?: string | null;
} = {}) {
  const autoCheckoutTriggeredRef = useRef(false);
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionStatus | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      setSubscriptionLoading(true);
      apiRequest("GET", "/api/subscription/status")
        .then(res => res.json())
        .then(data => {
          setCurrentSubscription(data);
          setSubscriptionLoading(false);
        })
        .catch(err => {
          console.error("Failed to fetch subscription status:", err);
          toast({
            title: "Error",
            description: "Failed to load subscription status. Please refresh the page.",
            variant: "destructive",
          });
          setSubscriptionLoading(false);
        });
    } else {
      setCurrentSubscription(null);
      setSubscriptionLoading(false);
    }
  }, [isAuthenticated, toast]);

  const getButtonState = (planCode: string) => {
    // Show loading state while fetching subscription status
    if (subscriptionLoading) {
      return { text: 'Loading...', action: () => {} };
    }
    
    if (!currentSubscription?.hasSubscription) {
      return { text: 'Subscribe', action: () => handleSubscribe(planCode) };
    }
    
    const plan = (currentSubscription.planCode || '').toLowerCase();
    const status = (currentSubscription.status || '').toLowerCase();
    // Only show "Manage Subscription" for active subscriptions (normalize casing)
    if (plan === planCode && status === 'active') {
      return { text: 'Manage Subscription', action: () => setShowManageModal(true) };
    }
    
    const planOrder = { trial: 0, weekly: 1, monthly: 2 };
    const currentOrder = planOrder[plan as keyof typeof planOrder] || 0;
    const targetOrder = planOrder[planCode as keyof typeof planOrder] || 0;
    
    if (targetOrder > currentOrder) {
      return { text: 'Upgrade', action: () => handleSubscribe(planCode) };
    }
    
    return { text: 'Subscribe', action: () => handleSubscribe(planCode) };
  };

  // Pricing tier color configurations
  const pricingTiers = {
    trial: {
      icon: IconSparkles,
      iconGradient: "from-blue-500 to-cyan-500",
      solidBg: "bg-blue-500",
      emoji: "🎁",
      cardGradient: "from-blue-500/5 to-cyan-500/5",
      borderColor: "border-blue-500/20",
      hoverBorder: "hover:border-blue-500/40",
      textColor: "text-blue-600",
      priceColor: "text-blue-600",
      buttonGradient: "from-blue-500 to-cyan-500",
      badgeColor: "bg-blue-500/10 text-blue-600 border-blue-500/20"
    },
    weekly: {
      icon: IconRocket,
      iconGradient: "from-green-500 to-emerald-500",
      solidBg: "bg-green-500",
      emoji: "🚀",
      cardGradient: "from-green-500/5 to-emerald-500/5",
      borderColor: "border-green-500/20",
      hoverBorder: "hover:border-green-500/40",
      textColor: "text-green-600",
      priceColor: "text-green-600",
      buttonGradient: "from-green-500 to-emerald-500",
      badgeColor: "bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-700 border-green-500/30"
    },
    monthly: {
      icon: IconCrown,
      iconGradient: "from-purple-500 to-pink-500",
      solidBg: "bg-purple-500",
      emoji: "👑",
      cardGradient: "from-purple-500/5 to-pink-500/5",
      borderColor: "border-purple-500/20",
      hoverBorder: "hover:border-purple-500/40",
      textColor: "text-purple-600",
      priceColor: "text-purple-600",
      buttonGradient: "from-purple-500 to-pink-500",
      badgeColor: "bg-purple-500/10 text-purple-600 border-purple-500/20"
    }
  };

  const checkoutMutation = useMutation({
    mutationFn: async (planCode: string) => {
      setLoadingPlan(planCode);
      const response = await apiRequest("POST", "/api/checkout", { plan_code: planCode });
      return response.json();
    },
    onSuccess: (data) => {
      window.location.href = data.checkout_url;
    },
    onError: (error: Error) => {
      setLoadingPlan(null);
      
      if (isUnauthorizedError(error)) {
        toast({
          title: "Please sign in",
          description: "You need to sign in to subscribe to a plan.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }

      toast({
        title: "Error",
        description: "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubscribe = (planCode: string) => {
    const path = typeof window !== "undefined" ? window.location.pathname : "";

    // Landing page + not authenticated: go through login, then back to app pricing with plan + autoCheckout
    if (!isAuthenticated && path === "/") {
      const planPath = `/app/pricing?plan=${planCode}&autoCheckout=1`;
      window.location.href = "/login?returnUrl=" + encodeURIComponent(planPath);
      return;
    }

    // Other contexts: if still not authenticated, send to bare login as a fallback
    if (!isAuthenticated) {
      window.location.href = "/login";
      return;
    }
    
    checkoutMutation.mutate(planCode);
  };

  // Auto-open checkout when landing Subscribe sends plan + autoCheckout=1 (runs once after subscription loaded)
  useEffect(() => {
    if (!autoCheckout || !initialPlanCode || autoCheckoutTriggeredRef.current) return;
    if (subscriptionLoading) return;
    if (!ALLOWED_AUTO_PLANS.includes(initialPlanCode)) return;
    const plan = (currentSubscription?.planCode || '').toLowerCase();
    const status = (currentSubscription?.status || '').toLowerCase();
    if (plan === initialPlanCode && status === 'active') return;
    autoCheckoutTriggeredRef.current = true;
    handleSubscribe(initialPlanCode);
  }, [autoCheckout, initialPlanCode, subscriptionLoading, currentSubscription?.planCode, currentSubscription?.status]);

  // Review fix: compute once per card to avoid duplicate getButtonState calls and consistent label/styling
  const weeklyState = getButtonState('weekly');
  const monthlyState = getButtonState('monthly');

  // Trial button label when authenticated: show neutral state while usagePlanCode is loading to avoid flashing "Trial already used"
  const trialButtonLabel = !isAuthenticated
    ? 'Start Replying'
    : usagePlanCode === undefined
      ? '-'
      : usagePlanCode === 'trial'
        ? 'Current plan'
        : 'Trial already used';

  return (
    <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
      {/* Free Trial */}
      <Card className={`relative overflow-hidden border-2 ${pricingTiers.trial.borderColor} ${pricingTiers.trial.hoverBorder} group ${isAuthenticated ? 'opacity-75' : ''}`}>
        {/* Gradient background - static opacity, no hover animation */}
        <div className={`absolute inset-0 bg-gradient-to-br ${pricingTiers.trial.cardGradient} opacity-50`} />
        {isAuthenticated && usagePlanCode === 'trial' && (
          <div className="absolute top-4 right-4 z-50">
            <Badge className="bg-blue-500 text-white">Current plan</Badge>
          </div>
        )}
        
        <CardContent className="p-8 relative z-10">
          <div className="text-center mb-6">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className={`w-12 h-12 rounded-xl ${pricingTiers.trial.solidBg} flex items-center justify-center`}>
                {(() => {
                  const IconComponent = pricingTiers.trial.icon;
                  return <IconComponent className="w-6 h-6 text-white" />;
                })()}
              </div>
            </div>
            
            {/* Tier name with emoji */}
            <h3 className={`text-xl font-semibold mb-2 ${pricingTiers.trial.textColor} flex items-center justify-center gap-2`}>
              <span>Free Trial</span>
              <span className="text-base opacity-80" aria-hidden="true">{pricingTiers.trial.emoji}</span>
            </h3>
            
            {/* Price with solid color */}
            <div className={`text-3xl font-bold mb-2 ${pricingTiers.trial.priceColor}`}>
              {formatCreditsLimit(PRICING_CONFIG.trial.creditsLimit)}
            </div>
            <div className="text-muted-foreground">{creditsPerCycleLabel(PRICING_CONFIG.trial)}</div>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="flex items-center space-x-3">
              <IconCheck className={`w-4 h-4 ${pricingTiers.trial.textColor} flex-shrink-0`} />
              <span className="text-sm">Smart Tone Detection</span>
            </div>
            <div className="flex items-center space-x-3">
              <IconCheck className={`w-4 h-4 ${pricingTiers.trial.textColor} flex-shrink-0`} />
              <span className="text-sm">Context-Aware Replies</span>
            </div>
            <div className="flex items-center space-x-3">
              <IconCheck className={`w-4 h-4 ${pricingTiers.trial.textColor} flex-shrink-0`} />
              <span className="text-sm">Auto Like on Reply</span>
            </div>
            <div className="flex items-center space-x-3">
              <IconCheck className={`w-4 h-4 ${pricingTiers.trial.textColor} flex-shrink-0`} />
              <span className="text-sm">Quality Scoring</span>
            </div>
            <div className="flex items-center space-x-3">
              <IconCheck className={`w-4 h-4 ${pricingTiers.trial.textColor} flex-shrink-0`} />
              <span className="text-sm">History Tracking</span>
            </div>
            <div className="flex items-center space-x-3 pt-2">
              <span className="text-sm text-muted-foreground font-medium">+7 more features</span>
            </div>
          </div>
          
          {isAuthenticated ? (
            <Button
              className="w-full font-medium bg-muted text-muted-foreground border border-input cursor-not-allowed"
              disabled
              data-testid="button-trial-signup"
            >
              {trialButtonLabel}
            </Button>
          ) : (
            <Button 
              className={`w-full font-medium bg-gradient-to-r ${pricingTiers.trial.buttonGradient} text-white border-0 shadow-lg`}
              onClick={() => window.location.href = '/login'}
              data-testid="button-trial-signup"
            >
              Start Replying
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Weekly Plan */}
      <Card className={`relative overflow-visible border-2 ${pricingTiers.weekly.borderColor} ${pricingTiers.weekly.hoverBorder} group shadow-[0_0_30px_rgba(34,197,94,0.2)]`}>
        {/* Enhanced Most Popular badge - Redesigned for better visibility */}
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-50">
          <Badge className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 text-white border-2 border-amber-600 shadow-2xl font-bold px-4 py-1.5 text-sm whitespace-nowrap">
            ⭐ Most Popular
          </Badge>
        </div>
        {/* Current Plan badge - only show for active subscriptions (normalized) */}
        {(currentSubscription?.planCode || '').toLowerCase() === 'weekly' && (currentSubscription?.status || '').toLowerCase() === 'active' && (
          <div className="absolute top-4 right-4 z-50">
            <Badge className="bg-green-500 text-white">Current Plan</Badge>
          </div>
        )}
        
        {/* Gradient background with glow */}
        <div className={`absolute inset-0 bg-gradient-to-br ${pricingTiers.weekly.cardGradient} opacity-50`} />
        <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 to-emerald-500/10 opacity-30 blur-xl" />
        
        <CardContent className="p-8 relative z-10 pt-10">
          <div className="text-center mb-6">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className={`w-12 h-12 rounded-xl ${pricingTiers.weekly.solidBg} flex items-center justify-center`}>
                {(() => {
                  const IconComponent = pricingTiers.weekly.icon;
                  return <IconComponent className="w-6 h-6 text-white" />;
                })()}
              </div>
            </div>
            
            {/* Tier name with emoji */}
            <h3 className={`text-xl font-semibold mb-2 ${pricingTiers.weekly.textColor} flex items-center justify-center gap-2`}>
              <span>Weekly</span>
              <span className="text-base opacity-80" aria-hidden="true">{pricingTiers.weekly.emoji}</span>
            </h3>
            
            {/* Price with solid color */}
            <div className="mb-2">
              {PRICING_CONFIG.weekly.originalPrice && PRICING_CONFIG.weekly.offer?.active ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xl text-muted-foreground line-through">
                      ${PRICING_CONFIG.weekly.originalPrice.toFixed(2)}
                    </span>
                    <div className={`text-3xl font-bold ${pricingTiers.weekly.priceColor}`}>
                      ${PRICING_CONFIG.weekly.price.toFixed(2)}
                    </div>
                  </div>
                  <Badge variant="secondary" className={`${pricingTiers.weekly.badgeColor} whitespace-nowrap text-xs font-semibold px-2 py-0.5`}>
                    50% off
                  </Badge>
                </div>
              ) : (
                <div className={`text-3xl font-bold ${pricingTiers.weekly.priceColor}`}>
                  ${PRICING_CONFIG.weekly.price.toFixed(2)}
                </div>
              )}
            </div>
            <div className="text-muted-foreground">{creditsPerCycleLabel(PRICING_CONFIG.weekly)}</div>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="flex items-center space-x-3">
              <IconCheck className={`w-4 h-4 ${pricingTiers.weekly.textColor} flex-shrink-0`} />
              <span className="text-sm">Smart Tone Detection</span>
            </div>
            <div className="flex items-center space-x-3">
              <IconCheck className={`w-4 h-4 ${pricingTiers.weekly.textColor} flex-shrink-0`} />
              <span className="text-sm">Context-Aware Replies</span>
            </div>
            <div className="flex items-center space-x-3">
              <IconCheck className={`w-4 h-4 ${pricingTiers.weekly.textColor} flex-shrink-0`} />
              <span className="text-sm">Auto Like on Reply</span>
            </div>
            <div className="flex items-center space-x-3">
              <IconCheck className={`w-4 h-4 ${pricingTiers.weekly.textColor} flex-shrink-0`} />
              <span className="text-sm">Quality Scoring</span>
            </div>
            <div className="flex items-center space-x-3">
              <IconCheck className={`w-4 h-4 ${pricingTiers.weekly.textColor} flex-shrink-0`} />
              <span className="text-sm">History Tracking</span>
            </div>
            <div className="flex items-center space-x-3 pt-2">
              <span className="text-sm text-muted-foreground font-medium">+7 more features</span>
            </div>
          </div>
          
          <Button 
            className={`w-full font-medium ${(currentSubscription?.planCode || '').toLowerCase() === 'weekly' ? 'bg-transparent border-2 border-green-500 text-green-600 hover:bg-green-50' : `bg-gradient-to-r ${pricingTiers.weekly.buttonGradient} text-white border-0`} shadow-lg`}
            onClick={weeklyState.action}
            disabled={loadingPlan === 'weekly'}
            data-testid="button-subscribe-weekly"
          >
            {loadingPlan === 'weekly' ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                Loading...
              </>
            ) : (
              weeklyState.text
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Monthly Plan */}
      <Card className={`relative overflow-hidden border-2 ${pricingTiers.monthly.borderColor} ${pricingTiers.monthly.hoverBorder} group`}>
        {/* Current Plan badge - only show for active subscriptions (normalized) */}
        {(currentSubscription?.planCode || '').toLowerCase() === 'monthly' && (currentSubscription?.status || '').toLowerCase() === 'active' && (
          <div className="absolute top-4 right-4 z-50">
            <Badge className="bg-green-500 text-white">Current Plan</Badge>
          </div>
        )}
        {/* Gradient background */}
        <div className={`absolute inset-0 bg-gradient-to-br ${pricingTiers.monthly.cardGradient} opacity-50`} />
        
        <CardContent className="p-8 relative z-10">
          <div className="text-center mb-6">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className={`w-12 h-12 rounded-xl ${pricingTiers.monthly.solidBg} flex items-center justify-center`}>
                {(() => {
                  const IconComponent = pricingTiers.monthly.icon;
                  return <IconComponent className="w-6 h-6 text-white" />;
                })()}
              </div>
            </div>
            
            {/* Tier name with emoji */}
            <h3 className={`text-xl font-semibold mb-2 ${pricingTiers.monthly.textColor} flex items-center justify-center gap-2`}>
              <span>Monthly</span>
              <span className="text-base opacity-80" aria-hidden="true">{pricingTiers.monthly.emoji}</span>
            </h3>
            
            {/* Price with solid color */}
            <div className="mb-2">
              {PRICING_CONFIG.monthly.originalPrice && PRICING_CONFIG.monthly.offer?.active ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xl text-muted-foreground line-through">
                      ${PRICING_CONFIG.monthly.originalPrice.toFixed(2)}
                    </span>
                    <div className={`text-3xl font-bold ${pricingTiers.monthly.priceColor}`}>
                      ${PRICING_CONFIG.monthly.price.toFixed(2)}
                    </div>
                  </div>
                  <Badge variant="secondary" className={`${pricingTiers.monthly.badgeColor} whitespace-nowrap text-xs font-semibold px-2 py-0.5`}>
                    50% off
                  </Badge>
                </div>
              ) : (
                <div className={`text-3xl font-bold ${pricingTiers.monthly.priceColor}`}>
                  ${PRICING_CONFIG.monthly.price.toFixed(2)}
                </div>
              )}
            </div>
            <div className="text-muted-foreground">{creditsPerCycleLabel(PRICING_CONFIG.monthly)}</div>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="flex items-center space-x-3">
              <IconCheck className={`w-4 h-4 ${pricingTiers.monthly.textColor} flex-shrink-0`} />
              <span className="text-sm">Smart Tone Detection</span>
            </div>
            <div className="flex items-center space-x-3">
              <IconCheck className={`w-4 h-4 ${pricingTiers.monthly.textColor} flex-shrink-0`} />
              <span className="text-sm">Context-Aware Replies</span>
            </div>
            <div className="flex items-center space-x-3">
              <IconCheck className={`w-4 h-4 ${pricingTiers.monthly.textColor} flex-shrink-0`} />
              <span className="text-sm">Auto Like on Reply</span>
            </div>
            <div className="flex items-center space-x-3">
              <IconCheck className={`w-4 h-4 ${pricingTiers.monthly.textColor} flex-shrink-0`} />
              <span className="text-sm">Quality Scoring</span>
            </div>
            <div className="flex items-center space-x-3">
              <IconCheck className={`w-4 h-4 ${pricingTiers.monthly.textColor} flex-shrink-0`} />
              <span className="text-sm">History Tracking</span>
            </div>
            <div className="flex items-center space-x-3 pt-2">
              <span className="text-sm text-muted-foreground font-medium">+7 more features</span>
            </div>
          </div>
          
          <Button 
            className={`w-full font-medium ${(currentSubscription?.planCode || '').toLowerCase() === 'monthly' ? 'bg-transparent border-2 border-purple-500 text-purple-600 hover:bg-purple-50' : `bg-gradient-to-r ${pricingTiers.monthly.buttonGradient} text-white border-0`} shadow-lg`}
            onClick={monthlyState.action}
            disabled={loadingPlan === 'monthly'}
            data-testid="button-subscribe-monthly"
          >
            {loadingPlan === 'monthly' ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                Loading...
              </>
            ) : (
              monthlyState.text
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Manage Subscription Modal */}
      {currentSubscription?.hasSubscription && currentSubscription.planCode && (
        <ManageSubscriptionModal
          open={showManageModal}
          onOpenChange={setShowManageModal}
          subscription={{
            planCode: currentSubscription.planCode,
            planName: currentSubscription.planName || PRICING_CONFIG[currentSubscription.planCode as keyof typeof PRICING_CONFIG]?.name || '',
            status: currentSubscription.status || 'active',
            currentPeriodEnd: currentSubscription.currentPeriodEnd || new Date().toISOString(),
          }}
          onCancelSuccess={() => {
            apiRequest("GET", "/api/subscription/status")
              .then(res => res.json())
              .then(data => setCurrentSubscription(data));
          }}
          onSwitchPlan={(planCode) => {
            // Close modal and trigger checkout for new plan
            setShowManageModal(false);
            handleSubscribe(planCode);
          }}
        />
      )}
    </div>
  );
}
