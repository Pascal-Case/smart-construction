import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("registration workflow contract", () => {
  it("스마트 입력은 미리보기 후 등록 폼 적용 또는 명시적 바로 등록을 제공한다", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/smart-input/smart-input-dialog.tsx"), "utf8");

    expect(source).toContain('fetch("/api/smart-input/preview"');
    expect(source).toContain("등록 폼 적용");
    expect(source).toContain("registerDirectly");
    expect(source).toContain('target === "CONTRACT" ? "/api/contracts" : "/api/revenues"');
  });

  it("새 계약은 진행 상태를 기본값으로 사용한다", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/contracts/contract-manager.tsx"), "utf8");

    expect(source).toContain('defaultValue={row?.status ?? "ACTIVE"}');
  });

  it("계약 헤더 기간을 입력받지 않고 품목 매출기간만 사용한다", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/contracts/contract-manager.tsx"), "utf8");

    expect(source).not.toContain('label="계약 시작일"');
    expect(source).not.toContain('label="계약 종료일"');
    expect(source).toContain("매출기간");
    expect(source).toContain("current.at(-1)");
  });

  it("직접 매출 등록에서 확정과 작성 중 저장 결과를 구분한다", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/revenues/revenue-editor.tsx"), "utf8");

    expect(source).toContain('value="DRAFT"');
    expect(source).toContain('value="CONFIRMED"');
    expect(source).toContain("작성 중 저장");
    expect(source).toContain("확정 등록");
  });

  it("월별 상세에서 선택한 현장과 월을 유지한 채 매출 등록을 시작한다", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/reports/monthly-report.tsx"), "utf8");

    expect(source).toContain("이 현장·월 매출 등록");
    expect(source).toContain("RevenueEditor");
    expect(source).toContain("initialContext");
  });
});
