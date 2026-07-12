export type IssuanceCandidateState = {
  targetKey: string;
  kind: "NEW" | "REPLACEMENT" | "BLOCKED";
  selectable: boolean;
  supplyAmount: number;
};

export type IssuanceResultState = {
  targetKey: string;
  outcome: "ISSUED" | "BLOCKED" | "ALREADY_ISSUED";
  error?: { message: string };
};

export function toggleAllSelectable(selected: string[], candidates: IssuanceCandidateState[]) {
  const selectableKeys = candidates.filter((candidate) => candidate.selectable).map((candidate) => candidate.targetKey);
  return selectableKeys.length > 0 && selectableKeys.every((key) => selected.includes(key)) ? [] : selectableKeys;
}

export function selectionSummary(selected: string[], candidates: IssuanceCandidateState[]) {
  const selectedRows = candidates.filter((candidate) => candidate.selectable && selected.includes(candidate.targetKey));
  return {
    total: selectedRows.length,
    newCount: selectedRows.filter((candidate) => candidate.kind === "NEW").length,
    replacementCount: selectedRows.filter((candidate) => candidate.kind === "REPLACEMENT").length,
    supplyAmount: selectedRows.reduce((sum, candidate) => sum + candidate.supplyAmount, 0),
  };
}

export function reconcileIssueResults(selected: string[], results: IssuanceResultState[]) {
  const blocked = results.filter((result) => result.outcome === "BLOCKED");
  const blockedKeys = new Set(blocked.map((result) => result.targetKey));
  return {
    selected: selected.filter((key) => blockedKeys.has(key)),
    errors: Object.fromEntries(blocked.map((result) => [result.targetKey, result.error?.message ?? "발행하지 못했습니다."])),
  };
}
