import "server-only";

import { ContractLineBillingMethod, ContractStatus, Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import { recordSyncEvent } from "@/lib/events/bus";
import { enumerateMonths } from "@/lib/contracts/period";
import { assertMonthsOpen } from "@/lib/monthly-close/guard";
import { fingerprintLegacyBundle, legacyContractNo, parseLegacyPayload } from "@/lib/migration/legacy";
import type {
  LegacyMigrationBundle,
  LegacyMigrationHistory,
  LegacyMigrationPreview,
  MigrationIssue,
  MigrationPreviewRow,
} from "@/lib/migration/types";
import { normalizeAlias } from "@/lib/masters/normalize";
import { nextBusinessCode } from "@/lib/masters/sequence";

type ExistingItem = { id: string; name: string; unit: string; standardSalesPrice: number; standardCostPrice: number; aliases: Array<{ alias: string }> };
type ExistingSite = { id: string; name: string; aliases: Array<{ alias: string }> };
type MigrationState = {
  items: ExistingItem[];
  sites: ExistingSite[];
  contractNos: Set<string>;
  company: null | { businessRegistrationNo: string; companyName: string; representativeName: string; address: string; businessType: string; businessItem: string; phone: string };
  alreadyCommitted: boolean;
};

export async function previewLegacyMigration(raw: unknown, sourceName?: string | null) {
  const parsed = parseLegacyPayload(raw, sourceName);
  return previewNormalizedLegacyMigration(parsed.bundle, parsed.issues);
}

export async function previewNormalizedLegacyMigration(bundle: LegacyMigrationBundle, issues: MigrationIssue[] = []) {
  const fingerprint = fingerprintLegacyBundle(bundle);
  const [items, sites, contracts, company, batch] = await Promise.all([
    prisma.item.findMany({ include: { aliases: true } }),
    prisma.site.findMany({ include: { aliases: true } }),
    prisma.contract.findMany({ where: { contractNo: { in: bundle.contracts.map((contract) => legacyContractNo(contract.id)) } }, select: { contractNo: true } }),
    prisma.companySetting.findUnique({ where: { id: "default" } }),
    prisma.legacyMigrationBatch.findUnique({ where: { fingerprint }, select: { id: true } }),
  ]);
  return analyzeLegacyMigration(bundle, fingerprint, issues, {
    items,
    sites,
    contractNos: new Set(contracts.map((contract) => contract.contractNo)),
    company,
    alreadyCommitted: Boolean(batch),
  });
}

export function analyzeLegacyMigration(bundle: LegacyMigrationBundle, fingerprint: string, initialIssues: MigrationIssue[], state: MigrationState): LegacyMigrationPreview {
  const issues = [...initialIssues];
  if (!bundle.items.length && !bundle.contracts.length && !bundle.supplier) {
    issues.push({ severity: "ERROR", kind: "FILE", rowKey: "file", message: "이관할 품목·계약·공급자 데이터가 없습니다." });
  }
  if (state.alreadyCommitted) {
    issues.push({ severity: "ERROR", kind: "FILE", rowKey: "file", message: "같은 업무 데이터가 이미 이관되었습니다." });
  }
  const itemIdentity = masterIdentityMap(state.items);
  const siteIdentity = masterIdentityMap(state.sites);
  const duplicateItemNames = duplicateNormalizedValues(bundle.items.map((item) => ({ key: item.id, value: item.name })));
  for (const duplicate of duplicateItemNames) {
    issues.push({ severity: "ERROR", kind: "ITEM", rowKey: duplicate.key, message: "같은 품목명이 레거시 품목 여러 건에 중복되었습니다." });
  }
  const rows: MigrationPreviewRow[] = bundle.items.map((item) => {
    const duplicate = duplicateItemNames.some((candidate) => candidate.key === item.id);
    const existing = itemIdentity.get(normalizeAlias(item.name));
    if (duplicate) return row("ITEM", item.id, item.name, "ERROR", "중복 품목명을 먼저 정리해 주세요.");
    return existing
      ? row("ITEM", item.id, item.name, "REUSE", "기존 품목 " + existing.name + "을 사용합니다.", existing.id)
      : row("ITEM", item.id, item.name, "CREATE", "새 품목을 생성합니다.");
  });
  const siteNames = [...new Map(bundle.contracts.map((contract) => [normalizeAlias(contract.site), contract.site])).entries()];
  for (const [key, name] of siteNames) {
    const existing = siteIdentity.get(key);
    rows.push(existing
      ? row("SITE", key, name, "REUSE", "기존 현장 " + existing.name + "을 사용합니다.", existing.id)
      : row("SITE", key, name, "CREATE", "새 현장을 생성합니다."));
  }
  const itemRows = new Map(rows.filter((candidate) => candidate.kind === "ITEM").map((candidate) => [candidate.rowKey, candidate]));
  for (const contract of bundle.contracts) {
    const itemRow = itemRows.get(contract.itemId);
    const contractNo = legacyContractNo(contract.id);
    if (!itemRow || itemRow.action === "ERROR") {
      rows.push(row("CONTRACT", contract.id, contract.site + " / 품목 " + contract.itemId, "ERROR", "사용할 품목을 결정할 수 없습니다."));
    } else if (state.contractNos.has(contractNo)) {
      rows.push(row("CONTRACT", contract.id, contract.site + " / " + itemRow.label, "SKIP", "같은 레거시 계약 ID가 이미 이관되어 건너뜁니다."));
    } else {
      rows.push(row("CONTRACT", contract.id, contract.site + " / " + itemRow.label, "CREATE", "계약번호 " + contractNo + "로 생성합니다."));
    }
  }
  if (bundle.supplier) {
    const same = state.company != null && companyEquals(state.company, bundle.supplier);
    rows.push(same
      ? row("SUPPLIER", "supplier", bundle.supplier.companyName, "SKIP", "현재 공급자 정보와 같습니다.", "default")
      : state.company
        ? row("SUPPLIER", "supplier", bundle.supplier.companyName, "UPDATE", "현재 공급자 정보를 레거시 값으로 갱신합니다.", "default")
        : row("SUPPLIER", "supplier", bundle.supplier.companyName, "CREATE", "공급자 정보를 생성합니다."));
  }
  const rowErrors = rows.filter((candidate) => candidate.action === "ERROR").map((candidate): MigrationIssue => ({ severity: "ERROR", kind: candidate.kind, rowKey: candidate.rowKey, message: candidate.message }));
  const allIssues = deduplicateIssues([...issues, ...rowErrors]);
  const errorCount = allIssues.filter((issue) => issue.severity === "ERROR").length;
  const warningCount = allIssues.filter((issue) => issue.severity === "WARNING").length;
  const count = (kind: MigrationPreviewRow["kind"], action: MigrationPreviewRow["action"]) => rows.filter((candidate) => candidate.kind === kind && candidate.action === action).length;
  return {
    fingerprint,
    canCommit: errorCount === 0,
    alreadyCommitted: state.alreadyCommitted,
    normalizedBundle: bundle,
    issues: allIssues,
    rows,
    summary: {
      totalItems: bundle.items.length,
      totalSites: siteNames.length,
      totalContracts: bundle.contracts.length,
      createdItems: count("ITEM", "CREATE"),
      reusedItems: count("ITEM", "REUSE"),
      createdSites: count("SITE", "CREATE"),
      reusedSites: count("SITE", "REUSE"),
      createdContracts: count("CONTRACT", "CREATE"),
      skippedContracts: count("CONTRACT", "SKIP"),
      errorCount,
      warningCount,
    },
  };
}

export async function commitLegacyMigration(actor: SessionUser, raw: unknown, expectedFingerprint: string, sourceName?: string | null) {
  const parsed = parseLegacyPayload(raw, sourceName);
  const preview = await previewNormalizedLegacyMigration(parsed.bundle, parsed.issues);
  if (preview.fingerprint !== expectedFingerprint) throw new AuthError("미리보기 이후 이관 파일이 변경되었습니다. 다시 미리보기 해 주세요.", 409, "MIGRATION_FINGERPRINT_CHANGED");
  if (preview.alreadyCommitted) throw new AuthError("같은 업무 데이터가 이미 이관되었습니다.", 409, "MIGRATION_ALREADY_COMMITTED");
  if (!preview.canCommit) throw new AuthError("이관 오류를 먼저 해결해 주세요.", 400, "MIGRATION_PREVIEW_HAS_ERRORS");
  try {
    return await prisma.$transaction(async (tx) => {
      if (await tx.legacyMigrationBatch.findUnique({ where: { fingerprint: preview.fingerprint } })) {
        throw new AuthError("같은 업무 데이터가 이미 이관되었습니다.", 409, "MIGRATION_ALREADY_COMMITTED");
      }
      const currentItems = await tx.item.findMany({ include: { aliases: true } });
      const currentSites = await tx.site.findMany({ include: { aliases: true } });
      const itemIdentity = masterIdentityMap(currentItems);
      const siteIdentity = masterIdentityMap(currentSites);
      const contractNos = parsed.bundle.contracts.map((contract) => legacyContractNo(contract.id));
      const existingContracts = await tx.contract.findMany({
        where: { contractNo: { in: contractNos } },
        select: { contractNo: true },
      });
      const existingContractNos = new Set(existingContracts.map((contract) => contract.contractNo));
      await assertMonthsOpen(tx, parsed.bundle.contracts.flatMap((contract) => {
        if (existingContractNos.has(legacyContractNo(contract.id))) return [];
        const site = siteIdentity.get(normalizeAlias(contract.site));
        return site ? [{
          siteId: site.id,
          months: enumerateMonths(contract.startDate, contract.endDate),
        }] : [];
      }));
      const itemTargets = new Map<string, ExistingItem>();
      let createdItems = 0;
      let reusedItems = 0;
      for (const item of parsed.bundle.items) {
        let target = itemIdentity.get(normalizeAlias(item.name));
        if (target) {
          reusedItems += 1;
        } else {
          const created = await tx.item.create({ data: {
            code: await nextBusinessCode(tx, "item"), name: item.name, unit: item.unit,
            standardSalesPrice: item.salesPrice, standardCostPrice: item.costPrice, isActive: true,
            memo: "레거시 데이터 이관", createdById: actor.id, updatedById: actor.id,
          }, include: { aliases: true } });
          target = created;
          itemIdentity.set(normalizeAlias(created.name), created);
          createdItems += 1;
          await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "MIGRATE", entityType: "ITEM", entityId: created.id, after: created });
          await recordSyncEvent(tx, { type: "item.changed", entityId: created.id, actorId: actor.id });
        }
        itemTargets.set(item.id, target);
      }
      const siteTargets = new Map<string, ExistingSite>();
      let createdSites = 0;
      let reusedSites = 0;
      for (const siteName of [...new Map(parsed.bundle.contracts.map((contract) => [normalizeAlias(contract.site), contract.site])).values()]) {
        const key = normalizeAlias(siteName);
        let target = siteIdentity.get(key);
        if (target) {
          reusedSites += 1;
        } else {
          const created = await tx.site.create({ data: {
            code: await nextBusinessCode(tx, "site"), name: siteName, customerName: siteName, isActive: true,
            memo: "레거시 데이터 이관", createdById: actor.id, updatedById: actor.id,
          }, include: { aliases: true } });
          target = created;
          siteIdentity.set(key, created);
          createdSites += 1;
          await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "MIGRATE", entityType: "SITE", entityId: created.id, after: created });
          await recordSyncEvent(tx, { type: "site.changed", entityId: created.id, siteId: created.id, actorId: actor.id });
        }
        siteTargets.set(key, target);
      }
      let createdContracts = 0;
      let skippedContracts = 0;
      for (const contract of parsed.bundle.contracts) {
        const contractNo = legacyContractNo(contract.id);
        if (existingContractNos.has(contractNo)) {
          skippedContracts += 1;
          continue;
        }
        const legacyItem = parsed.bundle.items.find((item) => item.id === contract.itemId);
        const item = itemTargets.get(contract.itemId);
        const site = siteTargets.get(normalizeAlias(contract.site));
        if (!legacyItem || !item || !site) throw new AuthError("미리보기와 실제 마스터 상태가 달라졌습니다. 다시 시도해 주세요.", 409, "MIGRATION_MASTER_CHANGED");
        const salesOverridden = item.standardSalesPrice !== legacyItem.salesPrice;
        const costOverridden = item.standardCostPrice !== legacyItem.costPrice;
        const created = await tx.contract.create({ data: {
          contractNo,
          siteId: site.id,
          title: (contract.site + " " + item.name + " 레거시 계약").slice(0, 100),
          startDate: toDate(contract.startDate),
          endDate: toDate(contract.endDate),
          status: ContractStatus.ACTIVE,
          memo: "레거시 계약 ID: " + contract.id,
          createdById: actor.id,
          updatedById: actor.id,
          revenueGenerationQueue: { create: {} },
          lines: { create: {
            itemId: item.id, description: "레거시 데이터 이관", billingMethod: ContractLineBillingMethod.LEGACY_TOTAL,
            quantity: contract.quantity, unit: legacyItem.unit,
            standardSalesPriceSnapshot: item.standardSalesPrice, appliedSalesPrice: legacyItem.salesPrice,
            standardCostPriceSnapshot: item.standardCostPrice, appliedCostPrice: legacyItem.costPrice,
            priceOverrideReason: salesOverridden || costOverridden ? "레거시 이관 시점 단가" : null,
            priceOverriddenById: salesOverridden || costOverridden ? actor.id : null,
            priceOverriddenAt: salesOverridden || costOverridden ? new Date() : null,
            revenueStartDate: toDate(contract.startDate), revenueEndDate: toDate(contract.endDate),
            createdById: actor.id, updatedById: actor.id,
          } },
        } });
        createdContracts += 1;
        await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "MIGRATE", entityType: "CONTRACT", entityId: created.id, after: { id: created.id, contractNo, legacyId: contract.id } });
        await recordSyncEvent(tx, { type: "contract.changed", entityId: created.id, siteId: site.id, actorId: actor.id });
      }
      if (parsed.bundle.supplier) await migrateSupplier(tx, actor, parsed.bundle.supplier);
      const summary = { ...preview.summary, createdItems, reusedItems, createdSites, reusedSites, createdContracts, skippedContracts };
      const batch = await tx.legacyMigrationBatch.create({ data: {
        fingerprint: preview.fingerprint,
        sourceType: parsed.bundle.sourceType,
        sourceName: parsed.bundle.sourceName,
        totalItems: parsed.bundle.items.length,
        totalSites: summary.totalSites,
        totalContracts: parsed.bundle.contracts.length,
        createdItems, reusedItems, createdSites, reusedSites, createdContracts, skippedContracts,
        warningCount: preview.summary.warningCount,
        reportJson: JSON.stringify({ issues: preview.issues, rows: preview.rows, summary }),
        actorId: actor.id,
        actorName: actor.name,
      } });
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "MIGRATE", entityType: "LEGACY_MIGRATION", entityId: batch.id, after: { fingerprint: batch.fingerprint, summary } });
      return { batch: { ...batch, createdAt: batch.createdAt.toISOString() }, summary };
    }, { maxWait: 10_000, timeout: 120_000 });
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AuthError("다른 작업에서 같은 데이터 또는 이름을 먼저 등록했습니다. 다시 미리보기 해 주세요.", 409, "MIGRATION_CONFLICT");
    throw error;
  }
}

export async function listLegacyMigrationHistory(take = 10): Promise<LegacyMigrationHistory[]> {
  const rows = await prisma.legacyMigrationBatch.findMany({ orderBy: { createdAt: "desc" }, take });
  return rows.map((batch) => ({ id: batch.id, fingerprint: batch.fingerprint, sourceType: batch.sourceType, sourceName: batch.sourceName, totalItems: batch.totalItems, totalSites: batch.totalSites, totalContracts: batch.totalContracts, createdContracts: batch.createdContracts, warningCount: batch.warningCount, actorName: batch.actorName, createdAt: batch.createdAt.toISOString() }));
}

async function migrateSupplier(tx: Prisma.TransactionClient, actor: SessionUser, supplier: NonNullable<LegacyMigrationBundle["supplier"]>) {
  const current = await tx.companySetting.findUnique({ where: { id: "default" } });
  const data = { ...supplier, defaultMessage: "아래와 같이 공급합니다.", updatedById: actor.id };
  if (current) {
    if (companyEquals(current, supplier)) return;
    const saved = await tx.companySetting.update({ where: { id: "default" }, data: { ...data, version: { increment: 1 } } });
    await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "MIGRATE", entityType: "COMPANY_SETTING", entityId: saved.id, before: current, after: saved });
  } else {
    const saved = await tx.companySetting.create({ data: { id: "default", ...data, createdById: actor.id } });
    await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "MIGRATE", entityType: "COMPANY_SETTING", entityId: saved.id, after: saved });
  }
}

function masterIdentityMap<T extends { id: string; name: string; aliases: Array<{ alias: string }> }>(masters: T[]) {
  const result = new Map<string, T>();
  for (const master of masters) for (const value of [master.name, ...master.aliases.map((alias) => alias.alias)]) result.set(normalizeAlias(value), master);
  return result;
}
function duplicateNormalizedValues(values: Array<{ key: string; value: string }>) { const counts = new Map<string, number>(); for (const item of values) { const key = normalizeAlias(item.value); counts.set(key, (counts.get(key) ?? 0) + 1); } return values.filter((item) => (counts.get(normalizeAlias(item.value)) ?? 0) > 1); }
function row(kind: MigrationPreviewRow["kind"], rowKey: string, label: string, action: MigrationPreviewRow["action"], message: string, targetId: string | null = null): MigrationPreviewRow { return { kind, rowKey, label, action, message, targetId }; }
function deduplicateIssues(issues: MigrationIssue[]) { const seen = new Set<string>(); return issues.filter((issue) => { const key = [issue.severity, issue.kind, issue.rowKey, issue.message].join("|"); if (seen.has(key)) return false; seen.add(key); return true; }); }
function companyEquals(left: NonNullable<MigrationState["company"]>, right: NonNullable<LegacyMigrationBundle["supplier"]>) { return left.businessRegistrationNo === right.businessRegistrationNo && left.companyName === right.companyName && left.representativeName === right.representativeName && left.address === right.address && left.businessType === right.businessType && left.businessItem === right.businessItem && left.phone === right.phone; }
function toDate(value: string) { return new Date(value + "T00:00:00.000Z"); }
