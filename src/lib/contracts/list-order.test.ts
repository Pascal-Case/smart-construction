import { describe, expect, it } from "vitest";

import { contractBaseAmount } from "@/lib/contracts/list-order";

describe("contract list order", () => {
  it("uses the same rounded active-line base amount shown in the table", () => {
    expect(contractBaseAmount([
      { quantity: 1.5, appliedSalesPrice: 101 },
      { quantity: 2, appliedSalesPrice: 50 },
    ])).toBe(252);
  });
});
