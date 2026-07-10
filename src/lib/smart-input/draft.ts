import type { SmartInputAppliedDraft, SmartInputPreview, SmartMasterOption } from "@/lib/smart-input/types";

export function buildSmartInputDraft(preview: SmartInputPreview, site: SmartMasterOption | null, item: SmartMasterOption | null): SmartInputAppliedDraft | null {
  const period = preview.fields.period.value;
  if (!site || !period) return null;
  const quantity = preview.fields.quantity.value;
  const standardPriceWasSuggested = preview.fields.unitPrice.status === "DERIVED" && preview.fields.unitPrice.message.includes("표준 매출단가");
  const unitPrice = standardPriceWasSuggested ? item?.standardSalesPrice ?? null : preview.fields.unitPrice.value ?? item?.standardSalesPrice ?? null;
  const calculated = quantity != null && unitPrice != null ? Math.round(quantity * unitPrice) : null;
  const total = preview.fields.totalAmount.status === "MATCHED" ? preview.fields.totalAmount.value : calculated ?? preview.fields.totalAmount.value;
  if (total == null) return null;
  let reason = preview.fields.priceOverrideReason.value ?? "";
  if (!reason && calculated != null && calculated !== total) reason = "문장 입력 총액";
  if (!reason && unitPrice != null && item?.standardSalesPrice != null && unitPrice !== item.standardSalesPrice) reason = "문장 입력 단가";
  return {
    siteId: site.id,
    itemId: item?.id ?? null,
    title: (site.name + " " + (item?.name ?? (preview.target === "CONTRACT" ? "계약" : "매출"))).slice(0, 100),
    description: preview.input,
    quantity,
    unit: preview.fields.quantity.unit ?? item?.unit ?? "",
    appliedSalesPrice: unitPrice,
    appliedCostPrice: item?.standardCostPrice ?? null,
    salesAmount: total,
    priceOverrideReason: reason,
    startDate: period.startDate,
    endDate: period.endDate,
    revenueDate: period.startDate,
  };
}
