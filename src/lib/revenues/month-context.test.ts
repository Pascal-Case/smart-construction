import { describe, expect, it } from "vitest";

import { revenueMonthBounds } from "@/lib/revenues/month-context";

describe("revenueMonthBounds", () => {
  it("선택한 월의 첫날과 마지막 날을 반환한다", () => {
    expect(revenueMonthBounds("2026-07")).toEqual({
      min: "2026-07-01",
      max: "2026-07-31",
    });
  });

  it("윤년 2월의 마지막 날을 계산한다", () => {
    expect(revenueMonthBounds("2028-02").max).toBe("2028-02-29");
  });
});
