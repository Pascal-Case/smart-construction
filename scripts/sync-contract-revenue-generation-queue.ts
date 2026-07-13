import "dotenv/config";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "../src/generated/prisma/client";
import { parseServerEnv } from "../src/lib/env/schema";
import {
  buildContractRevenueDrafts,
  buildGenerationRows,
  hasActionableGenerationRows,
} from "../src/lib/revenues/expected";

const { DATABASE_URL } = parseServerEnv(process.env);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: DATABASE_URL }) });
const batchSize = 100;

let cursor: string | undefined;
let pendingCount = 0;
let syncedCount = 0;

await prisma.contractRevenueGenerationQueue.deleteMany({
  where: { contract: { status: { not: "ACTIVE" } } },
});

while (true) {
  const contracts = await prisma.contract.findMany({
    where: { status: "ACTIVE" },
    include: {
      lines: {
        where: { isActive: true },
        include: { item: { select: { name: true } } },
        orderBy: { sortOrder: "asc" },
      },
      revenueEntries: { where: { sourceType: "CONTRACT" } },
    },
    orderBy: { id: "asc" },
    take: batchSize,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  if (!contracts.length) break;

  await prisma.$transaction(async (tx) => {
    for (const contract of contracts) {
      const actionable = hasActionableGenerationRows(buildGenerationRows(
        buildContractRevenueDrafts(contract),
        contract.revenueEntries,
      ));
      if (actionable) {
        await tx.contractRevenueGenerationQueue.upsert({
          where: { contractId: contract.id },
          create: { contractId: contract.id, pendingAt: contract.updatedAt },
          update: {},
        });
        pendingCount += 1;
      } else {
        await tx.contractRevenueGenerationQueue.deleteMany({ where: { contractId: contract.id } });
        syncedCount += 1;
      }
    }
  });

  cursor = contracts.at(-1)?.id;
}

await prisma.$disconnect();
console.log(`계약 매출 처리대기 동기화 완료: 대기 ${pendingCount}건, 동기화 ${syncedCount}건`);
