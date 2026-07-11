import { describe, expect, it } from "vitest";

import { parseSmartInput } from "@/lib/smart-input/parser";
import { smartInputPreviewSchema, smartInputSuggestionsQuerySchema } from "@/lib/smart-input/schemas";
import { findSmartInputSuggestions, resolveSelectedMaster } from "@/lib/smart-input/suggestions";
import type { SmartMasterOption, SmartSuggestionSource } from "@/lib/smart-input/types";

const site = (overrides: Partial<SmartSuggestionSource> & Pick<SmartSuggestionSource, "id" | "code" | "name">): SmartSuggestionSource => ({
  aliases: [],
  isActive: true,
  type: "SITE",
  ...overrides,
});

const item = (overrides: Partial<SmartSuggestionSource> & Pick<SmartSuggestionSource, "id" | "code" | "name">): SmartSuggestionSource => ({
  aliases: [],
  isActive: true,
  type: "ITEM",
  ...overrides,
});

describe("findSmartInputSuggestions", () => {
  it("정규화된 정확 일치와 이름·코드·별칭 우선순위로 정렬한다", () => {
    const rows = findSmartInputSuggestions(" 판교 ", [
      site({ id: "alias", code: "SITE-3000", name: "제3현장", aliases: ["판 교"] }),
      site({ id: "code", code: "판교", name: "제2현장" }),
      site({ id: "name", code: "SITE-1000", name: "판교" }),
      site({ id: "prefix", code: "SITE-4000", name: "판교 제4현장" }),
    ]);

    expect(rows.map((row) => row.id)).toEqual(["name", "code", "alias", "prefix"]);
  });

  it("같은 검색어와 일치하는 현장과 품목을 함께 반환한다", () => {
    const rows = findSmartInputSuggestions("세종", [
      site({ id: "site-sejong", code: "SITE-0001", name: "세종 현장", aliases: ["세종"] }),
      item({ id: "item-sejong", code: "ITEM-0001", name: "세종 장비", aliases: ["세종"] }),
    ]);

    expect(rows.map(({ id, type }) => ({ id, type }))).toEqual([
      { id: "site-sejong", type: "SITE" },
      { id: "item-sejong", type: "ITEM" },
    ]);
  });

  it("비활성 항목을 제외하고 결과를 상위 8개로 제한한다", () => {
    const rows = findSmartInputSuggestions("현장", [
      site({ id: "inactive", code: "SITE-X", name: "비활성 현장", isActive: false }),
      ...Array.from({ length: 10 }, (_, index) => site({ id: `site-${index}`, code: `SITE-${index}`, name: `현장 ${index}` })),
    ]);

    expect(rows).toHaveLength(8);
    expect(rows.some((row) => row.id === "inactive")).toBe(false);
  });
});

describe("selected master preview authority", () => {
  const selectedSite: SmartMasterOption = { id: "site-selected", code: "SITE-0002", name: "판교2", aliases: ["판교"] };
  const selectedItem: SmartMasterOption = { id: "item-selected", code: "ITEM-0001", name: "안전 센서", aliases: ["센서"], unit: "EA", standardSalesPrice: 50_000, standardCostPrice: 30_000 };

  it("선택 ID에 해당하는 마스터가 자유 입력의 다른 후보보다 우선한다", () => {
    const preview = parseSmartInput({
      target: "CONTRACT",
      input: "판교1 CCTV 07/16 2개 5만원",
      sites: [selectedSite, { id: "site-text", code: "SITE-0001", name: "판교1", aliases: [] }],
      items: [selectedItem, { id: "item-text", code: "ITEM-0002", name: "CCTV", aliases: [], unit: "EA", standardSalesPrice: 220_000, standardCostPrice: 120_000 }],
      selectedSite,
      selectedItem,
      referenceDate: new Date("2026-07-11T00:00:00.000Z"),
    });

    expect(preview.fields.site.value?.id).toBe("site-selected");
    expect(preview.fields.item.value?.id).toBe("item-selected");
    expect(preview.canApply).toBe(true);
  });

  it("존재하지 않거나 비활성인 선택 ID를 fail closed 한다", () => {
    const options: SmartMasterOption[] = [{ id: "active", code: "SITE-1", name: "활성 현장", aliases: [] }];

    expect(() => resolveSelectedMaster(options, "missing", "현장", "SELECTED_SITE_INVALID")).toThrowError(expect.objectContaining({ code: "SELECTED_SITE_INVALID", status: 409 }));
  });
});

describe("smart input request schemas", () => {
  it("추천 검색어를 trim하고 짧거나 긴 검색어를 거부한다", () => {
    expect(smartInputSuggestionsQuerySchema.parse({ q: "  판교  " })).toEqual({ q: "판교" });
    expect(() => smartInputSuggestionsQuerySchema.parse({ q: "가" })).toThrow();
    expect(() => smartInputSuggestionsQuerySchema.parse({ q: "가".repeat(101) })).toThrow();
  });

  it("preview 선택 ID를 허용하고 빈 ID를 거부한다", () => {
    expect(smartInputPreviewSchema.parse({ target: "REVENUE", input: "07/16 총액 5만원", selectedSiteId: "site-1", selectedItemId: "item-1" })).toMatchObject({ selectedSiteId: "site-1", selectedItemId: "item-1" });
    expect(() => smartInputPreviewSchema.parse({ target: "REVENUE", input: "07/16 총액 5만원", selectedSiteId: "" })).toThrow();
  });
});
