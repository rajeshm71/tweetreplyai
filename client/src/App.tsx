import { Suspense, lazy, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

// Sprint 4: Lazy load routes for code-splitting (Passport/session auth)
const Landing = lazy(() => import("@/pages/landing"));
const Home = lazy(() => import("@/pages/home"));
const AppPage = lazy(() => import("@/pages/app"));
const AppPricingPage = lazy(() => import("@/pages/app-pricing"));
const AuthPage = lazy(() => import("@/pages/auth"));
const ProfilePage = lazy(() => import("@/pages/profile"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const PrivacyPolicy = lazy(() => import("@/pages/privacy"));
const TermsOfService = lazy(() => import("@/pages/terms"));
const CompleteProfile = lazy(() => import("@/pages/complete-profile"));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Loading component for Suspense fallback
function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-label="Loading page">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function RedirectToCompleteProfile() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/complete-profile");
  }, [navigate]);
  return null;
}

function PricingRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      navigate("/app/pricing");
    } else {
      navigate("/login?returnUrl=" + encodeURIComponent("/app/pricing"));
    }
  }, [isAuthenticated, isLoading, navigate]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-label="Redirecting">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Redirecting...</p>
      </div>
    </div>
  );
}

// Allowed pathnames for returnUrl (must match complete-profile validation to avoid sending invalid redirect)
const ALLOWED_RETURN_PATHNAMES = ["/", "/app", "/app/pricing", "/profile", "/settings"];

function RedirectToCompleteProfileWithReturn() {
  const [location, navigate] = useLocation();
  useEffect(() => {
    const fullPath =
      typeof window !== "undefined"
        ? window.location.pathname + (window.location.search || "")
        : location || "/";
    const pathOnly = fullPath.split("?")[0];
    // Review fix: only pass fullPath if pathname is allowed; otherwise fallback to "/" to avoid open redirect
    const returnPath = ALLOWED_RETURN_PATHNAMES.includes(pathOnly) ? fullPath : "/";
    const returnUrl = encodeURIComponent(returnPath);
    navigate("/complete-profile?returnUrl=" + returnUrl);
  }, [navigate, location]);
  return null;
}

function Router() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const needsXUsername = isAuthenticated && user && !user.xUsername;

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
        {isLoading || !isAuthenticated ? (
          <>
            <Route path="/" component={Landing} />
            <Route path="/login" component={AuthPage} />
            <Route path="/reset-password" component={ResetPasswordPage} />
            <Route path="/pricing" component={PricingRedirect} />
            <Route path="/app/pricing" component={PricingRedirect} />
            <Route path="/privacy" component={PrivacyPolicy} />
            <Route path="/terms" component={TermsOfService} />
          </>
        ) : needsXUsername ? (
          <>
            <Route path="/" component={CompleteProfile} />
            <Route path="/complete-profile" component={CompleteProfile} />
            <Route path="/app" component={RedirectToCompleteProfile} />
            <Route path="/app/pricing" component={RedirectToCompleteProfileWithReturn} />
            <Route path="/profile" component={RedirectToCompleteProfile} />
            <Route path="/settings" component={RedirectToCompleteProfile} />
            <Route path="/login" component={AuthPage} />
            <Route path="/reset-password" component={ResetPasswordPage} />
          </>
        ) : (
          <>
            <Route path="/" component={Home} />
            <Route path="/app" component={AppPage} />
            <Route path="/app/pricing" component={AppPricingPage} />
            <Route path="/profile" component={ProfilePage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/login" component={AuthPage} />
            <Route path="/pricing" component={PricingRedirect} />
            <Route path="/privacy" component={PrivacyPolicy} />
            <Route path="/terms" component={TermsOfService} />
          </>
        )}
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
