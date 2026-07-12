ALTER TABLE "RevenueEntry" ADD COLUMN "currentInvoiceDocumentId" TEXT
  REFERENCES "InvoiceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoiceDocument" ADD COLUMN "supersededAt" DATETIME;
ALTER TABLE "InvoiceDocument" ADD COLUMN "supersededByInvoiceId" TEXT
  REFERENCES "InvoiceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "RevenueEntry"
SET "currentInvoiceDocumentId" = (
  SELECT "invoiceDocumentId"
  FROM "InvoiceRevenueLink"
  WHERE "InvoiceRevenueLink"."revenueEntryId" = "RevenueEntry"."id"
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM "InvoiceRevenueLink"
  WHERE "InvoiceRevenueLink"."revenueEntryId" = "RevenueEntry"."id"
);

DROP INDEX "InvoiceRevenueLink_revenueEntryId_key";

CREATE INDEX "RevenueEntry_currentInvoiceDocumentId_idx"
  ON "RevenueEntry"("currentInvoiceDocumentId");
CREATE INDEX "InvoiceDocument_supersededByInvoiceId_idx"
  ON "InvoiceDocument"("supersededByInvoiceId");
CREATE INDEX "InvoiceRevenueLink_revenueEntryId_idx"
  ON "InvoiceRevenueLink"("revenueEntryId");
CREATE UNIQUE INDEX "InvoiceRevenueLink_invoiceDocumentId_revenueEntryId_key"
  ON "InvoiceRevenueLink"("invoiceDocumentId", "revenueEntryId");
