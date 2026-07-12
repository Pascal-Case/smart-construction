import { describe, expect, it } from "vitest";

import { isReplaceableInvoiceStatus, sameRevenueSet, sameRevenueState } from "@/lib/invoices/replacement-policy";

describe("invoice replacement policy", () => {
  it("allows only the current issued document to start a replacement", () => {
    expect(isReplaceableInvoiceStatus("ISSUED")).toBe(true);
    expect(isReplaceableInvoiceStatus("DRAFT")).toBe(false);
    expect(isReplaceableInvoiceStatus("SUPERSEDED")).toBe(false);
  });

  it("compares previewed revenue ids without depending on order", () => {
    expect(sameRevenueSet(["r1", "r2"], ["r2", "r1"])).toBe(true);
    expect(sameRevenueSet(["r1", "r2"], ["r1", "r3"])).toBe(false);
    expect(sameRevenueSet(["r1", "r1"], ["r1"])).toBe(false);
  });

  it("같은 합계라도 매출 집합이 다르면 다른 마감 상태로 본다", () => {
    expect(sameRevenueState(["r1", "r2"], 300, ["r2", "r1"], 300)).toBe(true);
    expect(sameRevenueState(["r1", "r2"], 300, ["r3", "r1"], 300)).toBe(false);
    expect(sameRevenueState(["r1"], 300, ["r1"], 301)).toBe(false);
  });
});
