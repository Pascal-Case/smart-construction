import { describe, expect, it } from "vitest";

import { contractCategoryUpdateSchema } from "@/lib/contract-categories/schemas";

describe("contract category update schema", () => {
  it("allows renaming and activation changes as independent operations", () => {
    expect(contractCategoryUpdateSchema.parse({ name: "새 구분", version: 1 })).toEqual({ name: "새 구분", version: 1 });
    expect(contractCategoryUpdateSchema.parse({ isActive: false, version: 2 })).toEqual({ isActive: false, version: 2 });
  });

  it("rejects a version-only update", () => {
    expect(contractCategoryUpdateSchema.safeParse({ version: 1 }).success).toBe(false);
  });
});
