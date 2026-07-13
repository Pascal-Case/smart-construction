import { describe, expect, it } from "vitest";

import { itemInputSchema, itemListQuerySchema, siteInputSchema, siteListQuerySchema } from "@/lib/masters/schemas";

describe("master schemas", () => {
  it("현장 종료일이 시작일보다 빠르면 거부한다", () => {
    const result = siteInputSchema.safeParse({ name: "A현장", startDate: "2026-07-10", endDate: "2026-07-01" });
    expect(result.success).toBe(false);
  });

  it("품목 단가는 0 이상의 원 단위 정수만 허용한다", () => {
    expect(itemInputSchema.safeParse({ name: "CCTV", unit: "EA", standardSalesPrice: 220000, standardCostPrice: 100000 }).success).toBe(true);
    expect(itemInputSchema.safeParse({ name: "CCTV", unit: "EA", standardSalesPrice: -1, standardCostPrice: 0 }).success).toBe(false);
  });

  it("목록 조회 기본값과 페이지 크기 상한을 적용한다", () => {
    expect(siteListQuerySchema.parse({})).toMatchObject({ status: "active", sort: "updatedAt", order: "desc", page: 1, pageSize: 20 });
    expect(itemListQuerySchema.parse({})).toMatchObject({ status: "active", sort: "updatedAt", order: "desc", page: 1, pageSize: 20 });
    expect(siteListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it("화면에 표시하는 정렬 키만 각 마스터에서 허용한다", () => {
    expect(siteListQuerySchema.safeParse({ sort: "managerName", order: "asc" }).success).toBe(true);
    expect(siteListQuerySchema.safeParse({ sort: "unit", order: "asc" }).success).toBe(false);
    expect(itemListQuerySchema.safeParse({ sort: "standardSalesPrice", order: "desc" }).success).toBe(true);
    expect(itemListQuerySchema.safeParse({ sort: "customerName", order: "asc" }).success).toBe(false);
  });
});
