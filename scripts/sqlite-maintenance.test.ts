import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { createVerifiedBackup, verifyDatabaseIntegrity } from "./sqlite-maintenance";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "smart-construction-sqlite-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("SQLite maintenance", () => {
  it("creates an online backup and verifies the copied database", async () => {
    const directory = await createTemporaryDirectory();
    const source = path.join(directory, "source.db");
    const target = path.join(directory, "backup.db");
    const database = new Database(source);
    database.exec("CREATE TABLE example (value TEXT NOT NULL); INSERT INTO example VALUES ('preserved');");

    await createVerifiedBackup(source, target);
    database.close();

    expect(await verifyDatabaseIntegrity(target)).toBe("ok");
    const backup = new Database(target, { readonly: true });
    expect(backup.prepare("SELECT value FROM example").pluck().get()).toBe("preserved");
    backup.close();
  });

  it("rejects a file that is not a valid SQLite database", async () => {
    const directory = await createTemporaryDirectory();
    const invalid = path.join(directory, "invalid.db");
    await writeFile(invalid, "not sqlite");

    await expect(verifyDatabaseIntegrity(invalid)).rejects.toThrow();
    expect(await readFile(invalid, "utf8")).toBe("not sqlite");
  });
});
