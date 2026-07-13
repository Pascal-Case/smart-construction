import { describe, expect, it } from "vitest";

import { ContractLineBillingMethod } from "@/generated/prisma/client";
import { buildContractImpact, enumerateMonths } from "@/lib/contracts/impact";

describe("contract impact", () => {
  it("계약기간에 포함된 월을 양 끝 포함으로 열거한다", () => {
    expect(enumerateMonths("2026-03-20", "2026-05-01")).toEqual(["2026-03", "2026-04", "2026-05"]);
  });

  it("변경·삭제된 행의 영향 월을 합산한다", () => {
    const before = { siteId: "site-1", startDate: new Date("2026-03-01T00:00:00Z"), endDate: new Date("2026-05-31T00:00:00Z"), status: "ACTIVE", lines: [
      { id: "line-1", itemId: "item-1", billingMethod: ContractLineBillingMethod.LEGACY_TOTAL, quantity: 1, appliedSalesPrice: 100, appliedCostPrice: 50, revenueStartDate: new Date("2026-03-20T00:00:00Z"), revenueEndDate: new Date("2026-04-10T00:00:00Z"), isActive: true },
    ] };
    const impact = buildContractImpact(before, { siteId: "site-1", title: "계약", status: "ACTIVE", lines: [
      { id: "line-1", itemId: "item-1", billingMethod: ContractLineBillingMethod.LEGACY_TOTAL, quantity: 2, appliedSalesPrice: 100, appliedCostPrice: 50, revenueStartDate: "2026-03-20", revenueEndDate: "2026-05-10" },
    ] });
    expect(impact.modifiedLines).toBe(1);
    expect(impact.affectedMonths).toEqual(["2026-03", "2026-04", "2026-05"]);
  });

  it("청구 방식만 바뀌어도 이전·신규 기간의 영향 월을 포함한다", () => {
    const before = { siteId: "site-1", startDate: new Date("2026-01-15T00:00:00Z"), endDate: new Date("2026-02-08T00:00:00Z"), status: "ACTIVE", lines: [
      { id: "line-1", itemId: "item-1", billingMethod: ContractLineBillingMethod.LEGACY_TOTAL, quantity: 1, appliedSalesPrice: 100, appliedCostPrice: 50, revenueStartDate: new Date("2026-01-15T00:00:00Z"), revenueEndDate: new Date("2026-02-08T00:00:00Z"), isActive: true },
    ] };
    const impact = buildContractImpact(before, { siteId: "site-1", title: "계약", status: "ACTIVE", lines: [
      { id: "line-1", itemId: "item-1", billingMethod: ContractLineBillingMethod.MONTHLY_RECURRING, quantity: 1, appliedSalesPrice: 100, appliedCostPrice: 50, revenueStartDate: new Date("2026-01-01T00:00:00Z"), revenueEndDate: new Date("2026-02-28T00:00:00Z") },
    ] });

    expect(impact.modifiedLines).toBe(1);
    expect(impact.affectedMonths).toEqual(["2026-01", "2026-02"]);
    expect(impact.requiresConfirmation).toBe(true);
  });
});
