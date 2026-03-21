import { describe, expect, it } from "vitest";

// [SMOKE] T3 — import-only test; verifies module loads without throwing
describe("[SMOKE] Server Constants", () => {
  it("module loads", async () => {
    const mod = await import("../../../server/config/constants");
    expect(mod).toBeDefined();
  });
});
