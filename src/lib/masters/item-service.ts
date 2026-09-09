import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import { recordSyncEvent } from "@/lib/events/bus";
import { assertItemIdentityAvailable } from "@/lib/masters/identity";
import { cleanAliases, normalizeAlias, normalizeCode } from "@/lib/masters/normalize";
import { sortItems } from "@/lib/masters/list-order";
import type { ItemCreateInput, ItemInput, ItemListQuery } from "@/lib/masters/schemas";
import { nextBusinessCode } from "@/lib/masters/sequence";

const includeAliases = {
  aliases: { orderBy: { alias: "asc" as const } },
  invoiceDisplayItem: { select: { id: true, code: true, name: true, isActive: true } },
};

export async function listItems(query: ItemListQuery) {
  const where: Prisma.ItemWhereInput = {
    ...(query.status === "active" ? { isActive: true } : query.status === "inactive" ? { isActive: false } : {}),
    ...(query.q ? { OR: [
      { code: { contains: normalizeCode(query.q) } }, { name: { contains: query.q } },
      { unit: { contains: query.q } },
      { aliases: { some: { normalizedAlias: { contains: normalizeAlias(query.q) } } } },
    ] } : {}),
  };
  const filteredRows = await prisma.item.findMany({ where, include: includeAliases });
  const sortedRows = sortItems(filteredRows, query.sort, query.order);
  const total = sortedRows.length;
  const rows = sortedRows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
  return { rows: rows.map(toItemView), total, page: query.page, pageSize: query.pageSize, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
}

export async function createItem(actor: SessionUser, input: ItemCreateInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      await assertItemIdentityAvailable(tx, input.name, input.aliases);
      await assertDisplayItem(tx, input.invoiceDisplayItemId);
      const code = await nextBusinessCode(tx, "item");
      const item = await tx.item.create({
        data: {
          code, name: input.name, unit: input.unit, standardSalesPrice: input.standardSalesPrice,
          standardCostPrice: input.standardCostPrice, isActive: input.isActive,
          specification: emptyToNull(input.specification), memo: emptyToNull(input.memo),
          invoiceDisplayItemId: input.invoiceDisplayItemId || null,
          createdById: actor.id, updatedById: actor.id, aliases: { create: cleanAliases(input.aliases, input.name) },
        }, include: includeAliases,
      });
      const view = toItemView(item);
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "CREATE", entityType: "ITEM", entityId: item.id, after: view });
      await recordSyncEvent(tx, { type: "item.changed", entityId: item.id, actorId: actor.id });
      return view;
    });
  } catch (error) { throw mapMasterError(error); }
}

export async function updateItem(actor: SessionUser, id: string, input: ItemInput & { version: number }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.item.findUnique({ where: { id }, include: includeAliases });
      if (!before) throw new AuthError("품목을 찾을 수 없습니다.", 404, "ITEM_NOT_FOUND");
      await assertItemIdentityAvailable(tx, input.name, input.aliases, id);
      await assertDisplayItem(tx, input.invoiceDisplayItemId, id, before.invoiceDisplayItemId);
      const result = await tx.item.updateMany({ where: { id, version: input.version }, data: {
        code: input.code ? normalizeCode(input.code) : before.code, name: input.name, unit: input.unit,
        standardSalesPrice: input.standardSalesPrice, standardCostPrice: input.standardCostPrice,
        isActive: input.isActive, specification: emptyToNull(input.specification), memo: emptyToNull(input.memo),
        invoiceDisplayItemId: input.invoiceDisplayItemId || null,
        updatedById: actor.id, version: { increment: 1 },
      } });
      if (!result.count) throw new AuthError("다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.", 409, "VERSION_CONFLICT");
      await tx.itemAlias.deleteMany({ where: { itemId: id } });
      const aliases = cleanAliases(input.aliases, input.name);
      if (aliases.length) await tx.itemAlias.createMany({ data: aliases.map((alias) => ({ ...alias, itemId: id })) });
      const item = await tx.item.findUniqueOrThrow({ where: { id }, include: includeAliases });
      const view = toItemView(item);
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "UPDATE", entityType: "ITEM", entityId: id, before: toItemView(before), after: view });
      await recordSyncEvent(tx, { type: "item.changed", entityId: id, actorId: actor.id });
      return view;
    });
  } catch (error) { throw mapMasterError(error); }
}

export function toItemView<T extends { aliases: Array<{ alias: string }> }>(item: T) {
  return { ...item, aliases: item.aliases.map((alias) => alias.alias) };
}

function emptyToNull(value?: string | null) { return value?.trim() || null; }
async function assertDisplayItem(tx: Prisma.TransactionClient, targetId?: string | null, sourceId?: string, previousTargetId?: string | null) {
  if (!targetId) return;
  if (targetId === sourceId) throw new AuthError("품목 자신을 거래명세표 표시 품목으로 지정할 수 없습니다.", 400, "INVALID_INVOICE_DISPLAY_ITEM");
  const target = await tx.item.findUnique({ where: { id: targetId }, select: { id: true, isActive: true, invoiceDisplayItemId: true } });
  if (!target || (!target.isActive && previousTargetId !== target.id)) throw new AuthError("사용 가능한 표시 품목을 선택해 주세요.", 400, "INVALID_INVOICE_DISPLAY_ITEM");
  if (target.invoiceDisplayItemId) throw new AuthError("다른 표시 품목에 연결된 품목은 대표 품목으로 선택할 수 없습니다.", 400, "CHAINED_INVOICE_DISPLAY_ITEM");
  if (sourceId && await tx.item.count({ where: { invoiceDisplayItemId: sourceId } })) {
    throw new AuthError("다른 품목의 대표 품목은 다시 다른 대표 품목에 연결할 수 없습니다.", 400, "CHAINED_INVOICE_DISPLAY_ITEM");
  }
}
function mapMasterError(error: unknown) {
  if (error instanceof AuthError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return new AuthError("품목 코드 또는 별칭이 이미 사용 중입니다.", 409, "DUPLICATE_MASTER_KEY");
  return error;
}
