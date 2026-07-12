import { describe, expect, it } from "vitest";

import { buildDashboardActionDesk } from "@/lib/dashboard/action-desk";

describe("dashboard action desk", () => {
  it("작성 중, 0원, 미발행 확정 매출을 각각 집계한다", () => {
    const desk = buildDashboardActionDesk([
      { revenueDate: new Date("2026-07-01T00:00:00.000Z"), salesAmount: 100_000, status: "DRAFT", hasCurrentInvoice: false },
      { revenueDate: new Date("2026-07-02T00:00:00.000Z"), salesAmount: 0, status: "DRAFT", hasCurrentInvoice: false },
      { revenueDate: new Date("2026-07-03T00:00:00.000Z"), salesAmount: 300_000, status: "CONFIRMED", hasCurrentInvoice: false },
      { revenueDate: new Date("2026-07-04T00:00:00.000Z"), salesAmount: 400_000, status: "CONFIRMED", hasCurrentInvoice: true },
      { revenueDate: new Date("2026-07-05T00:00:00.000Z"), salesAmount: 0, status: "CANCELED", hasCurrentInvoice: false },
    ]);

    expect(desk.draft).toMatchObject({ count: 2, amount: 100_000, oldestDate: new Date("2026-07-01T00:00:00.000Z") });
    expect(desk.zero).toMatchObject({ count: 1, amount: 0, oldestDate: new Date("2026-07-02T00:00:00.000Z") });
    expect(desk.unissued).toMatchObject({ count: 1, amount: 300_000, oldestDate: new Date("2026-07-03T00:00:00.000Z") });
  });

  it("조치할 항목이 없으면 빈 집계를 반환한다", () => {
    expect(buildDashboardActionDesk([]).draft).toEqual({ count: 0, amount: 0, oldestDate: null });
  });
});
