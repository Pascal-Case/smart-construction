import { describe, expect, it } from "vitest";

import { formatRecentAction } from "@/lib/dashboard/recent-actions";

describe("formatRecentAction", () => {
  it("현장 등록을 사용자와 현장명이 포함된 문장으로 만든다", () => {
    expect(formatRecentAction({ actorName: "김관리", action: "CREATE", entityType: "SITE", afterJson: JSON.stringify({ name: "강남 현장" }) }))
      .toBe("김관리 님이 강남 현장을 등록하였습니다.");
  });

  it("계약 등록과 매출 확정을 대상에 맞게 표현한다", () => {
    expect(formatRecentAction({ actorName: "이담당", action: "CREATE", entityType: "CONTRACT", afterJson: JSON.stringify({ title: "안전용품 계약" }) }))
      .toBe("이담당 님이 안전용품 계약을 등록하였습니다.");
    expect(formatRecentAction({ actorName: null, action: "CONFIRM", entityType: "REVENUE", afterJson: JSON.stringify({ title: "8월 안전모 매출" }) }))
      .toBe("시스템이 8월 안전모 매출을 확정하였습니다.");
  });

  it("알 수 없는 업무 대상이나 손상된 JSON은 일반 문장으로 안전하게 표시한다", () => {
    expect(formatRecentAction({ actorName: "관리자", action: "UPDATE", entityType: "UNKNOWN", afterJson: "{" }))
      .toBe("관리자 님이 업무 데이터를 수정하였습니다.");
  });
});
