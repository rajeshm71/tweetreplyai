import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const analysisAgentsPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../server/services/linkedin-analysis-agents.ts",
);

describe("LinkedIn analysis agents enriched guidance", () => {
  it("uses positive reply guidance about original wording", () => {
    const source = readFileSync(analysisAgentsPath, "utf8");
    expect(source).not.toContain("share related experience");
    expect(source).not.toContain("based on your experience");
    expect(source).toContain("not your own experience, jobs, or accomplishments");
    expect(source).not.toContain("specific detail from the post");
  });
});
