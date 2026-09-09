-- Abort rather than guessing when an existing contract title cannot be mapped.
CREATE TABLE "_ContractCategoryMigrationGuard" (
    "valid" INTEGER NOT NULL CHECK ("valid" = 1)
);
INSERT INTO "_ContractCategoryMigrationGuard" ("valid")
SELECT CASE WHEN EXISTS (
    SELECT 1 FROM "Contract"
    WHERE trim("title") NOT IN ('스마트건설안전', '근로자안전보건', '스마트안전패드')
) THEN 0 ELSE 1 END;
DROP TABLE "_ContractCategoryMigrationGuard";

CREATE TABLE "ContractCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "ContractCategory" ("id", "code", "name", "normalizedName", "createdById", "updatedById", "updatedAt") VALUES
('contract-category-smart-construction-safety', 'CONTRACT-TYPE-0001', '스마트건설안전', '스마트건설안전', 'system', 'system', CURRENT_TIMESTAMP),
('contract-category-worker-safety-health', 'CONTRACT-TYPE-0002', '근로자안전보건', '근로자안전보건', 'system', 'system', CURRENT_TIMESTAMP),
('contract-category-smart-safety-pad', 'CONTRACT-TYPE-0003', '스마트안전패드', '스마트안전패드', 'system', 'system', CURRENT_TIMESTAMP);

ALTER TABLE "Contract" ADD COLUMN "contractCategoryId" TEXT REFERENCES "ContractCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
UPDATE "Contract"
SET "contractCategoryId" = CASE trim("title")
    WHEN '스마트건설안전' THEN 'contract-category-smart-construction-safety'
    WHEN '근로자안전보건' THEN 'contract-category-worker-safety-health'
    WHEN '스마트안전패드' THEN 'contract-category-smart-safety-pad'
END;

ALTER TABLE "RevenueEntry" ADD COLUMN "contractCategoryId" TEXT REFERENCES "ContractCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
UPDATE "RevenueEntry"
SET "contractCategoryId" = (
    SELECT "contractCategoryId" FROM "Contract" WHERE "Contract"."id" = "RevenueEntry"."contractId"
);

ALTER TABLE "Item" ADD COLUMN "invoiceDisplayItemId" TEXT REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
UPDATE "Item"
SET "invoiceDisplayItemId" = (SELECT "id" FROM "Item" WHERE "code" = 'ITEM-0023')
WHERE "code" = 'ITEM-0024' AND EXISTS (SELECT 1 FROM "Item" WHERE "code" = 'ITEM-0023');

ALTER TABLE "InvoiceDocument" ADD COLUMN "contractCategoryId" TEXT REFERENCES "ContractCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceDocument" ADD COLUMN "contractCategoryCode" TEXT;
ALTER TABLE "InvoiceDocument" ADD COLUMN "contractCategoryName" TEXT;
ALTER TABLE "InvoiceDocument" ADD COLUMN "closeRevenueFingerprint" TEXT;
DROP INDEX "InvoiceDocument_monthlyCloseCycleId_key";

CREATE UNIQUE INDEX "ContractCategory_code_key" ON "ContractCategory"("code");
CREATE UNIQUE INDEX "ContractCategory_normalizedName_key" ON "ContractCategory"("normalizedName");
CREATE INDEX "ContractCategory_isActive_name_idx" ON "ContractCategory"("isActive", "name");
CREATE INDEX "Contract_contractCategoryId_idx" ON "Contract"("contractCategoryId");
CREATE INDEX "RevenueEntry_contractCategoryId_idx" ON "RevenueEntry"("contractCategoryId");
CREATE INDEX "Item_invoiceDisplayItemId_idx" ON "Item"("invoiceDisplayItemId");
CREATE INDEX "InvoiceDocument_contractCategoryId_idx" ON "InvoiceDocument"("contractCategoryId");
CREATE INDEX "InvoiceDocument_monthlyCloseCycleId_idx" ON "InvoiceDocument"("monthlyCloseCycleId");
