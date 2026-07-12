import { describe, expect, it } from "vitest";

import { isReplaceableInvoiceStatus, replacementRequiredForPeriod, sameRevenueSet, sameRevenueState } from "@/lib/invoices/replacement-policy";

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

  it("여러 현재 발행본의 합집합을 최신 마감 회차와 비교한다", () => {
    const cycles = [{ revenueEntryIds: ["r1", "r2"], totalSalesAmount: 300 }];
    expect(replacementRequiredForPeriod(cycles, [
      { revenueEntryIds: ["r1"], subtotal: 100 },
      { revenueEntryIds: ["r2"], subtotal: 200 },
    ])).toBe(false);
    expect(replacementRequiredForPeriod(cycles, [
      { revenueEntryIds: ["r1"], subtotal: 300 },
    ])).toBe(true);
  });
});
