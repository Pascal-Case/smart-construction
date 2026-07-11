"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { revenueMonthBounds } from "@/lib/revenues/month-context";
import type { SmartInputAppliedDraft } from "@/lib/smart-input/types";

export type RevenueEditorSite = { id: string; name: string; isActive: boolean };
export type RevenueEditorItem = { id: string; name: string; unit: string; standardSalesPrice: number; standardCostPrice: number; isActive: boolean };
export type RevenueEditorRow = {
  id: string;
  siteId: string;
  revenueDate: string;
  sourceType: "CONTRACT" | "MANUAL" | "ADJUSTMENT";
  itemId: string | null;
  title: string;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  appliedSalesPrice: number | null;
  salesAmount: number;
  appliedCostPrice: number | null;
  costAmount: number | null;
  priceOverrideReason: string | null;
  version: number;
};
export type RevenueEditorContext = { siteId: string; siteName: string; month: string };

export function RevenueEditor({
  row,
  draft,
  sites,
  items,
  initialContext,
  onClose,
  onSaved,
}: {
  row: RevenueEditorRow | null;
  draft: SmartInputAppliedDraft | null;
  sites: RevenueEditorSite[];
  items: RevenueEditorItem[];
  initialContext?: RevenueEditorContext;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sourceType, setSourceType] = useState<"MANUAL" | "ADJUSTMENT">(row?.sourceType === "ADJUSTMENT" ? "ADJUSTMENT" : "MANUAL");
  const [itemId, setItemId] = useState(row?.itemId ?? draft?.itemId ?? "");
  const [quantity, setQuantity] = useState<number | "">(row?.quantity ?? draft?.quantity ?? "");
  const [salesPrice, setSalesPrice] = useState<number | "">(row?.appliedSalesPrice ?? draft?.appliedSalesPrice ?? "");
  const [costPrice, setCostPrice] = useState<number | "">(row?.appliedCostPrice ?? draft?.appliedCostPrice ?? "");
  const [salesAmount, setSalesAmount] = useState(row?.salesAmount ?? draft?.salesAmount ?? 0);
  const [manualAmount, setManualAmount] = useState(row
    ? row.quantity != null && Math.round(row.quantity * (row.appliedSalesPrice ?? 0)) !== row.salesAmount
    : draft
      ? draft.quantity != null && draft.appliedSalesPrice != null && Math.round(draft.quantity * draft.appliedSalesPrice) !== draft.salesAmount
      : false);
  const [busy, setBusy] = useState(false);
  const monthBounds = initialContext ? revenueMonthBounds(initialContext.month) : null;

  function recalc(nextQuantity: number | "", nextPrice: number | "") {
    if (!manualAmount && nextQuantity !== "" && nextPrice !== "") setSalesAmount(Math.round(nextQuantity * nextPrice));
  }

  function selectItem(id: string) {
    setItemId(id);
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return;
    setSalesPrice(item.standardSalesPrice);
    setCostPrice(item.standardCostPrice);
    recalc(quantity, item.standardSalesPrice);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const saveStatus = row ? "DRAFT" : submitter?.value === "DRAFT" ? "DRAFT" : "CONFIRMED";
    const body = {
      siteId: data.get("siteId"),
      revenueDate: data.get("revenueDate"),
      sourceType,
      itemId: itemId || null,
      title: data.get("title"),
      description: data.get("description"),
      quantity: quantity === "" ? null : quantity,
      unit: data.get("unit"),
      appliedSalesPrice: salesPrice === "" ? null : salesPrice,
      salesAmount,
      appliedCostPrice: costPrice === "" ? null : costPrice,
      costAmount: data.get("costAmount") === "" ? null : Number(data.get("costAmount")),
      priceOverrideReason: data.get("priceOverrideReason"),
      saveStatus,
      ...(row ? { version: row.version } : {}),
    };

    try {
      const response = await fetch(`/api/revenues${row ? `/${row.id}` : ""}`, {
        method: row ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "매출을 저장하지 못했습니다.");
      toast.success(row ? "매출을 저장했습니다." : saveStatus === "CONFIRMED" ? "매출을 확정 등록했습니다." : "매출을 작성 중으로 저장했습니다.");
      onClose();
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "매출을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const defaultSiteId = row?.siteId ?? draft?.siteId ?? initialContext?.siteId ?? sites.find((site) => site.isActive)?.id;
  const defaultRevenueDate = row?.revenueDate.slice(0, 10) ?? draft?.revenueDate ?? (initialContext ? "" : localDate());

  return (
    <Dialog open onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{row ? "매출 수정" : "직접 매출 등록"}</DialogTitle>
          <DialogDescription>{row ? "작성 중인 매출의 내용을 수정합니다." : "기본 버튼은 매출을 바로 확정합니다. 나중에 검토하려면 작성 중으로 저장하세요."}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          {initialContext && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3 text-sm text-teal-950 sm:col-span-2 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-50">
              <p className="font-medium">{initialContext.siteName} · {initialContext.month} 매출 등록</p>
              <p className="mt-1 text-xs">현장과 대상월을 이어받았습니다. 귀속일은 대상월 안에서 직접 선택해 주세요.</p>
            </div>
          )}
          <SelectName label="유형" name="sourceType" value={sourceType} onChange={(value) => setSourceType(value as "MANUAL" | "ADJUSTMENT")} options={[{ value: "MANUAL", label: "직접 매출" }, { value: "ADJUSTMENT", label: "조정(음수 가능)" }]} />
          <SelectName label="현장" name="siteId" defaultValue={defaultSiteId} options={sites.map((site) => ({ value: site.id, label: site.name }))} />
          <FormField label="귀속일" name="revenueDate" type="date" defaultValue={defaultRevenueDate} min={monthBounds?.min} max={monthBounds?.max} required />
          <FormField label="제목" name="title" defaultValue={row?.title ?? draft?.title ?? ""} required />
          <div className="space-y-1.5 sm:col-span-2"><Label>품목(선택)</Label><select value={itemId} onChange={(event) => selectItem(event.target.value)} className="h-9 w-full rounded-lg border bg-background px-3 text-sm"><option value="">품목 없이 자유 입력</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="space-y-1.5"><Label>수량</Label><Input type="number" min="0" step="any" value={quantity} onChange={(event) => { const value = event.target.value === "" ? "" : Number(event.target.value); setQuantity(value); recalc(value, salesPrice); }} /></div>
          <FormField label="단위" name="unit" defaultValue={row?.unit ?? draft?.unit ?? items.find((item) => item.id === itemId)?.unit ?? ""} />
          <div className="space-y-1.5"><Label>매출단가</Label><Input type="number" value={salesPrice} onChange={(event) => { const value = event.target.value === "" ? "" : Number(event.target.value); setSalesPrice(value); recalc(quantity, value); }} /></div>
          <div className="space-y-1.5"><Label>매입단가</Label><Input type="number" value={costPrice} onChange={(event) => setCostPrice(event.target.value === "" ? "" : Number(event.target.value))} /></div>
          <div className="space-y-1.5"><Label>최종 매출액</Label><Input type="number" value={salesAmount} onChange={(event) => { setSalesAmount(Number(event.target.value)); setManualAmount(true); }} /></div>
          <FormField label="최종 매입액(선택)" name="costAmount" type="number" defaultValue={row?.costAmount?.toString() ?? smartCostAmount(draft)} />
          <FormField className="sm:col-span-2" label="설명" name="description" defaultValue={row?.description ?? draft?.description ?? ""} />
          <FormField className="sm:col-span-2" label="예외·조정 사유" name="priceOverrideReason" defaultValue={row?.priceOverrideReason ?? draft?.priceOverrideReason ?? ""} placeholder="표준단가·계산금액과 다르거나 조정이면 필수" />
          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={onClose}>취소</Button>{row ? <Button type="submit" disabled={busy}>{busy ? "저장 중..." : "수정 저장"}</Button> : <><Button type="submit" name="saveStatus" value="DRAFT" variant="outline" disabled={busy}>작성 중 저장</Button><Button type="submit" name="saveStatus" value="CONFIRMED" disabled={busy}>{busy ? "등록 중..." : "확정 등록"}</Button></>}</div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormField({ label, className = "", ...props }: React.ComponentProps<typeof Input> & { label: string; className?: string }) {
  const id = String(props.name);
  return <div className={`space-y-1.5 ${className}`}><Label htmlFor={id}>{label}</Label><Input id={id} {...props} /></div>;
}

function SelectName({ label, name, value, defaultValue, onChange, options }: { label: string; name: string; value?: string; defaultValue?: string; onChange?: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <div className="space-y-1.5"><Label htmlFor={name}>{label}</Label><select id={name} name={name} value={value} defaultValue={value === undefined ? defaultValue : undefined} onChange={onChange ? (event) => onChange(event.target.value) : undefined} className="h-9 w-full rounded-lg border bg-background px-3 text-sm">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}

function smartCostAmount(draft: SmartInputAppliedDraft | null) {
  return draft?.quantity != null && draft.appliedCostPrice != null ? String(Math.round(draft.quantity * draft.appliedCostPrice)) : "";
}

function localDate() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}
