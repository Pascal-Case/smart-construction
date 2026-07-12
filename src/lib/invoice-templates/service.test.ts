import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole } from "@/generated/prisma/client";
import { DEFAULT_INVOICE_TEMPLATE_CONFIG, INVOICE_TEMPLATE_SYSTEM_ID } from "@/lib/invoice-templates/config";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  transaction: vi.fn(),
  create: vi.fn(),
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/record", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    invoiceTemplate: { findMany: mocks.findMany },
    $transaction: mocks.transaction,
  },
}));

import { createInvoiceTemplate, listInvoiceTemplates, updateInvoiceTemplate } from "@/lib/invoice-templates/service";

const editor = { id: "u1", loginId: "manager", name: "매니저", role: UserRole.MANAGER, isActive: true, version: 1 };
const viewer = { ...editor, id: "u2", loginId: "viewer", name: "조회", role: UserRole.VIEWER };

describe("invoice template service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback({ invoiceTemplate: { create: mocks.create, findUnique: mocks.findUnique, findUniqueOrThrow: mocks.findUniqueOrThrow, updateMany: mocks.updateMany, deleteMany: mocks.deleteMany } }));
  });

  it("lists the immutable system template before shared templates", async () => {
    mocks.findMany.mockResolvedValue([{ id: "custom", name: "BI Blue", normalizedName: "bi blue", configJson: JSON.stringify(DEFAULT_INVOICE_TEMPLATE_CONFIG), version: 2, createdById: "u1", updatedById: "u1", createdAt: new Date("2026-07-01"), updatedAt: new Date("2026-07-02") }]);
    const rows = await listInvoiceTemplates();
    expect(rows[0]).toMatchObject({ id: INVOICE_TEMPLATE_SYSTEM_ID, isSystem: true, version: 1 });
    expect(rows[1]).toMatchObject({ id: "custom", isSystem: false, name: "BI Blue", version: 2, config: DEFAULT_INVOICE_TEMPLATE_CONFIG });
  });

  it("rejects viewer mutations and system-template updates", async () => {
    await expect(createInvoiceTemplate(viewer, { name: "Viewer", config: DEFAULT_INVOICE_TEMPLATE_CONFIG })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    await expect(updateInvoiceTemplate(editor, INVOICE_TEMPLATE_SYSTEM_ID, { name: "Default", config: DEFAULT_INVOICE_TEMPLATE_CONFIG, version: 1 })).rejects.toMatchObject({ status: 400, code: "SYSTEM_TEMPLATE_IMMUTABLE" });
  });

  it("rejects a stale shared-template update", async () => {
    mocks.findUnique.mockResolvedValue({ id: "custom", name: "Old", normalizedName: "old", configJson: JSON.stringify(DEFAULT_INVOICE_TEMPLATE_CONFIG), version: 2 });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateInvoiceTemplate(editor, "custom", { name: "New", config: DEFAULT_INVOICE_TEMPLATE_CONFIG, version: 1 })).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
  });
});
