export type MonthlyExceptionFilter = "ALL" | "DRAFT" | "ZERO";

export function filterMonthlyDetails<T extends { status: string; salesAmount: number }>(
  rows: T[],
  filter: MonthlyExceptionFilter,
) {
  if (filter === "DRAFT") return rows.filter((row) => row.status === "DRAFT");
  if (filter === "ZERO") return rows.filter((row) => row.salesAmount === 0);
  return rows;
}
