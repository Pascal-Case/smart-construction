type DashboardActionRevenue = {
  revenueDate: Date;
  salesAmount: number;
  status: string;
};

type ActionSummary = { count: number; amount: number; oldestDate: Date | null };
type UnissuedCloseCycle = { closedAt: Date; totalSalesAmount: number };

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
