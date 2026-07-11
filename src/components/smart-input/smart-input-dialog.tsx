"use client";

import { AlertTriangle, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { buildSmartInputDraft } from "@/lib/smart-input/draft";
import type { SmartFieldStatus, SmartInputAppliedDraft, SmartInputPreview, SmartInputTarget, SmartMasterOption } from "@/lib/smart-input/types";

const statusLabels: Record<SmartFieldStatus, string> = {
  MATCHED: "문장 일치",
  DERIVED: "자동 제안",
  AMBIGUOUS: "선택 필요",
  MISSING: "입력 필요",
};

export function SmartInputDialog({ target, onClose, onApply }: {
  target: SmartInputTarget;
  onClose: () => void;
  onApply: (draft: SmartInputAppliedDraft) => void;
}) {
  const [input, setInput] = useState("");
  const placeholder = target === "CONTRACT"
    ? "예: 송도 A현장 CCTV 5대, 26년 3월부터 8월까지, A/S 단가 8만원"
    : "예: 송도 A현장 CCTV 2대, 2026년 5월 20일, 총 40만원";
  const [preview, setPreview] = useState<SmartInputPreview | null>(null);
  const [siteId, setSiteId] = useState("");
  const [itemId, setItemId] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedSite = preview?.options.sites.find((option) => option.id === siteId) ?? null;
  const selectedItem = preview?.options.items.find((option) => option.id === itemId) ?? null;
  const draft = useMemo(() => preview ? buildSmartInputDraft(preview, selectedSite, selectedItem) : null, [preview, selectedSite, selectedItem]);
  const ready = draft != null && (target === "REVENUE" || (draft.itemId != null && draft.quantity != null && draft.appliedSalesPrice != null));

  async function analyze() {
    setBusy(true);
    try {
      const response = await fetch("/api/smart-input/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, input }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "문장을 분석하지 못했습니다.");
      const result = body as SmartInputPreview;
      setPreview(result);
      setSiteId(result.fields.site.value?.id ?? "");
      setItemId(result.fields.item.value?.id ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "문장을 분석하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><WandSparkles className="size-5 text-teal-700" />문장으로 빠른 입력</DialogTitle>
        <DialogDescription>실제 AI가 아닌 마스터 별칭·날짜·수량·금액 규칙 분석입니다. 분석 결과는 저장되지 않고 등록 폼에만 적용됩니다.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor={"smart-input-" + target}>업무 문장</Label>
        <textarea id={"smart-input-" + target} value={input} placeholder={placeholder} onChange={(event) => { setInput(event.target.value); setPreview(null); }} rows={4} maxLength={1_000} className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>현장·품목 이름 또는 별칭, 수량, 날짜/기간, 단가/총액을 자유롭게 적으세요.</span><span>{input.length}/1,000</span></div>
      </div>
      <div className="flex justify-end"><Button disabled={busy || input.trim().length < 3} onClick={() => void analyze()}><WandSparkles data-icon="inline-start" />{busy ? "분석 중..." : "문장 분석"}</Button></div>

      {preview && <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border bg-muted/50 px-4 py-3">
          <div><p className="font-semibold">필드별 분석 결과</p><p className="text-xs text-muted-foreground">잘못 인식된 값은 아래에서 선택하거나 등록 폼에서 수정하세요.</p></div>
          <Badge variant={preview.confidence >= 80 ? "secondary" : "outline"}>신뢰도 {preview.confidence}%</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MasterCard label="현장" field={preview.fields.site} value={siteId} options={preview.options.sites} onChange={setSiteId} required />
          <MasterCard label="품목" field={preview.fields.item} value={itemId} options={preview.options.items} onChange={setItemId} required={target === "CONTRACT"} />
          <ValueCard label="수량" status={preview.fields.quantity.status} value={preview.fields.quantity.value == null ? "-" : preview.fields.quantity.value + " " + (preview.fields.quantity.unit ?? selectedItem?.unit ?? "")} message={preview.fields.quantity.message} />
          <ValueCard label="단가" status={preview.fields.unitPrice.status} value={money(draft?.appliedSalesPrice)} message={preview.fields.unitPrice.message} />
          <ValueCard label="총액" status={preview.fields.totalAmount.status} value={money(draft?.salesAmount)} message={preview.fields.totalAmount.message} />
          <ValueCard label={target === "CONTRACT" ? "계약·매출 기간" : "귀속일"} status={preview.fields.period.status} value={preview.fields.period.value ? preview.fields.period.value.startDate + (preview.fields.period.value.startDate === preview.fields.period.value.endDate ? "" : " ~ " + preview.fields.period.value.endDate) : "-"} message={preview.fields.period.message} />
        </div>
        {preview.warnings.length > 0 && <Alert className="border-amber-300 bg-amber-50 text-amber-950"><AlertTriangle /><AlertTitle>확인이 필요한 항목</AlertTitle><AlertDescription><ul className="list-disc space-y-1 pl-4">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></AlertDescription></Alert>}
        <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 text-sm text-teal-950">
          <p className="font-medium">적용 예정: {draft?.title ?? "-"}</p>
          <p className="mt-1 text-xs">적용 후에도 기존 {target === "CONTRACT" ? "계약" : "매출"} 등록 폼에서 모든 값을 수정할 수 있으며, 폼의 저장 버튼을 눌러야 실제 데이터가 저장됩니다.</p>
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>취소</Button><Button disabled={!ready} onClick={() => { if (draft && ready) onApply(draft); }}>등록 폼에 적용</Button></div>
      </div>}
    </DialogContent>
  </Dialog>;
}


function MasterCard({ label, field, value, options, onChange, required }: {
  label: string;
  field: SmartInputPreview["fields"]["site"];
  value: string;
  options: SmartMasterOption[];
  onChange: (value: string) => void;
  required: boolean;
}) {
  return <div className="space-y-2 rounded-xl border bg-card p-3"><div className="flex items-center justify-between"><p className="text-sm font-medium">{label}{required ? " *" : ""}</p><StatusBadge status={field.status} /></div><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm"><option value="">{required ? "선택해 주세요" : "선택 안 함"}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.code})</option>)}</select><p className="text-xs text-muted-foreground">{field.message}</p></div>;
}
function ValueCard({ label, status, value, message }: { label: string; status: SmartFieldStatus; value: string; message: string }) {
  return <div className="space-y-2 rounded-xl border bg-card p-3"><div className="flex items-center justify-between"><p className="text-sm font-medium">{label}</p><StatusBadge status={status} /></div><p className="font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{message}</p></div>;
}
function StatusBadge({ status }: { status: SmartFieldStatus }) { return <Badge variant={status === "MATCHED" || status === "DERIVED" ? "secondary" : "outline"}>{statusLabels[status]}</Badge>; }
function money(value: number | null | undefined) { return value == null ? "-" : value.toLocaleString() + "원"; }
