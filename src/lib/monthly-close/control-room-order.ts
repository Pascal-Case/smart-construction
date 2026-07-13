import type { SortDirection } from "@/lib/list-sorting";
import type { MonthlyCloseSortKey } from "@/lib/monthly-close/schemas";
import type { MonthCloseException } from "@/lib/monthly-close/types";

export type MonthCloseControlRoomRow = {
  site: { id: string; code: string; name: string };
  evaluation: {
    exceptions: MonthCloseException[];
    blockingCount: number;
    canClose: boolean;
    replacementRequired: boolean;
    totals: { revenueCount: number; totalSalesAmount: number; totalCostAmount: number };
  };
  commitFingerprint: string;
  close: {
    id: string;
    state: "OPEN" | "CLOSED";
    version: number;
    latestCycleNo: number;
    cycles: Array<{ id: string; cycleNo: number; closedAt: string | Date; closedByName: string; revenueCount: number; totalSalesAmount: number; totalCostAmount: number }>;
    reopens: Array<{ id: string; fromCycleId: string; reason: string; reopenedByName: string; reopenedAt: string | Date }>;
  } | null;
};

export type MonthCloseView = "exceptions" | "all";
export type MonthCloseSort = { key: MonthlyCloseSortKey; direction: SortDirection } | null;

export function filterControlRoomRows(rows: MonthCloseControlRoomRow[], view: MonthCloseView) {
  return view === "exceptions" ? rows.filter((row) => row.evaluation.exceptions.length > 0) : rows;
}

export function sortControlRoomRows(rows: MonthCloseControlRoomRow[], sort: MonthCloseSort = null) {
  return [...rows].sort((left, right) => {
    if (!sort) return compareDefault(left, right) || left.site.id.localeCompare(right.site.id);
    const factor = sort.direction === "asc" ? 1 : -1;
    let result = 0;
    if (sort.key === "site") {
      result = left.site.name.localeCompare(right.site.name, "ko") || left.site.code.localeCompare(right.site.code, "ko");
    } else if (sort.key === "status") {
      result = statusRank(left) - statusRank(right);
    } else if (sort.key === "sales") {
      result = left.evaluation.totals.totalSalesAmount - right.evaluation.totals.totalSalesAmount
        || left.evaluation.totals.revenueCount - right.evaluation.totals.revenueCount;
    } else {
      result = left.evaluation.exceptions.length - right.evaluation.exceptions.length
        || left.evaluation.blockingCount - right.evaluation.blockingCount;
    }
    return result * factor || left.site.id.localeCompare(right.site.id);
  });
}

function compareDefault(left: MonthCloseControlRoomRow, right: MonthCloseControlRoomRow) {
  const leftClosed = left.close?.state === "CLOSED" ? 1 : 0;
  const rightClosed = right.close?.state === "CLOSED" ? 1 : 0;
  return leftClosed - rightClosed
    || right.evaluation.blockingCount - left.evaluation.blockingCount
    || right.evaluation.exceptions.length - left.evaluation.exceptions.length
    || left.site.name.localeCompare(right.site.name, "ko");
}

function statusRank(row: MonthCloseControlRoomRow) {
  if (row.close?.state === "CLOSED") return 2;
  return row.evaluation.blockingCount > 0 ? 0 : 1;
}
