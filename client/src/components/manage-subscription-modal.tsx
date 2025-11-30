import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
}

export function ManageSubscriptionModal({
  open,
  onOpenChange,
  subscription,
  onCancelSuccess,
}: ManageSubscriptionModalProps) {
  const { toast } = useToast();
  
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
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to cancel subscription. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Subscription</DialogTitle>
        </DialogHeader>
        
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
            <p className="text-lg">
              {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
            </p>
          </div>
          
          <div className="pt-4 border-t">
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="w-full"
            >
              {cancelMutation.isPending ? "Canceling..." : "Cancel Subscription"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

