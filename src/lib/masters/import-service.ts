import "server-only";

import { ImportSource, MasterType, Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import { cleanAliases, normalizeAlias, normalizeCode } from "@/lib/masters/normalize";

type ParsedRow = { rowNumber: number; values: Record<string, unknown> };
type Status = "CREATE" | "UPDATE" | "UNCHANGED" | "ERROR";
export type ImportPreviewRow = {
  rowNumber: number; status: Status; code: string; name: string; errors: string[];
  data?: Record<string, unknown>; existingId?: string; version?: number; before?: Record<string, unknown>;
};

export async function previewSiteImport(rows: ParsedRow[]) {
  const existing = await prisma.site.findMany({ include: { aliases: true } });
  const byCode = new Map(existing.map((row) => [row.code, row]));
  const identities = identityOwners(existing);
  const seenCodes = new Set<string>();
  return summarize(rows.map((row) => {
    const parsed = parseSite(row); const errors = [...parsed.errors];
    if (seenCodes.has(parsed.code)) errors.push("파일 안에서 현장코드가 중복되었습니다.");
    seenCodes.add(parsed.code);
    const current = byCode.get(parsed.code);
    checkIdentities(parsed.name, parsed.aliases ?? [], current?.id, identities, errors);
    if (errors.length) return errorRow(row, parsed, errors);
    reserveIdentities(parsed.name, parsed.aliases ?? [], current?.id ?? `new:${parsed.code}`, identities);
    const data = mergeSite(parsed, current);
    const before = current ? siteSnapshot(current) : undefined;
    return previewRow(row.rowNumber, parsed.code, parsed.name, data, before, current?.id, current?.version);
  }));
}

export async function previewItemImport(rows: ParsedRow[]) {
  const existing = await prisma.item.findMany({ include: { aliases: true } });
  const byCode = new Map(existing.map((row) => [row.code, row]));
  const identities = identityOwners(existing);
  const seenCodes = new Set<string>();
  return summarize(rows.map((row) => {
    const parsed = parseItem(row); const errors = [...parsed.errors];
    if (seenCodes.has(parsed.code)) errors.push("파일 안에서 품목코드가 중복되었습니다.");
    seenCodes.add(parsed.code);
    const current = byCode.get(parsed.code);
    checkIdentities(parsed.name, parsed.aliases ?? [], current?.id, identities, errors);
    if (errors.length) return errorRow(row, parsed, errors);
    reserveIdentities(parsed.name, parsed.aliases ?? [], current?.id ?? `new:${parsed.code}`, identities);
    const data = mergeItem(parsed, current);
    const before = current ? itemSnapshot(current) : undefined;
    return previewRow(row.rowNumber, parsed.code, parsed.name, data, before, current?.id, current?.version);
  }));
}

export async function commitMasterImport(
  actor: SessionUser,
  type: "site" | "item",
  source: "file" | "paste",
  sourceName: string | null,
  rows: ParsedRow[],
  mode: "validOnly" | "allOrNothing",
) {
  try {
    const preview = type === "site" ? await previewSiteImport(rows) : await previewItemImport(rows);
    if (mode === "allOrNothing" && preview.counts.error > 0) throw new AuthError("오류 행이 있어 전체 저장을 중단했습니다.", 400, "IMPORT_HAS_ERRORS");
    const valid = preview.rows.filter((row) => row.status === "CREATE" || row.status === "UPDATE");
    await prisma.$transaction(async (tx) => {
      for (const row of valid) {
        if (type === "site") await saveSiteImportRow(tx, actor, row);
        else await saveItemImportRow(tx, actor, row);
      }
      const batch = await tx.importBatch.create({ data: {
        masterType: type === "site" ? MasterType.SITE : MasterType.ITEM,
        source: source === "file" ? ImportSource.FILE : ImportSource.PASTE,
        sourceName, totalRows: preview.rows.length, createdRows: preview.counts.create, updatedRows: preview.counts.update,
        unchangedRows: preview.counts.unchanged, errorRows: preview.counts.error, actorId: actor.id, actorName: actor.name,
      } });
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "IMPORT", entityType: type === "site" ? "SITE" : "ITEM", entityId: batch.id, after: preview.counts });
    });
    return preview.counts;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AuthError("저장 중 코드, 이름 또는 별칭 충돌이 발생했습니다. 미리보기를 다시 실행해 주세요.", 409, "IMPORT_CONFLICT");
    }
    throw error;
  }
}

function parseSite(row: ParsedRow) {
  const code = normalizeCode(text(row.values["현장코드"])); const name = text(row.values["현장명"]); const errors: string[] = [];
  if (!code) errors.push("현장코드는 필수입니다."); if (!name) errors.push("현장명은 필수입니다.");
  validateCode(code, errors); validateLength(name, 100, "현장명", errors);
  const startDate = dateText(row.values["시작일"], "시작일", errors); const endDate = dateText(row.values["종료일"], "종료일", errors);
  if (startDate && endDate && startDate > endDate) errors.push("종료일은 시작일보다 빠를 수 없습니다.");
  const aliases = aliasList(row.values["별칭"]); validateAliases(aliases, errors);
  const customerName = optionalText(row.values["거래처"]); const address = optionalText(row.values["주소"]); const managerName = optionalText(row.values["담당자"]); const managerContact = optionalText(row.values["연락처"]); const memo = optionalText(row.values["메모"]);
  for (const [value, label] of [[customerName, "거래처"], [address, "주소"], [managerName, "담당자"], [managerContact, "연락처"], [memo, "메모"]] as const) validateLength(value, 500, label, errors);
  return { code, name, errors, aliases, customerName, address, managerName, managerContact, startDate, endDate, isActive: booleanValue(row.values["사용여부"], errors), memo };
}

function parseItem(row: ParsedRow) {
  const code = normalizeCode(text(row.values["품목코드"])); const name = text(row.values["품목명"]); const unit = text(row.values["단위"]); const errors: string[] = [];
  if (!code) errors.push("품목코드는 필수입니다."); if (!name) errors.push("품목명은 필수입니다."); if (!unit) errors.push("단위는 필수입니다.");
  validateCode(code, errors); validateLength(name, 100, "품목명", errors); validateLength(unit, 30, "단위", errors);
  const aliases = aliasList(row.values["별칭"]); validateAliases(aliases, errors); const memo = optionalText(row.values["메모"]); validateLength(memo, 500, "메모", errors);
  return { code, name, unit, errors, aliases, standardSalesPrice: moneyValue(row.values["표준매출단가"], "표준매출단가", errors), standardCostPrice: moneyValue(row.values["표준매입단가"], "표준매입단가", errors), isActive: booleanValue(row.values["사용여부"], errors), memo };
}

function mergeSite(row: ReturnType<typeof parseSite>, current?: { customerName: string | null; address: string | null; managerName: string | null; managerContact: string | null; startDate: Date | null; endDate: Date | null; isActive: boolean; memo: string | null; aliases: Array<{ alias: string }> }) {
  return { code: row.code, name: row.name, customerName: row.customerName ?? current?.customerName ?? null, address: row.address ?? current?.address ?? null, managerName: row.managerName ?? current?.managerName ?? null, managerContact: row.managerContact ?? current?.managerContact ?? null, startDate: row.startDate ?? current?.startDate?.toISOString().slice(0, 10) ?? null, endDate: row.endDate ?? current?.endDate?.toISOString().slice(0, 10) ?? null, isActive: row.isActive ?? current?.isActive ?? true, memo: row.memo ?? current?.memo ?? null, aliases: row.aliases ?? current?.aliases.map((alias) => alias.alias) ?? [] };
}
function mergeItem(row: ReturnType<typeof parseItem>, current?: { standardSalesPrice: number; standardCostPrice: number; isActive: boolean; memo: string | null; aliases: Array<{ alias: string }> }) {
  return { code: row.code, name: row.name, unit: row.unit, standardSalesPrice: row.standardSalesPrice ?? current?.standardSalesPrice ?? 0, standardCostPrice: row.standardCostPrice ?? current?.standardCostPrice ?? 0, isActive: row.isActive ?? current?.isActive ?? true, memo: row.memo ?? current?.memo ?? null, aliases: row.aliases ?? current?.aliases.map((alias) => alias.alias) ?? [] };
}

async function saveSiteImportRow(tx: Prisma.TransactionClient, actor: SessionUser, row: ImportPreviewRow) {
  const data = row.data as ReturnType<typeof mergeSite>; const { aliases, ...masterData } = data;
  const aliasData = cleanAliases(aliases, data.name);
  if (row.status === "CREATE") {
    const created = await tx.site.create({ data: { ...masterData, startDate: dbDate(data.startDate), endDate: dbDate(data.endDate), createdById: actor.id, updatedById: actor.id } });
    if (aliasData.length) await tx.siteAlias.createMany({ data: aliasData.map((alias) => ({ ...alias, siteId: created.id })) });
    await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "CREATE", entityType: "SITE", entityId: created.id, after: data });
  } else {
    const updated = await tx.site.updateMany({ where: { id: row.existingId, version: row.version }, data: { ...masterData, startDate: dbDate(data.startDate), endDate: dbDate(data.endDate), updatedById: actor.id, version: { increment: 1 } } });
    if (!updated.count) throw new AuthError(`행 ${row.rowNumber}: 다른 사용자가 먼저 수정했습니다.`, 409, "VERSION_CONFLICT");
    await tx.siteAlias.deleteMany({ where: { siteId: row.existingId } });
    if (aliasData.length) await tx.siteAlias.createMany({ data: aliasData.map((alias) => ({ ...alias, siteId: row.existingId! })) });
    await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "UPDATE", entityType: "SITE", entityId: row.existingId, before: row.before, after: data });
  }
}

async function saveItemImportRow(tx: Prisma.TransactionClient, actor: SessionUser, row: ImportPreviewRow) {
  const data = row.data as ReturnType<typeof mergeItem>; const { aliases, ...masterData } = data;
  const aliasData = cleanAliases(aliases, data.name);
  if (row.status === "CREATE") {
    const created = await tx.item.create({ data: { ...masterData, createdById: actor.id, updatedById: actor.id } });
    if (aliasData.length) await tx.itemAlias.createMany({ data: aliasData.map((alias) => ({ ...alias, itemId: created.id })) });
    await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "CREATE", entityType: "ITEM", entityId: created.id, after: data });
  } else {
    const updated = await tx.item.updateMany({ where: { id: row.existingId, version: row.version }, data: { ...masterData, updatedById: actor.id, version: { increment: 1 } } });
    if (!updated.count) throw new AuthError(`행 ${row.rowNumber}: 다른 사용자가 먼저 수정했습니다.`, 409, "VERSION_CONFLICT");
    await tx.itemAlias.deleteMany({ where: { itemId: row.existingId } });
    if (aliasData.length) await tx.itemAlias.createMany({ data: aliasData.map((alias) => ({ ...alias, itemId: row.existingId! })) });
    await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "UPDATE", entityType: "ITEM", entityId: row.existingId, before: row.before, after: data });
  }
}

function identityOwners(rows: Array<{ id: string; name: string; aliases: Array<{ normalizedAlias: string }> }>) { const map = new Map<string, string>(); for (const row of rows) { map.set(normalizeAlias(row.name), row.id); row.aliases.forEach((alias) => map.set(alias.normalizedAlias, row.id)); } return map; }
function checkIdentities(name: string, aliases: string[], existingId: string | undefined, owners: Map<string, string>, errors: string[]) { for (const key of [normalizeAlias(name), ...cleanAliases(aliases, name).map((row) => row.normalizedAlias)]) { const owner = owners.get(key); if (owner && owner !== existingId) { errors.push("동일한 이름 또는 별칭을 다른 코드가 사용 중입니다."); break; } } }
function reserveIdentities(name: string, aliases: string[], owner: string, owners: Map<string, string>) { owners.set(normalizeAlias(name), owner); for (const alias of cleanAliases(aliases, name)) owners.set(alias.normalizedAlias, owner); }
function previewRow(rowNumber: number, code: string, name: string, data: Record<string, unknown>, before?: Record<string, unknown>, existingId?: string, version?: number): ImportPreviewRow { const status: Status = !existingId ? "CREATE" : JSON.stringify(data) === JSON.stringify(before) ? "UNCHANGED" : "UPDATE"; return { rowNumber, status, code, name, errors: [], data, before, existingId, version }; }
function errorRow(row: ParsedRow, parsed: { code: string; name: string }, errors: string[]): ImportPreviewRow { return { rowNumber: row.rowNumber, status: "ERROR", code: parsed.code, name: parsed.name, errors }; }
function summarize(rows: ImportPreviewRow[]) { return { rows, counts: { total: rows.length, create: rows.filter((r) => r.status === "CREATE").length, update: rows.filter((r) => r.status === "UPDATE").length, unchanged: rows.filter((r) => r.status === "UNCHANGED").length, error: rows.filter((r) => r.status === "ERROR").length } }; }
function text(value: unknown) { return String(value ?? "").normalize("NFKC").trim(); }
function optionalText(value: unknown) { const result = text(value); return result || undefined; }
function aliasList(value: unknown) { const raw = text(value); return raw ? raw.split(/[|,;]/).map((item) => item.trim()).filter(Boolean) : undefined; }
function dateText(value: unknown, label: string, errors: string[]) { const result = text(value); if (!result) return undefined; if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(new Date(`${result}T00:00:00Z`).getTime())) errors.push(`${label}은 YYYY-MM-DD 형식이어야 합니다.`); return result; }
function booleanValue(value: unknown, errors: string[]) { const result = text(value).toUpperCase(); if (!result) return undefined; if (["Y", "YES", "TRUE", "1", "사용"].includes(result)) return true; if (["N", "NO", "FALSE", "0", "미사용"].includes(result)) return false; errors.push("사용여부는 Y 또는 N이어야 합니다."); return undefined; }
function moneyValue(value: unknown, label: string, errors: string[]) { const result = text(value).replaceAll(",", ""); if (!result) return undefined; const number = Number(result); if (!Number.isInteger(number) || number < 0 || number > 2_000_000_000) errors.push(`${label}는 0 이상의 원 단위 정수여야 합니다.`); return number; }
function validateCode(value: string, errors: string[]) { if (value && !/^[A-Z0-9._-]{1,30}$/.test(value)) errors.push("코드는 30자 이하의 영문, 숫자, . _ -만 사용할 수 있습니다."); }
function validateLength(value: string | undefined, max: number, label: string, errors: string[]) { if (value && value.length > max) errors.push(`${label}은 ${max}자 이하여야 합니다.`); }
function validateAliases(values: string[] | undefined, errors: string[]) { if (!values) return; if (values.length > 20) errors.push("별칭은 최대 20개까지 입력할 수 있습니다."); if (values.some((value) => value.length > 80)) errors.push("별칭은 각각 80자 이하여야 합니다."); }
function dbDate(value: string | null) { return value ? new Date(`${value}T00:00:00.000Z`) : null; }
function siteSnapshot(row: { code: string; name: string; customerName: string | null; address: string | null; managerName: string | null; managerContact: string | null; startDate: Date | null; endDate: Date | null; isActive: boolean; memo: string | null; aliases: Array<{ alias: string }> }) { return { code: row.code, name: row.name, customerName: row.customerName, address: row.address, managerName: row.managerName, managerContact: row.managerContact, startDate: row.startDate?.toISOString().slice(0, 10) ?? null, endDate: row.endDate?.toISOString().slice(0, 10) ?? null, isActive: row.isActive, memo: row.memo, aliases: row.aliases.map((a) => a.alias) }; }
function itemSnapshot(row: { code: string; name: string; unit: string; standardSalesPrice: number; standardCostPrice: number; isActive: boolean; memo: string | null; aliases: Array<{ alias: string }> }) { return { code: row.code, name: row.name, unit: row.unit, standardSalesPrice: row.standardSalesPrice, standardCostPrice: row.standardCostPrice, isActive: row.isActive, memo: row.memo, aliases: row.aliases.map((a) => a.alias) }; }
