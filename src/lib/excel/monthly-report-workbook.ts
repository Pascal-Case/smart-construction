import ExcelJS from "exceljs";

export const MONTHLY_REPORT_METRICS = ["salesAmount", "costAmount", "profit"] as const;
export type MonthlyReportMetric = (typeof MONTHLY_REPORT_METRICS)[number];

type Amounts = Record<MonthlyReportMetric, number>;
type MonthlyReportExportData = {
  startMonth: string;
  endMonth: string;
  months: string[];
  rows: Array<{ id: string; code: string; name: string; cells: Array<{ month: string } & Amounts>; totals: Amounts }>;
  monthTotals: Array<{ month: string } & Amounts>;
  grandTotals: Amounts;
};

const METRIC_LABELS: Record<MonthlyReportMetric, string> = { salesAmount: "매출", costAmount: "매입", profit: "이익" };
const MONEY_FORMAT = "#,##0;[Red](#,##0);-";

export async function createMonthlyReportWorkbook(input: {
  report: MonthlyReportExportData;
  metric: MonthlyReportMetric;
  filter: { siteName: string; contractCategoryName: string; generatedAt: Date };
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "스마트 건설안전";
  workbook.created = input.filter.generatedAt;
  workbook.modified = input.filter.generatedAt;
  const sheet = workbook.addWorksheet("월별현황", { views: [{ state: "frozen", xSplit: 2, ySplit: 5, showGridLines: false }] });
  const lastColumn = input.report.months.length + 3;
  sheet.mergeCells(1, 1, 1, lastColumn);
  sheet.getCell("A1").value = `월별 ${METRIC_LABELS[input.metric]} 현황`;
  sheet.getCell("A1").font = { bold: true, size: 18 };
  sheet.mergeCells(2, 1, 2, lastColumn);
  sheet.getCell("A2").value = `기간: ${input.report.startMonth} ~ ${input.report.endMonth} · 현장: ${input.filter.siteName}`;
  sheet.mergeCells(3, 1, 3, lastColumn);
  sheet.getCell("A3").value = `계약 구분: ${input.filter.contractCategoryName} · 출력: ${formatSeoulDateTime(input.filter.generatedAt)}`;
  sheet.getRow(5).values = ["현장코드", "현장명", ...input.report.months, "합계"];
  styleHeader(sheet.getRow(5));
  for (const row of input.report.rows) sheet.addRow([row.code, row.name, ...row.cells.map((cell) => cell[input.metric]), row.totals[input.metric]]);
  const totalRow = sheet.addRow(["합계", null, ...input.report.monthTotals.map((total) => total[input.metric]), input.report.grandTotals[input.metric]]);
  totalRow.font = { bold: true };
  totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  totalRow.border = { top: { style: "double", color: { argb: "FF64748B" } } };
  sheet.getColumn(1).width = 16;
  sheet.getColumn(2).width = 30;
  for (let column = 3; column <= lastColumn; column += 1) { sheet.getColumn(column).width = 16; sheet.getColumn(column).numFmt = MONEY_FORMAT; }
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: lastColumn } };
  return workbook.xlsx.writeBuffer({ useStyles: true, useSharedStrings: true });
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  row.alignment = { horizontal: "center", vertical: "middle" };
}

function formatSeoulDateTime(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(value);
}
