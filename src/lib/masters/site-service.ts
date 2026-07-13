import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import { recordSyncEvent } from "@/lib/events/bus";
import { assertSiteIdentityAvailable } from "@/lib/masters/identity";
import { cleanAliases, normalizeAlias, normalizeCode } from "@/lib/masters/normalize";
import { sortSites } from "@/lib/masters/list-order";
import type { SiteInput, SiteListQuery } from "@/lib/masters/schemas";
import { nextBusinessCode } from "@/lib/masters/sequence";

const includeAliases = { aliases: { orderBy: { alias: "asc" as const } } };

export async function listSites(query: SiteListQuery) {
  const where: Prisma.SiteWhereInput = {
    ...(query.status === "active" ? { isActive: true } : query.status === "inactive" ? { isActive: false } : {}),
    ...(query.q ? { OR: [
      { code: { contains: normalizeCode(query.q) } },
      { name: { contains: query.q } },
      { customerName: { contains: query.q } },
      { aliases: { some: { normalizedAlias: { contains: normalizeAlias(query.q) } } } },
    ] } : {}),
  };
  const filteredRows = await prisma.site.findMany({ where, include: includeAliases });
  const sortedRows = sortSites(filteredRows, query.sort, query.order);
  const total = sortedRows.length;
  const rows = sortedRows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
  return { rows: rows.map(toSiteView), total, page: query.page, pageSize: query.pageSize, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
}

export async function createSite(actor: SessionUser, input: SiteInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      await assertSiteIdentityAvailable(tx, input.name, input.aliases);
      const code = input.code ? normalizeCode(input.code) : await nextBusinessCode(tx, "site");
      const site = await tx.site.create({
        data: {
          code, name: input.name, customerName: emptyToNull(input.customerName), address: emptyToNull(input.address),
          managerName: emptyToNull(input.managerName), managerContact: emptyToNull(input.managerContact),
          startDate: toDate(input.startDate), endDate: toDate(input.endDate), isActive: input.isActive,
          memo: emptyToNull(input.memo), createdById: actor.id, updatedById: actor.id,
          aliases: { create: cleanAliases(input.aliases, input.name) },
        },
        include: includeAliases,
      });
      const view = toSiteView(site);
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "CREATE", entityType: "SITE", entityId: site.id, after: view });
      await recordSyncEvent(tx, { type: "site.changed", entityId: site.id, siteId: site.id, actorId: actor.id });
      return view;
    });
  } catch (error) { throw mapMasterError(error); }
}

export async function updateSite(actor: SessionUser, id: string, input: SiteInput & { version: number }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.site.findUnique({ where: { id }, include: includeAliases });
      if (!before) throw new AuthError("현장을 찾을 수 없습니다.", 404, "SITE_NOT_FOUND");
      await assertSiteIdentityAvailable(tx, input.name, input.aliases, id);
      const result = await tx.site.updateMany({
        where: { id, version: input.version },
        data: {
          code: input.code ? normalizeCode(input.code) : before.code, name: input.name,
          customerName: emptyToNull(input.customerName), address: emptyToNull(input.address), managerName: emptyToNull(input.managerName),
          managerContact: emptyToNull(input.managerContact), startDate: toDate(input.startDate), endDate: toDate(input.endDate),
          isActive: input.isActive, memo: emptyToNull(input.memo), updatedById: actor.id, version: { increment: 1 },
        },
      });
      if (!result.count) throw new AuthError("다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.", 409, "VERSION_CONFLICT");
      await tx.siteAlias.deleteMany({ where: { siteId: id } });
      const aliases = cleanAliases(input.aliases, input.name);
      if (aliases.length) await tx.siteAlias.createMany({ data: aliases.map((alias) => ({ ...alias, siteId: id })) });
      const site = await tx.site.findUniqueOrThrow({ where: { id }, include: includeAliases });
      const view = toSiteView(site);
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "UPDATE", entityType: "SITE", entityId: id, before: toSiteView(before), after: view });
      await recordSyncEvent(tx, { type: "site.changed", entityId: id, siteId: id, actorId: actor.id });
      return view;
    });
  } catch (error) { throw mapMasterError(error); }
}

export function toSiteView<T extends { aliases: Array<{ alias: string }> }>(site: T) {
  return { ...site, aliases: site.aliases.map((alias) => alias.alias) };
}

function emptyToNull(value?: string | null) { return value?.trim() || null; }
function toDate(value?: string | null) { return value ? new Date(`${value}T00:00:00.000Z`) : null; }
function mapMasterError(error: unknown) {
  if (error instanceof AuthError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return new AuthError("현장 코드 또는 별칭이 이미 사용 중입니다.", 409, "DUPLICATE_MASTER_KEY");
  return error;
}
