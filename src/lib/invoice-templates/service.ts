import "server-only";

import { Prisma, UserRole, type InvoiceTemplate } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import { cloneDefaultInvoiceTemplateConfig, INVOICE_TEMPLATE_SYSTEM_ID, type InvoiceTemplateView } from "@/lib/invoice-templates/config";
import {
  decodeInvoiceTemplateConfig,
  invoiceTemplateConfigSchema,
  normalizedTemplateName,
  type InvoiceTemplateCreateInput,
  type InvoiceTemplateUpdateInput,
} from "@/lib/invoice-templates/schemas";

const SYSTEM_TEMPLATE_NAME = "시스템 기본";

export type ResolvedInvoiceTemplate = InvoiceTemplateView & { configJson: string };

export async function listInvoiceTemplates(): Promise<InvoiceTemplateView[]> {
  const rows = await prisma.invoiceTemplate.findMany({ orderBy: [{ name: "asc" }, { updatedAt: "desc" }] });
  return [systemTemplate(), ...rows.map(toView)];
}

export async function resolveInvoiceTemplate(id?: string | null, expectedVersion?: number | null, tx?: Prisma.TransactionClient): Promise<ResolvedInvoiceTemplate> {
  if (!id || id === INVOICE_TEMPLATE_SYSTEM_ID) {
    if (expectedVersion != null && expectedVersion !== 1) throw changedTemplate();
    const view = systemTemplate();
    return { ...view, configJson: JSON.stringify(view.config) };
  }
  const row = await (tx ?? prisma).invoiceTemplate.findUnique({ where: { id } });
  if (!row) throw new AuthError("선택한 거래명세표 템플릿을 찾을 수 없습니다.", 404, "INVOICE_TEMPLATE_NOT_FOUND");
  if (expectedVersion != null && row.version !== expectedVersion) throw changedTemplate();
  return { ...toView(row), configJson: row.configJson };
}

export async function createInvoiceTemplate(actor: SessionUser, input: InvoiceTemplateCreateInput) {
  assertCanEdit(actor);
  const config = invoiceTemplateConfigSchema.parse(input.config);
  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.invoiceTemplate.create({ data: {
        name: input.name.trim(),
        normalizedName: normalizedTemplateName(input.name),
        configJson: JSON.stringify(config),
        createdById: actor.id,
        updatedById: actor.id,
      } });
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "CREATE", entityType: "INVOICE_TEMPLATE", entityId: created.id, after: created });
      return toView(created);
    });
  } catch (error) {
    throw mapTemplateError(error);
  }
}

export async function updateInvoiceTemplate(actor: SessionUser, id: string, input: InvoiceTemplateUpdateInput) {
  assertCanEdit(actor);
  assertMutable(id);
  const config = invoiceTemplateConfigSchema.parse(input.config);
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.invoiceTemplate.findUnique({ where: { id } });
      if (!current) throw new AuthError("거래명세표 템플릿을 찾을 수 없습니다.", 404, "INVOICE_TEMPLATE_NOT_FOUND");
      const updated = await tx.invoiceTemplate.updateMany({ where: { id, version: input.version }, data: {
        name: input.name.trim(),
        normalizedName: normalizedTemplateName(input.name),
        configJson: JSON.stringify(config),
        updatedById: actor.id,
        version: { increment: 1 },
      } });
      if (!updated.count) throw new AuthError("다른 사용자가 템플릿을 먼저 수정했습니다. 다시 불러와 주세요.", 409, "VERSION_CONFLICT");
      const saved = await tx.invoiceTemplate.findUniqueOrThrow({ where: { id } });
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "UPDATE", entityType: "INVOICE_TEMPLATE", entityId: id, before: current, after: saved });
      return toView(saved);
    });
  } catch (error) {
    throw mapTemplateError(error);
  }
}

export async function deleteInvoiceTemplate(actor: SessionUser, id: string, version: number) {
  assertCanEdit(actor);
  assertMutable(id);
  return prisma.$transaction(async (tx) => {
    const current = await tx.invoiceTemplate.findUnique({ where: { id } });
    if (!current) throw new AuthError("거래명세표 템플릿을 찾을 수 없습니다.", 404, "INVOICE_TEMPLATE_NOT_FOUND");
    const deleted = await tx.invoiceTemplate.deleteMany({ where: { id, version } });
    if (!deleted.count) throw new AuthError("다른 사용자가 템플릿을 먼저 수정했습니다. 다시 불러와 주세요.", 409, "VERSION_CONFLICT");
    await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "DELETE", entityType: "INVOICE_TEMPLATE", entityId: id, before: current });
    return { id };
  });
}

function systemTemplate(): InvoiceTemplateView {
  return { id: INVOICE_TEMPLATE_SYSTEM_ID, name: SYSTEM_TEMPLATE_NAME, isSystem: true, config: cloneDefaultInvoiceTemplateConfig(), version: 1, updatedAt: null };
}

function toView(row: InvoiceTemplate): InvoiceTemplateView {
  return { id: row.id, name: row.name, isSystem: false, config: decodeInvoiceTemplateConfig(row.configJson), version: row.version, updatedAt: row.updatedAt.toISOString() };
}

function assertCanEdit(actor: SessionUser) {
  if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.MANAGER) throw new AuthError("이 작업을 수행할 권한이 없습니다.", 403, "FORBIDDEN");
}

function assertMutable(id: string) {
  if (id === INVOICE_TEMPLATE_SYSTEM_ID) throw new AuthError("시스템 기본 템플릿은 수정하거나 삭제할 수 없습니다.", 400, "SYSTEM_TEMPLATE_IMMUTABLE");
}

function changedTemplate() {
  return new AuthError("미리보기 이후 템플릿이 변경되었습니다. 다시 미리보기해 주세요.", 409, "INVOICE_TEMPLATE_CHANGED");
}

function mapTemplateError(error: unknown): Error {
  if (error instanceof AuthError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return new AuthError("같은 이름의 거래명세표 템플릿이 이미 있습니다.", 409, "INVOICE_TEMPLATE_NAME_CONFLICT");
  return error instanceof Error ? error : new Error("거래명세표 템플릿을 저장하지 못했습니다.");
}
