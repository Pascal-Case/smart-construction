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
  const where: Prisma.RevenueEntryWhereInput = {
    status: "CONFIRMED",
    revenueDate: { gte: dbDate(query.startDate), lte: endOfDay(query.endDate) },
    ...(query.siteId ? { siteId: query.siteId } : {}),
    currentInvoiceDocumentId: null,
  };
  const [total, rows] = await prisma.$transaction([
    prisma.revenueEntry.count({ where }),
    prisma.revenueEntry.findMany({ where, select: candidateSelect, orderBy: [{ site: { name: "asc" } }, { revenueDate: "asc" }, { createdAt: "asc" }], take: 500 }),
  ]);
  return {
    rows: rows.map((row) => ({ ...toSourceEntry(row), revenueDate: row.revenueDate.toISOString(), sourceType: row.sourceType })),
    total,
    truncated: total > rows.length,
    totals: { supplyAmount: rows.reduce((sum, row) => sum + row.salesAmount, 0), taxAmount: rows.reduce((sum, row) => sum + Math.round(row.salesAmount * 0.1), 0) },
  };
}

export async function previewInvoices(input: InvoiceIssueInput) {
  const [setting, entries, template] = await prisma.$transaction(async (tx) => Promise.all([
    requireCompanySetting(tx),
    loadSelectedEntries(tx, input),
    resolveInvoiceTemplate(input.templateId, input.templateVersion, tx),
  ]));
  return {
    template,
    documents: buildInvoiceDrafts(entries.map(toSourceEntry), input.displayMode).map((document) => ({ ...document, issueDate: input.issueDate, periodStart: input.periodStart, periodEnd: input.periodEnd, displayMode: input.displayMode, memo: input.memo ?? null, supplier: companySnapshot(setting), templateConfig: template.config })),
  };
}

export async function issueInvoices(actor: SessionUser, input: InvoiceIssueInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const setting = await requireCompanySetting(tx);
      const entries = await loadSelectedEntries(tx, input);
      const template = await resolveInvoiceTemplate(input.templateId, input.templateVersion, tx);
      const drafts = buildInvoiceDrafts(entries.map(toSourceEntry), input.displayMode);
      const issuedAt = new Date();
      const documents: Awaited<ReturnType<typeof getInvoiceDocument>>[] = [];
      for (const draft of drafts) {
        const supplier = companySnapshot(setting);
        const document = await createInvoiceSnapshot(tx, actor, draft, input, supplier, template, issuedAt);
        const revenueEntryIds = draft.lines.flatMap((line) => line.revenueEntryIds);
        const assigned = await tx.revenueEntry.updateMany({ where: { id: { in: revenueEntryIds }, currentInvoiceDocumentId: null }, data: { currentInvoiceDocumentId: document.id } });
        if (assigned.count !== revenueEntryIds.length) throw new AuthError("선택한 매출 중 이미 발행된 건이 있습니다. 후보를 다시 조회해 주세요.", 409, "INVOICE_CANDIDATE_CHANGED");
        const invoiceNo = document.invoiceNo;
        await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "ISSUE", entityType: "INVOICE", entityId: document.id, after: { invoiceNo, siteId: draft.siteId, revenueEntryIds: draft.lines.flatMap((line) => line.revenueEntryIds), subtotal: draft.subtotal, taxAmount: draft.taxAmount, totalAmount: draft.totalAmount, templateId: template.id, templateVersion: template.version } });
        await recordSyncEvent(tx, { type: "invoice.changed", entityId: document.id, siteId: document.siteId, actorId: actor.id });
        documents.push(await getInvoiceDocument(document.id, tx));
      }
      return documents;
    });
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AuthError("선택한 매출 중 이미 발행된 건이 있습니다. 후보를 다시 조회해 주세요.", 409, "INVOICE_CANDIDATE_CHANGED");
    throw error;
  }
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
    const document = await createInvoiceSnapshot(tx, actor, draft, snapshotInput, companySnapshot(setting), template, issuedAt);
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

async function loadSelectedEntries(tx: Prisma.TransactionClient, input: InvoiceIssueInput) {
  const ids = [...new Set(input.revenueEntryIds)];
  if (ids.length !== input.revenueEntryIds.length) throw new AuthError("중복된 매출 선택이 포함되어 있습니다.", 400, "DUPLICATE_REVENUE_SELECTION");
  const rows = await tx.revenueEntry.findMany({ where: { id: { in: ids }, status: "CONFIRMED", revenueDate: { gte: dbDate(input.periodStart), lte: endOfDay(input.periodEnd) }, currentInvoiceDocumentId: null }, select: candidateSelect, orderBy: [{ site: { name: "asc" } }, { revenueDate: "asc" }, { createdAt: "asc" }] });
  if (rows.length !== ids.length) throw new AuthError("선택한 매출이 변경되었거나 이미 발행되었습니다. 후보를 다시 조회해 주세요.", 409, "INVOICE_CANDIDATE_CHANGED");
  return rows;
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
  const [entries, activeDocuments] = await Promise.all([
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
  ]);
  if (!entries.length) throw new AuthError("대체 발행할 확정 매출이 없습니다.", 409, "INVOICE_REPLACEMENT_EMPTY");
  if (entries.length > 500) throw new AuthError("대체 발행 대상이 500건을 초과했습니다. 귀속기간을 확인해 주세요.", 409, "INVOICE_REPLACEMENT_TOO_LARGE");
  const activeIds = new Set(activeDocuments.map((document) => document.id));
  if (!activeIds.has(source.id)) throw replacementChanged();
  if (entries.some((entry) => entry.currentInvoiceDocumentId && !activeIds.has(entry.currentInvoiceDocumentId))) {
    throw new AuthError("같은 기간의 일부 매출이 다른 귀속기간 거래명세표에 포함되어 있습니다.", 409, "INVOICE_REPLACEMENT_SCOPE_CONFLICT");
  }
  return { source, entries, activeDocuments };
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
