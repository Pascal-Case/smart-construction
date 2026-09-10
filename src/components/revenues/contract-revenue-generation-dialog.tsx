"use client";

import { ChevronDown, Search } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useRealtimeRefresh } from "@/components/realtime-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSeoulDateTime } from "@/lib/date-time";
import { limitSearchSelection, retainBlockedContractSelection, toggleCandidatePageSelection, toggleCandidateSelection } from "@/components/revenues/contract-revenue-generation-state";

type SiteOption = { id: string; name: string; isActive: boolean };
type Candidate = { id: string; contractNo: string; title: string; pendingAt: string; site: { id: string; name: string } };
type CandidateList = { rows: Candidate[]; total: number; page: number; pageSize: number; totalPages: number };
type PreviewDraft = { generatedKey: string; billingMethod: "LEGACY_TOTAL" | "MONTHLY_RECURRING" | "PRORATED_TOTAL"; revenueDate: string; salesAmount: number; costAmount: number; prorationDays: number; allocationBaseDays: number; title: string };
type GenerationCounts = { create: number; update: number; unchanged: number; protected: number; cancel: number };
type BatchResult = {
  contractId: string;
  outcome: "PREVIEWED" | "GENERATED" | "BLOCKED";
  contract?: { id: string; contractNo: string; title: string; siteId: string; siteName: string; version: number };
  expectedVersion?: number;
  rows?: Array<{ action: string; reason?: string; draft?: PreviewDraft }>;
  counts?: GenerationCounts;
  totalSalesAmount?: number;
  totalCostAmount?: number;
  error?: { code: string; message: string };
};
type BatchResponse = { batchId: string; results: BatchResult[]; summary: { totalContracts: number; successfulContracts: number; blockedContracts: number; counts: GenerationCounts; totalSalesAmount: number; totalCostAmount: number } };

const generationActionLabels: Record<string, string> = { CREATE: "신규", RECREATE: "취소 후 재등록", UPDATE: "갱신", UNCHANGED: "변경 없음", PROTECTED: "보호됨", CANCEL: "자동 취소" };

export function ContractRevenueGenerationDialog({ sites, onClose, onGenerated }: { sites: SiteOption[]; onClose: () => void; onGenerated: () => void }) {
  const [q, setQ] = useState("");
  const [siteId, setSiteId] = useState("");
  const [candidates, setCandidates] = useState<CandidateList | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<BatchResponse | null>(null);
  const [result, setResult] = useState<BatchResponse | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [busy, setBusy] = useState(false);
  const candidateRequest = useRef<AbortController | null>(null);

  const loadCandidates = useCallback(async ({ query, site, page }: { query: string; site: string; page: number }) => {
    candidateRequest.current?.abort();
    const controller = new AbortController();
    candidateRequest.current = controller;
    setLoadingCandidates(true);
    try {
      const params = new URLSearchParams({ q: query, siteId: site, page: String(page), pageSize: "20" });
      const response = await fetch(`/api/contracts/revenue-candidates?${params}`, { signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "처리할 계약을 불러오지 못했습니다.");
      setCandidates(body as CandidateList);
    } catch (error) {
      if (controller.signal.aborted) return;
      toast.error(error instanceof Error ? error.message : "처리할 계약을 불러오지 못했습니다.");
    } finally {
      if (candidateRequest.current === controller) {
        candidateRequest.current = null;
        setLoadingCandidates(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCandidates({ query: "", site: "", page: 1 });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      const controller = candidateRequest.current;
      candidateRequest.current = null;
      controller?.abort();
    };
  }, [loadCandidates]);

  useRealtimeRefresh(["contract.changed", "revenue.changed"], () => {
    void loadCandidates({ query: q, site: siteId, page: candidates?.page ?? 1 });
  });

  function resetSelection() {
    setSelectedIds([]);
    setPreview(null);
    setResult(null);
    setExpandedIds([]);
  }

  function changeQuery(value: string) {
    setQ(value);
    resetSelection();
  }

  function changeSite(value: string) {
    setSiteId(value);
    resetSelection();
  }

  async function selectAllSearchResults() {
    setBusy(true);
    try {
      const params = new URLSearchParams({ q, siteId, page: "1", pageSize: "100" });
      const response = await fetch(`/api/contracts/revenue-candidates?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "검색 결과를 선택하지 못했습니다.");
      const all = body as CandidateList;
      const ids = limitSearchSelection(all.rows.map((row) => row.id));
      setSelectedIds(ids);
      setPreview(null);
      setResult(null);
      if (all.total > ids.length) toast.warning(`검색 결과 ${all.total}건 중 처리 대기 순서 기준 ${ids.length}건만 선택했습니다.`);
      else toast.success(`검색 결과 ${ids.length}건을 선택했습니다.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "검색 결과를 선택하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function previewSelected() {
    if (!selectedIds.length) return;
    setBusy(true);
    try {
      const response = await fetch("/api/contracts/revenue-batch-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contractIds: selectedIds }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "일괄 미리보기를 불러오지 못했습니다.");
      setPreview(body as BatchResponse);
      setResult(null);
      setExpandedIds([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "일괄 미리보기를 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function generatePreviewed() {
    if (!preview) return;
    const targets = preview.results.flatMap((item) => item.outcome === "PREVIEWED" && item.expectedVersion != null ? [{ contractId: item.contractId, expectedVersion: item.expectedVersion }] : []);
    if (!targets.length) return;
    setBusy(true);
    try {
      const response = await fetch("/api/contracts/revenue-batch-generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "일괄 매출 생성을 처리하지 못했습니다.");
      const next = body as BatchResponse;
      const blockedBeforeGenerate = preview.results.filter((item) => item.outcome === "BLOCKED");
      const displayedResult: BatchResponse = {
        ...next,
        results: [...blockedBeforeGenerate, ...next.results],
        summary: {
          ...next.summary,
          totalContracts: blockedBeforeGenerate.length + next.summary.totalContracts,
          blockedContracts: blockedBeforeGenerate.length + next.summary.blockedContracts,
        },
      };
      setResult(displayedResult);
      setPreview(null);
      setExpandedIds([]);
      const blockedBeforeGenerateState = blockedBeforeGenerate.map((item) => ({ contractId: item.contractId, outcome: "BLOCKED" as const }));
      const generationStates = next.results.flatMap((item) => item.outcome === "PREVIEWED" ? [] : [{ contractId: item.contractId, outcome: item.outcome }]);
      setSelectedIds(retainBlockedContractSelection([...blockedBeforeGenerateState.map((item) => item.contractId), ...targets.map((target) => target.contractId)], [...blockedBeforeGenerateState, ...generationStates]));
      toast.success(`계약 ${next.summary.successfulContracts}건을 처리했습니다.${displayedResult.summary.blockedContracts ? ` ${displayedResult.summary.blockedContracts}건은 재시도가 필요합니다.` : ""}`);
      onGenerated();
      await loadCandidates({ query: q, site: siteId, page: candidates?.page ?? 1 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "일괄 매출 생성을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const pageIds = candidates?.rows.map((row) => row.id) ?? [];
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const displayedResponse = preview ?? result;
  const actionablePreviewCount = preview?.results.filter((item) => item.outcome === "PREVIEWED" && ((item.counts?.create ?? 0) + (item.counts?.update ?? 0) + (item.counts?.cancel ?? 0) > 0)).length ?? 0;

  function togglePageSelection() {
    const next = toggleCandidatePageSelection(selectedIds, pageIds);
    if (!allPageSelected && next.length === selectedIds.length && selectedIds.length >= 100) toast.warning("한 번에 최대 100건까지 선택할 수 있습니다.");
    setSelectedIds(next);
  }

  function toggleOneSelection(id: string) {
    if (!selectedIds.includes(id) && selectedIds.length >= 100) {
      toast.warning("한 번에 최대 100건까지 선택할 수 있습니다.");
      return;
    }
    setSelectedIds((current) => toggleCandidateSelection(current, id));
  }

  return <Dialog open onOpenChange={(value) => { if (!value) onClose(); }}>
    <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>계약 월 매출 일괄 생성</DialogTitle>
        <DialogDescription>처리 대기 계약을 큐 순서로 미리보고 생성합니다. 확정 매출은 보호하며 계약별 실패는 해당 계약만 재시도할 수 있습니다.</DialogDescription>
      </DialogHeader>
      <form className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); resetSelection(); void loadCandidates({ query: q, site: siteId, page: 1 }); }}>
        <Field label="계약번호·계약명 검색" value={q} onChange={changeQuery} placeholder="계약번호, 계약명, 현장명" />
        <div className="space-y-1.5"><Label>현장</Label><select value={siteId} onChange={(event) => changeSite(event.target.value)} className="h-9 w-full rounded-lg border bg-background px-3 text-sm"><option value="">전체 현장</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></div>
        <Button type="submit" variant="outline" disabled={loadingCandidates || busy}><Search data-icon="inline-start" />조회</Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
        <span className="text-muted-foreground">선택 {selectedIds.length}건 · 한 번에 최대 100건</span>
        <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={loadingCandidates || busy || !candidates?.total} onClick={() => void selectAllSearchResults()}>검색 결과 최대 100건 선택</Button><Button type="button" size="sm" variant="outline" disabled={loadingCandidates || busy || !pageIds.length} onClick={togglePageSelection}>현재 페이지 {allPageSelected ? "선택 해제" : "전체 선택"}</Button></div>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader><TableRow><TableHead className="w-10"><input aria-label="현재 페이지 계약 전체 선택" type="checkbox" checked={allPageSelected} disabled={loadingCandidates || busy || !pageIds.length} onChange={togglePageSelection} /></TableHead><TableHead>계약번호</TableHead><TableHead>현장</TableHead><TableHead>계약명</TableHead><TableHead>처리 대기</TableHead></TableRow></TableHeader>
          <TableBody>{loadingCandidates && !candidates ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">처리할 계약을 불러오는 중입니다.</TableCell></TableRow> : !candidates?.rows.length ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">처리할 계약 매출이 없습니다.</TableCell></TableRow> : candidates.rows.map((candidate) => <TableRow key={candidate.id}><TableCell><input aria-label={`${candidate.contractNo} 선택`} type="checkbox" checked={selectedIds.includes(candidate.id)} disabled={busy} onChange={() => toggleOneSelection(candidate.id)} /></TableCell><TableCell className="font-medium">{candidate.contractNo}</TableCell><TableCell>{candidate.site.name}</TableCell><TableCell>{candidate.title}</TableCell><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatSeoulDateTime(candidate.pendingAt)}</TableCell></TableRow>)}</TableBody>
        </Table>
      </div>
      {candidates && <div className="flex items-center justify-between text-sm text-muted-foreground"><span>처리 대기 {candidates.total}건 · {candidates.page}/{candidates.totalPages} 페이지</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={loadingCandidates || busy || candidates.page <= 1} onClick={() => void loadCandidates({ query: q, site: siteId, page: candidates.page - 1 })}>이전</Button><Button size="sm" variant="outline" disabled={loadingCandidates || busy || candidates.page >= candidates.totalPages} onClick={() => void loadCandidates({ query: q, site: siteId, page: candidates.page + 1 })}>다음</Button></div></div>}
      <div className="flex justify-end"><Button disabled={busy || loadingCandidates || !selectedIds.length} onClick={() => void previewSelected()}>선택 계약 미리보기</Button></div>
      {displayedResponse && <BatchResponsePanel response={displayedResponse} expandedIds={expandedIds} onToggle={(id) => setExpandedIds((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id])} />}
      {preview && <div className="flex justify-end"><Button disabled={busy || !actionablePreviewCount} onClick={() => void generatePreviewed()}>선택 계약 매출 생성·갱신</Button></div>}
      {result && <div className="flex justify-end"><Button variant="outline" disabled={busy} onClick={() => void previewSelected()}>차단 계약 다시 미리보기</Button></div>}
    </DialogContent>
  </Dialog>;
}

function BatchResponsePanel({ response, expandedIds, onToggle }: { response: BatchResponse; expandedIds: string[]; onToggle: (contractId: string) => void }) {
  return <div className="space-y-3"><div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><BatchSummary label="처리 계약" value={`${response.summary.successfulContracts}/${response.summary.totalContracts}`} /><BatchSummary label="예정 매출" value={`${response.summary.totalSalesAmount.toLocaleString()}원`} /><BatchSummary label="신규·갱신" value={String(response.summary.counts.create + response.summary.counts.update)} /><BatchSummary label="변경 없음·보호" value={String(response.summary.counts.unchanged + response.summary.counts.protected)} /><BatchSummary label="차단" value={String(response.summary.blockedContracts)} /></div><div className="max-h-[32rem] overflow-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead className="w-10" /><TableHead>계약</TableHead><TableHead>현장</TableHead><TableHead>결과</TableHead><TableHead>생성·갱신</TableHead><TableHead className="text-right">예정 매출</TableHead></TableRow></TableHeader><TableBody>{response.results.map((item) => { const expanded = expandedIds.includes(item.contractId); return <Fragment key={item.contractId}><TableRow><TableCell>{item.rows?.length ? <Button size="icon-sm" variant="ghost" aria-label={`${item.contract?.contractNo ?? item.contractId} 상세 ${expanded ? "접기" : "펼치기"}`} aria-expanded={expanded} onClick={() => onToggle(item.contractId)}><ChevronDown className={expanded ? "rotate-180" : ""} /></Button> : null}</TableCell><TableCell className="font-medium">{item.contract?.contractNo ?? item.contractId}<span className="block text-xs text-muted-foreground">{item.contract?.title ?? ""}</span></TableCell><TableCell>{item.contract?.siteName ?? "-"}</TableCell><TableCell>{item.outcome === "BLOCKED" ? <><Badge variant="destructive">차단</Badge><span className="mt-1 block max-w-72 whitespace-normal text-xs text-destructive">{item.error?.message}</span></> : <Badge variant="outline">{response.results.some((candidate) => candidate.outcome === "GENERATED") ? "처리 완료" : "미리보기"}</Badge>}</TableCell><TableCell>{item.counts ? `${item.counts.create} 신규 · ${item.counts.update} 갱신 · ${item.counts.cancel} 취소` : "-"}</TableCell><TableCell className="text-right tabular-nums">{item.totalSalesAmount?.toLocaleString() ?? "-"}</TableCell></TableRow>{expanded && item.rows && <TableRow><TableCell colSpan={6} className="bg-muted/20"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>처리</TableHead><TableHead>매출월</TableHead><TableHead>내용</TableHead><TableHead>청구 근거</TableHead><TableHead className="text-right">매출액</TableHead></TableRow></TableHeader><TableBody>{item.rows.map((row, index) => <TableRow key={row.draft?.generatedKey ?? `${item.contractId}-${index}`}><TableCell><Badge variant="outline">{generationActionLabels[row.action] ?? row.action}</Badge></TableCell><TableCell>{row.draft?.revenueDate?.slice(0, 7) ?? "-"}</TableCell><TableCell>{row.draft?.title ?? "-"}{row.reason && <span className="block text-xs text-muted-foreground">{row.reason}</span>}</TableCell><TableCell>{row.draft ? billingBasisLabel(row.draft) : "-"}</TableCell><TableCell className="text-right">{row.draft?.salesAmount.toLocaleString() ?? "-"}</TableCell></TableRow>)}</TableBody></Table></div></TableCell></TableRow>}</Fragment>; })}</TableBody></Table></div></div>;
}

function billingBasisLabel(draft: PreviewDraft) { if (draft.billingMethod === "MONTHLY_RECURRING") return "월정액 전액"; if (draft.billingMethod === "PRORATED_TOTAL") return `${draft.prorationDays}일 / 전체 ${draft.allocationBaseDays}일`; return `기존 계산 · 전체기간 ${draft.allocationBaseDays}일 배분`; }
function BatchSummary({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>; }
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <div className="space-y-1.5"><Label>{label}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></div>; }
