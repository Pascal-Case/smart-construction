import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("revenue table layout", () => {
  it("긴 내용은 내용 셀 안에서 말줄임하고 수량·단가 열을 침범하지 않는다", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/revenues/revenue-manager.tsx"), "utf8");
    const tableSource = readFileSync(path.join(process.cwd(), "src/components/ui/table.tsx"), "utf8");

    expect(tableSource).toContain('p-2 align-middle overflow-hidden whitespace-nowrap');
    expect(source).toContain('TableCell className="max-w-64"');
    expect(source).toContain('className="block truncate text-xs text-muted-foreground"');
  });
});
