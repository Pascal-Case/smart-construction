import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole } from "@/generated/prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  itemCreate: vi.fn(),
  assertItemIdentityAvailable: vi.fn(),
  nextBusinessCode: vi.fn(),
  recordAudit: vi.fn(),
  recordSyncEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/record", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/events/bus", () => ({ recordSyncEvent: mocks.recordSyncEvent }));
vi.mock("@/lib/masters/identity", () => ({ assertItemIdentityAvailable: mocks.assertItemIdentityAvailable }));
vi.mock("@/lib/masters/sequence", () => ({ nextBusinessCode: mocks.nextBusinessCode }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { createItem } from "@/lib/masters/item-service";

const actor = { id: "user-1", loginId: "manager", name: "매니저", role: UserRole.MANAGER, isActive: true, version: 1 };

describe("item service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.nextBusinessCode.mockResolvedValue("ITEM-0007");
    mocks.itemCreate.mockImplementation(async ({ data }) => ({ id: "item-1", version: 1, ...data, aliases: [] }));
    mocks.transaction.mockImplementation(async (callback) => callback({ item: { create: mocks.itemCreate } }));
  });

  it("신규 품목 코드를 항상 자동 발급하고 규격과 메모를 따로 저장한다", async () => {
    await createItem(actor, {
      name: "이동형 CCTV",
      specification: "200만 화소",
      memo: "실내용",
      unit: "EA",
      standardSalesPrice: 220_000,
      standardCostPrice: 120_000,
      isActive: true,
      aliases: [],
    });

    expect(mocks.nextBusinessCode).toHaveBeenCalledWith(expect.anything(), "item");
    expect(mocks.itemCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        code: "ITEM-0007",
        specification: "200만 화소",
        memo: "실내용",
      }),
    }));
  });
});
