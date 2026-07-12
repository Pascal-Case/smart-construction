"use client";

import { AlertTriangle, CheckCircle2, FileCheck2, LockKeyhole, RefreshCw, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import {
  filterControlRoomRows,
  sortControlRoomRows,
  type MonthCloseControlRoomRow,
  type MonthCloseView,
} from "@/components/reports/month-close-control-room-state";
import { useRealtimeRefresh } from "@/components/realtime-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MonthCloseException } from "@/lib/monthly-close/types";

export type ControlRoomData = {
  month: string;
  rows: MonthCloseControlRoomRow[];
  summary: {
    targetCount: number;
    closedCount: number;
    openCount: number;
    blockingSiteCount: number;
    complete: boolean;
  };
};

type ReviewTarget = { siteId: string; siteName: string; exception: MonthCloseException };

export function MonthCloseControlRoom({ initialMonth, initialData, canClose, isAdmin }: { initialMonth: string; initialData: ControlRoomData; canClose: boolean; isAdmin: boolean }) {
  const [month, setMonth] = useState(initialMonth);
  const [view, setView] = useState<MonthCloseView>("exceptions");
  const [data, setData] = useState<ControlRoomData | null>(initialData);
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reopenTarget, setReopenTarget] = useState<MonthCloseControlRoomRow | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const response = await fetch(`/api/monthly-closes?${new URLSearchParams({ month, view: "all" })}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "월마감 현황을 불러오지 못했습니다.");
      setData(body);
      const visibleIds = new Set((body.rows as MonthCloseControlRoomRow[]).map((row) => row.site.id));
      setSelected((current) => current.filter((siteId) => visibleIds.has(siteId)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "월마감 현황을 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  useRealtimeRefresh(["monthlyClose.changed", "contract.changed", "revenue.changed", "invoice.changed"], () => { void load(); });

  const rows = sortControlRoomRows(filterControlRoomRows(data?.rows ?? [], view));
  const openRows = (data?.rows ?? []).filter((row) => row.close?.state !== "CLOSED");
  const selectedRows = (data?.rows ?? []).filter((row) => selected.includes(row.site.id) && row.close?.state !== "CLOSED");

  function toggle(siteId: string) {
    setSelected((current) => current.includes(siteId) ? current.filter((value) => value !== siteId) : [...current, siteId]);
  }

  async function closeRows(targets: MonthCloseControlRoomRow[]) {
    if (!targets.length) return toast.error("마감할 현장을 선택해 주세요.");
    setBusy(true);
    try {
      const response = await fetch("/api/monthly-closes/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          targets: targets.map((row) => ({ siteId: row.site.id, expectedFingerprint: row.commitFingerprint })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "마감을 완료하지 못했습니다.");
      const results = body.results as Array<{ outcome: "CLOSED" | "BLOCKED" | "ALREADY_CLOSED" | "CHANGED" }>;
      const counts = countOutcomes(results);
      const summary = `마감 ${counts.CLOSED} · 차단 ${counts.BLOCKED} · 이미 마감 ${counts.ALREADY_CLOSED} · 상태 변경 ${counts.CHANGED}`;
      if (results.length === counts.CLOSED) toast.success(summary);
      else toast.warning(summary);
      setSelected([]);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "마감을 완료하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReview() {
    if (!reviewTarget || !reviewReason.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/monthly-closes/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: reviewTarget.siteId,
          month,
          exceptionKey: reviewTarget.exception.key,
          expectedFingerprint: reviewTarget.exception.fingerprint,
          reason: reviewReason,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "예외 검토를 저장하지 못했습니다.");
      toast.success("예외 검토 사유를 저장했습니다.");
      setReviewTarget(null);
      setReviewReason("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "예외 검토를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReopen() {
    const latestCycle = reopenTarget?.close?.cycles[0];
    if (!reopenTarget?.close || !latestCycle || !reopenReason.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/monthly-closes/${reopenTarget.close.id}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: reopenTarget.close.version,
          latestCycleId: latestCycle.id,
          reason: reopenReason,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "마감을 되돌리지 못했습니다.");
      toast.success(`${reopenTarget.site.name}의 ${month} 마감을 되돌렸습니다.`);
      setReopenTarget(null);
      setReopenReason("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "마감을 되돌리지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-5">
    <section className="flex flex-wrap items-end justify-between gap-3 rounded-xl border bg-card p-4">
      <div className="w-full max-w-xs space-y-1.5"><Label>매출월</Label><Input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setData(null); setSelected([]); }} /></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void load()}><RefreshCw data-icon="inline-start" />조회</Button>
        {canClose && <Button variant="outline" disabled={busy || selectedRows.length === 0} onClick={() => void closeRows(selectedRows)}><LockKeyhole data-icon="inline-start" />선택 마감</Button>}
        {canClose && <Button disabled={busy || openRows.length === 0} onClick={() => void closeRows(openRows)}><FileCheck2 data-icon="inline-start" />열린 현장 모두 마감</Button>}
      </div>
    </section>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard title="대상 현장" value={data?.summary.targetCount ?? 0} description="계약·매출·발행 이력이 있는 현장" />
      <SummaryCard title="마감 완료" value={data?.summary.closedCount ?? 0} description={data?.summary.complete ? "이번 달 마감 완료" : "마감된 현장"} tone="success" />
      <SummaryCard title="열린 현장" value={data?.summary.openCount ?? 0} description="수정과 추가 입력이 가능한 현장" />
      <SummaryCard title="차단 현장" value={data?.summary.blockingSiteCount ?? 0} description="처리 전 마감할 수 없는 예외" tone={data?.summary.blockingSiteCount ? "warning" : "success"} />
    </div>

    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border p-1">
          <Button size="sm" variant={view === "exceptions" ? "secondary" : "ghost"} onClick={() => setView("exceptions")}>예외만</Button>
          <Button size="sm" variant={view === "all" ? "secondary" : "ghost"} onClick={() => setView("all")}>전체 현장</Button>
        </div>
        <p className="text-sm text-muted-foreground">직접 입력, 계약·단가 차이, 발행 후 변경을 한곳에서 확인합니다.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead className="w-10"></TableHead><TableHead>현장</TableHead><TableHead>상태</TableHead><TableHead className="text-right">매출</TableHead><TableHead>예외</TableHead><TableHead className="text-right">관리</TableHead></TableRow></TableHeader>
          <TableBody>{rows.length === 0 ? <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">{busy ? "월마감 현황을 불러오는 중입니다." : view === "exceptions" ? "확인할 예외가 없습니다." : "마감 대상 현장이 없습니다."}</TableCell></TableRow> : rows.map((row) => {
            const closed = row.close?.state === "CLOSED";
            const latestCycle = row.close?.cycles[0];
            return <TableRow key={row.site.id} className={closed ? "bg-emerald-50/30 hover:bg-emerald-50/50 dark:bg-transparent dark:hover:bg-muted/50" : undefined}>
              <TableCell><input aria-label={`${row.site.name} 선택`} type="checkbox" disabled={closed || !canClose} checked={selected.includes(row.site.id)} onChange={() => toggle(row.site.id)} /></TableCell>
              <TableCell><span className="font-medium">{row.site.name}</span><span className="block text-xs text-muted-foreground">{row.site.code}</span></TableCell>
              <TableCell><div className="flex flex-wrap gap-1">{closed ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300" variant="outline"><CheckCircle2 data-icon="inline-start" />마감 {row.close?.latestCycleNo}회차</Badge> : row.evaluation.blockingCount > 0 ? <Badge className="border-red-200 bg-red-50 text-red-800" variant="outline"><AlertTriangle data-icon="inline-start" />차단 {row.evaluation.blockingCount}</Badge> : <Badge variant="secondary">마감 가능</Badge>}{row.evaluation.replacementRequired && <Badge className="border-amber-200 bg-amber-50 text-amber-800" variant="outline">대체 발행 필요</Badge>}</div>{latestCycle && <span className="mt-1 block text-xs text-muted-foreground">{new Date(latestCycle.closedAt).toLocaleString("ko-KR")}</span>}{row.close && <CloseHistory close={row.close} />}</TableCell>
              <TableCell className="text-right"><span className="font-medium tabular-nums">{row.evaluation.totals.totalSalesAmount.toLocaleString()}원</span><span className="block text-xs text-muted-foreground">{row.evaluation.totals.revenueCount}건</span></TableCell>
              <TableCell><div className="min-w-72 space-y-2">{row.evaluation.exceptions.length === 0 ? <span className="text-sm text-muted-foreground">예외 없음</span> : row.evaluation.exceptions.map((exception) => <div key={exception.key} className="rounded-lg border p-2 text-sm"><div className="flex items-start justify-between gap-2"><span>{exception.message}</span><Badge variant="outline">{exceptionLabel(exception)}</Badge></div><div className="mt-1 flex items-center justify-between"><span className={exception.blocking ? "text-xs text-red-700" : "text-xs text-muted-foreground"}>{exception.reviewed ? "검토 완료" : exception.blocking ? "마감 차단" : "인지 필요"}</span>{canClose && exception.reviewable && !exception.reviewed && <Button size="xs" variant="outline" onClick={() => { setReviewTarget({ siteId: row.site.id, siteName: row.site.name, exception }); setReviewReason(""); }}>검토</Button>}</div></div>)}</div></TableCell>
              <TableCell className="text-right"><div className="flex min-w-36 flex-col items-end gap-1">{canClose && !closed && <Button size="sm" disabled={busy || !row.evaluation.canClose} onClick={() => void closeRows([row])}><LockKeyhole data-icon="inline-start" />마감</Button>}{isAdmin && closed && latestCycle && <Button size="sm" variant="outline" onClick={() => { setReopenTarget(row); setReopenReason(""); }}><RotateCcw data-icon="inline-start" />마감 되돌리기</Button>}{closed && latestCycle && <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/invoices?month=${month}&siteId=${row.site.id}#new-issue`} />}><Search data-icon="inline-start" />발행으로 이동</Button>}</div></TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
      </div>
    </section>

    {reviewTarget && <Dialog open onOpenChange={(open) => { if (!open) setReviewTarget(null); }}><DialogContent><DialogHeader><DialogTitle>예외 검토</DialogTitle><DialogDescription>{reviewTarget.siteName} · {reviewTarget.exception.message}</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="review-reason">인지 및 승인 사유</Label><textarea id="review-reason" value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} className="min-h-28 w-full rounded-lg border bg-background p-3 text-sm" placeholder="계약과 다른 단가 또는 직접 입력 사유를 기록하세요." /></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setReviewTarget(null)}>취소</Button><Button disabled={busy || !reviewReason.trim()} onClick={() => void submitReview()}>검토 완료</Button></div></DialogContent></Dialog>}

    {reopenTarget && <Dialog open onOpenChange={(open) => { if (!open) setReopenTarget(null); }}><DialogContent><DialogHeader><DialogTitle>마감 되돌리기</DialogTitle><DialogDescription>{reopenTarget.site.name}의 {month} 마감을 열어 수정할 수 있게 합니다. 이미 발행한 거래명세표가 있으면 수정 후 재마감하고 대체 발행해야 합니다.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="reopen-reason">되돌리기 사유</Label><textarea id="reopen-reason" value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} className="min-h-28 w-full rounded-lg border bg-background p-3 text-sm" placeholder="20일 이후 접수된 예외 등 되돌리는 이유를 기록하세요." /></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setReopenTarget(null)}>취소</Button><Button disabled={busy || !reopenReason.trim()} onClick={() => void submitReopen()}><RotateCcw data-icon="inline-start" />되돌리기</Button></div></DialogContent></Dialog>}
  </div>;
}

function SummaryCard({ title, value, description, tone }: { title: string; value: number; description: string; tone?: "success" | "warning" }) {
  const color = tone === "success" ? "text-emerald-700" : tone === "warning" ? "text-red-700" : "text-foreground";
  return <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{title}</CardTitle></CardHeader><CardContent><p className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></CardContent></Card>;
}

function exceptionLabel(exception: MonthCloseException) {
  return {
    CONTRACT_DIFFERENCE: "계약 차이",
    DIRECT_INPUT: "직접 입력",
    DRAFT_REVENUE: "미확정",
    INVOICE_HISTORY: "발행 이력",
    REPLACEMENT_REQUIRED: "대체 발행",
  }[exception.kind];
}

function CloseHistory({ close }: { close: NonNullable<MonthCloseControlRoomRow["close"]> }) {
  return <details className="mt-2 text-xs">
    <summary className="cursor-pointer text-muted-foreground">마감 {close.cycles.length}회 · 되돌리기 {close.reopens.length}회</summary>
    <div className="mt-2 min-w-64 space-y-2 rounded-lg border bg-background p-2">
      {close.cycles.map((cycle) => <div key={cycle.id}>
        <p className="font-medium">{cycle.cycleNo}회차 · {cycle.totalSalesAmount.toLocaleString()}원 · {cycle.revenueCount}건</p>
        <p className="text-muted-foreground">{cycle.closedByName} · {new Date(cycle.closedAt).toLocaleString("ko-KR")}</p>
      </div>)}
      {close.reopens.map((reopen) => <div key={reopen.id} className="border-t pt-2">
        <p className="font-medium">되돌리기 · {reopen.reason}</p>
        <p className="text-muted-foreground">{reopen.reopenedByName} · {new Date(reopen.reopenedAt).toLocaleString("ko-KR")}</p>
      </div>)}
    </div>
  </details>;
}

function countOutcomes(results: Array<{ outcome: "CLOSED" | "BLOCKED" | "ALREADY_CLOSED" | "CHANGED" }>) {
  const counts = { CLOSED: 0, BLOCKED: 0, ALREADY_CLOSED: 0, CHANGED: 0 };
  for (const result of results) counts[result.outcome] += 1;
  return counts;
}
