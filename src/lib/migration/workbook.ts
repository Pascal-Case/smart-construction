import { createHash } from "node:crypto";
import ExcelJS from "exceljs";

import { parseLegacyPayload } from "@/lib/migration/legacy";
import type { MigrationIssue } from "@/lib/migration/types";

const headerAliases = {
  site: ["현장", "현장명", "site"],
  item: ["품목", "품목명", "제품명", "item"],
  quantity: ["수량", "계약수량", "qty", "quantity"],
  startDate: ["시작일", "계약시작일", "매출시작일", "startdate"],
  endDate: ["종료일", "계약종료일", "매출종료일", "enddate"],
  salesPrice: ["매출단가", "판매단가", "단가", "salesprice"],
  costPrice: ["매입단가", "원가", "costprice"],
  unit: ["단위", "unit"],
} as const;
type HeaderKey = keyof typeof headerAliases;

export async function parseLegacyWorkbook(buffer: Buffer, sourceName: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("Excel workbook에 worksheet가 없습니다.");
  const header = findHeader(worksheet);
  if (!header) throw new Error("첫 20행에서 현장·품목·수량·시작일·종료일 header를 찾지 못했습니다.");
  const warnings: MigrationIssue[] = [];
  const itemsByName = new Map<string, { id: string; name: string; salesPrice: number; costPrice: number; unit: string }>();
  const contracts: Array<{ id: string; site: string; itemId: string; qty: number | string; startDate: string; endDate: string }> = [];
  const lastRow = Math.min(worksheet.rowCount, header.rowNumber + 10_000);
  for (let rowNumber = header.rowNumber + 1; rowNumber <= lastRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const site = textValue(cellValue(row.getCell(header.columns.site)));
    const itemName = textValue(cellValue(row.getCell(header.columns.item)));
    if (!site && !itemName) continue;
    if (!site || !itemName) {
      warnings.push({ severity: "ERROR", kind: "CONTRACT", rowKey: String(rowNumber), message: "현장과 품목은 모두 필요합니다." });
      continue;
    }
    const itemKey = normalizeHeader(itemName);
    const salesPrice = moneyValue(header.columns.salesPrice ? cellValue(row.getCell(header.columns.salesPrice)) : 0);
    const costPrice = moneyValue(header.columns.costPrice ? cellValue(row.getCell(header.columns.costPrice)) : 0);
    const unit = textValue(header.columns.unit ? cellValue(row.getCell(header.columns.unit)) : "") || "EA";
    let item = itemsByName.get(itemKey);
    if (!item) {
      item = { id: "xlsx-item-" + shortHash(itemKey), name: itemName, salesPrice, costPrice, unit };
      itemsByName.set(itemKey, item);
    } else if (item.salesPrice !== salesPrice || item.costPrice !== costPrice || item.unit !== unit) {
      warnings.push({ severity: "WARNING", kind: "ITEM", rowKey: String(rowNumber), message: itemName + "의 단가 또는 단위가 앞선 행과 달라 첫 값을 사용합니다." });
    }
    contracts.push({
      id: "xlsx-row-" + rowNumber,
      site,
      itemId: item.id,
      qty: numberValue(cellValue(row.getCell(header.columns.quantity))),
      startDate: dateValue(cellValue(row.getCell(header.columns.startDate))),
      endDate: dateValue(cellValue(row.getCell(header.columns.endDate))),
    });
  }
  if (worksheet.rowCount > lastRow) warnings.push({ severity: "ERROR", kind: "FILE", rowKey: "file", message: "Excel 이관은 header 제외 최대 10,000행까지 지원합니다." });
  const parsed = parseLegacyPayload({
    format: "smart-construction-legacy-v1",
    sourceType: "EXCEL",
    sourceName,
    exportedAt: new Date().toISOString(),
    items: [...itemsByName.values()],
    contracts,
    supplier: null,
  }, sourceName);
  return { ...parsed, issues: [...warnings, ...parsed.issues] };
}

function findHeader(worksheet: ExcelJS.Worksheet) {
  const maxRow = Math.min(20, worksheet.rowCount);
  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const columns = {} as Partial<Record<HeaderKey, number>>;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const normalized = normalizeHeader(textValue(cellValue(cell)));
      for (const [key, aliases] of Object.entries(headerAliases) as Array<[HeaderKey, readonly string[]]>) {
        if (!columns[key] && aliases.some((alias) => normalizeHeader(alias) === normalized)) columns[key] = colNumber;
      }
    });
    if (columns.site && columns.item && columns.quantity && columns.startDate && columns.endDate) {
      return { rowNumber, columns: columns as Record<"site" | "item" | "quantity" | "startDate" | "endDate", number> & Partial<Record<"salesPrice" | "costPrice" | "unit", number>> };
    }
  }
  return null;
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value && typeof value === "object" && "result" in value) return value.result;
  if (value && typeof value === "object" && "richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
  return value;
}
function textValue(value: unknown) { return value == null ? "" : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).trim(); }
function normalizeHeader(value: string) { return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]/g, ""); }
function moneyValue(value: unknown) {
  const number = Number(String(value ?? 0).replace(/[,\s₩원]/g, ""));
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}
function numberValue(value: unknown) {
  const number = Number(String(value ?? "").replaceAll(",", "").trim());
  return Number.isFinite(number) ? number : String(value ?? "");
}
function dateValue(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim().replace(/\./g, "-");
  const compact = /^\d{8}$/.test(text) ? text.slice(0, 4) + "-" + text.slice(4, 6) + "-" + text.slice(6, 8) : text;
  const date = new Date(compact + (compact.length === 10 ? "T00:00:00.000Z" : ""));
  return Number.isNaN(date.getTime()) ? compact : date.toISOString().slice(0, 10);
}
function shortHash(value: string) { return createHash("sha256").update(value).digest("hex").slice(0, 12); }
