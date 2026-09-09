import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import { recordSyncEvent } from "@/lib/events/bus";
import { normalizeAlias } from "@/lib/masters/normalize";
import { nextBusinessCode } from "@/lib/masters/sequence";

export async function listContractCategories(activeOnly = false) {
  return prisma.contractCategory.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: [{ name: "asc" }, { code: "asc" }],
  });
}

export async function createContractCategory(actor: SessionUser, input: { name: string }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const code = await nextBusinessCode(tx, "contractCategory");
      const category = await tx.contractCategory.create({ data: {
        code,
        name: input.name,
        normalizedName: normalizeAlias(input.name),
        createdById: actor.id,
        updatedById: actor.id,
      } });
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "CREATE", entityType: "CONTRACT_CATEGORY", entityId: category.id, after: category });
      await recordSyncEvent(tx, { type: "contract-category.changed", entityId: category.id, actorId: actor.id });
      return category;
    });
  } catch (error) { throw mapError(error); }
}

export async function updateContractCategory(actor: SessionUser, id: string, input: { name?: string; isActive?: boolean; version: number }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.contractCategory.findUnique({ where: { id } });
      if (!before) throw new AuthError("계약 구분을 찾을 수 없습니다.", 404, "CONTRACT_CATEGORY_NOT_FOUND");
      const result = await tx.contractCategory.updateMany({
        where: { id, version: input.version },
        data: { ...(input.name === undefined ? {} : { name: input.name, normalizedName: normalizeAlias(input.name) }), ...(input.isActive === undefined ? {} : { isActive: input.isActive }), updatedById: actor.id, version: { increment: 1 } },
      });
      if (!result.count) throw new AuthError("다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.", 409, "VERSION_CONFLICT");
      const category = await tx.contractCategory.findUniqueOrThrow({ where: { id } });
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "UPDATE", entityType: "CONTRACT_CATEGORY", entityId: id, before, after: category });
      await recordSyncEvent(tx, { type: "contract-category.changed", entityId: id, actorId: actor.id });
      return category;
    });
  } catch (error) { throw mapError(error); }
}

function mapError(error: unknown) {
  if (error instanceof AuthError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new AuthError("같은 계약 구분명이 이미 존재합니다.", 409, "DUPLICATE_CONTRACT_CATEGORY");
  }
  return error;
}
