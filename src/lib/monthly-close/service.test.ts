import { describe, expect, it, vi } from "vitest";

import { ContractLineBillingMethod, UserRole } from "@/generated/prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: vi.fn() } }));
vi.mock("@/lib/audit/record", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/events/bus", () => ({ recordSyncEvent: vi.fn() }));

import { prisma } from "@/lib/db/prisma";
import { closeMonthlySites, getMonthCloseControlRoom, reopenMonthlyClose, runCloseTargets } from "@/lib/monthly-close/service";

const manager = { id: "m1", loginId: "manager", name: "매니저", role: UserRole.MANAGER, isActive: true, version: 1 };
const viewer = { ...manager, id: "v1", loginId: "viewer", name: "조회자", role: UserRole.VIEWER };

describe("monthly close service orchestration", () => {
  it("월마감은 월정액 공용 기대 초안을 사용해 확정 snapshot 차이를 노출한다", async () => {
    const site = { id: "site-1", code: "S001", name: "A현장" };
    const tx = {
      site: {
        findMany: vi.fn().mockResolvedValue([site]),
        findUnique: vi.fn().mockResolvedValue(site),
      },
      contract: { findMany: vi.fn().mockResolvedValue([{
        id: "contract-1",
        title: "CCTV 임대",
        siteId: site.id,
        lines: [{
          id: "line-1",
          billingMethod: ContractLineBillingMethod.MONTHLY_RECURRING,
          itemId: "item-1",
          description: null,
          quantity: 2,
          unit: "EA",
          standardSalesPriceSnapshot: 20_000,
          appliedSalesPrice: 20_000,
          standardCostPriceSnapshot: 12_000,
          appliedCostPrice: 12_000,
          priceOverrideReason: null,
          revenueStartDate: new Date("2026-07-01T00:00:00.000Z"),
          revenueEndDate: new Date("2026-08-31T00:00:00.000Z"),
          item: { name: "CCTV" },
        }],
      }]) },
      revenueEntry: { findMany: vi.fn().mockResolvedValue([{
        id: "revenue-1",
        version: 2,
        revenueDate: new Date("2026-07-01T00:00:00.000Z"),
        sourceType: "CONTRACT",
        status: "CONFIRMED",
        generatedKey: "line-1:2026-07",
        contractId: "contract-1",
        contractLineId: "line-1",
        itemId: "item-1",
        title: "CCTV 임대 - CCTV",
        quantity: 2,
        appliedSalesPrice: 20_000,
        salesAmount: 27_200,
        costAmount: 16_320,
        priceOverrideReason: null,
      }]) },
      monthlyCloseExceptionReview: { findMany: vi.fn().mockResolvedValue([]) },
      invoiceDocument: { findMany: vi.fn().mockResolvedValue([]) },
      monthlyClose: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    vi.mocked(prisma.$transaction).mockImplementation((async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) as never);

    const result = await getMonthCloseControlRoom({ month: "2026-07", siteId: site.id, view: "all" });

    expect(result.rows[0].evaluation.exceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "CONTRACT_DIFFERENCE:line-1:2026-07",
        kind: "CONTRACT_DIFFERENCE",
        blocking: true,
        expected: expect.objectContaining({ salesAmount: 40_000 }),
        actual: expect.objectContaining({ status: "CONFIRMED", salesAmount: 27_200 }),
      }),
    ]));
  });

  it("일괄 마감은 현장별 결과를 보존해 부분 성공한다", async () => {
    const result = await runCloseTargets([
      { siteId: "site-1", expectedFingerprint: "f1" },
      { siteId: "site-2", expectedFingerprint: "f2" },
      { siteId: "site-3", expectedFingerprint: "f3" },
    ], async (target) => target.siteId === "site-1"
      ? { siteId: target.siteId, outcome: "CLOSED" as const, cycleId: "cycle-1" }
      : target.siteId === "site-2"
        ? { siteId: target.siteId, outcome: "BLOCKED" as const, blockingCount: 2 }
        : { siteId: target.siteId, outcome: "CHANGED" as const });

    expect(result).toEqual([
      { siteId: "site-1", outcome: "CLOSED", cycleId: "cycle-1" },
      { siteId: "site-2", outcome: "BLOCKED", blockingCount: 2 },
      { siteId: "site-3", outcome: "CHANGED" },
    ]);
  });

  it("VIEWER는 마감을, MANAGER는 재개방을 서비스에서도 수행하지 못한다", async () => {
    await expect(closeMonthlySites(viewer, {
      month: "2026-07",
      targets: [{ siteId: "site-1", expectedFingerprint: "f1" }],
    })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    await expect(reopenMonthlyClose(manager, "close-1", {
      expectedVersion: 1,
      latestCycleId: "cycle-1",
      reason: "수정",
    })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });
});
