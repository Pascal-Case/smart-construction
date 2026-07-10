import "server-only";

import ExcelJS from "exceljs";

export type MasterRow = Record<string, string | number | boolean | null | undefined>;

const SITE_HEADERS = ["현장코드", "현장명", "거래처", "주소", "담당자", "연락처", "시작일", "종료일", "사용여부", "메모", "별칭"];
const ITEM_HEADERS = ["품목코드", "품목명", "단위", "표준매출단가", "표준매입단가", "사용여부", "메모", "별칭"];

export async function readMasterWorkbook(buffer: ArrayBuffer, type: "site" | "item") {
  if (buffer.byteLength > 5 * 1024 * 1024) throw new Error("Excel 파일은 5MB 이하여야 합니다.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("첫 번째 시트를 찾을 수 없습니다.");
  const rows = worksheet.getSheetValues().slice(1).map((row) => Array.isArray(row) ? row.slice(1).map(cellValue) : []);
  return rowsToObjects(rows, type);
}

export function readMasterPaste(content: string, type: "site" | "item") {
  const rows = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((line) => line.trim()).map((line) => line.split("\t"));
  return rowsToObjects(rows, type);
}

function rowsToObjects(rows: Array<Array<unknown>>, type: "site" | "item") {
  if (rows.length < 2) throw new Error("헤더와 데이터 행을 함께 입력해 주세요.");
  if (rows.length > 5001) throw new Error("한 번에 최대 5,000행까지 가져올 수 있습니다.");
  const expected = type === "site" ? SITE_HEADERS : ITEM_HEADERS;
  const headers = rows[0].map((value) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, ""));
  const indexes = new Map(expected.map((header) => [header, headers.indexOf(header)]));
  for (const required of expected.slice(0, type === "site" ? 2 : 3)) {
    if ((indexes.get(required) ?? -1) < 0) throw new Error(`필수 열이 없습니다: ${required}`);
  }
  return rows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(expected.map((header) => [header, valueAt(row, indexes.get(header) ?? -1)])),
  }));
}

export async function createMasterWorkbook(type: "site" | "item", rows: MasterRow[], template = false) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "스마트 건설안전";
  const worksheet = workbook.addWorksheet(type === "site" ? "현장마스터" : "품목마스터", { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = type === "site" ? SITE_HEADERS : ITEM_HEADERS;
  worksheet.addRow(headers);
  if (template) {
    worksheet.addRow(type === "site"
      ? ["SITE-0001", "강남 A현장", "OO건설", "서울시", "김담당", "010-0000-0000", "2026-01-01", "2026-12-31", "Y", "", "강남A|A현장"]
      : ["ITEM-0001", "이동형 CCTV", "EA", 220000, 120000, "Y", "", "CCTV|이동형카메라"]);
  } else {
    for (const row of rows) worksheet.addRow(headers.map((header) => safeExcelValue(row[header])));
  }
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  headers.forEach((header, index) => { worksheet.getColumn(index + 1).width = Math.max(12, Math.min(40, header.length * 2 + 8)); });
  return workbook.xlsx.writeBuffer();
}

function cellValue(value: unknown) {
  if (value && typeof value === "object" && "result" in value) return (value as { result?: unknown }).result ?? "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value ?? "";
}
function valueAt(row: Array<unknown>, index: number) { return index < 0 ? undefined : cellValue(row[index]); }
function safeExcelValue(value: unknown) {
  if (typeof value === "string" && /^[=+\-@]/.test(value)) return `'${value}`;
  return value ?? "";
}
