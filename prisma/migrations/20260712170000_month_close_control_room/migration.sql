CREATE TABLE "MonthlyClose" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "siteId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'OPEN',
  "latestCycleNo" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MonthlyClose_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "MonthlyCloseCycle" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "monthlyCloseId" TEXT NOT NULL,
  "cycleNo" INTEGER NOT NULL,
  "revenueCount" INTEGER NOT NULL,
  "totalSalesAmount" INTEGER NOT NULL,
  "totalCostAmount" INTEGER NOT NULL,
  "revenueFingerprint" TEXT NOT NULL,
  "exceptionFingerprint" TEXT NOT NULL,
  "snapshotJson" TEXT NOT NULL,
  "closedById" TEXT NOT NULL,
  "closedByName" TEXT NOT NULL,
  "closedAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonthlyCloseCycle_monthlyCloseId_fkey"
    FOREIGN KEY ("monthlyCloseId") REFERENCES "MonthlyClose" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "MonthlyCloseReopen" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "monthlyCloseId" TEXT NOT NULL,
  "fromCycleId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "reopenedById" TEXT NOT NULL,
  "reopenedByName" TEXT NOT NULL,
  "reopenedAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonthlyCloseReopen_monthlyCloseId_fkey"
    FOREIGN KEY ("monthlyCloseId") REFERENCES "MonthlyClose" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MonthlyCloseReopen_fromCycleId_fkey"
    FOREIGN KEY ("fromCycleId") REFERENCES "MonthlyCloseCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "MonthlyCloseExceptionReview" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "siteId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "exceptionKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "reviewedById" TEXT NOT NULL,
  "reviewedByName" TEXT NOT NULL,
  "reviewedAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonthlyCloseExceptionReview_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "InvoiceDocument" ADD COLUMN "monthlyCloseCycleId" TEXT
  REFERENCES "MonthlyCloseCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "MonthlyClose_siteId_month_key" ON "MonthlyClose"("siteId", "month");
CREATE INDEX "MonthlyClose_month_state_idx" ON "MonthlyClose"("month", "state");
CREATE INDEX "MonthlyClose_siteId_updatedAt_idx" ON "MonthlyClose"("siteId", "updatedAt");
CREATE UNIQUE INDEX "MonthlyCloseCycle_monthlyCloseId_cycleNo_key" ON "MonthlyCloseCycle"("monthlyCloseId", "cycleNo");
CREATE INDEX "MonthlyCloseCycle_closedAt_idx" ON "MonthlyCloseCycle"("closedAt");
CREATE INDEX "MonthlyCloseReopen_monthlyCloseId_reopenedAt_idx" ON "MonthlyCloseReopen"("monthlyCloseId", "reopenedAt");
CREATE INDEX "MonthlyCloseReopen_fromCycleId_idx" ON "MonthlyCloseReopen"("fromCycleId");
CREATE UNIQUE INDEX "MonthlyCloseExceptionReview_siteId_month_exceptionKey_fingerprint_key"
  ON "MonthlyCloseExceptionReview"("siteId", "month", "exceptionKey", "fingerprint");
CREATE INDEX "MonthlyCloseExceptionReview_month_reviewedAt_idx" ON "MonthlyCloseExceptionReview"("month", "reviewedAt");
CREATE INDEX "MonthlyCloseExceptionReview_siteId_month_idx" ON "MonthlyCloseExceptionReview"("siteId", "month");
CREATE UNIQUE INDEX "InvoiceDocument_monthlyCloseCycleId_key" ON "InvoiceDocument"("monthlyCloseCycleId");
