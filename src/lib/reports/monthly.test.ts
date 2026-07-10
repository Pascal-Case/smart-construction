import { describe, expect, it } from "vitest";

import { enumerateMonths, monthlyReportQuerySchema } from "@/lib/reports/monthly-query";

describe("monthly report", () => {
  it("연도를 넘는 월 범위를 순서대로 만든다", () => {
    expect(enumerateMonths("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("역전 범위와 24개월 초과 조회를 거부한다", () => {
    expect(monthlyReportQuerySchema.safeParse({ startMonth: "2026-03", endMonth: "2026-02" }).success).toBe(false);
    expect(monthlyReportQuerySchema.safeParse({ startMonth: "2024-01", endMonth: "2026-01" }).success).toBe(false);
  });
});
