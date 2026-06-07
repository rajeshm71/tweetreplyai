// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  createModelSelectElement,
  getModelSelectOptgroupLabel,
  populateModelSelectFromUsage,
} from "../../../extension/content/helpers/model-select.js";

describe("model-select helper", () => {
  it("maps tier ids to optgroup labels", () => {
    expect(getModelSelectOptgroupLabel("auto")).toBe("Auto");
    expect(getModelSelectOptgroupLabel("primary")).toBe("Tier 1");
    expect(getModelSelectOptgroupLabel("secondary")).toBe("Tier 2");
    expect(getModelSelectOptgroupLabel("tertiary")).toBe("Groq");
  });

  it("populateModelSelectFromUsage builds optgroups and restores saved key", () => {
    const select = document.createElement("select");
    populateModelSelectFromUsage(
      select,
      [
        { key: "auto", name: "Auto", tierId: "auto" },
        { key: "gpt-4.1-mini", name: "GPT-4.1 Mini", tierId: "secondary" },
      ],
      "gpt-4.1-mini",
    );

    expect(select.querySelector('optgroup[label="Tier 2"] option[value="gpt-4.1-mini"]')).toBeTruthy();
    expect(select.value).toBe("gpt-4.1-mini");
  });

  it("createModelSelectElement falls back to Auto when chrome.storage is unavailable", () => {
    const select = createModelSelectElement({
      selectableModels: [{ key: "auto", name: "Auto", tierId: "auto" }],
      className: "test-model-select",
    });

    expect(select.className).toBe("test-model-select");
    expect(select.value).toBe("auto");
    expect(select.querySelector('option[value="auto"]')).toBeTruthy();
  });
});
