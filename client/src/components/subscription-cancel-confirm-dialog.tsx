import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check } from "lucide-react";
import { PRICING_CONFIG } from "@/config/pricing";

interface SubscriptionCancelConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: {
    planCode: string;
    planName: string;
    currentPeriodEnd: string;
  };
  alternativePlan?: {
    code: string;
    name: string;
  };
  onConfirm: () => void;
  onSwitchPlan?: (planCode: string) => void;
  onKeepPlan: () => void;
}

export function SubscriptionCancelConfirmDialog({
  open,
  onOpenChange,
  subscription,
  alternativePlan,
  onConfirm,
  onSwitchPlan,
  onKeepPlan,
}: SubscriptionCancelConfirmDialogProps) {
  const [showCancelOptions, setShowCancelOptions] = useState(false);
  const planConfig = PRICING_CONFIG[subscription.planCode as keyof typeof PRICING_CONFIG];
  const benefits = planConfig?.features || [];

  // Reset expandable state when dialog opens
  useEffect(() => {
    if (open) {
      setShowCancelOptions(false);
    }
  }, [open]);
  const accessEndDate = new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const handleSwitchPlan = () => {
    if (alternativePlan && onSwitchPlan) {
      onSwitchPlan(alternativePlan.code);
    }
  };

  // Handle dialog close (ESC key or click outside) - just close, don't trigger actions
  const handleDialogChange = (isOpen: boolean) => {
    if (!isOpen) {
      // User closed dialog without choosing an action - reset state and close
      setShowCancelOptions(false);
      onKeepPlan();
    }
    onOpenChange(isOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleDialogChange}>
      {/* Disable all animations: content element, children, and transitions */}
      <AlertDialogContent className="!animate-none !transition-none [&>div]:!animate-none [&>div]:!transition-none data-[state=open]:!animate-none data-[state=closed]:!animate-none">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-4 pt-2">
            <div>
              <p className="font-semibold text-foreground mb-2">You'll lose access to:</p>
              <ul className="space-y-1 list-disc list-inside text-sm text-muted-foreground">
                {benefits.map((benefit, index) => (
                  <li key={index}>
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-sm text-foreground">
                <span className="font-semibold">Your subscription will remain active until {accessEndDate}.</span>
                <br />
                <span className="text-muted-foreground">After that, you'll be moved to the free trial plan with limited features.</span>
              </p>
            </div>

            <p className="text-sm font-medium text-foreground">
              Are you sure you want to cancel?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <AlertDialogFooter className="flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <AlertDialogCancel asChild>
            <Button variant="outline" onClick={onKeepPlan} className="w-full sm:w-auto">
              <Check className="w-4 h-4 mr-2" />
              Keep My Plan
            </Button>
          </AlertDialogCancel>
          
          {alternativePlan && onSwitchPlan && (
            <Button
              variant="outline"
              onClick={handleSwitchPlan}
              style={{ 
                backgroundImage: 'none',
                background: 'hsl(var(--primary))',
                borderColor: 'hsl(var(--primary))'
              }}
              className="w-full sm:w-auto !bg-primary [background-image:none!important] !from-primary !to-primary !text-primary-foreground hover:!bg-primary/90 hover:!from-primary hover:!to-primary !border-primary"
            >
              Switch to {alternativePlan.name}
            </Button>
          )}
          
          {/* Expandable cancel section - hide cancel button behind link */}
          <div className="w-full sm:w-auto" id="cancel-options">
            {!showCancelOptions ? (
              <button
                type="button"
                onClick={() => setShowCancelOptions(true)}
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
                aria-expanded={showCancelOptions}
                aria-controls="cancel-options"
              >
                Show cancellation options
              </button>
            ) : (
              <AlertDialogAction asChild>
                <Button
                  variant="outline"
                  onClick={(e) => {
                    e.preventDefault();
                    onConfirm();
                  }}
                  style={{ 
                    backgroundImage: 'none',
                    background: 'transparent',
                    borderColor: 'hsl(var(--destructive) / 0.5)'
                  }}
                  className="w-full sm:w-auto !bg-transparent [background-image:none!important] !from-transparent !to-transparent border border-destructive/50 !text-destructive hover:!bg-destructive/10 hover:!from-transparent hover:!to-transparent !shadow-none"
                >
                  Yes, Cancel Subscription
                </Button>
              </AlertDialogAction>
            )}
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

