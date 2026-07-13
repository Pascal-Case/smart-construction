import { monthBounds } from "@/lib/contracts/period";

export type BillingUiMethod = "LEGACY_TOTAL" | "MONTHLY_RECURRING" | "PRORATED_TOTAL";

export type BillingPeriodState = {
  billingMethod: BillingUiMethod;
  revenueStartDate: string;
  revenueEndDate: string;
  legacyPeriod?: { startDate: string; endDate: string };
};

export function changeBillingMethodPeriod(line: BillingPeriodState, billingMethod: BillingUiMethod): Partial<BillingPeriodState> {
  if (billingMethod === "MONTHLY_RECURRING") {
    return {
      billingMethod,
      revenueStartDate: monthOnly(line.revenueStartDate),
      revenueEndDate: monthOnly(line.revenueEndDate),
    };
  }
  if (billingMethod === "PRORATED_TOTAL" && line.billingMethod === "MONTHLY_RECURRING") {
    return {
      billingMethod,
      revenueStartDate: monthBounds(line.revenueStartDate).min,
      revenueEndDate: monthBounds(line.revenueEndDate).max,
    };
  }
  if (billingMethod === "LEGACY_TOTAL" && line.legacyPeriod) {
    return {
      billingMethod,
      revenueStartDate: line.legacyPeriod.startDate,
      revenueEndDate: line.legacyPeriod.endDate,
    };
  }
  return { billingMethod };
}

export function changeBillingPeriod(
  line: BillingPeriodState,
  field: "revenueStartDate" | "revenueEndDate",
  value: string,
): Partial<BillingPeriodState> {
  if (line.billingMethod !== "LEGACY_TOTAL" || !line.legacyPeriod) return { [field]: value };
  const legacyField = field === "revenueStartDate" ? "startDate" : "endDate";
  return {
    [field]: value,
    legacyPeriod: { ...line.legacyPeriod, [legacyField]: value },
  };
}

export function billingPayloadFields(line: BillingPeriodState) {
  return {
    ...(line.billingMethod === "LEGACY_TOTAL" ? {} : { billingMethod: line.billingMethod }),
    revenueStartDate: line.revenueStartDate,
    revenueEndDate: line.revenueEndDate,
  };
}

function monthOnly(value: string) {
  return value.slice(0, 7);
}
