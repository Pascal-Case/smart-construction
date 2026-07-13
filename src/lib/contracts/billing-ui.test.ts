import { describe, expect, it } from "vitest";

import { billingPayloadFields, changeBillingMethodPeriod, changeBillingPeriod } from "@/lib/contracts/billing-ui";

const legacyLine = {
  billingMethod: "LEGACY_TOTAL" as const,
  revenueStartDate: "2026-01-15",
  revenueEndDate: "2026-02-08",
  legacyPeriod: { startDate: "2026-01-15", endDate: "2026-02-08" },
};

describe("contract billing UI state", () => {
  it("keeps edited legacy dates through a method round trip", () => {
    const edited = { ...legacyLine, ...changeBillingPeriod(legacyLine, "revenueStartDate", "2026-01-20") };
    const monthly = { ...edited, ...changeBillingMethodPeriod(edited, "MONTHLY_RECURRING") };

    expect(changeBillingMethodPeriod(monthly, "LEGACY_TOTAL")).toMatchObject({
      billingMethod: "LEGACY_TOTAL",
      revenueStartDate: "2026-01-20",
      revenueEndDate: "2026-02-08",
    });
  });

  it("expands monthly values when switching to prorated", () => {
    expect(changeBillingMethodPeriod({
      billingMethod: "MONTHLY_RECURRING",
      revenueStartDate: "2028-02",
      revenueEndDate: "2028-03",
    }, "PRORATED_TOTAL")).toMatchObject({
      revenueStartDate: "2028-02-01",
      revenueEndDate: "2028-03-31",
    });
  });

  it("omits the internal legacy discriminator from payload fields", () => {
    expect(billingPayloadFields(legacyLine)).toEqual({
      revenueStartDate: "2026-01-15",
      revenueEndDate: "2026-02-08",
    });
  });
});
