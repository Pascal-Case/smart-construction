import { describe, expect, it } from "vitest";

import { parseSmartInput } from "@/lib/smart-input/parser";
import type { SmartMasterOption } from "@/lib/smart-input/types";

const sites: SmartMasterOption[] = [
  { id: "site-songdo-a", code: "S001", name: "송도 A현장", aliases: ["송도A", "송도 A 현장"] },
  { id: "site-songdo-b", code: "S002", name: "송도 B현장", aliases: ["송도B"] },
  { id: "site-seoul", code: "S003", name: "서울 현장", aliases: ["서울"] },
];
const items: SmartMasterOption[] = [
  { id: "item-cctv", code: "I001", name: "이동형 CCTV", aliases: ["CCTV", "이동형카메라"], unit: "EA", standardSalesPrice: 220_000, standardCostPrice: 120_000 },
  { id: "item-sensor", code: "I002", name: "안전 센서", aliases: ["센서"], unit: "EA", standardSalesPrice: 50_000, standardCostPrice: 30_000 },
];
const referenceDate = new Date("2026-07-10T00:00:00.000Z");

describe("parseSmartInput", () => {
  it("수량 앞이나 수량과 무관한 금액은 암시적 단가로 사용하지 않는다", () => {
    const reordered = parseSmartInput({ target: "CONTRACT", input: "배송비 5만원 2개", sites, items, referenceDate });
    const unrelated = parseSmartInput({ target: "CONTRACT", input: "메모 5만원", sites, items, referenceDate });

    expect(reordered.fields.unitPrice.status).not.toBe("MATCHED");
    expect(unrelated.fields.unitPrice.status).not.toBe("MATCHED");
  });

  it("실무 계약 문장에서 별칭·수량·월 범위·A/S 단가를 분석한다", () => {
    const result = parseSmartInput({ target: "CONTRACT", input: "송도 A현장 CCTV 5대, 26년 3월부터 8월까지, A/S 단가 8만원", sites, items, referenceDate });
    expect(result.fields.site.value?.id).toBe("site-songdo-a");
    expect(result.fields.item.value?.id).toBe("item-cctv");
    expect(result.fields.quantity.value).toBe(5);
    expect(result.fields.period.value).toEqual({ startDate: "2026-03-01", endDate: "2026-08-31", precision: "MONTH" });
    expect(result.fields.unitPrice.value).toBe(80_000);
    expect(result.fields.totalAmount.value).toBe(400_000);
    expect(result.fields.priceOverrideReason.value).toBe("A/S 단가");
    expect(result.canApply).toBe(true);
  });

  it("자유형 매출의 지정일과 직접 총액을 구분한다", () => {
    const result = parseSmartInput({ target: "REVENUE", input: "서울 현장 이동형 CCTV 2대 2026-05-20 총 50만원", sites, items, referenceDate });
    expect(result.fields.period.value).toEqual({ startDate: "2026-05-20", endDate: "2026-05-20", precision: "DAY" });
    expect(result.fields.unitPrice.value).toBe(220_000);
    expect(result.fields.totalAmount.value).toBe(500_000);
    expect(result.fields.priceOverrideReason.value).toBe("문장 입력 총액");
    expect(result.warnings).toContain("문장의 총액이 수량 × 단가와 다릅니다. 예외 사유를 확인해 주세요.");
  });

  it("숫자 월 범위와 연도 경계를 계산한다", () => {
    const result = parseSmartInput({ target: "CONTRACT", input: "서울 센서 수량 3 EA, 26.11~27.2", sites, items, referenceDate });
    expect(result.fields.period.value).toEqual({ startDate: "2026-11-01", endDate: "2027-02-28", precision: "MONTH" });
    expect(result.fields.unitPrice.status).toBe("DERIVED");
    expect(result.fields.unitPrice.value).toBe(50_000);
  });

  it("서로 다른 현장이 함께 나오면 선택을 요구한다", () => {
    const result = parseSmartInput({ target: "CONTRACT", input: "송도 A현장과 서울 현장 CCTV 1대 2026년 5월 단가 20만원", sites, items, referenceDate });
    expect(result.fields.site.status).toBe("AMBIGUOUS");
    expect(result.fields.site.candidates.map((candidate) => candidate.id)).toEqual(["site-songdo-a", "site-seoul"]);
    expect(result.canApply).toBe(false);
  });

  it("품목이 없어도 현장·날짜·총액이 있으면 자유형 매출로 적용 가능하다", () => {
    const result = parseSmartInput({ target: "REVENUE", input: "서울 현장 긴급 보수 2026년 5월 20일 금액 30만원", sites, items, referenceDate });
    expect(result.fields.item.status).toBe("MISSING");
    expect(result.fields.totalAmount.value).toBe(300_000);
    expect(result.canApply).toBe(true);
    expect(result.warnings).toContain("품목 없이 자유형 매출로 적용할 수 있습니다.");
  });

  it("연도 없는 MM/DD 일자와 수량 뒤 단독 금액을 해석한다", () => {
    const result = parseSmartInput({ target: "CONTRACT", input: "서울 센서 07/16 ~ 07/16 5개 5만원", sites, items, referenceDate });

    expect(result.fields.period.value).toEqual({ startDate: "2026-07-16", endDate: "2026-07-16", precision: "DAY" });
    expect(result.fields.quantity.value).toBe(5);
    expect(result.fields.unitPrice.status).toBe("MATCHED");
    expect(result.fields.unitPrice.value).toBe(50_000);
    expect(result.fields.totalAmount.value).toBe(250_000);
  });

  it("연도 없는 MM/DD 범위가 연말을 넘으면 종료 연도를 올린다", () => {
    const result = parseSmartInput({ target: "CONTRACT", input: "서울 센서 12/15 ~ 01/15 1개 5만원", sites, items, referenceDate });

    expect(result.fields.period.value).toEqual({ startDate: "2026-12-15", endDate: "2027-01-15", precision: "DAY" });
  });

  it("같은 달이어도 종료 일이 더 이르면 다음 해로 해석한다", () => {
    const result = parseSmartInput({ target: "CONTRACT", input: "서울 센서 07/20 ~ 07/10 1개 5만원", sites, items, referenceDate });

    expect(result.fields.period.value).toEqual({ startDate: "2026-07-20", endDate: "2027-07-10", precision: "DAY" });
  });

  it("수량 뒤 통화 단위 없는 숫자를 단가로 해석한다", () => {
    const result = parseSmartInput({ target: "CONTRACT", input: "서울 센서 07/16 10ea 100000", sites, items, referenceDate });

    expect(result.fields.unitPrice.status).toBe("MATCHED");
    expect(result.fields.unitPrice.value).toBe(100_000);
    expect(result.fields.totalAmount.value).toBe(1_000_000);
  });

  it("통화 단위가 있는 독립 금액을 단가로 해석한다", () => {
    const result = parseSmartInput({ target: "CONTRACT", input: "서울 센서 07/16 수량 2 7.5만원", sites, items, referenceDate });

    expect(result.fields.unitPrice.status).toBe("MATCHED");
    expect(result.fields.unitPrice.value).toBe(75_000);
    expect(result.fields.totalAmount.value).toBe(150_000);
  });

  it("명시적 총액은 수량 뒤 단독 단가 규칙보다 우선한다", () => {
    const result = parseSmartInput({ target: "CONTRACT", input: "서울 센서 07/16 5개 총액 5만원", sites, items, referenceDate });

    expect(result.fields.totalAmount.status).toBe("MATCHED");
    expect(result.fields.totalAmount.value).toBe(50_000);
    expect(result.fields.unitPrice.status).toBe("DERIVED");
    expect(result.fields.unitPrice.value).toBe(10_000);
  });

  it("유효하지 않은 MM/DD와 문맥 없는 숫자는 신규 규칙으로 해석하지 않는다", () => {
    const result = parseSmartInput({ target: "CONTRACT", input: "서울 센서 13/40 100000", sites, items, referenceDate });

    expect(result.fields.period.status).toBe("MISSING");
    expect(result.fields.unitPrice.status).toBe("DERIVED");
    expect(result.fields.unitPrice.value).toBe(50_000);
  });
});
