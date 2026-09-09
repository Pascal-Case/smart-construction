import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { createMonthlyReportWorkbook } from "@/lib/excel/monthly-report-workbook";

describe("createMonthlyReportWorkbook", () => {
  it("선택한 지표와 필터로 현장 x 월 집계를 만든다", async () => {
    const buffer = await createMonthlyReportWorkbook({
      report: {
        startMonth: "2026-01",
        endMonth: "2026-02",
        months: ["2026-01", "2026-02"],
        rows: [{
          id: "site-1",
          code: "S001",
          name: "가 현장",
          cells: [
            { month: "2026-01", salesAmount: 100, costAmount: 70, profit: 30 },
            { month: "2026-02", salesAmount: 200, costAmount: 120, profit: 80 },
          ],
          totals: { salesAmount: 300, costAmount: 190, profit: 110 },
        }],
        monthTotals: [
          { month: "2026-01", salesAmount: 100, costAmount: 70, profit: 30 },
          { month: "2026-02", salesAmount: 200, costAmount: 120, profit: 80 },
        ],
        grandTotals: { salesAmount: 300, costAmount: 190, profit: 110 },
      },
      metric: "profit",
      filter: { siteName: "전체", contractCategoryName: "근로자안전보건", generatedAt: new Date("2026-09-09T00:00:00Z") },
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("월별현황")!;

    expect(sheet.getCell("A1").value).toBe("월별 이익 현황");
    expect(sheet.getCell("A3").value).toContain("계약 구분: 근로자안전보건");
    expect(sheet.getRow(5).values).toEqual([undefined, "현장코드", "현장명", "2026-01", "2026-02", "합계"]);
    expect(sheet.getRow(6).values).toEqual([undefined, "S001", "가 현장", 30, 80, 110]);
    expect(sheet.getRow(7).values).toEqual([undefined, "합계", undefined, 30, 80, 110]);
  });
});
