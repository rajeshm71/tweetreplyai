import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, CaretRight } from "@phosphor-icons/react";
import { PRICING_CONFIG } from "@/config/pricing";
import { SubscriptionCancelConfirmDialog } from "@/components/subscription-cancel-confirm-dialog";

interface ManageSubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: {
    planCode: string;
    planName: string;
    status: string;
    currentPeriodEnd: string;
  };
  onCancelSuccess?: () => void;
  onSwitchPlan?: (planCode: string) => void;
}

export function ManageSubscriptionModal({
  open,
  onOpenChange,
  subscription,
  onCancelSuccess,
  onSwitchPlan: externalSwitchPlan,
}: ManageSubscriptionModalProps) {
  const { toast } = useToast();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Reset confirmation dialog when main dialog closes
  const handleMainDialogChange = (isOpen: boolean) => {
    if (!isOpen) {
      setShowConfirmDialog(false);
    }
    onOpenChange(isOpen);
  };
  
  // Determine alternative plan - use names from PRICING_CONFIG for consistency
  const getAlternativePlan = (currentPlanCode: string) => {
    if (currentPlanCode === 'monthly') {
      const weeklyConfig = PRICING_CONFIG.weekly;
      return { code: 'weekly', name: weeklyConfig.name };
    }
    if (currentPlanCode === 'weekly') {
      const monthlyConfig = PRICING_CONFIG.monthly;
      return { code: 'monthly', name: monthlyConfig.name };
    }
    return null;
  };

  const alternativePlan = getAlternativePlan(subscription.planCode);
  const planConfig = PRICING_CONFIG[subscription.planCode as keyof typeof PRICING_CONFIG];
  const benefits = planConfig?.features || [];

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/subscription/cancel");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Subscription Canceled",
        description: "Your subscription has been canceled. You'll retain access until the end of your billing period.",
      });
      onCancelSuccess?.();
      setShowConfirmDialog(false);
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to cancel subscription. Please try again.",
        variant: "destructive",
      });
      // Keep confirmation dialog open on error so user can retry
      // Don't close the dialog here
    },
  });

  const handleSwitchPlan = (newPlanCode: string) => {
    // Close modals
    setShowConfirmDialog(false);
    onOpenChange(false);
    
    // If external handler provided, use it (for direct checkout)
    if (externalSwitchPlan) {
      externalSwitchPlan(newPlanCode);
    } else {
      // Fallback: redirect to pricing page
      window.location.href = `/pricing?plan=${newPlanCode}`;
    }
  };

  const handleCancelClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmCancel = () => {
    cancelMutation.mutate();
  };

  const handleKeepPlan = () => {
    setShowConfirmDialog(false);
  };

  const renewalDate = new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  
  return (
    <>
      <Dialog open={open} onOpenChange={handleMainDialogChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Subscription</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Subscription Details */}
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Current Plan</p>
                <p className="text-lg font-semibold">{subscription.planName}</p>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="text-lg capitalize">{subscription.status}</p>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground">Renews On</p>
                <p className="text-lg">{renewalDate}</p>
              </div>
            </div>

            {/* Benefits Reminder */}
            {benefits.length > 0 && (
              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="text-sm font-semibold mb-2">You're enjoying:</p>
                <ul className="space-y-1.5">
                  {benefits.map((benefit, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Actions */}
            <div className="pt-4 border-t space-y-2">
              {alternativePlan && (
                <Button
                  variant="outline"
                  onClick={() => handleSwitchPlan(alternativePlan.code)}
                  className="w-full"
                >
                  Switch to {alternativePlan.name}
                  <CaretRight className="w-4 h-4 ml-2" />
                </Button>
              )}
              
              <Button
                variant="outline"
                onClick={handleCancelClick}
                disabled={cancelMutation.isPending}
                className="w-full text-muted-foreground hover:text-destructive hover:border-destructive/50"
              >
                {cancelMutation.isPending ? "Processing..." : "Cancel Subscription"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <SubscriptionCancelConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        subscription={subscription}
        alternativePlan={alternativePlan || undefined}
        onConfirm={handleConfirmCancel}
        onSwitchPlan={handleSwitchPlan}
      />
    </>
  );
}

