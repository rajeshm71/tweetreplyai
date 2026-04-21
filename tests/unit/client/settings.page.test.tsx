import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, makeTestQueryClient } from "../../helpers/client/renderWithProviders";

const authState = vi.hoisted(() => ({
  user: null as any,
  isAuthenticated: false,
  isLoading: false,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/app-header", () => ({
  AppHeader: () => <div data-testid="app-header">Header</div>,
}));

const apiRequestMock = vi.hoisted(() => vi.fn(async () => ({
  ok: true,
  json: async () => ({}),
})));

vi.mock("@/lib/queryClient", async () => {
  const actual = await vi.importActual<any>("@/lib/queryClient");
  return {
    ...actual,
    apiRequest: apiRequestMock,
  };
});

import SettingsPage from "@/pages/settings";

describe("Settings page stability", () => {
  beforeEach(() => {
    authState.user = {
      id: "user-1",
      email: "user@example.com",
      authProviders: ["local"],
      emailVerified: true,
      xUsername: "xuser",
    };
    authState.isAuthenticated = true;
    authState.isLoading = false;
    apiRequestMock.mockClear();
  });

  function primeSettingsQueries(client: ReturnType<typeof makeTestQueryClient>) {
    client.setQueryData(["/api/user/preferences"], { promptStyleEnabled: true });
    client.setQueryData(["/api/user/email-preferences"], {
      usageAlerts: true,
      productTips: true,
      marketing: false,
    });
    client.setQueryData(["/api/subscription"], {
      subscription: null,
      planDetails: null,
      usageStatus: { planCode: "free", used: 0, limit: 10, status: "ok" },
    });
  }

  it("handles loading -> loaded transition without crashing", async () => {
    authState.isLoading = true;
    const queryClient = makeTestQueryClient();
    const first = renderWithProviders(<SettingsPage />, queryClient);
    expect(document.querySelector(".animate-spin")).toBeTruthy();

    authState.isLoading = false;
    primeSettingsQueries(queryClient);
    first.unmount();
    renderWithProviders(<SettingsPage />, queryClient);

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByTestId("card-notifications")).toBeInTheDocument();
  });

  it("supports local and non-local authProviders variants", async () => {
    const queryClient = makeTestQueryClient();
    primeSettingsQueries(queryClient);
    const first = renderWithProviders(<SettingsPage />, queryClient);

    expect((await screen.findAllByText(/^Change password$/i)).length).toBeGreaterThan(0);
    authState.user = { ...authState.user, authProviders: ["google"] };
    first.unmount();
    renderWithProviders(<SettingsPage />, queryClient);
    expect(screen.queryAllByText(/^Change password$/i).length).toBe(0);
  });

  it("updates toggle and invokes preferences API mutation", async () => {
    const queryClient = makeTestQueryClient();
    primeSettingsQueries(queryClient);
    renderWithProviders(<SettingsPage />, queryClient);
    await screen.findByRole("heading", { name: "Settings" });

    const user = userEvent.setup();
    const promptSwitch = screen.getByTestId("switch-prompt-style-enabled");
    await user.click(promptSwitch);

    expect(apiRequestMock).toHaveBeenCalledWith(
      "PUT",
      "/api/user/preferences",
      expect.objectContaining({ promptStyleEnabled: false }),
    );
  });

  it("delete account action requires DELETE confirmation", async () => {
    const queryClient = makeTestQueryClient();
    primeSettingsQueries(queryClient);
    renderWithProviders(<SettingsPage />, queryClient);
    await screen.findByRole("heading", { name: "Settings" });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("button-delete-account"));
    const confirmAction = await screen.findByRole("button", { name: /Delete Account/i });
    expect(confirmAction).toBeDisabled();

    const input = screen.getByTestId("input-delete-confirm");
    await user.type(input, "DELETE");
    expect(confirmAction).not.toBeDisabled();
  });
});
