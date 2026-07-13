import { readFileSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "prisma/migrations/20260713210000_contract_revenue_generation_queue/migration.sql",
);

describe("contract revenue generation queue migration", () => {
  it("adds an indexed queue without rewriting contract or revenue rows", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).not.toMatch(/\bALTER\s+TABLE\s+"?(Contract|RevenueEntry)"?/i);
    expect(sql).not.toMatch(/\bUPDATE\s+"?(Contract|RevenueEntry)"?/i);
    expect(sql).toContain('CREATE TABLE "ContractRevenueGenerationQueue"');
    expect(sql).toContain('CREATE INDEX "ContractRevenueGenerationQueue_pendingAt_contractId_idx"');
  });

  it("preserves existing rows and cascades queue cleanup with the contract", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE "Contract" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "updatedAt" DATETIME NOT NULL
      );
      CREATE TABLE "RevenueEntry" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "contractId" TEXT,
        "salesAmount" INTEGER NOT NULL
      );
      INSERT INTO "Contract" VALUES ('contract-1', '기존 계약', '2026-07-13T00:00:00.000Z');
      INSERT INTO "RevenueEntry" VALUES ('revenue-1', 'contract-1', 100000);
    `);
    const beforeContract = db.prepare('SELECT * FROM "Contract"').all();
    const beforeRevenue = db.prepare('SELECT * FROM "RevenueEntry"').all();

    db.exec(readFileSync(migrationPath, "utf8"));

    expect(db.prepare('SELECT * FROM "Contract"').all()).toEqual(beforeContract);
    expect(db.prepare('SELECT * FROM "RevenueEntry"').all()).toEqual(beforeRevenue);
    db.prepare('INSERT INTO "ContractRevenueGenerationQueue" ("contractId") VALUES (?)').run("contract-1");
    expect(db.prepare('SELECT "contractId" FROM "ContractRevenueGenerationQueue"').all())
      .toEqual([{ contractId: "contract-1" }]);
    expect(() => db.prepare('INSERT INTO "ContractRevenueGenerationQueue" ("contractId") VALUES (?)').run("missing"))
      .toThrow();

    db.prepare('DELETE FROM "Contract" WHERE "id" = ?').run("contract-1");
    expect(db.prepare('SELECT * FROM "ContractRevenueGenerationQueue"').all()).toEqual([]);
    db.close();
  });
});
