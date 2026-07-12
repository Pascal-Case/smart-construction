import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

import {
  DESIGN_THEME_ATTRIBUTE,
  DESIGN_THEME_BOOTSTRAP_SCRIPT,
  DESIGN_THEME_STORAGE_KEY,
  normalizeDesignTheme,
} from "@/lib/design-theme";

describe("design theme", () => {
  it("accepts only the supported design themes", () => {
    expect(normalizeDesignTheme("sagwa")).toBe("sagwa");
    expect(normalizeDesignTheme("default")).toBe("default");
    expect(normalizeDesignTheme("apple")).toBe("default");
    expect(normalizeDesignTheme(null)).toBe("default");
  });

  it("applies the saved sagwa theme before hydration", () => {
    const setAttribute = vi.fn();
    const removeAttribute = vi.fn();

    runBootstrap("sagwa", setAttribute, removeAttribute);

    expect(setAttribute).toHaveBeenCalledWith(DESIGN_THEME_ATTRIBUTE, "sagwa");
    expect(removeAttribute).not.toHaveBeenCalled();
  });

  it("keeps the current design for missing or invalid preferences", () => {
    for (const value of [null, "default", "apple"]) {
      const setAttribute = vi.fn();
      const removeAttribute = vi.fn();

      runBootstrap(value, setAttribute, removeAttribute);

      expect(removeAttribute).toHaveBeenCalledWith(DESIGN_THEME_ATTRIBUTE);
      expect(setAttribute).not.toHaveBeenCalled();
    }
  });
});

function runBootstrap(
  storedValue: string | null,
  setAttribute: ReturnType<typeof vi.fn>,
  removeAttribute: ReturnType<typeof vi.fn>,
) {
  runInNewContext(DESIGN_THEME_BOOTSTRAP_SCRIPT, {
    document: { documentElement: { removeAttribute, setAttribute } },
    localStorage: {
      getItem(key: string) {
        expect(key).toBe(DESIGN_THEME_STORAGE_KEY);
        return storedValue;
      },
    },
  });
}
