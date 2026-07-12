import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import { recordSyncEvent } from "@/lib/events/bus";
import { resolveInvoiceTemplate } from "@/lib/invoice-templates/service";
import { buildInvoiceDrafts, type InvoiceSourceEntry } from "@/lib/invoices/calculation";
import { isReplaceableInvoiceStatus, sameRevenueSet } from "@/lib/invoices/replacement-policy";
import type { InvoiceCandidateQuery, InvoiceIssueInput, InvoiceListQuery, InvoiceReplacementIssueInput, InvoiceReplacementPreviewInput } from "@/lib/invoices/schemas";
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
  item: { select: { name: true } },
} satisfies Prisma.RevenueEntrySelect;

type CandidateRow = Prisma.RevenueEntryGetPayload<{ select: typeof candidateSelect }>;

export async function getInvoiceCandidates(query: InvoiceCandidateQuery) {
  const closes = await prisma.monthlyClose.findMany({
    where: { month: query.month, state: "CLOSED", ...(query.siteId ? { siteId: query.siteId } : {}) },
    include: {
      site: { select: { id: true, code: true, name: true } },
      cycles: { orderBy: { cycleNo: "desc" }, take: 1, include: { invoiceDocument: { select: { id: true, invoiceNo: true, status: true } } } },
    },
    orderBy: { site: { name: "asc" } },
  });
  const rows = closes.flatMap((close) => {
    const cycle = close.cycles[0];
    if (!cycle || cycle.invoiceDocument) return [];
    return [{
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
    }];
  });
  return {
    rows,
    total: rows.length,
    truncated: false,
    totals: { supplyAmount: rows.reduce((sum, row) => sum + row.supplyAmount, 0), taxAmount: rows.reduce((sum, row) => sum + Math.round(row.supplyAmount * 0.1), 0) },
  };
}

export async function previewInvoices(input: InvoiceIssueInput) {
  return prisma.$transaction(async (tx) => {
    const setting = await requireCompanySetting(tx);
    const template = await resolveInvoiceTemplate(input.templateId, input.templateVersion, tx);
    const contexts = [];
    for (const target of input.cycles) contexts.push(await loadIssueCycle(tx, target));
    return {
      template,
      documents: contexts.map((context) => {
        const document = buildInvoiceDrafts(context.entries.map(toSourceEntry), input.displayMode)[0];
        return {
          ...document,
          closeCycleId: context.cycle.id,
          issueDate: input.issueDate,
          periodStart: context.month + "-01",
          periodEnd: monthEnd(context.month),
          displayMode: input.displayMode,
          memo: input.memo ?? null,
          supplier: companySnapshot(setting),
          templateConfig: template.config,
        };
      }),
    };
  });
}

export async function issueInvoices(actor: SessionUser, input: InvoiceIssueInput) {
  const results = [];
  for (const target of input.cycles) {
    try {
      const document = await prisma.$transaction(async (tx) => {
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
      });
      results.push({ cycleId: target.cycleId, outcome: "ISSUED" as const, document });
    } catch (error) {
      if (error instanceof AuthError) {
        results.push({ cycleId: target.cycleId, outcome: "BLOCKED" as const, error: { code: error.code, message: error.message } });
        continue;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        results.push({ cycleId: target.cycleId, outcome: "ALREADY_ISSUED" as const });
        continue;
      }
      throw error;
    }
  }
  return results;
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
  return prisma.$transaction(async (tx) => {
    const setting = await requireCompanySetting(tx);
    const context = await loadReplacementContext(tx, invoiceId);
    if (context.source.version !== input.sourceVersion) throw replacementChanged();
    const actualRevenueEntryIds = context.entries.map((entry) => entry.id);
    if (!sameRevenueSet(input.expectedRevenueEntryIds, actualRevenueEntryIds)) throw replacementChanged();
    const template = await resolveInvoiceTemplate(input.templateId, input.templateVersion, tx);
    const draft = buildInvoiceDrafts(context.entries.map(toSourceEntry), input.displayMode)[0];
    if (!draft) throw new AuthError("대체 발행할 확정 매출이 없습니다.", 409, "INVOICE_REPLACEMENT_EMPTY");

    const issuedAt = new Date();
    const snapshotInput = {
      periodStart: dateKey(context.source.periodStart),
      periodEnd: dateKey(context.source.periodEnd),
      issueDate: input.issueDate,
      displayMode: input.displayMode,
      memo: input.memo,
    };
    const document = await createInvoiceSnapshot(tx, actor, draft, snapshotInput, companySnapshot(setting), template, issuedAt, context.latestCycle?.id);
    const activeInvoiceIds = context.activeDocuments.map((active) => active.id);
    const superseded = await tx.invoiceDocument.updateMany({
      where: { id: { in: activeInvoiceIds }, status: "ISSUED" },
      data: { status: "SUPERSEDED", supersededAt: issuedAt, supersededByInvoiceId: document.id, version: { increment: 1 } },
    });
    if (superseded.count !== activeInvoiceIds.length) throw replacementChanged();
    await tx.revenueEntry.updateMany({
      where: { currentInvoiceDocumentId: { in: activeInvoiceIds } },
      data: { currentInvoiceDocumentId: null },
    });
    const assigned = await tx.revenueEntry.updateMany({
      where: { id: { in: actualRevenueEntryIds }, currentInvoiceDocumentId: null },
      data: { currentInvoiceDocumentId: document.id },
    });
    if (assigned.count !== actualRevenueEntryIds.length) throw replacementChanged();

    await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "REPLACE", entityType: "INVOICE", entityId: document.id, after: { invoiceNo: document.invoiceNo, siteId: document.siteId, replacedInvoiceIds: activeInvoiceIds, revenueEntryIds: actualRevenueEntryIds, subtotal: document.subtotal, taxAmount: document.taxAmount, totalAmount: document.totalAmount, templateId: template.id, templateVersion: template.version } });
    await recordSyncEvent(tx, { type: "invoice.changed", entityId: document.id, siteId: document.siteId, actorId: actor.id });
    return getInvoiceDocument(document.id, tx);
  });
}

export async function listInvoices(query: InvoiceListQuery) {
  const where: Prisma.InvoiceDocumentWhereInput = {
    ...(query.siteId ? { siteId: query.siteId } : {}),
    ...(query.startDate || query.endDate ? { issueDate: { ...(query.startDate ? { gte: dbDate(query.startDate) } : {}), ...(query.endDate ? { lte: endOfDay(query.endDate) } : {}) } } : {}),
    ...(query.q ? { OR: [{ invoiceNo: { contains: query.q } }, { recipientName: { contains: query.q } }, { supplierCompanyName: { contains: query.q } }] } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.invoiceDocument.count({ where }),
    prisma.invoiceDocument.findMany({ where, select: { id: true, invoiceNo: true, issueDate: true, periodStart: true, periodEnd: true, recipientName: true, subtotal: true, taxAmount: true, totalAmount: true, displayMode: true, status: true, version: true, issuedAt: true, supersededAt: true, supersededBy: { select: { id: true, invoiceNo: true } }, _count: { select: { lines: true, revenueLinks: true } } }, orderBy: [{ issueDate: "desc" }, { invoiceNo: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
  ]);
  return { rows, total, page: query.page, pageSize: query.pageSize, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
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
  target: InvoiceIssueInput["cycles"][number],
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
    throw new AuthError("마감 상태가 변경되었습니다. 관제실에서 다시 시작해 주세요.", 409, "INVOICE_CLOSE_CHANGED");
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
  return { id: row.id, siteId: row.siteId, siteCode: row.site.code, siteName: row.site.name, siteAddress: row.site.address, revenueDate: row.revenueDate, title: row.title, description: row.description, itemName: row.item?.name ?? null, quantity: row.quantity, unit: row.unit, unitPrice: row.appliedSalesPrice, supplyAmount: row.salesAmount };
}

async function loadReplacementContext(tx: Prisma.TransactionClient, invoiceId: string) {
  const source = await tx.invoiceDocument.findUnique({
    where: { id: invoiceId },
    select: { id: true, siteId: true, periodStart: true, periodEnd: true, status: true, version: true },
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
      select: { id: true },
      orderBy: { issuedAt: "asc" },
    }),
    tx.monthlyClose.findMany({
      where: { siteId: source.siteId, month: { in: months }, state: "CLOSED" },
      include: { cycles: { orderBy: { cycleNo: "desc" }, take: 1 } },
    }),
  ]);
  if (closeStates.length !== months.length || closeStates.some((close) => !close.cycles[0])) {
    throw new AuthError("대체발행 전에 모든 귀속월을 다시 마감해 주세요.", 409, "INVOICE_CLOSE_REQUIRED");
  }
  if (!entries.length) throw new AuthError("대체 발행할 확정 매출이 없습니다.", 409, "INVOICE_REPLACEMENT_EMPTY");
  if (entries.length > 500) throw new AuthError("대체 발행 대상이 500건을 초과했습니다. 귀속기간을 확인해 주세요.", 409, "INVOICE_REPLACEMENT_TOO_LARGE");
  const activeIds = new Set(activeDocuments.map((document) => document.id));
  if (!activeIds.has(source.id)) throw replacementChanged();
  if (entries.some((entry) => entry.currentInvoiceDocumentId && !activeIds.has(entry.currentInvoiceDocumentId))) {
    throw new AuthError("같은 기간의 일부 매출이 다른 귀속기간 거래명세표에 포함되어 있습니다.", 409, "INVOICE_REPLACEMENT_SCOPE_CONFLICT");
  }
  return { source, entries, activeDocuments, latestCycle: closeStates.length === 1 ? closeStates[0].cycles[0] : null };
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
