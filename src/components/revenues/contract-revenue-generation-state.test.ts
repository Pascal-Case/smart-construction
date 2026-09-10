import { describe, expect, it } from "vitest";

import { limitSearchSelection, retainBlockedContractSelection, toggleCandidatePageSelection, toggleCandidateSelection } from "@/components/revenues/contract-revenue-generation-state";

describe("contract revenue generation selection state", () => {
  it("페이지 선택은 다른 페이지에서 선택한 계약을 보존한다", () => {
    expect(toggleCandidatePageSelection(["contract-1"], ["contract-2", "contract-3"])).toEqual(["contract-1", "contract-2", "contract-3"]);
    expect(toggleCandidatePageSelection(["contract-1", "contract-2", "contract-3"], ["contract-2", "contract-3"])).toEqual(["contract-1"]);
  });

  it("검색 결과 전체 선택은 중복을 제거하고 최대 100건만 선택한다", () => {
    expect(limitSearchSelection(["contract-1", "contract-1", ...Array.from({ length: 101 }, (_, index) => `contract-${index + 2}`)])).toHaveLength(100);
    expect(toggleCandidateSelection(Array.from({ length: 100 }, (_, index) => `contract-${index}`), "contract-101")).toHaveLength(100);
  });

  it("일괄 처리 후 차단된 계약만 재시도 선택으로 남긴다", () => {
    expect(retainBlockedContractSelection(["contract-1", "contract-2", "contract-3"], [
      { contractId: "contract-1", outcome: "GENERATED" },
      { contractId: "contract-2", outcome: "BLOCKED" },
      { contractId: "contract-3", outcome: "BLOCKED" },
    ])).toEqual(["contract-2", "contract-3"]);
  });
});
