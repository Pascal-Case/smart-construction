import { describe, expect, it } from "vitest";

import { applyIssueDateToSelected, buildIssueGroups, buildNewIssueTargets, preserveCandidateIssueDates, reconcileIssueResults, selectionSummary, toggleAllSelectable } from "@/components/invoices/invoice-issuance-state";

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

  it("preserves edited dates when candidates are refreshed and applies bulk dates only to selected rows", () => {
    const dates = preserveCandidateIssueDates({ "new:1": "2026-07-21" }, [{ targetKey: "new:1" }, { targetKey: "new:2" }], "2026-07-25");
    expect(dates).toEqual({ "new:1": "2026-07-21", "new:2": "2026-07-25" });
    expect(applyIssueDateToSelected(dates, ["new:2"], "2026-08-01")).toEqual({ "new:1": "2026-07-21", "new:2": "2026-08-01" });
  });

  it("shows automatic groups by site, category, and issue date and allows a manual split", () => {
    const groupCandidates = [
      { targetKey: "new:a", kind: "NEW" as const, selectable: true, supplyAmount: 100, siteId: "site-1", siteName: "강남 현장", contractCategoryId: "category-1", contractCategoryName: "안전", cycleId: "cycle-1", closeVersion: 2, revenueFingerprint: "a".repeat(64), issueItemId: "item-a" },
      { targetKey: "new:b", kind: "NEW" as const, selectable: true, supplyAmount: 200, siteId: "site-1", siteName: "강남 현장", contractCategoryId: "category-1", contractCategoryName: "안전", cycleId: "cycle-1", closeVersion: 2, revenueFingerprint: "a".repeat(64), issueItemId: "item-b" },
      { targetKey: "new:c", kind: "NEW" as const, selectable: true, supplyAmount: 300, siteId: "site-1", siteName: "강남 현장", contractCategoryId: "category-1", contractCategoryName: "안전", cycleId: "cycle-1", closeVersion: 2, revenueFingerprint: "a".repeat(64), issueItemId: "item-c" },
    ];
    const dates = { "new:a": "2026-09-10", "new:b": "2026-09-10", "new:c": "2026-09-11" };
    const groups = buildIssueGroups(groupCandidates, ["new:a", "new:b", "new:c"], dates, { "new:b": "manual-group-1" }, "2026-09-10");

    expect(groups).toHaveLength(3);
    expect(groups.find((group) => group.candidateKeys.includes("new:a"))).toMatchObject({ issueDate: "2026-09-10", manual: false, candidateKeys: ["new:a"] });
    expect(groups.find((group) => group.candidateKeys.includes("new:b"))).toMatchObject({ issueDate: "2026-09-10", manual: true, candidateKeys: ["new:b"] });
    expect(buildNewIssueTargets(groupCandidates, ["new:a", "new:b", "new:c"], dates, { "new:b": "manual-group-1" }, "2026-09-10")).toEqual([
      expect.objectContaining({ issueDate: "2026-09-10", issueItemIds: ["item-a"], candidateKeys: ["new:a"] }),
      expect.objectContaining({ issueDate: "2026-09-10", issueItemIds: ["item-b"], candidateKeys: ["new:b"] }),
      expect.objectContaining({ issueDate: "2026-09-11", issueItemIds: ["item-c"], candidateKeys: ["new:c"] }),
    ]);
  });

  it("groups selected items with the same automatic group into one target", () => {
    const groupCandidates = [
      { targetKey: "new:a", kind: "NEW" as const, selectable: true, supplyAmount: 100, siteId: "site-1", siteName: "강남 현장", contractCategoryId: "category-1", contractCategoryName: "안전", cycleId: "cycle-1", closeVersion: 2, revenueFingerprint: "a".repeat(64), issueItemId: "item-a" },
      { targetKey: "new:b", kind: "NEW" as const, selectable: true, supplyAmount: 200, siteId: "site-1", siteName: "강남 현장", contractCategoryId: "category-1", contractCategoryName: "안전", cycleId: "cycle-1", closeVersion: 2, revenueFingerprint: "a".repeat(64), issueItemId: "item-b" },
    ];
    const targets = buildNewIssueTargets(groupCandidates, ["new:a", "new:b"], {}, {}, "2026-09-10");

    expect(targets).toEqual([expect.objectContaining({ issueDate: "2026-09-10", issueItemIds: ["item-a", "item-b"], candidateKeys: ["new:a", "new:b"] })]);
  });
});
