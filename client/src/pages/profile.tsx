import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Mail, Shield, Download, Check, Chrome } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { MessageCircle } from "lucide-react";

export default function ProfilePage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const getUserInitials = () => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  const getUserDisplayName = () => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.email;
  };

  const getAuthProviderIcon = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'google':
        return <SiGoogle className="w-4 h-4" />;
      case 'local':
        return <Mail className="w-4 h-4" />;
      default:
        return <Shield className="w-4 h-4" />;
    }
  };

  const getAuthProviderLabel = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'google':
        return 'Google OAuth';
      case 'local':
        return 'Email & Password';
      default:
        return provider;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Profile</h1>
          <p className="text-muted-foreground">
            Manage your account settings and connected services
          </p>
        </div>

        <div className="space-y-6">
          {/* User Info Card */}
          <Card data-testid="card-user-info">
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>Your personal details and account status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start space-x-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={user.profileImageUrl} alt={getUserDisplayName()} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold" data-testid="text-profile-name">
                      {getUserDisplayName()}
                    </h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-2" data-testid="text-profile-email">
                      <Mail className="w-4 h-4" />
                      {user.email}
                      {user.emailVerified && (
                        <Badge variant="secondary" className="ml-2">
                          <Check className="w-3 h-3 mr-1" />
                          Verified
                        </Badge>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">User ID</p>
                    <code className="text-xs bg-muted px-2 py-1 rounded" data-testid="text-user-id">
                      {user.id}
                    </code>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Connected Accounts Card */}
          <Card data-testid="card-connected-accounts">
            <CardHeader>
              <CardTitle>Connected Accounts</CardTitle>
              <CardDescription>
                Authentication methods linked to your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {user.authProviders && user.authProviders.length > 0 ? (
                  user.authProviders.map((provider) => (
                    <div
                      key={provider}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`provider-${provider.toLowerCase()}`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          {getAuthProviderIcon(provider)}
                        </div>
                        <div>
                          <p className="font-medium">{getAuthProviderLabel(provider)}</p>
                          <p className="text-xs text-muted-foreground">Connected</p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                        <Check className="w-3 h-3 mr-1" />
                        Active
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No connected accounts</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Chrome Extension Card */}
          <Card data-testid="card-chrome-extension">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Chrome className="w-5 h-5" />
                Chrome Extension
              </CardTitle>
              <CardDescription>
                Generate replies directly on Twitter/X with our browser extension
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Get instant AI generated reply suggestions while browsing Twitter/X. The extension integrates seamlessly with your TweetReply account.
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => window.open('https://chrome.google.com/webstore', '_blank')}
                    className="flex items-center gap-2"
                    data-testid="button-download-extension"
                  >
                    <Download className="w-4 h-4" />
                    Download Extension
                  </Button>
                  <Badge variant="outline">Free with your account</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account Actions */}
          <Card data-testid="card-account-actions">
            <CardHeader>
              <CardTitle>Account Actions</CardTitle>
              <CardDescription>Manage your account and preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => window.location.href = '/settings'}
                data-testid="button-go-to-settings"
              >
                <Shield className="w-4 h-4 mr-2" />
                Account Settings
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={async () => {
                  const response = await fetch('/api/billing/portal', {
                    method: 'POST',
                    credentials: 'include',
                  });
                  const data = await response.json();
                  window.open(data.portal_url, '_blank');
                }}
                data-testid="button-billing-portal"
              >
                <Mail className="w-4 h-4 mr-2" />
                Manage Billing
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
