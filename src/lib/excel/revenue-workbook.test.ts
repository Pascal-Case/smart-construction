import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { createRevenueWorkbook, REVENUE_EXPORT_LIMIT, type RevenueExportRow } from "@/lib/excel/revenue-workbook";
import { safeExcelValue } from "@/lib/excel/safe-value";

const generatedAt = new Date("2026-07-10T09:00:00.000Z");
const baseRow: RevenueExportRow = {
  id: "revenue-1",
  revenueDate: new Date("2026-05-20T00:00:00.000Z"),
  siteCode: "SITE-0001",
  siteName: "테스트 현장",
  sourceType: "MANUAL",
  status: "CONFIRMED",
  contractNo: null,
  itemName: null,
  title: "=SUM(1,1)",
  description: "+외부 입력",
  quantity: 2,
  unit: "EA",
  appliedSalesPrice: 50_000,
  salesAmount: 100_000,
  appliedCostPrice: 20_000,
  costAmount: 40_000,
  priceOverrideReason: null,
  createdByName: "관리자",
  createdAt: generatedAt,
};

describe("revenue workbook", () => {
  it("세 시트와 상세 참조 요약 수식, 취소 제외 결과를 만든다", async () => {
    const canceled: RevenueExportRow = {
      ...baseRow,
      id: "revenue-2",
      title: "취소 매출",
      status: "CANCELED",
      salesAmount: 30_000,
      costAmount: 10_000,
    };
    const buffer = await createRevenueWorkbook({
      details: [baseRow, canceled],
      memos: [{ month: "2026-05", siteCode: "SITE-0001", siteName: "테스트 현장", content: "  +위험한 메모", updatedByName: "담당자", updatedAt: generatedAt }],
      filter: { startDate: "2026-05-01", endDate: "2026-05-31", siteName: "테스트 현장", sourceLabel: "전체", statusLabel: "전체", query: "", generatedAt },
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as Parameters<typeof workbook.xlsx.load>[0]);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["월별요약", "매출상세", "월별특이사항"]);
    const summary = workbook.getWorksheet("월별요약")!;
    const detail = workbook.getWorksheet("매출상세")!;
    const memo = workbook.getWorksheet("월별특이사항")!;
    const salesFormula = summary.getCell("D6").value as ExcelJS.CellFormulaValue;
    const costFormula = summary.getCell("E6").value as ExcelJS.CellFormulaValue;
    const countFormula = summary.getCell("G6").value as ExcelJS.CellFormulaValue;
    const canceledFormula = summary.getCell("J6").value as ExcelJS.CellFormulaValue;

    expect(salesFormula.formula).toContain("SUMIFS('매출상세'!$N$6:$N$7");
    expect(salesFormula.result).toBe(100_000);
    expect(costFormula.result).toBe(40_000);
    expect(countFormula.result).toBe(1);
    expect(canceledFormula.result).toBe(1);
    expect((summary.getCell("D7").value as ExcelJS.CellFormulaValue).result).toBe(100_000);
    expect(detail.getCell("I6").value).toBe("'=SUM(1,1)");
    expect(detail.getCell("J6").value).toBe("'+외부 입력");
    expect(memo.getCell("D6").value).toBe("'  +위험한 메모");
    expect(detail.getColumn(14).numFmt).toContain("#,##0");
    expect(detail.getColumn(1).numFmt).toBe("yyyy-mm-dd");
    expect(summary.views[0]).toMatchObject({ state: "frozen", ySplit: 5 });
  });

  it("빈 결과도 합계 수식과 세 시트를 유지한다", async () => {
    const buffer = await createRevenueWorkbook({
      details: [],
      memos: [],
      filter: { startDate: "", endDate: "", siteName: "전체", sourceLabel: "전체", statusLabel: "전체", query: "", generatedAt },
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.getWorksheet("월별요약")?.getCell("A6").value).toBe("조회 결과 없음");
    expect((workbook.getWorksheet("월별요약")?.getCell("D7").value as ExcelJS.CellFormulaValue).formula).toBe("SUM(D6:D6)");
    expect(workbook.worksheets).toHaveLength(3);
  });

  it("공백 뒤의 수식 시작 문자도 문자열로 보호한다", () => {
    expect(REVENUE_EXPORT_LIMIT).toBe(10_000);
    expect(safeExcelValue("  =1+1")).toBe("'  =1+1");
    expect(safeExcelValue("-10")).toBe("'-10");
    expect(safeExcelValue(10)).toBe(10);
    expect(safeExcelValue(null)).toBeNull();
  });
});
