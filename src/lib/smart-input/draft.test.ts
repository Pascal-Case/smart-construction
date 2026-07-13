import { describe, expect, it } from "vitest";

import { buildSmartInputDraft } from "@/lib/smart-input/draft";
import { parseSmartInput } from "@/lib/smart-input/parser";
import type { SmartMasterOption } from "@/lib/smart-input/types";

const site: SmartMasterOption = { id: "site-seoul", code: "S001", name: "서울 현장", aliases: ["서울"] };
const item: SmartMasterOption = { id: "item-cctv", code: "I001", name: "이동형 CCTV", aliases: ["CCTV"], unit: "EA", standardSalesPrice: 220_000, standardCostPrice: 120_000 };
const referenceDate = new Date("2026-07-10T00:00:00.000Z");

describe("buildSmartInputDraft", () => {
  it("선택한 현장·품목과 연도 없는 기간·단가를 계약 초안으로 전달한다", () => {
    const preview = parseSmartInput({
      target: "CONTRACT",
      input: "07/16 ~ 07/31 5개 5만원",
      sites: [site],
      items: [item],
      selectedSite: site,
      selectedItem: item,
      referenceDate,
    });

    expect(buildSmartInputDraft(preview, site, item)).toMatchObject({
      billingMethod: "PRORATED_TOTAL",
      periodPrecision: "DAY",
      siteId: site.id,
      itemId: item.id,
      quantity: 5,
      appliedSalesPrice: 50_000,
      salesAmount: 250_000,
      startDate: "2026-07-16",
      endDate: "2026-07-31",
    });
  });

  it("월 정밀도는 월정액과 YYYY-MM 경계로 계약 초안에 보존한다", () => {
    const preview = parseSmartInput({
      target: "CONTRACT",
      input: "서울 현장 CCTV 2대 2026년 3월부터 2026년 8월까지",
      sites: [site],
      items: [item],
      selectedSite: site,
      selectedItem: item,
      referenceDate,
    });

    expect(buildSmartInputDraft(preview, site, item)).toMatchObject({
      billingMethod: "MONTHLY_RECURRING",
      periodPrecision: "MONTH",
      startDate: "2026-03",
      endDate: "2026-08",
    });
  });

  it("세 달력 월에 걸친 일 단위 계약 초안은 폼 적용 전에 거부한다", () => {
    const preview = parseSmartInput({
      target: "CONTRACT",
      input: "서울 현장 CCTV 2대 01/31 ~ 03/01",
      sites: [site],
      items: [item],
      selectedSite: site,
      selectedItem: item,
      referenceDate,
    });

    expect(preview.fields.period.value?.precision).toBe("DAY");
    expect(buildSmartInputDraft(preview, site, item)).toBeNull();
  });

  it("선택한 현장·품목과 명시적 총액을 매출 초안으로 전달한다", () => {
    const preview = parseSmartInput({
      target: "REVENUE",
      input: "10개 06/15 총액 100000원",
      sites: [site],
      items: [item],
      selectedSite: site,
      selectedItem: item,
      referenceDate,
    });

    expect(buildSmartInputDraft(preview, site, item)).toMatchObject({
      siteId: site.id,
      itemId: item.id,
      quantity: 10,
      salesAmount: 100_000,
      revenueDate: "2026-06-15",
    });
  });

  it("누락된 품목을 사용자가 선택하면 표준단가로 계약 초안을 완성한다", () => {
    const preview = parseSmartInput({
      target: "CONTRACT",
      input: "서울 현장 장비 2대 2026년 5월",
      sites: [site],
      items: [item],
      referenceDate,
    });
    expect(preview.fields.item.status).toBe("MISSING");
    const draft = buildSmartInputDraft(preview, site, item);
    expect(draft).toMatchObject({
      siteId: site.id,
      itemId: item.id,
      quantity: 2,
      appliedSalesPrice: 220_000,
      salesAmount: 440_000,
      startDate: "2026-05",
      endDate: "2026-05",
    });
  });

  it("품목 없는 직접 총액은 자유형 매출 초안으로 유지한다", () => {
    const preview = parseSmartInput({ target: "REVENUE", input: "서울 현장 긴급 보수 2026-05-20 총 30만원", sites: [site], items: [item], referenceDate });
    const draft = buildSmartInputDraft(preview, site, null);
    expect(draft?.itemId).toBeNull();
    expect(draft?.revenueDate).toBe("2026-05-20");
    expect(draft?.salesAmount).toBe(300_000);
    expect(draft?.appliedSalesPrice).toBeNull();
  });
});
