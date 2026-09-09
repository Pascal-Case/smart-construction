export type InvoiceSourceEntry = {
  id: string;
  siteId: string;
  siteCode: string;
  siteName: string;
  siteAddress: string | null;
  revenueDate: Date;
  title: string;
  description: string | null;
  itemName: string | null;
  itemId: string | null;
  itemSpecification: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  supplyAmount: number;
  contractCategoryId: string;
  contractCategoryCode: string;
  contractCategoryName: string;
  invoiceDisplayItemId: string | null;
  invoiceDisplayItemName: string | null;
};

export type InvoiceLineDraft = {
  itemName: string;
  specification: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  supplyAmount: number;
  taxAmount: number;
  revenueEntryIds: string[];
};

export type InvoiceDocumentDraft = {
  siteId: string;
  siteCode: string;
  siteName: string;
  siteAddress: string | null;
  contractCategoryId: string;
  contractCategoryCode: string;
  contractCategoryName: string;
  lines: InvoiceLineDraft[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
};

export function buildInvoiceDrafts(entries: InvoiceSourceEntry[], displayMode: "AGGREGATED" | "ITEMIZED") {
  const documentGroups = new Map<string, InvoiceSourceEntry[]>();
  for (const entry of entries) {
    const key = JSON.stringify([entry.siteId, entry.contractCategoryId]);
    documentGroups.set(key, [...(documentGroups.get(key) ?? []), entry]);
  }
  return [...documentGroups.values()]
    .sort((a, b) => a[0].siteName.localeCompare(b[0].siteName) || a[0].contractCategoryName.localeCompare(b[0].contractCategoryName))
    .map((rows) => buildDocument(rows, displayMode));
}

function buildDocument(entries: InvoiceSourceEntry[], displayMode: "AGGREGATED" | "ITEMIZED"): InvoiceDocumentDraft {
  const lines = displayMode === "AGGREGATED" ? aggregateLines(entries) : entries.map((entry) => toLine(entry));
  const subtotal = lines.reduce((sum, line) => sum + line.supplyAmount, 0);
  const taxAmount = lines.reduce((sum, line) => sum + line.taxAmount, 0);
  const site = entries[0];
  return {
    siteId: site.siteId,
    siteCode: site.siteCode,
    siteName: site.siteName,
    siteAddress: site.siteAddress,
    contractCategoryId: site.contractCategoryId,
    contractCategoryCode: site.contractCategoryCode,
    contractCategoryName: site.contractCategoryName,
    lines,
    subtotal,
    taxAmount,
    totalAmount: subtotal + taxAmount,
  };
}

function aggregateLines(entries: InvoiceSourceEntry[]) {
  const groups = new Map<string, InvoiceLineDraft>();
  for (const entry of entries) {
    const line = toLine(entry, true);
    const key = entry.invoiceDisplayItemId
      ? JSON.stringify(["display", entry.invoiceDisplayItemId])
      : JSON.stringify(["source", line.itemName, line.specification, line.unit, line.unitPrice]);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, line);
      continue;
    }
    const sameCalculation = current.specification === line.specification
      && current.unit === line.unit
      && current.unitPrice === line.unitPrice;
    current.quantity = sameCalculation && current.quantity != null && line.quantity != null
      ? current.quantity + line.quantity
      : null;
    if (!sameCalculation) {
      current.specification = null;
      current.unit = null;
      current.unitPrice = null;
    }
    current.supplyAmount += line.supplyAmount;
    current.taxAmount = Math.round(current.supplyAmount * 0.1);
    current.revenueEntryIds.push(...line.revenueEntryIds);
  }
  return [...groups.values()];
}

function toLine(entry: InvoiceSourceEntry, useDisplayItem = false): InvoiceLineDraft {
  const itemName = useDisplayItem && entry.invoiceDisplayItemName
    ? entry.invoiceDisplayItemName
    : entry.itemName ?? entry.title;
  const specification = entry.description ?? entry.itemSpecification;
  return {
    itemName,
    specification,
    quantity: entry.quantity,
    unit: entry.unit,
    unitPrice: entry.unitPrice,
    supplyAmount: entry.supplyAmount,
    taxAmount: Math.round(entry.supplyAmount * 0.1),
    revenueEntryIds: [entry.id],
  };
}
