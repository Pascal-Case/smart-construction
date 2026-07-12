import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InvoiceDocumentPages, type InvoicePrintDocument } from "@/components/invoices/invoice-document";
import { cloneDefaultInvoiceTemplateConfig } from "@/lib/invoice-templates/config";

describe("invoice print document", () => {
  it("13개 표시 행을 A4 두 페이지로 나누고 header와 합계를 반복한다", () => {
    const document: InvoicePrintDocument = {
      id: "invoice-1",
      invoiceNo: "INV-202605-0001",
      issueDate: "2026-05-20T00:00:00.000Z",
      recipientName: "A 현장",
      recipientAddress: "인천시 검단",
      supplierBusinessRegistrationNo: "101-81-30747",
      supplierCompanyName: "테스트 공급자",
      supplierRepresentativeName: "김정수",
      supplierAddress: "서울시 중구",
      supplierBusinessType: "도소매",
      supplierBusinessItem: "통신판매",
      supplierPhone: "010-9025-8937",
      supplyMessage: "아래와 같이 공급합니다.",
      subtotal: 2_860_000,
      memo: null,
      lines: Array.from({ length: 13 }, (_, index) => ({ id: `line-${index}`, itemName: `이동형 CCTV ${index + 1}`, specification: "200만 화소, 4배줌", quantity: 1, unit: "EA", unitPrice: 220_000, supplyAmount: 220_000 })),
    };
    const html = renderToStaticMarkup(<InvoiceDocumentPages documents={[document]} />);

    expect(html.match(/class="invoice-page"/g)).toHaveLength(2);
    expect(html).toContain("INV-202605-0001 · 1/2");
    expect(html).toContain("INV-202605-0001 · 2/2");
    expect(html.match(/거 래 명 세 표/g)).toHaveLength(2);
    expect(html.match(/품 명/g)).toHaveLength(2);
    expect(html).toContain("다음 페이지 계속");
    expect(html).toContain("2,860,000");
    expect(html).toContain("(원 / VAT 별도)");
  });

  it("uses the snapshotted table capacity, column order, visibility, and colors", () => {
    const config = cloneDefaultInvoiceTemplateConfig();
    config.blocks.table.height = 11;
    config.blocks.title.style.textColor = "#123456";
    config.columns = [
      config.columns.find((column) => column.key === "supplyAmount")!,
      config.columns.find((column) => column.key === "itemName")!,
      ...config.columns.filter((column) => !["supplyAmount", "itemName", "specification"].includes(column.key)),
      { ...config.columns.find((column) => column.key === "specification")!, visible: false },
    ];
    const document = fixture({ templateConfig: config, lines: Array.from({ length: 9 }, (_, index) => ({ itemName: `품목 ${index + 1}`, specification: "숨김", quantity: 1, unit: "EA", unitPrice: 1_000, supplyAmount: 1_000 })) });

    const html = renderToStaticMarkup(<InvoiceDocumentPages documents={[document]} />);

    expect(html.match(/class="invoice-page"/g)).toHaveLength(2);
    expect(html).toContain("color:#123456");
    expect(html.indexOf("금 액")).toBeLessThan(html.indexOf("품 명"));
    expect(html).not.toContain("규 격");
  });

  it("keeps empty printable rows and gives them a border color independent from transparent text", () => {
    const document = fixture({
      lines: [{ itemName: "하이바", specification: "07/15 ~ 08/14", quantity: 3, unit: "EA", unitPrice: 50_000, supplyAmount: 82_258 }],
      subtotal: 82_258,
    });

    const html = renderToStaticMarkup(<InvoiceDocumentPages documents={[document]} />);

    expect(html.match(/class="invoice-blank-row"/g)).toHaveLength(11);
    expect(html).toContain("--invoice-table-border-color:#111111");
  });
});

function fixture(overrides: Partial<InvoicePrintDocument> = {}): InvoicePrintDocument {
  return {
    invoiceNo: "INV-202607-0001",
    issueDate: "2026-07-12T00:00:00.000Z",
    recipientName: "A 현장",
    recipientAddress: null,
    supplierBusinessRegistrationNo: "101-81-30747",
    supplierCompanyName: "테스트 공급자",
    supplierRepresentativeName: "김정수",
    supplierAddress: "서울시 중구",
    supplierBusinessType: "도소매",
    supplierBusinessItem: "통신판매",
    supplierPhone: "010-9025-8937",
    supplyMessage: "아래와 같이 공급합니다.",
    subtotal: 9_000,
    memo: null,
    lines: [],
    ...overrides,
  };
}
