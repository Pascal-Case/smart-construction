import { describe, expect, it } from "vitest";

import {
  parseExplicitSort,
  serializeListQuery,
  toggleSort,
  type ExplicitSort,
} from "@/lib/list-sorting";

const keys = ["name", "updatedAt"] as const;

describe("list sorting", () => {
  it("cycles default, ascending, descending, and default for the same key", () => {
    let sort: ExplicitSort<(typeof keys)[number]> = null;

    sort = toggleSort(sort, "name");
    expect(sort).toEqual({ key: "name", direction: "asc" });
    sort = toggleSort(sort, "name");
    expect(sort).toEqual({ key: "name", direction: "desc" });
    sort = toggleSort(sort, "name");
    expect(sort).toBeNull();
  });

  it("starts another key at ascending regardless of the previous direction", () => {
    expect(toggleSort({ key: "updatedAt", direction: "desc" }, "name")).toEqual({
      key: "name",
      direction: "asc",
    });
  });

  it("removes sort params for default state and resets the page without losing filters", () => {
    const params = serializeListQuery(
      new URLSearchParams("q=강남&status=active&page=3&sort=name&order=desc"),
      null,
      { resetPage: true },
    );

    expect(params.toString()).toBe("q=%EA%B0%95%EB%82%A8&status=active&page=1");
  });

  it("round-trips allowlisted explicit sort state", () => {
    const params = serializeListQuery(
      new URLSearchParams("siteId=site-1&page=2"),
      { key: "updatedAt", direction: "desc" },
    );

    expect(parseExplicitSort(params, keys)).toEqual({ key: "updatedAt", direction: "desc" });
    expect(params.get("siteId")).toBe("site-1");
    expect(params.get("page")).toBe("2");
  });

  it("ignores incomplete or unknown sort params", () => {
    expect(parseExplicitSort(new URLSearchParams("sort=unknown&order=asc"), keys)).toBeNull();
    expect(parseExplicitSort(new URLSearchParams("sort=name"), keys)).toBeNull();
  });
});
