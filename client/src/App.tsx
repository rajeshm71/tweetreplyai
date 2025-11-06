import { Suspense, lazy } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

// Sprint 4: Lazy load routes for code-splitting
const Landing = lazy(() => import("@/pages/landing"));
const Home = lazy(() => import("@/pages/home"));
const Pricing = lazy(() => import("@/pages/pricing"));
const AppPage = lazy(() => import("@/pages/app"));
const AuthPage = lazy(() => import("@/pages/auth"));
const ProfilePage = lazy(() => import("@/pages/profile"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const PrivacyPolicy = lazy(() => import("@/pages/privacy"));
const TermsOfService = lazy(() => import("@/pages/terms"));
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

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
        {isLoading || !isAuthenticated ? (
          <>
            <Route path="/" component={Landing} />
            <Route path="/login" component={AuthPage} />
            <Route path="/pricing" component={Pricing} />
            <Route path="/privacy" component={PrivacyPolicy} />
            <Route path="/terms" component={TermsOfService} />
          </>
        ) : (
          <>
            <Route path="/" component={Home} />
            <Route path="/app" component={AppPage} />
            <Route path="/profile" component={ProfilePage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/login" component={AuthPage} />
            <Route path="/pricing" component={Pricing} />
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
