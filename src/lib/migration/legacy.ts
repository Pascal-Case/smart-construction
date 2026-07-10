import { createHash } from "node:crypto";
import { z } from "zod";

import type { LegacyMigrationBundle, LegacySupplier, MigrationIssue } from "@/lib/migration/types";

const legacyId = z.union([z.string(), z.number()]).transform((value) => String(value).trim()).pipe(z.string().min(1));
const legacyMoney = z.coerce.number().int().min(0).max(2_000_000_000);
const legacyItemSchema = z.object({
  id: legacyId,
  name: z.string().trim().min(1).max(100),
  salesPrice: legacyMoney.default(0),
  costPrice: legacyMoney.default(0),
  unit: z.string().trim().min(1).max(30).default("EA"),
});
const legacyContractSchema = z.object({
  id: legacyId,
  site: z.string().trim().min(1).max(100),
  itemId: legacyId,
  qty: z.coerce.number().positive().max(1_000_000),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
}).refine((value) => value.startDate <= value.endDate, { message: "종료일은 시작일보다 빠를 수 없습니다.", path: ["endDate"] });
const legacySupplierSchema = z.object({
  regNo: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(100),
  owner: z.string().trim().min(1).max(50),
  address: z.string().trim().min(1).max(300),
  type: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(50).optional().default("미입력"),
});

export function parseLegacyPayload(raw: unknown, sourceName?: string | null) {
  const issues: MigrationIssue[] = [];
  const payload = unwrapPayload(raw, issues);
  const items = parseRows(payload.items, legacyItemSchema, "ITEM", issues);
  const contracts = parseRows(payload.contracts, legacyContractSchema, "CONTRACT", issues).map((row) => ({
    id: row.id,
    site: row.site,
    itemId: row.itemId,
    quantity: row.qty,
    startDate: row.startDate,
    endDate: row.endDate,
  }));
  duplicateIssues(items.map((row) => row.id), "ITEM", issues);
  duplicateIssues(contracts.map((row) => row.id), "CONTRACT", issues);
  const itemIds = new Set(items.map((item) => item.id));
  for (const contract of contracts) {
    if (!itemIds.has(contract.itemId)) issues.push({ severity: "ERROR", kind: "CONTRACT", rowKey: contract.id, message: "참조하는 레거시 품목 ID " + contract.itemId + "를 찾을 수 없습니다." });
  }
  let supplier: LegacySupplier | null = null;
  if (payload.supplier != null) {
    const result = legacySupplierSchema.safeParse(payload.supplier);
    if (result.success) {
      supplier = {
        businessRegistrationNo: result.data.regNo,
        companyName: result.data.name,
        representativeName: result.data.owner,
        address: result.data.address,
        businessType: result.data.type,
        businessItem: result.data.category,
        phone: result.data.phone || "미입력",
      };
    } else {
      issues.push({ severity: "WARNING", kind: "SUPPLIER", rowKey: "supplier", message: "공급자 정보가 불완전해 이관에서 제외합니다: " + issueMessage(result.error) });
    }
  }
  const sourceType = payload.sourceType === "EXCEL" ? "EXCEL" : "LOCAL_STORAGE";
  const bundle: LegacyMigrationBundle = {
    format: "smart-construction-legacy-v1",
    exportedAt: typeof payload.exportedAt === "string" ? payload.exportedAt : null,
    sourceType,
    sourceName: sourceName?.trim() || (typeof payload.sourceName === "string" ? payload.sourceName.trim() || null : null),
    items,
    contracts,
    supplier,
  };
  return { bundle, issues };
}

export function fingerprintLegacyBundle(bundle: LegacyMigrationBundle) {
  const canonical = { sourceType: bundle.sourceType, items: bundle.items, contracts: bundle.contracts, supplier: bundle.supplier };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function legacyContractNo(legacyIdValue: string) {
  return "LEGACY-" + createHash("sha256").update("contract:" + legacyIdValue).digest("hex").slice(0, 12).toUpperCase();
}

function unwrapPayload(raw: unknown, issues: MigrationIssue[]) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    issues.push({ severity: "ERROR", kind: "FILE", rowKey: "file", message: "JSON 최상위 값은 객체여야 합니다." });
    return { items: [], contracts: [], supplier: null, sourceType: "LOCAL_STORAGE", exportedAt: null, sourceName: null };
  }
  const value = raw as Record<string, unknown>;
  if ("scs_master_items_v15_local" in value || "scs_master_contracts_v15_local" in value) {
    return {
      items: parseStorageValue(value.scs_master_items_v15_local, "품목", issues),
      contracts: parseStorageValue(value.scs_master_contracts_v15_local, "계약", issues),
      supplier: parseStorageValue(value.scs_master_supplier_v15_local, "공급자", issues, null),
      sourceType: "LOCAL_STORAGE",
      exportedAt: value.exportedAt,
      sourceName: value.sourceName,
    };
  }
  return {
    items: Array.isArray(value.items) ? value.items : [],
    contracts: Array.isArray(value.contracts) ? value.contracts.map(normalizeContractInput) : [],
    supplier: normalizeSupplierInput(value.supplier),
    sourceType: value.sourceType,
    exportedAt: value.exportedAt,
    sourceName: value.sourceName,
  };
}

function parseStorageValue(value: unknown, label: string, issues: MigrationIssue[], fallback: unknown[] | null = []) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { issues.push({ severity: "ERROR", kind: "FILE", rowKey: "file", message: label + " localStorage JSON을 해석할 수 없습니다." }); return fallback; }
}
function parseRows<T>(raw: unknown, schema: z.ZodType<T>, kind: "ITEM" | "CONTRACT", issues: MigrationIssue[]) {
  if (!Array.isArray(raw)) { issues.push({ severity: "ERROR", kind: "FILE", rowKey: "file", message: kind === "ITEM" ? "품목 배열이 없습니다." : "계약 배열이 없습니다." }); return []; }
  return raw.flatMap((row, index) => { const result = schema.safeParse(row); if (result.success) return [result.data]; issues.push({ severity: "ERROR", kind, rowKey: String(index + 1), message: issueMessage(result.error) }); return []; });
}
function duplicateIssues(ids: string[], kind: "ITEM" | "CONTRACT", issues: MigrationIssue[]) { const seen = new Set<string>(); for (const id of ids) { if (seen.has(id)) issues.push({ severity: "ERROR", kind, rowKey: id, message: "레거시 ID가 중복되었습니다." }); seen.add(id); } }
function issueMessage(error: z.ZodError) { return error.issues.map((issue) => (issue.path.length ? issue.path.join(".") + ": " : "") + issue.message).join(", "); }
function normalizeContractInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const row = value as Record<string, unknown>;
  return "quantity" in row && !("qty" in row) ? { ...row, qty: row.quantity } : row;
}
function normalizeSupplierInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value ?? null;
  const supplier = value as Record<string, unknown>;
  if (!("businessRegistrationNo" in supplier)) return supplier;
  return {
    regNo: supplier.businessRegistrationNo,
    name: supplier.companyName,
    owner: supplier.representativeName,
    address: supplier.address,
    type: supplier.businessType,
    category: supplier.businessItem,
    phone: supplier.phone,
  };
}
