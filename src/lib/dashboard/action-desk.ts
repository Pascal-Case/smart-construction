type DashboardActionRevenue = {
  revenueDate: Date;
  salesAmount: number;
  status: string;
  hasCurrentInvoice: boolean;
};

type ActionSummary = { count: number; amount: number; oldestDate: Date | null };

export function buildDashboardActionDesk(rows: DashboardActionRevenue[]) {
  return {
    draft: summarize(rows.filter((row) => row.status === "DRAFT")),
    zero: summarize(rows.filter((row) => row.status !== "CANCELED" && row.salesAmount === 0)),
    unissued: summarize(rows.filter((row) => row.status === "CONFIRMED" && !row.hasCurrentInvoice)),
  };
}

function summarize(rows: DashboardActionRevenue[]): ActionSummary {
  return rows.reduce<ActionSummary>((summary, row) => ({
    count: summary.count + 1,
    amount: summary.amount + row.salesAmount,
    oldestDate: summary.oldestDate == null || row.revenueDate < summary.oldestDate ? row.revenueDate : summary.oldestDate,
  }), { count: 0, amount: 0, oldestDate: null });
}
