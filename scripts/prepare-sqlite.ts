import "dotenv/config";

import { mkdir, open } from "node:fs/promises";
import path from "node:path";

import { parseServerEnv } from "../src/lib/env/schema";

const { DATABASE_URL } = parseServerEnv(process.env);
const configuredPath = DATABASE_URL.slice("file:".length);
const databasePath = path.isAbsolute(configuredPath)
  ? configuredPath
  : path.resolve(process.cwd(), configuredPath);

await mkdir(path.dirname(databasePath), { recursive: true });

const file = await open(databasePath, "a");
await file.close();

console.log(`SQLite 저장 위치 준비 완료: ${databasePath}`);
