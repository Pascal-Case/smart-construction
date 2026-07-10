import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { parseLegacyWorkbook } from "@/lib/migration/workbook";

async function workbookBuffer(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("계약");
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("parseLegacyWorkbook", () => {
  it("기존 계약 Excel 열을 레거시 bundle로 정규화한다", async () => {
    const buffer = await workbookBuffer([
      ["계약 이관 자료"],
      ["현장명", "품목명", "수량", "계약시작일", "계약종료일", "매출단가", "매입단가", "단위"],
      ["송도 A현장", "이동형 CCTV", 2, new Date("2026-05-01T00:00:00.000Z"), new Date("2026-12-31T00:00:00.000Z"), 220000, 120000, "대/월"],
      ["서울 현장", "이동형 CCTV", 1, "2026.06.01", "2026.08.31", 220000, 120000, "대/월"],
    ]);
    const result = await parseLegacyWorkbook(buffer, "contracts.xlsx");
    expect(result.issues).toEqual([]);
    expect(result.bundle.sourceType).toBe("EXCEL");
    expect(result.bundle.items).toHaveLength(1);
    expect(result.bundle.contracts).toHaveLength(2);
    expect(result.bundle.contracts[0]).toMatchObject({ site: "송도 A현장", quantity: 2, startDate: "2026-05-01", endDate: "2026-12-31" });
  });

  it("같은 품목의 단가 충돌은 첫 값을 유지하고 경고한다", async () => {
    const buffer = await workbookBuffer([
      ["현장", "품목", "수량", "시작일", "종료일", "매출단가"],
      ["A현장", "CCTV", 1, "2026-01-01", "2026-02-01", 100000],
      ["B현장", "CCTV", 1, "2026-01-01", "2026-02-01", 120000],
    ]);
    const result = await parseLegacyWorkbook(buffer, "conflict.xlsx");
    expect(result.bundle.items[0].salesPrice).toBe(100000);
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: "WARNING", kind: "ITEM", rowKey: "3" }));
  });

  it("필수 header가 없으면 명확한 오류를 반환한다", async () => {
    const buffer = await workbookBuffer([["현장", "품목"], ["A", "B"]]);
    await expect(parseLegacyWorkbook(buffer, "invalid.xlsx")).rejects.toThrow("현장·품목·수량·시작일·종료일");
  });
});
