import type { SmartContractBillingMethod, SmartInputAppliedDraft, SmartInputPreview, SmartMasterOption, SmartPeriod } from "@/lib/smart-input/types";
import { spansMoreThanTwoCalendarMonths } from "@/lib/contracts/period";

export const SMART_INPUT_PRORATED_PERIOD_ERROR = "일할청구는 최대 두 달력 월에 걸쳐 등록할 수 있습니다.";

export function billingMethodForPrecision(precision: SmartPeriod["precision"]): SmartContractBillingMethod {
  return precision === "MONTH" ? "MONTHLY_RECURRING" : "PRORATED_TOTAL";
}

export function smartInputContractPeriodError(period: {
  billingMethod: SmartContractBillingMethod;
  startDate: string;
  endDate: string;
}) {
  if (period.billingMethod !== "PRORATED_TOTAL") return null;
  return spansMoreThanTwoCalendarMonths(period.startDate, period.endDate)
    ? SMART_INPUT_PRORATED_PERIOD_ERROR
    : null;
}

export function buildSmartInputDraft(preview: SmartInputPreview, site: SmartMasterOption | null, item: SmartMasterOption | null): SmartInputAppliedDraft | null {
  const period = preview.fields.period.value;
  if (!site || !period) return null;
  const billingMethod = billingMethodForPrecision(period.precision);
  if (preview.target === "CONTRACT" && smartInputContractPeriodError({
    billingMethod,
    startDate: period.startDate,
    endDate: period.endDate,
  })) return null;
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
    billingMethod,
    periodPrecision: period.precision,
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
    startDate: period.precision === "MONTH" ? period.startDate.slice(0, 7) : period.startDate,
    endDate: period.precision === "MONTH" ? period.endDate.slice(0, 7) : period.endDate,
    revenueDate: period.startDate,
  };
}
