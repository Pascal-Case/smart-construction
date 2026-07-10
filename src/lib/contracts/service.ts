import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { buildContractImpact } from "@/lib/contracts/impact";
import type { ContractInput, ContractListQuery } from "@/lib/contracts/schemas";
import { prisma } from "@/lib/db/prisma";
import { recordSyncEvent } from "@/lib/events/bus";
import { normalizeCode } from "@/lib/masters/normalize";
import { nextBusinessCode } from "@/lib/masters/sequence";

const contractInclude = {
  site: { select: { id: true, code: true, name: true, isActive: true } },
  lines: { where: { isActive: true }, include: { item: { select: { id: true, code: true, name: true, isActive: true } } }, orderBy: { sortOrder: "asc" as const } },
};
const contractIncludeAll = {
  site: { select: { id: true, code: true, name: true, isActive: true } },
  lines: { include: { item: { select: { id: true, code: true, name: true, isActive: true } } }, orderBy: { sortOrder: "asc" as const } },
};

export async function listContracts(query: ContractListQuery) {
  const where: Prisma.ContractWhereInput = {
    ...(query.status !== "all" ? { status: query.status } : {}),
    ...(query.siteId ? { siteId: query.siteId } : {}),
    ...(query.q ? { OR: [
      { contractNo: { contains: normalizeCode(query.q) } },
      { title: { contains: query.q } },
      { site: { name: { contains: query.q } } },
      { lines: { some: { isActive: true, item: { name: { contains: query.q } } } } },
    ] } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.contract.count({ where }),
    prisma.contract.findMany({ where, include: contractInclude, orderBy: { updatedAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
  ]);
  return { rows, total, page: query.page, pageSize: query.pageSize, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
}

export async function getContract(id: string) {
  const contract = await prisma.contract.findUnique({ where: { id }, include: contractInclude });
  if (!contract) throw new AuthError("계약을 찾을 수 없습니다.", 404, "CONTRACT_NOT_FOUND");
  return contract;
}

export async function createContract(actor: SessionUser, input: ContractInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const prepared = await prepareAggregate(tx, actor, input);
      const contractNo = input.contractNo ? normalizeCode(input.contractNo) : await nextBusinessCode(tx, "contract");
      const contract = await tx.contract.create({ data: {
        contractNo, siteId: input.siteId, title: input.title, startDate: dbDate(input.startDate), endDate: dbDate(input.endDate),
        status: input.status, memo: emptyToNull(input.memo), createdById: actor.id, updatedById: actor.id,
        lines: { create: prepared.map((line, index) => ({ ...line, sortOrder: index, createdById: actor.id, updatedById: actor.id })) },
      }, include: contractInclude });
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "CREATE", entityType: "CONTRACT", entityId: contract.id, after: contract });
      await recordSyncEvent(tx, { type: "contract.changed", entityId: contract.id, siteId: contract.siteId, actorId: actor.id });
      return contract;
    });
  } catch (error) { throw mapContractError(error); }
}

export async function previewContractChange(actor: SessionUser, id: string, input: ContractInput) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.contract.findUnique({ where: { id }, include: contractIncludeAll });
    if (!before) throw new AuthError("계약을 찾을 수 없습니다.", 404, "CONTRACT_NOT_FOUND");
    await prepareAggregate(tx, actor, input, before);
    return buildContractImpact(before, input);
  });
}

export async function updateContract(actor: SessionUser, id: string, input: ContractInput & { version: number }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.contract.findUnique({ where: { id }, include: contractIncludeAll });
      if (!before) throw new AuthError("계약을 찾을 수 없습니다.", 404, "CONTRACT_NOT_FOUND");
      const prepared = await prepareAggregate(tx, actor, input, before);
      const updated = await tx.contract.updateMany({ where: { id, version: input.version }, data: {
        contractNo: input.contractNo ? normalizeCode(input.contractNo) : before.contractNo,
        siteId: input.siteId, title: input.title, startDate: dbDate(input.startDate), endDate: dbDate(input.endDate),
        status: input.status, memo: emptyToNull(input.memo), updatedById: actor.id, version: { increment: 1 },
      } });
      if (!updated.count) throw new AuthError("다른 사용자가 먼저 계약을 수정했습니다. 새로고침 후 다시 시도해 주세요.", 409, "VERSION_CONFLICT");

      const incomingIds = prepared.flatMap((line) => line.id ? [line.id] : []);
      await tx.contractLine.updateMany({ where: { contractId: id, isActive: true, ...(incomingIds.length ? { id: { notIn: incomingIds } } : {}) }, data: { isActive: false, updatedById: actor.id } });
      for (const [index, line] of prepared.entries()) {
        const { id: lineId, ...data } = line;
        if (lineId) await tx.contractLine.update({ where: { id: lineId }, data: { ...data, isActive: true, sortOrder: index, updatedById: actor.id } });
        else await tx.contractLine.create({ data: { ...data, contractId: id, sortOrder: index, createdById: actor.id, updatedById: actor.id } });
      }
      const contract = await tx.contract.findUniqueOrThrow({ where: { id }, include: contractInclude });
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "UPDATE", entityType: "CONTRACT", entityId: id, before, after: contract });
      await recordSyncEvent(tx, { type: "contract.changed", entityId: id, siteId: contract.siteId, actorId: actor.id });
      return contract;
    });
  } catch (error) { throw mapContractError(error); }
}

async function prepareAggregate(
  tx: Prisma.TransactionClient,
  actor: SessionUser,
  input: ContractInput,
  before?: { id: string; siteId: string; lines: Array<{ id: string; contractId: string; itemId: string; isActive: boolean; standardSalesPriceSnapshot: number; standardCostPriceSnapshot: number; appliedSalesPrice: number; appliedCostPrice: number; priceOverrideReason: string | null; priceOverriddenById: string | null; priceOverriddenAt: Date | null }> },
) {
  const site = await tx.site.findUnique({ where: { id: input.siteId }, select: { id: true, isActive: true } });
  if (!site || (!site.isActive && before?.siteId !== site.id)) throw new AuthError("사용 가능한 현장을 선택해 주세요.", 400, "INVALID_CONTRACT_SITE");
  const itemIds = [...new Set(input.lines.map((line) => line.itemId))];
  const items = await tx.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, unit: true, standardSalesPrice: true, standardCostPrice: true, isActive: true } });
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const existingMap = new Map(before?.lines.map((line) => [line.id, line]) ?? []);

  return input.lines.map((line) => {
    const existing = line.id ? existingMap.get(line.id) : undefined;
    if (line.id && (!existing || existing.contractId !== before?.id || !existing.isActive)) throw new AuthError("계약에 속하지 않은 품목 행이 포함되어 있습니다.", 400, "INVALID_CONTRACT_LINE");
    const item = itemMap.get(line.itemId);
    if (!item || (!item.isActive && existing?.itemId !== item.id)) throw new AuthError("사용 가능한 품목을 선택해 주세요.", 400, "INVALID_CONTRACT_ITEM");
    const sameItem = existing?.itemId === item.id;
    const standardSalesPriceSnapshot = sameItem ? existing.standardSalesPriceSnapshot : item.standardSalesPrice;
    const standardCostPriceSnapshot = sameItem ? existing.standardCostPriceSnapshot : item.standardCostPrice;
    const overridden = line.appliedSalesPrice !== standardSalesPriceSnapshot || line.appliedCostPrice !== standardCostPriceSnapshot;
    const reason = emptyToNull(line.priceOverrideReason);
    if (overridden && !reason) throw new AuthError("표준단가와 다른 계약단가에는 예외 사유가 필요합니다.", 400, "PRICE_OVERRIDE_REASON_REQUIRED");
    const overrideUnchanged = overridden && sameItem && existing?.appliedSalesPrice === line.appliedSalesPrice
      && existing.appliedCostPrice === line.appliedCostPrice && existing.priceOverrideReason === reason;
    return {
      id: line.id,
      itemId: line.itemId,
      description: emptyToNull(line.description),
      quantity: line.quantity,
      unit: item.unit,
      standardSalesPriceSnapshot,
      appliedSalesPrice: line.appliedSalesPrice,
      standardCostPriceSnapshot,
      appliedCostPrice: line.appliedCostPrice,
      priceOverrideReason: overridden ? reason : null,
      priceOverriddenById: overridden ? (overrideUnchanged ? existing?.priceOverriddenById ?? actor.id : actor.id) : null,
      priceOverriddenAt: overridden ? (overrideUnchanged ? existing?.priceOverriddenAt ?? new Date() : new Date()) : null,
      revenueStartDate: dbDate(line.revenueStartDate),
      revenueEndDate: dbDate(line.revenueEndDate),
    };
  });
}

function dbDate(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function emptyToNull(value?: string | null) { return value?.trim() || null; }
function mapContractError(error: unknown) {
  if (error instanceof AuthError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return new AuthError("계약번호가 이미 사용 중입니다.", 409, "DUPLICATE_CONTRACT_NO");
  return error;
}
