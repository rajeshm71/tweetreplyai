import { MessageCircle, User, Settings, LogOut, Home, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UsageBadge } from "@/components/usage-badge";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

export function AppHeader() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    try {
      const response = await apiRequest('POST', '/api/auth/logout');
      const data = await response.json();
      
      if (data.redirectUrl) {
        // Replit OAuth logout - redirect to Replit end session
        window.location.href = data.redirectUrl;
      } else {
        // Local/Google logout - just redirect to landing
        window.location.href = '/';
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to logout",
        variant: "destructive",
      });
    }
  };

  const handleBilling = async () => {
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (response.status === 401) {
        toast({
          title: "Unauthorized",
          description: "Please log in again",
          variant: "destructive",
        });
        window.location.href = "/login";
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to create portal session');
      }
      
      const data = await response.json();
      window.open(data.portal_url, '_blank');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to open billing portal",
        variant: "destructive",
      });
    }
  };

  const getUserInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  const getUserDisplayName = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user?.email || "User";
  };

  return (
    <header className="border-b border-border bg-card sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          {/* Logo and Nav */}
          <div className="flex items-center space-x-6">
            <div 
              className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition-opacity" 
              onClick={() => setLocation('/')}
            >
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold hidden sm:block">TweetReply</span>
            </div>
            
            <nav className="hidden md:flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/')}
                className="flex items-center gap-2"
                data-testid="button-nav-home"
              >
                <Home className="w-4 h-4" />
                <span>Home</span>
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open('https://chrome.google.com/webstore', '_blank')}
                className="flex items-center gap-2"
                data-testid="button-nav-extension"
              >
                <Download className="w-4 h-4" />
                <span>Extension</span>
              </Button>
            </nav>
          </div>

          {/* Right side: Usage, Billing, Profile */}
          <div className="flex items-center space-x-3">
            <UsageBadge />
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleBilling}
              className="hidden sm:flex"
              data-testid="button-manage-billing"
            >
              Manage billing
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="relative h-9 w-9 rounded-full"
                  data-testid="button-user-menu"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user?.profileImageUrl} alt={getUserDisplayName()} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {getUserInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none" data-testid="text-user-name">
                      {getUserDisplayName()}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground" data-testid="text-user-email">
                      {user?.email}
                    </p>
                    {user?.authProviders && user.authProviders.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Connected: {user.authProviders.join(', ')}
                      </p>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocation('/profile')} data-testid="menu-item-profile">
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation('/settings')} data-testid="menu-item-settings">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleBilling} className="sm:hidden" data-testid="menu-item-billing">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Manage Billing</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} data-testid="menu-item-logout">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
