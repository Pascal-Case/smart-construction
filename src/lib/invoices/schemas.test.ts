import { describe, expect, it } from "vitest";

import { invoiceCandidateQuerySchema, invoiceNewIssueInputSchema, invoiceRestoreToPendingInputSchema } from "@/lib/invoices/schemas";

describe("invoice restore-to-pending input", () => {
  it("requires the current positive document version", () => {
    expect(invoiceRestoreToPendingInputSchema.safeParse({ sourceVersion: 2 }).success).toBe(true);
    expect(invoiceRestoreToPendingInputSchema.safeParse({ sourceVersion: 0 }).success).toBe(false);
  });

  it("does not accept replacement settings", () => {
    expect(invoiceRestoreToPendingInputSchema.strict().safeParse({ sourceVersion: 2, issueDate: "2026-07-25" }).success).toBe(false);
  });
});

describe("new invoice issue input", () => {
  it("does not accept the removed replacement target", () => {
    expect(invoiceNewIssueInputSchema.safeParse({
      issueDate: "2026-07-25",
      displayMode: "AGGREGATED",
      templateId: "system-default",
      templateVersion: 1,
      targets: [{ targetKey: "replacement:old", kind: "REPLACEMENT", sourceInvoiceId: "old", sourceVersion: 1 }],
    }).success).toBe(false);
  });
});

describe("invoice candidate query", () => {
  it("defaults the contract category filter to all categories", () => {
    expect(invoiceCandidateQuerySchema.parse({ month: "2026-07" })).toEqual({ month: "2026-07", siteId: "", contractCategoryId: "" });
    expect(invoiceCandidateQuerySchema.parse({ month: "2026-07", contractCategoryId: "category-1" }).contractCategoryId).toBe("category-1");
  });
});
