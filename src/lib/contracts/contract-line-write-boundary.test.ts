import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const approvedWriteFiles = [
  "src/lib/contracts/service.ts",
  "src/lib/migration/service.ts",
];

describe("contract line write boundary", () => {
  it("keeps ContractLine creation in the approved aggregate services", () => {
    const writeFiles = sourceFiles(path.join(process.cwd(), "src"))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /\bcontractLine\.(create|createMany|upsert)\s*\(/.test(source)
          || /\blines\s*:\s*\{\s*create(?:Many)?\s*:/.test(source);
      })
      .map(repoPath)
      .sort();

    expect(writeFiles).toEqual(approvedWriteFiles);
  });

  it("writes an explicit method at every approved creation boundary", () => {
    const contractService = readFileSync(path.join(process.cwd(), approvedWriteFiles[0]), "utf8");
    const legacyMigrationService = readFileSync(path.join(process.cwd(), approvedWriteFiles[1]), "utf8");

    expect(contractService.match(/billingMethod:\s*ContractLineBillingMethod\.MONTHLY_RECURRING/g))
      .toHaveLength(2);
    expect(legacyMigrationService.match(/billingMethod:\s*ContractLineBillingMethod\.LEGACY_TOTAL/g))
      .toHaveLength(1);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(target);
    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) return [];
    return entry.name.includes(".test.") ? [] : [target];
  });
}

function repoPath(file: string) {
  return path.relative(process.cwd(), file).replaceAll("\\", "/");
}
