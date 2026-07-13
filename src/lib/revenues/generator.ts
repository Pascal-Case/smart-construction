import "server-only";

import { Prisma, RevenueStatus } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import type { ContractRevenueCandidateQuery } from "@/lib/contracts/schemas";
import { prisma } from "@/lib/db/prisma";
import { recordSyncEvent } from "@/lib/events/bus";
import { normalizeCode } from "@/lib/masters/normalize";
import { assertMonthsOpen } from "@/lib/monthly-close/guard";
import {
  buildContractRevenueDrafts,
  buildGenerationRows,
  countGenerationActions,
  hasActionableGenerationRows,
  type ExpectedContractRevenue,
} from "@/lib/revenues/expected";
import { AUTO_CANCEL_REASON } from "@/lib/revenues/generation-policy";

export async function previewContractRevenues(contractId: string) {
  return prisma.$transaction((tx) => buildPreview(tx, contractId));
}

export async function generateContractRevenues(actor: SessionUser, contractId: string) {
  return prisma.$transaction(async (tx) => {
    const preview = await buildPreview(tx, contractId);
    const affectedMonths = [...new Set(preview.rows.flatMap((row) => {
      const date = row.draft?.revenueDate ?? row.existing?.revenueDate;
      return date ? [date.toISOString().slice(0, 7)] : [];
    }))];
    await assertMonthsOpen(tx, [{ siteId: preview.contract.siteId, months: affectedMonths }]);
    const counts = { create: 0, update: 0, unchanged: 0, protected: 0, cancel: 0 };
    for (const row of preview.rows) {
      if (row.action === "CREATE") {
        await tx.revenueEntry.create({ data: { ...revenueData(row.draft!), createdById: actor.id, updatedById: actor.id } }); counts.create += 1;
      } else if (row.action === "RECREATE") {
        const released = await tx.revenueEntry.updateMany({ where: { id: row.existing!.id, version: row.existing!.version, status: RevenueStatus.CANCELED, generatedKey: row.existing!.generatedKey }, data: { generatedKey: null, updatedById: actor.id, version: { increment: 1 } } });
        if (!released.count) throw new AuthError("다른 사용자가 취소 매출을 먼저 변경했습니다. 다시 미리보기해 주세요.", 409, "VERSION_CONFLICT");
        await tx.revenueEntry.create({ data: { ...revenueData(row.draft!), createdById: actor.id, updatedById: actor.id } }); counts.create += 1;
      } else if (row.action === "UPDATE") {
        const updated = await tx.revenueEntry.updateMany({ where: { id: row.existing!.id, version: row.existing!.version, status: row.existing!.status }, data: { ...revenueData(row.draft!), status: RevenueStatus.DRAFT, cancelReason: null, canceledAt: null, canceledById: null, updatedById: actor.id, version: { increment: 1 } } });
        if (!updated.count) throw new AuthError("다른 사용자가 자동 매출을 먼저 수정했습니다. 다시 미리보기해 주세요.", 409, "VERSION_CONFLICT"); counts.update += 1;
      } else if (row.action === "CANCEL") {
        const updated = await tx.revenueEntry.updateMany({ where: { id: row.existing!.id, version: row.existing!.version, status: RevenueStatus.DRAFT }, data: { status: RevenueStatus.CANCELED, cancelReason: AUTO_CANCEL_REASON, canceledById: actor.id, canceledAt: new Date(), updatedById: actor.id, version: { increment: 1 } } });
        if (!updated.count) throw new AuthError("다른 사용자가 자동 매출을 먼저 수정했습니다. 다시 미리보기해 주세요.", 409, "VERSION_CONFLICT"); counts.cancel += 1;
      } else if (row.action === "UNCHANGED") counts.unchanged += 1;
      else counts.protected += 1;
    }
    await tx.contractRevenueGenerationQueue.deleteMany({ where: { contractId } });
    await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "GENERATE", entityType: "CONTRACT_REVENUE", entityId: contractId, after: counts });
    await recordSyncEvent(tx, { type: "revenue.changed", entityId: contractId, siteId: preview.contract.siteId, actorId: actor.id });
    return counts;
  });
}

export async function listContractRevenueCandidates(query: ContractRevenueCandidateQuery) {
  const contractWhere: Prisma.ContractWhereInput = {
    status: "ACTIVE",
    ...(query.siteId ? { siteId: query.siteId } : {}),
    ...(query.q ? { OR: [
      { contractNo: { contains: normalizeCode(query.q) } },
      { title: { contains: query.q } },
      { site: { name: { contains: query.q } } },
    ] } : {}),
  };
  const where: Prisma.ContractRevenueGenerationQueueWhereInput = { contract: { is: contractWhere } };
  const [total, rows] = await prisma.$transaction([
    prisma.contractRevenueGenerationQueue.count({ where }),
    prisma.contractRevenueGenerationQueue.findMany({
      where,
      select: {
        contractId: true,
        pendingAt: true,
        contract: {
          select: {
            contractNo: true,
            title: true,
            site: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ pendingAt: "asc" }, { contractId: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return {
    rows: rows.map((row) => ({
      id: row.contractId,
      contractNo: row.contract.contractNo,
      title: row.contract.title,
      pendingAt: row.pendingAt,
      site: row.contract.site,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function syncContractRevenueGenerationQueue(tx: Prisma.TransactionClient, contractId: string) {
  const preview = await loadContractRevenueGeneration(tx, contractId);
  const actionable = preview.contract.status === "ACTIVE" && hasActionableGenerationRows(preview.rows);
  if (actionable) {
    await tx.contractRevenueGenerationQueue.upsert({
      where: { contractId },
      create: { contractId },
      update: {},
    });
  } else {
    await tx.contractRevenueGenerationQueue.deleteMany({ where: { contractId } });
  }
  return actionable;
}

async function buildPreview(tx: Prisma.TransactionClient, contractId: string) {
  const preview = await loadContractRevenueGeneration(tx, contractId);
  if (preview.contract.status !== "ACTIVE") throw new AuthError("진행 상태 계약만 자동 매출을 생성할 수 있습니다.", 400, "CONTRACT_NOT_ACTIVE");
  return preview;
}

async function loadContractRevenueGeneration(tx: Prisma.TransactionClient, contractId: string) {
  const contract = await tx.contract.findUnique({ where: { id: contractId }, include: {
    site: { select: { name: true } },
    lines: { where: { isActive: true }, include: { item: { select: { name: true } } }, orderBy: { sortOrder: "asc" } },
  } });
  if (!contract) throw new AuthError("계약을 찾을 수 없습니다.", 404, "CONTRACT_NOT_FOUND");
  const drafts = buildContractRevenueDrafts(contract);
  const existing = await tx.revenueEntry.findMany({ where: { contractId, sourceType: "CONTRACT" } });
  const rows = buildGenerationRows(drafts, existing);
  return { contract: { id: contract.id, contractNo: contract.contractNo, title: contract.title, siteId: contract.siteId, siteName: contract.site.name, status: contract.status, version: contract.version }, rows, counts: countGenerationActions(rows), totalSalesAmount: drafts.reduce((sum, row) => sum + row.salesAmount, 0), totalCostAmount: drafts.reduce((sum, row) => sum + row.costAmount, 0) };
}

function revenueData(draft: ExpectedContractRevenue) {
  const { allocationBaseDays, billingMethod, ...data } = draft;
  void billingMethod;
  return { ...data, daysInMonth: allocationBaseDays, sourceType: "CONTRACT" as const, status: "DRAFT" as const };
}
