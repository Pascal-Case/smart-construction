CREATE TABLE "ContractRevenueGenerationQueue" (
  "contractId" TEXT NOT NULL PRIMARY KEY,
  "pendingAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractRevenueGenerationQueue_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ContractRevenueGenerationQueue_pendingAt_contractId_idx"
  ON "ContractRevenueGenerationQueue"("pendingAt", "contractId");
