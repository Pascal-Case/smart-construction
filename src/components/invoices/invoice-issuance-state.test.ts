import { describe, expect, it } from "vitest";

import { reconcileIssueResults, selectionSummary, toggleAllSelectable } from "@/components/invoices/invoice-issuance-state";

const candidates = [
  { targetKey: "new:1", kind: "NEW" as const, selectable: true, supplyAmount: 100 },
  { targetKey: "replacement:2", kind: "REPLACEMENT" as const, selectable: true, supplyAmount: 200 },
  { targetKey: "blocked:3", kind: "BLOCKED" as const, selectable: false, supplyAmount: 300 },
];

describe("invoice issuance selection state", () => {
  it("selects and clears every selectable new and replacement target", () => {
    expect(toggleAllSelectable([], candidates)).toEqual(["new:1", "replacement:2"]);
    expect(toggleAllSelectable(["new:1", "replacement:2"], candidates)).toEqual([]);
  });

  it("summarizes selected new and replacement targets without blocked rows", () => {
    expect(selectionSummary(["new:1", "replacement:2", "blocked:3"], candidates)).toEqual({ total: 2, newCount: 1, replacementCount: 1, supplyAmount: 300 });
  });

  it("removes successful targets and preserves blocked errors after partial issue", () => {
    expect(reconcileIssueResults(["new:1", "replacement:2"], [
      { targetKey: "new:1", outcome: "ISSUED" as const },
      { targetKey: "replacement:2", outcome: "BLOCKED" as const, error: { message: "마감이 변경되었습니다." } },
    ])).toEqual({ selected: ["replacement:2"], errors: { "replacement:2": "마감이 변경되었습니다." } });
  });
});
