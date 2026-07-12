import { describe, expect, it, vi } from "vitest";

import { UserRole } from "@/generated/prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: vi.fn() } }));
vi.mock("@/lib/audit/record", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/events/bus", () => ({ recordSyncEvent: vi.fn() }));

import { closeMonthlySites, reopenMonthlyClose, runCloseTargets } from "@/lib/monthly-close/service";

const manager = { id: "m1", loginId: "manager", name: "매니저", role: UserRole.MANAGER, isActive: true, version: 1 };
const viewer = { ...manager, id: "v1", loginId: "viewer", name: "조회자", role: UserRole.VIEWER };

describe("monthly close service orchestration", () => {
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
