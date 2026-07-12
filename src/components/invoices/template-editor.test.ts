import { describe, expect, it } from "vitest";

import { DEFAULT_INVOICE_TEMPLATE_CONFIG } from "@/lib/invoice-templates/config";
import { moveInvoiceBlock, moveInvoiceColumn, resizeInvoiceBlock, updateInvoiceColumn } from "@/components/invoices/template-editor-state";

describe("invoice template editor state", () => {
  it("moves and resizes blocks on the grid without crossing the A4 boundary", () => {
    const moved = moveInvoiceBlock(DEFAULT_INVOICE_TEMPLATE_CONFIG, "title", 30, -10);
    expect(moved.blocks.title).toMatchObject({ x: 0, y: 0 });

    const resized = resizeInvoiceBlock(DEFAULT_INVOICE_TEMPLATE_CONFIG, "title", 30, 40);
    expect(resized.blocks.title.width).toBe(24);
    expect(resized.blocks.title.height).toBe(34);
  });

  it("reorders columns and updates their presentation values", () => {
    const reordered = moveInvoiceColumn(DEFAULT_INVOICE_TEMPLATE_CONFIG, "supplyAmount", -1);
    expect(reordered.columns.map((column) => column.key)).toEqual(["itemName", "specification", "quantity", "unit", "supplyAmount", "unitPrice"]);

    const updated = updateInvoiceColumn(DEFAULT_INVOICE_TEMPLATE_CONFIG, "specification", { visible: false, width: 20 });
    expect(updated.columns.find((column) => column.key === "specification")).toMatchObject({ visible: false, width: 20 });
  });
});
