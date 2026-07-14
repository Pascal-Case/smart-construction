import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import { recordSyncEvent } from "@/lib/events/bus";
import { resolveInvoiceTemplate } from "@/lib/invoice-templates/service";
import { buildInvoiceDrafts, type InvoiceSourceEntry } from "@/lib/invoices/calculation";
import { classifyInvoiceCandidateState, isReplaceableInvoiceStatus, replacementRequiredForPeriod, sameRevenueSet, sameRevenueState } from "@/lib/invoices/replacement-policy";
import type { InvoiceCandidateQuery, InvoiceIssueInput, InvoiceListQuery, InvoicePreviewInput, InvoiceReplacementIssueInput, InvoiceReplacementPreviewInput } from "@/lib/invoices/schemas";
import { nextInvoiceNo } from "@/lib/masters/sequence";

const candidateSelect = {
  id: true,
  siteId: true,
  revenueDate: true,
  title: true,
  description: true,
  quantity: true,
  unit: true,
  appliedSalesPrice: true,
  salesAmount: true,
  sourceType: true,
  currentInvoiceDocumentId: true,
  site: { select: { code: true, name: true, address: true } },
  item: { select: { name: true, specification: true } },
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
  const [currentDocuments, revenuePointers] = siteIds.length
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
          revenueLinks: { select: { revenueEntryId: true } },
        },
        orderBy: [{ issuedAt: "desc" }, { invoiceNo: "desc" }],
      }),
      revenueEntryIds.length
        ? prisma.revenueEntry.findMany({ where: { id: { in: revenueEntryIds } }, select: { id: true, currentInvoiceDocumentId: true } })
        : Promise.resolve([]),
    ])
    : [[], []];
  const documentsBySite = groupBy(currentDocuments, (document) => document.siteId);
  const pointerByRevenueId = new Map(revenuePointers.map((entry) => [entry.id, entry.currentInvoiceDocumentId]));
  const rows = closes.flatMap<InvoiceCandidateRow>((close): InvoiceCandidateRow[] => {
    const cycle = close.cycles[0];
    if (!cycle) return [];
    const cycleRevenueIds = snapshotRevenueIds(cycle.snapshotJson);
    const documents = documentsBySite.get(close.siteId) ?? [];
    const periodMatches = documents.every((document) => document.periodStart.getTime() === range.start.getTime() && document.periodEnd.getTime() === range.end.getTime());
    const activeDocumentIds = new Set(documents.map((document) => document.id));
    const pointerConflict = cycleRevenueIds.some((id) => {
      const pointer = pointerByRevenueId.get(id);
      return pointer != null && !activeDocumentIds.has(pointer);
    });
    const state = classifyInvoiceCandidateState({
      close: { revenueEntryIds: cycleRevenueIds, totalSalesAmount: cycle.totalSalesAmount },
      currentDocuments: documents.map((document) => ({ revenueEntryIds: document.revenueLinks.map((link) => link.revenueEntryId), subtotal: document.subtotal })),
      hasScopeConflict: !periodMatches || pointerConflict,
    });
    if (state === "UNCHANGED") return [];
    const source = documents[0];
    const common = {
      cycleId: cycle.id,
      closeId: close.id,
      closeVersion: close.version,
      month: close.month,
      siteId: close.siteId,
      siteCode: close.site.code,
      siteName: close.site.name,
      revenueCount: cycle.revenueCount,
      supplyAmount: cycle.totalSalesAmount,
      revenueFingerprint: cycle.revenueFingerprint,
      currentInvoices: documents.map((document) => ({ id: document.id, invoiceNo: document.invoiceNo, version: document.version })),
    };
    if (state === "BLOCKED") return [{
      ...common,
      targetKey: `blocked:${close.siteId}:${close.month}`,
      kind: state,
      selectable: false,
      blockReason: "현재 유효 거래명세표의 매출기간 또는 연결 상태가 최신 마감 회차와 충돌합니다. 발행 이력에서 확인해 주세요.",
    }];
    if (state === "REPLACEMENT" && source) return [{
      ...common,
      targetKey: `replacement:${close.siteId}:${close.month}`,
      kind: state,
      selectable: true,
      sourceInvoiceId: source.id,
      sourceVersion: source.version,
      blockReason: null,
    }];
    return [{
      ...common,
      targetKey: `new:${cycle.id}`,
      kind: "NEW" as const,
      selectable: true,
      blockReason: null,
    }];
  });
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
          const document = buildInvoiceDrafts(context.entries.map(toSourceEntry), input.displayMode)[0];
          results.push({
            targetKey: target.targetKey,
            kind: target.kind,
            outcome: "PREVIEWED" as const,
            commitTarget: target,
            warnings: [],
            document: {
              ...document,
              closeCycleId: context.cycle.id,
              issueDate: input.issueDate,
              periodStart: context.month + "-01",
              periodEnd: monthEnd(context.month),
              displayMode: input.displayMode,
              memo: input.memo ?? null,
              supplier: companySnapshot(setting),
              templateConfig: template.config,
            },
          });
          continue;
        }
        const context = await loadReplacementContext(tx, target.sourceInvoiceId);
        if (context.source.version !== target.sourceVersion) throw replacementChanged();
        const warnings = await loadMissingContractWarnings(tx, context.source);
        const document = buildInvoiceDrafts(context.entries.map(toSourceEntry), input.displayMode)[0];
        if (!document) throw new AuthError("대체 발행할 확정 매출이 없습니다.", 409, "INVOICE_REPLACEMENT_EMPTY");
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
          currentInvoices: context.activeDocuments.map((document) => ({ id: document.id, invoiceNo: document.invoiceNo, version: document.version })),
          document: {
            ...document,
            issueDate: input.issueDate,
            periodStart: dateKey(context.source.periodStart),
            periodEnd: dateKey(context.source.periodEnd),
            displayMode: input.displayMode,
            memo: input.memo ?? null,
            supplier: companySnapshot(setting),
            templateConfig: template.config,
          },
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
        supplyAmount: previewed.reduce((sum, result) => sum + (result.outcome === "PREVIEWED" ? result.document.subtotal : 0), 0),
      },
      results,
    };
  });
}

export async function issueInvoices(actor: SessionUser, input: InvoiceIssueInput) {
  const results = [];
  for (const target of input.targets) {
    try {
      const document = await prisma.$transaction(async (tx) => {
        if (target.kind === "NEW") return issueNewInvoiceInTransaction(tx, actor, target, input);
        return replaceInvoiceInTransaction(tx, actor, target.sourceInvoiceId, { ...input, ...target });
      });
      results.push({ targetKey: target.targetKey, kind: target.kind, ...(target.kind === "NEW" ? { cycleId: target.cycleId } : {}), outcome: "ISSUED" as const, document });
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
  const draft = buildInvoiceDrafts(context.entries.map(toSourceEntry), input.displayMode)[0];
  const issuedAt = new Date();
  const snapshotInput = { periodStart: context.month + "-01", periodEnd: monthEnd(context.month), issueDate: input.issueDate, displayMode: input.displayMode, memo: input.memo };
  const document = await createInvoiceSnapshot(tx, actor, draft, snapshotInput, companySnapshot(setting), template, issuedAt, context.cycle.id);
  const revenueEntryIds = draft.lines.flatMap((line) => line.revenueEntryIds);
  const assigned = await tx.revenueEntry.updateMany({ where: { id: { in: revenueEntryIds }, currentInvoiceDocumentId: null }, data: { currentInvoiceDocumentId: document.id } });
  if (assigned.count !== revenueEntryIds.length) throw new AuthError("마감 회차의 일부 매출이 이미 발행되었습니다.", 409, "INVOICE_CYCLE_CHANGED");
  await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "ISSUE", entityType: "INVOICE", entityId: document.id, after: { invoiceNo: document.invoiceNo, monthlyCloseCycleId: context.cycle.id, siteId: draft.siteId, revenueEntryIds, subtotal: draft.subtotal, taxAmount: draft.taxAmount, totalAmount: draft.totalAmount, templateId: template.id, templateVersion: template.version } });
  await recordSyncEvent(tx, { type: "invoice.changed", entityId: document.id, siteId: document.siteId, month: context.month, actorId: actor.id });
  return getInvoiceDocument(document.id, tx);
}

export async function previewReplacementInvoice(invoiceId: string, input: InvoiceReplacementPreviewInput) {
  return prisma.$transaction(async (tx) => {
    const setting = await requireCompanySetting(tx);
    const context = await loadReplacementContext(tx, invoiceId);
    if (context.source.version !== input.sourceVersion) throw replacementChanged();
    const template = await resolveInvoiceTemplate(input.templateId, input.templateVersion, tx);
    const warnings = await loadMissingContractWarnings(tx, context.source);
    const draft = buildInvoiceDrafts(context.entries.map(toSourceEntry), input.displayMode)[0];
    if (!draft) throw new AuthError("대체 발행할 확정 매출이 없습니다.", 409, "INVOICE_REPLACEMENT_EMPTY");
    return {
      expectedRevenueEntryIds: context.entries.map((entry) => entry.id),
      warnings,
      document: {
        ...draft,
        issueDate: input.issueDate,
        periodStart: dateKey(context.source.periodStart),
        periodEnd: dateKey(context.source.periodEnd),
        displayMode: input.displayMode,
        memo: input.memo ?? null,
        supplier: companySnapshot(setting),
        templateConfig: template.config,
      },
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
  const draft = buildInvoiceDrafts(context.entries.map(toSourceEntry), input.displayMode)[0];
  if (!draft) throw new AuthError("대체 발행할 확정 매출이 없습니다.", 409, "INVOICE_REPLACEMENT_EMPTY");

  const issuedAt = new Date();
  const snapshotInput = { periodStart: dateKey(context.source.periodStart), periodEnd: dateKey(context.source.periodEnd), issueDate: input.issueDate, displayMode: input.displayMode, memo: input.memo };
  const document = await createInvoiceSnapshot(tx, actor, draft, snapshotInput, companySnapshot(setting), template, issuedAt, context.latestCycles.length === 1 ? context.latestCycles[0].id : null);
  const superseded = await tx.invoiceDocument.updateMany({
    where: { id: { in: activeInvoiceIds }, status: "ISSUED" },
    data: { status: "SUPERSEDED", supersededAt: issuedAt, supersededByInvoiceId: document.id, version: { increment: 1 } },
  });
  if (superseded.count !== activeInvoiceIds.length) throw replacementChanged();
  await tx.revenueEntry.updateMany({ where: { currentInvoiceDocumentId: { in: activeInvoiceIds } }, data: { currentInvoiceDocumentId: null } });
  const assigned = await tx.revenueEntry.updateMany({ where: { id: { in: actualRevenueEntryIds }, currentInvoiceDocumentId: null }, data: { currentInvoiceDocumentId: document.id } });
  if (assigned.count !== actualRevenueEntryIds.length) throw replacementChanged();

  await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "REPLACE", entityType: "INVOICE", entityId: document.id, after: { invoiceNo: document.invoiceNo, siteId: document.siteId, replacedInvoiceIds: activeInvoiceIds, revenueEntryIds: actualRevenueEntryIds, subtotal: document.subtotal, taxAmount: document.taxAmount, totalAmount: document.totalAmount, templateId: template.id, templateVersion: template.version } });
  await recordSyncEvent(tx, { type: "invoice.changed", entityId: document.id, siteId: document.siteId, actorId: actor.id });
  return getInvoiceDocument(document.id, tx);
}

export async function listInvoices(query: InvoiceListQuery) {
  const where: Prisma.InvoiceDocumentWhereInput = {
    ...(query.siteId ? { siteId: query.siteId } : {}),
    ...(query.startDate || query.endDate ? { issueDate: { ...(query.startDate ? { gte: dbDate(query.startDate) } : {}), ...(query.endDate ? { lte: endOfDay(query.endDate) } : {}) } } : {}),
    ...(query.q ? { OR: [{ invoiceNo: { contains: query.q } }, { recipientName: { contains: query.q } }, { supplierCompanyName: { contains: query.q } }] } : {}),
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
    const replacementRequired = replacementRequiredForPeriod(
      latestCycles.map((cycle) => ({ revenueEntryIds: snapshotRevenueIds(cycle.snapshotJson), totalSalesAmount: cycle.totalSalesAmount })),
      documents.map((document) => ({ revenueEntryIds: document.revenueLinks.map((link) => link.revenueEntryId), subtotal: document.subtotal })),
    );
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
      invoiceDocument: { select: { id: true } },
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
  if (cycle.invoiceDocument) throw new AuthError("이미 발행된 마감 회차입니다.", 409, "INVOICE_CYCLE_ALREADY_ISSUED");
  const ids = snapshotRevenueIds(cycle.snapshotJson);
  if (!ids.length) throw new AuthError("발행할 확정 매출이 없는 마감 회차입니다.", 409, "INVOICE_CYCLE_EMPTY");
  const { start, end } = monthRange(close.month);
  const entries = await tx.revenueEntry.findMany({
    where: {
      id: { in: ids },
      siteId: close.siteId,
      status: "CONFIRMED",
      revenueDate: { gte: start, lte: end },
      currentInvoiceDocumentId: null,
    },
    select: candidateSelect,
    orderBy: [{ revenueDate: "asc" }, { createdAt: "asc" }],
  });
  if (entries.length !== ids.length || entries.reduce((sum, entry) => sum + entry.salesAmount, 0) !== cycle.totalSalesAmount) {
    throw new AuthError("마감 회차의 확정 매출이 변경되었습니다.", 409, "INVOICE_CYCLE_CHANGED");
  }
  return { cycle, close, month: close.month, entries };
}

async function requireCompanySetting(tx: Prisma.TransactionClient) {
  const setting = await tx.companySetting.findUnique({ where: { id: "default" } });
  if (!setting || ![setting.businessRegistrationNo, setting.companyName, setting.representativeName, setting.address, setting.businessType, setting.businessItem, setting.phone, setting.defaultMessage].every(Boolean)) throw new AuthError("거래명세표 발행 전에 공급자 정보를 모두 등록해 주세요.", 409, "COMPANY_SETTING_REQUIRED");
  return setting;
}

function toSourceEntry(row: CandidateRow): InvoiceSourceEntry {
  return { id: row.id, siteId: row.siteId, siteCode: row.site.code, siteName: row.site.name, siteAddress: row.site.address, revenueDate: row.revenueDate, title: row.title, description: row.description, itemName: row.item?.name ?? null, itemSpecification: row.item?.specification ?? null, quantity: row.quantity, unit: row.unit, unitPrice: row.appliedSalesPrice, supplyAmount: row.salesAmount };
}

async function loadReplacementContext(tx: Prisma.TransactionClient, invoiceId: string) {
  const source = await tx.invoiceDocument.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      siteId: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      version: true,
      subtotal: true,
      revenueLinks: { select: { revenueEntryId: true } },
    },
  });
  if (!source) throw new AuthError("거래명세표를 찾을 수 없습니다.", 404, "INVOICE_NOT_FOUND");
  if (!isReplaceableInvoiceStatus(source.status)) throw new AuthError("현재 유효한 거래명세표만 대체 발행할 수 있습니다.", 409, "INVOICE_NOT_REPLACEABLE");
  const months = monthsBetween(source.periodStart, source.periodEnd);
  const [entries, activeDocuments, closeStates] = await Promise.all([
    tx.revenueEntry.findMany({
      where: { siteId: source.siteId, status: "CONFIRMED", revenueDate: { gte: source.periodStart, lte: source.periodEnd } },
      select: candidateSelect,
      orderBy: [{ revenueDate: "asc" }, { createdAt: "asc" }],
      take: 501,
    }),
    tx.invoiceDocument.findMany({
      where: { siteId: source.siteId, periodStart: source.periodStart, periodEnd: source.periodEnd, status: "ISSUED" },
      select: {
        id: true,
        invoiceNo: true,
        version: true,
        subtotal: true,
        revenueLinks: { select: { revenueEntryId: true } },
      },
      orderBy: { issuedAt: "asc" },
    }),
    tx.monthlyClose.findMany({
      where: { siteId: source.siteId, month: { in: months }, state: "CLOSED" },
      include: { cycles: { orderBy: { cycleNo: "desc" }, take: 1 } },
    }),
  ]);
  if (closeStates.length !== months.length || closeStates.some((close) => !close.cycles[0])) {
    throw new AuthError("대체발행 전에 모든 매출월을 다시 마감해 주세요.", 409, "INVOICE_CLOSE_REQUIRED");
  }
  const latestCycles = closeStates.map((close) => close.cycles[0]);
  const closedRevenueIds = latestCycles.flatMap((cycle) => snapshotRevenueIds(cycle.snapshotJson));
  const closedAmount = latestCycles.reduce((sum, cycle) => sum + cycle.totalSalesAmount, 0);
  const currentRevenueIds = entries.map((entry) => entry.id);
  const currentAmount = entries.reduce((sum, entry) => sum + entry.salesAmount, 0);
  if (!sameRevenueState(closedRevenueIds, closedAmount, currentRevenueIds, currentAmount)) {
    throw new AuthError("재마감 이후 매출이 변경되었습니다. 월마감에서 다시 확인해 주세요.", 409, "INVOICE_CLOSE_CHANGED");
  }
  const issuedRevenueIds = activeDocuments.flatMap((document) => document.revenueLinks.map((link) => link.revenueEntryId));
  const issuedAmount = activeDocuments.reduce((sum, document) => sum + document.subtotal, 0);
  if (sameRevenueState(issuedRevenueIds, issuedAmount, closedRevenueIds, closedAmount)) {
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

function loadMissingContractWarnings(tx: Prisma.TransactionClient, source: { siteId: string; periodStart: Date; periodEnd: Date }) {
  return tx.contract.findMany({
    where: { siteId: source.siteId, status: "ACTIVE", startDate: { lte: source.periodEnd }, endDate: { gte: source.periodStart }, revenueEntries: { none: { status: "CONFIRMED", revenueDate: { gte: source.periodStart, lte: source.periodEnd } } } },
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
) {
  const issueDate = dbDate(input.issueDate);
  const invoiceNo = await nextInvoiceNo(tx, issueDate);
  const document = await tx.invoiceDocument.create({ data: {
    invoiceNo,
    siteId: draft.siteId,
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
  } });
  for (const [index, line] of draft.lines.entries()) {
    const savedLine = await tx.invoiceLine.create({ data: { invoiceDocumentId: document.id, itemName: line.itemName, specification: line.specification, quantity: line.quantity, unit: line.unit, unitPrice: line.unitPrice, supplyAmount: line.supplyAmount, taxAmount: line.taxAmount, sortOrder: index } });
    await tx.invoiceRevenueLink.createMany({ data: line.revenueEntryIds.map((revenueEntryId) => ({ invoiceDocumentId: document.id, invoiceLineId: savedLine.id, revenueEntryId })) });
  }
  return document;
}

function replacementChanged() { return new AuthError("거래명세표 또는 대상 매출이 변경되었습니다. 새로 미리보기해 주세요.", 409, "INVOICE_REPLACEMENT_CHANGED"); }

function companySnapshot(setting: { businessRegistrationNo: string; companyName: string; representativeName: string; address: string; businessType: string; businessItem: string; phone: string; defaultMessage: string }) { return { ...setting }; }
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
