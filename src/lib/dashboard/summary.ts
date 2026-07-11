type DashboardRevenue = {
  revenueDate: Date;
  salesAmount: number;
  costAmount: number | null;
  status: string;
};

export function dashboardYearRange(now = new Date()) {
  const year = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric" }).format(now));

  return {
    year,
    startDate: new Date(Date.UTC(year, 0, 1)),
    endDate: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

export function buildDashboardSummary({
  year,
  siteCount,
  invoiceCount,
  revenues,
}: {
  year: number;
  siteCount: number;
  invoiceCount: number;
  revenues: DashboardRevenue[];
}) {
  const months = Array.from({ length: 12 }, (_, index) => ({
    month: `${year}-${String(index + 1).padStart(2, "0")}`,
    label: `${index + 1}월`,
    salesAmount: 0,
    profit: 0,
  }));

  for (const revenue of revenues) {
    if (revenue.status === "CANCELED") continue;
    const month = revenue.revenueDate.getUTCMonth();
    if (revenue.revenueDate.getUTCFullYear() !== year || !months[month]) continue;
    months[month].salesAmount += revenue.salesAmount;
    months[month].profit += revenue.salesAmount - (revenue.costAmount ?? 0);
  }

  return {
    year,
    siteCount,
    invoiceCount,
    totalSales: months.reduce((sum, month) => sum + month.salesAmount, 0),
    totalProfit: months.reduce((sum, month) => sum + month.profit, 0),
    months,
  };
}
