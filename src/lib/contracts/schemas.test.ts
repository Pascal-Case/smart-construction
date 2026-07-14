import { describe, expect, it } from "vitest";

import { contractCreateInputSchema, contractListQuerySchema, contractRevenueCandidateQuerySchema } from "@/lib/contracts/schemas";

describe("contract input schema", () => {
  it("신규 계약번호를 입력에서 제외한다", () => {
    const parsed = contractCreateInputSchema.parse({
      contractNo: "MANUAL-0001",
      siteId: "site-1",
      title: "강남 현장 계약",
      status: "ACTIVE",
      lines: [{
        itemId: "item-1",
        quantity: 1,
        appliedSalesPrice: 100_000,
        appliedCostPrice: 50_000,
        revenueStartDate: "2026-07",
        revenueEndDate: "2026-12",
      }],
    });

    expect(parsed).not.toHaveProperty("contractNo");
  });
});

describe("contract revenue candidate query schema", () => {
  it("후보 조회 기본값을 20건 첫 페이지로 정규화한다", () => {
    expect(contractRevenueCandidateQuerySchema.parse({})).toEqual({
      q: "",
      siteId: "",
      page: 1,
      pageSize: 20,
    });
  });

  it("검색어를 정리하고 페이지 크기를 10~50건으로 제한한다", () => {
    expect(contractRevenueCandidateQuerySchema.parse({ q: "  C-001  ", page: "2", pageSize: "50" }))
      .toMatchObject({ q: "C-001", page: 2, pageSize: 50 });
    expect(() => contractRevenueCandidateQuerySchema.parse({ pageSize: "9" })).toThrow();
    expect(() => contractRevenueCandidateQuerySchema.parse({ pageSize: "51" })).toThrow();
  });
});

describe("contract list query schema", () => {
  it("defaults to final-modified descending", () => {
    expect(contractListQuerySchema.parse({})).toMatchObject({ sort: "updatedAt", order: "desc", page: 1, pageSize: 20 });
  });

  it("accepts visible scalar and aggregate sort keys and rejects unknown keys", () => {
    for (const sort of ["contractNo", "title", "site", "period", "itemCount", "baseAmount", "status", "updatedAt"]) {
      expect(contractListQuerySchema.safeParse({ sort, order: "asc" }).success).toBe(true);
    }
    expect(contractListQuerySchema.safeParse({ sort: "memo", order: "asc" }).success).toBe(false);
  });
});
