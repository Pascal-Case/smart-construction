import "server-only";

import { Prisma, RevenueStatus } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import { recordSyncEvent } from "@/lib/events/bus";
import { AUTO_CANCEL_REASON, contractRevenuePolicy } from "@/lib/revenues/generation-policy";
import { buildLineRevenueDrafts } from "@/lib/revenues/proration";

type Draft = ReturnType<typeof contractDrafts>[number];
type Existing = Awaited<ReturnType<Prisma.TransactionClient["revenueEntry"]["findMany"]>>[number];

export async function previewContractRevenues(contractId: string) {
  return prisma.$transaction((tx) => buildPreview(tx, contractId));
}

export async function generateContractRevenues(actor: SessionUser, contractId: string) {
  return prisma.$transaction(async (tx) => {
    const preview = await buildPreview(tx, contractId);
    const counts = { create: 0, update: 0, unchanged: 0, protected: 0, cancel: 0 };
    for (const row of preview.rows) {
      if (row.action === "CREATE") {
        await tx.revenueEntry.create({ data: { ...revenueData(row.draft!), createdById: actor.id, updatedById: actor.id } }); counts.create += 1;
      } else if (row.action === "RECREATE") {
        const released = await tx.revenueEntry.updateMany({ where: { id: row.existing!.id, version: row.existing!.version, status: RevenueStatus.CANCELED, generatedKey: row.existing!.generatedKey }, data: { generatedKey: null, updatedById: actor.id, version: { increment: 1 } } });
        if (!released.count) throw new AuthError("다른 사용자가 취소 매출을 먼저 변경했습니다. 다시 미리보기해 주세요.", 409, "VERSION_CONFLICT");
        await tx.revenueEntry.create({ data: { ...revenueData(row.draft!), createdById: actor.id, updatedById: actor.id } }); counts.create += 1;
      } else if (row.action === "UPDATE") {
        const updated = await tx.revenueEntry.updateMany({ where: { id: row.existing!.id, version: row.existing!.version }, data: { ...revenueData(row.draft!), status: RevenueStatus.DRAFT, cancelReason: null, canceledAt: null, canceledById: null, updatedById: actor.id, version: { increment: 1 } } });
        if (!updated.count) throw new AuthError("다른 사용자가 자동 매출을 먼저 수정했습니다. 다시 미리보기해 주세요.", 409, "VERSION_CONFLICT"); counts.update += 1;
      } else if (row.action === "CANCEL") {
        const updated = await tx.revenueEntry.updateMany({ where: { id: row.existing!.id, version: row.existing!.version, status: RevenueStatus.DRAFT }, data: { status: RevenueStatus.CANCELED, cancelReason: AUTO_CANCEL_REASON, canceledById: actor.id, canceledAt: new Date(), updatedById: actor.id, version: { increment: 1 } } });
        if (!updated.count) throw new AuthError("다른 사용자가 자동 매출을 먼저 수정했습니다. 다시 미리보기해 주세요.", 409, "VERSION_CONFLICT"); counts.cancel += 1;
      } else if (row.action === "UNCHANGED") counts.unchanged += 1;
      else counts.protected += 1;
    }
    await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "GENERATE", entityType: "CONTRACT_REVENUE", entityId: contractId, after: counts });
    await recordSyncEvent(tx, { type: "revenue.changed", entityId: contractId, siteId: preview.contract.siteId, actorId: actor.id });
    return counts;
  });
}

async function buildPreview(tx: Prisma.TransactionClient, contractId: string) {
  const contract = await tx.contract.findUnique({ where: { id: contractId }, include: {
    site: { select: { name: true } },
    lines: { where: { isActive: true }, include: { item: { select: { name: true } } }, orderBy: { sortOrder: "asc" } },
  } });
  if (!contract) throw new AuthError("계약을 찾을 수 없습니다.", 404, "CONTRACT_NOT_FOUND");
  if (contract.status !== "ACTIVE") throw new AuthError("진행 상태 계약만 자동 매출을 생성할 수 있습니다.", 400, "CONTRACT_NOT_ACTIVE");
  const drafts = contractDrafts(contract);
  const existing = await tx.revenueEntry.findMany({ where: { contractId, sourceType: "CONTRACT" } });
  const byKey = new Map(existing.flatMap((row) => row.generatedKey ? [[row.generatedKey, row] as const] : []));
  const draftKeys = new Set(drafts.map((draft) => draft.generatedKey));
  const rows: PreviewRow[] = drafts.map((draft) => {
    const current = byKey.get(draft.generatedKey);
    if (!current) return { action: "CREATE", draft };
    const policy = contractRevenuePolicy(current);
    if (policy === "PROTECTED") return { action: "PROTECTED", draft, existing: current, reason: "확정 매출" };
    if (policy === "RECREATE") return { action: "RECREATE", draft, existing: current, reason: "사용자 취소 후 재등록" };
    return { action: sameRevenue(current, draft) && current.status === "DRAFT" ? "UNCHANGED" : "UPDATE", draft, existing: current };
  });
  for (const current of existing) {
    if (!current.generatedKey || draftKeys.has(current.generatedKey)) continue;
    rows.push(current.status === "DRAFT" ? { action: "CANCEL", existing: current } : { action: "PROTECTED", existing: current, reason: current.status === "CONFIRMED" ? "확정 매출" : "취소 매출" });
  }
  return { contract: { id: contract.id, contractNo: contract.contractNo, title: contract.title, siteId: contract.siteId, siteName: contract.site.name, version: contract.version }, rows, counts: countActions(rows), totalSalesAmount: drafts.reduce((sum, row) => sum + row.salesAmount, 0), totalCostAmount: drafts.reduce((sum, row) => sum + row.costAmount, 0) };
}

function contractDrafts(contract: { id: string; title: string; siteId: string; lines: Array<{ id: string; itemId: string; description: string | null; quantity: number; unit: string; standardSalesPriceSnapshot: number; appliedSalesPrice: number; standardCostPriceSnapshot: number; appliedCostPrice: number; priceOverrideReason: string | null; revenueStartDate: Date; revenueEndDate: Date; item: { name: string } }> }) {
  return contract.lines.flatMap((line) => buildLineRevenueDrafts(line).map((month) => ({
    ...month, siteId: contract.siteId, contractId: contract.id, contractLineId: line.id, itemId: line.itemId,
    title: `${contract.title} - ${line.item.name}`, description: line.description, quantity: line.quantity, unit: line.unit,
    standardSalesPriceSnapshot: line.standardSalesPriceSnapshot, appliedSalesPrice: line.appliedSalesPrice,
    standardCostPriceSnapshot: line.standardCostPriceSnapshot, appliedCostPrice: line.appliedCostPrice,
    priceOverrideReason: line.priceOverrideReason,
  })));
}

function revenueData(draft: Draft) { const { allocationBaseDays, ...data } = draft; return { ...data, daysInMonth: allocationBaseDays, sourceType: "CONTRACT" as const, status: "DRAFT" as const }; }
function sameRevenue(row: Existing, draft: Draft) { return row.siteId === draft.siteId && row.itemId === draft.itemId && row.title === draft.title && row.description === draft.description && row.quantity === draft.quantity && row.unit === draft.unit && row.standardSalesPriceSnapshot === draft.standardSalesPriceSnapshot && row.appliedSalesPrice === draft.appliedSalesPrice && row.salesAmount === draft.salesAmount && row.prorationDays === draft.prorationDays && row.daysInMonth === draft.allocationBaseDays && row.standardCostPriceSnapshot === draft.standardCostPriceSnapshot && row.appliedCostPrice === draft.appliedCostPrice && row.costAmount === draft.costAmount && row.priceOverrideReason === draft.priceOverrideReason && dateKey(row.revenueDate) === dateKey(draft.revenueDate) && dateKey(row.servicePeriodStart) === dateKey(draft.servicePeriodStart) && dateKey(row.servicePeriodEnd) === dateKey(draft.servicePeriodEnd); }
function dateKey(value: Date | null) { return value?.toISOString().slice(0, 10) ?? null; }
type Action = "CREATE" | "RECREATE" | "UPDATE" | "UNCHANGED" | "PROTECTED" | "CANCEL";
type PreviewRow = { action: Action; draft?: Draft; existing?: Existing; reason?: string };
function countActions(rows: PreviewRow[]) { return { create: rows.filter((row) => row.action === "CREATE" || row.action === "RECREATE").length, update: rows.filter((row) => row.action === "UPDATE").length, unchanged: rows.filter((row) => row.action === "UNCHANGED").length, protected: rows.filter((row) => row.action === "PROTECTED").length, cancel: rows.filter((row) => row.action === "CANCEL").length }; }
