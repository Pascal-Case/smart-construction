import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import { recordSyncEvent } from "@/lib/events/bus";
import { resolveInvoiceTemplate } from "@/lib/invoice-templates/service";
import { buildInvoiceDrafts, invoiceRevenueFingerprint, type InvoiceSourceEntry } from "@/lib/invoices/calculation";
import { isPartialRevenueIssuance, isReplaceableInvoiceStatus, replacementRequiredForPeriod, sameRevenueSet, sameRevenueState } from "@/lib/invoices/replacement-policy";
import type { InvoiceCandidateQuery, InvoiceIssueInput, InvoiceListQuery, InvoicePreviewInput, InvoiceReplacementIssueInput, InvoiceReplacementPreviewInput } from "@/lib/invoices/schemas";
import { nextInvoiceNo } from "@/lib/masters/sequence";

const candidateSelect = {
  id: true,
  siteId: true,
  revenueDate: true,
  title: true,
  itemId: true,
  description: true,
  quantity: true,
  unit: true,
  appliedSalesPrice: true,
  salesAmount: true,
  sourceType: true,
  currentInvoiceDocumentId: true,
  contractCategoryId: true,
  contractCategory: { select: { code: true, name: true } },
  site: { select: { code: true, name: true, address: true } },
  item: { select: { id: true, name: true, specification: true, invoiceDisplayItem: { select: { id: true, name: true } }, invoiceDisplaySources: { select: { id: true }, take: 1 } } },
} satisfies Prisma.RevenueEntrySelect;

type CandidateRow = Prisma.RevenueEntryGetPayload<{ select: typeof candidateSelect }>;
type NewIssueTarget = Extract<InvoiceIssueInput["targets"][number], { kind: "NEW" }>;
type NewPreviewTarget = Extract<InvoicePreviewInput["targets"][number], { kind: "NEW" }>;
type ReplacementIssueTarget = Extract<InvoiceIssueInput["targets"][number], { kind: "REPLACEMENT" }>;
type InvoiceCandidateRow = {
  targetKey: string;
  kind: "NEW" | "REPLACEMENT" | "BLOCKED";
  selectable: boolean;
  blockReason: string | null;
  cycleId: string;
  closeId: string;
  closeVersion: number;
  month: string;
  siteId: string;
  siteCode: string;
  siteName: string;
  contractCategoryId: string | null;
  contractCategoryName: string | null;
  issueItemId: string | null;
  issueItemName: string;
  revenueCount: number;
  supplyAmount: number;
  revenueFingerprint: string;
  currentInvoices: Array<{ id: string; invoiceNo: string; version: number }>;
  sourceInvoiceId?: string;
  sourceVersion?: number;
};

export async function getInvoiceCandidates(query: InvoiceCandidateQuery) {
  const range = monthRange(query.month);
  const closes = await prisma.monthlyClose.findMany({
    where: { month: query.month, state: "CLOSED", ...(query.siteId ? { siteId: query.siteId } : {}) },
    include: {
      site: { select: { id: true, code: true, name: true } },
      cycles: { orderBy: { cycleNo: "desc" }, take: 1 },
    },
    orderBy: { site: { name: "asc" } },
  });
  const siteIds = closes.map((close) => close.siteId);
  const revenueEntryIds = [...new Set(closes.flatMap((close) => close.cycles[0] ? snapshotRevenueIds(close.cycles[0].snapshotJson) : []))];
  const [currentDocuments, revenueEntries] = siteIds.length
    ? await Promise.all([
      prisma.invoiceDocument.findMany({
        where: { status: "ISSUED", siteId: { in: siteIds }, periodStart: { lte: range.end }, periodEnd: { gte: range.start } },
        select: {
          id: true,
          invoiceNo: true,
          siteId: true,
          periodStart: true,
          periodEnd: true,
          version: true,
          issuedAt: true,
          subtotal: true,
          contractCategoryId: true,
          issueItemId: true,
          issueItemName: true,
          revenueFingerprint: true,
          closeRevenueFingerprint: true,
          revenueLinks: { select: { revenueEntryId: true } },
        },
        orderBy: [{ issuedAt: "desc" }, { invoiceNo: "desc" }],
      }),
      revenueEntryIds.length
        ? prisma.revenueEntry.findMany({ where: { id: { in: revenueEntryIds } }, select: candidateSelect })
        : Promise.resolve([]),
    ])
    : [[], []];
  const documentsBySite = groupBy(currentDocuments, (document) => document.siteId);
  const revenueById = new Map(revenueEntries.map((entry) => [entry.id, entry]));
  const rows = closes.flatMap<InvoiceCandidateRow>((close): InvoiceCandidateRow[] => {
    const cycle = close.cycles[0];
    if (!cycle) return [];
    const cycleRevenueIds = snapshotRevenueIds(cycle.snapshotJson);
    const cycleEntries = cycleRevenueIds.flatMap((id) => {
      const entry = revenueById.get(id);
      return entry ? [entry] : [];
    });
    const documents = documentsBySite.get(close.siteId) ?? [];
    const byCategory = groupBy(cycleEntries, (entry) => entry.contractCategoryId ?? "__NO_CATEGORY__");
    return [...byCategory.entries()].flatMap<InvoiceCandidateRow>(([categoryKey, categoryEntries]) => {
      const categoryId = categoryEntries[0]?.contractCategoryId ?? null;
      const categoryDocuments = documents.filter((document) => document.contractCategoryId === categoryId);
      const categoryDocumentIds = new Set(categoryDocuments.map((document) => document.id));
      const categoryRevenueIds = categoryEntries.map((entry) => entry.id);
      const unissuedEntries = categoryEntries.filter((entry) => entry.currentInvoiceDocumentId == null);
      const periodMatches = categoryDocuments.every((document) => document.periodStart.getTime() === range.start.getTime() && document.periodEnd.getTime() === range.end.getTime());
      const pointerConflict = categoryEntries.some((entry) => entry.currentInvoiceDocumentId != null && !categoryDocumentIds.has(entry.currentInvoiceDocumentId));
      const hasScopeConflict = !periodMatches || pointerConflict;
      const documentFingerprintChanged = categoryDocuments.some((document) => {
        if (!document.revenueFingerprint) return false;
        const linkedEntries = document.revenueLinks.flatMap((link) => {
          const entry = revenueById.get(link.revenueEntryId);
          return entry ? [entry] : [];
        });
        if (linkedEntries.length !== document.revenueLinks.length) return true;
        try {
          return invoiceRevenueFingerprint(linkedEntries.map(toSourceEntry)) !== document.revenueFingerprint;
        } catch {
          return true;
        }
      });
      const legacyFingerprintChanged = !unissuedEntries.length
        && categoryDocuments.every((document) => !document.revenueFingerprint)
        && categoryDocuments.some((document) => document.closeRevenueFingerprint != null)
        && categoryDocuments.some((document) => document.closeRevenueFingerprint !== cycle.revenueFingerprint);
      const fingerprintChanged = documentFingerprintChanged || legacyFingerprintChanged;
      const categoryReplacementRequired = categoryDocuments.length > 0 && (fingerprintChanged || (!unissuedEntries.length && replacementRequiredForPeriod(
        [{ revenueEntryIds: categoryRevenueIds, totalSalesAmount: categoryEntries.reduce((sum, entry) => sum + entry.salesAmount, 0) }],
        categoryDocuments.map((document) => ({ revenueEntryIds: document.revenueLinks.map((link) => link.revenueEntryId), subtotal: document.subtotal })),
      )));
      const common = {
        cycleId: cycle.id,
        closeId: close.id,
        closeVersion: close.version,
        month: close.month,
        siteId: close.siteId,
        siteCode: close.site.code,
        siteName: close.site.name,
        contractCategoryId: categoryId,
        contractCategoryName: categoryEntries[0]?.contractCategory?.name ?? null,
        issueItemId: null,
        issueItemName: "전체 품목",
        revenueCount: categoryEntries.length,
        supplyAmount: categoryEntries.reduce((sum, entry) => sum + entry.salesAmount, 0),
        revenueFingerprint: cycle.revenueFingerprint,
        currentInvoices: categoryDocuments.map((document) => ({ id: document.id, invoiceNo: document.invoiceNo, version: document.version })),
      };
      if (hasScopeConflict) return [{
        ...common,
        targetKey: `blocked:${close.siteId}:${close.month}:${categoryKey}`,
        kind: "BLOCKED" as const,
        selectable: false,
        blockReason: "현재 유효 거래명세표의 매출기간 또는 연결 상태가 최신 마감 회차와 충돌합니다. 발행 이력에서 확인해 주세요.",
      }];
      if (categoryReplacementRequired) {
        const source = categoryDocuments[0];
        return source ? [{
          ...common,
          targetKey: `replacement:${close.siteId}:${close.month}:${categoryKey}`,
          kind: "REPLACEMENT" as const,
          selectable: true,
          sourceInvoiceId: source.id,
          sourceVersion: source.version,
          blockReason: null,
        }] : [];
      }
      return [...groupBy(categoryEntries, (entry) => entry.itemId ?? "__NO_ITEM__").values()]
        .flatMap((groupEntries) => {
          const newEntries = groupEntries.filter((entry) => entry.currentInvoiceDocumentId == null);
          if (!newEntries.length) return [];
          const issueItemId = newEntries[0].itemId;
          const issueItemName = issueItemLabel(newEntries[0]);
          return [{
            ...common,
            targetKey: `new:${cycle.id}:${categoryKey}:${issueItemId ?? "none"}`,
            kind: "NEW" as const,
            selectable: true,
            issueItemId,
            issueItemName,
            revenueCount: newEntries.length,
            supplyAmount: newEntries.reduce((sum, entry) => sum + entry.salesAmount, 0),
            blockReason: null,
          }];
        });
    });
  });
  rows.sort((a, b) => a.siteName.localeCompare(b.siteName)
    || (a.contractCategoryName ?? "").localeCompare(b.contractCategoryName ?? "")
    || a.issueItemName.localeCompare(b.issueItemName));
  const selectableRows = rows.filter((row) => row.selectable);
  return {
    rows,
    total: rows.length,
    truncated: false,
    totals: { supplyAmount: selectableRows.reduce((sum, row) => sum + row.supplyAmount, 0), taxAmount: selectableRows.reduce((sum, row) => sum + Math.round(row.supplyAmount * 0.1), 0) },
  };
}

export async function previewInvoices(input: InvoicePreviewInput) {
  return prisma.$transaction(async (tx) => {
    const setting = await requireCompanySetting(tx);
    const template = await resolveInvoiceTemplate(input.templateId, input.templateVersion, tx);
    const results = [];
    for (const target of input.targets) {
      try {
        if (target.kind === "NEW") {
          const context = await loadIssueCycle(tx, target);
          const documents = buildInvoiceDrafts(toSourceEntries(context.entries, context.cycle.snapshotJson), input.displayMode);
          const issueDate = target.issueDate ?? input.issueDate;
          results.push({
            targetKey: target.targetKey,
            kind: target.kind,
            outcome: "PREVIEWED" as const,
            commitTarget: target,
            warnings: [],
            issueDateWarning: issueDateWarning(issueDate, context.month + "-01", monthEnd(context.month)),
            documents: documents.map((document) => ({
              ...document,
              closeCycleId: context.cycle.id,
              issueDate,
              periodStart: context.month + "-01",
              periodEnd: monthEnd(context.month),
              displayMode: input.displayMode,
              memo: input.memo ?? null,
              supplier: companySnapshot(setting),
              templateConfig: template.config,
            })),
          });
          continue;
        }
        const context = await loadReplacementContext(tx, target.sourceInvoiceId);
        if (context.source.version !== target.sourceVersion) throw replacementChanged();
        const warnings = await loadMissingContractWarnings(tx, context.source);
        const documents = buildInvoiceDrafts(toSourceEntriesForCycles(context.entries, context.latestCycles), input.displayMode);
        if (!documents.length) throw new AuthError("대체 발행할 확정 매출이 없습니다.", 409, "INVOICE_REPLACEMENT_EMPTY");
        const issueDate = target.issueDate ?? input.issueDate;
        results.push({
          targetKey: target.targetKey,
          kind: target.kind,
          outcome: "PREVIEWED" as const,
          commitTarget: {
            ...target,
            expectedRevenueEntryIds: context.entries.map((entry) => entry.id),
            expectedActiveInvoiceIds: context.activeDocuments.map((document) => document.id),
            expectedCloseCycleIds: context.latestCycles.map((cycle) => cycle.id),
          },
          warnings,
          issueDateWarning: issueDateWarning(issueDate, dateKey(context.source.periodStart), dateKey(context.source.periodEnd)),
          currentInvoices: context.activeDocuments.map((document) => ({ id: document.id, invoiceNo: document.invoiceNo, version: document.version })),
          documents: documents.map((document) => ({
            ...document,
            issueDate,
            periodStart: dateKey(context.source.periodStart),
            periodEnd: dateKey(context.source.periodEnd),
            displayMode: input.displayMode,
            memo: input.memo ?? null,
            supplier: companySnapshot(setting),
            templateConfig: template.config,
          })),
        });
      } catch (error) {
        if (!(error instanceof AuthError)) throw error;
        results.push({ targetKey: target.targetKey, kind: target.kind, outcome: "BLOCKED" as const, error: { code: error.code, message: error.message } });
      }
    }
    const previewed = results.filter((result) => result.outcome === "PREVIEWED");
    return {
      template,
      summary: {
        total: input.targets.length,
        newCount: previewed.filter((result) => result.kind === "NEW").length,
        replacementCount: previewed.filter((result) => result.kind === "REPLACEMENT").length,
        blockedCount: results.filter((result) => result.outcome === "BLOCKED").length,
        supplyAmount: previewed.reduce((sum, result) => sum + (result.outcome === "PREVIEWED" ? result.documents.reduce((total, document) => total + document.subtotal, 0) : 0), 0),
      },
      results,
    };
  });
}

export async function issueInvoices(actor: SessionUser, input: InvoiceIssueInput) {
  const results = [];
  for (const target of input.targets) {
    try {
      const documents = await prisma.$transaction(async (tx) => {
        if (target.kind === "NEW") return issueNewInvoiceInTransaction(tx, actor, target, input);
        return replaceInvoiceInTransaction(tx, actor, target.sourceInvoiceId, { ...input, ...target });
      });
      results.push({ targetKey: target.targetKey, kind: target.kind, ...(target.kind === "NEW" ? { cycleId: target.cycleId } : {}), outcome: "ISSUED" as const, documents: Array.isArray(documents) ? documents : [documents] });
    } catch (error) {
      if (error instanceof AuthError) {
        results.push({ targetKey: target.targetKey, kind: target.kind, ...(target.kind === "NEW" ? { cycleId: target.cycleId } : {}), outcome: "BLOCKED" as const, error: { code: error.code, message: error.message } });
        continue;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        results.push({ targetKey: target.targetKey, kind: target.kind, ...(target.kind === "NEW" ? { cycleId: target.cycleId } : {}), outcome: "ALREADY_ISSUED" as const });
        continue;
      }
      throw error;
    }
  }
  return results;
}

async function issueNewInvoiceInTransaction(
  tx: Prisma.TransactionClient,
  actor: SessionUser,
  target: NewIssueTarget,
  input: Pick<InvoiceIssueInput, "issueDate" | "displayMode" | "memo" | "templateId" | "templateVersion">,
) {
  const setting = await requireCompanySetting(tx);
  const template = await resolveInvoiceTemplate(input.templateId, input.templateVersion, tx);
  const context = await loadIssueCycle(tx, target);
  const drafts = buildInvoiceDrafts(toSourceEntries(context.entries, context.cycle.snapshotJson), input.displayMode);
  const issuedAt = new Date();
  const issueDate = target.issueDate ?? input.issueDate;
  const snapshotInput = { periodStart: context.month + "-01", periodEnd: monthEnd(context.month), issueDate, displayMode: input.displayMode, memo: input.memo };
  const documents = [];
  for (const draft of drafts) {
    const document = await createInvoiceSnapshot(tx, actor, draft, snapshotInput, companySnapshot(setting), template, issuedAt, context.cycle.id, context.cycle.revenueFingerprint);
    const revenueEntryIds = draft.lines.flatMap((line) => line.revenueEntryIds);
    const assigned = await tx.revenueEntry.updateMany({ where: { id: { in: revenueEntryIds }, currentInvoiceDocumentId: null }, data: { currentInvoiceDocumentId: document.id } });
    if (assigned.count !== revenueEntryIds.length) throw new AuthError("마감 회차의 일부 매출이 이미 발행되었습니다.", 409, "INVOICE_CYCLE_CHANGED");
    await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "ISSUE", entityType: "INVOICE", entityId: document.id, after: { invoiceNo: document.invoiceNo, monthlyCloseCycleId: context.cycle.id, contractCategoryCode: draft.contractCategoryCode, issueItemId: draft.issueItemId, issueItemName: draft.issueItemName, issueDate, siteId: draft.siteId, revenueEntryIds, subtotal: draft.subtotal, taxAmount: draft.taxAmount, totalAmount: draft.totalAmount, templateId: template.id, templateVersion: template.version } });
    await recordSyncEvent(tx, { type: "invoice.changed", entityId: document.id, siteId: document.siteId, month: context.month, actorId: actor.id });
    documents.push(await getInvoiceDocument(document.id, tx));
  }
  return documents;
}

export async function previewReplacementInvoice(invoiceId: string, input: InvoiceReplacementPreviewInput) {
  return prisma.$transaction(async (tx) => {
    const setting = await requireCompanySetting(tx);
    const context = await loadReplacementContext(tx, invoiceId);
    if (context.source.version !== input.sourceVersion) throw replacementChanged();
    const template = await resolveInvoiceTemplate(input.templateId, input.templateVersion, tx);
    const warnings = await loadMissingContractWarnings(tx, context.source);
    const drafts = buildInvoiceDrafts(toSourceEntriesForCycles(context.entries, context.latestCycles), input.displayMode);
    if (!drafts.length) throw new AuthError("대체 발행할 확정 매출이 없습니다.", 409, "INVOICE_REPLACEMENT_EMPTY");
    return {
      expectedRevenueEntryIds: context.entries.map((entry) => entry.id),
      warnings,
      issueDateWarning: issueDateWarning(input.issueDate, dateKey(context.source.periodStart), dateKey(context.source.periodEnd)),
      documents: drafts.map((draft) => ({
        ...draft,
        issueDate: input.issueDate,
        periodStart: dateKey(context.source.periodStart),
        periodEnd: dateKey(context.source.periodEnd),
        displayMode: input.displayMode,
        memo: input.memo ?? null,
        supplier: companySnapshot(setting),
        templateConfig: template.config,
      })),
    };
  });
}

export async function replaceInvoice(actor: SessionUser, invoiceId: string, input: InvoiceReplacementIssueInput) {
  return prisma.$transaction((tx) => replaceInvoiceInTransaction(tx, actor, invoiceId, input));
}

async function replaceInvoiceInTransaction(
  tx: Prisma.TransactionClient,
  actor: SessionUser,
  invoiceId: string,
  input: InvoiceReplacementIssueInput & Partial<Pick<ReplacementIssueTarget, "expectedActiveInvoiceIds" | "expectedCloseCycleIds">>,
) {
  const setting = await requireCompanySetting(tx);
  const context = await loadReplacementContext(tx, invoiceId);
  if (context.source.version !== input.sourceVersion) throw replacementChanged();
  const actualRevenueEntryIds = context.entries.map((entry) => entry.id);
  const activeInvoiceIds = context.activeDocuments.map((active) => active.id);
  const closeCycleIds = context.latestCycles.map((cycle) => cycle.id);
  if (!sameRevenueSet(input.expectedRevenueEntryIds, actualRevenueEntryIds)
    || (input.expectedActiveInvoiceIds && !sameRevenueSet(input.expectedActiveInvoiceIds, activeInvoiceIds))
    || (input.expectedCloseCycleIds && !sameRevenueSet(input.expectedCloseCycleIds, closeCycleIds))) throw replacementChanged();
  const template = await resolveInvoiceTemplate(input.templateId, input.templateVersion, tx);
  const drafts = buildInvoiceDrafts(toSourceEntriesForCycles(context.entries, context.latestCycles), input.displayMode);
  if (!drafts.length) throw new AuthError("대체 발행할 확정 매출이 없습니다.", 409, "INVOICE_REPLACEMENT_EMPTY");

  const issuedAt = new Date();
  const snapshotInput = { periodStart: dateKey(context.source.periodStart), periodEnd: dateKey(context.source.periodEnd), issueDate: input.issueDate, displayMode: input.displayMode, memo: input.memo };
  await tx.revenueEntry.updateMany({ where: { currentInvoiceDocumentId: { in: activeInvoiceIds } }, data: { currentInvoiceDocumentId: null } });
  const documents = [];
  for (const draft of drafts) {
    const document = await createInvoiceSnapshot(tx, actor, draft, snapshotInput, companySnapshot(setting), template, issuedAt, context.latestCycles.length === 1 ? context.latestCycles[0].id : null, closeFingerprint(context.latestCycles));
    const revenueEntryIds = draft.lines.flatMap((line) => line.revenueEntryIds);
    const assigned = await tx.revenueEntry.updateMany({ where: { id: { in: revenueEntryIds }, currentInvoiceDocumentId: null }, data: { currentInvoiceDocumentId: document.id } });
    if (assigned.count !== revenueEntryIds.length) throw replacementChanged();
    await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "REPLACE", entityType: "INVOICE", entityId: document.id, after: { invoiceNo: document.invoiceNo, contractCategoryCode: draft.contractCategoryCode, issueItemId: draft.issueItemId, issueItemName: draft.issueItemName, issueDate: input.issueDate, siteId: document.siteId, replacedInvoiceIds: activeInvoiceIds, revenueEntryIds, subtotal: document.subtotal, taxAmount: document.taxAmount, totalAmount: document.totalAmount, templateId: template.id, templateVersion: template.version } });
    await recordSyncEvent(tx, { type: "invoice.changed", entityId: document.id, siteId: document.siteId, actorId: actor.id });
    documents.push(document);
  }
  const replacementByItem = new Map(documents.map((document) => [document.issueItemId ?? "__NO_ITEM__", document.id]));
  for (const active of context.activeDocuments) {
    const supersededByInvoiceId = replacementByItem.get(active.issueItemId ?? "__NO_ITEM__") ?? documents[0].id;
    const superseded = await tx.invoiceDocument.updateMany({ where: { id: active.id, status: "ISSUED" }, data: { status: "SUPERSEDED", supersededAt: issuedAt, supersededByInvoiceId, version: { increment: 1 } } });
    if (superseded.count !== 1) throw replacementChanged();
  }
  return Promise.all(documents.map((document) => getInvoiceDocument(document.id, tx)));
}

export async function listInvoices(query: InvoiceListQuery) {
  const where: Prisma.InvoiceDocumentWhereInput = {
    ...(query.siteId ? { siteId: query.siteId } : {}),
    ...(query.startDate || query.endDate ? { issueDate: { ...(query.startDate ? { gte: dbDate(query.startDate) } : {}), ...(query.endDate ? { lte: endOfDay(query.endDate) } : {}) } } : {}),
    ...(query.q ? { OR: [{ invoiceNo: { contains: query.q } }, { recipientName: { contains: query.q } }, { supplierCompanyName: { contains: query.q } }, { issueItemName: { contains: query.q } }] } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.invoiceDocument.count({ where }),
    prisma.invoiceDocument.findMany({
      where,
      select: {
        id: true,
        invoiceNo: true,
        siteId: true,
        issueDate: true,
        periodStart: true,
        periodEnd: true,
        recipientName: true,
        contractCategoryName: true,
        issueItemName: true,
        closeRevenueFingerprint: true,
        subtotal: true,
        taxAmount: true,
        totalAmount: true,
        displayMode: true,
        status: true,
        version: true,
        issuedAt: true,
        updatedAt: true,
        supersededAt: true,
        supersededBy: { select: { id: true, invoiceNo: true } },
        monthlyCloseCycle: { select: { cycleNo: true } },
        _count: { select: { lines: true, revenueLinks: true } },
      },
      orderBy: [{ issueDate: "desc" }, { invoiceNo: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  const issuedRows = rows.filter((row) => row.status === "ISSUED");
  if (!issuedRows.length) {
    return { rows: rows.map((row) => ({ ...row, replacementRequired: false })), total, page: query.page, pageSize: query.pageSize, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
  }

  const closeTargets = uniqueBy(issuedRows.flatMap((row) => monthsBetween(row.periodStart, row.periodEnd).map((month) => ({ siteId: row.siteId, month }))), (target) => target.siteId + ":" + target.month);
  const periodTargets = uniqueBy(issuedRows.map((row) => ({ siteId: row.siteId, periodStart: row.periodStart, periodEnd: row.periodEnd })), periodKey);
  const [closes, currentDocuments] = await prisma.$transaction([
    prisma.monthlyClose.findMany({
      where: { OR: closeTargets },
      include: { cycles: { orderBy: { cycleNo: "desc" }, take: 1 } },
    }),
    prisma.invoiceDocument.findMany({
      where: { status: "ISSUED", OR: periodTargets },
      select: {
        siteId: true,
        periodStart: true,
        periodEnd: true,
        subtotal: true,
        closeRevenueFingerprint: true,
        revenueLinks: { select: { revenueEntryId: true } },
      },
    }),
  ]);
  const closeBySiteMonth = new Map(closes.map((close) => [close.siteId + ":" + close.month, close]));
  const documentsByPeriod = groupBy(currentDocuments, periodKey);
  const enrichedRows = rows.map((row) => {
    if (row.status !== "ISSUED") return { ...row, replacementRequired: false };
    const closeStates = monthsBetween(row.periodStart, row.periodEnd).map((month) => closeBySiteMonth.get(row.siteId + ":" + month));
    if (closeStates.some((close) => close?.state !== "CLOSED" || !close.cycles[0])) return { ...row, replacementRequired: false };
    const latestCycles = closeStates.map((close) => close!.cycles[0]);
    const documents = documentsByPeriod.get(periodKey(row)) ?? [];
    const expectedFingerprint = closeFingerprint(latestCycles);
    const fingerprintChanged = documents.some((document) => document.closeRevenueFingerprint != null)
      && documents.some((document) => document.closeRevenueFingerprint !== expectedFingerprint);
    const replacementRequired = !isPartialRevenueIssuance(
      latestCycles.map((cycle) => ({ revenueEntryIds: snapshotRevenueIds(cycle.snapshotJson) })),
      documents.map((document) => ({ revenueEntryIds: document.revenueLinks.map((link) => link.revenueEntryId) })),
    ) && (fingerprintChanged || replacementRequiredForPeriod(
      latestCycles.map((cycle) => ({ revenueEntryIds: snapshotRevenueIds(cycle.snapshotJson), totalSalesAmount: cycle.totalSalesAmount })),
      documents.map((document) => ({ revenueEntryIds: document.revenueLinks.map((link) => link.revenueEntryId), subtotal: document.subtotal })),
    ));
    return { ...row, replacementRequired };
  });
  return { rows: enrichedRows, total, page: query.page, pageSize: query.pageSize, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
}

export async function getInvoiceDocument(id: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? prisma;
  const document = await client.invoiceDocument.findUnique({ where: { id }, include: { lines: { orderBy: { sortOrder: "asc" }, include: { revenueLinks: { select: { revenueEntryId: true } } } }, site: { select: { code: true } }, supersededBy: { select: { id: true, invoiceNo: true } }, supersedes: { select: { id: true, invoiceNo: true } } } });
  if (!document) throw new AuthError("거래명세표를 찾을 수 없습니다.", 404, "INVOICE_NOT_FOUND");
  return document;
}

export async function getInvoiceDocuments(ids: string[]) {
  const uniqueIds = [...new Set(ids)].slice(0, 100);
  if (!uniqueIds.length) throw new AuthError("출력할 거래명세표를 선택해 주세요.", 400, "INVOICE_IDS_REQUIRED");
  const documents = await prisma.invoiceDocument.findMany({ where: { id: { in: uniqueIds } }, include: { lines: { orderBy: { sortOrder: "asc" } }, site: { select: { code: true } }, supersededBy: { select: { id: true, invoiceNo: true } } } });
  if (documents.length !== uniqueIds.length) throw new AuthError("일부 거래명세표를 찾을 수 없습니다.", 404, "INVOICE_NOT_FOUND");
  const byId = new Map(documents.map((document) => [document.id, document]));
  return uniqueIds.map((id) => byId.get(id)!);
}

async function loadIssueCycle(
  tx: Prisma.TransactionClient,
  target: NewIssueTarget | NewPreviewTarget,
) {
  const cycle = await tx.monthlyCloseCycle.findUnique({
    where: { id: target.cycleId },
    include: {
      monthlyClose: {
        include: { site: { select: { code: true, name: true, address: true } } },
      },
      invoiceDocuments: { where: { status: "ISSUED" }, select: { id: true } },
    },
  });
  if (!cycle) throw new AuthError("마감 회차를 찾을 수 없습니다.", 404, "INVOICE_CLOSE_CYCLE_NOT_FOUND");
  const close = cycle.monthlyClose;
  if (close.state !== "CLOSED"
    || close.latestCycleNo !== cycle.cycleNo
    || close.version !== target.expectedCloseVersion
    || cycle.revenueFingerprint !== target.expectedRevenueFingerprint) {
    throw new AuthError("마감 상태가 변경되었습니다. 월마감에서 다시 시작해 주세요.", 409, "INVOICE_CLOSE_CHANGED");
  }
  const ids = snapshotRevenueIds(cycle.snapshotJson);
  if (!ids.length) throw new AuthError("발행할 확정 매출이 없는 마감 회차입니다.", 409, "INVOICE_CYCLE_EMPTY");
  const { start, end } = monthRange(close.month);
  const entries = await tx.revenueEntry.findMany({
    where: {
      id: { in: ids },
      siteId: close.siteId,
      status: "CONFIRMED",
      revenueDate: { gte: start, lte: end },
    },
    select: candidateSelect,
    orderBy: [{ revenueDate: "asc" }, { createdAt: "asc" }],
  });
  if (entries.length !== ids.length || entries.reduce((sum, entry) => sum + entry.salesAmount, 0) !== cycle.totalSalesAmount) {
    throw new AuthError("마감 회차의 확정 매출이 변경되었습니다.", 409, "INVOICE_CYCLE_CHANGED");
  }
  const unissuedEntries = entries.filter((entry) => entry.currentInvoiceDocumentId == null);
  const scopedEntries = unissuedEntries.filter((entry) => entry.contractCategoryId === target.contractCategoryId)
    .filter((entry) => target.issueItemId !== undefined ? entry.itemId === target.issueItemId : true);
  if (!scopedEntries.length) {
    throw new AuthError(
      target.issueItemId !== undefined ? "선택한 품목은 이미 발행되었거나 발행할 확정 매출이 없습니다." : "이미 발행된 마감 회차입니다.",
      409,
      target.issueItemId !== undefined ? "INVOICE_ITEM_ALREADY_ISSUED" : "INVOICE_CYCLE_ALREADY_ISSUED",
    );
  }
  return { cycle, close, month: close.month, entries: scopedEntries };
}

async function requireCompanySetting(tx: Prisma.TransactionClient) {
  const setting = await tx.companySetting.findUnique({ where: { id: "default" } });
  if (!setting || ![setting.businessRegistrationNo, setting.companyName, setting.representativeName, setting.address, setting.businessType, setting.businessItem, setting.phone, setting.defaultMessage].every(Boolean)) throw new AuthError("거래명세표 발행 전에 공급자 정보를 모두 등록해 주세요.", 409, "COMPANY_SETTING_REQUIRED");
  return setting;
}

function toSourceEntry(row: CandidateRow): InvoiceSourceEntry {
  if (!row.contractCategoryId || !row.contractCategory) throw new AuthError("계약 구분이 없는 매출이 포함되어 있습니다.", 409, "REVENUE_CONTRACT_CATEGORY_REQUIRED");
  const displayItem = row.item?.invoiceDisplayItem ?? (row.item?.invoiceDisplaySources?.length ? row.item : null);
  return { id: row.id, siteId: row.siteId, siteCode: row.site.code, siteName: row.site.name, siteAddress: row.site.address, revenueDate: row.revenueDate, title: row.title, description: row.description, itemId: row.itemId, itemName: row.item?.name ?? null, itemSpecification: row.item?.specification ?? null, quantity: row.quantity, unit: row.unit, unitPrice: row.appliedSalesPrice, supplyAmount: row.salesAmount, contractCategoryId: row.contractCategoryId, contractCategoryCode: row.contractCategory.code, contractCategoryName: row.contractCategory.name, invoiceDisplayItemId: displayItem?.id ?? null, invoiceDisplayItemName: displayItem?.name ?? null };
}

function toSourceEntries(rows: CandidateRow[], snapshotJson: string) {
  const snapshots = snapshotRevenueEntries(snapshotJson);
  return rows.map((row) => {
    const source = toSourceEntry(row);
    const snapshot = snapshots.get(row.id);
    if (!snapshot) return source;
    const hasCategory = Object.prototype.hasOwnProperty.call(snapshot, "contractCategoryId");
    const hasDisplayItem = Object.prototype.hasOwnProperty.call(snapshot, "invoiceDisplayItemId");
    return { ...source, contractCategoryId: hasCategory ? (snapshot.contractCategoryId ?? source.contractCategoryId) : source.contractCategoryId, contractCategoryCode: hasCategory ? (snapshot.contractCategoryCode ?? source.contractCategoryCode) : source.contractCategoryCode, contractCategoryName: hasCategory ? (snapshot.contractCategoryName ?? source.contractCategoryName) : source.contractCategoryName, invoiceDisplayItemId: hasDisplayItem ? (snapshot.invoiceDisplayItemId ?? null) : source.invoiceDisplayItemId, invoiceDisplayItemName: hasDisplayItem ? (snapshot.invoiceDisplayItemName ?? null) : source.invoiceDisplayItemName };
  });
}

function toSourceEntriesForCycles(rows: CandidateRow[], cycles: Array<{ snapshotJson: string }>) {
  const snapshots = new Map(cycles.flatMap((cycle) => [...snapshotRevenueEntries(cycle.snapshotJson)]));
  return rows.map((row) => {
    const source = toSourceEntry(row);
    const snapshot = snapshots.get(row.id);
    if (!snapshot) return source;
    const hasCategory = Object.prototype.hasOwnProperty.call(snapshot, "contractCategoryId");
    const hasDisplayItem = Object.prototype.hasOwnProperty.call(snapshot, "invoiceDisplayItemId");
    return { ...source, contractCategoryId: hasCategory ? (snapshot.contractCategoryId ?? source.contractCategoryId) : source.contractCategoryId, contractCategoryCode: hasCategory ? (snapshot.contractCategoryCode ?? source.contractCategoryCode) : source.contractCategoryCode, contractCategoryName: hasCategory ? (snapshot.contractCategoryName ?? source.contractCategoryName) : source.contractCategoryName, invoiceDisplayItemId: hasDisplayItem ? (snapshot.invoiceDisplayItemId ?? null) : source.invoiceDisplayItemId, invoiceDisplayItemName: hasDisplayItem ? (snapshot.invoiceDisplayItemName ?? null) : source.invoiceDisplayItemName };
  });
}

async function loadReplacementContext(tx: Prisma.TransactionClient, invoiceId: string) {
  const source = await tx.invoiceDocument.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      siteId: true,
      contractCategoryId: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      version: true,
      subtotal: true,
      closeRevenueFingerprint: true,
      revenueLinks: { select: { revenueEntryId: true } },
    },
  });
  if (!source) throw new AuthError("거래명세표를 찾을 수 없습니다.", 404, "INVOICE_NOT_FOUND");
  if (!isReplaceableInvoiceStatus(source.status)) throw new AuthError("현재 유효한 거래명세표만 대체 발행할 수 있습니다.", 409, "INVOICE_NOT_REPLACEABLE");
  const months = monthsBetween(source.periodStart, source.periodEnd);
  const [allEntries, activeDocuments, closeStates] = await Promise.all([
    tx.revenueEntry.findMany({
      where: { siteId: source.siteId, contractCategoryId: source.contractCategoryId, status: "CONFIRMED", revenueDate: { gte: source.periodStart, lte: source.periodEnd } },
      select: candidateSelect,
      orderBy: [{ revenueDate: "asc" }, { createdAt: "asc" }],
      take: 501,
    }),
    tx.invoiceDocument.findMany({
      where: { siteId: source.siteId, contractCategoryId: source.contractCategoryId, periodStart: source.periodStart, periodEnd: source.periodEnd, status: "ISSUED" },
      select: {
        id: true,
        invoiceNo: true,
        version: true,
        contractCategoryId: true,
        issueItemId: true,
        issueItemName: true,
        revenueFingerprint: true,
        subtotal: true,
        closeRevenueFingerprint: true,
        revenueLinks: { select: { revenueEntryId: true } },
      },
      orderBy: { issuedAt: "asc" },
    }),
    tx.monthlyClose.findMany({
      where: { siteId: source.siteId, month: { in: months }, state: "CLOSED" },
      include: { cycles: { orderBy: { cycleNo: "desc" }, take: 1 } },
    }),
  ]);
  const activeItemKeys = new Set(activeDocuments.flatMap((document) => {
    if (document.issueItemId != null) return [document.issueItemId];
    return document.revenueLinks.flatMap((link) => {
      const entry = allEntries.find((candidate) => candidate.id === link.revenueEntryId);
      return [entry?.itemId ?? "__NO_ITEM__"];
    });
  }));
  const entries = allEntries.filter((entry) => activeItemKeys.has(entry.itemId ?? "__NO_ITEM__"));
  if (closeStates.length !== months.length || closeStates.some((close) => !close.cycles[0])) {
    throw new AuthError("대체발행 전에 모든 매출월을 다시 마감해 주세요.", 409, "INVOICE_CLOSE_REQUIRED");
  }
  const latestCycles = closeStates.map((close) => close.cycles[0]);
  const closedState = snapshotRevenueStateForCategory(latestCycles, source.contractCategoryId, activeItemKeys);
  const closedRevenueIds = closedState.revenueEntryIds;
  const closedAmount = closedState.totalSalesAmount;
  const currentRevenueIds = entries.map((entry) => entry.id);
  const currentAmount = entries.reduce((sum, entry) => sum + entry.salesAmount, 0);
  if (!sameRevenueState(closedRevenueIds, closedAmount, currentRevenueIds, currentAmount)) {
    throw new AuthError("재마감 이후 매출이 변경되었습니다. 월마감에서 다시 확인해 주세요.", 409, "INVOICE_CLOSE_CHANGED");
  }
  const issuedRevenueIds = activeDocuments.flatMap((document) => document.revenueLinks.map((link) => link.revenueEntryId));
  const issuedAmount = activeDocuments.reduce((sum, document) => sum + document.subtotal, 0);
  const expectedCloseFingerprint = closeFingerprint(latestCycles);
  const currentSources = toSourceEntriesForCycles(entries, latestCycles);
  const sourceById = new Map(currentSources.map((entry) => [entry.id, entry]));
  const documentFingerprintChanged = activeDocuments.some((document) => {
    if (!document.revenueFingerprint) return false;
    const linkedEntries = document.revenueLinks.flatMap((link) => {
      const entry = sourceById.get(link.revenueEntryId);
      return entry ? [entry] : [];
    });
    return linkedEntries.length !== document.revenueLinks.length || invoiceRevenueFingerprint(linkedEntries) !== document.revenueFingerprint;
  });
  const legacyFingerprintChanged = !isPartialRevenueIssuance(
    latestCycles.map((cycle) => ({ revenueEntryIds: snapshotRevenueIds(cycle.snapshotJson) })),
    activeDocuments.map((document) => ({ revenueEntryIds: document.revenueLinks.map((link) => link.revenueEntryId) })),
  ) && activeDocuments.every((document) => !document.revenueFingerprint)
    && activeDocuments.some((document) => document.closeRevenueFingerprint != null)
    && activeDocuments.some((document) => document.closeRevenueFingerprint !== expectedCloseFingerprint);
  const fingerprintChanged = documentFingerprintChanged || legacyFingerprintChanged;
  if (!fingerprintChanged && sameRevenueState(issuedRevenueIds, issuedAmount, closedRevenueIds, closedAmount)) {
    throw new AuthError("재마감 결과가 현재 거래명세표와 같아 대체 발행할 내용이 없습니다.", 409, "INVOICE_REPLACEMENT_NOT_REQUIRED");
  }
  if (!entries.length) throw new AuthError("대체 발행할 확정 매출이 없습니다.", 409, "INVOICE_REPLACEMENT_EMPTY");
  if (entries.length > 500) throw new AuthError("대체 발행 대상이 500건을 초과했습니다. 매출기간을 확인해 주세요.", 409, "INVOICE_REPLACEMENT_TOO_LARGE");
  const activeIds = new Set(activeDocuments.map((document) => document.id));
  if (!activeIds.has(source.id)) throw replacementChanged();
  if (entries.some((entry) => entry.currentInvoiceDocumentId && !activeIds.has(entry.currentInvoiceDocumentId))) {
    throw new AuthError("같은 기간의 일부 매출이 다른 매출기간 거래명세표에 포함되어 있습니다.", 409, "INVOICE_REPLACEMENT_SCOPE_CONFLICT");
  }
  return { source, entries, activeDocuments, latestCycles };
}

function loadMissingContractWarnings(tx: Prisma.TransactionClient, source: { siteId: string; contractCategoryId: string | null; periodStart: Date; periodEnd: Date }) {
  return tx.contract.findMany({
    where: { siteId: source.siteId, contractCategoryId: source.contractCategoryId, status: "ACTIVE", startDate: { lte: source.periodEnd }, endDate: { gte: source.periodStart }, revenueEntries: { none: { status: "CONFIRMED", revenueDate: { gte: source.periodStart, lte: source.periodEnd } } } },
    select: { id: true, contractNo: true, title: true },
    orderBy: { contractNo: "asc" },
  });
}

async function createInvoiceSnapshot(
  tx: Prisma.TransactionClient,
  actor: SessionUser,
  draft: ReturnType<typeof buildInvoiceDrafts>[number],
  input: { periodStart: string; periodEnd: string; issueDate: string; displayMode: "AGGREGATED" | "ITEMIZED"; memo?: string | null },
  supplier: ReturnType<typeof companySnapshot>,
  template: Awaited<ReturnType<typeof resolveInvoiceTemplate>>,
  issuedAt: Date,
  monthlyCloseCycleId?: string | null,
  closeRevenueFingerprint?: string | null,
) {
  const issueDate = dbDate(input.issueDate);
  const invoiceNo = await nextInvoiceNo(tx, issueDate);
  const document = await tx.invoiceDocument.create({ data: {
    invoiceNo,
    siteId: draft.siteId,
    contractCategoryId: draft.contractCategoryId,
    contractCategoryCode: draft.contractCategoryCode,
    contractCategoryName: draft.contractCategoryName,
    issueItemId: draft.issueItemId,
    issueItemName: draft.issueItemName,
    revenueFingerprint: draft.revenueFingerprint,
    periodStart: dbDate(input.periodStart),
    periodEnd: endOfDay(input.periodEnd),
    issueDate,
    status: "ISSUED",
    displayMode: input.displayMode,
    recipientName: draft.siteName,
    recipientAddress: draft.siteAddress,
    supplierBusinessRegistrationNo: supplier.businessRegistrationNo,
    supplierCompanyName: supplier.companyName,
    supplierRepresentativeName: supplier.representativeName,
    supplierAddress: supplier.address,
    supplierBusinessType: supplier.businessType,
    supplierBusinessItem: supplier.businessItem,
    supplierPhone: supplier.phone,
    supplyMessage: supplier.defaultMessage,
    subtotal: draft.subtotal,
    taxAmount: draft.taxAmount,
    totalAmount: draft.totalAmount,
    memo: input.memo?.trim() || null,
    templateIdSnapshot: template.id,
    templateVersionSnapshot: template.version,
    templateName: template.name,
    templateConfigJson: template.configJson,
    createdById: actor.id,
    issuedById: actor.id,
    issuedAt,
    monthlyCloseCycleId: monthlyCloseCycleId ?? null,
    closeRevenueFingerprint: closeRevenueFingerprint ?? null,
  } });
  for (const [index, line] of draft.lines.entries()) {
    const savedLine = await tx.invoiceLine.create({ data: { invoiceDocumentId: document.id, itemName: line.itemName, specification: line.specification, quantity: line.quantity, unit: line.unit, unitPrice: line.unitPrice, supplyAmount: line.supplyAmount, taxAmount: line.taxAmount, sortOrder: index } });
    await tx.invoiceRevenueLink.createMany({ data: line.revenueEntryIds.map((revenueEntryId) => ({ invoiceDocumentId: document.id, invoiceLineId: savedLine.id, revenueEntryId })) });
  }
  return document;
}

function replacementChanged() { return new AuthError("거래명세표 또는 대상 매출이 변경되었습니다. 새로 미리보기해 주세요.", 409, "INVOICE_REPLACEMENT_CHANGED"); }

function companySnapshot(setting: { businessRegistrationNo: string; companyName: string; representativeName: string; address: string; businessType: string; businessItem: string; phone: string; defaultMessage: string }) { return { ...setting }; }
function issueItemLabel(row: CandidateRow) { return row.itemId ? (row.item?.name ?? row.title) : "품목 없음"; }
function issueDateWarning(issueDate: string, periodStart: string, periodEnd: string) {
  const value = dbDate(issueDate).getTime();
  if (value < dbDate(periodStart).getTime() || value > endOfDay(periodEnd).getTime()) {
    return `발행일 ${issueDate}이(가) 매출기간 ${periodStart} ~ ${periodEnd} 밖입니다. 발행은 계속할 수 있습니다.`;
  }
  return null;
}
function dateKey(value: Date) { return value.toISOString().slice(0, 10); }
function dbDate(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function endOfDay(value: string) { return new Date(`${value}T23:59:59.999Z`); }
function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}
function monthRange(month: string) {
  return { start: dbDate(month + "-01"), end: endOfDay(monthEnd(month)) };
}
function closeFingerprint(cycles: Array<{ id: string; revenueFingerprint: string }>) {
  if (cycles.length === 1) return cycles[0].revenueFingerprint;
  return [...cycles].sort((a, b) => a.id.localeCompare(b.id)).map((cycle) => `${cycle.id}:${cycle.revenueFingerprint}`).join("|");
}
function snapshotRevenueIds(snapshotJson: string) {
  try {
    const parsed = JSON.parse(snapshotJson) as { revenueEntryIds?: unknown };
    return Array.isArray(parsed.revenueEntryIds)
      ? parsed.revenueEntryIds.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function snapshotRevenueEntries(snapshotJson: string) {
  try {
    const parsed = JSON.parse(snapshotJson) as { revenueEntries?: Array<{ id?: unknown; salesAmount?: unknown; itemId?: string | null; contractCategoryId?: string | null; contractCategoryCode?: string | null; contractCategoryName?: string | null; invoiceDisplayItemId?: string | null; invoiceDisplayItemName?: string | null }> };
    return new Map((parsed.revenueEntries ?? []).flatMap((entry) => typeof entry.id === "string" ? [[entry.id, entry] as const] : []));
  } catch {
    return new Map<string, never>();
  }
}

function snapshotRevenueStateForCategory(cycles: Array<{ snapshotJson: string; totalSalesAmount: number }>, contractCategoryId: string | null, itemKeys?: Set<string>) {
  const snapshots = cycles.flatMap((cycle) => [...snapshotRevenueEntries(cycle.snapshotJson).values()]);
  if (!snapshots.length) {
    return {
      revenueEntryIds: cycles.flatMap((cycle) => snapshotRevenueIds(cycle.snapshotJson)),
      totalSalesAmount: cycles.reduce((sum, cycle) => sum + cycle.totalSalesAmount, 0),
    };
  }
  const scoped = snapshots.filter((entry) => (entry.contractCategoryId ?? null) === contractCategoryId)
    .filter((entry) => !itemKeys || itemKeys.has(entry.itemId ?? "__NO_ITEM__"));
  return {
    revenueEntryIds: scoped.flatMap((entry) => typeof entry.id === "string" ? [entry.id] : []),
    totalSalesAmount: scoped.reduce((sum, entry) => sum + (typeof entry.salesAmount === "number" ? entry.salesAmount : 0), 0),
  };
}

function periodKey(value: { siteId: string; periodStart: Date; periodEnd: Date }) {
  return [value.siteId, value.periodStart.toISOString(), value.periodEnd.toISOString()].join(":");
}

function uniqueBy<T>(values: T[], key: (value: T) => string) {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}

function groupBy<T>(values: T[], key: (value: T) => string) {
  const result = new Map<string, T[]>();
  for (const value of values) result.set(key(value), [...(result.get(key(value)) ?? []), value]);
  return result;
}
function monthsBetween(start: Date, end: Date) {
  const months: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= last) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}
