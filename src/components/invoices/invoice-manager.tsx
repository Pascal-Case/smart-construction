"use client";

import { CalendarCheck2, Eye, FileCheck2, GitBranch, Merge, Printer, RefreshCw, Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { InvoiceDocumentPages, type InvoicePrintDocument } from "@/components/invoices/invoice-document";
import { applyIssueDateToSelected, automaticIssueGroupKey, buildIssueGroups, buildNewIssueTargets, preserveCandidateIssueDates, reconcileIssueResults, selectionSummary, toggleAllSelectable, type IssueGroupingCandidate } from "@/components/invoices/invoice-issuance-state";
import { useRealtimeRefresh } from "@/components/realtime-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSeoulDateTime } from "@/lib/date-time";
import type { InvoiceTemplateConfig, InvoiceTemplateView } from "@/lib/invoice-templates/config";
import { isInteractiveRowTarget } from "@/lib/row-selection";

type SiteOption = { id: string; name: string };
type ContractCategoryOption = { id: string; name: string; isActive: boolean };
type Candidate = {
  targetKey: string;
  kind: "NEW" | "BLOCKED";
  selectable: boolean;
  blockReason: string | null;
  cycleId: string;
  closeId: string;
  closeVersion: number;
  month: string;
  siteId: string;
  siteCode: string;
  siteName: string;
  contractCategoryId: string | null;
  contractCategoryName: string | null;
  issueItemId: string | null;
  issueItemName: string;
  revenueCount: number;
  supplyAmount: number;
  revenueFingerprint: string;
  currentInvoices: Array<{ id: string; invoiceNo: string; version: number }>;
};
type CandidateData = {
  rows: Candidate[];
  total: number;
  truncated: boolean;
  totals: { supplyAmount: number; taxAmount: number };
};
type InvoiceRow = {
  id: string;
  invoiceNo: string;
  issueDate: string;
  periodStart: string;
  periodEnd: string;
  recipientName: string;
  contractCategoryName: string | null;
  issueItemName: string | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  displayMode: "AGGREGATED" | "ITEMIZED";
  status: "DRAFT" | "ISSUED" | "SUPERSEDED" | "CANCELED";
  version: number;
  issuedAt: string;
  updatedAt: string;
  supersededAt: string | null;
  canceledAt: string | null;
  supersededBy: { id: string; invoiceNo: string } | null;
  monthlyCloseCycle: { cycleNo: number } | null;
  replacementRequired: boolean;
  _count: { lines: number; revenueLinks: number };
};
export type InvoiceList = {
  rows: InvoiceRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
type PreviewDocument = {
  siteId: string;
  siteName: string;
  siteAddress: string | null;
  documentGroupKey?: string | null;
  issueDate: string;
  memo: string | null;
  snapshotNotice?: string | null;
  templateConfig: InvoiceTemplateConfig;
  supplier: {
    businessRegistrationNo: string;
    companyName: string;
    representativeName: string;
    address: string;
    businessType: string;
    businessItem: string;
    phone: string;
    defaultMessage: string;
  };
  lines: Array<{
    itemName: string;
    specification: string | null;
    quantity: number | null;
    unit: string | null;
    unitPrice: number | null;
    supplyAmount: number;
    taxAmount: number;
    revenueEntryIds: string[];
  }>;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
};
type IssuePayload = {
  targets: Array<{
    targetKey: string;
    kind: "NEW";
    cycleId: string;
    expectedCloseVersion: number;
    expectedRevenueFingerprint: string;
    contractCategoryId: string | null;
    issueItemIds?: Array<string | null>;
    issueItemId?: string | null;
    documentGroupKey?: string;
    candidateKeys?: string[];
    issueDate?: string;
  }>;
  issueDate: string;
  displayMode: "AGGREGATED" | "ITEMIZED";
  memo: string | null;
  templateId: string;
  templateVersion: number;
};
type PreviewResult = {
  targetKey: string;
  kind: "NEW";
  outcome: "PREVIEWED" | "BLOCKED";
  document?: PreviewDocument;
  documents?: PreviewDocument[];
  commitTarget?: IssuePayload["targets"][number];
  currentInvoices?: Array<{ id: string; invoiceNo: string; version: number }>;
  warnings?: Array<{ id: string; contractNo: string; title: string }>;
  error?: { code: string; message: string };
  issueDateWarning?: string | null;
};
type BatchPreview = {
  summary: { total: number; newCount: number; replacementCount: number; blockedCount: number; supplyAmount: number };
  results: PreviewResult[];
};
type InvoiceManagerProps = {
  initialData: InvoiceList;
  sites: SiteOption[];
  contractCategories: ContractCategoryOption[];
  templates: InvoiceTemplateView[];
  canIssue: boolean;
  companyComplete: boolean;
  isAdmin: boolean;
  initialMonth?: string;
  initialSiteId?: string;
  initialContractCategoryId?: string;
  initialCandidates?: CandidateData | null;
};

export function InvoiceManager({
  initialData,
  sites,
  contractCategories,
  templates,
  canIssue,
  companyComplete,
  isAdmin,
  initialMonth,
  initialSiteId = "",
  initialContractCategoryId = "",
  initialCandidates = null,
}: InvoiceManagerProps) {
  const today = localDateKey(new Date());
  const [data, setData] = useState(initialData);
  const [candidates, setCandidates] = useState<CandidateData | null>(initialCandidates);
  const [selected, setSelected] = useState<string[]>([]);
  const [issueDates, setIssueDates] = useState<Record<string, string>>(() => Object.fromEntries((initialCandidates?.rows ?? []).map((row) => [row.targetKey, today])));
  const [manualGroupKeys, setManualGroupKeys] = useState<Record<string, string>>({});
  const [month, setMonth] = useState(initialMonth ?? today.slice(0, 7));
  const [siteId, setSiteId] = useState(initialSiteId);
  const [contractCategoryId, setContractCategoryId] = useState(initialContractCategoryId);
  const [issueDate, setIssueDate] = useState(today);
  const [displayMode, setDisplayMode] = useState<"AGGREGATED" | "ITEMIZED">("AGGREGATED");
  const [memo, setMemo] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "system-default");
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [pending, setPending] = useState<IssuePayload | null>(null);
  const [candidateErrors, setCandidateErrors] = useState<Record<string, string>>({});
  const [restoreTarget, setRestoreTarget] = useState<InvoiceRow | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadCandidates(preserve?: { selected: string[]; errors: Record<string, string> }) {
    setBusy(true);
    try {
      const params = new URLSearchParams({ month, siteId, contractCategoryId });
      const response = await fetch(`/api/invoices/candidates?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "발행 후보를 불러오지 못했습니다.");
      setCandidates(body);
      const available = new Set((body.rows as Candidate[]).map((row) => row.targetKey));
      setSelected(preserve ? preserve.selected.filter((key) => available.has(key)) : []);
      setIssueDates((current) => preserveCandidateIssueDates(current, body.rows as Candidate[], issueDate));
      setManualGroupKeys((current) => Object.fromEntries(Object.entries(current).filter(([key]) => available.has(key))));
      setCandidateErrors(preserve ? Object.fromEntries(Object.entries(preserve.errors).filter(([key]) => available.has(key))) : {});
      setPreview(null);
      setPending(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "발행 후보를 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function loadInvoices(page = data.page) {
    const response = await fetch(`/api/invoices?page=${page}&pageSize=20`);
    const body = await response.json();
    if (response.ok) setData(body);
  }

  useRealtimeRefresh(["invoice.changed", "monthlyClose.changed"], () => {
    void loadInvoices();
    if (candidates) void loadCandidates();
  });

  function toggle(targetKey: string) {
    setSelected((current) => current.includes(targetKey)
      ? current.filter((value) => value !== targetKey)
      : [...current, targetKey]);
    setPreview(null);
    setPending(null);
  }

  function selectAll() {
    if (!candidates) return;
    setSelected(toggleAllSelectable(selected, candidates.rows));
    setPreview(null);
    setPending(null);
  }

  function setCandidateIssueDate(targetKey: string, value: string) {
    setIssueDates((current) => ({ ...current, [targetKey]: value }));
    setPreview(null);
    setPending(null);
  }

  function applyBulkIssueDate() {
    if (!selected.length) return toast.error("발행일을 적용할 대상을 선택해 주세요.");
    setIssueDates((current) => applyIssueDateToSelected(current, selected, issueDate));
    setPreview(null);
    setPending(null);
  }

  function splitSelectedIntoGroup() {
    const selectedRows = candidates?.rows.filter((row): row is Candidate & { kind: "NEW" } => row.kind === "NEW" && row.selectable && selected.includes(row.targetKey)) ?? [];
    const itemRows = selectedRows.filter((row) => row.issueItemId != null);
    if (!itemRows.length) return toast.error("개별 분리할 품목이 있는 신규 매출을 선택해 주세요.");
    setManualGroupKeys((current) => ({
      ...current,
      ...Object.fromEntries(itemRows.map((row) => [
        row.targetKey,
        `${automaticIssueGroupKey(row, issueDates[row.targetKey] ?? issueDate)}:manual:${globalThis.crypto.randomUUID()}`,
      ])),
    }));
    setPreview(null);
    setPending(null);
  }

  function mergeSelectedIntoAutomaticGroups() {
    const selectedRows = candidates?.rows.filter((row) => row.kind === "NEW" && row.selectable && selected.includes(row.targetKey)) ?? [];
    if (!selectedRows.length) return toast.error("자동 묶음으로 되돌릴 신규 품목을 선택해 주세요.");
    setManualGroupKeys((current) => {
      const next = { ...current };
      for (const row of selectedRows) delete next[row.targetKey];
      return next;
    });
    setPreview(null);
    setPending(null);
  }

  async function showPreview() {
    if (!selected.length) return toast.error("발행할 대상을 선택해 주세요.");
    const template = templates.find((item) => item.id === templateId) ?? templates[0];
    if (!template) return toast.error("사용할 템플릿을 선택해 주세요.");
    const newTargets = buildNewIssueTargets(issueGroupCandidates, selected, issueDates, manualGroupKeys, issueDate);
    const previewPayload = {
      targets: newTargets,
      issueDate,
      displayMode,
      memo: memo.trim() || null,
      templateId: template.id,
      templateVersion: template.version,
    };
    setBusy(true);
    try {
      const response = await fetch("/api/invoices/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewPayload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "미리보기를 만들지 못했습니다.");
      const batch = body as BatchPreview;
      setPreview(batch);
      setPending({ ...previewPayload, targets: batch.results.flatMap((result) => result.outcome === "PREVIEWED" && result.commitTarget ? [result.commitTarget] : []) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "미리보기를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    if (!pending) return;
    setBusy(true);
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "거래명세표를 발행하지 못했습니다.");
      const results = body.results as Array<{
        targetKey: string;
        candidateKeys?: string[];
        outcome: "ISSUED" | "BLOCKED" | "ALREADY_ISSUED";
        document?: { id: string };
        documents?: Array<{ id: string }>;
        error?: { message: string };
      }>;
      const ids = results.flatMap((result) => result.outcome === "ISSUED" ? (result.documents?.map((document) => document.id) ?? (result.document ? [result.document.id] : [])) : []);
      const blocked = results.filter((result) => result.outcome === "BLOCKED").length;
      const alreadyIssued = results.filter((result) => result.outcome === "ALREADY_ISSUED").length;
      const summary = `발행 ${ids.length} · 차단 ${blocked} · 이미 발행 ${alreadyIssued}`;
      if (blocked === 0 && alreadyIssued === 0) toast.success(summary);
      else toast.warning(summary);
      const reconciled = reconcileIssueResults(selected, results);
      setPreview(null);
      setPending(null);
      await Promise.all([loadCandidates(reconciled), loadInvoices(1)]);
      if (ids.length) window.open(`/invoices/print?ids=${ids.join(",")}`, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "거래명세표를 발행하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreToPending() {
    if (!restoreTarget) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/invoices/${restoreTarget.id}/restore-to-pending`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceVersion: restoreTarget.version }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "거래명세표를 발행대기로 되돌리지 못했습니다.");
      toast.success(`${body.invoiceNo}의 원본 매출 ${body.restoredRevenueCount}건을 발행대기로 되돌렸습니다.`);
      setRestoreTarget(null);
      await Promise.all([candidates ? loadCandidates() : Promise.resolve(), loadInvoices(1)]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "거래명세표를 발행대기로 되돌리지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const selectedSummary = selectionSummary(selected, candidates?.rows ?? []);
  const issueGroupCandidates: IssueGroupingCandidate[] = (candidates?.rows.filter((row): row is Candidate & { kind: "NEW" } => row.kind === "NEW") ?? []) as IssueGroupingCandidate[];
  const issueGroups = buildIssueGroups(issueGroupCandidates, selected, issueDates, manualGroupKeys, issueDate);
  const selectedIssueGroupCount = issueGroups.filter((group) => group.selectedKeys.length > 0).length;
  const expectedDocumentCount = selectedIssueGroupCount;
  const groupByCandidateKey = new Map(issueGroups.flatMap((group) => group.candidateKeys.map((key) => [key, group] as const)));
  const allSelectableSelected = Boolean(candidates?.rows.some((row) => row.selectable))
    && candidates!.rows.filter((row) => row.selectable).every((row) => selected.includes(row.targetKey));

  return <div className="space-y-6">
    <div className="flex justify-end gap-2">
      <Button variant="outline" nativeButton={false} render={<Link href="/reports/monthly/close" />}>
        <CalendarCheck2 data-icon="inline-start" />월마감
      </Button>
      <Button variant="outline" nativeButton={false} render={<Link href="/invoices/templates" />}>
        <Settings2 data-icon="inline-start" />
        {canIssue ? "템플릿 관리" : "템플릿 보기"}
      </Button>
    </div>

    {canIssue && <section id="new-issue" className="scroll-mt-20 space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">발행 대기</h2>
          <p className="text-sm text-muted-foreground">최신 마감 기준의 발행 대기 매출을 표시합니다.</p>
        </div>
        {!companyComplete && <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          공급자 정보가 필요합니다. {isAdmin ? <Link className="underline" href="/settings/company">설정하기</Link> : "관리자에게 설정을 요청하세요."}
        </div>}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Field label="매출월" type="month" value={month} onChange={setMonth} />
        <Select label="현장" value={siteId} onChange={setSiteId} options={[
          { value: "", label: "전체 현장" },
          ...sites.map((site) => ({ value: site.id, label: site.name })),
        ]} />
        <Select label="계약 구분" value={contractCategoryId} onChange={setContractCategoryId} options={[
          { value: "", label: "전체 계약 구분" },
          ...contractCategories.map((category) => ({ value: category.id, label: `${category.name}${category.isActive ? "" : " (중지)"}` })),
        ]} />
        <div className="flex items-end">
          <Button className="w-full" variant="outline" disabled={busy} onClick={() => void loadCandidates()}>
            <Search data-icon="inline-start" />후보 조회
          </Button>
        </div>
      </div>

      {candidates && <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <span className="font-medium">대기 {candidates.total}건</span>
            <span className="ml-3 text-muted-foreground">전체 {candidates.totals.supplyAmount.toLocaleString()}원 · 선택 {selectedSummary.total}건 ({selectedSummary.supplyAmount.toLocaleString()}원)</span>
          </div>
          <Button size="sm" variant="outline" disabled={!candidates.rows.some((row) => row.selectable)} onClick={selectAll}>
            {allSelectableSelected ? "전체 해제" : "전체 선택"}
          </Button>
        </div>
        {issueGroups.length > 0 && <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">거래명세표 그룹 {issueGroups.length}개 · 선택 발행 예상 {expectedDocumentCount}장</p>
              <p className="text-xs text-muted-foreground">같은 현장·계약 구분·발행일은 자동으로 묶이며, 개별 분리 시 선택한 각 품목을 각각 별도 거래명세표로 출력합니다.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!selected.some((key) => issueGroupCandidates.some((candidate) => candidate.targetKey === key))} onClick={splitSelectedIntoGroup}>
                <GitBranch data-icon="inline-start" />선택 품목별 개별 분리
              </Button>
              <Button size="sm" variant="ghost" disabled={!Object.keys(manualGroupKeys).some((key) => selected.includes(key))} onClick={mergeSelectedIntoAutomaticGroups}>
                <Merge data-icon="inline-start" />자동 묶음으로 복귀
              </Button>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {issueGroups.map((group) => <div key={group.groupKey} className="rounded-md border bg-background px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{group.siteName} · {group.contractCategoryName ?? "계약 구분 없음"}</span>
                <span className="text-xs text-muted-foreground">{group.issueDate}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{group.manual ? "개별 분리" : "자동 묶음"} · 품목 {group.candidateKeys.length}개 · 선택 {group.selectedKeys.length}개</span>
                <span className="tabular-nums">{group.selectedAmount.toLocaleString()}원</span>
              </div>
            </div>)}
          </div>
        </div>}
        <div className="max-h-96 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>구분</TableHead>
                <TableHead>매출월</TableHead>
                <TableHead>현장</TableHead>
                <TableHead>계약 구분</TableHead>
                <TableHead>발행 품목</TableHead>
                <TableHead>문서 그룹</TableHead>
                <TableHead>발행일</TableHead>
                <TableHead className="text-right">확정 매출</TableHead>
                <TableHead className="text-right">공급가액</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.rows.length === 0 ? <TableRow>
                <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                  현재 발행 대기 중인 대상이 없습니다.
                </TableCell>
              </TableRow> : candidates.rows.map((row) => <TableRow
                key={row.targetKey}
                aria-selected={row.selectable ? selected.includes(row.targetKey) : undefined}
                data-state={row.selectable && selected.includes(row.targetKey) ? "selected" : undefined}
                className={row.selectable ? "cursor-pointer" : undefined}
                onClick={(event) => {
                  if (!row.selectable || isInteractiveRowTarget(event.target)) return;
                  toggle(row.targetKey);
                }}
              >
                <TableCell>
                  <input
                    aria-label={`${row.siteName} ${row.month} 신규 발행 선택`}
                    type="checkbox"
                    disabled={!row.selectable}
                    checked={selected.includes(row.targetKey)}
                    onChange={() => toggle(row.targetKey)}
                  />
                </TableCell>
                <TableCell><Badge variant="outline">{row.kind === "BLOCKED" ? "확인 필요" : "신규"}</Badge></TableCell>
                <TableCell>{row.month}</TableCell>
                <TableCell><span className="font-medium">{row.siteName}</span><span className="block text-xs text-muted-foreground">{row.siteCode}</span>{row.currentInvoices.length > 0 && <span className="block text-xs text-muted-foreground">현재 {row.currentInvoices.map((invoice) => invoice.invoiceNo).join(", ")}</span>}{(row.blockReason || candidateErrors[row.targetKey]) && <span className="mt-1 block max-w-96 whitespace-normal text-xs text-destructive">{candidateErrors[row.targetKey] ?? row.blockReason}</span>}</TableCell>
                <TableCell>{row.contractCategoryName ?? "-"}</TableCell>
                <TableCell>{row.issueItemName}</TableCell>
                <TableCell>{groupByCandidateKey.get(row.targetKey) ? `${groupByCandidateKey.get(row.targetKey)!.manual ? "분리" : "자동"} · ${groupByCandidateKey.get(row.targetKey)!.issueDate}` : "-"}</TableCell>
                <TableCell><Input aria-label={`${row.siteName} ${row.issueItemName} 발행일`} className="w-36" type="date" value={issueDates[row.targetKey] ?? issueDate} disabled={!row.selectable} onChange={(event) => setCandidateIssueDate(row.targetKey, event.target.value)} /></TableCell>
                <TableCell className="text-right tabular-nums">{row.revenueCount}건</TableCell>
                <TableCell className="text-right tabular-nums">{row.supplyAmount.toLocaleString()}원</TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          <div className="space-y-1.5"><Field label="일괄 발행일" type="date" value={issueDate} onChange={(value) => { setIssueDate(value); setPreview(null); }} /><Button size="sm" variant="outline" className="w-full" onClick={applyBulkIssueDate}>선택 항목에 적용</Button></div>
          <Select label="표시 방식" value={displayMode} onChange={(value) => { setDisplayMode(value as "AGGREGATED" | "ITEMIZED"); setPreview(null); }} options={[
            { value: "AGGREGATED", label: "동일 품목 합산" },
            { value: "ITEMIZED", label: "원장 건별 표시" },
          ]} />
          <Select label="출력 템플릿" value={templateId} onChange={(value) => { setTemplateId(value); setPreview(null); setPending(null); }} options={templates.map((template) => ({ value: template.id, label: template.name }))} />
          <Field label="메모" value={memo} onChange={(value) => { setMemo(value); setPreview(null); }} placeholder="선택" />
          <div className="flex items-end">
            <Button className="w-full" disabled={busy || !companyComplete || !selected.length} onClick={() => void showPreview()}>
              <Eye data-icon="inline-start" />발행 미리보기
            </Button>
          </div>
        </div>
      </>}
    </section>}

    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div><h2 className="font-semibold">발행 이력</h2><p className="text-sm text-muted-foreground">유효 문서와 취소·대체된 과거 발행본을 구분해 관리합니다.</p></div>
        <Button size="sm" variant="outline" onClick={() => void loadInvoices()}><RefreshCw data-icon="inline-start" />새로고침</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>발행번호</TableHead><TableHead>상태</TableHead><TableHead>발행일</TableHead><TableHead>수신처</TableHead><TableHead>계약 구분</TableHead><TableHead>발행 품목</TableHead><TableHead>매출기간</TableHead><TableHead>원장/표시행</TableHead><TableHead className="text-right">공급가액</TableHead><TableHead>방식</TableHead><TableHead>최종수정일</TableHead><TableHead className="text-right">관리</TableHead></TableRow></TableHeader>
          <TableBody>{data.rows.length === 0 ? <TableRow><TableCell colSpan={12} className="h-28 text-center text-muted-foreground">발행된 거래명세표가 없습니다.</TableCell></TableRow> : data.rows.map((row) => <TableRow key={row.id} className={row.status === "SUPERSEDED" || row.status === "CANCELED" ? "opacity-65" : undefined}>
            <TableCell className="font-mono text-xs">{row.invoiceNo}{row.supersededBy && <span className="block font-sans text-[11px] text-muted-foreground">→ {row.supersededBy.invoiceNo}</span>}</TableCell>
            <TableCell><Badge variant={row.status === "ISSUED" ? "secondary" : "outline"}>{row.status === "ISSUED" ? "유효" : row.status === "SUPERSEDED" ? "대체됨" : row.status === "CANCELED" ? "취소됨" : "작성 중"}</Badge></TableCell>
            <TableCell>{row.issueDate.slice(0, 10)}</TableCell><TableCell>{row.recipientName}</TableCell><TableCell>{row.contractCategoryName ?? "-"}</TableCell><TableCell>{row.issueItemName ?? "-"}</TableCell>
            <TableCell className="text-xs">{row.periodStart.slice(0, 10)} ~ {row.periodEnd.slice(0, 10)}{row.monthlyCloseCycle && <span className="block text-muted-foreground">마감 {row.monthlyCloseCycle.cycleNo}회차 근거</span>}</TableCell>
            <TableCell>{row._count.revenueLinks}/{row._count.lines}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">{row.subtotal.toLocaleString()}</TableCell>
            <TableCell><Badge variant="outline">{row.displayMode === "AGGREGATED" ? "합산" : "건별"}</Badge></TableCell>
            <TableCell className="whitespace-nowrap text-xs tabular-nums">{formatSeoulDateTime(row.updatedAt)}</TableCell>
            <TableCell className="text-right"><div className="flex justify-end gap-1">
              {canIssue && row.status === "ISSUED" && <Button size="sm" variant="outline" onClick={() => setRestoreTarget(row)}><RefreshCw data-icon="inline-start" />발행대기로 되돌리기</Button>}
              <Button size="sm" variant="ghost" nativeButton={false} render={<a href={`/invoices/print?ids=${row.id}`} target="_blank" rel="noreferrer" />}><Printer data-icon="inline-start" />재출력</Button>
            </div></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>총 {data.total}건 · {data.page}/{data.totalPages} 페이지</span>
        <div className="flex gap-2"><Button size="sm" variant="outline" disabled={data.page <= 1} onClick={() => void loadInvoices(data.page - 1)}>이전</Button><Button size="sm" variant="outline" disabled={data.page >= data.totalPages} onClick={() => void loadInvoices(data.page + 1)}>다음</Button></div>
      </div>
    </section>

    {preview && <Dialog open onOpenChange={(open) => { if (!open) setPreview(null); }}>
      <DialogContent className="max-h-[94svh] overflow-y-auto sm:max-w-6xl">
         <DialogHeader><DialogTitle>거래명세표 발행 미리보기</DialogTitle><DialogDescription>전체 {preview.summary.total}건 · 발행 {preview.summary.newCount}건 · 차단 {preview.summary.blockedCount}건을 확인하세요.</DialogDescription></DialogHeader>
        {preview.results.some((result) => result.issueDateWarning) && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><strong>발행일 확인</strong><ul className="mt-1 list-disc pl-5">{preview.results.flatMap((result) => result.issueDateWarning ? [<li key={`${result.targetKey}:date`}>{result.issueDateWarning}</li>] : [])}</ul></div>}
        {preview.results.some((result) => result.outcome === "PREVIEWED" && (result.documents ?? []).some((document) => document.snapshotNotice)) && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><strong>병합 snapshot 적용</strong><ul className="mt-1 list-disc pl-5">{preview.results.flatMap((result) => result.outcome === "PREVIEWED" ? (result.documents ?? []).flatMap((document, index) => document.snapshotNotice ? [<li key={`${result.targetKey}:snapshot:${index}`}>{document.snapshotNotice}</li>] : []) : [])}</ul></div>}
        {preview.results.some((result) => result.outcome === "BLOCKED") && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"><strong>미리보기에서 제외된 대상</strong><ul className="mt-1 list-disc pl-5">{preview.results.flatMap((result) => result.outcome === "BLOCKED" ? [<li key={result.targetKey}>{result.error?.message ?? "최신 상태를 확인해 주세요."}</li>] : [])}</ul></div>}
        <div className="overflow-auto rounded-xl bg-slate-100 p-4"><InvoiceDocumentPages documents={preview.results.flatMap((result) => result.outcome === "PREVIEWED" ? (result.documents ?? (result.document ? [result.document] : [])) : []).map(toPrintPreview)} /></div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPreview(null)}>돌아가기</Button><Button disabled={busy || !pending?.targets.length} onClick={() => void issue()}><FileCheck2 data-icon="inline-start" />{busy ? "발행 중..." : `${pending?.targets.length ?? 0}건 발행`}</Button></div>
      </DialogContent>
    </Dialog>}

    {restoreTarget && <Dialog open onOpenChange={(open) => { if (!open) setRestoreTarget(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{restoreTarget.invoiceNo} 발행대기로 되돌리기</DialogTitle><DialogDescription>이 거래명세표를 취소하고 연결된 원본 매출 {restoreTarget._count.revenueLinks}건을 발행대기로 되돌립니다.</DialogDescription></DialogHeader>
        <div className="rounded-lg border bg-muted/40 p-4 text-sm">월마감과 확정 매출은 유지됩니다. 되돌린 뒤 발행 대기에서 그룹·발행일·표시 방식을 다시 지정해 발행하세요.</div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRestoreTarget(null)}>취소</Button><Button disabled={busy} onClick={() => void restoreToPending()}>{busy ? "되돌리는 중..." : "발행대기로 되돌리기"}</Button></div>
      </DialogContent>
    </Dialog>}
  </div>;
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></div>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <div className="space-y-1.5"><Label>{label}</Label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-lg border bg-background px-3 text-sm">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}

function toPrintPreview(document: PreviewDocument, index: number): InvoicePrintDocument {
  return {
    invoiceNo: `미발행-${index + 1}`,
    issueDate: document.issueDate,
    recipientName: document.siteName,
    recipientAddress: document.siteAddress,
    supplierBusinessRegistrationNo: document.supplier.businessRegistrationNo,
    supplierCompanyName: document.supplier.companyName,
    supplierRepresentativeName: document.supplier.representativeName,
    supplierAddress: document.supplier.address,
    supplierBusinessType: document.supplier.businessType,
    supplierBusinessItem: document.supplier.businessItem,
    supplierPhone: document.supplier.phone,
    supplyMessage: document.supplier.defaultMessage,
    subtotal: document.subtotal,
    memo: document.memo,
    templateConfig: document.templateConfig,
    lines: document.lines,
  };
}

function localDateKey(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}
