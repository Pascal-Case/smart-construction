import { readFileSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "prisma/migrations/20260712170000_month_close_control_room/migration.sql",
);

describe("month close control room migration", () => {
  it("기존 매출·거래명세표를 rewrite하지 않는 additive migration이다", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+"?(RevenueEntry|InvoiceDocument)"?\b/i);
    expect(sql).toContain('ALTER TABLE "InvoiceDocument" ADD COLUMN "monthlyCloseCycleId" TEXT');
  });

  it("aggregate, cycle, review와 invoice-cycle unique 제약을 적용한다", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE "Site" ("id" TEXT NOT NULL PRIMARY KEY);
      CREATE TABLE "InvoiceDocument" ("id" TEXT NOT NULL PRIMARY KEY);
      INSERT INTO "Site" VALUES ('site-1');
      INSERT INTO "InvoiceDocument" VALUES ('invoice-1'), ('invoice-2');
    `);
    db.exec(readFileSync(migrationPath, "utf8"));

    db.prepare('INSERT INTO "MonthlyClose" ("id", "siteId", "month", "state", "latestCycleNo", "version", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
      .run("close-1", "site-1", "2026-07", "OPEN", 0, 1);
    expect(() => db.prepare('INSERT INTO "MonthlyClose" ("id", "siteId", "month", "state", "latestCycleNo", "version", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
      .run("close-2", "site-1", "2026-07", "OPEN", 0, 1)).toThrow();

    db.prepare('INSERT INTO "MonthlyCloseCycle" ("id", "monthlyCloseId", "cycleNo", "revenueCount", "totalSalesAmount", "totalCostAmount", "revenueFingerprint", "exceptionFingerprint", "snapshotJson", "closedById", "closedByName", "closedAt", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
      .run("cycle-1", "close-1", 1, 1, 100, 50, "rf", "ef", "{}", "user-1", "관리자");
    expect(() => db.prepare('INSERT INTO "MonthlyCloseCycle" ("id", "monthlyCloseId", "cycleNo", "revenueCount", "totalSalesAmount", "totalCostAmount", "revenueFingerprint", "exceptionFingerprint", "snapshotJson", "closedById", "closedByName", "closedAt", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
      .run("cycle-2", "close-1", 1, 1, 100, 50, "rf", "ef", "{}", "user-1", "관리자")).toThrow();

    const review = db.prepare('INSERT INTO "MonthlyCloseExceptionReview" ("id", "siteId", "month", "exceptionKey", "fingerprint", "reason", "reviewedById", "reviewedByName", "reviewedAt", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)');
    review.run("review-1", "site-1", "2026-07", "DIRECT_INPUT:1", "fp", "확인", "user-1", "관리자");
    expect(() => review.run("review-2", "site-1", "2026-07", "DIRECT_INPUT:1", "fp", "중복", "user-1", "관리자")).toThrow();

    expect(() => db.prepare('INSERT INTO "MonthlyCloseReopen" ("id", "monthlyCloseId", "fromCycleId", "reason", "reopenedById", "reopenedByName", "reopenedAt", "createdAt") VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
      .run("reopen-1", "close-1", "missing-cycle", "수정", "user-1", "관리자")).toThrow();

    db.prepare('UPDATE "InvoiceDocument" SET "monthlyCloseCycleId" = ? WHERE "id" = ?').run("cycle-1", "invoice-1");
    expect(() => db.prepare('UPDATE "InvoiceDocument" SET "monthlyCloseCycleId" = ? WHERE "id" = ?').run("cycle-1", "invoice-2")).toThrow();
    db.close();
  });
});
