import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const authState = vi.hoisted(() => ({
  user: null as any,
  isAuthenticated: false,
  isLoading: false,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/components/ui/toaster", () => ({ Toaster: () => null }));
vi.mock("@/components/ui/tooltip", () => ({ TooltipProvider: ({ children }: any) => <>{children}</> }));
vi.mock("@/contexts/extension-guide-context", () => ({
  ExtensionGuideProvider: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/components/cookie-banner", () => ({ CookieBanner: () => null }));
vi.mock("@/components/offline-banner", () => ({ OfflineBanner: () => null }));

vi.mock("@/lib/sentry", () => {
  const React = require("react");
  class TestBoundary extends React.Component<any, { hasError: boolean }> {
    constructor(props: any) {
      super(props);
      this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
      return { hasError: true };
    }
    render() {
      if (this.state.hasError) return this.props.fallback({ error: new Error("boom"), resetError: () => {} });
      return this.props.children;
    }
  }
  return {
    Sentry: { ErrorBoundary: TestBoundary },
    setSentryUser: vi.fn(),
  };
});

vi.mock("@/pages/landing", () => ({ default: () => <h1>LandingPage</h1> }));
vi.mock("@/pages/home", () => ({ default: () => <h1>HomePage</h1> }));
vi.mock("@/pages/app-pricing", () => ({ default: () => <h1>PricingPage</h1> }));
vi.mock("@/pages/auth", () => ({ default: () => <h1>AuthPage</h1> }));
vi.mock("@/pages/profile", () => ({ default: () => <h1>ProfilePage</h1> }));
vi.mock("@/pages/settings", () => ({ default: () => <h1>SettingsPage</h1> }));
vi.mock("@/pages/privacy", () => ({ default: () => <h1>PrivacyPage</h1> }));
vi.mock("@/pages/terms", () => ({ default: () => <h1>TermsPage</h1> }));
vi.mock("@/pages/complete-profile", () => ({ default: () => <h1>CompleteProfilePage</h1> }));
vi.mock("@/pages/reset-password", () => ({ default: () => <h1>ResetPasswordPage</h1> }));
vi.mock("@/pages/admin-ops", () => ({ default: () => <h1>AdminPage</h1> }));
vi.mock("@/pages/not-found", () => ({ default: () => <h1>NotFoundPage</h1> }));

import App from "@/App";

describe("App route smoke", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    authState.user = null;
    authState.isAuthenticated = false;
    authState.isLoading = false;
  });

  it("renders settings route for authenticated users", async () => {
    authState.user = { id: "u1", xUsername: "xuser" };
    authState.isAuthenticated = true;
    window.history.replaceState({}, "", "/settings");
    render(<App />);
    expect(await screen.findByText("SettingsPage")).toBeInTheDocument();
  });

  it("does not render private settings page for unauthenticated users", async () => {
    window.history.replaceState({}, "", "/settings");
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByText("SettingsPage")).not.toBeInTheDocument();
    });
  });

  it("redirects profile-incomplete users away from settings", async () => {
    authState.user = { id: "u1", xUsername: null };
    authState.isAuthenticated = true;
    window.history.replaceState({}, "", "/settings");
    render(<App />);
    expect(await screen.findByText("CompleteProfilePage")).toBeInTheDocument();
  });
});
