import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export type AppEventType = "monthlyMemo.changed" | "site.changed" | "item.changed" | "contract.changed" | "revenue.changed" | "invoice.changed";
export type AppEvent = { id: number; type: AppEventType; entityId: string; siteId: string | null; month: string | null; actorId: string | null; occurredAt: string };
export type SyncEventInput = { type: AppEventType; entityId: string; siteId?: string; month?: string; actorId?: string };

export async function recordSyncEvent(tx: Prisma.TransactionClient, event: SyncEventInput) { return tx.syncEvent.create({ data: event }); }

export async function latestEventId() { return (await prisma.syncEvent.findFirst({ orderBy: { id: "desc" }, select: { id: true } }))?.id ?? 0; }
export async function eventsAfter(id: number) { return (await prisma.syncEvent.findMany({ where: { id: { gt: id } }, orderBy: { id: "asc" }, take: 100 })).map(toAppEvent); }
function toAppEvent(event: { id: number; type: string; entityId: string; siteId: string | null; month: string | null; actorId: string | null; createdAt: Date }): AppEvent { return { ...event, type: event.type as AppEventType, occurredAt: event.createdAt.toISOString() }; }
