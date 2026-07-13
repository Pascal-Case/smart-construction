import { describe, expect, it } from "vitest";

import { ContractLineBillingMethod } from "@/generated/prisma/client";
import {
  buildContractRevenueDrafts,
  buildGenerationRows,
  countGenerationActions,
  type ContractRevenueExisting,
  type ExpectedRevenueContract,
} from "@/lib/revenues/expected";

const contract: ExpectedRevenueContract = {
  id: "contract-1",
  title: "안전용품 공급",
  siteId: "site-1",
  lines: [{
    id: "line-1",
    billingMethod: ContractLineBillingMethod.MONTHLY_RECURRING,
    itemId: "item-1",
    description: "월 공급",
    quantity: 2,
    unit: "EA",
    standardSalesPriceSnapshot: 100_000,
    appliedSalesPrice: 100_000,
    standardCostPriceSnapshot: 70_000,
    appliedCostPrice: 70_000,
    priceOverrideReason: null,
    revenueStartDate: new Date("2026-07-01T00:00:00.000Z"),
    revenueEndDate: new Date("2026-07-31T00:00:00.000Z"),
    item: { name: "안전모" },
  }],
};

function existing(overrides: Partial<ContractRevenueExisting> = {}): ContractRevenueExisting {
  const draft = buildContractRevenueDrafts(contract)[0];
  return {
    id: "revenue-1",
    version: 1,
    status: "DRAFT",
    cancelReason: null,
    generatedKey: draft.generatedKey,
    siteId: draft.siteId,
    itemId: draft.itemId,
    title: draft.title,
    description: draft.description,
    quantity: draft.quantity,
    unit: draft.unit,
    standardSalesPriceSnapshot: draft.standardSalesPriceSnapshot,
    appliedSalesPrice: draft.appliedSalesPrice,
    salesAmount: draft.salesAmount,
    prorationDays: draft.prorationDays,
    daysInMonth: draft.allocationBaseDays,
    standardCostPriceSnapshot: draft.standardCostPriceSnapshot,
    appliedCostPrice: draft.appliedCostPrice,
    costAmount: draft.costAmount,
    priceOverrideReason: draft.priceOverrideReason,
    revenueDate: draft.revenueDate,
    servicePeriodStart: draft.servicePeriodStart,
    servicePeriodEnd: draft.servicePeriodEnd,
    ...overrides,
  };
}

describe("expected contract revenues", () => {
  it("계약 품목을 기존 generated key와 금액 규칙으로 변환한다", () => {
    expect(buildContractRevenueDrafts(contract)).toMatchObject([{
      generatedKey: "line-1:2026-07",
      siteId: "site-1",
      contractId: "contract-1",
      contractLineId: "line-1",
      itemId: "item-1",
      title: "안전용품 공급 - 안전모",
      billingMethod: ContractLineBillingMethod.MONTHLY_RECURRING,
      salesAmount: 200_000,
      costAmount: 140_000,
    }]);
  });

  it("월청구 계약 품목은 같은 generated key 규칙으로 매월 전액 초안을 만든다", () => {
    const monthly = {
      ...contract,
      lines: [{
        ...contract.lines[0],
        revenueStartDate: new Date("2026-07-01T00:00:00.000Z"),
        revenueEndDate: new Date("2026-08-31T00:00:00.000Z"),
      }],
    };

    expect(buildContractRevenueDrafts(monthly).map((row) => [row.generatedKey, row.salesAmount, row.costAmount])).toEqual([
      ["line-1:2026-07", 200_000, 140_000],
      ["line-1:2026-08", 200_000, 140_000],
    ]);
  });

  it("CREATE, UPDATE, PROTECTED, CANCEL 판정을 한 순수 함수에서 만든다", () => {
    const draft = buildContractRevenueDrafts(contract)[0];
    const create = buildGenerationRows([draft], []);
    const update = buildGenerationRows([draft], [existing({ salesAmount: 1 })]);
    const protectedRows = buildGenerationRows([draft], [existing({ status: "CONFIRMED", salesAmount: 1 })]);
    const cancel = buildGenerationRows([], [existing()]);

    expect(create[0].action).toBe("CREATE");
    expect(update[0].action).toBe("UPDATE");
    expect(protectedRows[0]).toMatchObject({ action: "PROTECTED", reason: "확정 매출" });
    expect(cancel[0].action).toBe("CANCEL");
    expect(countGenerationActions([...create, ...update, ...protectedRows, ...cancel]))
      .toEqual({ create: 1, update: 1, unchanged: 0, protected: 1, cancel: 1 });
  });

  it("사용자 취소 매출은 재생성하고 동일 초안은 변경하지 않는다", () => {
    const draft = buildContractRevenueDrafts(contract)[0];
    expect(buildGenerationRows([draft], [existing({ status: "CANCELED", cancelReason: "사용자 취소" })])[0].action)
      .toBe("RECREATE");
    expect(buildGenerationRows([draft], [existing()])[0].action).toBe("UNCHANGED");
  });
});
