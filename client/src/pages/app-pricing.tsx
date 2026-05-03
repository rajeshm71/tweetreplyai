import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/app-header";
import { PricingCards } from "@/components/pricing-cards";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ManageSubscriptionModal } from "@/components/manage-subscription-modal";
import { useLocation } from "wouter";

interface SubscriptionData {
  subscription: {
    id: string;
    planCode: string;
    status: "active" | "canceled" | "past_due" | "unpaid";
    currentPeriodEnd: string;
    cancelAt?: string;
  } | null;
  planDetails: {
    code: string;
    name: string;
    price: number;
    interval: "week" | "month";
  } | null;
  usageStatus: {
    planCode: string;
    used: number;
    limit: number;
    status: string;
  };
}

const ALLOWED_PLANS = ["weekly", "monthly"] as const;

export default function AppPricingPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [showManageModal, setShowManageModal] = useState(false);
  const highlightPlanRef = useRef<HTMLDivElement | null>(null);

  const planParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("plan") : null;
  const highlightPlan: (typeof ALLOWED_PLANS)[number] | null =
    planParam && ALLOWED_PLANS.includes(planParam as (typeof ALLOWED_PLANS)[number])
      ? (planParam as (typeof ALLOWED_PLANS)[number])
      : null;
  const autoCheckoutFlag =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("autoCheckout") === "1" : false;

  const { data: subscriptionData } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription"],
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (highlightPlan && highlightPlanRef.current) {
      highlightPlanRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightPlan]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const subscription = subscriptionData?.subscription;
  const planDetails = subscriptionData?.planDetails;
  const usageStatus = subscriptionData?.usageStatus;
  const hasActiveSubscription = subscription && subscription.status === "active";

  const subscriptionForModal =
    subscription && planDetails
      ? {
          planCode: subscription.planCode,
          planName: planDetails.name,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      : null;

  const priceLabel =
    planDetails && planDetails.price > 0
      ? `$${(planDetails.price / 100).toFixed(2)} per ${planDetails.interval}`
      : undefined;

  const usageSummary =
    usageStatus && typeof usageStatus.used === "number" && typeof usageStatus.limit === "number"
      ? { used: usageStatus.used, limit: usageStatus.limit }
      : undefined;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
        {hasActiveSubscription && subscriptionForModal && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-sm text-muted-foreground">Current plan</span>
              <span className="text-sm font-medium truncate">{planDetails?.name ?? subscriptionForModal.planName}</span>
              <Badge className="bg-green-500 shrink-0">Active</Badge>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 self-start sm:self-auto"
              onClick={() => setShowManageModal(true)}
              data-testid="button-manage-subscription"
            >
              Manage subscription
            </Button>
          </div>
        )}

        <div ref={highlightPlan ? highlightPlanRef : undefined}>
          <h2 className="text-2xl font-semibold mb-6">
            {hasActiveSubscription ? "Plans" : "Choose your plan"}
          </h2>
          <PricingCards initialPlanCode={highlightPlan ?? undefined} autoCheckout={autoCheckoutFlag} usagePlanCode={usageStatus?.planCode ?? undefined} />
        </div>
      </div>

      {subscriptionForModal && (
        <ManageSubscriptionModal
          open={showManageModal}
          onOpenChange={setShowManageModal}
          subscription={subscriptionForModal}
          priceLabel={priceLabel}
          usageSummary={usageSummary}
          onCancelSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
            void queryClient.invalidateQueries({ queryKey: ["/api/usage"] });
          }}
          onSwitchPlan={(newPlanCode) => {
            setShowManageModal(false);
            navigate(`/app/pricing?plan=${newPlanCode}`);
          }}
        />
      )}
    </div>
  );
}
