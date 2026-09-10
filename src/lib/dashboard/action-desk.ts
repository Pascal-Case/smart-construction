type DashboardActionRevenue = {
  revenueDate: Date;
  salesAmount: number;
  status: string;
};

type ActionSummary = { count: number; amount: number; oldestDate: Date | null };
export type UnissuedCloseCycle = { closedAt: Date; totalSalesAmount: number };
export type DashboardCloseCycle = {
  closedAt: Date;
  totalSalesAmount: number;
  snapshotJson: string;
  invoiceDocuments: Array<{ revenueEntryIds: string[]; subtotal: number }>;
};

export function getUnissuedCloseCycle(cycle: DashboardCloseCycle): UnissuedCloseCycle | null {
  const snapshot = parseSnapshot(cycle.snapshotJson);
  if (snapshot.revenueEntryIds.length === 0) {
    return cycle.invoiceDocuments.length === 0
      ? { closedAt: cycle.closedAt, totalSalesAmount: cycle.totalSalesAmount }
      : null;
  }

  const issuedRevenueIds = new Set(cycle.invoiceDocuments.flatMap((document) => document.revenueEntryIds));
  const remainingRevenueIds = snapshot.revenueEntryIds.filter((id) => !issuedRevenueIds.has(id));
  if (remainingRevenueIds.length === 0) return null;

  const remainingSalesAmount = snapshot.revenueEntries.length > 0
    ? snapshot.revenueEntries
      .filter((entry) => remainingRevenueIds.includes(entry.id))
      .reduce((sum, entry) => sum + entry.salesAmount, 0)
    : cycle.totalSalesAmount - cycle.invoiceDocuments.reduce((sum, document) => sum + document.subtotal, 0);

  return { closedAt: cycle.closedAt, totalSalesAmount: remainingSalesAmount };
}

export function buildDashboardActionDesk(rows: DashboardActionRevenue[], unissuedCloseCycles: UnissuedCloseCycle[] = []) {
  return {
    draft: summarize(rows.filter((row) => row.status === "DRAFT")),
    zero: summarize(rows.filter((row) => row.status !== "CANCELED" && row.salesAmount === 0)),
    unissued: summarize(unissuedCloseCycles.map((cycle) => ({
      revenueDate: cycle.closedAt,
      salesAmount: cycle.totalSalesAmount,
    }))),
  };
}

function summarize(rows: Array<{ revenueDate: Date; salesAmount: number }>): ActionSummary {
  return rows.reduce<ActionSummary>((summary, row) => ({
    count: summary.count + 1,
    amount: summary.amount + row.salesAmount,
    oldestDate: summary.oldestDate == null || row.revenueDate < summary.oldestDate ? row.revenueDate : summary.oldestDate,
  }), { count: 0, amount: 0, oldestDate: null });
}

function parseSnapshot(snapshotJson: string) {
  try {
    const parsed = JSON.parse(snapshotJson) as {
      revenueEntryIds?: unknown;
      revenueEntries?: Array<{ id?: unknown; salesAmount?: unknown }>;
    };
    const revenueEntries = (parsed.revenueEntries ?? []).flatMap((entry) => (
      typeof entry.id === "string" && typeof entry.salesAmount === "number"
        ? [{ id: entry.id, salesAmount: entry.salesAmount }]
        : []
    ));
    const revenueEntryIds = Array.isArray(parsed.revenueEntryIds)
      ? parsed.revenueEntryIds.filter((id): id is string => typeof id === "string")
      : revenueEntries.map((entry) => entry.id);
    return { revenueEntryIds, revenueEntries };
  } catch {
    return { revenueEntryIds: [], revenueEntries: [] };
  }
}
