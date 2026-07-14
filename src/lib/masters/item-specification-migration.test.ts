import { readFileSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "prisma/migrations/20260714203000_item_specification_and_memo/migration.sql",
);

describe("item specification migration", () => {
  it("기존 품목 메모를 규격으로 보존하고 새 메모 칸을 비워 둔다", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE "Item" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "memo" TEXT
      );
      INSERT INTO "Item" ("id", "name", "memo") VALUES ('item-1', '이동형 CCTV', '200만 화소');
    `);

    db.exec(readFileSync(migrationPath, "utf8"));

    expect(db.prepare('SELECT "specification", "memo" FROM "Item" WHERE "id" = ?').get("item-1"))
      .toEqual({ specification: "200만 화소", memo: null });
    db.close();
  });
});
