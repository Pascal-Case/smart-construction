-- CreateTable
CREATE TABLE "MonthlyMemo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MonthlyMemo_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MonthlyMemo_month_idx" ON "MonthlyMemo"("month");

-- CreateIndex
CREATE INDEX "MonthlyMemo_siteId_updatedAt_idx" ON "MonthlyMemo"("siteId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyMemo_siteId_month_key" ON "MonthlyMemo"("siteId", "month");
