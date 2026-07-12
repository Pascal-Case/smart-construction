import { describe, expect, it } from "vitest";

import { buildCloseCycleSnapshot } from "@/lib/monthly-close/snapshot";

describe("monthly close cycle snapshot", () => {
  it("확정 매출만 정렬해 같은 입력 상태에 같은 snapshot을 만든다", () => {
    const input = {
      siteId: "site-1",
      month: "2026-07",
      revenues: [
        { id: "b", version: 1, status: "CONFIRMED" as const, salesAmount: 200, costAmount: null },
        { id: "draft", version: 1, status: "DRAFT" as const, salesAmount: 999, costAmount: 999 },
        { id: "a", version: 2, status: "CONFIRMED" as const, salesAmount: 100, costAmount: 50 },
      ],
      expectedContractRevenues: [
        { generatedKey: "line-b:2026-07", salesAmount: 200 },
        { generatedKey: "line-a:2026-07", salesAmount: 100 },
      ],
      exceptions: [
        { key: "DIRECT_INPUT:b", kind: "DIRECT_INPUT", blocking: false, fingerprint: "f2" },
        { key: "CONTRACT_DIFFERENCE:a", kind: "CONTRACT_DIFFERENCE", blocking: false, fingerprint: "f1" },
      ],
    };
    const reordered = {
      ...input,
      revenues: [...input.revenues].reverse(),
      expectedContractRevenues: [...input.expectedContractRevenues].reverse(),
      exceptions: [...input.exceptions].reverse(),
    };

    const left = buildCloseCycleSnapshot(input);
    const right = buildCloseCycleSnapshot(reordered);

    expect(left).toEqual(right);
    expect(JSON.parse(left.snapshotJson).revenueEntries).toEqual([
      { costAmount: 50, id: "a", salesAmount: 100, version: 2 },
      { costAmount: 0, id: "b", salesAmount: 200, version: 1 },
    ]);
    expect(left).toMatchObject({ revenueCount: 2, totalSalesAmount: 300, totalCostAmount: 50 });
  });

  it("확정 매출 집합이나 예외 fingerprint가 바뀌면 대응 fingerprint가 바뀐다", () => {
    const base = {
      siteId: "site-1",
      month: "2026-07",
      revenues: [{ id: "a", version: 1, status: "CONFIRMED" as const, salesAmount: 100, costAmount: 50 }],
      expectedContractRevenues: [],
      exceptions: [{ key: "DIRECT_INPUT:a", kind: "DIRECT_INPUT", blocking: false, fingerprint: "f1" }],
    };

    expect(buildCloseCycleSnapshot(base).revenueFingerprint)
      .not.toBe(buildCloseCycleSnapshot({ ...base, revenues: [{ ...base.revenues[0], version: 2 }] }).revenueFingerprint);
    expect(buildCloseCycleSnapshot(base).exceptionFingerprint)
      .not.toBe(buildCloseCycleSnapshot({ ...base, exceptions: [{ ...base.exceptions[0], fingerprint: "f2" }] }).exceptionFingerprint);
  });
});
