CREATE TABLE "LegacyMigrationBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceName" TEXT,
    "totalItems" INTEGER NOT NULL,
    "totalSites" INTEGER NOT NULL,
    "totalContracts" INTEGER NOT NULL,
    "createdItems" INTEGER NOT NULL,
    "reusedItems" INTEGER NOT NULL,
    "createdSites" INTEGER NOT NULL,
    "reusedSites" INTEGER NOT NULL,
    "createdContracts" INTEGER NOT NULL,
    "skippedContracts" INTEGER NOT NULL,
    "warningCount" INTEGER NOT NULL,
    "reportJson" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "LegacyMigrationBatch_fingerprint_key" ON "LegacyMigrationBatch"("fingerprint");
CREATE INDEX "LegacyMigrationBatch_createdAt_idx" ON "LegacyMigrationBatch"("createdAt");
CREATE INDEX "LegacyMigrationBatch_actorId_createdAt_idx" ON "LegacyMigrationBatch"("actorId", "createdAt");
