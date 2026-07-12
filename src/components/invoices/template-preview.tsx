import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";

import {
  INVOICE_BLOCK_KEYS,
  INVOICE_COLUMN_LABELS,
  INVOICE_GRID_COLUMNS,
  INVOICE_GRID_ROWS,
  type InvoiceBlockKey,
  type InvoiceTemplateConfig,
} from "@/lib/invoice-templates/config";

const blockLabels: Record<InvoiceBlockKey, string> = { title: "제목", recipient: "수신처", supplier: "공급자", table: "품목표", total: "합계", memo: "메모" };

export function TemplatePreview({ config, selected, readOnly = true, onSelect, onPointerDown, onPointerMove, onPointerUp, onKeyDown }: {
  config: InvoiceTemplateConfig;
  selected?: InvoiceBlockKey;
  readOnly?: boolean;
  onSelect?: (key: InvoiceBlockKey) => void;
  onPointerDown?: (key: InvoiceBlockKey, mode: "move" | "resize", event: PointerEvent<HTMLElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLElement>) => void;
  onKeyDown?: (key: InvoiceBlockKey, event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  return <div className="relative mx-auto grid aspect-[210/297] w-full max-w-[720px] overflow-hidden border border-slate-400 bg-white shadow-xl"
    style={{ gridTemplateColumns: `repeat(${INVOICE_GRID_COLUMNS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${INVOICE_GRID_ROWS}, minmax(0, 1fr))`, backgroundImage: "linear-gradient(to right, rgb(226 232 240 / 35%) 1px, transparent 1px), linear-gradient(to bottom, rgb(226 232 240 / 35%) 1px, transparent 1px)", backgroundSize: `${100 / INVOICE_GRID_COLUMNS}% ${100 / INVOICE_GRID_ROWS}%` }}>
    {INVOICE_BLOCK_KEYS.map((key) => {
      const block = config.blocks[key];
      const style: CSSProperties = {
        gridColumn: `${block.x + 1} / span ${block.width}`,
        gridRow: `${block.y + 1} / span ${block.height}`,
        fontFamily: block.style.fontFamily,
        fontSize: `${block.style.fontSizePt}pt`,
        fontWeight: block.style.fontWeight,
        color: block.style.textColor,
        backgroundColor: block.style.backgroundColor,
        borderColor: block.style.borderColor,
      };
      return <div key={key} role={readOnly ? undefined : "button"} tabIndex={readOnly ? undefined : 0} aria-label={`${blockLabels[key]} 블록`}
        className={`relative min-h-0 min-w-0 overflow-hidden border p-1 ${selected === key ? "z-10 ring-2 ring-blue-500 ring-offset-1" : ""} ${readOnly ? "" : "cursor-move select-none"}`}
        style={style}
        onClick={() => onSelect?.(key)}
        onPointerDown={(event) => onPointerDown?.(key, "move", event)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(event) => onKeyDown?.(key, event)}>
        <BlockContent blockKey={key} config={config} />
        {!readOnly && <span aria-hidden className="absolute right-0 bottom-0 size-4 cursor-se-resize border-t border-l bg-blue-100" onPointerDown={(event) => { event.stopPropagation(); onPointerDown?.(key, "resize", event); }} />}
      </div>;
    })}
  </div>;
}

function BlockContent({ blockKey, config }: { blockKey: InvoiceBlockKey; config: InvoiceTemplateConfig }) {
  if (blockKey === "title") return <div className="flex h-full items-center justify-center text-center tracking-[0.25em]">거 래 명 세 표</div>;
  if (blockKey === "recipient") return <div className="flex h-full flex-col justify-center"><span>2026년 7월 12일</span><strong className="mt-1 border-b">서울 A현장 귀하</strong><span className="mt-1">아래와 같이 공급합니다.</span></div>;
  if (blockKey === "supplier") return <div className="grid h-full grid-cols-[auto_1fr] gap-x-2"><strong>공급자</strong><span>상호 · 대표자</span><span></span><span>주소 · 업태 · 종목</span></div>;
  if (blockKey === "total") return <div className="flex h-full items-center justify-between"><strong>공급가액 합계</strong><strong>740,000</strong></div>;
  if (blockKey === "memo") return <div className="flex h-full items-center justify-between"><span>메모</span><span>(원 / VAT 별도)</span></div>;
  const visible = config.columns.filter((column) => column.visible);
  const columns = visible.map((column) => `${column.width}fr`).join(" ");
  return <div className="grid h-full content-start" style={{ gridTemplateColumns: columns }}>
    {visible.map((column) => <strong key={`head-${column.key}`} className="truncate border-r border-b p-1 text-center">{INVOICE_COLUMN_LABELS[column.key]}</strong>)}
    {visible.map((column) => <span key={`row-${column.key}`} className="truncate border-r border-b p-1 text-center">{sampleValue(column.key)}</span>)}
  </div>;
}

function sampleValue(key: keyof typeof INVOICE_COLUMN_LABELS) {
  return { itemName: "이동형 CCTV", specification: "200만 화소", quantity: "2", unit: "EA", unitPrice: "220,000", supplyAmount: "440,000" }[key];
}
