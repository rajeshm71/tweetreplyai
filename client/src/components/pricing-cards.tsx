import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";

export function PricingCards() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

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
      <Card>
        <CardContent className="p-8">
          <div className="text-center mb-6">
            <h3 className="text-xl font-semibold mb-2">Free Trial</h3>
            <div className="text-3xl font-bold mb-2">10 replies</div>
            <div className="text-muted-foreground">per day for 7 days</div>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="flex items-center space-x-3">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm">70 total replies during trial</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm">Chrome extension access</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm">Mobile web interface</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm">AI-powered replies (≤25 words)</span>
            </div>
          </div>
          
          <Button 
            variant="secondary" 
            className="w-full" 
            disabled
            data-testid="button-trial-signup"
          >
            Auto on signup
          </Button>
        </CardContent>
      </Card>

      {/* Weekly Plan */}
      <Card className="border-2 border-primary relative">
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground">
            Most Popular
          </Badge>
        </div>
        
        <CardContent className="p-8">
          <div className="text-center mb-6">
            <h3 className="text-xl font-semibold mb-2">Weekly</h3>
            <div className="text-3xl font-bold mb-2">$2.99</div>
            <div className="text-muted-foreground">700 replies per week</div>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="flex items-center space-x-3">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm">700 replies every 7 days</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm">All trial features</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm">Priority AI model access</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm">Email support</span>
            </div>
          </div>
          
          <Button 
            className="w-full" 
            onClick={() => handleSubscribe('weekly')}
            disabled={loadingPlan === 'weekly'}
            data-testid="button-subscribe-weekly"
          >
            {loadingPlan === 'weekly' ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
                Loading...
              </>
            ) : (
              'Subscribe weekly'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Monthly Plan */}
      <Card>
        <CardContent className="p-8">
          <div className="text-center mb-6">
            <h3 className="text-xl font-semibold mb-2">Monthly</h3>
            <div className="text-3xl font-bold mb-2">$9.99</div>
            <div className="text-muted-foreground">3,000 replies per month</div>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="flex items-center space-x-3">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm">3,000 replies every 30 days</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm">All weekly features</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm">Best value per reply</span>
            </div>
            <div className="flex items-center space-x-3">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm">Priority support</span>
            </div>
          </div>
          
          <Button 
            className="w-full" 
            onClick={() => handleSubscribe('monthly')}
            disabled={loadingPlan === 'monthly'}
            data-testid="button-subscribe-monthly"
          >
            {loadingPlan === 'monthly' ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
                Loading...
              </>
            ) : (
              'Subscribe monthly'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
