import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContractLineBillingMethod, UserRole } from "@/generated/prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  siteFindUnique: vi.fn(),
  itemFindMany: vi.fn(),
  contractCreate: vi.fn(),
  contractFindUnique: vi.fn(),
  contractFindUniqueOrThrow: vi.fn(),
  contractUpdateMany: vi.fn(),
  contractLineUpdateMany: vi.fn(),
  contractLineUpdate: vi.fn(),
  contractLineCreate: vi.fn(),
  assertMonthsOpen: vi.fn(),
  nextBusinessCode: vi.fn(),
  recordAudit: vi.fn(),
  recordSyncEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/record", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/events/bus", () => ({ recordSyncEvent: mocks.recordSyncEvent }));
vi.mock("@/lib/monthly-close/guard", () => ({ assertMonthsOpen: mocks.assertMonthsOpen }));
vi.mock("@/lib/masters/sequence", () => ({ nextBusinessCode: mocks.nextBusinessCode }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { createContract, updateContract } from "@/lib/contracts/service";

const actor = { id: "user-1", loginId: "manager", name: "매니저", role: UserRole.MANAGER, isActive: true, version: 1 };

describe("contract service billing boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.siteFindUnique.mockResolvedValue({ id: "site-1", isActive: true });
    mocks.itemFindMany.mockResolvedValue([{
      id: "item-1",
      unit: "EA",
      standardSalesPrice: 20_000,
      standardCostPrice: 10_000,
      isActive: true,
    }]);
    mocks.nextBusinessCode.mockResolvedValue("C-0001");
    mocks.contractCreate.mockImplementation(async ({ data }) => ({ id: "contract-1", version: 1, ...data }));
    mocks.contractUpdateMany.mockResolvedValue({ count: 1 });
    mocks.contractLineUpdateMany.mockResolvedValue({ count: 0 });
    mocks.contractLineUpdate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback) => callback({
      site: { findUnique: mocks.siteFindUnique },
      item: { findMany: mocks.itemFindMany },
      contract: {
        create: mocks.contractCreate,
        findUnique: mocks.contractFindUnique,
        findUniqueOrThrow: mocks.contractFindUniqueOrThrow,
        updateMany: mocks.contractUpdateMany,
      },
      contractLine: {
        updateMany: mocks.contractLineUpdateMany,
        update: mocks.contractLineUpdate,
        create: mocks.contractLineCreate,
      },
    }));
  });

  it("stores a new omitted method as canonical monthly data and audits it", async () => {
    await createContract(actor, {
      siteId: "site-1",
      title: "월정액 CCTV",
      status: "ACTIVE",
      lines: [{
        itemId: "item-1",
        quantity: 2,
        appliedSalesPrice: 20_000,
        appliedCostPrice: 10_000,
        revenueStartDate: "2026-01-15",
        revenueEndDate: "2026-12-08",
      }],
    });

    const data = mocks.contractCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
      lines: { create: [{
        billingMethod: ContractLineBillingMethod.MONTHLY_RECURRING,
        revenueStartDate: new Date("2026-01-01T00:00:00.000Z"),
        revenueEndDate: new Date("2026-12-31T00:00:00.000Z"),
      }] },
    });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "CREATE",
      after: expect.objectContaining({
        lines: expect.objectContaining({ create: [expect.objectContaining({ billingMethod: ContractLineBillingMethod.MONTHLY_RECURRING })] }),
      }),
    }));
  });

  it("preserves an omitted existing legacy method and audits before and after", async () => {
    const before = {
      id: "contract-1",
      contractNo: "C-0001",
      siteId: "site-1",
      title: "기존 계약",
      startDate: new Date("2026-01-15T00:00:00.000Z"),
      endDate: new Date("2026-12-08T00:00:00.000Z"),
      status: "ACTIVE",
      memo: null,
      version: 1,
      lines: [{
        id: "line-1",
        contractId: "contract-1",
        itemId: "item-1",
        description: null,
        billingMethod: ContractLineBillingMethod.LEGACY_TOTAL,
        quantity: 2,
        unit: "EA",
        standardSalesPriceSnapshot: 20_000,
        appliedSalesPrice: 20_000,
        standardCostPriceSnapshot: 10_000,
        appliedCostPrice: 10_000,
        priceOverrideReason: null,
        priceOverriddenById: null,
        priceOverriddenAt: null,
        revenueStartDate: new Date("2026-01-15T00:00:00.000Z"),
        revenueEndDate: new Date("2026-12-08T00:00:00.000Z"),
        isActive: true,
        item: { id: "item-1", code: "I-1", name: "CCTV", isActive: true },
      }],
    };
    const after = { ...before, version: 2, lines: [{ ...before.lines[0], description: "메모 변경" }] };
    mocks.contractFindUnique.mockResolvedValue(before);
    mocks.contractFindUniqueOrThrow.mockResolvedValue(after);

    await updateContract(actor, "contract-1", {
      version: 1,
      siteId: "site-1",
      title: "기존 계약",
      status: "ACTIVE",
      lines: [{
        id: "line-1",
        itemId: "item-1",
        description: "메모 변경",
        quantity: 2,
        appliedSalesPrice: 20_000,
        appliedCostPrice: 10_000,
        revenueStartDate: "2026-01-15",
        revenueEndDate: "2026-12-08",
      }],
    });

    expect(mocks.contractLineUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ billingMethod: ContractLineBillingMethod.LEGACY_TOTAL }),
    }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      before: expect.objectContaining({ lines: [expect.objectContaining({ billingMethod: ContractLineBillingMethod.LEGACY_TOTAL })] }),
      after: expect.objectContaining({ lines: [expect.objectContaining({ billingMethod: ContractLineBillingMethod.LEGACY_TOTAL })] }),
    }));
  });

  it.each([
    {
      billingMethod: ContractLineBillingMethod.MONTHLY_RECURRING,
      inputStart: "2026-01",
      inputEnd: "2026-02",
      storedStart: new Date("2026-01-01T00:00:00.000Z"),
      storedEnd: new Date("2026-02-28T00:00:00.000Z"),
    },
    {
      billingMethod: ContractLineBillingMethod.PRORATED_TOTAL,
      inputStart: "2026-01-15",
      inputEnd: "2026-02-08",
      storedStart: new Date("2026-01-15T00:00:00.000Z"),
      storedEnd: new Date("2026-02-08T00:00:00.000Z"),
    },
  ])("persists an explicit legacy transition to $billingMethod", async ({ billingMethod, inputStart, inputEnd, storedStart, storedEnd }) => {
    const before = {
      id: "contract-1", contractNo: "C-0001", siteId: "site-1", title: "기존 계약",
      startDate: new Date("2026-01-15T00:00:00.000Z"), endDate: new Date("2026-12-08T00:00:00.000Z"),
      status: "ACTIVE", memo: null, version: 1,
      lines: [{
        id: "line-1", contractId: "contract-1", itemId: "item-1", description: null,
        billingMethod: ContractLineBillingMethod.LEGACY_TOTAL, quantity: 2, unit: "EA",
        standardSalesPriceSnapshot: 20_000, appliedSalesPrice: 20_000,
        standardCostPriceSnapshot: 10_000, appliedCostPrice: 10_000,
        priceOverrideReason: null, priceOverriddenById: null, priceOverriddenAt: null,
        revenueStartDate: new Date("2026-01-15T00:00:00.000Z"),
        revenueEndDate: new Date("2026-12-08T00:00:00.000Z"), isActive: true,
        item: { id: "item-1", code: "I-1", name: "CCTV", isActive: true },
      }],
    };
    mocks.contractFindUnique.mockResolvedValue(before);
    mocks.contractFindUniqueOrThrow.mockResolvedValue({ ...before, version: 2 });

    await updateContract(actor, "contract-1", {
      version: 1, siteId: "site-1", title: "기존 계약", status: "ACTIVE",
      lines: [{
        id: "line-1", itemId: "item-1", billingMethod, quantity: 2,
        appliedSalesPrice: 20_000, appliedCostPrice: 10_000,
        revenueStartDate: inputStart, revenueEndDate: inputEnd,
      }],
    });

    expect(mocks.contractLineUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        billingMethod,
        revenueStartDate: storedStart,
        revenueEndDate: storedEnd,
      }),
    }));
  });
});
