import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import { recordSyncEvent } from "@/lib/events/bus";

export async function getMonthlyMemo(siteId: string, month: string) {
  const memo = await prisma.monthlyMemo.findUnique({ where: { siteId_month: { siteId, month } } });
  if (!memo) return null;
  const user = await prisma.user.findUnique({ where: { id: memo.updatedById }, select: { name: true } });
  return { ...memo, updatedByName: user?.name ?? "알 수 없음" };
}

export async function saveMonthlyMemo(actor: SessionUser, input: { siteId: string; month: string; content: string; version?: number | null }) {
  let before: Awaited<ReturnType<typeof prisma.monthlyMemo.findUnique>> = null;
  try {
    const memo = await prisma.$transaction(async (tx) => {
      const site = await tx.site.findUnique({ where: { id: input.siteId }, select: { id: true } });
      if (!site) throw new AuthError("현장을 찾을 수 없습니다.", 404, "SITE_NOT_FOUND");
      before = await tx.monthlyMemo.findUnique({ where: { siteId_month: { siteId: input.siteId, month: input.month } } });
      if (!before) {
        if (input.version != null) throw new AuthError("메모 상태가 변경되었습니다. 다시 불러와 주세요.", 409, "VERSION_CONFLICT");
        const created = await tx.monthlyMemo.create({ data: { siteId: input.siteId, month: input.month, content: input.content, createdById: actor.id, updatedById: actor.id } });
        await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "CREATE", entityType: "MONTHLY_MEMO", entityId: created.id, after: created });
        await recordSyncEvent(tx, { type: "monthlyMemo.changed", entityId: created.id, siteId: created.siteId, month: created.month, actorId: actor.id });
        return created;
      }
      if (input.version == null) throw new AuthError("다른 사용자가 메모를 먼저 만들었습니다. 다시 불러와 주세요.", 409, "VERSION_CONFLICT");
      const updated = await tx.monthlyMemo.updateMany({ where: { id: before.id, version: input.version }, data: { content: input.content, updatedById: actor.id, version: { increment: 1 } } });
      if (!updated.count) throw new AuthError("다른 사용자가 메모를 먼저 수정했습니다. 내용을 다시 확인해 주세요.", 409, "VERSION_CONFLICT");
      const saved = await tx.monthlyMemo.findUniqueOrThrow({ where: { id: before.id } });
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "UPDATE", entityType: "MONTHLY_MEMO", entityId: saved.id, before, after: saved });
      await recordSyncEvent(tx, { type: "monthlyMemo.changed", entityId: saved.id, siteId: saved.siteId, month: saved.month, actorId: actor.id });
      return saved;
    });
    return { ...memo, updatedByName: actor.name };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AuthError("다른 사용자가 메모를 먼저 만들었습니다. 다시 불러와 주세요.", 409, "VERSION_CONFLICT");
    throw error;
  }
}
