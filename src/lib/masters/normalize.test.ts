import { describe, expect, it } from "vitest";

import { cleanAliases, normalizeAlias, normalizeCode } from "@/lib/masters/normalize";

describe("master normalization", () => {
  it("코드를 대문자와 NFKC 형식으로 정규화한다", () => {
    expect(normalizeCode(" ｓｉｔｅ-01 ")).toBe("SITE-01");
  });

  it("별칭 비교에서 대소문자와 연속 공백을 무시한다", () => {
    expect(normalizeAlias("  강남   A현장 ")).toBe("강남 a현장");
  });

  it("마스터명과 같은 별칭 및 중복 별칭을 제거한다", () => {
    expect(cleanAliases(["강남 현장", " A현장 ", "a현장", "CCTV"], "강남 현장"))
      .toEqual([
        { alias: "A현장", normalizedAlias: "a현장" },
        { alias: "CCTV", normalizedAlias: "cctv" },
      ]);
  });
});
