import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(__dirname, "../../..");

function readRootFile(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/\r\n/g, "\n");
}

describe("extension mirror drift guard", () => {
  it("keeps critical composer helper mirrored in extension-build", () => {
    const source = readRootFile("extension/content/helpers/composer-text.js");
    const mirrored = readRootFile("extension-build/content/helpers/composer-text.js");
    expect(mirrored).toBe(source);
  });
});
