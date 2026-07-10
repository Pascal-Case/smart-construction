import "server-only";

import type { Prisma } from "@/generated/prisma/client";

type AuditInput = {
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

function serialize(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}

export function recordAudit(tx: Prisma.TransactionClient, input: AuditInput) {
  return tx.auditLog.create({
    data: {
      actorId: input.actorId,
      actorName: input.actorName,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeJson: serialize(input.before),
      afterJson: serialize(input.after),
    },
  });
}
