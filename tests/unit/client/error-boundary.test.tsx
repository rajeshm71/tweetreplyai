import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const authState = vi.hoisted(() => ({
  user: { id: "u1", xUsername: "xuser" } as any,
  isAuthenticated: true,
  isLoading: false,
}));

const captureExceptionMock = vi.hoisted(() => vi.fn());

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
    componentDidCatch(error: Error) {
      captureExceptionMock(error);
    }
    render() {
      if (this.state.hasError) {
        return this.props.fallback({ error: new Error("boom"), resetError: () => {} });
      }
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
vi.mock("@/pages/settings", () => ({
  default: () => {
    throw new Error("Settings crashed");
  },
}));
vi.mock("@/pages/privacy", () => ({ default: () => <h1>PrivacyPage</h1> }));
vi.mock("@/pages/terms", () => ({ default: () => <h1>TermsPage</h1> }));
vi.mock("@/pages/complete-profile", () => ({ default: () => <h1>CompleteProfilePage</h1> }));
vi.mock("@/pages/reset-password", () => ({ default: () => <h1>ResetPasswordPage</h1> }));
vi.mock("@/pages/admin-ops", () => ({ default: () => <h1>AdminPage</h1> }));
vi.mock("@/pages/not-found", () => ({ default: () => <h1>NotFoundPage</h1> }));

import App from "@/App";

describe("App error boundary", () => {
  beforeEach(() => {
    captureExceptionMock.mockClear();
    window.history.replaceState({}, "", "/settings");
  });

  it("shows fallback and captures exception", async () => {
    render(<App />);
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(captureExceptionMock).toHaveBeenCalled();
  });

  it("reload button triggers window reload", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      writable: true,
    });
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalled();
  });
});
