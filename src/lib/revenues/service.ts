import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import { recordSyncEvent } from "@/lib/events/bus";
import { assertMonthsOpen } from "@/lib/monthly-close/guard";
import { generatedKeyAfterUserCancel } from "@/lib/revenues/generation-policy";
import { buildRevenueWhere } from "@/lib/revenues/query";
import type { ContractRevenueBatchConfirmInput, RevenueInput, RevenueListQuery } from "@/lib/revenues/schemas";

const includeRelations = {
  site: { select: { id: true, code: true, name: true } },
  item: { select: { id: true, code: true, name: true } },
  contract: { select: { id: true, contractNo: true, title: true } },
};

export async function listRevenues(query: RevenueListQuery) {
  const where = buildRevenueWhere(query);
  const [total, aggregate] = await prisma.$transaction([
    prisma.revenueEntry.count({ where }),
    prisma.revenueEntry.aggregate({ where: { ...where, status: { not: "CANCELED" } }, _sum: { salesAmount: true, costAmount: true } }),
  ]);
  const pageIds = await listRevenuePageIds(query);
  const unorderedRows = pageIds.length
    ? await prisma.revenueEntry.findMany({ where: { id: { in: pageIds } }, include: includeRelations })
    : [];
  const rowMap = new Map(unorderedRows.map((row) => [row.id, row]));
  const rows = pageIds.flatMap((id) => {
    const row = rowMap.get(id);
    return row ? [row] : [];
  });
  return { rows, total, page: query.page, pageSize: query.pageSize, totalPages: Math.max(1, Math.ceil(total / query.pageSize)), totals: { salesAmount: aggregate._sum.salesAmount ?? 0, costAmount: aggregate._sum.costAmount ?? 0 } };
}

async function listRevenuePageIds(query: RevenueListQuery) {
  const clauses: Prisma.Sql[] = [];
  if (query.siteId) clauses.push(Prisma.sql`r."siteId" = ${query.siteId}`);
  if (query.sourceType !== "all") clauses.push(Prisma.sql`r."sourceType" = ${query.sourceType}`);
  if (query.status !== "all") clauses.push(Prisma.sql`r."status" = ${query.status}`);
  if (query.exception === "ZERO") clauses.push(Prisma.sql`r."salesAmount" = 0 AND r."status" <> 'CANCELED'`);
  if (query.startDate) clauses.push(Prisma.sql`r."revenueDate" >= ${new Date(`${query.startDate}T00:00:00.000Z`)}`);
  if (query.endDate) clauses.push(Prisma.sql`r."revenueDate" <= ${new Date(`${query.endDate}T00:00:00.000Z`)}`);
  if (query.q) clauses.push(Prisma.sql`(
    instr(r."title", ${query.q}) > 0
    OR instr(r."description", ${query.q}) > 0
    OR instr(s."name", ${query.q}) > 0
    OR instr(i."name", ${query.q}) > 0
  )`);
  const whereSql = clauses.length ? Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}` : Prisma.empty;
  const direction = Prisma.raw(query.order === "asc" ? "ASC" : "DESC");
  const expressions: Record<RevenueListQuery["sort"], Array<{ expression: Prisma.Sql; nullLast?: boolean }>> = {
    revenueDate: [{ expression: Prisma.sql`r."revenueDate"` }],
    site: [{ expression: Prisma.sql`s."name"` }],
    source: [{ expression: Prisma.sql`CASE r."sourceType" WHEN 'CONTRACT' THEN 0 WHEN 'MANUAL' THEN 1 WHEN 'ADJUSTMENT' THEN 2 ELSE 3 END` }],
    content: [{ expression: Prisma.sql`r."title"` }],
    quantityPrice: [{ expression: Prisma.sql`r."quantity"`, nullLast: true }, { expression: Prisma.sql`r."appliedSalesPrice"`, nullLast: true }],
    salesAmount: [{ expression: Prisma.sql`r."salesAmount"` }],
    costAmount: [{ expression: Prisma.sql`r."costAmount"`, nullLast: true }],
    status: [{ expression: Prisma.sql`CASE r."status" WHEN 'DRAFT' THEN 0 WHEN 'CONFIRMED' THEN 1 WHEN 'CANCELED' THEN 2 ELSE 3 END` }],
    updatedAt: [{ expression: Prisma.sql`r."updatedAt"` }],
  };
  const orderParts = expressions[query.sort].flatMap(({ expression, nullLast }) => [
    ...(nullLast ? [Prisma.sql`${expression} IS NULL ASC`] : []),
    Prisma.sql`${expression} ${direction}`,
  ]);
  const orderSql = Prisma.join(orderParts, ", ");
  const offset = (query.page - 1) * query.pageSize;
  const ids = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT r."id" AS id
    FROM "RevenueEntry" r
    JOIN "Site" s ON s."id" = r."siteId"
    LEFT JOIN "Item" i ON i."id" = r."itemId"
    ${whereSql}
    ORDER BY ${orderSql}, r."id" ASC
    LIMIT ${query.pageSize} OFFSET ${offset}
  `);
  return ids.map((row) => row.id);
}

export async function createRevenue(actor: SessionUser, input: RevenueInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const data = await prepareRevenue(tx, input);
      await assertMonthsOpen(tx, [{ siteId: input.siteId, months: [input.revenueDate.slice(0, 7)] }]);
      const confirmed = input.saveStatus === "CONFIRMED";
      const entry = await tx.revenueEntry.create({ data: {
        ...data,
        status: input.saveStatus,
        confirmedById: confirmed ? actor.id : null,
        confirmedAt: confirmed ? new Date() : null,
        createdById: actor.id,
        updatedById: actor.id,
      }, include: includeRelations });
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "CREATE", entityType: "REVENUE", entityId: entry.id, after: entry });
      await recordSyncEvent(tx, { type: "revenue.changed", entityId: entry.id, siteId: entry.siteId, actorId: actor.id });
      return entry;
    });
  } catch (error) { throw mapRevenueError(error); }
}

export async function updateRevenue(actor: SessionUser, id: string, input: RevenueInput & { version: number }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.revenueEntry.findUnique({ where: { id }, include: includeRelations });
      if (!before) throw new AuthError("매출 건을 찾을 수 없습니다.", 404, "REVENUE_NOT_FOUND");
      if (before.sourceType === "CONTRACT") throw new AuthError("계약 자동 매출은 계약 재생성으로 변경해 주세요.", 400, "CONTRACT_REVENUE_READ_ONLY");
      if (before.status !== "DRAFT") throw new AuthError("작성 중 매출만 수정할 수 있습니다.", 409, "REVENUE_NOT_DRAFT");
      const data = await prepareRevenue(tx, input, before);
      await assertMonthsOpen(tx, [
        { siteId: before.siteId, months: [before.revenueDate.toISOString().slice(0, 7)] },
        { siteId: input.siteId, months: [input.revenueDate.slice(0, 7)] },
      ]);
      const updated = await tx.revenueEntry.updateMany({ where: { id, version: input.version, status: "DRAFT" }, data: { ...data, updatedById: actor.id, version: { increment: 1 } } });
      if (!updated.count) throw new AuthError("다른 사용자가 먼저 매출을 수정했습니다. 새로고침 후 다시 시도해 주세요.", 409, "VERSION_CONFLICT");
      const entry = await tx.revenueEntry.findUniqueOrThrow({ where: { id }, include: includeRelations });
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "UPDATE", entityType: "REVENUE", entityId: id, before, after: entry });
      await recordSyncEvent(tx, { type: "revenue.changed", entityId: id, siteId: entry.siteId, actorId: actor.id });
      return entry;
    });
  } catch (error) { throw mapRevenueError(error); }
}

export async function confirmRevenue(actor: SessionUser, id: string, version: number) {
  return transitionRevenue(actor, id, version, "CONFIRMED");
}

export async function confirmContractRevenues(actor: SessionUser, input: ContractRevenueBatchConfirmInput) {
  return prisma.$transaction(async (tx) => {
    const first = input.entries[0];
    if (!first) throw new AuthError("확정할 계약 매출을 선택해 주세요.", 400, "REVENUE_SELECTION_REQUIRED");
    const ids = input.entries.map((entry) => entry.id);
    const beforeRows = await tx.revenueEntry.findMany({ where: { id: { in: ids } }, include: includeRelations });
    if (beforeRows.length !== input.entries.length) throw new AuthError("선택한 매출 중 찾을 수 없는 건이 있습니다.", 404, "REVENUE_NOT_FOUND");
    if (beforeRows.some((row) => row.sourceType !== "CONTRACT")) throw new AuthError("계약 매출만 일괄 확정할 수 있습니다.", 400, "CONTRACT_REVENUE_REQUIRED");
    if (beforeRows.some((row) => row.status !== "DRAFT")) throw new AuthError("작성 중 계약 매출만 일괄 확정할 수 있습니다.", 409, "REVENUE_NOT_DRAFT");
    await assertMonthsOpen(tx, beforeRows.map((row) => ({ siteId: row.siteId, months: [row.revenueDate.toISOString().slice(0, 7)] })));

    const confirmedAt = new Date();
    const updated = await tx.revenueEntry.updateMany({
      where: { OR: input.entries.map((entry) => ({ id: entry.id, version: entry.version, sourceType: "CONTRACT" as const, status: "DRAFT" as const })) },
      data: { status: "CONFIRMED", confirmedById: actor.id, confirmedAt, updatedById: actor.id, version: { increment: 1 } },
    });
    if (updated.count !== input.entries.length) throw new AuthError("다른 사용자가 먼저 매출 상태를 변경했습니다. 새로고침 후 다시 선택해 주세요.", 409, "VERSION_CONFLICT");

    const afterRows = await tx.revenueEntry.findMany({ where: { id: { in: ids } }, include: includeRelations });
    const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
    const afterById = new Map(afterRows.map((row) => [row.id, row]));
    const entries = [];
    for (const id of ids) {
      const before = beforeById.get(id);
      const after = afterById.get(id);
      if (!before || !after) throw new AuthError("확정 결과를 불러오지 못했습니다.", 500, "REVENUE_CONFIRM_RESULT_MISSING");
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "CONFIRM", entityType: "REVENUE", entityId: id, before, after });
      entries.push(after);
    }
    await recordSyncEvent(tx, { type: "revenue.changed", entityId: first.id, actorId: actor.id });
    return entries;
  });
}

export async function cancelRevenue(actor: SessionUser, id: string, version: number, reason: string) {
  return transitionRevenue(actor, id, version, "CANCELED", reason);
}

async function transitionRevenue(actor: SessionUser, id: string, version: number, status: "CONFIRMED" | "CANCELED", reason?: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.revenueEntry.findUnique({ where: { id }, include: includeRelations });
    if (!before) throw new AuthError("매출 건을 찾을 수 없습니다.", 404, "REVENUE_NOT_FOUND");
    if (before.status === "CANCELED") throw new AuthError("이미 취소된 매출입니다.", 409, "REVENUE_ALREADY_CANCELED");
    if (status === "CONFIRMED" && before.status !== "DRAFT") throw new AuthError("작성 중 매출만 확정할 수 있습니다.", 409, "REVENUE_NOT_DRAFT");
    await assertMonthsOpen(tx, [{ siteId: before.siteId, months: [before.revenueDate.toISOString().slice(0, 7)] }]);
    const result = await tx.revenueEntry.updateMany({ where: { id, version }, data: status === "CONFIRMED"
      ? { status, confirmedById: actor.id, confirmedAt: new Date(), updatedById: actor.id, version: { increment: 1 } }
      : { status, cancelReason: reason, canceledById: actor.id, canceledAt: new Date(), generatedKey: generatedKeyAfterUserCancel(before.sourceType, before.generatedKey), updatedById: actor.id, version: { increment: 1 } } });
    if (!result.count) throw new AuthError("다른 사용자가 먼저 매출 상태를 변경했습니다.", 409, "VERSION_CONFLICT");
    if (status === "CANCELED" && before.sourceType === "CONTRACT" && before.contractId) {
      await tx.contractRevenueGenerationQueue.upsert({
        where: { contractId: before.contractId },
        create: { contractId: before.contractId },
        update: {},
      });
    }
    const entry = await tx.revenueEntry.findUniqueOrThrow({ where: { id }, include: includeRelations });
    await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: status === "CONFIRMED" ? "CONFIRM" : "CANCEL", entityType: "REVENUE", entityId: id, before, after: entry });
    await recordSyncEvent(tx, { type: "revenue.changed", entityId: id, siteId: entry.siteId, actorId: actor.id });
    return entry;
  });
}

async function prepareRevenue(tx: Prisma.TransactionClient, input: RevenueInput, before?: { siteId: string; itemId: string | null; standardSalesPriceSnapshot: number | null; standardCostPriceSnapshot: number | null }) {
  const site = await tx.site.findUnique({ where: { id: input.siteId }, select: { id: true, isActive: true } });
  if (!site || (!site.isActive && before?.siteId !== site.id)) throw new AuthError("사용 가능한 현장을 선택해 주세요.", 400, "INVALID_REVENUE_SITE");
  const item = input.itemId ? await tx.item.findUnique({ where: { id: input.itemId }, select: { id: true, unit: true, standardSalesPrice: true, standardCostPrice: true, isActive: true } }) : null;
  if (input.itemId && (!item || (!item.isActive && before?.itemId !== item.id))) throw new AuthError("사용 가능한 품목을 선택해 주세요.", 400, "INVALID_REVENUE_ITEM");
  if (input.sourceType === "MANUAL" && ((input.appliedSalesPrice ?? 0) < 0 || (input.appliedCostPrice ?? 0) < 0 || (input.costAmount ?? 0) < 0)) throw new AuthError("음수 단가·금액은 조정 유형으로 입력해 주세요.", 400, "NEGATIVE_MANUAL_AMOUNT");
  const sameItem = item && before?.itemId === item.id;
  const standardSalesPriceSnapshot = item ? (sameItem ? before.standardSalesPriceSnapshot : item.standardSalesPrice) : null;
  const standardCostPriceSnapshot = item ? (sameItem ? before.standardCostPriceSnapshot : item.standardCostPrice) : null;
  const calculatedSales = input.quantity != null && input.appliedSalesPrice != null ? Math.round(input.quantity * input.appliedSalesPrice) : null;
  const calculatedCost = input.quantity != null && input.appliedCostPrice != null ? Math.round(input.quantity * input.appliedCostPrice) : null;
  const priceOverridden = item && ((input.appliedSalesPrice != null && input.appliedSalesPrice !== standardSalesPriceSnapshot) || (input.appliedCostPrice != null && input.appliedCostPrice !== standardCostPriceSnapshot));
  const amountOverridden = calculatedSales != null && calculatedSales !== input.salesAmount;
  const costAmountOverridden = calculatedCost != null && input.costAmount != null && calculatedCost !== input.costAmount;
  const reason = emptyToNull(input.priceOverrideReason);
  if ((priceOverridden || amountOverridden || costAmountOverridden) && !reason) throw new AuthError("표준단가 또는 계산 금액과 다른 값에는 예외 사유가 필요합니다.", 400, "REVENUE_OVERRIDE_REASON_REQUIRED");
  return {
    siteId: input.siteId, revenueDate: dbDate(input.revenueDate), sourceType: input.sourceType, itemId: item?.id ?? null,
    title: input.title, description: emptyToNull(input.description), quantity: input.quantity, unit: item?.unit ?? emptyToNull(input.unit),
    standardSalesPriceSnapshot, appliedSalesPrice: input.appliedSalesPrice, salesAmount: input.salesAmount,
    standardCostPriceSnapshot, appliedCostPrice: input.appliedCostPrice, costAmount: input.costAmount ?? calculatedCost,
    priceOverrideReason: (priceOverridden || amountOverridden || costAmountOverridden || input.sourceType === "ADJUSTMENT") ? reason : null,
  };
}

function dbDate(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function emptyToNull(value?: string | null) { return value?.trim() || null; }
function mapRevenueError(error: unknown) { if (error instanceof AuthError) return error; if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return new AuthError("동일한 계약 월 매출이 이미 존재합니다.", 409, "DUPLICATE_REVENUE"); return error; }
