import { describe, expect, it } from "vitest";

// [SMOKE] T3 — import-only test; checkQuality behavioral tests should be added
describe("[SMOKE] Quality Checker Service", () => {
  it("module loads", async () => {
    const mod = await import("../../../server/services/quality-checker");
    expect(mod.qualityChecker).toBeDefined();
  });
});

