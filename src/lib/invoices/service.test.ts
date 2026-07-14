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
const settings = { sourceVersion: 2, issueDate: "2026-07-25", displayMode: "ITEMIZED" as const, memo: "7월 전체", templateId: "system-default", templateVersion: 1 };

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
      subtotal: source.subtotal,
      revenueLinks: source.revenueLinks,
    }]);
    mocks.revenueFindMany.mockResolvedValue(entries);
    mocks.contractFindMany.mockResolvedValue([{ id: "contract-missing", contractNo: "C-NEW", title: "말일 추가 계약" }]);
    mocks.resolveTemplate.mockResolvedValue({ id: "system-default", version: 1, name: "기본", config: DEFAULT_INVOICE_TEMPLATE_CONFIG, configJson: JSON.stringify(DEFAULT_INVOICE_TEMPLATE_CONFIG) });
    mocks.nextInvoiceNo.mockResolvedValue("I-NEW");
    mocks.invoiceCreate.mockResolvedValue({ id: "invoice-new", invoiceNo: "I-NEW", siteId: "site-1", subtotal: 300_000, taxAmount: 30_000, totalAmount: 330_000 });
    mocks.lineCreate.mockImplementation(({ data }: { data: { itemName: string } }) => Promise.resolve({ id: `line-${data.itemName}` }));
    mocks.linkCreateMany.mockResolvedValue({ count: 1 });
    mocks.invoiceUpdateMany.mockResolvedValue({ count: 1 });
    mocks.revenueUpdateMany.mockResolvedValue({ count: 2 });
    mocks.closeCycleFindUnique.mockResolvedValue(closeCycle());
    mocks.closeFindMany.mockResolvedValue([{ id: "close-1", month: "2026-07", cycles: [{ id: "cycle-1", totalSalesAmount: 300_000, snapshotJson: JSON.stringify({ revenueEntryIds: ["r1", "r2"] }) }] }]);
    mocks.rootCloseFindMany.mockResolvedValue([{ id: "close-1", siteId: "site-1", month: "2026-07", version: 2, site: { id: "site-1", code: "S1", name: "강남 현장" }, cycles: [{ id: "cycle-2", cycleNo: 2, revenueCount: 2, totalSalesAmount: 300_000, revenueFingerprint: "b".repeat(64), snapshotJson: JSON.stringify({ revenueEntryIds: ["r1", "r2"] }) }] }]);
    mocks.rootInvoiceFindMany.mockResolvedValue([{ id: source.id, invoiceNo: source.invoiceNo, siteId: source.siteId, periodStart: source.periodStart, periodEnd: source.periodEnd, version: source.version, issuedAt: new Date("2026-07-20T00:00:00.000Z"), subtotal: 100_000, revenueLinks: source.revenueLinks }]);
    mocks.rootRevenueFindMany.mockResolvedValue([{ id: "r1", currentInvoiceDocumentId: source.id }, { id: "r2", currentInvoiceDocumentId: null }]);
  });

  it("classifies a reclosed month with a changed current invoice as replacement", async () => {
    const result = await getInvoiceCandidates({ month: "2026-07", siteId: "" });

    expect(result.rows).toEqual([expect.objectContaining({
      targetKey: "replacement:site-1:2026-07",
      kind: "REPLACEMENT",
      cycleId: "cycle-2",
      sourceInvoiceId: source.id,
      sourceVersion: source.version,
      currentInvoices: [{ id: source.id, invoiceNo: source.invoiceNo, version: source.version }],
    })]);
  });

  it("previews every confirmed revenue in the source period and reports missing-contract warnings", async () => {
    const preview = await previewReplacementInvoice(source.id, settings);

    expect(preview.expectedRevenueEntryIds).toEqual(["r1", "r2"]);
    expect(preview.document).toMatchObject({ siteId: "site-1", subtotal: 300_000, periodStart: "2026-07-01", periodEnd: "2026-07-31" });
    expect(preview.warnings).toEqual([{ id: "contract-missing", contractNo: "C-NEW", title: "말일 추가 계약" }]);
  });

  it("atomically creates a new snapshot, supersedes the current document, and moves active revenue pointers", async () => {
    const document = await replaceInvoice(actor, source.id, { ...settings, expectedRevenueEntryIds: ["r1", "r2"] });

    expect(document).toMatchObject({ id: "invoice-new", invoiceNo: "I-NEW" });
    expect(mocks.invoiceUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [source.id] }, status: "ISSUED" },
      data: expect.objectContaining({ status: "SUPERSEDED", supersededByInvoiceId: "invoice-new" }),
    }));
    expect(mocks.revenueUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { currentInvoiceDocumentId: "invoice-new" } }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "REPLACE", entityId: "invoice-new" }));
  });

  it("rejects issue when the confirmed revenue set changed after preview", async () => {
    await expect(replaceInvoice(actor, source.id, { ...settings, expectedRevenueEntryIds: ["r1"] })).rejects.toMatchObject({ status: 409, code: "INVOICE_REPLACEMENT_CHANGED" });
    expect(mocks.invoiceCreate).not.toHaveBeenCalled();
  });

  it("rejects replacement when the latest close is identical to the issued document", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({ ...source, subtotal: 300_000, revenueLinks: [{ revenueEntryId: "r1" }, { revenueEntryId: "r2" }] });
    mocks.invoiceFindMany.mockResolvedValue([{
      id: source.id,
      invoiceNo: source.invoiceNo,
      version: source.version,
      subtotal: 300_000,
      revenueLinks: [{ revenueEntryId: "r1" }, { revenueEntryId: "r2" }],
    }]);

    await expect(previewReplacementInvoice(source.id, settings)).rejects.toMatchObject({
      status: 409,
      code: "INVOICE_REPLACEMENT_NOT_REQUIRED",
    });
  });

  it("compares the latest close with every active document in the same period", async () => {
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
        subtotal: 50_000,
        revenueLinks: [{ revenueEntryId: "r-extra" }],
      },
    ]);

    await expect(previewReplacementInvoice(source.id, settings)).resolves.toMatchObject({
      document: { subtotal: 300_000 },
    });
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
  return { targetKey: "new:cycle-1", kind: "NEW" as const, cycleId: "cycle-1", expectedCloseVersion: 2, expectedRevenueFingerprint: "a".repeat(64) };
}

function closeCycle() {
  return {
    id: "cycle-1",
    cycleNo: 1,
    revenueCount: 2,
    totalSalesAmount: 300_000,
    revenueFingerprint: "a".repeat(64),
    snapshotJson: JSON.stringify({ revenueEntryIds: ["r1", "r2"] }),
    invoiceDocument: null,
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
    site: { code: "S1", name: "강남 현장", address: "서울" },
    item: { name: title, specification: null },
  };
}
