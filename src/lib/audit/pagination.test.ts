import { describe, expect, it } from "vitest";

import { auditPagination } from "@/lib/audit/pagination";

describe("auditPagination", () => {
  it("20건 단위의 페이지와 조회 위치를 계산한다", () => {
    expect(auditPagination("2", 45)).toEqual({ page: 2, pageSize: 20, totalPages: 3, skip: 20 });
  });

  it("잘못되거나 범위를 벗어난 페이지를 유효 범위로 보정한다", () => {
    expect(auditPagination("invalid", 0)).toEqual({ page: 1, pageSize: 20, totalPages: 1, skip: 0 });
    expect(auditPagination("99", 45)).toEqual({ page: 3, pageSize: 20, totalPages: 3, skip: 40 });
    expect(auditPagination("-3", 45).page).toBe(1);
  });
});
