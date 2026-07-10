import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/lib/env/schema";

describe("parseServerEnv", () => {
  it("SQLite file URL을 허용한다", () => {
    expect(
      parseServerEnv({ DATABASE_URL: "file:./data/test.db" }),
    ).toEqual({
      DATABASE_URL: "file:./data/test.db",
      SESSION_COOKIE_SECURE: false,
      SESSION_TTL_HOURS: 12,
    });
  });

  it("DATABASE_URL 누락을 명확하게 거부한다", () => {
    expect(() => parseServerEnv({})).toThrow("DATABASE_URL");
  });

  it("SQLite가 아닌 URL을 거부한다", () => {
    expect(() =>
      parseServerEnv({ DATABASE_URL: "postgresql://localhost/test" }),
    ).toThrow("SQLite file: URL");
  });
});
