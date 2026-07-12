"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { moveInvoiceBlock, moveInvoiceColumn, resizeInvoiceBlock, updateInvoiceBlockStyle, updateInvoiceColumn } from "@/components/invoices/template-editor-state";
import { TemplatePreview } from "@/components/invoices/template-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  INVOICE_COLUMN_LABELS,
  INVOICE_FONT_FAMILIES,
  INVOICE_GRID_COLUMNS,
  INVOICE_GRID_ROWS,
  type InvoiceBlockKey,
  type InvoiceTemplateConfig,
} from "@/lib/invoice-templates/config";
import { invoiceTemplateConfigSchema } from "@/lib/invoice-templates/schemas";

const blockLabels: Record<InvoiceBlockKey, string> = { title: "제목", recipient: "수신처", supplier: "공급자", table: "품목표", total: "합계", memo: "메모" };

type DragState = { key: InvoiceBlockKey; mode: "move" | "resize"; clientX: number; clientY: number; config: InvoiceTemplateConfig };

export function TemplateEditor({ config, onChange, readOnly = false }: { config: InvoiceTemplateConfig; onChange: (config: InvoiceTemplateConfig) => void; readOnly?: boolean }) {
  const [selected, setSelected] = useState<InvoiceBlockKey>("title");
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const validation = useMemo(() => invoiceTemplateConfigSchema.safeParse(config), [config]);
  const block = config.blocks[selected];
  const visibleColumnWeight = config.columns.filter((column) => column.visible).reduce((sum, column) => sum + column.width, 0);

  function startPointer(key: InvoiceBlockKey, mode: "move" | "resize", event: PointerEvent<HTMLElement>) {
    if (readOnly) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(key);
    dragRef.current = { key, mode, clientX: event.clientX, clientY: event.clientY, config: structuredClone(config) };
  }

  function movePointer(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!drag || !bounds) return;
    const deltaX = Math.round((event.clientX - drag.clientX) / (bounds.width / INVOICE_GRID_COLUMNS));
    const deltaY = Math.round((event.clientY - drag.clientY) / (bounds.height / INVOICE_GRID_ROWS));
    onChange(drag.mode === "move" ? moveInvoiceBlock(drag.config, drag.key, deltaX, deltaY) : resizeInvoiceBlock(drag.config, drag.key, deltaX, deltaY));
  }

  function stopPointer(event: PointerEvent<HTMLElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  }

  function keyMove(key: InvoiceBlockKey, event: KeyboardEvent<HTMLDivElement>) {
    if (readOnly || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const deltaX = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const deltaY = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    onChange(event.shiftKey ? resizeInvoiceBlock(config, key, deltaX, deltaY) : moveInvoiceBlock(config, key, deltaX, deltaY));
  }

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
    <div ref={canvasRef} className="overflow-auto rounded-xl bg-slate-100 p-3 sm:p-6">
      <TemplatePreview config={config} selected={selected} readOnly={readOnly} onSelect={setSelected} onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={stopPointer} onKeyDown={keyMove} />
    </div>
    <aside className="space-y-4 rounded-xl border bg-card p-4">
      <div><p className="font-semibold">{blockLabels[selected]} 블록</p><p className="text-xs text-muted-foreground">방향키로 이동하고 Shift+방향키로 크기를 조절합니다.</p></div>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground"><span>X {block.x}</span><span>Y {block.y}</span><span>너비 {block.width}</span><span>높이 {block.height}</span></div>
      <Control label="폰트">
        <select disabled={readOnly} className="h-9 w-full rounded-lg border bg-background px-2 text-sm" value={block.style.fontFamily} onChange={(event) => onChange(updateInvoiceBlockStyle(config, selected, { fontFamily: event.target.value as typeof block.style.fontFamily }))}>
          {INVOICE_FONT_FAMILIES.map((font) => <option key={font}>{font}</option>)}
        </select>
      </Control>
      <Control label="글자 크기">
        <Input disabled={readOnly} type="number" min={6} max={32} step={0.5} value={block.style.fontSizePt} onChange={(event) => onChange(updateInvoiceBlockStyle(config, selected, { fontSizePt: Number(event.target.value) }))} />
      </Control>
      <Control label="굵기">
        <select disabled={readOnly} className="h-9 w-full rounded-lg border bg-background px-2 text-sm" value={block.style.fontWeight} onChange={(event) => onChange(updateInvoiceBlockStyle(config, selected, { fontWeight: Number(event.target.value) as 400 | 600 | 700 }))}>
          <option value={400}>보통</option><option value={600}>중간</option><option value={700}>굵게</option>
        </select>
      </Control>
      <div className="grid grid-cols-3 gap-2">
        <ColorField label="글자" value={block.style.textColor} disabled={readOnly} onChange={(textColor) => onChange(updateInvoiceBlockStyle(config, selected, { textColor }))} />
        <ColorField label="배경" value={block.style.backgroundColor} disabled={readOnly} onChange={(backgroundColor) => onChange(updateInvoiceBlockStyle(config, selected, { backgroundColor }))} />
        <ColorField label="테두리" value={block.style.borderColor} disabled={readOnly} onChange={(borderColor) => onChange(updateInvoiceBlockStyle(config, selected, { borderColor }))} />
      </div>
      <div className="space-y-2 border-t pt-4"><p className="font-semibold">품목표 열</p>
        <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs"><span className="flex items-center justify-between"><span>표시 열 비율 합계</span><strong>{visibleColumnWeight}</strong></span><p className="mt-1 text-muted-foreground">합계와 관계없이 출력 시 100% 기준으로 자동 환산합니다.</p></div>
        {config.columns.map((column, index) => <div key={column.key} className="grid grid-cols-[1fr_4.5rem_auto] items-center gap-2 rounded-lg border p-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" disabled={readOnly || column.key === "itemName" || column.key === "supplyAmount"} checked={column.visible} onChange={(event) => onChange(updateInvoiceColumn(config, column.key, { visible: event.target.checked }))} />{INVOICE_COLUMN_LABELS[column.key]}</label>
          <Input aria-label={`${INVOICE_COLUMN_LABELS[column.key]} 비율`} disabled={readOnly} type="number" min={5} max={60} value={column.width} onChange={(event) => onChange(updateInvoiceColumn(config, column.key, { width: Number(event.target.value) }))} />
          <div className="flex"><Button type="button" size="icon-sm" variant="ghost" disabled={readOnly || index === 0} onClick={() => onChange(moveInvoiceColumn(config, column.key, -1))}><ArrowUp /><span className="sr-only">앞으로</span></Button><Button type="button" size="icon-sm" variant="ghost" disabled={readOnly || index === config.columns.length - 1} onClick={() => onChange(moveInvoiceColumn(config, column.key, 1))}><ArrowDown /><span className="sr-only">뒤로</span></Button></div>
        </div>)}
      </div>
      {!validation.success && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800"><p className="font-semibold">저장할 수 없는 배치입니다.</p><ul className="mt-1 list-disc pl-4">{validation.error.issues.slice(0, 4).map((issue, index) => <li key={`${issue.path.join(".")}-${index}`}>{issue.message}</li>)}</ul></div>}
    </aside>
  </div>;
}

function Control({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function ColorField({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) { return <label className="space-y-1 text-xs"><span>{label}</span><input className="h-9 w-full rounded border" type="color" disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
