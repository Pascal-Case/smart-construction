import { canonicalJson, stableFingerprint } from "@/lib/monthly-close/fingerprint";

type SnapshotInput = {
  siteId: string;
  month: string;
  revenues: Array<{
    id: string;
    version: number;
    status: "DRAFT" | "CONFIRMED" | "CANCELED";
    salesAmount: number;
    costAmount: number | null;
  }>;
  expectedContractRevenues: Array<{ generatedKey: string; salesAmount: number }>;
  exceptions: Array<{ key: string; kind: string; blocking: boolean; fingerprint: string }>;
};

export function buildCloseCycleSnapshot(input: SnapshotInput) {
  const revenueEntries = input.revenues
    .filter((row) => row.status === "CONFIRMED")
    .map((row) => ({
      id: row.id,
      version: row.version,
      salesAmount: row.salesAmount,
      costAmount: row.costAmount ?? 0,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const expectedContractRevenues = [...input.expectedContractRevenues]
    .sort((left, right) => left.generatedKey.localeCompare(right.generatedKey));
  const exceptions = [...input.exceptions].sort((left, right) => left.key.localeCompare(right.key));
  const revenueEntryIds = revenueEntries.map((row) => row.id);
  const snapshot = {
    siteId: input.siteId,
    month: input.month,
    revenueEntryIds,
    revenueEntries,
    expectedContractRevenues,
    exceptions,
  };

  return {
    revenueCount: revenueEntries.length,
    totalSalesAmount: revenueEntries.reduce((sum, row) => sum + row.salesAmount, 0),
    totalCostAmount: revenueEntries.reduce((sum, row) => sum + row.costAmount, 0),
    revenueFingerprint: stableFingerprint(revenueEntries),
    exceptionFingerprint: stableFingerprint(exceptions),
    snapshotJson: canonicalJson(snapshot),
  };
}
