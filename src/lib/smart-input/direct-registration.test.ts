import { describe, expect, it } from "vitest";

import { buildDirectRegistrationPayload } from "@/lib/smart-input/direct-registration";
import type { SmartInputAppliedDraft } from "@/lib/smart-input/types";

const draft: SmartInputAppliedDraft = {
  siteId: "site-1",
  itemId: "item-1",
  title: "강남 A현장 하이바",
  description: "스마트 입력",
  quantity: 5,
  unit: "EA",
  appliedSalesPrice: 30_000,
  appliedCostPrice: 20_000,
  salesAmount: 150_000,
  priceOverrideReason: "",
  startDate: "2026-08-01",
  endDate: "2026-08-30",
  revenueDate: "2026-08-01",
};

describe("buildDirectRegistrationPayload", () => {
  it("계약을 진행 상태의 단일 품목 payload로 만든다", () => {
    expect(buildDirectRegistrationPayload("CONTRACT", draft)).toEqual({
      contractNo: "",
      siteId: "site-1",
      title: "강남 A현장 하이바",
      status: "ACTIVE",
      memo: "문장으로 빠른 입력에서 등록",
      lines: [{
        itemId: "item-1",
        description: "스마트 입력",
        quantity: 5,
        appliedSalesPrice: 30_000,
        appliedCostPrice: 20_000,
        priceOverrideReason: "",
        revenueStartDate: "2026-08-01",
        revenueEndDate: "2026-08-30",
      }],
    });
  });

  it("매출을 직접 확정 상태 payload로 만든다", () => {
    expect(buildDirectRegistrationPayload("REVENUE", draft)).toEqual({
      siteId: "site-1",
      revenueDate: "2026-08-01",
      sourceType: "MANUAL",
      itemId: "item-1",
      title: "강남 A현장 하이바",
      description: "스마트 입력",
      quantity: 5,
      unit: "EA",
      appliedSalesPrice: 30_000,
      salesAmount: 150_000,
      appliedCostPrice: 20_000,
      costAmount: 100_000,
      priceOverrideReason: "",
      saveStatus: "CONFIRMED",
    });
  });
});
