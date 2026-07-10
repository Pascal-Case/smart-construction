import type { ContractInput } from "@/lib/contracts/schemas";

type ExistingLine = {
  id: string; itemId: string; quantity: number; appliedSalesPrice: number; appliedCostPrice: number;
  revenueStartDate: Date; revenueEndDate: Date; isActive: boolean;
};

export function buildContractImpact(
  before: { siteId: string; startDate: Date; endDate: Date; status: string; lines: ExistingLine[] },
  input: ContractInput,
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
    const changed = old.itemId !== line.itemId || old.quantity !== line.quantity || old.appliedSalesPrice !== line.appliedSalesPrice
      || old.appliedCostPrice !== line.appliedCostPrice || dateOnly(old.revenueStartDate) !== line.revenueStartDate || dateOnly(old.revenueEndDate) !== line.revenueEndDate;
    if (changed) {
      modified += 1;
      addMonths(affectedMonths, dateOnly(old.revenueStartDate), dateOnly(old.revenueEndDate));
      addMonths(affectedMonths, line.revenueStartDate, line.revenueEndDate);
    }
  }
  for (const removed of previous.values()) addMonths(affectedMonths, dateOnly(removed.revenueStartDate), dateOnly(removed.revenueEndDate));
  const headerChanged = before.siteId !== input.siteId || dateOnly(before.startDate) !== input.startDate || dateOnly(before.endDate) !== input.endDate || before.status !== input.status;
  if (headerChanged) {
    addMonths(affectedMonths, dateOnly(before.startDate), dateOnly(before.endDate));
    addMonths(affectedMonths, input.startDate, input.endDate);
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

export function enumerateMonths(startDate: string, endDate: string) {
  const result: string[] = [];
  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00.000Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00.000Z`);
  for (const cursor = start; cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) result.push(cursor.toISOString().slice(0, 7));
  return result;
}

function addMonths(target: Set<string>, start: string, end: string) { for (const month of enumerateMonths(start, end)) target.add(month); }
function dateOnly(value: Date) { return value.toISOString().slice(0, 10); }
