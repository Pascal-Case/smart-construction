import { readFileSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

describe("invoice replacement migration", () => {
  it("backfills current invoice pointers and preserves per-document revenue history", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE "InvoiceDocument" ("id" TEXT PRIMARY KEY, "status" TEXT NOT NULL);
      CREATE TABLE "RevenueEntry" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "InvoiceLine" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "InvoiceRevenueLink" (
        "id" TEXT PRIMARY KEY,
        "invoiceDocumentId" TEXT NOT NULL REFERENCES "InvoiceDocument"("id"),
        "invoiceLineId" TEXT NOT NULL REFERENCES "InvoiceLine"("id"),
        "revenueEntryId" TEXT NOT NULL REFERENCES "RevenueEntry"("id")
      );
      CREATE UNIQUE INDEX "InvoiceRevenueLink_revenueEntryId_key" ON "InvoiceRevenueLink"("revenueEntryId");
      INSERT INTO "InvoiceDocument" VALUES ('invoice-old', 'ISSUED'), ('invoice-new', 'ISSUED');
      INSERT INTO "RevenueEntry" VALUES ('revenue-1');
      INSERT INTO "InvoiceLine" VALUES ('line-old'), ('line-new');
      INSERT INTO "InvoiceRevenueLink" VALUES ('link-old', 'invoice-old', 'line-old', 'revenue-1');
    `);

    const migration = readFileSync(path.join(process.cwd(), "prisma/migrations/20260712122500_invoice_replacement_reissue/migration.sql"), "utf8");
    db.exec(migration);

    expect(db.prepare('SELECT "currentInvoiceDocumentId" FROM "RevenueEntry" WHERE "id" = ?').get("revenue-1")).toEqual({ currentInvoiceDocumentId: "invoice-old" });
    expect(() => db.prepare('INSERT INTO "InvoiceRevenueLink" VALUES (?, ?, ?, ?)').run("link-new", "invoice-new", "line-new", "revenue-1")).not.toThrow();
    expect(() => db.prepare('INSERT INTO "InvoiceRevenueLink" VALUES (?, ?, ?, ?)').run("link-duplicate", "invoice-new", "line-new", "revenue-1")).toThrow();
    db.close();
  });
});
