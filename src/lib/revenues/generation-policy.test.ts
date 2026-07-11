import { describe, expect, it } from "vitest";

import { contractRevenuePolicy, generatedKeyAfterUserCancel } from "@/lib/revenues/generation-policy";

describe("contract revenue generation policy", () => {
  it("사용자가 취소한 계약 매출은 같은 월에 다시 생성할 수 있다", () => {
    expect(contractRevenuePolicy({ status: "CANCELED", cancelReason: "사용자 입력 사유" })).toBe("RECREATE");
  });

  it("확정 매출은 보호하고 시스템 자동 취소는 기존 행을 갱신한다", () => {
    expect(contractRevenuePolicy({ status: "CONFIRMED", cancelReason: null })).toBe("PROTECTED");
    expect(contractRevenuePolicy({ status: "CANCELED", cancelReason: "계약 변경으로 자동 매출 생성 대상에서 제외" })).toBe("MUTABLE");
    expect(contractRevenuePolicy({ status: "DRAFT", cancelReason: null })).toBe("MUTABLE");
  });

  it("사용자 취소 시 계약 자동 매출의 중복 방지 키만 해제한다", () => {
    expect(generatedKeyAfterUserCancel("CONTRACT", "line-1:2026-07")).toBeNull();
    expect(generatedKeyAfterUserCancel("MANUAL", "manual-key")).toBe("manual-key");
  });
});
