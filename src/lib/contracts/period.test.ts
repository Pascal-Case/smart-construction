import { describe, expect, it } from "vitest";

import { deriveContractPeriod } from "@/lib/contracts/period";
import { contractInputSchema } from "@/lib/contracts/schemas";

const lines = [
  { itemId: "item-1", quantity: 1, appliedSalesPrice: 100, appliedCostPrice: 50, revenueStartDate: "2026-03-20", revenueEndDate: "2026-04-10" },
  { itemId: "item-2", quantity: 2, appliedSalesPrice: 200, appliedCostPrice: 80, revenueStartDate: "2026-02-15", revenueEndDate: "2026-06-30" },
];

describe("contract period", () => {
  it("품목별 매출기간의 최소 시작일과 최대 종료일을 계약기간으로 산정한다", () => {
    expect(deriveContractPeriod(lines)).toEqual({ startDate: "2026-02-15", endDate: "2026-06-30" });
  });

  it("계약 헤더 기간을 받지 않고 이전 요청의 헤더 기간도 안전하게 무시한다", () => {
    const result = contractInputSchema.parse({
      siteId: "site-1",
      title: "계약",
      startDate: "2000-01-01",
      endDate: "2100-12-31",
      status: "ACTIVE",
      lines,
    });

    expect(result).not.toHaveProperty("startDate");
    expect(result).not.toHaveProperty("endDate");
  });
});
