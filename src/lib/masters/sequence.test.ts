import { describe, expect, it, vi } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { nextBusinessCode } from "@/lib/masters/sequence";

describe("nextBusinessCode", () => {
  it("가져온 품목 코드보다 시퀀스가 뒤처져 있으면 다음 번호를 발급한다", async () => {
    const update = vi.fn().mockResolvedValue({ key: "item", value: 2 });
    const tx = {
      businessSequence: {
        upsert: vi.fn().mockResolvedValue({ key: "item", value: 1 }),
        update,
      },
      item: {
        findMany: vi.fn().mockResolvedValue([{ code: "ITEM-0001" }]),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(nextBusinessCode(tx, "item")).resolves.toBe("ITEM-0002");
    expect(update).toHaveBeenCalledWith({ where: { key: "item" }, data: { value: 2 } });
  });

  it("현장과 계약도 실제 등록된 번호 다음으로 시퀀스를 보정한다", async () => {
    const siteUpdate = vi.fn().mockResolvedValue({ key: "site", value: 13 });
    const siteTx = {
      businessSequence: {
        upsert: vi.fn().mockResolvedValue({ key: "site", value: 3 }),
        update: siteUpdate,
      },
      site: { findMany: vi.fn().mockResolvedValue([{ code: "SITE-0012" }]) },
    } as unknown as Prisma.TransactionClient;
    const contractUpdate = vi.fn().mockResolvedValue({ key: "contract", value: 8 });
    const contractTx = {
      businessSequence: {
        upsert: vi.fn().mockResolvedValue({ key: "contract", value: 2 }),
        update: contractUpdate,
      },
      contract: { findMany: vi.fn().mockResolvedValue([{ contractNo: "CONTRACT-0007" }]) },
    } as unknown as Prisma.TransactionClient;

    await expect(nextBusinessCode(siteTx, "site")).resolves.toBe("SITE-0013");
    await expect(nextBusinessCode(contractTx, "contract")).resolves.toBe("CONTRACT-0008");
  });

  it("시퀀스가 실제 코드보다 앞서 있으면 증가된 값을 그대로 사용한다", async () => {
    const update = vi.fn();
    const tx = {
      businessSequence: {
        upsert: vi.fn().mockResolvedValue({ key: "item", value: 5 }),
        update,
      },
      item: {
        findMany: vi.fn().mockResolvedValue([{ code: "ITEM-0001" }, { code: "ITEM-임시" }]),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(nextBusinessCode(tx, "item")).resolves.toBe("ITEM-0005");
    expect(update).not.toHaveBeenCalled();
  });
});
