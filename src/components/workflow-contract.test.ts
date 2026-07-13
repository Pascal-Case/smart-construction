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

  it("계약 품목은 월정액 기본과 방식별 기간 입력 및 legacy 복귀를 제공한다", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/contracts/contract-manager.tsx"), "utf8");

    expect(source).toContain('billingMethod: "MONTHLY_RECURRING"');
    expect(source).toContain('type={line.billingMethod === "MONTHLY_RECURRING" ? "month" : "date"}');
    expect(source).toContain("changeBillingMethod");
    expect(source).toContain("기존 계산 유지");
    expect(source).toContain("line.legacyPeriod");
    expect(source).toContain("billingPayloadFields");
    expect(source).toContain("spansMoreThanTwoCalendarMonths");
    expect(source).toContain("일할청구는 최대 두 달력 월에 걸쳐 등록할 수 있습니다.");
  });

  it("계약 목록과 자동 매출 미리보기는 청구 방식별 의미를 사용자 용어로 표시한다", () => {
    const contractSource = readFileSync(path.join(process.cwd(), "src/components/contracts/contract-manager.tsx"), "utf8");
    const revenueSource = readFileSync(path.join(process.cwd(), "src/components/revenues/revenue-manager.tsx"), "utf8");

    expect(contractSource).toContain("품목 기준금액 합계");
    expect(contractSource).toContain("월정액은 월별 금액, 일할·기존 계산은 배분 전 총액");
    expect(revenueSource).toContain("billingBasisLabel");
    expect(revenueSource).toContain("월정액 전액");
    expect(revenueSource).toContain("기존 계산 · 전체기간");
    expect(revenueSource).not.toContain("계약 총액을 전체 매출기간의 일수로 나눠");
  });

  it("직접 매출 등록에서 확정과 작성 중 저장 결과를 구분한다", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/revenues/revenue-editor.tsx"), "utf8");

    expect(source).toContain('value="DRAFT"');
    expect(source).toContain('value="CONFIRMED"');
    expect(source).toContain("작성 중 저장");
    expect(source).toContain("확정 등록");
  });

  it("매출 원장은 현재 페이지의 작성 중 계약 매출을 선택해 일괄 확정한다", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/revenues/revenue-manager.tsx"), "utf8");

    expect(source).toContain("현재 페이지의 작성 중 계약 매출 전체 선택");
    expect(source).toContain("계약 매출 일괄 확정");
    expect(source).toContain('fetch("/api/revenues/confirm-batch"');
    expect(source).toContain('row.sourceType === "CONTRACT" && row.status === "DRAFT"');
  });

  it("월별 상세에서 선택한 현장과 월을 유지한 채 매출 등록을 시작한다", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/reports/monthly-report.tsx"), "utf8");

    expect(source).toContain("빠른 매출 등록");
    expect(source).toContain("RevenueEditor");
    expect(source).toContain("initialContext");
  });

  it("대시보드는 처리할 매출 예외를 작업 화면으로 연결한다", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/(main)/page.tsx"), "utf8");

    expect(source).toContain("오늘의 조치 데스크");
    expect(source).toContain("작성 중 매출");
    expect(source).toContain("0원 매출");
    expect(source).toContain("마감 후 미발행");
    expect(source).toContain('/revenues?exception=ZERO');
  });

  it("거래명세표 이력은 최신본 대체 발행과 과거본 상태를 구분한다", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/invoices/invoice-manager.tsx"), "utf8");

    expect(source).toContain("대체 발행 미리보기");
    expect(source).toContain("월 전체 대체 발행");
    expect(source).toContain('row.status === "ISSUED"');
    expect(source).toContain("대체됨");
    expect(source).toContain("확정 매출이 없는 진행 계약");
  });

  it("거래명세표 발행 대기는 신규와 대체를 함께 선택하고 부분 실패를 보존한다", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/invoices/invoice-manager.tsx"), "utf8");

    expect(source).toContain("발행 대기");
    expect(source).toContain("toggleAllSelectable");
    expect(source).toContain('kind: "REPLACEMENT"');
    expect(source).toContain("expectedActiveInvoiceIds");
    expect(source).toContain("reconcileIssueResults");
    expect(source).toContain('id="new-issue"');
  });

  it("현재 사용자 화면과 운영 문서는 매출 기준 용어를 사용한다", () => {
    const files = [
      "src/components/app-shell.tsx",
      "src/components/revenues/revenue-editor.tsx",
      "src/components/revenues/revenue-manager.tsx",
      "src/components/invoices/invoice-manager.tsx",
      "src/components/reports/month-close-control-room.tsx",
      "src/components/reports/monthly-report.tsx",
      "src/components/smart-input/smart-input-dialog.tsx",
      "src/lib/smart-input/parser.ts",
      "src/lib/excel/revenue-workbook.ts",
      "USER_GUIDE.md",
      "OPERATIONS_GUIDE.md",
      "IMPLEMENTATION_PLAN.md",
    ];
    const currentSurfaces = files.map((file) => readFileSync(path.join(process.cwd(), file), "utf8")).join("\n");

    const legacyTerms = ["관" + "제실", "귀속" + "일", "귀속" + "월", "귀속" + "기간"];
    expect(currentSurfaces).not.toMatch(new RegExp(legacyTerms.join("|")));
    expect(currentSurfaces).toContain("월마감");
    expect(currentSurfaces).toContain("매출일");
    expect(currentSurfaces).toContain("매출월");
    expect(currentSurfaces).toContain("매출기간");
  });
});
