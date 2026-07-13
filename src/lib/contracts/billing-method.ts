import { ContractLineBillingMethod } from "@/generated/prisma/client";
import { AuthError } from "@/lib/auth/errors";
import { monthBounds, spansMoreThanTwoCalendarMonths } from "@/lib/contracts/period";

export type PublicContractLineBillingMethod =
  | typeof ContractLineBillingMethod.MONTHLY_RECURRING
  | typeof ContractLineBillingMethod.PRORATED_TOTAL;

type BillingInput = {
  billingMethod?: PublicContractLineBillingMethod;
  revenueStartDate: string;
  revenueEndDate: string;
};

type ExistingBilling = {
  billingMethod: ContractLineBillingMethod;
};

export function resolveContractLineBilling(input: BillingInput, existing?: ExistingBilling) {
  const explicitMethod = input.billingMethod as ContractLineBillingMethod | undefined;
  if (explicitMethod === ContractLineBillingMethod.LEGACY_TOTAL) {
    throw new AuthError("기존 계산 방식은 새 청구 방식으로 선택할 수 없습니다.", 400, "INVALID_BILLING_METHOD");
  }

  const billingMethod = explicitMethod
    ?? existing?.billingMethod
    ?? ContractLineBillingMethod.MONTHLY_RECURRING;

  if (billingMethod === ContractLineBillingMethod.MONTHLY_RECURRING) {
    const startMonth = monthValue(input.revenueStartDate);
    const endMonth = monthValue(input.revenueEndDate);
    if (startMonth > endMonth) throw invalidPeriod();
    return {
      billingMethod,
      revenueStartDate: monthBounds(startMonth).min,
      revenueEndDate: monthBounds(endMonth).max,
    };
  }

  if (!isDateValue(input.revenueStartDate) || !isDateValue(input.revenueEndDate)) {
    throw new AuthError("일할청구는 시작일과 종료일을 날짜로 입력해 주세요.", 400, "PRORATED_DATES_REQUIRED");
  }
  if (input.revenueStartDate > input.revenueEndDate) throw invalidPeriod();
  if (billingMethod === ContractLineBillingMethod.PRORATED_TOTAL
    && spansMoreThanTwoCalendarMonths(input.revenueStartDate, input.revenueEndDate)) {
    throw new AuthError("일할청구는 달력상 최대 두 달까지만 등록할 수 있습니다.", 400, "PRORATED_PERIOD_TOO_LONG");
  }

  return {
    billingMethod,
    revenueStartDate: input.revenueStartDate,
    revenueEndDate: input.revenueEndDate,
  };
}

function monthValue(value: string) {
  return value.slice(0, 7);
}

function isDateValue(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value);
}

function invalidPeriod() {
  return new AuthError("매출 종료 기간은 시작 기간보다 빠를 수 없습니다.", 400, "INVALID_BILLING_PERIOD");
}
