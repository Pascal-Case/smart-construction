import { describe, expect, it } from "vitest";

import { ContractLineBillingMethod } from "@/generated/prisma/client";
import { buildLineRevenueDrafts } from "@/lib/revenues/proration";

describe("revenue proration", () => {
  it("7월 31일부터 8월 1일까지의 계약 총액을 이틀에 균등 배분한다", () => {
    const rows = buildLineRevenueDrafts({ id: "line-1", billingMethod: ContractLineBillingMethod.LEGACY_TOTAL, quantity: 5, appliedSalesPrice: 10000, appliedCostPrice: 4000, revenueStartDate: new Date("2026-07-31T00:00:00Z"), revenueEndDate: new Date("2026-08-01T00:00:00Z") });

    expect(rows.map((row) => [row.prorationDays, row.allocationBaseDays, row.salesAmount, row.costAmount]))
      .toEqual([[1, 2, 25000, 10000], [1, 2, 25000, 10000]]);
    expect(rows.reduce((sum, row) => sum + row.salesAmount, 0)).toBe(50000);
  });

  it("반올림 잔액을 마지막 월에 반영해 월 합계가 계약 총액과 일치한다", () => {
    const rows = buildLineRevenueDrafts({ id: "line-2", billingMethod: ContractLineBillingMethod.LEGACY_TOTAL, quantity: 1, appliedSalesPrice: 100, appliedCostPrice: 0, revenueStartDate: new Date("2026-01-31T00:00:00Z"), revenueEndDate: new Date("2026-02-02T00:00:00Z") });

    expect(rows.map((row) => [row.prorationDays, row.allocationBaseDays, row.salesAmount]))
      .toEqual([[1, 3, 33], [2, 3, 67]]);
    expect(rows.reduce((sum, row) => sum + row.salesAmount, 0)).toBe(100);
  });

  it("기존 총액 배분은 2개월을 초과해도 현재 누적 반올림 규칙을 그대로 유지한다", () => {
    const rows = buildLineRevenueDrafts({
      id: "legacy-long",
      billingMethod: ContractLineBillingMethod.LEGACY_TOTAL,
      quantity: 1,
      appliedSalesPrice: 1000,
      appliedCostPrice: 470,
      revenueStartDate: new Date("2026-01-15T00:00:00Z"),
      revenueEndDate: new Date("2026-03-02T00:00:00Z"),
    });

    expect(rows.map((row) => [row.prorationDays, row.allocationBaseDays, row.salesAmount, row.costAmount]))
      .toEqual([[17, 47, 362, 170], [28, 47, 595, 280], [2, 47, 43, 20]]);
  });

  it("월청구는 포함된 36개월마다 수량 곱 월 판매가와 월 원가 전액을 생성한다", () => {
    const rows = buildLineRevenueDrafts({
      id: "monthly-36",
      billingMethod: ContractLineBillingMethod.MONTHLY_RECURRING,
      quantity: 2,
      appliedSalesPrice: 20_000,
      appliedCostPrice: 12_000,
      revenueStartDate: new Date("2026-01-01T00:00:00Z"),
      revenueEndDate: new Date("2028-12-31T00:00:00Z"),
    });

    expect(rows).toHaveLength(36);
    expect(rows.every((row) => row.salesAmount === 40_000 && row.costAmount === 24_000)).toBe(true);
    expect(rows[0]).toMatchObject({ generatedKey: "monthly-36:2026-01", billingMethod: ContractLineBillingMethod.MONTHLY_RECURRING });
    expect(rows.at(-1)).toMatchObject({ generatedKey: "monthly-36:2028-12" });
  });

  it("일할청구는 두 달의 포함 일수로 판매가와 원가 총액을 같은 구간에 배분한다", () => {
    const rows = buildLineRevenueDrafts({
      id: "prorated-two-months",
      billingMethod: ContractLineBillingMethod.PRORATED_TOTAL,
      quantity: 2,
      appliedSalesPrice: 20_000,
      appliedCostPrice: 10_000,
      revenueStartDate: new Date("2026-01-15T00:00:00Z"),
      revenueEndDate: new Date("2026-02-08T00:00:00Z"),
    });

    expect(rows.map((row) => [row.generatedKey, row.prorationDays, row.salesAmount, row.costAmount])).toEqual([
      ["prorated-two-months:2026-01", 17, 27_200, 13_600],
      ["prorated-two-months:2026-02", 8, 12_800, 6_400],
    ]);
    expect(rows.reduce((sum, row) => sum + row.salesAmount, 0)).toBe(40_000);
    expect(rows.reduce((sum, row) => sum + row.costAmount, 0)).toBe(20_000);
  });
});
