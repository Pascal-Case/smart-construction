import { describe, expect, it } from "vitest";

import { isInteractiveRowTarget } from "@/lib/row-selection";

describe("isInteractiveRowTarget", () => {
  it("ignores targets inside interactive controls", () => {
    const target = { closest: () => ({}) } as unknown as EventTarget;

    expect(isInteractiveRowTarget(target)).toBe(true);
  });

  it("allows ordinary row content", () => {
    const target = { closest: () => null } as unknown as EventTarget;

    expect(isInteractiveRowTarget(target)).toBe(false);
  });

  it("handles non-element event targets", () => {
    expect(isInteractiveRowTarget(null)).toBe(false);
    expect(isInteractiveRowTarget({} as EventTarget)).toBe(false);
  });
});
