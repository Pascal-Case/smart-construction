import { describe, expect, it } from "vitest";

import { buildDashboardActionDesk, getUnissuedCloseCycle } from "@/lib/dashboard/action-desk";

describe("dashboard action desk", () => {
  it("작성 중, 0원, 마감 후 미발행 회차를 각각 집계한다", () => {
    const desk = buildDashboardActionDesk([
      { revenueDate: new Date("2026-07-01T00:00:00.000Z"), salesAmount: 100_000, status: "DRAFT" },
      { revenueDate: new Date("2026-07-02T00:00:00.000Z"), salesAmount: 0, status: "DRAFT" },
      { revenueDate: new Date("2026-07-03T00:00:00.000Z"), salesAmount: 300_000, status: "CONFIRMED" },
      { revenueDate: new Date("2026-07-04T00:00:00.000Z"), salesAmount: 400_000, status: "CONFIRMED" },
      { revenueDate: new Date("2026-07-05T00:00:00.000Z"), salesAmount: 0, status: "CANCELED" },
    ], [{ closedAt: new Date("2026-07-06T00:00:00.000Z"), totalSalesAmount: 500_000 }]);

    expect(desk.draft).toMatchObject({ count: 2, amount: 100_000, oldestDate: new Date("2026-07-01T00:00:00.000Z") });
    expect(desk.zero).toMatchObject({ count: 1, amount: 0, oldestDate: new Date("2026-07-02T00:00:00.000Z") });
    expect(desk.unissued).toMatchObject({ count: 1, amount: 500_000, oldestDate: new Date("2026-07-06T00:00:00.000Z") });
  });

  it("조치할 항목이 없으면 빈 집계를 반환한다", () => {
    expect(buildDashboardActionDesk([]).draft).toEqual({ count: 0, amount: 0, oldestDate: null });
  });

  it("부분 발행 회차는 남은 품목 금액만 미발행으로 집계한다", () => {
    const cycle = getUnissuedCloseCycle({
      closedAt: new Date("2026-07-06T00:00:00.000Z"),
      totalSalesAmount: 500_000,
      snapshotJson: JSON.stringify({
        revenueEntryIds: ["r1", "r2"],
        revenueEntries: [{ id: "r1", salesAmount: 200_000 }, { id: "r2", salesAmount: 300_000 }],
      }),
      invoiceDocuments: [{ revenueEntryIds: ["r1"], subtotal: 200_000 }],
    });

    expect(cycle).toEqual({ closedAt: new Date("2026-07-06T00:00:00.000Z"), totalSalesAmount: 300_000 });
    expect(getUnissuedCloseCycle({
      closedAt: new Date("2026-07-06T00:00:00.000Z"),
      totalSalesAmount: 500_000,
      snapshotJson: JSON.stringify({ revenueEntryIds: ["r1", "r2"] }),
      invoiceDocuments: [{ revenueEntryIds: ["r1", "r2"], subtotal: 500_000 }],
    })).toBeNull();
  });
});
