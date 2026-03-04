import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/app-header";
import { PricingCards } from "@/components/pricing-cards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CreditCard } from "@phosphor-icons/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showManageModal, setShowManageModal] = useState(false);
  const highlightPlanRef = useRef<HTMLDivElement | null>(null);

  const planParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("plan") : null;
  const highlightPlan = planParam && ALLOWED_PLANS.includes(planParam as (typeof ALLOWED_PLANS)[number]) ? planParam : null;
  const autoCheckoutFlag =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("autoCheckout") === "1" : false;

  const { data: subscriptionData, isLoading: subscriptionLoading } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription"],
    refetchOnWindowFocus: false,
  });

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/subscription/cancel", {});
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to cancel subscription" }));
        throw new Error(errorData.message || "Failed to cancel subscription");
      }
      return response.json();
    },
    onSuccess: (data: { subscription: { currentPeriodEnd: string } }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/usage"] });
      toast({
        title: "Subscription Canceled",
        description: `Your subscription will remain active until ${format(new Date(data.subscription.currentPeriodEnd), "MMMM d, yyyy")}. You'll lose access after that date.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel subscription",
        variant: "destructive",
      });
    },
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
  const planCode = usageStatus?.planCode || "free";
  const isFreeOrTrial = planCode === "free" || planCode === "trial";
  const hasActiveSubscription = subscription && subscription.status === "active";
  const isCanceled = subscription && subscription.status === "canceled";

  let statusBadge = null;
  if (hasActiveSubscription) {
    statusBadge = <Badge className="bg-green-500">Active</Badge>;
  } else if (isCanceled) {
    statusBadge = <Badge variant="secondary">Canceled</Badge>;
  } else if (planCode === "trial") {
    statusBadge = <Badge variant="outline">Free Trial</Badge>;
  } else {
    statusBadge = <Badge variant="outline">Free Plan</Badge>;
  }

  let nextBillingDate: string | null = null;
  if (subscription?.currentPeriodEnd) {
    nextBillingDate = format(new Date(subscription.currentPeriodEnd), "MMMM d, yyyy");
  } else if (isFreeOrTrial) {
    nextBillingDate = "N/A";
  }

  const subscriptionForModal =
    subscription && planDetails
      ? {
          planCode: subscription.planCode,
          planName: planDetails.name,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      : null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
        {hasActiveSubscription && (
          <Card data-testid="card-manage-subscription" className="mb-8">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                <CardTitle>Manage subscription</CardTitle>
              </div>
              <CardDescription>
                Current plan and billing. Cancel or switch plan below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Current Plan</Label>
                  {statusBadge}
                </div>
                <p className="text-sm font-medium">{planDetails?.name || "Free Plan"}</p>
                {planDetails && planDetails.price > 0 && (
                  <p className="text-sm text-muted-foreground">
                    ${(planDetails.price / 100).toFixed(2)} per {planDetails.interval}
                  </p>
                )}
              </div>
              <Separator />
              {nextBillingDate && (
                <>
                  <div className="space-y-2">
                    <Label>Next billing date</Label>
                    <p className="text-sm text-muted-foreground">
                      {isCanceled && subscription?.currentPeriodEnd
                        ? `Canceled, active until ${nextBillingDate}`
                        : nextBillingDate !== "N/A"
                          ? nextBillingDate
                          : "No upcoming billing"}
                    </p>
                  </div>
                  <Separator />
                </>
              )}
              {usageStatus && (
                <>
                  <div className="space-y-2">
                    <Label>Usage</Label>
                    <p className="text-sm text-muted-foreground">
                      {usageStatus.used} / {usageStatus.limit} credits used
                    </p>
                  </div>
                  <Separator />
                </>
              )}
              <div className="flex flex-col gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowManageModal(true)}
                  data-testid="button-manage-subscription"
                >
                  Switch plan
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      data-testid="button-cancel-subscription"
                      disabled={cancelSubscriptionMutation.isPending}
                    >
                      Cancel subscription
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your subscription will remain active until{" "}
                        {subscription?.currentPeriodEnd
                          ? format(new Date(subscription.currentPeriodEnd), "MMMM d, yyyy")
                          : "the end of your billing period"}
                        . You will lose access after that date.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep subscription</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => cancelSubscriptionMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Cancel subscription
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        )}

        <div ref={highlightPlan ? highlightPlanRef : undefined}>
          <h2 className="text-2xl font-semibold mb-6">
            {hasActiveSubscription ? "Plans" : "Choose your plan"}
          </h2>
          <PricingCards initialPlanCode={highlightPlan ?? undefined} autoCheckout={autoCheckoutFlag} />
        </div>
      </div>

      {subscriptionForModal && (
        <ManageSubscriptionModal
          open={showManageModal}
          onOpenChange={setShowManageModal}
          subscription={subscriptionForModal}
          onCancelSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/subscription"] })}
          onSwitchPlan={(newPlanCode) => {
            setShowManageModal(false);
            navigate(`/app/pricing?plan=${newPlanCode}`);
          }}
        />
      )}
    </div>
  );
}
