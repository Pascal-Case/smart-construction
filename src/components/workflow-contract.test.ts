import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("registration workflow contract", () => {
  it("새 계약은 진행 상태를 기본값으로 사용한다", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/contracts/contract-manager.tsx"), "utf8");

    expect(source).toContain('defaultValue={row?.status ?? "ACTIVE"}');
  });

  it("직접 매출 등록에서 확정과 작성 중 저장 결과를 구분한다", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/revenues/revenue-manager.tsx"), "utf8");

    expect(source).toContain('value="DRAFT"');
    expect(source).toContain('value="CONFIRMED"');
    expect(source).toContain("작성 중 저장");
    expect(source).toContain("확정 등록");
  });
});
