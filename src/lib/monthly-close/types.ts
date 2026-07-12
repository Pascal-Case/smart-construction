export type MonthCloseExceptionKind =
  | "CONTRACT_DIFFERENCE"
  | "DIRECT_INPUT"
  | "DRAFT_REVENUE"
  | "INVOICE_HISTORY"
  | "REPLACEMENT_REQUIRED";

export type MonthCloseSite = { id: string; code: string; name: string };

export type MonthCloseExpectedRevenue = {
  generatedKey: string;
  contractId: string;
  contractLineId: string;
  itemId: string | null;
  title: string;
  quantity: number | null;
  appliedSalesPrice: number | null;
  salesAmount: number;
};

export type MonthCloseRevenue = {
  id: string;
  version: number;
  revenueDate: string;
  sourceType: "CONTRACT" | "MANUAL" | "ADJUSTMENT";
  status: "DRAFT" | "CONFIRMED" | "CANCELED";
  generatedKey: string | null;
  contractId: string | null;
  contractLineId: string | null;
  itemId: string | null;
  title: string;
  quantity: number | null;
  appliedSalesPrice: number | null;
  salesAmount: number;
  costAmount: number | null;
  priceOverrideReason: string | null;
};

export type MonthCloseReview = {
  exceptionKey: string;
  fingerprint: string;
  reason: string;
};

export type MonthCloseInvoiceSummary = {
  id: string;
  status: "DRAFT" | "ISSUED" | "SUPERSEDED";
  revenueEntryIds: string[];
  subtotal: number;
};

export type MonthCloseSnapshotSummary = {
  revenueEntryIds: string[];
  totalSalesAmount: number;
};

export type MonthCloseEvaluationInput = {
  site: MonthCloseSite;
  month: string;
  expectedContractRevenues: MonthCloseExpectedRevenue[];
  revenues: MonthCloseRevenue[];
  reviews: MonthCloseReview[];
  invoiceDocuments: MonthCloseInvoiceSummary[];
  latestCloseSnapshot: MonthCloseSnapshotSummary | null;
};

export type MonthCloseException = {
  key: string;
  kind: MonthCloseExceptionKind;
  blocking: boolean;
  reviewable: boolean;
  reviewed: boolean;
  fingerprint: string;
  revenueEntryId?: string;
  expected?: MonthCloseExpectedRevenue;
  actual?: MonthCloseRevenue;
  message: string;
};

export type MonthCloseEvaluation = {
  site: MonthCloseSite;
  month: string;
  exceptions: MonthCloseException[];
  blockingCount: number;
  canClose: boolean;
  replacementRequired: boolean;
  totals: {
    revenueCount: number;
    totalSalesAmount: number;
    totalCostAmount: number;
  };
  fingerprint: string;
};
