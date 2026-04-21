import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../helpers/client/renderWithProviders";

const navigateMock = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  user: { id: "u1", xUsername: "xuser" } as any,
  isAuthenticated: true,
  isLoading: false,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<any>("wouter");
  return {
    ...actual,
    useLocation: () => [window.location.pathname + window.location.search, navigateMock],
  };
});

vi.mock("@/lib/queryClient", async () => {
  const actual = await vi.importActual<any>("@/lib/queryClient");
  return {
    ...actual,
    apiRequest: vi.fn(),
    queryClient: { invalidateQueries: vi.fn() },
  };
});

import AuthPage from "@/pages/auth";

describe("Auth returnUrl safety", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("navigates to allowed returnUrl path", async () => {
    window.history.replaceState({}, "", "/login?returnUrl=%2Fsettings");
    renderWithProviders(<AuthPage />);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/settings"));
  });

  it("falls back to root for disallowed returnUrl path", async () => {
    window.history.replaceState({}, "", "/login?returnUrl=%2Fadmin");
    renderWithProviders(<AuthPage />);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/"));
  });
});
