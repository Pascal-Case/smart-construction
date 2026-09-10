export type IssuanceCandidateState = {
  targetKey: string;
  kind: "NEW" | "REPLACEMENT" | "BLOCKED";
  selectable: boolean;
  supplyAmount: number;
};

export type IssuanceResultState = {
  targetKey: string;
  outcome: "ISSUED" | "BLOCKED" | "ALREADY_ISSUED";
  candidateKeys?: string[];
  error?: { message: string };
};

export type IssueGroupingCandidate = {
  targetKey: string;
  kind: "NEW";
  selectable: boolean;
  supplyAmount: number;
  siteId: string;
  siteName: string;
  contractCategoryId: string | null;
  contractCategoryName: string | null;
  cycleId: string;
  closeVersion: number;
  revenueFingerprint: string;
  issueItemId: string | null;
};

export type IssueGroup = {
  groupKey: string;
  automaticGroupKey: string;
  siteName: string;
  contractCategoryName: string | null;
  issueDate: string;
  candidateKeys: string[];
  selectedKeys: string[];
  supplyAmount: number;
  selectedAmount: number;
  manual: boolean;
  cycleId: string;
  closeVersion: number;
  revenueFingerprint: string;
  contractCategoryId: string | null;
  issueItemIds: Array<string | null>;
};

export function automaticIssueGroupKey(candidate: Pick<IssueGroupingCandidate, "siteId" | "contractCategoryId">, issueDate: string) {
  return [candidate.siteId, candidate.contractCategoryId ?? "none", issueDate].join(":");
}

export function buildIssueGroups(
  candidates: IssueGroupingCandidate[],
  selected: string[],
  issueDates: Record<string, string>,
  manualGroupKeys: Record<string, string>,
  defaultDate: string,
) {
  const selectedKeys = new Set(selected);
  const groups = new Map<string, IssueGroup>();
  for (const candidate of candidates.filter((row) => row.selectable)) {
    const issueDate = issueDates[candidate.targetKey] ?? defaultDate;
    const automaticGroupKey = automaticIssueGroupKey(candidate, issueDate);
    const groupKey = manualGroupKeys[candidate.targetKey] ?? automaticGroupKey;
    const existing = groups.get(groupKey);
    const selectedCandidate = selectedKeys.has(candidate.targetKey);
    if (existing) {
      existing.candidateKeys.push(candidate.targetKey);
      if (selectedCandidate) existing.selectedKeys.push(candidate.targetKey);
      existing.supplyAmount += candidate.supplyAmount;
      if (selectedCandidate) existing.selectedAmount += candidate.supplyAmount;
      if (!existing.issueItemIds.some((itemId) => itemId === candidate.issueItemId)) existing.issueItemIds.push(candidate.issueItemId);
      continue;
    }
    groups.set(groupKey, {
      groupKey,
      automaticGroupKey,
      siteName: candidate.siteName,
      contractCategoryName: candidate.contractCategoryName,
      issueDate,
      candidateKeys: [candidate.targetKey],
      selectedKeys: selectedCandidate ? [candidate.targetKey] : [],
      supplyAmount: candidate.supplyAmount,
      selectedAmount: selectedCandidate ? candidate.supplyAmount : 0,
      manual: groupKey !== automaticGroupKey,
      cycleId: candidate.cycleId,
      closeVersion: candidate.closeVersion,
      revenueFingerprint: candidate.revenueFingerprint,
      contractCategoryId: candidate.contractCategoryId,
      issueItemIds: [candidate.issueItemId],
    });
  }
  return [...groups.values()];
}

export function buildNewIssueTargets(
  candidates: IssueGroupingCandidate[],
  selected: string[],
  issueDates: Record<string, string>,
  manualGroupKeys: Record<string, string>,
  defaultDate: string,
) {
  return buildIssueGroups(candidates, selected, issueDates, manualGroupKeys, defaultDate)
    .filter((group) => group.selectedKeys.length > 0)
    .map((group) => ({
      targetKey: `new:${group.groupKey}`,
      kind: "NEW" as const,
      cycleId: group.cycleId,
      expectedCloseVersion: group.closeVersion,
      expectedRevenueFingerprint: group.revenueFingerprint,
      contractCategoryId: group.contractCategoryId,
      issueItemIds: group.issueItemIds,
      documentGroupKey: group.groupKey,
      candidateKeys: group.selectedKeys,
      issueDate: group.issueDate,
    }));
}

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
  const blockedKeys = new Set(blocked.flatMap((result) => result.candidateKeys ?? [result.targetKey]));
  return {
    selected: selected.filter((key) => blockedKeys.has(key)),
    errors: Object.fromEntries(blocked.map((result) => [result.targetKey, result.error?.message ?? "발행하지 못했습니다."])),
  };
}

export function preserveCandidateIssueDates(
  current: Record<string, string>,
  candidates: Array<{ targetKey: string }>,
  defaultDate: string,
) {
  return Object.fromEntries(candidates.map((candidate) => [candidate.targetKey, current[candidate.targetKey] ?? defaultDate]));
}

export function applyIssueDateToSelected(current: Record<string, string>, selected: string[], issueDate: string) {
  const selectedKeys = new Set(selected);
  return Object.fromEntries(Object.entries(current).map(([targetKey, value]) => [targetKey, selectedKeys.has(targetKey) ? issueDate : value]));
}
