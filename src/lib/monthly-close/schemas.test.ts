import { describe, expect, it } from "vitest";

import {
  closeMonthlySitesSchema,
  monthlyCloseQuerySchema,
  reopenMonthlyCloseSchema,
  reviewMonthlyCloseExceptionSchema,
} from "@/lib/monthly-close/schemas";

describe("monthly close schemas", () => {
  it("조회 month와 view를 정규화한다", () => {
    expect(monthlyCloseQuerySchema.parse({ month: "2026-07" }))
      .toEqual({ month: "2026-07", siteId: "", view: "exceptions" });
    expect(() => monthlyCloseQuerySchema.parse({ month: "2026-13" })).toThrow();
  });

  it("명시적 정렬은 키와 방향을 함께 요구한다", () => {
    expect(monthlyCloseQuerySchema.parse({ month: "2026-07", sort: "sales", order: "desc" }))
      .toMatchObject({ sort: "sales", order: "desc" });
    expect(monthlyCloseQuerySchema.safeParse({ month: "2026-07", sort: "sales" }).success).toBe(false);
    expect(monthlyCloseQuerySchema.safeParse({ month: "2026-07", sort: "detail", order: "asc" }).success).toBe(false);
  });

  it("중복 현장 close target과 빈 사유를 거부한다", () => {
    const target = { siteId: "site-1", expectedFingerprint: "a".repeat(64) };
    expect(() => closeMonthlySitesSchema.parse({ month: "2026-07", targets: [target, target] })).toThrow();
    expect(() => reviewMonthlyCloseExceptionSchema.parse({
      month: "2026-07", siteId: "site-1", exceptionKey: "DIRECT_INPUT:1",
      expectedFingerprint: "a".repeat(64), reason: " ",
    })).toThrow();
    expect(() => reopenMonthlyCloseSchema.parse({ expectedVersion: 1, latestCycleId: "cycle-1", reason: "" })).toThrow();
  });
});
