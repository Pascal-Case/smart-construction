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
    cycles: Array<{ id: string; cycleNo: number; closedAt: string; closedByName: string; revenueCount: number; totalSalesAmount: number; totalCostAmount: number }>;
    reopens: Array<{ id: string; fromCycleId: string; reason: string; reopenedByName: string; reopenedAt: string }>;
  } | null;
};

export type MonthCloseView = "exceptions" | "all";

export function filterControlRoomRows(rows: MonthCloseControlRoomRow[], view: MonthCloseView) {
  return view === "exceptions"
    ? rows.filter((row) => row.evaluation.exceptions.length > 0)
    : rows;
}

export function sortControlRoomRows(rows: MonthCloseControlRoomRow[]) {
  return [...rows].sort((left, right) => {
    const leftClosed = left.close?.state === "CLOSED" ? 1 : 0;
    const rightClosed = right.close?.state === "CLOSED" ? 1 : 0;
    if (leftClosed !== rightClosed) return leftClosed - rightClosed;
    if (left.evaluation.blockingCount !== right.evaluation.blockingCount) {
      return right.evaluation.blockingCount - left.evaluation.blockingCount;
    }
    if (left.evaluation.exceptions.length !== right.evaluation.exceptions.length) {
      return right.evaluation.exceptions.length - left.evaluation.exceptions.length;
    }
    return left.site.name.localeCompare(right.site.name, "ko");
  });
}
