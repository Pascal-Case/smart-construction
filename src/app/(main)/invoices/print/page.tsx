import Link from "next/link";

import { InvoiceDocumentPages, type InvoicePrintDocument } from "@/components/invoices/invoice-document";
import { PrintButton } from "@/components/invoices/print-button";
import { Button } from "@/components/ui/button";
import { cloneDefaultInvoiceTemplateConfig } from "@/lib/invoice-templates/config";
import { decodeInvoiceTemplateConfig } from "@/lib/invoice-templates/schemas";
import { getInvoiceDocuments } from "@/lib/invoices/service";

export default async function InvoicePrintPage({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const query = await searchParams;
  const values = Array.isArray(query.ids) ? query.ids : query.ids ? [query.ids] : [];
  const ids = values.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  const rows = await getInvoiceDocuments(ids);
  const documents: InvoicePrintDocument[] = rows.map((row) => ({
    id: row.id,
    invoiceNo: row.invoiceNo,
    issueDate: row.issueDate.toISOString(),
    recipientName: row.recipientName,
    recipientAddress: row.recipientAddress,
    supplierBusinessRegistrationNo: row.supplierBusinessRegistrationNo,
    supplierCompanyName: row.supplierCompanyName,
    supplierRepresentativeName: row.supplierRepresentativeName,
    supplierAddress: row.supplierAddress,
    supplierBusinessType: row.supplierBusinessType,
    supplierBusinessItem: row.supplierBusinessItem,
    supplierPhone: row.supplierPhone,
    supplyMessage: row.supplyMessage,
    subtotal: row.subtotal,
    memo: row.memo,
    templateConfig: row.templateConfigJson ? decodeInvoiceTemplateConfig(row.templateConfigJson) : cloneDefaultInvoiceTemplateConfig(),
    lines: row.lines.map((line) => ({ id: line.id, itemName: line.itemName, specification: line.specification, quantity: line.quantity, unit: line.unit, unitPrice: line.unitPrice, supplyAmount: line.supplyAmount })),
  }));
  return <div className="invoice-print-root"><div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between rounded-xl border bg-card p-4"><div><p className="font-semibold">발행본 {documents.length}건</p><p className="text-xs text-muted-foreground">브라우저 인쇄에서 A4·배율 100%를 사용하세요.</p></div><div className="flex gap-2"><Button variant="outline" render={<Link href="/invoices" />}>목록으로</Button><PrintButton /></div></div><InvoiceDocumentPages documents={documents} /></div>;
}
