import { describe, expect, it } from "vitest";

import { DEFAULT_INVOICE_TEMPLATE_CONFIG, INVOICE_TEMPLATE_SYSTEM_ID } from "@/lib/invoice-templates/config";
import { invoiceIssueInputSchema } from "@/lib/invoices/schemas";

const baseInput = {
  revenueEntryIds: ["revenue-1"],
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
  issueDate: "2026-07-12",
  displayMode: "AGGREGATED" as const,
  memo: null,
};

describe("invoice template snapshot input", () => {
  it("defaults legacy issue requests to the immutable system template", () => {
    expect(invoiceIssueInputSchema.parse(baseInput)).toMatchObject({
      templateId: INVOICE_TEMPLATE_SYSTEM_ID,
      templateVersion: 1,
    });
  });

  it("preserves the template id and previewed version for atomic issue", () => {
    expect(invoiceIssueInputSchema.parse({ ...baseInput, templateId: "template-bi", templateVersion: 4 })).toMatchObject({
      templateId: "template-bi",
      templateVersion: 4,
    });
    expect(DEFAULT_INVOICE_TEMPLATE_CONFIG.schemaVersion).toBe(1);
  });
});
