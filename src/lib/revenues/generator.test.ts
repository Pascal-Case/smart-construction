import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContractLineBillingMethod, RevenueStatus, UserRole } from "@/generated/prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: vi.fn() } }));
vi.mock("@/lib/audit/record", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/events/bus", () => ({ recordSyncEvent: vi.fn() }));
vi.mock("@/lib/monthly-close/guard", () => ({ assertMonthsOpen: vi.fn() }));

import { recordAudit } from "@/lib/audit/record";
import { prisma } from "@/lib/db/prisma";
import { recordSyncEvent } from "@/lib/events/bus";
import { assertMonthsOpen } from "@/lib/monthly-close/guard";
import { generateContractRevenues } from "@/lib/revenues/generator";

const actor = { id: "manager-1", loginId: "manager", name: "매니저", role: UserRole.MANAGER, isActive: true, version: 1 };
const contract = {
  id: "contract-1",
  contractNo: "C-001",
  title: "CCTV 임대",
  siteId: "site-1",
  status: "ACTIVE",
  version: 1,
  site: { name: "A현장" },
  lines: [{
    id: "line-1",
    itemId: "item-1",
    description: null,
    billingMethod: ContractLineBillingMethod.MONTHLY_RECURRING,
    quantity: 2,
    unit: "EA",
    standardSalesPriceSnapshot: 20_000,
    appliedSalesPrice: 20_000,
    standardCostPriceSnapshot: 12_000,
    appliedCostPrice: 12_000,
    priceOverrideReason: null,
    revenueStartDate: new Date("2026-07-01T00:00:00.000Z"),
    revenueEndDate: new Date("2026-07-31T00:00:00.000Z"),
    item: { name: "CCTV" },
  }],
};

function existing(overrides: Record<string, unknown> = {}) {
  return {
    id: "revenue-1",
    version: 3,
    status: RevenueStatus.DRAFT,
    cancelReason: null,
    generatedKey: "line-1:2026-07",
    siteId: "site-1",
    itemId: "item-1",
    title: "CCTV 임대 - CCTV",
    description: null,
    quantity: 2,
    unit: "EA",
    standardSalesPriceSnapshot: 20_000,
    appliedSalesPrice: 20_000,
    salesAmount: 1,
    prorationDays: 31,
    daysInMonth: 31,
    standardCostPriceSnapshot: 12_000,
    appliedCostPrice: 12_000,
    costAmount: 1,
    priceOverrideReason: null,
    revenueDate: new Date("2026-07-01T00:00:00.000Z"),
    servicePeriodStart: new Date("2026-07-01T00:00:00.000Z"),
    servicePeriodEnd: new Date("2026-07-31T00:00:00.000Z"),
    ...overrides,
  };
}

function transactionWith(rows: ReturnType<typeof existing>[]) {
  const tx = {
    contract: { findUnique: vi.fn().mockResolvedValue(contract) },
    revenueEntry: {
      findMany: vi.fn().mockResolvedValue(rows),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  vi.mocked(prisma.$transaction).mockImplementation((async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) as never);
  return tx;
}

describe("contract revenue generator write guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertMonthsOpen).mockResolvedValue(undefined);
  });

  it("미리보기 뒤 확정된 UPDATE 대상은 DRAFT와 버전을 모두 조건으로 검사하고 충돌 처리한다", async () => {
    const tx = transactionWith([existing()]);

    await expect(generateContractRevenues(actor, contract.id)).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    expect(tx.revenueEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "revenue-1", version: 3, status: RevenueStatus.DRAFT },
    }));
    expect(recordAudit).not.toHaveBeenCalled();
    expect(recordSyncEvent).not.toHaveBeenCalled();
  });

  it("제외 월 CANCEL도 DRAFT와 버전을 함께 검사해 동시 확정을 덮어쓰지 않는다", async () => {
    const tx = transactionWith([existing({
      generatedKey: "line-1:2026-08",
      revenueDate: new Date("2026-08-01T00:00:00.000Z"),
      servicePeriodStart: new Date("2026-08-01T00:00:00.000Z"),
      servicePeriodEnd: new Date("2026-08-31T00:00:00.000Z"),
    })]);

    await expect(generateContractRevenues(actor, contract.id)).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    expect(tx.revenueEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "revenue-1", version: 3, status: RevenueStatus.DRAFT },
    }));
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("자동 취소 행은 미리보기 당시 CANCELED 상태와 버전을 조건으로 재활성화한다", async () => {
    const tx = transactionWith([existing({
      status: RevenueStatus.CANCELED,
      cancelReason: "계약 변경으로 자동 매출 생성 대상에서 제외",
    })]);
    tx.revenueEntry.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(generateContractRevenues(actor, contract.id)).resolves.toMatchObject({ update: 1 });
    expect(tx.revenueEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "revenue-1", version: 3, status: RevenueStatus.CANCELED },
    }));
  });

  it("쓰기 직전 트랜잭션에서 월 잠금을 다시 확인하고 닫힌 월이면 어떤 행도 변경하지 않는다", async () => {
    const tx = transactionWith([]);
    vi.mocked(assertMonthsOpen).mockRejectedValueOnce(new Error("MONTH_CLOSED"));

    await expect(generateContractRevenues(actor, contract.id)).rejects.toThrow("MONTH_CLOSED");
    expect(assertMonthsOpen).toHaveBeenCalledWith(tx, [{ siteId: "site-1", months: ["2026-07"] }]);
    expect(tx.revenueEntry.create).not.toHaveBeenCalled();
    expect(tx.revenueEntry.updateMany).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
