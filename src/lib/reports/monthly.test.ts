import { describe, expect, it } from "vitest";

import { currentMonthKey, currentYearMonthRange, enumerateMonths, monthlyReportQuerySchema } from "@/lib/reports/monthly-query";

describe("monthly report", () => {
  it("연도를 넘는 월 범위를 순서대로 만든다", () => {
    expect(enumerateMonths("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("역전 범위와 24개월 초과 조회를 거부한다", () => {
    expect(monthlyReportQuerySchema.safeParse({ startMonth: "2026-03", endMonth: "2026-02" }).success).toBe(false);
    expect(monthlyReportQuerySchema.safeParse({ startMonth: "2024-01", endMonth: "2026-01" }).success).toBe(false);
  });
  it("한국 시간의 현재 연도 1월부터 12월까지를 기본 범위로 만든다", () => {
    expect(currentYearMonthRange(new Date("2025-12-31T16:00:00.000Z")))
      .toEqual({ startMonth: "2026-01", endMonth: "2026-12" });
  });
  it("한국 시간의 현재 월을 기본 매출월로 만든다", () => {
    expect(currentMonthKey(new Date("2025-12-31T16:00:00.000Z"))).toBe("2026-01");
  });
});
