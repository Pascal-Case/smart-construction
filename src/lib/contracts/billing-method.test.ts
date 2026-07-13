import { describe, expect, it } from "vitest";

import { ContractLineBillingMethod } from "@/generated/prisma/client";
import { resolveContractLineBilling } from "@/lib/contracts/billing-method";

describe("contract line billing method", () => {
  it("defaults a new line to monthly and canonicalizes month boundaries", () => {
    expect(resolveContractLineBilling({
      revenueStartDate: "2026-01-15",
      revenueEndDate: "2028-12-08",
    })).toEqual({
      billingMethod: ContractLineBillingMethod.MONTHLY_RECURRING,
      revenueStartDate: "2026-01-01",
      revenueEndDate: "2028-12-31",
    });
  });

  it("accepts month-only values for monthly billing", () => {
    expect(resolveContractLineBilling({
      billingMethod: ContractLineBillingMethod.MONTHLY_RECURRING,
      revenueStartDate: "2026-02",
      revenueEndDate: "2026-02",
    })).toMatchObject({ revenueStartDate: "2026-02-01", revenueEndDate: "2026-02-28" });
  });

  it("preserves an omitted existing method including long legacy periods", () => {
    expect(resolveContractLineBilling({
      revenueStartDate: "2026-01-15",
      revenueEndDate: "2028-12-08",
    }, { billingMethod: ContractLineBillingMethod.LEGACY_TOTAL })).toEqual({
      billingMethod: ContractLineBillingMethod.LEGACY_TOTAL,
      revenueStartDate: "2026-01-15",
      revenueEndDate: "2028-12-08",
    });

    expect(resolveContractLineBilling({
      revenueStartDate: "2026-03-12",
      revenueEndDate: "2026-06-02",
    }, { billingMethod: ContractLineBillingMethod.MONTHLY_RECURRING })).toMatchObject({
      billingMethod: ContractLineBillingMethod.MONTHLY_RECURRING,
      revenueStartDate: "2026-03-01",
      revenueEndDate: "2026-06-30",
    });
  });

  it("allows prorated periods in one or two adjacent calendar months", () => {
    expect(resolveContractLineBilling({
      billingMethod: ContractLineBillingMethod.PRORATED_TOTAL,
      revenueStartDate: "2026-01-15",
      revenueEndDate: "2026-02-08",
    })).toMatchObject({ revenueStartDate: "2026-01-15", revenueEndDate: "2026-02-08" });
    expect(resolveContractLineBilling({
      billingMethod: ContractLineBillingMethod.PRORATED_TOTAL,
      revenueStartDate: "2026-12-31",
      revenueEndDate: "2027-01-01",
    })).toMatchObject({ revenueStartDate: "2026-12-31", revenueEndDate: "2027-01-01" });
  });

  it("rejects three-month proration, month-only proration, reversed periods, and public legacy input", () => {
    expect(() => resolveContractLineBilling({
      billingMethod: ContractLineBillingMethod.PRORATED_TOTAL,
      revenueStartDate: "2026-01-31",
      revenueEndDate: "2026-03-01",
    })).toThrowError(expect.objectContaining({ code: "PRORATED_PERIOD_TOO_LONG" }));
    expect(() => resolveContractLineBilling({
      billingMethod: ContractLineBillingMethod.PRORATED_TOTAL,
      revenueStartDate: "2026-01",
      revenueEndDate: "2026-02",
    })).toThrowError(expect.objectContaining({ code: "PRORATED_DATES_REQUIRED" }));
    expect(() => resolveContractLineBilling({
      billingMethod: ContractLineBillingMethod.MONTHLY_RECURRING,
      revenueStartDate: "2026-03",
      revenueEndDate: "2026-02",
    })).toThrowError(expect.objectContaining({ code: "INVALID_BILLING_PERIOD" }));
    expect(() => resolveContractLineBilling({
      billingMethod: ContractLineBillingMethod.PRORATED_TOTAL,
      revenueStartDate: "2026-02-08",
      revenueEndDate: "2026-01-15",
    })).toThrowError(expect.objectContaining({ code: "INVALID_BILLING_PERIOD" }));
    expect(() => resolveContractLineBilling({
      billingMethod: ContractLineBillingMethod.LEGACY_TOTAL,
      revenueStartDate: "2026-01-01",
      revenueEndDate: "2026-01-31",
    } as never)).toThrowError(expect.objectContaining({ code: "INVALID_BILLING_METHOD" }));
  });
});
