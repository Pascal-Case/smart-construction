"use client";

import { Eye, FileCheck2, Printer, RefreshCw, Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { InvoiceDocumentPages, type InvoicePrintDocument } from "@/components/invoices/invoice-document";
import { useRealtimeRefresh } from "@/components/realtime-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { InvoiceTemplateConfig, InvoiceTemplateView } from "@/lib/invoice-templates/config";

type SiteOption = { id: string; name: string };
type Candidate = {
  cycleId: string;
  closeId: string;
  closeVersion: number;
  month: string;
  siteId: string;
  siteCode: string;
  siteName: string;
  revenueCount: number;
  supplyAmount: number;
  revenueFingerprint: string;
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
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  displayMode: "AGGREGATED" | "ITEMIZED";
  status: "DRAFT" | "ISSUED" | "SUPERSEDED";
  version: number;
  issuedAt: string;
  supersededAt: string | null;
  supersededBy: { id: string; invoiceNo: string } | null;
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
  issueDate: string;
  memo: string | null;
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
  cycles: Array<{
    cycleId: string;
    expectedCloseVersion: number;
    expectedRevenueFingerprint: string;
  }>;
  issueDate: string;
  displayMode: "AGGREGATED" | "ITEMIZED";
  memo: string | null;
  templateId: string;
  templateVersion: number;
};
type ReplacementState = {
  source: InvoiceRow;
  issueDate: string;
  displayMode: "AGGREGATED" | "ITEMIZED";
  memo: string;
  templateId: string;
  preview: {
    document: PreviewDocument;
    expectedRevenueEntryIds: string[];
    warnings: Array<{ id: string; contractNo: string; title: string }>;
  } | null;
};

type InvoiceManagerProps = {
  initialData: InvoiceList;
  sites: SiteOption[];
  templates: InvoiceTemplateView[];
  canIssue: boolean;
  companyComplete: boolean;
  isAdmin: boolean;
  initialMonth?: string;
  initialSiteId?: string;
};

export function InvoiceManager({
  initialData,
  sites,
  templates,
  canIssue,
  companyComplete,
  isAdmin,
  initialMonth,
  initialSiteId = "",
}: InvoiceManagerProps) {
  const today = localDateKey(new Date());
  const [data, setData] = useState(initialData);
  const [candidates, setCandidates] = useState<CandidateData | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [month, setMonth] = useState(initialMonth ?? today.slice(0, 7));
  const [siteId, setSiteId] = useState(initialSiteId);
  const [issueDate, setIssueDate] = useState(today);
  const [displayMode, setDisplayMode] = useState<"AGGREGATED" | "ITEMIZED">("AGGREGATED");
  const [memo, setMemo] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "system-default");
  const [preview, setPreview] = useState<PreviewDocument[] | null>(null);
  const [pending, setPending] = useState<IssuePayload | null>(null);
  const [replacement, setReplacement] = useState<ReplacementState | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCandidates = useCallback(async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ month, siteId });
      const response = await fetch(`/api/invoices/candidates?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "발행 후보를 불러오지 못했습니다.");
      setCandidates(body);
      setSelected([]);
      setPreview(null);
      setPending(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "발행 후보를 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, [month, siteId]);

  async function loadInvoices(page = data.page) {
    const response = await fetch(`/api/invoices?page=${page}&pageSize=20`);
    const body = await response.json();
    if (response.ok) setData(body);
  }

  useEffect(() => {
    if (initialMonth || initialSiteId) void loadCandidates();
  }, [initialMonth, initialSiteId, loadCandidates]);

  useRealtimeRefresh(["invoice.changed", "monthlyClose.changed"], () => {
    void loadInvoices();
    if (candidates) void loadCandidates();
  });

  function toggle(cycleId: string) {
    setSelected((current) => current.includes(cycleId)
      ? current.filter((value) => value !== cycleId)
      : [...current, cycleId]);
    setPreview(null);
    setPending(null);
  }

  function selectAll() {
    if (!candidates) return;
    setSelected(selected.length === candidates.rows.length ? [] : candidates.rows.map((row) => row.cycleId));
    setPreview(null);
    setPending(null);
  }

  async function showPreview() {
    if (!selected.length) return toast.error("발행할 마감 회차를 선택해 주세요.");
    const template = templates.find((item) => item.id === templateId) ?? templates[0];
    if (!template) return toast.error("사용할 템플릿을 선택해 주세요.");
    const selectedRows = candidates?.rows.filter((row) => selected.includes(row.cycleId)) ?? [];
    const payload: IssuePayload = {
      cycles: selectedRows.map((row) => ({
        cycleId: row.cycleId,
        expectedCloseVersion: row.closeVersion,
        expectedRevenueFingerprint: row.revenueFingerprint,
      })),
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
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "미리보기를 만들지 못했습니다.");
      setPreview(body.documents);
      setPending(payload);
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
        outcome: "ISSUED" | "BLOCKED" | "ALREADY_ISSUED";
        document?: { id: string };
      }>;
      const ids = results.flatMap((result) => result.outcome === "ISSUED" && result.document ? [result.document.id] : []);
      const failed = results.length - ids.length;
      if (ids.length) toast.success(`거래명세표 ${ids.length}건을 발행했습니다.`);
      if (failed) toast.warning(`${failed}개 마감 회차는 상태 변경 또는 기존 발행으로 처리되지 않았습니다.`);
      setPreview(null);
      setPending(null);
      await Promise.all([loadCandidates(), loadInvoices(1)]);
      if (ids.length) window.open(`/invoices/print?ids=${ids.join(",")}`, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "거래명세표를 발행하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function openReplacement(source: InvoiceRow) {
    setReplacement({ source, issueDate: today, displayMode: source.displayMode, memo: "", templateId, preview: null });
  }

  function updateReplacement(patch: Partial<Omit<ReplacementState, "source">>) {
    setReplacement((current) => current ? { ...current, ...patch, preview: patch.preview ?? null } : current);
  }

  async function showReplacementPreview() {
    if (!replacement) return;
    const template = templates.find((item) => item.id === replacement.templateId) ?? templates[0];
    if (!template) return toast.error("사용할 템플릿을 선택해 주세요.");
    const payload = {
      sourceVersion: replacement.source.version,
      issueDate: replacement.issueDate,
      displayMode: replacement.displayMode,
      memo: replacement.memo.trim() || null,
      templateId: template.id,
      templateVersion: template.version,
    };
    setBusy(true);
    try {
      const response = await fetch(`/api/invoices/${replacement.source.id}/replacement-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "대체 발행 미리보기를 만들지 못했습니다.");
      setReplacement((current) => current ? {
        ...current,
        preview: {
          document: body.document,
          expectedRevenueEntryIds: body.expectedRevenueEntryIds,
          warnings: body.warnings,
        },
      } : current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "대체 발행 미리보기를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function replaceCurrentInvoice() {
    if (!replacement?.preview) return;
    const template = templates.find((item) => item.id === replacement.templateId) ?? templates[0];
    if (!template) return;
    const payload = {
      sourceVersion: replacement.source.version,
      expectedRevenueEntryIds: replacement.preview.expectedRevenueEntryIds,
      issueDate: replacement.issueDate,
      displayMode: replacement.displayMode,
      memo: replacement.memo.trim() || null,
      templateId: template.id,
      templateVersion: template.version,
    };
    setBusy(true);
    try {
      const response = await fetch(`/api/invoices/${replacement.source.id}/replace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "거래명세표를 대체 발행하지 못했습니다.");
      toast.success(`${replacement.source.invoiceNo}을(를) ${body.document.invoiceNo}(으)로 대체했습니다.`);
      setReplacement(null);
      await Promise.all([candidates ? loadCandidates() : Promise.resolve(), loadInvoices(1)]);
      window.open(`/invoices/print?ids=${body.document.id}`, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "거래명세표를 대체 발행하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const selectedRows = candidates?.rows.filter((row) => selected.includes(row.cycleId)) ?? [];
  const selectedSupply = selectedRows.reduce((sum, row) => sum + row.supplyAmount, 0);

  return <div className="space-y-6">
    <div className="flex justify-end">
      <Button variant="outline" render={<Link href="/invoices/templates" />}>
        <Settings2 data-icon="inline-start" />
        {canIssue ? "템플릿 관리" : "템플릿 보기"}
      </Button>
    </div>

    {canIssue && <section id="new-issue" className="scroll-mt-20 space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">신규 발행</h2>
          <p className="text-sm text-muted-foreground">마감 완료된 미발행 현장·월만 표시합니다.</p>
        </div>
        {!companyComplete && <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          공급자 정보가 필요합니다. {isAdmin ? <Link className="underline" href="/settings/company">설정하기</Link> : "관리자에게 설정을 요청하세요."}
        </div>}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="귀속월" type="month" value={month} onChange={setMonth} />
        <Select label="현장" value={siteId} onChange={setSiteId} options={[
          { value: "", label: "전체 현장" },
          ...sites.map((site) => ({ value: site.id, label: site.name })),
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
            <span className="font-medium">후보 {candidates.total}개 회차</span>
            <span className="ml-3 text-muted-foreground">선택 {selected.length}개 · {selectedSupply.toLocaleString()}원</span>
          </div>
          <Button size="sm" variant="outline" onClick={selectAll}>
            {selected.length === candidates.rows.length ? "전체 해제" : "전체 선택"}
          </Button>
        </div>
        <div className="max-h-96 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>귀속월</TableHead>
                <TableHead>현장</TableHead>
                <TableHead className="text-right">확정 매출</TableHead>
                <TableHead className="text-right">공급가액</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.rows.length === 0 ? <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  마감 완료 후 발행 가능한 회차가 없습니다.
                </TableCell>
              </TableRow> : candidates.rows.map((row) => <TableRow key={row.cycleId}>
                <TableCell>
                  <input
                    aria-label={`${row.siteName} ${row.month} 마감 회차 선택`}
                    type="checkbox"
                    checked={selected.includes(row.cycleId)}
                    onChange={() => toggle(row.cycleId)}
                  />
                </TableCell>
                <TableCell>{row.month}</TableCell>
                <TableCell><span className="font-medium">{row.siteName}</span><span className="block text-xs text-muted-foreground">{row.siteCode}</span></TableCell>
                <TableCell className="text-right tabular-nums">{row.revenueCount}건</TableCell>
                <TableCell className="text-right tabular-nums">{row.supplyAmount.toLocaleString()}원</TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          <Field label="발행일" type="date" value={issueDate} onChange={(value) => { setIssueDate(value); setPreview(null); }} />
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
        <div><h2 className="font-semibold">발행 이력</h2><p className="text-sm text-muted-foreground">최신 유효본과 대체된 과거 snapshot을 구분해 관리합니다.</p></div>
        <Button size="sm" variant="outline" onClick={() => void loadInvoices()}><RefreshCw data-icon="inline-start" />새로고침</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>발행번호</TableHead><TableHead>상태</TableHead><TableHead>발행일</TableHead><TableHead>수신처</TableHead><TableHead>귀속기간</TableHead><TableHead>원장/표시행</TableHead><TableHead className="text-right">공급가액</TableHead><TableHead>방식</TableHead><TableHead className="text-right">관리</TableHead></TableRow></TableHeader>
          <TableBody>{data.rows.length === 0 ? <TableRow><TableCell colSpan={9} className="h-28 text-center text-muted-foreground">발행된 거래명세표가 없습니다.</TableCell></TableRow> : data.rows.map((row) => <TableRow key={row.id} className={row.status === "SUPERSEDED" ? "opacity-65" : undefined}>
            <TableCell className="font-mono text-xs">{row.invoiceNo}{row.supersededBy && <span className="block font-sans text-[11px] text-muted-foreground">→ {row.supersededBy.invoiceNo}</span>}</TableCell>
            <TableCell><Badge variant={row.status === "ISSUED" ? "secondary" : "outline"}>{row.status === "ISSUED" ? "유효" : row.status === "SUPERSEDED" ? "대체됨" : "작성 중"}</Badge></TableCell>
            <TableCell>{row.issueDate.slice(0, 10)}</TableCell><TableCell>{row.recipientName}</TableCell>
            <TableCell className="text-xs">{row.periodStart.slice(0, 10)} ~ {row.periodEnd.slice(0, 10)}</TableCell>
            <TableCell>{row._count.revenueLinks}/{row._count.lines}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">{row.subtotal.toLocaleString()}</TableCell>
            <TableCell><Badge variant="outline">{row.displayMode === "AGGREGATED" ? "합산" : "건별"}</Badge></TableCell>
            <TableCell className="text-right"><div className="flex justify-end gap-1">
              {canIssue && row.status === "ISSUED" && <Button size="sm" variant="outline" onClick={() => openReplacement(row)}><RefreshCw data-icon="inline-start" />대체 발행</Button>}
              <Button size="sm" variant="ghost" render={<a href={`/invoices/print?ids=${row.id}`} target="_blank" rel="noreferrer" />}><Printer data-icon="inline-start" />재출력</Button>
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
        <DialogHeader><DialogTitle>거래명세표 발행 미리보기</DialogTitle><DialogDescription>선택한 마감 회차의 snapshot으로 발행할 실제 A4 배치를 확인하세요.</DialogDescription></DialogHeader>
        <div className="overflow-auto rounded-xl bg-slate-100 p-4"><InvoiceDocumentPages documents={preview.map(toPrintPreview)} /></div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPreview(null)}>돌아가기</Button><Button disabled={busy} onClick={() => void issue()}><FileCheck2 data-icon="inline-start" />{busy ? "발행 중..." : `${preview.length}건 발행`}</Button></div>
      </DialogContent>
    </Dialog>}

    {replacement && <Dialog open onOpenChange={(open) => { if (!open) setReplacement(null); }}>
      <DialogContent className="max-h-[94svh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader><DialogTitle>{replacement.source.invoiceNo} 대체 발행</DialogTitle><DialogDescription>{replacement.source.recipientName} · {replacement.source.periodStart.slice(0, 10)} ~ {replacement.source.periodEnd.slice(0, 10)}의 재마감된 확정 매출 전체로 새 유효본을 만듭니다.</DialogDescription></DialogHeader>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="새 발행일" type="date" value={replacement.issueDate} onChange={(value) => updateReplacement({ issueDate: value })} />
          <Select label="표시 방식" value={replacement.displayMode} onChange={(value) => updateReplacement({ displayMode: value as "AGGREGATED" | "ITEMIZED" })} options={[{ value: "AGGREGATED", label: "동일 품목 합산" }, { value: "ITEMIZED", label: "원장 건별 표시" }]} />
          <Select label="출력 템플릿" value={replacement.templateId} onChange={(value) => updateReplacement({ templateId: value })} options={templates.map((template) => ({ value: template.id, label: template.name }))} />
          <Field label="메모" value={replacement.memo} onChange={(value) => updateReplacement({ memo: value })} placeholder="선택" />
        </div>
        {replacement.preview ? <>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm"><strong>재마감 매출 {replacement.preview.expectedRevenueEntryIds.length}건</strong>{replacement.preview.warnings.length > 0 && <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900"><p className="font-medium">확정 매출이 없는 진행 계약이 있습니다.</p><ul className="mt-1 list-disc pl-5">{replacement.preview.warnings.map((warning) => <li key={warning.id}>{warning.contractNo} · {warning.title}</li>)}</ul><p className="mt-1 text-xs">필요한 계약 매출을 생성·확정하고 재마감한 뒤 다시 미리보기하세요.</p></div>}</div>
          <div className="overflow-auto rounded-xl bg-slate-100 p-4"><InvoiceDocumentPages documents={[toPrintPreview(replacement.preview.document, 0)]} /></div>
        </> : <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">월을 되돌려 수정한 뒤 재마감한 회차가 있어야 대체 발행할 수 있습니다.</div>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setReplacement(null)}>취소</Button>{replacement.preview ? <><Button variant="outline" disabled={busy} onClick={() => updateReplacement({ preview: null })}>설정 변경</Button><Button disabled={busy} onClick={() => void replaceCurrentInvoice()}><FileCheck2 data-icon="inline-start" />{busy ? "대체 발행 중..." : "재마감 회차로 대체 발행"}</Button></> : <Button disabled={busy} onClick={() => void showReplacementPreview()}><Eye data-icon="inline-start" />대체 발행 미리보기</Button>}</div>
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
