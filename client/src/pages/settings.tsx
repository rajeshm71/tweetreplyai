import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Bell, Shield, Trash, Warning, Gear, CreditCard } from "@phosphor-icons/react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { UserPreferences, UserEmailPreferences } from "@shared/types";
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
    status: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'failed';
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
    window.location.href = '/app/pricing';
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

function ChangePasswordSection() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      toast({ title: "Error", description: "New password must be 8+ characters with uppercase, lowercase, and number", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/change-password", {
        currentPassword,
        newPassword,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Error", description: data.message || "Failed to change password", variant: "destructive" });
        return;
      }
      toast({ title: "Success", description: data.message || "Password changed." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast({ title: "Error", description: "Failed to change password", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Change password</Label>
      <p className="text-sm text-muted-foreground mb-2">
        Update your password. Use at least 8 characters with uppercase, lowercase, and number.
      </p>
      <form onSubmit={handleChangePassword} className="space-y-3">
        <Input
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="max-w-xs"
        />
        <Input
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
          className="max-w-xs"
        />
        <Input
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
          className="max-w-xs"
        />
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "Updating..." : "Change password"}
        </Button>
      </form>
    </div>
  );
}

export default function SettingsPage() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [promptStyleEnabled, setPromptStyleEnabled] = useState(false);
  // Must be declared before any conditional returns to keep hook order stable.
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [emailPrefsState, setEmailPrefsState] = useState({
    usageAlerts: true,
    productTips: true,
    marketing: true,
  });

  // Fetch user preferences (AI reply style)
  const { data: userPreferences, isLoading: preferencesLoading } = useQuery<UserPreferences>({
    queryKey: ["/api/user/preferences"],
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  // Fetch email preferences
  const { data: emailPrefs, isLoading: emailPrefsLoading } = useQuery<UserEmailPreferences>({
    queryKey: ["/api/user/email-preferences"],
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  // Sync loaded data into local state
  useEffect(() => {
    if (userPreferences) {
      setPromptStyleEnabled(userPreferences.promptStyleEnabled ?? false);
    }
  }, [userPreferences]);

  useEffect(() => {
    if (emailPrefs) {
      setEmailPrefsState({
        usageAlerts: emailPrefs.usageAlerts ?? true,
        productTips: emailPrefs.productTips ?? true,
        marketing: emailPrefs.marketing ?? false,
      });
    }
  }, [emailPrefs]);

  // Mutation to update AI reply preferences
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
      queryClient.setQueryData(["/api/user/preferences"], data);
      queryClient.invalidateQueries({ queryKey: ["/api/user/preferences"] });
      toast({ title: "Settings Saved", description: "Your preferences have been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update preferences", variant: "destructive" });
    },
  });

  // Mutation to update email preferences
  const updateEmailPrefsMutation = useMutation({
    mutationFn: async (updates: Partial<{ usageAlerts: boolean; productTips: boolean; marketing: boolean }>) => {
      const response = await apiRequest("PATCH", "/api/user/email-preferences", updates);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to update email preferences" }));
        throw new Error(errorData.message || "Failed to update email preferences");
      }
      return response.json() as Promise<UserEmailPreferences>;
    },
    onSuccess: (data: UserEmailPreferences) => {
      queryClient.setQueryData(["/api/user/email-preferences"], data);
      queryClient.invalidateQueries({ queryKey: ["/api/user/email-preferences"] });
      toast({ title: "Preferences Saved", description: "Your email preferences have been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to save email preferences", variant: "destructive" });
    },
  });

  const handleEmailPrefToggle = (key: keyof typeof emailPrefsState, checked: boolean) => {
    const next = { ...emailPrefsState, [key]: checked };
    setEmailPrefsState(next);
    updateEmailPrefsMutation.mutate({ [key]: checked });
  };

  const handlePromptStyleToggle = (checked: boolean) => {
    setPromptStyleEnabled(checked);
    updatePreferencesMutation.mutate({ promptStyleEnabled: checked });
  };

  if (isLoading || preferencesLoading || emailPrefsLoading) {
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
    if (deleteConfirmText !== "DELETE") {
      toast({
        title: "Confirmation required",
        description: 'Type DELETE (uppercase) to confirm.',
        variant: "destructive",
      });
      return;
    }
    setIsDeleting(true);
    try {
      const response = await apiRequest("POST", "/api/account/delete", { confirmation: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast({
          title: "Failed to delete account",
          description: data.message || "Please try again or contact support.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Account deleted",
        description: "Your account and personal data have been removed.",
      });
      queryClient.clear();
      window.location.href = "/";
    } catch (err) {
      console.error("[Settings] delete account failed", err);
      toast({
        title: "Failed to delete account",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmText("");
    }
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
                  <Label htmlFor="usage-alerts">Usage Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when approaching your credit limit (80% and 100%)
                  </p>
                </div>
                <Switch
                  id="usage-alerts"
                  checked={emailPrefsState.usageAlerts}
                  onCheckedChange={(checked) => handleEmailPrefToggle("usageAlerts", checked)}
                  data-testid="switch-usage-alerts"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="product-tips">Product Tips &amp; Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Weekly reply frameworks, activation nudges, and win-back emails
                  </p>
                </div>
                <Switch
                  id="product-tips"
                  checked={emailPrefsState.productTips}
                  onCheckedChange={(checked) => handleEmailPrefToggle("productTips", checked)}
                  data-testid="switch-product-tips"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="marketing">Marketing &amp; Promotions</Label>
                  <p className="text-sm text-muted-foreground">
                    Feature announcements, promotional discounts, and newsletters
                  </p>
                </div>
                <Switch
                  id="marketing"
                  checked={emailPrefsState.marketing}
                  onCheckedChange={(checked) => handleEmailPrefToggle("marketing", checked)}
                  data-testid="switch-marketing"
                />
              </div>
            </CardContent>
          </Card>

          {/* Reply Generation Settings Card */}
          <Card data-testid="card-reply-generation">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Gear className="w-5 h-5" />
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

              {user.authProviders?.includes('local') && (
                <>
                  <ChangePasswordSection />
                  <Separator />
                </>
              )}

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
                <Label>Two Factor Authentication</Label>
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
                <Warning className="w-5 h-5 text-destructive" />
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
                      <Trash className="w-4 h-4 mr-2" />
                      Delete Account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-3">
                          <p>
                            This action cannot be undone. Your personal data will be
                            permanently removed from our servers, including:
                          </p>
                          <ul className="list-disc list-inside space-y-1">
                            <li>Account profile and email</li>
                            <li>Usage history and analytics</li>
                            <li>Active subscription (auto cancelled)</li>
                            <li>Settings and preferences</li>
                          </ul>
                          <div className="pt-2">
                            <Label htmlFor="delete-confirm">
                              Type <span className="font-mono font-semibold">DELETE</span> to confirm
                            </Label>
                            <Input
                              id="delete-confirm"
                              value={deleteConfirmText}
                              onChange={(e) => setDeleteConfirmText(e.target.value)}
                              placeholder="DELETE"
                              autoComplete="off"
                              className="mt-1"
                              data-testid="input-delete-confirm"
                            />
                          </div>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setDeleteConfirmText("")}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteAccount}
                        disabled={deleteConfirmText !== "DELETE" || isDeleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isDeleting ? "Deleting..." : "Delete Account"}
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
