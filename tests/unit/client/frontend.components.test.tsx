import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CookieBanner } from "@/components/cookie-banner";
import { OfflineBanner } from "@/components/offline-banner";
import { renderWithProviders } from "../../helpers/client/renderWithProviders";

const setLocationMock = vi.hoisted(() => vi.fn());
const openExtensionGuideMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      firstName: "Test",
      lastName: "User",
      email: "test@example.com",
      authProviders: ["local"],
    },
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<any>("wouter");
  return {
    ...actual,
    useLocation: () => ["/app", setLocationMock],
  };
});

vi.mock("@/contexts/extension-guide-context", () => ({
  useExtensionGuide: () => ({ openExtensionGuide: openExtensionGuideMock }),
}));

vi.mock("@/lib/queryClient", async () => {
  const actual = await vi.importActual<any>("@/lib/queryClient");
  return { ...actual, apiRequest: vi.fn(async () => ({ ok: true, json: async () => ({}) })) };
});

import { AppHeader } from "@/components/app-header";

describe("frontend component regressions", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocationMock.mockClear();
    openExtensionGuideMock.mockClear();
  });

  it("cookie banner persists choice and hides", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CookieBanner />);
    expect(screen.getByRole("dialog", { name: "Cookie notice" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(localStorage.getItem("cookieConsent")).toBe("accepted");
    expect(screen.queryByRole("dialog", { name: "Cookie notice" })).not.toBeInTheDocument();
  });

  it("offline banner reacts to online/offline events", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });
    const { rerender } = renderWithProviders(<OfflineBanner />);
    expect(screen.queryByText(/You appear to be offline/i)).not.toBeInTheDocument();

    Object.defineProperty(window.navigator, "onLine", { value: false, writable: true, configurable: true });
    fireEvent(window, new Event("offline"));
    rerender(<OfflineBanner />);
    await waitFor(() => {
      expect(screen.getByText(/You appear to be offline/i)).toBeInTheDocument();
    });

    Object.defineProperty(window.navigator, "onLine", { value: true, writable: true, configurable: true });
    fireEvent(window, new Event("online"));
    rerender(<OfflineBanner />);
    await waitFor(() => {
      expect(screen.queryByText(/You appear to be offline/i)).not.toBeInTheDocument();
    });
  });

  it("app header renders nav actions and routes extension instructions", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();
    renderWithProviders(<AppHeader />);

    expect(screen.getByTestId("button-nav-home")).toBeInTheDocument();
    expect(screen.getByTestId("button-nav-pricing")).toBeInTheDocument();

    await user.click(screen.getByTestId("button-nav-extension"));
    expect(openSpy).toHaveBeenCalled();

    await user.click(screen.getByTestId("button-nav-extension-instructions"));
    expect(openExtensionGuideMock).toHaveBeenCalled();
    expect(setLocationMock).toHaveBeenCalledWith("/app");
  });
});
