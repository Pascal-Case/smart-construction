-- CreateTable
CREATE TABLE "SyncEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "siteId" TEXT,
    "month" TEXT,
    "actorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "SyncEvent_createdAt_idx" ON "SyncEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SyncEvent_type_id_idx" ON "SyncEvent"("type", "id");
