import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole } from "@/generated/prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  updateMany: vi.fn(),
  queueUpsert: vi.fn(),
  assertMonthsOpen: vi.fn(),
  recordAudit: vi.fn(),
  recordSyncEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/record", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/events/bus", () => ({ recordSyncEvent: mocks.recordSyncEvent }));
vi.mock("@/lib/monthly-close/guard", () => ({ assertMonthsOpen: mocks.assertMonthsOpen }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { cancelRevenue, confirmContractRevenues } from "@/lib/revenues/service";

const actor = { id: "user-1", loginId: "manager", name: "매니저", role: UserRole.MANAGER, isActive: true, version: 1 };
const beforeRows = [
  { id: "revenue-1", siteId: "site-1", revenueDate: new Date("2026-07-01T00:00:00Z"), sourceType: "CONTRACT", status: "DRAFT", version: 1 },
  { id: "revenue-2", siteId: "site-1", revenueDate: new Date("2026-08-01T00:00:00Z"), sourceType: "CONTRACT", status: "DRAFT", version: 2 },
];
const afterRows = beforeRows.map((row) => ({ ...row, status: "CONFIRMED", version: row.version + 1 }));

describe("confirmContractRevenues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback({ revenueEntry: { findMany: mocks.findMany, updateMany: mocks.updateMany } }));
    mocks.findMany.mockResolvedValueOnce(beforeRows).mockResolvedValueOnce(afterRows);
    mocks.updateMany.mockResolvedValue({ count: 2 });
  });

  it("선택한 계약 매출을 한 트랜잭션에서 확정하고 변경 이벤트를 한 번만 기록한다", async () => {
    const result = await confirmContractRevenues(actor, { entries: [{ id: "revenue-1", version: 1 }, { id: "revenue-2", version: 2 }] });

    expect(result).toEqual(afterRows);
    expect(mocks.assertMonthsOpen).toHaveBeenCalledWith(expect.anything(), [{ siteId: "site-1", months: ["2026-07"] }, { siteId: "site-1", months: ["2026-08"] }]);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [
        { id: "revenue-1", version: 1, sourceType: "CONTRACT", status: "DRAFT" },
        { id: "revenue-2", version: 2, sourceType: "CONTRACT", status: "DRAFT" },
      ] },
      data: expect.objectContaining({ status: "CONFIRMED", confirmedById: "user-1", version: { increment: 1 } }),
    }));
    expect(mocks.recordAudit).toHaveBeenCalledTimes(2);
    expect(mocks.recordSyncEvent).toHaveBeenCalledTimes(1);
  });

  it("한 건이라도 버전이 바뀌면 전체 확정을 중단한다", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(confirmContractRevenues(actor, { entries: [{ id: "revenue-1", version: 1 }, { id: "revenue-2", version: 2 }] })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.recordSyncEvent).not.toHaveBeenCalled();
  });
});

describe("cancelRevenue contract generation queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback({
      revenueEntry: {
        findUnique: mocks.findUnique,
        findUniqueOrThrow: mocks.findUniqueOrThrow,
        updateMany: mocks.updateMany,
      },
      contractRevenueGenerationQueue: { upsert: mocks.queueUpsert },
    }));
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("사용자가 계약 매출을 취소하면 같은 트랜잭션에서 계약을 처리대기로 되돌린다", async () => {
    const before = {
      id: "revenue-1",
      contractId: "contract-1",
      siteId: "site-1",
      revenueDate: new Date("2026-07-01T00:00:00Z"),
      sourceType: "CONTRACT",
      status: "CONFIRMED",
      generatedKey: "line-1:2026-07",
      version: 2,
    };
    const after = { ...before, status: "CANCELED", generatedKey: null, version: 3 };
    mocks.findUnique.mockResolvedValue(before);
    mocks.findUniqueOrThrow.mockResolvedValue(after);

    await expect(cancelRevenue(actor, before.id, before.version, "사용자 취소")).resolves.toEqual(after);

    expect(mocks.queueUpsert).toHaveBeenCalledWith({
      where: { contractId: "contract-1" },
      create: { contractId: "contract-1" },
      update: {},
    });
  });

  it("직접 매출 취소는 계약 처리대기 큐를 변경하지 않는다", async () => {
    const before = {
      id: "revenue-2",
      contractId: null,
      siteId: "site-1",
      revenueDate: new Date("2026-07-01T00:00:00Z"),
      sourceType: "MANUAL",
      status: "DRAFT",
      generatedKey: null,
      version: 1,
    };
    mocks.findUnique.mockResolvedValue(before);
    mocks.findUniqueOrThrow.mockResolvedValue({ ...before, status: "CANCELED", version: 2 });

    await cancelRevenue(actor, before.id, before.version, "사용자 취소");

    expect(mocks.queueUpsert).not.toHaveBeenCalled();
  });
});
