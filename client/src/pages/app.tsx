import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/app-header";
// Sprint 4: Lazy load heavy component
import { lazy, Suspense } from "react";
const GenerateReply = lazy(() => import("@/components/generate-reply").then(module => ({ default: module.GenerateReply })));

export default function AppPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();

  // Handle checkout success callback
  // Use ref to track if we've already processed the callback to prevent duplicate calls
  const processedRef = useRef(false);
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    // Dodo Payments provides subscription_id directly, not session_id
    const subscriptionId = urlParams.get('subscription_id');
    const status = urlParams.get('status');
    const success = urlParams.get('success');
    const error = urlParams.get('error');

    // Only process if we have a parameter and haven't processed yet
    if (!subscriptionId && !success && !error) {
      return;
    }

    // Prevent duplicate processing across re-renders
    if (processedRef.current) {
      return;
    }

    // Handle subscription_id from Dodo Payments redirect
    if (subscriptionId) {
      processedRef.current = true;
      // Call checkout success endpoint to process the subscription
      fetch(`/api/checkout/success?subscription_id=${subscriptionId}${status ? `&status=${status}` : ''}`, {
        method: 'GET',
        credentials: 'include',
      })
        .then((response) => {
          // Remove query parameters from URL immediately
          window.history.replaceState({}, '', '/app/pricing');
          
          if (response.ok) {
            toast({
              title: "Subscription Activated",
              description: "Your subscription has been successfully activated!",
              variant: "default",
            });
          } else {
            toast({
              title: "Error",
              description: "Failed to activate subscription. Please contact support.",
              variant: "destructive",
            });
          }
        })
        .catch((error) => {
          console.error('Checkout success error:', error);
          window.history.replaceState({}, '', '/app/pricing');
          toast({
            title: "Error",
            description: "Failed to process subscription. Please contact support.",
            variant: "destructive",
          });
        });
    } else if (success === 'subscription_activated') {
      processedRef.current = true;
      // Handle direct success parameter
      window.history.replaceState({}, '', '/app/pricing');
      toast({
        title: "Subscription Activated",
        description: "Your subscription has been successfully activated!",
        variant: "default",
      });
    } else if (error) {
      processedRef.current = true;
      // Handle error parameter
      window.history.replaceState({}, '', '/app/pricing');
      const errorMessages: Record<string, string> = {
        missing_session_id: "Missing subscription information. Please try again.",
        no_subscription: "No subscription found. Please contact support.",
        user_not_found: "User not found. Please log in again.",
        unknown_plan: "Unknown subscription plan. Please contact support.",
        plan_not_found: "Subscription plan not found. Please contact support.",
        checkout_failed: "Failed to process checkout. Please try again.",
        subscription_not_found: "Subscription not found. Please contact support.",
        unauthorized: "Unauthorized. Please log in again.",
      };
      toast({
        title: "Error",
        description: errorMessages[error] || "An error occurred. Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "Please log in to continue",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      {/* Main App Interface */}
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-2">Generate Reply</h1>
          <p className="text-muted-foreground">
            Paste a tweet text or URL to generate an authentic reply
          </p>
        </div>

        <Suspense fallback={
          <div className="min-h-[600px] flex items-center justify-center" role="status" aria-label="Loading reply generator">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Loading reply generator...</p>
            </div>
          </div>
        }>
          <GenerateReply />
        </Suspense>
      </div>
    </div>
  );
}
