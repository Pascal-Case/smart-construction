import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import type { RevenueInput, RevenueListQuery } from "@/lib/revenues/schemas";

const includeRelations = {
  site: { select: { id: true, code: true, name: true } },
  item: { select: { id: true, code: true, name: true } },
  contract: { select: { id: true, contractNo: true, title: true } },
};

export async function listRevenues(query: RevenueListQuery) {
  const where: Prisma.RevenueEntryWhereInput = {
    ...(query.siteId ? { siteId: query.siteId } : {}),
    ...(query.sourceType !== "all" ? { sourceType: query.sourceType } : {}),
    ...(query.status !== "all" ? { status: query.status } : {}),
    ...(query.startDate || query.endDate ? { revenueDate: { ...(query.startDate ? { gte: dbDate(query.startDate) } : {}), ...(query.endDate ? { lte: dbDate(query.endDate) } : {}) } } : {}),
    ...(query.q ? { OR: [{ title: { contains: query.q } }, { description: { contains: query.q } }, { site: { name: { contains: query.q } } }, { item: { name: { contains: query.q } } }] } : {}),
  };
  const [total, rows, aggregate] = await prisma.$transaction([
    prisma.revenueEntry.count({ where }),
    prisma.revenueEntry.findMany({ where, include: includeRelations, orderBy: [{ revenueDate: "desc" }, { createdAt: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.revenueEntry.aggregate({ where: { ...where, status: { not: "CANCELED" } }, _sum: { salesAmount: true, costAmount: true } }),
  ]);
  return { rows, total, page: query.page, pageSize: query.pageSize, totalPages: Math.max(1, Math.ceil(total / query.pageSize)), totals: { salesAmount: aggregate._sum.salesAmount ?? 0, costAmount: aggregate._sum.costAmount ?? 0 } };
}

export async function createRevenue(actor: SessionUser, input: RevenueInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const data = await prepareRevenue(tx, input);
      const entry = await tx.revenueEntry.create({ data: { ...data, createdById: actor.id, updatedById: actor.id }, include: includeRelations });
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "CREATE", entityType: "REVENUE", entityId: entry.id, after: entry });
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
      const updated = await tx.revenueEntry.updateMany({ where: { id, version: input.version, status: "DRAFT" }, data: { ...data, updatedById: actor.id, version: { increment: 1 } } });
      if (!updated.count) throw new AuthError("다른 사용자가 먼저 매출을 수정했습니다. 새로고침 후 다시 시도해 주세요.", 409, "VERSION_CONFLICT");
      const entry = await tx.revenueEntry.findUniqueOrThrow({ where: { id }, include: includeRelations });
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "UPDATE", entityType: "REVENUE", entityId: id, before, after: entry });
      return entry;
    });
  } catch (error) { throw mapRevenueError(error); }
}

export async function confirmRevenue(actor: SessionUser, id: string, version: number) {
  return transitionRevenue(actor, id, version, "CONFIRMED");
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
    const result = await tx.revenueEntry.updateMany({ where: { id, version }, data: status === "CONFIRMED"
      ? { status, confirmedById: actor.id, confirmedAt: new Date(), updatedById: actor.id, version: { increment: 1 } }
      : { status, cancelReason: reason, canceledById: actor.id, canceledAt: new Date(), updatedById: actor.id, version: { increment: 1 } } });
    if (!result.count) throw new AuthError("다른 사용자가 먼저 매출 상태를 변경했습니다.", 409, "VERSION_CONFLICT");
    const entry = await tx.revenueEntry.findUniqueOrThrow({ where: { id }, include: includeRelations });
    await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: status === "CONFIRMED" ? "CONFIRM" : "CANCEL", entityType: "REVENUE", entityId: id, before, after: entry });
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
