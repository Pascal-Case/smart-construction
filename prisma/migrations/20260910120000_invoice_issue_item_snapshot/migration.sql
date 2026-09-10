ALTER TABLE "InvoiceDocument" ADD COLUMN "issueItemId" TEXT;
ALTER TABLE "InvoiceDocument" ADD COLUMN "issueItemName" TEXT;
ALTER TABLE "InvoiceDocument" ADD COLUMN "revenueFingerprint" TEXT;

UPDATE "InvoiceDocument"
SET "issueItemId" = (
  SELECT MAX("RevenueEntry"."itemId")
  FROM "InvoiceRevenueLink"
  INNER JOIN "RevenueEntry" ON "RevenueEntry"."id" = "InvoiceRevenueLink"."revenueEntryId"
  WHERE "InvoiceRevenueLink"."invoiceDocumentId" = "InvoiceDocument"."id"
  GROUP BY "InvoiceRevenueLink"."invoiceDocumentId"
  HAVING COUNT(*) = COUNT("RevenueEntry"."itemId")
     AND COUNT(DISTINCT "RevenueEntry"."itemId") = 1
);

UPDATE "InvoiceDocument"
SET "issueItemName" = CASE
  WHEN "issueItemId" IS NOT NULL THEN (
    SELECT "Item"."name" FROM "Item" WHERE "Item"."id" = "InvoiceDocument"."issueItemId"
  )
  WHEN EXISTS (
    SELECT 1
    FROM "InvoiceRevenueLink"
    INNER JOIN "RevenueEntry" ON "RevenueEntry"."id" = "InvoiceRevenueLink"."revenueEntryId"
    WHERE "InvoiceRevenueLink"."invoiceDocumentId" = "InvoiceDocument"."id"
      AND "RevenueEntry"."itemId" IS NOT NULL
  ) THEN '여러 품목'
  ELSE '품목 없음'
END
WHERE "issueItemName" IS NULL;

CREATE INDEX "InvoiceDocument_issueItemId_idx" ON "InvoiceDocument"("issueItemId");
