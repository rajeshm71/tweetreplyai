import { describe, expect, it } from "vitest";

// [SMOKE] T3 — import-only test; Groq client init is side-effectful and requires a live API key
describe("[SMOKE] Groq Service", () => {
  it("module loads", async () => {
    const mod = await import("../../../server/services/groq");
    expect(mod).toBeDefined();
  });
});
