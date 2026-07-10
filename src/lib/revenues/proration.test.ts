import { describe, expect, it } from "vitest";

import { buildLineRevenueDrafts, proratedAmount } from "@/lib/revenues/proration";

describe("revenue proration", () => {
  it("시작일과 종료일을 포함해 3월 12일, 4월 10일을 계산한다", () => {
    const rows = buildLineRevenueDrafts({ id: "line-1", quantity: 1, appliedSalesPrice: 310000, appliedCostPrice: 0, revenueStartDate: new Date("2026-03-20T00:00:00Z"), revenueEndDate: new Date("2026-04-10T00:00:00Z") });
    expect(rows.map((row) => [row.prorationDays, row.daysInMonth, row.salesAmount])).toEqual([[12, 31, 120000], [10, 30, 103333]]);
  });

  it("윤년 2월과 원 단위 반올림을 반영한다", () => {
    const row = buildLineRevenueDrafts({ id: "line-2", quantity: 1, appliedSalesPrice: 290000, appliedCostPrice: 0, revenueStartDate: new Date("2028-02-15T00:00:00Z"), revenueEndDate: new Date("2028-02-29T00:00:00Z") })[0];
    expect([row.prorationDays, row.daysInMonth, row.salesAmount]).toEqual([15, 29, 150000]);
    expect(proratedAmount(3, 100, 1, 7)).toBe(43);
  });
});
