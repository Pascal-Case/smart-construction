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
  itemId: "item-cctv",
  description: "200만 화소",
  itemName: "이동형 CCTV",
  itemSpecification: "200만 화소",
  quantity: 1,
  unit: "EA",
  unitPrice: 220_000,
  supplyAmount: 220_000,
  contractCategoryId: "category-safety",
  contractCategoryCode: "CONTRACT-TYPE-0001",
  contractCategoryName: "스마트건설안전",
  invoiceDisplayItemId: null,
  invoiceDisplayItemName: null,
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

  it("같은 현장의 매출을 계약 구분별 거래명세표로 나눈다", () => {
    const result = buildInvoiceDrafts([
      base,
      { ...base, id: "r2", contractCategoryId: "category-worker", contractCategoryCode: "CONTRACT-TYPE-0002", contractCategoryName: "근로자안전보건" },
    ], "AGGREGATED");

    expect(result).toHaveLength(2);
    expect(result.map((document) => document.contractCategoryName)).toEqual(["근로자안전보건", "스마트건설안전"]);
    expect(result.map((document) => document.lines.flatMap((line) => line.revenueEntryIds))).toEqual([["r2"], ["r1"]]);
  });

  it("대표 품목 설정은 실제 품목별 문서 안에서만 표시값에 영향을 준다", () => {
    const result = buildInvoiceDrafts([
      { ...base, id: "platform", itemId: "item-platform", itemName: "플랫폼 사용료", itemSpecification: "서비스형", description: null, invoiceDisplayItemId: "item-platform", invoiceDisplayItemName: "플랫폼 사용료", quantity: 1, unit: "월", unitPrice: 300_000, supplyAmount: 300_000 },
      { ...base, id: "analysis", itemId: "item-analysis", itemName: "사진 분석 개발비용", description: "AI 분석", invoiceDisplayItemId: "item-platform", invoiceDisplayItemName: "플랫폼 사용료", quantity: 1, unit: "건", unitPrice: 500_000, supplyAmount: 500_000 },
    ], "AGGREGATED");

    expect(result).toHaveLength(2);
    expect(result.find((document) => document.issueItemId === "item-platform")?.lines).toEqual([expect.objectContaining({ itemName: "플랫폼 사용료", specification: "서비스형", quantity: 1, unit: "월", unitPrice: 300_000, supplyAmount: 300_000 })]);
    expect(result.find((document) => document.issueItemId === "item-analysis")?.lines).toEqual([expect.objectContaining({ itemName: "플랫폼 사용료", specification: null, quantity: null, unit: null, unitPrice: null, supplyAmount: 500_000 })]);
  });

  it("합산 그룹에 대표 품목 매출이 없으면 계산 열을 비운다", () => {
    const result = buildInvoiceDrafts([
      { ...base, id: "analysis", itemId: "item-analysis", itemName: "사진 분석 개발비용", invoiceDisplayItemId: "item-platform", invoiceDisplayItemName: "플랫폼 사용료", quantity: 1, unit: "건", unitPrice: 500_000, supplyAmount: 500_000 },
    ], "AGGREGATED");

    expect(result[0].lines[0]).toMatchObject({ itemName: "플랫폼 사용료", specification: null, quantity: null, unit: null, unitPrice: null, supplyAmount: 500_000 });
  });

  it("대표 품목 매출이 여러 건이면 수량을 합산하고 정확히 계산되는 단가만 표시한다", () => {
    const result = buildInvoiceDrafts([
      { ...base, id: "platform-1", itemId: "item-platform", itemName: "플랫폼 사용료", invoiceDisplayItemId: "item-platform", invoiceDisplayItemName: "플랫폼 사용료", quantity: 1, unit: "월", unitPrice: 300_000, supplyAmount: 300_000 },
      { ...base, id: "platform-2", itemId: "item-platform", itemName: "플랫폼 사용료", invoiceDisplayItemId: "item-platform", invoiceDisplayItemName: "플랫폼 사용료", quantity: 1, unit: "월", unitPrice: 300_000, supplyAmount: 300_000 },
      { ...base, id: "analysis", itemId: "item-analysis", itemName: "사진 분석 개발비용", invoiceDisplayItemId: "item-platform", invoiceDisplayItemName: "플랫폼 사용료", quantity: 1, unit: "건", unitPrice: 400_000, supplyAmount: 400_001 },
    ], "AGGREGATED");

    expect(result.find((document) => document.issueItemId === "item-platform")?.lines[0]).toMatchObject({ quantity: 2, unit: "월", unitPrice: 300_000, supplyAmount: 600_000 });
    expect(result.find((document) => document.issueItemId === "item-analysis")?.lines[0]).toMatchObject({ itemName: "플랫폼 사용료", quantity: null, unit: null, unitPrice: null, supplyAmount: 400_001 });
  });

  it("대표 품목 매출의 단위가 다르면 수량·단위·단가를 비운다", () => {
    const result = buildInvoiceDrafts([
      { ...base, id: "platform-1", itemId: "item-platform", itemName: "플랫폼 사용료", invoiceDisplayItemId: "item-platform", invoiceDisplayItemName: "플랫폼 사용료", quantity: 1, unit: "월", unitPrice: 300_000, supplyAmount: 300_000 },
      { ...base, id: "platform-2", itemId: "item-platform", itemName: "플랫폼 사용료", invoiceDisplayItemId: "item-platform", invoiceDisplayItemName: "플랫폼 사용료", quantity: 1, unit: "건", unitPrice: 300_000, supplyAmount: 300_000 },
    ], "AGGREGATED");

    expect(result.find((document) => document.issueItemId === "item-platform")?.lines[0]).toMatchObject({ quantity: null, unit: null, unitPrice: null, supplyAmount: 600_000 });
  });

  it("대표 품목 매출의 규격만 다르면 규격만 비우고 계산값은 유지한다", () => {
    const result = buildInvoiceDrafts([
      { ...base, id: "platform-1", itemId: "item-platform", itemName: "플랫폼 사용료", description: "기본형", invoiceDisplayItemId: "item-platform", invoiceDisplayItemName: "플랫폼 사용료", quantity: 1, unit: "월", unitPrice: 300_000, supplyAmount: 300_000 },
      { ...base, id: "platform-2", itemId: "item-platform", itemName: "플랫폼 사용료", description: "확장형", invoiceDisplayItemId: "item-platform", invoiceDisplayItemName: "플랫폼 사용료", quantity: 1, unit: "월", unitPrice: 300_000, supplyAmount: 300_000 },
    ], "AGGREGATED");

    expect(result.find((document) => document.issueItemId === "item-platform")?.lines[0]).toMatchObject({ specification: null, quantity: 2, unit: "월", unitPrice: 300_000, supplyAmount: 600_000 });
  });

  it("건별 출력은 대표 품목 설정이 있어도 원본 품목을 유지한다", () => {
    const result = buildInvoiceDrafts([base, { ...base, id: "r2", itemName: "사진 분석 개발비용", invoiceDisplayItemId: "item-cctv", invoiceDisplayItemName: "이동형 CCTV" }], "ITEMIZED");

    expect(result[0].lines.map((line) => line.itemName)).toEqual(["이동형 CCTV", "사진 분석 개발비용"]);
  });

  it("실제 품목별로 문서를 분리하고 품목 없는 매출은 하나로 묶는다", () => {
    const result = buildInvoiceDrafts([
      { ...base, id: "r-item-a", itemId: "item-a", itemName: "안전 점검", invoiceDisplayItemId: "item-representative", invoiceDisplayItemName: "안전 관리", supplyAmount: 100_000 },
      { ...base, id: "r-item-b", itemId: "item-b", itemName: "교육", invoiceDisplayItemId: "item-representative", invoiceDisplayItemName: "안전 관리", supplyAmount: 200_000 },
      { ...base, id: "r-no-item", itemId: null, itemName: null, invoiceDisplayItemId: null, invoiceDisplayItemName: null, supplyAmount: 50_000 },
      { ...base, id: "r-no-item-2", itemId: null, itemName: null, invoiceDisplayItemId: null, invoiceDisplayItemName: null, supplyAmount: 30_000 },
    ], "AGGREGATED");

    expect(result).toHaveLength(3);
    expect(result.map((document) => document.issueItemId)).toEqual(["item-b", "item-a", null]);
    expect(result.map((document) => document.issueItemName)).toEqual(["교육", "안전 점검", "품목 없음"]);
    expect(result.map((document) => document.subtotal)).toEqual([200_000, 100_000, 80_000]);
  });
});
