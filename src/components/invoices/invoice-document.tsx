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
};

const ROWS_PER_PAGE = 12;

export function InvoiceDocumentPages({ documents }: { documents: InvoicePrintDocument[] }) {
  return <div className="invoice-pages">{documents.flatMap((document) => {
    const chunks = chunkLines(document.lines);
    return chunks.map((lines, pageIndex) => <InvoicePage key={`${document.id ?? document.invoiceNo}-${pageIndex}`} document={document} lines={lines} pageIndex={pageIndex} pageCount={chunks.length} />);
  })}</div>;
}

function InvoicePage({ document, lines, pageIndex, pageCount }: { document: InvoicePrintDocument; lines: InvoicePrintLine[]; pageIndex: number; pageCount: number }) {
  const issueDate = formatKoreanDate(document.issueDate);
  const blanks = Math.max(0, ROWS_PER_PAGE - lines.length);
  const lastPage = pageIndex === pageCount - 1;
  return <article className="invoice-page">
    <div className="invoice-title">거 래 명 세 표</div>
    <div className="invoice-number">No. {document.invoiceNo}{pageCount > 1 ? ` · ${pageIndex + 1}/${pageCount}` : ""}</div>
    <div className="invoice-parties">
      <section className="invoice-recipient">
        <p className="invoice-date">{issueDate}</p>
        <p className="invoice-recipient-name">{document.recipientName} <span>귀하</span></p>
        {document.recipientAddress && <p className="invoice-recipient-address">{document.recipientAddress}</p>}
        <p className="invoice-message">{document.supplyMessage}</p>
      </section>
      <table className="invoice-supplier"><tbody>
        <tr><th rowSpan={5} className="invoice-supplier-vertical">공<br />급<br />자</th><th>등록번호</th><td colSpan={3}>{document.supplierBusinessRegistrationNo}</td></tr>
        <tr><th>상호(법인명)</th><td>{document.supplierCompanyName}</td><th>성명</th><td>{document.supplierRepresentativeName}</td></tr>
        <tr><th>사업장주소</th><td colSpan={3}>{document.supplierAddress}</td></tr>
        <tr><th>업태</th><td>{document.supplierBusinessType}</td><th>종목</th><td>{document.supplierBusinessItem}</td></tr>
        <tr><th>전화번호</th><td colSpan={3}>{document.supplierPhone}</td></tr>
      </tbody></table>
    </div>
    <table className="invoice-lines">
      <thead><tr><th>품 명</th><th>규 격</th><th>수량</th><th>단위</th><th>단 가</th><th>금 액</th></tr></thead>
      <tbody>
        {lines.map((line, index) => <tr key={line.id ?? `${pageIndex}-${index}`}><td>{line.itemName}</td><td>{line.specification ?? ""}</td><td className="number">{formatQuantity(line.quantity)}</td><td>{line.unit ?? ""}</td><td className="number">{formatMoney(line.unitPrice)}</td><td className="number">{line.supplyAmount.toLocaleString("ko-KR")}</td></tr>)}
        {Array.from({ length: blanks }).map((_, index) => <tr key={`blank-${index}`} className="invoice-blank-row"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>)}
      </tbody>
      <tfoot><tr><th colSpan={3}>공급가액 합계</th><td colSpan={3} className="invoice-total">{lastPage ? document.subtotal.toLocaleString("ko-KR") : "다음 페이지 계속"}</td></tr></tfoot>
    </table>
    <div className="invoice-bottom"><span>{document.memo ?? ""}</span><span>(원 / VAT 별도)</span></div>
  </article>;
}

function chunkLines(lines: InvoicePrintLine[]) {
  if (!lines.length) return [[]];
  const chunks: InvoicePrintLine[][] = [];
  for (let index = 0; index < lines.length; index += ROWS_PER_PAGE) chunks.push(lines.slice(index, index + ROWS_PER_PAGE));
  return chunks;
}

function formatKoreanDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}
function formatQuantity(value: number | null) { return value == null ? "" : Number.isInteger(value) ? String(value) : value.toLocaleString("ko-KR", { maximumFractionDigits: 4 }); }
function formatMoney(value: number | null) { return value == null ? "" : value.toLocaleString("ko-KR"); }
