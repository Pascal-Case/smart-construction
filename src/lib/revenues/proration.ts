export type ContractRevenueDraft = {
  generatedKey: string; revenueDate: Date; servicePeriodStart: Date; servicePeriodEnd: Date;
  prorationDays: number; allocationBaseDays: number; salesAmount: number; costAmount: number;
};

export function buildLineRevenueDrafts(line: {
  id: string; quantity: number; appliedSalesPrice: number; appliedCostPrice: number;
  revenueStartDate: Date; revenueEndDate: Date;
}) {
  const periods: Array<Omit<ContractRevenueDraft, "salesAmount" | "costAmount">> = [];
  const first = monthStart(line.revenueStartDate);
  const last = monthStart(line.revenueEndDate);
  const allocationBaseDays = daysBetweenInclusive(line.revenueStartDate, line.revenueEndDate);
  for (const month = first; month <= last; month.setUTCMonth(month.getUTCMonth() + 1)) {
    const revenueDate = new Date(month);
    const endOfMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
    const servicePeriodStart = line.revenueStartDate > revenueDate ? new Date(line.revenueStartDate) : new Date(revenueDate);
    const servicePeriodEnd = line.revenueEndDate < endOfMonth ? new Date(line.revenueEndDate) : endOfMonth;
    const prorationDays = daysBetweenInclusive(servicePeriodStart, servicePeriodEnd);
    periods.push({
      generatedKey: `${line.id}:${revenueDate.toISOString().slice(0, 7)}`,
      revenueDate,
      servicePeriodStart,
      servicePeriodEnd,
      prorationDays,
      allocationBaseDays,
    });
  }
  const salesAmounts = allocateByDays(Math.round(line.quantity * line.appliedSalesPrice), periods);
  const costAmounts = allocateByDays(Math.round(line.quantity * line.appliedCostPrice), periods);
  return periods.map((period, index) => ({ ...period, salesAmount: salesAmounts[index], costAmount: costAmounts[index] }));
}

function allocateByDays(totalAmount: number, periods: Array<{ prorationDays: number; allocationBaseDays: number }>) {
  let cumulativeDays = 0;
  let allocatedAmount = 0;
  return periods.map((period, index) => {
    cumulativeDays += period.prorationDays;
    const cumulativeAmount = index === periods.length - 1
      ? totalAmount
      : Math.round(totalAmount * cumulativeDays / period.allocationBaseDays);
    const amount = cumulativeAmount - allocatedAmount;
    allocatedAmount = cumulativeAmount;
    return amount;
  });
}

function monthStart(value: Date) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1)); }
function daysBetweenInclusive(start: Date, end: Date) { return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1; }
