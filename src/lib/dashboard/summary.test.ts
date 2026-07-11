import { describe, expect, it } from "vitest";

import { buildDashboardSummary, dashboardYearRange } from "@/lib/dashboard/summary";

describe("dashboard summary", () => {
  it("한국 시간 기준 현재 연도의 시작과 다음 연도 시작을 반환한다", () => {
    const range = dashboardYearRange(new Date("2025-12-31T16:00:00.000Z"));

    expect(range.year).toBe(2026);
    expect(range.startDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(range.endDate.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("올해 매출과 이익을 월별 및 전체로 집계하고 취소 건은 제외한다", () => {
    const summary = buildDashboardSummary({
      year: 2026,
      siteCount: 3,
      invoiceCount: 2,
      revenues: [
        { revenueDate: new Date("2026-01-15T00:00:00.000Z"), salesAmount: 100_000, costAmount: 60_000, status: "CONFIRMED" },
        { revenueDate: new Date("2026-01-31T00:00:00.000Z"), salesAmount: 20_000, costAmount: null, status: "DRAFT" },
        { revenueDate: new Date("2026-02-01T00:00:00.000Z"), salesAmount: 50_000, costAmount: 70_000, status: "CONFIRMED" },
        { revenueDate: new Date("2026-02-10T00:00:00.000Z"), salesAmount: 999_000, costAmount: 0, status: "CANCELED" },
      ],
    });

    expect(summary).toMatchObject({ year: 2026, siteCount: 3, invoiceCount: 2, totalSales: 170_000, totalProfit: 40_000 });
    expect(summary.months).toHaveLength(12);
    expect(summary.months[0]).toEqual({ month: "2026-01", label: "1월", salesAmount: 120_000, profit: 60_000 });
    expect(summary.months[1]).toEqual({ month: "2026-02", label: "2월", salesAmount: 50_000, profit: -20_000 });
    expect(summary.months[11]).toEqual({ month: "2026-12", label: "12월", salesAmount: 0, profit: 0 });
  });
});
