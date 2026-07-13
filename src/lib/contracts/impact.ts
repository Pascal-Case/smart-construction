import type { ContractLineBillingMethod } from "@/generated/prisma/client";
import { dateOnly, deriveContractPeriod, enumerateMonths } from "@/lib/contracts/period";

type ExistingLine = {
  id: string; itemId: string; billingMethod: ContractLineBillingMethod; quantity: number; appliedSalesPrice: number; appliedCostPrice: number;
  revenueStartDate: Date; revenueEndDate: Date; isActive: boolean;
};

type ImpactInput = {
  siteId: string;
  title?: string;
  status: string;
  lines: Array<{
    id?: string;
    itemId: string;
    billingMethod: ContractLineBillingMethod;
    quantity: number;
    appliedSalesPrice: number;
    appliedCostPrice: number;
    revenueStartDate: string | Date;
    revenueEndDate: string | Date;
  }>;
};

export function buildContractImpact(
  before: { siteId: string; startDate: Date; endDate: Date; status: string; lines: ExistingLine[] },
  input: ImpactInput,
) {
  const previous = new Map(before.lines.filter((line) => line.isActive).map((line) => [line.id, line]));
  const added = input.lines.filter((line) => !line.id).length;
  let modified = 0;
  const affectedMonths = new Set<string>();

  for (const line of input.lines) {
    if (!line.id) {
      addMonths(affectedMonths, line.revenueStartDate, line.revenueEndDate);
      continue;
    }
    const old = previous.get(line.id);
    if (!old) continue;
    previous.delete(line.id);
    const changed = old.itemId !== line.itemId || old.billingMethod !== line.billingMethod || old.quantity !== line.quantity || old.appliedSalesPrice !== line.appliedSalesPrice
      || old.appliedCostPrice !== line.appliedCostPrice || dateOnly(old.revenueStartDate) !== dateOnly(line.revenueStartDate) || dateOnly(old.revenueEndDate) !== dateOnly(line.revenueEndDate);
    if (changed) {
      modified += 1;
      addMonths(affectedMonths, dateOnly(old.revenueStartDate), dateOnly(old.revenueEndDate));
      addMonths(affectedMonths, line.revenueStartDate, line.revenueEndDate);
    }
  }
  for (const removed of previous.values()) addMonths(affectedMonths, dateOnly(removed.revenueStartDate), dateOnly(removed.revenueEndDate));
  const period = deriveContractPeriod(input.lines);
  const headerChanged = before.siteId !== input.siteId || dateOnly(before.startDate) !== period.startDate || dateOnly(before.endDate) !== period.endDate || before.status !== input.status;
  if (headerChanged) {
    addMonths(affectedMonths, dateOnly(before.startDate), dateOnly(before.endDate));
    addMonths(affectedMonths, period.startDate, period.endDate);
  }
  return {
    headerChanged,
    addedLines: added,
    modifiedLines: modified,
    removedLines: previous.size,
    affectedMonths: [...affectedMonths].sort(),
    requiresConfirmation: headerChanged || added > 0 || modified > 0 || previous.size > 0,
  };
}

function addMonths(target: Set<string>, start: string | Date, end: string | Date) { for (const month of enumerateMonths(start, end)) target.add(month); }
