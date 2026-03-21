import { describe, expect, it } from "vitest";

// [SMOKE] T3 — import-only test; OpenAI client init requires a live API key
describe("[SMOKE] OpenAI Service", () => {
  it("module loads", async () => {
    const mod = await import("../../../server/services/openai");
    expect(mod).toBeDefined();
  });
});

