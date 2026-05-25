import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const analysisAgentsPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../server/services/linkedin-analysis-agents.ts",
);

describe("LinkedIn analysis agents enriched guidance", () => {
  it("does not instruct sharing related experience in contentTypeGuidance", () => {
    const source = readFileSync(analysisAgentsPath, "utf8");
    expect(source).not.toContain("share related experience");
    expect(source).not.toContain("based on your experience");
    expect(source).not.toContain("add your perspective");
    expect(source).toContain('short agreement ("True", "Exactly", "Yeah", "Same here") is fine');
  });
});
