import { describe, expect, it } from "vitest";

// [SMOKE] T3 — import-only test; installConsoleGate suppression behavioral tests should be added
describe("[SMOKE] Extension Console Gate", () => {
  it("module loads", async () => {
    const mod = await import("../../../extension/utils/consoleGate.js");
    expect(mod.installConsoleGate).toBeDefined();
  });
});

