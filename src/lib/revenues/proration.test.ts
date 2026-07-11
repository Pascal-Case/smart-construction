import { describe, expect, it } from "vitest";

import { buildLineRevenueDrafts } from "@/lib/revenues/proration";

describe("revenue proration", () => {
  it("7월 31일부터 8월 1일까지의 계약 총액을 이틀에 균등 배분한다", () => {
    const rows = buildLineRevenueDrafts({ id: "line-1", quantity: 5, appliedSalesPrice: 10000, appliedCostPrice: 4000, revenueStartDate: new Date("2026-07-31T00:00:00Z"), revenueEndDate: new Date("2026-08-01T00:00:00Z") });

    expect(rows.map((row) => [row.prorationDays, row.allocationBaseDays, row.salesAmount, row.costAmount]))
      .toEqual([[1, 2, 25000, 10000], [1, 2, 25000, 10000]]);
    expect(rows.reduce((sum, row) => sum + row.salesAmount, 0)).toBe(50000);
  });

  it("반올림 잔액을 마지막 월에 반영해 월 합계가 계약 총액과 일치한다", () => {
    const rows = buildLineRevenueDrafts({ id: "line-2", quantity: 1, appliedSalesPrice: 100, appliedCostPrice: 0, revenueStartDate: new Date("2026-01-31T00:00:00Z"), revenueEndDate: new Date("2026-02-02T00:00:00Z") });

    expect(rows.map((row) => [row.prorationDays, row.allocationBaseDays, row.salesAmount]))
      .toEqual([[1, 3, 33], [2, 3, 67]]);
    expect(rows.reduce((sum, row) => sum + row.salesAmount, 0)).toBe(100);
  });
});
