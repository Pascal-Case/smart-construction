import { describe, expect, it } from "vitest";

import { invoiceReplacementIssueInputSchema } from "@/lib/invoices/schemas";

describe("invoice replacement input", () => {
  it("requires a replacement reason and the expected active documents", () => {
      const base = {
        sourceVersion: 2,
        issueDate: "2026-07-25",
        expectedRevenueEntryIds: ["revenue-1"],
        expectedActiveInvoiceIds: ["invoice-1"],
    };

    expect(invoiceReplacementIssueInputSchema.safeParse(base).success).toBe(false);
    expect(invoiceReplacementIssueInputSchema.safeParse({ ...base, reason: "발행일과 그룹핑 변경" }).success).toBe(true);
  });

  it("does not accept an empty replacement reason", () => {
    expect(invoiceReplacementIssueInputSchema.safeParse({
        sourceVersion: 2,
        issueDate: "2026-07-25",
        reason: "   ",
        expectedRevenueEntryIds: ["revenue-1"],
        expectedActiveInvoiceIds: ["invoice-1"],
    }).success).toBe(false);
  });
});
