ALTER TABLE "InvoiceDocument" ADD COLUMN "documentGroupKey" TEXT;

CREATE INDEX "InvoiceDocument_siteId_issueDate_documentGroupKey_idx" ON "InvoiceDocument"("siteId", "issueDate", "documentGroupKey");
