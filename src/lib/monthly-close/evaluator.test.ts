import { describe, expect, it } from "vitest";

import { evaluateSiteMonth } from "@/lib/monthly-close/evaluator";
import type { MonthCloseEvaluationInput } from "@/lib/monthly-close/types";

function baseInput(overrides: Partial<MonthCloseEvaluationInput> = {}): MonthCloseEvaluationInput {
  return {
    site: { id: "site-1", code: "S001", name: "강남 현장" },
    month: "2026-07",
    expectedContractRevenues: [{
      generatedKey: "line-1:2026-07",
      contractId: "contract-1",
      contractLineId: "line-1",
      itemId: "item-1",
      title: "안전모",
      quantity: 1,
      appliedSalesPrice: 100,
      salesAmount: 100,
    }],
    revenues: [{
      id: "contract-revenue-1",
      version: 1,
      revenueDate: "2026-07-01",
      sourceType: "CONTRACT",
      status: "CONFIRMED",
      generatedKey: "line-1:2026-07",
      contractId: "contract-1",
      contractLineId: "line-1",
      itemId: "item-1",
      title: "안전모",
      quantity: 1,
      appliedSalesPrice: 100,
      salesAmount: 100,
      costAmount: 70,
      priceOverrideReason: null,
    }],
    reviews: [],
    invoiceDocuments: [],
    latestCloseSnapshot: null,
    ...overrides,
  };
}

describe("monthly close evaluator", () => {
  it("설명 없는 계약 차이와 직접 입력, DRAFT를 차단한다", () => {
    const input = baseInput({
      revenues: [
        { ...baseInput().revenues[0], salesAmount: 90 },
        {
          id: "manual-1", version: 1, revenueDate: "2026-07-02", sourceType: "MANUAL", status: "CONFIRMED",
          generatedKey: null, contractId: null, contractLineId: null, itemId: null, title: "추가 운반비",
          quantity: null, appliedSalesPrice: null, salesAmount: 0, costAmount: null, priceOverrideReason: null,
        },
        {
          id: "draft-1", version: 1, revenueDate: "2026-07-03", sourceType: "ADJUSTMENT", status: "DRAFT",
          generatedKey: null, contractId: null, contractLineId: null, itemId: null, title: "조정",
          quantity: null, appliedSalesPrice: null, salesAmount: -10, costAmount: null, priceOverrideReason: "정산",
        },
      ],
    });

    const result = evaluateSiteMonth(input);
    expect(result.exceptions.map((item) => [item.kind, item.blocking])).toEqual(expect.arrayContaining([
      ["CONTRACT_DIFFERENCE", true],
      ["DIRECT_INPUT", true],
      ["DRAFT_REVENUE", true],
    ]));
    expect(result.canClose).toBe(false);
  });

  it("현재 fingerprint의 검토는 차이를 해제하지만 이전 fingerprint 검토는 해제하지 않는다", () => {
    const changed = baseInput({ revenues: [{ ...baseInput().revenues[0], salesAmount: 90 }] });
    const first = evaluateSiteMonth(changed);
    const difference = first.exceptions.find((item) => item.kind === "CONTRACT_DIFFERENCE")!;

    expect(evaluateSiteMonth({
      ...changed,
      reviews: [{ exceptionKey: difference.key, fingerprint: "stale", reason: "이전 검토" }],
    }).canClose).toBe(false);
    expect(evaluateSiteMonth({
      ...changed,
      reviews: [{ exceptionKey: difference.key, fingerprint: difference.fingerprint, reason: "단가 합의" }],
    }).canClose).toBe(true);
  });

  it("대체발행 이력과 단독 0원은 정보를 남기되 마감을 막지 않는다", () => {
    const result = evaluateSiteMonth(baseInput({
      expectedContractRevenues: [],
      revenues: [],
      invoiceDocuments: [
        { id: "invoice-old", status: "SUPERSEDED", revenueEntryIds: [], subtotal: 0 },
        { id: "invoice-current", status: "ISSUED", revenueEntryIds: [], subtotal: 0 },
      ],
    }));

    expect(result.exceptions.some((item) => item.kind === "INVOICE_HISTORY" && !item.blocking)).toBe(true);
    expect(result.canClose).toBe(true);
  });

  it("최신 마감 집합과 현재 유효본이 실제로 다를 때만 대체발행 필요로 표시한다", () => {
    const same = baseInput({
      latestCloseSnapshot: { revenueEntryIds: ["contract-revenue-1"], totalSalesAmount: 100 },
      invoiceDocuments: [{ id: "invoice-1", status: "ISSUED", revenueEntryIds: ["contract-revenue-1"], subtotal: 100 }],
    });
    const changed = {
      ...same,
      invoiceDocuments: [{ id: "invoice-1", status: "ISSUED" as const, revenueEntryIds: ["other"], subtotal: 100 }],
    };

    expect(evaluateSiteMonth(same).replacementRequired).toBe(false);
    expect(evaluateSiteMonth(changed).replacementRequired).toBe(true);
  });
});
