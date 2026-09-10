import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

export async function verifyDatabaseIntegrity(databasePath: string): Promise<"ok"> {
  const database = new Database(databasePath, { fileMustExist: true, readonly: true });
  try {
    const result = database.pragma("quick_check", { simple: true });
    if (result !== "ok") {
      throw new Error(`SQLite quick_check failed: ${databasePath} / ${String(result)}`);
    }
    return "ok";
  } finally {
    database.close();
  }
}

export async function createVerifiedBackup(sourcePath: string, destinationPath: string): Promise<void> {
  await access(sourcePath);
  const source = new Database(sourcePath, { fileMustExist: true, readonly: true, timeout: 10_000 });
  try {
    await source.backup(destinationPath);
  } finally {
    source.close();
  }
  await verifyDatabaseIntegrity(destinationPath);
}

async function main() {
  const [operation, sourcePath, destinationPath] = process.argv.slice(2);
  if (operation === "verify" && sourcePath && !destinationPath) {
    await verifyDatabaseIntegrity(path.resolve(sourcePath));
    return;
  }
  if (operation === "backup" && sourcePath && destinationPath) {
    await createVerifiedBackup(path.resolve(sourcePath), path.resolve(destinationPath));
    return;
  }
  throw new Error("Usage: sqlite-maintenance.ts verify <database> | backup <source> <destination>");
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (entryPoint === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
