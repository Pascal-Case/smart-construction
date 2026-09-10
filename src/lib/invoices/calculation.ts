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
  const groups = new Map<string, InvoiceSourceEntry[]>();
  for (const entry of entries) {
    const key = entry.invoiceDisplayItemId
      ? JSON.stringify(["display", entry.invoiceDisplayItemId])
      : JSON.stringify(["source", entry.itemName ?? entry.title, entry.description ?? entry.itemSpecification, entry.unit, entry.unitPrice]);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()].map((group) => group[0].invoiceDisplayItemId
    ? aggregateDisplayItemLines(group)
    : aggregateMatchingLines(group));
}

function aggregateMatchingLines(entries: InvoiceSourceEntry[]): InvoiceLineDraft {
  const line = toLine(entries[0]);
  for (const entry of entries.slice(1)) {
    const next = toLine(entry);
    line.quantity = line.quantity != null && next.quantity != null ? line.quantity + next.quantity : null;
    line.supplyAmount += next.supplyAmount;
    line.revenueEntryIds.push(...next.revenueEntryIds);
  }
  line.taxAmount = Math.round(line.supplyAmount * 0.1);
  return line;
}

function aggregateDisplayItemLines(entries: InvoiceSourceEntry[]): InvoiceLineDraft {
  const line = toLine(entries[0], true);
  line.supplyAmount = entries.reduce((sum, entry) => sum + entry.supplyAmount, 0);
  line.taxAmount = Math.round(line.supplyAmount * 0.1);
  line.revenueEntryIds = entries.map((entry) => entry.id);

  const representativeEntries = entries.filter((entry) => entry.itemId === entry.invoiceDisplayItemId);
  if (!representativeEntries.length) return { ...line, specification: null, quantity: null, unit: null, unitPrice: null };

  const representativeLines = representativeEntries.map((entry) => toLine(entry));
  line.specification = commonValue(representativeLines.map((entry) => entry.specification));
  line.unit = commonValue(representativeLines.map((entry) => entry.unit));
  line.quantity = line.unit != null && representativeLines.every((entry) => entry.quantity != null)
    ? representativeLines.reduce((sum, entry) => sum + entry.quantity!, 0)
    : null;
  const calculatedUnitPrice = line.quantity ? line.supplyAmount / line.quantity : null;
  line.unitPrice = calculatedUnitPrice != null && Number.isInteger(calculatedUnitPrice) ? calculatedUnitPrice : null;
  return line;
}

function commonValue<T>(values: T[]): T | null {
  return values.every((value) => value === values[0]) ? values[0] : null;
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
