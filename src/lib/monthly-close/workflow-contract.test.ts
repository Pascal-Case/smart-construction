import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("closed month mutation coverage", () => {
  it.each([
    "src/lib/contracts/service.ts",
    "src/lib/revenues/service.ts",
    "src/lib/revenues/generator.ts",
    "src/lib/migration/service.ts",
  ])("%s uses the shared month-close guard", (file) => {
    expect(source(file)).toContain("assertMonthsOpen");
  });
});
