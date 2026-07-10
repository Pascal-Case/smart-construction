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
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  supplyAmount: number;
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
  lines: InvoiceLineDraft[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
};

export function buildInvoiceDrafts(entries: InvoiceSourceEntry[], displayMode: "AGGREGATED" | "ITEMIZED") {
  const siteGroups = new Map<string, InvoiceSourceEntry[]>();
  for (const entry of entries) siteGroups.set(entry.siteId, [...(siteGroups.get(entry.siteId) ?? []), entry]);
  return [...siteGroups.values()]
    .sort((a, b) => a[0].siteName.localeCompare(b[0].siteName))
    .map((rows) => buildDocument(rows, displayMode));
}

function buildDocument(entries: InvoiceSourceEntry[], displayMode: "AGGREGATED" | "ITEMIZED"): InvoiceDocumentDraft {
  const lines = displayMode === "AGGREGATED" ? aggregateLines(entries) : entries.map(toLine);
  const subtotal = lines.reduce((sum, line) => sum + line.supplyAmount, 0);
  const taxAmount = lines.reduce((sum, line) => sum + line.taxAmount, 0);
  const site = entries[0];
  return { siteId: site.siteId, siteCode: site.siteCode, siteName: site.siteName, siteAddress: site.siteAddress, lines, subtotal, taxAmount, totalAmount: subtotal + taxAmount };
}

function aggregateLines(entries: InvoiceSourceEntry[]) {
  const groups = new Map<string, InvoiceLineDraft>();
  for (const entry of entries) {
    const line = toLine(entry);
    const key = JSON.stringify([line.itemName, line.specification, line.unit, line.unitPrice]);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, line);
      continue;
    }
    current.quantity = current.quantity != null && line.quantity != null ? current.quantity + line.quantity : null;
    current.supplyAmount += line.supplyAmount;
    current.taxAmount = Math.round(current.supplyAmount * 0.1);
    current.revenueEntryIds.push(...line.revenueEntryIds);
  }
  return [...groups.values()];
}

function toLine(entry: InvoiceSourceEntry): InvoiceLineDraft {
  const itemName = entry.itemName ?? entry.title;
  const specification = entry.itemName ? entry.description ?? entry.title : entry.description;
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
