import { describe, expect, it } from "vitest";

import { filterMonthlyDetails } from "@/lib/reports/monthly-exceptions";

const rows = [
  { id: "draft", status: "DRAFT", salesAmount: 100_000 },
  { id: "zero", status: "CONFIRMED", salesAmount: 0 },
  { id: "confirmed", status: "CONFIRMED", salesAmount: 200_000 },
];

describe("filterMonthlyDetails", () => {
  it("작성 중 매출만 분리한다", () => {
    expect(filterMonthlyDetails(rows, "DRAFT").map((row) => row.id)).toEqual(["draft"]);
  });

  it("0원 매출만 분리한다", () => {
    expect(filterMonthlyDetails(rows, "ZERO").map((row) => row.id)).toEqual(["zero"]);
  });

  it("전체 선택은 원래 순서를 유지한다", () => {
    expect(filterMonthlyDetails(rows, "ALL")).toEqual(rows);
  });
});
