export type ContractRevenueDraft = {
  generatedKey: string; revenueDate: Date; servicePeriodStart: Date; servicePeriodEnd: Date;
  prorationDays: number; daysInMonth: number; salesAmount: number; costAmount: number;
};

export function buildLineRevenueDrafts(line: {
  id: string; quantity: number; appliedSalesPrice: number; appliedCostPrice: number;
  revenueStartDate: Date; revenueEndDate: Date;
}) {
  const drafts: ContractRevenueDraft[] = [];
  const first = monthStart(line.revenueStartDate);
  const last = monthStart(line.revenueEndDate);
  for (const month = first; month <= last; month.setUTCMonth(month.getUTCMonth() + 1)) {
    const revenueDate = new Date(month);
    const endOfMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
    const servicePeriodStart = line.revenueStartDate > revenueDate ? new Date(line.revenueStartDate) : new Date(revenueDate);
    const servicePeriodEnd = line.revenueEndDate < endOfMonth ? new Date(line.revenueEndDate) : endOfMonth;
    const daysInMonth = endOfMonth.getUTCDate();
    const prorationDays = daysBetweenInclusive(servicePeriodStart, servicePeriodEnd);
    drafts.push({
      generatedKey: `${line.id}:${revenueDate.toISOString().slice(0, 7)}`,
      revenueDate,
      servicePeriodStart,
      servicePeriodEnd,
      prorationDays,
      daysInMonth,
      salesAmount: proratedAmount(line.quantity, line.appliedSalesPrice, prorationDays, daysInMonth),
      costAmount: proratedAmount(line.quantity, line.appliedCostPrice, prorationDays, daysInMonth),
    });
  }
  return drafts;
}

export function proratedAmount(quantity: number, unitPrice: number, appliedDays: number, daysInMonth: number) {
  return Math.round(quantity * unitPrice * appliedDays / daysInMonth);
}

function monthStart(value: Date) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1)); }
function daysBetweenInclusive(start: Date, end: Date) { return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1; }
