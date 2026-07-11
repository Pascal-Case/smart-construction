import { describe, expect, it } from "vitest";

import { revenueInputSchema } from "@/lib/revenues/schemas";

const validRevenue = {
  siteId: "site-1",
  revenueDate: "2026-07-11",
  sourceType: "MANUAL" as const,
  title: "직접 매출",
  salesAmount: 100_000,
};

describe("revenueInputSchema", () => {
  it("직접 매출은 별도 선택이 없으면 확정 등록한다", () => {
    expect(revenueInputSchema.parse(validRevenue).saveStatus).toBe("CONFIRMED");
  });

  it("사용자가 선택하면 작성 중으로 저장할 수 있다", () => {
    expect(revenueInputSchema.parse({ ...validRevenue, saveStatus: "DRAFT" }).saveStatus).toBe("DRAFT");
  });
});
