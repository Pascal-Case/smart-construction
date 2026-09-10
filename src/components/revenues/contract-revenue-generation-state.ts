export type ContractGenerationResultState = { contractId: string; outcome: "GENERATED" | "BLOCKED" };

export function toggleCandidatePageSelection(selectedIds: string[], pageIds: string[]) {
  const pageSet = new Set(pageIds);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => pageSet.has(id) && selectedIds.includes(id));
  return allSelected
    ? selectedIds.filter((id) => !pageSet.has(id))
    : [...new Set([...selectedIds, ...pageIds])].slice(0, 100);
}

export function toggleCandidateSelection(selectedIds: string[], id: string) {
  return selectedIds.includes(id)
    ? selectedIds.filter((candidate) => candidate !== id)
    : selectedIds.length >= 100 ? selectedIds : [...selectedIds, id];
}

export function limitSearchSelection(ids: string[], limit = 100) {
  return [...new Set(ids)].slice(0, limit);
}

export function retainBlockedContractSelection(selectedIds: string[], results: ContractGenerationResultState[]) {
  const blockedIds = new Set(results.filter((result) => result.outcome === "BLOCKED").map((result) => result.contractId));
  return selectedIds.filter((id) => blockedIds.has(id));
}
