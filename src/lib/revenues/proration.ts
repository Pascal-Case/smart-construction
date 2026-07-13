import { ContractLineBillingMethod } from "@/generated/prisma/client";

export type ContractRevenueDraft = {
  generatedKey: string; revenueDate: Date; servicePeriodStart: Date; servicePeriodEnd: Date;
  billingMethod: ContractLineBillingMethod;
  prorationDays: number; allocationBaseDays: number; salesAmount: number; costAmount: number;
};

export function buildLineRevenueDrafts(line: {
  id: string; billingMethod: ContractLineBillingMethod; quantity: number; appliedSalesPrice: number; appliedCostPrice: number;
  revenueStartDate: Date; revenueEndDate: Date;
}) {
  return line.billingMethod === ContractLineBillingMethod.MONTHLY_RECURRING
    ? buildMonthlyRecurringDrafts(line)
    : buildAllocatedTotalDrafts(line);
}

type RevenueDraftLine = Parameters<typeof buildLineRevenueDrafts>[0];

function buildMonthlyRecurringDrafts(line: RevenueDraftLine): ContractRevenueDraft[] {
  const salesAmount = Math.round(line.quantity * line.appliedSalesPrice);
  const costAmount = Math.round(line.quantity * line.appliedCostPrice);
  return monthPeriods(line).map(({ revenueDate, endOfMonth }) => {
    const daysInMonth = daysBetweenInclusive(revenueDate, endOfMonth);
    return {
      generatedKey: generatedKey(line.id, revenueDate),
      revenueDate,
      servicePeriodStart: new Date(revenueDate),
      servicePeriodEnd: endOfMonth,
      billingMethod: line.billingMethod,
      prorationDays: daysInMonth,
      allocationBaseDays: daysInMonth,
      salesAmount,
      costAmount,
    };
  });
}

function buildAllocatedTotalDrafts(line: RevenueDraftLine): ContractRevenueDraft[] {
  const periods: Array<Omit<ContractRevenueDraft, "salesAmount" | "costAmount">> = [];
  const allocationBaseDays = daysBetweenInclusive(line.revenueStartDate, line.revenueEndDate);
  for (const { revenueDate, endOfMonth } of monthPeriods(line)) {
    const servicePeriodStart = line.revenueStartDate > revenueDate ? new Date(line.revenueStartDate) : new Date(revenueDate);
    const servicePeriodEnd = line.revenueEndDate < endOfMonth ? new Date(line.revenueEndDate) : endOfMonth;
    const prorationDays = daysBetweenInclusive(servicePeriodStart, servicePeriodEnd);
    periods.push({
      generatedKey: generatedKey(line.id, revenueDate),
      revenueDate,
      servicePeriodStart,
      servicePeriodEnd,
      billingMethod: line.billingMethod,
      prorationDays,
      allocationBaseDays,
    });
  }
  const salesAmounts = allocateByDays(Math.round(line.quantity * line.appliedSalesPrice), periods);
  const costAmounts = allocateByDays(Math.round(line.quantity * line.appliedCostPrice), periods);
  return periods.map((period, index) => ({ ...period, salesAmount: salesAmounts[index], costAmount: costAmounts[index] }));
}

function monthPeriods(line: Pick<RevenueDraftLine, "revenueStartDate" | "revenueEndDate">) {
  const periods: Array<{ revenueDate: Date; endOfMonth: Date }> = [];
  const first = monthStart(line.revenueStartDate);
  const last = monthStart(line.revenueEndDate);
  for (const month = first; month <= last; month.setUTCMonth(month.getUTCMonth() + 1)) {
    const revenueDate = new Date(month);
    periods.push({
      revenueDate,
      endOfMonth: new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)),
    });
  }
  return periods;
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
function generatedKey(lineId: string, revenueDate: Date) { return `${lineId}:${revenueDate.toISOString().slice(0, 7)}`; }
function daysBetweenInclusive(start: Date, end: Date) { return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1; }
