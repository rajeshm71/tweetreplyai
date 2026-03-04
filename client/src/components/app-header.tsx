import { User, Gear, SignOut, House, Download, Crown } from "@phosphor-icons/react";
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
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { APP_URLS } from "@/config/constants";

export function AppHeader() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    try {
      await apiRequest('POST', '/api/auth/logout');
      // Redirect to landing page
      window.location.href = '/';
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to logout",
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
    <header className="navbar-modern sticky top-0 z-50" role="banner">
      <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          {/* Logo and Nav - Sprint 1: Modernized, Sprint 5: Added accessibility */}
          <div className="flex items-center space-x-6">
            <Logo showText={true} className="hidden sm:flex" />
            <Logo showText={false} className="sm:hidden" />
            
            <nav className="hidden md:flex items-center space-x-2" role="navigation" aria-label="Main navigation">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/')}
                className="flex items-center gap-2 rounded-lg transition-colors duration-150 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                data-testid="button-nav-home"
                aria-label="Navigate to home page"
              >
                <House className="w-4 h-4" aria-hidden="true" />
                <span>Home</span>
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(APP_URLS.CHROME_STORE, '_blank')}
                className="flex items-center gap-2 rounded-lg transition-colors duration-150 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                data-testid="button-nav-extension"
                aria-label="Download Chrome extension (opens in new tab)"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                <span>Extension</span>
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/app/pricing')}
                className="flex items-center gap-2 rounded-lg transition-colors duration-150 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                data-testid="button-nav-pricing"
                aria-label="View pricing plans"
              >
                <Crown className="w-4 h-4" aria-hidden="true" />
                <span>Pricing</span>
              </Button>
            </nav>
          </div>

          {/* Right side: Usage, Theme Toggle, Profile - Sprint 3: Added theme toggle */}
          <div className="flex items-center space-x-3">
            <UsageBadge />
            
            <ThemeToggle />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="relative h-9 w-9 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  data-testid="button-user-menu"
                  aria-label={`User menu for ${getUserDisplayName()}`}
                  aria-haspopup="menu"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user?.profileImageUrl} alt={getUserDisplayName()} />
                    <AvatarFallback className="bg-primary text-primary-foreground" aria-hidden="true">
                      {getUserInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount role="menu" aria-label="User menu">
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
                <DropdownMenuItem onClick={() => setLocation('/profile')} data-testid="menu-item-profile" role="menuitem" aria-label="View profile">
                  <User className="mr-2 h-4 w-4" aria-hidden="true" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation('/settings')} data-testid="menu-item-settings" role="menuitem" aria-label="View settings">
                  <Gear className="mr-2 h-4 w-4" aria-hidden="true" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} data-testid="menu-item-logout" role="menuitem" aria-label="Log out">
                  <SignOut className="mr-2 h-4 w-4" aria-hidden="true" />
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
