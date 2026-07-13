import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "src/components/smart-input/smart-input-dialog.tsx"),
  "utf8",
);
const draftSource = readFileSync(
  path.join(process.cwd(), "src/lib/smart-input/draft.ts"),
  "utf8",
);

describe("smart input token editor contract", () => {
  it("현재 토큰으로 최신 혼합 후보만 조회한다", () => {
    expect(source).toContain("currentTokenAt");
    expect(source).toContain("/api/smart-input/suggestions");
    expect(source).toContain("AbortController");
    expect(source).toContain("body.suggestions ?? []");
    expect(source).toContain('type === "SITE"');
  });

  it("선택한 현장과 품목을 명시적 제거 가능한 배지로 표시한다", () => {
    expect(source).toContain("selectedSite");
    expect(source).toContain("selectedItem");
    expect(source).toContain('suggestion.type === "SITE" ? "현장" : "품목"');
    expect(source).toContain('aria-label={`선택한 ${typeLabel} 제거`}');
    expect(source).toContain("/ 현장");
    expect(source).toContain("/ 품목");
  });

  it("키보드와 IME 안전 규칙을 U1 순수 함수에 연결한다", () => {
    expect(source).toContain("moveSuggestionIndex");
    expect(source).toContain("removeCurrentToken");
    expect(source).toContain("shouldCommitSuggestion");
    expect(source).toContain("isComposing");
    expect(source).toContain('event.key === "Backspace"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("requestAnimationFrame(() => {");
    expect(source).toContain("textarea.selectionStart");
    expect(source).toContain("onInput={(event) => syncInput(event.currentTarget)}");
  });

  it("추천 패널이 다음 버튼을 가리지 않도록 문서 흐름 안에 표시된다", () => {
    expect(source).not.toContain('className="absolute z-20 mt-1 w-full');
    expect(source).toContain('className="z-20 mt-1 w-full');
  });

  it("편집 가능한 combobox와 추천 상태를 보조 기술에 노출한다", () => {
    expect(source).toContain('role="combobox"');
    expect(source).toContain('aria-autocomplete="list"');
    expect(source).toContain("aria-activedescendant");
    expect(source).toContain('role="listbox"');
    expect(source).toContain('role="option"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("추천 검색 중");
    expect(source).toContain("일치하는 현장·품목이 없습니다");
    expect(source).toContain("추천을 불러오지 못했습니다");
  });

  it("선택 ID를 preview에 보내고 무효 선택 409를 복구한다", () => {
    expect(source).toContain("selectedSiteId");
    expect(source).toContain("selectedItemId");
    expect(source).toContain("SELECTED_SITE_INVALID");
    expect(source).toContain("SELECTED_ITEM_INVALID");
    expect(source).toContain("다시 선택해 주세요");
  });

  it("preview-first 적용과 분석 후 fallback 선택 카드를 유지한다", () => {
    expect(source).toContain("등록 폼 적용");
    expect(source).toContain("바로 등록하면 현재 분석 결과가 즉시 저장됩니다");
    expect(source).toContain("<MasterCard");
    expect(source).toContain('target === "CONTRACT" ? "계약 등록" : "매출 등록"');
    expect(source).toContain("buildDirectRegistrationPayload");
  });

  it("계약 기간 정밀도를 월정액·일할청구로 안내하고 두 달 초과는 두 등록 경로 모두 막는다", () => {
    expect(source).toContain("billingMethodLabel");
    expect(source).toContain("월정액");
    expect(source).toContain("일할청구");
    expect(source).toContain("smartInputContractPeriodError");
    expect(source).toContain("periodError");
    expect(draftSource).toContain("일할청구는 최대 두 달력 월");
    expect(source).not.toContain("적용 예정: {draft?.billingMethod");
  });
});
