import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import { recordSyncEvent } from "@/lib/events/bus";
import { buildInvoiceDrafts, type InvoiceSourceEntry } from "@/lib/invoices/calculation";
import type { InvoiceCandidateQuery, InvoiceIssueInput, InvoiceListQuery } from "@/lib/invoices/schemas";
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
  site: { select: { code: true, name: true, address: true } },
  item: { select: { name: true } },
} satisfies Prisma.RevenueEntrySelect;

type CandidateRow = Prisma.RevenueEntryGetPayload<{ select: typeof candidateSelect }>;

export async function getInvoiceCandidates(query: InvoiceCandidateQuery) {
  const where: Prisma.RevenueEntryWhereInput = {
    status: "CONFIRMED",
    revenueDate: { gte: dbDate(query.startDate), lte: endOfDay(query.endDate) },
    ...(query.siteId ? { siteId: query.siteId } : {}),
    invoiceLinks: { none: {} },
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
  const [setting, entries] = await prisma.$transaction(async (tx) => Promise.all([
    requireCompanySetting(tx),
    loadSelectedEntries(tx, input),
  ]));
  return { documents: buildInvoiceDrafts(entries.map(toSourceEntry), input.displayMode).map((document) => ({ ...document, issueDate: input.issueDate, periodStart: input.periodStart, periodEnd: input.periodEnd, displayMode: input.displayMode, memo: input.memo ?? null, supplier: companySnapshot(setting) })) };
}

export async function issueInvoices(actor: SessionUser, input: InvoiceIssueInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const setting = await requireCompanySetting(tx);
      const entries = await loadSelectedEntries(tx, input);
      const drafts = buildInvoiceDrafts(entries.map(toSourceEntry), input.displayMode);
      const issueDate = dbDate(input.issueDate);
      const issuedAt = new Date();
      const documents: Awaited<ReturnType<typeof getInvoiceDocument>>[] = [];
      for (const draft of drafts) {
        const invoiceNo = await nextInvoiceNo(tx, issueDate);
        const supplier = companySnapshot(setting);
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
          createdById: actor.id,
          issuedById: actor.id,
          issuedAt,
        } });
        for (const [index, line] of draft.lines.entries()) {
          const savedLine = await tx.invoiceLine.create({ data: {
            invoiceDocumentId: document.id,
            itemName: line.itemName,
            specification: line.specification,
            quantity: line.quantity,
            unit: line.unit,
            unitPrice: line.unitPrice,
            supplyAmount: line.supplyAmount,
            taxAmount: line.taxAmount,
            sortOrder: index,
          } });
          await tx.invoiceRevenueLink.createMany({ data: line.revenueEntryIds.map((revenueEntryId) => ({ invoiceDocumentId: document.id, invoiceLineId: savedLine.id, revenueEntryId })) });
        }
        await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "ISSUE", entityType: "INVOICE", entityId: document.id, after: { invoiceNo, siteId: draft.siteId, revenueEntryIds: draft.lines.flatMap((line) => line.revenueEntryIds), subtotal: draft.subtotal, taxAmount: draft.taxAmount, totalAmount: draft.totalAmount } });
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

export async function listInvoices(query: InvoiceListQuery) {
  const where: Prisma.InvoiceDocumentWhereInput = {
    ...(query.siteId ? { siteId: query.siteId } : {}),
    ...(query.startDate || query.endDate ? { issueDate: { ...(query.startDate ? { gte: dbDate(query.startDate) } : {}), ...(query.endDate ? { lte: endOfDay(query.endDate) } : {}) } } : {}),
    ...(query.q ? { OR: [{ invoiceNo: { contains: query.q } }, { recipientName: { contains: query.q } }, { supplierCompanyName: { contains: query.q } }] } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.invoiceDocument.count({ where }),
    prisma.invoiceDocument.findMany({ where, select: { id: true, invoiceNo: true, issueDate: true, periodStart: true, periodEnd: true, recipientName: true, subtotal: true, taxAmount: true, totalAmount: true, displayMode: true, issuedAt: true, _count: { select: { lines: true, revenueLinks: true } } }, orderBy: [{ issueDate: "desc" }, { invoiceNo: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
  ]);
  return { rows, total, page: query.page, pageSize: query.pageSize, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
}

export async function getInvoiceDocument(id: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? prisma;
  const document = await client.invoiceDocument.findUnique({ where: { id }, include: { lines: { orderBy: { sortOrder: "asc" }, include: { revenueLinks: { select: { revenueEntryId: true } } } }, site: { select: { code: true } } } });
  if (!document) throw new AuthError("거래명세표를 찾을 수 없습니다.", 404, "INVOICE_NOT_FOUND");
  return document;
}

export async function getInvoiceDocuments(ids: string[]) {
  const uniqueIds = [...new Set(ids)].slice(0, 100);
  if (!uniqueIds.length) throw new AuthError("출력할 거래명세표를 선택해 주세요.", 400, "INVOICE_IDS_REQUIRED");
  const documents = await prisma.invoiceDocument.findMany({ where: { id: { in: uniqueIds } }, include: { lines: { orderBy: { sortOrder: "asc" } }, site: { select: { code: true } } } });
  if (documents.length !== uniqueIds.length) throw new AuthError("일부 거래명세표를 찾을 수 없습니다.", 404, "INVOICE_NOT_FOUND");
  const byId = new Map(documents.map((document) => [document.id, document]));
  return uniqueIds.map((id) => byId.get(id)!);
}

async function loadSelectedEntries(tx: Prisma.TransactionClient, input: InvoiceIssueInput) {
  const ids = [...new Set(input.revenueEntryIds)];
  if (ids.length !== input.revenueEntryIds.length) throw new AuthError("중복된 매출 선택이 포함되어 있습니다.", 400, "DUPLICATE_REVENUE_SELECTION");
  const rows = await tx.revenueEntry.findMany({ where: { id: { in: ids }, status: "CONFIRMED", revenueDate: { gte: dbDate(input.periodStart), lte: endOfDay(input.periodEnd) }, invoiceLinks: { none: {} } }, select: candidateSelect, orderBy: [{ site: { name: "asc" } }, { revenueDate: "asc" }, { createdAt: "asc" }] });
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

function companySnapshot(setting: { businessRegistrationNo: string; companyName: string; representativeName: string; address: string; businessType: string; businessItem: string; phone: string; defaultMessage: string }) { return { ...setting }; }
function dbDate(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function endOfDay(value: string) { return new Date(`${value}T23:59:59.999Z`); }
