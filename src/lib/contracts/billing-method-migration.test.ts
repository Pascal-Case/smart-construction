import { readFileSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "prisma/migrations/20260713120000_contract_line_billing_method/migration.sql",
);

describe("contract line billing method migration", () => {
  it("is additive and does not rewrite contract or revenue rows", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /ALTER\s+TABLE\s+"ContractLine"\s+ADD\s+COLUMN\s+"billingMethod"\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'LEGACY_TOTAL'/i,
    );
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+"?(ContractLine|RevenueEntry)"?\b/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"?RevenueEntry"?/i);
  });

  it("preserves every existing contract field and backfills LEGACY_TOTAL", () => {
    const db = new Database(":memory:");
    db.exec(`
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
        "updatedAt" DATETIME NOT NULL
      );
      CREATE TABLE "RevenueEntry" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "salesAmount" INTEGER NOT NULL,
        "status" TEXT NOT NULL,
        "generatedKey" TEXT
      );
      INSERT INTO "ContractLine" VALUES (
        'line-1', 'contract-1', 'item-1', 'existing line', 2.5, 'EA',
        20000, 19000, 12000, 11000, 'negotiated', 'user-1',
        '2026-01-02T03:04:05.000Z', '2026-01-15T00:00:00.000Z',
        '2028-12-31T00:00:00.000Z', 1, 7, 'user-1', 'user-2',
        '2026-01-01T00:00:00.000Z', '2026-07-13T00:00:00.000Z'
      );
      INSERT INTO "RevenueEntry" VALUES ('revenue-1', 47500, 'CONFIRMED', 'line-1:2026-01');
    `);
    const beforeLine = db.prepare('SELECT * FROM "ContractLine" WHERE "id" = ?').get("line-1") as Record<string, unknown>;
    const beforeRevenue = db.prepare('SELECT * FROM "RevenueEntry" WHERE "id" = ?').get("revenue-1");

    db.exec(readFileSync(migrationPath, "utf8"));

    const afterLine = db.prepare('SELECT * FROM "ContractLine" WHERE "id" = ?').get("line-1") as Record<string, unknown>;
    const { billingMethod, ...preservedLine } = afterLine;
    expect(billingMethod).toBe("LEGACY_TOTAL");
    expect(preservedLine).toEqual(beforeLine);
    expect(db.prepare('SELECT * FROM "RevenueEntry" WHERE "id" = ?').get("revenue-1")).toEqual(beforeRevenue);
    db.close();
  });
});
