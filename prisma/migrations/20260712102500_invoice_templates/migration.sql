-- CreateTable
CREATE TABLE "InvoiceTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "configJson" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- AlterTable
ALTER TABLE "InvoiceDocument" ADD COLUMN "templateIdSnapshot" TEXT;
ALTER TABLE "InvoiceDocument" ADD COLUMN "templateVersionSnapshot" INTEGER;
ALTER TABLE "InvoiceDocument" ADD COLUMN "templateName" TEXT;
ALTER TABLE "InvoiceDocument" ADD COLUMN "templateConfigJson" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceTemplate_normalizedName_key" ON "InvoiceTemplate"("normalizedName");

-- CreateIndex
CREATE INDEX "InvoiceTemplate_updatedAt_idx" ON "InvoiceTemplate"("updatedAt");
