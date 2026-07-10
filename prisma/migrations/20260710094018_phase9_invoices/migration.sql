-- CreateTable
CREATE TABLE "CompanySetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessRegistrationNo" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "representativeName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "businessItem" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "defaultMessage" TEXT NOT NULL DEFAULT '아래와 같이 공급합니다.',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InvoiceDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNo" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "issueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "displayMode" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientAddress" TEXT,
    "supplierBusinessRegistrationNo" TEXT NOT NULL,
    "supplierCompanyName" TEXT NOT NULL,
    "supplierRepresentativeName" TEXT NOT NULL,
    "supplierAddress" TEXT NOT NULL,
    "supplierBusinessType" TEXT NOT NULL,
    "supplierBusinessItem" TEXT NOT NULL,
    "supplierPhone" TEXT NOT NULL,
    "supplyMessage" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "memo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InvoiceDocument_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceDocumentId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "specification" TEXT,
    "quantity" REAL,
    "unit" TEXT,
    "unitPrice" INTEGER,
    "supplyAmount" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "InvoiceLine_invoiceDocumentId_fkey" FOREIGN KEY ("invoiceDocumentId") REFERENCES "InvoiceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceRevenueLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceDocumentId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "revenueEntryId" TEXT NOT NULL,
    CONSTRAINT "InvoiceRevenueLink_invoiceDocumentId_fkey" FOREIGN KEY ("invoiceDocumentId") REFERENCES "InvoiceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceRevenueLink_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceRevenueLink_revenueEntryId_fkey" FOREIGN KEY ("revenueEntryId") REFERENCES "RevenueEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDocument_invoiceNo_key" ON "InvoiceDocument"("invoiceNo");

-- CreateIndex
CREATE INDEX "InvoiceDocument_siteId_issueDate_idx" ON "InvoiceDocument"("siteId", "issueDate");

-- CreateIndex
CREATE INDEX "InvoiceDocument_status_issuedAt_idx" ON "InvoiceDocument"("status", "issuedAt");

-- CreateIndex
CREATE INDEX "InvoiceDocument_periodStart_periodEnd_idx" ON "InvoiceDocument"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceDocumentId_sortOrder_idx" ON "InvoiceLine"("invoiceDocumentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRevenueLink_revenueEntryId_key" ON "InvoiceRevenueLink"("revenueEntryId");

-- CreateIndex
CREATE INDEX "InvoiceRevenueLink_invoiceDocumentId_idx" ON "InvoiceRevenueLink"("invoiceDocumentId");

-- CreateIndex
CREATE INDEX "InvoiceRevenueLink_invoiceLineId_idx" ON "InvoiceRevenueLink"("invoiceLineId");
