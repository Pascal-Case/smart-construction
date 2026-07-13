"use client";

import { Calculator, Check, CheckCheck, Download, Pencil, Plus, Search, WandSparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useRealtimeRefresh } from "@/components/realtime-provider";
import { RevenueEditor } from "@/components/revenues/revenue-editor";
import { SmartInputDialog } from "@/components/smart-input/smart-input-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSeoulDateTime } from "@/lib/date-time";
import { parseExplicitSort, serializeListQuery, toggleSort, type ExplicitSort } from "@/lib/list-sorting";
import type { SmartInputAppliedDraft } from "@/lib/smart-input/types";
import { revenueSortKeys, type RevenueListQuery, type RevenueSortKey } from "@/lib/revenues/schemas";

type SiteOption = { id: string; name: string; isActive: boolean };
type ItemOption = { id: string; name: string; unit: string; standardSalesPrice: number; standardCostPrice: number; isActive: boolean };
type ContractRevenueCandidate = { id: string; contractNo: string; title: string; pendingAt: string; site: { id: string; name: string } };
type ContractRevenueCandidateList = { rows: ContractRevenueCandidate[]; total: number; page: number; pageSize: number; totalPages: number };
export type RevenueView = { id: string; siteId: string; revenueDate: string; updatedAt: string; sourceType: "CONTRACT" | "MANUAL" | "ADJUSTMENT"; itemId: string | null; title: string; description: string | null; quantity: number | null; unit: string | null; appliedSalesPrice: number | null; salesAmount: number; appliedCostPrice: number | null; costAmount: number | null; priceOverrideReason: string | null; status: "DRAFT" | "CONFIRMED" | "CANCELED"; version: number; site: { name: string }; item: { name: string } | null; contract: { contractNo: string } | null };
export type RevenueList = { rows: RevenueView[]; total: number; page: number; pageSize: number; totalPages: number; totals: { salesAmount: number; costAmount: number } };
type PreviewDraft = { generatedKey: string; billingMethod: "LEGACY_TOTAL" | "MONTHLY_RECURRING" | "PRORATED_TOTAL"; revenueDate: string; salesAmount: number; costAmount: number; prorationDays: number; allocationBaseDays: number; title: string };
type Preview = { contract: { title: string; siteName: string }; rows: Array<{ action: string; reason?: string; draft?: PreviewDraft }>; counts: Record<string, number>; totalSalesAmount: number; totalCostAmount: number };

const sourceLabels = { CONTRACT: "계약", MANUAL: "직접", ADJUSTMENT: "조정" }; const statusLabels = { DRAFT: "작성 중", CONFIRMED: "확정", CANCELED: "취소" };
const generationActionLabels: Record<string, string> = { CREATE: "신규", RECREATE: "취소 후 재등록", UPDATE: "갱신", UNCHANGED: "변경 없음", PROTECTED: "보호됨", CANCEL: "자동 취소" };

export function RevenueManager({ initialData, initialFilters, initialSort, sites, items, canEdit }: { initialData: RevenueList; initialFilters: RevenueListQuery; initialSort: ExplicitSort<RevenueSortKey>; sites: SiteOption[]; items: ItemOption[]; canEdit: boolean }) {
  const [data, setData] = useState(initialData); const [q, setQ] = useState(initialFilters.q); const [siteId, setSiteId] = useState(initialFilters.siteId); const [source, setSource] = useState(initialFilters.sourceType); const [status, setStatus] = useState(initialFilters.status); const [exception, setException] = useState(initialFilters.exception); const [startDate, setStartDate] = useState(initialFilters.startDate); const [endDate, setEndDate] = useState(initialFilters.endDate); const [sort, setSort] = useState<ExplicitSort<RevenueSortKey>>(initialSort); const [loading, setLoading] = useState(false); const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false); const [bulkConfirming, setBulkConfirming] = useState(false); const [selectedContractRevenueIds, setSelectedContractRevenueIds] = useState<string[]>([]); const [editor, setEditor] = useState<RevenueView | "new" | null>(null); const [generatorOpen, setGeneratorOpen] = useState(false); const [smartOpen, setSmartOpen] = useState(false); const [smartDraft, setSmartDraft] = useState<SmartInputAppliedDraft | null>(null);
  const load = useCallback(async (page = 1, options: { nextSort?: ExplicitSort<RevenueSortKey>; filters?: Pick<RevenueListQuery, "q" | "siteId" | "sourceType" | "status" | "exception" | "startDate" | "endDate">; historyMode?: "push" | "none" } = {}) => { const filters = options.filters ?? { q, siteId, sourceType: source, status, exception, startDate, endDate }; const nextSort = options.nextSort === undefined ? sort : options.nextSort; setLoading(true); try { const params = serializeListQuery(new URLSearchParams({ ...filters, page: String(page), pageSize: "20" }), nextSort); const response = await fetch(`/api/revenues?${params}`); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "매출 원장을 불러오지 못했습니다."); setData(body); setSort(nextSort); setSelectedContractRevenueIds((current) => current.filter((id) => body.rows.some((row: RevenueView) => row.id === id && isConfirmableContractRevenue(row)))); if (options.historyMode === "push") window.history.pushState({}, "", `${window.location.pathname}?${params}`); } catch (error) { toast.error(error instanceof Error ? error.message : "매출 원장을 불러오지 못했습니다."); } finally { setLoading(false); } }, [endDate, exception, q, siteId, sort, source, startDate, status]);
  useEffect(() => { const restoreFromUrl = () => { const params = new URLSearchParams(window.location.search); const filters = { q: params.get("q") ?? "", siteId: params.get("siteId") ?? "", sourceType: (params.get("sourceType") ?? "all") as RevenueListQuery["sourceType"], status: (params.get("status") ?? "all") as RevenueListQuery["status"], exception: (params.get("exception") ?? "all") as RevenueListQuery["exception"], startDate: params.get("startDate") ?? "", endDate: params.get("endDate") ?? "" }; const nextPage = Math.max(1, Number(params.get("page")) || 1); const nextSort = parseExplicitSort(params, revenueSortKeys); setQ(filters.q); setSiteId(filters.siteId); setSource(filters.sourceType); setStatus(filters.status); setException(filters.exception); setStartDate(filters.startDate); setEndDate(filters.endDate); void load(nextPage, { nextSort, filters, historyMode: "none" }); }; window.addEventListener("popstate", restoreFromUrl); return () => window.removeEventListener("popstate", restoreFromUrl); }, [load]);
  useRealtimeRefresh(["revenue.changed"], () => void load(data.page));
  function changeSort(key: RevenueSortKey) { const nextSort = toggleSort(sort, key); void load(1, { nextSort, historyMode: "push" }); }
  function directionFor(key: RevenueSortKey) { if (sort?.key === key) return sort.direction; return !sort && key === "updatedAt" ? "desc" : undefined; }
  const exportHref = `/api/revenues/export?${new URLSearchParams({ q, startDate, endDate, siteId, sourceType: source, status, exception }).toString()}`;
  async function transition(row: RevenueView, action: "confirm" | "cancel") { const reason = action === "cancel" ? window.prompt("취소 사유를 입력해 주세요.") : null; if (action === "cancel" && !reason) return; const response = await fetch(`/api/revenues/${row.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "confirm" ? { version: row.version } : { version: row.version, reason }) }); const body = await response.json(); if (!response.ok) return toast.error(body.error?.message ?? "상태를 변경하지 못했습니다."); toast.success(action === "confirm" ? "매출을 확정했습니다." : "매출을 취소했습니다."); void load(data.page); }
  const confirmableContractRows = data.rows.filter(isConfirmableContractRevenue);
  const allConfirmableSelected = confirmableContractRows.length > 0 && confirmableContractRows.every((row) => selectedContractRevenueIds.includes(row.id));
  function toggleContractRevenue(id: string) { setSelectedContractRevenueIds((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]); }
  function toggleAllContractRevenues() { setSelectedContractRevenueIds((current) => allConfirmableSelected ? current.filter((id) => !confirmableContractRows.some((row) => row.id === id)) : [...new Set([...current, ...confirmableContractRows.map((row) => row.id)])]); }
  async function confirmSelectedContractRevenues() {
    const targets = confirmableContractRows.filter((row) => selectedContractRevenueIds.includes(row.id));
    if (!targets.length) { setBulkConfirmOpen(false); return; }
    setBulkConfirming(true);
    try {
      const response = await fetch("/api/revenues/confirm-batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: targets.map(({ id, version }) => ({ id, version })) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "계약 매출을 일괄 확정하지 못했습니다.");
      setBulkConfirmOpen(false);
      setSelectedContractRevenueIds([]);
      toast.success(`계약 매출 ${body.entries.length}건을 확정했습니다.`);
      await load(data.page);
    } catch (error) { toast.error(error instanceof Error ? error.message : "계약 매출을 일괄 확정하지 못했습니다."); }
    finally { setBulkConfirming(false); }
  }
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3"><Summary label="매출 합계" value={data.totals.salesAmount} /><Summary label="매입 합계" value={data.totals.costAmount} /><Summary label="이익" value={data.totals.salesAmount - data.totals.costAmount} /></div>
    <div className="space-y-3 rounded-xl border bg-card p-4"><form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8 2xl:items-end" onSubmit={(event) => { event.preventDefault(); void load(1, { historyMode: "push" }); }}><Field label="검색" value={q} onChange={setQ} placeholder="제목, 현장, 품목" /><Field label="시작일" value={startDate} onChange={setStartDate} type="date" /><Field label="종료일" value={endDate} onChange={setEndDate} type="date" /><Select label="현장" value={siteId} onChange={setSiteId} options={[{ value: "", label: "전체" }, ...sites.map((site) => ({ value: site.id, label: site.name }))]} /><Select label="출처" value={source} onChange={(value) => setSource(value as RevenueListQuery["sourceType"])} options={[{ value: "all", label: "전체" }, { value: "CONTRACT", label: "계약" }, { value: "MANUAL", label: "직접" }, { value: "ADJUSTMENT", label: "조정" }]} /><Select label="상태" value={status} onChange={(value) => setStatus(value as RevenueListQuery["status"])} options={[{ value: "all", label: "전체" }, { value: "DRAFT", label: "작성 중" }, { value: "CONFIRMED", label: "확정" }, { value: "CANCELED", label: "취소" }]} /><Select label="예외" value={exception} onChange={(value) => setException(value as RevenueListQuery["exception"])} options={[{ value: "all", label: "전체" }, { value: "ZERO", label: "0원 매출" }]} /><Button type="submit" variant="outline" disabled={loading}><Search data-icon="inline-start" />조회</Button></form><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" nativeButton={false} render={<a href={exportHref} />}><Download data-icon="inline-start" />Excel</Button>{canEdit && <><Button variant="outline" disabled={!selectedContractRevenueIds.length || bulkConfirming} onClick={() => setBulkConfirmOpen(true)}><CheckCheck data-icon="inline-start" />계약 매출 일괄 확정{selectedContractRevenueIds.length ? ` (${selectedContractRevenueIds.length})` : ""}</Button><Button variant="outline" disabled={!sites.some((site) => site.isActive)} onClick={() => setSmartOpen(true)}><WandSparkles data-icon="inline-start" />스마트입력</Button><Button variant="outline" onClick={() => setGeneratorOpen(true)}><Calculator data-icon="inline-start" />계약 매출 생성</Button><Button onClick={() => { setSmartDraft(null); setEditor("new"); }}><Plus data-icon="inline-start" />직접 매출</Button></>}</div></div>
    <div className="overflow-x-auto rounded-xl border bg-card"><Table><TableHeader><TableRow>{canEdit && <TableHead className="w-10"><input aria-label="현재 페이지의 작성 중 계약 매출 전체 선택" type="checkbox" disabled={!confirmableContractRows.length || bulkConfirming} checked={allConfirmableSelected} onChange={toggleAllContractRevenues} /></TableHead>}<SortableTableHead direction={directionFor("revenueDate")} onSort={() => changeSort("revenueDate")}>매출일</SortableTableHead><SortableTableHead direction={directionFor("site")} onSort={() => changeSort("site")}>현장</SortableTableHead><SortableTableHead direction={directionFor("source")} onSort={() => changeSort("source")}>출처</SortableTableHead><SortableTableHead direction={directionFor("content")} onSort={() => changeSort("content")}>내용</SortableTableHead><SortableTableHead direction={directionFor("quantityPrice")} onSort={() => changeSort("quantityPrice")}>수량·단가</SortableTableHead><SortableTableHead numeric direction={directionFor("salesAmount")} onSort={() => changeSort("salesAmount")}>매출액</SortableTableHead><SortableTableHead numeric direction={directionFor("costAmount")} onSort={() => changeSort("costAmount")}>매입액</SortableTableHead><SortableTableHead direction={directionFor("status")} onSort={() => changeSort("status")}>상태</SortableTableHead><SortableTableHead direction={directionFor("updatedAt")} isDefault={!sort} onSort={() => changeSort("updatedAt")}>최종수정일</SortableTableHead>{canEdit && <TableHead className="text-right">관리</TableHead>}</TableRow></TableHeader><TableBody>{data.rows.length === 0 ? <TableRow><TableCell colSpan={canEdit ? 11 : 9} className="h-28 text-center text-muted-foreground">조건에 맞는 매출이 없습니다.</TableCell></TableRow> : data.rows.map((row) => <TableRow key={row.id} className={row.status === "CANCELED" ? "opacity-55" : ""}>{canEdit && <TableCell>{isConfirmableContractRevenue(row) && <input aria-label={`${row.revenueDate.slice(0, 10)} ${row.site.name} 계약 매출 선택`} type="checkbox" disabled={bulkConfirming} checked={selectedContractRevenueIds.includes(row.id)} onChange={() => toggleContractRevenue(row.id)} />}</TableCell>}<TableCell className="whitespace-nowrap">{row.revenueDate.slice(0, 10)}</TableCell><TableCell>{row.site.name}</TableCell><TableCell><Badge variant="outline">{sourceLabels[row.sourceType]}</Badge></TableCell><TableCell className="max-w-64"><span className="font-medium">{row.title}</span><span className="block truncate text-xs text-muted-foreground">{row.item?.name ?? row.description}</span></TableCell><TableCell className="text-xs">{row.quantity != null ? `${row.quantity} ${row.unit ?? ""} × ${(row.appliedSalesPrice ?? 0).toLocaleString()}` : "직접 금액"}</TableCell><TableCell className="text-right font-medium tabular-nums">{row.salesAmount.toLocaleString()}</TableCell><TableCell className="text-right tabular-nums">{(row.costAmount ?? 0).toLocaleString()}</TableCell><TableCell><Badge variant={row.status === "CONFIRMED" ? "secondary" : "outline"}>{statusLabels[row.status]}</Badge></TableCell><TableCell className="whitespace-nowrap text-xs tabular-nums">{formatSeoulDateTime(row.updatedAt)}</TableCell>{canEdit && <TableCell className="text-right"><div className="flex justify-end gap-1">{row.status === "DRAFT" && row.sourceType !== "CONTRACT" && <Button size="icon-sm" variant="ghost" onClick={() => setEditor(row)}><Pencil /><span className="sr-only">수정</span></Button>}{row.status === "DRAFT" && <Button size="icon-sm" variant="ghost" onClick={() => void transition(row, "confirm")}><Check /><span className="sr-only">확정</span></Button>}{row.status !== "CANCELED" && <Button size="icon-sm" variant="ghost" onClick={() => void transition(row, "cancel")}><X /><span className="sr-only">취소</span></Button>}</div></TableCell>}</TableRow>)}</TableBody></Table></div>
    <div className="flex items-center justify-between text-sm text-muted-foreground"><span>총 {data.total}건 · {data.page}/{data.totalPages} 페이지</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={data.page <= 1} onClick={() => void load(data.page - 1, { historyMode: "push" })}>이전</Button><Button size="sm" variant="outline" disabled={data.page >= data.totalPages} onClick={() => void load(data.page + 1, { historyMode: "push" })}>다음</Button></div></div>
    {smartOpen && <SmartInputDialog target="REVENUE" onClose={() => setSmartOpen(false)} onApply={(draft) => { setSmartDraft(draft); setSmartOpen(false); setEditor("new"); }} onRegistered={() => { setSmartOpen(false); void load(data.page); }} />}
    {editor && <RevenueEditor row={editor === "new" ? null : editor} draft={smartDraft} sites={sites} items={items} onClose={() => setEditor(null)} onSaved={() => void load(data.page)} />}
    {generatorOpen && <GeneratorDialog sites={sites} onClose={() => setGeneratorOpen(false)} onGenerated={() => void load(1)} />}
    <ConfirmDialog open={bulkConfirmOpen} title="계약 매출 일괄 확정" description={`선택한 계약 매출 ${selectedContractRevenueIds.length}건을 확정합니다. 확정 후에는 일반 수정이 제한됩니다.`} confirmLabel="일괄 확정" pendingLabel="확정 중..." pending={bulkConfirming} onOpenChange={setBulkConfirmOpen} onConfirm={() => void confirmSelectedContractRevenues()} />
  </div>;
}

function GeneratorDialog({ sites, onClose, onGenerated }: { sites: SiteOption[]; onClose: () => void; onGenerated: () => void }) {
  const [q, setQ] = useState("");
  const [siteId, setSiteId] = useState("");
  const [candidates, setCandidates] = useState<ContractRevenueCandidateList | null>(null);
  const [contractId, setContractId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
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
      const next = body as ContractRevenueCandidateList;
      setCandidates(next);
      setContractId((current) => next.rows.some((row) => row.id === current) ? current : (next.rows[0]?.id ?? ""));
      setPreview(null);
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

  async function call(action: "preview" | "generate") {
    if (!contractId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/contracts/${contractId}/revenue-${action}`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "자동 매출을 처리하지 못했습니다.");
      if (action === "preview") setPreview(body);
      else {
        toast.success(`신규 ${body.counts.create}건, 갱신 ${body.counts.update}건을 처리했습니다.`);
        onClose();
        onGenerated();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "자동 매출을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open onOpenChange={(value) => { if (!value) onClose(); }}>
    <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>계약 월 매출 생성</DialogTitle>
        <DialogDescription>처리 대기 계약만 검색합니다. 확정 매출은 보호하고, 사용자 취소 매출은 새 매출로 다시 등록합니다.</DialogDescription>
      </DialogHeader>
      <form className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); void loadCandidates({ query: q, site: siteId, page: 1 }); }}>
        <Field label="계약번호·계약명 검색" value={q} onChange={setQ} placeholder="계약번호, 계약명, 현장명" />
        <Select label="현장" value={siteId} onChange={setSiteId} options={[{ value: "", label: "전체 현장" }, ...sites.map((site) => ({ value: site.id, label: site.name }))]} />
        <Button type="submit" variant="outline" disabled={loadingCandidates}><Search data-icon="inline-start" />조회</Button>
      </form>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader><TableRow><TableHead className="w-10">선택</TableHead><TableHead>계약번호</TableHead><TableHead>현장</TableHead><TableHead>계약명</TableHead><TableHead>처리 대기</TableHead></TableRow></TableHeader>
          <TableBody>
            {loadingCandidates && !candidates ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">처리할 계약을 불러오는 중입니다.</TableCell></TableRow>
              : !candidates?.rows.length ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">처리할 계약 매출이 없습니다.</TableCell></TableRow>
                : candidates.rows.map((candidate) => <TableRow key={candidate.id}>
                  <TableCell><input type="radio" name="contractRevenueCandidate" aria-label={`${candidate.contractNo} 선택`} checked={contractId === candidate.id} onChange={() => { setContractId(candidate.id); setPreview(null); }} /></TableCell>
                  <TableCell className="font-medium">{candidate.contractNo}</TableCell>
                  <TableCell>{candidate.site.name}</TableCell>
                  <TableCell>{candidate.title}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatSeoulDateTime(candidate.pendingAt)}</TableCell>
                </TableRow>)}
          </TableBody>
        </Table>
      </div>
      {candidates && <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>처리 대기 {candidates.total}건 · {candidates.page}/{candidates.totalPages} 페이지</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={loadingCandidates || candidates.page <= 1} onClick={() => void loadCandidates({ query: q, site: siteId, page: candidates.page - 1 })}>이전</Button>
          <Button size="sm" variant="outline" disabled={loadingCandidates || candidates.page >= candidates.totalPages} onClick={() => void loadCandidates({ query: q, site: siteId, page: candidates.page + 1 })}>다음</Button>
        </div>
      </div>}
      <div className="flex justify-end"><Button disabled={busy || loadingCandidates || !contractId} onClick={() => void call("preview")}>미리보기</Button></div>
      {preview && <div className="space-y-3"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Summary label="예정 매출" value={preview.totalSalesAmount} /><Summary label="예정 매입" value={preview.totalCostAmount} /><Summary label="신규/갱신" value={(preview.counts.create ?? 0) + (preview.counts.update ?? 0)} plain /><Summary label="보호/취소" value={(preview.counts.protected ?? 0) + (preview.counts.cancel ?? 0)} plain /></div><div className="max-h-64 overflow-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>처리</TableHead><TableHead>매출월</TableHead><TableHead>내용</TableHead><TableHead>청구 근거</TableHead><TableHead className="text-right">매출액</TableHead></TableRow></TableHeader><TableBody>{preview.rows.map((row, index) => <TableRow key={row.draft?.generatedKey ?? index}><TableCell><Badge variant="outline">{generationActionLabels[row.action] ?? row.action}</Badge></TableCell><TableCell>{row.draft?.revenueDate?.slice(0, 7) ?? "-"}</TableCell><TableCell>{row.draft?.title ?? "-"}{row.reason && <span className="block text-xs text-muted-foreground">{row.reason}</span>}</TableCell><TableCell>{row.draft ? billingBasisLabel(row.draft) : "-"}</TableCell><TableCell className="text-right">{row.draft?.salesAmount.toLocaleString() ?? "-"}</TableCell></TableRow>)}</TableBody></Table></div><div className="flex justify-end"><Button disabled={busy || ((preview.counts.create ?? 0) + (preview.counts.update ?? 0) + (preview.counts.cancel ?? 0) === 0)} onClick={() => void call("generate")}>매출 생성·갱신</Button></div></div>}
    </DialogContent>
  </Dialog>;
}
function billingBasisLabel(draft: PreviewDraft) { if (draft.billingMethod === "MONTHLY_RECURRING") return "월정액 전액"; if (draft.billingMethod === "PRORATED_TOTAL") return `${draft.prorationDays}일 / 전체 ${draft.allocationBaseDays}일`; return `기존 계산 · 전체기간 ${draft.allocationBaseDays}일 배분`; }
function isConfirmableContractRevenue(row: RevenueView) { return row.sourceType === "CONTRACT" && row.status === "DRAFT"; }
function Summary({ label, value, plain = false }: { label: string; value: number; plain?: boolean }) { return <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{plain ? value.toLocaleString() : `${value.toLocaleString()}원`}</p></div>; }
function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) { return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></div>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) { return <div className="space-y-1.5"><Label>{label}</Label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-lg border bg-background px-3 text-sm">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>; }
