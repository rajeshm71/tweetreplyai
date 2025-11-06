import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Rocket, Crown, Gift, TrendingUp, Star } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { PRICING_CONFIG, repliesPerCycleLabel, repliesEveryPeriodBullet } from "@/config/pricing";
import { isUnauthorizedError } from "@/lib/authUtils";

export function PricingCards() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  // Pricing tier color configurations
  const pricingTiers = {
    trial: {
      icon: Sparkles,
      iconGradient: "from-blue-500 to-cyan-500",
      emoji: "🎁",
      cardGradient: "from-blue-500/5 to-cyan-500/5",
      borderColor: "border-blue-500/20",
      hoverBorder: "hover:border-blue-500/40",
      textColor: "text-blue-600",
      priceGradient: "bg-gradient-to-r from-blue-600 to-cyan-600",
      buttonGradient: "from-blue-500 to-cyan-500",
      badgeColor: "bg-blue-500/10 text-blue-600 border-blue-500/20"
    },
    weekly: {
      icon: Rocket,
      iconGradient: "from-green-500 to-emerald-500",
      emoji: "🚀",
      cardGradient: "from-green-500/5 to-emerald-500/5",
      borderColor: "border-green-500/20",
      hoverBorder: "hover:border-green-500/40",
      textColor: "text-green-600",
      priceGradient: "bg-gradient-to-r from-green-600 to-emerald-600",
      buttonGradient: "from-green-500 to-emerald-500",
      badgeColor: "bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-700 border-green-500/30"
    },
    monthly: {
      icon: Crown,
      iconGradient: "from-purple-500 to-pink-500",
      emoji: "👑",
      cardGradient: "from-purple-500/5 to-pink-500/5",
      borderColor: "border-purple-500/20",
      hoverBorder: "hover:border-purple-500/40",
      textColor: "text-purple-600",
      priceGradient: "bg-gradient-to-r from-purple-600 to-pink-600",
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
          window.location.href = "/api/login";
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
    if (!isAuthenticated) {
      window.location.href = '/api/login';
      return;
    }
    
    checkoutMutation.mutate(planCode);
  };

  return (
    <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
      {/* Free Trial */}
      <Card className={`relative overflow-hidden border-2 ${pricingTiers.trial.borderColor} ${pricingTiers.trial.hoverBorder} transition-all duration-300 group`}>
        {/* Gradient background */}
        <div className={`absolute inset-0 bg-gradient-to-br ${pricingTiers.trial.cardGradient} opacity-50 group-hover:opacity-70 transition-opacity duration-300`} />
        
        <CardContent className="p-8 relative z-10">
          <div className="text-center mb-6">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${pricingTiers.trial.iconGradient} flex items-center justify-center shadow-xl`}>
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
            
            {/* Price with gradient */}
            <div className={`text-3xl font-bold mb-2 ${pricingTiers.trial.priceGradient} bg-clip-text text-transparent`}>
              {PRICING_CONFIG.trial.repliesLimit} replies
            </div>
            <div className="text-muted-foreground">{repliesPerCycleLabel(PRICING_CONFIG.trial)}</div>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="flex items-center space-x-3">
              <Check className={`w-4 h-4 ${pricingTiers.trial.textColor} flex-shrink-0`} />
              <span className="text-sm">70 total replies during trial</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className={`w-4 h-4 ${pricingTiers.trial.textColor} flex-shrink-0`} />
              <span className="text-sm">Chrome extension access</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className={`w-4 h-4 ${pricingTiers.trial.textColor} flex-shrink-0`} />
              <span className="text-sm">Mobile web interface</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className={`w-4 h-4 ${pricingTiers.trial.textColor} flex-shrink-0`} />
              <span className="text-sm">AI generated replies</span>
            </div>
          </div>
          
          <Button 
            className={`w-full font-medium bg-gradient-to-r ${pricingTiers.trial.buttonGradient} text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300`}
            onClick={() => {
              if (!isAuthenticated) {
                window.location.href = '/login';
              } else {
                // If already authenticated, redirect to app or home
                window.location.href = '/app';
              }
            }}
            data-testid="button-trial-signup"
          >
            Start Replying
          </Button>
        </CardContent>
      </Card>

      {/* Weekly Plan */}
      <Card className={`relative overflow-visible border-2 ${pricingTiers.weekly.borderColor} ${pricingTiers.weekly.hoverBorder} transition-all duration-300 group shadow-[0_0_30px_rgba(34,197,94,0.2)] hover:shadow-[0_0_40px_rgba(34,197,94,0.3)]`}>
        {/* Enhanced Most Popular badge - Redesigned for better visibility */}
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-50">
          <Badge className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 text-white border-2 border-amber-600 shadow-2xl font-bold px-4 py-1.5 text-sm whitespace-nowrap animate-pulse">
            ⭐ Most Popular
          </Badge>
        </div>
        
        {/* Gradient background with glow */}
        <div className={`absolute inset-0 bg-gradient-to-br ${pricingTiers.weekly.cardGradient} opacity-50 group-hover:opacity-70 transition-opacity duration-300`} />
        <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 to-emerald-500/10 opacity-30 blur-xl" />
        
        <CardContent className="p-8 relative z-10 pt-10">
          <div className="text-center mb-6">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${pricingTiers.weekly.iconGradient} flex items-center justify-center shadow-xl`}>
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
            
            {/* Price with gradient */}
            <div className="mb-2">
              {PRICING_CONFIG.weekly.originalPrice && PRICING_CONFIG.weekly.offer?.active ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xl text-muted-foreground line-through">
                      ${PRICING_CONFIG.weekly.originalPrice.toFixed(2)}
                    </span>
                    <div className={`text-3xl font-bold ${pricingTiers.weekly.priceGradient} bg-clip-text text-transparent`}>
                      ${PRICING_CONFIG.weekly.price.toFixed(2)}
                    </div>
                  </div>
                  <Badge variant="secondary" className={`${pricingTiers.weekly.badgeColor} whitespace-nowrap text-xs font-semibold px-2 py-0.5`}>
                    50% off
                  </Badge>
                </div>
              ) : (
                <div className={`text-3xl font-bold ${pricingTiers.weekly.priceGradient} bg-clip-text text-transparent`}>
                  ${PRICING_CONFIG.weekly.price.toFixed(2)}
                </div>
              )}
            </div>
            <div className="text-muted-foreground">{repliesPerCycleLabel(PRICING_CONFIG.weekly)}</div>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="flex items-center space-x-3">
              <Check className={`w-4 h-4 ${pricingTiers.weekly.textColor} flex-shrink-0`} />
              <span className="text-sm">{repliesEveryPeriodBullet(PRICING_CONFIG.weekly)}</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className={`w-4 h-4 ${pricingTiers.weekly.textColor} flex-shrink-0`} />
              <span className="text-sm">All trial features</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className={`w-4 h-4 ${pricingTiers.weekly.textColor} flex-shrink-0`} />
              <span className="text-sm">Priority AI model access</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className={`w-4 h-4 ${pricingTiers.weekly.textColor} flex-shrink-0`} />
              <span className="text-sm">Email support</span>
            </div>
          </div>
          
          <Button 
            className={`w-full font-medium bg-gradient-to-r ${pricingTiers.weekly.buttonGradient} text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300`}
            onClick={() => handleSubscribe('weekly')}
            disabled={loadingPlan === 'weekly'}
            data-testid="button-subscribe-weekly"
          >
            {loadingPlan === 'weekly' ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                Loading...
              </>
            ) : (
              'Subscribe'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Monthly Plan */}
      <Card className={`relative overflow-hidden border-2 ${pricingTiers.monthly.borderColor} ${pricingTiers.monthly.hoverBorder} transition-all duration-300 group`}>
        {/* Gradient background */}
        <div className={`absolute inset-0 bg-gradient-to-br ${pricingTiers.monthly.cardGradient} opacity-50 group-hover:opacity-70 transition-opacity duration-300`} />
        
        <CardContent className="p-8 relative z-10">
          <div className="text-center mb-6">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${pricingTiers.monthly.iconGradient} flex items-center justify-center shadow-xl`}>
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
            
            {/* Price with gradient */}
            <div className="mb-2">
              {PRICING_CONFIG.monthly.originalPrice && PRICING_CONFIG.monthly.offer?.active ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xl text-muted-foreground line-through">
                      ${PRICING_CONFIG.monthly.originalPrice.toFixed(2)}
                    </span>
                    <div className={`text-3xl font-bold ${pricingTiers.monthly.priceGradient} bg-clip-text text-transparent`}>
                      ${PRICING_CONFIG.monthly.price.toFixed(2)}
                    </div>
                  </div>
                  <Badge variant="secondary" className={`${pricingTiers.monthly.badgeColor} whitespace-nowrap text-xs font-semibold px-2 py-0.5`}>
                    50% off
                  </Badge>
                </div>
              ) : (
                <div className={`text-3xl font-bold ${pricingTiers.monthly.priceGradient} bg-clip-text text-transparent`}>
                  ${PRICING_CONFIG.monthly.price.toFixed(2)}
                </div>
              )}
            </div>
            <div className="text-muted-foreground">{repliesPerCycleLabel(PRICING_CONFIG.monthly)}</div>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="flex items-center space-x-3">
              <Check className={`w-4 h-4 ${pricingTiers.monthly.textColor} flex-shrink-0`} />
              <span className="text-sm">{repliesEveryPeriodBullet(PRICING_CONFIG.monthly)}</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className={`w-4 h-4 ${pricingTiers.monthly.textColor} flex-shrink-0`} />
              <span className="text-sm">All weekly features</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className={`w-4 h-4 ${pricingTiers.monthly.textColor} flex-shrink-0`} />
              <span className="text-sm">Best value per reply</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className={`w-4 h-4 ${pricingTiers.monthly.textColor} flex-shrink-0`} />
              <span className="text-sm">Priority support</span>
            </div>
          </div>
          
          <Button 
            className={`w-full font-medium bg-gradient-to-r ${pricingTiers.monthly.buttonGradient} text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300`}
            onClick={() => handleSubscribe('monthly')}
            disabled={loadingPlan === 'monthly'}
            data-testid="button-subscribe-monthly"
          >
            {loadingPlan === 'monthly' ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                Loading...
              </>
            ) : (
              'Subscribe'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
