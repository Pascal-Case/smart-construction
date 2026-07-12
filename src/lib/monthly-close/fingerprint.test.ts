import { describe, expect, it } from "vitest";

import { canonicalJson, stableFingerprint } from "@/lib/monthly-close/fingerprint";

describe("monthly close fingerprint", () => {
  it("객체 key와 배열 입력 순서가 달라도 같은 값을 만든다", () => {
    const left = { siteId: "site-1", rows: [{ id: "b", amount: 2 }, { id: "a", amount: 1 }] };
    const right = { rows: [{ amount: 1, id: "a" }, { amount: 2, id: "b" }], siteId: "site-1" };

    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(stableFingerprint(left)).toBe(stableFingerprint(right));
  });

  it("금액이나 version이 바뀌면 fingerprint도 바뀐다", () => {
    const base = { id: "revenue-1", version: 1, amount: 100 };
    expect(stableFingerprint(base)).not.toBe(stableFingerprint({ ...base, amount: 101 }));
    expect(stableFingerprint(base)).not.toBe(stableFingerprint({ ...base, version: 2 }));
  });
});
