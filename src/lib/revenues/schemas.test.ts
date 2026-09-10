import { describe, expect, it } from "vitest";

import { buildRevenueWhere } from "@/lib/revenues/query";
import { contractRevenueBatchConfirmSchema, contractRevenueGenerationBatchPreviewSchema, contractRevenueGenerationBatchSchema, revenueInputSchema, revenueListQuerySchema } from "@/lib/revenues/schemas";

const validRevenue = {
  siteId: "site-1",
  contractCategoryId: "category-1",
  revenueDate: "2026-07-11",
  sourceType: "MANUAL" as const,
  title: "직접 매출",
  salesAmount: 100_000,
};

describe("revenueInputSchema", () => {
  it("직접 매출은 별도 선택이 없으면 확정 등록한다", () => {
    expect(revenueInputSchema.parse(validRevenue).saveStatus).toBe("CONFIRMED");
  });

  it("계약 매출 일괄 확정은 중복 선택을 거부한다", () => {
    expect(() => contractRevenueBatchConfirmSchema.parse({ entries: [{ id: "revenue-1", version: 1 }, { id: "revenue-1", version: 1 }] })).toThrow("중복된 매출 선택");
  });

  it("계약 매출 일괄 생성은 중복과 100건 초과 선택을 거부한다", () => {
    expect(() => contractRevenueGenerationBatchPreviewSchema.parse({ contractIds: ["contract-1", "contract-1"] })).toThrow("중복된 계약 선택");
    expect(() => contractRevenueGenerationBatchPreviewSchema.parse({ contractIds: Array.from({ length: 101 }, (_, index) => `contract-${index}`) })).toThrow("최대 100건");
    expect(() => contractRevenueGenerationBatchSchema.parse({ targets: [{ contractId: "contract-1", expectedVersion: 1 }, { contractId: "contract-1", expectedVersion: 1 }] })).toThrow("중복된 계약 선택");
  });

  it("사용자가 선택하면 작성 중으로 저장할 수 있다", () => {
    expect(revenueInputSchema.parse({ ...validRevenue, saveStatus: "DRAFT" }).saveStatus).toBe("DRAFT");
  });
});

describe("revenueListQuerySchema", () => {
  it("최종수정일 최신순을 기본값으로 사용한다", () => {
    expect(revenueListQuerySchema.parse({})).toMatchObject({ sort: "updatedAt", order: "desc", page: 1, pageSize: 20 });
  });

  it("메인 표에 표시하는 데이터 컬럼 정렬만 허용한다", () => {
    for (const sort of ["revenueDate", "site", "source", "content", "quantityPrice", "salesAmount", "costAmount", "status", "updatedAt"]) {
      expect(revenueListQuerySchema.safeParse({ sort, order: "asc" }).success).toBe(true);
    }
    expect(revenueListQuerySchema.safeParse({ sort: "description", order: "asc" }).success).toBe(false);
  });

  it("대시보드에서 0원 예외 목록을 요청할 수 있다", () => {
    expect(revenueListQuerySchema.parse({ exception: "ZERO" }).exception).toBe("ZERO");
    expect(revenueListQuerySchema.parse({}).exception).toBe("all");
  });

  it("0원 예외 조회에서 취소 매출을 제외한다", () => {
    expect(buildRevenueWhere(revenueListQuerySchema.parse({ exception: "ZERO" }))).toMatchObject({
      AND: [{ salesAmount: 0 }, { status: { not: "CANCELED" } }],
    });
  });
});
