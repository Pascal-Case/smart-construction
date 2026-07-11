import type { SmartInputAppliedDraft, SmartInputTarget } from "@/lib/smart-input/types";

export function buildDirectRegistrationPayload(target: SmartInputTarget, draft: SmartInputAppliedDraft) {
  if (target === "CONTRACT") {
    return {
      contractNo: "",
      siteId: draft.siteId,
      title: draft.title,
      status: "ACTIVE",
      memo: "문장으로 빠른 입력에서 등록",
      lines: [{
        itemId: draft.itemId,
        description: draft.description,
        quantity: draft.quantity,
        appliedSalesPrice: draft.appliedSalesPrice,
        appliedCostPrice: draft.appliedCostPrice,
        priceOverrideReason: draft.priceOverrideReason,
        revenueStartDate: draft.startDate,
        revenueEndDate: draft.endDate,
      }],
    };
  }

  return {
    siteId: draft.siteId,
    revenueDate: draft.revenueDate,
    sourceType: "MANUAL",
    itemId: draft.itemId,
    title: draft.title,
    description: draft.description,
    quantity: draft.quantity,
    unit: draft.unit,
    appliedSalesPrice: draft.appliedSalesPrice,
    salesAmount: draft.salesAmount,
    appliedCostPrice: draft.appliedCostPrice,
    costAmount: draft.quantity != null && draft.appliedCostPrice != null
      ? Math.round(draft.quantity * draft.appliedCostPrice)
      : null,
    priceOverrideReason: draft.priceOverrideReason,
    saveStatus: "CONFIRMED",
  };
}
