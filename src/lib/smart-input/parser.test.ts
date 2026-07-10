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
});
