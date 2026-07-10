"use client";

import { AlertTriangle, MessageSquare, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  useRealtimeEvent,
  useRealtimeRefresh,
} from "@/components/realtime-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Detail = {
  id: string;
  revenueDate: string;
  sourceType: "CONTRACT" | "MANUAL" | "ADJUSTMENT";
  status: "DRAFT" | "CONFIRMED" | "CANCELED";
  title: string;
  quantity: number | null;
  unit: string | null;
  appliedSalesPrice: number | null;
  salesAmount: number;
  costAmount: number | null;
  itemName: string | null;
};
type Cell = {
  month: string;
  salesAmount: number;
  costAmount: number;
  profit: number;
  count: number;
  draftCount: number;
  zeroAmountCount: number;
  hasMemo: boolean;
  details: Detail[];
};
type Totals = {
  salesAmount: number;
  costAmount: number;
  profit: number;
  count: number;
  draftCount: number;
  zeroAmountCount: number;
};
export type MonthlyReportData = {
  startMonth: string;
  endMonth: string;
  months: string[];
  rows: Array<{
    id: string;
    code: string;
    name: string;
    cells: Cell[];
    totals: Totals;
  }>;
  monthTotals: Array<{ month: string } & Totals>;
  grandTotals: Totals;
};
type SiteOption = { id: string; name: string };
type Metric = "salesAmount" | "costAmount" | "profit";
const metricLabels = {
  salesAmount: "매출",
  costAmount: "매입",
  profit: "이익",
};

export function MonthlyReport({
  initialData,
  sites,
  canEdit,
  currentUserId,
}: {
  initialData: MonthlyReportData;
  sites: SiteOption[];
  canEdit: boolean;
  currentUserId: string;
}) {
  const [data, setData] = useState(initialData);
  const [startMonth, setStartMonth] = useState(initialData.startMonth);
  const [endMonth, setEndMonth] = useState(initialData.endMonth);
  const [siteId, setSiteId] = useState("");
  const [metric, setMetric] = useState<Metric>("salesAmount");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<{ siteName: string; cell: Cell } | null>(
    null,
  );
  const [memo, setMemo] = useState<{
    siteId: string;
    siteName: string;
    month: string;
  } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startMonth, endMonth, siteId });
      const response = await fetch(`/api/reports/monthly?${params}`);
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message ?? "월별 현황을 불러오지 못했습니다.",
        );
      setData(body);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "월별 현황을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [startMonth, endMonth, siteId]);
  useRealtimeRefresh(
    ["monthlyMemo.changed", "revenue.changed"],
    () => void load(),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 xl:flex-row xl:items-end">
        <form
          className="grid flex-1 gap-3 sm:grid-cols-4 sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <MonthField
            label="시작월"
            value={startMonth}
            onChange={setStartMonth}
          />
          <MonthField label="종료월" value={endMonth} onChange={setEndMonth} />
          <div className="space-y-1.5">
            <Label>현장</Label>
            <select
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
            >
              <option value="">전체 현장</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline" disabled={loading}>
            <Search data-icon="inline-start" />
            조회
          </Button>
        </form>
        <div className="flex gap-2">
          {(Object.keys(metricLabels) as Metric[]).map((value) => (
            <Button
              key={value}
              variant={metric === value ? "default" : "outline"}
              onClick={() => setMetric(value)}
            >
              {metricLabels[value]}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary
          label={`${metricLabels[metric]} 합계`}
          value={data.grandTotals[metric]}
        />
        <Summary
          label="작성 중 건"
          value={data.grandTotals.draftCount}
          plain
          warn={data.grandTotals.draftCount > 0}
        />
        <Summary
          label="0원 건"
          value={data.grandTotals.zeroAmountCount}
          plain
          warn={data.grandTotals.zeroAmountCount > 0}
        />
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 min-w-48 bg-white">
                현장
              </TableHead>
              {data.months.map((month) => (
                <TableHead key={month} className="min-w-40 text-right">
                  {month}
                </TableHead>
              ))}
              <TableHead className="min-w-40 text-right">합계</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="sticky left-0 z-10 bg-white">
                  <span className="font-medium">{row.name}</span>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {row.code}
                  </span>
                </TableCell>
                {row.cells.map((cell) => (
                  <TableCell key={cell.month} className="p-1.5 align-top">
                    <div className="group relative">
                      <button
                        type="button"
                        onClick={() => setDetail({ siteName: row.name, cell })}
                        className="w-full rounded-lg border bg-slate-50 p-2 text-right hover:border-teal-300 hover:bg-teal-50"
                      >
                        <span className="block font-semibold tabular-nums">
                          {cell[metric].toLocaleString()}
                        </span>
                        <span className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                          {cell.count}건
                          {cell.draftCount > 0 && (
                            <AlertTriangle className="size-3 text-amber-600" />
                          )}
                        </span>
                      </button>
                      <div className="pointer-events-none absolute right-0 bottom-full z-30 mb-1 hidden w-64 rounded-lg border bg-white p-3 text-xs shadow-xl group-hover:block">
                        <p className="font-semibold">
                          {row.name} · {cell.month}
                        </p>
                        <p className="mt-2">
                          매출 {cell.salesAmount.toLocaleString()}원
                        </p>
                        <p>매입 {cell.costAmount.toLocaleString()}원</p>
                        <p>이익 {cell.profit.toLocaleString()}원</p>
                        <p className="mt-1 text-muted-foreground">
                          작성 중 {cell.draftCount}건 · 0원{" "}
                          {cell.zeroAmountCount}건
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="mt-1 w-full"
                      onClick={() =>
                        setMemo({
                          siteId: row.id,
                          siteName: row.name,
                          month: cell.month,
                        })
                      }
                    >
                      <MessageSquare
                        data-icon="inline-start"
                        className={
                          cell.hasMemo ? "fill-teal-100 text-teal-700" : ""
                        }
                      />
                      {cell.hasMemo ? "메모 보기" : "메모"}
                    </Button>
                  </TableCell>
                ))}
                <TableCell className="text-right font-semibold tabular-nums">
                  {row.totals[metric].toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-slate-50 font-semibold">
              <TableCell className="sticky left-0 bg-slate-50">
                월 합계
              </TableCell>
              {data.monthTotals.map((total) => (
                <TableCell
                  key={total.month}
                  className="text-right tabular-nums"
                >
                  {total[metric].toLocaleString()}
                </TableCell>
              ))}
              <TableCell className="text-right tabular-nums">
                {data.grandTotals[metric].toLocaleString()}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      {detail && (
        <DetailDialog
          siteName={detail.siteName}
          cell={detail.cell}
          onClose={() => setDetail(null)}
        />
      )}
      {memo && (
        <MemoDialog
          {...memo}
          canEdit={canEdit}
          currentUserId={currentUserId}
          onClose={() => setMemo(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}

function DetailDialog({
  siteName,
  cell,
  onClose,
}: {
  siteName: string;
  cell: Cell;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {siteName} · {cell.month} 상세
          </DialogTitle>
          <DialogDescription>
            원장 {cell.count}건의 합계입니다.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60svh] overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>귀속일</TableHead>
                <TableHead>출처</TableHead>
                <TableHead>내용</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>수량·단가</TableHead>
                <TableHead className="text-right">매출</TableHead>
                <TableHead className="text-right">매입</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cell.details.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.revenueDate.slice(0, 10)}</TableCell>
                  <TableCell>{row.sourceType}</TableCell>
                  <TableCell>
                    {row.title}
                    <span className="block text-xs text-muted-foreground">
                      {row.itemName}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.quantity == null
                      ? "직접 금액"
                      : `${row.quantity} ${row.unit ?? ""} × ${(row.appliedSalesPrice ?? 0).toLocaleString()}`}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.salesAmount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {(row.costAmount ?? 0).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MemoDialog({
  siteId,
  siteName,
  month,
  canEdit,
  currentUserId,
  onClose,
  onSaved,
}: {
  siteId: string;
  siteName: string;
  month: string;
  canEdit: boolean;
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState("");
  const [version, setVersion] = useState<number | null>(null);
  const [updated, setUpdated] = useState<{ name: string; at: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(true);
  const [conflict, setConflict] = useState(false);
  const load = useCallback(
    async (overwrite = true) => {
      const response = await fetch(
        `/api/monthly-memos?siteId=${encodeURIComponent(siteId)}&month=${month}`,
      );
      const body = await response.json();
      if (!response.ok)
        return toast.error(
          body.error?.message ?? "메모를 불러오지 못했습니다.",
        );
      if (overwrite) setContent(body.memo?.content ?? "");
      setVersion(body.memo?.version ?? null);
      setUpdated(
        body.memo
          ? { name: body.memo.updatedByName, at: body.memo.updatedAt }
          : null,
      );
      if (overwrite) setConflict(false);
      setBusy(false);
    },
    [siteId, month],
  );
  useEffect(() => {
    const initialLoad = setTimeout(() => void load(), 0);
    return () => clearTimeout(initialLoad);
  }, [load]);
  useRealtimeEvent(["monthlyMemo.changed"], (event) => {
    if (
      event.siteId !== siteId ||
      event.month !== month ||
      event.actorId === currentUserId
    ) return;
    setConflict(true);
    void load(false);
  });
  async function save() {
    setBusy(true);
    const response = await fetch("/api/monthly-memos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, month, content, version }),
    });
    const body = await response.json();
    if (!response.ok) {
      setBusy(false);
      if (response.status === 409) {
        setConflict(true);
        void load(false);
      }
      return toast.error(body.error?.message ?? "메모를 저장하지 못했습니다.");
    }
    setVersion(body.memo.version);
    setUpdated({ name: body.memo.updatedByName, at: body.memo.updatedAt });
    setConflict(false);
    setBusy(false);
    toast.success("월 메모를 저장했습니다.");
    onSaved();
  }
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {siteName} · {month} 메모
          </DialogTitle>
          <DialogDescription>
            특이사항, 청구 이슈, 담당자 공유 사항을 기록합니다.
          </DialogDescription>
        </DialogHeader>
        {conflict && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p>
              다른 사용자가 먼저 수정했습니다. 현재 입력 내용은 유지했습니다.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => void load(true)}
            >
              <RefreshCw data-icon="inline-start" />
              서버 내용으로 다시 불러오기
            </Button>
          </div>
        )}
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          readOnly={!canEdit}
          rows={10}
          maxLength={5000}
          className="w-full rounded-lg border bg-background p-3 text-sm"
        />
        {updated && (
          <p className="text-xs text-muted-foreground">
            마지막 수정: {updated.name} ·{" "}
            {new Date(updated.at).toLocaleString("ko-KR")}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
          {canEdit && (
            <Button disabled={busy || conflict} onClick={() => void save()}>
              {busy ? "처리 중..." : conflict ? "충돌 확인 필요" : "저장"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
function Summary({
  label,
  value,
  plain = false,
  warn = false,
}: {
  label: string;
  value: number;
  plain?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-4 ${warn ? "border-amber-300" : ""}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">
        {plain ? value.toLocaleString() : `${value.toLocaleString()}원`}
      </p>
    </div>
  );
}
function MonthField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="month"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
