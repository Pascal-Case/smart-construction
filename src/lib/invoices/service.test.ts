import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole } from "@/generated/prisma/client";
import { DEFAULT_INVOICE_TEMPLATE_CONFIG } from "@/lib/invoice-templates/config";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  rootCloseFindMany: vi.fn(),
  rootInvoiceFindMany: vi.fn(),
  rootRevenueFindMany: vi.fn(),
  companyFindUnique: vi.fn(),
  invoiceFindUnique: vi.fn(),
  invoiceFindMany: vi.fn(),
  invoiceCreate: vi.fn(),
  invoiceUpdateMany: vi.fn(),
  closeCycleFindUnique: vi.fn(),
  closeFindMany: vi.fn(),
  revenueFindMany: vi.fn(),
  revenueUpdateMany: vi.fn(),
  contractFindMany: vi.fn(),
  lineCreate: vi.fn(),
  linkCreateMany: vi.fn(),
  resolveTemplate: vi.fn(),
  nextInvoiceNo: vi.fn(),
  recordAudit: vi.fn(),
  recordSyncEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  $transaction: mocks.transaction,
  monthlyClose: { findMany: mocks.rootCloseFindMany },
  invoiceDocument: { findMany: mocks.rootInvoiceFindMany },
  revenueEntry: { findMany: mocks.rootRevenueFindMany },
} }));
vi.mock("@/lib/invoice-templates/service", () => ({ resolveInvoiceTemplate: mocks.resolveTemplate }));
vi.mock("@/lib/masters/sequence", () => ({ nextInvoiceNo: mocks.nextInvoiceNo }));
vi.mock("@/lib/audit/record", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/events/bus", () => ({ recordSyncEvent: mocks.recordSyncEvent }));

import { getInvoiceCandidates, issueInvoices, previewInvoices, previewReplacementInvoice, replaceInvoice } from "@/lib/invoices/service";

const actor = { id: "u1", loginId: "manager", name: "매니저", role: UserRole.MANAGER, isActive: true, version: 1 };
const source = {
  id: "invoice-old",
  invoiceNo: "I-OLD",
  siteId: "site-1",
  contractCategoryId: "category-1",
  periodStart: new Date("2026-07-01T00:00:00.000Z"),
  periodEnd: new Date("2026-07-31T23:59:59.999Z"),
  issueDate: new Date("2026-07-20T00:00:00.000Z"),
  displayMode: "AGGREGATED" as const,
  memo: null,
  status: "ISSUED" as const,
  version: 2,
  recipientName: "강남 현장",
  subtotal: 100_000,
  revenueLinks: [{ revenueEntryId: "r1" }],
};
const entries = [
  candidate("r1", "기존 계약", 100_000, "invoice-old"),
  candidate("r2", "추가 계약", 200_000, null),
];
const settings = { sourceVersion: 2, issueDate: "2026-07-25", reason: "발행일과 그룹핑 변경" };

describe("invoice replacement service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const tx = {
      companySetting: { findUnique: mocks.companyFindUnique },
      invoiceDocument: { findUnique: mocks.invoiceFindUnique, findMany: mocks.invoiceFindMany, create: mocks.invoiceCreate, updateMany: mocks.invoiceUpdateMany },
      monthlyCloseCycle: { findUnique: mocks.closeCycleFindUnique },
      monthlyClose: { findMany: mocks.closeFindMany },
      revenueEntry: { findMany: mocks.revenueFindMany, updateMany: mocks.revenueUpdateMany },
      contract: { findMany: mocks.contractFindMany },
      invoiceLine: { create: mocks.lineCreate },
      invoiceRevenueLink: { createMany: mocks.linkCreateMany },
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.companyFindUnique.mockResolvedValue({ id: "default", businessRegistrationNo: "123", companyName: "공급사", representativeName: "대표", address: "서울", businessType: "건설", businessItem: "임대", phone: "02", defaultMessage: "공급합니다" });
    mocks.invoiceFindUnique.mockImplementation(({ where }: { where: { id: string } }) => where.id === source.id ? source : { ...source, id: "invoice-new", invoiceNo: "I-NEW", status: "ISSUED", version: 1, lines: [], site: { code: "S1" }, supersededBy: null, supersedes: [{ id: source.id, invoiceNo: source.invoiceNo }] });
    mocks.invoiceFindMany.mockResolvedValue([{
      id: source.id,
      invoiceNo: source.invoiceNo,
      version: source.version,
      contractCategoryId: source.contractCategoryId,
      subtotal: source.subtotal,
      revenueLinks: source.revenueLinks,
    }]);
    mocks.revenueFindMany.mockResolvedValue(entries);
    mocks.contractFindMany.mockResolvedValue([{ id: "contract-missing", contractNo: "C-NEW", title: "말일 추가 계약" }]);
    mocks.resolveTemplate.mockResolvedValue({ id: "system-default", version: 1, name: "기본", config: DEFAULT_INVOICE_TEMPLATE_CONFIG, configJson: JSON.stringify(DEFAULT_INVOICE_TEMPLATE_CONFIG) });
    mocks.nextInvoiceNo.mockResolvedValue("I-NEW");
    mocks.invoiceCreate.mockResolvedValue({ id: "invoice-new", invoiceNo: "I-NEW", siteId: "site-1", contractCategoryId: "category-1", subtotal: 300_000, taxAmount: 30_000, totalAmount: 330_000 });
    mocks.lineCreate.mockImplementation(({ data }: { data: { itemName: string } }) => Promise.resolve({ id: `line-${data.itemName}` }));
    mocks.linkCreateMany.mockResolvedValue({ count: 1 });
    mocks.invoiceUpdateMany.mockResolvedValue({ count: 1 });
    mocks.revenueUpdateMany.mockResolvedValue({ count: 2 });
    mocks.closeCycleFindUnique.mockResolvedValue(closeCycle());
    mocks.closeFindMany.mockResolvedValue([{ id: "close-1", month: "2026-07", cycles: [{ id: "cycle-1", totalSalesAmount: 300_000, snapshotJson: JSON.stringify({ revenueEntryIds: ["r1", "r2"] }) }] }]);
    mocks.rootCloseFindMany.mockResolvedValue([{ id: "close-1", siteId: "site-1", month: "2026-07", version: 2, site: { id: "site-1", code: "S1", name: "강남 현장" }, cycles: [{ id: "cycle-2", cycleNo: 2, revenueCount: 2, totalSalesAmount: 300_000, revenueFingerprint: "b".repeat(64), snapshotJson: JSON.stringify({ revenueEntryIds: ["r1", "r2"] }) }] }]);
    mocks.rootInvoiceFindMany.mockResolvedValue([{ id: source.id, invoiceNo: source.invoiceNo, siteId: source.siteId, periodStart: source.periodStart, periodEnd: source.periodEnd, version: source.version, issuedAt: new Date("2026-07-20T00:00:00.000Z"), subtotal: 100_000, contractCategoryId: source.contractCategoryId, issueItemId: "item-1", issueItemName: "기존 계약", revenueFingerprint: null, closeRevenueFingerprint: "before", revenueLinks: source.revenueLinks }]);
    mocks.rootRevenueFindMany.mockResolvedValue(entries);
  });

  it("keeps the remaining item as a new candidate after partial issuance", async () => {
    const result = await getInvoiceCandidates({ month: "2026-07", siteId: "" });

    expect(result.rows).toEqual([expect.objectContaining({
      targetKey: "new:cycle-2:category-1:item-1",
      kind: "NEW",
      cycleId: "cycle-2",
      issueItemId: "item-1",
    })]);
  });

  it("품목별 신규 후보를 만들고 선택한 품목의 발행일을 문서 snapshot에 저장한다", async () => {
    const itemA = candidate("r1", "안전 점검", 100_000, null);
    const itemB = { ...candidate("r2", "교육", 200_000, null), itemId: "item-2", item: { id: "item-2", name: "교육", specification: null, invoiceDisplayItem: null, invoiceDisplaySources: [] } };
    mocks.rootInvoiceFindMany.mockResolvedValue([]);
    mocks.rootRevenueFindMany.mockResolvedValue([itemA, itemB]);

    const result = await getInvoiceCandidates({ month: "2026-07", siteId: "" });

    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "NEW", issueItemId: "item-1", issueItemName: "안전 점검", supplyAmount: 100_000 }),
      expect.objectContaining({ kind: "NEW", issueItemId: "item-2", issueItemName: "교육", supplyAmount: 200_000 }),
    ]));

    mocks.revenueFindMany.mockResolvedValue([itemA, itemB]);
    mocks.revenueUpdateMany.mockResolvedValue({ count: 1 });
    const issueDate = "2026-08-03";
    await issueInvoices(actor, {
      ...issueSettings(),
      targets: [{ ...newTarget(), issueItemId: "item-2", issueDate }],
    });

    expect(mocks.invoiceCreate).toHaveBeenCalledTimes(1);
    expect(mocks.invoiceCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ issueItemId: "item-2", issueItemName: "교육", issueDate: new Date(`${issueDate}T00:00:00.000Z`) }),
    }));
    expect(mocks.revenueUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["r2"] }, currentInvoiceDocumentId: null } }));
  });

  it("같은 문서 그룹의 여러 품목을 하나의 다품목 문서로 발행한다", async () => {
    const itemA = candidate("r1", "안전 점검", 100_000, null);
    const itemB = { ...candidate("r2", "교육", 200_000, null), itemId: "item-2", item: { id: "item-2", name: "교육", specification: null, invoiceDisplayItem: null, invoiceDisplaySources: [] } };
    mocks.revenueFindMany.mockResolvedValue([itemA, itemB]);
    mocks.revenueUpdateMany.mockResolvedValue({ count: 2 });

    await issueInvoices(actor, {
      ...issueSettings(),
      targets: [{
        ...newTarget(),
        targetKey: "new:site-1:category-1:2026-08-03",
        issueItemIds: ["item-1", "item-2"],
        documentGroupKey: "site-1:category-1:2026-08-03",
        candidateKeys: ["new:item-1", "new:item-2"],
        issueDate: "2026-08-03",
      }],
    });

    expect(mocks.invoiceCreate).toHaveBeenCalledTimes(1);
    expect(mocks.invoiceCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ documentGroupKey: "site-1:category-1:2026-08-03", issueItemId: null, issueItemName: "여러 품목", subtotal: 300_000 }),
    }));
    expect(mocks.revenueUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["r1", "r2"] }, currentInvoiceDocumentId: null } }));
  });

  it("같은 품목 ID라도 계약 구분이 다르면 선택한 계약 구분만 발행한다", async () => {
    const categoryOne = candidate("r1", "안전 점검", 100_000, null);
    const categoryTwo = { ...candidate("r2", "안전 점검", 200_000, null), contractCategoryId: "category-2", contractCategory: { code: "CONTRACT-TYPE-0002", name: "시설관리" } };
    mocks.revenueFindMany.mockResolvedValue([categoryOne, categoryTwo]);

    await issueInvoices(actor, {
      ...issueSettings(),
      targets: [{ ...newTarget(), issueItemId: "item-1", contractCategoryId: "category-1" }],
    });

    expect(mocks.revenueUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["r1"] }, currentInvoiceDocumentId: null } }));
  });

  it("계약 구분 또는 대표 품목 snapshot만 바뀐 재마감도 대체 대상으로 분류한다", async () => {
    mocks.rootInvoiceFindMany.mockResolvedValue([{ id: source.id, invoiceNo: source.invoiceNo, siteId: source.siteId, periodStart: source.periodStart, periodEnd: source.periodEnd, version: source.version, issuedAt: new Date("2026-07-20T00:00:00.000Z"), subtotal: 300_000, contractCategoryId: source.contractCategoryId, issueItemId: "item-1", issueItemName: "기존 계약", revenueFingerprint: null, closeRevenueFingerprint: "before", revenueLinks: [{ revenueEntryId: "r1" }, { revenueEntryId: "r2" }] }]);
    mocks.rootRevenueFindMany.mockResolvedValue(entries.map((entry) => ({ ...entry, currentInvoiceDocumentId: source.id })));

    expect(await getInvoiceCandidates({ month: "2026-07", siteId: "" })).toMatchObject({
      rows: [expect.objectContaining({ kind: "REPLACEMENT", sourceInvoiceId: source.id })],
    });
  });

  it("previews only the revenue linked to the source document", async () => {
    const preview = await previewReplacementInvoice(source.id, settings);

    expect(preview.expectedRevenueEntryIds).toEqual(["r1"]);
    expect(preview.expectedActiveInvoiceIds).toEqual([source.id]);
    expect(preview.documents).toEqual([expect.objectContaining({ siteId: "site-1", subtotal: 100_000, periodStart: "2026-07-01", periodEnd: "2026-07-31" })]);
    expect(preview.warnings).toEqual([]);
  });

  it("재발행은 같은 현장·계약 구분이어도 발행일이 다르면 문서를 분리한다", async () => {
    const itemB = { ...entries[1], itemId: "item-2", item: { id: "item-2", name: "추가 계약", specification: null, invoiceDisplayItem: null, invoiceDisplaySources: [] }, currentInvoiceDocumentId: "invoice-extra" };
    mocks.invoiceFindUnique.mockResolvedValue({ ...source, subtotal: 300_000, revenueLinks: [{ revenueEntryId: "r1" }, { revenueEntryId: "r2" }] });
    mocks.invoiceFindMany.mockResolvedValue([
      { id: source.id, invoiceNo: source.invoiceNo, version: source.version, siteId: "site-1", contractCategoryId: "category-1", issueDate: new Date("2026-07-20T00:00:00.000Z"), documentGroupKey: "auto:manual:a", issueItemId: "item-1", revenueFingerprint: null, subtotal: 100_000, closeRevenueFingerprint: "before", revenueLinks: [{ revenueEntryId: "r1" }] },
      { id: "invoice-extra", invoiceNo: "I-EXTRA", version: 1, siteId: "site-1", contractCategoryId: "category-1", issueDate: new Date("2026-07-26T00:00:00.000Z"), documentGroupKey: "auto:manual:b", issueItemId: "item-2", revenueFingerprint: null, subtotal: 200_000, closeRevenueFingerprint: "before", revenueLinks: [{ revenueEntryId: "r2" }] },
    ]);
    mocks.revenueFindMany.mockResolvedValue([{ ...entries[0], currentInvoiceDocumentId: source.id }, itemB]);
    mocks.closeFindMany.mockResolvedValue([{ id: "close-1", month: "2026-07", cycles: [{ id: "cycle-1", totalSalesAmount: 300_000, revenueFingerprint: "latest", snapshotJson: JSON.stringify({ revenueEntryIds: ["r1", "r2"] }) }] }]);

    const preview = await previewReplacementInvoice(source.id, settings);

    expect(preview.documents).toHaveLength(1);
    expect(preview.documents).toEqual([expect.objectContaining({ documentGroupKey: "site-1:category-1:2026-07-25", subtotal: 100_000 })]);
    expect(preview.expectedActiveInvoiceIds).toEqual([source.id]);
  });

  it("재발행 대상 발행일에 이미 문서가 있으면 자동으로 하나의 그룹으로 합친다", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({ ...source, subtotal: 300_000, revenueLinks: [{ revenueEntryId: "r1" }, { revenueEntryId: "r2" }] });
    mocks.invoiceFindMany.mockResolvedValue([
      { id: source.id, invoiceNo: source.invoiceNo, version: source.version, siteId: "site-1", contractCategoryId: "category-1", issueDate: new Date("2026-07-20T00:00:00.000Z"), displayMode: "AGGREGATED", revenueLinks: [{ revenueEntryId: "r1" }] },
      { id: "invoice-extra", invoiceNo: "I-EXTRA", version: 1, siteId: "site-1", contractCategoryId: "category-1", issueDate: new Date("2026-07-25T00:00:00.000Z"), displayMode: "AGGREGATED", memo: "다른 메모", revenueLinks: [{ revenueEntryId: "r2" }] },
    ]);
    mocks.revenueFindMany.mockResolvedValue(entries);

    const preview = await previewReplacementInvoice(source.id, settings);

    expect(preview.documents).toEqual([expect.objectContaining({ documentGroupKey: "site-1:category-1:2026-07-25", subtotal: 300_000 })]);
    expect(preview.expectedActiveInvoiceIds).toEqual([source.id, "invoice-extra"]);
    expect(preview.documents[0].snapshotNotice).toContain("선택한 원본 문서");
  });

  it("재발행은 기존 문서 snapshot의 금액을 유지한다", async () => {
    mocks.invoiceFindMany.mockResolvedValue([{
      id: source.id,
      invoiceNo: source.invoiceNo,
      version: source.version,
      siteId: "site-1",
      contractCategoryId: "category-1",
      issueDate: source.issueDate,
      displayMode: "ITEMIZED",
      subtotal: 100_000,
      revenueLinks: [{ revenueEntryId: "r1" }],
      lines: [{ itemName: "기존 계약", specification: null, quantity: 1, unit: "식", unitPrice: 100_000, supplyAmount: 100_000, taxAmount: 10_000, revenueLinks: [{ revenueEntryId: "r1" }] }],
    }]);
    mocks.revenueFindMany.mockResolvedValue([{ ...entries[0], salesAmount: 999_000, appliedSalesPrice: 999_000 }]);

    const preview = await previewReplacementInvoice(source.id, settings);

    expect(preview.documents[0]).toMatchObject({ subtotal: 100_000, taxAmount: 10_000, totalAmount: 110_000, displayMode: "ITEMIZED" });
    expect(preview.documents[0].lines).toEqual([expect.objectContaining({ itemName: "기존 계약", supplyAmount: 100_000, taxAmount: 10_000 })]);
  });

  it("partial issuance replacement keeps unissued item groups as later NEW candidates", async () => {
    const issuedEntry = candidate("r1", "기존 계약", 100_000, source.id);
    const unissuedEntry = { ...candidate("r2", "추가 계약", 200_000, null), itemId: "item-2", item: { id: "item-2", name: "추가 계약", specification: null, invoiceDisplayItem: null, invoiceDisplaySources: [] } };
    const snapshotJson = JSON.stringify({
      revenueEntryIds: ["r1", "r2"],
      revenueEntries: [
        { id: "r1", itemId: "item-1", contractCategoryId: "category-1", salesAmount: 100_000 },
        { id: "r2", itemId: "item-2", contractCategoryId: "category-1", salesAmount: 200_000 },
      ],
    });
    mocks.revenueFindMany.mockResolvedValue([issuedEntry, unissuedEntry]);
    mocks.invoiceFindMany.mockResolvedValue([{ id: source.id, invoiceNo: source.invoiceNo, version: source.version, issueItemId: "item-1", revenueFingerprint: "changed", subtotal: 100_000, revenueLinks: [{ revenueEntryId: "r1" }] }]);
    mocks.closeFindMany.mockResolvedValue([{ id: "close-1", month: "2026-07", cycles: [{ id: "cycle-1", totalSalesAmount: 300_000, revenueFingerprint: "new-close", snapshotJson }] }]);

    const preview = await previewReplacementInvoice(source.id, settings);

    expect(preview.expectedRevenueEntryIds).toEqual(["r1"]);
    expect(preview.documents).toEqual([expect.objectContaining({ subtotal: 100_000, issueItemId: "item-1" })]);
  });

  it("atomically creates a new snapshot, supersedes the current document, and moves active revenue pointers", async () => {
    mocks.revenueUpdateMany.mockResolvedValue({ count: 1 });
    const documents = await replaceInvoice(actor, source.id, { ...settings, expectedRevenueEntryIds: ["r1"], expectedActiveInvoiceIds: [source.id] });

    expect(documents).toEqual([expect.objectContaining({ id: "invoice-new", invoiceNo: "I-NEW" })]);
    expect(mocks.invoiceUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: source.id, status: "ISSUED" },
      data: expect.objectContaining({ status: "SUPERSEDED", supersededByInvoiceId: "invoice-new" }),
    }));
    expect(mocks.revenueUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { currentInvoiceDocumentId: "invoice-new" } }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "REPLACE", entityId: "invoice-new", after: expect.objectContaining({ reason: settings.reason }) }));
  });

  it("재발행 확정은 다른 발행일의 문서를 건드리지 않는다", async () => {
    mocks.invoiceFindMany.mockResolvedValue([
      { id: source.id, invoiceNo: source.invoiceNo, version: source.version, siteId: "site-1", contractCategoryId: "category-1", issueDate: source.issueDate, revenueLinks: [{ revenueEntryId: "r1" }] },
      { id: "invoice-other-date", invoiceNo: "I-OTHER", version: 1, siteId: "site-1", contractCategoryId: "category-1", issueDate: new Date("2026-07-26T00:00:00.000Z"), revenueLinks: [{ revenueEntryId: "r2" }] },
    ]);
    mocks.revenueFindMany.mockResolvedValue(entries);
    mocks.revenueUpdateMany.mockResolvedValue({ count: 1 });

    await replaceInvoice(actor, source.id, { ...settings, expectedRevenueEntryIds: ["r1"], expectedActiveInvoiceIds: [source.id] });

    expect(mocks.invoiceUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.invoiceUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: source.id, status: "ISSUED" } }));
    expect(mocks.invoiceUpdateMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: "invoice-other-date", status: "ISSUED" } }));
  });

  it("rejects issue when the confirmed revenue set changed after preview", async () => {
    await expect(replaceInvoice(actor, source.id, { ...settings, expectedRevenueEntryIds: ["r1", "r2"], expectedActiveInvoiceIds: [source.id] })).rejects.toMatchObject({ status: 409, code: "INVOICE_REPLACEMENT_CHANGED" });
    expect(mocks.invoiceCreate).not.toHaveBeenCalled();
  });

  it("allows reissue even when the source data is unchanged", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({ ...source, subtotal: 300_000, revenueLinks: [{ revenueEntryId: "r1" }, { revenueEntryId: "r2" }] });
    mocks.invoiceFindMany.mockResolvedValue([{
      id: source.id,
      invoiceNo: source.invoiceNo,
      version: source.version,
      subtotal: 300_000,
      revenueLinks: [{ revenueEntryId: "r1" }, { revenueEntryId: "r2" }],
    }]);

    await expect(previewReplacementInvoice(source.id, settings)).resolves.toMatchObject({
      expectedRevenueEntryIds: ["r1", "r2"],
      documents: [expect.objectContaining({ subtotal: 300_000 })],
    });
  });

  it("compares the latest close with every active document in the same period", async () => {
    const extraEntry = candidate("r-extra", "추가 매출", 50_000, "invoice-extra");
    mocks.invoiceFindUnique.mockResolvedValue({
      ...source,
      subtotal: 300_000,
      revenueLinks: [{ revenueEntryId: "r1" }, { revenueEntryId: "r2" }],
    });
    mocks.invoiceFindMany.mockResolvedValue([
      {
        id: source.id,
        invoiceNo: source.invoiceNo,
        version: source.version,
        subtotal: 300_000,
        revenueLinks: [{ revenueEntryId: "r1" }, { revenueEntryId: "r2" }],
      },
      {
        id: "invoice-extra",
        invoiceNo: "I-EXTRA",
        version: 1,
        siteId: "site-1",
        contractCategoryId: "category-1",
        issueDate: new Date("2026-07-26T00:00:00.000Z"),
        subtotal: 50_000,
        revenueLinks: [{ revenueEntryId: "r-extra" }],
      },
    ]);
    mocks.revenueFindMany.mockResolvedValue([...entries, extraEntry]);

    await expect(previewReplacementInvoice(source.id, settings)).resolves.toMatchObject({ documents: expect.any(Array) });
  });

  it("issues the complete latest close cycle and stores its provenance", async () => {
    mocks.revenueFindMany.mockResolvedValue(entries.map((entry) => ({ ...entry, currentInvoiceDocumentId: null })));
    const results = await issueInvoices(actor, issueInput());

    expect(results[0]).toMatchObject({ cycleId: "cycle-1", outcome: "ISSUED" });
    expect(mocks.invoiceCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ monthlyCloseCycleId: "cycle-1", periodStart: new Date("2026-07-01T00:00:00.000Z") }),
    }));
  });

  it("returns a blocked result when the close cycle became stale", async () => {
    mocks.closeCycleFindUnique.mockResolvedValue({ ...closeCycle(), monthlyClose: { ...closeCycle().monthlyClose, state: "OPEN" } });
    expect(await issueInvoices(actor, issueInput())).toMatchObject([
      { cycleId: "cycle-1", outcome: "BLOCKED", error: { code: "INVOICE_CLOSE_CHANGED" } },
    ]);
  });

  it("previews mixed new and replacement targets with commit expectations", async () => {
    mocks.revenueFindMany
      .mockResolvedValueOnce(entries.map((entry) => ({ ...entry, currentInvoiceDocumentId: null })))
      .mockResolvedValueOnce(entries);

    const preview = await previewInvoices({
      ...issueSettings(),
      targets: [
        newTarget(),
        { targetKey: "replacement:site-1:2026-07", kind: "REPLACEMENT", sourceInvoiceId: source.id, sourceVersion: source.version },
      ],
    });

    expect(preview.summary).toMatchObject({ total: 2, newCount: 1, replacementCount: 1, blockedCount: 0 });
    expect(preview.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetKey: "new:cycle-1", kind: "NEW", outcome: "PREVIEWED" }),
      expect.objectContaining({
        targetKey: "replacement:site-1:2026-07",
        kind: "REPLACEMENT",
        outcome: "PREVIEWED",
        commitTarget: expect.objectContaining({ expectedRevenueEntryIds: ["r1", "r2"], expectedActiveInvoiceIds: [source.id], expectedCloseCycleIds: ["cycle-1"] }),
      }),
    ]));
  });

  it("배치 재발행은 기존 문서에 없던 새 품목의 확정 매출도 같은 재발행 문서에 포함한다", async () => {
    const newItemEntry = {
      ...candidate("r2", "새 품목", 200_000, null),
      itemId: "item-2",
      item: { id: "item-2", name: "새 품목", specification: null, invoiceDisplayItem: null, invoiceDisplaySources: [] },
    };
    mocks.revenueFindMany.mockResolvedValue([entries[0], newItemEntry]);

    const preview = await previewInvoices({
      ...issueSettings(),
      targets: [{ targetKey: "replacement:site-1:2026-07", kind: "REPLACEMENT", sourceInvoiceId: source.id, sourceVersion: source.version }],
    });

    expect(preview.results[0]).toMatchObject({
      outcome: "PREVIEWED",
      commitTarget: { expectedRevenueEntryIds: ["r1", "r2"] },
      documents: [expect.objectContaining({ subtotal: 300_000 })],
    });
  });

  it("issues valid mixed targets and leaves a stale replacement blocked", async () => {
    mocks.revenueFindMany.mockResolvedValue(entries.map((entry) => ({ ...entry, currentInvoiceDocumentId: null })));
    const results = await issueInvoices(actor, {
      ...issueSettings(),
      targets: [
        newTarget(),
        {
          targetKey: "replacement:site-1:2026-07",
          kind: "REPLACEMENT",
          sourceInvoiceId: source.id,
          sourceVersion: source.version - 1,
          expectedRevenueEntryIds: ["r1", "r2"],
          expectedActiveInvoiceIds: [source.id],
          expectedCloseCycleIds: ["cycle-1"],
          reason: "발행일 변경",
        },
      ],
    });

    expect(results).toEqual([
      expect.objectContaining({ targetKey: "new:cycle-1", outcome: "ISSUED" }),
      expect.objectContaining({ targetKey: "replacement:site-1:2026-07", outcome: "BLOCKED", error: { code: "INVOICE_REPLACEMENT_CHANGED", message: expect.any(String) } }),
    ]);
    expect(mocks.invoiceUpdateMany).not.toHaveBeenCalled();
  });
});

function issueInput() {
  return {
    ...issueSettings(),
    targets: [newTarget()],
  };
}

function issueSettings() {
  return { issueDate: "2026-07-25", displayMode: "AGGREGATED" as const, memo: null, templateId: "system-default", templateVersion: 1 };
}

function newTarget() {
  return { targetKey: "new:cycle-1", kind: "NEW" as const, cycleId: "cycle-1", expectedCloseVersion: 2, expectedRevenueFingerprint: "a".repeat(64), contractCategoryId: "category-1" };
}

function closeCycle() {
  return {
    id: "cycle-1",
    cycleNo: 1,
    revenueCount: 2,
    totalSalesAmount: 300_000,
    revenueFingerprint: "a".repeat(64),
    snapshotJson: JSON.stringify({ revenueEntryIds: ["r1", "r2"] }),
    invoiceDocuments: [],
    monthlyClose: {
      id: "close-1",
      siteId: "site-1",
      month: "2026-07",
      state: "CLOSED",
      latestCycleNo: 1,
      version: 2,
      site: { code: "S1", name: "강남 현장", address: "서울" },
    },
  };
}

function candidate(id: string, title: string, salesAmount: number, currentInvoiceDocumentId: string | null) {
  return {
    id,
    siteId: "site-1",
    revenueDate: new Date("2026-07-01T00:00:00.000Z"),
    title,
    description: null,
    quantity: 1,
    unit: "식",
    appliedSalesPrice: salesAmount,
    salesAmount,
    sourceType: "CONTRACT" as const,
    currentInvoiceDocumentId,
    contractCategoryId: "category-1",
    contractCategory: { code: "CONTRACT-TYPE-0001", name: "스마트건설안전" },
    site: { code: "S1", name: "강남 현장", address: "서울" },
    itemId: "item-1",
    item: { id: "item-1", name: title, specification: null, invoiceDisplayItem: null, invoiceDisplaySources: [] },
  };
}
