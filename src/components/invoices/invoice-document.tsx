import type { CSSProperties } from "react";

import {
  calculateRowsPerPage,
  calculateInvoiceRowHeightMm,
  cloneDefaultInvoiceTemplateConfig,
  INVOICE_COLUMN_LABELS,
  type InvoiceBlockKey,
  type InvoiceColumnKey,
  type InvoiceTemplateConfig,
} from "@/lib/invoice-templates/config";

export type InvoicePrintLine = {
  id?: string;
  itemName: string;
  specification: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  supplyAmount: number;
};

export type InvoicePrintDocument = {
  id?: string;
  invoiceNo: string;
  issueDate: string;
  recipientName: string;
  recipientAddress: string | null;
  supplierBusinessRegistrationNo: string;
  supplierCompanyName: string;
  supplierRepresentativeName: string;
  supplierAddress: string;
  supplierBusinessType: string;
  supplierBusinessItem: string;
  supplierPhone: string;
  supplyMessage: string;
  subtotal: number;
  memo: string | null;
  lines: InvoicePrintLine[];
  templateConfig?: InvoiceTemplateConfig;
};

export function InvoiceDocumentPages({ documents }: { documents: InvoicePrintDocument[] }) {
  return <div className="invoice-pages">{documents.flatMap((document) => {
    const config = document.templateConfig ?? cloneDefaultInvoiceTemplateConfig();
    const rowsPerPage = calculateRowsPerPage(config);
    const chunks = chunkLines(document.lines, rowsPerPage);
    return chunks.map((lines, pageIndex) => <InvoicePage key={`${document.id ?? document.invoiceNo}-${pageIndex}`} document={document} config={config} lines={lines} rowsPerPage={rowsPerPage} pageIndex={pageIndex} pageCount={chunks.length} />);
  })}</div>;
}

function InvoicePage({ document, config, lines, rowsPerPage, pageIndex, pageCount }: { document: InvoicePrintDocument; config: InvoiceTemplateConfig; lines: InvoicePrintLine[]; rowsPerPage: number; pageIndex: number; pageCount: number }) {
  const issueDate = formatKoreanDate(document.issueDate);
  const blanks = Math.max(0, rowsPerPage - lines.length);
  const lastPage = pageIndex === pageCount - 1;
  const columns = config.columns.filter((column) => column.visible);
  return <article className="invoice-page">
    <section className="invoice-title" style={blockStyle(config, "title")}>
      <span>거 래 명 세 표</span>
      <small>No. {document.invoiceNo}{pageCount > 1 ? ` · ${pageIndex + 1}/${pageCount}` : ""}</small>
    </section>
    <section className="invoice-recipient" style={blockStyle(config, "recipient")}>
      <p className="invoice-date">{issueDate}</p>
      <p className="invoice-recipient-name">{document.recipientName} <span>귀하</span></p>
      {document.recipientAddress && <p className="invoice-recipient-address">{document.recipientAddress}</p>}
      <p className="invoice-message">{document.supplyMessage}</p>
    </section>
    <table className="invoice-supplier" style={blockStyle(config, "supplier")}><tbody>
      <tr><th rowSpan={5} className="invoice-supplier-vertical">공<br />급<br />자</th><th>등록번호</th><td colSpan={3}>{document.supplierBusinessRegistrationNo}</td></tr>
      <tr><th>상호(법인명)</th><td>{document.supplierCompanyName}</td><th>성명</th><td>{document.supplierRepresentativeName}</td></tr>
      <tr><th>사업장주소</th><td colSpan={3}>{document.supplierAddress}</td></tr>
      <tr><th>업태</th><td>{document.supplierBusinessType}</td><th>종목</th><td>{document.supplierBusinessItem}</td></tr>
      <tr><th>전화번호</th><td colSpan={3}>{document.supplierPhone}</td></tr>
    </tbody></table>
    <table className="invoice-lines" style={{ ...blockStyle(config, "table"), "--invoice-row-height": `${calculateInvoiceRowHeightMm(config)}mm` } as CSSProperties}>
      <colgroup>{columns.map((column) => <col key={column.key} style={{ width: `${column.width}%` }} />)}</colgroup>
      <thead><tr>{columns.map((column) => <th key={column.key}>{INVOICE_COLUMN_LABELS[column.key]}</th>)}</tr></thead>
      <tbody>
        {lines.map((line, index) => <tr key={line.id ?? `${pageIndex}-${index}`}>{columns.map((column) => <td key={column.key} className={isNumeric(column.key) ? "number" : undefined}>{formatCell(line, column.key)}</td>)}</tr>)}
        {Array.from({ length: blanks }).map((_, index) => <tr key={`blank-${index}`} className="invoice-blank-row">{columns.map((column) => <td key={column.key}>&nbsp;</td>)}</tr>)}
      </tbody>
    </table>
    <section className="invoice-total-block" style={blockStyle(config, "total")}><strong>공급가액 합계</strong><strong>{lastPage ? document.subtotal.toLocaleString("ko-KR") : "다음 페이지 계속"}</strong></section>
    <section className="invoice-bottom" style={blockStyle(config, "memo")}><span>{document.memo ?? ""}</span><span>(원 / VAT 별도)</span></section>
  </article>;
}

function blockStyle(config: InvoiceTemplateConfig, key: InvoiceBlockKey): CSSProperties {
  const block = config.blocks[key];
  return {
    gridColumn: `${block.x + 1} / span ${block.width}`,
    gridRow: `${block.y + 1} / span ${block.height}`,
    fontFamily: block.style.fontFamily,
    fontSize: `${block.style.fontSizePt}pt`,
    fontWeight: block.style.fontWeight,
    color: block.style.textColor,
    backgroundColor: block.style.backgroundColor,
    borderColor: block.style.borderColor,
  };
}

function chunkLines(lines: InvoicePrintLine[], rowsPerPage: number) {
  if (!lines.length) return [[]];
  const chunks: InvoicePrintLine[][] = [];
  for (let index = 0; index < lines.length; index += rowsPerPage) chunks.push(lines.slice(index, index + rowsPerPage));
  return chunks;
}

function formatCell(line: InvoicePrintLine, key: InvoiceColumnKey) {
  if (key === "quantity") return formatQuantity(line.quantity);
  if (key === "unitPrice") return formatMoney(line.unitPrice);
  if (key === "supplyAmount") return line.supplyAmount.toLocaleString("ko-KR");
  return line[key] ?? "";
}

function isNumeric(key: InvoiceColumnKey) { return key === "quantity" || key === "unitPrice" || key === "supplyAmount"; }
function formatKoreanDate(value: string) { const [year, month, day] = value.slice(0, 10).split("-"); return `${year}년 ${Number(month)}월 ${Number(day)}일`; }
function formatQuantity(value: number | null) { return value == null ? "" : Number.isInteger(value) ? String(value) : value.toLocaleString("ko-KR", { maximumFractionDigits: 4 }); }
function formatMoney(value: number | null) { return value == null ? "" : value.toLocaleString("ko-KR"); }
