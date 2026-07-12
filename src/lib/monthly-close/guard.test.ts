import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { assertMonthsOpen } from "@/lib/monthly-close/guard";

describe("monthly close write guard", () => {
  it("모든 대상 월이 열려 있으면 통과한다", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await expect(assertMonthsOpen({ monthlyClose: { findMany } } as never, [
      { siteId: "site-1", months: ["2026-07", "2026-08"] },
    ])).resolves.toBeUndefined();
    expect(findMany).toHaveBeenCalledOnce();
  });

  it("하나라도 닫힌 월이 있으면 동일 도메인 오류로 거부한다", async () => {
    const findMany = vi.fn().mockResolvedValue([{ siteId: "site-1", month: "2026-07" }]);
    await expect(assertMonthsOpen({ monthlyClose: { findMany } } as never, [
      { siteId: "site-1", months: ["2026-07"] },
    ])).rejects.toMatchObject({ status: 409, code: "MONTH_CLOSED" });
  });

  it("중복 site/month target을 하나의 조회 조건으로 정규화한다", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await assertMonthsOpen({ monthlyClose: { findMany } } as never, [
      { siteId: "site-1", months: ["2026-07", "2026-07"] },
      { siteId: "site-1", months: ["2026-07"] },
    ]);
    const call = findMany.mock.calls[0][0];
    expect(call.where.OR).toEqual([{ siteId: "site-1", month: { in: ["2026-07"] } }]);
  });
});
