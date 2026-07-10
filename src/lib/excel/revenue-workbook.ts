import ExcelJS from "exceljs";

import { safeExcelValue } from "@/lib/excel/safe-value";

export const REVENUE_EXPORT_LIMIT = 10_000;

export type RevenueExportRow = {
  id: string;
  revenueDate: Date;
  siteCode: string;
  siteName: string;
  sourceType: "CONTRACT" | "MANUAL" | "ADJUSTMENT";
  status: "DRAFT" | "CONFIRMED" | "CANCELED";
  contractNo: string | null;
  itemName: string | null;
  title: string;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  appliedSalesPrice: number | null;
  salesAmount: number;
  appliedCostPrice: number | null;
  costAmount: number | null;
  priceOverrideReason: string | null;
  createdByName: string;
  createdAt: Date;
};

export type MonthlyMemoExportRow = {
  month: string;
  siteCode: string;
  siteName: string;
  content: string;
  updatedByName: string;
  updatedAt: Date;
};

export type RevenueExportFilter = {
  startDate: string;
  endDate: string;
  siteName: string;
  sourceLabel: string;
  statusLabel: string;
  query: string;
  generatedAt: Date;
};

const SOURCE_LABELS = { CONTRACT: "계약", MANUAL: "직접", ADJUSTMENT: "조정" } as const;
const STATUS_LABELS = { DRAFT: "작성 중", CONFIRMED: "확정", CANCELED: "취소" } as const;
const HEADER_ROW = 5;
const FIRST_DATA_ROW = HEADER_ROW + 1;
const MONEY_FORMAT = "#,##0;[Red](#,##0);-";

export async function createRevenueWorkbook(input: { details: RevenueExportRow[]; memos: MonthlyMemoExportRow[]; filter: RevenueExportFilter }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "스마트 건설안전";
  workbook.lastModifiedBy = "스마트 건설안전";
  workbook.created = input.filter.generatedAt;
  workbook.modified = input.filter.generatedAt;
  workbook.calcProperties.fullCalcOnLoad = true;

  const summary = workbook.addWorksheet("월별요약", { views: [{ state: "frozen", xSplit: 3, ySplit: HEADER_ROW, showGridLines: false }] });
  const detail = workbook.addWorksheet("매출상세", { views: [{ state: "frozen", xSplit: 4, ySplit: HEADER_ROW, showGridLines: false }] });
  const memo = workbook.addWorksheet("월별특이사항", { views: [{ state: "frozen", ySplit: HEADER_ROW, showGridLines: false }] });

  writeDetailSheet(detail, input.details, input.filter);
  writeSummarySheet(summary, input.details, input.filter);
  writeMemoSheet(memo, input.memos, input.filter);

  return workbook.xlsx.writeBuffer({ useStyles: true, useSharedStrings: true });
}

function writeSummarySheet(sheet: ExcelJS.Worksheet, details: RevenueExportRow[], filter: RevenueExportFilter) {
  const headers = ["귀속월", "현장코드", "현장명", "매출액", "매입액", "이익", "원장건수", "작성 중", "확정", "취소"];
  writeSheetHeading(sheet, "월별 매출 요약", headers.length, filter);
  sheet.addRow(headers);
  styleHeader(sheet.getRow(HEADER_ROW));
  sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: headers.length } };

  const groups = new Map<string, { month: string; siteCode: string; siteName: string; rows: RevenueExportRow[] }>();
  for (const row of details) {
    const month = dateKey(row.revenueDate).slice(0, 7);
    const key = `${month}\u0000${row.siteCode}`;
    const group = groups.get(key) ?? { month, siteCode: row.siteCode, siteName: row.siteName, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  const ordered = [...groups.values()].sort((a, b) => a.month.localeCompare(b.month) || a.siteName.localeCompare(b.siteName));
  const lastDetailRow = Math.max(FIRST_DATA_ROW, HEADER_ROW + details.length);
  const monthRange = `'매출상세'!$B$${FIRST_DATA_ROW}:$B$${lastDetailRow}`;
  const siteRange = `'매출상세'!$C$${FIRST_DATA_ROW}:$C$${lastDetailRow}`;
  const statusRange = `'매출상세'!$F$${FIRST_DATA_ROW}:$F$${lastDetailRow}`;

  for (const group of ordered) {
    const row = sheet.addRow([safeExcelValue(group.month), safeExcelValue(group.siteCode), safeExcelValue(group.siteName)]);
    const rowNumber = row.number;
    const active = group.rows.filter((entry) => entry.status !== "CANCELED");
    const salesAmount = active.reduce((sum, entry) => sum + entry.salesAmount, 0);
    const costAmount = active.reduce((sum, entry) => sum + (entry.costAmount ?? 0), 0);
    row.getCell(4).value = formulaValue(`SUMIFS('매출상세'!$N$${FIRST_DATA_ROW}:$N$${lastDetailRow},${monthRange},$A${rowNumber},${siteRange},$B${rowNumber},${statusRange},"<>취소")`, salesAmount);
    row.getCell(5).value = formulaValue(`SUMIFS('매출상세'!$P$${FIRST_DATA_ROW}:$P$${lastDetailRow},${monthRange},$A${rowNumber},${siteRange},$B${rowNumber},${statusRange},"<>취소")`, costAmount);
    row.getCell(6).value = formulaValue(`D${rowNumber}-E${rowNumber}`, salesAmount - costAmount);
    row.getCell(7).value = formulaValue(`COUNTIFS(${monthRange},$A${rowNumber},${siteRange},$B${rowNumber},${statusRange},"<>취소")`, active.length);
    row.getCell(8).value = formulaValue(`COUNTIFS(${monthRange},$A${rowNumber},${siteRange},$B${rowNumber},${statusRange},"작성 중")`, countStatus(group.rows, "DRAFT"));
    row.getCell(9).value = formulaValue(`COUNTIFS(${monthRange},$A${rowNumber},${siteRange},$B${rowNumber},${statusRange},"확정")`, countStatus(group.rows, "CONFIRMED"));
    row.getCell(10).value = formulaValue(`COUNTIFS(${monthRange},$A${rowNumber},${siteRange},$B${rowNumber},${statusRange},"취소")`, countStatus(group.rows, "CANCELED"));
  }

  if (!ordered.length) sheet.addRow(["조회 결과 없음"]);
  const firstSummaryRow = FIRST_DATA_ROW;
  const lastSummaryRow = Math.max(firstSummaryRow, HEADER_ROW + ordered.length);
  const totalRow = sheet.addRow(["합계", null, null]);
  const activeDetails = details.filter((entry) => entry.status !== "CANCELED");
  const totalResults = [
    activeDetails.reduce((sum, entry) => sum + entry.salesAmount, 0),
    activeDetails.reduce((sum, entry) => sum + (entry.costAmount ?? 0), 0),
    activeDetails.reduce((sum, entry) => sum + entry.salesAmount - (entry.costAmount ?? 0), 0),
    activeDetails.length,
    countStatus(details, "DRAFT"),
    countStatus(details, "CONFIRMED"),
    countStatus(details, "CANCELED"),
  ];
  for (let column = 4; column <= 10; column += 1) totalRow.getCell(column).value = formulaValue(`SUM(${columnLetter(column)}${firstSummaryRow}:${columnLetter(column)}${lastSummaryRow})`, totalResults[column - 4]);
  totalRow.font = { bold: true };
  totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  totalRow.border = { top: { style: "double", color: { argb: "FF64748B" } } };

  sheet.getColumn(1).width = 12;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 28;
  for (let column = 4; column <= 10; column += 1) sheet.getColumn(column).width = column <= 6 ? 16 : 12;
  sheet.getColumn(1).alignment = { horizontal: "center" };
  sheet.getColumn(2).alignment = { horizontal: "center" };
  sheet.getColumn(3).alignment = { horizontal: "left" };
  for (let column = 4; column <= 6; column += 1) sheet.getColumn(column).numFmt = MONEY_FORMAT;
  for (let column = 7; column <= 10; column += 1) sheet.getColumn(column).numFmt = "#,##0";
  finishSheet(sheet, headers.length);
}

function writeDetailSheet(sheet: ExcelJS.Worksheet, details: RevenueExportRow[], filter: RevenueExportFilter) {
  const headers = ["귀속일", "귀속월", "현장코드", "현장명", "출처", "상태", "계약번호", "품목", "제목", "설명", "수량", "단위", "매출단가", "매출액", "매입단가", "매입액", "이익", "예외·조정 사유", "작성자", "등록일시"];
  writeSheetHeading(sheet, "매출 상세", headers.length, filter);
  sheet.addRow(headers);
  styleHeader(sheet.getRow(HEADER_ROW));
  sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: headers.length } };

  for (const entry of details) {
    const row = sheet.addRow([
      entry.revenueDate,
      dateKey(entry.revenueDate).slice(0, 7),
      safeExcelValue(entry.siteCode),
      safeExcelValue(entry.siteName),
      SOURCE_LABELS[entry.sourceType],
      STATUS_LABELS[entry.status],
      safeExcelValue(entry.contractNo),
      safeExcelValue(entry.itemName),
      safeExcelValue(entry.title),
      safeExcelValue(entry.description),
      entry.quantity,
      safeExcelValue(entry.unit),
      entry.appliedSalesPrice,
      entry.salesAmount,
      entry.appliedCostPrice,
      entry.costAmount,
      null,
      safeExcelValue(entry.priceOverrideReason),
      safeExcelValue(entry.createdByName),
      entry.createdAt,
    ]);
    const profit = entry.salesAmount - (entry.costAmount ?? 0);
    row.getCell(17).value = formulaValue(`N${row.number}-IF(P${row.number}="",0,P${row.number})`, profit);
    if (entry.status === "CANCELED") {
      row.font = { color: { argb: "FF64748B" } };
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    }
  }

  sheet.getColumn(1).numFmt = "yyyy-mm-dd";
  sheet.getColumn(20).numFmt = "yyyy-mm-dd hh:mm";
  sheet.getColumn(11).numFmt = "#,##0.00";
  for (let column = 13; column <= 17; column += 1) sheet.getColumn(column).numFmt = MONEY_FORMAT;
  const widths = [12, 10, 15, 24, 10, 10, 17, 22, 30, 36, 12, 10, 15, 16, 15, 16, 16, 34, 14, 18];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  for (let column = 9; column <= 10; column += 1) sheet.getColumn(column).alignment = { vertical: "top", wrapText: true };
  sheet.getColumn(18).alignment = { vertical: "top", wrapText: true };
  finishSheet(sheet, headers.length);
}

function writeMemoSheet(sheet: ExcelJS.Worksheet, memos: MonthlyMemoExportRow[], filter: RevenueExportFilter) {
  const headers = ["귀속월", "현장코드", "현장명", "특이사항", "수정자", "수정일시"];
  writeSheetHeading(sheet, "월별 특이사항", headers.length, filter);
  sheet.addRow(headers);
  styleHeader(sheet.getRow(HEADER_ROW));
  sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: headers.length } };
  for (const entry of memos) sheet.addRow([safeExcelValue(entry.month), safeExcelValue(entry.siteCode), safeExcelValue(entry.siteName), safeExcelValue(entry.content), safeExcelValue(entry.updatedByName), entry.updatedAt]);
  sheet.getColumn(1).width = 12;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 28;
  sheet.getColumn(4).width = 70;
  sheet.getColumn(4).alignment = { vertical: "top", wrapText: true };
  sheet.getColumn(5).width = 14;
  sheet.getColumn(6).width = 18;
  sheet.getColumn(6).numFmt = "yyyy-mm-dd hh:mm";
  finishSheet(sheet, headers.length);
}

function writeSheetHeading(sheet: ExcelJS.Worksheet, title: string, columnCount: number, filter: RevenueExportFilter) {
  sheet.mergeCells(1, 1, 1, columnCount);
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 1).font = { name: "맑은 고딕", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  sheet.getCell(1, 1).alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 32;
  sheet.mergeCells(2, 1, 2, columnCount);
  sheet.getCell(2, 1).value = safeExcelValue(filterDescription(filter));
  sheet.getCell(2, 1).font = { name: "맑은 고딕", size: 10, color: { argb: "FF334155" } };
  sheet.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  sheet.mergeCells(3, 1, 3, columnCount);
  sheet.getCell(3, 1).value = `생성일시: ${formatDateTime(filter.generatedAt)} · 금액 단위: 원 · 취소 건은 합계에서 제외`;
  sheet.getCell(3, 1).font = { name: "맑은 고딕", size: 9, color: { argb: "FF64748B" } };
  sheet.getRow(4).height = 8;
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { name: "맑은 고딕", bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "medium", color: { argb: "FF0F766E" } } };
  });
}

function finishSheet(sheet: ExcelJS.Worksheet, columnCount: number) {
  sheet.properties.defaultRowHeight = 20;
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }, printTitlesRow: "1:5" };
  sheet.pageSetup.printArea = `A1:${columnLetter(columnCount)}${Math.max(sheet.rowCount, HEADER_ROW)}`;
  sheet.headerFooter.oddFooter = "&L스마트 건설안전&C&P / &N&R&F";
}

function filterDescription(filter: RevenueExportFilter) {
  const period = `${filter.startDate || "전체"} ~ ${filter.endDate || "전체"}`;
  return `조회기간: ${period} | 현장: ${filter.siteName} | 출처: ${filter.sourceLabel} | 상태: ${filter.statusLabel} | 검색어: ${filter.query || "없음"}`;
}

function formulaValue(formula: string, result: number): ExcelJS.CellFormulaValue { return { formula, result }; }
function countStatus(rows: RevenueExportRow[], status: RevenueExportRow["status"]) { return rows.filter((row) => row.status === status).length; }
function dateKey(value: Date) { return value.toISOString().slice(0, 10); }
function formatDateTime(value: Date) { return value.toISOString().replace("T", " ").slice(0, 16); }
function columnLetter(column: number) { let value = column; let result = ""; while (value > 0) { value -= 1; result = String.fromCharCode(65 + (value % 26)) + result; value = Math.floor(value / 26); } return result; }
