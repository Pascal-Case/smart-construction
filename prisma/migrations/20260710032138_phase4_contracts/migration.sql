-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractNo" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "memo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contract_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContractLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "description" TEXT,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "standardSalesPriceSnapshot" INTEGER NOT NULL,
    "appliedSalesPrice" INTEGER NOT NULL,
    "standardCostPriceSnapshot" INTEGER NOT NULL,
    "appliedCostPrice" INTEGER NOT NULL,
    "priceOverrideReason" TEXT,
    "priceOverriddenById" TEXT,
    "priceOverriddenAt" DATETIME,
    "revenueStartDate" DATETIME NOT NULL,
    "revenueEndDate" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContractLine_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Contract_contractNo_key" ON "Contract"("contractNo");

-- CreateIndex
CREATE INDEX "Contract_siteId_status_idx" ON "Contract"("siteId", "status");

-- CreateIndex
CREATE INDEX "Contract_startDate_endDate_idx" ON "Contract"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "Contract_status_updatedAt_idx" ON "Contract"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ContractLine_contractId_isActive_sortOrder_idx" ON "ContractLine"("contractId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ContractLine_itemId_idx" ON "ContractLine"("itemId");

-- CreateIndex
CREATE INDEX "ContractLine_revenueStartDate_revenueEndDate_idx" ON "ContractLine"("revenueStartDate", "revenueEndDate");
