import type { Prisma } from "@/generated/prisma/client";
import { AuthError } from "@/lib/auth/errors";
import { cleanAliases, normalizeAlias } from "@/lib/masters/normalize";

export async function assertSiteIdentityAvailable(
  tx: Prisma.TransactionClient,
  name: string,
  aliases: string[],
  exceptId?: string,
) {
  const others = await tx.site.findMany({
    where: exceptId ? { id: { not: exceptId } } : undefined,
    select: { name: true, aliases: { select: { normalizedAlias: true } } },
  });
  assertIdentityAvailable(name, aliases, others);
}

export async function assertItemIdentityAvailable(
  tx: Prisma.TransactionClient,
  name: string,
  aliases: string[],
  exceptId?: string,
) {
  const others = await tx.item.findMany({
    where: exceptId ? { id: { not: exceptId } } : undefined,
    select: { name: true, aliases: { select: { normalizedAlias: true } } },
  });
  assertIdentityAvailable(name, aliases, others);
}

function assertIdentityAvailable(
  name: string,
  aliases: string[],
  others: Array<{ name: string; aliases: Array<{ normalizedAlias: string }> }>,
) {
  const occupied = new Set(
    others.flatMap((row) => [normalizeAlias(row.name), ...row.aliases.map((alias) => alias.normalizedAlias)]),
  );
  const incoming = [normalizeAlias(name), ...cleanAliases(aliases, name).map((alias) => alias.normalizedAlias)];
  if (incoming.some((key) => occupied.has(key))) {
    throw new AuthError("동일한 이름 또는 별칭을 사용하는 마스터가 이미 있습니다.", 409, "DUPLICATE_MASTER_NAME");
  }
}
