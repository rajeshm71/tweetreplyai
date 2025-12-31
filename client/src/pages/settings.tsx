import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Bell, Shield, Trash2, AlertTriangle, Settings, CreditCard } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { UserPreferences } from "@shared/types";
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
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface SubscriptionData {
  subscription: {
    id: string;
    planCode: string;
    status: 'active' | 'canceled' | 'past_due' | 'unpaid';
    currentPeriodEnd: string;
    cancelAt?: string;
  } | null;
  planDetails: {
    code: string;
    name: string;
    price: number;
    interval: 'week' | 'month';
  } | null;
  usageStatus: {
    planCode: string;
    used: number;
    limit: number;
    status: string;
  };
}

function BillingCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch subscription data
  const { data: subscriptionData, isLoading: subscriptionLoading } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription"],
    refetchOnWindowFocus: false,
  });

  // Cancel subscription mutation
  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/subscription/cancel", {});
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to cancel subscription" }));
        throw new Error(errorData.message || "Failed to cancel subscription");
      }
      return response.json();
    },
    onSuccess: (data) => {
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

  // Handle upgrade
  const handleUpgrade = () => {
    window.location.href = '/pricing';
  };

  if (subscriptionLoading) {
    return (
      <Card data-testid="card-billing">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            <CardTitle>Billing & Subscription</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const subscription = subscriptionData?.subscription;
  const planDetails = subscriptionData?.planDetails;
  const usageStatus = subscriptionData?.usageStatus;
  const planCode = usageStatus?.planCode || 'free';
  const isFreeOrTrial = planCode === 'free' || planCode === 'trial';
  const hasActiveSubscription = subscription && subscription.status === 'active';
  const isCanceled = subscription && subscription.status === 'canceled';

  // Determine status badge
  let statusBadge = null;
  if (hasActiveSubscription) {
    statusBadge = <Badge className="bg-green-500">Active</Badge>;
  } else if (isCanceled) {
    statusBadge = <Badge variant="secondary">Canceled</Badge>;
  } else if (planCode === 'trial') {
    statusBadge = <Badge variant="outline">Free Trial</Badge>;
  } else {
    statusBadge = <Badge variant="outline">Free Plan</Badge>;
  }

  // Get next billing date
  let nextBillingDate = null;
  if (subscription && subscription.currentPeriodEnd) {
    nextBillingDate = format(new Date(subscription.currentPeriodEnd), "MMMM d, yyyy");
  } else if (isFreeOrTrial) {
    nextBillingDate = "N/A";
  }

  return (
    <Card data-testid="card-billing">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          <CardTitle>Billing & Subscription</CardTitle>
        </div>
        <CardDescription>
          Manage your subscription and billing information
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Plan */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Current Plan</Label>
            {statusBadge}
          </div>
          <p className="text-sm font-medium">
            {planDetails?.name || 'Free Plan'}
          </p>
          {planDetails && planDetails.price > 0 && (
            <p className="text-sm text-muted-foreground">
              ${(planDetails.price / 100).toFixed(2)} per {planDetails.interval}
            </p>
          )}
        </div>

        <Separator />

        {/* Next Billing Date */}
        {nextBillingDate && (
          <>
            <div className="space-y-2">
              <Label>Next Billing Date</Label>
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

        {/* Usage Info */}
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

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          {isFreeOrTrial && (
            <Button onClick={handleUpgrade} data-testid="button-upgrade-plan">
              Upgrade Plan
            </Button>
          )}
          
          {hasActiveSubscription && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  data-testid="button-cancel-subscription"
                  disabled={cancelSubscriptionMutation.isPending}
                >
                  Cancel Subscription
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to cancel your subscription? Your subscription will remain active until{" "}
                    {subscription?.currentPeriodEnd 
                      ? format(new Date(subscription.currentPeriodEnd), "MMMM d, yyyy")
                      : "the end of your billing period"}
                    . You'll lose access after that date.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => cancelSubscriptionMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Cancel Subscription
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [usageAlerts, setUsageAlerts] = useState(true);
  const [promptStyleEnabled, setPromptStyleEnabled] = useState(false);
  
  // Fetch user preferences
  const { data: userPreferences, isLoading: preferencesLoading } = useQuery<UserPreferences>({
    queryKey: ["/api/user/preferences"],
    enabled: !!user,
    refetchOnWindowFocus: false,
  });
  
  // Update promptStyleEnabled when preferences are loaded
  useEffect(() => {
    if (userPreferences) {
      setPromptStyleEnabled(userPreferences.promptStyleEnabled ?? false);
    }
  }, [userPreferences]);
  
  // Mutation to update preferences
  const updatePreferencesMutation = useMutation({
    mutationFn: async (updates: { promptStyleEnabled: boolean }) => {
      const response = await apiRequest("PUT", "/api/user/preferences", updates);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to update preferences" }));
        throw new Error(errorData.message || "Failed to update preferences");
      }
      return response.json();
    },
    onSuccess: (data: UserPreferences) => {
      // Fix: Update cache and invalidate queries to ensure all components refresh
      queryClient.setQueryData(["/api/user/preferences"], data);
      queryClient.invalidateQueries({ queryKey: ["/api/user/preferences"] });
      toast({
        title: "Settings Saved",
        description: "Your preferences have been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update preferences",
        variant: "destructive",
      });
    },
  });
  
  const handlePromptStyleToggle = (checked: boolean) => {
    setPromptStyleEnabled(checked);
    updatePreferencesMutation.mutate({ promptStyleEnabled: checked });
  };

  if (isLoading || preferencesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleDeleteAccount = async () => {
    toast({
      title: "Account Deletion",
      description: "Account deletion is not yet available. Please contact support.",
      variant: "destructive",
    });
  };

  const handleSaveNotifications = () => {
    toast({
      title: "Settings Saved",
      description: "Your notification preferences have been updated.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account preferences and security settings
          </p>
        </div>

        <div className="space-y-6">
          {/* Notifications Card */}
          <Card data-testid="card-notifications">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                <CardTitle>Notifications</CardTitle>
              </div>
              <CardDescription>
                Configure how you receive updates and alerts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="email-notifications">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive updates about your account via email
                  </p>
                </div>
                <Switch
                  id="email-notifications"
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                  data-testid="switch-email-notifications"
                />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="usage-alerts">Usage Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when approaching your quota limit
                  </p>
                </div>
                <Switch
                  id="usage-alerts"
                  checked={usageAlerts}
                  onCheckedChange={setUsageAlerts}
                  data-testid="switch-usage-alerts"
                />
              </div>

              <div className="pt-4">
                <Button onClick={handleSaveNotifications} data-testid="button-save-notifications">
                  Save Preferences
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Reply Generation Settings Card */}
          <Card data-testid="card-reply-generation">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                <CardTitle>Reply Generation</CardTitle>
              </div>
              <CardDescription>
                Configure how replies are generated
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="prompt-style-enabled">Enable Prompt Style Selection</Label>
                  <p className="text-sm text-muted-foreground">
                    Show the Prompt Style dropdown in the reply generator
                  </p>
                </div>
                <Switch
                  id="prompt-style-enabled"
                  checked={promptStyleEnabled}
                  onCheckedChange={handlePromptStyleToggle}
                  disabled={preferencesLoading || updatePreferencesMutation.isPending}
                  data-testid="switch-prompt-style-enabled"
                />
              </div>
            </CardContent>
          </Card>

          {/* Billing & Subscription Card */}
          <BillingCard />

          {/* Security Card */}
          <Card data-testid="card-security">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                <CardTitle>Security & Privacy</CardTitle>
              </div>
              <CardDescription>
                Manage your account security and privacy settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Connected Authentication Methods</Label>
                <p className="text-sm text-muted-foreground">
                  You have {user.authProviders?.length || 0} authentication method(s) connected: {user.authProviders?.join(', ')}
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Email Verification</Label>
                <div className="flex items-center gap-2">
                  {user.emailVerified ? (
                    <span className="text-sm text-green-600 dark:text-green-400">
                      ✓ Your email is verified
                    </span>
                  ) : (
                    <Button variant="outline" size="sm" data-testid="button-verify-email">
                      Verify Email
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Two-Factor Authentication</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Add an extra layer of security to your account
                </p>
                <Button variant="outline" size="sm" disabled data-testid="button-2fa">
                  Enable 2FA (Coming Soon)
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone Card */}
          <Card className="border-destructive/50" data-testid="card-danger-zone">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
              </div>
              <CardDescription>
                Irreversible actions for your account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Delete Account</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" data-testid="button-delete-account">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete your account
                        and remove all your data from our servers, including:
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>All generated replies</li>
                          <li>Usage history and analytics</li>
                          <li>Subscription information</li>
                          <li>Account settings and preferences</li>
                        </ul>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteAccount}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete Account
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
