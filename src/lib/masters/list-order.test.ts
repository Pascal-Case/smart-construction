import { describe, expect, it } from "vitest";

import { sortItems, sortSites } from "@/lib/masters/list-order";

describe("master list order", () => {
  it("sorts nullable site fields last in both directions and stabilizes ties by id", () => {
    const rows = [
      { id: "b", customerName: "가", aliases: [], isActive: true },
      { id: "c", customerName: null, aliases: [], isActive: true },
      { id: "a", customerName: "가", aliases: [], isActive: true },
    ];

    expect(sortSites(rows, "customerName", "asc").map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(sortSites(rows, "customerName", "desc").map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("uses the first alias and site period start then end", () => {
    const rows = [
      { id: "late", aliases: ["나"], startDate: new Date("2026-01-01"), endDate: new Date("2026-03-01"), isActive: true },
      { id: "early", aliases: ["가"], startDate: new Date("2026-01-01"), endDate: new Date("2026-02-01"), isActive: true },
    ];

    expect(sortSites(rows, "alias", "asc").map((row) => row.id)).toEqual(["early", "late"]);
    expect(sortSites(rows, "period", "asc").map((row) => row.id)).toEqual(["early", "late"]);
  });

  it("sorts item prices numerically", () => {
    const rows = [
      { id: "expensive", standardSalesPrice: 20_000, aliases: [], isActive: true },
      { id: "cheap", standardSalesPrice: 900, aliases: [], isActive: true },
    ];

    expect(sortItems(rows, "standardSalesPrice", "asc").map((row) => row.id)).toEqual(["cheap", "expensive"]);
  });
});
