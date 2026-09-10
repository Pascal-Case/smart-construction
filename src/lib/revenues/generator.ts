import "server-only";

import { randomUUID } from "node:crypto";

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

type GenerationCounts = ReturnType<typeof countGenerationActions>;
type BatchContractResult = {
  contractId: string;
  outcome: "PREVIEWED" | "GENERATED" | "BLOCKED";
  contract?: { id: string; contractNo: string; title: string; siteId: string; siteName: string; version: number };
  expectedVersion?: number;
  rows?: Awaited<ReturnType<typeof buildPreview>>["rows"];
  counts?: GenerationCounts;
  totalSalesAmount?: number;
  totalCostAmount?: number;
  error?: { code: string; message: string };
};

export async function previewContractRevenues(contractId: string) {
  return prisma.$transaction((tx) => buildPreview(tx, contractId));
}

export async function generateContractRevenues(actor: SessionUser, contractId: string) {
  const result = await prisma.$transaction((tx) => generateContractRevenueInTransaction(tx, actor, contractId));
  return result.counts;
}

export async function previewContractRevenuesBatch(contractIds: string[]) {
  validateBatchIds(contractIds);
  const batchId = randomUUID();
  return prisma.$transaction(async (tx) => {
    const { orderedIds, queuedIds } = await orderBatchContractIds(tx, contractIds);
    const results: BatchContractResult[] = [];
    for (const contractId of orderedIds) {
      if (!queuedIds.has(contractId)) {
        results.push(blockedResult(contractId, "CONTRACT_REVENUE_NOT_PENDING", "처리 대기 큐에서 사라진 계약입니다. 목록을 새로고침해 주세요."));
        continue;
      }
      try {
        const preview = await buildPreview(tx, contractId);
        results.push({
          contractId,
          outcome: "PREVIEWED",
          contract: preview.contract,
          expectedVersion: preview.contract.version,
          rows: preview.rows,
          counts: preview.counts,
          totalSalesAmount: preview.totalSalesAmount,
          totalCostAmount: preview.totalCostAmount,
        });
      } catch (error) {
        results.push(blockedResult(contractId, ...batchError(error)));
      }
    }
    return { batchId, results, summary: summarizeBatch(results, "PREVIEWED") };
  });
}

export async function generateContractRevenuesBatch(actor: SessionUser, targets: Array<{ contractId: string; expectedVersion: number }>) {
  validateBatchIds(targets.map((target) => target.contractId));
  const batchId = randomUUID();
  const targetById = new Map(targets.map((target) => [target.contractId, target]));
  const contractIds = targets.map((target) => target.contractId);
  const queue = await prisma.contractRevenueGenerationQueue.findMany({
    where: { contractId: { in: contractIds } },
    select: { contractId: true },
    orderBy: [{ pendingAt: "asc" }, { contractId: "asc" }],
  });
  const queuedIds = new Set(queue.map((row) => row.contractId));
  const orderedIds = [...queue.map((row) => row.contractId), ...contractIds.filter((id) => !queuedIds.has(id))];
  const results: BatchContractResult[] = [];

  for (const contractId of orderedIds) {
    if (!queuedIds.has(contractId)) {
      results.push(blockedResult(contractId, "CONTRACT_REVENUE_NOT_PENDING", "처리 대기 큐에서 사라진 계약입니다. 목록을 새로고침해 주세요."));
      continue;
    }
    const target = targetById.get(contractId)!;
    try {
      const result = await prisma.$transaction((tx) => generateContractRevenueInTransaction(tx, actor, contractId, batchId, target.expectedVersion));
      results.push({
        contractId,
        outcome: "GENERATED",
        contract: result.contract,
        expectedVersion: target.expectedVersion,
        counts: result.counts,
        totalSalesAmount: result.totalSalesAmount,
        totalCostAmount: result.totalCostAmount,
      });
    } catch (error) {
      results.push(blockedResult(contractId, ...batchError(error)));
    }
  }

  const summary = summarizeBatch(results, "GENERATED");
  await prisma.$transaction((tx) => recordAudit(tx, {
    actorId: actor.id,
    actorName: actor.name,
    action: "GENERATE_BATCH",
    entityType: "CONTRACT_REVENUE_BATCH",
    entityId: batchId,
    after: { ...summary, contractIds },
  }));
  return { batchId, results, summary };
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

async function generateContractRevenueInTransaction(tx: Prisma.TransactionClient, actor: SessionUser, contractId: string, batchId?: string, expectedVersion?: number) {
  const preview = await buildPreview(tx, contractId);
  if (expectedVersion != null && preview.contract.version !== expectedVersion) {
    throw new AuthError("계약 정보가 변경되었습니다. 새로 미리보기해 주세요.", 409, "CONTRACT_CHANGED");
  }
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
      if (!updated.count) throw new AuthError("다른 사용자가 자동 매출을 먼저 변경했습니다. 다시 미리보기해 주세요.", 409, "VERSION_CONFLICT"); counts.cancel += 1;
    } else if (row.action === "UNCHANGED") counts.unchanged += 1;
    else counts.protected += 1;
  }
  await tx.contractRevenueGenerationQueue.deleteMany({ where: { contractId } });
  await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "GENERATE", entityType: "CONTRACT_REVENUE", entityId: contractId, after: { ...counts, ...(batchId ? { batchId } : {}) } });
  await recordSyncEvent(tx, { type: "revenue.changed", entityId: contractId, siteId: preview.contract.siteId, actorId: actor.id });
  return { counts, contract: preview.contract, totalSalesAmount: preview.totalSalesAmount, totalCostAmount: preview.totalCostAmount };
}

async function orderBatchContractIds(tx: Prisma.TransactionClient, contractIds: string[]) {
  const queue = await tx.contractRevenueGenerationQueue.findMany({
    where: { contractId: { in: contractIds } },
    select: { contractId: true },
    orderBy: [{ pendingAt: "asc" }, { contractId: "asc" }],
  });
  const queuedIds = new Set(queue.map((row) => row.contractId));
  return { queuedIds, orderedIds: [...queue.map((row) => row.contractId), ...contractIds.filter((id) => !queuedIds.has(id))] };
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
  if (!contract.contractCategoryId) throw new AuthError("계약 구분이 없는 계약은 매출을 생성할 수 없습니다.", 409, "CONTRACT_CATEGORY_REQUIRED");
  const drafts = buildContractRevenueDrafts(contract);
  const existing = await tx.revenueEntry.findMany({ where: { contractId, sourceType: "CONTRACT" } });
  const rows = buildGenerationRows(drafts, existing);
  return { contract: { id: contract.id, contractNo: contract.contractNo, title: contract.title, siteId: contract.siteId, siteName: contract.site.name, status: contract.status, version: contract.version }, rows, counts: countGenerationActions(rows), totalSalesAmount: drafts.reduce((sum, row) => sum + row.salesAmount, 0), totalCostAmount: drafts.reduce((sum, row) => sum + row.costAmount, 0) };
}

function validateBatchIds(contractIds: string[]) {
  if (!contractIds.length) throw new AuthError("일괄 처리할 계약을 선택해 주세요.", 400, "CONTRACT_REVENUE_BATCH_EMPTY");
  if (contractIds.length > 100) throw new AuthError("한 번에 최대 100건까지 처리할 수 있습니다.", 400, "CONTRACT_REVENUE_BATCH_LIMIT");
  if (new Set(contractIds).size !== contractIds.length) throw new AuthError("중복된 계약 선택이 포함되어 있습니다.", 400, "CONTRACT_REVENUE_BATCH_DUPLICATE");
}

function blockedResult(contractId: string, code: string, message: string): BatchContractResult {
  return { contractId, outcome: "BLOCKED", error: { code, message } };
}

function batchError(error: unknown): [string, string] {
  if (error instanceof AuthError) return [error.code, error.message];
  console.error(error);
  return ["INTERNAL_ERROR", "이 계약을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."];
}

function summarizeBatch(results: BatchContractResult[], successOutcome: "PREVIEWED" | "GENERATED") {
  const counts: GenerationCounts = { create: 0, update: 0, unchanged: 0, protected: 0, cancel: 0 };
  for (const result of results) {
    if (result.outcome !== successOutcome || !result.counts) continue;
    counts.create += result.counts.create;
    counts.update += result.counts.update;
    counts.unchanged += result.counts.unchanged;
    counts.protected += result.counts.protected;
    counts.cancel += result.counts.cancel;
  }
  return {
    totalContracts: results.length,
    successfulContracts: results.filter((result) => result.outcome === successOutcome).length,
    blockedContracts: results.filter((result) => result.outcome === "BLOCKED").length,
    counts,
    totalSalesAmount: results.reduce((sum, result) => sum + (result.totalSalesAmount ?? 0), 0),
    totalCostAmount: results.reduce((sum, result) => sum + (result.totalCostAmount ?? 0), 0),
  };
}

function revenueData(draft: ExpectedContractRevenue) {
  const { allocationBaseDays, billingMethod, ...data } = draft;
  void billingMethod;
  return { ...data, daysInMonth: allocationBaseDays, sourceType: "CONTRACT" as const, status: "DRAFT" as const };
}
