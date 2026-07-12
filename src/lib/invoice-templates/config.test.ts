import { describe, expect, it } from "vitest";

import { DEFAULT_INVOICE_TEMPLATE_CONFIG, calculateRowsPerPage, normalizeTemplateName } from "@/lib/invoice-templates/config";
import { decodeInvoiceTemplateConfig, invoiceTemplateConfigSchema } from "@/lib/invoice-templates/schemas";

describe("invoice template config", () => {
  it("keeps the system default inside the A4 grid with 12 printable rows", () => {
    expect(invoiceTemplateConfigSchema.parse(DEFAULT_INVOICE_TEMPLATE_CONFIG)).toEqual(DEFAULT_INVOICE_TEMPLATE_CONFIG);
    expect(calculateRowsPerPage(DEFAULT_INVOICE_TEMPLATE_CONFIG)).toBe(12);
  });

  it("rejects blocks outside the grid or overlapping another block", () => {
    const outside = structuredClone(DEFAULT_INVOICE_TEMPLATE_CONFIG);
    outside.blocks.title.x = 24;
    expect(invoiceTemplateConfigSchema.safeParse(outside).success).toBe(false);

    const overlapping = structuredClone(DEFAULT_INVOICE_TEMPLATE_CONFIG);
    overlapping.blocks.total.y = overlapping.blocks.table.y;
    expect(invoiceTemplateConfigSchema.safeParse(overlapping).success).toBe(false);
  });

  it("rejects unsafe font, color, and column configurations", () => {
    const unsafeFont = structuredClone(DEFAULT_INVOICE_TEMPLATE_CONFIG);
    unsafeFont.blocks.title.style.fontFamily = "url(javascript:alert(1))" as never;
    expect(invoiceTemplateConfigSchema.safeParse(unsafeFont).success).toBe(false);

    const unsafeColor = structuredClone(DEFAULT_INVOICE_TEMPLATE_CONFIG);
    unsafeColor.blocks.title.style.textColor = "red; display:none";
    expect(invoiceTemplateConfigSchema.safeParse(unsafeColor).success).toBe(false);

    const missingColumn = structuredClone(DEFAULT_INVOICE_TEMPLATE_CONFIG);
    missingColumn.columns.pop();
    expect(invoiceTemplateConfigSchema.safeParse(missingColumn).success).toBe(false);

    const hiddenAmount = structuredClone(DEFAULT_INVOICE_TEMPLATE_CONFIG);
    hiddenAmount.columns.find((column) => column.key === "supplyAmount")!.visible = false;
    expect(invoiceTemplateConfigSchema.safeParse(hiddenAmount).success).toBe(false);
  });

  it("normalizes names and decodes existing documents without snapshots", () => {
    expect(normalizeTemplateName("  BI   Blue  ")).toBe("bi blue");
    expect(normalizeTemplateName("ＢＩ Blue")).toBe("bi blue");
    expect(decodeInvoiceTemplateConfig(null)).toEqual(DEFAULT_INVOICE_TEMPLATE_CONFIG);
    expect(decodeInvoiceTemplateConfig(JSON.stringify(DEFAULT_INVOICE_TEMPLATE_CONFIG))).toEqual(DEFAULT_INVOICE_TEMPLATE_CONFIG);
  });
});
