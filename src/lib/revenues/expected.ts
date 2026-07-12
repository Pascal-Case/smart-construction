import { contractRevenuePolicy } from "@/lib/revenues/generation-policy";
import { buildLineRevenueDrafts } from "@/lib/revenues/proration";

export type ExpectedRevenueContract = {
  id: string;
  title: string;
  siteId: string;
  lines: Array<{
    id: string;
    itemId: string;
    description: string | null;
    quantity: number;
    unit: string;
    standardSalesPriceSnapshot: number;
    appliedSalesPrice: number;
    standardCostPriceSnapshot: number;
    appliedCostPrice: number;
    priceOverrideReason: string | null;
    revenueStartDate: Date;
    revenueEndDate: Date;
    item: { name: string };
  }>;
};

export type ExpectedContractRevenue = ReturnType<typeof buildContractRevenueDrafts>[number];

export type ContractRevenueExisting = {
  id: string;
  version: number;
  status: "DRAFT" | "CONFIRMED" | "CANCELED";
  cancelReason: string | null;
  generatedKey: string | null;
  siteId: string;
  itemId: string | null;
  title: string;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  standardSalesPriceSnapshot: number | null;
  appliedSalesPrice: number | null;
  salesAmount: number;
  prorationDays: number | null;
  daysInMonth: number | null;
  standardCostPriceSnapshot: number | null;
  appliedCostPrice: number | null;
  costAmount: number | null;
  priceOverrideReason: string | null;
  revenueDate: Date;
  servicePeriodStart: Date | null;
  servicePeriodEnd: Date | null;
};

export type GenerationAction = "CREATE" | "RECREATE" | "UPDATE" | "UNCHANGED" | "PROTECTED" | "CANCEL";
export type GenerationRow = {
  action: GenerationAction;
  draft?: ExpectedContractRevenue;
  existing?: ContractRevenueExisting;
  reason?: string;
};

export function buildContractRevenueDrafts(contract: ExpectedRevenueContract) {
  return contract.lines.flatMap((line) => buildLineRevenueDrafts(line).map((month) => ({
    ...month,
    siteId: contract.siteId,
    contractId: contract.id,
    contractLineId: line.id,
    itemId: line.itemId,
    title: contract.title + " - " + line.item.name,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    standardSalesPriceSnapshot: line.standardSalesPriceSnapshot,
    appliedSalesPrice: line.appliedSalesPrice,
    standardCostPriceSnapshot: line.standardCostPriceSnapshot,
    appliedCostPrice: line.appliedCostPrice,
    priceOverrideReason: line.priceOverrideReason,
  })));
}

export function buildGenerationRows(
  drafts: ExpectedContractRevenue[],
  existing: ContractRevenueExisting[],
): GenerationRow[] {
  const byKey = new Map(existing.flatMap((row) => row.generatedKey ? [[row.generatedKey, row] as const] : []));
  const draftKeys = new Set(drafts.map((draft) => draft.generatedKey));
  const rows: GenerationRow[] = drafts.map((draft) => {
    const current = byKey.get(draft.generatedKey);
    if (!current) return { action: "CREATE", draft };
    const policy = contractRevenuePolicy(current);
    if (policy === "PROTECTED") return { action: "PROTECTED", draft, existing: current, reason: "확정 매출" };
    if (policy === "RECREATE") return { action: "RECREATE", draft, existing: current, reason: "사용자 취소 후 재등록" };
    return {
      action: sameExpectedRevenue(current, draft) && current.status === "DRAFT" ? "UNCHANGED" : "UPDATE",
      draft,
      existing: current,
    };
  });

  for (const current of existing) {
    if (!current.generatedKey || draftKeys.has(current.generatedKey)) continue;
    rows.push(current.status === "DRAFT"
      ? { action: "CANCEL", existing: current }
      : {
          action: "PROTECTED",
          existing: current,
          reason: current.status === "CONFIRMED" ? "확정 매출" : "취소 매출",
        });
  }
  return rows;
}

export function countGenerationActions(rows: GenerationRow[]) {
  return {
    create: rows.filter((row) => row.action === "CREATE" || row.action === "RECREATE").length,
    update: rows.filter((row) => row.action === "UPDATE").length,
    unchanged: rows.filter((row) => row.action === "UNCHANGED").length,
    protected: rows.filter((row) => row.action === "PROTECTED").length,
    cancel: rows.filter((row) => row.action === "CANCEL").length,
  };
}

export function sameExpectedRevenue(row: ContractRevenueExisting, draft: ExpectedContractRevenue) {
  return row.siteId === draft.siteId
    && row.itemId === draft.itemId
    && row.title === draft.title
    && row.description === draft.description
    && row.quantity === draft.quantity
    && row.unit === draft.unit
    && row.standardSalesPriceSnapshot === draft.standardSalesPriceSnapshot
    && row.appliedSalesPrice === draft.appliedSalesPrice
    && row.salesAmount === draft.salesAmount
    && row.prorationDays === draft.prorationDays
    && row.daysInMonth === draft.allocationBaseDays
    && row.standardCostPriceSnapshot === draft.standardCostPriceSnapshot
    && row.appliedCostPrice === draft.appliedCostPrice
    && row.costAmount === draft.costAmount
    && row.priceOverrideReason === draft.priceOverrideReason
    && dateKey(row.revenueDate) === dateKey(draft.revenueDate)
    && dateKey(row.servicePeriodStart) === dateKey(draft.servicePeriodStart)
    && dateKey(row.servicePeriodEnd) === dateKey(draft.servicePeriodEnd);
}

function dateKey(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}
