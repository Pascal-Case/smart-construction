export type ReplaceableInvoiceStatus = "DRAFT" | "ISSUED" | "SUPERSEDED";

export function isReplaceableInvoiceStatus(status: ReplaceableInvoiceStatus) {
  return status === "ISSUED";
}

export function sameRevenueSet(expected: string[], actual: string[]) {
  if (expected.length !== actual.length) return false;
  if (new Set(expected).size !== expected.length || new Set(actual).size !== actual.length) return false;
  const actualIds = new Set(actual);
  return expected.every((id) => actualIds.has(id));
}

export function sameRevenueState(
  expectedIds: string[],
  expectedAmount: number,
  actualIds: string[],
  actualAmount: number,
) {
  return expectedAmount === actualAmount && sameRevenueSet(expectedIds, actualIds);
}

export function replacementRequiredForPeriod(
  closeCycles: Array<{ revenueEntryIds: string[]; totalSalesAmount: number }>,
  currentDocuments: Array<{ revenueEntryIds: string[]; subtotal: number }>,
) {
  if (!closeCycles.length || !currentDocuments.length) return false;
  return !sameRevenueState(
    currentDocuments.flatMap((document) => document.revenueEntryIds),
    currentDocuments.reduce((sum, document) => sum + document.subtotal, 0),
    closeCycles.flatMap((cycle) => cycle.revenueEntryIds),
    closeCycles.reduce((sum, cycle) => sum + cycle.totalSalesAmount, 0),
  );
}
