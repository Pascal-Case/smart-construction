import { describe, expect, it } from "vitest";

import { buildInvoiceDrafts, type InvoiceSourceEntry } from "@/lib/invoices/calculation";

const base: InvoiceSourceEntry = {
  id: "r1",
  siteId: "site-a",
  siteCode: "SITE-A",
  siteName: "A 현장",
  siteAddress: "서울",
  revenueDate: new Date("2026-05-20T00:00:00.000Z"),
  title: "5월 CCTV",
  description: "200만 화소",
  itemName: "이동형 CCTV",
  itemSpecification: "200만 화소",
  quantity: 1,
  unit: "EA",
  unitPrice: 220_000,
  supplyAmount: 220_000,
};

describe("invoice calculation", () => {
  it("같은 품목·규격·단위·단가만 합산하고 원장 연결을 유지한다", () => {
    const result = buildInvoiceDrafts([
      base,
      { ...base, id: "r2", quantity: 2, supplyAmount: 440_000 },
      { ...base, id: "r3", unitPrice: 230_000, supplyAmount: 230_000 },
    ], "AGGREGATED");

    expect(result).toHaveLength(1);
    expect(result[0].lines).toHaveLength(2);
    expect(result[0].lines[0]).toMatchObject({ quantity: 3, unitPrice: 220_000, supplyAmount: 660_000, taxAmount: 66_000, revenueEntryIds: ["r1", "r2"] });
    expect(result[0].lines[1]).toMatchObject({ quantity: 1, unitPrice: 230_000, supplyAmount: 230_000, revenueEntryIds: ["r3"] });
    expect(result[0]).toMatchObject({ subtotal: 890_000, taxAmount: 89_000, totalAmount: 979_000 });
  });

  it("건별 출력은 입력 원장을 합치지 않는다", () => {
    const result = buildInvoiceDrafts([base, { ...base, id: "r2" }], "ITEMIZED");
    expect(result[0].lines).toHaveLength(2);
    expect(result[0].lines.map((line) => line.revenueEntryIds)).toEqual([["r1"], ["r2"]]);
  });

  it("계약 매출은 거래명세표에 계약명 없이 품목명만 표시한다", () => {
    const result = buildInvoiceDrafts([
      { ...base, title: "CCTV 임대 계약 - 이동형 CCTV", description: null, itemSpecification: "200만 화소" },
    ], "ITEMIZED");

    expect(result[0].lines[0]).toMatchObject({
      itemName: "이동형 CCTV",
      specification: "200만 화소",
    });
  });

  it("현장별 문서를 나누고 자유형·음수 조정 금액을 보존한다", () => {
    const result = buildInvoiceDrafts([
      { ...base, itemName: null, title: "A/S 작업", description: null, quantity: null, unit: null, unitPrice: null, supplyAmount: 101 },
      { ...base, id: "r2", siteId: "site-b", siteCode: "SITE-B", siteName: "B 현장", itemName: null, title: "조정", quantity: null, unitPrice: null, supplyAmount: -55 },
    ], "AGGREGATED");

    expect(result).toHaveLength(2);
    expect(result[0].lines[0]).toMatchObject({ itemName: "A/S 작업", quantity: null, unitPrice: null, supplyAmount: 101, taxAmount: 10 });
    expect(result[1]).toMatchObject({ siteId: "site-b", subtotal: -55, taxAmount: -5, totalAmount: -60 });
  });
});
