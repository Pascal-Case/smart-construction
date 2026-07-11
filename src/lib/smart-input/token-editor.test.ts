import { describe, expect, it } from "vitest";

import {
  currentTokenAt,
  moveSuggestionIndex,
  removeCurrentToken,
  shouldCommitSuggestion,
} from "@/lib/smart-input/token-editor";

describe("currentTokenAt", () => {
  it("커서가 있는 공백 구분 단어와 범위를 반환한다", () => {
    expect(currentTokenAt("10ea 100000 세종", 14)).toEqual({ value: "세종", start: 12, end: 14 });
    expect(currentTokenAt("서울 세종 현장", 4)).toEqual({ value: "세종", start: 3, end: 5 });
  });

  it("공백 위 커서와 공백뿐인 입력에는 현재 단어가 없다", () => {
    expect(currentTokenAt("서울 세종", 2)).toBeNull();
    expect(currentTokenAt("   ", 1)).toBeNull();
  });

  it("범위를 벗어난 커서 위치를 입력 길이 안으로 제한한다", () => {
    expect(currentTokenAt("세종", 99)).toEqual({ value: "세종", start: 0, end: 2 });
    expect(currentTokenAt("세종", -4)).toEqual({ value: "세종", start: 0, end: 2 });
  });
});

describe("removeCurrentToken", () => {
  it("끝 단어만 제거하고 앞의 자유 입력을 보존한다", () => {
    expect(removeCurrentToken("10ea 100000 세종", 14)).toEqual({ value: "10ea 100000", cursor: 11 });
  });

  it("가운데 단어를 제거하면서 인접 공백 하나를 유지한다", () => {
    expect(removeCurrentToken("서울 세종 10ea", 4)).toEqual({ value: "서울 10ea", cursor: 3 });
  });

  it("현재 단어가 없으면 원문과 커서를 유지한다", () => {
    expect(removeCurrentToken("서울 세종", 2)).toEqual({ value: "서울 세종", cursor: 2 });
  });
});

describe("moveSuggestionIndex", () => {
  it("목록 처음과 끝에서 순환한다", () => {
    expect(moveSuggestionIndex(-1, 1, 3)).toBe(0);
    expect(moveSuggestionIndex(2, 1, 3)).toBe(0);
    expect(moveSuggestionIndex(0, -1, 3)).toBe(2);
  });

  it("빈 목록은 활성 인덱스를 만들지 않는다", () => {
    expect(moveSuggestionIndex(0, 1, 0)).toBe(-1);
  });
});

describe("shouldCommitSuggestion", () => {
  it("조합이 끝난 Enter와 활성 후보만 확정한다", () => {
    expect(shouldCommitSuggestion({ key: "Enter", isComposing: false, activeIndex: 0, itemCount: 2 })).toBe(true);
    expect(shouldCommitSuggestion({ key: "Enter", isComposing: true, activeIndex: 0, itemCount: 2 })).toBe(false);
    expect(shouldCommitSuggestion({ key: "Enter", isComposing: false, activeIndex: -1, itemCount: 2 })).toBe(false);
    expect(shouldCommitSuggestion({ key: "ArrowDown", isComposing: false, activeIndex: 0, itemCount: 2 })).toBe(false);
  });
});
