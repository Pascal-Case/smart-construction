"use client";

import { AlertTriangle, CheckCircle2, Database, Download, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LegacyMigrationHistory, LegacyMigrationPreview, MigrationAction } from "@/lib/migration/types";

const actionLabels: Record<MigrationAction, string> = { CREATE: "신규", REUSE: "기존 사용", UPDATE: "갱신", SKIP: "건너뜀", ERROR: "오류" };

export function MigrationManager({ initialHistory }: { initialHistory: LegacyMigrationHistory[] }) {
  const [preview, setPreview] = useState<LegacyMigrationPreview | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [sourceName, setSourceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [committed, setCommitted] = useState(false);

  async function selectFile(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("이관 파일은 5MB 이하만 사용할 수 있습니다.");
    setBusy(true); setPreview(null); setCommitted(false); setSourceName(file.name);
    try {
      let response: Response;
      if (/\.json$/i.test(file.name)) {
        let bundle: unknown;
        try { bundle = JSON.parse(await file.text()); } catch { throw new Error("JSON 파일 형식이 올바르지 않습니다."); }
        response = await fetch("/api/migration/legacy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bundle, sourceName: file.name }) });
      } else if (/\.(xlsx|xlsm)$/i.test(file.name)) {
        const formData = new FormData(); formData.set("file", file);
        response = await fetch("/api/migration/excel/preview", { method: "POST", body: formData });
      } else throw new Error("json, xlsx 또는 xlsm 파일을 선택해 주세요.");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "이관 파일을 분석하지 못했습니다.");
      setPreview(body); toast.success("이관 미리보기를 만들었습니다.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "이관 파일을 분석하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function commit() {
    if (!preview?.canCommit || committed) return;
    if (!window.confirm("미리보기의 신규·갱신 항목을 실제 DB에 이관할까요? 먼저 운영 DB 백업을 권장합니다.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/migration/legacy/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bundle: preview.normalizedBundle, fingerprint: preview.fingerprint, sourceName }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "데이터를 이관하지 못했습니다.");
      const batch = body.batch as LegacyMigrationHistory;
      setCommitted(true); setHistory((current) => [batch, ...current].slice(0, 10)); toast.success("레거시 데이터 이관을 완료했습니다.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "데이터를 이관하지 못했습니다."); }
    finally { setBusy(false); }
  }

  function downloadReport() {
    if (!preview) return;
    const report = { generatedAt: new Date().toISOString(), sourceName, fingerprint: preview.fingerprint, canCommit: preview.canCommit, summary: preview.summary, issues: preview.issues, rows: preview.rows };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "migration-report-" + new Date().toISOString().slice(0, 10) + ".json"; link.click(); URL.revokeObjectURL(url);
  }

  return <div className="space-y-6">
    <Alert className="border-amber-300 bg-amber-50 text-amber-950"><AlertTriangle /><AlertTitle>이관 전 백업 필수</AlertTitle><AlertDescription>파일 분석만으로 DB가 바뀌지 않습니다. 오류 0건과 검증 보고서를 확인한 뒤 확정하세요. 같은 데이터의 재이관은 차단됩니다.</AlertDescription></Alert>
    <div className="rounded-xl border bg-white p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">이관 파일 선택</h2><p className="mt-1 text-sm text-muted-foreground">기존 HTML의 이관 JSON 또는 현장·품목·수량·시작일·종료일 열이 있는 xlsx/xlsm 파일을 지원합니다.</p></div><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Upload className="size-4" />{busy ? "처리 중..." : "파일 선택"}<input type="file" accept=".json,.xlsx,.xlsm" className="sr-only" disabled={busy} onChange={(event) => { void selectFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div></div>

    {preview && <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Summary label="품목" value={preview.summary.totalItems} detail={"신규 " + preview.summary.createdItems + " / 기존 " + preview.summary.reusedItems} />
        <Summary label="현장" value={preview.summary.totalSites} detail={"신규 " + preview.summary.createdSites + " / 기존 " + preview.summary.reusedSites} />
        <Summary label="계약" value={preview.summary.totalContracts} detail={"신규 " + preview.summary.createdContracts + " / 제외 " + preview.summary.skippedContracts} />
        <Summary label="오류" value={preview.summary.errorCount} detail="수정 후 다시 분석" destructive={preview.summary.errorCount > 0} />
        <Summary label="경고" value={preview.summary.warningCount} detail="확인 후 이관" />
      </div>
      {preview.issues.length ? <div className="rounded-xl border bg-white p-4"><h3 className="font-semibold">검증 이슈</h3><ul className="mt-3 max-h-48 space-y-2 overflow-auto text-sm">{preview.issues.map((issue, index) => <li key={issue.kind + issue.rowKey + index} className="flex gap-2"><Badge variant={issue.severity === "ERROR" ? "destructive" : "outline"}>{issue.severity}</Badge><span>{issue.kind} {issue.rowKey}: {issue.message}</span></li>)}</ul></div> : <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950"><CheckCircle2 /><AlertTitle>검증 오류 없음</AlertTitle><AlertDescription>처리 예정 내역과 합계를 확인한 뒤 확정할 수 있습니다.</AlertDescription></Alert>}
      <div className="overflow-hidden rounded-xl border bg-white"><div className="flex items-center justify-between border-b p-4"><div><h3 className="font-semibold">처리 예정 내역</h3><p className="text-xs text-muted-foreground">화면은 200행, 보고서는 전체 내역을 포함합니다.</p></div><Button variant="outline" onClick={downloadReport}><Download data-icon="inline-start" />검증 보고서</Button></div><div className="max-h-[32rem] overflow-auto"><Table><TableHeader><TableRow><TableHead>구분</TableHead><TableHead>레거시 키</TableHead><TableHead>대상</TableHead><TableHead>처리</TableHead><TableHead>설명</TableHead></TableRow></TableHeader><TableBody>{preview.rows.slice(0, 200).map((row) => <TableRow key={row.kind + row.rowKey}><TableCell>{row.kind}</TableCell><TableCell className="font-mono text-xs">{row.rowKey}</TableCell><TableCell>{row.label}</TableCell><TableCell><Badge variant={row.action === "ERROR" ? "destructive" : "outline"}>{actionLabels[row.action]}</Badge></TableCell><TableCell className="text-sm text-muted-foreground">{row.message}</TableCell></TableRow>)}</TableBody></Table></div></div>
      <div className="flex justify-end"><Button disabled={!preview.canCommit || busy || committed} onClick={() => void commit()}><Database data-icon="inline-start" />{committed ? "이관 완료" : busy ? "이관 중..." : "검증 결과대로 확정 이관"}</Button></div>
    </div>}

    <div className="overflow-hidden rounded-xl border bg-white"><div className="border-b p-4"><h2 className="font-semibold">최근 이관 이력</h2><p className="text-xs text-muted-foreground">같은 fingerprint는 다시 이관할 수 없습니다.</p></div><Table><TableHeader><TableRow><TableHead>일시</TableHead><TableHead>파일</TableHead><TableHead>유형</TableHead><TableHead>품목/현장/계약</TableHead><TableHead>생성 계약</TableHead><TableHead>담당자</TableHead></TableRow></TableHeader><TableBody>{history.length === 0 ? <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">이관 이력이 없습니다.</TableCell></TableRow> : history.map((batch) => <TableRow key={batch.id}><TableCell className="whitespace-nowrap">{new Date(batch.createdAt).toLocaleString("ko-KR")}</TableCell><TableCell>{batch.sourceName ?? "-"}</TableCell><TableCell><Badge variant="outline">{batch.sourceType}</Badge></TableCell><TableCell>{batch.totalItems}/{batch.totalSites}/{batch.totalContracts}</TableCell><TableCell>{batch.createdContracts}</TableCell><TableCell>{batch.actorName}</TableCell></TableRow>)}</TableBody></Table></div>
  </div>;
}

function Summary({ label, value, detail, destructive = false }: { label: string; value: number; detail: string; destructive?: boolean }) {
  return <div className={"rounded-xl border bg-white p-4 " + (destructive ? "border-red-300" : "")}><p className="text-xs text-muted-foreground">{label}</p><p className={"mt-1 text-2xl font-semibold tabular-nums " + (destructive ? "text-red-700" : "")}>{value.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}
