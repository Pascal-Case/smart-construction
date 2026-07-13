import "server-only";

import { Prisma, UserRole } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import { recordSyncEvent } from "@/lib/events/bus";
import { evaluateSiteMonth } from "@/lib/monthly-close/evaluator";
import type {
  CloseMonthlySitesInput,
  MonthlyCloseQuery,
  ReopenMonthlyCloseInput,
  ReviewMonthlyCloseExceptionInput,
} from "@/lib/monthly-close/schemas";
import { buildCloseCycleSnapshot } from "@/lib/monthly-close/snapshot";
import type { MonthCloseEvaluationInput } from "@/lib/monthly-close/types";
import { sortControlRoomRows } from "@/lib/monthly-close/control-room-order";
import { buildContractRevenueDrafts } from "@/lib/revenues/expected";

type CloseTarget = CloseMonthlySitesInput["targets"][number];
export type CloseTargetResult =
  | { siteId: string; outcome: "CLOSED"; cycleId: string }
  | { siteId: string; outcome: "BLOCKED"; blockingCount: number }
  | { siteId: string; outcome: "ALREADY_CLOSED"; cycleId: string | null }
  | { siteId: string; outcome: "CHANGED" };

export async function getMonthCloseControlRoom(query: MonthlyCloseQuery) {
  return prisma.$transaction(async (tx) => {
    const sites = await findTargetSites(tx, query.month, query.siteId);
    const contexts = [];
    for (const site of sites) {
      const context = await loadEvaluationContext(tx, site.id, query.month);
      if (context) contexts.push(context);
    }
    const allRows = sortControlRoomRows(contexts.map(toControlRoomRow), query.sort && query.order ? { key: query.sort, direction: query.order } : null);
    const rows = query.view === "all" ? allRows : allRows.filter((row) => row.evaluation.exceptions.length > 0);
    const closedCount = allRows.filter((row) => row.close?.state === "CLOSED").length;
    return {
      month: query.month,
      view: query.view,
      rows,
      summary: {
        targetCount: allRows.length,
        closedCount,
        openCount: allRows.length - closedCount,
        blockingSiteCount: allRows.filter((row) => row.evaluation.blockingCount > 0).length,
        complete: allRows.length > 0 && closedCount === allRows.length,
      },
    };
  });
}

export async function reviewMonthlyCloseException(
  actor: SessionUser,
  input: ReviewMonthlyCloseExceptionInput,
) {
  assertManager(actor);
  try {
    return await prisma.$transaction(async (tx) => {
      const context = await loadEvaluationContext(tx, input.siteId, input.month);
      if (!context) throw new AuthError("마감 대상 현장을 찾을 수 없습니다.", 404, "MONTH_CLOSE_SITE_NOT_FOUND");
      const exception = context.evaluation.exceptions.find((item) => item.key === input.exceptionKey);
      if (!exception || !exception.reviewable || exception.fingerprint !== input.expectedFingerprint) {
        throw new AuthError("예외 상태가 변경되었습니다. 최신 상태를 다시 확인해 주세요.", 409, "MONTH_CLOSE_CHANGED");
      }
      const unique = {
        siteId_month_exceptionKey_fingerprint: {
          siteId: input.siteId,
          month: input.month,
          exceptionKey: input.exceptionKey,
          fingerprint: input.expectedFingerprint,
        },
      };
      const existing = await tx.monthlyCloseExceptionReview.findUnique({ where: unique });
      if (existing) return existing;
      const review = await tx.monthlyCloseExceptionReview.create({
        data: {
          siteId: input.siteId,
          month: input.month,
          exceptionKey: input.exceptionKey,
          fingerprint: input.expectedFingerprint,
          reason: input.reason,
          reviewedById: actor.id,
          reviewedByName: actor.name,
          reviewedAt: new Date(),
        },
      });
      await recordAudit(tx, {
        actorId: actor.id,
        actorName: actor.name,
        action: "REVIEW",
        entityType: "MONTH_CLOSE_EXCEPTION",
        entityId: review.id,
        after: review,
      });
      await recordSyncEvent(tx, {
        type: "monthlyClose.changed",
        entityId: review.id,
        siteId: input.siteId,
        month: input.month,
        actorId: actor.id,
      });
      return review;
    });
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (isUniqueConflict(error)) {
      const existing = await prisma.monthlyCloseExceptionReview.findUnique({
        where: {
          siteId_month_exceptionKey_fingerprint: {
            siteId: input.siteId,
            month: input.month,
            exceptionKey: input.exceptionKey,
            fingerprint: input.expectedFingerprint,
          },
        },
      });
      if (existing) return existing;
      throw new AuthError("예외 검토 상태가 변경되었습니다. 다시 확인해 주세요.", 409, "MONTH_CLOSE_CHANGED");
    }
    throw error;
  }
}

export async function closeMonthlySites(actor: SessionUser, input: CloseMonthlySitesInput) {
  assertManager(actor);
  return runCloseTargets(input.targets, (target) => closeSiteMonth(actor, input.month, target));
}

export async function runCloseTargets(
  targets: CloseTarget[],
  closeOne: (target: CloseTarget) => Promise<CloseTargetResult>,
) {
  const results: CloseTargetResult[] = [];
  for (const target of targets) results.push(await closeOne(target));
  return results;
}

export async function reopenMonthlyClose(
  actor: SessionUser,
  closeId: string,
  input: ReopenMonthlyCloseInput,
) {
  if (actor.role !== UserRole.ADMIN) throw forbidden();
  return prisma.$transaction(async (tx) => {
    const current = await tx.monthlyClose.findUnique({
      where: { id: closeId },
      include: { cycles: { orderBy: { cycleNo: "desc" }, take: 1 } },
    });
    if (!current) throw new AuthError("마감 상태를 찾을 수 없습니다.", 404, "MONTH_CLOSE_NOT_FOUND");
    const latestCycle = current.cycles[0];
    if (current.state !== "CLOSED") throw new AuthError("이미 열린 현장입니다.", 409, "MONTH_CLOSE_ALREADY_OPEN");
    if (current.version !== input.expectedVersion || !latestCycle || latestCycle.id !== input.latestCycleId) {
      throw new AuthError("마감 상태가 변경되었습니다. 최신 상태를 다시 확인해 주세요.", 409, "MONTH_CLOSE_CHANGED");
    }
    const updated = await tx.monthlyClose.updateMany({
      where: { id: current.id, state: "CLOSED", version: input.expectedVersion },
      data: { state: "OPEN", version: { increment: 1 } },
    });
    if (!updated.count) throw new AuthError("마감 상태가 변경되었습니다. 최신 상태를 다시 확인해 주세요.", 409, "MONTH_CLOSE_CHANGED");
    const reopenedAt = new Date();
    const reopen = await tx.monthlyCloseReopen.create({
      data: {
        monthlyCloseId: current.id,
        fromCycleId: latestCycle.id,
        reason: input.reason,
        reopenedById: actor.id,
        reopenedByName: actor.name,
        reopenedAt,
      },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      actorName: actor.name,
      action: "REOPEN",
      entityType: "MONTH_CLOSE",
      entityId: current.id,
      before: current,
      after: { state: "OPEN", version: current.version + 1, reopen },
    });
    await recordSyncEvent(tx, {
      type: "monthlyClose.changed",
      entityId: current.id,
      siteId: current.siteId,
      month: current.month,
      actorId: actor.id,
    });
    return { ...current, state: "OPEN" as const, version: current.version + 1, reopen };
  });
}

async function closeSiteMonth(actor: SessionUser, month: string, target: CloseTarget): Promise<CloseTargetResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const context = await loadEvaluationContext(tx, target.siteId, month);
      if (!context || context.evaluation.fingerprint !== target.expectedFingerprint) {
        return { siteId: target.siteId, outcome: "CHANGED" };
      }
      const current = context.close;
      if (current?.state === "CLOSED") {
        return { siteId: target.siteId, outcome: "ALREADY_CLOSED", cycleId: context.latestCycle?.id ?? null };
      }
      if (!context.evaluation.canClose) {
        return { siteId: target.siteId, outcome: "BLOCKED", blockingCount: context.evaluation.blockingCount };
      }

      const snapshot = buildCloseCycleSnapshot({
        siteId: target.siteId,
        month,
        revenues: context.revenues,
        expectedContractRevenues: context.expectedContractRevenues,
        exceptions: context.evaluation.exceptions,
      });
      const cycleNo = (current?.latestCycleNo ?? 0) + 1;
      let aggregateId: string;
      if (!current) {
        const created = await tx.monthlyClose.create({
          data: { siteId: target.siteId, month, state: "CLOSED", latestCycleNo: cycleNo },
        });
        aggregateId = created.id;
      } else {
        const updated = await tx.monthlyClose.updateMany({
          where: { id: current.id, state: "OPEN", version: current.version },
          data: { state: "CLOSED", latestCycleNo: cycleNo, version: { increment: 1 } },
        });
        if (!updated.count) return { siteId: target.siteId, outcome: "CHANGED" };
        aggregateId = current.id;
      }
      const closedAt = new Date();
      const cycle = await tx.monthlyCloseCycle.create({
        data: {
          monthlyCloseId: aggregateId,
          cycleNo,
          ...snapshot,
          closedById: actor.id,
          closedByName: actor.name,
          closedAt,
        },
      });
      await recordAudit(tx, {
        actorId: actor.id,
        actorName: actor.name,
        action: cycleNo === 1 ? "CLOSE" : "RECLOSE",
        entityType: "MONTH_CLOSE",
        entityId: aggregateId,
        after: { cycleId: cycle.id, cycleNo, ...snapshot },
      });
      await recordSyncEvent(tx, {
        type: "monthlyClose.changed",
        entityId: aggregateId,
        siteId: target.siteId,
        month,
        actorId: actor.id,
      });
      return { siteId: target.siteId, outcome: "CLOSED", cycleId: cycle.id };
    });
  } catch (error) {
    if (isUniqueConflict(error)) return { siteId: target.siteId, outcome: "CHANGED" };
    throw error;
  }
}

async function findTargetSites(tx: Prisma.TransactionClient, month: string, siteId: string) {
  const { start, end } = monthRange(month);
  return tx.site.findMany({
    where: {
      ...(siteId ? { id: siteId } : {}),
      OR: [
        { contracts: { some: { status: "ACTIVE", startDate: { lte: end }, endDate: { gte: start } } } },
        { revenueEntries: { some: { revenueDate: { gte: start, lte: end }, status: { not: "CANCELED" } } } },
        { invoiceDocuments: { some: { periodStart: { lte: end }, periodEnd: { gte: start } } } },
        { monthlyCloses: { some: { month } } },
      ],
    },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
}

async function loadEvaluationContext(tx: Prisma.TransactionClient, siteId: string, month: string) {
  const { start, end } = monthRange(month);
  const [site, contracts, revenues, reviews, invoiceDocuments, close] = await Promise.all([
    tx.site.findUnique({ where: { id: siteId }, select: { id: true, code: true, name: true } }),
    tx.contract.findMany({
      where: { siteId, status: "ACTIVE", startDate: { lte: end }, endDate: { gte: start } },
      include: {
        lines: {
          where: { isActive: true, revenueStartDate: { lte: end }, revenueEndDate: { gte: start } },
          include: { item: { select: { name: true } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    tx.revenueEntry.findMany({
      where: { siteId, revenueDate: { gte: start, lte: end } },
      orderBy: [{ revenueDate: "asc" }, { createdAt: "asc" }],
    }),
    tx.monthlyCloseExceptionReview.findMany({ where: { siteId, month }, orderBy: { reviewedAt: "asc" } }),
    tx.invoiceDocument.findMany({
      where: { siteId, periodStart: { lte: end }, periodEnd: { gte: start } },
      select: {
        id: true,
        status: true,
        subtotal: true,
        revenueLinks: { select: { revenueEntryId: true } },
      },
      orderBy: { issuedAt: "asc" },
    }),
    tx.monthlyClose.findUnique({
      where: { siteId_month: { siteId, month } },
      include: {
        cycles: { orderBy: { cycleNo: "desc" } },
        reopens: { orderBy: { reopenedAt: "desc" } },
      },
    }),
  ]);
  if (!site) return null;

  const expectedContractRevenues = contracts
    .flatMap(buildContractRevenueDrafts)
    .filter((row) => row.revenueDate.toISOString().slice(0, 7) === month)
    .map((row) => ({
      generatedKey: row.generatedKey,
      contractId: row.contractId,
      contractLineId: row.contractLineId,
      itemId: row.itemId,
      title: row.title,
      quantity: row.quantity,
      appliedSalesPrice: row.appliedSalesPrice,
      appliedCostPrice: row.appliedCostPrice,
      salesAmount: row.salesAmount,
      costAmount: row.costAmount,
    }));
  const mappedRevenues = revenues.map((row) => ({
    id: row.id,
    version: row.version,
    revenueDate: row.revenueDate.toISOString().slice(0, 10),
    sourceType: row.sourceType,
    status: row.status,
    generatedKey: row.generatedKey,
    contractId: row.contractId,
    contractLineId: row.contractLineId,
    itemId: row.itemId,
    title: row.title,
    quantity: row.quantity,
    appliedSalesPrice: row.appliedSalesPrice,
    appliedCostPrice: row.appliedCostPrice,
    salesAmount: row.salesAmount,
    costAmount: row.costAmount,
    priceOverrideReason: row.priceOverrideReason,
  }));
  const latestCycle = close?.cycles[0] ?? null;
  const evaluationInput: MonthCloseEvaluationInput = {
    site,
    month,
    expectedContractRevenues,
    revenues: mappedRevenues,
    reviews: reviews.map((review) => ({
      exceptionKey: review.exceptionKey,
      fingerprint: review.fingerprint,
      reason: review.reason,
    })),
    invoiceDocuments: invoiceDocuments.map((document) => ({
      id: document.id,
      status: document.status,
      revenueEntryIds: document.revenueLinks.map((link) => link.revenueEntryId),
      subtotal: document.subtotal,
    })),
    latestCloseSnapshot: latestCycle ? {
      revenueEntryIds: snapshotRevenueIds(latestCycle.snapshotJson),
      totalSalesAmount: latestCycle.totalSalesAmount,
    } : null,
  };
  return {
    site,
    close,
    latestCycle,
    expectedContractRevenues,
    revenues: mappedRevenues,
    evaluation: evaluateSiteMonth(evaluationInput),
  };
}

function toControlRoomRow(context: NonNullable<Awaited<ReturnType<typeof loadEvaluationContext>>>) {
  return {
    site: context.site,
    evaluation: context.evaluation,
    commitFingerprint: context.evaluation.fingerprint,
    close: context.close ? {
      id: context.close.id,
      state: context.close.state,
      version: context.close.version,
      latestCycleNo: context.close.latestCycleNo,
      cycles: context.close.cycles.map((cycle) => ({
        id: cycle.id,
        cycleNo: cycle.cycleNo,
        revenueCount: cycle.revenueCount,
        totalSalesAmount: cycle.totalSalesAmount,
        totalCostAmount: cycle.totalCostAmount,
        closedByName: cycle.closedByName,
        closedAt: cycle.closedAt,
      })),
      reopens: context.close.reopens.map((reopen) => ({
        id: reopen.id,
        fromCycleId: reopen.fromCycleId,
        reason: reopen.reason,
        reopenedByName: reopen.reopenedByName,
        reopenedAt: reopen.reopenedAt,
      })),
    } : null,
  };
}

function monthRange(month: string) {
  const start = new Date(month + "-01T00:00:00.000Z");
  const [year, monthNumber] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999));
  return { start, end };
}

function snapshotRevenueIds(snapshotJson: string) {
  try {
    const parsed = JSON.parse(snapshotJson) as { revenueEntryIds?: unknown };
    return Array.isArray(parsed.revenueEntryIds)
      ? parsed.revenueEntryIds.filter((id): id is string => typeof id === "string").sort()
      : [];
  } catch {
    return [];
  }
}

function assertManager(actor: SessionUser) {
  if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.MANAGER) throw forbidden();
}

function forbidden() {
  return new AuthError("이 작업을 수행할 권한이 없습니다.", 403, "FORBIDDEN");
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
