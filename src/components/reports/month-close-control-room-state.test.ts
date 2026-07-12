import { describe, expect, it } from "vitest";

import {
  filterControlRoomRows,
  sortControlRoomRows,
  type MonthCloseControlRoomRow,
} from "@/components/reports/month-close-control-room-state";

function row(name: string, options: { closed?: boolean; blockers?: number; exceptions?: number } = {}): MonthCloseControlRoomRow {
  const exceptionCount = options.exceptions ?? options.blockers ?? 0;
  return {
    site: { id: name, code: name, name },
    evaluation: {
      exceptions: Array.from({ length: exceptionCount }, (_, index) => ({
        key: `${name}-${index}`,
        kind: "DIRECT_INPUT",
        blocking: index < (options.blockers ?? 0),
        reviewable: true,
        reviewed: false,
        fingerprint: "a".repeat(64),
        message: "예외",
      })),
      blockingCount: options.blockers ?? 0,
      canClose: (options.blockers ?? 0) === 0,
      replacementRequired: false,
      totals: { revenueCount: 1, totalSalesAmount: 100, totalCostAmount: 50 },
    },
    commitFingerprint: "b".repeat(64),
    close: options.closed ? { id: name, state: "CLOSED", version: 1, latestCycleNo: 1, cycles: [], reopens: [] } : null,
  };
}

describe("month close control room state", () => {
  it("shows only rows with exceptions in exception view", () => {
    expect(filterControlRoomRows([row("정상"), row("예외", { exceptions: 1 })], "exceptions").map((item) => item.site.name)).toEqual(["예외"]);
  });

  it("orders open blockers before reviewable rows and closed rows", () => {
    const rows = sortControlRoomRows([
      row("마감", { closed: true, blockers: 2 }),
      row("검토", { exceptions: 1 }),
      row("차단", { blockers: 2 }),
    ]);
    expect(rows.map((item) => item.site.name)).toEqual(["차단", "검토", "마감"]);
  });
});
