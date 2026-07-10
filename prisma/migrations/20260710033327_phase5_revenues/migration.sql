-- CreateTable
CREATE TABLE "RevenueEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "revenueDate" DATETIME NOT NULL,
    "servicePeriodStart" DATETIME,
    "servicePeriodEnd" DATETIME,
    "sourceType" TEXT NOT NULL,
    "contractId" TEXT,
    "contractLineId" TEXT,
    "itemId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" REAL,
    "unit" TEXT,
    "standardSalesPriceSnapshot" INTEGER,
    "appliedSalesPrice" INTEGER,
    "salesAmount" INTEGER NOT NULL,
    "prorationDays" INTEGER,
    "daysInMonth" INTEGER,
    "standardCostPriceSnapshot" INTEGER,
    "appliedCostPrice" INTEGER,
    "costAmount" INTEGER,
    "priceOverrideReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "generatedKey" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" DATETIME,
    "canceledById" TEXT,
    "canceledAt" DATETIME,
    "cancelReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RevenueEntry_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RevenueEntry_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RevenueEntry_contractLineId_fkey" FOREIGN KEY ("contractLineId") REFERENCES "ContractLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RevenueEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RevenueEntry_generatedKey_key" ON "RevenueEntry"("generatedKey");

-- CreateIndex
CREATE INDEX "RevenueEntry_revenueDate_status_idx" ON "RevenueEntry"("revenueDate", "status");

-- CreateIndex
CREATE INDEX "RevenueEntry_siteId_revenueDate_idx" ON "RevenueEntry"("siteId", "revenueDate");

-- CreateIndex
CREATE INDEX "RevenueEntry_sourceType_status_idx" ON "RevenueEntry"("sourceType", "status");

-- CreateIndex
CREATE INDEX "RevenueEntry_contractId_idx" ON "RevenueEntry"("contractId");

-- CreateIndex
CREATE INDEX "RevenueEntry_contractLineId_idx" ON "RevenueEntry"("contractLineId");
