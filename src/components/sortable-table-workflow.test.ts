import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("sortable main-table workflow", () => {
  it("uses a real keyboard button and exposes aria-sort", () => {
    const head = source("src/components/ui/sortable-table-head.tsx");

    expect(head).toContain('type="button"');
    expect(head).toContain("aria-sort={ariaSort}");
    expect(head).toContain("focus-visible:ring-3");
  });

  it("connects all five main lists to the shared sortable header", () => {
    const masters = source("src/components/masters/master-manager.tsx");
    const contracts = source("src/components/contracts/contract-manager.tsx");
    const revenues = source("src/components/revenues/revenue-manager.tsx");
    const monthlyClose = source("src/components/reports/month-close-control-room.tsx");

    for (const file of [masters, contracts, revenues, monthlyClose]) {
      expect(file).toContain("SortableTableHead");
      expect(file).toContain("changeSort");
      expect(file).toContain("window.history.pushState");
      expect(file).toContain('window.addEventListener("popstate"');
    }
    expect(masters).toContain('type === "site"');
    expect(masters).toContain('type === "item"');
  });

  it("shows final-modified values on masters and removes the legacy sort select", () => {
    const masters = source("src/components/masters/master-manager.tsx");

    expect(masters).toContain("최종수정일");
    expect(masters).toContain("formatSeoulDateTime(row.updatedAt)");
    expect(masters).not.toContain('label="정렬"');
  });

  it("keeps selection, management, and secondary dialog tables non-sortable", () => {
    const masters = source("src/components/masters/master-manager.tsx");
    const contracts = source("src/components/contracts/contract-manager.tsx");
    const revenues = source("src/components/revenues/revenue-manager.tsx");

    expect(masters.split("function MasterEditor")[1]).not.toContain("SortableTableHead");
    expect(contracts.split("function ContractEditor")[1]).not.toContain("SortableTableHead");
    expect(revenues.split("function GeneratorDialog")[1]).not.toContain("SortableTableHead");
  });

  it("documents the default orders and URL-restored click cycle", () => {
    const guide = source("USER_GUIDE.md");

    expect(guide).toContain("오름차순 → 내림차순 → 기본 순서");
    expect(guide).toContain("최종수정일 최신순");
    expect(guide).toContain("월마감은 열린 현장");
    expect(guide).toContain("주소에 함께 저장");
  });
});
