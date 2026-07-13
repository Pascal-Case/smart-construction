import { stableFingerprint } from "@/lib/monthly-close/fingerprint";
import { replacementRequiredForPeriod } from "@/lib/invoices/replacement-policy";
import type {
  MonthCloseEvaluation,
  MonthCloseEvaluationInput,
  MonthCloseException,
  MonthCloseExpectedRevenue,
  MonthCloseRevenue,
} from "@/lib/monthly-close/types";

export function evaluateSiteMonth(input: MonthCloseEvaluationInput): MonthCloseEvaluation {
  const revenues = input.revenues.filter((row) => row.revenueDate.slice(0, 7) === input.month && row.status !== "CANCELED");
  const reviews = new Set(input.reviews.map((review) => review.exceptionKey + ":" + review.fingerprint));
  const exceptions: MonthCloseException[] = [];
  const contractRevenues = revenues.filter((row) => row.sourceType === "CONTRACT");
  const actualByKey = new Map(contractRevenues.flatMap((row) => row.generatedKey ? [[row.generatedKey, row] as const] : []));
  const expectedKeys = new Set(input.expectedContractRevenues.map((row) => row.generatedKey));

  for (const expected of input.expectedContractRevenues) {
    const actual = actualByKey.get(expected.generatedKey);
    if (!actual || !sameContractValue(expected, actual)) {
      exceptions.push(reviewableException({
        key: "CONTRACT_DIFFERENCE:" + expected.generatedKey,
        kind: "CONTRACT_DIFFERENCE",
        expected,
        actual,
        message: actual ? "계약 기준과 원장 금액이 다릅니다." : "계약 기준 매출이 원장에 없습니다.",
      }, reviews));
    }
  }
  for (const actual of contractRevenues) {
    if (actual.generatedKey && expectedKeys.has(actual.generatedKey)) continue;
    exceptions.push(reviewableException({
      key: "CONTRACT_DIFFERENCE:" + (actual.generatedKey ?? actual.id),
      kind: "CONTRACT_DIFFERENCE",
      actual,
      message: "현재 계약 기준에 없는 계약 매출이 원장에 있습니다.",
    }, reviews));
  }

  for (const revenue of revenues) {
    if (revenue.sourceType === "MANUAL" || revenue.sourceType === "ADJUSTMENT") {
      exceptions.push(reviewableException({
        key: "DIRECT_INPUT:" + revenue.id,
        kind: "DIRECT_INPUT",
        actual: revenue,
        revenueEntryId: revenue.id,
        message: revenue.sourceType === "ADJUSTMENT" ? "조정 입력 매출입니다." : "계약에 연결되지 않은 직접 입력 매출입니다.",
      }, reviews));
    }
    if (revenue.status === "DRAFT") {
      const fingerprint = stableFingerprint(revenueState(revenue));
      exceptions.push({
        key: "DRAFT_REVENUE:" + revenue.id,
        kind: "DRAFT_REVENUE",
        blocking: true,
        reviewable: false,
        reviewed: false,
        fingerprint,
        revenueEntryId: revenue.id,
        actual: revenue,
        message: "작성 중 매출을 확정하거나 취소해야 합니다.",
      });
    }
  }

  if (input.invoiceDocuments.some((document) => document.status === "SUPERSEDED")) {
    exceptions.push({
      key: "INVOICE_HISTORY:" + input.site.id + ":" + input.month,
      kind: "INVOICE_HISTORY",
      blocking: false,
      reviewable: false,
      reviewed: false,
      fingerprint: stableFingerprint(input.invoiceDocuments),
      message: "대체된 과거 거래명세표 이력이 있습니다.",
    });
  }

  const replacementRequired = needsReplacement(input);
  if (replacementRequired) {
    exceptions.push({
      key: "REPLACEMENT_REQUIRED:" + input.site.id + ":" + input.month,
      kind: "REPLACEMENT_REQUIRED",
      blocking: false,
      reviewable: false,
      reviewed: false,
      fingerprint: stableFingerprint({ snapshot: input.latestCloseSnapshot, invoices: currentInvoiceState(input) }),
      message: "최신 마감 결과와 현재 거래명세표가 달라 대체발행이 필요합니다.",
    });
  }

  const confirmed = revenues.filter((row) => row.status === "CONFIRMED");
  const blockingCount = exceptions.filter((item) => item.blocking).length;
  return {
    site: input.site,
    month: input.month,
    exceptions,
    blockingCount,
    canClose: blockingCount === 0,
    replacementRequired,
    totals: {
      revenueCount: confirmed.length,
      totalSalesAmount: confirmed.reduce((sum, row) => sum + row.salesAmount, 0),
      totalCostAmount: confirmed.reduce((sum, row) => sum + (row.costAmount ?? 0), 0),
    },
    fingerprint: stableFingerprint({
      siteId: input.site.id,
      month: input.month,
      expected: input.expectedContractRevenues,
      revenues: revenues.map(revenueState),
      reviews: input.reviews,
      invoices: input.invoiceDocuments,
      latestCloseSnapshot: input.latestCloseSnapshot,
    }),
  };
}

function reviewableException(
  input: Omit<MonthCloseException, "blocking" | "reviewable" | "reviewed" | "fingerprint">,
  reviews: Set<string>,
): MonthCloseException {
  const fingerprint = stableFingerprint({
    key: input.key,
    expected: input.expected,
    actual: input.actual ? revenueState(input.actual) : null,
  });
  const reviewed = reviews.has(input.key + ":" + fingerprint);
  return { ...input, fingerprint, blocking: !reviewed, reviewable: true, reviewed };
}

function sameContractValue(expected: MonthCloseExpectedRevenue, actual: MonthCloseRevenue) {
  return expected.contractId === actual.contractId
    && expected.contractLineId === actual.contractLineId
    && expected.itemId === actual.itemId
    && expected.quantity === actual.quantity
    && expected.appliedSalesPrice === actual.appliedSalesPrice
    && expected.appliedCostPrice === actual.appliedCostPrice
    && expected.salesAmount === actual.salesAmount
    && expected.costAmount === actual.costAmount;
}

function revenueState(revenue: MonthCloseRevenue) {
  return {
    id: revenue.id,
    version: revenue.version,
    revenueDate: revenue.revenueDate,
    sourceType: revenue.sourceType,
    status: revenue.status,
    generatedKey: revenue.generatedKey,
    contractId: revenue.contractId,
    contractLineId: revenue.contractLineId,
    itemId: revenue.itemId,
    quantity: revenue.quantity,
    appliedSalesPrice: revenue.appliedSalesPrice,
    appliedCostPrice: revenue.appliedCostPrice,
    salesAmount: revenue.salesAmount,
    costAmount: revenue.costAmount,
    priceOverrideReason: revenue.priceOverrideReason,
  };
}

function currentInvoiceState(input: MonthCloseEvaluationInput) {
  const current = input.invoiceDocuments.filter((document) => document.status === "ISSUED");
  return {
    revenueEntryIds: [...new Set(current.flatMap((document) => document.revenueEntryIds))].sort(),
    totalSalesAmount: current.reduce((sum, document) => sum + document.subtotal, 0),
  };
}

function needsReplacement(input: MonthCloseEvaluationInput) {
  if (!input.latestCloseSnapshot) return false;
  const current = currentInvoiceState(input);
  if (current.revenueEntryIds.length === 0) return false;
  return replacementRequiredForPeriod([
    input.latestCloseSnapshot,
  ], [{
    revenueEntryIds: current.revenueEntryIds,
    subtotal: current.totalSalesAmount,
  }]);
}
