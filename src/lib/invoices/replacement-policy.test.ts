import { describe, expect, it } from "vitest";

import { isReplaceableInvoiceStatus, sameRevenueSet } from "@/lib/invoices/replacement-policy";

describe("invoice replacement policy", () => {
  it("allows only the current issued document to start a replacement", () => {
    expect(isReplaceableInvoiceStatus("ISSUED")).toBe(true);
    expect(isReplaceableInvoiceStatus("DRAFT")).toBe(false);
    expect(isReplaceableInvoiceStatus("SUPERSEDED")).toBe(false);
  });

  it("compares previewed revenue ids without depending on order", () => {
    expect(sameRevenueSet(["r1", "r2"], ["r2", "r1"])).toBe(true);
    expect(sameRevenueSet(["r1", "r2"], ["r1", "r3"])).toBe(false);
    expect(sameRevenueSet(["r1", "r1"], ["r1"])).toBe(false);
  });
});
